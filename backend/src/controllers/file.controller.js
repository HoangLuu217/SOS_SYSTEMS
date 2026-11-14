const fs = require('fs');
const path = require('path');
const fileService = require('../services/file.service');
const cloudinary = require('../config/cloudinary');

const localUploadsDir = path.join(__dirname, '../../uploads');

const buildLocalFileUrl = (req, fileName) => {
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}/api/uploads/${fileName}`;
};

const saveBase64Locally = (rawB64, req, prefix = 'mobile_image', preferredName = '') => {
  if (!fs.existsSync(localUploadsDir)) {
    fs.mkdirSync(localUploadsDir, { recursive: true });
  }
  const trimmed = String(rawB64 || '').trim();
  const dataMatch = trimmed.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.*)$/s);
  const cleanB64 = dataMatch ? dataMatch[2] : trimmed;
  const extFromData = dataMatch ? dataMatch[1].replace('jpeg', 'jpg') : null;
  const extFromName = path.extname(preferredName || '').replace('.', '').toLowerCase();
  const ext = extFromData || extFromName || (cleanB64.startsWith('iVBOR') ? 'png' : 'jpg');
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const buffer = Buffer.from(cleanB64, 'base64');
  fs.writeFileSync(path.join(localUploadsDir, fileName), buffer);
  return {
    url: buildLocalFileUrl(req, fileName),
    fileName,
    fileSize: buffer.length,
  };
};

const uploadFile = async (req, res, next) => {
  try {
    const purpose = req.body.purpose || 'GENERAL';
    const hasCloudinary = cloudinary.isConfigured();

    // 1. Nhận danh sách nhiều file base64 từ Mobile App
    if (Array.isArray(req.body.base64Files) && req.body.base64Files.length > 0) {
      const uploadPromises = req.body.base64Files.map(async (rawB64, idx) => {
        const b64 = String(rawB64 || '').trim();
        const isPng = b64.startsWith('iVBOR');
        let fileData;

        if (hasCloudinary) {
          const dataUri = b64.startsWith('data:')
            ? b64
            : `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${b64}`;
          const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'sos_systems',
            resource_type: 'image',
          });
          fileData = {
            sosId: req.body.sosId || null,
            type: 'IMAGE',
            url: result.secure_url,
            fileName: `mobile_hazard_image_${Date.now()}_${idx + 1}.${isPng ? 'png' : 'jpg'}`,
            fileSize: result.bytes || 0,
            purpose,
          };
        } else {
          const saved = saveBase64Locally(b64, req, `mobile_hazard_${idx + 1}`);
          fileData = {
            sosId: req.body.sosId || null,
            type: 'IMAGE',
            url: saved.url,
            fileName: saved.fileName,
            fileSize: saved.fileSize,
            purpose,
          };
        }

        const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
        return uploadedFile;
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      const urls = uploadedFiles.map((f) => f.url);
      return res.status(201).json({ success: true, data: uploadedFiles, urls });
    }

    // 2. Nhận 1 file base64 từ Mobile App hoặc Web
    if (req.body.base64File) {
      const b64 = String(req.body.base64File).trim();
      const isPng = b64.startsWith('iVBOR');
      let fileData;

      if (hasCloudinary) {
        const dataUri = b64.startsWith('data:')
          ? b64
          : `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${b64}`;
        const result = await cloudinary.uploader.upload(dataUri, {
          folder: 'sos_systems',
          resource_type: 'image',
        });
        fileData = {
          sosId: req.body.sosId || null,
          type: 'IMAGE',
          url: result.secure_url,
          fileName: req.body.fileName || `chat_image_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
          fileSize: result.bytes || 0,
          purpose,
        };
      } else {
        const saved = saveBase64Locally(b64, req, 'proof', req.body.fileName || '');
        fileData = {
          sosId: req.body.sosId || null,
          type: 'IMAGE',
          url: saved.url,
          fileName: saved.fileName,
          fileSize: saved.fileSize,
          purpose,
        };
      }

      const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
      return res.status(201).json({ success: true, data: uploadedFile, url: uploadedFile.url });
    }

    // 3. Dự phòng cho FormData thông thường
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm một file' });
    }

    const resolvedUrl =
      typeof req.file.path === 'string' && /^https?:\/\//i.test(req.file.path)
        ? req.file.path
        : buildLocalFileUrl(req, req.file.filename || path.basename(req.file.path));

    // Multer-Cloudinary hoặc DiskStorage gán URL công khai
    const fileData = {
      sosId: req.body.sosId || null,
      type: req.file.mimetype?.startsWith('video') ? 'VIDEO' : 'IMAGE',
      url: resolvedUrl,
      fileName: req.file.originalname || req.file.filename,
      fileSize: req.file.size || 0,
      purpose,
    };

    const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
    res.status(201).json({ success: true, data: uploadedFile, url: uploadedFile.url });
  } catch (error) {
    next(error);
  }
};

const getFileById = async (req, res, next) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    res.status(200).json({ success: true, data: file });
  } catch (error) {
    next(error);
  }
};

const deleteFile = async (req, res, next) => {
  try {
    await fileService.deleteFile(req.params.id, req.user._id, req.user.roles || []);
    res.status(200).json({ success: true, message: 'Xóa file thành công' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile,
  getFileById,
  deleteFile
};

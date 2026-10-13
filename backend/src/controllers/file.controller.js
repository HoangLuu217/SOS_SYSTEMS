const fileService = require('../services/file.service');
const cloudinary = require('../config/cloudinary');

const uploadFile = async (req, res, next) => {
  try {
    // 1. Nhận danh sách nhiều file base64 từ Mobile App
    if (Array.isArray(req.body.base64Files) && req.body.base64Files.length > 0) {
      const uploadPromises = req.body.base64Files.map(async (b64, idx) => {
        const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${b64}`, {
          folder: 'sos_systems',
          resource_type: 'image',
        });
        const fileData = {
          sosId: req.body.sosId || null,
          type: 'IMAGE',
          url: result.secure_url,
          fileName: `mobile_hazard_image_${Date.now()}_${idx + 1}.jpg`,
          fileSize: result.bytes || 0,
        };
        const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
        return uploadedFile;
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      const urls = uploadedFiles.map((f) => f.url);
      return res.status(201).json({ success: true, data: uploadedFiles, urls });
    }

    // 2. Nhận 1 file base64 từ Mobile App
    if (req.body.base64File) {
      const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${req.body.base64File}`, {
        folder: 'sos_systems',
        resource_type: 'image',
      });
      const fileData = {
        sosId: req.body.sosId || null,
        type: 'IMAGE',
        url: result.secure_url,
        fileName: `mobile_hazard_image_${Date.now()}.jpg`,
        fileSize: result.bytes || 0,
      };
      const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
      return res.status(201).json({ success: true, data: uploadedFile, url: uploadedFile.url });
    }

    // 2. Dự phòng cho FormData thông thường
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm một file' });
    }

    // Multer-Cloudinary gán URL vào req.file.path
    const fileData = {
      sosId: req.body.sosId || null,
      type: req.file.mimetype.startsWith('video') ? 'VIDEO' : 'IMAGE',
      url: req.file.path, 
      fileName: req.file.originalname || req.file.filename,
      fileSize: req.file.size || 0
    };

    const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
    res.status(201).json({ success: true, data: uploadedFile });
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

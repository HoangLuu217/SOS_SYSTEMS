const fileService = require('../services/file.service');
const cloudinary = require('cloudinary').v2;

const uploadFile = async (req, res, next) => {
  try {
    // 1. Nhận file base64 từ Mobile App (Giải quyết triệt để lỗi FormData React Native)
    if (req.body.base64File) {
      const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${req.body.base64File}`, { folder: 'sos_systems' });
      const fileData = {
        sosId: req.body.sosId || null,
        type: 'IMAGE',
        url: result.secure_url,
        fileName: 'mobile_sos_image.jpg',
        fileSize: result.bytes || 0
      };
      const uploadedFile = await fileService.uploadFile(req.user._id, fileData);
      return res.status(201).json({ success: true, data: uploadedFile });
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

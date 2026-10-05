const fileService = require('../services/file.service');

const uploadFile = async (req, res, next) => {
  try {
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

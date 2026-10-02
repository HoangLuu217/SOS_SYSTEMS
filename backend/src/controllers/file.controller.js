const fileService = require('../services/file.service');

const uploadFile = async (req, res, next) => {
  try {
    // Trong thực tế, middleware như multer sẽ xử lý lưu file lên S3/Cloudinary 
    // và gán URL vào req.body. Ở đây giả định client đã cung cấp URL.
    const uploadedFile = await fileService.uploadFile(req.user._id, req.body);
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

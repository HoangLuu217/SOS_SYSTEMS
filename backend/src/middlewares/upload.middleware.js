const path = require('path');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { ensureLocalUploadsDir } = require('../utils/uploadsDir');

// Cấu hình kho lưu trữ (Storage) cho Multer: ưu tiên Cloudinary nếu có API key, ngược lại lưu trên máy chủ backend
const storage = cloudinary.isConfigured()
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'sos_systems', // Tên thư mục sẽ tạo trên Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4'], // Hỗ trợ ảnh di động & video
        resource_type: 'auto', // Tự động nhận diện (ảnh hay video)
      },
    })
  : multer.diskStorage({
      destination: (_req, _file, cb) => {
        try {
          cb(null, ensureLocalUploadsDir());
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '') || '.jpg';
        cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    });

// Khởi tạo Middleware Multer
// Giới hạn file tối đa 10MB
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;

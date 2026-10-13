const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Cấu hình kho lưu trữ (Storage) cho Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sos_systems', // Tên thư mục sẽ tạo trên Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'mp4'], // Chỉ cho phép ảnh và video
    resource_type: 'auto', // Tự động nhận diện (ảnh hay video)
  },
});

// Khởi tạo Middleware Multer
// Giới hạn file tối đa 10MB
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;

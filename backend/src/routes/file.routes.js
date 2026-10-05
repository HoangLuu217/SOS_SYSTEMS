const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload.middleware');

// Yêu cầu xác thực trước khi thao tác file
router.use(authenticate);

// POST /api/files - Lưu file lên Cloudinary và lưu record vào DB
router.post('/', upload.single('file'), fileController.uploadFile);

// GET /api/files/:id - Xem chi tiết thông tin file
router.get('/:id', fileController.getFileById);

// DELETE /api/files/:id - Xóa thông tin file
router.delete('/:id', fileController.deleteFile);

module.exports = router;

const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { authenticate } = require('../middlewares/authMiddleware');

// Yêu cầu xác thực trước khi thao tác file
router.use(authenticate);

// POST /api/files - Lưu record thông tin file sau khi upload
router.post('/', fileController.uploadFile);

// GET /api/files/:id - Xem chi tiết thông tin file
router.get('/:id', fileController.getFileById);

// DELETE /api/files/:id - Xóa thông tin file
router.delete('/:id', fileController.deleteFile);

module.exports = router;

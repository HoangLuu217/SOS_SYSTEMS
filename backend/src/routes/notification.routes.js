const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/authMiddleware');

// Tất cả các route thông báo đều bắt buộc đăng nhập và phân quyền theo userId
router.use(authenticate);

// 4. Notification Endpoints
// Lấy danh sách thông báo của người đăng nhập
router.get('/', notificationController.getNotifications);

// Đánh dấu tất cả thông báo là đã đọc (đặt trước /:id để tránh xung đột param)
router.patch('/read-all', notificationController.markAllAsRead);

// Lấy chi tiết thông báo
router.get('/:id', notificationController.getNotificationById);

// Đánh dấu 1 thông báo là đã đọc
router.patch('/:id/read', notificationController.markAsRead);

// Xóa thông báo
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;

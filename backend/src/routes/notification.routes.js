const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// 1. Lấy danh sách thông báo & cảnh báo khẩn cấp (Hỗ trợ cả người chưa đăng nhập để nhận tin khẩn cấp tức thời)
router.get('/', optionalAuthenticate, notificationController.getNotifications);

// 1.1 SSE Stream Realtime cho thông báo khẩn cấp & tin tức (Mobile & Web)
router.get('/stream', optionalAuthenticate, notificationController.streamNotificationEvents);

// Các route bên dưới bắt buộc đăng nhập
router.use(authenticate);

// 2. Quản lý thông báo Broadcast dành cho ADMIN và Cán bộ địa phương (LOCAL_AUTHORITY)
router.post('/broadcast', authorize('ADMIN', 'LOCAL_AUTHORITY'), notificationController.broadcastNotification);
router.get('/broadcasts', authorize('ADMIN', 'LOCAL_AUTHORITY'), notificationController.getBroadcastHistory);
router.delete('/broadcasts/:id', authorize('ADMIN', 'LOCAL_AUTHORITY'), notificationController.deleteBroadcast);

// 3. Đăng ký Expo Push Token cho thiết bị điện thoại
router.post('/register-push-token', notificationController.registerPushToken);

// 4. Quản lý trạng thái thông báo cá nhân
router.patch('/read-all', notificationController.markAllAsRead);
router.get('/:id', notificationController.getNotificationById);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;

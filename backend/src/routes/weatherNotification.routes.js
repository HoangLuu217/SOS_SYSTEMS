const express = require('express');
const router = express.Router();
const weatherNotificationController = require('../controllers/weatherNotification.controller');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// A generic invalidation event contains no article data, so anonymous EventSource
// connections are safe; clients still use the normal authenticated API to fetch rows.
router.get('/events/stream', optionalAuthenticate, weatherNotificationController.streamWeatherArticleEvents);

// Called server-to-server by n8n after it finishes successfully.
router.post('/workflow-callback', weatherNotificationController.workflowCompletedCallback);

/**
 * @route   GET /weather-notifications
 * @desc    Lấy danh sách thông báo thời tiết (lọc theo weatherType, severity, areaId, status; phân trang)
 * @access  Public
 */
router.get('/', weatherNotificationController.getWeatherNotifications);

/**
 * @route   GET /weather-notifications/:id
 * @desc    Lấy chi tiết một thông báo thời tiết
 * @access  Public
 */
router.get('/:id', weatherNotificationController.getWeatherNotificationById);

// Các routes thao tác ghi / xóa yêu cầu xác thực
router.use(authenticate);

/**
 * @route   POST /weather-notifications/execute-workflow
 * @desc    Gửi yêu cầu chạy workflow thời tiết trên n8n
 * @access  ADMIN
 */
router.post(
  '/execute-workflow',
  authorize('ADMIN'),
  weatherNotificationController.executeWeatherWorkflow
);

/**
 * @route   POST /weather-notifications
 * @desc    Tạo thông báo thời tiết mới
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.post(
  '/',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  weatherNotificationController.createWeatherNotification
);

/**
 * @route   PUT /weather-notifications/:id
 * @desc    Cập nhật thông báo thời tiết
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.put(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  weatherNotificationController.updateWeatherNotification
);

/**
 * @route   DELETE /weather-notifications/:id
 * @desc    Hủy thông báo thời tiết
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  weatherNotificationController.deleteWeatherNotification
);

module.exports = router;

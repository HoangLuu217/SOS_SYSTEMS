const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /alerts
 * @desc    Lấy danh sách cảnh báo (lọc theo type, severity, areaId, isActive, search; phân trang)
 * @access  Public
 */
router.get('/', alertController.getAlerts);

/**
 * @route   GET /alerts/active
 * @desc    Lấy danh sách cảnh báo đang hoạt động (isActive=true & trong khoảng startTime–endTime)
 * @access  Public
 */
router.get('/active', alertController.getActiveAlerts);

/**
 * @route   GET /alerts/:id
 * @desc    Lấy chi tiết 1 cảnh báo
 * @access  Public
 */
router.get('/:id', alertController.getAlertById);

// Các routes thay đổi dữ liệu yêu cầu xác thực
router.use(authenticate);

/**
 * @route   POST /alerts
 * @desc    Tạo cảnh báo mới
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.post(
  '/',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  alertController.createAlert
);

/**
 * @route   PATCH /alerts/:id
 * @desc    Cập nhật thông tin cảnh báo
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.patch(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  alertController.updateAlert
);

/**
 * @route   DELETE /alerts/:id
 * @desc    Xóa cảnh báo
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  alertController.deleteAlert
);

module.exports = router;

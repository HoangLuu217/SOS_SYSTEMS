const express = require('express');
const router = express.Router();
const safeLocationController = require('../controllers/safeLocation.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /safe-locations
 * @desc    Lấy danh sách địa điểm an toàn (lọc theo type, status, areaId, search; phân trang)
 * @access  Public
 */
router.get('/', safeLocationController.getSafeLocations);

/**
 * @route   GET /safe-locations/nearby
 * @desc    Tìm địa điểm an toàn gần nhất theo tọa độ (?lng=&lat=&maxDistance=&limit=&type=&status=)
 * @access  Public
 */
router.get('/nearby', safeLocationController.getNearbySafeLocations);

/**
 * @route   GET /safe-locations/:id
 * @desc    Lấy chi tiết 1 địa điểm an toàn
 * @access  Public
 */
router.get('/:id', safeLocationController.getSafeLocationById);

// Các routes thay đổi dữ liệu yêu cầu xác thực
router.use(authenticate);

/**
 * @route   POST /safe-locations
 * @desc    Tạo mới địa điểm an toàn
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.post(
  '/',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  safeLocationController.createSafeLocation
);

/**
 * @route   PATCH /safe-locations/:id
 * @desc    Cập nhật thông tin địa điểm an toàn
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.patch(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  safeLocationController.updateSafeLocation
);

/**
 * @route   DELETE /safe-locations/:id
 * @desc    Xóa địa điểm an toàn
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  safeLocationController.deleteSafeLocation
);

module.exports = router;

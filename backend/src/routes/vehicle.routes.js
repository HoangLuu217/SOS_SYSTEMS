const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicle.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /vehicles
 * @desc    Lấy danh sách phương tiện cứu hộ (hỗ trợ phân trang, lọc theo teamId, type, status)
 */
router.get('/', vehicleController.getVehicles);

/**
 * @route   GET /vehicles/:id
 * @desc    Lấy chi tiết một phương tiện
 */
router.get('/:id', vehicleController.getVehicleById);

// Các routes tạo mới, cập nhật, xóa phương tiện yêu cầu đăng nhập & phân quyền
router.use(authenticate);

/**
 * @route   POST /vehicles
 * @desc    Đăng ký phương tiện cứu hộ mới
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.post(
  '/',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  vehicleController.createVehicle
);

/**
 * @route   PATCH /vehicles/:id
 * @desc    Cập nhật thông số phương tiện
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.patch(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  vehicleController.updateVehicle
);

/**
 * @route   DELETE /vehicles/:id
 * @desc    Xóa phương tiện
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  vehicleController.deleteVehicle
);

/**
 * @route   PATCH /vehicles/:id/status
 * @desc    Cập nhật nhanh trạng thái phương tiện (AVAILABLE, IN_USE, MAINTENANCE, INACTIVE)
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.patch(
  '/:id/status',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  vehicleController.updateStatus
);

module.exports = router;

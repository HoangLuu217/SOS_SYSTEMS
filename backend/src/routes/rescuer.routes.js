const express = require('express');
const router = express.Router();
const rescuerController = require('../controllers/rescuer.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả endpoints /rescuer đều yêu cầu đăng nhập
router.use(authenticate);

/**
 * @route   GET /rescuer/me
 * @desc    Lấy thông tin hồ sơ cứu hộ của chính user đang đăng nhập
 */
router.get('/me', rescuerController.getMyProfile);

/**
 * @route   PATCH /rescuer/me
 * @desc    Cập nhật thông tin cơ bản hồ sơ cứu hộ / Công dân nộp đơn đăng ký làm Cứu hộ viên
 */
router.patch('/me', rescuerController.updateMyProfile);

/**
 * @route   POST /rescuer/apply
 * @desc    Công dân nộp đơn đăng ký trở thành Cứu hộ viên
 */
router.post('/apply', rescuerController.applyRescuer);

/**
 * @route   PATCH /rescuer/me/skills
 * @desc    Cập nhật danh sách kỹ năng chuyên môn
 */
router.patch('/me/skills', rescuerController.updateMySkills);

/**
 * @route   PATCH /rescuer/me/experience
 * @desc    Cập nhật thông tin kinh nghiệm
 */
router.patch('/me/experience', rescuerController.updateMyExperience);

/**
 * @route   PATCH /rescuer/me/availability
 * @desc    Cập nhật trạng thái sẵn sàng (chỉ dành cho Cứu hộ viên đã được duyệt VERIFIED)
 */
router.patch(
  '/me/availability',
  authorize('RESCUER', 'ADMIN'),
  rescuerController.updateMyAvailability
);

/**
 * @route   GET /rescuer/pending
 * @desc    Lấy danh sách hồ sơ Cứu hộ viên chờ duyệt (Dành cho Cán bộ địa phương và Admin)
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.get(
  '/pending',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  rescuerController.getPendingRescuers
);

/**
 * @route   PATCH /rescuer/:id/verify
 * @desc    Cán bộ địa phương hoặc Admin thẩm định và phê duyệt (VERIFIED / REJECTED)
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.patch(
  '/:id/verify',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  rescuerController.verifyRescuer
);

module.exports = router;

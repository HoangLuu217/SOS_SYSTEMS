const express = require('express');
const router = express.Router();
const sosAssignmentController = require('../controllers/sosAssignment.controller');
const { optionalAuthenticate } = require('../middlewares/authMiddleware');

router.use(optionalAuthenticate);

/**
 * @route   GET /assignments/my
 * @desc    Lấy danh sách các phân công của cứu hộ viên đang đăng nhập
 */
router.get('/assignments/my', sosAssignmentController.getMyAssignments);

/**
 * @route   PATCH /assignments/sos/:sosId/status
 * @route   PATCH /sos/:id/mission-status
 * @desc    Cập nhật trạng thái tiến trình tác chiến qua mã SOS
 */
router.patch('/assignments/sos/:sosId/status', sosAssignmentController.updateStatusBySosId);
router.patch('/sos/:id/mission-status', sosAssignmentController.updateStatusBySosId);

/**
 * @route   POST /sos/:id/assign
 * @desc    Điều phối, phân công lực lượng cứu hộ cho một yêu cầu SOS
 */
router.post('/sos/:id/assign', sosAssignmentController.assignSos);

/**
 * @route   GET /sos/:id/assignments
 * @desc    Lấy danh sách các phân công của một yêu cầu SOS
 */
router.get('/sos/:id/assignments', sosAssignmentController.getAssignmentsBySosId);

/**
 * @route   PATCH /assignments/:id/accept
 * @desc    Cứu hộ viên / Đội chấp nhận phân công (chỉ cho phép khi ở PENDING)
 */
router.patch('/assignments/:id/accept', sosAssignmentController.acceptAssignment);

/**
 * @route   PATCH /assignments/:id/status
 * @desc    Cập nhật trạng thái tiến trình phân công
 */
router.patch('/assignments/:id/status', sosAssignmentController.updateStatus);

/**
 * @route   PATCH /assignments/:id/reassign
 * @desc    Điều phối lại phân công (thay đổi đội/cứu hộ viên/xe)
 */
router.patch('/assignments/:id/reassign', sosAssignmentController.reassignAssignment);

/**
 * @route   PATCH /assignments/:id/cancel
 * @desc    Hủy phân công điều phối
 */
router.patch('/assignments/:id/cancel', sosAssignmentController.cancelAssignment);

module.exports = router;

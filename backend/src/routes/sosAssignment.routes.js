const express = require('express');
const router = express.Router();
const sosAssignmentController = require('../controllers/sosAssignment.controller');

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

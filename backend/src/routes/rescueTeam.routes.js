const express = require('express');
const router = express.Router();
const rescueTeamController = require('../controllers/rescueTeam.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /rescue-teams
 * @desc    Lấy danh sách đội cứu hộ (hỗ trợ phân trang, lọc theo areaId, authorityId, type, status)
 */
router.get('/', rescueTeamController.getTeams);

/**
 * @route   GET /rescue-teams/:id
 * @desc    Lấy thông tin chi tiết một đội cứu hộ (kèm danh sách members & vehicles)
 */
router.get('/:id', rescueTeamController.getTeamById);

// Các routes thay đổi dữ liệu yêu cầu xác thực người dùng
router.use(authenticate);

/**
 * @route   POST /rescue-teams
 * @desc    Tạo mới một đội cứu hộ
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.post(
  '/',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  rescueTeamController.createTeam
);

/**
 * @route   PATCH /rescue-teams/:id
 * @desc    Cập nhật thông tin đội cứu hộ
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.patch(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  rescueTeamController.updateTeam
);

/**
 * @route   DELETE /rescue-teams/:id
 * @desc    Xóa đội cứu hộ
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  rescueTeamController.deleteTeam
);

/**
 * @route   POST /rescue-teams/:id/members
 * @desc    Thêm thành viên cứu hộ vào đội
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.post(
  '/:id/members',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  rescueTeamController.addMember
);

/**
 * @route   DELETE /rescue-teams/:id/members/:rescuerId
 * @desc    Xóa thành viên khỏi đội cứu hộ
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.delete(
  '/:id/members/:rescuerId',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  rescueTeamController.removeMember
);

/**
 * @route   PATCH /rescue-teams/:id/leader
 * @desc    Chuyển giao vai trò Đội trưởng cho thành viên khác
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.patch(
  '/:id/leader',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  rescueTeamController.changeLeader
);

/**
 * @route   PATCH /rescue-teams/:id/members/:rescuerId/status
 * @desc    Phê duyệt hoặc từ chối đơn ứng tuyển của thành viên
 * @access  LOCAL_AUTHORITY, ADMIN, RESCUER
 */
router.patch(
  '/:id/members/:rescuerId/status',
  authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'),
  rescueTeamController.updateMemberStatus
);

module.exports = router;

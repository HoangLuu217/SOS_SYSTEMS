const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả admin routes yêu cầu xác thực người dùng
router.use(authenticate);

// ─── STATISTICS ───────────────────────────────────────────────────────────────

/**
 * @route   GET /admin/statistics
 * @desc    Tổng hợp thống kê toàn hệ thống
 * @access  ADMIN
 */
router.get('/statistics', authorize('ADMIN'), adminController.getStatistics);

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

/**
 * @route   GET /admin/users
 * @desc    Lấy danh sách người dùng (hỗ trợ Admin và Local Authority tra cứu cứu hộ viên)
 *          Query: role, status, isVerified, search, page, limit
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.get('/users', authorize('LOCAL_AUTHORITY', 'ADMIN'), adminController.getUsers);

/**
 * @route   POST /admin/users
 * @desc    Tạo tài khoản người dùng mới (đặc biệt LOCAL_AUTHORITY phân bổ địa bàn)
 * @access  ADMIN
 */
router.post('/users', authorize('ADMIN'), adminController.createUser);

/**
 * @route   GET /admin/users/:id
 * @desc    Lấy chi tiết 1 người dùng
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.get('/users/:id', authorize('LOCAL_AUTHORITY', 'ADMIN'), adminController.getUserById);

/**
 * @route   PATCH /admin/users/:id
 * @desc    Cập nhật thông tin chi tiết người dùng (họ tên, SĐT, email, status, địa bàn quản lý)
 * @access  ADMIN
 */
router.patch('/users/:id', authorize('ADMIN'), adminController.updateUser);

/**
 * @route   PATCH /admin/users/:id/status
 * @desc    Cập nhật trạng thái tài khoản (ACTIVE / INACTIVE / SUSPENDED / PENDING)
 * @access  ADMIN
 */
router.patch('/users/:id/status', authorize('ADMIN'), adminController.updateUserStatus);

/**
 * @route   PATCH /admin/users/:id/verify
 * @desc    Xác minh tài khoản người dùng (isVerified = true)
 * @access  ADMIN
 */
router.patch('/users/:id/verify', authorize('ADMIN'), adminController.verifyUser);

/**
 * @route   PATCH /admin/users/:id/roles
 * @desc    Cập nhật danh sách vai trò của người dùng
 * @access  ADMIN
 */
router.patch('/users/:id/roles', authorize('ADMIN'), adminController.updateUserRoles);

/**
 * @route   DELETE /admin/users/:id
 * @desc    Xóa tài khoản người dùng (hard delete)
 * @access  ADMIN
 */
router.delete('/users/:id', authorize('ADMIN'), adminController.deleteUser);

// ─── RESCUER VERIFICATION ────────────────────────────────────────────────────

/**
 * @route   PATCH /admin/rescuers/:id/verify
 * @desc    Xác minh hoặc từ chối cứu hộ viên (verificationStatus: VERIFIED | REJECTED)
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.patch(
  '/rescuers/:id/verify',
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  adminController.verifyRescuer
);

module.exports = router;

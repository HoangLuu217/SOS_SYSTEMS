const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả admin routes yêu cầu xác thực + quyền ADMIN
router.use(authenticate);
router.use(authorize('ADMIN'));

// ─── STATISTICS ───────────────────────────────────────────────────────────────

/**
 * @route   GET /admin/statistics
 * @desc    Tổng hợp thống kê toàn hệ thống
 * @access  ADMIN
 */
router.get('/statistics', adminController.getStatistics);

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

/**
 * @route   GET /admin/users
 * @desc    Lấy danh sách tất cả người dùng
 *          Query: role, status, isVerified, search, page, limit
 * @access  ADMIN
 */
router.get('/users', adminController.getUsers);

/**
 * @route   GET /admin/users/:id
 * @desc    Lấy chi tiết 1 người dùng
 * @access  ADMIN
 */
router.get('/users/:id', adminController.getUserById);

/**
 * @route   PATCH /admin/users/:id/status
 * @desc    Cập nhật trạng thái tài khoản (ACTIVE / INACTIVE / SUSPENDED / PENDING)
 * @access  ADMIN
 */
router.patch('/users/:id/status', adminController.updateUserStatus);

/**
 * @route   PATCH /admin/users/:id/verify
 * @desc    Xác minh tài khoản người dùng (isVerified = true)
 * @access  ADMIN
 */
router.patch('/users/:id/verify', adminController.verifyUser);

/**
 * @route   PATCH /admin/users/:id/roles
 * @desc    Cập nhật danh sách vai trò của người dùng
 * @access  ADMIN
 */
router.patch('/users/:id/roles', adminController.updateUserRoles);

/**
 * @route   DELETE /admin/users/:id
 * @desc    Xóa tài khoản người dùng (hard delete)
 * @access  ADMIN
 */
router.delete('/users/:id', adminController.deleteUser);

// ─── RESCUER VERIFICATION ────────────────────────────────────────────────────

/**
 * @route   PATCH /admin/rescuers/:id/verify
 * @desc    Xác minh hoặc từ chối cứu hộ viên (verificationStatus: VERIFIED | REJECTED)
 * @access  ADMIN
 */
router.patch('/rescuers/:id/verify', adminController.verifyRescuer);

module.exports = router;

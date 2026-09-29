const adminService = require('../services/admin.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class AdminController {
  // ─── USERS ────────────────────────────────────

  /**
   * GET /admin/users
   */
  async getUsers(req, res, next) {
    try {
      const { users, pagination } = await adminService.getUsers(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách người dùng thành công', users, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/users/:id
   */
  async getUserById(req, res, next) {
    try {
      const user = await adminService.getUserById(req.params.id);
      return sendSuccess(res, 200, 'Lấy thông tin người dùng thành công', user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id/status
   */
  async updateUserStatus(req, res, next) {
    try {
      const { status } = req.body;
      const user = await adminService.updateUserStatus(req.params.id, status);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'ADMIN',
        action: 'ADMIN_UPDATE_USER_STATUS',
        entityType: 'User',
        entityId: req.params.id,
        metadata: { status },
      });

      return sendSuccess(res, 200, 'Cập nhật trạng thái tài khoản thành công', user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id/verify
   */
  async verifyUser(req, res, next) {
    try {
      const user = await adminService.verifyUser(req.params.id);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'ADMIN',
        action: 'ADMIN_VERIFY_USER',
        entityType: 'User',
        entityId: req.params.id,
      });

      return sendSuccess(res, 200, 'Xác minh tài khoản người dùng thành công', user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id/roles
   */
  async updateUserRoles(req, res, next) {
    try {
      const { roles } = req.body;
      const user = await adminService.updateUserRoles(req.params.id, roles);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'ADMIN',
        action: 'ADMIN_UPDATE_USER_ROLES',
        entityType: 'User',
        entityId: req.params.id,
        metadata: { roles },
      });

      return sendSuccess(res, 200, 'Cập nhật vai trò người dùng thành công', user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/users/:id
   */
  async deleteUser(req, res, next) {
    try {
      const result = await adminService.deleteUser(req.params.id);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'ADMIN',
        action: 'ADMIN_DELETE_USER',
        entityType: 'User',
        entityId: req.params.id,
      });

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  // ─── RESCUER VERIFICATION ─────────────────────

  /**
   * PATCH /admin/rescuers/:id/verify
   */
  async verifyRescuer(req, res, next) {
    try {
      const { verificationStatus } = req.body;
      const user = await adminService.verifyRescuer(req.params.id, verificationStatus);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'ADMIN',
        action: 'ADMIN_VERIFY_RESCUER',
        entityType: 'User',
        entityId: req.params.id,
        metadata: { verificationStatus },
      });

      return sendSuccess(res, 200, 'Cập nhật trạng thái xác minh cứu hộ viên thành công', user);
    } catch (error) {
      next(error);
    }
  }

  // ─── STATISTICS ───────────────────────────────

  /**
   * GET /admin/statistics
   */
  async getStatistics(req, res, next) {
    try {
      const stats = await adminService.getStatistics();
      return sendSuccess(res, 200, 'Lấy thống kê hệ thống thành công', stats);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();

const safeLocationService = require('../services/safeLocation.service');
const auditService = require('../services/audit.service');
const ApiError = require('../utils/apiError');
const { sendSuccess } = require('../utils/apiResponse');

class SafeLocationController {
  /**
   * POST /safe-locations
   */
  async createSafeLocation(req, res, next) {
    try {
      const userRoles = Array.isArray(req.user.roles)
        ? req.user.roles
        : (req.user.role ? [req.user.role] : []);
      const isAuthority = userRoles.includes('LOCAL_AUTHORITY') || userRoles.includes('AUTHORITY');
      if (userRoles.includes('ADMIN') && !isAuthority) {
        throw new ApiError(
          403,
          'Quản trị viên (ADMIN) không có thẩm quyền tạo điểm an toàn. Chức năng này chỉ dành riêng cho Cán bộ chính quyền địa phương (LOCAL_AUTHORITY).'
        );
      }

      const actorRole = req.user.roles?.[0] || req.user.role || 'LOCAL_AUTHORITY';
      const safeLocation = await safeLocationService.createSafeLocation(req.body, req.user._id, req.user);

      // Ghi audit log
      await auditService.log({
        actorId: req.user._id,
        actorRole,
        action: 'CREATE_SAFE_LOCATION',
        entityType: 'SafeLocation',
        entityId: safeLocation._id,
        areaId: safeLocation.areaId || req.user?.authority?.areaId || null,
        metadata: { name: safeLocation.name, type: safeLocation.type },
      });

      return sendSuccess(res, 201, 'Tạo địa điểm an toàn mới thành công', safeLocation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safe-locations
   */
  async getSafeLocations(req, res, next) {
    try {
      const { safeLocations, pagination } = await safeLocationService.getSafeLocations(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách địa điểm an toàn thành công', safeLocations, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safe-locations/nearby
   */
  async getNearbySafeLocations(req, res, next) {
    try {
      const safeLocations = await safeLocationService.getNearbySafeLocations(req.query);
      return sendSuccess(
        res, 200,
        'Lấy danh sách địa điểm an toàn gần nhất thành công',
        safeLocations,
        { count: safeLocations.length }
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safe-locations/:id
   */
  async getSafeLocationById(req, res, next) {
    try {
      const safeLocation = await safeLocationService.getSafeLocationById(req.params.id);
      return sendSuccess(res, 200, 'Lấy thông tin địa điểm an toàn thành công', safeLocation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /safe-locations/:id
   */
  async updateSafeLocation(req, res, next) {
    try {
      const updated = await safeLocationService.updateSafeLocation(req.params.id, req.body);
      const actorRole = req.user.roles?.[0] || req.user.role || 'ADMIN';

      await auditService.log({
        actorId: req.user._id,
        actorRole,
        action: 'UPDATE_SAFE_LOCATION',
        entityType: 'SafeLocation',
        entityId: updated._id,
        areaId: updated?.areaId || req.user?.authority?.areaId || null,
        metadata: req.body,
      });

      return sendSuccess(res, 200, 'Cập nhật địa điểm an toàn thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /safe-locations/:id
   */
  async deleteSafeLocation(req, res, next) {
    try {
      const result = await safeLocationService.deleteSafeLocation(req.params.id);
      const actorRole = req.user.roles?.[0] || req.user.role || 'ADMIN';

      await auditService.log({
        actorId: req.user._id,
        actorRole,
        action: 'DELETE_SAFE_LOCATION',
        entityType: 'SafeLocation',
        entityId: req.params.id,
        areaId: req.user?.authority?.areaId || null,
      });

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SafeLocationController();

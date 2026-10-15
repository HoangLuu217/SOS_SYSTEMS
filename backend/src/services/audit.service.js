const { AuditLog, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class AuditService {
  /**
   * Helper: Lấy danh sách ID các khu vực con & cháu trực thuộc một khu vực
   * @param {ObjectId|string} rootAreaId
   * @returns {Promise<Array<ObjectId>>}
   */
  async getDescendantAreaIds(rootAreaId) {
    if (!rootAreaId) return [];
    try {
      const children = await AdministrativeArea.find({ parentId: rootAreaId, status: 'ACTIVE' }).select('_id');
      const childIds = children.map((c) => c._id);
      if (childIds.length === 0) return [];

      const grandChildren = await AdministrativeArea.find({ parentId: { $in: childIds }, status: 'ACTIVE' }).select('_id');
      const grandChildIds = grandChildren.map((g) => g._id);

      return [...childIds, ...grandChildIds];
    } catch (err) {
      console.warn('[AuditService] Không thể lấy khu vực trực thuộc:', err.message);
      return [];
    }
  }

  /**
   * Ghi 1 bản ghi audit log
   * @param {Object} params
   * @param {ObjectId|null} params.actorId   - ID người thực hiện (null nếu do hệ thống)
   * @param {string|null}   params.actorRole - Role của người thực hiện
   * @param {string}        params.action    - Hành động (vd: CREATE_SOS, UPDATE_USER)
   * @param {string}        params.entityType - Loại thực thể (vd: SosRequest, User)
   * @param {ObjectId|null} params.entityId  - ID thực thể bị tác động
   * @param {ObjectId|null} params.areaId    - ID khu vực hành chính (địa bàn phụ trách)
   * @param {Object}        params.metadata  - Dữ liệu bổ sung (diff, request body, ...)
   */
  async log({ actorId = null, actorRole = null, action, entityType, entityId = null, areaId = null, metadata = {} }) {
    try {
      await AuditLog.create({
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        areaId,
        metadata,
      });
    } catch (err) {
      // Audit log không được làm fail nghiệp vụ chính — chỉ ghi warning
      console.warn('[AuditService] Không thể ghi audit log:', err.message);
    }
  }

  /**
   * Lấy danh sách audit logs (hỗ trợ phân quyền đa cấp Multi-tenancy theo địa bàn)
   * @param {Object} query - Tham số truy vấn (page, limit, from, to, action, entityType...)
   * @param {Object|null} currentUser - Người dùng thực hiện gọi API (req.user)
   */
  async getAuditLogs(query = {}, currentUser = null) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.actorId) filter.actorId = query.actorId;
    if (query.actorRole) filter.actorRole = query.actorRole;
    if (query.action) filter.action = query.action.toUpperCase();
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;

    // Lọc theo khoảng thời gian
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    // ─── PHÂN QUYỀN TRUY VẤN THEO ĐỊA BÀN ──────────────────────────────────────
    const userRoles = currentUser?.roles || [];
    const isAdmin = userRoles.includes('ADMIN');
    const isAuthority = userRoles.includes('LOCAL_AUTHORITY');

    if (!isAdmin && isAuthority) {
      // Cán bộ địa phương: Chỉ xem nhật ký các sự kiện thuộc địa bàn của mình hoặc do chính mình thao tác
      const userAreaId = currentUser.authority?.areaId;
      if (userAreaId) {
        const descendantAreaIds = await this.getDescendantAreaIds(userAreaId);
        const allowedAreaIds = [userAreaId, ...descendantAreaIds];
        filter.$or = [
          { areaId: { $in: allowedAreaIds } },
          { actorId: currentUser._id },
        ];
      } else {
        filter.actorId = currentUser._id;
      }
    } else if (isAdmin) {
      // Admin: Xem toàn bộ hệ thống; nếu có truyền ?areaId= thì lọc theo khu vực đó và các cấp con
      if (query.areaId) {
        const descendantAreaIds = await this.getDescendantAreaIds(query.areaId);
        filter.areaId = { $in: [query.areaId, ...descendantAreaIds] };
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'fullName phone email roles authority')
        .populate('areaId', 'name code type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy chi tiết 1 audit log
   */
  async getAuditLogById(id) {
    const log = await AuditLog.findById(id)
      .populate('actorId', 'fullName phone email roles')
      .populate('areaId', 'name code type');

    if (!log) {
      throw new ApiError(404, 'Không tìm thấy bản ghi audit log này');
    }

    return log;
  }
}

module.exports = new AuditService();

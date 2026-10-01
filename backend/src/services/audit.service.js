const { AuditLog } = require('../models');
const ApiError = require('../utils/apiError');

class AuditService {
  /**
   * Ghi 1 bản ghi audit
   * @param {Object} params
   * @param {ObjectId|null} params.actorId   - ID người thực hiện (null nếu do hệ thống)
   * @param {string|null}   params.actorRole - Role của người thực hiện
   * @param {string}        params.action    - Hành động (vd: CREATE_SOS, UPDATE_USER)
   * @param {string}        params.entityType - Loại thực thể (vd: SosRequest, User)
   * @param {ObjectId|null} params.entityId  - ID thực thể bị tác động
   * @param {Object}        params.metadata  - Dữ liệu bổ sung (diff, request body, ...)
   */
  async log({ actorId = null, actorRole = null, action, entityType, entityId = null, metadata = {} }) {
    try {
      await AuditLog.create({
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        metadata,
      });
    } catch (err) {
      // Audit log không được làm fail nghiệp vụ chính — chỉ ghi warning
      console.warn('[AuditService] Không thể ghi audit log:', err.message);
    }
  }

  /**
   * Lấy danh sách audit logs (lọc & phân trang)
   */
  async getAuditLogs(query = {}) {
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

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'fullName phone email roles')
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
      .populate('actorId', 'fullName phone email roles');

    if (!log) {
      throw new ApiError(404, 'Không tìm thấy bản ghi audit log này');
    }

    return log;
  }
}

module.exports = new AuditService();

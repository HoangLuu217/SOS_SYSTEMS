const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class AuditController {
  /**
   * GET /audit-logs
   */
  async getAuditLogs(req, res, next) {
    try {
      const { logs, pagination } = await auditService.getAuditLogs(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách audit logs thành công', logs, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /audit-logs/:id
   */
  async getAuditLogById(req, res, next) {
    try {
      const log = await auditService.getAuditLogById(req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết audit log thành công', log);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditController();

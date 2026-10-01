const alertService = require('../services/alert.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class AlertController {
  /**
   * POST /alerts
   */
  async createAlert(req, res, next) {
    try {
      const alert = await alertService.createAlert(req.body, req.user._id);

      await auditService.log({
        actorId: req.user._id,
        actorRole: req.user.roles?.[0],
        action: 'CREATE_ALERT',
        entityType: 'Alert',
        entityId: alert._id,
        metadata: { title: alert.title, type: alert.type, severity: alert.severity },
      });

      return sendSuccess(res, 201, 'Tạo cảnh báo mới thành công', alert);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /alerts
   */
  async getAlerts(req, res, next) {
    try {
      const { alerts, pagination } = await alertService.getAlerts(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách cảnh báo thành công', alerts, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /alerts/active
   */
  async getActiveAlerts(req, res, next) {
    try {
      const { alerts, pagination } = await alertService.getActiveAlerts(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách cảnh báo đang hoạt động thành công', alerts, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /alerts/:id
   */
  async getAlertById(req, res, next) {
    try {
      const alert = await alertService.getAlertById(req.params.id);
      return sendSuccess(res, 200, 'Lấy thông tin cảnh báo thành công', alert);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /alerts/:id
   */
  async updateAlert(req, res, next) {
    try {
      const updated = await alertService.updateAlert(req.params.id, req.body);

      await auditService.log({
        actorId: req.user._id,
        actorRole: req.user.roles?.[0],
        action: 'UPDATE_ALERT',
        entityType: 'Alert',
        entityId: updated._id,
        metadata: req.body,
      });

      return sendSuccess(res, 200, 'Cập nhật cảnh báo thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /alerts/:id
   */
  async deleteAlert(req, res, next) {
    try {
      const result = await alertService.deleteAlert(req.params.id);

      await auditService.log({
        actorId: req.user._id,
        actorRole: req.user.roles?.[0],
        action: 'DELETE_ALERT',
        entityType: 'Alert',
        entityId: req.params.id,
      });

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AlertController();

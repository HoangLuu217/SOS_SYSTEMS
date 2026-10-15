const hazardReportService = require('../services/hazardReport.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class HazardReportController {
  /**
   * POST /hazard-reports
   * Tạo đóng góp điểm nguy hiểm từ Citizen / Rescuer (Trạng thái PENDING)
   */
  async createHazardReport(req, res, next) {
    try {
      const userId = req.user._id;
      const userRoles = req.user.roles || [];
      const report = await hazardReportService.createHazardReport(req.body, userId, userRoles);

      await auditService.log({
        actorId: userId,
        actorRole: userRoles[0] || 'CITIZEN',
        action: 'CITIZEN_REPORT_HAZARD',
        entityType: 'HazardReport',
        entityId: report._id,
        areaId: report.areaId || null,
        metadata: {
          hazardType: report.hazardType,
          severity: report.severity,
          title: report.title,
          address: report.address,
        },
      });

      const isAuth = userRoles.includes('LOCAL_AUTHORITY') || userRoles.includes('ADMIN');
      const message = isAuth
        ? (report.status === 'APPROVED'
            ? 'Tạo điểm nguy hiểm thành công và đã được công bố trên bản đồ!'
            : 'Tạo điểm nguy hiểm thành công (Lưu nháp / Chờ duyệt)!')
        : 'Gửi đóng góp điểm nguy hiểm thành công! Đang ở trạng thái PENDING chờ chính quyền duyệt.';
      return sendSuccess(res, 201, message, report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /hazard-reports
   * Lấy danh sách điểm nguy hiểm (Authority / Admin xem được toàn bộ, Citizen xem các điểm đã duyệt)
   */
  async getHazardReports(req, res, next) {
    try {
      const userRoles = req.user?.roles || [];
      const currentUserId = req.user?._id || null;
      const result = await hazardReportService.getHazardReports(req.query, userRoles, currentUserId);
      return sendSuccess(res, 200, 'Lấy danh sách điểm nguy hiểm thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /hazard-reports/:id
   * Lấy chi tiết 1 điểm nguy hiểm
   */
  async getHazardReportById(req, res, next) {
    try {
      const report = await hazardReportService.getHazardReportById(req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết điểm nguy hiểm thành công', report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /hazard-reports/:id/review
   * Authority / Admin phê duyệt hoặc từ chối điểm nguy hiểm (APPROVED | REJECTED)
   */
  async reviewHazardReport(req, res, next) {
    try {
      const authorityUser = req.user;
      const updated = await hazardReportService.reviewHazardReport(req.params.id, req.body, authorityUser);

      const reviewAction = req.body?.status === 'APPROVED' ? 'AUTHORITY_APPROVE_HAZARD' : 'AUTHORITY_REJECT_HAZARD';
      const actorRole = authorityUser?.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : (authorityUser?.roles?.[0] || 'ADMIN');

      await auditService.log({
        actorId: authorityUser?._id,
        actorRole,
        action: reviewAction,
        entityType: 'HazardReport',
        entityId: updated._id,
        areaId: updated.areaId || authorityUser?.authority?.areaId || null,
        metadata: {
          status: updated.status,
          reviewNotes: req.body?.reviewNotes,
          hazardType: updated.hazardType,
          severity: updated.severity,
        },
      });

      return sendSuccess(res, 200, 'Cập nhật trạng thái duyệt điểm nguy hiểm thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /hazard-reports/:id
   * Xóa điểm nguy hiểm (Authority / Admin)
   */
  async deleteHazardReport(req, res, next) {
    try {
      const authorityUser = req.user;
      const result = await hazardReportService.deleteHazardReport(req.params.id, authorityUser);

      const actorRole = authorityUser?.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : (authorityUser?.roles?.[0] || 'ADMIN');

      await auditService.log({
        actorId: authorityUser?._id,
        actorRole,
        action: 'AUTHORITY_DELETE_HAZARD',
        entityType: 'HazardReport',
        entityId: req.params.id,
        areaId: authorityUser?.authority?.areaId || null,
      });

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /hazard-reports/stream
   * SSE Stream cho Realtime Hazard updates (Web authority & Mobile)
   */
  streamHazardEvents(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

    const eventBus = require('../services/eventBus');
    const onHazardEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    eventBus.on('hazard_event', onHazardEvent);

    const heartbeatTimer = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      eventBus.off('hazard_event', onHazardEvent);
    });
  }

  /**
   * POST /hazard-reports/resolve-map-link
   * Giải mã liên kết Google Maps (kể cả shortlink) thành tọa độ GPS
   */
  async resolveMapLink(req, res, next) {
    try {
      const url = req.body?.url || req.query?.url;
      const result = await hazardReportService.resolveMapLink(url);
      return sendSuccess(res, 200, 'Giải mã liên kết Google Maps thành công', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new HazardReportController();

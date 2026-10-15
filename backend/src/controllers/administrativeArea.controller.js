const administrativeAreaService = require('../services/administrativeArea.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class AdministrativeAreaController {
  /**
   * POST /administrative-areas
   */
  async createArea(req, res, next) {
    try {
      const area = await administrativeAreaService.createArea(req.body);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'ADMIN_CREATE_AREA',
        entityType: 'AdministrativeArea',
        entityId: area._id,
        metadata: { name: area.name, code: area.code, level: area.level },
      });

      return sendSuccess(res, 201, 'Tạo khu vực hành chính thành công', area);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /administrative-areas
   */
  async getAreas(req, res, next) {
    try {
      const areas = await administrativeAreaService.getAreas(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách khu vực hành chính thành công', areas);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /administrative-areas/:id
   */
  async getAreaById(req, res, next) {
    try {
      const area = await administrativeAreaService.getAreaById(req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết khu vực hành chính thành công', area);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /administrative-areas/:id
   */
  async updateArea(req, res, next) {
    try {
      const updatedArea = await administrativeAreaService.updateArea(req.params.id, req.body);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'ADMIN_UPDATE_AREA',
        entityType: 'AdministrativeArea',
        entityId: req.params.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      return sendSuccess(res, 200, 'Cập nhật khu vực hành chính thành công', updatedArea);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /administrative-areas/sync-api
   */
  async syncFromApi(req, res, next) {
    try {
      const result = await administrativeAreaService.syncAreasFromApi(req.body);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'ADMIN_SYNC_AREAS',
        entityType: 'AdministrativeArea',
        metadata: { resultSummary: result },
      });

      return sendSuccess(res, 200, 'Đồng bộ khu vực hành chính từ API thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /administrative-areas/boundary
   */
  async getAreaBoundary(req, res, next) {
    try {
      const { areaId, name, province, district } = req.query;
      const data = await administrativeAreaService.getBoundaryForArea({
        areaId,
        name,
        province,
        district,
      });
      if (!data) {
        return sendSuccess(res, 200, 'Không tìm thấy ranh giới cho khu vực này', null);
      }
      return sendSuccess(res, 200, 'Lấy ranh giới khu vực thành công', data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /administrative-areas/managers
   */
  async getAreaManagers(req, res, next) {
    try {
      const managers = await administrativeAreaService.getAreaManagers();
      return sendSuccess(res, 200, 'Lấy danh sách cán bộ quản lý địa phương thành công', managers);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdministrativeAreaController();

const administrativeAreaService = require('../services/administrativeArea.service');
const { sendSuccess } = require('../utils/apiResponse');

class AdministrativeAreaController {
  /**
   * POST /administrative-areas
   */
  async createArea(req, res, next) {
    try {
      const area = await administrativeAreaService.createArea(req.body);
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
      return sendSuccess(res, 200, 'Cập nhật khu vực hành chính thành công', updatedArea);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdministrativeAreaController();

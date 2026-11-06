const safetyCheckService = require('../services/safetyCheck.service');
const { sendSuccess } = require('../utils/apiResponse');

class SafetyCheckController {
  /**
   * POST /safety-checks
   * Tạo một đợt thông báo kiểm tra an toàn người dân
   * Dành cho ADMIN và LOCAL_AUTHORITY
   */
  async createSafetyCheck(req, res, next) {
    try {
      const safetyCheck = await safetyCheckService.createSafetyCheck(req.user, req.body);
      return sendSuccess(res, 201, 'Tạo đợt kiểm tra an toàn thành công', safetyCheck);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safety-checks
   * Lấy danh sách các đợt kiểm tra an toàn (hỗ trợ phân trang và lọc theo quyền)
   */
  async getSafetyChecks(req, res, next) {
    try {
      const result = await safetyCheckService.getSafetyChecks(req.user, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy danh sách đợt kiểm tra an toàn thành công',
        result.safetyChecks,
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safety-checks/active
   * Lấy đợt kiểm tra an toàn đang mở (ACTIVE) cho người dân theo khu vực
   */
  async getActiveSafetyCheck(req, res, next) {
    try {
      const result = await safetyCheckService.getActiveSafetyCheckForCitizen(req.user, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy thông tin đợt kiểm tra an toàn hiện tại thành công',
        result
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safety-checks/:id
   * Xem chi tiết đợt kiểm tra an toàn
   */
  async getSafetyCheckById(req, res, next) {
    try {
      const result = await safetyCheckService.getSafetyCheckById(req.user, req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết đợt kiểm tra an toàn thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /safety-checks/:id/respond
   * Người dân phản hồi / xác nhận trạng thái: SAFE (An toàn) hoặc NEED_HELP (Cần cứu hộ)
   */
  async respondToSafetyCheck(req, res, next) {
    try {
      const result = await safetyCheckService.respondToSafetyCheck(
        req.user,
        req.params.id,
        req.body
      );
      return sendSuccess(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /safety-checks/:id/responses
   * Xem danh sách phản hồi của người dân (Dành cho ADMIN & LOCAL_AUTHORITY)
   */
  async getSafetyCheckResponses(req, res, next) {
    try {
      const result = await safetyCheckService.getSafetyCheckResponses(
        req.user,
        req.params.id,
        req.query
      );
      return sendSuccess(
        res,
        200,
        'Lấy danh sách phản hồi thành công',
        {
          safetyCheck: result.safetyCheck,
          responses: result.responses,
        },
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /safety-checks/:id/close
   * Đóng / kết thúc một đợt kiểm tra an toàn
   */
  async closeSafetyCheck(req, res, next) {
    try {
      const safetyCheck = await safetyCheckService.closeSafetyCheck(req.user, req.params.id);
      return sendSuccess(res, 200, 'Đã đóng đợt kiểm tra an toàn thành công', safetyCheck);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SafetyCheckController();


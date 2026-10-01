const sosAssignmentService = require('../services/sosAssignment.service');
const { sendSuccess } = require('../utils/apiResponse');

class SosAssignmentController {
  /**
   * POST /sos/:id/assign
   */
  async assignSos(req, res, next) {
    try {
      const assignment = await sosAssignmentService.assignSos(
        req.params.id,
        req.body,
        req.user || null
      );
      return sendSuccess(res, 201, 'SOS assigned successfully', assignment);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /sos/:id/assignments
   */
  async getAssignmentsBySosId(req, res, next) {
    try {
      const assignments = await sosAssignmentService.getAssignmentsBySosId(req.params.id);
      return sendSuccess(res, 200, 'Lấy danh sách phân công SOS thành công', assignments);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /assignments/:id/accept
   */
  async acceptAssignment(req, res, next) {
    try {
      const assignment = await sosAssignmentService.acceptAssignment(req.params.id);
      return sendSuccess(res, 200, 'Chấp nhận phân công thành công', assignment);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /assignments/:id/status
   */
  async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const assignment = await sosAssignmentService.updateStatus(req.params.id, status);
      return sendSuccess(res, 200, 'Cập nhật trạng thái phân công thành công', assignment);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /assignments/:id/reassign
   */
  async reassignAssignment(req, res, next) {
    try {
      const assignment = await sosAssignmentService.reassignAssignment(req.params.id, req.body);
      return sendSuccess(res, 200, 'Điều phối lại phân công thành công', assignment);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /assignments/:id/cancel
   */
  async cancelAssignment(req, res, next) {
    try {
      const { cancelReason } = req.body;
      const assignment = await sosAssignmentService.cancelAssignment(req.params.id, cancelReason);
      return sendSuccess(res, 200, 'Hủy phân công thành công', assignment);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SosAssignmentController();

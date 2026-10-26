const equipmentService = require('../services/equipment.service');
const { sendSuccess } = require('../utils/apiResponse');

class EquipmentController {
  /** POST /equipments */
  async createEquipment(req, res, next) {
    try {
      const equipment = await equipmentService.createEquipment(req.body);
      return sendSuccess(res, 201, 'Nhap kho vat tu thanh cong', equipment);
    } catch (error) { next(error); }
  }

  /** GET /equipments */
  async getEquipments(req, res, next) {
    try {
      const { equipments, pagination } = await equipmentService.getEquipments(req.query);
      return sendSuccess(res, 200, 'Lay danh sach vat tu thanh cong', equipments, pagination);
    } catch (error) { next(error); }
  }

  /** GET /equipments/:id */
  async getEquipmentById(req, res, next) {
    try {
      const equipment = await equipmentService.getEquipmentById(req.params.id);
      return sendSuccess(res, 200, 'Lay thong tin vat tu thanh cong', equipment);
    } catch (error) { next(error); }
  }

  /** PATCH /equipments/:id */
  async updateEquipment(req, res, next) {
    try {
      const updated = await equipmentService.updateEquipment(req.params.id, req.body);
      return sendSuccess(res, 200, 'Cap nhat vat tu thanh cong', updated);
    } catch (error) { next(error); }
  }

  /** PATCH /equipments/:id/status */
  async updateStatus(req, res, next) {
    try {
      const { status, note } = req.body;
      const updated = await equipmentService.updateStatus(req.params.id, status, note);
      return sendSuccess(res, 200, 'Cap nhat trang thai vat tu thanh cong', updated);
    } catch (error) { next(error); }
  }

  /** DELETE /equipments/:id */
  async deleteEquipment(req, res, next) {
    try {
      const result = await equipmentService.deleteEquipment(req.params.id);
      return sendSuccess(res, 200, result.message);
    } catch (error) { next(error); }
  }

  /** POST /equipments/:id/transfer */
  async transferEquipment(req, res, next) {
    try {
      const { targetTeamId, quantity, note } = req.body;
      const result = await equipmentService.transferEquipment(req.params.id, { targetTeamId, quantity, note });
      return sendSuccess(res, 200, 'Bàn giao / Điều chuyển khí tài thành công', result);
    } catch (error) { next(error); }
  }

  /** POST /equipments/:id/consume */
  async consumeEquipment(req, res, next) {
    try {
      const { quantity, destination, note } = req.body;
      const result = await equipmentService.consumeEquipment(req.params.id, { quantity, destination, note });
      return sendSuccess(res, 200, 'Xuất cấp cứu trợ / Tiêu hao vật tư thành công', result);
    } catch (error) { next(error); }
  }

  /** POST /equipments/batch-consume */
  async batchConsumeEquipments(req, res, next) {
    try {
      const { items, destination, recipientName, note, teamId, priority } = req.body;
      const result = await equipmentService.batchConsumeEquipments({
        items,
        destination,
        recipientName,
        note,
        teamId,
        priority,
        user: req.user,
      });
      const count = result.updatedEquipments ? result.updatedEquipments.length : (Array.isArray(result) ? result.length : 0);
      const msg = `Xuất cấp cứu trợ thành công ${count} mặt hàng${result.assignment ? ' và đã kích hoạt nhiệm vụ điều phối cho Đội cứu hộ' : ''}`;
      return sendSuccess(res, 200, msg, result);
    } catch (error) { next(error); }
  }

  /** GET /equipments/summary/:teamId */
  async getTeamSummary(req, res, next) {
    try {
      const summary = await equipmentService.getEquipmentSummaryByTeam(req.params.teamId);
      return sendSuccess(res, 200, 'Thong ke vat tu theo doi thanh cong', summary);
    } catch (error) { next(error); }
  }
}

module.exports = new EquipmentController();

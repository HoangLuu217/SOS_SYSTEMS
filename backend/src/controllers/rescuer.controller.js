const rescuerService = require('../services/rescuer.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class RescuerController {
  /**
   * GET /rescuer/me
   */
  async getMyProfile(req, res, next) {
    try {
      const profile = await rescuerService.getProfile(req.user._id);
      return sendSuccess(res, 200, 'Lấy thông tin hồ sơ cứu hộ viên thành công', profile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescuer/me
   */
  async updateMyProfile(req, res, next) {
    try {
      const isNewApplicant = !req.user.roles?.includes('RESCUER');
      const updated = await rescuerService.updateProfile(req.user._id, req.body);

      await auditService.log({
        actorId: req.user._id,
        actorRole: isNewApplicant ? 'CITIZEN' : 'RESCUER',
        action: isNewApplicant ? 'CITIZEN_APPLY_RESCUER' : 'RESCUER_UPDATE_PROFILE',
        entityType: 'User',
        entityId: req.user._id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      const message = isNewApplicant
        ? 'Nộp đơn đăng ký Cứu hộ viên thành công! Hồ sơ đang chờ cơ quan chức năng phê duyệt.'
        : 'Cập nhật thông tin hồ sơ cứu hộ viên thành công';

      return sendSuccess(res, 200, message, updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /rescuer/apply
   */
  async applyRescuer(req, res, next) {
    return this.updateMyProfile(req, res, next);
  }

  /**
   * PATCH /rescuer/me/skills
   */
  async updateMySkills(req, res, next) {
    try {
      const { skills } = req.body;
      const result = await rescuerService.updateSkills(req.user._id, skills);

      await auditService.log({
        actorId: req.user._id,
        actorRole: req.user.roles?.includes('RESCUER') ? 'RESCUER' : 'CITIZEN',
        action: 'RESCUER_UPDATE_SKILLS',
        entityType: 'User',
        entityId: req.user._id,
        metadata: { skills },
      });

      return sendSuccess(res, 200, 'Cập nhật kỹ năng cứu hộ thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescuer/me/experience
   */
  async updateMyExperience(req, res, next) {
    try {
      const { experience } = req.body;
      const result = await rescuerService.updateExperience(req.user._id, experience);
      return sendSuccess(res, 200, 'Cập nhật kinh nghiệm cứu hộ thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescuer/me/availability
   */
  async updateMyAvailability(req, res, next) {
    try {
      const { availabilityStatus } = req.body;
      const result = await rescuerService.updateAvailability(req.user._id, availabilityStatus);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'RESCUER',
        action: 'RESCUER_UPDATE_AVAILABILITY',
        entityType: 'User',
        entityId: req.user._id,
        metadata: { availabilityStatus },
      });

      return sendSuccess(res, 200, 'Cập nhật trạng thái sẵn sàng thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /rescuer/pending
   * Dành cho Cán bộ địa phương (LOCAL_AUTHORITY) và ADMIN tra cứu hồ sơ chờ duyệt
   */
  async getPendingRescuers(req, res, next) {
    try {
      const rescuers = await rescuerService.getPendingRescuers(req.query, req.user);
      return sendSuccess(
        res,
        200,
        `Lấy danh sách hồ sơ cứu hộ viên chờ duyệt thành công (${rescuers.length} hồ sơ)`,
        rescuers
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescuer/:id/verify
   * Cán bộ địa phương (LOCAL_AUTHORITY) hoặc ADMIN phê duyệt / từ chối hồ sơ cứu hộ viên
   */
  async verifyRescuer(req, res, next) {
    try {
      const { verificationStatus } = req.body;
      const user = await rescuerService.verifyRescuer(req.params.id, verificationStatus);

      await auditService.log({
        actorId: req.user._id,
        actorRole: req.user.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY',
        action: 'VERIFY_RESCUER',
        entityType: 'User',
        entityId: req.params.id,
        metadata: { verificationStatus },
      });

      return sendSuccess(res, 200, 'Cập nhật trạng thái xác minh cứu hộ viên thành công', user);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RescuerController();

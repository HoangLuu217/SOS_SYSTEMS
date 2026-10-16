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
      const updated = await rescuerService.updateProfile(req.user._id, req.body);

      await auditService.log({
        actorId: req.user._id,
        actorRole: 'RESCUER',
        action: 'RESCUER_UPDATE_PROFILE',
        entityType: 'User',
        entityId: req.user._id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      return sendSuccess(res, 200, 'Cập nhật thông tin hồ sơ cứu hộ viên thành công', updated);
    } catch (error) {
      next(error);
    }
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
        actorRole: 'RESCUER',
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
}

module.exports = new RescuerController();

const rescueTeamService = require('../services/rescueTeam.service');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');

class RescueTeamController {
  /**
   * POST /rescue-teams
   */
  async createTeam(req, res, next) {
    try {
      const team = await rescueTeamService.createTeam(req.body);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'CREATE_RESCUE_TEAM',
        entityType: 'RescueTeam',
        entityId: team._id,
        areaId: team.areaId || req.user?.authority?.areaId || null,
        metadata: { teamName: team.name, type: team.type, areaId: team.areaId },
      });

      return sendSuccess(res, 201, 'Tạo đội cứu hộ mới thành công', team);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /rescue-teams
   */
  async getTeams(req, res, next) {
    try {
      const { teams, pagination } = await rescueTeamService.getTeams(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách đội cứu hộ thành công', teams, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /rescue-teams/:id
   */
  async getTeamById(req, res, next) {
    try {
      const team = await rescueTeamService.getTeamById(req.params.id);
      return sendSuccess(res, 200, 'Lấy thông tin chi tiết đội cứu hộ thành công', team);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescue-teams/:id
   */
  async updateTeam(req, res, next) {
    try {
      const updated = await rescueTeamService.updateTeam(req.params.id, req.body);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'UPDATE_RESCUE_TEAM',
        entityType: 'RescueTeam',
        entityId: req.params.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      return sendSuccess(res, 200, 'Cập nhật thông tin đội cứu hộ thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /rescue-teams/:id
   */
  async deleteTeam(req, res, next) {
    try {
      const result = await rescueTeamService.deleteTeam(req.params.id);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'DELETE_RESCUE_TEAM',
        entityType: 'RescueTeam',
        entityId: req.params.id,
      });

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /rescue-teams/:id/members
   */
  async addMember(req, res, next) {
    try {
      const { rescuerId, role } = req.body;
      const targetRescuerId = rescuerId || req.user?._id;
      const team = await rescueTeamService.addMember(req.params.id, targetRescuerId, role, req.user);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'RESCUER',
        action: 'TEAM_ADD_MEMBER',
        entityType: 'RescueTeam',
        entityId: req.params.id,
        metadata: { rescuerId: targetRescuerId, role },
      });

      const memberObj = team.members.find(
        m => (m.rescuerId?._id || m.rescuerId)?.toString() === targetRescuerId.toString()
      );
      const isPending = memberObj?.status === 'PENDING';
      const msg = isPending
        ? 'Đã nộp đơn ứng tuyển vào đội cứu hộ thành công. Vui lòng chờ Đội trưởng hoặc Ban chỉ huy phê duyệt.'
        : 'Thêm thành viên vào đội cứu hộ thành công';

      return sendSuccess(res, isPending ? 201 : 200, msg, team);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescue-teams/:id/members/:rescuerId/status
   */
  async updateMemberStatus(req, res, next) {
    try {
      const { status } = req.body;
      const team = await rescueTeamService.updateMemberStatus(
        req.params.id,
        req.params.rescuerId,
        status,
        req.user
      );

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'RESCUER',
        action: 'TEAM_UPDATE_MEMBER_STATUS',
        entityType: 'RescueTeam',
        entityId: req.params.id,
        metadata: { rescuerId: req.params.rescuerId, status },
      });

      const msg = status === 'APPROVED' ? 'Phê duyệt thành viên vào đội thành công' : 'Đã từ chối đơn ứng tuyển';
      return sendSuccess(res, 200, msg, team);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /rescue-teams/:id/members/:rescuerId
   */
  async removeMember(req, res, next) {
    try {
      const team = await rescueTeamService.removeMember(req.params.id, req.params.rescuerId);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'TEAM_REMOVE_MEMBER',
        entityType: 'RescueTeam',
        entityId: req.params.id,
        metadata: { rescuerId: req.params.rescuerId },
      });

      return sendSuccess(res, 200, 'Xóa thành viên khỏi đội cứu hộ thành công', team);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /rescue-teams/:id/leader
   */
  async changeLeader(req, res, next) {
    try {
      const { leaderId } = req.body;
      const team = await rescueTeamService.changeLeader(req.params.id, leaderId);

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole: req.user?.roles?.[0] || 'ADMIN',
        action: 'TEAM_CHANGE_LEADER',
        entityType: 'RescueTeam',
        entityId: req.params.id,
        metadata: { leaderId },
      });

      return sendSuccess(res, 200, 'Chuyển giao quyền Đội trưởng thành công', team);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RescueTeamController();

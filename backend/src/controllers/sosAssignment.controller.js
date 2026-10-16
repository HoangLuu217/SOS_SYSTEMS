const sosAssignmentService = require('../services/sosAssignment.service');
const auditService = require('../services/audit.service');
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

      const actorRole = req.user?.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : (req.user?.roles?.[0] || 'DISPATCHER');

      await auditService.log({
        actorId: req.user?._id || assignment.assignedBy || null,
        actorRole,
        action: 'AUTHORITY_ASSIGN_MISSION',
        entityType: 'SosAssignment',
        entityId: assignment._id,
        areaId: req.user?.authority?.areaId || null,
        metadata: {
          sosId: assignment.sosId,
          rescueTeamId: assignment.rescueTeamId,
          rescuerId: assignment.rescuerId,
          priority: assignment.priority,
          note: assignment.note,
        },
      });

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

      await auditService.log({
        actorId: req.user?._id || assignment.rescuerId,
        actorRole: 'RESCUER',
        action: 'RESCUER_ACCEPT_MISSION',
        entityType: 'SosAssignment',
        entityId: assignment._id,
        metadata: {
          sosId: assignment.sosId,
          rescueTeamId: assignment.rescueTeamId,
          status: 'ACCEPTED',
          acceptedAt: assignment.acceptedAt,
        },
      });

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

      const actorRole = req.user?.roles?.includes('RESCUER') ? 'RESCUER' : (req.user?.roles?.[0] || 'RESCUER');
      await auditService.log({
        actorId: req.user?._id || assignment.rescuerId,
        actorRole,
        action: `RESCUER_${status}_MISSION`,
        entityType: 'SosAssignment',
        entityId: assignment._id,
        metadata: {
          sosId: assignment.sosId,
          status,
          note: req.body.note,
        },
      });

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

      const actorRole = req.user?.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : (req.user?.roles?.[0] || 'DISPATCHER');

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole,
        action: 'AUTHORITY_REASSIGN_MISSION',
        entityType: 'SosAssignment',
        entityId: assignment._id,
        areaId: req.user?.authority?.areaId || null,
        metadata: {
          sosId: assignment.sosId,
          rescueTeamId: assignment.rescueTeamId,
          rescuerId: assignment.rescuerId,
          note: req.body.note,
        },
      });

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

      const actorRole = req.user?.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : (req.user?.roles?.[0] || 'DISPATCHER');

      await auditService.log({
        actorId: req.user?._id || null,
        actorRole,
        action: 'AUTHORITY_CANCEL_MISSION',
        entityType: 'SosAssignment',
        entityId: assignment._id,
        areaId: req.user?.authority?.areaId || null,
        metadata: {
          sosId: assignment.sosId,
          cancelReason,
        },
      });

      return sendSuccess(res, 200, 'Hủy phân công thành công', assignment);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SosAssignmentController();


const sosService = require('../services/sos.service');
const fileService = require('../services/file.service');
const auditService = require('../services/audit.service');
const { SosAssignment, RescueTeam } = require('../models');
const { emitSosCreated, emitSosUpdated, emitSosDeleted } = require('../socket');

const createSos = async (req, res, next) => {
  try {
    const citizenId = req.user._id;
    const sosData = req.body;
    const newSos = await sosService.createSosRequest(citizenId, sosData);

    const userRole = req.user.roles?.[0] || 'CITIZEN';
    await auditService.log({
      actorId: citizenId,
      actorRole: userRole,
      action: 'CITIZEN_CREATE_SOS',
      entityType: 'SosRequest',
      entityId: newSos._id,
      areaId: newSos.areaId || null,
      metadata: {
        severityLevel: newSos.severityLevel,
        description: newSos.description,
        contactPhone: newSos.contactPhone || req.user.phone,
        secondaryPhone: newSos.secondaryPhone || null,
        victimCount: newSos.victimCount,
        address: newSos.location?.address,
      },
    });

    // Phát sự kiện Realtime Socket.IO cho toàn bộ Web Dashboard & Cán bộ
    if (newSos.repeatCount && newSos.repeatCount > 1) {
      emitSosUpdated(newSos);
    } else {
      emitSosCreated(newSos);
    }

    res.status(201).json({ success: true, data: newSos });
  } catch (error) {
    next(error);
  }
};

const getSosRequests = async (req, res, next) => {
  try {
    const query = { ...req.query };
    const userRoles = req.user?.roles || [];
    const userId = req.user?._id;
    
    // Phân quyền tra cứu danh sách SOS:
    // - ADMIN / LOCAL_AUTHORITY: Xem toàn bộ hoặc theo địa bàn
    // - RESCUER / LEADER: Xem các ca do mình gửi HOẶC các ca được phân công cho mình / đội cứu hộ
    // - CITIZEN: Chỉ xem các ca do chính tài khoản của mình gửi
    const isDispatchAuthority = userRoles.some(r => ['ADMIN', 'LOCAL_AUTHORITY'].includes(r));
    if (!isDispatchAuthority) {
      if (userRoles.includes('RESCUER') || userRoles.includes('LEADER')) {
        const teams = await RescueTeam.find({
          $or: [
            { leaderId: userId },
            { 'members.rescuerId': userId, 'members.status': 'APPROVED' },
            { 'members.rescuerId': userId },
          ],
        }).select('_id');
        const teamIds = teams.map((t) => t._id);

        const myAssignments = await SosAssignment.find({
          $or: [
            { rescuerId: userId },
            { rescueTeamId: { $in: teamIds } },
            { teamId: { $in: teamIds } },
          ],
        }).select('sosRequestId sosId');

        const assignedSosIds = myAssignments
          .map((a) => a.sosRequestId || a.sosId)
          .filter(Boolean);

        query.$or = [{ citizenId: userId }, { _id: { $in: assignedSosIds } }];
      } else {
        query.citizenId = userId;
      }
    }

    if (query.areaId === 'ALL') {
      delete query.areaId;
    }
    
    const list = await sosService.getSosRequests(query);
    res.status(200).json({ success: true, count: list.length, data: list });
  } catch (error) {
    next(error);
  }
};

const getSosById = async (req, res, next) => {
  try {
    const sos = await sosService.getSosRequestById(req.params.id);
    res.status(200).json({ success: true, data: sos });
  } catch (error) {
    next(error);
  }
};

const updateSos = async (req, res, next) => {
  try {
    const updatedSos = await sosService.updateSosRequest(req.params.id, req.body, req.user._id);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'CITIZEN',
      action: 'UPDATE_SOS',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: updatedSos?.areaId || null,
      metadata: { updatedFields: Object.keys(req.body) },
    });

    emitSosUpdated(updatedSos);
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const cancelSos = async (req, res, next) => {
  try {
    const note = req.body.note || 'Yêu cầu hủy từ người dùng';
    const updatedSos = await sosService.changeStatus(req.params.id, 'CANCELLED', req.user._id, note);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'CITIZEN',
      action: 'CITIZEN_CANCEL_SOS',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: updatedSos?.areaId || null,
      metadata: { note, status: 'CANCELLED' },
    });

    emitSosUpdated(updatedSos);
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const completeSos = async (req, res, next) => {
  try {
    const note = req.body.note || 'Đã hoàn thành cứu nạn';
    const updatedSos = await sosService.changeStatus(req.params.id, 'COMPLETED', req.user._id, note);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'RESCUER',
      action: 'COMPLETE_SOS',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: updatedSos?.areaId || null,
      metadata: { note, status: 'COMPLETED' },
    });

    emitSosUpdated(updatedSos);
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const getSosHistory = async (req, res, next) => {
  try {
    const history = await sosService.getSosHistory(req.params.id);
    res.status(200).json({ success: true, count: history.length, data: history });
  } catch (error) {
    next(error);
  }
};

const verifySos = async (req, res, next) => {
  try {
    const verifiedSos = await sosService.verifyAndClassifySos(
      req.params.id, 
      req.body, 
      req.user._id
    );

    const actorRole = req.user.roles?.includes('LOCAL_AUTHORITY') 
      ? 'LOCAL_AUTHORITY' 
      : (req.user.roles?.[0] || 'LOCAL_AUTHORITY');

    await auditService.log({
      actorId: req.user._id,
      actorRole,
      action: 'AUTHORITY_VERIFY_SOS',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: verifiedSos?.areaId || req.user.authority?.areaId || null,
      metadata: {
        priorityLevel: req.body.priorityLevel,
        status: verifiedSos.status,
        verificationNotes: req.body.verificationNotes,
      },
    });

    emitSosUpdated(verifiedSos);
    res.status(200).json({ success: true, data: verifiedSos });
  } catch (error) {
    next(error);
  }
};

const getSosFiles = async (req, res, next) => {
  try {
    const files = await fileService.getFilesBySosId(req.params.id);
    res.status(200).json({ success: true, count: files.length, data: files });
  } catch (error) {
    next(error);
  }
};


const deleteSos = async (req, res, next) => {
  try {
    const deletedSos = await sosService.deleteSos(req.params.id, req.user);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'CITIZEN',
      action: 'DELETE_SOS',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: deletedSos?.areaId || null,
      metadata: { sosCode: deletedSos?.sosCode, status: deletedSos?.status },
    });

    emitSosDeleted(req.params.id);
    res.status(200).json({ success: true, message: 'Đã xóa yêu cầu SOS thành công', data: { id: req.params.id } });
  } catch (error) {
    next(error);
  }
};

const requestShoreHandoff = async (req, res, next) => {
  try {
    const updatedSos = await sosService.requestShoreHandoff(req.params.id, req.body, req.user);
    emitSosUpdated(updatedSos);
    const io = require('../socket').getIO();
    if (io) {
      io.emit('sos:shore_handoff_requested', {
        sosId: updatedSos._id,
        sosCode: updatedSos.sosCode,
        shoreHandoff: updatedSos.shoreHandoff,
      });
    }
    res.status(200).json({ success: true, data: updatedSos });

  } catch (error) {
    next(error);
  }
};


const clearCancelledSos = async (req, res, next) => {
  try {
    const result = await sosService.clearCancelledSos(req.user);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'LOCAL_AUTHORITY',
      action: 'CLEAR_CANCELLED_SOS',
      entityType: 'SosRequest',
      metadata: { deletedCount: result.deletedCount },
    });

    result.deletedIds.forEach((id) => emitSosDeleted(id.toString()));
    res.status(200).json({
      success: true,
      message: `Đã dọn dẹp thành công ${result.deletedCount} ca đã hủy`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const assignShoreHandoff = async (req, res, next) => {
  try {
    const updatedSos = await sosService.assignShoreHandoff(req.params.id, req.body, req.user);
    emitSosUpdated(updatedSos);
    const io = require('../socket').getIO();
    if (io) {
      io.emit('sos:shore_handoff_assigned', {
        sosId: updatedSos._id,
        sosCode: updatedSos.sosCode,
        shoreHandoff: updatedSos.shoreHandoff,
      });
    }
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const cancelShoreHandoff = async (req, res, next) => {
  try {
    const updatedSos = await sosService.cancelShoreHandoff(req.params.id, req.user);
    emitSosUpdated(updatedSos);
    const io = require('../socket').getIO();
    if (io) {
      io.emit('sos:shore_handoff_cancelled', {
        sosId: updatedSos._id,
        sosCode: updatedSos.sosCode,
        shoreHandoff: updatedSos.shoreHandoff,
      });
    }
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const completeShoreHandoff = async (req, res, next) => {
  try {
    const updatedSos = await sosService.completeShoreHandoff(req.params.id, req.user);
    emitSosUpdated(updatedSos);
    const io = require('../socket').getIO();
    if (io) {
      io.emit('sos:shore_handoff_completed', {
        sosId: updatedSos._id,
        sosCode: updatedSos.sosCode,
        shoreHandoff: updatedSos.shoreHandoff,
      });
    }
    res.status(200).json({ success: true, data: updatedSos });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSos,
  getSosRequests,
  getSosById,
  updateSos,
  cancelSos,
  completeSos,
  getSosHistory,
  verifySos,
  getSosFiles,

  requestShoreHandoff,
  assignShoreHandoff,
  cancelShoreHandoff,
  completeShoreHandoff,


  deleteSos,
  clearCancelledSos,

};

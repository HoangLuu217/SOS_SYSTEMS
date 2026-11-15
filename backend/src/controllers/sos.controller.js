const mongoose = require('mongoose');
const sosService = require('../services/sos.service');
const fileService = require('../services/file.service');
const auditService = require('../services/audit.service');
const smartDispatchService = require('../services/smartDispatch.service');
const sosTriageService = require('../services/sosTriage.service');
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
        priority: newSos.priority,
        riskScore: newSos.riskScore,
        description: newSos.description,
        contactPhone: newSos.contactPhone || req.user.phone,
        secondaryPhone: newSos.secondaryPhone || null,
        people: newSos.people,
        address: newSos.address,
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
    // - RESCUER / LEADER / CITIZEN: Chỉ xem các ca SOS do chính tài khoản của mình gửi (nhiệm vụ cứu hộ dùng /assignments/my)
    const isDispatchAuthority = userRoles.some(r => ['ADMIN', 'LOCAL_AUTHORITY'].includes(r));
    if (!isDispatchAuthority) {
      query.citizenId = userId;
    }

    if (query.areaId === 'ALL') {
      delete query.areaId;
    }
    
    const list = await sosService.getSosRequests(query, req.user);
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
    const userRoles = req.user?.roles || [];
    const isPrivileged = userRoles.some((r) => ['ADMIN', 'LOCAL_AUTHORITY', 'AUTHORITY', 'RESCUER'].includes(r));
    if (!isPrivileged) {
      const currentSos = await sosService.getSosRequestById(req.params.id);
      const sosSt = currentSos?.status;
      const assignSt = currentSos?.assignment?.status;
      const canCitizenComplete =
        ['ARRIVED', 'RESCUING', 'COMPLETED'].includes(sosSt) ||
        ['ARRIVED', 'RESCUING', 'COMPLETED'].includes(assignSt);
      if (!canCitizenComplete) {
        return res.status(400).json({
          success: false,
          message:
            'Đội cứu hộ chưa tiếp cận hiện trường nên chưa thể xác nhận hoàn thành cứu nạn. Nếu bạn đã tự thoát hiểm, vui lòng chọn Hủy yêu cầu.',
        });
      }
    }

    const note = req.body.note || req.body.notes || 'Đã hoàn thành cứu nạn';
    const isAuthorityOrAdmin =
      userRoles.includes('ADMIN') ||
      userRoles.includes('LOCAL_AUTHORITY') ||
      userRoles.includes('AUTHORITY');

    // Nếu là cứu hộ viên hoàn tất từ App: định tuyến qua updateStatus của đúng assignment của đội mình
    // để đảm bảo khi có cả đội cứu hộ & đội xe tiếp vận (SHORE_HANDOFF), SOS chỉ hoàn thành khi cả hai xong.
    if (!isAuthorityOrAdmin && req.user?._id) {
      const userTeams = await RescueTeam.find({
        $or: [
          { leaderId: req.user._id },
          { 'members.rescuerId': req.user._id },
        ],
      }).select('_id');
      const teamIds = userTeams.map((t) => t._id);

      const myActiveAssign = await SosAssignment.findOne({
        $or: [{ sosRequestId: req.params.id }, { sosId: req.params.id }],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        $and: [
          {
            $or: [
              { rescuerId: req.user._id },
              ...(teamIds.length > 0
                ? [{ rescueTeamId: { $in: teamIds } }, { teamId: { $in: teamIds } }]
                : []),
            ],
          },
        ],
      }).sort({ createdAt: -1 });

      if (myActiveAssign) {
        const sosAssignmentService = require('../services/sosAssignment.service');
        await sosAssignmentService.updateStatus(myActiveAssign._id, 'COMPLETED', req.user, note, {
          proofImages: req.body?.proofImages,
          actualRecipient: req.body?.actualRecipient,
        });
        const refreshedSos = await sosService.getSosRequestById(req.params.id);
        await auditService.log({
          actorId: req.user._id,
          actorRole: req.user.roles?.[0] || 'RESCUER',
          action: 'COMPLETE_SOS_ASSIGNMENT',
          entityType: 'SosRequest',
          entityId: req.params.id,
          areaId: refreshedSos?.areaId || null,
          metadata: { note, status: refreshedSos?.status, assignmentId: myActiveAssign._id },
        });
        emitSosUpdated(refreshedSos);
        return res.status(200).json({ success: true, data: refreshedSos });
      }

      // Nếu đội của rescuer vừa hoàn thành assignment trước đó nhưng vẫn còn đội khác (VD: xe tiếp vận SHORE_HANDOFF)
      // hoặc shoreHandoff đang REQUESTED/ASSIGNED chưa xong -> KHÔNG được đóng sớm toàn bộ SOS!
      const currentSos = await sosService.getSosRequestById(req.params.id);
      const hasOtherActiveAssignment = await SosAssignment.exists({
        $or: [{ sosRequestId: req.params.id }, { sosId: req.params.id }],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      });
      const hasPendingHandoff = Boolean(
        currentSos?.shoreHandoff &&
        ['REQUESTED', 'ASSIGNED'].includes(String(currentSos.shoreHandoff.status || '').toUpperCase()) &&
        !currentSos.shoreHandoff.completedAt
      );
      if (hasOtherActiveAssignment || hasPendingHandoff) {
        emitSosUpdated(currentSos);
        return res.status(200).json({ success: true, data: currentSos });
      }
    }
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
        priority: verifiedSos.priority,
        riskScore: verifiedSos.riskScore,
        suggestedPriority: verifiedSos.riskAssessment?.suggestedPriority,
        ruleVersion: verifiedSos.riskAssessment?.ruleVersion,
        status: verifiedSos.status,
        verificationNote: req.body.note,
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
    const sosIds = req.body?.sosIds || (req.query?.ids ? String(req.query.ids).split(',') : []);
    const result = await sosService.clearCancelledSos(req.user, sosIds);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'LOCAL_AUTHORITY',
      action: 'CLEAR_CANCELLED_SOS',
      entityType: 'SosRequest',
      metadata: { deletedCount: result.deletedCount, deletedIds: result.deletedIds },
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
    const { proofImages } = req.body || {};
    const updatedSos = await sosService.completeShoreHandoff(req.params.id, req.user, proofImages);
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

const submitFeedback = async (req, res, next) => {
  try {
    const updatedSos = await sosService.submitFeedback(req.params.id, req.body, req.user);

    await auditService.log({
      actorId: req.user._id,
      actorRole: req.user.roles?.[0] || 'CITIZEN',
      action: 'CITIZEN_FEEDBACK',
      entityType: 'SosRequest',
      entityId: req.params.id,
      areaId: updatedSos?.areaId?._id || updatedSos?.areaId || null,
      metadata: {
        sosCode: updatedSos?.sosCode,
        sentiment: updatedSos?.citizenFeedback?.sentiment,
        tags: updatedSos?.citizenFeedback?.tags || [],
      },
    });

    emitSosUpdated(updatedSos);
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const getDispatchRecommendations = async (req, res, next) => {
  try {
    const includeAiAdvisor = String(req.query.ai || '').toLowerCase() === 'true';
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const isAdmin = Array.isArray(req.user?.roles) && req.user.roles.includes('ADMIN');
    const rawAreaId = !isAdmin ? (req.query.areaId || req.user?.authority?.areaId || null) : null;
    const officerAreaId = rawAreaId && mongoose.Types.ObjectId.isValid(String(rawAreaId)) ? String(rawAreaId) : null;
    const officerAreaName = !isAdmin
      ? (req.query.areaName || req.user?.authority?.jurisdictionAreaName || req.user?.authority?.areaName || null)
      : null;
    const data = await smartDispatchService.getDispatchRecommendations(req.params.id, {
      includeAiAdvisor,
      forceRefresh,
      officerAreaId,
      officerAreaName,
      isAdmin,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const reanalyzeSosAi = async (req, res, next) => {
  try {
    const updated = await sosTriageService.runAiTriageNow(req.params.id, {
      emitSocket: true,
    });
    const finalSos = updated || (await sosService.getSosRequestById(req.params.id));
    res.status(200).json({ success: true, data: finalSos });
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
  getDispatchRecommendations,
  reanalyzeSosAi,

  requestShoreHandoff,
  assignShoreHandoff,
  cancelShoreHandoff,
  completeShoreHandoff,


  deleteSos,
  clearCancelledSos,
  submitFeedback,
};

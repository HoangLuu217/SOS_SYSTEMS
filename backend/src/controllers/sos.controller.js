const sosService = require('../services/sos.service');
const fileService = require('../services/file.service');
const auditService = require('../services/audit.service');
const { emitSosCreated, emitSosUpdated } = require('../socket');

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
        victimCount: newSos.victimCount,
        address: newSos.location?.address,
      },
    });

    // Phát sự kiện Realtime Socket.IO cho toàn bộ Web Dashboard & Cán bộ
    emitSosCreated(newSos);

    res.status(201).json({ success: true, data: newSos });
  } catch (error) {
    next(error);
  }
};

const getSosRequests = async (req, res, next) => {
  try {
    const query = { ...req.query };
    const userRoles = req.user?.roles || [];
    
    // Nếu user chỉ là CITIZEN (không phải Admin hay Authority), họ chỉ xem được SOS của họ
    const isCitizenOnly = userRoles.includes('CITIZEN') && !userRoles.some(r => ['ADMIN', 'LOCAL_AUTHORITY'].includes(r));
    if (isCitizenOnly) {
      query.citizenId = req.user._id;
    }

    // Cán bộ địa phương (LOCAL_AUTHORITY) chỉ get các ca SOS thuộc khu vực phân công
    const isLocalAuthorityOnly = userRoles.includes('LOCAL_AUTHORITY') && !userRoles.includes('ADMIN');
    if (isLocalAuthorityOnly && req.user?.authority?.areaId) {
      query.areaId = req.user.authority.areaId;
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

module.exports = {
  createSos,
  getSosRequests,
  getSosById,
  updateSos,
  cancelSos,
  completeSos,
  getSosHistory,
  verifySos,
  getSosFiles
};

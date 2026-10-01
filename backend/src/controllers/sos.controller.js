const sosService = require('../services/sos.service');
const fileService = require('../services/file.service');

const createSos = async (req, res, next) => {
  try {
    const citizenId = req.user._id;
    const sosData = req.body;
    const newSos = await sosService.createSosRequest(citizenId, sosData);
    res.status(201).json({ success: true, data: newSos });
  } catch (error) {
    next(error);
  }
};

const getSosRequests = async (req, res, next) => {
  try {
    const query = req.query;
    const userRoles = req.user.roles || [];
    
    // Nếu user chỉ là CITIZEN (không phải Admin hay Authority), họ chỉ xem được SOS của họ
    const isCitizenOnly = userRoles.includes('CITIZEN') && !userRoles.some(r => ['ADMIN', 'LOCAL_AUTHORITY'].includes(r));
    if (isCitizenOnly) {
      query.citizenId = req.user._id;
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
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const cancelSos = async (req, res, next) => {
  try {
    const note = req.body.note || 'Yêu cầu hủy từ người dùng';
    const updatedSos = await sosService.changeStatus(req.params.id, 'CANCELLED', req.user._id, note);
    res.status(200).json({ success: true, data: updatedSos });
  } catch (error) {
    next(error);
  }
};

const completeSos = async (req, res, next) => {
  try {
    const note = req.body.note || 'Đã hoàn thành cứu nạn';
    const updatedSos = await sosService.changeStatus(req.params.id, 'COMPLETED', req.user._id, note);
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

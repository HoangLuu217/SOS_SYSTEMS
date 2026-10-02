const { SosRequest, SosStatusHistory } = require('../models');
const ApiError = require('../utils/apiError');

const createSosRequest = async (citizenId, sosData) => {
  // Extract fields
  const { location, areaId, address, emergencyType, priority, people, description } = sosData;
  const newSos = await SosRequest.create({
    citizenId,
    location,
    areaId,
    address,
    emergencyType,
    priority,
    people,
    description,
    status: 'PENDING'
  });

  // Tạo history cho trạng thái khởi tạo
  await SosStatusHistory.create({
    sosId: newSos._id,
    oldStatus: null,
    newStatus: 'PENDING',
    changedBy: citizenId,
    note: 'Tạo yêu cầu cứu nạn mới'
  });

  return newSos;
};

const getSosRequests = async (query = {}) => {
  const filter = {};
  if (query.citizenId) filter.citizenId = query.citizenId;
  if (query.status) filter.status = query.status;
  if (query.areaId) filter.areaId = query.areaId;
  if (query.priority) filter.priority = query.priority;
  if (query.emergencyType) filter.emergencyType = query.emergencyType;

  // Hỗ trợ Geospatial Query (Tìm theo tọa độ và bán kính - Tính bằng mét)
  if (query.lng && query.lat && query.radius) {
    const radiusInMeters = parseFloat(query.radius);
    filter.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(query.lng), parseFloat(query.lat)]
        },
        $maxDistance: radiusInMeters
      }
    };
  }

  return await SosRequest.find(filter)
    // Nếu dùng $near, MongoDB sẽ tự sort theo khoảng cách. Nếu không thì sort theo thời gian tạo mới nhất.
    .sort(query.lng ? {} : { createdAt: -1 })
    .populate('citizenId', 'fullName phone avatarUrl');
};

const getSosRequestById = async (id) => {
  const sos = await SosRequest.findById(id)
    .populate('citizenId', 'fullName phone avatarUrl')
    .populate('areaId', 'name');
    
  if (!sos) {
    throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');
  }
  return sos;
};

const updateSosRequest = async (id, updateData, userId) => {
  const sos = await getSosRequestById(id);
  
  // Bỏ qua update trạng thái ở đây để dùng hàm changeStatus riêng,
  // chỉ cập nhật các thông tin cơ bản
  const allowedUpdates = ['location', 'address', 'emergencyType', 'priority', 'people', 'description'];
  
  let isModified = false;
  allowedUpdates.forEach(field => {
    if (updateData[field] !== undefined) {
      sos[field] = updateData[field];
      isModified = true;
    }
  });

  if (isModified) {
    await sos.save();
  }
  return sos;
};

const changeStatus = async (id, newStatus, changedBy, note = '') => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  const oldStatus = sos.status;
  
  if (oldStatus === newStatus) return sos;

  sos.status = newStatus;
  await sos.save(); // resolvedAt auto updated via pre-save middleware in model

  await SosStatusHistory.create({
    sosId: sos._id,
    oldStatus,
    newStatus,
    changedBy,
    note
  });

  return sos;
};

const getSosHistory = async (id) => {
  return await SosStatusHistory.find({ sosId: id })
    .sort({ createdAt: -1 })
    .populate('changedBy', 'fullName roles');
};

const verifyAndClassifySos = async (id, verifyData, authorityId) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  const { priority, emergencyType, note } = verifyData;
  const oldStatus = sos.status;

  if (oldStatus !== 'PENDING') {
    throw new ApiError(400, 'Chỉ có thể xác minh SOS đang ở trạng thái PENDING');
  }

  sos.status = 'VERIFIED';
  if (priority) sos.priority = priority;
  if (emergencyType) sos.emergencyType = emergencyType;
  
  await sos.save();

  await SosStatusHistory.create({
    sosId: sos._id,
    oldStatus,
    newStatus: 'VERIFIED',
    changedBy: authorityId,
    note: note || 'Local Authority đã xác minh tình huống khẩn cấp'
  });

  return sos;
};

module.exports = {
  createSosRequest,
  getSosRequests,
  getSosRequestById,
  updateSosRequest,
  changeStatus,
  getSosHistory,
  verifyAndClassifySos
};

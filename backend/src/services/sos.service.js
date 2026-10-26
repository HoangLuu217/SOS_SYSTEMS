const mongoose = require('mongoose');
const { SosRequest, SosStatusHistory, AdministrativeArea, SosAssignment } = require('../models');
const ApiError = require('../utils/apiError');

/**
 * Tự động phân giải khu vực hành chính (AdministrativeArea) dựa vào địa chỉ & tọa độ
 */
const resolveAdministrativeArea = async (address, location, inputAreaId) => {
  if (inputAreaId && mongoose.Types.ObjectId.isValid(inputAreaId) && String(inputAreaId) !== '650c1f1e1c9d440000a1b1c1') {
    const existing = await AdministrativeArea.findById(inputAreaId);
    if (existing) return existing._id;
  }

  const addressStr = String(address || '').toLowerCase();
  const allAreas = await AdministrativeArea.find({ status: 'ACTIVE' });

  // 1. Khớp theo cấp hành chính chi tiết nhất trước (WARD -> DISTRICT -> PROVINCE), tên dài trước
  const typeWeight = { WARD: 3, DISTRICT: 2, PROVINCE: 1 };
  const sortedAreas = [...allAreas].sort((a, b) => {
    const weightDiff = (typeWeight[b.type] || 0) - (typeWeight[a.type] || 0);
    if (weightDiff !== 0) return weightDiff;
    return (b.name?.length || 0) - (a.name?.length || 0);
  });

  for (const a of sortedAreas) {
    if (!a.name || a.type === 'PROVINCE') continue; // Bỏ qua Province ở bước so khớp chi tiết
    const cleanName = a.name
      .toLowerCase()
      .replace(/^(phường|xã|quận|huyện|thị trấn|thị xã|tp\.|thành phố)\s+/i, '')
      .trim();
    if (cleanName.length >= 3 && addressStr.includes(cleanName)) {
      return a._id;
    }
  }

  // 2. Fallback: Khu vực hoạt động đầu tiên trong CSDL
  const defaultAny = await AdministrativeArea.findOne({ status: 'ACTIVE' });
  return defaultAny ? defaultAny._id : null;
};

const calculateDistanceMeters = (coord1, coord2) => {
  if (!coord1 || !coord2 || !Array.isArray(coord1) || !Array.isArray(coord2)) return 999999;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371e3; // bán kính Trái Đất (mét)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const createSosRequest = async (citizenId, sosData) => {
  // Extract fields matching citizen mobile app form
  const { location, areaId, address, emergencyType, emergencyTypes, priority, people, description, images, imageUrl, contactPhone, secondaryPhone, priorityGroups } = sosData;

  const normalizedEmergencyTypes = Array.isArray(emergencyTypes) && emergencyTypes.length > 0
    ? emergencyTypes
    : (emergencyType ? [emergencyType] : ['FLOOD']);
  const primaryEmergencyType = normalizedEmergencyTypes[0] || emergencyType || 'FLOOD';

  const normalizedImages = Array.isArray(images)
    ? images
    : imageUrl
    ? [imageUrl]
    : [];

  // 1. Kiểm tra toàn bộ các ca SOS đang hoạt động (ACTIVE) của tài khoản này
  const activeStatuses = ['PENDING', 'VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'];
  const activeSosList = await SosRequest.find({
    citizenId,
    status: { $in: activeStatuses }
  }).sort({ createdAt: -1 });

  // Kiểm tra xem vị trí mới có nằm trong bán kính < 50m của BẤT KỲ ca active nào không
  let matchingMergeSos = null;
  if (location?.coordinates && activeSosList.length > 0) {
    for (const sos of activeSosList) {
      if (sos.location?.coordinates) {
        const dist = calculateDistanceMeters(sos.location.coordinates, location.coordinates);
        if (dist < 50) {
          matchingMergeSos = sos;
          break;
        }
      }
    }
  }

  // TRƯỜNG HỢP A: Vị trí mới nằm trong bán kính < 50m của 1 ca đang xử lý của tài khoản này
  // -> CHẶN gửi mới, yêu cầu người dùng vào Cập nhật ca đã có để tránh spam và chồng chéo
  if (matchingMergeSos) {
    throw new ApiError(
      400,
      `Bạn đã gửi 1 yêu cầu cứu nạn (${matchingMergeSos.sosCode || 'đang mở'}) ở gần vị trí này trước đó. Làm ơn hãy đến mục Cập nhật để bổ sung thông tin tín hiệu của bạn thay vì gửi mới!`,
      'NEARBY_ACTIVE_SOS_EXISTS',
      {
        existingSosId: matchingMergeSos._id,
        existingSosCode: matchingMergeSos.sosCode,
        address: matchingMergeSos.address,
      }
    );
  }

  // TRƯỜNG HỢP B: Ngoài phạm vi 50m (ví dụ di chuyển hoặc báo hộ người thân ở địa điểm khác)
  // Giới hạn an toàn: Mỗi tài khoản chỉ được phép có tối đa 3 ca cứu nạn đang hoạt động cùng lúc (đến lần thứ 4 thì chặn)
  const MAX_ACTIVE_SOS_PER_USER = 3;
  if (activeSosList.length >= MAX_ACTIVE_SOS_PER_USER) {
    throw new ApiError(
      400,
      `Mỗi tài khoản chỉ được phép gửi tối đa ${MAX_ACTIVE_SOS_PER_USER} yêu cầu cứu nạn đang hoạt động cùng lúc để đảm bảo nguồn lực điều phối. Vui lòng theo dõi hoặc hủy các ca trước đó nếu đã an toàn!`,
      'MAX_ACTIVE_SOS_LIMIT_REACHED',
      {
        activeCount: activeSosList.length,
        maxLimit: MAX_ACTIVE_SOS_PER_USER,
        activeSosList: activeSosList.map((s) => ({
          _id: s._id,
          sosCode: s.sosCode,
          address: s.address,
          status: s.status,
          createdAt: s.createdAt,
        })),
        existingSosId: activeSosList[0]?._id,
        existingSosCode: activeSosList[0]?.sosCode,
      }
    );
  }

  // Tự động gán đúng khu vực hành chính dựa trên địa chỉ GPS thực tế
  const assignedAreaId = await resolveAdministrativeArea(address, location, areaId);

  // TRƯỜNG HỢP B: Tạo ca mới bình thường (hoặc ca Báo hộ bạn bè ở địa điểm khác >= 50m)
  const isSecondary = activeSosList.length > 0;
  const newSos = await SosRequest.create({
    citizenId,
    location,
    areaId: assignedAreaId,
    address: address || 'Khu vực cứu nạn (Định vị GPS)',
    emergencyType: primaryEmergencyType,
    emergencyTypes: normalizedEmergencyTypes,
    priority: priority || 'HIGH',
    people: people ? Number(people) : 1,
    description: description ? description.replace(/⚡\s*/g, '').trim() : null,
    contactPhone: contactPhone || null,
    secondaryPhone: secondaryPhone ? secondaryPhone.trim() : null,
    priorityGroups: Array.isArray(priorityGroups) ? priorityGroups : [],
    images: normalizedImages,
    status: 'PENDING',
    repeatCount: 1,
    isSecondaryRequest: isSecondary,
    primarySosId: isSecondary ? activeSosList[0]._id : null,
  });

  // Tạo history cho trạng thái khởi tạo
  await SosStatusHistory.create({
    sosId: newSos._id,
    oldStatus: null,
    newStatus: 'PENDING',
    changedBy: citizenId,
    note: isSecondary
      ? `Tạo ca cứu nạn phụ / báo hộ bạn bè (Tài khoản đang có ca khác)`
      : 'Tạo yêu cầu cứu nạn mới',
  });

  const populatedSos = await SosRequest.findById(newSos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  return populatedSos || newSos;
};

const getSosRequests = async (query = {}) => {
  const filter = {};
  if (query.citizenId) filter.citizenId = query.citizenId;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.emergencyType) filter.emergencyType = query.emergencyType;
  if (query._id) filter._id = query._id;
  if (query.$or) filter.$or = query.$or;

  // Lọc theo khu vực hành chính: Hỗ trợ phân cấp (Quận -> Các Phường trực thuộc)
  if (query.areaId && query.areaId !== 'ALL') {
    if (mongoose.Types.ObjectId.isValid(query.areaId)) {
      const childAreas = await AdministrativeArea.find({ parentId: query.areaId }).select('_id');
      if (childAreas && childAreas.length > 0) {
        filter.areaId = { $in: [query.areaId, ...childAreas.map(c => c._id)] };
      } else {
        filter.areaId = query.areaId;
      }
    } else {
      filter.areaId = query.areaId;
    }
  }

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

  const sosList = await SosRequest.find(filter)
    // Nếu dùng $near, MongoDB sẽ tự sort theo khoảng cách. Nếu không thì sort theo thời gian tạo mới nhất.
    .sort(query.lng ? {} : { createdAt: -1 })
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code')
    .lean();

  if (sosList.length > 0) {
    const sosIds = sosList.map(s => s._id);
    const assignments = await SosAssignment.find({
      sosRequestId: { $in: sosIds },
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    })
      .populate('rescueTeamId', 'name type areaId status')
      .populate('rescuerId', 'fullName phone roles')
      .populate('vehicleId', 'plateNumber type capacity')
      .populate('authorityOrganizationId', 'name code')
      .lean();

    const assignmentMap = new Map();
    assignments.forEach(a => {
      assignmentMap.set(a.sosRequestId.toString(), a);
    });

    sosList.forEach(s => {
      const a = assignmentMap.get(s._id.toString());
      if (a) {
        s.assignmentId = a._id;
        s.assignment = a;
      }
    });
  }

  return sosList;
};

const getSosRequestById = async (id) => {
  const sos = await SosRequest.findById(id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');
    
  if (!sos) {
    throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');
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

const updateSosRequest = async (id, updateData, userId) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  if (sos.status === 'COMPLETED' || sos.status === 'CANCELLED') {
    throw new ApiError(400, 'Không thể cập nhật yêu cầu cứu nạn đã kết thúc');
  }

  const allowedFields = [
    'location',
    'address',
    'priority',
    'description',
    'people',
    'priorityGroups',
    'emergencyType',
    'emergencyTypes',
    'contactPhone',
    'secondaryPhone',
    'images',
  ];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      sos[field] = updateData[field];
    }
  }

  // Nếu cập nhật danh sách emergencyTypes, đồng bộ luôn emergencyType chính
  if (Array.isArray(updateData.emergencyTypes) && updateData.emergencyTypes.length > 0) {
    sos.emergencyType = updateData.emergencyTypes[0];
  }

  // Tự động làm sạch SĐT phụ nếu không hợp lệ
  if (sos.secondaryPhone && !/^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(sos.secondaryPhone.replace(/[\s\.\-]+/g, ''))) {
    sos.secondaryPhone = null;
  }

  await sos.save();

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  return populated || sos;
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

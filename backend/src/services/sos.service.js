const mongoose = require('mongoose');
const { SosRequest, SosStatusHistory, AdministrativeArea, SosAssignment, Vehicle } = require('../models');
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
      // Nếu areaId là chuỗi mã/slug (như area-nhs, DAD-NHS,...), tìm area tương ứng trong CSDL
      const cleanKey = String(query.areaId).replace(/^area-/, '');
      const matchedArea = await AdministrativeArea.findOne({
        $or: [
          { code: new RegExp(`^${cleanKey}$`, 'i') },
          { name: new RegExp(cleanKey, 'i') },
        ],
      });
      if (matchedArea) {
        const childAreas = await AdministrativeArea.find({ parentId: matchedArea._id }).select('_id');
        if (childAreas && childAreas.length > 0) {
          filter.areaId = { $in: [matchedArea._id, ...childAreas.map(c => c._id)] };
        } else {
          filter.areaId = matchedArea._id;
        }
      }
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
      $or: [
        { sosRequestId: { $in: sosIds } },
        { sosId: { $in: sosIds } },
      ],
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    })
      .populate('rescueTeamId', 'name type areaId status')
      .populate('rescuerId', 'fullName phone roles')
      .populate('vehicleId', 'plateNumber type capacity')
      .populate('authorityOrganizationId', 'name code')
      .lean();

    const assignmentMap = new Map();
    assignments.forEach(a => {
      const targetId = (a.sosRequestId || a.sosId)?.toString();
      if (targetId) {
        assignmentMap.set(targetId, a);
      }
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
    .populate('areaId', 'name code')
    .lean();
    
  if (!sos) {
    throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');
  }

  const assignment = await SosAssignment.findOne({
    $or: [{ sosRequestId: id }, { sosId: id }],
    status: { $nin: ['CANCELLED', 'REJECTED'] },
  })
    .populate('rescueTeamId', 'name type areaId status')
    .populate('rescuerId', 'fullName phone roles')
    .populate('vehicleId', 'plateNumber type capacity')
    .populate('authorityOrganizationId', 'name code')
    .lean();

  if (assignment) {
    sos.assignmentId = assignment._id;
    sos.assignment = assignment;
  }

  return sos;
};


const changeStatus = async (id, newStatus, changedBy, note = '') => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  const oldStatus = sos.status;
  
  if (oldStatus === newStatus) return sos;

  const updateFields = { status: newStatus };
  if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(newStatus)) {
    updateFields.resolvedAt = new Date();
    if (sos.shoreHandoff?.assignedVehicleId && mongoose.isValidObjectId(sos.shoreHandoff.assignedVehicleId)) {
      await Vehicle.findByIdAndUpdate(sos.shoreHandoff.assignedVehicleId, { status: 'AVAILABLE' });
    }

    // Tự động đóng tất cả các phân công của ca SOS này để giải phóng trạng thái bận cho các đội
    try {
      const targetAssignStatus = newStatus === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
      await SosAssignment.updateMany(
        {
          $or: [{ sosRequestId: id }, { sosId: id }],
          status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        },
        {
          $set: {
            status: targetAssignStatus,
            ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : { cancelledAt: new Date() }),
          },
        }
      );
    } catch (assignSyncErr) {
      console.warn('Sync assign status on SOS status change error:', assignSyncErr);
    }
  }
  // Cập nhật trạng thái không re-validate các trường dữ liệu test cũ (tránh lỗi 0123456789)
  await SosRequest.updateOne({ _id: id }, { $set: updateFields });
  sos.status = newStatus;
  if (updateFields.resolvedAt) sos.resolvedAt = updateFields.resolvedAt;

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
  if (sos.secondaryPhone && !/^(\+?\d{7,15})$/.test(sos.secondaryPhone.replace(/[\s\.\-]+/g, ''))) {
    sos.secondaryPhone = null;
  }

  await sos.save();

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  return populated || sos;
};


const deleteSos = async (id, user) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  const isAdmin = user.roles?.includes('ADMIN');
  const isAuthority = user.roles?.includes('LOCAL_AUTHORITY');
  const isOwner = sos.citizenId && sos.citizenId.toString() === user._id.toString();

  // Chỉ cho phép xóa nếu:
  // 1. Quản trị viên (ADMIN)
  // 2. Cán bộ địa phương (LOCAL_AUTHORITY)
  // 3. Người dân là chủ sở hữu VÀ ca đã ở trạng thái CANCELLED hoặc COMPLETED
  if (!isAdmin && !isAuthority) {
    if (!isOwner) {
      throw new ApiError(403, 'Bạn không có quyền xóa yêu cầu SOS này');
    }
    if (!['CANCELLED', 'COMPLETED', 'REJECTED'].includes(sos.status)) {
      throw new ApiError(400, 'Chỉ có thể xóa các yêu cầu SOS đã hủy hoặc đã hoàn thành khỏi lịch sử');
    }
  }

  // Xóa các phân công nhiệm vụ và lịch sử liên quan
  await SosAssignment.deleteMany({
    $or: [{ sosRequestId: id }, { sosId: id }],
  });
  await SosStatusHistory.deleteMany({ sosId: id });
  await SosRequest.deleteOne({ _id: id });

  return sos;
};

const clearCancelledSos = async (user) => {
  const isAdmin = user.roles?.includes('ADMIN');
  const isAuthority = user.roles?.includes('LOCAL_AUTHORITY');

  if (!isAdmin && !isAuthority) {
    throw new ApiError(403, 'Chỉ cán bộ hoặc quản trị viên mới có quyền dọn dẹp các ca đã hủy');
  }

  const query = { status: 'CANCELLED' };
  if (isAuthority && !isAdmin && user.authority?.areaId) {
    query.areaId = user.authority.areaId;
  }

  const cancelledList = await SosRequest.find(query).select('_id');
  const ids = cancelledList.map((s) => s._id);

  if (ids.length > 0) {
    await SosAssignment.deleteMany({
      $or: [{ sosRequestId: { $in: ids } }, { sosId: { $in: ids } }],
    });
    await SosStatusHistory.deleteMany({ sosId: { $in: ids } });
    await SosRequest.deleteMany({ _id: { $in: ids } });
  }

  return { deletedCount: ids.length, deletedIds: ids };
};

/**
 * Đội cứu hộ (Ca-nô) gửi yêu cầu xe đường bộ đón nạn nhân tại bến cập bờ
 */
const requestShoreHandoff = async (id, data, user) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  // Đảm bảo ca cứu hộ đang hoạt động nếu trước đó từng bị đánh dấu hoàn thành
  if (['COMPLETED', 'RESOLVED', 'CANCELLED'].includes(sos.status)) {
    sos.status = 'ARRIVED';
    sos.resolvedAt = null;
  }

  sos.shoreHandoff = {
    status: 'REQUESTED',
    requestedAt: new Date(),
    requestedByRescuerName: user?.fullName || data.requestedByRescuerName || null,
    rescueTeamName: data.rescueTeamName || null,
    rescueTeamId: data.rescueTeamId || null,
    landingPoint: {
      name: data.landingPoint?.name || 'Bến Cập Bờ',
      address: data.landingPoint?.address || null,
      coordinates: data.landingPoint?.coordinates || (sos.location?.coordinates ? [sos.location.coordinates[0], sos.location.coordinates[1]] : null),
    },
    vehicleTypeNeeded: data.vehicleTypeNeeded || 'AMBULANCE',
    peopleCount: data.peopleCount || sos.people || 1,
    notes: data.notes || '',
    assignedVehicleId: null,
    assignedVehicleName: null,
    assignedVehiclePlate: null,
    assignedRoadTeamName: null,
    assignedDriverName: null,
    assignedDriverPhone: null,
    assignedAt: null,
    completedAt: null,
  };

  await sos.save();

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  return populated || sos;
};

/**
 * Ban chỉ huy điều phối xe đường bộ (Xe cấp cứu / Xe tải) đến bến đón
 */
const assignShoreHandoff = async (id, data, _user) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  if (!sos.shoreHandoff) {
    sos.shoreHandoff = { status: 'REQUESTED', requestedAt: new Date() };
  }

  // Tra cứu phương tiện thật từ CSDL nếu có vehicleId hợp lệ
  let vehicle = null;
  if (data.vehicleId && mongoose.isValidObjectId(data.vehicleId)) {
    vehicle = await Vehicle.findById(data.vehicleId).populate({
      path: 'teamId',
      populate: [
        { path: 'leaderId', select: 'fullName phone avatarUrl' },
        { path: 'members.rescuerId', select: 'fullName phone avatarUrl' },
      ],
    });
  }

  // Kiểm tra xem xe này có đang bận đón bờ cho ca SOS khác đang hoạt động hay không
  const checkConditions = [];
  if (vehicle?._id) checkConditions.push({ 'shoreHandoff.assignedVehicleId': vehicle._id });
  if (data.vehicleId && mongoose.isValidObjectId(data.vehicleId)) {
    checkConditions.push({ 'shoreHandoff.assignedVehicleId': data.vehicleId });
  }
  if (vehicle?.plateNumber) checkConditions.push({ 'shoreHandoff.assignedVehiclePlate': vehicle.plateNumber });
  if (data.vehiclePlate && String(data.vehiclePlate).trim()) {
    checkConditions.push({ 'shoreHandoff.assignedVehiclePlate': String(data.vehiclePlate).trim() });
  }

  if (checkConditions.length > 0) {
    const busySos = await SosRequest.findOne({
      _id: { $ne: sos._id },
      status: { $nin: ['COMPLETED', 'CANCELLED', 'RESOLVED', 'REJECTED'] },
      'shoreHandoff.status': 'ASSIGNED',
      $or: checkConditions,
    });

    if (busySos) {
      const busyCode = busySos.sosCode || busySos._id;
      throw new ApiError(
        400,
        `Phương tiện này hiện đang bận đón bờ cho nhiệm vụ #${busyCode}. Vui lòng chờ xe hoàn thành hoặc chọn xe khác!`
      );
    }
  }

  const typeLabel = vehicle
    ? (vehicle.type === 'AMBULANCE' ? 'Xe Cứu Thương Dã Chiến 115'
      : vehicle.type === 'TRUCK' ? 'Xe Tải Cứu Hộ Dã Chiến'
      : vehicle.type === 'BOAT' ? 'Ca-nô Cứu Sinh'
      : vehicle.type === 'MOTORBIKE' ? 'Mô-tô Cứu Hộ'
      : 'Xe Cứu Hộ')
    : (data.vehicleName ? (data.vehicleName.length > 40 ? data.vehicleName.substring(0, 40) + '...' : data.vehicleName) : 'Xe Cứu Thương 115');

  // Đánh dấu phương tiện đang bận (IN_USE)
  if (vehicle) {
    vehicle.status = 'IN_USE';
    await vehicle.save();
  } else if (data.vehicleId && mongoose.isValidObjectId(data.vehicleId)) {
    await Vehicle.findByIdAndUpdate(data.vehicleId, { status: 'IN_USE' });
  }

  sos.shoreHandoff.status = 'ASSIGNED';
  sos.shoreHandoff.assignedVehicleId = vehicle?._id || data.vehicleId || null;
  sos.shoreHandoff.assignedVehicleName = typeLabel;
  sos.shoreHandoff.assignedVehiclePlate = vehicle?.plateNumber || data.vehiclePlate || null;
  sos.shoreHandoff.assignedRoadTeamName = vehicle?.teamId?.name || data.roadTeamName || null;
  sos.shoreHandoff.assignedDriverName = vehicle?.teamId?.leaderId?.fullName || data.driverName || null;
  sos.shoreHandoff.assignedDriverPhone = vehicle?.teamId?.leaderId?.phone || data.driverPhone || null;
  sos.shoreHandoff.assignedAt = new Date();

  await sos.save();

  // Phân bổ hoặc cập nhật SosAssignment cho đội xe đón bờ để hiển thị trên App Cứu Hộ Viên
  const teamId = vehicle?.teamId?._id || vehicle?.teamId;
  const rescuerId =
    vehicle?.teamId?.leaderId?._id ||
    vehicle?.teamId?.leaderId ||
    vehicle?.teamId?.members?.[0]?.rescuerId?._id ||
    vehicle?.teamId?.members?.[0]?.rescuerId ||
    _user?._id;

  let handoffAssignment = null;
  if (teamId && rescuerId) {
    const destinationText =
      sos.shoreHandoff.landingPoint?.name ||
      sos.shoreHandoff.landingPoint?.address ||
      'Bến cập bờ chỉ định';

    handoffAssignment = await SosAssignment.findOne({
      $or: [{ sosRequestId: sos._id }, { sosId: sos._id }],
      missionType: 'SHORE_HANDOFF',
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
    });

    const missionNote = `Điều xe đón bờ: ${typeLabel} (${vehicle?.plateNumber || data.vehiclePlate || 'Xe tiếp vận'}) tiếp nhận nạn nhân tại ${destinationText}`;

    if (handoffAssignment) {
      handoffAssignment.rescueTeamId = teamId;
      handoffAssignment.teamId = teamId;
      handoffAssignment.rescuerId = rescuerId;
      handoffAssignment.vehicleId = vehicle?._id || data.vehicleId || null;
      handoffAssignment.status = 'PENDING';
      handoffAssignment.destination = destinationText;
      handoffAssignment.assignedBy = _user?._id || null;
      handoffAssignment.priority = sos.priority || 'HIGH';
      handoffAssignment.note = missionNote;
      await handoffAssignment.save();
    } else {
      handoffAssignment = await SosAssignment.create({
        sosRequestId: sos._id,
        sosId: sos._id,
        authorityOrganizationId: vehicle?.teamId?.authorityId || null,
        rescueTeamId: teamId,
        teamId: teamId,
        rescuerId: rescuerId,
        vehicleId: vehicle?._id || data.vehicleId || null,
        missionType: 'SHORE_HANDOFF',
        destination: destinationText,
        recipientName: sos.citizenId?.fullName || 'Nạn nhân chuyển tuyến y tế',
        assignedBy: _user?._id || null,
        priority: sos.priority || 'HIGH',
        status: 'PENDING',
        note: missionNote,
      });
    }

    // Xác định danh sách cán bộ chiến sĩ đội xe tiếp vận nhận lệnh
    const targetUserIds = new Set();
    if (rescuerId) targetUserIds.add(rescuerId.toString());
    (vehicle?.teamId?.members || []).forEach((m) => {
      const uid = m.rescuerId?._id || m.rescuerId;
      if (uid) targetUserIds.add(uid.toString());
    });

    // Phát Realtime Socket.IO cho app của Đội xe cứu thương / Cứu hộ viên tiếp vận
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        const populatedAssignment = await SosAssignment.findById(handoffAssignment._id)
          .populate({
            path: 'sosRequestId',
            populate: [
              { path: 'citizenId', select: '_id fullName phone email avatarUrl address' },
              { path: 'areaId', select: '_id name code' },
            ],
          })
          .populate('vehicleId', 'plateNumber type capacity status')
          .populate('rescueTeamId', 'name type leaderId phone');

        const assignPayload = populatedAssignment ? populatedAssignment.toObject() : (handoffAssignment.toObject ? handoffAssignment.toObject() : { ...handoffAssignment });
        assignPayload.targetUserIds = Array.from(targetUserIds);

        io.emit('assignment:created', assignPayload);
        io.emit('assignment:new', assignPayload);
        io.emit('sos:sync');
        for (const uid of targetUserIds) {
          io.to(`user_${uid}`).emit('assignment:assigned', assignPayload);
          io.to(`user_${uid}`).emit('sos:sync');
        }
      }
    } catch (socketErr) {
      console.warn('Socket emit error for shore handoff:', socketErr?.message);
    }

    // Gửi thông báo Notification trong hệ thống
    try {
      const { Notification } = require('../models');

      for (const uid of targetUserIds) {
        await Notification.create({
          userId: uid,
          createdBy: _user?._id || null,
          areaId: sos.areaId || null,
          sosId: sos._id,
          type: 'ALERT',
          title: `🚑 ĐIỀU ĐỘNG XE TIẾP VẬN ĐÓN BỜ: #${sos.sosCode || sos._id.toString().slice(-4)}`,
          content: `Ban chỉ huy điều xe ${vehicle?.plateNumber || ''} đến ${destinationText} tiếp nhận bàn giao nạn nhân!`,
          priority: 'CRITICAL',
          data: {
            type: 'SOS_SYNC',
            action: 'ASSIGNED',
            assignmentId: handoffAssignment._id,
            sosId: sos._id,
          },
        });
      }
    } catch (notifErr) {
      console.warn('Notification error for shore handoff:', notifErr?.message);
    }
  }

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  // Phát Realtime sos:updated để các client (kể cả đội cano) cập nhật thông tin xe đón bờ
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('sos:updated', populated || sos);
    }
  } catch (_) {}

  return populated || sos;
};

/**
 * Hủy điều xe đón bờ, đưa trạng thái về REQUESTED để trực ban chọn/phân công lại
 */
const cancelShoreHandoff = async (id, _user) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  if (sos.shoreHandoff) {
    const prevVehicleId = sos.shoreHandoff.assignedVehicleId;
    if (prevVehicleId && mongoose.isValidObjectId(prevVehicleId)) {
      await Vehicle.findByIdAndUpdate(prevVehicleId, { status: 'AVAILABLE' });
    }
    sos.shoreHandoff.status = 'REQUESTED';
    sos.shoreHandoff.assignedVehicleId = null;
    sos.shoreHandoff.assignedVehicleName = null;
    sos.shoreHandoff.assignedVehiclePlate = null;
    sos.shoreHandoff.assignedRoadTeamName = null;
    sos.shoreHandoff.assignedDriverName = null;
    sos.shoreHandoff.assignedDriverPhone = null;
    sos.shoreHandoff.assignedAt = null;
    sos.shoreHandoff.completedAt = null;
    await sos.save();

    // Hủy phân công nhiệm vụ đón bờ của đội xe
    try {
      const handoffAssignment = await SosAssignment.findOne({
        $or: [{ sosRequestId: sos._id }, { sosId: sos._id }],
        missionType: 'SHORE_HANDOFF',
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
      });
      if (handoffAssignment) {
        handoffAssignment.status = 'CANCELLED';
        handoffAssignment.note = (handoffAssignment.note || '') + ' [Ban chỉ huy đã hủy điều xe đón bờ]';
        await handoffAssignment.save();

        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
          io.emit('assignment:updated', handoffAssignment);
          io.emit('assignment:cancelled', handoffAssignment);
        }
      }
    } catch (assignErr) {
      console.warn('Error cancelling handoff assignment:', assignErr?.message);
    }
  }

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('sos:updated', populated || sos);
    }
  } catch (_) {}

  return populated || sos;
};

/**
 * Hoàn thành bàn giao nạn nhân tại bờ cho xe đường bộ
 */
const completeShoreHandoff = async (id, _user) => {
  const sos = await SosRequest.findById(id);
  if (!sos) throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');

  if (sos.shoreHandoff) {
    const prevVehicleId = sos.shoreHandoff.assignedVehicleId;
    if (prevVehicleId && mongoose.isValidObjectId(prevVehicleId)) {
      await Vehicle.findByIdAndUpdate(prevVehicleId, { status: 'AVAILABLE' });
    }
    sos.shoreHandoff.status = 'COMPLETED';
    sos.shoreHandoff.completedAt = new Date();
    await sos.save();

    // Cập nhật hoàn thành nhiệm vụ đón bờ của xe
    try {
      const handoffAssignment = await SosAssignment.findOne({
        $or: [{ sosRequestId: sos._id }, { sosId: sos._id }],
        missionType: 'SHORE_HANDOFF',
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
      });
      if (handoffAssignment) {
        handoffAssignment.status = 'COMPLETED';
        handoffAssignment.completedAt = new Date();
        await handoffAssignment.save();

        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
          io.emit('assignment:updated', handoffAssignment);
          io.emit('assignment:completed', handoffAssignment);
        }
      }
    } catch (assignErr) {
      console.warn('Error completing handoff assignment:', assignErr?.message);
    }
  }

  const populated = await SosRequest.findById(sos._id)
    .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
    .populate('areaId', 'name code');

  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('sos:updated', populated || sos);
    }
  } catch (_) {}

  return populated || sos;

};

module.exports = {
  createSosRequest,
  getSosRequests,
  getSosRequestById,
  updateSosRequest,
  changeStatus,
  getSosHistory,
  verifyAndClassifySos,

  requestShoreHandoff,
  assignShoreHandoff,
  cancelShoreHandoff,
  completeShoreHandoff,


  deleteSos,
  clearCancelledSos,

};

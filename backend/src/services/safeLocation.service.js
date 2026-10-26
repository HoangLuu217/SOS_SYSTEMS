const mongoose = require('mongoose');
const { SafeLocation, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');
const { findAreaByCoordinates, checkPointInAuthorityJurisdiction } = require('../utils/geoUtils');

class SafeLocationService {
  /**
   * Tạo địa điểm an toàn mới
   * Bắt buộc có tọa độ GPS hợp lệ và thuộc khu vực quản lý đối với Cán bộ địa phương
   */
  async createSafeLocation(data, actorId, creatorUser = null) {
    const { name, type, location, areaId, address, capacity, currentOccupancy, status } = data;

    if (!name || !String(name).trim()) {
      throw new ApiError(400, 'Tên địa điểm an toàn là bắt buộc');
    }

    // Bắt buộc phải có tọa độ GPS
    if (
      !location ||
      !location.coordinates ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      throw new ApiError(400, 'Tọa độ GPS [lng, lat] là bắt buộc đối với điểm an toàn.');
    }

    const [lng, lat] = location.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new ApiError(400, 'Tọa độ GPS kinh độ (-180..180) hoặc vĩ độ (-90..90) không hợp lệ');
    }

    // 1. Tự động xác định khu vực hành chính (areaId) chính xác qua tọa độ GPS
    let area = await findAreaByCoordinates([lng, lat], AdministrativeArea);

    // 2. Fallback nếu GPS chưa trúng ranh giới polygon cụ thể
    if (!area && areaId && mongoose.isValidObjectId(areaId)) {
      area = await AdministrativeArea.findById(areaId);
    }
    if (!area && areaId) {
      const cleanAreaId = String(areaId).replace(/^PROV_/i, '').trim();
      const codeCandidate = cleanAreaId.replace(/^area-/i, '').toUpperCase();
      area = await AdministrativeArea.findOne({
        $or: [
          { code: cleanAreaId },
          { code: codeCandidate },
          { name: new RegExp(cleanAreaId, 'i') },
        ],
      });
      if (!area && !cleanAreaId.startsWith('area-')) {
        try {
          area = await AdministrativeArea.create({
            name: cleanAreaId,
            code: cleanAreaId.toUpperCase().replace(/^(TỈNH|THÀNH PHỐ|TP\.?)\s+/i, '').replace(/\s+/g, '_'),
            type: 'PROVINCE',
          });
        } catch (_) {}
      }
    }
    if (!area && address) {
      const addressStr = String(address || '').toLowerCase();
      const allAreas = await AdministrativeArea.find({ status: 'ACTIVE' });
      const matched = allAreas.find((a) => {
        if (!a.name) return false;
        const cleanName = a.name.toLowerCase().replace(/^(phường|quận|huyện|xã|thành phố|tỉnh)\s+/i, '').trim();
        return cleanName.length > 2 && addressStr.includes(cleanName);
      });
      if (matched) area = matched;
    }
    if (!area) {
      area = await AdministrativeArea.findOne({ code: 'DANANG' }) || await AdministrativeArea.findOne();
    }
    if (!area) {
      area = await AdministrativeArea.create({
        name: 'Khu vực quản lý chung',
        code: 'DEFAULT_AREA',
        type: 'PROVINCE',
      });
    }

    // Kiểm tra thẩm quyền địa bàn: LOCAL_AUTHORITY chỉ được tạo điểm an toàn có GPS trong khu vực quản lý
    if (creatorUser) {
      const userRoles = creatorUser.roles || [];
      const isLocalAuth = userRoles.includes('LOCAL_AUTHORITY') && !userRoles.includes('ADMIN');
      if (isLocalAuth) {
        const jurisdictionCheck = await checkPointInAuthorityJurisdiction(
          { coordinates: [lng, lat], areaId: area?._id, address },
          creatorUser,
          AdministrativeArea
        );
        if (!jurisdictionCheck.allowed) {
          throw new ApiError(
            403,
            `Bạn chỉ có quyền tạo điểm an toàn có GPS trong khu vực quản lý của mình (${jurisdictionCheck.authAreaName || 'Địa bàn được phân công'}). Tọa độ GPS đã chọn nằm ngoài khu vực quản lý!`
          );
        }
      }
    }

    const safeLocation = await SafeLocation.create({
      name: String(name).trim(),
      type: type || 'SHELTER',
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      areaId: area._id,
      address: address ? String(address).trim() : '',
      capacity: capacity ?? 0,
      currentOccupancy: currentOccupancy ?? 0,
      status: status || 'ACTIVE',
      createdBy: actorId,
    });

    return safeLocation.populate([
      { path: 'areaId', select: 'name code type' },
      { path: 'createdBy', select: 'fullName phone email' },
    ]);
  }

  /**
   * Lấy danh sách địa điểm an toàn (lọc & phân trang)
   */
  async getSafeLocations(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = query.all === 'true' ? 500 : Math.min(200, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.areaId) filter.areaId = query.areaId;
    if (query.search) {
      filter.name = { $regex: query.search.trim(), $options: 'i' };
    }

    const [safeLocations, total] = await Promise.all([
      SafeLocation.find(filter)
        .populate('areaId', 'name code type')
        .populate('createdBy', 'fullName phone email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SafeLocation.countDocuments(filter),
    ]);

    return {
      safeLocations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Tìm địa điểm an toàn gần nhất theo tọa độ
   */
  async getNearbySafeLocations(query = {}) {
    const { lng, lat, maxDistance = 10000, limit = 10, type, status } = query;

    if (!lng || !lat) {
      throw new ApiError(400, 'Thiếu tọa độ tìm kiếm: lng (kinh độ) và lat (vĩ độ) là bắt buộc');
    }

    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);

    if (isNaN(longitude) || isNaN(latitude)) {
      throw new ApiError(400, 'Tọa độ lng, lat phải là số hợp lệ');
    }

    const geoFilter = {
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: parseInt(maxDistance, 10),
        },
      },
    };

    if (type) geoFilter.type = type;
    if (status) geoFilter.status = status;
    else geoFilter.status = { $in: ['ACTIVE', 'FULL'] }; // mặc định chỉ hiện active/full

    const safeLocations = await SafeLocation.find(geoFilter)
      .populate('areaId', 'name code type')
      .populate('createdBy', 'fullName phone email')
      .limit(Math.min(50, parseInt(limit, 10)));

    return safeLocations;
  }

  /**
   * Lấy chi tiết 1 địa điểm an toàn
   */
  async getSafeLocationById(id) {
    const safeLocation = await SafeLocation.findById(id)
      .populate('areaId', 'name code type level')
      .populate('createdBy', 'fullName phone email avatarUrl');

    if (!safeLocation) {
      throw new ApiError(404, 'Không tìm thấy địa điểm an toàn này');
    }

    return safeLocation;
  }

  /**
   * Cập nhật địa điểm an toàn
   */
  async updateSafeLocation(id, updateData) {
    const safeLocation = await SafeLocation.findById(id);
    if (!safeLocation) {
      throw new ApiError(404, 'Không tìm thấy địa điểm an toàn cần cập nhật');
    }

    const updatableFields = [
      'name', 'type', 'location', 'address',
      'capacity', 'currentOccupancy', 'status',
    ];

    for (const field of updatableFields) {
      if (updateData[field] !== undefined) {
        safeLocation[field] = updateData[field];
      }
    }

    if (updateData.areaId) {
      let area = null;
      if (mongoose.isValidObjectId(updateData.areaId)) {
        area = await AdministrativeArea.findById(updateData.areaId);
      }
      if (!area) {
        area = await AdministrativeArea.findOne({
          $or: [{ code: updateData.areaId }, { name: new RegExp(updateData.areaId, 'i') }],
        });
      }
      if (area) {
        safeLocation.areaId = area._id;
      }
    }

    await safeLocation.save();

    return safeLocation.populate([
      { path: 'areaId', select: 'name code type' },
      { path: 'createdBy', select: 'fullName phone email' },
    ]);
  }

  /**
   * Xóa địa điểm an toàn
   */
  async deleteSafeLocation(id) {
    const safeLocation = await SafeLocation.findById(id);
    if (!safeLocation) {
      throw new ApiError(404, 'Không tìm thấy địa điểm an toàn cần xóa');
    }

    await SafeLocation.findByIdAndDelete(id);

    return { message: 'Đã xóa địa điểm an toàn thành công' };
  }
}

module.exports = new SafeLocationService();

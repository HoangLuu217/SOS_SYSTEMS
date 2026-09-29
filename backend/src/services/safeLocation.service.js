const { SafeLocation, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class SafeLocationService {
  /**
   * Tạo địa điểm an toàn mới
   */
  async createSafeLocation(data, actorId) {
    const { name, type, location, areaId, address, capacity, currentOccupancy, status } = data;

    // Kiểm tra khu vực hành chính
    const area = await AdministrativeArea.findById(areaId);
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy Khu vực hành chính (areaId)');
    }

    const safeLocation = await SafeLocation.create({
      name,
      type,
      location,
      areaId,
      address,
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
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
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
      const area = await AdministrativeArea.findById(updateData.areaId);
      if (!area) throw new ApiError(404, 'Khu vực hành chính mới (areaId) không tồn tại');
      safeLocation.areaId = updateData.areaId;
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

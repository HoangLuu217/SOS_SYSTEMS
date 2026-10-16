const { Vehicle, RescueTeam } = require('../models');
const ApiError = require('../utils/apiError');

class VehicleService {
  /**
   * Đăng ký phương tiện cứu hộ mới
   */
  async createVehicle(data) {
    const { teamId, type, plateNumber, capacity, status, description } = data;

    // Kiểm tra Đội cứu hộ sở hữu
    const team = await RescueTeam.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ sở hữu (teamId)');
    }

    // Kiểm tra trùng biển số
    const cleanPlateNumber = String(plateNumber).trim().toUpperCase();
    const existingVehicle = await Vehicle.findOne({ plateNumber: cleanPlateNumber });
    if (existingVehicle) {
      throw new ApiError(409, `Biển kiểm soát '${cleanPlateNumber}' đã tồn tại trong hệ thống`);
    }

    const vehicle = await Vehicle.create({
      teamId,
      type,
      plateNumber: cleanPlateNumber,
      capacity: capacity !== undefined ? Number(capacity) : 1,
      status: status || 'AVAILABLE',
      description,
    });

    return vehicle.populate('teamId', 'name type areaId status');
  }

  /**
   * Lấy danh sách phương tiện cứu hộ (kèm bộ lọc & phân trang)
   */
  async getVehicles(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.teamId) filter.teamId = query.teamId;
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.plateNumber) {
      filter.plateNumber = { $regex: query.plateNumber.trim(), $options: 'i' };
    }

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate({
          path: 'teamId',
          select: 'name type areaId status leaderId',
          populate: [
            { path: 'leaderId', select: 'fullName phone email' },
            { path: 'areaId', select: 'name code' },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Vehicle.countDocuments(filter),
    ]);

    return {
      vehicles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy chi tiết 1 phương tiện
   */
  async getVehicleById(id) {
    const vehicle = await Vehicle.findById(id).populate({
      path: 'teamId',
      select: 'name type leaderId areaId authorityId status',
      populate: [
        { path: 'leaderId', select: 'fullName phone' },
        { path: 'areaId', select: 'name code' },
      ],
    });

    if (!vehicle) {
      throw new ApiError(404, 'Không tìm thấy thông tin phương tiện');
    }

    return vehicle;
  }

  /**
   * Cập nhật thông số phương tiện
   */
  async updateVehicle(id, updateData) {
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      throw new ApiError(404, 'Không tìm thấy phương tiện cần cập nhật');
    }

    if (updateData.teamId) {
      const team = await RescueTeam.findById(updateData.teamId);
      if (!team) throw new ApiError(404, 'Đội cứu hộ mới (teamId) không tồn tại');
      vehicle.teamId = updateData.teamId;
    }

    if (updateData.plateNumber) {
      const cleanPlate = updateData.plateNumber.trim().toUpperCase();
      if (cleanPlate !== vehicle.plateNumber) {
        const existing = await Vehicle.findOne({ plateNumber: cleanPlate });
        if (existing) {
          throw new ApiError(409, `Biển số '${cleanPlate}' đã thuộc về phương tiện khác`);
        }
        vehicle.plateNumber = cleanPlate;
      }
    }

    if (updateData.type !== undefined) vehicle.type = updateData.type;
    if (updateData.capacity !== undefined) vehicle.capacity = Number(updateData.capacity);
    if (updateData.description !== undefined) vehicle.description = updateData.description;
    if (updateData.status !== undefined) vehicle.status = updateData.status;

    await vehicle.save();

    return vehicle.populate('teamId', 'name type areaId status');
  }

  /**
   * Xóa phương tiện
   */
  async deleteVehicle(id) {
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      throw new ApiError(404, 'Không tìm thấy phương tiện cần xóa');
    }

    if (vehicle.status === 'IN_USE') {
      throw new ApiError(
        400,
        'Không thể xóa phương tiện khi đang trong trạng thái hoạt động / làm nhiệm vụ (IN_USE)'
      );
    }

    await Vehicle.findByIdAndDelete(id);

    return { message: 'Đã xóa phương tiện cứu hộ thành công' };
  }

  /**
   * Cập nhật nhanh trạng thái phương tiện
   */
  async updateStatus(id, status) {
    const validStatuses = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(
        400,
        `Trạng thái '${status}' không hợp lệ. Cho phép: ${validStatuses.join(', ')}`
      );
    }

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      throw new ApiError(404, 'Không tìm thấy phương tiện');
    }

    vehicle.status = status;
    await vehicle.save();

    return vehicle.populate('teamId', 'name type areaId status');
  }
}

module.exports = new VehicleService();

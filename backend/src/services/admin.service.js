const {
  User,
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  Alert,
} = require('../models');
const ApiError = require('../utils/apiError');

class AdminService {
  // ─────────────────────────────────────────────
  // USER MANAGEMENT (Admin orchestration)
  // ─────────────────────────────────────────────

  /**
   * Lấy danh sách tất cả Users (lọc & phân trang)
   */
  async getUsers(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.role) filter.roles = query.role;
    if (query.status) filter.status = query.status;
    if (query.isVerified !== undefined) {
      filter.isVerified = query.isVerified === 'true' || query.isVerified === true;
    }
    if (query.search) {
      const term = query.search.trim();
      filter.$or = [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return {
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Lấy chi tiết 1 User
   */
  async getUserById(id) {
    const user = await User.findById(id).select('-passwordHash');
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng này');
    return user;
  }

  /**
   * Cập nhật trạng thái tài khoản (activate / suspend / ...)
   */
  async updateUserStatus(id, status) {
    const ALLOWED = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'];
    if (!ALLOWED.includes(status)) {
      throw new ApiError(400, `Trạng thái không hợp lệ. Cho phép: ${ALLOWED.join(', ')}`);
    }

    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng cần cập nhật');

    user.status = status;
    await user.save();

    return user.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });
  }

  /**
   * Xác minh tài khoản người dùng
   */
  async verifyUser(id) {
    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng cần xác minh');

    user.isVerified = true;
    if (user.status === 'PENDING') user.status = 'ACTIVE';
    await user.save();

    return user.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });
  }

  /**
   * Cập nhật roles của tài khoản
   */
  async updateUserRoles(id, roles) {
    const ALLOWED_ROLES = ['CITIZEN', 'RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'];
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new ApiError(400, 'Danh sách roles phải là mảng không rỗng');
    }
    const invalidRoles = roles.filter(r => !ALLOWED_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      throw new ApiError(400, `Roles không hợp lệ: ${invalidRoles.join(', ')}`);
    }

    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng cần cập nhật');

    user.roles = roles;
    await user.save();

    return user.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });
  }

  /**
   * Xóa tài khoản người dùng (hard delete — chỉ dùng khi thực sự cần)
   */
  async deleteUser(id) {
    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng cần xóa');

    await User.findByIdAndDelete(id);
    return { message: 'Đã xóa tài khoản người dùng thành công' };
  }

  // ─────────────────────────────────────────────
  // RESCUER VERIFICATION (Admin orchestration)
  // ─────────────────────────────────────────────

  /**
   * Xác minh / từ chối cứu hộ viên
   */
  async verifyRescuer(id, verificationStatus) {
    const ALLOWED = ['VERIFIED', 'REJECTED'];
    if (!ALLOWED.includes(verificationStatus)) {
      throw new ApiError(400, `verificationStatus không hợp lệ. Cho phép: ${ALLOWED.join(', ')}`);
    }

    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy cứu hộ viên này');
    if (!user.roles.includes('RESCUER')) {
      throw new ApiError(400, 'Tài khoản này không có vai trò RESCUER');
    }

    user.rescuer.verificationStatus = verificationStatus;
    if (verificationStatus === 'VERIFIED') {
      user.rescuer.availabilityStatus = 'AVAILABLE';
      if (user.status === 'PENDING') user.status = 'ACTIVE';
    }
    await user.save();

    return user.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });
  }

  // ─────────────────────────────────────────────
  // STATISTICS
  // ─────────────────────────────────────────────

  /**
   * Tổng hợp thống kê toàn hệ thống
   */
  async getStatistics() {
    const now = new Date();

    const [
      totalUsers,
      totalCitizens,
      totalRescuers,
      totalTeams,
      totalVehicles,
      totalSos,
      sosByStatus,
      sosByPriority,
      sosByEmergencyType,
      completedMissions,
      activeAlerts,
    ] = await Promise.all([
      // Tổng users
      User.countDocuments(),

      // Tổng citizens
      User.countDocuments({ roles: 'CITIZEN' }),

      // Tổng rescuers
      User.countDocuments({ roles: 'RESCUER' }),

      // Tổng đội cứu hộ
      RescueTeam.countDocuments(),

      // Tổng phương tiện
      Vehicle.countDocuments(),

      // Tổng SOS requests
      SosRequest.countDocuments(),

      // SOS phân theo status
      SosRequest.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
        { $sort: { status: 1 } },
      ]),

      // SOS phân theo priority
      SosRequest.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $project: { priority: '$_id', count: 1, _id: 0 } },
        { $sort: { priority: 1 } },
      ]),

      // SOS phân theo emergencyType
      SosRequest.aggregate([
        { $group: { _id: '$emergencyType', count: { $sum: 1 } } },
        { $project: { emergencyType: '$_id', count: 1, _id: 0 } },
        { $sort: { emergencyType: 1 } },
      ]),

      // Nhiệm vụ hoàn thành (SosAssignment COMPLETED)
      SosAssignment.countDocuments({ status: 'COMPLETED' }),

      // Cảnh báo đang hoạt động (isActive=true, startTime <= now, endTime null hoặc >= now)
      Alert.countDocuments({
        isActive: true,
        startTime: { $lte: now },
        $or: [{ endTime: null }, { endTime: { $gte: now } }],
      }),
    ]);

    return {
      overview: {
        totalUsers,
        totalCitizens,
        totalRescuers,
        totalTeams,
        totalVehicles,
        totalSos,
        completedMissions,
        activeAlerts,
      },
      sosByStatus,
      sosByPriority,
      sosByEmergencyType,
      generatedAt: now,
    };
  }
}

module.exports = new AdminService();

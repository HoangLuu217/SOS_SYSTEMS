const { User, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class RescuerService {
  /**
   * Lấy thông tin chi tiết hồ sơ Cứu hộ viên của chính mình
   */
  async getProfile(userId) {
    const user = await User.findById(userId)
      .select('-passwordHash')
      .populate('rescuer.areaId', 'name level provinceCode districtCode parentId')
      .populate('areaId', 'name level provinceCode districtCode parentId');

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản');
    }

    const isRescuer = user.roles.includes('RESCUER');
    const areaIdVal = user.rescuer?.areaId?._id || user.rescuer?.areaId || user.areaId?._id || user.areaId || user.citizen?.areaId || null;
    const areaNameVal = user.rescuer?.areaName || user.rescuer?.areaId?.name || user.areaId?.name || user.citizen?.areaName || null;

    return {
      _id: user._id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      address: user.address,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      roles: user.roles,
      status: user.status,
      isVerified: user.isVerified,
      rescuer: isRescuer
        ? {
            ...(user.rescuer ? user.rescuer.toObject() : {}),
            areaId: areaIdVal,
            areaName: areaNameVal,
          }
        : {
            idNumber: user.rescuer?.idNumber || null,
            skills: user.rescuer?.skills || [],
            experience: user.rescuer?.experience || null,
            vehicleType: user.rescuer?.vehicleType || null,
            areaId: areaIdVal,
            areaName: areaNameVal,
            verificationStatus: 'NOT_REGISTERED',
            availabilityStatus: 'OFFLINE',
          },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Cập nhật thông tin hồ sơ Cứu hộ viên / Công dân nộp đơn đăng ký làm Cứu hộ viên
   */
  async updateProfile(userId, data) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy tài khoản');
    }

    // Nếu người dùng đang là CITIZEN đăng ký làm RESCUER: tự động thêm role và set PENDING
    if (!user.roles.includes('RESCUER')) {
      user.roles.push('RESCUER');
      if (!user.rescuer) user.rescuer = {};
      user.rescuer.verificationStatus = 'PENDING';
      user.rescuer.availabilityStatus = 'OFFLINE';
    }

    // Các trường cho phép cập nhật trong hồ sơ rescuer (người dùng không thể tự đổi verificationStatus)
    if (data.idNumber !== undefined) user.rescuer.idNumber = data.idNumber ? String(data.idNumber).trim() : null;
    if (data.vehicleType !== undefined) user.rescuer.vehicleType = data.vehicleType;
    if (data.skills !== undefined && Array.isArray(data.skills)) {
      user.rescuer.skills = Array.from(new Set(data.skills.map(s => String(s).trim()).filter(Boolean)));
    }
    if (data.experience !== undefined && typeof data.experience === 'string') {
      user.rescuer.experience = data.experience.trim();
    }

    // Cập nhật địa bàn đăng ký cứu hộ
    if (data.areaId !== undefined) {
      user.rescuer.areaId = data.areaId || null;
      if (data.areaId) {
        if (!user.areaId) user.areaId = data.areaId;
        if (!user.citizen) user.citizen = {};
        if (!user.citizen.areaId) user.citizen.areaId = data.areaId;

        if (!data.areaName) {
          const areaDoc = await AdministrativeArea.findById(data.areaId);
          if (areaDoc) {
            user.rescuer.areaName = areaDoc.name;
            if (!user.citizen.areaName) user.citizen.areaName = areaDoc.name;
          }
        }
      }
    }
    if (data.areaName !== undefined && data.areaName) {
      user.rescuer.areaName = String(data.areaName).trim();
      if (!user.citizen) user.citizen = {};
      if (!user.citizen.areaName) user.citizen.areaName = String(data.areaName).trim();
    }

    // Đảm bảo verificationStatus luôn là PENDING nếu chưa từng được duyệt
    if (!user.rescuer.verificationStatus || user.rescuer.verificationStatus === 'NOT_REGISTERED') {
      user.rescuer.verificationStatus = 'PENDING';
    }

    // Cho phép cập nhật thêm thông tin hiển thị cơ bản nếu có
    if (data.fullName !== undefined) user.fullName = data.fullName.trim();
    if (data.address !== undefined) user.address = data.address ? data.address.trim() : null;
    if (data.avatarUrl !== undefined) user.avatarUrl = data.avatarUrl;
    if (data.gender !== undefined) user.gender = data.gender;
    if (data.dateOfBirth !== undefined) user.dateOfBirth = data.dateOfBirth;

    await user.save();

    return this.getProfile(userId);
  }

  /**
   * Cập nhật danh sách kỹ năng chuyên môn
   */
  async updateSkills(userId, skills) {
    if (!Array.isArray(skills)) {
      throw new ApiError(400, 'Danh sách kỹ năng (skills) phải là một mảng chuỗi');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy tài khoản');
    }

    if (!user.roles.includes('RESCUER')) {
      user.roles.push('RESCUER');
      if (!user.rescuer) user.rescuer = {};
      user.rescuer.verificationStatus = 'PENDING';
      user.rescuer.availabilityStatus = 'OFFLINE';
    }

    // Làm sạch và lọc kỹ năng trùng
    const cleanSkills = Array.from(new Set(skills.map(s => String(s).trim()).filter(Boolean)));

    user.rescuer.skills = cleanSkills;
    await user.save();

    return {
      userId: user._id,
      skills: user.rescuer.skills,
    };
  }

  /**
   * Cập nhật kinh nghiệm cứu hộ
   */
  async updateExperience(userId, experience) {
    if (typeof experience !== 'string') {
      throw new ApiError(400, 'Kinh nghiệm (experience) phải là định dạng chuỗi');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy tài khoản');
    }

    if (!user.roles.includes('RESCUER')) {
      user.roles.push('RESCUER');
      if (!user.rescuer) user.rescuer = {};
      user.rescuer.verificationStatus = 'PENDING';
      user.rescuer.availabilityStatus = 'OFFLINE';
    }

    user.rescuer.experience = experience.trim();
    await user.save();

    return {
      userId: user._id,
      experience: user.rescuer.experience,
    };
  }

  /**
   * Cập nhật trạng thái sẵn sàng (Availability Status)
   */
  async updateAvailability(userId, availabilityStatus) {
    const validStatuses = ['OFFLINE', 'AVAILABLE', 'BUSY', 'ON_MISSION', 'SUSPENDED'];
    if (!validStatuses.includes(availabilityStatus)) {
      throw new ApiError(
        400,
        `Trạng thái '${availabilityStatus}' không hợp lệ. Cho phép: ${validStatuses.join(', ')}`
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy tài khoản');
    }

    if (!user.roles.includes('RESCUER')) {
      throw new ApiError(403, 'Tài khoản này không có quyền Cứu hộ viên');
    }

    // Kiểm tra nếu tài khoản chưa được xác minh thì không cho bật AVAILABLE
    if (availabilityStatus === 'AVAILABLE' && user.rescuer.verificationStatus !== 'VERIFIED') {
      throw new ApiError(
        400,
        'Hồ sơ cứu hộ viên chưa được duyệt (VERIFIED). Không thể chuyển sang trạng thái AVAILABLE!'
      );
    }

    user.rescuer.availabilityStatus = availabilityStatus;
    await user.save();

    return {
      userId: user._id,
      availabilityStatus: user.rescuer.availabilityStatus,
    };
  }

  /**
   * Lấy danh sách hồ sơ Cứu hộ viên đang chờ duyệt (Dành cho Authority & Admin)
   */
  async getPendingRescuers(query = {}, currentUser = null) {
    const filter = {
      roles: 'RESCUER',
      'rescuer.verificationStatus': 'PENDING',
    };

    // Nếu người xem là Cán bộ địa phương (LOCAL_AUTHORITY), chỉ lọc hồ sơ thuộc địa bàn quản lý
    if (
      currentUser &&
      currentUser.roles?.includes('LOCAL_AUTHORITY') &&
      !currentUser.roles?.includes('ADMIN')
    ) {
      const authorityAreaId = currentUser.authority?.areaId || currentUser.areaId;
      if (authorityAreaId) {
        filter.$or = [
          { 'rescuer.areaId': authorityAreaId },
          { areaId: authorityAreaId },
          { 'citizen.areaId': authorityAreaId },
        ];
      }
    }

    if (query.search) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      const searchCond = [
        { fullName: searchRegex },
        { phone: searchRegex },
        { 'rescuer.idNumber': searchRegex },
        { 'rescuer.areaName': searchRegex },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCond }];
        delete filter.$or;
      } else {
        filter.$or = searchCond;
      }
    }

    const users = await User.find(filter)
      .select('-passwordHash')
      .populate('rescuer.areaId', 'name level provinceCode districtCode parentId')
      .populate('areaId', 'name level provinceCode districtCode parentId')
      .sort({ createdAt: -1 });

    return users;
  }

  /**
   * Phê duyệt hoặc từ chối hồ sơ cứu hộ viên (Dành cho Authority & Admin)
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

    return user.toSafeObject ? user.toSafeObject() : user;
  }
}

module.exports = new RescuerService();

const bcrypt = require('bcryptjs');
const { User } = require('../models');
const ApiError = require('../utils/apiError');
const { isValidPassword, isValidPhone } = require('../utils/validation.util');

class UserService {
  /**
   * Lấy thông tin hồ sơ của chính người dùng hiện tại
   */
  async getMe(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }
    return user.toSafeObject();
  }

  /**
   * Cập nhật thông tin cá nhân: fullName, dateOfBirth, gender, address
   */
  async updateMe(userId, data) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    const { fullName, dateOfBirth, gender, address } = data;

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        throw new ApiError(400, 'Họ và tên phải có ít nhất 2 ký tự.');
      }
      user.fullName = fullName.trim();
    }

    if (dateOfBirth !== undefined) {
      user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    if (gender !== undefined) {
      if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
        throw new ApiError(400, 'Giới tính không hợp lệ (cho phép: MALE, FEMALE, OTHER).');
      }
      user.gender = gender || null;
    }

    if (address !== undefined) {
      user.address = address ? address.trim() : null;
    }

    await user.save();

    return user.toSafeObject();
  }

  /**
   * Cập nhật ảnh đại diện người dùng
   */
  async updateAvatar(userId, avatarUrl) {
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      throw new ApiError(400, 'Đường dẫn ảnh đại diện (avatarUrl) không hợp lệ.');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    user.avatarUrl = avatarUrl.trim();
    await user.save();

    return {
      userId: user._id,
      avatarUrl: user.avatarUrl,
    };
  }

  /**
   * Đổi mật khẩu người dùng
   */
  async changePassword(userId, { oldPassword, newPassword }) {
    if (!newPassword || !isValidPassword(newPassword, 6)) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    // Nếu tài khoản đã có mật khẩu, yêu cầu cung cấp đúng mật khẩu cũ
    if (user.passwordHash) {
      if (!oldPassword) {
        throw new ApiError(400, 'Vui lòng nhập mật khẩu hiện tại.');
      }
      const isMatch = await user.comparePassword(oldPassword);
      if (!isMatch) {
        throw new ApiError(400, 'Mật khẩu hiện tại không chính xác.');
      }
      if (oldPassword === newPassword) {
        throw new ApiError(400, 'Mật khẩu mới không được trùng với mật khẩu cũ.');
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return {
      message: 'Đổi mật khẩu thành công.',
    };
  }

  /**
   * Lấy hồ sơ Citizen của chính mình
   */
  async getCitizen(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    return {
      userId: user._id,
      citizen: user.citizen || {},
    };
  }

  /**
   * Cập nhật thông tin liên hệ khẩn cấp trong hồ sơ Citizen
   */
  async updateEmergencyContact(userId, contactData) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    const { name, phone, relation } = contactData || {};

    if (phone && !isValidPhone(phone)) {
      throw new ApiError(400, 'Số điện thoại người liên hệ khẩn cấp không hợp lệ.');
    }

    if (!user.citizen) {
      user.citizen = {};
    }

    user.citizen.emergencyContact = {
      name: name ? name.trim() : user.citizen.emergencyContact?.name || null,
      phone: phone ? phone.trim() : user.citizen.emergencyContact?.phone || null,
      relation: relation ? relation.trim() : user.citizen.emergencyContact?.relation || null,
    };

    await user.save();

    return {
      userId: user._id,
      citizen: user.citizen,
    };
  }
}

module.exports = new UserService();

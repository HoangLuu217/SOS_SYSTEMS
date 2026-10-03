const fs = require('fs');
const path = require('path');
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

    const { fullName, dateOfBirth, gender, address, phone } = data;

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        throw new ApiError(400, 'Họ và tên phải có ít nhất 2 ký tự.');
      }
      user.fullName = fullName.trim();
    }

    if (dateOfBirth !== undefined) {
      if (!dateOfBirth) {
        user.dateOfBirth = null;
      } else if (typeof dateOfBirth === 'string' && dateOfBirth.includes('/')) {
        const parts = dateOfBirth.split('/');
        if (parts.length === 3) {
          user.dateOfBirth = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        } else {
          user.dateOfBirth = new Date(dateOfBirth);
        }
      } else {
        user.dateOfBirth = new Date(dateOfBirth);
      }
      if (isNaN(user.dateOfBirth?.getTime())) {
        user.dateOfBirth = null;
      }
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

    if (phone !== undefined) {
      if (phone) {
        const cleanPhone = phone.trim();
        if (!isValidPhone(cleanPhone)) {
          throw new ApiError(400, 'Số điện thoại không hợp lệ (hỗ trợ định dạng VN 10 số hoặc E.164).');
        }
        const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: userId } });
        if (existing) {
          throw new ApiError(409, 'Số điện thoại này đã được sử dụng bởi tài khoản khác.');
        }
        user.phone = cleanPhone;
      }
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

    let finalUrl = avatarUrl.trim();

    // Nếu là base64 data URI, lưu thành file ảnh thực tế trên máy chủ vào thư mục assets/avatars
    if (finalUrl.startsWith('data:image/')) {
      try {
        const matches = finalUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const avatarsDir = path.join(__dirname, '../../assets/avatars');
          if (!fs.existsSync(avatarsDir)) {
            fs.mkdirSync(avatarsDir, { recursive: true });
          }
          const fileName = `avatar-${userId}.${ext}`;
          const filePath = path.join(avatarsDir, fileName);
          fs.writeFileSync(filePath, buffer);
        }
      } catch (err) {
        console.warn('Lỗi ghi file avatar:', err.message);
      }
    }

    user.avatarUrl = finalUrl;
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
    const cleanPhone = phone ? phone.replace(/\s+/g, '') : null;

    if (cleanPhone && !isValidPhone(cleanPhone)) {
      throw new ApiError(400, 'Số điện thoại người liên hệ khẩn cấp không hợp lệ.');
    }

    if (!user.citizen) {
      user.citizen = {};
    }

    user.citizen.emergencyContact = {
      name: name ? name.trim() : user.citizen.emergencyContact?.name || null,
      phone: cleanPhone || user.citizen.emergencyContact?.phone || null,
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

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const ApiError = require('../utils/apiError');
const { isValidPassword, isValidPhone, validatePasswordStrength } = require('../utils/validation.util');
const cloudinary = require('../config/cloudinary');

const auditService = require('./audit.service');

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
   * Cập nhật thông tin cá nhân: fullName, dateOfBirth, gender, address, phone, email, authority
   */
  async updateMe(userId, data) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    const { fullName, dateOfBirth, gender, address, phone, email, authority } = data;

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
        const cleanPhone = String(phone).replace(/\s+/g, '').trim();
        if (!isValidPhone(cleanPhone)) {
          throw new ApiError(400, 'Số điện thoại không hợp lệ (hỗ trợ định dạng VN 10 số hoặc E.164).');
        }
        const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: userId } });
        if (existing) {
          throw new ApiError(409, 'Số điện thoại này đã được sử dụng bởi tài khoản khác.');
        }
        if (cleanPhone !== user.phone && data.isPhoneVerified === undefined) {
          user.isPhoneVerified = false;
        }
        user.phone = cleanPhone;
      }
    }

    if (data.isPhoneVerified !== undefined) {
      user.isPhoneVerified = !!data.isPhoneVerified;
    }

    if (email !== undefined) {
      if (email && typeof email === 'string') {
        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail !== user.email) {
          const existingEmail = await User.findOne({ email: cleanEmail, _id: { $ne: userId } });
          if (existingEmail) {
            throw new ApiError(409, 'Hòm thư điện tử này đã được sử dụng bởi tài khoản khác.');
          }
          user.email = cleanEmail;
        }
      }
    }

    if (data.avatarUrl !== undefined) {
      let finalAvatar = typeof data.avatarUrl === 'string' ? data.avatarUrl.trim() : null;
      if (finalAvatar && (finalAvatar.startsWith('data:image/') || finalAvatar.startsWith('/9j/') || finalAvatar.length > 500)) {
        try {
          const uploadPayload = finalAvatar.startsWith('data:image/')
            ? finalAvatar
            : `data:image/jpeg;base64,${finalAvatar}`;

          const uploadResult = await cloudinary.uploader.upload(uploadPayload, {
            folder: 'sos_systems/avatars',
            resource_type: 'image',
            public_id: `avatar_${userId}_${Date.now()}`,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ],
          });

          if (uploadResult && uploadResult.secure_url) {
            finalAvatar = uploadResult.secure_url;
          }
        } catch (err) {
          console.warn('Lỗi upload avatar lên Cloudinary trong updateMe:', err.message);
        }
      }
      user.avatarUrl = finalAvatar;
    }

    // Cập nhật thông tin cán bộ địa phương (Authority Profile)
    if (authority && typeof authority === 'object') {
      if (!user.authority) {
        user.authority = {};
      }
      if (authority.position !== undefined) {
        user.authority.position = authority.position ? String(authority.position).trim() : null;
      }
      if (authority.organizationName !== undefined) {
        user.authority.organizationName = authority.organizationName ? String(authority.organizationName).trim() : null;
      }
      if (authority.areaName !== undefined) {
        user.authority.areaName = authority.areaName ? String(authority.areaName).trim() : null;
      }
      if (authority.department !== undefined) {
        user.authority.department = authority.department ? String(authority.department).trim() : null;
      }
      if (authority.provinceCode !== undefined) {
        user.authority.provinceCode = authority.provinceCode ? Number(authority.provinceCode) : null;
      }
      if (authority.wardCode !== undefined) {
        user.authority.wardCode = authority.wardCode ? Number(authority.wardCode) : null;
      }
    }

    await user.save();

    // Ghi audit log thay đổi hồ sơ
    await auditService.log({
      actorId: user._id,
      actorRole: user.roles?.[0] || 'USER',
      action: 'UPDATE_PROFILE',
      entityType: 'User',
      entityId: user._id,
      metadata: {
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        authority: {
          organizationName: user.authority?.organizationName || user.authority?.department || '',
          position: user.authority?.position || '',
        },
      },
    });

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

    // Nếu là base64 data URI hoặc chuỗi base64 thô, tải trực tiếp lên Cloudinary
    if (finalUrl.startsWith('data:image/') || finalUrl.startsWith('/9j/') || finalUrl.length > 500) {
      try {
        const uploadPayload = finalUrl.startsWith('data:image/')
          ? finalUrl
          : `data:image/jpeg;base64,${finalUrl}`;

        const uploadResult = await cloudinary.uploader.upload(uploadPayload, {
          folder: 'sos_systems/avatars',
          resource_type: 'image',
          public_id: `avatar_${userId}_${Date.now()}`,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' }
          ],
        });

        if (uploadResult && uploadResult.secure_url) {
          finalUrl = uploadResult.secure_url;
        }
      } catch (err) {
        console.warn('Lỗi upload avatar lên Cloudinary:', err.message);
      }
    }

    user.avatarUrl = finalUrl;
    await user.save();

    return {
      userId: user._id,
      avatarUrl: user.avatarUrl,
      user: user.toSafeObject(),
    };
  }

  /**
   * Đổi mật khẩu người dùng
   */
  async changePassword(userId, { oldPassword, newPassword }) {
    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) {
      throw new ApiError(400, passCheck.message);
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

    // Đảm bảo đồng bộ tuyệt đối giữa emergencyContacts và emergencyContact đơn
    if (user.citizen) {
      if (Array.isArray(user.citizen.emergencyContacts)) {
        if (user.citizen.emergencyContacts.length === 0) {
          user.citizen.emergencyContact = { name: null, phone: null, relation: null };
        } else {
          const first = user.citizen.emergencyContacts[0];
          user.citizen.emergencyContact = {
            name: first.name,
            phone: first.phone,
            relation: first.relation,
            address: first.address || null,
            latitude: first.latitude || null,
            longitude: first.longitude || null,
          };
        }
      }
    }

    return {
      userId: user._id,
      citizen: user.citizen || {},
    };
  }

  /**
   * Cập nhật thông tin liên hệ khẩn cấp trong hồ sơ Citizen (Hỗ trợ danh sách nhiều liên hệ)
   */
  async updateEmergencyContact(userId, payload) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    if (!user.citizen) {
      user.citizen = {};
    }

    if (!Array.isArray(user.citizen.emergencyContacts)) {
      user.citizen.emergencyContacts = [];
    }

    // Tự động di chuyển liên hệ đơn cũ vào danh sách nếu có
    if (user.citizen.emergencyContact?.name && user.citizen.emergencyContacts.length === 0) {
      user.citizen.emergencyContacts.push({
        id: new mongoose.Types.ObjectId().toString(),
        name: user.citizen.emergencyContact.name,
        phone: user.citizen.emergencyContact.phone,
        relation: user.citizen.emergencyContact.relation,
        address: user.citizen.emergencyContact.address || null,
        latitude: user.citizen.emergencyContact.latitude || null,
        longitude: user.citizen.emergencyContact.longitude || null,
      });
    }

    // Trường hợp 1: Gửi toàn bộ mảng danh sách contacts
    const contactsList = Array.isArray(payload) ? payload : (Array.isArray(payload?.contacts) ? payload.contacts : null);
    if (contactsList) {
      const validated = [];
      for (const item of contactsList) {
        if (!item?.name && !item?.phone) continue;
        const cleanPhone = item.phone ? String(item.phone).replace(/\s+/g, '') : '';
        if (cleanPhone && !isValidPhone(cleanPhone)) {
          throw new ApiError(400, `Số điện thoại "${item.phone}" không hợp lệ.`);
        }
        validated.push({
          id: item.id || new mongoose.Types.ObjectId().toString(),
          name: item.name ? String(item.name).trim() : '',
          phone: cleanPhone,
          relation: item.relation ? String(item.relation).trim() : 'Người thân',
          address: item.address ? String(item.address).trim() : null,
          latitude: typeof item.latitude === 'number' ? item.latitude : null,
          longitude: typeof item.longitude === 'number' ? item.longitude : null,
        });
      }
      user.citizen.emergencyContacts = validated;
    } else {
      // Trường hợp 2: Gửi 1 liên hệ cụ thể (thêm mới hoặc sửa theo id)
      const { id, name, phone, relation, address, latitude, longitude } = payload || {};

      if (!name && !phone) {
        throw new ApiError(400, 'Vui lòng cung cấp họ tên và số điện thoại người liên hệ.');
      }

      const cleanPhone = phone ? String(phone).replace(/\s+/g, '') : '';
      if (cleanPhone && !isValidPhone(cleanPhone)) {
        throw new ApiError(400, 'Số điện thoại người liên hệ khẩn cấp không hợp lệ.');
      }

      if (id) {
        // Cập nhật liên hệ đã có trong mảng
        const idx = user.citizen.emergencyContacts.findIndex((c) => c.id === id);
        if (idx !== -1) {
          user.citizen.emergencyContacts[idx] = {
            id,
            name: name ? String(name).trim() : user.citizen.emergencyContacts[idx].name,
            phone: cleanPhone || user.citizen.emergencyContacts[idx].phone,
            relation: relation ? String(relation).trim() : user.citizen.emergencyContacts[idx].relation,
            address: address !== undefined ? (address ? String(address).trim() : null) : user.citizen.emergencyContacts[idx].address,
            latitude: typeof latitude === 'number' ? latitude : user.citizen.emergencyContacts[idx].latitude,
            longitude: typeof longitude === 'number' ? longitude : user.citizen.emergencyContacts[idx].longitude,
          };
        } else {
          user.citizen.emergencyContacts.push({
            id,
            name: name ? String(name).trim() : '',
            phone: cleanPhone,
            relation: relation ? String(relation).trim() : 'Người thân',
            address: address ? String(address).trim() : null,
            latitude: typeof latitude === 'number' ? latitude : null,
            longitude: typeof longitude === 'number' ? longitude : null,
          });
        }
      } else {
        // Thêm mới một liên hệ vào danh sách
        user.citizen.emergencyContacts.push({
          id: new mongoose.Types.ObjectId().toString(),
          name: name ? String(name).trim() : '',
          phone: cleanPhone,
          relation: relation ? String(relation).trim() : 'Người thân',
          address: address ? String(address).trim() : null,
          latitude: typeof latitude === 'number' ? latitude : null,
          longitude: typeof longitude === 'number' ? longitude : null,
        });
      }
    }

    // Đồng bộ contact đầu tiên vào emergencyContact đơn để duy trì tương thích ngược
    const primary = user.citizen.emergencyContacts[0] || null;
    user.citizen.emergencyContact = primary
      ? {
          name: primary.name,
          phone: primary.phone,
          relation: primary.relation,
          address: primary.address || null,
          latitude: primary.latitude || null,
          longitude: primary.longitude || null,
        }
      : { name: null, phone: null, relation: null, address: null, latitude: null, longitude: null };

    await user.save();

    return {
      userId: user._id,
      citizen: user.citizen,
    };
  }

  /**
   * Xóa / Gỡ thông tin người liên hệ khẩn cấp theo contactId (hoặc gỡ hết nếu không truyền id)
   */
  async deleteEmergencyContact(userId, contactId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    if (user.citizen) {
      if (!Array.isArray(user.citizen.emergencyContacts)) {
        user.citizen.emergencyContacts = [];
      }

      if (contactId) {
        user.citizen.emergencyContacts = user.citizen.emergencyContacts.filter(
          (c) => c.id !== contactId && String(c._id) !== contactId
        );
      } else {
        user.citizen.emergencyContacts = [];
      }

      const primary = user.citizen.emergencyContacts[0] || null;
      user.citizen.emergencyContact = primary
        ? { name: primary.name, phone: primary.phone, relation: primary.relation }
        : { name: null, phone: null, relation: null };

      await user.save();
    }

    return {
      userId: user._id,
      citizen: user.citizen || {},
    };
  }

  /**
   * Gửi mã OTP xác thực số điện thoại
   */
  async sendPhoneOtp(userId, phone) {
    const authService = require('./auth.service');
    if (!phone) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại nhận mã OTP.');
    }
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      throw new ApiError(400, 'Số điện thoại không hợp lệ (cần ít nhất 10 số).');
    }

    const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: userId } });
    if (existing) {
      throw new ApiError(409, 'Số điện thoại này đã được sử dụng bởi tài khoản khác.');
    }

    return authService.sendOtp(cleanPhone);
  }

  /**
   * Xác thực mã OTP và cập nhật trạng thái đã xác minh vào Database
   */
  async verifyPhoneOtp(userId, { phone, otp }) {
    const authService = require('./auth.service');
    if (!phone) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại.');
    }
    if (!otp || String(otp).trim().length !== 6) {
      throw new ApiError(400, 'Mã OTP phải có đúng 6 chữ số.');
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const cleanOtp = String(otp).trim();

    // Xác thực mã OTP
    await authService.verifyOtp({ phone: cleanPhone, otp: cleanOtp, verifyOnly: true });

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy người dùng.');
    }

    user.phone = cleanPhone;
    user.isPhoneVerified = true;
    user.isVerified = true;
    await user.save();

    await auditService.log({
      actorId: user._id,
      actorRole: user.roles?.[0] || 'USER',
      action: 'VERIFY_PHONE',
      entityType: 'User',
      entityId: user._id,
      metadata: { phone: cleanPhone },
    });

    return {
      success: true,
      message: 'Xác thực số điện thoại thành công!',
      user: user.toSafeObject(),
    };
  }
}

module.exports = new UserService();

const userService = require('../services/user.service');
const { sendSuccess } = require('../utils/apiResponse');

class UserController {
  /**
   * GET /users/me
   */
  async getMe(req, res, next) {
    try {
      const profile = await userService.getMe(req.user._id);
      return sendSuccess(res, 200, 'Lấy thông tin cá nhân thành công', profile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /users/me
   */
  async updateMe(req, res, next) {
    try {
      const updated = await userService.updateMe(req.user._id, req.body);
      return sendSuccess(res, 200, 'Cập nhật thông tin cá nhân thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /users/me/avatar
   */
  async updateAvatar(req, res, next) {
    try {
      const { avatarUrl } = req.body;
      const result = await userService.updateAvatar(req.user._id, avatarUrl);
      return sendSuccess(res, 200, 'Cập nhật ảnh đại diện thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /users/me/password
   */
  async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      const result = await userService.changePassword(req.user._id, {
        oldPassword,
        newPassword,
      });
      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /users/me/citizen
   */
  async getCitizen(req, res, next) {
    try {
      const citizen = await userService.getCitizen(req.user._id);
      return sendSuccess(res, 200, 'Lấy thông tin hồ sơ Citizen thành công', citizen);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /users/me/citizen/emergency-contact
   */
  async updateEmergencyContact(req, res, next) {
    try {
      const result = await userService.updateEmergencyContact(req.user._id, req.body);
      return sendSuccess(res, 200, 'Cập nhật người liên hệ khẩn cấp thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /users/me/citizen/emergency-contact
   */
  async deleteEmergencyContact(req, res, next) {
    try {
      const contactId = req.params?.id || req.query?.id || req.body?.id;
      const result = await userService.deleteEmergencyContact(req.user._id, contactId);
      return sendSuccess(res, 200, 'Xoá người liên hệ khẩn cấp thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /users/me/send-phone-otp
   */
  async sendPhoneOtp(req, res, next) {
    try {
      const { phone } = req.body;
      const result = await userService.sendPhoneOtp(req.user._id, phone);
      return sendSuccess(res, 200, result.message || 'Mã OTP đã được gửi thành công!', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /users/me/verify-phone-otp
   */
  async verifyPhoneOtp(req, res, next) {
    try {
      const { phone, otp } = req.body;
      const result = await userService.verifyPhoneOtp(req.user._id, { phone, otp });
      return sendSuccess(res, 200, result.message || 'Xác thực số điện thoại thành công!', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();

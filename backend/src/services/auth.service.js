const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { User } = require('../models');
const ApiError = require('../utils/apiError');
const {
  generateTokens,
  hashToken,
  generateRandomToken,
} = require('../utils/token.util');
const {
  isValidEmail,
  isValidPhone,
  isValidPassword,
} = require('../utils/validation.util');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthService {
  /**
   * Đăng ký tài khoản người dùng mới (Mặc định role CITIZEN)
   */
  async register(data, userAgent = null, ipAddress = null) {
    const { fullName, email, phone, password, gender, dateOfBirth, address, roles } = data;

    // 1. Kiểm tra đầu vào bắt buộc
    if (!fullName || !email || !phone || !password) {
      throw new ApiError(400, 'Họ tên, email, số điện thoại và mật khẩu là bắt buộc.');
    }

    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      throw new ApiError(400, 'Họ và tên phải có ít nhất 2 ký tự.');
    }

    if (!isValidEmail(email)) {
      throw new ApiError(400, 'Định dạng email không hợp lệ.');
    }

    if (!isValidPhone(phone)) {
      throw new ApiError(400, 'Số điện thoại không hợp lệ (hỗ trợ định dạng VN 10 số hoặc E.164).');
    }

    if (!isValidPassword(password, 6)) {
      throw new ApiError(400, 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
    }

    // 2. Kiểm tra trùng lặp email hoặc số điện thoại
    const normalizedEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      throw new ApiError(409, 'Email này đã được sử dụng trong hệ thống.');
    }

    const existingPhone = await User.findOne({ phone: cleanPhone });
    if (existingPhone) {
      throw new ApiError(409, 'Số điện thoại này đã được sử dụng trong hệ thống.');
    }

    // 3. Băm mật khẩu bằng bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Khởi tạo đối tượng User
    const userRoles = Array.isArray(roles) && roles.length > 0 ? roles : ['CITIZEN'];

    const user = new User({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      passwordHash,
      gender: gender || null,
      dateOfBirth: dateOfBirth || null,
      address: address ? address.trim() : null,
      roles: userRoles,
      status: 'ACTIVE',
      isVerified: false,
      lastLoginAt: new Date(),
    });

    // 5. Tạo bộ Token và phiên làm việc
    const { accessToken, refreshToken, refreshTokenHash, expiresAt } = generateTokens(user);

    user.sessions.push({
      refreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });

    await user.save();

    return {
      user: user.toSafeObject(),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Đăng nhập bằng Email hoặc Số điện thoại + Mật khẩu
   */
  async login({ email, phone, password, userAgent = null, ipAddress = null }) {
    if ((!email && !phone) || !password) {
      throw new ApiError(400, 'Vui lòng cung cấp email hoặc số điện thoại cùng mật khẩu.');
    }

    const query = {};
    if (email) {
      query.email = email.toLowerCase().trim();
    } else if (phone) {
      query.phone = phone.trim();
    }

    const user = await User.findOne(query);
    if (!user) {
      throw new ApiError(401, 'Tài khoản hoặc mật khẩu không chính xác.');
    }

    if (!user.passwordHash) {
      throw new ApiError(
        400,
        'Tài khoản này được đăng ký thông qua tài khoản Google. Vui lòng đăng nhập bằng Google.'
      );
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new ApiError(401, 'Tài khoản hoặc mật khẩu không chính xác.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new ApiError(403, 'Tài khoản của bạn hiện đang bị khóa hoặc ngưng hoạt động.');
    }

    // Dọn dẹp phiên hết hạn & giới hạn tối đa 10 phiên đồng thời
    const now = new Date();
    user.sessions = user.sessions.filter(s => s.expiresAt > now);
    if (user.sessions.length >= 10) {
      user.sessions.shift(); // Loại bỏ phiên cũ nhất
    }

    const { accessToken, refreshToken, refreshTokenHash, expiresAt } = generateTokens(user);

    user.sessions.push({
      refreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });
    user.lastLoginAt = now;

    await user.save();

    return {
      user: user.toSafeObject(),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Đăng nhập / Đăng ký qua Google ID Token
   * Xác thực token với Google backend, lưu sub vào googleId
   */
  async loginWithGoogle({ idToken, credential, userAgent = null, ipAddress = null }) {
    const rawToken = idToken || credential;
    if (!rawToken) {
      throw new ApiError(400, 'Google ID Token (credential/idToken) là bắt buộc.');
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: rawToken,
        audience: process.env.GOOGLE_CLIENT_ID || undefined,
      });
      payload = ticket.getPayload();
    } catch (err) {
      throw new ApiError(401, `Xác thực Google ID Token thất bại: ${err.message}`);
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email) {
      throw new ApiError(400, 'Không tìm thấy địa chỉ email từ tài khoản Google.');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Tìm user theo googleId hoặc email
    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    if (user) {
      if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
        throw new ApiError(403, 'Tài khoản của bạn hiện đang bị khóa hoặc ngưng hoạt động.');
      }

      // Nếu chưa liên kết googleId, tự động liên kết
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.avatarUrl && picture) {
        user.avatarUrl = picture;
      }
      user.lastLoginAt = new Date();
    } else {
      // 2. Tạo mới user nếu chưa tồn tại
      user = new User({
        googleId,
        email: normalizedEmail,
        fullName: name || 'Google User',
        avatarUrl: picture || null,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        lastLoginAt: new Date(),
      });
    }

    // Dọn dẹp phiên & thêm phiên mới
    const now = new Date();
    user.sessions = user.sessions.filter(s => s.expiresAt > now);
    if (user.sessions.length >= 10) {
      user.sessions.shift();
    }

    const { accessToken, refreshToken, refreshTokenHash, expiresAt } = generateTokens(user);

    user.sessions.push({
      refreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });

    await user.save();

    return {
      user: user.toSafeObject(),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Cấp phát Access Token mới từ Refresh Token hợp lệ (Session Management & Rotation)
   */
  async refresh({ refreshToken, userAgent = null, ipAddress = null }) {
    if (!refreshToken) {
      throw new ApiError(401, 'Refresh token không được cung cấp.');
    }

    const incomingHash = hashToken(refreshToken);

    // Tìm user sở hữu phiên chứa refreshTokenHash này
    const user = await User.findOne({
      'sessions.refreshTokenHash': incomingHash,
    });

    if (!user) {
      throw new ApiError(401, 'Refresh token không hợp lệ hoặc phiên đăng nhập đã bị hủy.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new ApiError(403, 'Tài khoản của bạn hiện đang bị khóa hoặc ngưng hoạt động.');
    }

    const now = new Date();
    const sessionIndex = user.sessions.findIndex(s => s.refreshTokenHash === incomingHash);

    if (sessionIndex === -1 || user.sessions[sessionIndex].expiresAt <= now) {
      // Xóa phiên hết hạn nếu có
      if (sessionIndex !== -1) {
        user.sessions.splice(sessionIndex, 1);
        await user.save();
      }
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }

    // Token Rotation: Thu hồi refresh token cũ và phát hành refresh token mới
    user.sessions.splice(sessionIndex, 1);

    const { accessToken, refreshToken: newRefreshToken, refreshTokenHash: newHash, expiresAt } =
      generateTokens(user);

    user.sessions.push({
      refreshTokenHash: newHash,
      userAgent: userAgent || user.sessions[sessionIndex]?.userAgent,
      ipAddress: ipAddress || user.sessions[sessionIndex]?.ipAddress,
      expiresAt,
    });

    await user.save();

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: user.toSafeObject(),
    };
  }

  /**
   * Đăng xuất người dùng: thu hồi phiên trong users.sessions
   */
  async logout({ userId, refreshToken }) {
    if (refreshToken) {
      const incomingHash = hashToken(refreshToken);
      await User.updateOne(
        { 'sessions.refreshTokenHash': incomingHash },
        { $pull: { sessions: { refreshTokenHash: incomingHash } } }
      );
    } else if (userId) {
      // Nếu không có refreshToken nhưng có userId, thu hồi phiên gần nhất hoặc toàn bộ
      await User.updateOne(
        { _id: userId },
        { $set: { sessions: [] } }
      );
    }

    return { success: true, message: 'Đăng xuất thành công.' };
  }

  /**
   * Yêu cầu đặt lại mật khẩu: sinh token ngẫu nhiên, lưu hash và hạn dùng (15 phút)
   */
  async forgotPassword(email) {
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, 'Địa chỉ email không hợp lệ.');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Tránh email enumeration: Luôn trả về phản hồi chung
    if (!user) {
      return {
        message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
      };
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
    await user.save();

    const response = {
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };

    // Trong môi trường dev/test, trả về token để kiểm thử nhanh chóng
    if (process.env.NODE_ENV !== 'production') {
      response.resetToken = rawToken;
    }

    return response;
  }

  /**
   * Đặt lại mật khẩu mới bằng token đã nhận
   */
  async resetPassword({ token, newPassword }) {
    if (!token) {
      throw new ApiError(400, 'Mã xác nhận đặt lại mật khẩu (token) là bắt buộc.');
    }

    if (!isValidPassword(newPassword, 6)) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const tokenHash = hashToken(token);

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new ApiError(400, 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    // Băm mật khẩu mới
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    // Hủy token reset mật khẩu
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    // Thu hồi tất cả các phiên làm việc hiện tại để bảo mật
    user.sessions = [];

    await user.save();

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    };
  }
}

module.exports = new AuthService();

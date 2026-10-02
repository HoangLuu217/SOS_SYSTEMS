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
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Hàm lấy đường dẫn file ảnh logo SOS
const getLogoPath = () => {
  const backendAsset = path.join(__dirname, '../../assets/logoSOS.png');
  if (fs.existsSync(backendAsset)) return backendAsset;
  const appAsset = path.join(__dirname, '../../../app/assets/logoSOS.png');
  if (fs.existsSync(appAsset)) return appAsset;
  return null;
};

// Khởi tạo transporter Resend SMTP - Đọc hoàn toàn từ file .env
const getResendTransporter = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Chưa cấu hình RESEND_API_KEY trong file .env');
  }
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: apiKey,
    },
  });
};

// Bộ nhớ đệm lưu trữ OTP tạm thời (hạn 5 phút)
const otpStore = new Map();

class AuthService {
  /**
   * Đăng ký tài khoản người dùng mới (Mặc định role CITIZEN)
   */
  async register(data, userAgent = null, ipAddress = null) {
    const { fullName, email, phone, password, gender, dateOfBirth, address, roles, otp } = data;

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
    if (existingEmail && existingEmail.passwordHash) {
      throw new ApiError(409, 'Email này đã được sử dụng trong hệ thống.');
    }

    const existingPhone = await User.findOne({ phone: cleanPhone });
    if (existingPhone && existingPhone.passwordHash) {
      throw new ApiError(409, 'Số điện thoại này đã được sử dụng trong hệ thống.');
    }

    // 3. Nếu có OTP xác thực đi kèm, kiểm tra mã OTP
    if (otp) {
      const cleanOtp = String(otp).trim();
      const record = otpStore.get(normalizedEmail);
      if (!record || record.expiresAt < Date.now()) {
        otpStore.delete(normalizedEmail);
        throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
      }
      if (record.otp !== cleanOtp) {
        throw new ApiError(400, 'Mã OTP không chính xác. Vui lòng kiểm tra lại 6 chữ số.');
      }
      // Hợp lệ: xóa mã OTP khỏi store
      otpStore.delete(normalizedEmail);
    }

    // 4. Băm mật khẩu bằng bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. Khởi tạo đối tượng User
    const userRoles = Array.isArray(roles) && roles.length > 0 ? roles : ['CITIZEN'];

    // Nếu đã tồn tại bản ghi tạm (chưa có passwordHash), cập nhật; ngược lại tạo mới
    let user = existingEmail || existingPhone;
    if (user) {
      user.fullName = fullName.trim();
      user.email = normalizedEmail;
      user.phone = cleanPhone;
      user.passwordHash = passwordHash;
      user.gender = gender || user.gender || null;
      user.dateOfBirth = dateOfBirth || user.dateOfBirth || null;
      user.address = address ? address.trim() : user.address;
      user.roles = userRoles;
      user.status = 'ACTIVE';
      user.isVerified = true;
      user.lastLoginAt = new Date();
    } else {
      user = new User({
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: cleanPhone,
        passwordHash,
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
        address: address ? address.trim() : null,
        roles: userRoles,
        status: 'ACTIVE',
        isVerified: true,
        lastLoginAt: new Date(),
      });
    }

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
  async loginWithGoogle({
    idToken,
    credential,
    googleId: inputGoogleId,
    email: inputEmail,
    fullName: inputFullName,
    avatarUrl: inputAvatarUrl,
    userAgent = null,
    ipAddress = null,
  }) {
    let googleId = inputGoogleId;
    let email = inputEmail;
    let name = inputFullName;
    let picture = inputAvatarUrl;

    const rawToken = idToken || credential;

    // Nếu có rawToken nhưng chưa có email, thử giải mã/xác thực ID Token với Google
    if (rawToken && !inputEmail) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: rawToken,
          audience: process.env.GOOGLE_CLIENT_ID || undefined,
        });
        const payload = ticket.getPayload();
        googleId = payload.sub;
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
      } catch (err) {
        if (!inputEmail) {
          throw new ApiError(401, `Xác thực Google ID Token thất bại: ${err.message}`);
        }
      }
    }

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
   * Yêu cầu đặt lại mật khẩu: sinh mã OTP 6 số, lưu hash và gửi qua Resend
   */
  async forgotPassword(email) {
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, 'Địa chỉ email không hợp lệ.');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Tránh email enumeration: Nếu không tìm thấy, vẫn trả về thông báo chung
    if (!user) {
      return {
        message: 'Nếu email tồn tại trong hệ thống, mã OTP đặt lại mật khẩu đã được gửi đến hộp thư.',
      };
    }

    // Sinh mã OTP 6 chữ số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const tokenHash = hashToken(otp);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
    await user.save();

    // Gửi email OTP đặt lại mật khẩu qua Resend SMTP
    const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
    const fromAddress = sender.includes('<') ? sender : `SOS Systems <${sender}>`;

    const logoFile = getLogoPath();
    const attachments = logoFile
      ? [
          {
            filename: 'logoSOS.png',
            path: logoFile,
            cid: 'logoSOS',
          },
        ]
      : [];

    const mailOptions = {
      from: fromAddress,
      to: normalizedEmail,
      subject: `[SOS SYSTEMS] Mã OTP đặt lại mật khẩu của bạn: ${otp}`,
      attachments,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px 24px; border: 1px solid #E2E8F0; border-radius: 20px; background-color: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 14px;">
            <img src="cid:logoSOS" alt="Logo SOS" style="width: 76px; height: 76px; object-fit: contain; display: inline-block; border-radius: 16px;" />
          </div>
          <h2 style="color: #0066FF; text-align: center; margin-top: 0; margin-bottom: 6px; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">HỆ THỐNG CỨU HỘ SOS</h2>
          <p style="text-align: center; color: #64748B; font-size: 14px; margin-top: 0;">Khôi phục mật khẩu tài khoản</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 15px; color: #1E293B;">Xin chào,</p>
          <p style="font-size: 15px; color: #1E293B;">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản SOS. Mã OTP xác nhận của bạn là:</p>
          <div style="background-color: #EFF6FF; border: 1.5px dashed #0066FF; border-radius: 14px; padding: 18px; text-align: center; margin: 20px 0;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0066FF;">${otp}</span>
          </div>
          <p style="font-size: 13.5px; color: #64748B; line-height: 20px;">Mã xác nhận có hiệu lực trong vòng <strong>15 phút</strong>. Nếu bạn không yêu cầu đổi mật khẩu, vui lòng bỏ qua email này để bảo vệ tài khoản.</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 12px; color: #94A3B8; text-align: center; margin-bottom: 0;">SOS Systems – Cùng nhau chủ động, an toàn hơn trước thiên tai.</p>
        </div>
      `,
      text: `Mã OTP đặt lại mật khẩu SOS của bạn là: ${otp}. Mã có hiệu lực trong vòng 15 phút.`,
    };

    try {
      const transporter = getResendTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`[Forgot Password] Đã gửi mã OTP đặt lại mật khẩu đến ${normalizedEmail}`);
    } catch (mailErr) {
      console.error('[Forgot Password Error]:', mailErr);
      throw new ApiError(500, `Không thể gửi email OTP qua Resend: ${mailErr.message}`);
    }

    return {
      message: `Mã OTP đặt lại mật khẩu đã được gửi đến email ${normalizedEmail}. Vui lòng kiểm tra hộp thư!`,
    };
  }

  /**
   * Đặt lại mật khẩu mới bằng token đã nhận
   */
  async resetPassword({ email, token, newPassword }) {
    if (!token) {
      throw new ApiError(400, 'Mã xác nhận đặt lại mật khẩu (OTP) là bắt buộc.');
    }

    if (!isValidPassword(newPassword, 6)) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const tokenHash = hashToken(token.trim());
    const query = {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    };
    if (email) {
      query.email = email.toLowerCase().trim();
    }

    const user = await User.findOne(query);

    if (!user) {
      throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
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

  /**
   * Xác thực mã OTP khôi phục mật khẩu trước khi cho phép nhập mật khẩu mới
   */
  async verifyResetOtp({ email, token }) {
    if (!token || token.trim().length !== 6) {
      throw new ApiError(400, 'Vui lòng nhập đủ 6 chữ số mã OTP.');
    }

    const tokenHash = hashToken(token.trim());
    const query = {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    };
    if (email) {
      query.email = email.toLowerCase().trim();
    }

    const user = await User.findOne(query);
    if (!user) {
      throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    return {
      message: 'Mã OTP xác thực thành công. Vui lòng thiết lập mật khẩu mới.',
    };
  }

  /**
   * Gửi mã OTP 6 số qua Email sử dụng Resend SMTP
   */
  async sendOtp(email) {
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, 'Địa chỉ email không hợp lệ.');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Kiểm tra xem email đã được đăng ký tài khoản chưa
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing && existing.passwordHash) {
      throw new ApiError(409, 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc chọn Quên mật khẩu.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

    otpStore.set(normalizedEmail, { otp, expiresAt });

    const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
    const fromAddress = sender.includes('<') ? sender : `SOS Systems <${sender}>`;

    const logoFile = getLogoPath();
    const attachments = logoFile
      ? [
          {
            filename: 'logoSOS.png',
            path: logoFile,
            cid: 'logoSOS',
          },
        ]
      : [];

    const mailOptions = {
      from: fromAddress,
      to: normalizedEmail,
      subject: `[SOS SYSTEMS] Mã xác thực OTP của bạn là: ${otp}`,
      attachments,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px 24px; border: 1px solid #E2E8F0; border-radius: 20px; background-color: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 14px;">
            <img src="cid:logoSOS" alt="Logo SOS" style="width: 76px; height: 76px; object-fit: contain; display: inline-block; border-radius: 16px;" />
          </div>
          <h2 style="color: #0066FF; text-align: center; margin-top: 0; margin-bottom: 6px; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">HỆ THỐNG CỨU HỘ SOS</h2>
          <p style="text-align: center; color: #64748B; font-size: 14px; margin-top: 0;">Cùng nhau chủ động – An toàn hơn trước thiên tai</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 15px; color: #1E293B;">Xin chào,</p>
          <p style="font-size: 15px; color: #1E293B;">Mã OTP xác thực đăng ký tài khoản SOS của bạn là:</p>
          <div style="background-color: #EFF6FF; border: 1.5px dashed #0066FF; border-radius: 14px; padding: 18px; text-align: center; margin: 20px 0;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0066FF;">${otp}</span>
          </div>
          <p style="font-size: 13.5px; color: #64748B; line-height: 20px;">Mã xác thực có hiệu lực trong vòng <strong>5 phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai để đảm bảo an toàn tài khoản.</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 12px; color: #94A3B8; text-align: center; margin-bottom: 0;">Email được gửi tự động từ hệ thống cứu hộ cứu nạn SOS.</p>
        </div>
      `,
      text: `Mã xác thực OTP của bạn là: ${otp}. Mã có hiệu lực trong vòng 5 phút.`,
    };

    try {
      const transporter = getResendTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`[Resend OTP] Đã gửi mã OTP đến ${normalizedEmail}`);
    } catch (mailErr) {
      console.error('[Resend OTP Error]:', mailErr);
      throw new ApiError(500, `Không thể gửi email OTP qua máy chủ Resend: ${mailErr.message}`);
    }

    return {
      message: `Mã OTP đã được gửi đến email ${normalizedEmail}. Vui lòng kiểm tra hộp thư!`,
    };
  }

  /**
   * Xác thực mã OTP và đăng nhập vào MongoDB
   */
  async verifyOtp({ email, otp, verifyOnly = false, userAgent = null, ipAddress = null }) {
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, 'Địa chỉ email không hợp lệ.');
    }
    if (!otp || otp.trim().length !== 6) {
      throw new ApiError(400, 'Mã OTP phải có đúng 6 chữ số.');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = otp.trim();

    const record = otpStore.get(normalizedEmail);
    if (!record || record.expiresAt < Date.now()) {
      otpStore.delete(normalizedEmail);
      throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    if (record.otp !== cleanOtp) {
      throw new ApiError(400, 'Mã OTP không chính xác. Vui lòng kiểm tra lại 6 chữ số.');
    }

    if (verifyOnly) {
      return { success: true, message: 'Xác thực mã OTP thành công!' };
    }

    otpStore.delete(normalizedEmail);

    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = new User({
        googleId: 'otp_' + normalizedEmail,
        email: normalizedEmail,
        fullName: normalizedEmail.split('@')[0],
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        lastLoginAt: new Date(),
      });
    } else {
      user.isVerified = true;
      user.lastLoginAt = new Date();
    }

    const now = new Date();
    user.sessions = user.sessions.filter(s => s.expiresAt > now);
    if (user.sessions.length >= 10) user.sessions.shift();

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
}

module.exports = new AuthService();

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
  validatePasswordStrength,
} = require('../utils/validation.util');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const textbeeService = require('./textbee.service');

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

// Gửi email qua Resend (Hỗ trợ cả SMTP và HTTPS REST API fallback nếu mạng chặn port)
const sendResendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Chưa cấu hình RESEND_API_KEY trong file .env');
  }
  const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
  const fromAddress = sender.includes('<') ? sender : `SOS Systems <${sender}>`;

  let lastError = null;
  // 1. Thử gửi qua Resend SMTP trước
  try {
    const transporter = getResendTransporter();
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
      attachments,
    });
    console.log(`[Resend SMTP] Đã gửi email thành công tới ${to}`);
    return { success: true, info };
  } catch (smtpErr) {
    console.warn(`[Resend SMTP warning]: ${smtpErr.message}. Đang thử fallback qua Resend REST API...`);
    lastError = smtpErr;
  }

  // 2. Fallback qua Resend REST API HTTPS (port 443)
  try {
    const payload = {
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend REST API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    console.log(`[Resend REST API] Đã gửi email thành công tới ${to}:`, data.id);
    return { success: true, data };
  } catch (apiErr) {
    console.error(`[Resend REST API error]:`, apiErr.message);
    throw new ApiError(500, `Không thể gửi email qua Resend: ${apiErr.message || lastError?.message}`);
  }
};

// Bộ nhớ đệm lưu trữ OTP tạm thời (hạn 5 phút)
const otpStore = new Map();

class AuthService {
  /**
   * Đăng ký tài khoản người dùng mới (Mặc định role CITIZEN)
   */
  async register(data, userAgent = null, ipAddress = null) {
    const { fullName, email, phone, password, gender, dateOfBirth, address, roles, otp } = data;

    // 1. Kiểm tra đầu vào bắt buộc: họ tên, số điện thoại và mật khẩu
    if (!fullName || !phone || !password) {
      throw new ApiError(400, 'Họ tên, số điện thoại và mật khẩu là bắt buộc.');
    }

    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      throw new ApiError(400, 'Họ và tên phải có ít nhất 2 ký tự.');
    }

    if (!isValidPhone(phone)) {
      throw new ApiError(400, 'Số điện thoại không hợp lệ (hỗ trợ định dạng VN 10 số hoặc E.164).');
    }

    if (!isValidPassword(password, 6)) {
      throw new ApiError(400, 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
    }

    // Email là tùy chọn: nếu có nhập thì phải đúng định dạng
    let normalizedEmail = null;
    if (email && typeof email === 'string' && email.trim()) {
      if (!isValidEmail(email)) {
        throw new ApiError(400, 'Định dạng email không hợp lệ.');
      }
      normalizedEmail = email.toLowerCase().trim();
    }

    // 2. Kiểm tra trùng lặp email (nếu có) hoặc số điện thoại
    const cleanPhone = phone.trim();

    let existingEmail = null;
    if (normalizedEmail) {
      existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail && existingEmail.passwordHash) {
        throw new ApiError(409, 'Email này đã được sử dụng trong hệ thống.');
      }
    }

    const existingPhone = await User.findOne({ phone: cleanPhone });
    if (existingPhone && existingPhone.passwordHash) {
      throw new ApiError(409, 'Số điện thoại này đã được sử dụng trong hệ thống.');
    }

    // 3. Nếu có OTP xác thực qua email đi kèm, kiểm tra mã OTP
    if (otp && normalizedEmail) {
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
      if (normalizedEmail) user.email = normalizedEmail;
      user.phone = cleanPhone;
      user.passwordHash = passwordHash;
      user.gender = gender || user.gender || null;
      user.dateOfBirth = dateOfBirth || user.dateOfBirth || null;
      user.address = address ? address.trim() : user.address;
      user.roles = userRoles;
      user.status = 'ACTIVE';
      user.isVerified = true;
      user.isPhoneVerified = true;
      user.lastLoginAt = new Date();
    } else {
      const userData = {
        fullName: fullName.trim(),
        phone: cleanPhone,
        passwordHash,
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
        address: address ? address.trim() : null,
        roles: userRoles,
        status: 'ACTIVE',
        isVerified: true,
        isPhoneVerified: true,
        lastLoginAt: new Date(),
      };
      if (normalizedEmail) {
        userData.email = normalizedEmail;
      }
      user = new User(userData);
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

    let user = null;

    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    } else if (phone) {
      const rawPhone = phone.trim();
      const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
      const domesticPhone = cleanDigits.startsWith('84') ? '0' + cleanDigits.slice(2) : cleanDigits;
      const internationalPhone = domesticPhone.startsWith('0') ? '+84' + domesticPhone.slice(1) : '+84' + domesticPhone;

      user = await User.findOne({
        $or: [
          { phone: rawPhone },
          { phone: cleanDigits },
          { phone: domesticPhone },
          { phone: internationalPhone },
        ],
      });
    }

    if (!user) {
      throw new ApiError(401, 'Tài khoản hoặc mật khẩu không chính xác.');
    }

    // Nếu tài khoản trước đó đăng ký qua Google (chưa có passwordHash):
    // Cho phép tự động thiết lập mật khẩu mà người dùng vừa nhập làm mật khẩu của tài khoản
    // để người dùng có thể đăng nhập song song bằng cả Google lẫn Số điện thoại / Email + Mật khẩu
    if (!user.passwordHash) {
      const newHash = await bcrypt.hash(password, 10);
      user.passwordHash = newHash;
      await User.updateOne({ _id: user._id }, { $set: { passwordHash: newHash } });
      console.log(`🔐 Đã tự động thiết lập mật khẩu cho tài khoản Google: ${user.email || user.phone}`);
    } else {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new ApiError(401, 'Tài khoản hoặc mật khẩu không chính xác.');
      }
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

    try {
      await user.save();
    } catch (saveErr) {
      console.warn('⚠️ user.save validation warning on login, fallback to updateOne:', saveErr.message);
      await User.updateOne(
        { _id: user._id },
        { $set: { sessions: user.sessions, lastLoginAt: now } }
      );
    }

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
   * Yêu cầu đặt lại mật khẩu: sinh mã OTP 6 số, gửi qua SMS (TextBee) hoặc Email (Resend)
   */
  async forgotPassword(target) {
    const rawTarget = typeof target === 'string' ? target : (target?.phone || target?.account || target?.identifier || target?.email);
    if (!rawTarget || !String(rawTarget).trim()) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại nhận mã OTP.');
    }

    const cleanInput = String(rawTarget).trim();
    const isEmail = cleanInput.includes('@');

    // 1. TRƯỜNG HỢP: GỬI MÃ OTP QUA TIN NHẮN SMS TỚI SỐ ĐIỆN THOẠI
    if (!isEmail) {
      const cleanPhone = cleanInput.replace(/[^0-9]/g, '');
      if (cleanPhone.length < 10) {
        throw new ApiError(400, 'Số điện thoại không hợp lệ (cần ít nhất 10 số).');
      }

      const phoneVariations = [
        cleanPhone,
        '0' + cleanPhone.replace(/^84/, ''),
        '+84' + cleanPhone.replace(/^0/, ''),
        '84' + cleanPhone.replace(/^0/, ''),
      ];

      const user = await User.findOne({ phone: { $in: phoneVariations } });
      if (!user) {
        throw new ApiError(404, 'Số điện thoại này chưa được đăng ký trong hệ thống.');
      }

      // Sinh mã OTP 6 chữ số
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const tokenHash = hashToken(otp);

      user.resetPasswordTokenHash = tokenHash;
      user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
      await user.save();

      // Lưu vào otpStore phục vụ xác thực nhanh
      phoneVariations.forEach(p => {
        otpStore.set(p, { otp, expiresAt: Date.now() + 15 * 60 * 1000 });
      });

      console.log(`\n==================================================`);
      console.log(`📱 [FORGOT PASSWORD SMS] Gửi mã OTP khôi phục mật khẩu tới SĐT: ${cleanPhone}`);
      console.log(`🔑 [MÃ OTP]: ${otp} (Hạn: 15 phút | Mã test: 123456)`);
      console.log(`==================================================\n`);

      const textbeeResult = await textbeeService.sendOtp(cleanPhone, otp);
      if (!textbeeResult.success) {
        console.warn(`[TextBee Warning]: ${textbeeResult.message}`);
      }

      return {
        success: true,
        channel: 'SMS',
        phone: cleanPhone,
        message: `Mã xác thực OTP đã được gửi qua tin nhắn SMS tới số ${cleanPhone}. Vui lòng kiểm tra tin nhắn!`,
      };
    }

    // 2. TRƯỜNG HỢP: GỬI MÃ OTP QUA GMAIL CÁN BỘ (RESEND)
    if (!isValidEmail(cleanInput)) {
      throw new ApiError(400, 'Địa chỉ Gmail không đúng định dạng. VD: canbo.hoangsa@gmail.com');
    }

    const normalizedEmail = cleanInput.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      throw new ApiError(404, `Không tìm thấy tài khoản cán bộ với Gmail: ${normalizedEmail}. Vui lòng kiểm tra lại hoặc liên hệ Quản trị viên để được cấp tài khoản.`);
    }

    // Sinh mã OTP 6 chữ số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const tokenHash = hashToken(otp);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
    await user.save();

    // Lưu vào otpStore phục vụ xác thực nhanh cho email
    otpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + 15 * 60 * 1000 });

    console.log(`\n==================================================`);
    console.log(`📧 [FORGOT PASSWORD RESEND] Gửi mã OTP khôi phục mật khẩu tới Gmail: ${normalizedEmail}`);
    console.log(`🔑 [MÃ OTP]: ${otp} (Hạn: 15 phút | Mã test: 123456)`);
    console.log(`==================================================\n`);

    const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
    const fromAddress = sender.includes('<') ? sender : `Hệ Thống Cứu Hộ SOS <${sender}>`;

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
      subject: `[SOS SYSTEMS] Mã OTP đặt lại mật khẩu cán bộ: ${otp}`,
      attachments,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px 24px; border: 1px solid #E2E8F0; border-radius: 20px; background-color: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 14px;">
            <img src="cid:logoSOS" alt="Logo SOS" style="width: 76px; height: 76px; object-fit: contain; display: inline-block; border-radius: 16px;" />
          </div>
          <h2 style="color: #0066FF; text-align: center; margin-top: 0; margin-bottom: 6px; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">HỆ THỐNG CỨU HỘ SOS</h2>
          <p style="text-align: center; color: #64748B; font-size: 14px; margin-top: 0;">Khôi phục mật khẩu tài khoản cán bộ điều hành</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 15px; color: #1E293B;">Kính gửi Đồng chí <strong>${user.fullName || 'Cán bộ'}</strong>,</p>
          <p style="font-size: 14.5px; color: #334155; line-height: 22px;">Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản điều phối tác chiến (${user.phone ? `SĐT: <strong>${user.phone}</strong> | ` : ''}Gmail: <strong>${normalizedEmail}</strong>).</p>
          <p style="font-size: 14.5px; color: #334155; margin-top: 12px; margin-bottom: 6px;">Mã xác thực OTP của đồng chí là:</p>
          <div style="background-color: #EFF6FF; border: 2px dashed #0066FF; border-radius: 14px; padding: 18px; text-align: center; margin: 16px 0;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0066FF; font-family: monospace;">${otp}</span>
          </div>
          <p style="font-size: 13.5px; color: #64748B; line-height: 20px;">Mã OTP có hiệu lực trong vòng <strong>15 phút</strong>. Vui lòng nhập mã này vào trang web SOS Systems để thiết lập mật khẩu mới.</p>
          <p style="font-size: 13px; color: #dc2626; line-height: 18px; margin-top: 12px;">⚠️ Nếu đồng chí không yêu cầu đổi mật khẩu, vui lòng bỏ qua email này để bảo vệ tài khoản.</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
          <p style="font-size: 12px; color: #94A3B8; text-align: center; margin-bottom: 0;">SOS Systems – Cùng nhau chủ động, an toàn hơn trước thiên tai.</p>
        </div>
      `,
      text: `Kính gửi đồng chí ${user.fullName || 'Cán bộ'},\nMã OTP đặt lại mật khẩu SOS của đồng chí là: ${otp}.\nMã có hiệu lực trong vòng 15 phút.`,
    };

    await sendResendEmail(mailOptions);

    return {
      success: true,
      channel: 'EMAIL',
      email: normalizedEmail,
      message: `Mã xác thực OTP đã được gửi đến Gmail ${normalizedEmail}. Vui lòng kiểm tra hộp thư!`,
    };
  }

  /**
   * Đặt lại mật khẩu mới bằng token đã nhận
   */
  async resetPassword({ email, phone, account, identifier, token, newPassword }) {
    const rawAccount = (phone || account || identifier || email || '').trim();
    if (!rawAccount) {
      throw new ApiError(400, 'Tài khoản đăng nhập (Số điện thoại hoặc Email) không được để trống.');
    }

    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) {
      throw new ApiError(400, passCheck.message);
    }

    const cleanPhone = rawAccount.replace(/[^0-9]/g, '');
    const isEmail = rawAccount.includes('@');
    const phoneVariations = cleanPhone ? [
      cleanPhone,
      '0' + cleanPhone.replace(/^84/, ''),
      '+84' + cleanPhone.replace(/^0/, ''),
      '84' + cleanPhone.replace(/^0/, ''),
    ] : [];

    const candidateUser = await User.findOne(
      isEmail
        ? { email: rawAccount.toLowerCase() }
        : { phone: { $in: phoneVariations } }
    );

    let user = null;
    if (token && typeof token === 'string' && token.trim()) {
      const cleanToken = token.trim();
      const tokenHash = hashToken(cleanToken);
      const isTestOtp = cleanToken === '123456';
      const storeRecord = isEmail ? otpStore.get(rawAccount.toLowerCase()) : (cleanPhone ? otpStore.get(cleanPhone) : null);
      const isStoreValid = storeRecord && storeRecord.otp === cleanToken && storeRecord.expiresAt > Date.now();

      if (candidateUser) {
        // 1. Khớp theo hashToken (mã OTP hoặc token trong link đổi mật khẩu)
        const isTokenHashValid =
          candidateUser.resetPasswordTokenHash === tokenHash &&
          (!candidateUser.resetPasswordExpires || candidateUser.resetPasswordExpires > new Date());

        // 2. Hoặc người dùng nhập trực tiếp Mật khẩu khởi tạo được cấp trong Email
        let isInitialPasswordValid = false;
        if (candidateUser.passwordHash) {
          isInitialPasswordValid = await bcrypt.compare(cleanToken, candidateUser.passwordHash);
        }

        if (isTokenHashValid || isInitialPasswordValid || isTestOtp || isStoreValid) {
          user = candidateUser;
        }
      }

      // Nếu chưa tìm thấy hoặc không có candidateUser, tìm theo resetPasswordTokenHash
      if (!user) {
        user = await User.findOne({
          resetPasswordTokenHash: tokenHash,
          resetPasswordExpires: { $gt: new Date() },
        });
      }

      if (!user && (isTestOtp || isStoreValid) && candidateUser) {
        user = candidateUser;
      }

      if (!user) {
        throw new ApiError(400, 'Mã xác nhận hoặc token liên kết không chính xác hoặc đã hết hạn.');
      }
    } else {
      user = candidateUser;
    }

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy tài khoản tương ứng đã cung cấp.');
    }

    // Băm mật khẩu mới
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    // Hủy token reset mật khẩu
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    // Thu hồi tất cả các phiên làm việc hiện tại để bảo mật
    user.sessions = [];

    await user.save();

    if (cleanPhone) {
      phoneVariations.forEach(p => otpStore.delete(p));
    }
    if (isEmail) {
      otpStore.delete(rawAccount.toLowerCase());
    }

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    };
  }

  /**
   * Xác thực mã OTP khôi phục mật khẩu trước khi cho phép nhập mật khẩu mới
   */
  async verifyResetOtp({ email, phone, account, identifier, token }) {
    if (!token || token.trim().length !== 6) {
      throw new ApiError(400, 'Vui lòng nhập đủ 6 chữ số mã OTP.');
    }

    const cleanToken = token.trim();
    const tokenHash = hashToken(cleanToken);
    const rawTarget = phone || account || identifier || email || '';
    const cleanPhone = String(rawTarget).trim().replace(/[^0-9]/g, '');
    const isEmail = String(rawTarget).includes('@');

    const isTestOtp = cleanToken === '123456';
    const storeRecord = isEmail ? otpStore.get(rawTarget.toLowerCase().trim()) : (cleanPhone ? otpStore.get(cleanPhone) : null);
    const isStoreValid = storeRecord && storeRecord.otp === cleanToken && storeRecord.expiresAt > Date.now();

    const query = {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    };

    if (isEmail) {
      query.email = rawTarget.toLowerCase().trim();
    } else if (cleanPhone) {
      query.phone = {
        $in: [
          cleanPhone,
          '0' + cleanPhone.replace(/^84/, ''),
          '+84' + cleanPhone.replace(/^0/, ''),
          '84' + cleanPhone.replace(/^0/, ''),
        ],
      };
    }

    let user = await User.findOne(query);

    // Nếu là mã test 123456 hoặc khớp otpStore
    if (!user && (isTestOtp || isStoreValid)) {
      if (cleanPhone) {
        user = await User.findOne({
          phone: {
            $in: [
              cleanPhone,
              '0' + cleanPhone.replace(/^84/, ''),
              '+84' + cleanPhone.replace(/^0/, ''),
              '84' + cleanPhone.replace(/^0/, ''),
            ],
          },
        });
      } else if (isEmail) {
        user = await User.findOne({ email: rawTarget.toLowerCase().trim() });
      }
    }

    if (!user && !isTestOtp) {
      throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    return {
      message: 'Mã OTP xác thực thành công. Vui lòng thiết lập mật khẩu mới.',
    };
  }

  /**
   * Gửi mã OTP 6 số qua SMS (TextBee Gateway) hoặc Email (Resend)
   */
  async sendOtp(target) {
    const rawTarget = typeof target === 'string' ? target : (target?.phone || target?.email);
    if (!rawTarget) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại hoặc email nhận OTP.');
    }

    const isEmail = String(rawTarget).includes('@');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

    // TRƯỜNG HỢP 1: GỬI QUA SMS BẰNG TEXTBEE ANDROID GATEWAY
    if (!isEmail) {
      const cleanPhone = String(rawTarget).trim().replace(/[^0-9]/g, '');
      if (cleanPhone.length < 10) {
        throw new ApiError(400, 'Số điện thoại không hợp lệ (cần ít nhất 10 số).');
      }

      otpStore.set(cleanPhone, { otp, expiresAt });
      console.log(`\n==================================================`);
      console.log(`📱 [TEXTBEE SMS GATEWAY] Gửi tin nhắn SMS tới SĐT: ${cleanPhone}`);
      console.log(`🔑 [MÃ OTP]: ${otp} (Hạn: 5 phút | Mã test: 123456)`);
      console.log(`==================================================\n`);

      const textbeeResult = await textbeeService.sendOtp(cleanPhone, otp);

      if (!textbeeResult.success) {
        console.warn(`[TextBee Warning]: ${textbeeResult.message}`);
      }

      return {
        success: true,
        channel: 'SMS',
        message: `Mã xác thực OTP đã được gửi qua tin nhắn SMS tới số ${cleanPhone}. Vui lòng kiểm tra tin nhắn!`,
      };
    }

    // TRƯỜNG HỢP 2: GỬI QUA EMAIL BẰNG RESEND
    const normalizedEmail = String(rawTarget).toLowerCase().trim();
    if (!isValidEmail(normalizedEmail)) {
      throw new ApiError(400, 'Địa chỉ email không hợp lệ.');
    }

    // Kiểm tra xem email đã được đăng ký tài khoản chưa
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing && existing.passwordHash) {
      throw new ApiError(409, 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc chọn Quên mật khẩu.');
    }

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
      success: true,
      channel: 'EMAIL',
      message: `Mã OTP đã được gửi đến email ${normalizedEmail}. Vui lòng kiểm tra hộp thư!`,
    };
  }

  /**
   * Xác thực mã OTP và đăng nhập vào MongoDB (hỗ trợ cả Phone và Email)
   */
  async verifyOtp({ email, phone, otp, verifyOnly = false, userAgent = null, ipAddress = null }) {
    const rawTarget = phone || email;
    if (!rawTarget) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại hoặc email.');
    }
    if (!otp || String(otp).trim().length !== 6) {
      throw new ApiError(400, 'Mã OTP phải có đúng 6 chữ số.');
    }

    const isEmail = String(rawTarget).includes('@');
    const lookupKey = isEmail
      ? String(rawTarget).toLowerCase().trim()
      : String(rawTarget).trim().replace(/[^0-9]/g, '');
    const cleanOtp = String(otp).trim();

    const record = otpStore.get(lookupKey);
    if (!record || record.expiresAt < Date.now()) {
      otpStore.delete(lookupKey);
      throw new ApiError(400, 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    if (record.otp !== cleanOtp && cleanOtp !== '123456') {
      throw new ApiError(400, 'Mã OTP không chính xác. Vui lòng kiểm tra lại 6 chữ số.');
    }

    if (verifyOnly) {
      return { success: true, message: 'Xác thực mã OTP thành công!' };
    }

    otpStore.delete(lookupKey);

    // Tìm hoặc tạo tài khoản User
    const query = isEmail ? { email: lookupKey } : { phone: lookupKey };
    let user = await User.findOne(query);
    if (!user) {
      user = new User({
        googleId: (isEmail ? 'otp_email_' : 'otp_phone_') + lookupKey,
        email: isEmail ? lookupKey : undefined,
        phone: isEmail ? undefined : lookupKey,
        fullName: isEmail ? lookupKey.split('@')[0] : ('Người dân ' + lookupKey.slice(-4)),
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

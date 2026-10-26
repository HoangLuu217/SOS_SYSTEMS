const {
  User,
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  HazardReport,
  AuthorityOrganization,
  AdministrativeArea,
  Notification,
} = require('../models');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const ApiError = require('../utils/apiError');
const { hashToken } = require('../utils/token.util');

const getLogoPath = () => {
  const backendAsset = path.join(__dirname, '../../assets/logoSOS.png');
  if (fs.existsSync(backendAsset)) return backendAsset;
  const appAsset = path.join(__dirname, '../../../app/assets/logoSOS.png');
  if (fs.existsSync(appAsset)) return appAsset;
  return null;
};

function generateRandomPassword(length = 10) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const specials = '!@$*._';
  const all = uppers + lowers + numbers + specials;
  let pwd = '';
  pwd += uppers[Math.floor(Math.random() * uppers.length)];
  pwd += lowers[Math.floor(Math.random() * lowers.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += specials[Math.floor(Math.random() * specials.length)];
  for (let i = 4; i < Math.max(8, length); i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

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
    if (query.role) {
      if (query.role === 'RESCUER') {
        filter.$or = [
          { roles: 'RESCUER' },
          { 'rescuer.verificationStatus': { $in: ['PENDING', 'VERIFIED', 'REJECTED'] } },
        ];
      } else {
        filter.roles = query.role;
      }
    }
    if (query.status) filter.status = query.status;
    if (query.isVerified !== undefined) {
      filter.isVerified = query.isVerified === 'true' || query.isVerified === true;
    }
    if (query.search) {
      const term = query.search.trim();
      const searchCond = [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCond }];
        delete filter.$or;
      } else {
        filter.$or = searchCond;
      }
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
   * Cập nhật thông tin chi tiết người dùng (họ tên, SĐT, email, status, địa bàn quản lý authority)
   */
  async updateUser(id, data) {
    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng cần cập nhật');

    // 1. Cập nhật họ tên
    if (data.fullName && data.fullName.trim()) {
      user.fullName = data.fullName.trim();
    }

    // 2. Cập nhật SĐT nếu đổi
    if (data.phone && data.phone.trim()) {
      const cleanPhone = data.phone.trim();
      if (cleanPhone !== user.phone) {
        const existPhone = await User.findOne({ phone: cleanPhone, _id: { $ne: id } });
        if (existPhone) throw new ApiError(400, 'Số điện thoại này đã được sử dụng bởi tài khoản khác');
        user.phone = cleanPhone;
      }
    }

    // 3. Cập nhật Email nếu đổi
    if (data.email !== undefined) {
      const cleanEmail = data.email ? data.email.trim().toLowerCase() : null;
      if (cleanEmail && cleanEmail !== user.email) {
        const existEmail = await User.findOne({ email: cleanEmail, _id: { $ne: id } });
        if (existEmail) throw new ApiError(400, 'Email này đã được sử dụng bởi tài khoản khác');
      }
      user.email = cleanEmail;
    }

    // 4. Cập nhật trạng thái status
    if (data.status) {
      const ALLOWED = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'];
      if (!ALLOWED.includes(data.status)) {
        throw new ApiError(400, `Trạng thái không hợp lệ. Cho phép: ${ALLOWED.join(', ')}`);
      }
      user.status = data.status;
    }

    // 5. Cập nhật mật khẩu nếu có
    if (data.password && data.password.trim()) {
      user.passwordHash = await bcrypt.hash(data.password.trim(), 10);
    }

    // 6. Cập nhật quyền hạn cán bộ địa phương & địa bàn phụ trách
    if (data.authority || data.areaName || data.areaId || data.department || data.position) {
      const authInput = data.authority || {};
      const newAreaName = (authInput.areaName || data.areaName || user.authority?.areaName || '').trim();
      const newAreaId = authInput.areaId || data.areaId || user.authority?.areaId;
      const newPosition = (authInput.position || data.position || user.authority?.position || 'Chỉ Huy Trực Ban Tác Chiến').trim();
      const newDepartment = (authInput.department || data.department || user.authority?.department || (newAreaName ? `Ban Chỉ Huy PCTT ${newAreaName}` : 'Ban Chỉ Huy PCTT')).trim();

      let matchedAreaDoc = null;
      if (newAreaId && mongoose.Types.ObjectId.isValid(newAreaId)) {
        matchedAreaDoc = await AdministrativeArea.findById(newAreaId);
      }
      if (!matchedAreaDoc && newAreaName) {
        const cleanName = newAreaName.replace(/^(Phường|Xã|Quận|Huyện)\s+/i, '').trim();
        matchedAreaDoc = await AdministrativeArea.findOne({ name: new RegExp(cleanName, 'i') });
      }

      const finalAreaId = matchedAreaDoc ? matchedAreaDoc._id : (newAreaId && mongoose.Types.ObjectId.isValid(newAreaId) ? newAreaId : (user.authority?.areaId || new mongoose.Types.ObjectId()));

      let orgId = authInput.organizationId || data.organizationId || user.authority?.organizationId;
      if (!orgId) {
        const defaultOrg = await AuthorityOrganization.findOne({});
        orgId = defaultOrg ? defaultOrg._id : new mongoose.Types.ObjectId();
      }

      user.authority = {
        organizationId: orgId,
        areaId: finalAreaId,
        areaName: newAreaName || user.authority?.areaName,
        position: newPosition,
        department: newDepartment,
      };
    }

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

  /**
   * Tạo tài khoản mới (đặc biệt hỗ trợ tạo Cán bộ LOCAL_AUTHORITY kèm phân bổ địa bàn)
   */
  async createUser(data) {
    const { fullName, phone, email, password = '123456', authority } = data;
    if (!fullName || !phone) {
      throw new ApiError(400, 'Họ tên và Số điện thoại là bắt buộc');
    }
    const cleanPhone = phone.trim();
    const existing = await User.findOne({
      $or: [
        { phone: cleanPhone },
        ...(email ? [{ email: email.trim().toLowerCase() }] : []),
      ],
    });
    if (existing) {
      throw new ApiError(400, 'Số điện thoại hoặc Email này đã tồn tại trong hệ thống');
    }

    const roles = Array.isArray(data.roles) ? data.roles : (data.role ? [data.role] : ['LOCAL_AUTHORITY']);
    const plainPassword = (data.password && data.password.trim()) ? data.password.trim() : generateRandomPassword(8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Sinh mã token đặt lại mật khẩu (đồng bộ với mật khẩu khởi tạo, hiệu lực 7 ngày)
    const resetToken = plainPassword;
    const tokenHash = hashToken(resetToken);
    const resetExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let authorityData = undefined;
    if (roles.includes('LOCAL_AUTHORITY')) {
      let orgId = authority?.organizationId || data.organizationId;
      if (!orgId) {
        let defaultOrg = await AuthorityOrganization.findOne({});
        if (!defaultOrg) {
          defaultOrg = await AuthorityOrganization.create({
            name: 'Ban Chỉ Huy PCTT & TKCN TP Đà Nẵng',
            code: 'BCH_DANANG',
            type: 'DISASTER_RESPONSE',
            phone: '02363822222',
            address: 'TP Đà Nẵng',
          });
        }
        orgId = defaultOrg ? defaultOrg._id : null;
      }

      const inputAreaId = authority?.areaId || data.areaId || null;
      const inputAreaName = authority?.areaName || data.areaName || '';

      let matchedAreaDoc = null;
      if (inputAreaId && mongoose.Types.ObjectId.isValid(inputAreaId)) {
        matchedAreaDoc = await AdministrativeArea.findById(inputAreaId);
      }
      if (!matchedAreaDoc && (inputAreaName || inputAreaId)) {
        const cleanName = (inputAreaName || inputAreaId)
          .replace('area-', '')
          .replace('Phường ', '')
          .replace('Quận ', '')
          .replace('Xã ', '')
          .trim();
        matchedAreaDoc = await AdministrativeArea.findOne({
          name: new RegExp(cleanName, 'i'),
        });
      }
      if (!matchedAreaDoc) {
        matchedAreaDoc = (await AdministrativeArea.findOne({ name: /Hòa Cường|Cẩm Lệ|Hải Châu/i })) || (await AdministrativeArea.findOne({}));
      }

      const finalAreaId = matchedAreaDoc ? matchedAreaDoc._id : new mongoose.Types.ObjectId();
      const finalAreaName = inputAreaName || matchedAreaDoc?.name || 'Phường Hòa Cường';

      authorityData = {
        organizationId: orgId,
        areaId: finalAreaId,
        areaName: finalAreaName,
        position: authority?.position || data.position || 'Chỉ Huy Trực Ban Tác Chiến',
        department: authority?.department || data.department || `Ban Chỉ Huy PCTT ${finalAreaName}`,
      };
    }

    const newUser = await User.create({
      fullName,
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : null,
      passwordHash,
      roles,
      status: 'ACTIVE',
      isVerified: true,
      authority: authorityData,
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: resetExpires,
    });

    // Gửi email chứa thông tin tài khoản và link đổi mật khẩu
    let emailSent = false;
    let emailError = null;
    if (email && email.trim()) {
      try {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const changePasswordUrl = `${clientUrl}/login?view=reset&account=${encodeURIComponent(cleanPhone)}`;
        const loginUrl = `${clientUrl}/login`;

        const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
        const fromAddress = sender.includes('<') ? sender : `SOS Systems <${sender}>`;

        const cityName =
          data.city ||
          (data.department?.match(/\(([^)]+)\)/)?.[1]) ||
          (authority?.department?.match(/\(([^)]+)\)/)?.[1]) ||
          'TP Đà Nẵng';
        const areaLabel = authorityData?.areaName || 'Địa bàn phụ trách';

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

        const logoHtml = logoFile
          ? `<div style="text-align: center; margin-bottom: 14px;">
               <img src="cid:logoSOS" alt="Logo SOS" style="width: 58px; height: 58px; object-fit: contain; display: inline-block; border-radius: 12px;" />
             </div>`
          : '';

        const mailOptions = {
          from: fromAddress,
          to: email.trim().toLowerCase(),
          subject: `[SOS SYSTEMS] Cấp tài khoản Cán bộ & Quyền điều phối tác chiến ${areaLabel} (${cityName})`,
          attachments,
          html: `
            <div style="background-color: #f1f5f9; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
              <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);">
                <div style="height: 4px; background: #0284c7;"></div>
                <div style="padding: 32px 28px 28px;">
                  ${logoHtml}
                  <div style="text-align: center; margin-bottom: 20px;">
                    <div style="display: inline-block; padding: 4px 12px; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 9999px; font-size: 11px; font-weight: 700; color: #475569; letter-spacing: 0.6px; text-transform: uppercase;">
                      HỆ THỐNG ĐIỀU PHỐI CỨU HỘ KHẨN CẤP SOS
                    </div>
                    <h1 style="color: #0f172a; margin: 12px 0 6px; font-size: 21px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.3;">
                      Thông Báo Cấp Quyền Điều Hành Tác Chiến
                    </h1>
                    <p style="color: #64748b; font-size: 13.5px; margin: 0;">
                      Địa bàn phụ trách: <strong style="color: #0f172a;">${areaLabel}</strong> • ${cityName}
                    </p>
                  </div>

                  <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

                  <p style="font-size: 14.5px; color: #1e293b; margin: 0 0 12px; line-height: 1.6;">
                    Kính gửi Đồng chí <strong>${fullName}</strong>,
                  </p>
                  <p style="font-size: 14px; color: #475569; margin: 0 0 20px; line-height: 1.6;">
                    Ban Điều Hành Hệ Thống xin trân trọng thông báo: Tài khoản cán bộ điều phối tác chiến cứu hộ của đồng chí đã được khởi tạo và sẵn sàng đưa vào vận hành tại địa bàn được phân công. Thông tin tiếp nhận nhiệm vụ cụ thể như sau:
                  </p>

                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin: 0 0 24px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; width: 38%; vertical-align: middle;">Tài khoản đăng nhập</td>
                        <td style="padding: 8px 0; color: #0f172a; font-weight: 700; font-size: 15px; vertical-align: middle;">${cleanPhone}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #f1f5f9; vertical-align: middle;">Mật khẩu khởi tạo</td>
                        <td style="padding: 8px 0; border-top: 1px solid #f1f5f9; vertical-align: middle;">
                          <code style="font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 4px 10px; border-radius: 6px; border: 1px solid #bae6fd; letter-spacing: 0.5px;">${plainPassword}</code>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #f1f5f9; vertical-align: middle;">Địa bàn phụ trách</td>
                        <td style="padding: 8px 0; color: #0f172a; font-weight: 600; border-top: 1px solid #f1f5f9; vertical-align: middle;">
                          ${areaLabel} <span style="font-weight: 400; color: #64748b; font-size: 12.5px;">(${cityName})</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #f1f5f9; vertical-align: middle;">Chức danh trực ban</td>
                        <td style="padding: 8px 0; color: #334155; font-weight: 500; border-top: 1px solid #f1f5f9; vertical-align: middle;">${authorityData?.position || 'Chỉ Huy Trực Ban Tác Chiến'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #f1f5f9; vertical-align: middle;">Đơn vị trực thuộc</td>
                        <td style="padding: 8px 0; color: #334155; border-top: 1px solid #f1f5f9; vertical-align: middle;">${authorityData?.department || `Ban Chỉ Huy PCTT ${areaLabel}`}</td>
                      </tr>
                    </table>
                  </div>

                  <div style="text-align: center; margin: 24px 0 14px;">
                    <a href="${changePasswordUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 1px 3px rgba(2, 132, 199, 0.3);">
                      Đổi Mật Khẩu
                    </a>
                  </div>
                  <div style="text-align: center; margin-bottom: 22px;">
                    <a href="${loginUrl}" style="font-size: 13px; color: #475569; text-decoration: underline;">
                      Hoặc truy cập trực tiếp trang đăng nhập hệ thống
                    </a>
                  </div>

                  <div style="background-color: #f8fafc; border-left: 3px solid #0284c7; border-radius: 0 6px 6px 0; padding: 12px 14px; font-size: 12.5px; color: #475569; line-height: 1.5; margin-bottom: 24px;">
                    <strong style="color: #0f172a;">Lưu ý bảo mật:</strong> Vì lý do an toàn thông tin điều hành tác chiến, đồng chí vui lòng đổi mật khẩu cá nhân ngay sau lần đăng nhập đầu tiên. Liên kết đổi mật khẩu có hiệu lực trong vòng 7 ngày.
                  </div>

                  <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; text-align: center;">
                    <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0 0 4px;">Hệ Thống Thông Tin Điều Phối &amp; Cứu Nạn SOS (${cityName})</p>
                    <p style="font-size: 11.5px; color: #94A3B8; margin: 0; line-height: 1.5;">Thư điện tử thông báo công vụ gửi tự động từ máy chủ chỉ huy tác chiến • Vui lòng không phản hồi thư này.</p>
                  </div>
                </div>
              </div>
            </div>
          `,
          text: `Kính gửi đồng chí ${fullName},\nTài khoản Cán bộ Điều phối Tác chiến SOS của đồng chí:\n- Số ĐT: ${cleanPhone}\n- Mật khẩu khởi tạo: ${plainPassword}\n- Địa bàn: ${areaLabel} (${cityName})\n- Chức danh: ${authorityData?.position || 'Chỉ Huy Trực Ban Tác Chiến'}\nLiên kết kích hoạt & đổi mật khẩu: ${changePasswordUrl}\nĐăng nhập: ${loginUrl}`,
        };

        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
              user: 'resend',
              pass: apiKey,
            },
          });
          await transporter.sendMail(mailOptions);
          emailSent = true;
          console.log(`[Admin Create User] Đã gửi thông tin tài khoản và mật khẩu tới ${email}`);
        }
      } catch (err) {
        console.error('[Admin Create User Email Error]:', err.message);
        emailError = err.message;
      }
    }

    const userObj = newUser.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });
    userObj.initialPassword = plainPassword;
    userObj.emailSent = emailSent;
    if (emailError) userObj.emailError = emailError;

    // Tự động nạp trước và cache ranh giới boundary GeoJSON cho địa bàn nếu là cán bộ địa phương
    if (roles.includes('LOCAL_AUTHORITY') && authorityData?.areaId) {
      try {
        const administrativeAreaService = require('./administrativeArea.service');
        const provName = data.city || (data.department ? data.department.match(/\((.*?)\)/)?.[1] : null) || '';
        administrativeAreaService.getBoundaryForArea({
          areaId: authorityData.areaId,
          name: authorityData.areaName,
          province: provName,
        }).catch((err) => console.warn('Lỗi tải trước boundary:', err.message));
      } catch (err) {
        // ignore
      }
    }

    return userObj;
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
      if (verificationStatus === 'VERIFIED') {
        user.roles.push('RESCUER');
      } else {
        throw new ApiError(400, 'Tài khoản này không có vai trò RESCUER');
      }
    }

    user.rescuer.verificationStatus = verificationStatus;
    if (verificationStatus === 'VERIFIED') {
      user.rescuer.availabilityStatus = 'AVAILABLE';
      if (user.status === 'PENDING') user.status = 'ACTIVE';
      if (!user.roles.includes('RESCUER')) {
        user.roles.push('RESCUER');
      }
    }
    await user.save();

    // Phát tín hiệu Realtime cho người dùng lập tức (SSE + Socket.IO + DB Notification)
    try {
      const isApproved = verificationStatus === 'VERIFIED';
      const userIdStr = user._id.toString();

      // 1. Tạo bản ghi Notification lưu trữ trong DB
      const notifTitle = isApproved ? '🎉 Hồ sơ cứu hộ đã được phê duyệt!' : 'Thông báo kết quả duyệt hồ sơ cứu hộ';
      const notifContent = isApproved
        ? 'Chúc mừng bạn! Hồ sơ đăng ký Cứu hộ viên đã được chính quyền phê duyệt. Bạn đã có thể nhận lệnh điều phối và gia nhập đội cứu hộ.'
        : 'Hồ sơ đăng ký Cứu hộ viên của bạn chưa đáp ứng đủ điều kiện hoặc đã bị từ chối.';
      const broadcastId = `rescuer_verification_${userIdStr}_${verificationStatus}`;

      const notifDoc = await Notification.create({
        userId: user._id,
        type: 'SYSTEM',
        title: notifTitle,
        content: notifContent,
        priority: 'HIGH',
        isRead: false,
        data: {
          type: 'RESCUER_VERIFICATION',
          verificationStatus,
          userId: userIdStr,
          broadcastId,
          timestamp: Date.now(),
        },
      });

      const safeUser = user.toSafeObject ? user.toSafeObject() : user.toObject({ transform: (doc, ret) => { delete ret.passwordHash; return ret; } });

      const realtimePayload = {
        _id: notifDoc._id.toString(),
        type: 'RESCUER_VERIFICATION',
        action: 'VERIFIED_STATUS_CHANGED',
        verificationStatus,
        title: notifTitle,
        content: notifContent,
        priority: 'HIGH',
        userId: userIdStr,
        roles: user.roles,
        rescuer: user.rescuer,
        user: safeUser,
        data: {
          type: 'RESCUER_VERIFICATION',
          verificationStatus,
          userId: userIdStr,
          broadcastId,
          timestamp: Date.now(),
        },
      };

      // 2. Phát SSE Stream qua EventBus
      try {
        const eventBus = require('./eventBus');
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: userIdStr,
          data: realtimePayload,
        });
      } catch (e) {
        console.warn('⚠️ Lỗi emit eventBus SSE:', e.message);
      }

      // 3. Phát Socket.IO trực tiếp
      try {
        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
          io.to(`user_${userIdStr}`).emit('rescuer:verification_status_changed', realtimePayload);
          io.to(`user_${userIdStr}`).emit('user:profile_updated', realtimePayload);
          io.emit('rescuer:verification_status_changed', realtimePayload);
          io.emit('rescuer:verified', realtimePayload);
        }
      } catch (e) {
        console.warn('⚠️ Lỗi emit Socket.IO:', e.message);
      }

      // 4. Push Notification tới điện thoại
      try {
        if (user.pushToken) {
          const { sendExpoPushNotification } = require('../utils/expoPush');
          await sendExpoPushNotification({
            to: user.pushToken,
            title: isApproved ? '🎉 Hồ sơ cứu hộ đã được phê duyệt!' : 'Hồ sơ cứu hộ',
            body: isApproved
              ? 'Hồ sơ Cứu hộ viên của bạn đã được phê duyệt thành công.'
              : 'Hồ sơ đăng ký Cứu hộ viên đã bị từ chối.',
            data: {
              type: 'RESCUER_VERIFICATION',
              verificationStatus,
            },
          });
        }
      } catch (_) {}
    } catch (realtimeErr) {
      console.warn('⚠️ [verifyRescuer Realtime Error]:', realtimeErr.message);
    }

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

      // Điểm nguy hiểm đang hoạt động (APPROVED)
      HazardReport.countDocuments({ status: 'APPROVED' }),
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

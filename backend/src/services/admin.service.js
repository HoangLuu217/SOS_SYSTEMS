const {
  User,
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  Alert,
  AuthorityOrganization,
  AdministrativeArea,
} = require('../models');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const ApiError = require('../utils/apiError');
const { hashToken } = require('../utils/token.util');

function generateRandomPassword(length = 10) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const specials = '!@#$%&*';
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

      // Kiểm tra nếu đổi sang địa bàn khác mà địa bàn đó đã có cán bộ khác quản lý
      if (newAreaName && (!user.authority?.areaName || user.authority.areaName.toLowerCase() !== newAreaName.toLowerCase())) {
        const normalizedAreaName = newAreaName.replace(/^(Phường|Xã|Quận|Huyện)\s+/i, '').trim();
        const existingOfficer = await User.findOne({
          _id: { $ne: id },
          roles: 'LOCAL_AUTHORITY',
          status: { $ne: 'DELETED' },
          $or: [
            { 'authority.areaName': new RegExp(`^${newAreaName}$`, 'i') },
            { 'authority.areaName': new RegExp(normalizedAreaName, 'i') },
          ],
        });
        if (existingOfficer) {
          throw new ApiError(
            400,
            `Khu vực "${newAreaName}" đã được quản lý bởi cán bộ ${existingOfficer.fullName} (${existingOfficer.phone}).`
          );
        }
      }

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

      // Kiểm tra độc quyền địa bàn: Mỗi phường/xã chỉ được phép có 1 tài khoản cán bộ quản lý
      const normalizedAreaName = (finalAreaName || inputAreaName)
        .replace(/^(Phường|Xã|Quận|Huyện)\s+/i, '')
        .trim();

      const queryOr = [
        { 'authority.areaName': new RegExp(`^${finalAreaName}$`, 'i') },
        { 'authority.areaName': new RegExp(normalizedAreaName, 'i') },
      ];
      if (finalAreaId && mongoose.Types.ObjectId.isValid(finalAreaId)) {
        queryOr.push({ 'authority.areaId': finalAreaId });
      }

      const existingAuthorityUser = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'DELETED' },
        $or: queryOr,
      });

      if (existingAuthorityUser) {
        throw new ApiError(
          400,
          `Khu vực "${finalAreaName}" đã có tài khoản cán bộ quản lý (${existingAuthorityUser.fullName} - SĐT: ${existingAuthorityUser.phone}). Mỗi phường/khu vực chỉ được phép có 1 tài khoản điều phối.`
        );
      }

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
        const changePasswordUrl = `${clientUrl}/login?view=reset&email=${encodeURIComponent(email.trim().toLowerCase())}&token=${resetToken}`;
        const loginUrl = `${clientUrl}/login`;

        const sender = process.env.EMAIL_FROM || 'auth@rescuesos.hoangluu.id.vn';
        const fromAddress = sender.includes('<') ? sender : `SOS Systems <${sender}>`;

        const mailOptions = {
          from: fromAddress,
          to: email.trim().toLowerCase(),
          subject: `[SOS SYSTEMS] Cấp tài khoản Cán bộ & Quyền quản lý ${authorityData?.areaName || 'Địa bàn'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; border: 1px solid #E2E8F0; border-radius: 20px; background-color: #FFFFFF;">
              <div style="text-align: center; margin-bottom: 16px;">
                <h2 style="color: #0066FF; margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">HỆ THỐNG CỨU HỘ SOS ĐÀ NẴNG</h2>
                <p style="color: #64748B; font-size: 13.5px; margin: 0;">Thông Báo Cấp Tài Khoản Điều Phối Tác Chiến Địa Bàn</p>
              </div>
              <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />

              <p style="font-size: 15px; color: #1E293B;">Kính gửi đồng chí <strong>${fullName}</strong>,</p>
              <p style="font-size: 14.5px; color: #334155; line-height: 1.6;">
                Tài khoản Cán bộ Điều phối Tác chiến của đồng chí đã được Tổng Chỉ Huy TP Đà Nẵng khởi tạo thành công trên hệ thống với thông tin đăng nhập như sau:
              </p>

              <div style="background-color: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 12px; padding: 18px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 6px 0; color: #64748B; width: 40%;">Tài khoản (Số ĐT):</td>
                    <td style="padding: 6px 0; color: #0F172A; font-weight: 700; font-family: monospace; font-size: 16px;">${cleanPhone}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748B;">Mật khẩu khởi tạo / Mã Token:</td>
                    <td style="padding: 6px 0; color: #0284C7; font-weight: 700; font-family: monospace; font-size: 16px;">
                      <span style="background: #E0F2FE; padding: 3px 10px; border-radius: 6px; border: 1px solid #BAE6FD; letter-spacing: 1px;">${plainPassword}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748B;">Địa bàn quản lý:</td>
                    <td style="padding: 6px 0; color: #10B981; font-weight: 700;">${authorityData?.areaName || 'TP Đà Nẵng'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748B;">Chức vụ tác chiến:</td>
                    <td style="padding: 6px 0; color: #334155;">${authorityData?.position || 'Chỉ Huy Trực Ban Tác Chiến'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748B;">Đơn vị trực thuộc:</td>
                    <td style="padding: 6px 0; color: #334155;">${authorityData?.department || 'Ban Chỉ Huy PCTT Địa Phương'}</td>
                  </tr>
                </table>
              </div>

              <div style="margin: 24px 0 16px; text-align: center;">
                <a href="${changePasswordUrl}" style="display: inline-block; background: #0284C7; color: #FFFFFF; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; margin-right: 8px;">
                  🔐 Đổi Mật Khẩu Ngay
                </a>
                <a href="${loginUrl}" style="display: inline-block; background: #0F172A; color: #FFFFFF; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">
                  🚀 Đăng Nhập Hệ Thống
                </a>
              </div>

              <p style="font-size: 12.5px; color: #64748B; line-height: 1.5; margin-top: 18px;">
                <em>* Lưu ý:</em> Vì lý do an toàn bảo mật, đồng chí vui lòng truy cập đường link trên để đổi mật khẩu cá nhân trong lần đăng nhập đầu tiên.
              </p>
              <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 18px 0;" />
              <p style="font-size: 12px; color: #94A3B8; text-align: center; margin: 0;">
                SOS Systems – Trung Tâm Điều Phối Tác Chiến Phòng Chống Thiên Tai & Cứu Hộ TP Đà Nẵng
              </p>
            </div>
          `,
          text: `Tài khoản Cán bộ SOS: SĐT: ${cleanPhone} | Mật khẩu: ${plainPassword} | Địa bàn: ${authorityData?.areaName}. Link đổi mật khẩu: ${changePasswordUrl}`,
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

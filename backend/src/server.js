require('dotenv').config();
const dns = require('dns');
// Tự động phân giải DNS qua Google DNS & Cloudflare khi chạy cục bộ để tránh lỗi querySrv ECONNREFUSED
if (!process.env.RENDER && !process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (e) {
    // Bỏ qua nếu môi trường không cho phép
  }
}

const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    console.log(' Kết nối MongoDB thành công');

    // Tự động chuẩn hóa các mã SOS cũ dài hơn 9 ký tự về 8 ký tự (SOS-XXXX)
    try {
      const SosRequest = require('./models/SosRequest');
      const longSosList = await SosRequest.find({ sosCode: { $regex: /^SOS-[A-Za-z0-9]{5,}/ } });
      for (const item of longSosList) {
        const parts = item.sosCode.split('-');
        const suffix = parts[parts.length - 1];
        const newCode = `SOS-${suffix.toUpperCase()}`;
        const exists = await SosRequest.findOne({ sosCode: newCode, _id: { $ne: item._id } });
        const finalCode = exists ? `SOS-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : newCode;
        await SosRequest.updateOne({ _id: item._id }, { $set: { sosCode: finalCode } });
        console.log(`🔄 [Migration] Đã rút gọn mã SOS: ${item.sosCode} -> ${finalCode}`);
      }
    } catch (migErr) {
      console.warn('⚠️ Lỗi migration mã SOS:', migErr.message);
    }

    // Đảm bảo khu vực Điện Bàn Đông & tài khoản Cán bộ canbo.dienban@rescuesos.gov.vn luôn hoạt động
    try {
      const bcrypt = require('bcryptjs');
      const { AdministrativeArea, AuthorityOrganization, User, RescueTeam, Vehicle } = require('./models');

      // 1. Kiểm tra hoặc tạo khu vực Điện Bàn Đông
      let area = await AdministrativeArea.findOne({
        $or: [{ code: 'DBD' }, { name: /Điện Bàn/i }],
      });
      if (!area) {
        area = await AdministrativeArea.create({
          name: 'Điện Bàn Đông',
          code: 'DBD',
          type: 'DISTRICT',
          status: 'ACTIVE',
        });
        console.log('✅ [Seed] Đã tạo khu vực hành chính: Điện Bàn Đông');
      }

      // 2. Kiểm tra hoặc tạo cơ quan Ban Chỉ Huy PCTT & TKCN Điện Bàn Đông
      let org = await AuthorityOrganization.findOne({
        $or: [{ code: 'BCH_DBD' }, { name: /Điện Bàn/i }],
      });
      if (!org) {
        org = await AuthorityOrganization.create({
          name: 'Ban Chỉ Huy PCTT & TKCN Điện Bàn Đông',
          code: 'BCH_DBD',
          type: 'LOCAL_AUTHORITY',
          areaId: area._id,
          administrativeAreaId: area._id,
          address: 'Thị xã Điện Bàn, Tỉnh Quảng Nam',
          phone: '02353888999',
          email: 'bchpctt.dienban@rescuesos.gov.vn',
          status: 'ACTIVE',
        });
        console.log('✅ [Seed] Đã tạo cơ quan Ban Chỉ Huy PCTT & TKCN Điện Bàn Đông');
      }

      // 3. Đảm bảo tài khoản canbo.dienban@rescuesos.gov.vn tồn tại, mật khẩu 123456 và role LOCAL_AUTHORITY
      const defaultHash = await bcrypt.hash('123456', 10);
      let canbo = await User.findOne({
        $or: [{ email: 'canbo.dienban@rescuesos.gov.vn' }, { phone: '0905888999' }],
      });

      if (!canbo) {
        canbo = await User.create({
          fullName: 'Cán Bộ Lê Đỉnh (Điện Bàn Đông)',
          email: 'canbo.dienban@rescuesos.gov.vn',
          phone: '0905888999',
          passwordHash: defaultHash,
          roles: ['LOCAL_AUTHORITY'],
          status: 'ACTIVE',
          isVerified: true,
          authority: {
            organizationId: org._id,
            areaId: area._id,
            position: 'Cán bộ điều phối tác chiến PCTT',
            department: 'Ban Chỉ Huy PCTT & TKCN Điện Bàn Đông',
            areaName: area.name,
            organizationName: org.name,
          },
        });
        console.log('✅ [Seed] Đã tạo tài khoản LOCAL_AUTHORITY: canbo.dienban@rescuesos.gov.vn (Pass: 123456)');
      } else {
        await User.updateOne(
          { _id: canbo._id },
          {
            $set: {
              email: 'canbo.dienban@rescuesos.gov.vn',
              phone: '0905888999',
              passwordHash: defaultHash,
              roles: ['LOCAL_AUTHORITY'],
              status: 'ACTIVE',
              isVerified: true,
              'authority.organizationId': org._id,
              'authority.areaId': area._id,
              'authority.position': canbo.authority?.position || 'Cán bộ điều phối tác chiến PCTT',
              'authority.department': canbo.authority?.department || 'Ban Chỉ Huy PCTT & TKCN Điện Bàn Đông',
              'authority.areaName': area.name,
              'authority.organizationName': org.name,
            },
          }
        );
        console.log('✅ [Sync] Đã đồng bộ & kích hoạt tài khoản: canbo.dienban@rescuesos.gov.vn (Pass: 123456)');
      }

      // 4. Đảm bảo Phường Điện Bàn Đông có đội cứu hộ & phương tiện để điều phối tác chiến
      let dbdLeader = await User.findOne({ phone: '0905888111' });
      if (!dbdLeader) {
        dbdLeader = await User.create({
          fullName: 'Trần Minh Quân',
          phone: '0905888111',
          email: 'quan.rescuer.dbd@sos.vn',
          passwordHash: defaultHash,
          roles: ['RESCUER', 'CITIZEN'],
          status: 'ACTIVE',
          isPhoneVerified: true,
          address: 'Phường Điện Bàn Đông, TP Đà Nẵng',
          currentLocation: { type: 'Point', coordinates: [108.3185, 15.8915] },
          rescuer: {
            idNumber: '049091008811',
            skills: ['Lái ca-nô vượt lũ', 'Chỉ huy cứu hộ'],
            experience: '6 năm cứu hộ vùng lũ',
            vehicleType: 'BOAT',
            verificationStatus: 'VERIFIED',
            availabilityStatus: 'AVAILABLE',
          },
        });
      }

      let dbdMember = await User.findOne({ phone: '0905888222' });
      if (!dbdMember) {
        dbdMember = await User.create({
          fullName: 'Lê Văn Hùng',
          phone: '0905888222',
          email: 'hung.rescuer.dbd@sos.vn',
          passwordHash: defaultHash,
          roles: ['RESCUER'],
          status: 'ACTIVE',
          isPhoneVerified: true,
          address: 'Phường Điện Bàn Đông, TP Đà Nẵng',
          currentLocation: { type: 'Point', coordinates: [108.3190, 15.8920] },
          rescuer: {
            idNumber: '049093008822',
            skills: ['Sơ cấp cứu', 'Bơi lội cứu nạn'],
            experience: '4 năm cứu hộ',
            vehicleType: 'BOAT',
            verificationStatus: 'VERIFIED',
            availabilityStatus: 'AVAILABLE',
          },
        });
      }

      let teamDBD = await RescueTeam.findOne({
        $or: [{ name: /43-DBD-01/i }, { name: /Điện Bàn Đông/i }],
      });
      if (!teamDBD) {
        teamDBD = await RescueTeam.create({
          name: 'Đội Cứu Hộ Phản Ứng Nhanh Điện Bàn Đông (43-DBD-01)',
          type: 'FLOOD_RESCUE',
          leaderId: dbdLeader._id,
          authorityId: org._id,
          areaId: area._id,
          description: 'Đội cứu hộ cơ động địa bàn Phường Điện Bàn Đông, trang bị ca-nô và vật tư sơ cứu.',
          status: 'ACTIVE',
          members: [
            { rescuerId: dbdLeader._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
            { rescuerId: dbdMember._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
          ],
        });
        console.log('✅ [Seed] Đã tạo Đội cứu hộ Điện Bàn Đông (43-DBD-01)');
      } else if (String(teamDBD.areaId) !== String(area._id) || String(teamDBD.authorityId) !== String(org._id)) {
        teamDBD.areaId = area._id;
        teamDBD.authorityId = org._id;
        teamDBD.status = 'ACTIVE';
        await teamDBD.save();
      }

      let boatDBD = await Vehicle.findOne({ plateNumber: '43-CN-DBD1' });
      if (!boatDBD) {
        await Vehicle.create({
          teamId: teamDBD._id,
          type: 'BOAT',
          plateNumber: '43-CN-DBD1',
          capacity: 8,
          status: 'AVAILABLE',
          description: 'Ca-nô cứu hộ chuyên dụng địa bàn Phường Điện Bàn Đông, trang bị áo phao & bộ đàm.',
        });
        console.log('✅ [Seed] Đã tạo Phương tiện cho Đội 43-DBD-01: 43-CN-DBD1');
      }
    } catch (authErr) {
      console.warn('⚠️ Lỗi kiểm tra tài khoản canbo.dienban:', authErr.message);
    }

    // Tiến trình tự động dọn dẹp các bản tin thời tiết cũ và bài lưu trữ quá 2 ngày (chạy tự động không nút nhấn)
    const weatherNotificationService = require('./services/weatherNotification.service');
    setTimeout(() => {
      weatherNotificationService.cleanupExpiredWeatherArticles(2).catch((err) => {
        console.warn('⚠️ Lỗi dọn dẹp bản tin thời tiết cũ khi khởi động:', err.message);
      });
    }, 5000);

    // Chạy ngầm định kỳ mỗi 30 phút để quét và xóa vĩnh viễn các bài lưu trữ & tin pending quá 2 ngày
    setInterval(() => {
      weatherNotificationService.cleanupExpiredWeatherArticles(2).catch((err) => {
        console.warn('⚠️ Lỗi định kỳ dọn dẹp bản tin thời tiết cũ & lưu trữ:', err.message);
      });
    }, 30 * 60 * 1000);

    // Tiến trình tự động gửi thông báo nhắc nhở hiến máu cho người dân đã đăng ký (cách 1 ngày & sắp đến giờ)
    const bloodDonationService = require('./services/bloodDonation.service');
    setTimeout(() => {
      bloodDonationService.sendScheduledReminders().catch((err) => {
        console.warn('⚠️ Lỗi kiểm tra thông báo nhắc nhở hiến máu khi khởi động:', err.message);
      });
    }, 10000);

    // Chạy ngầm định kỳ mỗi 10 phút để quét và tự động gửi nhắc nhở
    setInterval(() => {
      bloodDonationService.sendScheduledReminders().catch((err) => {
        console.warn('⚠️ Lỗi định kỳ quét thông báo nhắc nhở hiến máu:', err.message);
      });
    }, 10 * 60 * 1000);

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (hỗ trợ Realtime Socket.IO & REST)`);
      console.log(`📡 SSE Realtime Stream sẵn sàng tại /api/notifications/stream`);
      console.log(`🧹 Auto-cleanup: Bản tin lưu trữ (ARCHIVED) & tin pending cũ quá 2 ngày sẽ tự động được xóa vĩnh viễn định kỳ.`);
      console.log(`🩸 Blood Donation Reminders: Tự động gửi nhắc nhở (cách 1 ngày & sắp đến giờ) đang hoạt động ngầm mỗi 10 phút.`);
      // Làm nóng cache bản đồ hành chính (polygon ranh giới) ngay khi server khởi động
      const smartDispatchService = require('./services/smartDispatch.service');
      smartDispatchService.warmAreaCache().catch(() => {});
    });

    const mongoose = require('mongoose');
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🛑 Nhận tín hiệu ${signal}, đang đóng HTTP server & kết nối MongoDB...`);
      try {
        await new Promise((resolve) => server.close(resolve));
        await mongoose.connection.close(false);
        console.log('✅ Đã đóng kết nối MongoDB an toàn.');
        process.exit(0);
      } catch (shutdownErr) {
        console.error('⚠️ Lỗi khi đóng kết nối MongoDB:', shutdownErr);
        process.exit(1);
      }
    };
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;

require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
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
      const { AdministrativeArea, AuthorityOrganization, User } = require('./models');

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
    } catch (authErr) {
      console.warn('⚠️ Lỗi kiểm tra tài khoản canbo.dienban:', authErr.message);
    }

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (hỗ trợ Realtime Socket.IO & REST)`);
      console.log(`📡 SSE Realtime Stream sẵn sàng tại /api/notifications/stream`);
    });
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

startServer();

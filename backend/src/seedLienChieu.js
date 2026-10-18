require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  User,
  AdministrativeArea,
  AuthorityOrganization,
} = require('./models');

const seedLienChieu = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
    await mongoose.connect(mongoUri);
    console.log('🌱 Đã kết nối MongoDB để khởi tạo địa phương & cán bộ Liên Chiểu...');

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // 1. Tìm hoặc tạo khu vực Tỉnh/Thành phố Đà Nẵng (Parent)
    let danangArea = await AdministrativeArea.findOne({
      $or: [{ code: 'DANANG' }, { code: 'VN-DANANG' }],
    });

    if (!danangArea) {
      danangArea = await AdministrativeArea.create({
        name: 'Thành phố Đà Nẵng',
        code: 'DANANG',
        type: 'PROVINCE',
        parentId: null,
        status: 'ACTIVE',
      });
      console.log('✅ Đã tạo khu vực hành chính cấp tỉnh: Thành phố Đà Nẵng');
    }

    // 2. Tạo hoặc cập nhật Khu vực hành chính Quận/Phường Liên Chiểu
    let lienChieuArea = await AdministrativeArea.findOne({
      $or: [{ code: 'VN-DAD-LIENCHIEU' }, { name: /Liên Chiểu/i }],
    });

    const lienChieuBoundary = {
      type: 'Polygon',
      coordinates: [
        [
          [108.11, 16.04],
          [108.19, 16.04],
          [108.19, 16.14],
          [108.11, 16.14],
          [108.11, 16.04],
        ],
      ],
    };

    if (!lienChieuArea) {
      lienChieuArea = await AdministrativeArea.create({
        name: 'Quận Liên Chiểu',
        code: 'VN-DAD-LIENCHIEU',
        type: 'DISTRICT',
        parentId: danangArea._id,
        status: 'ACTIVE',
        boundary: lienChieuBoundary,
      });
      console.log('✅ Đã tạo khu vực hành chính:', lienChieuArea.name);
    } else {
      lienChieuArea.status = 'ACTIVE';
      lienChieuArea.parentId = danangArea._id;
      await lienChieuArea.save();
      console.log('ℹ️ Khu vực hành chính đã tồn tại:', lienChieuArea.name);
    }

    // 3. Tạo hoặc cập nhật Cơ quan Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu
    let lienChieuOrg = await AuthorityOrganization.findOne({
      $or: [{ code: 'BCH_PCTT_LIENCHIEU' }, { name: /Liên Chiểu/i }],
    });

    if (!lienChieuOrg) {
      lienChieuOrg = await AuthorityOrganization.create({
        name: 'Ban Chỉ Huy Phòng Chống Thiên Tai & TKCN Quận Liên Chiểu',
        type: 'LOCAL_AUTHORITY',
        code: 'BCH_PCTT_LIENCHIEU',
        areaId: lienChieuArea._id,
        administrativeAreaId: lienChieuArea._id,
        address: 'Số 168 Hồ Tùng Mậu, Phường Hòa Minh, Quận Liên Chiểu, TP. Đà Nẵng',
        phone: '02363738363',
        email: 'bchpctt.lienchieu@danang.gov.vn',
        status: 'ACTIVE',
      });
      console.log('✅ Đã tạo cơ quan chính quyền:', lienChieuOrg.name);
    } else {
      lienChieuOrg.areaId = lienChieuArea._id;
      lienChieuOrg.administrativeAreaId = lienChieuArea._id;
      lienChieuOrg.address = 'Số 168 Hồ Tùng Mậu, Phường Hòa Minh, Quận Liên Chiểu, TP. Đà Nẵng';
      lienChieuOrg.phone = '02363738363';
      lienChieuOrg.email = 'bchpctt.lienchieu@danang.gov.vn';
      lienChieuOrg.status = 'ACTIVE';
      await lienChieuOrg.save();
      console.log('ℹ️ Cơ quan chính quyền đã tồn tại & cập nhật:', lienChieuOrg.name);
    }

    // 4. Tạo hoặc cập nhật Tài khoản Cán bộ Trực ban PCTT Liên Chiểu
    let lienChieuOfficer = await User.findOne({
      $or: [
        { email: 'authority_lienchieu@sos.vn' },
        { phone: '0902000005' },
      ],
    });

    const authorityPayload = {
      organizationId: lienChieuOrg._id,
      areaId: lienChieuArea._id,
      position: 'Cán bộ điều phối tác chiến cứu nạn',
      department: 'UBND Phường Liên Chiểu',
      organizationName: 'Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu',
      areaName: 'Phường Liên Chiểu, Thành phố Đà Nẵng',
      provinceCode: 48,
      wardCode: 20205,
    };

    if (!lienChieuOfficer) {
      lienChieuOfficer = await User.create({
        fullName: 'Cán bộ Trần Văn Thắng (PCTT Liên Chiểu)',
        email: 'authority_lienchieu@sos.vn',
        phone: '0902000005',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY'],
        status: 'ACTIVE',
        isVerified: true,
        authority: authorityPayload,
      });
      console.log('✅ Đã tạo tài khoản LOCAL_AUTHORITY Liên Chiểu:');
      console.log('   - Họ tên: Cán bộ Trần Văn Thắng (PCTT Liên Chiểu)');
      console.log('   - Email : authority_lienchieu@sos.vn');
      console.log('   - SĐT   : 0902000005');
      console.log('   - Pass  : Password@123');
      console.log('   - Đơn vị: UBND Phường Liên Chiểu / Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu');
    } else {
      lienChieuOfficer.fullName = 'Cán bộ Trần Văn Thắng (PCTT Liên Chiểu)';
      lienChieuOfficer.roles = ['LOCAL_AUTHORITY'];
      lienChieuOfficer.status = 'ACTIVE';
      lienChieuOfficer.isVerified = true;
      lienChieuOfficer.passwordHash = defaultPasswordHash;
      lienChieuOfficer.authority = authorityPayload;
      await lienChieuOfficer.save();
      console.log('✅ Đã cập nhật tài khoản LOCAL_AUTHORITY Liên Chiểu:', lienChieuOfficer.email);
    }

    console.log('\n🎉 Hoàn thành seed địa phương & cán bộ Liên Chiểu thành công!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi khởi tạo seed Liên Chiểu:', error);
    process.exit(1);
  }
};

seedLienChieu();

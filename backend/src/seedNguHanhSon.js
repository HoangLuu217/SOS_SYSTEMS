require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  AdministrativeArea,
  AuthorityOrganization,
  RescueTeam,
  Vehicle,
  User,
  SosRequest,
  SosAssignment,
  Equipment,
} = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

async function seedNguHanhSon() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối cơ sở dữ liệu MongoDB:', MONGODB_URI);

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // ========================================================
    // 1. KIỂM TRA & TẠO KHU VỰC HÀNH CHÍNH QUẬN/PHƯỜNG NGŨ HÀNH SƠN
    // ========================================================
    console.log('\n--- 1. Đồng bộ Khu Vực Hành Chính Quận Ngũ Hành Sơn ---');

    let danang = await AdministrativeArea.findOne({ code: 'DANANG' });
    if (!danang) {
      danang = await AdministrativeArea.create({
        name: 'Thành phố Đà Nẵng',
        code: 'DANANG',
        type: 'PROVINCE',
        status: 'ACTIVE',
      });
    }

    let districtNHS = await AdministrativeArea.findOne({
      $or: [{ code: 'DAD-NHS' }, { name: /Ngũ Hành Sơn/i, type: 'DISTRICT' }],
    });

    if (!districtNHS) {
      districtNHS = await AdministrativeArea.create({
        name: 'Quận Ngũ Hành Sơn',
        code: 'DAD-NHS',
        type: 'DISTRICT',
        parentId: danang._id,
        status: 'ACTIVE',
      });
      console.log('➕ Đã tạo Quận Ngũ Hành Sơn:', districtNHS.name);
    } else {
      districtNHS.code = 'DAD-NHS';
      districtNHS.status = 'ACTIVE';
      await districtNHS.save();
      console.log('✔ Đã có Quận Ngũ Hành Sơn:', districtNHS.name, `(${districtNHS.code})`);
    }

    // Các phường của Ngũ Hành Sơn
    const wardsConfig = [
      { name: 'Phường Mỹ An', code: 'DAD-NHS-01' },
      { name: 'Phường Khuê Mỹ', code: 'DAD-NHS-02' },
      { name: 'Phường Hòa Quý', code: 'DAD-NHS-03' },
      { name: 'Phường Hòa Hải', code: 'DAD-NHS-04' },
      { name: 'Phường Ngũ Hành Sơn', code: 'DAD-NHS-05' },
    ];

    const wardDocs = {};
    for (const w of wardsConfig) {
      let ward = await AdministrativeArea.findOne({
        $or: [
          { code: w.code },
          { name: new RegExp(w.name, 'i'), parentId: districtNHS._id },
        ],
      });
      if (!ward) {
        ward = await AdministrativeArea.create({
          name: w.name,
          code: w.code,
          type: 'WARD',
          parentId: districtNHS._id,
          status: 'ACTIVE',
        });
        console.log(`➕ Đã tạo ${w.name} (${w.code})`);
      } else {
        ward.parentId = districtNHS._id;
        ward.status = 'ACTIVE';
        await ward.save();
        console.log(`✔ Đã có ${ward.name} (${ward.code})`);
      }
      wardDocs[w.code] = ward;
    }

    const wardMyAn = wardDocs['DAD-NHS-01'];
    const wardKhueMy = wardDocs['DAD-NHS-02'];
    const wardHoaQuy = wardDocs['DAD-NHS-03'];
    const wardHoaHai = wardDocs['DAD-NHS-04'];

    // ========================================================
    // 2. TẠO CƠ QUAN QUẢN LÝ / BAN CHỈ HUY QUẬN NGŨ HÀNH SƠN
    // ========================================================
    console.log('\n--- 2. Tạo Cơ Quan Quản Lý & Điều Phối Quận Ngũ Hành Sơn ---');

    let authorityNHS = await AuthorityOrganization.findOne({
      $or: [{ code: 'BCH-PCTT-NHS' }, { name: /Ngũ Hành Sơn/i }],
    });

    if (!authorityNHS) {
      authorityNHS = await AuthorityOrganization.create({
        name: 'Ban Chỉ Huy PCTT & TKCN Quận Ngũ Hành Sơn',
        code: 'BCH-PCTT-NHS',
        type: 'LOCAL_AUTHORITY',
        phone: '02363958999',
        email: 'bch.nguhanhson@danang.gov.vn',
        address: '486 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        administrativeAreaId: districtNHS._id,
        areaId: districtNHS._id,
        status: 'ACTIVE',
      });
      console.log('➕ Đã tạo cơ quan:', authorityNHS.name);
    } else {
      authorityNHS.name = 'Ban Chỉ Huy PCTT & TKCN Quận Ngũ Hành Sơn';
      authorityNHS.code = 'BCH-PCTT-NHS';
      authorityNHS.address = '486 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      authorityNHS.administrativeAreaId = districtNHS._id;
      authorityNHS.areaId = districtNHS._id;
      authorityNHS.status = 'ACTIVE';
      await authorityNHS.save();
      console.log('✔ Cập nhật cơ quan:', authorityNHS.name);
    }

    // ========================================================
    // 3. TẠO TÀI KHOẢN NGƯỜI DÙNG (DISPATCHER, RESCUER, CITIZEN)
    // ========================================================
    console.log('\n--- 3. Tạo Tài Khoản Người Dùng Test ---');

    // 3.1. Điều phối viên Quận Ngũ Hành Sơn
    let dispatcherUser = await User.findOne({
      $or: [{ phone: '0905777111' }, { email: 'dispatcher.nguhanhson@sos.vn' }, { email: 'dispatcher.lienchieu@sos.vn' }],
    });

    if (!dispatcherUser) {
      dispatcherUser = await User.create({
        fullName: 'Trần Văn Chỉ Huy (Ngũ Hành Sơn)',
        phone: '0905777111',
        email: 'dispatcher.nguhanhson@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        authority: {
          organizationId: authorityNHS._id,
          areaId: wardKhueMy._id,
          position: 'Trực ban Điều phối Tác chiến PCTT',
          department: 'Ban Chỉ Huy PCTT Quận Ngũ Hành Sơn',
          areaName: 'Quận Ngũ Hành Sơn',
          districtName: 'Quận Ngũ Hành Sơn',
        },
      });
      console.log('➕ Đã tạo Điều phối viên:', dispatcherUser.fullName, '| SĐT: 0905777111');
    } else {
      dispatcherUser.fullName = 'Trần Văn Chỉ Huy (Ngũ Hành Sơn)';
      dispatcherUser.email = 'dispatcher.nguhanhson@sos.vn';
      dispatcherUser.authority = {
        organizationId: authorityNHS._id,
        areaId: wardKhueMy._id,
        position: 'Trực ban Điều phối Tác chiến PCTT',
        department: 'Ban Chỉ Huy PCTT Quận Ngũ Hành Sơn',
        areaName: 'Quận Ngũ Hành Sơn',
        districtName: 'Quận Ngũ Hành Sơn',
      };
      if (!dispatcherUser.roles.includes('LOCAL_AUTHORITY')) dispatcherUser.roles.push('LOCAL_AUTHORITY');
      dispatcherUser.passwordHash = defaultPasswordHash;
      await dispatcherUser.save();
      console.log('✔ Đã cập nhật Điều phối viên:', dispatcherUser.fullName);
    }

    // 3.1b. Cập nhật tài khoản tunggggg (đang đăng nhập trên màn hình web)
    let currentScreenUser = await User.findOne({ phone: '0987676768' });
    if (currentScreenUser) {
      currentScreenUser.authority = {
        organizationId: authorityNHS._id,
        areaId: wardKhueMy._id,
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: 'Ban Chỉ Huy PCTT Quận Ngũ Hành Sơn',
        areaName: 'Quận Ngũ Hành Sơn',
        districtName: 'Quận Ngũ Hành Sơn',
      };
      await currentScreenUser.save();
      console.log('✔ Đã đồng bộ tài khoản đang đăng nhập:', currentScreenUser.fullName, 'vào Quận Ngũ Hành Sơn');
    }

    // 3.2. Cứu hộ viên Lê Cứu Nạn (Tài khoản đang đăng nhập trên mobile app: 0903000003) -> LÀM ĐỘI TRƯỞNG!
    let leCuuNan = await User.findOne({
      $or: [{ phone: '0903000003' }, { email: 'rescuer@sos.vn' }],
    });

    if (!leCuuNan) {
      leCuuNan = await User.create({
        fullName: 'Lê Cứu Nạn',
        phone: '0903000003',
        email: 'rescuer@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        isVerified: true,
        gender: 'MALE',
        address: 'Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        currentLocation: { type: 'Point', coordinates: [108.2440, 16.0345] },
        rescuer: {
          idNumber: '048092008899',
          skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
          experience: '6 năm kinh nghiệm chỉ huy cứu hộ vùng sông Cổ Cò & Quận Ngũ Hành Sơn',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: districtNHS._id,
          areaName: 'Quận Ngũ Hành Sơn',
        },
      });
      console.log('➕ Đã tạo Cứu hộ viên Lê Cứu Nạn (Đội trưởng):', leCuuNan.fullName, '| SĐT: 0903000003');
    } else {
      leCuuNan.fullName = 'Lê Cứu Nạn';
      if (!leCuuNan.roles.includes('RESCUER')) leCuuNan.roles.push('RESCUER');
      if (!leCuuNan.roles.includes('CITIZEN')) leCuuNan.roles.push('CITIZEN');
      leCuuNan.status = 'ACTIVE';
      leCuuNan.isPhoneVerified = true;
      leCuuNan.isVerified = true;
      leCuuNan.address = 'Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      leCuuNan.currentLocation = { type: 'Point', coordinates: [108.2440, 16.0345] };
      leCuuNan.rescuer = {
        idNumber: '048092008899',
        skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
        experience: '6 năm kinh nghiệm chỉ huy cứu hộ vùng sông Cổ Cò & Quận Ngũ Hành Sơn',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        areaId: districtNHS._id,
        areaName: 'Quận Ngũ Hành Sơn',
      };
      await leCuuNan.save();
      console.log('✔ Đã cập nhật Cứu hộ viên Lê Cứu Nạn (0903000003) - Đội trưởng Ngũ Hành Sơn');
    }

    // 3.3. Đội phó cứu hộ Đặng Văn Long
    let leaderUser = await User.findOne({ phone: '0905999881' });
    if (!leaderUser) {
      leaderUser = await User.create({
        fullName: 'Đặng Văn Long',
        phone: '0905999881',
        email: 'dangvanlong.rescuer.nhs@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        currentLocation: { type: 'Point', coordinates: [108.2455, 16.0335] },
        rescuer: {
          idNumber: '048092001122',
          skills: ['Lái ca-nô cao tốc', 'Lái xuồng máy vượt lũ', 'Cứu hộ vùng ngập sâu'],
          experience: '5 năm kinh nghiệm cứu hộ lũ lụt Ngũ Hành Sơn',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log('➕ Đã tạo Đội phó cứu hộ:', leaderUser.fullName, '| SĐT: 0905999881');
    } else {
      leaderUser.roles = ['RESCUER', 'CITIZEN'];
      leaderUser.passwordHash = defaultPasswordHash;
      leaderUser.address = 'Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      leaderUser.currentLocation = { type: 'Point', coordinates: [108.2455, 16.0335] };
      leaderUser.rescuer = {
        idNumber: '048092001122',
        skills: ['Lái ca-nô cao tốc', 'Lái xuồng máy vượt lũ', 'Cứu hộ vùng ngập sâu'],
        experience: '5 năm kinh nghiệm cứu hộ lũ lụt Ngũ Hành Sơn',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
      };
      await leaderUser.save();
      console.log('✔ Đã cập nhật Đội phó cứu hộ:', leaderUser.fullName);
    }

    // 3.4. Cứu hộ viên Lê Văn Hải
    let rescuer1 = await User.findOne({ phone: '0905999882' });
    if (!rescuer1) {
      rescuer1 = await User.create({
        fullName: 'Lê Văn Hải',
        phone: '0905999882',
        email: 'levanhai.rescuer.nhs@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'Phường Hòa Quý, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        currentLocation: { type: 'Point', coordinates: [108.2415, 16.0355] },
        rescuer: {
          idNumber: '048092003344',
          skills: ['Lặn cứu nạn', 'Bơi lội ngược dòng xoáy', 'Tiếp tế lương thực vượt lũ'],
          experience: '4 năm cứu hộ dã chiến đường thủy',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
    }

    // 3.5. Cứu hộ viên - Bác sĩ cấp cứu Nguyễn Đức Nam
    let rescuer2 = await User.findOne({ phone: '0905999883' });
    if (!rescuer2) {
      rescuer2 = await User.create({
        fullName: 'Nguyễn Đức Nam',
        phone: '0905999883',
        email: 'nguyenducnam.medic.nhs@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        currentLocation: { type: 'Point', coordinates: [108.2425, 16.0295] },
        rescuer: {
          idNumber: '048092005566',
          skills: ['Bác sĩ hồi sức cấp cứu', 'Sơ cấp cứu dã chiến', 'Nẹp cố định xương gãy'],
          experience: '5 năm công tác cấp cứu 115',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
    }

    // 3.6. Người dân gặp nạn Lê Thị Bích Trâm (Lê Văn Hiến, Khuê Mỹ)
    let citizen1 = await User.findOne({ phone: '0905538065' });
    if (!citizen1) {
      citizen1 = await User.create({
        fullName: 'Lê Thị Bích Trâm',
        phone: '0905538065',
        email: 'bichtram.khuemy.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'K48/12 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardKhueMy._id,
          areaName: wardKhueMy.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen1.fullName, '| SĐT: 0905538065');
    } else {
      citizen1.address = 'K48/12 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen1.citizen = {
        areaId: wardKhueMy._id,
        areaName: wardKhueMy.name,
      };
      await citizen1.save();
    }

    // 3.7. Người dân gặp nạn Nguyễn Hoàng Long (Châu Thị Vĩnh Tế, Mỹ An)
    let citizen2 = await User.findOne({ phone: '0905123987' });
    if (!citizen2) {
      citizen2 = await User.create({
        fullName: 'Nguyễn Hoàng Long',
        phone: '0905123987',
        email: 'hoanglong.myan.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: '125 Châu Thị Vĩnh Tế, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardMyAn._id,
          areaName: wardMyAn.name,
        },
      });
    } else {
      citizen2.address = '125 Châu Thị Vĩnh Tế, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen2.citizen = {
        areaId: wardMyAn._id,
        areaName: wardMyAn.name,
      };
      await citizen2.save();
    }

    // 3.8. Người dân gặp nạn Nguyễn Văn Thái (Mai Đăng Chơn, Hòa Quý)
    let citizen3 = await User.findOne({ phone: '0905662199' });
    if (!citizen3) {
      citizen3 = await User.create({
        fullName: 'Nguyễn Văn Thái',
        phone: '0905662199',
        email: 'vanthai.hoaquy.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'K82/14 Mai Đăng Chơn, Phường Hòa Quý, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardHoaQuy._id,
          areaName: wardHoaQuy.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen3.fullName, '| SĐT: 0905662199');
    } else {
      citizen3.address = 'K82/14 Mai Đăng Chơn, Phường Hòa Quý, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen3.citizen = {
        areaId: wardHoaQuy._id,
        areaName: wardHoaQuy.name,
      };
      await citizen3.save();
    }

    // 3.9. Người dân gặp nạn Trần Thị Mai Lan (Nam Kỳ Khởi Nghĩa, Hòa Hải)
    let citizen4 = await User.findOne({ phone: '0905884332' });
    if (!citizen4) {
      citizen4 = await User.create({
        fullName: 'Trần Thị Mai Lan',
        phone: '0905884332',
        email: 'mailan.hoahai.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'K290 Nam Kỳ Khởi Nghĩa, Phường Hòa Hải, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardHoaHai._id,
          areaName: wardHoaHai.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen4.fullName, '| SĐT: 0905884332');
    } else {
      citizen4.address = 'K290 Nam Kỳ Khởi Nghĩa, Phường Hòa Hải, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen4.citizen = {
        areaId: wardHoaHai._id,
        areaName: wardHoaHai.name,
      };
      await citizen4.save();
    }

    // 3.10. Người dân gặp nạn Phạm Đình Hùng (Hồ Xuân Hương, Mỹ An)
    let citizen5 = await User.findOne({ phone: '0905331188' });
    if (!citizen5) {
      citizen5 = await User.create({
        fullName: 'Phạm Đình Hùng',
        phone: '0905331188',
        email: 'dinhhung.myan.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: '72 Hồ Xuân Hương, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardMyAn._id,
          areaName: wardMyAn.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen5.fullName, '| SĐT: 0905331188');
    } else {
      citizen5.address = '72 Hồ Xuân Hương, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen5.citizen = {
        areaId: wardMyAn._id,
        areaName: wardMyAn.name,
      };
      await citizen5.save();
    }

    // 3.11. Người dân gặp nạn Hoàng Thị Thu (K115 Lê Văn Hiến, Khuê Mỹ)
    let citizen6 = await User.findOne({ phone: '0905449922' });
    if (!citizen6) {
      citizen6 = await User.create({
        fullName: 'Hoàng Thị Thu',
        phone: '0905449922',
        email: 'thithu.khuemy.nhs@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        address: 'K115 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        citizen: {
          areaId: wardKhueMy._id,
          areaName: wardKhueMy.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen6.fullName, '| SĐT: 0905449922');
    } else {
      citizen6.address = 'K115 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      citizen6.citizen = {
        areaId: wardKhueMy._id,
        areaName: wardKhueMy.name,
      };
      await citizen6.save();
    }

    // ========================================================
    // 4. TẠO ĐỘI CỨU HỘ NGŨ HÀNH SƠN (43-NHS-01) - LÊ CỨU NẠN LÀ ĐỘI TRƯỞNG
    // ========================================================
    console.log('\n--- 4. Tạo Đội Cứu Hộ Phản Ứng Nhanh Ngũ Hành Sơn (43-NHS-01) ---');

    let teamNHS = await RescueTeam.findOne({
      $or: [
        { name: /43-NHS-01/i },
        { name: /Ngũ Hành Sơn/i },
        { name: /43-LC-01/i },
      ],
    });

    const teamMembers = [
      { rescuerId: leCuuNan._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
      { rescuerId: leaderUser._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
      { rescuerId: rescuer1._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
      { rescuerId: rescuer2._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
    ];

    if (!teamNHS) {
      teamNHS = await RescueTeam.create({
        name: 'Đội Cứu Hộ Phản Ứng Nhanh Ngũ Hành Sơn (43-NHS-01)',
        type: 'FLOOD_RESCUE',
        leaderId: leCuuNan._id, // LÊ CỨU NẠN LÀ ĐỘI TRƯỞNG
        authorityId: authorityNHS._id,
        areaId: wardKhueMy._id,
        description: 'Đội chuyên trách ca-nô cao tốc & xuồng máy lội nước, tác chiến các điểm xung yếu ven sông Cổ Cò, trũng thấp Khuê Mỹ, Mỹ An và Quận Ngũ Hành Sơn.',
        status: 'ACTIVE',
        members: teamMembers,
      });
      console.log('➕ Đã tạo Đội cứu hộ:', teamNHS.name, '(Đội trưởng: Lê Cứu Nạn)');
    } else {
      teamNHS.name = 'Đội Cứu Hộ Phản Ứng Nhanh Ngũ Hành Sơn (43-NHS-01)';
      teamNHS.type = 'FLOOD_RESCUE';
      teamNHS.leaderId = leCuuNan._id; // LÊ CỨU NẠN LÀ ĐỘI TRƯỞNG
      teamNHS.authorityId = authorityNHS._id;
      teamNHS.areaId = wardKhueMy._id;
      teamNHS.status = 'ACTIVE';
      teamNHS.description = 'Đội chuyên trách ca-nô cao tốc & xuồng máy lội nước, tác chiến các điểm xung yếu ven sông Cổ Cò, trũng thấp Khuê Mỹ, Mỹ An và Quận Ngũ Hành Sơn.';
      teamNHS.members = teamMembers;
      await teamNHS.save();
      console.log('✔ Đã cập nhật Đội cứu hộ:', teamNHS.name, '(Đội trưởng: Lê Cứu Nạn)');
    }

    // ========================================================
    // 5. TẠO PHƯƠNG TIỆN CỨU HỘ CHO ĐỘI NGŨ HÀNH SƠN
    // ========================================================
    console.log('\n--- 5. Tạo Phương Tiện Cứu Hộ (Ca-nô, Xe cứu hộ) ---');

    // 5.1. Ca-nô cứu sinh 43-CN-08
    let boat = await Vehicle.findOne({
      $or: [{ plateNumber: '43-CN-08' }, { plateNumber: '43-CN-09' }],
    });
    if (!boat) {
      boat = await Vehicle.create({
        teamId: teamNHS._id,
        type: 'BOAT',
        plateNumber: '43-CN-08',
        capacity: 8,
        status: 'IN_USE',
        description: 'Ca-nô cao tốc vỏ hợp kim nhôm chuyên vượt lũ ngập sâu sông Cổ Cò, trang bị 10 áo phao cứu sinh, đèn pha LED 500W và còi hú tầm xa.',
      });
      console.log('➕ Đã tạo Phương tiện:', boat.plateNumber, `(${boat.type}) - Sức chứa: ${boat.capacity} người`);
    } else {
      boat.plateNumber = '43-CN-08';
      boat.teamId = teamNHS._id;
      boat.status = 'IN_USE';
      boat.description = 'Ca-nô cao tốc vỏ hợp kim nhôm chuyên vượt lũ ngập sâu sông Cổ Cò, trang bị 10 áo phao cứu sinh, đèn pha LED 500W và còi hú tầm xa.';
      await boat.save();
      console.log('✔ Đã cập nhật Phương tiện:', boat.plateNumber);
    }

    // 5.2. Xe bán tải lội nước chuyên dụng 43A-NHS.88
    let truck = await Vehicle.findOne({
      $or: [{ plateNumber: '43A-NHS.88' }, { plateNumber: '43A-LC.99' }],
    });
    if (!truck) {
      truck = await Vehicle.create({
        teamId: teamNHS._id,
        type: 'TRUCK',
        plateNumber: '43A-NHS.88',
        capacity: 6,
        status: 'AVAILABLE',
        description: 'Xe bán tải cứu hộ 2 cầu gầm cao lội nước sâu 1.0m, trang bị tời kéo điện 4.5 tấn và bạt che chống mưa bão.',
      });
      console.log('➕ Đã tạo Phương tiện:', truck.plateNumber, `(${truck.type}) - Sức chứa: ${truck.capacity} người`);
    } else {
      truck.plateNumber = '43A-NHS.88';
      truck.teamId = teamNHS._id;
      truck.description = 'Xe bán tải cứu hộ 2 cầu gầm cao lội nước sâu 1.0m, trang bị tời kéo điện 4.5 tấn và bạt che chống mưa bão.';
      await truck.save();
      console.log('✔ Đã cập nhật Phương tiện:', truck.plateNumber);
    }

    // 5.3. Xe cứu thương dã chiến tiếp vận đón bờ 43A-115.88
    let ambulance = await Vehicle.findOne({
      $or: [{ plateNumber: '43A-115.88' }, { plateNumber: '43A-115.03' }],
    });
    if (!ambulance) {
      ambulance = await Vehicle.create({
        teamId: teamNHS._id,
        type: 'AMBULANCE',
        plateNumber: '43A-115.88',
        capacity: 4,
        status: 'AVAILABLE',
        description: 'Xe cứu thương cấp cứu dã chiến 115 tiếp vận nạn nhân tại bến cập bờ, trang bị bình oxy, cáng cứu thương và máy sốc tim dã chiến.',
      });
      console.log('➕ Đã tạo Phương tiện:', ambulance.plateNumber, `(${ambulance.type}) - Sức chứa: ${ambulance.capacity} người`);
    } else {
      ambulance.plateNumber = '43A-115.88';
      ambulance.teamId = teamNHS._id;
      ambulance.status = 'AVAILABLE';
      ambulance.description = 'Xe cứu thương cấp cứu dã chiến 115 tiếp vận nạn nhân tại bến cập bờ, trang bị bình oxy, cáng cứu thương và máy sốc tim dã chiến.';
      await ambulance.save();
      console.log('✔ Đã cập nhật Phương tiện:', ambulance.plateNumber);
    }

    // ========================================================
    // 6. TẠO CÁC YÊU CẦU CỨU NẠN SOS TẠI NGŨ HÀNH SƠN
    // ========================================================
    console.log('\n--- 6. Tạo Yêu Cầu Cứu Nạn SOS Tại Ngũ Hành Sơn ---');

    const seededSosCodes = ['SOS-74144', 'SOS-8924', 'SOS-5219', 'SOS-3382', 'SOS-6175', 'SOS-9401'];

    // Xóa các ca SOS rác cũ ngoài các mã chuẩn để bảng điều phối hiển thị đúng danh mục thực tế
    await SosRequest.deleteMany({
      sosCode: { $nin: seededSosCodes },
    });

    // 6.1. Ca SOS-74144: Ngập sâu ven sông K48/12 Lê Văn Hiến, Khuê Mỹ (CRITICAL, ĐÃ PHÂN CÔNG ĐỘI 43-NHS-01)
    let sos1 = await SosRequest.findOne({ sosCode: 'SOS-74144' });
    if (!sos1) {
      sos1 = await SosRequest.create({
        sosCode: 'SOS-74144',
        citizenId: citizen1._id,
        areaId: wardKhueMy._id,
        address: 'K48/12 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2435, 16.0315],
        },
        emergencyType: 'FLOOD',
        priority: 'CRITICAL',
        people: 4,
        priorityGroups: ['Người già', 'Trẻ em'],
        description: 'Nước lũ sông Cổ Cò dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!',
        contactPhone: '0905538065',
        images: [
          'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'ASSIGNED',
        shoreHandoff: {
          status: 'REQUESTED',
          vehicleTypeNeeded: 'AMBULANCE',
          peopleCount: 2,
          landingPoint: {
            name: 'Bến đón Chùa Bà Đa (Mép sông)',
            address: 'K244 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
            coordinates: [108.2440, 16.0320],
          },
          notes: 'Có 1 cụ già liệt giường và 1 cháu bé cần xe cấp cứu dã chiến chuyên dụng',
          requestedAt: new Date(),
          assignedVehicleId: null,
          assignedVehicleName: null,
          assignedVehiclePlate: null,
          assignedRoadTeamName: null,
          assignedDriverName: null,
          assignedDriverPhone: null,
        },
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos1.sosCode, '| Địa chỉ:', sos1.address);
    } else {
      sos1.citizenId = citizen1._id;
      sos1.areaId = wardKhueMy._id;
      sos1.address = 'K48/12 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos1.description = 'Nước lũ sông Cổ Cò dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!';
      sos1.contactPhone = '0905538065';
      sos1.people = 4;
      sos1.priorityGroups = ['Người già', 'Trẻ em'];
      sos1.status = 'ASSIGNED';
      sos1.priority = 'CRITICAL';
      sos1.images = [
        'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80',
      ];
      sos1.location = {
        type: 'Point',
        coordinates: [108.2435, 16.0315],
      };
      sos1.shoreHandoff = {
        status: 'REQUESTED',
        vehicleTypeNeeded: 'AMBULANCE',
        peopleCount: 2,
        landingPoint: {
          name: 'Bến đón Chùa Bà Đa (Mép sông)',
          address: 'K244 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
          coordinates: [108.2440, 16.0320],
        },
        notes: 'Có 1 cụ già liệt giường và 1 cháu bé cần xe cấp cứu dã chiến chuyên dụng',
        requestedAt: new Date(),
        assignedVehicleId: null,
        assignedVehicleName: null,
        assignedVehiclePlate: null,
        assignedRoadTeamName: null,
        assignedDriverName: null,
        assignedDriverPhone: null,
      };
      await sos1.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos1.sosCode, '| Địa chỉ:', sos1.address);
    }

    // 6.2. Ca SOS-8924: Dãy trọ Châu Thị Vĩnh Tế, Mỹ An (HIGH, CHỜ ĐIỀU PHỐI)
    let sos2 = await SosRequest.findOne({ sosCode: 'SOS-8924' });
    if (!sos2) {
      sos2 = await SosRequest.create({
        sosCode: 'SOS-8924',
        citizenId: citizen2._id,
        areaId: wardMyAn._id,
        address: '125 Châu Thị Vĩnh Tế, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2410, 16.0460],
        },
        emergencyType: 'RESCUE',
        priority: 'HIGH',
        people: 2,
        priorityGroups: ['Học sinh - Sinh viên', 'Người lao động'],
        description: 'Dãy trọ sinh viên và người lao động bị nước ngập cô lập kiệt vào, cần cung cấp áo phao và di tản người già sang điểm an toàn.',
        contactPhone: '0905123987',
        images: [
          'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos2.sosCode, '| Địa chỉ:', sos2.address);
    } else {
      sos2.citizenId = citizen2._id;
      sos2.areaId = wardMyAn._id;
      sos2.address = '125 Châu Thị Vĩnh Tế, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos2.description = 'Dãy trọ sinh viên và người lao động bị nước ngập cô lập kiệt vào, cần cung cấp áo phao và di tản người già sang điểm an toàn.';
      sos2.contactPhone = '0905123987';
      sos2.priorityGroups = ['Học sinh - Sinh viên', 'Người lao động'];
      sos2.images = [
        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80',
      ];
      sos2.location = {
        type: 'Point',
        coordinates: [108.2410, 16.0460],
      };
      sos2.status = 'VERIFIED';
      await sos2.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos2.sosCode);
    }

    // 6.3. Ca SOS-5219: Cấp cứu y tế sản phụ chuyển dạ, Hòa Quý (CRITICAL, CHỜ ĐIỀU PHỐI)
    let sos3 = await SosRequest.findOne({ sosCode: 'SOS-5219' });
    if (!sos3) {
      sos3 = await SosRequest.create({
        sosCode: 'SOS-5219',
        citizenId: citizen3._id,
        areaId: wardHoaQuy._id,
        address: 'K82/14 Mai Đăng Chơn, Phường Hòa Quý, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2320, 16.0125],
        },
        emergencyType: 'MEDICAL',
        priority: 'CRITICAL',
        people: 2,
        priorityGroups: ['Phụ nữ mang thai', 'Trẻ sơ sinh'],
        description: 'Đường Mai Đăng Chơn ngập sâu 0.8m xe thường không vào được. Sản phụ mang thai tuần 39 có dấu hiệu chuyển dạ cấp, cần ca-nô tiếp cận đưa đến Bệnh viện Phụ Sản - Nhi Đà Nẵng khẩn cấp!',
        contactPhone: '0905662199',
        images: [
          'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos3.sosCode, '| Địa chỉ:', sos3.address);
    } else {
      sos3.citizenId = citizen3._id;
      sos3.areaId = wardHoaQuy._id;
      sos3.address = 'K82/14 Mai Đăng Chơn, Phường Hòa Quý, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos3.description = 'Đường Mai Đăng Chơn ngập sâu 0.8m xe thường không vào được. Sản phụ mang thai tuần 39 có dấu hiệu chuyển dạ cấp, cần ca-nô tiếp cận đưa đến Bệnh viện Phụ Sản - Nhi Đà Nẵng khẩn cấp!';
      sos3.contactPhone = '0905662199';
      sos3.people = 2;
      sos3.priorityGroups = ['Phụ nữ mang thai', 'Trẻ sơ sinh'];
      sos3.emergencyType = 'MEDICAL';
      sos3.priority = 'CRITICAL';
      sos3.location = {
        type: 'Point',
        coordinates: [108.2320, 16.0125],
      };
      sos3.status = 'VERIFIED';
      await sos3.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos3.sosCode);
    }

    // 6.4. Ca SOS-3382: Tiếp tế khẩn cấp lương thực nước sạch, Hòa Hải (MEDIUM, CHỜ ĐIỀU PHỐI)
    let sos4 = await SosRequest.findOne({ sosCode: 'SOS-3382' });
    if (!sos4) {
      sos4 = await SosRequest.create({
        sosCode: 'SOS-3382',
        citizenId: citizen4._id,
        areaId: wardHoaHai._id,
        address: 'K290 Nam Kỳ Khởi Nghĩa, Phường Hòa Hải, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2560, 16.0020],
        },
        emergencyType: 'RELIEF',
        priority: 'MEDIUM',
        people: 5,
        priorityGroups: ['Trẻ em', 'Hộ gia đình khó khăn'],
        description: 'Khu vực trũng thấp ngập 3 ngày liên tục, nước sạch và lương thực dự trữ đã cạn kiệt, gia đình có 2 trẻ nhỏ cần tiếp tế khẩn cấp 2 thùng nước khoáng và 1 thùng lương khô dã chiến.',
        contactPhone: '0905884332',
        images: [
          'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos4.sosCode, '| Địa chỉ:', sos4.address);
    } else {
      sos4.citizenId = citizen4._id;
      sos4.areaId = wardHoaHai._id;
      sos4.address = 'K290 Nam Kỳ Khởi Nghĩa, Phường Hòa Hải, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos4.description = 'Khu vực trũng thấp ngập 3 ngày liên tục, nước sạch và lương thực dự trữ đã cạn kiệt, gia đình có 2 trẻ nhỏ cần tiếp tế khẩn cấp 2 thùng nước khoáng và 1 thùng lương khô dã chiến.';
      sos4.contactPhone = '0905884332';
      sos4.people = 5;
      sos4.priorityGroups = ['Trẻ em', 'Hộ gia đình khó khăn'];
      sos4.emergencyType = 'RELIEF';
      sos4.priority = 'MEDIUM';
      sos4.location = {
        type: 'Point',
        coordinates: [108.2560, 16.0020],
      };
      sos4.status = 'VERIFIED';
      await sos4.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos4.sosCode);
    }

    // 6.5. Ca SOS-6175: Cây ngã đè sập hiên nhà, cứu nạn mắc kẹt, Mỹ An (HIGH, CHỜ ĐIỀU PHỐI)
    let sos5 = await SosRequest.findOne({ sosCode: 'SOS-6175' });
    if (!sos5) {
      sos5 = await SosRequest.create({
        sosCode: 'SOS-6175',
        citizenId: citizen5._id,
        areaId: wardMyAn._id,
        address: '72 Hồ Xuân Hương, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2465, 16.0485],
        },
        emergencyType: 'STORM',
        priority: 'HIGH',
        people: 3,
        priorityGroups: ['Người bị thương nhẹ'],
        description: 'Gió bão giật mạnh làm cây xà cừ cổ thụ bật gốc đè sập hiên tôn nhà cấp 4, có 1 người bị thương ở chân đang mắc kẹt trong góc sân, cần cưa máy giải phóng hiện trường và sơ cứu nẹp cố định chân.',
        contactPhone: '0905331188',
        images: [
          'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos5.sosCode, '| Địa chỉ:', sos5.address);
    } else {
      sos5.citizenId = citizen5._id;
      sos5.areaId = wardMyAn._id;
      sos5.address = '72 Hồ Xuân Hương, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos5.description = 'Gió bão giật mạnh làm cây xà cừ cổ thụ bật gốc đè sập hiên tôn nhà cấp 4, có 1 người bị thương ở chân đang mắc kẹt trong góc sân, cần cưa máy giải phóng hiện trường và sơ cứu nẹp cố định chân.';
      sos5.contactPhone = '0905331188';
      sos5.people = 3;
      sos5.priorityGroups = ['Người bị thương nhẹ'];
      sos5.emergencyType = 'STORM';
      sos5.priority = 'HIGH';
      sos5.location = {
        type: 'Point',
        coordinates: [108.2465, 16.0485],
      };
      sos5.status = 'VERIFIED';
      await sos5.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos5.sosCode);
    }

    // 6.6. Ca SOS-9401: Nước lũ tràn vào nền nhà, hỗ trợ sơ tán người cao tuổi, Khuê Mỹ (HIGH, CHỜ ĐIỀU PHỐI)
    let sos6 = await SosRequest.findOne({ sosCode: 'SOS-9401' });
    if (!sos6) {
      sos6 = await SosRequest.create({
        sosCode: 'SOS-9401',
        citizenId: citizen6._id,
        areaId: wardKhueMy._id,
        address: 'K115 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.2450, 16.0280],
        },
        emergencyType: 'FLOOD',
        priority: 'HIGH',
        people: 3,
        priorityGroups: ['Người cao tuổi'],
        description: 'Nước sông tràn vào nền nhà sâu 0.5m đang tiếp tục dâng nhanh, trong nhà có 2 cụ già 78 tuổi có tiền sử cao huyết áp, cần hỗ trợ xuồng máy di chuyển đến Trụ sở UBND Phường Khuê Mỹ tránh trú an toàn.',
        contactPhone: '0905449922',
        images: [
          'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
        ],
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos6.sosCode, '| Địa chỉ:', sos6.address);
    } else {
      sos6.citizenId = citizen6._id;
      sos6.areaId = wardKhueMy._id;
      sos6.address = 'K115 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos6.description = 'Nước sông tràn vào nền nhà sâu 0.5m đang tiếp tục dâng nhanh, trong nhà có 2 cụ già 78 tuổi có tiền sử cao huyết áp, cần hỗ trợ xuồng máy di chuyển đến Trụ sở UBND Phường Khuê Mỹ tránh trú an toàn.';
      sos6.contactPhone = '0905449922';
      sos6.people = 3;
      sos6.priorityGroups = ['Người cao tuổi'];
      sos6.emergencyType = 'FLOOD';
      sos6.priority = 'HIGH';
      sos6.location = {
        type: 'Point',
        coordinates: [108.2450, 16.0280],
      };
      sos6.status = 'VERIFIED';
      await sos6.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos6.sosCode);
    }
    // ========================================================
    // 7. TẠO PHÂN CÔNG TÁC CHIẾN SOS ASSIGNMENT (GrabDriver Flow)
    // ========================================================
    console.log('\n--- 7. Tạo Lệnh Phân Công Tác Chiến (SosAssignment) ---');

    // Xóa các phân công chưa hoàn tất của đội teamNHS và rescuer leCuuNan (bảo toàn các ca COMPLETED)
    await SosAssignment.deleteMany({
      status: { $ne: 'COMPLETED' },
      $or: [
        { sosRequestId: sos1._id },
        { sosId: sos1._id },
        { rescueTeamId: teamNHS._id },
        { teamId: teamNHS._id },
        { rescuerId: leCuuNan._id },
      ],
    });

    let assignment1 = await SosAssignment.create({
      sosRequestId: sos1._id,
      sosId: sos1._id,
      authorityOrganizationId: authorityNHS._id,
      rescueTeamId: teamNHS._id,
      teamId: teamNHS._id,
      rescuerId: leCuuNan._id,
      vehicleId: boat._id,
      assignedBy: dispatcherUser._id,
      status: 'PENDING', // Trạng thái PENDING để kích hoạt State 1: NỔ NHIỆM VỤ trên mobile app
      assignedAt: new Date(),
      priority: 'CRITICAL',
      note: 'Lệnh điều động khẩn cấp từ Ban Chỉ Huy Quận Ngũ Hành Sơn: Ca-nô 43-CN-08 xuất kích cứu hộ gia đình ngập sâu tại K48/12 Lê Văn Hiến',
    });
    console.log('➕ Đã tạo Phân công (SosAssignment):', assignment1._id.toString());
    console.log('   ➤ SOS:', sos1.sosCode, '| Đội:', teamNHS.name);
    console.log('   ➤ Cứu hộ viên nhận nhiệm vụ:', leCuuNan.fullName, `(${leCuuNan.phone})`, '| Xe/Ca-nô:', boat.plateNumber);
    console.log('   ➤ Trạng thái:', assignment1.status, '(Sẵn sàng test màn hình GrabDriver incoming alert!)');

    // ========================================================
    // 8. TẠO TRANG THIẾT BỊ VÀ VẬT TƯ CỨU TRỢ (EQUIPMENT & SUPPLIES)
    // ========================================================
    console.log('\n--- 8. Đồng bộ Trang Thiết Bị & Vật Tư Cứu Trợ ---');

    await Equipment.deleteMany({});

    const durableItems = [
      {
        name: 'Áo phao cứu sinh tiêu chuẩn SOLAS phản quang',
        category: 'LIFE_VEST',
        supplyType: 'DURABLE',
        quantity: 50,
        unit: 'Chiếc',
        status: 'AVAILABLE',
        serialNumber: 'SOLAS-NHS-001',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Áo phao cứu sinh chuyên dụng vượt lũ có còi và đèn định vị',
        minThreshold: 10,
      },
      {
        name: 'Áo phao cứu sinh trẻ em chuyên dụng',
        category: 'LIFE_VEST',
        supplyType: 'DURABLE',
        quantity: 25,
        unit: 'Chiếc',
        status: 'AVAILABLE',
        serialNumber: 'SOLAS-KID-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Dành riêng cho trẻ em dưới 10 tuổi và trẻ sơ sinh',
        minThreshold: 5,
      },
      {
        name: 'Bộ đàm tầm xa Motorola GP338 chống nước IP68',
        category: 'COMMUNICATION',
        supplyType: 'DURABLE',
        quantity: 12,
        unit: 'Bộ',
        status: 'AVAILABLE',
        serialNumber: 'MOTO-GP338-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Băng tần UHF/VHF tác chiến liên lạc trực tiếp Ban Chỉ Huy',
        minThreshold: 4,
      },
      {
        name: 'Túi sơ cấp cứu y tế dã chiến chuyên dụng',
        category: 'MEDICAL_KIT',
        supplyType: 'DURABLE',
        quantity: 8,
        unit: 'Bộ',
        status: 'AVAILABLE',
        serialNumber: 'MED-KIT-NHS-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Đầy đủ nẹp gãy xương, băng ép garo, kéo y tế và máy đo huyết áp',
        minThreshold: 2,
      },
      {
        name: 'Máy sốc tim tự động dã chiến AED Philips HeartStart',
        category: 'MEDICAL_DEVICE',
        supplyType: 'DURABLE',
        quantity: 2,
        unit: 'Máy',
        status: 'AVAILABLE',
        serialNumber: 'AED-PHILIPS-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Thiết bị cấp cứu ngừng tim tại chỗ, biên chế trên xe cứu thương 43A-115.88',
        minThreshold: 1,
      },
      {
        name: 'Đèn pha LED chiếu sáng cứu nạn tầm xa 500W',
        category: 'LIGHTING',
        supplyType: 'DURABLE',
        quantity: 6,
        unit: 'Bộ',
        status: 'AVAILABLE',
        serialNumber: 'LED-500W-NHS',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Chiếu xa 800m kèm ắc quy dự phòng chống nước lội lũ ban đêm',
        minThreshold: 2,
      },
      {
        name: 'Phao tròn cứu sinh khẩn cấp kèm dây ném 30m',
        category: 'LIFE_SAVING',
        supplyType: 'DURABLE',
        quantity: 16,
        unit: 'Cái',
        status: 'AVAILABLE',
        serialNumber: 'RING-LIFE-30M',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Phao xốp tổng hợp siêu nhẹ nổi cao kèm dây sợi dù chống mục',
        minThreshold: 5,
      },
      {
        name: 'Dây thừng cứu hộ chịu tải trọng cao 100m kèm khóa Carabiner',
        category: 'ROPE_TOOL',
        supplyType: 'DURABLE',
        quantity: 10,
        unit: 'Cuộn',
        status: 'AVAILABLE',
        serialNumber: 'ROPE-STATIC-100',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Tải trọng đứt 22kN, chuyên neo đậu cano và dòng kéo nạn nhân vùng nước xiết',
        minThreshold: 3,
      },
      {
        name: 'Máy cưa xích xăng STIHL cưa cây dọn luồng cứu hộ',
        category: 'TOOL',
        supplyType: 'DURABLE',
        quantity: 3,
        unit: 'Máy',
        status: 'AVAILABLE',
        serialNumber: 'SAW-STIHL-MS250',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Dùng cắt hạ cây đổ, dọn chướng ngại vật giải tỏa luồng xuồng máy',
        minThreshold: 1,
      },
      {
        name: 'Cáng cứu thương hợp kim nhôm xếp gọn dã chiến',
        category: 'TOOL',
        supplyType: 'DURABLE',
        quantity: 6,
        unit: 'Cái',
        status: 'AVAILABLE',
        serialNumber: 'STRETCHER-ALU-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Khung nhôm cường lực chống rỉ sét, chịu tải 160kg có dây đai cố định',
        minThreshold: 2,
      },
      {
        name: 'Mũ bảo hiểm cứu hộ chuyên dụng có gá đèn',
        category: 'PPE',
        supplyType: 'DURABLE',
        quantity: 20,
        unit: 'Chiếc',
        status: 'AVAILABLE',
        serialNumber: 'HELMET-RESCUE-01',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Mũ nhựa ABS chống va đập đạt chuẩn cứu hộ đường thủy',
        minThreshold: 5,
      },
      {
        name: 'Máy bơm điện áp lực cao xuồng cao su',
        category: 'VEHICLE_ACCESSORY',
        supplyType: 'DURABLE',
        quantity: 4,
        unit: 'Bộ',
        status: 'AVAILABLE',
        serialNumber: 'PUMP-ELEC-12V',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Bơm căng xuồng cao su cứu hộ trong 3 phút, cắm tẩu sạc 12V trên xe',
        minThreshold: 1,
      },
      {
        name: 'Bộ lều bạt dã chiến chống bão dã chiến (6-8 người)',
        category: 'SHELTER',
        supplyType: 'DURABLE',
        quantity: 15,
        unit: 'Bộ',
        status: 'AVAILABLE',
        serialNumber: 'TENT-STORM-08',
        teamId: null, // Dự trữ tại Kho Tổng Ban Chỉ Huy
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Dự trữ tại Kho Tổng Ban Chỉ Huy Ngũ Hành Sơn, phục vụ sơ tán dân',
        minThreshold: 5,
      },
    ];

    const consumableItems = [
      {
        name: 'Thùng lương khô quân đội cao cấp BB702 (Thùng 10kg)',
        category: 'FOOD_WATER',
        supplyType: 'CONSUMABLE',
        quantity: 120,
        unit: 'Thùng',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Giàu năng lượng, hạn sử dụng 3 năm, sẵn sàng xuất cấp cứu đói vùng cô lập',
        minThreshold: 30,
      },
      {
        name: 'Nước uống tiệt trùng đóng chai (Thùng 24 chai 500ml)',
        category: 'FOOD_WATER',
        supplyType: 'CONSUMABLE',
        quantity: 250,
        unit: 'Thùng',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Nước tinh khiết đóng chai tiệt trùng cung cấp nước uống khẩn cấp',
        minThreshold: 50,
      },
      {
        name: 'Hộp viên khử khuẩn lọc nước sinh hoạt Aquatabs 67mg',
        category: 'WATER_PURIFICATION',
        supplyType: 'CONSUMABLE',
        quantity: 500,
        unit: 'Hộp',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: '1 viên lọc sạch 20 lít nước lũ đục thành nước sinh hoạt an toàn trong 30 phút',
        minThreshold: 100,
      },
      {
        name: 'Hóa chất Cloramin B khử trùng nguồn nước và môi trường (Gói 1kg)',
        category: 'WATER_PURIFICATION',
        supplyType: 'CONSUMABLE',
        quantity: 80,
        unit: 'Gói',
        status: 'AVAILABLE',
        teamId: null, // Kho Tổng PCTT
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Hóa chất y tế dự phòng xử lý ô nhiễm giếng nước và khử trùng sau bão lũ',
        minThreshold: 20,
      },
      {
        name: 'Túi thuốc y tế dân sinh gia đình (Paracetamol, Berberin, Oresol)',
        category: 'MEDICAL_SUPPLY',
        supplyType: 'CONSUMABLE',
        quantity: 150,
        unit: 'Túi',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Gói thuốc hạ sốt, đau bụng, tiêu chảy và muối bù nước cho bà con vùng ngập',
        minThreshold: 40,
      },
      {
        name: 'Băng gạc tiệt trùng, cồn đỏ Povidine và oxy già sát trùng vết thương',
        category: 'MEDICAL_SUPPLY',
        supplyType: 'CONSUMABLE',
        quantity: 100,
        unit: 'Bộ',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Vật tư sơ cứu vết thương do tôn cứa, dẫm đinh và ngâm nước bẩn lâu ngày',
        minThreshold: 25,
      },
      {
        name: 'Chăn ấm dã chiến giữ nhiệt tráng nhôm (Foil Blanket)',
        category: 'HYGIENE',
        supplyType: 'CONSUMABLE',
        quantity: 180,
        unit: 'Chiếc',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Chống sốc nhiệt, giữ ấm tối đa 90% nhiệt cơ thể cho người già và trẻ nhỏ',
        minThreshold: 40,
      },
      {
        name: 'Bộ nhu yếu phẩm vệ sinh cá nhân khẩn cấp (Khăn, xà phòng, bàn chải)',
        category: 'HYGIENE',
        supplyType: 'CONSUMABLE',
        quantity: 90,
        unit: 'Bộ',
        status: 'AVAILABLE',
        teamId: null, // Kho Tổng PCTT
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Nhu yếu phẩm phục vụ các hộ dân sơ tán tại các điểm tập trung an toàn',
        minThreshold: 20,
      },
      {
        name: 'Can xăng pha nhớt 2T dự phòng xuồng máy cứu hộ (Can 20L)',
        category: 'FUEL',
        supplyType: 'CONSUMABLE',
        quantity: 30,
        unit: 'Can',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Nhiên liệu tiêu chuẩn cho động cơ ca-nô xuồng máy chạy cứu hộ liên tục',
        minThreshold: 10,
      },
      {
        name: 'Áo mưa dã chiến quân nhu cánh dơi chống nước gió bão',
        category: 'PPE',
        supplyType: 'CONSUMABLE',
        quantity: 110,
        unit: 'Bộ',
        status: 'AVAILABLE',
        teamId: teamNHS._id,
        providedBy: authorityNHS._id,
        receivedAt: new Date(),
        note: 'Vải tráng nhựa PVC bền bỉ chống thấm tuyệt đối khi di tản trong mưa to',
        minThreshold: 30,
      },
    ];

    const allEquipments = [...durableItems, ...consumableItems];
    await Equipment.insertMany(allEquipments);
    console.log(`➕ Đã tạo ${allEquipments.length} trang thiết bị & vật tư cứu trợ:`);
    console.log(`   ➤ Trang thiết bị (DURABLE): ${durableItems.length} loại`);
    console.log(`   ➤ Vật tư tiêu hao (CONSUMABLE): ${consumableItems.length} loại`);

    // Đồng bộ các đội cứu hộ và xe cứu thương bổ sung tại Ngũ Hành Sơn
    const { seedAdditionalTeamsNHS } = require('./seedAdditionalTeamsNHS');
    await seedAdditionalTeamsNHS();

    console.log('\n========================================================');
    console.log('🎉 SEED DỮ LIỆU NGŨ HÀNH SƠN HOÀN TẤT THÀNH CÔNG!');
    console.log('========================================================');
    console.log('📋 THÔNG TIN TEST TÀI KHOẢN:');
    console.log('1. Tài Khoản Cứu Hộ Viên (Đang mở trên App Mobile):');
    console.log('   - Họ và tên    : ' + leCuuNan.fullName + ' (ĐỘI TRƯỞNG)');
    console.log('   - Số điện thoại: ' + leCuuNan.phone);
    console.log('   - Email        : ' + leCuuNan.email);
    console.log('   - Đội cứu hộ   : 43-NHS-01 (' + teamNHS.name + ')');
    console.log('   - Phương tiện  : 43-CN-08 (Ca-nô vượt lũ) & 43A-NHS.88 (Xe bán tải lội nước)');
    console.log('   - Mã ca SOS    : ' + sos1.sosCode + ' (K48/12 Lê Văn Hiến, 4 người gặp nạn)');
    console.log('   - Trạng thái   : PENDING -> Sẵn sàng hiển thị Mission Card / Nổ nhiệm vụ trên màn hình Trang Chủ App!');
    console.log('\n2. Điều Phối Viên Quận Ngũ Hành Sơn (Web Portal Dispatch):');
    console.log('   - Số điện thoại: 0905777111 (hoặc email: dispatcher.nguhanhson@sos.vn)');
    console.log('   - Mật khẩu     : Password@123');
    console.log('   - Cơ quan      : Ban Chỉ Huy PCTT & TKCN Quận Ngũ Hành Sơn');
    console.log('========================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi seed dữ liệu Ngũ Hành Sơn:', err);
    process.exit(1);
  }
}

seedNguHanhSon();

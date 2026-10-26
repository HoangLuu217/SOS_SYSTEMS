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
        rescuer: {
          idNumber: '048092008899',
          skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
          experience: '6 năm kinh nghiệm chỉ huy cứu hộ vùng sông Cổ Cò & Quận Ngũ Hành Sơn',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
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
      leCuuNan.rescuer = {
        idNumber: '048092008899',
        skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
        experience: '6 năm kinh nghiệm chỉ huy cứu hộ vùng sông Cổ Cò & Quận Ngũ Hành Sơn',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
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
    // 6. TẠO YÊU CẦU CỨU NẠN SOS TẠI NGŨ HÀNH SƠN
    // ========================================================
    console.log('\n--- 6. Tạo Yêu Cầu Cứu Nạn SOS Tại Ngũ Hành Sơn ---');

    // Xóa các ca SOS rác cũ ngoài SOS-74144 và SOS-8924 để đảm bảo bảng điều phối chỉ hiển thị đúng 2 ca thực tế
    await SosRequest.deleteMany({
      sosCode: { $nin: ['SOS-74144', 'SOS-8924'] },
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
          coordinates: [108.2435, 16.0315], // Tọa độ bên trong Phường Khuê Mỹ, Ngũ Hành Sơn
        },
        emergencyType: 'FLOOD',
        priority: 'CRITICAL',
        people: 4,
        description: 'Nước lũ sông Cổ Cò dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!',
        contactPhone: '0905538065',
        status: 'ASSIGNED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos1.sosCode, '| Địa chỉ:', sos1.address);
    } else {
      sos1.citizenId = citizen1._id;
      sos1.areaId = wardKhueMy._id;
      sos1.address = 'K48/12 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos1.description = 'Nước lũ sông Cổ Cò dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!';
      sos1.contactPhone = '0905538065';
      sos1.people = 4;
      sos1.status = 'ASSIGNED';
      sos1.priority = 'CRITICAL';
      sos1.location = {
        type: 'Point',
        coordinates: [108.2435, 16.0315],
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
          coordinates: [108.2410, 16.0460], // Tọa độ Phường Mỹ An, Ngũ Hành Sơn
        },
        emergencyType: 'RESCUE',
        priority: 'HIGH',
        people: 2,
        description: 'Dãy trọ sinh viên và người lao động bị nước ngập cô lập kiệt vào, cần cung cấp áo phao và di tản người già sang điểm an toàn.',
        contactPhone: '0905123987',
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos2.sosCode, '| Địa chỉ:', sos2.address);
    } else {
      sos2.citizenId = citizen2._id;
      sos2.areaId = wardMyAn._id;
      sos2.address = '125 Châu Thị Vĩnh Tế, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng';
      sos2.description = 'Dãy trọ sinh viên và người lao động bị nước ngập cô lập kiệt vào, cần cung cấp áo phao và di tản người già sang điểm an toàn.';
      sos2.contactPhone = '0905123987';
      sos2.location = {
        type: 'Point',
        coordinates: [108.2410, 16.0460],
      };
      sos2.status = 'VERIFIED';
      await sos2.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos2.sosCode);
    }

    // ========================================================
    // 7. TẠO PHÂN CÔNG TÁC CHIẾN SOS ASSIGNMENT (GrabDriver Flow)
    // ========================================================
    console.log('\n--- 7. Tạo Lệnh Phân Công Tác Chiến (SosAssignment) ---');

    // Xóa các phân công cũ của đội teamNHS và rescuer leCuuNan để đảm bảo quy tắc 1 nhóm chỉ làm 1 nhiệm vụ
    await SosAssignment.deleteMany({
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

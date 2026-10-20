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

async function seedLienChieu() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối cơ sở dữ liệu MongoDB:', MONGODB_URI);

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // ========================================================
    // 1. KIỂM TRA & TẠO KHU VỰC HÀNH CHÍNH QUẬN/PHƯỜNG LIÊN CHIỂU
    // ========================================================
    console.log('\n--- 1. Đồng bộ Khu Vực Hành Chính Quận Liên Chiểu ---');

    let danang = await AdministrativeArea.findOne({ code: 'DANANG' });
    if (!danang) {
      danang = await AdministrativeArea.create({
        name: 'Thành phố Đà Nẵng',
        code: 'DANANG',
        type: 'PROVINCE',
        status: 'ACTIVE',
      });
    }

    let districtLC = await AdministrativeArea.findOne({
      $or: [{ code: 'DAD-LC' }, { name: /Liên Chiểu/i, type: 'DISTRICT' }],
    });

    if (!districtLC) {
      districtLC = await AdministrativeArea.create({
        name: 'Quận Liên Chiểu',
        code: 'DAD-LC',
        type: 'DISTRICT',
        parentId: danang._id,
        status: 'ACTIVE',
      });
      console.log('➕ Đã tạo Quận Liên Chiểu:', districtLC.name);
    } else {
      console.log('✔ Đã có Quận Liên Chiểu:', districtLC.name, `(${districtLC.code})`);
    }

    // Các phường của Liên Chiểu
    const wardsConfig = [
      { name: 'Phường Hòa Khánh', code: 'DAD-LC-02' },
      { name: 'Phường Liên Chiểu', code: 'DAD-LC-01' },
      { name: 'Phường Hải Vân', code: 'DAD-LC-03' },
    ];

    const wardDocs = {};
    for (const w of wardsConfig) {
      let ward = await AdministrativeArea.findOne({
        $or: [{ code: w.code }, { name: new RegExp(w.name, 'i'), parentId: districtLC._id }],
      });
      if (!ward) {
        ward = await AdministrativeArea.create({
          name: w.name,
          code: w.code,
          type: 'WARD',
          parentId: districtLC._id,
          status: 'ACTIVE',
        });
        console.log(`➕ Đã tạo ${w.name} (${w.code})`);
      } else {
        console.log(`✔ Đã có ${ward.name} (${ward.code})`);
      }
      wardDocs[w.code] = ward;
    }

    const wardHoaKhanh = wardDocs['DAD-LC-02'];
    const wardLienChieu = wardDocs['DAD-LC-01'];

    // ========================================================
    // 2. TẠO CƠ QUAN QUẢN LÝ / BAN CHỈ HUY QUẬN LIÊN CHIỂU
    // ========================================================
    console.log('\n--- 2. Tạo Cơ Quan Quản Lý & Điều Phối Quận Liên Chiểu ---');

    let authorityLC = await AuthorityOrganization.findOne({
      $or: [{ code: 'BCH-PCTT-LC' }, { name: /Liên Chiểu/i }],
    });

    if (!authorityLC) {
      authorityLC = await AuthorityOrganization.create({
        name: 'Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu',
        code: 'BCH-PCTT-LC',
        type: 'LOCAL_AUTHORITY',
        phone: '02363738999',
        email: 'bch.lienchieu@danang.gov.vn',
        address: '168 Hồ Tùng Mậu, Phường Hòa Khánh, Quận Liên Chiểu, TP Đà Nẵng',
        administrativeAreaId: districtLC._id,
        areaId: districtLC._id,
        status: 'ACTIVE',
      });
      console.log('➕ Đã tạo cơ quan:', authorityLC.name);
    } else {
      authorityLC.administrativeAreaId = districtLC._id;
      authorityLC.areaId = districtLC._id;
      authorityLC.status = 'ACTIVE';
      await authorityLC.save();
      console.log('✔ Cập nhật cơ quan:', authorityLC.name);
    }

    // ========================================================
    // 3. TẠO TÀI KHOẢN NGƯỜI DÙNG (DISPATCHER, RESCUER, CITIZEN)
    // ========================================================
    console.log('\n--- 3. Tạo Tài Khoản Người Dùng Test ---');

    // 3.1. Điều phối viên Quận Liên Chiểu
    let dispatcherUser = await User.findOne({ phone: '0905777111' });
    if (!dispatcherUser) {
      dispatcherUser = await User.create({
        fullName: 'Trần Văn Chỉ Huy (Liên Chiểu)',
        phone: '0905777111',
        email: 'dispatcher.lienchieu@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        authority: {
          organizationId: authorityLC._id,
          areaId: wardLienChieu._id,
          position: 'Trực ban Điều phối Tác chiến PCTT',
          department: 'Ban Chỉ Huy PCTT Phường Liên Chiểu',
          areaName: 'Phường Liên Chiểu',
        },
      });
      console.log('➕ Đã tạo Điều phối viên:', dispatcherUser.fullName, '| SĐT: 0905777111');
    } else {
      dispatcherUser.authority = {
        organizationId: authorityLC._id,
        areaId: wardLienChieu._id,
        position: 'Trực ban Điều phối Tác chiến PCTT',
        department: 'Ban Chỉ Huy PCTT Phường Liên Chiểu',
        areaName: 'Phường Liên Chiểu',
      };
      if (!dispatcherUser.roles.includes('LOCAL_AUTHORITY')) dispatcherUser.roles.push('LOCAL_AUTHORITY');
      dispatcherUser.passwordHash = defaultPasswordHash;
      await dispatcherUser.save();
      console.log('✔ Đã có Điều phối viên:', dispatcherUser.fullName);
    }

    // 3.1b. Cập nhật tài khoản tunggggg (đang đăng nhập trên màn hình web)
    let currentScreenUser = await User.findOne({ phone: '0987676768' });
    if (currentScreenUser) {
      currentScreenUser.authority = {
        organizationId: authorityLC._id,
        areaId: wardLienChieu._id,
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: 'Ban Chỉ Huy PCTT Phường Liên Chiểu',
        areaName: 'Phường Liên Chiểu',
      };
      await currentScreenUser.save();
      console.log('✔ Đã đồng bộ tài khoản đang đăng nhập:', currentScreenUser.fullName, 'vào Phường Liên Chiểu');
    }

    // 3.2. Cứu hộ viên Lê Cứu Nạn (Tài khoản đang đăng nhập trên mobile app: 0903000003)
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
        address: 'Phường Liên Chiểu, Thành phố Đà Nẵng',
        rescuer: {
          idNumber: '048092008899',
          skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
          experience: '6 năm kinh nghiệm cứu hộ vùng rốn lũ Mẹ Suốt & Liên Chiểu',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log('➕ Đã tạo Cứu hộ viên Lê Cứu Nạn:', leCuuNan.fullName, '| SĐT: 0903000003');
    } else {
      leCuuNan.fullName = 'Lê Cứu Nạn';
      if (!leCuuNan.roles.includes('RESCUER')) leCuuNan.roles.push('RESCUER');
      if (!leCuuNan.roles.includes('CITIZEN')) leCuuNan.roles.push('CITIZEN');
      leCuuNan.status = 'ACTIVE';
      leCuuNan.isPhoneVerified = true;
      leCuuNan.isVerified = true;
      leCuuNan.rescuer = {
        idNumber: '048092008899',
        skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
        experience: '6 năm kinh nghiệm cứu hộ vùng rốn lũ Mẹ Suốt & Liên Chiểu',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
      };
      await leCuuNan.save();
      console.log('✔ Đã cập nhật Cứu hộ viên Lê Cứu Nạn (0903000003) vào hệ thống');
    }

    // 3.3. Đội phó cứu hộ Đặng Văn Long
    let leaderUser = await User.findOne({ phone: '0905999881' });
    if (!leaderUser) {
      leaderUser = await User.create({
        fullName: 'Đặng Văn Long',
        phone: '0905999881',
        email: 'dangvanlong.leader.lc@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        rescuer: {
          idNumber: '048092001122',
          skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
          experience: '7 năm kinh nghiệm cứu lũ kiệt Mẹ Suốt & Hòa Khánh',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log('➕ Đã tạo Đội phó cứu hộ:', leaderUser.fullName, '| SĐT: 0905999881');
    } else {
      leaderUser.roles = ['RESCUER', 'CITIZEN'];
      leaderUser.passwordHash = defaultPasswordHash;
      leaderUser.rescuer = {
        idNumber: '048092001122',
        skills: ['Chỉ huy ca-nô cứu nạn', 'Lái thuyền vượt lũ', 'Cứu hộ vùng ngập sâu'],
        experience: '7 năm kinh nghiệm cứu lũ kiệt Mẹ Suốt & Hòa Khánh',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
      };
      await leaderUser.save();
      console.log('✔ Đã cập nhật Đội phó cứu hộ:', leaderUser.fullName);
    }

    // 3.3. Cứu hộ viên Lê Văn Hải
    let rescuer1 = await User.findOne({ phone: '0905999882' });
    if (!rescuer1) {
      rescuer1 = await User.create({
        fullName: 'Lê Văn Hải',
        phone: '0905999882',
        email: 'levanhai.rescuer.lc@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        rescuer: {
          idNumber: '048092003344',
          skills: ['Lặn cứu nạn', 'Bơi lội ngược dòng xoáy'],
          experience: '4 năm cứu hộ dã chiến',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
    }

    // 3.4. Cứu hộ viên - Bác sĩ cấp cứu Nguyễn Đức Nam
    let rescuer2 = await User.findOne({ phone: '0905999883' });
    if (!rescuer2) {
      rescuer2 = await User.create({
        fullName: 'Nguyễn Đức Nam',
        phone: '0905999883',
        email: 'nguyenducnam.medic.lc@sos.vn',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER', 'CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
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

    // 3.5. Người dân gặp nạn Lê Thị Bích Trâm (Kiệt Mẹ Suốt)
    let citizen1 = await User.findOne({ phone: '0905538065' });
    if (!citizen1) {
      citizen1 = await User.create({
        fullName: 'Lê Thị Bích Trâm',
        phone: '0905538065',
        email: 'bichtram.mesuot.lc@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        citizen: {
          areaId: wardHoaKhanh._id,
          areaName: wardHoaKhanh.name,
        },
      });
      console.log('➕ Đã tạo Người dân gặp nạn:', citizen1.fullName, '| SĐT: 0905538065');
    }

    // 3.6. Người dân gặp nạn Nguyễn Hoàng Long (Tôn Đức Thắng)
    let citizen2 = await User.findOne({ phone: '0905123987' });
    if (!citizen2) {
      citizen2 = await User.create({
        fullName: 'Nguyễn Hoàng Long',
        phone: '0905123987',
        email: 'hoanglong.tonducthang.lc@gmail.com',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isPhoneVerified: true,
        citizen: {
          areaId: wardLienChieu._id,
          areaName: wardLienChieu.name,
        },
      });
    }

    // ========================================================
    // 4. TẠO ĐỘI CỨU HỘ LIÊN CHIỂU (43-LC-01)
    // ========================================================
    console.log('\n--- 4. Tạo Đội Cứu Hộ Phản Ứng Nhanh Liên Chiểu (43-LC-01) ---');

    let teamLC = await RescueTeam.findOne({
      $or: [
        { name: /43-LC-01/i },
        { name: /Liên Chiểu/i },
      ],
    });

    const teamMembers = [
      { rescuerId: leCuuNan._id, role: 'LEADER', joinedAt: new Date() },
      { rescuerId: leaderUser._id, role: 'MEMBER', joinedAt: new Date() },
      { rescuerId: rescuer1._id, role: 'MEMBER', joinedAt: new Date() },
      { rescuerId: rescuer2._id, role: 'MEMBER', joinedAt: new Date() },
    ];

    if (!teamLC) {
      teamLC = await RescueTeam.create({
        name: 'Đội Phản Ứng Nhanh Cứu Hộ Phường Liên Chiểu (43-LC-01)',
        type: 'FLOOD_RESCUE',
        leaderId: leCuuNan._id,
        authorityId: authorityLC._id,
        areaId: wardLienChieu._id,
        description: 'Đội chuyên trách ca-nô cao tốc & xuồng máy lội nước, tác chiến điểm nóng ngập lụt kiệt Mẹ Suốt và khu dân cư trũng thấp Liên Chiểu.',
        status: 'ACTIVE',
        members: teamMembers,
      });
      console.log('➕ Đã tạo Đội cứu hộ:', teamLC.name);
    } else {
      teamLC.name = 'Đội Phản Ứng Nhanh Cứu Hộ Phường Liên Chiểu (43-LC-01)';
      teamLC.type = 'FLOOD_RESCUE';
      teamLC.leaderId = leCuuNan._id;
      teamLC.authorityId = authorityLC._id;
      teamLC.areaId = wardLienChieu._id;
      teamLC.status = 'ACTIVE';
      teamLC.members = teamMembers;
      await teamLC.save();
      console.log('✔ Đã cập nhật Đội cứu hộ:', teamLC.name, '(Đội trưởng: Lê Cứu Nạn)');
    }

    // ========================================================
    // 5. TẠO PHƯƠNG TIỆN CỨU HỘ CHO ĐỘI LIÊN CHIỂU
    // ========================================================
    console.log('\n--- 5. Tạo Phương Tiện Cứu Hộ (Ca-nô, Xe cứu hộ) ---');

    // 5.1. Ca-nô cứu sinh 43-CN-09
    let boat = await Vehicle.findOne({ plateNumber: '43-CN-09' });
    if (!boat) {
      boat = await Vehicle.create({
        teamId: teamLC._id,
        type: 'BOAT',
        plateNumber: '43-CN-09',
        capacity: 8,
        status: 'IN_USE',
        description: 'Ca-nô cao tốc vỏ hợp kim nhôm chuyên vượt lũ ngập sâu, trang bị 10 áo phao cứu sinh, đèn pha LED 500W và còi hú tầm xa.',
      });
      console.log('➕ Đã tạo Phương tiện:', boat.plateNumber, `(${boat.type}) - Sức chứa: ${boat.capacity} người`);
    } else {
      boat.teamId = teamLC._id;
      boat.status = 'IN_USE';
      await boat.save();
      console.log('✔ Đã cập nhật Phương tiện:', boat.plateNumber);
    }

    // 5.2. Xe bán tải lội nước chuyên dụng 43A-LC.99
    let truck = await Vehicle.findOne({ plateNumber: '43A-LC.99' });
    if (!truck) {
      truck = await Vehicle.create({
        teamId: teamLC._id,
        type: 'TRUCK',
        plateNumber: '43A-LC.99',
        capacity: 6,
        status: 'AVAILABLE',
        description: 'Xe bán tải cứu hộ 2 cầu gầm cao lội nước sâu 1.0m, trang bị tời kéo điện 4.5 tấn và bạt che chống mưa bão.',
      });
      console.log('➕ Đã tạo Phương tiện:', truck.plateNumber, `(${truck.type}) - Sức chứa: ${truck.capacity} người`);
    } else {
      truck.teamId = teamLC._id;
      await truck.save();
      console.log('✔ Đã cập nhật Phương tiện:', truck.plateNumber);
    }

    // ========================================================
    // 6. TẠO YÊU CẦU CỨU NẠN SOS TẠI LIÊN CHIỂU
    // ========================================================
    console.log('\n--- 6. Tạo Yêu Cầu Cứu Nạn SOS Tại Liên Chiểu ---');

    // 6.1. Ca SOS-74144: Ngập sâu kiệt Mẹ Suốt (CRITICAL, ĐÃ PHÂN CÔNG ĐỘI 43-LC-01)
    let sos1 = await SosRequest.findOne({ sosCode: 'SOS-74144' });
    if (!sos1) {
      sos1 = await SosRequest.create({
        sosCode: 'SOS-74144',
        citizenId: citizen1._id,
        areaId: wardLienChieu._id,
        address: 'K123/45 Mẹ Suốt, Phường Liên Chiểu, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.1450, 16.0750], // Tọa độ bên trong ranh giới GIS Phường Liên Chiểu
        },
        emergencyType: 'FLOOD',
        priority: 'CRITICAL',
        people: 4,
        description: 'Nước lũ dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!',
        contactPhone: '0905538065',
        status: 'ASSIGNED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos1.sosCode, '| Địa chỉ:', sos1.address);
    } else {
      sos1.citizenId = citizen1._id;
      sos1.areaId = wardLienChieu._id;
      sos1.address = 'K123/45 Mẹ Suốt, Phường Liên Chiểu, TP Đà Nẵng';
      sos1.description = 'Nước lũ dâng cao ngang ngực 1.2m chảy xiết, trong nhà có 1 cụ già 82 tuổi liệt giường và 1 em bé 3 tuổi, cần ca-nô tiếp cận khẩn cấp!';
      sos1.contactPhone = '0905538065';
      sos1.people = 4;
      sos1.status = 'ASSIGNED';
      sos1.priority = 'CRITICAL';
      sos1.location = {
        type: 'Point',
        coordinates: [108.1450, 16.0750],
      };
      await sos1.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos1.sosCode, '| Địa chỉ:', sos1.address);
    }

    // 6.2. Ca SOS-8924: Dãy trọ công nhân ngập nước Tôn Đức Thắng (HIGH, CHỜ ĐIỀU PHỐI)
    let sos2 = await SosRequest.findOne({ sosCode: 'SOS-8924' });
    if (!sos2) {
      sos2 = await SosRequest.create({
        sosCode: 'SOS-8924',
        citizenId: citizen2._id,
        areaId: wardLienChieu._id,
        address: '456 Tôn Đức Thắng, Phường Liên Chiểu, Quận Liên Chiểu, TP Đà Nẵng',
        location: {
          type: 'Point',
          coordinates: [108.1400, 16.0800], // Tọa độ bên trong ranh giới GIS Phường Liên Chiểu
        },
        emergencyType: 'RESCUE',
        priority: 'HIGH',
        people: 2,
        description: 'Dãy trọ công nhân bị nước lũ cô lập đường vào, cần cung cấp áo phao và di tản người già sang điểm an toàn.',
        contactPhone: '0905123987',
        status: 'VERIFIED',
      });
      console.log('➕ Đã tạo yêu cầu SOS:', sos2.sosCode, '| Địa chỉ:', sos2.address);
    } else {
      sos2.areaId = wardLienChieu._id;
      sos2.location = {
        type: 'Point',
        coordinates: [108.1400, 16.0800],
      };
      sos2.status = 'VERIFIED';
      await sos2.save();
      console.log('✔ Đã cập nhật yêu cầu SOS:', sos2.sosCode);
    }

    // ========================================================
    // 7. TẠO PHÂN CÔNG TÁC CHIẾN SOS ASSIGNMENT (GrabDriver Flow)
    // ========================================================
    console.log('\n--- 7. Tạo Lệnh Phân Công Tác Chiến (SosAssignment) ---');

    // Xóa các phân công cũ liên quan đến ca SOS-74144 để đảm bảo sạch sẽ và duy nhất 1 nhiệm vụ
    await SosAssignment.deleteMany({
      $or: [
        { sosRequestId: sos1._id },
        { sosId: sos1._id },
      ],
    });

    let assignment1 = await SosAssignment.create({
      sosRequestId: sos1._id,
      sosId: sos1._id,
      authorityOrganizationId: authorityLC._id,
      rescueTeamId: teamLC._id,
      teamId: teamLC._id,
      rescuerId: leCuuNan._id,
      vehicleId: boat._id,
      assignedBy: dispatcherUser._id,
      status: 'PENDING', // Trạng thái PENDING để kích hoạt State 1: NỔ NHIỆM VỤ trên mobile app
      assignedAt: new Date(),
      priority: 'CRITICAL',
      note: 'Lệnh điều động khẩn cấp từ Ban Chỉ Huy Quận Liên Chiểu: Ca-nô 43-CN-09 xuất kích cứu hộ gia đình ngập sâu tại Kiệt Mẹ Suốt',
    });
    console.log('➕ Đã tạo Phân công (SosAssignment):', assignment1._id.toString());
    console.log('   ➤ SOS:', sos1.sosCode, '| Đội:', teamLC.name);
    console.log('   ➤ Cứu hộ viên nhận nhiệm vụ:', leCuuNan.fullName, `(${leCuuNan.phone})`, '| Xe/Ca-nô:', boat.plateNumber);
    console.log('   ➤ Trạng thái:', assignment1.status, '(Sẵn sàng test màn hình GrabDriver incoming alert!)');

    console.log('\n========================================================');
    console.log('🎉 SEED DỮ LIỆU LIÊN CHIỂU HOÀN TẤT THÀNH CÔNG!');
    console.log('========================================================');
    console.log('📋 THÔNG TIN TEST TÀI KHOẢN:');
    console.log('1. Tài Khoản Cứu Hộ Viên (Đang mở trên App Mobile):');
    console.log('   - Họ và tên    : ' + leCuuNan.fullName);
    console.log('   - Số điện thoại: ' + leCuuNan.phone);
    console.log('   - Email        : ' + leCuuNan.email);
    console.log('   - Đội cứu hộ   : 43-LC-01 (' + teamLC.name + ')');
    console.log('   - Phương tiện  : 43-CN-09 (Ca-nô vượt lũ) & 43A-LC.99 (Xe bán tải lội nước)');
    console.log('   - Mã ca SOS    : ' + sos1.sosCode + ' (Kiệt Mẹ Suốt, 4 người gặp nạn)');
    console.log('   - Trạng thái   : PENDING -> Sẵn sàng hiển thị Mission Card / Nổ nhiệm vụ trên màn hình Trang Chủ App!');
    console.log('\n2. Điều Phối Viên Quận Liên Chiểu (Web Portal Dispatch):');
    console.log('   - Số điện thoại: 0905777111 (hoặc email: dispatcher.lienchieu@sos.vn)');
    console.log('   - Mật khẩu     : Password@123');
    console.log('   - Cơ quan      : Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu');
    console.log('========================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi seed dữ liệu Liên Chiểu:', err);
    process.exit(1);
  }
}

seedLienChieu();

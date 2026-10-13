require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  User,
  AdministrativeArea,
  AuthorityOrganization,
  RescueTeam,
  Vehicle,
  SosRequest,
  HazardReport,
} = require('./models');

const seed = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
    await mongoose.connect(mongoUri);
    console.log('🌱 Đã kết nối MongoDB để khởi tạo tài khoản & dữ liệu mẫu...');

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // 1. Đảm bảo có Khu vực hành chính (Đà Nẵng)
    let area = await AdministrativeArea.findOne({ code: 'DANANG' });
    if (!area) {
      area = await AdministrativeArea.create({
        name: 'Thành phố Đà Nẵng',
        code: 'DANANG',
        type: 'PROVINCE',
        parentId: null,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [108.15, 16.02],
              [108.28, 16.02],
              [108.28, 16.12],
              [108.15, 16.12],
              [108.15, 16.02],
            ],
          ],
        },
        status: 'ACTIVE',
      });
      console.log('✅ Đã tạo khu vực hành chính:', area.name);
    } else {
      console.log('ℹ️ Khu vực hành chính đã tồn tại:', area.name);
    }

    // 2. Đảm bảo có Cơ quan Ban Chỉ Huy PCTT & TKCN
    let org = await AuthorityOrganization.findOne({ code: 'BCH_PCTT_DN' });
    if (!org) {
      org = await AuthorityOrganization.create({
        name: 'Ban Chỉ Huy Phòng Chống Thiên Tai & Tìm Kiếm Cứu Nạn TP. Đà Nẵng',
        type: 'LOCAL_AUTHORITY',
        code: 'BCH_PCTT_DN',
        areaId: area._id,
        administrativeAreaId: area._id,
        address: 'Số 42 Bạch Đằng, Quận Hải Châu, TP. Đà Nẵng',
        phone: '02363822111',
        email: 'bchpctt@danang.gov.vn',
        status: 'ACTIVE',
      });
      console.log('✅ Đã tạo cơ quan chính quyền:', org.name);
    } else {
      console.log('ℹ️ Cơ quan chính quyền đã tồn tại:', org.name);
    }

    // 3. Khởi tạo / cập nhật tài khoản LOCAL_AUTHORITY chuẩn
    let authority = await User.findOne({
      $or: [{ email: 'authority@sos.vn' }, { phone: '0902000002' }],
    });
    if (!authority) {
      authority = await User.create({
        fullName: 'Cán bộ Nguyễn Văn Trực (PCTT Đà Nẵng)',
        email: 'authority@sos.vn',
        phone: '0902000002',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY'],
        status: 'ACTIVE',
        isVerified: true,
        authority: {
          organizationId: org._id,
          areaId: area._id,
          position: 'Cán bộ điều phối tác chiến',
          department: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng',
        },
      });
      console.log('✅ Đã tạo tài khoản LOCAL_AUTHORITY: authority@sos.vn (SĐT: 0902000002)');
    } else {
      authority.roles = ['LOCAL_AUTHORITY'];
      authority.status = 'ACTIVE';
      authority.isVerified = true;
      authority.passwordHash = defaultPasswordHash;
      authority.authority = {
        organizationId: org._id,
        areaId: area._id,
        position: 'Cán bộ điều phối tác chiến',
        department: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng',
      };
      await authority.save();
      console.log('✅ Đã cập nhật tài khoản LOCAL_AUTHORITY: authority@sos.vn');
    }

    // Tạo thêm tài khoản cá nhân cho HoangLuu (nếu muốn dùng email đuôi @gmail.com)
    let hlAuthority = await User.findOne({ email: 'hoangluu2172k4+authority@gmail.com' });
    if (!hlAuthority) {
      hlAuthority = await User.create({
        fullName: 'Hoàng Lưu (Cán bộ PCTT)',
        email: 'hoangluu2172k4+authority@gmail.com',
        phone: '0988888888',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY'],
        status: 'ACTIVE',
        isVerified: true,
        authority: {
          organizationId: org._id,
          areaId: area._id,
          position: 'Chỉ huy trưởng điều hành',
          department: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng',
        },
      });
      console.log('✅ Đã tạo thêm tài khoản cá nhân: hoangluu2172k4+authority@gmail.com (SĐT: 0988888888)');
    }

    // 4. Tạo tài khoản Cứu Hộ Viên (RESCUER) để phân công nhiệm vụ
    let rescuer = await User.findOne({
      $or: [{ email: 'rescuer@sos.vn' }, { phone: '0903000003' }],
    });
    if (!rescuer) {
      rescuer = await User.create({
        fullName: 'Lê Cứu Nạn (Đội Cứu Hộ Sông Hàn)',
        email: 'rescuer@sos.vn',
        phone: '0903000003',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048095012345',
          skills: ['Cứu hộ vùng ngập sâu', 'Sơ cấp cứu nạn nhân', 'Lái cano cao tốc'],
          experience: '5 năm kinh nghiệm cứu trợ lũ lụt miền Trung',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log('✅ Đã tạo tài khoản RESCUER: rescuer@sos.vn');
    }

    // 5. Tạo Đội cứu hộ (Rescue Team) mẫu nếu chưa có
    let team = await RescueTeam.findOne({ authorityId: org._id });
    if (!team) {
      team = await RescueTeam.create({
        name: 'Đội Cứu Hộ Phản Ứng Nhanh Sông Hàn',
        type: 'FLOOD_RESCUE',
        leaderId: rescuer._id,
        authorityId: org._id,
        areaId: area._id,
        members: [
          {
            rescuerId: rescuer._id,
            role: 'LEADER',
          },
        ],
        status: 'ACTIVE',
      });
      console.log('✅ Đã tạo Đội cứu hộ mẫu:', team.name);
    }

    // 6. Tạo Phương tiện cứu hộ (Vehicles) mẫu nếu chưa có
    const vehicleCount = await Vehicle.countDocuments({ teamId: team._id });
    if (vehicleCount === 0) {
      await Vehicle.insertMany([
        {
          teamId: team._id,
          type: 'BOAT',
          plateNumber: 'ĐN-CANO-01',
          capacity: 8,
          status: 'AVAILABLE',
          description: 'Cano cao tốc chuyên dụng cứu nạn vùng ngập sâu sông Hàn',
        },
        {
          teamId: team._id,
          type: 'BOAT',
          plateNumber: 'ĐN-THUYEN-02',
          capacity: 12,
          status: 'AVAILABLE',
          description: 'Thuyền phao động cơ sơ tán người già và trẻ nhỏ',
        },
        {
          teamId: team._id,
          type: 'AMBULANCE',
          plateNumber: '43A-115.99',
          capacity: 4,
          status: 'AVAILABLE',
          description: 'Xe cấp cứu chuyên dụng dã chiến túc trực bến sông',
        },
      ]);
      console.log('✅ Đã tạo 3 phương tiện cứu trợ mẫu');
    }

    // 7. Tạo SOS Request mẫu nếu chưa có để màn hình Tiếp nhận & Bản đồ có dữ liệu test
    const sosCount = await SosRequest.countDocuments();
    if (sosCount === 0) {
      // Lấy user citizen làm người gửi
      let citizen = await User.findOne({ roles: 'CITIZEN' });
      if (!citizen) {
        citizen = await User.create({
          fullName: 'Trần Văn Dân (Công Dân Cần Hỗ Trợ)',
          email: 'citizen@sos.vn',
          phone: '0981122334',
          passwordHash: defaultPasswordHash,
          roles: ['CITIZEN'],
          status: 'ACTIVE',
          isVerified: true,
        });
      }

      await SosRequest.create([
        {
          sosCode: 'SOS-DN-001',
          citizenId: citizen._id,
          location: {
            type: 'Point',
            coordinates: [108.2215, 16.0612],
          },
          areaId: area._id,
          address: 'Khu vực đường Trưng Nữ Vương, Hải Châu, Đà Nẵng',
          emergencyType: 'FLOOD',
          priority: 'CRITICAL',
          people: 4,
          description: 'Nước ngập ngang ngực 1.4m, gia đình có 2 người già và 1 em bé mắc kẹt trên gác lửng cần cano đón khẩn cấp.',
          status: 'PENDING',
        },
        {
          sosCode: 'SOS-DN-002',
          citizenId: citizen._id,
          location: {
            type: 'Point',
            coordinates: [108.2355, 16.059],
          },
          areaId: area._id,
          address: 'Gần chợ Bắc Mỹ An, Ngũ Hành Sơn, Đà Nẵng',
          emergencyType: 'MEDICAL',
          priority: 'HIGH',
          people: 2,
          description: 'Cần hỗ trợ vận chuyển y tế khẩn cấp, bệnh nhân cần lọc thận nước ngập xe không qua được.',
          status: 'VERIFIED',
        },
      ]);
      console.log('✅ Đã tạo 2 tin báo SOS mẫu phục vụ kiểm thử tác chiến');
    }

    // 8. Tạo các điểm nguy hiểm mẫu (Hazard Reports) chờ Authority duyệt
    const hazardCount = await HazardReport.countDocuments();
    if (hazardCount === 0) {
      let citizen = await User.findOne({ roles: 'CITIZEN' });
      let rescuer = await User.findOne({ roles: 'RESCUER' });

      await HazardReport.create([
        {
          title: 'Sạt lở đất nghiêm trọng đường lên bán đảo Sơn Trà',
          description: 'Mưa lớn kéo dài gây sạt trượt đất đá taluy dương chắn ngang đường, đất đá trôi xuống mặt đường khoảng 20 mét khối, xe máy và ô tô không thể qua lại.',
          hazardType: 'LANDSLIDE',
          severity: 'CRITICAL',
          location: {
            type: 'Point',
            coordinates: [108.275, 16.115],
          },
          address: 'Đoạn dốc Hoàng Sa gần Chùa Linh Ứng, Bán đảo Sơn Trà, Đà Nẵng',
          areaId: area._id,
          reportedBy: citizen ? citizen._id : authority._id,
          reporterRole: 'CITIZEN',
          status: 'PENDING', // Đang chờ Authority duyệt
          images: [],
        },
        {
          title: 'Điểm ngập sâu 1.3m tại gầm cầu vượt Ngã Ba Huế',
          description: 'Hệ thống thoát nước quá tải gây ngập sâu hơn 1m, nước xoáy mạnh gần miệng cống hở nắp rất nguy hiểm cho người và phương tiện di chuyển trong đêm.',
          hazardType: 'FLOOD',
          severity: 'HIGH',
          location: {
            type: 'Point',
            coordinates: [108.1812, 16.0642],
          },
          address: 'Gầm cầu vượt Ngã Ba Huế, Hòa Minh, Liên Chiểu, Đà Nẵng',
          areaId: area._id,
          reportedBy: rescuer ? rescuer._id : authority._id,
          reporterRole: 'RESCUER',
          status: 'PENDING', // Đang chờ Authority duyệt
          images: [],
        },
        {
          title: 'Cây cổ thụ đổ đè đứt đường dây điện hạ thế đường Nguyễn Văn Linh',
          description: 'Gió giật mạnh làm gãy cây xà cừ lớn đè đè ngang đường, đứt dây điện đang phát tia lửa, đã chăng dây cảnh báo tạm thời.',
          hazardType: 'FALLEN_TREE',
          severity: 'HIGH',
          location: {
            type: 'Point',
            coordinates: [108.216, 16.0605],
          },
          address: 'Trước số nhà 152 Nguyễn Văn Linh, Nam Dương, Hải Châu, Đà Nẵng',
          areaId: area._id,
          reportedBy: citizen ? citizen._id : authority._id,
          reporterRole: 'CITIZEN',
          status: 'APPROVED', // Điểm đã được duyệt
          reviewedBy: authority._id,
          reviewedAt: new Date(),
          reviewNote: 'Đã xác minh và chuyển đội cây xanh & điện lực xử lý.',
          images: [],
        },
      ]);
      console.log('✅ Đã tạo 3 điểm nguy hiểm mẫu (2 PENDING chờ duyệt, 1 APPROVED)');
    }

    console.log('\n======================================================');
    console.log('🎉 KHỞI TẠO DỮ LIỆU HOÀN TẤT THÀNH CÔNG!');
    console.log('======================================================');
    console.log('👉 THÔNG TIN TÀI KHOẢN CÁN BỘ ĐỊA PHƯƠNG (LOCAL_AUTHORITY):');
    console.log('   Tùy chọn 1 (Khuyên dùng):');
    console.log('     • Đăng nhập bằng Số điện thoại: 0902000002');
    console.log('     • Đăng nhập bằng Email:        authority@sos.vn');
    console.log('     • Mật khẩu:                    Password@123');
    console.log('   Tùy chọn 2 (Tài khoản cá nhân):');
    console.log('     • Đăng nhập bằng Số điện thoại: 0988888888');
    console.log('     • Đăng nhập bằng Email:        hoangluu2172k4+authority@gmail.com');
    console.log('     • Mật khẩu:                    Password@123');
    console.log('   Vai trò: LOCAL_AUTHORITY');
    console.log('   Đơn vị: ' + org.name);
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi seed dữ liệu:', err);
    process.exit(1);
  }
};

seed();

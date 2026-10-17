require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  User,
  AdministrativeArea,
  AuthorityOrganization,
  RescueTeam,
  Vehicle,
} = require('./models');

const seedRescuer = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Đã kết nối MongoDB thành công.');

    const defaultPassword = 'Password@123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // 1. Kiểm tra hoặc khởi tạo khu vực hành chính Đà Nẵng
    let area = await AdministrativeArea.findOne({ code: 'DANANG' });
    if (!area) {
      area = await AdministrativeArea.create({
        name: 'Thành phố Đà Nẵng',
        code: 'DANANG',
        type: 'PROVINCE',
        status: 'ACTIVE',
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
      });
      console.log('📍 Đã tạo khu vực:', area.name);
    }

    // 2. Kiểm tra hoặc khởi tạo cơ quan chỉ huy PCTT
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
      console.log('🏛️ Đã tạo cơ quan chỉ huy:', org.name);
    }

    // 3. Tạo / cập nhật tài khoản Cứu Hộ Viên chính (RESCUER)
    const rescuerData = {
      fullName: 'Nguyễn Minh An (Đội viên Cứu Hộ)',
      email: 'rescuer@sos.vn',
      phone: '0903000003',
      passwordHash,
      roles: ['RESCUER'],
      status: 'ACTIVE',
      isVerified: true,
      isPhoneVerified: true,
      areaId: area._id,
      rescuer: {
        idNumber: '048095012345',
        skills: [
          'Cứu hộ vùng ngập sâu',
          'Sơ cấp cứu đuối nước',
          'Lái cano cao tốc',
          'Tìm kiếm cứu nạn đêm',
        ],
        experience: '5 năm kinh nghiệm cứu hộ bão lũ miền Trung',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
      },
    };

    let rescuer = await User.findOne({
      $or: [{ email: rescuerData.email }, { phone: rescuerData.phone }],
    });

    if (!rescuer) {
      rescuer = await User.create(rescuerData);
      console.log('⭐ [TẠO MỚI] Tài khoản Cứu Hộ Viên RESCUER thành công!');
    } else {
      rescuer.fullName = rescuerData.fullName;
      rescuer.email = rescuerData.email;
      rescuer.phone = rescuerData.phone;
      rescuer.passwordHash = passwordHash;
      rescuer.roles = ['RESCUER'];
      rescuer.status = 'ACTIVE';
      rescuer.isVerified = true;
      rescuer.isPhoneVerified = true;
      rescuer.rescuer = rescuerData.rescuer;
      await rescuer.save();
      console.log('🔄 [CẬP NHẬT] Đã đồng bộ tài khoản RESCUER hiện có về trạng thái hoạt động!');
    }

    // 4. Tạo thêm tài khoản dự phòng đăng nhập nhanh bằng số điện thoại
    const backupData = {
      fullName: 'Trần Văn Cứu Nạn',
      email: 'cuuho@sos.vn',
      phone: '0912345678',
      passwordHash,
      roles: ['RESCUER'],
      status: 'ACTIVE',
      isVerified: true,
      isPhoneVerified: true,
      areaId: area._id,
      rescuer: {
        idNumber: '048096054321',
        skills: ['Cứu thương dã chiến', 'Lặn cứu nạn', 'Lái xuồng cao su'],
        experience: '3 năm tình nguyện viên cứu nạn khẩn cấp',
        vehicleType: 'BOAT',
        verificationStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
      },
    };

    let backupRescuer = await User.findOne({
      $or: [{ email: backupData.email }, { phone: backupData.phone }],
    });

    if (!backupRescuer) {
      backupRescuer = await User.create(backupData);
      console.log('⭐ [TẠO MỚI] Tài khoản Cứu Hộ Viên dự phòng thành công!');
    } else {
      backupRescuer.fullName = backupData.fullName;
      backupRescuer.email = backupData.email;
      backupRescuer.phone = backupData.phone;
      backupRescuer.passwordHash = passwordHash;
      backupRescuer.roles = ['RESCUER'];
      backupRescuer.status = 'ACTIVE';
      backupRescuer.isVerified = true;
      backupRescuer.isPhoneVerified = true;
      backupRescuer.rescuer = backupData.rescuer;
      await backupRescuer.save();
      console.log('🔄 [CẬP NHẬT] Đã đặt lại mật khẩu cho tài khoản dự phòng.');
    }

    // 5. Liên kết Cứu hộ viên vào Đội cứu hộ (RescueTeam)
    let team = await RescueTeam.findOne({ authorityId: org._id });
    if (!team) {
      team = await RescueTeam.create({
        name: 'Đội Cứu Hộ Phản Ứng Nhanh Sông Hàn',
        type: 'FLOOD_RESCUE',
        leaderId: rescuer._id,
        authorityId: org._id,
        areaId: area._id,
        members: [
          { rescuerId: rescuer._id, role: 'LEADER' },
          { rescuerId: backupRescuer._id, role: 'MEMBER' },
        ],
        status: 'ACTIVE',
      });
      console.log('👥 Đã tạo Đội cứu hộ:', team.name);
    } else {
      const hasMember = team.members.some((m) => String(m.rescuerId) === String(rescuer._id));
      if (!hasMember) {
        team.members.push({ rescuerId: rescuer._id, role: 'MEMBER' });
        await team.save();
        console.log('👥 Đã thêm cứu hộ viên vào đội:', team.name);
      }
    }

    // 6. Đảm bảo có phương tiện cứu hộ liên kết
    const vehicleCount = await Vehicle.countDocuments({ teamId: team._id });
    if (vehicleCount === 0) {
      await Vehicle.create({
        teamId: team._id,
        type: 'BOAT',
        plateNumber: 'ĐN-CANO-01',
        capacity: 8,
        status: 'AVAILABLE',
        description: 'Cano cao tốc chuyên dụng cứu hộ vùng ngập sâu sông Hàn',
      });
      console.log('🚤 Đã tạo phương tiện cứu hộ mẫu: Cano ĐN-CANO-01');
    }

    console.log('\n======================================================');
    console.log('🎉 KHỞI TẠO TÀI KHOẢN CỨU HỘ VIÊN (RESCUER) THÀNH CÔNG!');
    console.log('======================================================');
    console.log('📌 TÀI KHOẢN 1 (Chính):');
    console.log('   - Email:        rescuer@sos.vn');
    console.log('   - Số điện thoại: 0903000003');
    console.log('   - Mật khẩu:     Password@123');
    console.log('   - Vai trò:      Cứu hộ viên (RESCUER - Sẵn sàng nhận nhiệm vụ)');
    console.log('------------------------------------------------------');
    console.log('📌 TÀI KHOẢN 2 (Dự phòng):');
    console.log('   - Email:        cuuho@sos.vn');
    console.log('   - Số điện thoại: 0912345678');
    console.log('   - Mật khẩu:     Password@123');
    console.log('   - Vai trò:      Cứu hộ viên (RESCUER)');
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi khởi tạo tài khoản rescuer:', err);
    process.exit(1);
  }
};

seedRescuer();

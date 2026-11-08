require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, AdministrativeArea } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const seedAdditionalUsers = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Kết nối MongoDB thành công');

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // Lấy thông tin khu vực Xã Xuân Phú
    let xuanPhuArea = await AdministrativeArea.findOne({ name: /Xuân Phú/i });
    if (!xuanPhuArea) {
      xuanPhuArea = await AdministrativeArea.findOne({ code: 'VN48-W46' }) || await AdministrativeArea.findOne({});
    }
    const xuanPhuId = xuanPhuArea ? xuanPhuArea._id : null;
    const xuanPhuName = xuanPhuArea ? xuanPhuArea.name : 'Xã Xuân Phú, Thành phố Đà Nẵng';

    console.log(`📍 Khu vực gán: ${xuanPhuName} (${xuanPhuId})`);

    // Danh sách Cứu hộ viên mới cần thêm
    const rescuerList = [
      {
        fullName: 'Bác sĩ Lê Thị Thu Thảo',
        phone: '0905123111',
        email: 'bs.thuthao.xuanphu@sos.vn',
        gender: 'FEMALE',
        address: 'Thôn An Trạch, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048195000111',
          skills: ['first_aid', 'water_rescue', 'evacuation'],
          experience: '7 năm Bác sĩ Hồi sức Cấp cứu BV Đa khoa, chuyên trách cấp cứu đuối nước và xử lý chấn thương dã chiến',
          vehicleType: 'AMBULANCE',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Võ Quốc Huy',
        phone: '0905123222',
        email: 'huy.vo.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Thôn Phú Sơn, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048194000222',
          skills: ['search_rescue', 'technical_rescue', 'rope_climb'],
          experience: '6 năm cứu hộ cơ động địa phương, thành thạo cắt phá chướng ngại vật, mở đường tiếp cận vùng cô lập',
          vehicleType: 'TRUCK',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Đặng Văn Lâm',
        phone: '0905123333',
        email: 'lam.cano.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Khu vực Cầu Xuân Phú, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048196000333',
          skills: ['boat_driver', 'water_rescue', 'evacuation'],
          experience: '5 năm vận hành xuồng máy cao tốc vượt dòng nước siết, cứu nạn người dân mắc kẹt trên mái nhà',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Trần Đình Trọng',
        phone: '0905123444',
        email: 'trong.pccc.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Thôn Thạch Nham, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048197000444',
          skills: ['firefighting', 'technical_rescue', 'rope_climb'],
          experience: '4 năm chiến sĩ nghĩa vụ PCCC & CNCH, chuyên xử lý sự cố sập đổ, rò rỉ điện mùa mưa bão',
          vehicleType: 'TRUCK',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Điều dưỡng Phạm Thị Mỹ Linh',
        phone: '0905123555',
        email: 'linh.med.xuanphu@sos.vn',
        gender: 'FEMALE',
        address: 'Khu dân cư Đồng Mít, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048198000555',
          skills: ['first_aid', 'relief_logistics', 'communication'],
          experience: '5 năm điều dưỡng Trạm y tế, am hiểu chăm sóc người già, phụ nữ mang thai và trẻ em vùng ngập',
          vehicleType: 'MOTORBIKE',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Hoàng Đức Anh',
        phone: '0905123666',
        email: 'anh.cano.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Khu ven sông Hàn, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048195000666',
          skills: ['boat_driver', 'relief_logistics', 'water_rescue'],
          experience: '4 năm đội thanh niên xung kích sông nước, thông thạo luồng lạch và bến bãi tránh bão',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Ngô Kiến Huy',
        phone: '0905123777',
        email: 'huy.diver.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Thôn Phú Đông, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048193000777',
          skills: ['diving', 'water_rescue', 'search_rescue'],
          experience: '6 năm thợ lặn cứu hộ, trục vớt phương tiện và tìm kiếm nạn nhân vùng xoáy sâu',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Bùi Tiến Dũng',
        phone: '0905123888',
        email: 'dung.transport.xuanphu@sos.vn',
        gender: 'MALE',
        address: 'Đường liên xã, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '048192000888',
          skills: ['logistics', 'relief_logistics', 'evacuation'],
          experience: 'Lái xe tải gầm cao 2.5T, chuyên bốc dỡ phân phối lương thực và sơ tán tài sản công dân',
          vehicleType: 'TRUCK',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Trần Minh Vương',
        phone: '0905123999',
        email: 'vuong.applicant@sos.vn',
        gender: 'MALE',
        address: 'Thôn Phú Sơn Nam, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: false,
        rescuer: {
          idNumber: '048199000999',
          skills: ['water_rescue', 'evacuation'],
          experience: 'Đoàn viên thanh niên, bơi lội tốt, mới nộp đơn tham gia lực lượng xung kích phòng chống lụt bão',
          vehicleType: 'BOAT',
          verificationStatus: 'PENDING',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
      {
        fullName: 'Nguyễn Phong Hồng Duy',
        phone: '0905123000',
        email: 'duy.applicant@sos.vn',
        gender: 'MALE',
        address: 'Thôn Đồng Dương, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: false,
        rescuer: {
          idNumber: '048198000000',
          skills: ['boat_driver', 'first_aid'],
          experience: 'Lái thuyền nan gia đình, có chứng chỉ sơ cấp cứu Chữ thập đỏ, đang chờ phê duyệt hồ sơ',
          vehicleType: 'BOAT',
          verificationStatus: 'PENDING',
          availabilityStatus: 'AVAILABLE',
          areaId: xuanPhuId,
          areaName: xuanPhuName,
        },
      },
    ];

    // Danh sách Người dân (CITIZEN) mới
    const citizenList = [
      {
        fullName: 'Nguyễn Thị Hoa',
        phone: '0905888001',
        email: 'hoa.nguyen.xp@gmail.com',
        gender: 'FEMALE',
        address: 'Số 12 Thôn An Trạch, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: xuanPhuName,
          emergencyContact: {
            name: 'Nguyễn Văn Mạnh (Con trai)',
            phone: '0905888111',
            relation: 'Con trai',
          },
        },
      },
      {
        fullName: 'Lê Văn Phát',
        phone: '0905888002',
        email: 'phat.le.xp@gmail.com',
        gender: 'MALE',
        address: 'Xóm Ven Sông, Thôn Phú Sơn, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: xuanPhuName,
          emergencyContact: {
            name: 'Trần Thị Thu (Vợ)',
            phone: '0905888222',
            relation: 'Vợ',
          },
        },
      },
      {
        fullName: 'Hoàng Thị Mai',
        phone: '0905888003',
        email: 'mai.hoang.xp@gmail.com',
        gender: 'FEMALE',
        address: 'Tổ 3, Khu dân cư Đồng Mít, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: xuanPhuName,
          emergencyContact: {
            name: 'Hoàng Đức Nam (Anh ruột)',
            phone: '0905888333',
            relation: 'Anh trai',
          },
        },
      },
      {
        fullName: 'Đỗ Văn Sang',
        phone: '0905888004',
        email: 'sang.do.xp@gmail.com',
        gender: 'MALE',
        address: 'Thôn Phú Đông, Xã Xuân Phú, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: xuanPhuName,
          emergencyContact: {
            name: 'Đỗ Thị Hạnh (Chị gái)',
            phone: '0905888444',
            relation: 'Chị gái',
          },
        },
      },
      {
        fullName: 'Phạm Thị Hồng',
        phone: '0905888005',
        email: 'hong.pham.xp@gmail.com',
        gender: 'FEMALE',
        address: 'Khu trũng Thôn Cẩm Toại, Xã Hòa Phong, Huyện Hòa Vang, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: 'Xã Hòa Phong, Huyện Hòa Vang, TP Đà Nẵng',
          emergencyContact: {
            name: 'Phạm Văn Hậu (Bố)',
            phone: '0905888555',
            relation: 'Bố',
          },
        },
      },
      {
        fullName: 'Vũ Minh Tuấn',
        phone: '0905888006',
        email: 'tuan.vu.xp@gmail.com',
        gender: 'MALE',
        address: 'Xóm Trại, Thôn Thạch Nham, Xã Hòa Nhơn, Huyện Hòa Vang, TP Đà Nẵng',
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        citizen: {
          areaId: xuanPhuId,
          areaName: 'Xã Hòa Nhơn, Huyện Hòa Vang, TP Đà Nẵng',
          emergencyContact: {
            name: 'Vũ Thị Ngọc (Mẹ)',
            phone: '0905888666',
            relation: 'Mẹ',
          },
        },
      },
    ];

    let rescuerCreatedCount = 0;
    let rescuerUpdatedCount = 0;

    for (const rData of rescuerList) {
      let existing = await User.findOne({ phone: rData.phone });
      if (!existing && rData.email) {
        existing = await User.findOne({ email: rData.email });
      }

      if (!existing) {
        await User.create({
          ...rData,
          passwordHash: defaultPasswordHash,
        });
        console.log(`  ➕ Đã tạo Cứu hộ viên: ${rData.fullName} (${rData.phone}) - [${rData.rescuer.verificationStatus}]`);
        rescuerCreatedCount++;
      } else {
        existing.fullName = rData.fullName;
        existing.gender = rData.gender;
        existing.address = rData.address;
        existing.roles = rData.roles;
        existing.status = rData.status;
        existing.isVerified = rData.isVerified;
        existing.rescuer = rData.rescuer;
        await existing.save();
        console.log(`  🔄 Đã cập nhật Cứu hộ viên: ${rData.fullName} (${rData.phone})`);
        rescuerUpdatedCount++;
      }
    }

    let citizenCreatedCount = 0;
    let citizenUpdatedCount = 0;

    for (const cData of citizenList) {
      let existing = await User.findOne({ phone: cData.phone });
      if (!existing && cData.email) {
        existing = await User.findOne({ email: cData.email });
      }

      if (!existing) {
        await User.create({
          ...cData,
          passwordHash: defaultPasswordHash,
        });
        console.log(`  ➕ Đã tạo Người dân: ${cData.fullName} (${cData.phone})`);
        citizenCreatedCount++;
      } else {
        existing.fullName = cData.fullName;
        existing.gender = cData.gender;
        existing.address = cData.address;
        existing.roles = cData.roles;
        existing.status = cData.status;
        existing.isVerified = cData.isVerified;
        existing.citizen = cData.citizen;
        await existing.save();
        console.log(`  🔄 Đã cập nhật Người dân: ${cData.fullName} (${cData.phone})`);
        citizenUpdatedCount++;
      }
    }

    console.log('\n=============================================');
    console.log(`🎉 HOÀN THÀNH INSERT DỮ LIỆU USER THÀNH CÔNG!`);
    console.log(`- Cứu hộ viên (RESCUER): ${rescuerCreatedCount} tạo mới, ${rescuerUpdatedCount} cập nhật.`);
    console.log(`- Người dân (CITIZEN):   ${citizenCreatedCount} tạo mới, ${citizenUpdatedCount} cập nhật.`);
    console.log(`- Tất cả tài khoản có mật khẩu mặc định: Password@123`);
    console.log('=============================================');

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi seed User:', error);
    process.exit(1);
  }
};

seedAdditionalUsers();

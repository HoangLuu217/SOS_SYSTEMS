const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });
const {
  User,
  RescueTeam,
  Vehicle,
  AdministrativeArea,
  AuthorityOrganization,
} = require('./models');

async function seedAdditionalTeamsNHS() {
  const isDirectRun = require.main === module;
  if (isDirectRun) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✔ Kết nối MongoDB thành công');
  }

  console.log('\n--- Bổ sung các Đội cứu hộ & Xe cứu thương tại Ngũ Hành Sơn ---');

  // Tìm cơ quan quản lý Ngũ Hành Sơn
  const authorityNHS = await AuthorityOrganization.findOne({
    $or: [{ code: 'BCH-PCTT-NHS' }, { name: /Ngũ Hành Sơn/i }],
  });

  const districtNHS = await AdministrativeArea.findOne({
    $or: [{ code: 'DAD-NHS' }, { name: /Ngũ Hành Sơn/i, type: 'DISTRICT' }],
  });

  const wardKhueMy = await AdministrativeArea.findOne({
    $or: [{ code: 'DAD-NHS-02' }, { name: /Khuê Mỹ/i }],
  });
  const wardHoaHai = await AdministrativeArea.findOne({
    $or: [{ code: 'DAD-NHS-04' }, { name: /Hòa Hải/i }],
  });
  const wardHoaQuy = await AdministrativeArea.findOne({
    $or: [{ code: 'DAD-NHS-03' }, { name: /Hòa Quý/i }],
  });
  const wardMyAn = await AdministrativeArea.findOne({
    $or: [{ code: 'DAD-NHS-05' }, { name: /Mỹ An/i }],
  });

  // Tìm các user cứu hộ viên để làm đội trưởng & thành viên
  const leCuuNan = await User.findOne({ phone: '0903000003' });
  const dangVanLong = await User.findOne({ phone: '0905999881' });
  const leVanHai = await User.findOne({ phone: '0905999882' });
  const nguyenDucNam = await User.findOne({ phone: '0905999883' });
  const bsNghia = (await User.findOne({ phone: '0905555666' })) || nguyenDucNam;
  const dsTrang = (await User.findOne({ phone: '0905555667' })) || leVanHai;
  const ddToan = (await User.findOne({ phone: '0905555668' })) || dangVanLong;

  // Cập nhật vị trí GPS thực tế cho các bác sĩ & nhân viên y tế tại TTYT Ngũ Hành Sơn (Lê Văn Hiến)
  if (nguyenDucNam) {
    nguyenDucNam.currentLocation = { type: 'Point', coordinates: [108.2492, 16.0125] };
    await nguyenDucNam.save();
  }
  if (bsNghia && bsNghia._id.toString() !== nguyenDucNam?._id.toString()) {
    bsNghia.currentLocation = { type: 'Point', coordinates: [108.2498, 16.0130] };
    await bsNghia.save();
  }
  if (dsTrang && dsTrang._id.toString() !== leVanHai?._id.toString()) {
    dsTrang.currentLocation = { type: 'Point', coordinates: [108.2485, 16.0120] };
    await dsTrang.save();
  }
  if (ddToan && ddToan._id.toString() !== dangVanLong?._id.toString()) {
    ddToan.currentLocation = { type: 'Point', coordinates: [108.2501, 16.0118] };
    await ddToan.save();
  }

  // ========================================================
  // ĐỘI 1: ĐỘI XE CỨU THƯƠNG 115 NGŨ HÀNH SƠN (43-MED-NHS)
  // ========================================================
  let teamMedNHS = await RescueTeam.findOne({
    $or: [{ name: /43-MED-NHS/i }, { name: /Xe Cứu Thương 115 Ngũ Hành Sơn/i }],
  });

  const medMembers = [
    { rescuerId: nguyenDucNam._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: bsNghia._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: dsTrang._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: ddToan._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
  ];

  if (!teamMedNHS) {
    teamMedNHS = await RescueTeam.create({
      name: 'Đội Cấp Cứu Y Tế & Xe Cứu Thương 115 Ngũ Hành Sơn (43-MED-NHS)',
      type: 'MEDICAL_RESCUE',
      leaderId: nguyenDucNam._id,
      authorityId: authorityNHS._id,
      areaId: wardKhueMy ? wardKhueMy._id : districtNHS._id,
      description: 'Đội xe cứu thương dã chiến 115 túc trực 24/7, chuyên sơ cấp cứu tại chỗ và vận chuyển khẩn cấp nạn nhân nặng, người già, sản phụ chuyển dạ về các cơ sở y tế quận Ngũ Hành Sơn.',
      status: 'ACTIVE',
      members: medMembers,
    });
    console.log('➕ Đã tạo Đội xe cứu thương:', teamMedNHS.name);
  } else {
    teamMedNHS.type = 'MEDICAL_RESCUE';
    teamMedNHS.leaderId = nguyenDucNam._id;
    teamMedNHS.authorityId = authorityNHS._id;
    teamMedNHS.areaId = wardKhueMy ? wardKhueMy._id : districtNHS._id;
    teamMedNHS.status = 'ACTIVE';
    teamMedNHS.members = medMembers;
    await teamMedNHS.save();
    console.log('✔ Đã cập nhật Đội xe cứu thương:', teamMedNHS.name);
  }

  // Phương tiện của Đội Cứu Thương 115
  const medVehicles = [
    {
      plateNumber: '43A-115.88',
      type: 'AMBULANCE',
      capacity: 4,
      status: 'AVAILABLE',
      description: 'Xe cứu thương cấp cứu dã chiến 115 tiếp vận bờ, trang bị bình oxy, cáng cứu thương và máy sốc tim.',
    },
    {
      plateNumber: '43A-115.99',
      type: 'AMBULANCE',
      capacity: 4,
      status: 'AVAILABLE',
      description: 'Xe cứu thương Hồi sức cấp cứu ICU 115 chuyên dụng, trang bị máy thở di động và theo dõi sinh tồn.',
    },
    {
      plateNumber: '43B-115.02',
      type: 'AMBULANCE',
      capacity: 4,
      status: 'AVAILABLE',
      description: 'Xe cứu thương cơ động dã chiến phản ứng nhanh Ngũ Hành Sơn.',
    },
  ];

  for (const vData of medVehicles) {
    let veh = await Vehicle.findOne({ plateNumber: vData.plateNumber });
    if (!veh) {
      veh = await Vehicle.create({
        ...vData,
        teamId: teamMedNHS._id,
      });
      console.log(`   ➕ Xe cứu thương: ${veh.plateNumber} (${veh.description})`);
    } else {
      veh.teamId = teamMedNHS._id;
      veh.type = 'AMBULANCE';
      veh.status = 'AVAILABLE';
      veh.description = vData.description;
      await veh.save();
      console.log(`   ✔ Đã cập nhật Xe cứu thương: ${veh.plateNumber}`);
    }
  }

  // ========================================================
  // ĐỘI 2: ĐỘI CỨU NẠN VÙNG LŨ HÒA HẢI (43-NHS-02)
  // ========================================================
  let teamHoaHai = await RescueTeam.findOne({
    $or: [{ name: /43-NHS-02/i }, { name: /Vùng Lũ Hòa Hải/i }],
  });

  const hoaHaiMembers = [
    { rescuerId: leVanHai._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: dangVanLong._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: leCuuNan._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
  ];

  if (!teamHoaHai) {
    teamHoaHai = await RescueTeam.create({
      name: 'Đội Cứu Nạn Đột Kích Vùng Lũ Hòa Hải (43-NHS-02)',
      type: 'FLOOD_RESCUE',
      leaderId: leVanHai._id,
      authorityId: authorityNHS._id,
      areaId: wardHoaHai ? wardHoaHai._id : districtNHS._id,
      description: 'Đội xuồng máy và ca-nô đặc nhiệm bám sát vùng trũng ngập sâu, cồn bãi hạ lưu sông Cổ Cò thuộc Phường Hòa Hải.',
      status: 'ACTIVE',
      members: hoaHaiMembers,
    });
    console.log('➕ Đã tạo Đội cứu nạn:', teamHoaHai.name);
  } else {
    teamHoaHai.type = 'FLOOD_RESCUE';
    teamHoaHai.leaderId = leVanHai._id;
    teamHoaHai.authorityId = authorityNHS._id;
    teamHoaHai.areaId = wardHoaHai ? wardHoaHai._id : districtNHS._id;
    teamHoaHai.status = 'ACTIVE';
    teamHoaHai.members = hoaHaiMembers;
    await teamHoaHai.save();
    console.log('✔ Đã cập nhật Đội cứu nạn:', teamHoaHai.name);
  }

  // Phương tiện Đội Hòa Hải
  const hoaHaiVehicles = [
    {
      plateNumber: '43-CN-09',
      type: 'BOAT',
      capacity: 8,
      status: 'AVAILABLE',
      description: 'Ca-nô cứu sinh vượt lũ Hòa Hải vỏ hợp kim nhôm, trang bị 10 áo phao và phao bè.',
    },
    {
      plateNumber: '43C-888.11',
      type: 'TRUCK',
      capacity: 5,
      status: 'AVAILABLE',
      description: 'Xe bán tải cứu hộ lội nước sâu Hòa Hải, trang bị tời kéo điện 4.5 tấn.',
    },
  ];

  for (const vData of hoaHaiVehicles) {
    let veh = await Vehicle.findOne({ plateNumber: vData.plateNumber });
    if (!veh) {
      veh = await Vehicle.create({
        ...vData,
        teamId: teamHoaHai._id,
      });
      console.log(`   ➕ Phương tiện: ${veh.plateNumber} (${veh.type})`);
    } else {
      veh.teamId = teamHoaHai._id;
      veh.status = 'AVAILABLE';
      veh.description = vData.description;
      await veh.save();
      console.log(`   ✔ Đã cập nhật Phương tiện: ${veh.plateNumber}`);
    }
  }

  // ========================================================
  // ĐỘI 3: ĐỘI CỨU TRỢ & SƠ TÁN HÒA QUÝ (43-NHS-03)
  // ========================================================
  let teamHoaQuy = await RescueTeam.findOne({
    $or: [{ name: /43-NHS-03/i }, { name: /Sơ Tán.*Hòa Quý/i }],
  });

  const hoaQuyMembers = [
    { rescuerId: dangVanLong._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: leVanHai._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
  ];

  if (!teamHoaQuy) {
    teamHoaQuy = await RescueTeam.create({
      name: 'Đội Cứu Trợ & Sơ Tán Lũ Lụt Hòa Quý (43-NHS-03)',
      type: 'GENERAL_RESCUE',
      leaderId: dangVanLong._id,
      authorityId: authorityNHS._id,
      areaId: wardHoaQuy ? wardHoaQuy._id : districtNHS._id,
      description: 'Chuyên trách xe tải lội nước sơ tán hàng loạt và vận chuyển lương thực, nước sạch tiếp tế các khu vực chia cắt tại Phường Hòa Quý.',
      status: 'ACTIVE',
      members: hoaQuyMembers,
    });
    console.log('➕ Đã tạo Đội sơ tán:', teamHoaQuy.name);
  } else {
    teamHoaQuy.type = 'GENERAL_RESCUE';
    teamHoaQuy.leaderId = dangVanLong._id;
    teamHoaQuy.authorityId = authorityNHS._id;
    teamHoaQuy.areaId = wardHoaQuy ? wardHoaQuy._id : districtNHS._id;
    teamHoaQuy.status = 'ACTIVE';
    teamHoaQuy.members = hoaQuyMembers;
    await teamHoaQuy.save();
    console.log('✔ Đã cập nhật Đội sơ tán:', teamHoaQuy.name);
  }

  // Phương tiện Đội Hòa Quý
  const hoaQuyVehicles = [
    {
      plateNumber: '43-XS-05',
      type: 'BOAT',
      capacity: 6,
      status: 'AVAILABLE',
      description: 'Xuồng máy lội nước dã chiến cứu hộ vùng trũng Hòa Quý.',
    },
    {
      plateNumber: '43C-999.77',
      type: 'TRUCK',
      capacity: 12,
      status: 'AVAILABLE',
      description: 'Xe tải 3.5 tấn gầm cao chuyên sơ tán người già và vận chuyển lương thực tiếp tế.',
    },
  ];

  for (const vData of hoaQuyVehicles) {
    let veh = await Vehicle.findOne({ plateNumber: vData.plateNumber });
    if (!veh) {
      veh = await Vehicle.create({
        ...vData,
        teamId: teamHoaQuy._id,
      });
      console.log(`   ➕ Phương tiện: ${veh.plateNumber} (${veh.type})`);
    } else {
      veh.teamId = teamHoaQuy._id;
      veh.status = 'AVAILABLE';
      veh.description = vData.description;
      await veh.save();
      console.log(`   ✔ Đã cập nhật Phương tiện: ${veh.plateNumber}`);
    }
  }

  // ========================================================
  // ĐỘI 4: ĐỘI XE CỨU THƯƠNG & Y TẾ KHẨN CẤP MỸ AN (43-MED-MYAN)
  // ========================================================
  let teamMedMyAn = await RescueTeam.findOne({
    $or: [{ name: /43-MED-MYAN/i }, { name: /Cứu Thương.*Mỹ An/i }],
  });

  const myAnMembers = [
    { rescuerId: bsNghia._id, role: 'LEADER', joinedAt: new Date(), status: 'APPROVED' },
    { rescuerId: dsTrang._id, role: 'MEMBER', joinedAt: new Date(), status: 'APPROVED' },
  ];

  if (!teamMedMyAn) {
    teamMedMyAn = await RescueTeam.create({
      name: 'Đội Xe Cứu Thương & Phản Ứng Y Tế Mỹ An (43-MED-MYAN)',
      type: 'MEDICAL_RESCUE',
      leaderId: bsNghia._id,
      authorityId: authorityNHS._id,
      areaId: wardMyAn ? wardMyAn._id : districtNHS._id,
      description: 'Đội xe cứu thương cơ động thường trực ven biển Mỹ An và các tuyến phố ngập cục bộ, tiếp nhận nạn nhân chấn thương và cấp cứu chuyển viện.',
      status: 'ACTIVE',
      members: myAnMembers,
    });
    console.log('➕ Đã tạo Đội cứu thương Mỹ An:', teamMedMyAn.name);
  } else {
    teamMedMyAn.type = 'MEDICAL_RESCUE';
    teamMedMyAn.leaderId = bsNghia._id;
    teamMedMyAn.authorityId = authorityNHS._id;
    teamMedMyAn.areaId = wardMyAn ? wardMyAn._id : districtNHS._id;
    teamMedMyAn.status = 'ACTIVE';
    teamMedMyAn.members = myAnMembers;
    await teamMedMyAn.save();
    console.log('✔ Đã cập nhật Đội cứu thương Mỹ An:', teamMedMyAn.name);
  }

  // Phương tiện Đội Cứu thương Mỹ An
  const myAnVehicles = [
    {
      plateNumber: '43B-115.77',
      type: 'AMBULANCE',
      capacity: 4,
      status: 'AVAILABLE',
      description: 'Xe cứu thương lưu động Mỹ An trang bị giường cáng, máy hút đờm và bình oxy sơ cứu.',
    },
  ];

  for (const vData of myAnVehicles) {
    let veh = await Vehicle.findOne({ plateNumber: vData.plateNumber });
    if (!veh) {
      veh = await Vehicle.create({
        ...vData,
        teamId: teamMedMyAn._id,
      });
      console.log(`   ➕ Xe cứu thương Mỹ An: ${veh.plateNumber}`);
    } else {
      veh.teamId = teamMedMyAn._id;
      veh.type = 'AMBULANCE';
      veh.status = 'AVAILABLE';
      veh.description = vData.description;
      await veh.save();
      console.log(`   ✔ Đã cập nhật Xe cứu thương Mỹ An: ${veh.plateNumber}`);
    }
  }

  console.log('\n✔ Hoàn thành tạo các đội cứu hộ & xe cứu thương bổ sung tại Ngũ Hành Sơn!');

  if (isDirectRun) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seedAdditionalTeamsNHS().catch((err) => {
    console.error('❌ Lỗi khi seed bổ sung đội cứu hộ:', err);
    process.exit(1);
  });
}

module.exports = { seedAdditionalTeamsNHS };

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, AdministrativeArea, AuthorityOrganization } = require('./models');

const seed = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
    await mongoose.connect(mongoUri);
    console.log('🌱 Connected to MongoDB for seeding...');

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // 1. Ensure Administrative Area exists
    let area = await AdministrativeArea.findOne({ code: 'AREA_HN_01' });
    if (!area) {
      area = await AdministrativeArea.create({
        name: 'Quận Cầu Giấy, Hà Nội',
        type: 'DISTRICT',
        code: 'AREA_HN_01',
        parentId: null,
      });
      console.log('Created Area:', area.name);
    }

    // 2. Ensure Authority Organization exists
    let org = await AuthorityOrganization.findOne({ code: 'BCH_PCTT_CG' });
    if (!org) {
      org = await AuthorityOrganization.create({
        name: 'Ban Chỉ Huy Phòng Chống Thiên Tai & Tìm Kiếm Cứu Nạn Cầu Giấy',
        type: 'DISTRICT',
        code: 'BCH_PCTT_CG',
        areaId: area._id,
        address: 'Số 1 Trần Thái Tông, Cầu Giấy, Hà Nội',
        phone: '0982223344',
      });
      console.log('Created Organization:', org.name);
    }

    // 3. Seed ADMIN
    let admin = await User.findOne({ email: 'admin@sos.vn' });
    if (!admin) {
      admin = await User.create({
        fullName: 'Quản Trị Viên Hệ Thống',
        email: 'admin@sos.vn',
        phone: '0901000001',
        passwordHash: defaultPasswordHash,
        roles: ['ADMIN'],
        status: 'ACTIVE',
        isVerified: true,
      });
      console.log('✅ Created ADMIN: admin@sos.vn');
    }

    // 4. Seed LOCAL_AUTHORITY
    let authority = await User.findOne({ email: 'authority@sos.vn' });
    if (!authority) {
      authority = await User.create({
        fullName: 'Đ/c Nguyễn Văn Chỉ Huy (PCTT)',
        email: 'authority@sos.vn',
        phone: '0902000002',
        passwordHash: defaultPasswordHash,
        roles: ['LOCAL_AUTHORITY'],
        status: 'ACTIVE',
        isVerified: true,
        authority: {
          organizationId: org._id,
          areaId: area._id,
          position: 'Phó Ban Thường Trực',
          department: 'Văn Phòng Ban Chỉ Huy',
        },
      });
      console.log('✅ Created LOCAL_AUTHORITY: authority@sos.vn');
    }

    // 5. Seed RESCUER
    let rescuer = await User.findOne({ email: 'rescuer@sos.vn' });
    if (!rescuer) {
      rescuer = await User.create({
        fullName: 'Lê Cứu Nạn (Đội Cứu Hộ Phản Ứng Nhanh)',
        email: 'rescuer@sos.vn',
        phone: '0903000003',
        passwordHash: defaultPasswordHash,
        roles: ['RESCUER'],
        status: 'ACTIVE',
        isVerified: true,
        rescuer: {
          idNumber: '001095012345',
          skills: ['Cứu hộ vùng ngập lụt', 'Sơ cấp cứu chấn thương', 'Lái cano cao tốc'],
          experience: '5 năm tham gia đội cứu hộ tình nguyện',
          vehicleType: 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log('✅ Created RESCUER: rescuer@sos.vn');
    }

    // 6. Ensure CITIZEN exists
    let citizen = await User.findOne({ email: 'nguyenvantest@sos.vn' });
    if (!citizen) {
      citizen = await User.create({
        fullName: 'Nguyễn Văn Test (Công Dân)',
        email: 'nguyenvantest@sos.vn',
        phone: '0981122334',
        passwordHash: defaultPasswordHash,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        address: '123 Đường Cứu Nạn, Hà Nội',
        citizen: {
          emergencyContact: {
            name: 'Trần Thị Người Thân',
            phone: '0912345678',
            relation: 'Vợ/Chồng',
          },
        },
      });
      console.log('✅ Created CITIZEN: nguyenvantest@sos.vn');
    }

    console.log('🎉 Seeding finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seed();

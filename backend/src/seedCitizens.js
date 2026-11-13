require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, AdministrativeArea } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const CITIZENS_DATA = [
  {
    fullName: 'Trần Anh Tuấn',
    phone: '0905910001',
    email: 'nguoidan01@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1988-04-15'),
    address: 'Số 45 Đường 2 Tháng 9, Phường Hòa Cường Bắc, Quận Hải Châu, TP Đà Nẵng',
    areaSearch: 'Hải Châu',
    lng: 108.2201,
    lat: 16.0452,
    emergencyName: 'Trần Thị Hạnh (Vợ)',
    emergencyPhone: '0905810001',
    emergencyRelation: 'Vợ',
  },
  {
    fullName: 'Lê Thị Mai Hương',
    phone: '0905910002',
    email: 'nguoidan02@sos.vn',
    gender: 'FEMALE',
    dateOfBirth: new Date('1992-08-20'),
    address: 'Khu dân cư Nam Cầu Cẩm Lệ, Phường Hòa Xuân, Quận Cẩm Lệ, TP Đà Nẵng',
    areaSearch: 'Cẩm Lệ',
    lng: 108.2165,
    lat: 15.9984,
    emergencyName: 'Lê Văn Hiếu (Bố)',
    emergencyPhone: '0905810002',
    emergencyRelation: 'Bố',
  },
  {
    fullName: 'Phạm Văn Dũng',
    phone: '0905910003',
    email: 'nguoidan03@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1985-11-03'),
    address: 'Thôn An Trạch, Xã Xuân Phú, TP Đà Nẵng',
    areaSearch: 'Xuân Phú',
    lng: 108.1852,
    lat: 16.0125,
    emergencyName: 'Phạm Thị Lan (Em gái)',
    emergencyPhone: '0905810003',
    emergencyRelation: 'Em gái',
  },
  {
    fullName: 'Hoàng Ngọc Ánh',
    phone: '0905910004',
    email: 'nguoidan04@sos.vn',
    gender: 'FEMALE',
    dateOfBirth: new Date('1995-02-14'),
    address: 'Số 112 Lê Văn Hiến, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, TP Đà Nẵng',
    areaSearch: 'Ngũ Hành Sơn',
    lng: 108.2435,
    lat: 16.0289,
    emergencyName: 'Hoàng Văn Thắng (Anh trai)',
    emergencyPhone: '0905810004',
    emergencyRelation: 'Anh trai',
  },
  {
    fullName: 'Vũ Đức Thắng',
    phone: '0905910005',
    email: 'nguoidan05@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1990-06-25'),
    address: 'Số 78 Nguyễn Lương Bằng, Phường Hòa Khánh Bắc, Quận Liên Chiểu, TP Đà Nẵng',
    areaSearch: 'Liên Chiểu',
    lng: 108.1512,
    lat: 16.0745,
    emergencyName: 'Vũ Thị Minh (Mẹ)',
    emergencyPhone: '0905810005',
    emergencyRelation: 'Mẹ',
  },
  {
    fullName: 'Đỗ Thúy Hằng',
    phone: '0905910006',
    email: 'nguoidan06@sos.vn',
    gender: 'FEMALE',
    dateOfBirth: new Date('1993-12-10'),
    address: 'Số 25 Võ Văn Kiệt, Phường Phước Mỹ, Quận Sơn Trà, TP Đà Nẵng',
    areaSearch: 'Sơn Trà',
    lng: 108.2411,
    lat: 16.0623,
    emergencyName: 'Đỗ Quốc Bảo (Chồng)',
    emergencyPhone: '0905810006',
    emergencyRelation: 'Chồng',
  },
  {
    fullName: 'Bùi Minh Trí',
    phone: '0905910007',
    email: 'nguoidan07@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1987-03-30'),
    address: 'Thôn Túy Loan Đông, Xã Hòa Phong, Huyện Hòa Vang, TP Đà Nẵng',
    areaSearch: 'Hòa Vang',
    lng: 108.1324,
    lat: 15.9876,
    emergencyName: 'Bùi Văn Hùng (Bố)',
    emergencyPhone: '0905810007',
    emergencyRelation: 'Bố',
  },
  {
    fullName: 'Ngô Phương Thảo',
    phone: '0905910008',
    email: 'nguoidan08@sos.vn',
    gender: 'FEMALE',
    dateOfBirth: new Date('1998-09-08'),
    address: 'Số 89 Điện Biên Phủ, Phường Chính Gián, Quận Thanh Khê, TP Đà Nẵng',
    areaSearch: 'Thanh Khê',
    lng: 108.1975,
    lat: 16.0658,
    emergencyName: 'Ngô Văn Thành (Bố)',
    emergencyPhone: '0905810008',
    emergencyRelation: 'Bố',
  },
  {
    fullName: 'Đinh Văn Nam',
    phone: '0905910009',
    email: 'nguoidan09@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1991-05-19'),
    address: 'Xóm Cồn Đảo, Thôn Phú Sơn, Xã Xuân Phú, TP Đà Nẵng',
    areaSearch: 'Xuân Phú',
    lng: 108.1795,
    lat: 16.0098,
    emergencyName: 'Đinh Thị Loan (Vợ)',
    emergencyPhone: '0905810009',
    emergencyRelation: 'Vợ',
  },
  {
    fullName: 'Huỳnh Thanh Tùng',
    phone: '0905910010',
    email: 'nguoidan10@sos.vn',
    gender: 'MALE',
    dateOfBirth: new Date('1989-10-12'),
    address: 'Số 36 Nguyễn Tri Phương, Phường Thạc Gián, Quận Thanh Khê, TP Đà Nẵng',
    areaSearch: 'Thanh Khê',
    lng: 108.2045,
    lat: 16.0592,
    emergencyName: 'Huỳnh Văn Đức (Anh trai)',
    emergencyPhone: '0905810010',
    emergencyRelation: 'Anh trai',
  },
];

async function seedCitizens() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Kết nối MongoDB thành công');

    const passwordHash = await bcrypt.hash('Password@123', 10);
    const createdUsers = [];

    // Nạp cache danh sách AdministrativeArea
    const allAreas = await AdministrativeArea.find({});

    for (const item of CITIZENS_DATA) {
      // Tìm khu vực phù hợp
      let matchedArea = allAreas.find((a) =>
        a.name && new RegExp(item.areaSearch, 'i').test(a.name)
      );
      if (!matchedArea) {
        matchedArea = allAreas.find((a) => a.code === 'DAD-D-3') || allAreas[0];
      }

      const areaId = matchedArea ? matchedArea._id : null;
      const areaName = matchedArea ? matchedArea.name : 'Thành phố Đà Nẵng';

      const citizenPayload = {
        fullName: item.fullName,
        phone: item.phone,
        email: item.email,
        passwordHash,
        gender: item.gender,
        dateOfBirth: item.dateOfBirth,
        address: item.address,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
        isVerified: true,
        isPhoneVerified: true,
        citizen: {
          areaId,
          areaName,
          emergencyContact: {
            name: item.emergencyName,
            phone: item.emergencyPhone,
            relation: item.emergencyRelation,
            address: item.address,
            latitude: item.lat,
            longitude: item.lng,
          },
          emergencyContacts: [
            {
              id: new mongoose.Types.ObjectId().toString(),
              name: item.emergencyName,
              phone: item.emergencyPhone,
              relation: item.emergencyRelation,
              address: item.address,
              latitude: item.lat,
              longitude: item.lng,
            },
          ],
          currentLocation: {
            type: 'Point',
            coordinates: [item.lng, item.lat],
          },
          currentLocationUpdatedAt: new Date(),
        },
      };

      // Upsert: nếu tài khoản đã có thì cập nhật, nếu chưa có thì tạo mới
      const user = await User.findOneAndUpdate(
        { phone: item.phone },
        { $set: citizenPayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      createdUsers.push(user);
      console.log(`👤 Đã tạo/cập nhật: ${user.fullName} | SĐT: ${user.phone} | Email: ${user.email}`);
    }

    console.log(`\n🎉 Thành công tạo ${createdUsers.length} tài khoản người dân!`);
    console.log('🔑 Mật khẩu mặc định: Password@123');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi tạo tài khoản người dân:', error);
    process.exit(1);
  }
}

seedCitizens();


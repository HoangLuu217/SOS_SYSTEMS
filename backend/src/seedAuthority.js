const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seedAuthorityUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const org = await db.collection('authority_organizations').findOne({});
  const area = await db.collection('administrative_areas').findOne({ type: 'WARD' }) ||
               await db.collection('administrative_areas').findOne({ type: 'DISTRICT' }) ||
               await db.collection('administrative_areas').findOne({});

  const passwordHash = bcrypt.hashSync('123456', 10);

  // 1. LOCAL_AUTHORITY account 1: Huong Pham (Lead Coordinator)
  const authUser = {
    phone: '0905114115',
    email: 'authority@rescuesos.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Huong Pham',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'FEMALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: area ? area._id : null,
      position: 'Lead Coordinator',
      department: 'UBND Phường Thuận Phước',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905114115' },
    { $set: authUser },
    { upsert: true }
  );

  // 1b. LOCAL_AUTHORITY account 2: Trần Văn Cường (Phường Hòa Cường)
  const hoaCuongArea = await db.collection('administrative_areas').findOne({ code: /HC|HTD/ }) || area;
  const cuongUser = {
    phone: '0905114116',
    email: 'cuong.tran@rescuesos.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Trần Văn Cường',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'MALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: hoaCuongArea ? hoaCuongArea._id : null,
      position: 'Cán bộ Chỉ huy Địa bàn',
      department: 'Ban Chỉ huy PCCC & CNCH Hòa Cường',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905114116' },
    { $set: cuongUser },
    { upsert: true }
  );

  // 1c. LOCAL_AUTHORITY account 3: Võ Văn Kiệt (Quận Ngũ Hành Sơn)
  const nhsArea = await db.collection('administrative_areas').findOne({ name: /Ngũ Hành Sơn/i }) || area;
  const kietUser = {
    phone: '0905114119',
    email: 'kiet.vo@nguhanhson.danang.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Võ Văn Kiệt',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'MALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: nhsArea ? nhsArea._id : null,
      position: 'Chỉ Huy Trực Ban Ngũ Hành Sơn',
      department: 'Ban Chỉ Huy PCTT Phường Ngũ Hành Sơn',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905114119' },
    { $set: kietUser },
    { upsert: true }
  );

  // 1d. LOCAL_AUTHORITY account 4: Lê Hoàng Nam (Phường Sơn Trà)
  const sonTraArea = await db.collection('administrative_areas').findOne({ name: /Sơn Trà/i }) || area;
  const sonTraUser = {
    phone: '0905114117',
    email: 'nam.le@sontra.danang.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Lê Hoàng Nam',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'MALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: sonTraArea ? sonTraArea._id : null,
      position: 'Chỉ Huy Trực Ban Sơn Trà',
      department: 'Ban Chỉ Huy PCTT Phường Sơn Trà',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905114117' },
    { $set: sonTraUser },
    { upsert: true }
  );

  // 1e. LOCAL_AUTHORITY account 5: Lê Văn Nam (Phường Cẩm Lệ)
  const camLeArea = await db.collection('administrative_areas').findOne({ name: /Cẩm Lệ/i }) || area;
  const camLeUser = {
    phone: '0905777888',
    email: 'nam.le@camle.danang.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Lê Văn Nam',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'MALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: camLeArea ? camLeArea._id : null,
      position: 'Chỉ Huy Trực Ban Cẩm Lệ',
      department: 'Ban Chỉ Huy PCTT Phường Cẩm Lệ',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905777888' },
    { $set: camLeUser },
    { upsert: true }
  );

  // 1f. LOCAL_AUTHORITY account 6: Phạm Minh Đức (Phường Thanh Khê)
  const thanhKheArea = await db.collection('administrative_areas').findOne({ name: /Thanh Khê/i }) || area;
  const thanhKheUser = {
    phone: '0905114118',
    email: 'duc.pham@thanhkhe.danang.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Phạm Minh Đức',
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    gender: 'MALE',
    authority: {
      organizationId: org ? org._id : null,
      areaId: thanhKheArea ? thanhKheArea._id : null,
      position: 'Chỉ Huy Trực Ban Thanh Khê',
      department: 'Ban Chỉ Huy PCTT Phường Thanh Khê',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905114118' },
    { $set: thanhKheUser },
    { upsert: true }
  );

  // 2. ADMIN account
  const adminUser = {
    phone: '0905999999',
    email: 'admin@rescuesos.gov.vn',
    passwordHash: passwordHash,
    fullName: 'Quản Trị Viên Hệ Thống',
    roles: ['ADMIN'],
    status: 'ACTIVE',
    gender: 'MALE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').updateOne(
    { phone: '0905999999' },
    { $set: adminUser },
    { upsert: true }
  );

  console.log('SEED_SUCCESS');
  process.exit(0);
}

seedAuthorityUser().catch((e) => {
  console.error('SEED_ERROR:', e);
  process.exit(1);
});

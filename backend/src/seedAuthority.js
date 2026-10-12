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

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seedAdminUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const passwordHash = bcrypt.hashSync('123456', 10);

  // Chỉ khởi tạo tài khoản Quản Trị Viên (ADMIN) mặc định
  // Các tài khoản Cán bộ địa phương (LOCAL_AUTHORITY) sẽ được Admin chủ động tạo qua giao diện
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

  console.log('[SEED] Đã khởi tạo thành công tài khoản Quản trị viên (ADMIN: 0905999999 / 123456)');
  console.log('[SEED] Các tài khoản Cán bộ địa phương ảo đã được dọn sạch.');
  process.exit(0);
}

seedAdminUser().catch((e) => {
  console.error('SEED_ERROR:', e);
  process.exit(1);
});

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function seedHaiChau() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { User } = require('./models');

  const phone = '0905114001';
  const passwordHash = await bcrypt.hash('Password@123', 10);

  const updateData = {
    fullName: 'Cán bộ Nguyễn Hải Nam (Trực ban Hải Châu)',
    phone: phone,
    email: 'pctt.haichau@danang.gov.vn',
    passwordHash: passwordHash,
    roles: ['LOCAL_AUTHORITY'],
    status: 'ACTIVE',
    isVerified: true,
    authority: {
      organizationId: new mongoose.Types.ObjectId(),
      areaId: new mongoose.Types.ObjectId(),
      areaName: 'Phường Hải Châu, Thành phố Đà Nẵng',
      department: 'Ban Chỉ Huy PCTT Phường Hải Châu',
      position: 'Chỉ Huy Trưởng Trực Ban PCTT Phường Hải Châu',
    },
    address: 'Phường Hải Châu, Thành phố Đà Nẵng',
  };

  const user = await User.findOneAndUpdate(
    { phone },
    { $set: updateData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('✅ Đã tạo/cập nhật thành công tài khoản Cán bộ Phường Hải Châu:');
  console.log(`   - Họ tên: ${user.fullName}`);
  console.log(`   - SĐT đăng nhập: ${user.phone} / Password@123`);
  console.log(`   - Đơn vị: ${user.authority?.department}`);
  console.log(`   - Địa bàn: ${user.authority?.areaName}`);
  process.exit(0);
}

seedHaiChau().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});


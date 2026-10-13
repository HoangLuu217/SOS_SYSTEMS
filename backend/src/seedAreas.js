const mongoose = require('mongoose');
require('dotenv').config();
const { AdministrativeArea } = require('./models');

const AREAS_TO_SEED = [
  { name: 'Phường Hải Châu', code: 'DAD-HC-01', type: 'WARD' },
  { name: 'Phường Hòa Cường', code: 'DAD-HC-02', type: 'WARD' },
  { name: 'Phường Thanh Khê', code: 'DAD-TK-01', type: 'WARD' },
  { name: 'Phường An Khê', code: 'DAD-TK-02', type: 'WARD' },
  { name: 'Phường Sơn Trà', code: 'DAD-ST-01', type: 'WARD' },
  { name: 'Phường An Hải', code: 'DAD-ST-02', type: 'WARD' },
  { name: 'Phường Ngũ Hành Sơn', code: 'DAD-NHS-01', type: 'WARD' },
  { name: 'Phường Cẩm Lệ', code: 'DAD-CL-01', type: 'WARD' },
  { name: 'Phường Hòa Xuân', code: 'DAD-CL-02', type: 'WARD' },
  { name: 'Phường Liên Chiểu', code: 'DAD-LC-01', type: 'WARD' },
  { name: 'Phường Hòa Khánh', code: 'DAD-LC-02', type: 'WARD' },
  { name: 'Phường Hải Vân', code: 'DAD-LC-03', type: 'WARD' },
  { name: 'Xã Hòa Vang', code: 'DAD-HV-01', type: 'WARD' },
  { name: 'Xã Bà Nà', code: 'DAD-HV-02', type: 'WARD' },
  { name: 'Xã Hòa Tiến', code: 'DAD-HV-03', type: 'WARD' },
  { name: 'Huyện Hoàng Sa', code: 'DAD-HS', type: 'DISTRICT' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  let danang = await AdministrativeArea.findOne({ code: 'DANANG' });
  if (!danang) {
    danang = await AdministrativeArea.create({
      name: 'Thành phố Đà Nẵng',
      code: 'DANANG',
      type: 'PROVINCE',
      status: 'ACTIVE',
    });
  }

  for (const a of AREAS_TO_SEED) {
    await AdministrativeArea.findOneAndUpdate(
      { code: a.code },
      {
        $set: {
          name: a.name,
          code: a.code,
          type: a.type,
          parentId: danang._id,
          status: 'ACTIVE',
        },
      },
      { upsert: true, new: true }
    );
  }

  console.log('✅ Đã đồng bộ các khu vực hành chính vào MongoDB!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

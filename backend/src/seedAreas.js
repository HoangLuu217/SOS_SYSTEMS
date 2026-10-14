const mongoose = require('mongoose');
require('dotenv').config();
const { AdministrativeArea } = require('./models');

function consolidateWardName(name) {
  return name.replace(/\s+(Bắc|Nam|Đông|Tây|1|2|I|II)$/i, '').trim();
}

/**
 * Script đồng bộ khu vực hành chính trực tiếp từ API bản đồ Việt Nam (KHÔNG DÙNG DỮ LIỆU CỨNG)
 */
async function syncFromLiveApi() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB:', process.env.MONGODB_URI);

  console.log('Đang gọi trực tiếp API bản đồ Việt Nam...');
  const res = await fetch('https://provinces.open-api.vn/api/p/48?depth=3');
  if (!res.ok) throw new Error('Không thể gọi API: ' + res.status);
  const provData = await res.json();

  // 1. Tỉnh/Thành gốc
  let danang = await AdministrativeArea.findOne({ code: 'DANANG' });
  if (!danang) {
    danang = await AdministrativeArea.create({
      name: provData.name || 'Thành phố Đà Nẵng',
      code: 'DANANG',
      type: 'PROVINCE',
      status: 'ACTIVE',
    });
  }

  // 2. 8 Quận / Huyện từ API
  const districtMap = {};
  for (const [idx, d] of provData.districts.entries()) {
    const code = `DAD-D-${idx + 1}`;
    const doc = await AdministrativeArea.findOneAndUpdate(
      { code },
      {
        $set: {
          name: d.name,
          code,
          type: 'DISTRICT',
          parentId: danang._id,
          status: 'ACTIVE',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    districtMap[d.name] = doc._id;
  }
  console.log(`Đã đồng bộ ${Object.keys(districtMap).length} Quận/Huyện từ API.`);

  // 3. Phường / Xã từ API (Tự động gộp các phường tách nhỏ như Phường An Hải)
  const mergedWardsMap = new Map();
  provData.districts.forEach((d) => {
    (d.wards || []).forEach((w) => {
      const unifiedName = consolidateWardName(w.name);
      const key = `${d.name}::${unifiedName}`;
      if (!mergedWardsMap.has(key)) {
        mergedWardsMap.set(key, { district: d.name, name: unifiedName, code: w.code });
      }
    });
  });

  let wardIdx = 1;
  for (const item of mergedWardsMap.values()) {
    const code = `DAD-W-${wardIdx++}`;
    const parentId = districtMap[item.district] || danang._id;
    await AdministrativeArea.findOneAndUpdate(
      { code },
      {
        $set: {
          name: item.name,
          code,
          type: 'WARD',
          parentId,
          status: 'ACTIVE',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
  }

  console.log(`Đã đồng bộ ${mergedWardsMap.size} Phường/Xã hợp nhất trực tiếp từ API vào CSDL.`);
  await mongoose.disconnect();
  console.log('Hoàn tất đồng bộ từ API.');
}

syncFromLiveApi().catch((err) => {
  console.error(err);
  process.exit(1);
});

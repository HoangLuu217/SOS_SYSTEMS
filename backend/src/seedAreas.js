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

  // 1. Đồng bộ toàn bộ 63 Tỉnh/Thành phố của Việt Nam từ API
  console.log('Đang gọi API lấy danh mục toàn bộ 63 Tỉnh/Thành phố Việt Nam...');
  const provListRes = await fetch('https://provinces.open-api.vn/api/p/');
  if (!provListRes.ok) throw new Error('Không thể tải danh sách tỉnh thành: ' + provListRes.status);
  const provList = await provListRes.json();

  let danangDoc = null;
  for (const p of provList) {
    const isDaNang = p.code === 48 || p.name.includes('Đà Nẵng');
    const code = isDaNang ? 'DANANG' : `VN-P-${p.code}`;
    const doc = await AdministrativeArea.findOneAndUpdate(
      { code },
      {
        $set: {
          name: p.name,
          code,
          type: 'PROVINCE',
          parentId: null,
          status: 'ACTIVE',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    if (isDaNang) danangDoc = doc;
  }
  console.log(`✅ Đã đồng bộ thành công ${provList.length} Tỉnh/Thành phố Việt Nam từ API.`);

  // 2. Đồng bộ chi tiết Quận/Huyện & Phường/Xã trọng điểm của Đà Nẵng
  console.log('Đang gọi API lấy chi tiết Quận/Huyện và Phường/Xã Đà Nẵng...');
  const dnRes = await fetch('https://provinces.open-api.vn/api/p/48?depth=3');
  if (!dnRes.ok) throw new Error('Không thể gọi API Đà Nẵng: ' + dnRes.status);
  const provData = await dnRes.json();

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
          parentId: danangDoc ? danangDoc._id : null,
          status: 'ACTIVE',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    districtMap[d.name] = doc._id;
  }
  console.log(`✅ Đã đồng bộ ${Object.keys(districtMap).length} Quận/Huyện từ API.`);

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
    const parentId = districtMap[item.district] || (danangDoc ? danangDoc._id : null);
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

  console.log(`✅ Đã đồng bộ ${mergedWardsMap.size} Phường/Xã hợp nhất trực tiếp từ API vào CSDL.`);
  await mongoose.disconnect();
  console.log('🎉 Hoàn tất toàn bộ quá trình đồng bộ khu vực hành chính từ API.');
  process.exit(0);
}

syncFromLiveApi().catch((err) => {
  console.error('❌ Lỗi đồng bộ khu vực từ API:', err);
  process.exit(1);
});

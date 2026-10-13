const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Helper to format CamelCase names to spaced Vietnamese names
function formatVietnameseCamelCase(str) {
  if (!str) return '';
  return str
    .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2')
    .replace(/([\p{L}])(I{1,3}|IV|V|VI{1,3}|IX|X)$/gu, '$1 $2')
    .replace(/I\s+I/g, 'II')
    .replace(/I\s+I\s+I/g, 'III')
    .trim();
}

async function seedAdministrativeAreas() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
  console.log(`🔌 Kết nối MongoDB: ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const gadmPath = path.join(__dirname, '../data/gadm41_VNM_3.json');
  if (!fs.existsSync(gadmPath)) {
    throw new Error(`Không tìm thấy file dữ liệu chuẩn: ${gadmPath}`);
  }

  console.log(`📂 Đang đọc dữ liệu hành chính từ ${gadmPath}...`);
  const rawData = JSON.parse(fs.readFileSync(gadmPath, 'utf-8'));
  const features = rawData.features || [];
  console.log(`📊 Tổng số đơn vị xã/phường (level 3) tìm thấy: ${features.length}`);

  // Maps to aggregate Provinces and Districts
  const provinceMap = new Map(); // GID_1 -> { _id, name, code, type: 'PROVINCE' }
  const districtMap = new Map(); // GID_2 -> { _id, name, code, type: 'DISTRICT', parentId }
  const wardDocs = [];

  for (const f of features) {
    const p = f.properties;
    const provId = p.GID_1;
    const distId = p.GID_2;
    const wardId = p.GID_3;

    // 1. Tỉnh / Thành phố trực thuộc Trung ương
    if (!provinceMap.has(provId)) {
      const pName = formatVietnameseCamelCase(p.NAME_1);
      const prefix = ['Hà Nội', 'Đà Nẵng', 'Hồ Chí Minh', 'Hải Phòng', 'Cần Thơ'].includes(pName)
        ? 'Thành phố '
        : 'Tỉnh ';
      provinceMap.set(provId, {
        _id: new mongoose.Types.ObjectId(),
        name: prefix + pName,
        code: provId,
        type: 'PROVINCE',
        parentId: null,
        status: 'ACTIVE',
      });
    }

    // 2. Quận / Huyện / Thị xã / Thành phố thuộc tỉnh
    if (!districtMap.has(distId)) {
      const parentProv = provinceMap.get(provId);
      const dName = formatVietnameseCamelCase(p.NAME_2);
      const dType = p.TYPE_2 ? formatVietnameseCamelCase(p.TYPE_2) : 'Quận/Huyện';
      districtMap.set(distId, {
        _id: new mongoose.Types.ObjectId(),
        name: `${dType} ${dName}`.trim(),
        code: distId,
        type: 'DISTRICT',
        parentId: parentProv._id,
        status: 'ACTIVE',
      });
    }

    // 3. Xã / Phường / Thị trấn
    const parentDist = districtMap.get(distId);
    const wName = formatVietnameseCamelCase(p.NAME_3);
    const wType = p.TYPE_3 ? formatVietnameseCamelCase(p.TYPE_3) : 'Phường/Xã';

    // Đảm bảo geometry hợp lệ (Polygon hoặc MultiPolygon)
    let boundary = undefined;
    if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
      boundary = {
        type: f.geometry.type,
        coordinates: f.geometry.coordinates,
      };
    }

    wardDocs.push({
      _id: new mongoose.Types.ObjectId(),
      name: `${wType} ${wName}`.trim(),
      code: wardId,
      type: 'WARD',
      parentId: parentDist._id,
      boundary,
      status: 'ACTIVE',
    });
  }

  const allDocs = [
    ...provinceMap.values(),
    ...districtMap.values(),
    ...wardDocs,
  ];

  console.log(`📦 Thống kê dữ liệu nạp:`);
  console.log(`   - Tỉnh / Thành phố : ${provinceMap.size}`);
  console.log(`   - Quận / Huyện     : ${districtMap.size}`);
  console.log(`   - Xã / Phường      : ${wardDocs.length}`);
  console.log(`   - Tổng số bản ghi  : ${allDocs.length}`);

  const col = mongoose.connection.collection('administrative_areas');
  console.log(`🧹 Đang dọn dẹp collection 'administrative_areas' cũ...`);
  await col.deleteMany({});

  console.log(`🚀 Đang nạp dữ liệu theo batch (1000 bản ghi/batch)...`);
  const BATCH_SIZE = 1000;
  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const chunk = allDocs.slice(i, i + BATCH_SIZE);
    await col.insertMany(chunk, { ordered: false });
    process.stdout.write(`   ➡️ Đã nạp ${Math.min(i + BATCH_SIZE, allDocs.length)} / ${allDocs.length} bản ghi\r`);
  }
  console.log(`\n✅ Nạp dữ liệu hoàn tất 100%!`);

  console.log(`🔍 Tạo index cho collection...`);
  await col.createIndex({ parentId: 1 });
  await col.createIndex({ type: 1 });
  await col.createIndex({ code: 1 }, { unique: true });
  try {
    await col.createIndex({ boundary: '2dsphere' }, { sparse: true });
    console.log(`✅ Đã tạo spatial index 2dsphere trên trường 'boundary'!`);
  } catch (idxErr) {
    console.warn(`⚠️ Spatial index notice: ${idxErr.message}`);
  }

  // Kiểm tra riêng Đà Nẵng và Phường An Khê
  const dnDistricts = await col.find({
    parentId: provinceMap.get('VNM.19_1')._id,
    type: 'DISTRICT',
  }).toArray();
  console.log(`\n📍 Kiểm tra Quận/Huyện TP Đà Nẵng:`, dnDistricts.map(d => d.name));

  const anKhe = await col.findOne({ code: 'VNM.19.7.1_1' });
  const anKheParent = await col.findOne({ _id: anKhe?.parentId });
  console.log(`📍 Kiểm tra Phường An Khê:`, anKhe?.name, `-> Thuộc:`, anKheParent?.name);

  await mongoose.disconnect();
  console.log(`🎉 Hoàn tất toàn bộ quy trình!`);
}

seedAdministrativeAreas().catch((err) => {
  console.error('❌ Lỗi seed administrative areas:', err);
  process.exit(1);
});

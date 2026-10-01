/**
 * Kiểm thử tự động chuyên sâu cho Module D:
 * 1. Administrative Area (Khu vực hành chính)
 * 2. Authority Organization (Cơ quan / Đơn vị thẩm quyền)
 * 3. SOS Assignment (Điều phối cứu hộ SOS)
 *
 * Khớp 100% với các Use Cases trong Module_D_Postman_Collection.json
 */
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const {
  User,
  RescueTeam,
  Vehicle,
  SosRequest,
  AdministrativeArea,
  AuthorityOrganization,
  SosAssignment,
} = require('./src/models');

const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function apiRequest(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

const state = {};
let passedCount = 0;
let failedCount = 0;
const results = [];

function recordTest(ucName, endpoint, isPass, details) {
  if (isPass) {
    passedCount++;
    console.log(`  ✅ [PASS] ${ucName} -> ${endpoint}`);
    console.log(`     Chi tiết: ${details}`);
    results.push({ uc: ucName, endpoint, status: 'PASS', details });
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${ucName} -> ${endpoint}`);
    console.error(`     Lỗi: ${details}`);
    results.push({ uc: ucName, endpoint, status: 'FAIL', details });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 KIỂM THỬ CÁC USE CASE: ADMINISTRATIVE AREA + AUTHORITY + ASSIGNMENT');
  console.log('================================================================\n');

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Đã kết nối MongoDB thành công');

  const server = app.listen(TEST_PORT);
  console.log(`✅ Server test khởi động tại: ${BASE_URL}\n`);

  try {
    const uid = Date.now().toString().slice(-5);

    // =============================================================
    // PHẦN 1: ADMINISTRATIVE AREA (7 Use Cases)
    // =============================================================
    console.log('================================================================');
    console.log('📁 PHẦN 1: ADMINISTRATIVE AREA');
    console.log('================================================================');

    // 1.1 Create Country
    const res1_1 = await apiRequest('POST', '/administrative-areas', {
      name: `Vietnam Test ${uid}`,
      code: `VN_${uid}`,
      type: 'COUNTRY',
      parentId: null,
    });
    const p1_1 = res1_1.status === 201 && res1_1.data?.data?._id;
    state.countryId = res1_1.data?.data?._id;
    recordTest(
      'UC 1.1: Tạo Quốc gia (Create Country)',
      'POST /administrative-areas',
      p1_1,
      p1_1 ? `ID: ${state.countryId}, Code: VN_${uid}` : JSON.stringify(res1_1.data)
    );

    // 1.2 Create Province
    const res1_2 = await apiRequest('POST', '/administrative-areas', {
      name: `Da Nang Test ${uid}`,
      code: `DN_${uid}`,
      type: 'PROVINCE',
      parentId: state.countryId,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [108.2, 16.05],
            [108.21, 16.05],
            [108.21, 16.06],
            [108.2, 16.06],
            [108.2, 16.05],
          ],
        ],
      },
    });
    const p1_2 = res1_2.status === 201 && res1_2.data?.data?._id;
    state.provinceId = res1_2.data?.data?._id;
    state.areaId = state.provinceId;
    recordTest(
      'UC 1.2: Tạo Tỉnh/Thành phố có ranh giới Polygon (Create Province)',
      'POST /administrative-areas',
      p1_2,
      p1_2 ? `ID: ${state.provinceId}, Code: DN_${uid}` : JSON.stringify(res1_2.data)
    );

    // 1.3 Create District
    const res1_3 = await apiRequest('POST', '/administrative-areas', {
      name: `Hai Chau Test ${uid}`,
      code: `HC_${uid}`,
      type: 'DISTRICT',
      parentId: state.provinceId,
    });
    const p1_3 = res1_3.status === 201 && res1_3.data?.data?._id;
    state.districtId = res1_3.data?.data?._id;
    recordTest(
      'UC 1.3: Tạo Quận/Huyện (Create District)',
      'POST /administrative-areas',
      p1_3,
      p1_3 ? `ID: ${state.districtId}, Code: HC_${uid}` : JSON.stringify(res1_3.data)
    );

    // 1.4 Create Ward
    const res1_4 = await apiRequest('POST', '/administrative-areas', {
      name: `Thach Thang Test ${uid}`,
      code: `TT_${uid}`,
      type: 'WARD',
      parentId: state.districtId,
    });
    const p1_4 = res1_4.status === 201 && res1_4.data?.data?._id;
    state.wardId = res1_4.data?.data?._id;
    recordTest(
      'UC 1.4: Tạo Phường/Xã (Create Ward)',
      'POST /administrative-areas',
      p1_4,
      p1_4 ? `ID: ${state.wardId}, Code: TT_${uid}` : JSON.stringify(res1_4.data)
    );

    // 1.5 Get Administrative Areas
    const res1_5 = await apiRequest('GET', '/administrative-areas?type=PROVINCE');
    const p1_5 = res1_5.status === 200 && Array.isArray(res1_5.data?.data) && res1_5.data.data.length > 0;
    recordTest(
      'UC 1.5: Lấy danh sách Khu vực hành chính (Get Administrative Areas)',
      'GET /administrative-areas?type=PROVINCE',
      p1_5,
      p1_5 ? `Trả về ${res1_5.data.data.length} tỉnh/thành` : JSON.stringify(res1_5.data)
    );

    // 1.6 Get Administrative Area Detail
    const res1_6 = await apiRequest('GET', `/administrative-areas/${state.areaId}`);
    const p1_6 = res1_6.status === 200 && res1_6.data?.data?._id === state.areaId;
    recordTest(
      'UC 1.6: Xem chi tiết Khu vực hành chính (Get Detail)',
      `GET /administrative-areas/:id`,
      p1_6,
      p1_6 ? `Lấy đúng khu vực: ${res1_6.data.data.name}` : JSON.stringify(res1_6.data)
    );

    // 1.7 Update Administrative Area
    const newAreaName = `Da Nang City Updated ${uid}`;
    const res1_7 = await apiRequest('PATCH', `/administrative-areas/${state.areaId}`, {
      name: newAreaName,
    });
    const p1_7 = res1_7.status === 200 && res1_7.data?.data?.name === newAreaName;
    recordTest(
      'UC 1.7: Cập nhật thông tin Khu vực hành chính (Update)',
      `PATCH /administrative-areas/:id`,
      p1_7,
      p1_7 ? `Đã đổi tên thành: ${res1_7.data?.data?.name}` : JSON.stringify(res1_7.data)
    );

    console.log();

    // =============================================================
    // PHẦN 2: AUTHORITY ORGANIZATION (5 Use Cases)
    // =============================================================
    console.log('================================================================');
    console.log('🏢 PHẦN 2: AUTHORITY ORGANIZATION');
    console.log('================================================================');

    // 2.1 Create Authority
    const res2_1 = await apiRequest('POST', '/authority-organizations', {
      name: `Da Nang Fire Department Test ${uid}`,
      code: `DN_FIRE_${uid}`,
      type: 'FIRE_DEPARTMENT',
      phone: '02361234567',
      email: `fire_${uid}@example.com`,
      address: '123 Bach Dang, Da Nang',
      administrativeAreaId: state.provinceId,
    });
    const p2_1 = res2_1.status === 201 && res2_1.data?.data?._id;
    state.authorityId = res2_1.data?.data?._id;
    recordTest(
      'UC 2.1: Tạo Cơ quan / Tổ chức chức năng (Create Authority)',
      'POST /authority-organizations',
      p2_1,
      p2_1 ? `ID: ${state.authorityId}, Type: FIRE_DEPARTMENT` : JSON.stringify(res2_1.data)
    );

    // 2.2 Get Authorities
    const res2_2 = await apiRequest('GET', '/authority-organizations?type=FIRE_DEPARTMENT');
    const p2_2 = res2_2.status === 200 && Array.isArray(res2_2.data?.data) && res2_2.data.data.length > 0;
    recordTest(
      'UC 2.2: Lấy danh sách Cơ quan (Get Authorities)',
      'GET /authority-organizations?type=FIRE_DEPARTMENT',
      p2_2,
      p2_2 ? `Tìm thấy ${res2_2.data.data.length} cơ quan PCCC` : JSON.stringify(res2_2.data)
    );

    // 2.3 Get Authority Detail
    const res2_3 = await apiRequest('GET', `/authority-organizations/${state.authorityId}`);
    const p2_3 = res2_3.status === 200 && res2_3.data?.data?._id === state.authorityId;
    recordTest(
      'UC 2.3: Xem chi tiết Cơ quan (Get Authority Detail)',
      'GET /authority-organizations/:id',
      p2_3,
      p2_3 ? `Cơ quan: ${res2_3.data.data.name}` : JSON.stringify(res2_3.data)
    );

    // 2.4 Update Authority
    const res2_4 = await apiRequest('PATCH', `/authority-organizations/${state.authorityId}`, {
      address: '123 Bach Dang, Da Nang Updated',
      phone: '02367654321',
    });
    const p2_4 =
      res2_4.status === 200 && res2_4.data?.data?.address === '123 Bach Dang, Da Nang Updated';
    recordTest(
      'UC 2.4: Cập nhật thông tin Cơ quan (Update Authority)',
      'PATCH /authority-organizations/:id',
      p2_4,
      p2_4 ? `Địa chỉ mới: ${res2_4.data.data.address}, SĐT: ${res2_4.data.data.phone}` : JSON.stringify(res2_4.data)
    );

    // 2.5 Delete Authority (Soft delete -> INACTIVE)
    const res2_5 = await apiRequest('DELETE', `/authority-organizations/${state.authorityId}`);
    const p2_5 = res2_5.status === 200 && res2_5.data?.data?.status === 'INACTIVE';
    recordTest(
      'UC 2.5: Vô hiệu hóa Cơ quan (Soft Delete Authority -> INACTIVE)',
      'DELETE /authority-organizations/:id',
      p2_5,
      p2_5 ? `Trạng thái chuyển thành: ${res2_5.data.data.status}` : JSON.stringify(res2_5.data)
    );

    console.log();

    // =============================================================
    // CHUẨN BỊ FIXTURES CHO ASSIGNMENT (Đội cứu hộ, cứu hộ viên, phương tiện, SOS)
    // =============================================================
    let citizen = await User.findOne({ roles: 'CITIZEN' });
    if (!citizen) {
      citizen = await User.create({
        fullName: 'Nguyễn Văn Dân Test',
        phone: `091${Date.now().toString().slice(-7)}`,
        roles: ['CITIZEN'],
        status: 'ACTIVE',
      });
    }

    let rescuer = await User.findOne({ roles: 'RESCUER' });
    if (!rescuer) {
      rescuer = await User.create({
        fullName: 'Trần Cứu Hộ Test',
        phone: `093${Date.now().toString().slice(-7)}`,
        roles: ['RESCUER'],
        status: 'ACTIVE',
      });
    }
    state.rescuerId = rescuer._id.toString();

    let newRescuer = await User.findOne({ roles: 'RESCUER', _id: { $ne: rescuer._id } });
    if (!newRescuer) {
      newRescuer = await User.create({
        fullName: 'Lê Cứu Hộ Phụ Trợ',
        phone: `094${Date.now().toString().slice(-7)}`,
        roles: ['RESCUER'],
        status: 'ACTIVE',
      });
    }
    state.newRescuerId = newRescuer._id.toString();

    let team = await RescueTeam.findOne({ status: 'ACTIVE' });
    if (!team) {
      team = await RescueTeam.create({
        name: `Đội cứu hộ phản ứng nhanh ${uid}`,
        code: `TEAM_${uid}`,
        type: 'WATER_RESCUE',
        leaderId: rescuer._id,
        members: [{ rescuerId: rescuer._id, role: 'LEADER' }],
        status: 'ACTIVE',
      });
    }
    state.teamId = team._id.toString();

    let vehicle = await Vehicle.findOne({ status: 'AVAILABLE' });
    if (!vehicle) {
      vehicle = await Vehicle.create({
        plateNumber: `BOAT-${uid}`,
        type: 'BOAT',
        capacity: 6,
        status: 'AVAILABLE',
      });
    }
    state.vehicleId = vehicle._id.toString();

    // Tạo SOS Request hợp lệ thuộc tỉnh/huyện vừa tạo
    const sosReq = await SosRequest.create({
      sosCode: `SOS-${uid}`,
      citizenId: citizen._id,
      location: {
        type: 'Point',
        coordinates: [108.2022, 16.0544],
      },
      areaId: state.districtId || state.provinceId,
      address: '123 Bạch Đằng, Thạch Thang, Đà Nẵng',
      emergencyType: 'FLOOD',
      priority: 'HIGH',
      people: 2,
      description: 'Nước dâng cao, cần cano hỗ trợ khẩn cấp',
      status: 'PENDING',
    });
    state.sosId = sosReq._id.toString();

    // =============================================================
    // PHẦN 3: SOS ASSIGNMENT (6 Use Cases)
    // =============================================================
    console.log('================================================================');
    console.log('🚨 PHẦN 3: SOS ASSIGNMENT');
    console.log('================================================================');

    // 3.1 Assign SOS
    const res3_1 = await apiRequest('POST', `/sos/${state.sosId}/assign`, {
      authorityOrganizationId: state.authorityId,
      rescueTeamId: state.teamId,
      rescuerId: state.rescuerId,
      vehicleId: state.vehicleId,
      priority: 'HIGH',
      note: 'Rescue team dispatched for high flood area',
    });
    const p3_1 = res3_1.status === 201 && res3_1.data?.data?.status === 'PENDING';
    state.assignmentId = res3_1.data?.data?._id;
    recordTest(
      'UC 3.1: Phân công lực lượng cứu hộ cho SOS (Assign SOS)',
      'POST /sos/:id/assign',
      p3_1,
      p3_1 ? `Assignment ID: ${state.assignmentId}, Status: PENDING` : JSON.stringify(res3_1.data)
    );

    // 3.2 Get SOS Assignments
    const res3_2 = await apiRequest('GET', `/sos/${state.sosId}/assignments`);
    const p3_2 =
      res3_2.status === 200 && Array.isArray(res3_2.data?.data) && res3_2.data.data.length > 0;
    recordTest(
      'UC 3.2: Lấy danh sách các phân công của SOS (Get SOS Assignments)',
      'GET /sos/:id/assignments',
      p3_2,
      p3_2 ? `Tìm thấy ${res3_2.data.data.length} phân công của SOS này` : JSON.stringify(res3_2.data)
    );

    // 3.3 Accept Assignment
    const res3_3 = await apiRequest('PATCH', `/assignments/${state.assignmentId}/accept`);
    const p3_3 = res3_3.status === 200 && res3_3.data?.data?.status === 'ACCEPTED';
    recordTest(
      'UC 3.3: Cứu hộ viên chấp nhận phân công (Accept Assignment)',
      'PATCH /assignments/:id/accept',
      p3_3,
      p3_3 ? `Trạng thái chuyển thành: ACCEPTED, acceptedAt: ${res3_3.data.data.acceptedAt}` : JSON.stringify(res3_3.data)
    );

    // 3.4 Update Assignment Status -> EN_ROUTE
    const res3_4 = await apiRequest('PATCH', `/assignments/${state.assignmentId}/status`, {
      status: 'EN_ROUTE',
    });
    const p3_4 = res3_4.status === 200 && res3_4.data?.data?.status === 'EN_ROUTE';
    recordTest(
      'UC 3.4: Cập nhật tiến trình phân công (Update Assignment Status -> EN_ROUTE)',
      'PATCH /assignments/:id/status',
      p3_4,
      p3_4 ? `Trạng thái chuyển thành: EN_ROUTE` : JSON.stringify(res3_4.data)
    );

    // 3.5 Reassign Assignment
    const res3_5 = await apiRequest('PATCH', `/assignments/${state.assignmentId}/reassign`, {
      rescueTeamId: state.teamId,
      rescuerId: state.newRescuerId,
      note: 'Reassigned to assistant rescuer due to urgent backup',
    });
    const p3_5 =
      res3_5.status === 200 &&
      res3_5.data?.data?.rescuerId === state.newRescuerId &&
      res3_5.data?.data?.note.includes('backup');
    recordTest(
      'UC 3.5: Điều phối lại nhân lực / phương tiện (Reassign Assignment)',
      'PATCH /assignments/:id/reassign',
      p3_5,
      p3_5 ? `Cứu hộ viên mới: ${state.newRescuerId}, Note: ${res3_5.data.data.note}` : JSON.stringify(res3_5.data)
    );

    // 3.6 Cancel Assignment
    const res3_6 = await apiRequest('PATCH', `/assignments/${state.assignmentId}/cancel`, {
      cancelReason: 'Vehicle unavailable due to extreme rapids',
    });
    const p3_6 =
      res3_6.status === 200 &&
      res3_6.data?.data?.status === 'CANCELLED' &&
      res3_6.data?.data?.cancelReason === 'Vehicle unavailable due to extreme rapids';
    recordTest(
      'UC 3.6: Hủy phân công nhiệm vụ (Cancel Assignment)',
      'PATCH /assignments/:id/cancel',
      p3_6,
      p3_6 ? `Trạng thái: CANCELLED, Lý do: ${res3_6.data.data.cancelReason}` : JSON.stringify(res3_6.data)
    );

    console.log();

  } catch (error) {
    console.error('❌ Ngoại lệ nghiêm trọng khi thực thi bài test:', error);
    failedCount++;
  } finally {
    server.close();
    await mongoose.disconnect();

    console.log('================================================================');
    console.log(`📊 TỔNG KẾT KẾT QUẢ KIỂM THỬ:`);
    console.log(`   Tổng số Use Cases:    ${passedCount + failedCount} / 18`);
    console.log(`   ✅ Thành công (PASS):  ${passedCount}`);
    console.log(`   ❌ Thất bại (FAIL):    ${failedCount}`);
    console.log('================================================================');

    if (failedCount === 0) {
      console.log('🎉 TẤT CẢ 18 USE CASES CỦA MODULE D ĐỀU HOẠT ĐỘNG HOÀN HẢO!');
    }
  }
}

runTests();

import type {
  SosRequestItem,
  VehicleItem,
  SafeLocationItem,
  AlertItem,
  AuditLogItem,
} from '../types/dashboard';

/* ==========================================================================
   FALLBACK DATASET - ĐẢM BẢO GIAO DIỆN TÁC CHIẾN ĐÀ NẴNG LUÔN SINH ĐỘNG
   ========================================================================== */

export const FALLBACK_SOS_LIST: SosRequestItem[] = [
  {
    _id: 'sos-dn-001',
    sosCode: 'SOS #8924',
    address: 'Đường Tiểu La, Phường Hòa Cường, Quận Hải Châu',
    location: { type: 'Point', coordinates: [108.2178, 16.0465] },
    emergencyType: 'FLOOD',
    priority: 'CRITICAL',
    people: 4,
    description: 'Nước lũ dâng cao 1.2m, gia đình 4 người có 1 cụ già 82 tuổi và 1 trẻ nhỏ đang kẹt trên gác lửng, cần ca-nô tiếp cận gấp!',
    status: 'PENDING',
    citizenId: {
      _id: 'cit-01',
      fullName: 'Lê Minh Tuấn',
      phone: '0905 334 772',
      email: 'tuan.le@gmail.com',
    },
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'sos-dn-002',
    sosCode: 'SOS #8927',
    address: 'Đường 2 Tháng 9, Phường Hòa Cường, Quận Hải Châu',
    location: { type: 'Point', coordinates: [108.2201, 16.0382] },
    emergencyType: 'RESCUE',
    priority: 'HIGH',
    people: 8,
    description: 'Bờ kè thoát nước sạt lở, nước lũ tràn vào dãy nhà dân 3 hộ. Đang cần xuồng cao su và áo phao cứu trợ khẩn cấp.',
    status: 'VERIFIED',
    citizenId: {
      _id: 'cit-02',
      fullName: 'Hoàng Văn Vinh',
      phone: '0905 998 331',
      email: 'vinh.hoang@gmail.com',
    },
    createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'sos-dn-003',
    sosCode: 'SOS #8930',
    address: 'Khu đô thị Hòa Xuân, Phường Hòa Xuân, Quận Cẩm Lệ',
    location: { type: 'Point', coordinates: [108.2155, 16.0125] },
    emergencyType: 'MEDICAL',
    priority: 'CRITICAL',
    people: 2,
    description: 'Sản phụ mang thai tuần 39 có dấu hiệu chuyển dạ trong vùng ngập úng cô lập, cần ca-nô y tế dã chiến đưa đi cấp cứu.',
    status: 'ASSIGNED',
    citizenId: {
      _id: 'cit-03',
      fullName: 'Trần Thị Mai',
      phone: '0914 223 554',
      email: 'mai.tran@gmail.com',
    },
    createdAt: new Date(Date.now() - 32 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'sos-dn-004',
    sosCode: 'SOS #8915',
    address: 'Đường Hoàng Sa, Bán đảo Sơn Trà, Quận Sơn Trà',
    location: { type: 'Point', coordinates: [108.265, 16.105] },
    emergencyType: 'LANDSLIDE',
    priority: 'HIGH',
    people: 3,
    description: 'Sạt lở đất đá taluy chắn ngang đường, xe ô tô của du khách bị kẹt, đã tiếp cận và giải cứu an toàn.',
    status: 'COMPLETED',
    citizenId: {
      _id: 'cit-04',
      fullName: 'Nguyễn Văn Đạt',
      phone: '0988 776 543',
      email: 'dat.nguyen@gmail.com',
    },
    createdAt: new Date(Date.now() - 110 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'sos-dn-005',
    sosCode: 'SOS #8910',
    address: 'Đường Mẹ Suốt, Phường Hòa Khánh, Quận Liên Chiểu',
    location: { type: 'Point', coordinates: [108.156, 16.062] },
    emergencyType: 'FLOOD',
    priority: 'CRITICAL',
    people: 5,
    description: 'Vùng trũng sâu ngập tới cổ, Đội Ca-nô Phản ứng nhanh đã tiếp cận và sơ tán thành công 5 người đến Trạm an toàn.',
    status: 'COMPLETED',
    citizenId: {
      _id: 'cit-05',
      fullName: 'Đặng Thanh Tùng',
      phone: '0903 554 112',
      email: 'tung.dang@gmail.com',
    },
    createdAt: new Date(Date.now() - 175 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'sos-dn-006',
    sosCode: 'SOS #8932',
    address: 'Khu dân cư ven sông Cẩm Lệ, Phường Cẩm Lệ',
    location: { type: 'Point', coordinates: [108.2085, 16.0245] },
    emergencyType: 'SUPPLIES',
    priority: 'MEDIUM',
    people: 6,
    description: 'Gia đình 6 người bị cô lập ngày thứ 2, cạn kiệt nước uống và lương khô, cần tiếp tế lương thực dã chiến.',
    status: 'VERIFIED',
    citizenId: {
      _id: 'cit-06',
      fullName: 'Phạm Hồng Ánh',
      phone: '0905 667 889',
      email: 'anh.pham@gmail.com',
    },
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const FALLBACK_RESCUERS = [
  {
    _id: 'res-dn-01',
    fullName: 'Đội Ca-nô Cứu Nạn Thủy Bộ Hải Châu',
    phone: '0905 123 456',
    rescuer: {
      skills: ['Lái Ca-nô tốc độ cao', 'Cứu nạn vùng nước xoáy', 'Sơ cứu CPR'],
      vehicleType: 'Ca-nô Cao Tốc Composite & Xuồng Phao',
      availabilityStatus: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    },
  },
  {
    _id: 'res-dn-02',
    fullName: 'Đội Phản Ứng Nhanh PCCC & CNCH Cẩm Lệ',
    phone: '0913 445 566',
    rescuer: {
      skills: ['Đu dây vượt lũ', 'Lặn cứu nạn', 'Cắt phá kim loại dã chiến'],
      vehicleType: 'Xe Tác Chiến Lội Nước 4x4',
      availabilityStatus: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    },
  },
  {
    _id: 'res-dn-03',
    fullName: 'Đội Cứu Nạn Hàng Hải & Bờ Biển Sơn Trà',
    phone: '0905 114 116',
    rescuer: {
      skills: ['Cứu hộ bão biển', 'Cấp cứu y tế chấn thương', 'Tìm kiếm ban đêm'],
      vehicleType: 'Ca-nô Cứu Nạn Hàng Hải 43-SEA',
      availabilityStatus: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    },
  },
  {
    _id: 'res-dn-04',
    fullName: 'CLB Tình Nguyện Viên Vượt Lũ Đà Nẵng',
    phone: '0935 889 911',
    rescuer: {
      skills: ['Tiếp tế lương thực', 'Sơ tán dân ngõ hẻm', 'Bơi cứu sinh'],
      vehicleType: 'Xuồng Máy Composite & Áo Phao',
      availabilityStatus: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    },
  },
  {
    _id: 'res-dn-05',
    fullName: 'Đội Y Tế Cứu Thương Dã Chiến 115',
    phone: '0905 882 115',
    rescuer: {
      skills: ['Hồi sức cấp cứu', 'Đỡ đẻ dã chiến', 'Cố định xương gãy'],
      vehicleType: 'Xe Cứu Thương Lội Nước 43A-115',
      availabilityStatus: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    },
  },
];

export const FALLBACK_VEHICLES: VehicleItem[] = [
  {
    _id: 'veh-dn-01',
    plateNumber: '43-HC-01',
    type: 'BOAT',
    capacity: 8,
    description: 'Ca-nô cứu nạn composite 60HP, phao bè tự thổi, định vị GPS vệ tinh',
    status: 'AVAILABLE',
  },
  {
    _id: 'veh-dn-02',
    plateNumber: '43A-115.03',
    type: 'AMBULANCE',
    capacity: 3,
    description: 'Xe cứu thương dã chiến 2 cáng, máy sốc tim tự động AED, bình oxy kép',
    status: 'AVAILABLE',
  },
  {
    _id: 'veh-dn-03',
    plateNumber: '43C-554.12',
    type: 'TRUCK',
    capacity: 6,
    description: 'Xe tác chiến lội nước 4x4, ống thở chống ngập 1.2m, tời kéo tự cứu 5 tấn',
    status: 'AVAILABLE',
  },
  {
    _id: 'veh-dn-04',
    plateNumber: '43-CL-09',
    type: 'BOAT',
    capacity: 6,
    description: 'Xuồng cao su động cơ thủy nhẹ, luồn lách ngõ hẹp ngập sâu đô thị',
    status: 'AVAILABLE',
  },
  {
    _id: 'veh-dn-05',
    plateNumber: '43P-114.09',
    type: 'TRUCK',
    capacity: 8,
    description: 'Xe chuyên dụng cứu nạn chữa cháy, bơm công suất lớn hút tầng hầm ngập',
    status: 'AVAILABLE',
  },
];

export interface SupplyItem {
  id: string;
  name: string;
  category: 'LIFE_SAVING' | 'MEDICAL' | 'FOOD_WATER' | 'EQUIPMENT';
  available: number;
  deployed: number;
  total: number;
  unit: string;
  minReserve: number;
  location: string;
}

export const FALLBACK_SUPPLIES: SupplyItem[] = [
  {
    id: 'sup-01',
    name: 'Áo phao cứu sinh tiêu chuẩn SOLAS',
    category: 'LIFE_SAVING',
    available: 420,
    deployed: 80,
    total: 500,
    unit: 'Chiếc',
    minReserve: 100,
    location: 'Kho Tổng Trung Tâm Hải Châu',
  },
  {
    id: 'sup-02',
    name: 'Phao cứu sinh tròn sợi composite',
    category: 'LIFE_SAVING',
    available: 140,
    deployed: 20,
    total: 160,
    unit: 'Chiếc',
    minReserve: 30,
    location: 'Trạm Cứu Nạn Sông Hàn',
  },
  {
    id: 'sup-03',
    name: 'Túi sơ cứu y tế chấn thương dã chiến',
    category: 'MEDICAL',
    available: 75,
    deployed: 15,
    total: 90,
    unit: 'Bộ',
    minReserve: 20,
    location: 'Trung Tâm Y Tế Hòa Cường',
  },
  {
    id: 'sup-04',
    name: 'Đèn pin dã chiến chống nước siêu sáng',
    category: 'EQUIPMENT',
    available: 110,
    deployed: 25,
    total: 135,
    unit: 'Cái',
    minReserve: 30,
    location: 'Kho Hậu Cần Tuyên Sơn',
  },
  {
    id: 'sup-05',
    name: 'Lương khô quân đội & Nước uống tinh khiết',
    category: 'FOOD_WATER',
    available: 2100,
    deployed: 450,
    total: 2550,
    unit: 'Suất',
    minReserve: 500,
    location: 'Kho Dự Trữ Lương Thực Cẩm Lệ',
  },
  {
    id: 'sup-06',
    name: 'Máy phát điện dã chiến chống nước 5kW',
    category: 'EQUIPMENT',
    available: 15,
    deployed: 4,
    total: 19,
    unit: 'Máy',
    minReserve: 3,
    location: 'BCH PCTT Quận Hải Châu',
  },
  {
    id: 'sup-07',
    name: 'Cưa xích cầm tay giải tỏa cây gãy đổ',
    category: 'EQUIPMENT',
    available: 11,
    deployed: 3,
    total: 14,
    unit: 'Máy',
    minReserve: 2,
    location: 'Đội Trật Tự Đô Thị Sơn Trà',
  },
];

export const FALLBACK_SHELTERS: SafeLocationItem[] = [
  {
    _id: 'sh-dn-01',
    name: 'Cung Thể Thao Tuyên Sơn - Trạm Sơ Tán Trung Tâm',
    type: 'EVACUATION_CENTER',
    address: 'Đường 2 Tháng 9, Phường Hòa Cường Bắc, Quận Hải Châu',
    capacity: 1500,
    currentOccupancy: 380,
    status: 'ACTIVE',
    location: { type: 'Point', coordinates: [108.225, 16.035] },
  },
  {
    _id: 'sh-dn-02',
    name: 'Trường THPT Phan Châu Trinh - Điểm Tránh Trú Kiên Cố',
    type: 'SHELTER',
    address: '154 Lê Lợi, Phường Hải Châu 1, Quận Hải Châu',
    capacity: 800,
    currentOccupancy: 220,
    status: 'ACTIVE',
    location: { type: 'Point', coordinates: [108.2205, 16.068] },
  },
  {
    _id: 'sh-dn-03',
    name: 'Bệnh Viện Đà Nẵng - Trạm Cấp Cứu Y Tế Dã Chiến',
    type: 'HOSPITAL',
    address: '124 Hải Phòng, Phường Thạch Thang, Quận Hải Châu',
    capacity: 500,
    currentOccupancy: 140,
    status: 'ACTIVE',
    location: { type: 'Point', coordinates: [108.216, 16.071] },
  },
  {
    _id: 'sh-dn-04',
    name: 'Nhà Văn Hóa Lao Động TP Đà Nẵng',
    type: 'EVACUATION_CENTER',
    address: 'Đường Cách Mạng Tháng 8, Phường Khuê Trung, Quận Cẩm Lệ',
    capacity: 650,
    currentOccupancy: 160,
    status: 'ACTIVE',
    location: { type: 'Point', coordinates: [108.205, 16.022] },
  },
];

export const FALLBACK_ALERTS: AlertItem[] = [
  {
    _id: 'al-dn-01',
    title: 'Cảnh báo ngập lụt dâng cao lưu vực Sông Hàn & Cẩm Lệ',
    type: 'FLOOD',
    severity: 'CRITICAL',
    content: 'Mực nước sông Cẩm Lệ và sông Cu Đê vượt báo động 3. Toàn bộ người dân vùng trũng thấp khẩn trương kê cao tài sản và sơ tán người già, trẻ nhỏ đến Trạm an toàn.',
    isActive: true,
    startTime: new Date(Date.now() - 40 * 60000).toISOString(),
    createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
  },
  {
    _id: 'al-dn-02',
    title: 'Cảnh báo nguy cơ sạt lở đất đá cung đường Bán đảo Sơn Trà',
    type: 'LANDSLIDE',
    severity: 'HIGH',
    content: 'Mưa lớn liên tục gây sạt trượt taluy một số đoạn đường Hoàng Sa. Tạm cấm phương tiện cá nhân lên bán đảo để đảm bảo tuyệt đối an toàn.',
    isActive: true,
    startTime: new Date(Date.now() - 150 * 60000).toISOString(),
    createdAt: new Date(Date.now() - 150 * 60000).toISOString(),
  },
];

export const FALLBACK_AUDIT_LOGS: AuditLogItem[] = [
  {
    _id: 'log-dn-01',
    action: 'ĐIỀU ĐỘNG CA-NÔ TIẾP CẬN',
    entityType: 'YÊU CẦU CỨU NẠN',
    actorRole: 'CHỈ HUY ĐỊA PHƯƠNG',
    actorId: {
      _id: 'act-dn-01',
      fullName: 'Trần Văn Minh',
      phone: '0905 123 456',
    },
    createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
    metadata: {
      'Mã SOS': 'SOS #8924',
      'Đội cứu hộ': 'Đội Ca-nô Thủy Bộ Hải Châu',
      'Phương tiện': '43-HC-01',
      'Khu vực': 'Phường Hòa Cường',
    },
  },
  {
    _id: 'log-dn-02',
    action: 'XÁC MINH CỨU NẠN KHẨN CẤP',
    entityType: 'YÊU CẦU CỨU NẠN',
    actorRole: 'TRỰC BAN TÁC CHIẾN',
    actorId: {
      _id: 'act-dn-02',
      fullName: 'Lê Hoàng Nam',
      phone: '0905 654 321',
    },
    createdAt: new Date(Date.now() - 19 * 60000).toISOString(),
    metadata: {
      'Mã SOS': 'SOS #8927',
      'Mức độ': 'Nguy cấp cực độ',
      'Người gọi': 'Hoàng Văn Vinh (0905 998 331)',
    },
  },
  {
    _id: 'log-dn-03',
    action: 'PHÁT CẢNH BÁO LOA PHƯỜNG & APP',
    entityType: 'BẢN TIN CẢNH BÁO',
    actorRole: 'BCH PCTT ĐỊA PHƯƠNG',
    actorId: {
      _id: 'act-dn-03',
      fullName: 'BCH PCTT & TKCN Quận Hải Châu',
      phone: '0236 3822 114',
    },
    createdAt: new Date(Date.now() - 42 * 60000).toISOString(),
    metadata: {
      'Tiêu đề': 'Cảnh báo lũ dâng cao lưu vực sông Hàn',
      'Kênh phát': ['Ứng dụng người dân', 'SMS', 'Hệ thống Loa truyền thanh'],
    },
  },
  {
    _id: 'log-dn-04',
    action: 'HOÀN THÀNH NHIỆM VỤ SƠ TÁN',
    entityType: 'YÊU CẦU CỨU NẠN',
    actorRole: 'ĐỘI TRƯỞNG THỰC ĐỊA',
    actorId: {
      _id: 'act-dn-04',
      fullName: 'Nguyễn Văn Hùng',
      phone: '0912 345 678',
    },
    createdAt: new Date(Date.now() - 112 * 60000).toISOString(),
    metadata: {
      'Mã SOS': 'SOS #8915',
      'Số người cứu được': 3,
      'Trạm trú ẩn': 'Trạm Y Tế Bán Đảo Sơn Trà',
    },
  },
  {
    _id: 'log-dn-05',
    action: 'GỬI YÊU CẦU CỨU NẠN KHẨN CẤP',
    entityType: 'YÊU CẦU CỨU NẠN',
    actorRole: 'NGƯỜI DÂN',
    actorId: {
      _id: 'act-dn-05',
      fullName: 'Hoàng Văn Vinh',
      phone: '0905 998 331',
    },
    createdAt: new Date(Date.now() - 125 * 60000).toISOString(),
    metadata: {
      'Mã SOS': 'SOS #8927',
      'Địa chỉ': 'K24/10 Trưng Nữ Vương, P. Bình Thuận',
      'Số người mắc kẹt': '4 người (2 người già)',
    },
  },
  {
    _id: 'log-dn-06',
    action: 'CẬP NHẬT PHÂN QUYỀN VÀ KHU VỰC TÁC CHIẾN',
    entityType: 'QUẢN TRỊ HỆ THỐNG',
    actorRole: 'QUẢN TRỊ VIÊN',
    actorId: {
      _id: 'act-dn-06',
      fullName: 'Quản trị viên Hệ thống',
      phone: '0901 000 001',
    },
    createdAt: new Date(Date.now() - 210 * 60000).toISOString(),
    metadata: {
      'Hạng mục': 'Bổ sung quyền điều phối khẩn cấp cho Hải Châu',
      'Trạng thái': 'Đã kích hoạt tự động',
    },
  },
];

export interface SystemSettingsConfig {
  hotline: string;
  headquarters: string;
  sirenSound: boolean;
  pushNotifications: boolean;
  scanRadiusKm: number;
  autoEscalateMinutes: number;
  autoSuggestVehicles: boolean;
  mapLayer: 'vector' | 'satellite' | 'flood';
  autoFlyToNewSos: boolean;
  showAdminBoundaries: boolean;
  syncIntervalSeconds: number;
  lastUpdated?: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  hotline: '0236 3822 114 / 112',
  headquarters: 'Ban Chỉ Huy PCTT & TKCN TP Đà Nẵng',
  sirenSound: true,
  pushNotifications: true,
  scanRadiusKm: 5,
  autoEscalateMinutes: 10,
  autoSuggestVehicles: true,
  mapLayer: 'vector',
  autoFlyToNewSos: true,
  showAdminBoundaries: true,
  syncIntervalSeconds: 6,
};

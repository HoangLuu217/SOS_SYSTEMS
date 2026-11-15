import React, { useState } from 'react';
import { LifeBuoy, Plane, Bike, Truck, Wrench } from 'lucide-react';
import type { VehicleItem, VehicleTerrainCapability } from '@/types/dashboard';
import { API_BASE } from '@/api/client';

export const resolveProofImageSrc = (imgUrl: string): string => {
  const trimmed = String(imgUrl || '').trim();
  if (!trimmed) return '';
  // Giữ nguyên URL Cloudinary hoặc HTTPS công khai từ server khác (không ép viết lại sang localhost)
  if (/^https?:\/\//i.test(trimmed) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\/uploads\/([^\s?#]+)/i);
  return match && match[1] ? `${API_BASE}/uploads/${match[1]}` : trimmed;
};

export const ProofImagePreview: React.FC<{
  src: string;
  alt: string;
  height: number;
  fallbackLabel?: string;
}> = ({ src, alt, height, fallbackLabel }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 11.5,
          gap: 4,
          background: '#f8fafc',
        }}
      >
        <span style={{ fontWeight: 700, color: '#475569' }}>{fallbackLabel || alt}</span>
        <span>Không tải được ảnh (tệp cục bộ cũ hoặc chưa đồng bộ Cloudinary)</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      style={{ width: '100%', height, objectFit: 'cover', display: 'block' }}
    />
  );
};

export const STANDARD_EQUIPMENT_CATALOG = [
  { name: 'Áo phao cứu sinh', category: 'LIFE_VEST', unit: 'chiếc' },
  { name: 'Bộ đàm vô tuyến dã chiến', category: 'COMMUNICATION', unit: 'cái' },
  { name: 'Túi sơ cứu y tế dã chiến', category: 'MEDICAL_KIT', unit: 'túi' },
  { name: 'Đèn pin cứu hộ siêu sáng', category: 'LIGHTING', unit: 'cái' },
  { name: 'Dây thừng cứu hộ 50m', category: 'ROPE_TOOL', unit: 'cuộn' },
  { name: 'Máy cưa xích cứu hộ', category: 'TOOL', unit: 'chiếc' },
];

export const STANDARD_CONSUMABLE_CATALOG = [
  { name: 'Lương khô quân đội 702', category: 'FOOD_WATER', unit: 'thùng', minThreshold: 30 },
  { name: 'Nước suối đóng chai 500ml', category: 'FOOD_WATER', unit: 'thùng (24 chai)', minThreshold: 50 },
  { name: 'Bình nước tinh khiết 20L', category: 'FOOD_WATER', unit: 'bình', minThreshold: 20 },
  { name: 'Viên khử khuẩn lọc nước Aquatabs', category: 'WATER_PURIFICATION', unit: 'hộp', minThreshold: 25 },
  { name: 'Bông băng gạc tiệt trùng', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 40 },
  { name: 'Thuốc sát trùng Povidone Iodine', category: 'MEDICAL_SUPPLY', unit: 'chai', minThreshold: 30 },
  { name: 'Thuốc hạ sốt Paracetamol 500mg', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 30 },
  { name: 'Xăng RON 95 (ca-nô & máy nổ)', category: 'FUEL', unit: 'can 20L', minThreshold: 20 },
  { name: 'Áo mưa tiện lợi dã chiến', category: 'HYGIENE', unit: 'gói', minThreshold: 50 },
  { name: 'Pin đại D/AA dã chiến', category: 'HYGIENE', unit: 'vỉ', minThreshold: 30 },
];

export const generateRandomEquipmentSerial = (category?: string) => {
  const prefixMap: Record<string, string> = {
    LIFE_VEST: 'AP',
    COMMUNICATION: 'BD',
    MEDICAL_KIT: 'YT',
    LIGHTING: 'DP',
    ROPE_TOOL: 'DT',
    TOOL: 'CX',
  };
  const prefix = (category && prefixMap[category]) || 'KT';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `LÔ-${prefix}-${randomNum}`;
};

export const getEquipmentCategoryName = (category?: string) => {
  const map: Record<string, string> = {
    LIFE_VEST: 'Áo phao cứu sinh',
    COMMUNICATION: 'Bộ đàm vô tuyến',
    MEDICAL_KIT: 'Túi sơ cứu y tế',
    LIGHTING: 'Đèn pin cứu hộ',
    ROPE_TOOL: 'Dây thừng cứu hộ',
    TOOL: 'Máy cưa & Công cụ',
    FOOD_WATER: 'Lương thực & Nước uống',
    WATER_PURIFICATION: 'Xử lý & Lọc nước sạch',
    MEDICAL_SUPPLY: 'Dược phẩm & Y tế',
    FUEL: 'Xăng dầu & Nhiên liệu',
    HYGIENE: 'Nhu yếu phẩm & Vệ sinh',
  };
  return (category && map[category]) || category || 'Thiết bị cứu hộ';
};

export const getVehicleStatusMeta = (status?: string) => {
  const s = (status || 'AVAILABLE').toUpperCase();
  switch (s) {
    case 'IN_USE':
    case 'ON_MISSION':
    case 'ASSIGNED':
      return {
        label: 'Đang làm nhiệm vụ',
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe',
        dot: '#3b82f6',
      };
    case 'MAINTENANCE':
      return {
        label: 'Bảo dưỡng / Hỏng hóc',
        bg: '#fee2e2',
        color: '#b91c1c',
        border: '#fecaca',
        dot: '#dc2626',
      };
    case 'INACTIVE':
      return {
        label: 'Tạm ngưng hoạt động',
        bg: '#f1f5f9',
        color: '#475569',
        border: '#cbd5e1',
        dot: '#94a3b8',
      };
    case 'AVAILABLE':
    case 'READY':
    default:
      return {
        label: 'Sẵn sàng xuất kích',
        bg: '#ecfdf5',
        color: '#047857',
        border: '#a7f3d0',
        dot: '#10b981',
      };
  }
};

export interface VehicleTypeOption {
  value: string;
  label: string;
  group: string;
  defaultCapacity: number;
  subLabel?: string;
}

export const MAX_VEHICLE_CAPACITY = 50;
export const MAX_EQUIPMENT_QUANTITY = 99999;
export const MAX_EQUIPMENT_THRESHOLD = 9999;

export function getMinVehicleCapacity(type?: string): number {
  return type === 'DRONE' ? 0 : 1;
}

/** Validate giá trị số nguyên trong khoảng [min, max] */
export function validateIntegerRange(
  rawValue: string,
  options: { min: number; max: number; label: string; unitLabel?: string }
): string | null {
  const { min, max, label, unitLabel } = options;
  const suffix = unitLabel ? ` ${unitLabel}` : '';
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return `Vui lòng nhập ${label} (${min}–${max}${suffix})`;
  }
  if (!/^\d+$/.test(trimmed)) {
    return `${label} phải là số nguyên từ ${min} đến ${max}${suffix}`;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return `${label} phải từ ${min} đến ${max}${suffix}`;
  }
  return null;
}

/** Validate sức chở tối đa của phương tiện (trả về thông báo lỗi hoặc null nếu hợp lệ) */
export function validateVehicleCapacity(rawValue: string, type?: string): string | null {
  return validateIntegerRange(rawValue, {
    min: getMinVehicleCapacity(type),
    max: MAX_VEHICLE_CAPACITY,
    label: 'Sức chở tối đa',
    unitLabel: 'người',
  });
}

export const STANDARD_VEHICLE_TYPES: VehicleTypeOption[] = [
  { value: 'BOAT', label: 'Xuồng máy', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 8, subLabel: 'Động cơ gắn ngoài' },
  { value: 'COMPOSITE_BOAT', label: 'Xuồng composite gắn máy', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 6, subLabel: 'Vỏ composite gia cường' },
  { value: 'RUBBER_BOAT', label: 'Xuồng cao su cứu hộ', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 6, subLabel: 'Bơm hơi đa khoang' },
  { value: 'ROWBOAT', label: 'Thuyền chèo', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 4, subLabel: 'Chèo tay tiếp cận ngõ sâu' },
  { value: 'LIFE_RAFT', label: 'Phao bè cứu sinh', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 10, subLabel: 'Bè cứu sinh tự bung' },
  { value: 'JET_SKI', label: 'Mô tô nước', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 2, subLabel: 'Cơ động siêu tốc vượt dòng xiết' },
  { value: 'PICKUP_4X4', label: 'Xe bán tải 4x4', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 5, subLabel: 'Gầm nhấc dẫn động 2 cầu' },
  { value: 'TRUCK', label: 'Xe tải gầm cao', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 12, subLabel: 'Xe tải tác chiến vượt lũ' },
  { value: 'AMBULANCE', label: 'Xe cứu thương', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 4, subLabel: 'Cấp cứu y tế tiền phương' },
  { value: 'AMPHIBIOUS_VEHICLE', label: 'Xe bọc thép lội nước', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 16, subLabel: 'Thiết giáp lội nước sâu' },
  { value: 'DRONE', label: 'Drone vận chuyển', group: 'Thiết bị bay chuyên dụng', defaultCapacity: 1, subLabel: 'Tiếp tế hàng & thả phao từ trên cao' },
  { value: 'MOTORBIKE', label: 'Xe máy cơ động', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 2, subLabel: 'Luồn lách ngõ hẻm đô thị' },
  { value: 'OTHER', label: 'Phương tiện đặc chủng khác', group: 'Đặc chủng khác', defaultCapacity: 6, subLabel: 'Phương tiện cơ động chuyên dụng' },
];

export const VEHICLE_TYPE_GROUPS = [
  { group: 'Phương tiện thủy cứu nạn', label: '🚤 Phương tiện thủy cứu nạn' },
  { group: 'Xe cơ giới đường bộ & lội nước', label: '🚛 Xe cơ giới đường bộ & lội nước' },
  { group: 'Thiết bị bay chuyên dụng', label: '🛸 Thiết bị bay chuyên dụng' },
  { group: 'Đặc chủng khác', label: '⚙️ Đặc chủng khác' },
] as const;

export const VEHICLE_TERRAIN_OPTIONS: Array<{ value: VehicleTerrainCapability; label: string }> = [
  { value: 'ROAD', label: 'Đường bộ' },
  { value: 'OFF_ROAD', label: 'Địa hình ngoài đường' },
  { value: 'SHALLOW_FLOOD', label: 'Ngập nông' },
  { value: 'DEEP_FLOOD', label: 'Ngập sâu' },
  { value: 'WATERWAY', label: 'Đường thủy' },
  { value: 'AIR', label: 'Đường không' },
];

export const getVehicleTypeLabel = (type?: string): string => {
  if (!type) return 'Phương tiện đặc chủng';
  const found = STANDARD_VEHICLE_TYPES.find((v) => v.value === type);
  if (found) return found.label;

  switch (type.toUpperCase()) {
    case 'MOTORBOAT':
      return 'Xuồng máy';
    case 'INFLATABLE_BOAT':
      return 'Xuồng cao su cứu hộ';
    case 'PICKUP':
    case 'PICKUP_TRUCK':
      return 'Xe bán tải 4x4';
    case 'HIGH_CLEARANCE_TRUCK':
      return 'Xe tải gầm cao';
    case 'ARMORED_CAR':
      return 'Xe bọc thép lội nước';
    case 'DELIVERY_DRONE':
      return 'Drone vận chuyển';
    default:
      return 'Phương tiện đặc chủng khác';
  }
};

export const getVehicleIcon = (type?: string, size = 15) => {
  const t = (type || '').toUpperCase();
  if (['BOAT', 'MOTORBOAT', 'COMPOSITE_BOAT', 'RUBBER_BOAT', 'INFLATABLE_BOAT', 'ROWBOAT', 'LIFE_RAFT', 'JET_SKI'].includes(t)) {
    return <LifeBuoy size={size} />;
  }
  if (['DRONE', 'DELIVERY_DRONE'].includes(t)) {
    return <Plane size={size} />;
  }
  if (t === 'MOTORBIKE') {
    return <Bike size={size} />;
  }
  if (t === 'OTHER') {
    return <Wrench size={size} />;
  }
  return <Truck size={size} />;
};

export const VIETNAM_PROVINCE_PLATE_CODES: Record<string, string[]> = {
  'Hà Nội': ['29', '30', '31', '32', '33', '40', 'HN'],
  'Hồ Chí Minh': ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', 'SG', 'HCM'],
  'Đà Nẵng': ['43', 'ĐN', 'DN'],
  'Hải Phòng': ['15', '16', 'HP'],
  'Cần Thơ': ['65', 'CT'],
  'An Giang': ['67'],
  'Bà Rịa - Vũng Tàu': ['72', 'BRVT', 'VT'],
  'Bắc Giang': ['98'],
  'Bắc Kạn': ['97'],
  'Bạc Liêu': ['94'],
  'Bắc Ninh': ['99', 'BN'],
  'Bến Tre': ['71'],
  'Bình Định': ['77'],
  'Bình Dương': ['61', 'BD'],
  'Bình Phước': ['93'],
  'Bình Thuận': ['86'],
  'Cà Mau': ['69'],
  'Cao Bằng': ['11'],
  'Đắk Lắk': ['47'],
  'Đắk Nông': ['48'],
  'Điện Biên': ['27'],
  'Đồng Nai': ['60', '39'],
  'Đồng Tháp': ['66'],
  'Gia Lai': ['81'],
  'Hà Giang': ['23'],
  'Hà Nam': ['90'],
  'Hà Tĩnh': ['38'],
  'Hải Dương': ['34'],
  'Hậu Giang': ['95'],
  'Hòa Bình': ['28'],
  'Hưng Yên': ['89'],
  'Khánh Hòa': ['79', 'KH'],
  'Kiên Giang': ['68'],
  'Kon Tum': ['82'],
  'Lai Châu': ['25'],
  'Lâm Đồng': ['49'],
  'Lạng Sơn': ['12'],
  'Lào Cai': ['24'],
  'Long An': ['62'],
  'Nam Định': ['18'],
  'Nghệ An': ['37', 'NA'],
  'Ninh Bình': ['35'],
  'Ninh Thuận': ['85'],
  'Phú Thọ': ['19'],
  'Phú Yên': ['78'],
  'Quảng Bình': ['73', 'QB'],
  'Quảng Nam': ['92', 'QNA'],
  'Quảng Ngãi': ['76', 'QNG'],
  'Quảng Ninh': ['14', 'QN'],
  'Quảng Trị': ['74', 'QT'],
  'Sóc Trăng': ['83'],
  'Sơn La': ['26'],
  'Tây Ninh': ['70'],
  'Thái Bình': ['17'],
  'Thái Nguyên': ['20'],
  'Thanh Hóa': ['36', 'TH'],
  'Thừa Thiên Huế': ['75', 'TTH', 'HUE'],
  'Tiền Giang': ['63'],
  'Trà Vinh': ['84'],
  'Tuyên Quang': ['22'],
  'Vĩnh Long': ['64'],
  'Vĩnh Phúc': ['88'],
  'Yên Bái': ['21'],
};

export function isVehicleMatchingProvince(v: VehicleItem, provName: string): boolean {
  if (!v || !provName || provName === 'ALL') return true;

  const cleanProv = provName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '')
    .trim();

  // 1. Kiểm tra biển số / mô tả có chứa tên tỉnh
  const text = `${v.plateNumber || ''} ${v.description || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (cleanProv && text.includes(cleanProv)) return true;

  // 2. Kiểm tra đầu biển số theo quy chuẩn mã vùng Việt Nam
  const plateClean = (v.plateNumber || '').toUpperCase().trim();
  for (const [pKey, codes] of Object.entries(VIETNAM_PROVINCE_PLATE_CODES)) {
    const normKey = pKey
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (normKey === cleanProv || cleanProv.includes(normKey) || normKey.includes(cleanProv)) {
      return codes.some((code) => plateClean.startsWith(code));
    }
  }

  return false;
}

export const normalizeViText = (input: string) =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const isValidSafeLocationItem = (loc: any) => {
  const name = typeof loc?.name === 'string' ? loc.name.trim() : '';
  if (name.length < 3) return false;
  return !['iui', 'ok', 'test', 'abc'].includes(name.toLowerCase());
};

export const getSafeLocationIcon = (type?: string) => {
  switch (type) {
    case 'HOSPITAL':
      return '🏥';
    case 'RESCUE_STATION':
      return '🛟';
    case 'SHELTER':
      return '⛺';
    case 'MEETING_POINT':
      return '📍';
    default:
      return '🏫';
  }
};

export const parseEquipmentNote = (rawNote?: string | null) => {
  if (!rawNote) {
    return {
      specs: 'Trang thiết bị / vật tư đạt tiêu chuẩn kiểm định cơ quan phòng chống thiên tai, bảo quản nơi khô ráo, sẵn sàng phân phối khi có lệnh.',
      logs: [] as string[],
    };
  }

  const parts = rawNote.split(' | ').map((p) => p.trim()).filter(Boolean);
  const logs: string[] = [];
  const specsParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      logs.push(part.slice(1, -1));
    } else {
      specsParts.push(part);
    }
  }

  return {
    specs:
      specsParts.length > 0
        ? specsParts.join(' | ')
        : 'Trang thiết bị / vật tư đạt tiêu chuẩn kiểm định cơ quan phòng chống thiên tai, bảo quản nơi khô ráo, sẵn sàng phân phối khi có lệnh.',
    logs: logs.reverse(), // Gần nhất xếp lên đầu
  };
};

import type {
  SosRequestItem,
  VehicleItem,
  SafeLocationItem,
  AlertItem,
  AuditLogItem,
} from '@/types/dashboard';

/* ==========================================================================
   DỮ LIỆU TÁC CHIẾN - ĐỒNG BỘ 100% TỪ API CỦA HỆ THỐNG
   ========================================================================== */

export const FALLBACK_SOS_LIST: SosRequestItem[] = [];

export const FALLBACK_RESCUERS: any[] = [];

export const FALLBACK_VEHICLES: VehicleItem[] = [];

export const FALLBACK_SHELTERS: SafeLocationItem[] = [];

export const FALLBACK_ALERTS: AlertItem[] = [];

export const FALLBACK_AUDIT_LOGS: AuditLogItem[] = [];

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
    available: 500,
    deployed: 100,
    total: 600,
    unit: 'Chiếc',
    minReserve: 50,
    location: 'Kho Cứu Nạn Trung Tâm',
  },
  {
    id: 'sup-02',
    name: 'Phao tròn cứu sinh có dây ném 30m',
    category: 'LIFE_SAVING',
    available: 120,
    deployed: 30,
    total: 150,
    unit: 'Chiếc',
    minReserve: 20,
    location: 'Kho Cứu Nạn Trung Tâm',
  },
  {
    id: 'sup-03',
    name: 'Túi thuốc & Sơ cấp cứu dã chiến chống nước',
    category: 'MEDICAL',
    available: 80,
    deployed: 25,
    total: 105,
    unit: 'Bộ',
    minReserve: 15,
    location: 'Trạm Y Tế Cứu Thương Dã Chiến',
  },
  {
    id: 'sup-04',
    name: 'Nước uống đóng chai tiệt trùng (Thùng 24 chai)',
    category: 'FOOD_WATER',
    available: 850,
    deployed: 350,
    total: 1200,
    unit: 'Thùng',
    minReserve: 100,
    location: 'Kho Dự Trữ Khẩn Cấp',
  },
  {
    id: 'sup-05',
    name: 'Lương khô dã chiến quân đội (Thùng 5kg)',
    category: 'FOOD_WATER',
    available: 420,
    deployed: 180,
    total: 600,
    unit: 'Thùng',
    minReserve: 80,
    location: 'Kho Dự Trữ Khẩn Cấp',
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
    location: 'Kho Hậu Cần Kỹ Thuật',
  },
  {
    id: 'sup-07',
    name: 'Cưa xích cầm tay giải tỏa cây gãy đổ',
    category: 'EQUIPMENT',
    available: 14,
    deployed: 3,
    total: 17,
    unit: 'Máy',
    minReserve: 2,
    location: 'Kho Hậu Cần Kỹ Thuật',
  },
  {
    id: 'sup-lc-01',
    name: 'Áo phao cứu sinh tiêu chuẩn SOLAS (Liên Chiểu)',
    category: 'LIFE_SAVING',
    available: 180,
    deployed: 40,
    total: 220,
    unit: 'Chiếc',
    minReserve: 30,
    location: 'Kho Vật Tư PCTT Quận Liên Chiểu',
  },
  {
    id: 'sup-lc-02',
    name: 'Phao tròn cứu sinh có dây ném 30m',
    category: 'LIFE_SAVING',
    available: 60,
    deployed: 15,
    total: 75,
    unit: 'Chiếc',
    minReserve: 10,
    location: 'Kho Vật Tư PCTT Quận Liên Chiểu',
  },
  {
    id: 'sup-lc-03',
    name: 'Túi thuốc & Huyết thanh dã chiến chống nước',
    category: 'MEDICAL',
    available: 45,
    deployed: 12,
    total: 57,
    unit: 'Bộ',
    minReserve: 10,
    location: 'Trạm Y Tế Dã Chiến Liên Chiểu',
  },
  {
    id: 'sup-lc-04',
    name: 'Lương khô dã chiến & Nước tinh khiết đóng chai',
    category: 'FOOD_WATER',
    available: 320,
    deployed: 110,
    total: 430,
    unit: 'Thùng',
    minReserve: 50,
    location: 'Kho Hậu Cần Dã Chiến Liên Chiểu',
  },
  {
    id: 'sup-lc-05',
    name: 'Máy phát điện dã chiến chống nước 5kW',
    category: 'EQUIPMENT',
    available: 8,
    deployed: 2,
    total: 10,
    unit: 'Máy',
    minReserve: 2,
    location: 'Kho Vật Tư PCTT Quận Liên Chiểu',
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
  hotline: '112 / 114 / 115',
  headquarters: 'Trung Tâm Chỉ Huy Phòng Chống Thiên Tai & Tìm Kiếm Cứu Nạn Quốc Gia',
  sirenSound: true,
  pushNotifications: true,
  scanRadiusKm: 10,
  autoEscalateMinutes: 10,
  autoSuggestVehicles: true,
  mapLayer: 'vector',
  autoFlyToNewSos: true,
  showAdminBoundaries: true,
  syncIntervalSeconds: 6,
};

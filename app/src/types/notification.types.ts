/**
 * Loại thông báo trong hệ thống
 */
export type NotificationType =
  | 'INSTANT'
  | 'SYSTEM'
  | 'ALERT'
  | 'RESCUE'
  | 'WEATHER'
  | 'SAFE_LOCATION'
  | 'HAZARD'
  | string;

/**
 * Mức độ ưu tiên của thông báo
 */
export type NotificationPriority =
  | 'LOW'
  | 'NORMAL'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'
  | string;

/**
 * Bản ghi thông báo hệ thống
 */
export interface NotificationItem {
  _id: string;
  type: NotificationType;
  title: string;
  content: string;
  imageUrl?: string;
  articleUrl?: string;
  sourceName?: string;
  priority?: NotificationPriority;
  areaId?: any;
  areaName?: string;
  createdBy?: {
    _id: string;
    fullName: string;
    roles?: string[];
  };
  data?: any;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

/**
 * Cài đặt thông báo người dùng thực tế
 */
export interface NotificationSettings {
  alert: boolean; // Cảnh báo khẩn cấp (SOS Alert, cứu nạn, sạt lở...)
  safeLocation: boolean; // Vị trí an toàn (Trạm y tế, điểm sơ tán...)
  systemNotification: boolean; // Thông báo hệ thống (Điều phối, tài khoản...)
  news: boolean; // Tin tức & Thời tiết (Bản tin, dự báo...)
  sound: boolean; // Âm thanh thông báo
  vibration: boolean; // Rung thiết bị
}

/**
 * Loại hình thời tiết chuyên biệt
 */
export type WeatherEventType =
  | 'GENERAL'
  | 'HEAVY_RAIN'
  | 'STORM'
  | 'TYPHOON'
  | 'THUNDERSTORM'
  | 'FLASH_FLOOD'
  | 'HEATWAVE'
  | 'COLD_SURGE'
  | 'HIGH_TIDE'
  | string;

/**
 * Bản ghi Thông báo Thời tiết chuyên biệt (WeatherNotification)
 */
export interface WeatherNotificationItem {
  _id: string;
  title: string;
  content: string;
  imageUrl?: string;
  category?: string;       // Danh mục: mua_lu, bao, sat_lo...
  score?: number;          // Điểm: 95
  area?: string;           // Khu vực: Gia Lai
  articleUrl?: string;     // Link bài báo gốc
  articleTitle?: string;   // Tiêu đề bài báo gốc
  weatherType?: string;    // Alias category
  areaName?: string;       // Alias area
  sourceName?: string;     // Alias articleTitle
  areaId?: any;
  status?: 'ACTIVE' | 'ARCHIVED';
  createdBy?: {
    _id: string;
    fullName: string;
    roles?: string[];
  };
  broadcastId?: string;
  createdAt: string;
  updatedAt?: string;
}

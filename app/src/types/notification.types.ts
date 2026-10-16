/**
 * Loại thông báo trong hệ thống
 */
export type NotificationType =
  | 'INSTANT'
  | 'SYSTEM'
  | 'ALERT'
  | 'RESCUE'
  | 'WEATHER'
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
 * Cài đặt thông báo người dùng
 */
export interface NotificationSettings {
  pushEnabled: boolean;
  emergencyAlerts: boolean;
  rescueUpdates: boolean;
  weatherWarnings: boolean;
  communityNews: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

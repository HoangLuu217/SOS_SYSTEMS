/**
 * Tên các Tab điều hướng chính
 */
export type TabName = 'home' | 'map' | 'sos' | 'news' | 'profile';

/**
 * Bộ lọc hiển thị trên bản đồ cứu trợ
 */
export type MapFilterType = 'ALL' | 'HAZARD' | 'SAFE' | 'RELIEF';

/**
 * Các màn hình con trong phân hệ Profile
 */
export type ProfileSubScreen =
  | 'overview'
  | 'edit-profile'
  | 'security'
  | 'sos-history'
  | 'notifications'
  | 'notification-settings'
  | 'emergency-contacts'
  | 'professional'
  | 'rescuer-overview'
  | 'citizen-overview';

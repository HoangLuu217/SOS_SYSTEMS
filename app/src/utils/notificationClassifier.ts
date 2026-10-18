import { NotificationItem } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFICATION_SETTINGS_STORAGE_KEY = '@sos_notification_settings';

export type NotificationCategoryKey =
  | 'alert'
  | 'safeLocation'
  | 'systemNotification'
  | 'news';

export type NotificationFilterKey = 'all' | NotificationCategoryKey;

export interface CategoryMeta {
  key: NotificationCategoryKey;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  iconName: string; // Ionicons name
  featherIcon: string;
  color: string;
  bgColor: string;
  badgeBg: string;
  badgeTextColor: string;
  borderColor: string;
  desc: string;
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategoryKey, CategoryMeta> = {
  alert: {
    key: 'alert',
    label: 'Cảnh báo khẩn cấp',
    shortLabel: 'Khẩn cấp',
    badgeLabel: 'CẢNH BÁO SOS',
    iconName: 'warning',
    featherIcon: 'alert-triangle',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    badgeBg: '#FEE2E2',
    badgeTextColor: '#DC2626',
    borderColor: '#FECACA',
    desc: 'Báo động SOS, lũ quét, sạt lở đất nguy cấp',
  },
  safeLocation: {
    key: 'safeLocation',
    label: 'Vị trí an toàn',
    shortLabel: 'An toàn',
    badgeLabel: 'ĐIỂM AN TOÀN',
    iconName: 'shield-checkmark',
    featherIcon: 'shield',
    color: '#059669',
    bgColor: '#ECFDF5',
    badgeBg: '#D1FAE5',
    badgeTextColor: '#059669',
    borderColor: '#A7F3D0',
    desc: 'Trạm y tế, điểm sơ tán & tập kết an toàn gần bạn',
  },
  systemNotification: {
    key: 'systemNotification',
    label: 'Thông báo hệ thống',
    shortLabel: 'Hệ thống',
    badgeLabel: 'HỆ THỐNG',
    iconName: 'notifications',
    featherIcon: 'bell',
    color: '#0066FF',
    bgColor: '#EFF6FF',
    badgeBg: '#DBEAFE',
    badgeTextColor: '#0066FF',
    borderColor: '#BFDBFE',
    desc: 'Điều phối cứu hộ, phản hồi tổng đài, tài khoản',
  },
  news: {
    key: 'news',
    label: 'Tin tức & Thời tiết',
    shortLabel: 'Tin tức',
    badgeLabel: 'THỜI TIẾT & TIN TỨC',
    iconName: 'partly-sunny',
    featherIcon: 'file-text',
    color: '#D97706',
    bgColor: '#FFFBEB',
    badgeBg: '#FEF3C7',
    badgeTextColor: '#D97706',
    borderColor: '#FDE68A',
    desc: 'Dự báo thời tiết, lượng mưa, cẩm nang ứng phó bão lũ',
  },
};

/**
 * Phân loại một thông báo vào 1 trong 4 danh mục của Cài đặt thông báo:
 * 1. alert: Cảnh báo khẩn cấp
 * 2. safeLocation: Vị trí an toàn
 * 3. systemNotification: Thông báo hệ thống
 * 4. news: Tin tức & Thời tiết
 */
export function classifyNotification(item: NotificationItem): NotificationCategoryKey {
  const type = String(item.type || '').toUpperCase();
  const priority = String(item.priority || '').toUpperCase();
  const title = (item.title || '').toLowerCase();
  const content = (item.content || '').toLowerCase();

  // 1. Vị trí an toàn (Safe location)
  if (
    type === 'SAFE_LOCATION' ||
    type === 'SAFE' ||
    title.includes('vị trí an toàn') ||
    title.includes('điểm an toàn') ||
    title.includes('điểm sơ tán') ||
    title.includes('trạm y tế') ||
    title.includes('điểm tập kết') ||
    title.includes('nơi trú ẩn') ||
    content.includes('điểm tập kết an toàn') ||
    content.includes('trạm y tế dã chiến') ||
    content.includes('khu vực sơ tán cao ráo')
  ) {
    return 'safeLocation';
  }

  // 2. Cảnh báo khẩn cấp (Emergency Alert)
  if (
    type === 'ALERT' ||
    type === 'HAZARD' ||
    type === 'RESCUE' ||
    priority === 'CRITICAL' ||
    (type === 'INSTANT' && (priority === 'HIGH' || priority === 'CRITICAL')) ||
    title.includes('khẩn cấp') ||
    title.includes('báo động') ||
    title.includes('nguy cấp') ||
    title.includes('lũ quét') ||
    title.includes('sạt lở') ||
    title.includes('vỡ đê') ||
    title.includes('cứu hộ khẩn cấp') ||
    title.includes('ứng cứu') ||
    content.includes('báo động đỏ') ||
    content.includes('nguy hiểm đặc biệt')
  ) {
    return 'alert';
  }

  // 3. Tin tức & Thời tiết (News & Weather)
  if (
    type === 'WEATHER' ||
    type === 'NEWS' ||
    type === 'TIN_TUC' ||
    title.includes('thời tiết') ||
    title.includes('dự báo') ||
    title.includes('lượng mưa') ||
    title.includes('áp thấp') ||
    title.includes('triều cường') ||
    title.includes('sóng lớn') ||
    title.includes('cẩm nang') ||
    title.includes('bản tin') ||
    content.includes('khí tượng thủy văn') ||
    content.includes('dự báo thời tiết')
  ) {
    return 'news';
  }

  // 4. Mặc định: Thông báo hệ thống (System Notification)
  return 'systemNotification';
}

/**
 * Danh sách thông báo mẫu đại diện đủ 4 nhóm thông báo trong cài đặt
 */
export const SAMPLE_FILTERED_NOTIFICATIONS: NotificationItem[] = [
  {
    _id: 'sample-alert-1',
    type: 'ALERT',
    title: 'Cảnh báo ngập lụt khẩn cấp lưu vực Sông Hàn & Ngũ Hành Sơn',
    content:
      'Mực nước sông dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường. Lực lượng cứu hộ đang túc trực ca-nô tại các chốt chính.',
    imageUrl:
      'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://danang.gov.vn',
    sourceName: 'Cổng TTĐT TP. Đà Nẵng',
    priority: 'CRITICAL',
    areaName: 'Quận Ngũ Hành Sơn',
    createdBy: {
      _id: 'sample-auth-1',
      fullName: 'Ban Chỉ huy PCTT & TKCN',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-weather-1',
    type: 'WEATHER',
    title: 'Dự báo thời tiết 24h tới: Mưa to đến rất to tại khu vực ven biển miền Trung',
    content:
      'Do ảnh hưởng của không khí lạnh kết hợp dải hội tụ nhiệt đới, khu vực Đà Nẵng đến Quảng Ngãi có mưa to với lượng mưa phổ biến 150-250mm, cục bộ có nơi trên 350mm. Đề phòng lũ quét, sạt lở đất sườn đồi dốc và ngập úng đô thị diện rộng.',
    imageUrl:
      'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://nchmf.gov.vn',
    sourceName: 'Trung tâm Dự báo KTTV Quốc gia',
    priority: 'HIGH',
    areaName: 'Khu vực Trung Bộ',
    createdBy: {
      _id: 'sample-auth-3',
      fullName: 'Trung tâm KTTV Quốc gia',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-news-1',
    type: 'NEWS',
    title: 'Cẩm nang hướng dẫn phòng chống đuối nước & kỹ năng sinh tồn trong mùa lũ',
    content:
      'Ban Chỉ đạo Quốc gia về PCTT khuyến cáo: Chuẩn bị lương khô dự trữ đủ 3-5 ngày, áo phao, đèn pin sạc, ngắt toàn bộ cầu dao điện và bình gas khi nước dâng. Cách phát tín hiệu cầu cứu SOS từ mái nhà và danh bạ đường dây nóng ứng cứu.',
    imageUrl:
      'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://phongchongthientai.mard.gov.vn',
    sourceName: 'Cục Quản lý Đê điều & PCTT',
    priority: 'NORMAL',
    areaName: 'Toàn quốc',
    createdBy: {
      _id: 'sample-auth-6',
      fullName: 'Ban Chỉ đạo PCTT Quốc gia',
      roles: ['ADMIN'],
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    _id: 'sample-safe-1',
    type: 'SAFE_LOCATION',
    title: 'Thiết lập 12 vị trí an toàn & trạm y tế dã chiến tại Quận Hải Châu',
    content:
      'UBND Quận đã mở cửa các Trường học cao tầng và Trung tâm Văn hóa Thể thao làm điểm tiếp nhận sơ tán an toàn. Mỗi điểm có sẵn nước sạch, lương thực và cán bộ y tế túc trực 24/24.',
    imageUrl:
      'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://danang.gov.vn',
    sourceName: 'UBND Quận Hải Châu',
    priority: 'HIGH',
    areaName: 'Quận Hải Châu',
    createdBy: {
      _id: 'sample-auth-2',
      fullName: 'Trung tâm Chỉ huy Cứu nạn',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-weather-2',
    type: 'WEATHER',
    title: 'Cảnh báo gió mạnh sóng lớn và triều cường dâng cao tại bán đảo Sơn Trà',
    content:
      'Gió mùa đông bắc giật mạnh cấp 8-9, sóng biển cao 3-5m, biển động dữ dội. Toàn bộ lồng bè nuôi trồng thủy sản và tàu thuyền được yêu cầu về nơi tránh trú an toàn tại âu thuyền Thọ Quang trước 17h.',
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://tuoitre.vn',
    sourceName: 'Báo Tuổi Trẻ Online',
    priority: 'NORMAL',
    areaName: 'Quận Sơn Trà',
    createdBy: {
      _id: 'sample-auth-7',
      fullName: 'Trạm Hải văn Sơn Trà',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-system-1',
    type: 'SYSTEM',
    title: 'Nâng cấp hệ thống điều phối cứu nạn tự động RescueSOS v2.5',
    content:
      'Hệ thống RescueSOS đã bổ sung tính năng tự động quét ca-nô gần nhất và phát thông báo khẩn cấp theo khu vực hành chính. Mọi yêu cầu cứu trợ sẽ được kết nối trực tiếp đến cán bộ địa phương phụ trách.',
    priority: 'NORMAL',
    areaName: 'Toàn thành phố Đà Nẵng',
    createdBy: {
      _id: 'sample-admin-1',
      fullName: 'Quản trị viên Hệ thống SOS',
      roles: ['ADMIN'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    _id: 'sample-safe-2',
    type: 'SAFE_LOCATION',
    title: 'Điểm tập kết an toàn & hỗ trợ tiếp tế nhu yếu phẩm tại Xã Hòa Tiến',
    content:
      'Đoàn cứu trợ thông báo Nhà thi đấu xã Hòa Tiến đã sẵn sàng đón tiếp người dân khu vực ngập lụt. Có xuồng trung chuyển người và tài sản miễn phí.',
    imageUrl:
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80',
    articleUrl: 'https://danang.gov.vn',
    sourceName: 'Ban Cứu trợ Hòa Vang',
    priority: 'NORMAL',
    areaName: 'Xã Hòa Tiến, Hòa Vang',
    createdBy: {
      _id: 'sample-auth-5',
      fullName: 'Ban Cứu trợ Nhân dân',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    actionUrl: 'map',
  },
];

/**
 * Đọc cài đặt thông báo từ AsyncStorage
 */
export async function getSavedNotificationSettings(): Promise<{
  alert: boolean;
  safeLocation: boolean;
  systemNotification: boolean;
  news: boolean;
  sound: boolean;
  vibration: boolean;
}> {
  const DEFAULT = {
    alert: true,
    safeLocation: true,
    systemNotification: true,
    news: true,
    sound: true,
    vibration: true,
  };

  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT, ...JSON.parse(raw) };
    }
  } catch {
    // Fallback default
  }
  return DEFAULT;
}

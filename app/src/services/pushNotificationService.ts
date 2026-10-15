import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { backendApi } from './backendApi';

// Cấu hình cách hiển thị thông báo khi ứng dụng đang chạy ở foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Đăng ký quyền và lấy Expo Push Token gửi lên máy chủ
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  try {
    // Thiết lập kênh thông báo ưu tiên cao nhất trên Android (Heads-up notification + Rung + Chuông)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('emergency-alerts', {
        name: 'Cảnh báo khẩn cấp & Tin tức SOS',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    // Kiểm tra và xin quyền nhận thông báo
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Người dùng từ chối cấp quyền thông báo');
      return null;
    }

    // Lấy token từ Expo push service nếu có cấu hình
    try {
      const pushTokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
      if (pushTokenData?.data) {
        token = pushTokenData.data;
        await backendApi.registerPushToken(token);
        console.log('✅ Đã đăng ký Expo Push Token với máy chủ thành công:', token);
      }
    } catch (pushErr: any) {
      console.log('ℹ️ Môi trường hiện tại sử dụng Local Realtime Push Channel:', pushErr?.message || pushErr);
    }
  } catch (err: any) {
    console.log('Lỗi khi khởi tạo Push Notifications:', err?.message || err);
  }

  return token;
}

/**
 * Kích hoạt thông báo hệ thống ra ngoài màn hình điện thoại (Local Push Notification)
 * Dùng để phát âm thanh, rung và hiển thị banner thông báo nổi (Heads-up) ngay lập tức trên điện thoại
 */
export async function triggerLocalNotification(options: {
  title: string;
  body: string;
  data?: any;
  priority?: 'NORMAL' | 'HIGH' | 'CRITICAL' | string;
}): Promise<void> {
  try {
    // Đảm bảo kênh Android đã sẵn sàng trước khi bắn thông báo
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('emergency-alerts', {
        name: 'Cảnh báo khẩn cấp & Tin tức SOS',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    const notificationContent: any = {
      title: options.title,
      body: options.body,
      data: options.data || {},
      sound: 'default',
      channelId: 'emergency-alerts',
      badge: 1,
      priority:
        options.priority === 'CRITICAL' || options.priority === 'HIGH'
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
    };

    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: null, // Hiển thị ngay lập tức (0ms)
    });
  } catch (err) {
    console.log('Không thể hiển thị local notification:', err);
  }
}

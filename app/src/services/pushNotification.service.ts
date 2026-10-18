import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { backendApi } from '@/api';

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
      try {
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
      } catch (channelErr) {
        // Trong Expo Go từ SDK 53+, Android không hỗ trợ NotificationsChannelsProvider
        console.log('ℹ️ [PushNotification] Bỏ qua thiết lập NotificationChannel (Expo Go environment)');
      }
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
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        (Constants as any).easConfig?.projectId;
      const pushTokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      ).catch(() => null);
      if (pushTokenData?.data) {
        token = pushTokenData.data;
        const registration = await backendApi.registerPushToken(token);
        if (!registration.success) {
          console.warn(
            '⚠️ Đã lấy được Expo Push Token nhưng máy chủ không lưu được token:',
            registration.message || 'Không rõ lỗi'
          );
          return null;
        }
        console.log('✅ Đã đăng ký Expo Push Token với máy chủ thành công.');
      }
    } catch (pushErr: any) {
      console.warn(
        '⚠️ Không lấy được Expo Push Token. Push khi app chạy nền cần development/production build và cấu hình credential Android/iOS.',
        pushErr?.message || pushErr
      );
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
    // Đảm bảo kênh Android đã sẵn sàng trước khi bắn thông báo (nếu được hỗ trợ)
    if (Platform.OS === 'android') {
      try {
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
      } catch (_) {
        // Expo Go fallback
      }
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

import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import Constants from 'expo-constants';
import { backendApi } from '@/api';
import { getSavedNotificationSettings, classifyNotification } from '@/utils';

// Cấu hình cách hiển thị thông báo khi ứng dụng đang chạy ở foreground dựa trên Cài đặt thông báo của người dùng
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const settings = await getSavedNotificationSettings();
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, any>;
      const item: any = {
        _id: String(data.notificationId || notification.request.identifier),
        title: content.title || '',
        content: content.body || '',
        type: String(data.type || 'SYSTEM'),
        priority: String(data.priority || 'NORMAL'),
        data,
      };

      const category = classifyNotification(item);

      // Nếu người dùng đã tắt nhóm thông báo này trong Cài đặt
      if (settings[category] === false) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: settings.sound,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    } catch {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    }
  },
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
      let pushTokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      ).catch(() => null);

      // Nếu truyền projectId thất bại (thường gặp khi chạy Expo Go trên iOS/Android), thử lại không truyền projectId
      if (!pushTokenData?.data) {
        pushTokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
      }

      if (pushTokenData?.data) {
        token = pushTokenData.data;
        console.log('📱 [PushNotification] Đã lấy được Push Token:', token);
        const registration = await backendApi.registerPushToken(token);
        if (!registration.success) {
          console.warn(
            '⚠️ Đã lấy được Expo Push Token nhưng máy chủ không lưu được token:',
            registration.message || 'Chưa đăng nhập tài khoản'
          );
        } else {
          console.log('✅ Đã đăng ký Expo Push Token với máy chủ thành công cho tài khoản.');
        }
      } else {
        console.log('ℹ️ [PushNotification] Thiết bị chưa lấy được Expo Push Token từ Expo server.');
      }
    } catch (pushErr: any) {
      console.warn(
        '⚠️ Lỗi khi đăng ký Expo Push Token:',
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
    const settings = await getSavedNotificationSettings();
    const item: any = {
      _id: 'local-' + Date.now(),
      title: options.title,
      content: options.body,
      type: options.data?.type || 'SYSTEM',
      priority: options.priority || 'NORMAL',
      data: options.data,
    };

    const category = classifyNotification(item);
    // Nếu người dùng đã tắt nhóm thông báo này
    if (settings[category] === false) {
      console.log(`ℹ️ [triggerLocalNotification] Bỏ qua vì nhóm '${category}' đang tắt trong Cài đặt.`);
      return;
    }

    // Rung nếu bật vibration
    if (settings.vibration) {
      if (options.priority === 'CRITICAL' || options.priority === 'HIGH' || category === 'alert') {
        Vibration.vibrate([0, 500, 200, 500]);
      } else {
        Vibration.vibrate(300);
      }
    }

    // Đảm bảo kênh Android đã sẵn sàng trước khi bắn thông báo (nếu được hỗ trợ)
    let channelIdToUse: string | undefined = undefined;
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('emergency-alerts', {
          name: 'Cảnh báo khẩn cấp & Tin tức SOS',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: settings.vibration ? [0, 500, 250, 500] : [0],
          lightColor: '#EF4444',
          sound: settings.sound ? 'default' : undefined,
          enableVibrate: settings.vibration,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        });
        channelIdToUse = 'emergency-alerts';
      } catch (_) {
        // Expo Go fallback: không ép buộc kênh tùy chỉnh nếu môi trường chưa hỗ trợ
        channelIdToUse = undefined;
      }
    }

    const notificationContent: any = {
      title: options.title,
      body: options.body,
      data: options.data || {},
      sound: settings.sound ? 'default' : undefined,
      badge: 1,
      priority:
        options.priority === 'CRITICAL' || options.priority === 'HIGH'
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
    };
    if (channelIdToUse) {
      notificationContent.channelId = channelIdToUse;
    }

    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: null, // Hiển thị ngay lập tức (0ms)
    });
  } catch (err) {
    console.log('Không thể hiển thị local notification:', err);
  }
}

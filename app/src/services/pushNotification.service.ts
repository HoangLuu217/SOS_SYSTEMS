import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import Constants from 'expo-constants';
import { backendApi } from '@/api';
import {
  getSavedNotificationSettings,
  classifyNotification,
  extractNotificationDedupeKeys,
  hasRecentlyPresentedNotification,
  markNotificationPresented,
} from '@/utils';

let registeredExpoPushToken: string | null = null;

export function getRegisteredExpoPushToken(): string | null {
  return registeredExpoPushToken;
}

/**
 * Kiểm tra xem thông báo này đã có mặt trong khay thông báo của hệ điều hành hay chưa
 * (Bao gồm Remote Push đến khi app đang nền / khóa màn hình).
 */
export async function isNotificationAlreadyPresented(input: {
  _id?: string | null;
  title?: string | null;
  content?: string | null;
  body?: string | null;
  data?: Record<string, any> | null;
}): Promise<boolean> {
  if (hasRecentlyPresentedNotification(input)) {
    return true;
  }
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (!Array.isArray(presented) || presented.length === 0) {
      return false;
    }
    const targetKeys = new Set(extractNotificationDedupeKeys(input));
    const targetStructuralKeys = Array.from(targetKeys).filter((k) => !k.startsWith('sig:'));
    const matchPool = targetStructuralKeys.length > 0 ? targetStructuralKeys : Array.from(targetKeys);
    for (const notif of presented) {
      const content = notif?.request?.content;
      if (!content) continue;
      const presentedObj = {
        _id: notif.request.identifier,
        title: content.title || '',
        body: content.body || '',
        data: (content.data || {}) as Record<string, any>,
      };
      markNotificationPresented(presentedObj);
      const presentedKeys = new Set(extractNotificationDedupeKeys(presentedObj));
      if (matchPool.some((k) => presentedKeys.has(k))) {
        return true;
      }
    }
  } catch {
    // Một số môi trường chưa hỗ trợ getPresentedNotificationsAsync
  }
  return hasRecentlyPresentedNotification(input);
}

// Cấu hình cách xử lý thông báo hệ điều hành khi ứng dụng đang mở (foreground):
// Tôn trọng tùy chọn BẬT/TẮT và Âm thanh trong Cài đặt thông báo của người dùng,
// hiển thị banner hệ thống phía trên màn hình (không dùng banner JSX đè giao diện app).
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
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      // Nếu Remote Push đến khi foreground nhưng thông báo này ĐÃ thực sự được hiển thị trước đó -> chặn trùng
      if (!data.isLocalTrigger && hasRecentlyPresentedNotification(item)) {
        return {
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      markNotificationPresented(item);

      return {
        shouldPlaySound: settings.sound !== false && !data.skipHandlerSound,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    } catch {
      return {
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
          vibrationPattern: [0, 300],
          lightColor: '#EF4444',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: false,
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
          registeredExpoPushToken = null;
          console.warn(
            '⚠️ Đã lấy được Expo Push Token nhưng máy chủ không lưu được token:',
            registration.message || 'Chưa đăng nhập tài khoản'
          );
        } else {
          registeredExpoPushToken = token;
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
  allowDuplicate?: boolean;
  skipHandlerSound?: boolean;
}): Promise<void> {
  try {
    const settings = await getSavedNotificationSettings();
    const item: any = {
      _id: String(options.data?.notificationId || 'local-' + Date.now()),
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

    if (!options.allowDuplicate) {
      const alreadyPresented = await isNotificationAlreadyPresented(item);
      if (alreadyPresented) {
        return;
      }
      markNotificationPresented(item);
    }

    // Rung 1 lần duy nhất nếu bật vibration
    if (settings.vibration !== false) {
      Vibration.vibrate(300);
    }

    // Đảm bảo kênh Android đã sẵn sàng trước khi bắn thông báo (không ghi đè làm tắt âm kênh mặc định)
    let channelIdToUse: string | undefined = undefined;
    if (Platform.OS === 'android') {
      const targetChannelId = settings.sound !== false ? 'emergency-alerts' : 'emergency-alerts-silent';
      try {
        await Notifications.setNotificationChannelAsync(targetChannelId, {
          name:
            settings.sound !== false
              ? 'Cảnh báo khẩn cấp & Tin tức SOS'
              : 'Cảnh báo khẩn cấp (Im lặng)',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: settings.vibration !== false ? [0, 300] : [0],
          lightColor: '#EF4444',
          sound: settings.sound !== false ? 'default' : undefined,
          enableVibrate: settings.vibration !== false,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: false,
        });
        channelIdToUse = targetChannelId;
      } catch (_) {
        // Expo Go fallback: không ép buộc kênh tùy chỉnh nếu môi trường chưa hỗ trợ
        channelIdToUse = undefined;
      }
    }

    const notificationContent: any = {
      title: options.title,
      body: options.body,
      data: {
        ...(options.data || {}),
        isLocalTrigger: true,
        skipHandlerSound: options.skipHandlerSound || undefined,
      },
      sound: settings.sound !== false ? 'default' : undefined,
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

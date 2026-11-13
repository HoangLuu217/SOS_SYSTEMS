import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, Platform, Vibration, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { backendApi, NotificationItem } from '@/api';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
  getRegisteredExpoPushToken,
  isNotificationAlreadyPresented,
  triggerLocalNotification,
  sseNotificationService,
  playNormalNotificationSound,
} from '@/services';
import {
  NotificationSettings,
  NotificationCategoryKey,
  classifyNotification,
  isWeatherNotification,
  getSavedNotificationSettings,
  saveNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  extractNotificationDedupeKeys,
  extractPersistentDedupeKeys,
  hasRecentNotification,
  markNotificationHandled,
  hasRecentlyPresentedNotification,
  markNotificationPresented,
} from '@/utils';
import { useAuth } from './AuthContext';

const SEEN_NOTIFICATIONS_STORAGE_KEY = 'sos_seen_notification_ids_v1';
const FRESH_POLL_MAX_AGE_MS = 90 * 1000;
const PUSH_BACKED_TYPES = new Set([
  'BLOOD_DONATION',
  'SAFETY_CHECK',
  'ALERT',
  'INSTANT',
  'WEATHER',
  'SAFE_LOCATION',
  'HAZARD',
  'CHAT',
]);

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  instantUnreadCount: number;
  systemUnreadCount: number;
  latestEmergencyAlert: NotificationItem | null;
  settings: NotificationSettings;
  updateSetting: (key: keyof NotificationSettings, value: boolean) => Promise<void>;
  resetSettings: () => Promise<void>;
  testNotification: (category?: NotificationCategoryKey) => Promise<boolean>;
  dismissEmergencyAlert: () => void;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  navigateToTab?: (tab: string) => void;
  setNavigateHandler: (fn: (tab: string) => void) => void;
  isSocketConnected: boolean; // Alias cho trạng thái realtime
  isRealtimeConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [latestEmergencyAlert, setLatestEmergencyAlert] = useState<NotificationItem | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const settingsRef = useRef<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const triggeredPushKeysRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef<boolean>(false);
  const hasUserModifiedSettingsRef = useRef<boolean>(false);
  const navigateHandlerRef = useRef<((tab: string) => void) | null>(null);
  const pendingFallbackTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const hasSeenNotification = useCallback((item: NotificationItem): boolean => {
    if (item._id && seenIdsRef.current.has(item._id)) return true;
    const persistentKeys = extractPersistentDedupeKeys(item);
    if (persistentKeys.some((k) => seenIdsRef.current.has(k))) return true;
    if (item.data?.broadcastId && seenIdsRef.current.has(item.data.broadcastId)) return true;
    return hasRecentNotification(item);
  }, []);

  const markSeenNotification = useCallback((item: NotificationItem) => {
    markNotificationHandled(item);
    if (item._id && !item._id.startsWith('sse_') && !item._id.startsWith('local-')) {
      seenIdsRef.current.add(item._id);
    }
    if (item.data?.broadcastId) {
      seenIdsRef.current.add(item.data.broadcastId);
    }
    extractPersistentDedupeKeys(item).forEach((k) => seenIdsRef.current.add(k));
    const idsArray = Array.from(seenIdsRef.current).slice(-150);
    AsyncStorage.setItem(SEEN_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(idsArray)).catch(() => { });
  }, []);

  // Luôn đồng bộ settingsRef với settings state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Nạp cài đặt người dùng từ AsyncStorage khi khởi tạo (không lưu vào User)
  useEffect(() => {
    let cancelled = false;
    getSavedNotificationSettings().then((saved) => {
      if (cancelled || hasUserModifiedSettingsRef.current) return;
      setSettings(saved);
      settingsRef.current = saved;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback(async (key: keyof NotificationSettings, value: boolean) => {
    hasUserModifiedSettingsRef.current = true;
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettings(next);
    await saveNotificationSettings(next);

    if (key === 'appEnabled' && !value) {
      unregisterPushNotificationsAsync().catch(() => { });
      return;
    }

    // Khi người dùng bật lại thông báo, đồng bộ lại quyền OS & Push Token với máy chủ
    if (
      value &&
      (key === 'appEnabled' ||
        key === 'alert' ||
        key === 'safeLocation' ||
        key === 'chat' ||
        key === 'systemNotification' ||
        key === 'news')
    ) {
      registerForPushNotificationsAsync().catch(() => { });
    }
  }, []);

  const resetSettings = useCallback(async () => {
    hasUserModifiedSettingsRef.current = true;
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    settingsRef.current = DEFAULT_NOTIFICATION_SETTINGS;
    await saveNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    registerForPushNotificationsAsync().catch(() => { });
  }, []);

  const testNotification = useCallback(async (category: NotificationCategoryKey = 'alert'): Promise<boolean> => {
    const current = settingsRef.current;
    if (current.appEnabled === false || current[category] === false) {
      return false; // Thông báo ứng dụng hoặc nhóm này đang bị tắt
    }

    const testItem: NotificationItem = {
      _id: 'test-' + Date.now(),
      type:
        category === 'alert'
          ? 'ALERT'
          : category === 'safeLocation'
            ? 'SAFE_LOCATION'
            : category === 'chat'
              ? 'CHAT'
              : category === 'news'
                ? 'WEATHER'
                : 'SYSTEM',
      priority: category === 'alert' ? 'CRITICAL' : category === 'chat' ? 'NORMAL' : 'HIGH',
      title:
        category === 'alert'
          ? '🚨 [Thử nghiệm] Cảnh báo khẩn cấp'
          : category === 'safeLocation'
            ? '🛡️ [Thử nghiệm] Vị trí an toàn'
            : category === 'chat'
              ? '💬 [Thử nghiệm] Tin nhắn mới'
              : category === 'news'
                ? '📰 [Thử nghiệm] Tin tức & Thời tiết'
                : '🔔 [Thử nghiệm] Thông báo hệ thống',
      content:
        'Thông báo thử nghiệm với âm chuông mặc định bình thường của thiết bị.',
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    if (Platform.OS === 'web') {
      if (current.vibration) {
        try {
          Vibration.vibrate(200);
        } catch (_) { }
      }
      if (current.sound !== false) {
        playNormalNotificationSound().catch(() => { });
      }
    }

    // Kích hoạt Local Notification hiển thị ra ngoài hệ điều hành với âm báo mặc định bình thường
    triggerLocalNotification({
      title: testItem.title,
      body: testItem.content,
      priority: testItem.priority,
      allowDuplicate: true,
      skipHandlerSound: false,
      data: {
        notificationId: testItem._id,
        type: testItem.type,
        isChat: category === 'chat' ? true : undefined,
        isLocalTrigger: true,
      },
    }).catch(() => { });

    return true;
  }, []);

  const isInstantType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'INSTANT' || t === 'TIN_TUC_THOI' || t === 'ALERT' || t === 'RESCUE';
  };

  const isSystemType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'SYSTEM' || t === 'THONG_BAO_HE_THONG';
  };

  // Xử lý thông báo đến tức thời (chỉ đẩy thông báo ra ngoài app, không hiển thị trong app)
  const processIncomingAlert = useCallback(async (incoming: NotificationItem, isFromRemotePush = false) => {
    const isRescuerVerification =
      incoming.type === 'RESCUER_VERIFICATION' ||
      incoming.data?.type === 'RESCUER_VERIFICATION';

    const verificationStatus =
      incoming.data?.verificationStatus || (incoming as any).verificationStatus || 'VERIFIED';

    // Bỏ qua nếu đã từng xử lý thông báo này (Deduplicate nhất quán giữa Remote Push, SSE và Polling)
    if (
      hasSeenNotification(incoming) ||
      (isRescuerVerification && seenIdsRef.current.has(`rescuer_ver_${verificationStatus}`))
    ) {
      return;
    }

    markSeenNotification(incoming);
    if (isRescuerVerification) {
      seenIdsRef.current.add(`rescuer_ver_${verificationStatus}`);
    }

    // Đồng bộ nhiệm vụ tức thời nếu thông báo có liên quan tới SOS / Assignment
    if (
      incoming.type === 'SOS_SYNC' ||
      incoming.data?.type === 'SOS_SYNC' ||
      incoming.data?.type === 'RESCUE' ||
      incoming.data?.action === 'ASSIGNED' ||
      incoming.data?.action === 'CANCELLED' ||
      incoming.data?.assignmentId ||
      incoming.data?.sosId ||
      (incoming as any).sosId
    ) {
      DeviceEventEmitter.emit('sos:sync');
      if (incoming.type === 'SOS_SYNC' && !incoming.title) {
        return;
      }
    }

    if (incoming.data?.type === 'RESCUER_VERIFICATION' || incoming.data?.type === 'USER_SYNC') {
      DeviceEventEmitter.emit('rescuer:verification_status_changed', incoming.data);
      DeviceEventEmitter.emit('user:profile_updated', incoming.data);
    }

    // Kiểm tra tính xác thực người nhận: nếu thông báo có đích danh userId hoặc targetUserIds
    const myUserId = (user?._id || (user as any)?.id)?.toString();
    const targetUserId = ((incoming as any).userId || incoming.data?.userId)?.toString();
    if (targetUserId && myUserId && targetUserId !== myUserId) {
      // Thông báo chỉ định user khác -> không hiển thị banner/chuông cho tôi
      return;
    }

    const targetUserIds: string[] = Array.isArray(incoming.data?.targetUserIds)
      ? incoming.data.targetUserIds.map((u: any) => (u?._id || u)?.toString())
      : [];
    if (targetUserIds.length > 0 && myUserId && !targetUserIds.includes(myUserId)) {
      // Thông báo chỉ định danh sách user khác -> không hiển thị banner/chuông cho tôi
      return;
    }

    // 1. Chèn thông báo mới vào đầu danh sách ngay lập tức
    const incomingPersistentKeys = new Set(extractPersistentDedupeKeys(incoming));
    setNotifications((prev) => {
      const isExisted = prev.some((n) => {
        if (n._id === incoming._id) return true;
        if (incoming.data?.broadcastId && n.data?.broadcastId === incoming.data.broadcastId) {
          return true;
        }
        return extractPersistentDedupeKeys(n).some((k) => incomingPersistentKeys.has(k));
      });
      if (isExisted) return prev;
      return [incoming, ...prev];
    });

    if (isWeatherNotification(incoming)) {
      DeviceEventEmitter.emit('weather:articles_updated');
    }

    // 2. Phân loại thông báo và kiểm tra Cài đặt của người dùng
    const category = classifyNotification(incoming);
    const currentSettings = settingsRef.current;

    // NẾU NGƯỜI DÙNG ĐÃ TẮT THÔNG BÁO ỨNG DỤNG HOẶC TẮT NHÓM THÔNG BÁO NÀY:
    if (currentSettings.appEnabled === false || currentSettings[category] === false) {
      console.log(`ℹ️ [NotificationContext] Bỏ qua cảnh báo cho nhóm '${category}' vì cài đặt đang tắt.`);
      return;
    }

    // 2b. Kiểm tra xem có phải tin nhắn trao đổi với cán bộ địa phương không
    const isChat =
      incoming.type === 'CHAT' ||
      incoming.actionUrl === 'chat' ||
      incoming.data?.isChat;

    // 3. Nếu là thông báo nhận từ remote push, hệ thống đã phát thông báo rồi, KHÔNG gọi triggerLocalNotification để tránh bị alert 2 lần!
    // Chỉ kích hoạt local notification khi đến từ SSE/Polling và chưa từng được phát / chưa hiện trong khay thông báo.
    const persistentKeys = extractPersistentDedupeKeys(incoming);
    const dedupeKeysForTrigger =
      persistentKeys.length > 0 ? persistentKeys : extractNotificationDedupeKeys(incoming);
    const alreadyTriggered =
      hasRecentlyPresentedNotification(incoming) ||
      dedupeKeysForTrigger.some((k) => triggeredPushKeysRef.current.has(k));

    if (!isFromRemotePush && !alreadyTriggered) {
      dedupeKeysForTrigger.forEach((k) => triggeredPushKeysRef.current.add(k));

      const localPayload = {
        title:
          incoming.title ||
          (isChat ? '💬 Tin nhắn từ cán bộ địa phương' : '🚨 LỆNH ĐIỀU ĐỘNG CỨU HỘ MỚI'),
        body:
          incoming.content ||
          (incoming.data?.address
            ? `Vị trí ứng cứu: ${incoming.data.address}`
            : isChat
              ? 'Đã gửi phản hồi cho bạn'
              : 'Có thông báo mới từ hệ thống cứu hộ SOS'),
        priority: isChat ? 'NORMAL' : incoming.priority,
        data: {
          ...(incoming.data || {}),
          notificationId: incoming._id,
          type: incoming.type,
          areaId: incoming.areaId,
          areaName: incoming.areaName,
          actionUrl: incoming.actionUrl || incoming.data?.actionUrl,
          isLocalTrigger: true,
          isChat: isChat || undefined,
        },
      };

      const hasPushToken = Boolean(getRegisteredExpoPushToken());
      const expectsRemotePush =
        hasPushToken &&
        incoming.data?.pushDispatched !== false &&
        (incoming.data?.pushDispatched === true ||
          PUSH_BACKED_TYPES.has(String(incoming.type || '').toUpperCase()));

      if (expectsRemotePush) {
        // Nếu app đang nền/khóa màn hình, APNs/FCM tự đẩy thông báo gốc ra màn hình khóa -> không bắn Local Notification chồng lên.
        // Nếu app đang active, chờ 1500ms ưu tiên Remote Push; chỉ fallback Local Notification nếu chưa có Remote Push.
        if (AppState.currentState === 'active') {
          const timer = setTimeout(async () => {
            pendingFallbackTimersRef.current.delete(timer);
            if (AppState.currentState !== 'active') return;
            const alreadyShown = await isNotificationAlreadyPresented({
              ...incoming,
              title: localPayload.title,
              content: localPayload.body,
              data: localPayload.data,
            });
            if (!alreadyShown) {
              triggerLocalNotification(localPayload).catch(() => { });
            }
          }, 1500);
          pendingFallbackTimersRef.current.add(timer);
        }
      } else {
        triggerLocalNotification(localPayload).catch(() => { });
      }
    }

    // "Chỉ đẩy thông báo ra ngoài app không hiển thị trong app":
    // Tuyệt đối không gọi setLatestEmergencyAlert(incoming) để không bật banner nổi trong app.
  }, [user?._id, hasSeenNotification, markSeenNotification]);

  // Tải danh sách thông báo và đối chiếu tin mới
  const syncNotifications = useCallback(async () => {
    try {
      const res = await backendApi.getNotifications({ limit: 100 });
      if (!res.success || !Array.isArray(res.data)) {
        return;
      }

      // Khử trùng lặp danh sách thông báo trả về (Deduplicate)
      const deduplicatedList: NotificationItem[] = [];
      const seenKeysInBatch = new Set<string>();

      for (const item of res.data) {
        const persistentKeys = extractPersistentDedupeKeys(item);
        const fallbackKey =
          item.data?.broadcastId ||
          `${item.title?.trim()}_${item.content?.trim()}_${item.createdAt?.slice(0, 16)}`;
        const keysToCheck = persistentKeys.length > 0 ? persistentKeys : [fallbackKey];

        if (keysToCheck.some((k) => seenKeysInBatch.has(k))) {
          continue; // Bỏ qua nếu trùng nội dung / đợt broadcast
        }
        keysToCheck.forEach((k) => seenKeysInBatch.add(k));
        deduplicatedList.push(item);
      }

      // Nếu đã khởi tạo ban đầu, kiểm tra xem có tin mới xuất hiện không
      if (isInitializedRef.current) {
        const nowMs = Date.now();
        for (const item of deduplicatedList) {
          if (hasSeenNotification(item)) continue;
          const createdMs = item.createdAt ? new Date(item.createdAt).getTime() : nowMs;
          const isFresh = Number.isNaN(createdMs) || nowMs - createdMs <= FRESH_POLL_MAX_AGE_MS;
          if (isFresh) {
            processIncomingAlert(item);
          } else {
            // Thông báo cũ đồng bộ lại khi mở/chuyển trạng thái app -> chỉ đánh dấu đã xem, không reo lại
            markSeenNotification(item);
          }
        }
      } else {
        // Đánh dấu các tin cũ đã xem để không reo chuông khi vừa mở app
        for (const item of deduplicatedList) {
          markSeenNotification(item);
        }
        isInitializedRef.current = true;
      }

      setNotifications(deduplicatedList);
    } catch (err) {
      // Giữ kết nối ngầm ổn định, không gián đoạn giao diện
    }
  }, [processIncomingAlert, hasSeenNotification, markSeenNotification]);

  // Khởi tạo đăng ký push token và đồng bộ thông báo từ push khi app đang mở.
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => { });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        registerForPushNotificationsAsync().catch(() => { });
        syncNotifications();
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, any>;
      // Tránh lặp vô tận nếu thông báo nhận được do chính app vừa phát cục bộ (Local Notification)
      if (data.isLocalTrigger) {
        return;
      }
      const item: NotificationItem = {
        _id: String(data.notificationId || data.broadcastId || notification.request.identifier),
        title: content.title || data.title || '🚨 LỆNH ĐIỀU ĐỘNG CỨU HỘ MỚI',
        content: String(content.body || data.content || data.body || ''),
        type: String(data.type || 'ALERT'),
        priority: String(data.priority || 'CRITICAL'),
        areaId: data.areaId,
        areaName: data.areaName,
        data,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // Chỉ đánh dấu đã hiển thị khi thông báo ứng dụng & nhóm thông báo đang BẬT
      const category = classifyNotification(item);
      if (settingsRef.current.appEnabled !== false && settingsRef.current[category] !== false) {
        markNotificationPresented(item);
        const persistentKeys = extractPersistentDedupeKeys(item);
        const triggerKeys =
          persistentKeys.length > 0 ? persistentKeys : extractNotificationDedupeKeys(item);
        triggerKeys.forEach((k) => triggeredPushKeysRef.current.add(k));
      }

      processIncomingAlert(item, true);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      syncNotifications();
      const notifContent = response?.notification?.request?.content;
      const notifData = notifContent?.data as Record<string, any> | undefined;
      if (
        notifData?.type === 'SAFETY_CHECK' ||
        notifData?.actionUrl === 'safety_check' ||
        notifData?.isSafetyCheck
      ) {
        navigateHandlerRef.current?.('home');
        setTimeout(() => {
          DeviceEventEmitter.emit('open:safety_check', notifData);
        }, 350);
      } else if (
        notifData?.type === 'BLOOD_DONATION' ||
        notifData?.actionUrl === 'blood_donation' ||
        notifData?.isBloodDonation
      ) {
        navigateHandlerRef.current?.('home');
        setTimeout(() => {
          DeviceEventEmitter.emit('open:blood_donation', notifData);
        }, 350);
      } else if (
        notifData?.type === 'CHAT' ||
        notifData?.actionUrl === 'chat' ||
        notifData?.isChat
      ) {
        navigateHandlerRef.current?.('home');
        setTimeout(() => {
          DeviceEventEmitter.emit('open:local_authority_chat', notifData);
        }, 350);
      } else if (notifData?.type === 'SOS_SYNC' || notifData?.action === 'ASSIGNED' || notifData?.assignmentId || notifData?.sosId) {
        navigateHandlerRef.current?.('sos');
      } else if (
        isWeatherNotification({
          _id: String(notifData?.notificationId || ''),
          title: String(notifContent?.title || notifData?.title || ''),
          content: String(notifContent?.body || notifData?.content || notifData?.body || ''),
          type: String(notifData?.type || ''),
          data: notifData,
          isRead: false,
          createdAt: new Date().toISOString(),
        })
      ) {
        navigateHandlerRef.current?.('news');
      } else {
        navigateHandlerRef.current?.('notifications');
      }
    });

    AsyncStorage.getItem(SEEN_NOTIFICATIONS_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) parsed.forEach((id) => seenIdsRef.current.add(id));
      } catch (_) { }
    });

    return () => {
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
      pendingFallbackTimersRef.current.forEach((t) => clearTimeout(t));
      pendingFallbackTimersRef.current.clear();
    };
  }, [user?._id, processIncomingAlert, syncNotifications]);

  // Nạp dữ liệu ban đầu khi mount
  useEffect(() => {
    syncNotifications();
  }, [syncNotifications]);

  // Đồng bộ dự phòng khi SSE tạm mất kết nối.
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      if (!isMounted) return;
      try {
        await syncNotifications();
      } catch (_) { }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [syncNotifications]);

  // Quản lý kết nối SSE Realtime Stream
  useEffect(() => {
    const userAreaId = (user as any)?.citizen?.areaId || (user as any)?.areaId;
    sseNotificationService.connect(user?._id, userAreaId);

    const unsubConnection = sseNotificationService.onConnectionChange((connected) => {
      setIsRealtimeConnected(connected);
    });

    const unsubNotification = sseNotificationService.onNotification((item) => {
      processIncomingAlert(item);
    });

    return () => {
      unsubConnection();
      unsubNotification();
      sseNotificationService.disconnect();
    };
  }, [user?._id, (user as any)?.citizen?.areaId, (user as any)?.areaId, processIncomingAlert]);



  const dismissEmergencyAlert = useCallback(() => {
    setLatestEmergencyAlert(null);
  }, []);

  const refreshNotifications = useCallback(async () => {
    await syncNotifications();
  }, [syncNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
    );
    try {
      await backendApi.markNotificationAsRead(id);
    } catch (_) { }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await backendApi.markAllNotificationsAsRead();
    } catch (_) { }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n._id !== id));
    try {
      await backendApi.deleteNotification(id);
    } catch (_) { }
  }, []);

  const setNavigateHandler = useCallback((fn: (tab: string) => void) => {
    navigateHandlerRef.current = fn;
  }, []);

  // Hộp chuông thông báo chỉ hiển thị các thông báo phi thời tiết
  // (bài viết thời tiết được hiển thị riêng tại tab Tin tức)
  const bellNotifications = useMemo(
    () => notifications.filter((n) => !isWeatherNotification(n)),
    [notifications]
  );

  // Chỉ tính số lượng chưa đọc của các nhóm thông báo người dùng ĐANG BẬT trong chuông
  const unreadCount = useMemo(() => {
    if (settings.appEnabled === false) return 0;
    return bellNotifications.filter((n) => {
      if (n.isRead) return false;
      const cat = classifyNotification(n);
      return settings[cat] !== false;
    }).length;
  }, [bellNotifications, settings]);

  const instantUnreadCount = useMemo(() => {
    if (settings.appEnabled === false) return 0;
    return bellNotifications.filter(
      (n) => isInstantType(n.type) && !n.isRead && settings[classifyNotification(n)] !== false
    ).length;
  }, [bellNotifications, settings]);

  const systemUnreadCount = useMemo(() => {
    if (settings.appEnabled === false) return 0;
    return bellNotifications.filter(
      (n) => isSystemType(n.type) && !n.isRead && settings[classifyNotification(n)] !== false
    ).length;
  }, [bellNotifications, settings]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: bellNotifications,
        unreadCount,
        instantUnreadCount,
        systemUnreadCount,
        latestEmergencyAlert,
        settings,
        updateSetting,
        resetSettings,
        testNotification,
        dismissEmergencyAlert,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        setNavigateHandler,
        isSocketConnected: isRealtimeConnected,
        isRealtimeConnected,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Vibration, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { backendApi, NotificationItem } from '@/api';
import {
  registerForPushNotificationsAsync,
  triggerLocalNotification,
  sseNotificationService,
} from '@/services';
import {
  NotificationSettings,
  NotificationCategoryKey,
  classifyNotification,
  getSavedNotificationSettings,
  saveNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '@/utils';
import { useAuth } from './AuthContext';

const SEEN_NOTIFICATIONS_STORAGE_KEY = 'sos_seen_notification_ids_v1';

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
  const isInitializedRef = useRef<boolean>(false);
  const navigateHandlerRef = useRef<((tab: string) => void) | null>(null);

  // Luôn đồng bộ settingsRef với settings state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Nạp cài đặt người dùng từ storage khi khởi tạo
  useEffect(() => {
    getSavedNotificationSettings().then((saved) => {
      setSettings(saved);
      settingsRef.current = saved;
    });
  }, []);

  const updateSetting = useCallback(async (key: keyof NotificationSettings, value: boolean) => {
    setSettings((prev: NotificationSettings) => {
      const next = { ...prev, [key]: value };
      settingsRef.current = next;
      saveNotificationSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    settingsRef.current = DEFAULT_NOTIFICATION_SETTINGS;
    await saveNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
  }, []);

  const testNotification = useCallback(async (category: NotificationCategoryKey = 'alert'): Promise<boolean> => {
    const current = settingsRef.current;
    if (current[category] === false) {
      return false; // Nhóm này đang bị tắt
    }

    const testItem: NotificationItem = {
      _id: 'test-' + Date.now(),
      type:
        category === 'alert'
          ? 'ALERT'
          : category === 'safeLocation'
          ? 'SAFE_LOCATION'
          : category === 'news'
          ? 'WEATHER'
          : 'SYSTEM',
      priority: category === 'alert' ? 'CRITICAL' : 'HIGH',
      title:
        category === 'alert'
          ? '🚨 [Thử nghiệm] Cảnh báo khẩn cấp SOS'
          : category === 'safeLocation'
          ? '🛡️ [Thử nghiệm] Điểm an toàn mới'
          : category === 'news'
          ? '📰 [Thử nghiệm] Bản tin dự báo thời tiết'
          : '🔔 [Thử nghiệm] Thông báo cập nhật hệ thống',
      content:
        'Đây là thông báo thử nghiệm để xác nhận chuông, rung và cài đặt của bạn đang hoạt động thật.',
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    // 1. Rung nếu bật
    if (current.vibration) {
      try {
        Vibration.vibrate(category === 'alert' ? [0, 400, 200, 400] : 300);
      } catch (_) {}
    }

    // 2. Kích hoạt Local Notification hiển thị ra ngoài hệ điều hành (thanh trạng thái / màn hình khóa)
    triggerLocalNotification({
      title: testItem.title,
      body: testItem.content,
      priority: testItem.priority,
      data: {
        notificationId: testItem._id,
        type: testItem.type,
        isLocalTrigger: true,
      },
    }).catch(() => {});

    // 3. Hiển thị Banner cảnh báo nổi trong app
    setLatestEmergencyAlert(testItem);
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

  // Xử lý thông báo đến tức thời (kích hoạt banner, chuông, rung)
  const processIncomingAlert = useCallback(async (incoming: NotificationItem) => {
    const broadcastKey =
      incoming.data?.broadcastId ||
      `${incoming.title?.trim()}_${incoming.content?.trim()}_${incoming.createdAt?.slice(0, 16)}`;

    // Bỏ qua nếu đã từng hiển thị thông báo này
    if (
      seenIdsRef.current.has(incoming._id) ||
      (incoming.data?.broadcastId && seenIdsRef.current.has(incoming.data.broadcastId)) ||
      seenIdsRef.current.has(broadcastKey)
    ) {
      return;
    }

    seenIdsRef.current.add(incoming._id);
    if (incoming.data?.broadcastId) {
      seenIdsRef.current.add(incoming.data.broadcastId);
    }
    seenIdsRef.current.add(broadcastKey);

    // Lưu lại bộ nhớ đã thấy
    const idsArray = Array.from(seenIdsRef.current).slice(-100);
    AsyncStorage.setItem(SEEN_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(idsArray)).catch(() => {});

    if (incoming.data?.type === 'SOS_SYNC' || incoming.data?.type === 'RESCUE' || incoming.data?.sosId) {
      DeviceEventEmitter.emit('sos:sync');
    }

    // 1. Chèn thông báo mới vào danh sách
    setNotifications((prev) => {
      const isExisted = prev.some(
        (n) =>
          n._id === incoming._id ||
          (incoming.data?.broadcastId && n.data?.broadcastId === incoming.data.broadcastId)
      );
      if (isExisted) return prev;
      return [incoming, ...prev];
    });

    // 2. Phân loại thông báo và kiểm tra Cài đặt của người dùng
    const category = classifyNotification(incoming);
    const currentSettings = settingsRef.current;

    // NẾU NGƯỜI DÙNG ĐÃ TẮT NHÓM THÔNG BÁO NÀY:
    // Bỏ qua hoàn toàn rung, âm thanh và banner cảnh báo khẩn cấp nổi!
    if (!currentSettings[category]) {
      console.log(`ℹ️ [NotificationContext] Bỏ qua cảnh báo cho nhóm '${category}' vì người dùng đã tắt.`);
      return;
    }

    // 3. Phản hồi thiết bị: Rung (nếu bật vibration)
    if (currentSettings.vibration) {
      try {
        if (incoming.priority === 'CRITICAL' || incoming.type === 'INSTANT' || category === 'alert') {
          Vibration.vibrate([0, 500, 200, 500]);
        } else {
          Vibration.vibrate(300);
        }
      } catch (_) {}
    }

    // 4. Kích hoạt thông báo hệ thống ra ngoài màn hình máy (Status bar & Lock screen)
    triggerLocalNotification({
      title: incoming.title,
      body: incoming.content,
      priority: incoming.priority,
      data: {
        notificationId: incoming._id,
        type: incoming.type,
        areaId: incoming.areaId,
        areaName: incoming.areaName,
        isLocalTrigger: true,
      },
    }).catch(() => {});

    // 5. Hiển thị Banner cảnh báo khẩn cấp nổi trong app
    setLatestEmergencyAlert(incoming);
  }, []);

  // Tải danh sách thông báo và đối chiếu tin mới
  const syncNotifications = useCallback(async () => {
    try {
      const res = await backendApi.getNotifications({ limit: 40 });
      if (!res.success || !Array.isArray(res.data)) {
        return;
      }

      // Khử trùng lặp danh sách thông báo trả về (Deduplicate)
      const deduplicatedList: NotificationItem[] = [];
      const seenBroadcastKeys = new Set<string>();

      for (const item of res.data) {
        const broadcastKey =
          item.data?.broadcastId ||
          `${item.title?.trim()}_${item.content?.trim()}_${item.createdAt?.slice(0, 16)}`;

        if (seenBroadcastKeys.has(broadcastKey)) {
          continue; // Bỏ qua nếu trùng nội dung / đợt broadcast
        }
        seenBroadcastKeys.add(broadcastKey);
        deduplicatedList.push(item);
      }

      // Nếu đã khởi tạo ban đầu, kiểm tra xem có tin mới xuất hiện không
      if (isInitializedRef.current) {
        for (const item of deduplicatedList) {
          const broadcastKey =
            item.data?.broadcastId ||
            `${item.title?.trim()}_${item.content?.trim()}_${item.createdAt?.slice(0, 16)}`;

          if (!seenIdsRef.current.has(item._id) && !seenIdsRef.current.has(broadcastKey)) {
            processIncomingAlert(item);
          }
        }
      } else {
        // Đánh dấu các tin cũ đã xem để không reo chuông khi vừa mở app
        for (const item of deduplicatedList) {
          seenIdsRef.current.add(item._id);
          if (item.data?.broadcastId) {
            seenIdsRef.current.add(item.data.broadcastId);
          }
        }
        isInitializedRef.current = true;
      }

      setNotifications(deduplicatedList);
    } catch (err) {
      // Giữ kết nối ngầm ổn định, không gián đoạn giao diện
    }
  }, [processIncomingAlert]);

  // Khởi tạo đăng ký push token và đồng bộ thông báo từ push khi app đang mở.
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, any>;
      // Tránh lặp vô tận nếu thông báo nhận được do chính app vừa phát cục bộ (Local Notification)
      if (data.isLocalTrigger) {
        return;
      }
      const item: NotificationItem = {
        _id: String(data.notificationId || data.broadcastId || notification.request.identifier),
        title: content.title || 'Thông báo mới',
        content: String(data.content || content.body || ''),
        type: String(data.type || 'SYSTEM'),
        priority: String(data.priority || 'NORMAL'),
        areaId: data.areaId,
        areaName: data.areaName,
        data,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      processIncomingAlert(item);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      syncNotifications();
      navigateHandlerRef.current?.('news');
    });

    AsyncStorage.getItem(SEEN_NOTIFICATIONS_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) parsed.forEach((id) => seenIdsRef.current.add(id));
      } catch (_) {}
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
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
      } catch (_) {}
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
    } catch (_) {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await backendApi.markAllNotificationsAsRead();
    } catch (_) {}
  }, []);

  const setNavigateHandler = useCallback((fn: (tab: string) => void) => {
    navigateHandlerRef.current = fn;
  }, []);

  // Chỉ tính số lượng chưa đọc của các nhóm thông báo người dùng ĐANG BẬT
  const unreadCount = notifications.filter((n) => {
    if (n.isRead) return false;
    const cat = classifyNotification(n);
    return settings[cat] !== false;
  }).length;

  const instantUnreadCount = notifications.filter(
    (n) => isInstantType(n.type) && !n.isRead && settings[classifyNotification(n)] !== false
  ).length;

  const systemUnreadCount = notifications.filter(
    (n) => isSystemType(n.type) && !n.isRead && settings[classifyNotification(n)] !== false
  ).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
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

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { backendApi, NotificationItem } from '../services/backendApi';
import {
  registerForPushNotificationsAsync,
  triggerLocalNotification,
} from '../services/pushNotificationService';
import { sseNotificationService } from '../services/sseNotificationService';
import { useAuth } from './AuthContext';

const SEEN_NOTIFICATIONS_STORAGE_KEY = 'sos_seen_notification_ids_v1';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  instantUnreadCount: number;
  systemUnreadCount: number;
  latestEmergencyAlert: NotificationItem | null;
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
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef<boolean>(false);
  const navigateHandlerRef = useRef<((tab: string) => void) | null>(null);

  const isInstantType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'INSTANT' || t === 'TIN_TUC_THOI' || t === 'ALERT' || t === 'WEATHER' || t === 'RESCUE';
  };

  const isSystemType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'SYSTEM' || t === 'THONG_BAO_HE_THONG';
  };

  // Khởi tạo đăng ký kênh Push Notifications và nạp danh sách IDs đã xem
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token && user?._id) {
        backendApi.registerPushToken(token).catch(() => {});
      }
    }).catch(() => {});

    // Lắng nghe người dùng bấm vào thông báo ngoài thanh Notification bar của điện thoại
    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigateHandlerRef.current) {
        navigateHandlerRef.current('news');
      }
    });

    // Nạp các ID thông báo đã ghi nhận từ bộ nhớ để tránh spam chuông lại khi vừa mở app
    AsyncStorage.getItem(SEEN_NOTIFICATIONS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((id) => seenIdsRef.current.add(id));
          }
        } catch (_) {}
      }
    });

    return () => {
      responseSub.remove();
    };
  }, [user?._id]);

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

    // 1. Chèn thông báo mới vào đầu danh sách ngay lập tức
    setNotifications((prev) => {
      const isExisted = prev.some(
        (n) =>
          n._id === incoming._id ||
          (incoming.data?.broadcastId && n.data?.broadcastId === incoming.data.broadcastId)
      );
      if (isExisted) return prev;
      return [incoming, ...prev];
    });

    // 2. Kích hoạt thông báo trên thanh trạng thái điện thoại (Heads-up Notification Banner + Chuông)
    await triggerLocalNotification({
      title: incoming.title,
      body: incoming.content,
      priority: incoming.priority as any,
      data: {
        notificationId: incoming._id,
        type: incoming.type,
        areaName: incoming.areaName,
      },
    });

    // 3. Rung điện thoại báo động
    try {
      if (incoming.priority === 'CRITICAL' || incoming.type === 'INSTANT') {
        Vibration.vibrate([0, 500, 200, 500]);
      } else {
        Vibration.vibrate(300);
      }
    } catch (_) {}

    // 4. Hiển thị Banner cảnh báo khẩn cấp nổi trong app
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

  // Nạp dữ liệu ban đầu khi mount
  useEffect(() => {
    syncNotifications();
  }, [syncNotifications]);

  // Vòng lặp đồng bộ ngầm 3 giây (giống hệt MapScreen) để đảm bảo 100% không bao giờ trễ
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      if (!isMounted) return;
      try {
        await syncNotifications();
      } catch (_) {}
    }, 3000);

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

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const instantUnreadCount = notifications.filter((n) => isInstantType(n.type) && !n.isRead).length;
  const systemUnreadCount = notifications.filter((n) => isSystemType(n.type) && !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        instantUnreadCount,
        systemUnreadCount,
        latestEmergencyAlert,
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

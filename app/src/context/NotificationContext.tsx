import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Vibration, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { backendApi, NotificationItem } from '@/api';
import {
  registerForPushNotificationsAsync,
  sseNotificationService,
} from '@/services';
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

    // Push của Expo hiển thị ở thanh hệ thống; SSE cập nhật giao diện trong app.
    // Không phát thêm local notification ở đây để tránh hiển thị hai banner.
    // Rung điện thoại báo động
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

  // Khởi tạo đăng ký push token và đồng bộ thông báo từ push khi app đang mở.
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = content.data as Record<string, any>;
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

import { DeviceEventEmitter } from 'react-native';
import { backendApi } from '@/api';
import { NotificationItem } from '@/types';

type NotificationListener = (item: NotificationItem) => void;
type ConnectionListener = (connected: boolean) => void;

class SSENotificationService {
  private xhr: XMLHttpRequest | null = null;
  private currentUrl: string | null = null;
  private currentUserId: string | null = null;
  private currentAreaId: string | null = null;
  private isConnectedState: boolean = false;
  private isManualDisconnect: boolean = false;
  private reconnectTimer: any = null;

  private notificationListeners: Set<NotificationListener> = new Set();
  private connectionListeners: Set<ConnectionListener> = new Set();

  /**
   * Khởi tạo kết nối SSE Stream tới máy chủ
   */
  async connect(userId?: string, areaId?: string) {
    if (userId) this.currentUserId = userId;
    if (areaId) this.currentAreaId = areaId;

    this.isManualDisconnect = false;

    // Hủy kết nối cũ trước khi mở kết nối mới
    this.cleanupCurrentConnection();

    try {
      const baseUrl = await backendApi.getBaseUrl();
      const params = new URLSearchParams();
      if (this.currentUserId) params.append('userId', this.currentUserId);
      if (this.currentAreaId) params.append('areaId', this.currentAreaId);

      const qStr = params.toString() ? `?${params.toString()}` : '';
      const streamUrl = `${baseUrl}/notifications/stream${qStr}`;
      this.currentUrl = streamUrl;

      console.log(`📡 [SSE_NOTIFICATION] Đang kết nối SSE Stream: ${streamUrl}`);

      const xhr = new XMLHttpRequest();
      this.xhr = xhr;
      xhr.open('GET', streamUrl, true);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');

      let lastIndex = 0;

      const processChunks = () => {
        if (this.xhr !== xhr) return;

        if (!this.isConnectedState) {
          this.isConnectedState = true;
          this.notifyConnectionState(true);
          console.log('✅ [SSE_NOTIFICATION] Kết nối SSE Stream thành công');
        }

        const text = xhr.responseText || '';
        if (text.length <= lastIndex) return;

        const newChunk = text.slice(lastIndex);
        lastIndex = text.length;

        const lines = newChunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            try {
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              const payload = JSON.parse(jsonStr);

              if (payload?.data?.type === 'SOS_SYNC') {
                console.log('⚡ [SSE_NOTIFICATION] Đồng bộ SOS realtime:', payload.data);
                DeviceEventEmitter.emit('sos:sync', payload.data);
              }

              if (payload && (payload.action === 'BROADCAST' || payload.action === 'USER')) {
                const item = this.normalizeNotification(payload.data);
                if (item.title || item.content) {
                  console.log(`📢 [SSE_NOTIFICATION] Nhận thông báo mới: "${item.title}"`);
                  this.notificationListeners.forEach((fn) => {
                    try {
                      fn(item);
                    } catch (e) {
                      console.error('Lỗi listener SSE notification:', e);
                    }
                  });
                }
              }
            } catch {
              // Dữ liệu heartbeat hoặc kết nối ban đầu
            }
          }
        }
      };

      xhr.onprogress = processChunks;
      xhr.onreadystatechange = () => {
        if (this.xhr !== xhr) return;
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          processChunks();
        }
      };

      xhr.onerror = () => {
        if (this.xhr !== xhr) return;
        console.warn('⚠️ [SSE_NOTIFICATION] Lỗi kết nối SSE');
        this.handleDisconnectAndReconnect();
      };

      xhr.onloadend = () => {
        if (this.xhr !== xhr) return;
        this.handleDisconnectAndReconnect();
      };

      xhr.send();
    } catch (err: any) {
      console.warn('⚠️ [SSE_NOTIFICATION] Không thể khởi tạo SSE:', err?.message);
      this.handleDisconnectAndReconnect();
    }
  }

  private handleDisconnectAndReconnect() {
    this.isConnectedState = false;
    this.notifyConnectionState(false);

    if (this.isManualDisconnect) return;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.currentUserId || undefined, this.currentAreaId || undefined);
    }, 4000);
  }

  private cleanupCurrentConnection() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.xhr) {
      try {
        this.xhr.abort();
      } catch (_) { }
      this.xhr = null;
    }
  }

  private normalizeNotification(data: any): NotificationItem {
    return {
      _id: data._id || data.id || `sse_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: data.title || 'Thông báo mới',
      content: data.content || '',
      type: data.type || 'INSTANT',
      priority: data.priority || 'NORMAL',
      areaId: data.areaId,
      areaName: data.areaName,
      createdBy: data.createdBy,
      data: data.data || {},
      isRead: false,
      createdAt: data.createdAt || new Date().toISOString(),
      actionUrl: data.actionUrl,
    };
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionListeners.forEach((fn) => {
      try {
        fn(connected);
      } catch (_) { }
    });
  }

  /**
   * Đăng ký lắng nghe sự kiện thông báo mới (cả Broadcast và Cá nhân)
   */
  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /**
   * Đăng ký lắng nghe trạng thái kết nối
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.isConnectedState);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  isConnected(): boolean {
    return this.isConnectedState;
  }

  updateContext(userId?: string, areaId?: string) {
    const changed = this.currentUserId !== (userId || null) || this.currentAreaId !== (areaId || null);
    this.currentUserId = userId || null;
    this.currentAreaId = areaId || null;
    if (changed) {
      this.connect(userId, areaId);
    }
  }

  disconnect() {
    this.isManualDisconnect = true;
    this.cleanupCurrentConnection();
    this.isConnectedState = false;
    this.notifyConnectionState(false);
  }
}

export const sseNotificationService = new SSENotificationService();

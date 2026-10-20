import { fetchWithAuth } from './client';

export interface BroadcastNotificationPayload {
  title: string;
  content: string;
  type: 'INSTANT' | 'SYSTEM' | 'WEATHER' | 'SAFE_LOCATION' | 'HAZARD' | string;
  areaId?: string;
  priority?: 'NORMAL' | 'HIGH' | 'CRITICAL' | string;
  imageUrl?: string;
  articleUrl?: string;
  sourceName?: string;
  data?: any;
}

export interface BroadcastItem {
  id: string;
  title: string;
  content: string;
  type: 'INSTANT' | 'SYSTEM' | string;
  priority?: string;
  imageUrl?: string;
  articleUrl?: string;
  sourceName?: string;
  areaName?: string;
  areaId?: string;
  createdBy?: {
    _id: string;
    fullName: string;
    phone?: string;
    roles?: string[];
  };
  createdAt: string;
  recipientsCount?: number;
}

export async function broadcastNotificationApi(
  payload: BroadcastNotificationPayload
): Promise<{ success: boolean; data: any; message?: string }> {
  return fetchWithAuth('/notifications/broadcast', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchBroadcastHistory(query?: {
  type?: string;
  areaId?: string;
}): Promise<{ success: boolean; data: BroadcastItem[] }> {
  const params = new URLSearchParams();
  if (query?.type) params.append('type', query.type);
  if (query?.areaId) params.append('areaId', query.areaId);
  const qStr = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/notifications/broadcasts${qStr}`, { method: 'GET' });
}

export async function deleteBroadcastApi(id: string): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/notifications/broadcasts/${id}`, { method: 'DELETE' });
}

/**
 * Đăng ký lắng nghe sự kiện Server-Sent Events (SSE) theo thời gian thực cho Thông báo & Cảnh báo khẩn cấp
 */
export function subscribeNotificationEvents(onEvent: (payload: { action: 'BROADCAST' | 'USER' | 'DELETED'; data?: any; broadcastId?: string }) => void): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource('/api/notifications/stream');
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && (payload.action === 'BROADCAST' || payload.action === 'USER' || payload.action === 'DELETED')) {
          onEvent(payload);
        }
      } catch (err) {
        console.warn('[SSE] Lỗi giải mã gói tin thông báo thời gian thực:', err);
      }
    };
    eventSource.onerror = () => {
      // EventSource tự động reconnect khi mất kết nối
    };
  } catch (err) {
    console.warn('[SSE] Không thể kết nối EventSource notifications:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}

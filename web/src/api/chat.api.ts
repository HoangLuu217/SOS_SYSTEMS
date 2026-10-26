import { fetchWithAuth, API_BASE } from './client';
import type { ChatMessageItem, ChatConversationItem, ChatSSEPayload } from '@/types/chat';

export async function fetchChatConversations(): Promise<{ success: boolean; data: ChatConversationItem[] }> {
  return fetchWithAuth<{ success: boolean; data: ChatConversationItem[] }>('/chat/conversations', {
    method: 'GET',
  });
}

export async function fetchChatMessages(params: { channel?: string; recipientId?: string }): Promise<{
  success: boolean;
  data: { channel: string; messages: ChatMessageItem[] };
}> {
  const query = new URLSearchParams();
  if (params.channel) query.set('channel', params.channel);
  if (params.recipientId) query.set('recipientId', params.recipientId);

  return fetchWithAuth(`/chat/messages?${query.toString()}`, {
    method: 'GET',
  });
}

export async function sendChatMessage(payload: {
  content: string;
  recipientId?: string;
  channel?: string;
}): Promise<{ success: boolean; data: ChatMessageItem }> {
  return fetchWithAuth('/chat/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function markChatMessagesRead(payload: {
  channel?: string;
  partnerId?: string;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth('/chat/read', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function markAllChatMessagesRead(): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth('/chat/read-all', {
    method: 'PATCH',
  });
}

/**
 * Đăng ký luồng tin nhắn thời gian thực (SSE) - Tự động cập nhật không cần F5
 */
export function subscribeChatRealtimeEvents(
  onEvent: (payload: ChatSSEPayload) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource(`${API_BASE}/chat/stream`, { withCredentials: true });
    eventSource.onopen = () => {
      if (onStatusChange) onStatusChange(true);
    };
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.action) {
          onEvent(payload as ChatSSEPayload);
        }
      } catch (err) {
        console.warn('[ChatSSE] Lỗi giải mã gói tin thời gian thực:', err);
      }
    };
    eventSource.onerror = () => {
      if (onStatusChange) onStatusChange(false);
      // EventSource tự động reconnect khi đường truyền chập chờn
    };
  } catch (err) {
    if (onStatusChange) onStatusChange(false);
    console.warn('[ChatSSE] Không thể kết nối EventSource:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

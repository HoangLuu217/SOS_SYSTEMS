import { io, Socket } from 'socket.io-client';
import type { ChatMessageItem, ChatSSEPayload } from '../types/chat';

let socket: Socket | null = null;

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');

/**
 * Khởi tạo hoặc lấy kết nối Socket.IO (Singleton)
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Lỗi kết nối máy chủ:', err.message);
    });
  }

  return socket;
}

/**
 * Tham gia vào phòng chat của một kênh
 */
export function joinChannelRoom(channel: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('join_channel', channel);
  } else {
    s.once('connect', () => {
      s.emit('join_channel', channel);
    });
  }
}

/**
 * Rời khỏi phòng chat của một kênh
 */
export function leaveChannelRoom(channel: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('leave_channel', channel);
  }
}

/**
 * Đăng ký ID người dùng để nhận tin nhắn trực tiếp
 */
export function registerUserSocket(userId: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('register_user', userId);
  } else {
    s.once('connect', () => {
      s.emit('register_user', userId);
    });
  }
}

/**
 * Lắng nghe tin nhắn mới qua Socket.IO
 */
export function subscribeSocketChatEvents(
  onEvent: (payload: ChatSSEPayload) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  const s = getSocket();

  const handleConnect = () => {
    if (onStatusChange) onStatusChange(true);
  };

  const handleDisconnect = () => {
    if (onStatusChange) onStatusChange(false);
  };

  const handleConnectError = () => {
    if (onStatusChange) onStatusChange(false);
  };

  const handleChatEvent = (payload: ChatSSEPayload) => {
    if (payload && payload.action) {
      onEvent(payload);
    }
  };

  const handleNewMessage = (msg: ChatMessageItem) => {
    if (msg) {
      onEvent({
        action: 'NEW_MESSAGE',
        data: msg,
      });
    }
  };

  s.on('connect', handleConnect);
  s.on('disconnect', handleDisconnect);
  s.on('connect_error', handleConnectError);
  s.on('chat_event', handleChatEvent);
  s.on('new_message', handleNewMessage);

  // Cập nhật trạng thái kết nối tức thời
  if (onStatusChange) {
    onStatusChange(s.connected);
  }

  return () => {
    s.off('connect', handleConnect);
    s.off('disconnect', handleDisconnect);
    s.off('connect_error', handleConnectError);
    s.off('chat_event', handleChatEvent);
    s.off('new_message', handleNewMessage);
  };
}

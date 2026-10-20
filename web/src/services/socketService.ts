import { io, Socket } from 'socket.io-client';
import type { ChatMessageItem, ChatSSEPayload } from '@/types/chat';

let socket: Socket | null = null;

const getSocketUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.port === '5173'
      ? `http://${window.location.hostname}:5000`
      : window.location.origin;
  }
  return 'http://127.0.0.1:5000';
};

/**
 * Khởi tạo hoặc lấy kết nối Socket.IO duy nhất (Singleton) tới Backend
 */
export const getSocket = (): Socket => {
  if (!socket) {
    const socketUrl = getSocketUrl();

    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('⚡ [Socket.IO Web] Đã kết nối thành công tới máy chủ Realtime:', socket?.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [Socket.IO Web] Lỗi kết nối Socket:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [Socket.IO Web] Đã ngắt kết nối:', reason);
    });
  }

  return socket;
};

// ==========================================
// 1. CÁC HÀM XỬ LÝ SỰ KIỆN CỨU NẠN SOS
// ==========================================

/**
 * Đăng ký lắng nghe sự kiện có yêu cầu SOS mới gửi lên
 * @param callback Callback nhận dữ liệu SOS từ Backend
 * @returns Hàm hủy lắng nghe (cleanup)
 */
export const onSosCreated = (callback: (newSos: any) => void): (() => void) => {
  const s = getSocket();
  const handler = (data: any) => {
    console.log('🚨 [Socket.IO Web] Nhận tín hiệu SOS mới Realtime:', data);
    callback(data);
  };

  s.on('sos:created', handler);
  s.on('sos:new', handler);

  return () => {
    s.off('sos:created', handler);
    s.off('sos:new', handler);
  };
};

/**
 * Đăng ký lắng nghe sự kiện cập nhật trạng thái SOS (xác minh, điều phối, hoàn thành)
 * @param callback Callback nhận dữ liệu SOS cập nhật
 * @returns Hàm hủy lắng nghe (cleanup)
 */
export const onSosUpdated = (callback: (updatedSos: any) => void): (() => void) => {
  const s = getSocket();
  let lastEventTime = 0;
  let lastEventSignature = '';

  const handler = (data: any) => {
    const id = data?._id || data?.sosCode || '';
    const status = data?.status || '';
    const signature = `${id}-${status}`;
    const now = Date.now();

    // Chống trùng lặp do backend phát đồng thời cả 'sos:updated' và 'sos:status_changed'
    if (signature && signature === lastEventSignature && now - lastEventTime < 1000) {
      return;
    }
    lastEventSignature = signature;
    lastEventTime = now;

    console.log('🔄 [Socket.IO Web] Nhận tín hiệu cập nhật SOS Realtime:', data);
    callback(data);
  };

  s.on('sos:updated', handler);
  s.on('sos:status_changed', handler);

  return () => {
    s.off('sos:updated', handler);
    s.off('sos:status_changed', handler);
  };
};

/**
 * Đăng ký lắng nghe sự kiện có hồ sơ đăng ký Cứu hộ viên mới gửi lên
 * @param callback Callback nhận dữ liệu người đăng ký mới từ Backend
 * @returns Hàm hủy lắng nghe (cleanup)
 */
export const onRescuerApplicationSubmitted = (callback: (newApplicant: any) => void): (() => void) => {
  const s = getSocket();
  const handler = (data: any) => {
    console.log('📝 [Socket.IO Web] Nhận hồ sơ cứu hộ mới Realtime:', data);
    callback(data);
  };

  s.on('rescuer:application_submitted', handler);
  s.on('rescuer:pending_updated', handler);

  return () => {
    s.off('rescuer:application_submitted', handler);
    s.off('rescuer:pending_updated', handler);
  };
};

/**
 * Đăng ký lắng nghe sự kiện trạng thái cứu hộ viên thay đổi (phê duyệt / từ chối)
 * @param callback Callback nhận dữ liệu cập nhật
 * @returns Hàm hủy lắng nghe (cleanup)
 */
export const onRescuerVerificationChanged = (callback: (data: any) => void): (() => void) => {
  const s = getSocket();
  const handler = (data: any) => {
    console.log('✅ [Socket.IO Web] Trạng thái cứu hộ viên thay đổi Realtime:', data);
    callback(data);
  };

  s.on('rescuer:verification_status_changed', handler);
  s.on('rescuer:verified', handler);

  return () => {
    s.off('rescuer:verification_status_changed', handler);
    s.off('rescuer:verified', handler);
  };
};

// ==========================================
// 2. CÁC HÀM XỬ LÝ CHAT TÁC CHIẾN NỘI BỘ
// ==========================================

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

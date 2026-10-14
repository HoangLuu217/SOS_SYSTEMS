import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Lấy hoặc khởi tạo kết nối Socket.IO tới Backend
 */
export const getSocket = (): Socket => {
  if (!socket) {
    // Kết nối thông qua Vite proxy hoặc trực tiếp backend port 5000
    const socketUrl =
      typeof window !== 'undefined'
        ? window.location.port === '5173'
          ? `http://${window.location.hostname}:5000`
          : window.location.origin
        : 'http://127.0.0.1:5000';

    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
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
  const handler = (data: any) => {
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

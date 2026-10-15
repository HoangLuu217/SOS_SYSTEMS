const { Server } = require('socket.io');

let io = null;

/**
 * Khởi tạo Socket.IO gắn vào HTTP Server
 * @param {import('http').Server} httpServer
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Hỗ trợ kết nối từ Web (localhost:5173), Mobile App (Expo) và LAN
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`🔌 [Socket.IO] Thiết bị kết nối mới: ${socket.id}`);

    // Cho phép client join vào room khu vực (nếu có lọc theo xã/phường)
    socket.on('join:area', (areaId) => {
      if (areaId) {
        socket.join(`area:${areaId}`);
        console.log(`📍 [Socket.IO] Client ${socket.id} gia nhập room area:${areaId}`);
      }
    });

    socket.on('leave:area', (areaId) => {
      if (areaId) {
        socket.leave(`area:${areaId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.IO] Client ngắt kết nối: ${socket.id} (Lý do: ${reason})`);
    });
  });

  return io;
};

/**
 * Lấy instance Socket.IO hiện tại để emit sự kiện ở bất kỳ Controller nào
 * @returns {import('socket.io').Server | null}
 */
const getIO = () => {
  if (!io) {
    console.warn('⚠️ [Socket.IO] getIO() được gọi trước khi khởi tạo Socket Server!');
  }
  return io;
};

/**
 * Helper: Phát sự kiện có yêu cầu SOS mới được tạo từ người dân
 * @param {Object} sosData
 */
const emitSosCreated = (sosData) => {
  if (!io) return;
  // Phát toàn hệ thống cho Admin & Cán bộ
  io.emit('sos:created', sosData);
  io.emit('sos:new', sosData);

  // Nếu có areaId, phát riêng cho room khu vực đó
  if (sosData.areaId) {
    const areaKey = typeof sosData.areaId === 'object' ? sosData.areaId._id : sosData.areaId;
    io.to(`area:${areaKey}`).emit('sos:area:created', sosData);
  }
  console.log(`📢 [Socket.IO] Đã phát sự kiện SOS mới: ${sosData.sosCode || sosData._id}`);
};

/**
 * Helper: Phát sự kiện cập nhật trạng thái SOS (xác minh, điều phối, hoàn thành)
 * @param {Object} sosData
 */
const emitSosUpdated = (sosData) => {
  if (!io) return;
  io.emit('sos:updated', sosData);
  io.emit('sos:status_changed', sosData);
  console.log(`📢 [Socket.IO] Đã phát sự kiện cập nhật SOS: ${sosData.sosCode || sosData._id} -> Trạng thái: ${sosData.status}`);
};

module.exports = {
  initSocket,
  getIO,
  emitSosCreated,
  emitSosUpdated,
};

const { Server } = require('socket.io');

let io = null;

/**
 * Khởi tạo Socket.IO Server gắn vào HTTP Server
 * @param {import('http').Server} httpServer
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Hỗ trợ kết nối từ Web, Mobile App và LAN
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`🔌 [Socket.IO] Thiết bị kết nối mới: ${socket.id}`);

    // Cán bộ / Admin tham gia phòng chat theo kênh
    socket.on('join_channel', (channel) => {
      if (channel) {
        socket.join(channel);
      }
    });

    socket.on('leave_channel', (channel) => {
      if (channel) {
        socket.leave(channel);
      }
    });

    // Định danh người dùng để nhận tin nhắn trực tiếp
    socket.on('register_user', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

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

    // Cập nhật vị trí GPS cứu hộ viên thời gian thực (Telemetry)
    socket.on('rescuer:location_update', (data) => {
      if (data) {
        io.emit('rescuer:location_update', data);
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

  try {
    const eventBus = require('./services/eventBus');
    const citizenId = sosData.citizenId?._id || sosData.citizenId;
    if (citizenId) {
      eventBus.emit('notification_event', {
        action: 'USER',
        userId: citizenId.toString(),
        data: {
          type: 'SOS_SYNC',
          action: 'CREATED',
          sosId: sosData._id,
          sosCode: sosData.sosCode,
          status: sosData.status,
        },
      });
    }
  } catch (err) {}
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

  try {
    const eventBus = require('./services/eventBus');
    const citizenId = sosData.citizenId?._id || sosData.citizenId;
    if (citizenId) {
      eventBus.emit('notification_event', {
        action: 'USER',
        userId: citizenId.toString(),
        data: {
          type: 'SOS_SYNC',
          action: 'UPDATED',
          sosId: sosData._id,
          sosCode: sosData.sosCode,
          status: sosData.status,
        },
      });
    }
  } catch (err) {}
};

module.exports = {
  initSocket,
  getIO,
  emitSosCreated,
  emitSosUpdated,
};

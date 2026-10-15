const { Server } = require('socket.io');

let io = null;

/**
 * Khởi tạo Socket.IO Server
 * @param {import('http').Server} httpServer
 */
function initSocket(httpServer) {
  const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:8081',
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          return callback(null, true);
        }
        return callback(null, true); // Chấp nhận kết nối trong môi trường phát triển
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
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

    socket.on('disconnect', () => {
      // Socket.IO tự động dọn dẹp các rooms khi ngắt kết nối
    });
  });

  return io;
}

/**
 * Lấy đối tượng Socket.IO hiện tại
 */
function getIO() {
  return io;
}

module.exports = { initSocket, getIO };

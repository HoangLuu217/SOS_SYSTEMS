require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(' Kết nối MongoDB thành công');

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (hỗ trợ Realtime Socket.IO & REST)`);
      console.log(`📡 SSE Realtime Stream sẵn sàng tại /api/notifications/stream`);
    });
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

startServer();

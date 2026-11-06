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



    // Tiến trình tự động dọn dẹp các bản tin thời tiết pending cũ quá 2 ngày
    const weatherNotificationService = require('./services/weatherNotification.service');
    setTimeout(() => {
      weatherNotificationService.cleanupExpiredPendingArticles(2).catch((err) => {
        console.warn('Lỗi dọn dẹp bản tin thời tiết cũ khi khởi động:', err.message);
      });
    }, 5000);

    setInterval(() => {
      weatherNotificationService.cleanupExpiredPendingArticles(2).catch((err) => {
        console.warn('Lỗi định kỳ dọn dẹp bản tin thời tiết cũ:', err.message);
      });
    }, 60 * 60 * 1000); // Mỗi 1 giờ kiểm tra và dọn dẹp 1 lần

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (hỗ trợ Realtime Socket.IO & REST)`);
      console.log(`📡 SSE Realtime Stream sẵn sàng tại /api/notifications/stream`);
      console.log(`🧹 Auto-cleanup: Bản tin pending quá 2 ngày sẽ tự động được dọn dẹp định kỳ.`);
    });
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

startServer();

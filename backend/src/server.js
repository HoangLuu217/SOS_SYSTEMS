require('dotenv').config();
const dns = require('dns');
// Tự động phân giải DNS qua Google DNS & Cloudflare khi chạy cục bộ để tránh lỗi querySrv ECONNREFUSED
if (!process.env.RENDER && !process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (e) {
    // Bỏ qua nếu môi trường không cho phép
  }
}

const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    console.log(' Kết nối MongoDB thành công');

    // Tự động chuẩn hóa các mã SOS cũ dài hơn 9 ký tự về 8 ký tự (SOS-XXXX)
    try {
      const SosRequest = require('./models/SosRequest');
      const longSosList = await SosRequest.find({ sosCode: { $regex: /^SOS-[A-Za-z0-9]{5,}/ } });
      for (const item of longSosList) {
        const parts = item.sosCode.split('-');
        const suffix = parts[parts.length - 1];
        const newCode = `SOS-${suffix.toUpperCase()}`;
        const exists = await SosRequest.findOne({ sosCode: newCode, _id: { $ne: item._id } });
        const finalCode = exists ? `SOS-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : newCode;
        await SosRequest.updateOne({ _id: item._id }, { $set: { sosCode: finalCode } });
        console.log(`🔄 [Migration] Đã rút gọn mã SOS: ${item.sosCode} -> ${finalCode}`);
      }
    } catch (migErr) {
      console.warn('⚠️ Lỗi migration mã SOS:', migErr.message);
    }

    // Tiến trình tự động dọn dẹp các bản tin thời tiết cũ và bài lưu trữ quá 2 ngày (chạy tự động không nút nhấn)
    const weatherNotificationService = require('./services/weatherNotification.service');
    setTimeout(() => {
      weatherNotificationService.cleanupExpiredWeatherArticles(2).catch((err) => {
        console.warn('⚠️ Lỗi dọn dẹp bản tin thời tiết cũ khi khởi động:', err.message);
      });
    }, 5000);

    // Chạy ngầm định kỳ mỗi 30 phút để quét và xóa vĩnh viễn các bài lưu trữ & tin pending quá 2 ngày
    setInterval(() => {
      weatherNotificationService.cleanupExpiredWeatherArticles(2).catch((err) => {
        console.warn('⚠️ Lỗi định kỳ dọn dẹp bản tin thời tiết cũ & lưu trữ:', err.message);
      });
    }, 30 * 60 * 1000);

    // Tiến trình tự động gửi thông báo nhắc nhở hiến máu cho người dân đã đăng ký (cách 1 ngày & sắp đến giờ)
    const bloodDonationService = require('./services/bloodDonation.service');
    setTimeout(() => {
      bloodDonationService.sendScheduledReminders().catch((err) => {
        console.warn('⚠️ Lỗi kiểm tra thông báo nhắc nhở hiến máu khi khởi động:', err.message);
      });
    }, 10000);

    // Chạy ngầm định kỳ mỗi 10 phút để quét và tự động gửi nhắc nhở
    setInterval(() => {
      bloodDonationService.sendScheduledReminders().catch((err) => {
        console.warn('⚠️ Lỗi định kỳ quét thông báo nhắc nhở hiến máu:', err.message);
      });
    }, 10 * 60 * 1000);

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (hỗ trợ Realtime Socket.IO & REST)`);
      console.log(`📡 SSE Realtime Stream sẵn sàng tại /api/notifications/stream`);
      console.log(`🧹 Auto-cleanup: Bản tin lưu trữ (ARCHIVED) & tin pending cũ quá 2 ngày sẽ tự động được xóa vĩnh viễn định kỳ.`);
      console.log(`🩸 Blood Donation Reminders: Tự động gửi nhắc nhở (cách 1 ngày & sắp đến giờ) đang hoạt động ngầm mỗi 10 phút.`);
      // Làm nóng cache bản đồ hành chính (polygon ranh giới) ngay khi server khởi động
      const smartDispatchService = require('./services/smartDispatch.service');
      smartDispatchService.warmAreaCache().catch(() => {});
    });

    const mongoose = require('mongoose');
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🛑 Nhận tín hiệu ${signal}, đang đóng HTTP server & kết nối MongoDB...`);
      try {
        await new Promise((resolve) => server.close(resolve));
        await mongoose.connection.close(false);
        console.log('✅ Đã đóng kết nối MongoDB an toàn.');
        process.exit(0);
      } catch (shutdownErr) {
        console.error('⚠️ Lỗi khi đóng kết nối MongoDB:', shutdownErr);
        process.exit(1);
      }
    };
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;

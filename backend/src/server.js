require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(' Kết nối MongoDB thành công');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(` Server đang chạy tại http://0.0.0.0:${PORT} (tất cả IP mạng LAN)`);
    });
  } catch (error) {
    console.error('❌ Lỗi kết nối CSDL hoặc khởi động Server:', error);
    process.exit(1);
  }
};

startServer();
// trigger restart

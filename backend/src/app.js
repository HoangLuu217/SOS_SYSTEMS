const path = require('path');
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const ApiError = require('./utils/apiError');
const { connectDatabase } = require('./config/database');
const { getLocalUploadsDir } = require('./utils/uploadsDir');

const app = express();

// Tin tưởng proxy đầu tiên (Hỗ trợ devtunnels, ngrok, reverse proxy cho express-rate-limit)
app.set('trust proxy', 1);

// Phục vụ file tĩnh (logo, assets & uploads cục bộ khi chưa cấu hình Cloudinary)
const localUploadsDir = getLocalUploadsDir();
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/uploads', express.static(localUploadsDir));
app.use('/api/uploads', express.static(localUploadsDir));

// Middlewares
const envOrigins = [process.env.CLIENT_URL, process.env.CLIENT_URLS]
  .filter(Boolean)
  .flatMap((val) => val.split(','))
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  ...envOrigins,
  'https://sos-systems.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:8081',
]);

const isAllowedVercelPreview = (origin) =>
  /^https:\/\/sos-systems(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      const normalizedOrigin = origin ? origin.replace(/\/+$/, '') : '';
      // Cho phép requests không có origin (mobile apps, Postman) hoặc origin hợp lệ / development
      if (
        !normalizedOrigin ||
        allowedOrigins.has(normalizedOrigin) ||
        isAllowedVercelPreview(normalizedOrigin) ||
        process.env.NODE_ENV === 'development'
      ) {
        return callback(null, true);
      }
      return callback(new ApiError(403, 'Chặn bởi CORS'));
    },
    credentials: true,
  })
);
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      // Không nén SSE stream để event gửi xuống client ngay lập tức
      if (req.path.includes('/notifications/stream') || req.headers.accept === 'text/event-stream') {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Chuẩn hóa URL loại bỏ các dấu gạch chéo kép //
app.use((req, res, next) => {
  if (req.url && req.url.includes('//')) {
    req.url = req.url.replace(/\/{2,}/g, '/');
  }
  next();
});

// Health check & lightweight endpoints
const healthHandler = (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
};
app.get('/', healthHandler);
app.get('/api', healthHandler);
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/favicon.png', (_req, res) => res.status(204).end());

// Đảm bảo kết nối MongoDB sẵn sàng cho các request API trên Vercel Serverless
const SKIP_DB_PATHS = new Set([
  '/',
  '/api',
  '/health',
  '/api/health',
  '/config',
  '/api/config',
  '/favicon.ico',
  '/favicon.png',
]);

app.use((req, res, next) => {
  if (req.method === 'OPTIONS' || SKIP_DB_PATHS.has(req.path) || mongoose.connection.readyState === 1) {
    return next();
  }
  connectDatabase().then(() => next()).catch(next);
});

// API Routes (Hỗ trợ cả tiền tố /api và truy cập trực tiếp theo đặc tả REST)
app.use('/api', routes);
app.use('/', routes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;


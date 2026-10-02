const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Tin tưởng proxy đầu tiên (Hỗ trợ devtunnels, ngrok, reverse proxy cho express-rate-limit)
app.set('trust proxy', 1);

// Phục vụ file tĩnh (logo, assets)
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Middlewares
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:8081',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép requests không có origin (mobile apps, Postman) hoặc origin hợp lệ / development
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error('Chặn bởi CORS'));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
const healthHandler = (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes (Hỗ trợ cả tiền tố /api/... và gọi trực tiếp /...)
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


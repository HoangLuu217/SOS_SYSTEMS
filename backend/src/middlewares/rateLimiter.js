const rateLimit = require('express-rate-limit');

/**
 * Giới hạn số lần gọi cho các API Authentication nhạy cảm:
 * - Login
 * - Google Login
 * - Forgot Password
 * Mặc định: 20 request / 15 phút cho mỗi IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: process.env.NODE_ENV === 'test' ? 1000 : 60, // Hỗ trợ test linh hoạt
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu đăng nhập/xác thực từ địa chỉ IP này. Vui lòng thử lại sau 15 phút.',
  },
});

module.exports = {
  authLimiter,
};

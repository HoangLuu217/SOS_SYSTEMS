const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authLimiter } = require('../middlewares/rateLimiter');

// 1. Authentication Endpoints
// Đăng ký
router.post('/register', authController.register);

// Đăng nhập thường (Rate limited)
router.post('/login', authLimiter, authController.login);

// Đăng nhập Google (Rate limited)
router.post('/google', authLimiter, authController.loginWithGoogle);

// Đăng xuất (Thu hồi phiên)
router.post('/logout', authController.logout);

// Làm mới Access Token từ Refresh Token
router.post('/refresh', authController.refresh);

// Quên mật khẩu (Rate limited)
router.post('/forgot-password', authLimiter, authController.forgotPassword);

// Đặt lại mật khẩu bằng token
router.post('/reset-password', authController.resetPassword);

// Xác thực mã OTP khôi phục mật khẩu
router.post('/verify-reset-otp', authController.verifyResetOtp);

// Gửi mã OTP qua Email (Resend)
router.post('/send-otp', authController.sendOtp);

// Xác thực mã OTP và đăng nhập
router.post('/verify-otp', authController.verifyOtp);

module.exports = router;

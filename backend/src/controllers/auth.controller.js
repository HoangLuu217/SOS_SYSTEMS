const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const { setAuthCookies, clearAuthCookies } = require('../utils/token.util');

class AuthController {
  /**
   * POST /auth/register
   */
  async register(req, res, next) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const result = await authService.register(req.body, userAgent, ipAddress);

      // Đặt cookie HttpOnly cho Access Token và Refresh Token
      setAuthCookies(res, result.accessToken, result.refreshToken);

      return sendSuccess(res, 201, 'Đăng ký tài khoản thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   */
  async login(req, res, next) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const { email, phone, password } = req.body;

      const result = await authService.login({
        email,
        phone,
        password,
        userAgent,
        ipAddress,
      });

      // Đặt cookie HttpOnly
      setAuthCookies(res, result.accessToken, result.refreshToken);

      return sendSuccess(res, 200, 'Đăng nhập thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/google
   * Đăng nhập / Đăng ký bằng Google ID token
   */
  async loginWithGoogle(req, res, next) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const { idToken, credential } = req.body;

      const result = await authService.loginWithGoogle({
        idToken,
        credential,
        userAgent,
        ipAddress,
      });

      // Đặt cookie HttpOnly
      setAuthCookies(res, result.accessToken, result.refreshToken);

      return sendSuccess(res, 200, 'Đăng nhập Google thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout
   */
  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      const userId = req.user?._id;

      await authService.logout({ userId, refreshToken });

      // Xóa sạch cookie xác thực
      clearAuthCookies(res);

      return sendSuccess(res, 200, 'Đăng xuất thành công');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   */
  async refresh(req, res, next) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      const result = await authService.refresh({
        refreshToken,
        userAgent,
        ipAddress,
      });

      // Cập nhật cookie mới
      setAuthCookies(res, result.accessToken, result.refreshToken);

      return sendSuccess(res, 200, 'Làm mới token thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);

      return sendSuccess(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;
      const result = await authService.resetPassword({ token, newPassword });

      // Đảm bảo xóa mọi phiên cookie cũ
      clearAuthCookies(res);

      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();

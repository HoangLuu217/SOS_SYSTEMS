const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'sos_system_jwt_secret_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'sos_system_refresh_secret_key_2026';
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const REFRESH_TOKEN_DAYS = 7;

/**
 * Băm chuỗi token bằng SHA-256 để lưu an toàn vào DB
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

/**
 * Sinh mã ngẫu nhiên (dùng cho Reset Password, v.v.)
 */
const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Tạo bộ Access Token và Refresh Token cho người dùng
 */
const generateTokens = (user) => {
  const payload = {
    id: user._id,
    roles: user.roles || ['CITIZEN'],
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(
    {
      id: user._id,
      jti: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    }
  );

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    expiresAt,
  };
};

/**
 * Xác thực Access Token
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

/**
 * Xác thực Refresh Token
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

/**
 * Đặt Auth Tokens vào HttpOnly Cookie an toàn
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };

  if (accessToken) {
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 phút
    });
  }

  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000, // 7 ngày
    });
  }
};

/**
 * Xóa Auth Tokens khỏi Cookie khi Logout
 */
const clearAuthCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
};

module.exports = {
  hashToken,
  generateRandomToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
};

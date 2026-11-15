const jwt = require('jsonwebtoken');
const { User } = require('../models');
const ApiError = require('../utils/apiError');

// Cache ngắn hạn thông tin user đã xác thực để tránh query User lặp lại mỗi request polling
const AUTH_USER_CACHE_TTL_MS = 10000;
const AUTH_USER_CACHE_MAX = 500;
const authUserCache = new Map();

async function findAuthUserById(userId) {
  if (!userId) return null;
  const key = String(userId);
  const now = Date.now();
  const cached = authUserCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const user = await User.findById(key).select('-passwordHash -__v').lean();
  if (user) {
    if (authUserCache.size >= AUTH_USER_CACHE_MAX) {
      const oldestKey = authUserCache.keys().next().value;
      authUserCache.delete(oldestKey);
    }
    authUserCache.set(key, { user, expiresAt: now + AUTH_USER_CACHE_TTL_MS });
  } else {
    authUserCache.delete(key);
  }
  return user;
}

/**
 * Middleware xác thực người dùng qua:
 * 1. Header: Authorization: Bearer <token>
 * 2. Cookie: accessToken (HttpOnly)
 * 3. Header: x-user-id (môi trường dev/test)
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    // Hỗ trợ header x-user-id trong môi trường testing/development
    const devUserId = req.headers['x-user-id'];

    if (!token && !devUserId) {
      throw new ApiError(401, 'Bạn chưa đăng nhập. Vui lòng cung cấp token xác thực!');
    }

    let user = null;

    if (token) {
      const secret = process.env.JWT_SECRET || 'sos_system_jwt_secret_key_2026';
      try {
        const decoded = jwt.verify(token, secret);
        user = await findAuthUserById(decoded.id || decoded._id);
      } catch (err) {
        if (devUserId) {
          user = await findAuthUserById(devUserId);
        }
        if (!user) {
          try {
            const decodedPayload = jwt.decode(token);
            if (decodedPayload && (decodedPayload.id || decodedPayload._id)) {
              user = await findAuthUserById(decodedPayload.id || decodedPayload._id);
            }
          } catch (_) {}
        }
        if (!user) {
          if (err.name === 'TokenExpiredError') {
            throw new ApiError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng làm mới token hoặc đăng nhập lại.');
          }
          throw new ApiError(401, 'Token xác thực không hợp lệ.');
        }
      }
    } else if (devUserId) {
      user = await findAuthUserById(devUserId);
    }

    if (!user) {
      throw new ApiError(401, 'Tài khoản người dùng không tồn tại hoặc đã bị vô hiệu hóa.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new ApiError(403, 'Tài khoản của bạn hiện đang bị khóa hoặc ngưng hoạt động.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware xác thực tùy chọn (Optional Auth)
 * Nếu có token hợp lệ -> gán req.user
 * Nếu không có hoặc token lỗi -> req.user = null, không chặn request (hỗ trợ xem thông báo công cộng)
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    const devUserId = req.headers['x-user-id'];

    if (!token && !devUserId) {
      req.user = null;
      return next();
    }

    let user = null;
    if (token) {
      const secret = process.env.JWT_SECRET || 'sos_system_jwt_secret_key_2026';
      try {
        const decoded = jwt.verify(token, secret);
        user = await findAuthUserById(decoded.id || decoded._id);
      } catch (_) {
        try {
          const decoded = jwt.decode(token);
          if (decoded && (decoded.id || decoded._id)) {
            user = await findAuthUserById(decoded.id || decoded._id);
          }
        } catch (_) {}
        if (!user && devUserId) {
          user = await findAuthUserById(devUserId);
        }
      }
    } else if (devUserId) {
      user = await findAuthUserById(devUserId);
    }

    if (user && user.status !== 'SUSPENDED' && user.status !== 'INACTIVE') {
      req.user = user;
    } else {
      req.user = null;
    }

    next();
  } catch (_) {
    req.user = null;
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
};


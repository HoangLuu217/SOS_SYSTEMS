const ApiError = require('../utils/apiError');

/**
 * Middleware phân quyền dựa trên danh sách roles được phép truy cập
 * @param  {...string} allowedRoles - Danh sách role (ví dụ: 'RESCUER', 'LOCAL_AUTHORITY', 'ADMIN')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Yêu cầu xác thực tài khoản trước khi truy cập.'));
    }

    const userRoles = Array.isArray(req.user.roles)
      ? [...req.user.roles]
      : (req.user.roles ? [req.user.roles] : []);
    if (req.user.role && !userRoles.includes(req.user.role)) {
      userRoles.push(req.user.role);
    }

    const hasPermission = allowedRoles.some(role => userRoles.includes(role));

    if (!hasPermission) {
      return next(
        new ApiError(
          403,
          `Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: [${allowedRoles.join(', ')}]`
        )
      );
    }

    next();
  };
};

module.exports = {
  authorize,
};

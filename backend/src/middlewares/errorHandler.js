const ApiError = require('../utils/apiError');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi hệ thống nội bộ (Internal Server Error)';

  // Xử lý lỗi CastError (Sai định dạng ObjectId trong Mongoose)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Dữ liệu không hợp lệ cho trường '${err.path}': ${err.value}`;
  }

  // Xử lý lỗi Mongoose Validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map(el => el.message);
    message = errors.join('. ');
  }

  // Xử lý lỗi trùng unique index (Mongoose duplicate key E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Giá trị của trường '${field}' đã tồn tại trong hệ thống: ${err.keyValue[field]}`;
  }

  // Xử lý lỗi JsonWebToken
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Mã xác thực không hợp lệ. Vui lòng đăng nhập lại!';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Mã xác thực đã hết hạn. Vui lòng đăng nhập lại!';
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.code && { code: err.code }),
    ...(err.data && { data: err.data }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

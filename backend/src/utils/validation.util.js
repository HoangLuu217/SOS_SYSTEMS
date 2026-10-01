/**
 * Kiểm tra định dạng Email hợp lệ
 */
const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/**
 * Kiểm tra định dạng số điện thoại Việt Nam (10 số) hoặc quốc tế (E.164)
 */
const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/.test(phone.trim());
};

/**
 * Kiểm tra độ dài mật khẩu tối thiểu
 */
const isValidPassword = (password, minLength = 6) => {
  if (typeof password !== 'string') return false;
  return password.length >= minLength;
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
};

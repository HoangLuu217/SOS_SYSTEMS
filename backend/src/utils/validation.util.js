/**
 * Kiểm tra định dạng Email hợp lệ (bắt buộc có ký tự @ và tên miền hợp lệ)
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  // Regex kiểm tra email chuẩn: có phần name, ký tự @, phần domain và tld ít nhất 2 ký tự
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(trimmed);
};

/**
 * Kiểm tra định dạng số điện thoại Việt Nam (10 số) hoặc quốc tế (E.164)
 */
const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/.test(phone.trim());
};

/**
 * Kiểm tra độ dài mật khẩu tối thiểu (cơ bản)
 */
const isValidPassword = (password, minLength = 6) => {
  if (typeof password !== 'string') return false;
  return password.length >= minLength;
};

/**
 * Kiểm tra độ mạnh của mật khẩu theo chuẩn bảo mật cao:
 * - Tối thiểu 8 ký tự
 * - Có ít nhất 1 chữ cái in hoa (A-Z)
 * - Có ít nhất 1 chữ cái in thường (a-z)
 * - Có ít nhất 1 chữ số (0-9)
 * - Có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)
 */
const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Mật khẩu không được để trống.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ cái in thường (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ số (0-9).' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...).' };
  }
  return { valid: true };
};

const isStrongPassword = (password) => {
  return validatePasswordStrength(password).valid;
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  validatePasswordStrength,
  isStrongPassword,
};


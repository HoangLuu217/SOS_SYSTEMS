/**
 * Tiện ích kiểm tra tính hợp lệ dữ liệu (Validation Helpers)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIETNAM_PHONE_REGEX = /(84|0[3|5|7|8|9])+([0-9]{8})\b/;

/**
 * Kiểm tra địa chỉ email có đúng định dạng không
 */
export const isValidEmail = (email?: string): boolean => {
  if (!email) return false;
  return EMAIL_REGEX.test(email.trim());
};

/**
 * Kiểm tra số điện thoại Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84)
 */
export const isValidPhone = (phone?: string): boolean => {
  if (!phone) return false;
  const clean = phone.replace(/[\s.-]/g, '');
  return VIETNAM_PHONE_REGEX.test(clean);
};

/**
 * Làm sạch chuỗi số điện thoại
 */
export const cleanPhoneNumber = (phone: string): string => {
  return phone.replace(/[\s.-]/g, '').trim();
};

/**
 * Kiểm tra độ dài mật khẩu (tối thiểu 6 ký tự)
 */
export const isValidPassword = (password?: string, minLength: number = 6): boolean => {
  if (!password) return false;
  return password.length >= minLength;
};

/**
 * Chuẩn hóa số điện thoại Việt Nam sang định dạng E.164 (+84)
 * Ví dụ: 0912345678 -> +84912345678
 */
export const formatVietnamPhoneNumber = (phone: string): string => {
  const cleaned = phone.trim().replace(/[\s.-]/g, '');
  if (cleaned.startsWith('0')) {
    return '+84' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('+')) {
    return '+84' + cleaned;
  }
  return cleaned;
};


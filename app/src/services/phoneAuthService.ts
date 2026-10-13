import { backendApi } from './backendApi';

export interface SendOtpResponse {
  success: boolean;
  sessionInfo?: string;
  message?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  phoneNumber?: string;
  idToken?: string;
  message?: string;
}

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

/**
 * Gửi mã OTP xác thực số điện thoại qua Backend (TextBee Android SMS Gateway)
 * @param phoneNumber Số điện thoại
 */
export const sendPhoneOtp = async (phoneNumber: string): Promise<SendOtpResponse> => {
  try {
    const backendRes = await backendApi.sendOtp(phoneNumber.trim());
    if (backendRes.success) {
      console.log('📱 [PhoneAuth] Đã gửi SMS OTP thành công qua TextBee Gateway');
      return {
        success: true,
        sessionInfo: 'textbee_' + phoneNumber.trim(),
        message: backendRes.message || 'Mã xác thực OTP đã được gửi đến số điện thoại của bạn.',
      };
    }
    return {
      success: false,
      message: backendRes.message || 'Không thể gửi mã xác thực SMS. Vui lòng thử lại.',
    };
  } catch (err: any) {
    console.error('[PhoneAuth] Lỗi gửi SMS OTP:', err);
    return {
      success: false,
      message: err.message || 'Lỗi kết nối máy chủ khi gửi mã xác thực SMS.',
    };
  }
};

/**
 * Xác thực mã OTP người dùng nhập vào qua Backend
 * @param sessionInfo Chuỗi sessionInfo nhận được từ bước gửi OTP
 * @param code Mã OTP 6 chữ số
 */
export const verifyPhoneOtp = async (
  sessionInfo: string,
  code: string
): Promise<VerifyOtpResponse> => {
  if (!code || code.trim().length !== 6) {
    return {
      success: false,
      message: 'Vui lòng nhập đủ 6 chữ số mã OTP.',
    };
  }

  const phoneNumber = sessionInfo.replace(/^(textbee_|backend_|esms_)/, '').trim();

  try {
    const res = await backendApi.verifyOtp(phoneNumber, code.trim(), true);
    if (res.success) {
      return {
        success: true,
        phoneNumber,
        message: 'Xác thực số điện thoại thành công!',
      };
    }
    return {
      success: false,
      message: res.message || 'Mã xác thực OTP không chính xác hoặc đã hết hạn.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Lỗi xác thực mã OTP qua máy chủ.',
    };
  }
};

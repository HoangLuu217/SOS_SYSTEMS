import { firebaseConfig } from '../config/firebase';
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
 * Gửi mã OTP xác thực số điện thoại qua cổng SMS Backend (TextBee Android Gateway / eSMS)
 * @param phoneNumber Số điện thoại
 */
export const sendPhoneOtpFirebase = async (phoneNumber: string): Promise<SendOtpResponse> => {
  try {
    const backendRes = await backendApi.sendOtp(phoneNumber.trim());
    if (backendRes.success) {
      console.log('📱 [PhoneAuth] Đã yêu cầu gửi SMS OTP thành công qua Backend Gateway');
      return {
        success: true,
        sessionInfo: 'backend_' + phoneNumber.trim(),
        message: backendRes.message || 'Mã xác thực OTP đã được gửi đến số điện thoại của bạn.',
      };
    }
    return {
      success: false,
      message: backendRes.message || 'Không thể gửi mã xác thực SMS. Vui lòng thử lại.',
    };
  } catch (err: any) {
    console.error('[PhoneAuth] Lỗi kết nối Backend OTP:', err);
    return {
      success: false,
      message: err.message || 'Lỗi kết nối máy chủ khi gửi mã xác thực SMS.',
    };
  }
};

/**
 * Xác thực mã OTP người dùng nhập vào
 * @param sessionInfo Chuỗi sessionInfo nhận được từ bước sendPhoneOtpFirebase
 * @param code Mã OTP 6 chữ số
 */
export const verifyPhoneOtpFirebase = async (
  sessionInfo: string,
  code: string
): Promise<VerifyOtpResponse> => {
  // 1. Nếu sessionInfo là từ Backend (TextBee / eSMS)
  if (sessionInfo && (sessionInfo.startsWith('backend_') || sessionInfo.startsWith('esms_') || sessionInfo.startsWith('textbee_'))) {
    const phoneNumber = sessionInfo.replace(/^(backend_|esms_|textbee_)/, '');
    try {
      const res = await backendApi.verifyOtp(phoneNumber, code, true);
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
  }

  // 2. Xác thực qua Firebase
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionInfo,
          code: code.trim(),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errCode = data?.error?.message || '';
      if (errCode.includes('INVALID_CODE')) {
        return {
          success: false,
          message: 'Mã xác thực OTP không chính xác. Vui lòng nhập lại.',
        };
      }
      if (errCode.includes('SESSION_EXPIRED')) {
        return {
          success: false,
          message: 'Mã xác thực OTP đã hết hạn. Vui lòng gửi lại mã mới.',
        };
      }
      return {
        success: false,
        message: data?.error?.message || 'Xác thực số điện thoại thất bại.',
      };
    }

    return {
      success: true,
      phoneNumber: data.phoneNumber,
      idToken: data.idToken,
      message: 'Xác thực số điện thoại thành công!',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Lỗi kết nối khi xác thực mã OTP.',
    };
  }
};

import { firebaseConfig } from '../config/firebase';

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
 * Gửi mã OTP xác thực số điện thoại qua Firebase
 * @param phoneNumber Số điện thoại (chấp nhận cả 09... hoặc +84...)
 */
export const sendPhoneOtpFirebase = async (phoneNumber: string): Promise<SendOtpResponse> => {
  try {
    const formattedPhone = formatVietnamPhoneNumber(phoneNumber);

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errCode = data?.error?.message || '';
      if (errCode.includes('BILLING_NOT_ENABLED')) {
        return {
          success: false,
          message: 'Firebase yêu cầu tài khoản thanh toán để gửi SMS thật. Để test MIỄN PHÍ không cần thẻ, bạn hãy thêm số này vào mục "Phone numbers for testing" trên Firebase Console.',
        };
      }
      if (errCode.includes('region enabled') || errCode.includes('region policy')) {
        return {
          success: false,
          message: 'Firebase đang chặn vùng SMS Việt Nam (+84). Vui lòng vào Firebase Console > Authentication > tab Settings > SMS region policy để mở quyền cho Việt Nam (+84) hoặc thêm số vào "Phone numbers for testing".',
        };
      }
      if (errCode.includes('OPERATION_NOT_ALLOWED')) {
        return {
          success: false,
          message: 'Chưa kích hoạt tính năng Phone Auth hoặc vùng SMS chưa được mở trong Firebase Console.',
        };
      }
      if (errCode.includes('TOO_MANY_ATTEMPTS')) {
        return {
          success: false,
          message: 'Đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
        };
      }
      if (errCode.includes('INVALID_PHONE_NUMBER')) {
        return {
          success: false,
          message: 'Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.',
        };
      }
      return {
        success: false,
        message: data?.error?.message || 'Không thể gửi mã xác nhận số điện thoại.',
      };
    }

    return {
      success: true,
      sessionInfo: data.sessionInfo,
      message: 'Mã xác thực OTP đã được gửi đến số điện thoại của bạn.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Lỗi kết nối khi gửi mã OTP qua Firebase.',
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

import { apiClient, ApiClient } from './client';
import { SendOtpResponse, VerifyOtpResponse } from '../types';

/**
 * Gửi mã OTP xác thực số điện thoại qua Backend (TextBee Gateway)
 */
export const sendPhoneOtp = async (
  phoneNumber: string,
  client: ApiClient = apiClient
): Promise<SendOtpResponse> => {
  try {
    const backendRes = await client.post('/auth/send-otp', {
      phone: phoneNumber.trim(),
    });

    if (backendRes.success) {
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
    return {
      success: false,
      message: err.message || 'Lỗi kết nối máy chủ khi gửi mã xác thực SMS.',
    };
  }
};

/**
 * Xác thực mã OTP người dùng nhập vào qua Backend
 */
export const verifyPhoneOtp = async (
  sessionInfo: string,
  code: string,
  client: ApiClient = apiClient
): Promise<VerifyOtpResponse> => {
  if (!code || code.trim().length !== 6) {
    return {
      success: false,
      message: 'Vui lòng nhập đủ 6 chữ số mã OTP.',
    };
  }

  const phoneNumber = sessionInfo.replace(/^(textbee_|backend_|esms_)/, '').trim();

  try {
    const res = await client.post('/auth/verify-otp', {
      phone: phoneNumber,
      otp: code.trim(),
      verifyOnly: true,
    });

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

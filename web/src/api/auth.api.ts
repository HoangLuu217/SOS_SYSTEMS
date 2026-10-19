import { fetchWithAuth, API_BASE, safeParseResponse } from './client';
import type { LoginResponse, User } from '@/types/auth';

export async function loginApi(account: string, password: string): Promise<LoginResponse> {
  const isEmail = account.includes('@');
  const payload = isEmail
    ? { email: account.trim(), password }
    : { phone: account.trim(), password };

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(res);

    if (!res.ok) {
      return {
        success: false,
        message: data.message || `Lỗi máy chủ (HTTP ${res.status}). Vui lòng thử lại.`,
      };
    }

    return {
      success: true,
      message: data.message || 'Đăng nhập thành công',
      data: data.data,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ.';
    return {
      success: false,
      message: msg,
    };
  }
}

export async function logoutApi(): Promise<void> {
  try {
    const refreshToken = localStorage.getItem('sos_refresh_token');
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Bỏ qua lỗi mạng khi logout
  }
}

export async function resetPasswordApi(payload: {
  account?: string;
  email?: string;
  phone?: string;
  token?: string;
  newPassword?: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await safeParseResponse(res);
  if (!res.ok) {
    throw new Error(data.message || 'Không thể đặt lại mật khẩu.');
  }
  return data;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await safeParseResponse(res);
    return data && (data.status === 'OK' || data.success === true);
  } catch {
    return false;
  }
}

/**
 * Cập nhật hồ sơ cá nhân và chức vụ, địa bàn cán bộ (lưu trực tiếp vào MongoDB)
 */
export async function updateUserProfile(payload: {
  fullName?: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  isPhoneVerified?: boolean;
  authority?: {
    position?: string;
    organizationName?: string;
    areaName?: string;
    provinceCode?: number;
    wardCode?: number;
  };
}): Promise<{ success: boolean; data?: User; message?: string }> {
  return fetchWithAuth<{ success: boolean; data?: User; message?: string }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Tải ảnh đại diện lên Cloudinary và cập nhật cho tài khoản người dùng
 */
export async function updateUserAvatar(
  fileOrData: File | string
): Promise<{ success: boolean; data?: { userId: string; avatarUrl: string; user?: User }; message?: string }> {
  if (typeof fileOrData === 'string') {
    return fetchWithAuth<{ success: boolean; data?: { userId: string; avatarUrl: string; user?: User }; message?: string }>(
      '/users/me/avatar',
      {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: fileOrData }),
      }
    );
  }

  const formData = new FormData();
  formData.append('avatar', fileOrData);

  return fetchWithAuth<{ success: boolean; data?: { userId: string; avatarUrl: string; user?: User }; message?: string }>(
    '/users/me/avatar',
    {
      method: 'PATCH',
      body: formData,
    }
  );
}

/**
 * Gửi mã OTP xác thực số điện thoại cán bộ
 */
export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; message?: string; otp?: string }> {
  return fetchWithAuth<{ success: boolean; message?: string; otp?: string }>('/users/me/send-phone-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/**
 * Xác thực mã OTP số điện thoại cán bộ và cập nhật vào Database
 */
export async function verifyPhoneOtp(phone: string, otp: string): Promise<{ success: boolean; message?: string; user?: User }> {
  return fetchWithAuth<{ success: boolean; message?: string; user?: User }>('/users/me/verify-phone-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp }),
  });
}


import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';

export interface UserProfile {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  googleId?: string;
  avatarUrl?: string;
  roles: string[];
  status: string;
  isVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponseData {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

class BackendApiService {
  private customBaseUrl: string | null = null;

  async getBaseUrl(): Promise<string> {
    if (this.customBaseUrl) return this.customBaseUrl;
    try {
      const stored = await AsyncStorage.getItem(ENV.STORAGE_KEYS.CUSTOM_API_URL);
      if (stored) {
        this.customBaseUrl = stored;
        return stored;
      }
    } catch {
      // Fallback
    }
    return ENV.API_BASE_URL;
  }

  async setBaseUrl(url: string) {
    this.customBaseUrl = url;
    await AsyncStorage.setItem(ENV.STORAGE_KEYS.CUSTOM_API_URL, url);
  }

  private async getCandidateUrls(): Promise<string[]> {
    const list: string[] = [];
    const current = await this.getBaseUrl();
    list.push(current);

    if (Platform.OS === 'android') {
      const emu = 'http://10.0.2.2:5000/api';
      if (!list.includes(emu)) list.push(emu);
      const lan = 'http://192.168.1.14:5000/api';
      if (!list.includes(lan)) list.push(lan);
    }
    const local = 'http://localhost:5000/api';
    if (!list.includes(local)) list.push(local);

    return list;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const candidates = await this.getCandidateUrls();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let lastError = '';

    for (const baseUrl of candidates) {
      const url = `${baseUrl}${cleanEndpoint}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s per candidate

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await response.json().catch(() => null);

        if (!response.ok) {
          const errorMsg =
            json?.message ||
            (response.status === 404
              ? `Không tìm thấy endpoint API (${url})`
              : `Yêu cầu thất bại với mã lỗi ${response.status}`);
          return {
            success: false,
            message: errorMsg,
            error: json?.error,
          };
        }

        // Nếu URL này thành công, tự động lưu làm baseUrl chính
        if (baseUrl !== this.customBaseUrl) {
          this.setBaseUrl(baseUrl);
        }

        return json || { success: true, message: 'Thành công' };
      } catch (err: any) {
        lastError = err.message || '';
        // Tiếp tục thử candidate tiếp theo
      }
    }

    return {
      success: false,
      message:
        'Không thể kết nối đến máy chủ backend SOS (đã thử qua ' +
        candidates.join(', ') +
        '). Vui lòng kiểm tra backend server đang chạy.',
      error: lastError,
    };
  }

  /**
   * Đăng ký tài khoản mới với backend
   */
  async register(data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    address?: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    const res = await this.request<AuthResponseData>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success && res.data?.accessToken) {
      await this.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Đăng nhập bằng Email hoặc Số điện thoại
   */
  async login(credentials: {
    identifier: string; // email hoặc số điện thoại
    password: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    const isEmail = credentials.identifier.includes('@');
    const payload = isEmail
      ? { email: credentials.identifier.trim(), password: credentials.password }
      : { phone: credentials.identifier.trim(), password: credentials.password };

    const res = await this.request<AuthResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.success && res.data?.accessToken) {
      await this.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Đăng nhập bằng Google ID Token
   */
  async loginWithGoogle(data: {
    idToken?: string;
    credential?: string;
    googleId?: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    const res = await this.request<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success && res.data?.accessToken) {
      await this.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Quên mật khẩu
   */
  async forgotPassword(email: string): Promise<ApiResponse<{ message: string; resetToken?: string }>> {
    return await this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
  }

  /**
   * Đặt lại mật khẩu
   */
  async resetPassword(token: string, newPassword: string): Promise<ApiResponse> {
    return await this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  /**
   * Đăng xuất
   */
  async logout(): Promise<void> {
    try {
      const refreshToken = await AsyncStorage.getItem(ENV.STORAGE_KEYS.REFRESH_TOKEN);
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Bỏ qua lỗi mạng khi logout
    } finally {
      await this.clearStorage();
    }
  }

  async saveTokens(accessToken: string, refreshToken?: string) {
    if (accessToken) {
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    }
    if (refreshToken) {
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    }
  }

  async saveUser(user: UserProfile) {
    if (user) {
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    }
  }

  async getStoredUser(): Promise<UserProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(ENV.STORAGE_KEYS.USER_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async clearStorage() {
    await AsyncStorage.multiRemove([
      ENV.STORAGE_KEYS.ACCESS_TOKEN,
      ENV.STORAGE_KEYS.REFRESH_TOKEN,
      ENV.STORAGE_KEYS.USER_DATA,
    ]);
  }
}

export const backendApi = new BackendApiService();

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';
import { ApiResponse, UserProfile } from '../types';

/**
 * Lớp điều khiển kết nối HTTP cơ sở đến Backend SOS SYSTEMS
 */
export class ApiClient {
  private customBaseUrl: string | null = null;

  async getBaseUrl(): Promise<string> {
    // 1. Ưu tiên cao nhất: Biến môi trường EXPO_PUBLIC_API_URL từ file .env
    if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim()) {
      return process.env.EXPO_PUBLIC_API_URL.trim();
    }
    if (ENV.API_BASE_URL) return ENV.API_BASE_URL;
    if (this.customBaseUrl) return this.customBaseUrl;

    // 2. Nếu người dùng lưu URL tùy chỉnh trong Storage
    try {
      const stored = await AsyncStorage.getItem(ENV.STORAGE_KEYS.CUSTOM_API_URL);
      if (stored && stored.trim()) {
        this.customBaseUrl = stored.trim();
        return stored.trim();
      }
    } catch {
      // Fallback
    }

    return ENV.API_BASE_URL;
  }

  async setBaseUrl(url: string): Promise<void> {
    this.customBaseUrl = url.trim();
    await AsyncStorage.setItem(ENV.STORAGE_KEYS.CUSTOM_API_URL, url.trim());
  }

  async clearCustomBaseUrl(): Promise<void> {
    this.customBaseUrl = null;
    await AsyncStorage.removeItem(ENV.STORAGE_KEYS.CUSTOM_API_URL);
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const rawBaseUrl = await this.getBaseUrl();
    const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'X-Tunnel-Skip-Anti-Phishing-Page': 'true',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string>),
    };

    const token = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const storedUser = await this.getStoredUser();
    if (storedUser?._id && !headers['x-user-id']) {
      headers['x-user-id'] = storedUser._id;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

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
          code: json?.code,
          data: json?.data,
          error: json?.error,
        };
      }

      return json || { success: true, message: 'Thành công' };
    } catch (err: any) {
      return {
        success: false,
        message: `Không thể kết nối đến máy chủ backend SOS (${url}). Vui lòng kiểm tra backend server đang chạy hoặc kiểm tra kết nối mạng.`,
        error: err.message || '',
      };
    }
  }

  // --- HTTP SHORTCUTS ---
  async get<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = any>(endpoint: string, body: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async uploadFormData<T = any>(
    endpoint: string,
    formData: FormData,
    method: 'POST' | 'PATCH' = 'POST',
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = await this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'X-Tunnel-Skip-Anti-Phishing-Page': 'true',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string>),
    };

    const token = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const storedUser = await this.getStoredUser();
    if (storedUser?._id && !headers['x-user-id']) {
      headers['x-user-id'] = storedUser._id;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout cho upload file

      const response = await fetch(url, {
        ...options,
        method,
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          success: false,
          message: json?.message || `Yêu cầu thất bại với mã lỗi ${response.status}`,
          error: json?.error,
        };
      }

      return json || { success: true, message: 'Thành công' };
    } catch (err: any) {
      return {
        success: false,
        message: `Không thể kết nối đến server (${url}) để upload file.`,
        error: err.message || '',
      };
    }
  }

  async postFormData<T = any>(
    endpoint: string,
    formData: FormData,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    return this.uploadFormData<T>(endpoint, formData, 'POST', options);
  }

  async put<T = any>(endpoint: string, body: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch<T = any>(endpoint: string, body: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // --- TOKEN & USER PERSISTENCE ---
  async saveTokens(accessToken: string, refreshToken?: string): Promise<void> {
    if (accessToken) {
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    }
    if (refreshToken) {
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    }
  }

  async saveUser(user: UserProfile): Promise<void> {
    if (user) {
      // Đảm bảo không lưu chuỗi base64 khổng lồ vào AsyncStorage gây tràn bộ nhớ / treo app
      const safeUser = { ...user };
      if (typeof safeUser.avatarUrl === 'string' && (safeUser.avatarUrl.startsWith('data:image') || safeUser.avatarUrl.length > 500)) {
        safeUser.avatarUrl = '';
      }
      await AsyncStorage.setItem(ENV.STORAGE_KEYS.USER_DATA, JSON.stringify(safeUser));
    }
  }

  async getStoredUser(): Promise<UserProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(ENV.STORAGE_KEYS.USER_DATA);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.avatarUrl === 'string' && (parsed.avatarUrl.startsWith('data:image') || parsed.avatarUrl.length > 500)) {
        // Tự động dọn dẹp avatarUrl base64 khổng lồ bị kẹt từ trước
        parsed.avatarUrl = '';
        AsyncStorage.setItem(ENV.STORAGE_KEYS.USER_DATA, JSON.stringify(parsed)).catch(() => {});
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async clearStorage(): Promise<void> {
    await AsyncStorage.multiRemove([
      ENV.STORAGE_KEYS.ACCESS_TOKEN,
      ENV.STORAGE_KEYS.REFRESH_TOKEN,
      ENV.STORAGE_KEYS.USER_DATA,
    ]);
  }
}

export const apiClient = new ApiClient();

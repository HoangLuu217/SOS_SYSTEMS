import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface NotificationItem {
  _id: string;
  type: 'ALERT' | 'RESCUE' | 'WEATHER' | 'SYSTEM' | string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

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
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | string;
  address?: string;
  citizen?: {
    emergencyContact?: EmergencyContact;
  };
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
    if (current) list.push(current);

    const candidates = [
      'http://10.12.56.76:5000/api',
      'http://localhost:5000/api',
      'http://127.0.0.1:5000/api',
      'http://10.0.2.2:5000/api',
      'https://p324hxtt-5000.asse.devtunnels.ms/api',
    ];

    for (const url of candidates) {
      if (!list.includes(url)) list.push(url);
    }

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
      'Bypass-Tunnel-Reminder': 'true',
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

  // --- PUBLIC HTTP METHODS ---
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

  // Phương thức chuyên dụng để gửi file ảnh/video (không dùng JSON)
  async postFormData<T = any>(endpoint: string, formData: FormData, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const candidates = await this.getCandidateUrls();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // Không set Content-Type để trình duyệt/fetch tự động tạo multipart/form-data boundary
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(options.headers as Record<string, string>),
    };

    const token = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let lastError = '';
    for (const baseUrl of candidates) {
      const url = `${baseUrl}${cleanEndpoint}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // Tăng lên 60s cho upload file nặng qua tunnel

        const response = await fetch(url, {
          ...options,
          method: 'POST',
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

        if (baseUrl !== this.customBaseUrl) this.setBaseUrl(baseUrl);
        return json || { success: true, message: 'Thành công' };
      } catch (err: any) {
        lastError = err.message || '';
      }
    }
    return { success: false, message: 'Không thể kết nối đến server để upload file', error: lastError };
  }

  async put<T = any>(endpoint: string, body: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
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
    otp?: string;
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
   * Gửi mã OTP xác thực qua Email (sử dụng Resend)
   */
  async sendOtp(email: string): Promise<ApiResponse> {
    return await this.request('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  }

  /**
   * Xác thực mã OTP và đăng nhập
   */
  async verifyOtp(
    email: string,
    otp: string,
    verifyOnly: boolean = false
  ): Promise<ApiResponse<AuthResponseData>> {
    const res = await this.request<AuthResponseData>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        verifyOnly,
      }),
    });

    if (!verifyOnly && res.success && res.data?.accessToken) {
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
   * Xác thực mã OTP khôi phục mật khẩu trước khi nhập mật khẩu mới
   */
  async verifyResetOtp(email: string, otp: string): Promise<ApiResponse> {
    return await this.request('/auth/verify-reset-otp', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), token: otp.trim() }),
    });
  }

  /**
   * Đặt lại mật khẩu bằng mã OTP và mật khẩu mới
   */
  async resetPassword(
    param1: string | { email?: string; token: string; newPassword: string },
    param2?: string,
    param3?: string
  ): Promise<ApiResponse> {
    let payload: { email?: string; token: string; newPassword: string };
    if (typeof param1 === 'object') {
      payload = param1;
    } else {
      payload = { token: param1, newPassword: param2 || '', email: param3 };
    }
    return await this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  /**
   * Cập nhật thông tin cá nhân
   */
  async updateProfile(data: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    phone?: string;
  }): Promise<ApiResponse<UserProfile>> {
    const res = await this.request<UserProfile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (res.success && res.data) {
      await this.saveUser(res.data);
    }
    return res;
  }

  /**
   * Cập nhật ảnh đại diện (Avatar)
   */
  async updateAvatar(avatarUrl: string): Promise<ApiResponse<{ userId: string; avatarUrl: string }>> {
    const res = await this.request<{ userId: string; avatarUrl: string }>('/users/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl }),
    });
    if (res.success && res.data?.avatarUrl) {
      const stored = await this.getStoredUser();
      if (stored) {
        stored.avatarUrl = res.data.avatarUrl;
        await this.saveUser(stored);
      }
    }
    return res;
  }

  /**
   * Đổi mật khẩu
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse> {
    return await this.request('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  }

  /**
   * Lấy thông tin hồ sơ Citizen (kèm người liên hệ khẩn cấp)
   */
  async getCitizenProfile(): Promise<ApiResponse<{ citizen?: { emergencyContact?: EmergencyContact } }>> {
    return await this.request('/users/me/citizen', {
      method: 'GET',
    });
  }

  /**
   * Cập nhật người liên hệ khẩn cấp
   */
  async updateEmergencyContact(contact: EmergencyContact): Promise<ApiResponse> {
    return await this.request('/users/me/citizen/emergency-contact', {
      method: 'PATCH',
      body: JSON.stringify(contact),
    });
  }

  /**
   * Lấy danh sách thông báo
   */
  async getNotifications(): Promise<ApiResponse<NotificationItem[]>> {
    return await this.request<NotificationItem[]>('/notifications', {
      method: 'GET',
    });
  }

  /**
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllNotificationsAsRead(): Promise<ApiResponse> {
    return await this.request('/notifications/read-all', {
      method: 'PATCH',
    });
  }

  /**
   * Đánh dấu 1 thông báo là đã đọc
   */
  async markNotificationAsRead(id: string): Promise<ApiResponse> {
    return await this.request(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  /**
   * Xóa thông báo
   */
  async deleteNotification(id: string): Promise<ApiResponse> {
    return await this.request(`/notifications/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Lấy thông tin hồ sơ cứu hộ của chính user đang đăng nhập
   */
  async getRescuerProfile(): Promise<ApiResponse<any>> {
    return await this.request('/rescuer/me', {
      method: 'GET',
    });
  }

  /**
   * Cập nhật trạng thái sẵn sàng tác chiến
   */
  async updateRescuerAvailability(availabilityStatus: string): Promise<ApiResponse> {
    return await this.request('/rescuer/me/availability', {
      method: 'PATCH',
      body: JSON.stringify({ availabilityStatus }),
    });
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

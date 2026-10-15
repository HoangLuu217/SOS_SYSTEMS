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
  type: 'INSTANT' | 'SYSTEM' | 'ALERT' | 'RESCUE' | 'WEATHER' | string;
  title: string;
  content: string;
  priority?: 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  areaId?: any;
  areaName?: string;
  createdBy?: {
    _id: string;
    fullName: string;
    roles?: string[];
  };
  data?: any;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

export type SafeLocationType =
  | 'EVACUATION_CENTER'
  | 'HOSPITAL'
  | 'RESCUE_STATION'
  | 'SHELTER'
  | 'MEETING_POINT';

export type SafeLocationStatus = 'ACTIVE' | 'INACTIVE' | 'FULL' | 'MAINTENANCE';

export interface SafeLocation {
  _id: string;
  name: string;
  type: SafeLocationType;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  address: string;
  capacity: number;
  currentOccupancy: number;
  status: SafeLocationStatus;
  areaId?: {
    _id: string;
    name: string;
    code: string;
    type: string;
  };
  createdBy?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type AlertType =
  | 'FLOOD'
  | 'LANDSLIDE'
  | 'STORM'
  | 'FIRE'
  | 'DANGEROUS_AREA'
  | 'OTHER';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertItem {
  _id: string;
  title: string;
  content: string;
  type: AlertType;
  severity: AlertSeverity;
  startTime: string;
  endTime?: string | null;
  isActive: boolean;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  radius?: number; // bán kính cảnh báo (mét)
  areaId?: {
    _id: string;
    name: string;
    code: string;
    type: string;
    boundary?: {
      type: 'Polygon';
      coordinates: number[][][]; // [[[lng, lat], ...]]
    };
  };
  targetArea?: {
    _id: string;
    name: string;
    code: string;
    type: string;
    boundary?: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  };
  createdBy?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
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
  urls?: string[];
  url?: string;
  error?: any;
}

class BackendApiService {
  private customBaseUrl: string | null = null;

  async getBaseUrl(): Promise<string> {
    // 1. Ưu tiên cao nhất: Biến môi trường EXPO_PUBLIC_API_URL từ file .env
    if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim()) {
      return process.env.EXPO_PUBLIC_API_URL.trim();
    }

    // 2. Nếu trong phiên chạy có gán customBaseUrl
    if (this.customBaseUrl) return this.customBaseUrl;

    // 3. Nếu người dùng lưu URL tùy chỉnh trong Storage
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

  async setBaseUrl(url: string) {
    this.customBaseUrl = url.trim();
    await AsyncStorage.setItem(ENV.STORAGE_KEYS.CUSTOM_API_URL, url.trim());
  }

  async clearCustomBaseUrl() {
    this.customBaseUrl = null;
    await AsyncStorage.removeItem(ENV.STORAGE_KEYS.CUSTOM_API_URL);
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = await this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

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
    const baseUrl = await this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    // Không set Content-Type để trình duyệt/fetch tự động tạo multipart/form-data boundary
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(options.headers as Record<string, string>),
    };

    const token = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s cho upload file nặng

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

      return json || { success: true, message: 'Thành công' };
    } catch (err: any) {
      return {
        success: false,
        message: `Không thể kết nối đến server (${url}) để upload file.`,
        error: err.message || '',
      };
    }
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
   * Lấy danh sách thông báo (hỗ trợ lọc theo loại INSTANT, SYSTEM, trạng thái đã đọc)
   */
  async getNotifications(query?: {
    type?: string;
    isRead?: boolean | string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<NotificationItem[]>> {
    const params = new URLSearchParams();
    if (query?.type) params.append('type', query.type);
    if (query?.isRead !== undefined) params.append('isRead', String(query.isRead));
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';

    return await this.request<NotificationItem[]>(`/notifications${qs}`, {
      method: 'GET',
    });
  }

  /**
   * Đăng ký mã Expo Push Token của thiết bị người dùng với máy chủ
   */
  async registerPushToken(pushToken: string): Promise<ApiResponse<{ pushToken: string }>> {
    return await this.request<{ pushToken: string }>('/notifications/register-push-token', {
      method: 'POST',
      body: JSON.stringify({ pushToken }),
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

  /**
   * Lấy danh sách điểm an toàn (Safe Locations)
   */
  async getSafeLocations(params: {
    type?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<SafeLocation[]>> {
    const queryParts: string[] = [];
    if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.page) queryParts.push(`page=${params.page}`);
    queryParts.push(`limit=${params.limit || 100}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return await this.request<SafeLocation[]>(`/safe-locations${qs}`, {
      method: 'GET',
    });
  }

  /**
   * Lấy danh sách điểm an toàn gần nhất theo tọa độ
   */
  async getNearbySafeLocations(
    lng: number,
    lat: number,
    maxDistance: number = 20000,
    limit: number = 50
  ): Promise<ApiResponse<SafeLocation[]>> {
    return await this.request<SafeLocation[]>(
      `/safe-locations/nearby?lng=${lng}&lat=${lat}&maxDistance=${maxDistance}&limit=${limit}`,
      { method: 'GET' }
    );
  }

  /**
   * Lấy danh sách cảnh báo đang hoạt động (Active Alerts)
   */
  async getActiveAlerts(params: {
    type?: string;
    severity?: string;
    limit?: number;
  } = {}): Promise<ApiResponse<AlertItem[]>> {
    const queryParts: string[] = [];
    if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`);
    queryParts.push(`limit=${params.limit || 100}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return await this.request<AlertItem[]>(`/alerts/active${qs}`, {
      method: 'GET',
    });
  }

  /**
   * Lấy tất cả cảnh báo (Alerts)
   */
  async getAlerts(params: {
    type?: string;
    severity?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<AlertItem[]>> {
    const queryParts: string[] = [];
    if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`);
    if (params.isActive !== undefined) queryParts.push(`isActive=${params.isActive}`);
    if (params.page) queryParts.push(`page=${params.page}`);
    queryParts.push(`limit=${params.limit || 100}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return await this.request<AlertItem[]>(`/alerts${qs}`, {
      method: 'GET',
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

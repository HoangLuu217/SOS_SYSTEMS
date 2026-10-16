import { apiClient, ApiClient } from './client';
import { ApiResponse, AuthResponseData } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';

/**
 * Các API liên quan đến Xác thực (Authentication)
 */
export class AuthApi {
  constructor(private client: ApiClient = apiClient) {}

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
    const res = await this.client.post<AuthResponseData>('/auth/register', data);

    if (res.success && res.data?.accessToken) {
      await this.client.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.client.saveUser(res.data.user);
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

    const res = await this.client.post<AuthResponseData>('/auth/login', payload);

    if (res.success && res.data?.accessToken) {
      await this.client.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.client.saveUser(res.data.user);
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
    const res = await this.client.post<AuthResponseData>('/auth/google', data);

    if (res.success && res.data?.accessToken) {
      await this.client.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.client.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Gửi mã OTP xác thực qua SMS (TextBee) hoặc Email (Resend)
   */
  async sendOtp(target: string): Promise<ApiResponse> {
    const isEmail = target.includes('@');
    const payload = isEmail
      ? { email: target.trim().toLowerCase() }
      : { phone: target.trim() };

    return await this.client.post('/auth/send-otp', payload);
  }

  /**
   * Xác thực mã OTP và đăng nhập (hỗ trợ cả SĐT và Email)
   */
  async verifyOtp(
    target: string,
    otp: string,
    verifyOnly: boolean = false
  ): Promise<ApiResponse<AuthResponseData>> {
    const isEmail = target.includes('@');
    const payload = isEmail
      ? { email: target.trim().toLowerCase(), otp: otp.trim(), verifyOnly }
      : { phone: target.trim(), otp: otp.trim(), verifyOnly };

    const res = await this.client.post<AuthResponseData>('/auth/verify-otp', payload);

    if (!verifyOnly && res.success && res.data?.accessToken) {
      await this.client.saveTokens(res.data.accessToken, res.data.refreshToken);
      await this.client.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Quên mật khẩu
   */
  async forgotPassword(email: string): Promise<ApiResponse<{ message: string; resetToken?: string }>> {
    return await this.client.post('/auth/forgot-password', { email: email.trim() });
  }

  /**
   * Xác thực mã OTP khôi phục mật khẩu trước khi nhập mật khẩu mới
   */
  async verifyResetOtp(email: string, otp: string): Promise<ApiResponse> {
    return await this.client.post('/auth/verify-reset-otp', {
      email: email.trim().toLowerCase(),
      token: otp.trim(),
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
    return await this.client.post('/auth/reset-password', payload);
  }

  /**
   * Đăng xuất
   */
  async logout(): Promise<void> {
    try {
      const refreshToken = await AsyncStorage.getItem(ENV.STORAGE_KEYS.REFRESH_TOKEN);
      await this.client.post('/auth/logout', { refreshToken });
    } catch {
      // Bỏ qua lỗi mạng khi logout
    } finally {
      await this.client.clearStorage();
    }
  }
}

export const authApi = new AuthApi();

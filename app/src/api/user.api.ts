import { apiClient, ApiClient } from './client';
import { ApiResponse, UserProfile, EmergencyContact } from '../types';

import { Platform } from 'react-native';

/**
 * Các API liên quan đến Hồ sơ người dùng và Cứu trợ (User / Profile / Rescuer)
 */
export class UserApi {
  constructor(private client: ApiClient = apiClient) {}

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
    const res = await this.client.patch<UserProfile>('/users/me', data);
    if (res.success && res.data) {
      await this.client.saveUser(res.data);
    }
    return res;
  }

  /**
   * Cập nhật ảnh đại diện (Avatar)
   */
  async updateAvatar(avatarInput: string): Promise<ApiResponse<{ userId: string; avatarUrl: string }>> {
    const isBase64 =
      typeof avatarInput === 'string' &&
      (avatarInput.startsWith('data:image/') || avatarInput.startsWith('/9j/') || avatarInput.length > 500);

    let res: ApiResponse<{ userId: string; avatarUrl: string }>;

    if (isBase64) {
      // 1. Gửi qua JSON PATCH/POST (Tương thích 100% với Devtunnel và mọi proxy)
      res = await this.client.patch<{ userId: string; avatarUrl: string }>('/users/me/avatar', {
        avatarUrl: avatarInput,
      });
      if (!res.success) {
        res = await this.client.post<{ userId: string; avatarUrl: string }>('/users/me/avatar', {
          avatarUrl: avatarInput,
        });
      }
    } else {
      // 2. Dự phòng: Gửi Multipart FormData cho file local URI
      const formData = new FormData();
      const filename = avatarInput.split('/').pop() || `avatar_${Date.now()}.jpg`;
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      formData.append('avatar', {
        uri: avatarInput,
        name: filename,
        type: mimeType,
      } as any);

      res = await this.client.uploadFormData<{ userId: string; avatarUrl: string }>(
        '/users/me/avatar',
        formData,
        'POST'
      );

      if (!res.success) {
        res = await this.client.uploadFormData<{ userId: string; avatarUrl: string }>(
          '/users/me/avatar',
          formData,
          'PATCH'
        );
      }
    }

    if (res.success && res.data?.avatarUrl) {
      const stored = await this.client.getStoredUser();
      if (stored) {
        stored.avatarUrl = res.data.avatarUrl;
        await this.client.saveUser(stored);
      }
    }
    return res;
  }

  /**
   * Đổi mật khẩu
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse> {
    return await this.client.patch('/users/me/password', {
      oldPassword,
      newPassword,
    });
  }

  /**
   * Lấy thông tin hồ sơ Citizen (kèm người liên hệ khẩn cấp)
   */
  async getCitizenProfile(): Promise<ApiResponse<{ citizen?: { emergencyContact?: EmergencyContact; emergencyContacts?: EmergencyContact[] } }>> {
    return await this.client.get('/users/me/citizen');
  }

  /**
   * Cập nhật người liên hệ khẩn cấp (Hỗ trợ đơn lẻ hoặc mảng)
   */
  async updateEmergencyContact(contact: EmergencyContact | EmergencyContact[]): Promise<ApiResponse> {
    return await this.client.patch('/users/me/citizen/emergency-contact', contact);
  }

  /**
   * Xóa / Gỡ người liên hệ khẩn cấp (theo contactId hoặc toàn bộ)
   */
  async deleteEmergencyContact(contactId?: string): Promise<ApiResponse> {
    const endpoint = contactId
      ? `/users/me/citizen/emergency-contact/${contactId}`
      : '/users/me/citizen/emergency-contact';
    return await this.client.delete(endpoint);
  }

  /**
   * Lấy thông tin hồ sơ cứu hộ của chính user đang đăng nhập
   */
  async getRescuerProfile(): Promise<ApiResponse<any>> {
    return await this.client.get('/rescuer/me');
  }

  /**
   * Cập nhật trạng thái sẵn sàng tác chiến của cứu hộ viên
   */
  async updateRescuerAvailability(availabilityStatus: string): Promise<ApiResponse> {
    return await this.client.patch('/rescuer/me/availability', {
      availabilityStatus,
    });
  }

  /**
   * Gửi mã OTP xác thực số điện thoại cho user đang đăng nhập
   */
  async sendPhoneOtp(phone: string): Promise<ApiResponse<any>> {
    return await this.client.post('/users/me/send-phone-otp', { phone });
  }

  /**
   * Xác thực mã OTP số điện thoại và cập nhật vào hồ sơ
   */
  async verifyPhoneOtp(phone: string, otp: string): Promise<ApiResponse<{ user: UserProfile }>> {
    const res = await this.client.post<{ user: UserProfile }>('/users/me/verify-phone-otp', { phone, otp });
    if (res.success && res.data?.user) {
      await this.client.saveUser(res.data.user);
    }
    return res;
  }
}

export const userApi = new UserApi();

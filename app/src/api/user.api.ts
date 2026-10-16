import { apiClient, ApiClient } from './client';
import { ApiResponse, UserProfile, EmergencyContact } from '../types';

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
  async updateAvatar(avatarUrl: string): Promise<ApiResponse<{ userId: string; avatarUrl: string }>> {
    const res = await this.client.patch<{ userId: string; avatarUrl: string }>('/users/me/avatar', {
      avatarUrl,
    });
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
  async getCitizenProfile(): Promise<ApiResponse<{ citizen?: { emergencyContact?: EmergencyContact } }>> {
    return await this.client.get('/users/me/citizen');
  }

  /**
   * Cập nhật người liên hệ khẩn cấp
   */
  async updateEmergencyContact(contact: EmergencyContact): Promise<ApiResponse> {
    return await this.client.patch('/users/me/citizen/emergency-contact', contact);
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
}

export const userApi = new UserApi();

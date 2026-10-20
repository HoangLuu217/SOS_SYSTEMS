import { apiClient, ApiClient } from './client';
import {
  ApiResponse,
  RescuerProfileData,
  UpdateRescuerProfileDto,
  RescuerAvailabilityStatus,
} from '../types';

export class RescuerApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy thông tin hồ sơ cứu hộ của chính user đang đăng nhập (GET /rescuer/me)
   */
  async getProfile(): Promise<ApiResponse<{ rescuer?: RescuerProfileData; [key: string]: any }>> {
    return await this.client.get('/rescuer/me');
  }

  /**
   * Cập nhật thông tin hồ sơ cứu hộ / Nộp đơn đăng ký (PATCH /rescuer/me)
   */
  async updateProfile(data: UpdateRescuerProfileDto): Promise<ApiResponse<any>> {
    return await this.client.patch('/rescuer/me', data);
  }

  /**
   * Công dân nộp đơn đăng ký trở thành Cứu hộ viên (POST /rescuer/apply)
   */
  async apply(data: UpdateRescuerProfileDto): Promise<ApiResponse<any>> {
    return await this.client.post('/rescuer/apply', data);
  }

  /**
   * Cập nhật danh sách kỹ năng chuyên môn (PATCH /rescuer/me/skills)
   */
  async updateSkills(skills: string[]): Promise<ApiResponse<{ skills: string[] }>> {
    return await this.client.patch('/rescuer/me/skills', { skills });
  }

  /**
   * Cập nhật kinh nghiệm tác chiến (PATCH /rescuer/me/experience)
   */
  async updateExperience(experience: string): Promise<ApiResponse<{ experience: string }>> {
    return await this.client.patch('/rescuer/me/experience', { experience });
  }

  /**
   * Cập nhật trạng thái sẵn sàng nhận lệnh (PATCH /rescuer/me/availability)
   * Trạng thái cho phép: 'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'ON_MISSION' | 'SUSPENDED'
   */
  async updateAvailability(
    availabilityStatus: RescuerAvailabilityStatus | string
  ): Promise<ApiResponse<{ availabilityStatus: string }>> {
    return await this.client.patch('/rescuer/me/availability', {
      availabilityStatus,
    });
  }

  /**
   * Cán bộ địa phương / Admin lấy danh sách hồ sơ chờ duyệt (GET /rescuer/pending)
   */
  async getPendingRescuers(search?: string): Promise<ApiResponse<any[]>> {
    const endpoint = search
      ? `/rescuer/pending?search=${encodeURIComponent(search)}`
      : '/rescuer/pending';
    return await this.client.get(endpoint);
  }

  /**
   * Cán bộ địa phương / Admin thẩm định và duyệt hồ sơ (PATCH /rescuer/:id/verify)
   */
  async verifyRescuer(
    id: string,
    verificationStatus: 'VERIFIED' | 'REJECTED'
  ): Promise<ApiResponse<any>> {
    return await this.client.patch(`/rescuer/${id}/verify`, { verificationStatus });
  }
}

export const rescuerApi = new RescuerApi();

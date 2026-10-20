import { apiClient, ApiClient } from './client';
import { ApiResponse, VehicleData } from '../types';

export class VehicleApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy danh sách phương tiện cứu hộ (GET /vehicles)
   */
  async getVehicles(params: {
    teamId?: string;
    type?: string;
    status?: string;
    plateNumber?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<{ vehicles: VehicleData[]; pagination?: any }>> {
    const query = new URLSearchParams();
    if (params.teamId) query.append('teamId', params.teamId);
    if (params.type) query.append('type', params.type);
    if (params.status) query.append('status', params.status);
    if (params.plateNumber) query.append('plateNumber', params.plateNumber);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));

    const qs = query.toString();
    return await this.client.get(qs ? `/vehicles?${qs}` : '/vehicles');
  }

  /**
   * Lấy thông tin chi tiết một phương tiện (GET /vehicles/:id)
   */
  async getVehicleById(id: string): Promise<ApiResponse<VehicleData>> {
    return await this.client.get(`/vehicles/${id}`);
  }

  /**
   * Cập nhật nhanh trạng thái phương tiện (PATCH /vehicles/:id/status)
   */
  async updateStatus(
    id: string,
    status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE'
  ): Promise<ApiResponse<VehicleData>> {
    return await this.client.patch(`/vehicles/${id}/status`, { status });
  }
}

export const vehicleApi = new VehicleApi();

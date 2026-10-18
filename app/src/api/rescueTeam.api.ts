import { apiClient, ApiClient } from './client';
import { ApiResponse, RescueTeamData } from '../types';

export class RescueTeamApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy danh sách Đội cứu hộ (GET /rescue-teams)
   */
  async getTeams(params: {
    status?: string;
    type?: string;
    areaId?: string;
    authorityId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<{ teams: RescueTeamData[]; pagination?: any } | RescueTeamData[]>> {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.type) query.append('type', params.type);
    if (params.areaId) query.append('areaId', params.areaId);
    if (params.authorityId) query.append('authorityId', params.authorityId);
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));

    const qs = query.toString();
    return await this.client.get(qs ? `/rescue-teams?${qs}` : '/rescue-teams');
  }

  /**
   * Lấy thông tin chi tiết một Đội cứu hộ (GET /rescue-teams/:id)
   */
  async getTeamById(id: string): Promise<ApiResponse<RescueTeamData>> {
    return await this.client.get(`/rescue-teams/${id}`);
  }
}

export const rescueTeamApi = new RescueTeamApi();

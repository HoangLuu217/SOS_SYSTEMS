import { apiClient, ApiClient } from './client';
import { ApiResponse, SafeLocation } from '../types';

/**
 * Các API liên quan đến Bản đồ, Điểm an toàn và Cơ sở cứu trợ
 */
export class MapApi {
  constructor(private client: ApiClient = apiClient) {}

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

    return await this.client.get<SafeLocation[]>(`/safe-locations${qs}`);
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
    return await this.client.get<SafeLocation[]>(
      `/safe-locations/nearby?lng=${lng}&lat=${lat}&maxDistance=${maxDistance}&limit=${limit}`
    );
  }
}

export const mapApi = new MapApi();

import { apiClient, ApiClient } from './client';
import { ApiResponse, AlertItem } from '../types';

/**
 * Các API liên quan đến Cảnh báo thiên tai (Alerts)
 */
export class AlertApi {
  constructor(private client: ApiClient = apiClient) {}

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

    return await this.client.get<AlertItem[]>(`/alerts/active${qs}`);
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

    return await this.client.get<AlertItem[]>(`/alerts${qs}`);
  }
}

export const alertApi = new AlertApi();

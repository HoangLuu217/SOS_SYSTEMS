import { apiClient, ApiClient } from './client';
import { ApiResponse } from '../types';

export interface SafetyCheckStats {
  totalTargeted: number;
  totalResponses: number;
  safeCount: number;
  needHelpCount: number;
}

export interface SafetyCheckItem {
  _id: string;
  title: string;
  description: string;
  disasterType: string;
  scope: 'ALL' | 'PROVINCE' | 'DISTRICT' | 'WARD' | string;
  areaId?: {
    _id: string;
    name: string;
    code: string;
    type: string;
  };
  areaName?: string;
  createdBy: {
    _id: string;
    fullName: string;
    phone?: string;
    roles?: string[];
  };
  creatorRole: 'ADMIN' | 'LOCAL_AUTHORITY';
  status: 'ACTIVE' | 'CLOSED';
  startTime: string;
  endTime?: string;
  stats: SafetyCheckStats;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyCheckResponseItem {
  _id: string;
  safetyCheckId: string;
  userId: string;
  userFullName: string;
  userPhone: string;
  status: 'SAFE' | 'NEED_HELP';
  message?: string;
  peopleCount: number;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  address?: string;
  areaId?: string;
  areaName?: string;
  sosRequestId?: string;
  respondedAt: string;
}

export interface RespondSafetyCheckPayload {
  status: 'SAFE' | 'NEED_HELP';
  message?: string;
  peopleCount?: number;
  location?: {
    coordinates: [number, number];
  };
  address?: string;
  createSosRequest?: boolean;
  sosDetails?: {
    medicalEmergency?: boolean;
    specialNeeds?: string;
  };
}

export class SafetyCheckApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy đợt kiểm tra an toàn đang mở (ACTIVE) cho người dân theo cấp Xã/Phường (WARD), Quận hoặc Thành phố
   */
  async getActiveSafetyCheck(coords?: {
    latitude?: number;
    longitude?: number;
  }): Promise<
    ApiResponse<{
      activeCheck: SafetyCheckItem | null;
      myResponse: SafetyCheckResponseItem | null;
      activeChecks?: SafetyCheckItem[];
      myResponses?: SafetyCheckResponseItem[];
    }>
  > {
    const params = new URLSearchParams();
    if (coords?.latitude) params.append('latitude', String(coords.latitude));
    if (coords?.longitude) params.append('longitude', String(coords.longitude));
    const qs = params.toString();
    const endpoint = `/safety-checks/active${qs ? `?${qs}` : ''}`;
    return await this.client.get(endpoint);
  }

  /**
   * Người dân gửi phản hồi xác nhận trạng thái: SAFE (An toàn) hoặc NEED_HELP (Cần cứu hộ)
   */
  async respondToSafetyCheck(
    safetyCheckId: string,
    payload: RespondSafetyCheckPayload
  ): Promise<
    ApiResponse<{
      response: SafetyCheckResponseItem;
      stats: SafetyCheckStats;
      sosRequestId?: string;
    }>
  > {
    return await this.client.post(`/safety-checks/${safetyCheckId}/respond`, payload);
  }

  /**
   * Lấy chi tiết đợt kiểm tra an toàn
   */
  async getSafetyCheckById(
    id: string
  ): Promise<
    ApiResponse<{
      safetyCheck: SafetyCheckItem;
      myResponse: SafetyCheckResponseItem | null;
    }>
  > {
    return await this.client.get(`/safety-checks/${id}`);
  }
}

export const safetyCheckApi = new SafetyCheckApi();

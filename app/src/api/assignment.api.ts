import { apiClient } from './client';
import type { ApiResponse } from '../types';

export interface RescuerAssignmentItem {
  _id: string;
  sosRequestId: any;
  sosId?: any;
  authorityOrganizationId?: any;
  rescueTeamId?: any;
  rescuerId?: any;
  vehicleId?: any;
  priority?: string;
  status:
    | 'PENDING'
    | 'ACCEPTED'
    | 'DISPATCHED'
    | 'EN_ROUTE'
    | 'ON_THE_WAY'
    | 'ARRIVED'
    | 'IN_PROGRESS'
    | 'RESCUING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'REJECTED';
  assignedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  note?: string;
  missionType?: string;
  recipientName?: string;
  destination?: string;
}

export class AssignmentApi {
  /**
   * Lấy danh sách nhiệm vụ được phân công cho cứu hộ viên
   */
  async getMyAssignments(): Promise<ApiResponse<RescuerAssignmentItem[]>> {
    return apiClient.get<RescuerAssignmentItem[]>('/assignments/my');
  }

  /**
   * Cứu hộ viên chấp nhận nhiệm vụ (PENDING -> ACCEPTED)
   */
  async acceptAssignment(id: string): Promise<ApiResponse<RescuerAssignmentItem>> {
    return apiClient.patch<RescuerAssignmentItem>(`/assignments/${id}/accept`, {});
  }

  /**
   * Cập nhật trạng thái tiến trình nhiệm vụ của cứu hộ viên
   * status: ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED
   */
  async updateAssignmentStatus(
    id: string,
    status: string,
    note?: string,
    extraData?: { proofImages?: string[]; actualRecipient?: string }
  ): Promise<ApiResponse<RescuerAssignmentItem>> {
    return apiClient.patch<RescuerAssignmentItem>(`/assignments/${id}/status`, {
      status,
      note,
      ...(extraData || {}),
    });
  }

  /**
   * Cập nhật trạng thái tiến trình trực tiếp theo ID của yêu cầu SOS
   */
  async updateSosMissionStatus(
    sosId: string,
    status: string,
    note?: string,
    extraData?: { proofImages?: string[]; actualRecipient?: string }
  ): Promise<ApiResponse<any>> {
    return apiClient.patch<any>(`/sos/${sosId}/mission-status`, {
      status,
      note,
      ...(extraData || {}),
    });
  }

  /**
   * Lấy danh sách các yêu cầu SOS đang chờ cứu trợ (để cứu hộ viên tiếp nhận nếu chưa được phân công)
   */
  async getAvailableSosRequests(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/sos?status=VERIFIED,ASSIGNED,ACCEPTED,ON_THE_WAY,ARRIVED,RESCUING');
  }
}

export const assignmentApi = new AssignmentApi();

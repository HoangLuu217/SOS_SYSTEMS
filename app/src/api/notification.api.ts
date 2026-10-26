import { apiClient, ApiClient } from './client';
import { ApiResponse, NotificationItem } from '../types';

/**
 * Các API liên quan đến Thông báo hệ thống và Push Notifications
 */
export class NotificationApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy danh sách thông báo (hỗ trợ lọc theo loại INSTANT, SYSTEM, trạng thái đã đọc)
   */
  async getNotifications(query?: {
    type?: string;
    isRead?: boolean | string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<NotificationItem[]>> {
    const params = new URLSearchParams();
    if (query?.type) params.append('type', query.type);
    if (query?.isRead !== undefined) params.append('isRead', String(query.isRead));
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';

    return await this.client.get<NotificationItem[]>(`/notifications${qs}`);
  }

  /**
   * Đăng ký mã Expo Push Token của thiết bị người dùng với máy chủ
   */
  async registerPushToken(pushToken: string): Promise<ApiResponse<{ pushToken: string }>> {
    return await this.client.post<{ pushToken: string }>('/notifications/register-push-token', {
      pushToken,
    });
  }

  async updateCurrentLocation(latitude: number, longitude: number): Promise<ApiResponse<{ updatedAt: string }>> {
    return await this.client.patch('/notifications/location', { latitude, longitude });
  }

  /**
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllNotificationsAsRead(): Promise<ApiResponse> {
    return await this.client.patch('/notifications/read-all', {});
  }

  /**
   * Đánh dấu 1 thông báo là đã đọc
   */
  async markNotificationAsRead(id: string): Promise<ApiResponse> {
    return await this.client.patch(`/notifications/${id}/read`, {});
  }

  /**
   * Xóa thông báo
   */
  async deleteNotification(id: string): Promise<ApiResponse> {
    return await this.client.delete(`/notifications/${id}`);
  }
}

export const notificationApi = new NotificationApi();

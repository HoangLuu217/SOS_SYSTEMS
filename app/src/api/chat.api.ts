import { apiClient, ApiClient } from './client';
import { ApiResponse } from '../types';

export interface ChatMessageItem {
  _id: string;
  senderId: any;
  senderName: string;
  senderRole: 'CITIZEN' | 'LOCAL_AUTHORITY' | 'ADMIN' | 'RESCUER' | string;
  recipientId?: any;
  channel: string;
  content: string;
  attachments?: { url: string; fileType?: string; fileName?: string }[];
  readBy?: string[];
  createdAt: string;
}

export interface LocalAuthorityInfo {
  channel: string;
  areaName: string;
  authority: {
    id: string | null;
    name: string;
    phone: string;
    email?: string;
    position: string;
    department: string;
    areaName: string;
    avatarUrl?: string;
    status: 'ONLINE' | 'BUSY' | 'OFFLINE';
  };
}

export class ChatApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy thông tin cơ quan / cán bộ địa phương phụ trách địa bàn (theo GPS hoặc địa chỉ)
   */
  async getLocalAuthority(params: {
    areaName?: string;
    province?: string;
    ward?: string;
    lat?: number;
    lng?: number;
    userId?: string;
  }): Promise<ApiResponse<LocalAuthorityInfo>> {
    const query = new URLSearchParams();
    if (params.areaName) query.append('areaName', params.areaName);
    if (params.province) query.append('province', params.province);
    if (params.ward) query.append('ward', params.ward);
    if (params.lat !== undefined) query.append('lat', String(params.lat));
    if (params.lng !== undefined) query.append('lng', String(params.lng));
    if (params.userId) query.append('userId', params.userId);

    const queryString = query.toString();
    const endpoint = `/chat/local-authority${queryString ? `?${queryString}` : ''}`;
    return this.client.get<LocalAuthorityInfo>(endpoint);
  }

  /**
   * Lấy lịch sử tin nhắn của một kênh
   */
  async getMessages(params: {
    channel?: string;
    recipientId?: string;
    limit?: number;
  }): Promise<ApiResponse<{ channel: string; messages: ChatMessageItem[] }>> {
    const query = new URLSearchParams();
    if (params.channel) query.append('channel', params.channel);
    if (params.recipientId) query.append('recipientId', params.recipientId);
    if (params.limit) query.append('limit', String(params.limit));

    const queryString = query.toString();
    const endpoint = `/chat/messages${queryString ? `?${queryString}` : ''}`;
    return this.client.get<{ channel: string; messages: ChatMessageItem[] }>(endpoint);
  }

  /**
   * Gửi tin nhắn mới
   */
  async sendMessage(data: {
    content: string;
    channel?: string;
    recipientId?: string;
    attachments?: { url: string; fileType?: string; fileName?: string }[];
  }): Promise<ApiResponse<ChatMessageItem>> {
    return this.client.post<ChatMessageItem>('/chat/messages', data);
  }

  /**
   * Đánh dấu đã đọc
   */
  async markAsRead(params: {
    channel?: string;
    recipientId?: string;
  }): Promise<ApiResponse> {
    return this.client.patch('/chat/read', params);
  }
}

export const chatApi = new ChatApi();

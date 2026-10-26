import { apiClient, ApiClient } from './client';
import { ApiResponse } from '../types';

export interface WeatherArticleItem {
  _id: string;
  title: string;
  summary?: string;
  content: string;
  category: string;
  score?: number;
  relevance_score?: number;
  area?: string;
  regions?: string[];
  imageUrl?: string;
  image_url?: string;
  articleUrl?: string;
  source_url?: string;
  articleTitle?: string;
  sourceName?: string;
  source_name?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  published_at?: string;
}

/**
 * API tin tức & thông báo thời tiết cho ứng dụng di động
 */
export class WeatherApi {
  constructor(private client: ApiClient = apiClient) {}

  /**
   * Lấy danh sách tin tức thời tiết thực tế từ cơ sở dữ liệu
   */
  async getWeatherArticles(query?: {
    category?: string;
    area?: string;
    areaId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<WeatherArticleItem[]>> {
    const params = new URLSearchParams();
    if (query?.category) params.append('category', query.category);
    if (query?.area) params.append('area', query.area);
    if (query?.areaId) params.append('areaId', query.areaId);
    if (query?.status) params.append('status', query.status);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';

    return await this.client.get<WeatherArticleItem[]>(`/weather-notifications${qs}`);
  }

  async getWeatherArticleById(id: string): Promise<ApiResponse<WeatherArticleItem>> {
    return await this.client.get<WeatherArticleItem>(`/weather-notifications/${id}`);
  }
}

export const weatherApi = new WeatherApi();

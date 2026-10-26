import { API_BASE, fetchWithAuth } from './client';

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
  publishedAt?: string | null;
  published_at?: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'pending' | 'approved' | 'rejected' | string;
  areaId?: {
    _id: string;
    name: string;
    code?: string;
    type?: string;
  } | null;
  createdBy?: {
    _id: string;
    fullName: string;
    phone?: string;
    roles?: string[];
  } | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
}

export interface CreateWeatherPayload {
  title: string;
  content: string;
  summary?: string;
  category: string;
  score?: number;
  area?: string;
  regions?: string[];
  imageUrl?: string;
  articleUrl?: string;
  articleTitle?: string;
  sourceName?: string;
  publishedAt?: string | null;
  areaId?: string;
  status?: string;
}

export interface WeatherFilterQuery {
  search?: string;
  category?: string;
  area?: string;
  areaId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function executeWeatherWorkflowApi(): Promise<{
  success: boolean;
  message?: string;
  data?: { completed: boolean; message: string };
}> {
  return fetchWithAuth('/weather-articles/execute-workflow', {
    method: 'POST',
    body: JSON.stringify({}),
  }, { directFallback: false });
}

export function subscribeWeatherArticleUpdates(onUpdated: () => void): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource(`${API_BASE}/weather-articles/events/stream`, { withCredentials: true });
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.action === 'WEATHER_ARTICLES_UPDATED') onUpdated();
      } catch (error) {
        console.warn('[Weather SSE] Không đọc được sự kiện cập nhật:', error);
      }
    };
    eventSource.onerror = () => {
      // EventSource reconnects automatically. No periodic polling is needed.
    };
  } catch (error) {
    console.warn('[Weather SSE] Không thể kết nối luồng cập nhật:', error);
  }

  return () => {
    eventSource?.close();
    eventSource = null;
  };
}

export async function fetchWeatherArticlesApi(
  query: WeatherFilterQuery = {}
): Promise<{ success: boolean; data: WeatherArticleItem[]; pagination?: any; message?: string }> {
  const params = new URLSearchParams();
  if (query.search) params.append('search', query.search);
  if (query.category && query.category !== 'ALL') params.append('category', query.category);
  if (query.area && query.area !== 'ALL') params.append('area', query.area);
  if (query.areaId && query.areaId !== 'ALL') params.append('areaId', query.areaId);
  if (query.status && query.status !== 'ALL') params.append('status', query.status);
  if (query.page) params.append('page', String(query.page));
  if (query.limit) params.append('limit', String(query.limit));

  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/weather-articles${qs}`, { method: 'GET' });
}

export async function fetchWeatherArticleByIdApi(
  id: string
): Promise<{ success: boolean; data: WeatherArticleItem; message?: string }> {
  return fetchWithAuth(`/weather-articles/${id}`, { method: 'GET' });
}

export async function createWeatherArticleApi(
  payload: CreateWeatherPayload
): Promise<{ success: boolean; data: WeatherArticleItem; message?: string }> {
  return fetchWithAuth('/weather-articles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWeatherArticleApi(
  id: string,
  payload: Partial<CreateWeatherPayload>
): Promise<{ success: boolean; data: WeatherArticleItem; message?: string }> {
  return fetchWithAuth(`/weather-articles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteWeatherArticleApi(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return fetchWithAuth(`/weather-articles/${id}`, {
    method: 'DELETE',
  });
}

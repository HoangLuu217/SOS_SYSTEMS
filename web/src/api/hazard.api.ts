import { fetchWithAuth } from './client';
import type { HazardReportItem } from '@/types/dashboard';

export async function fetchHazardReports(
  params: Record<string, string> = {}
): Promise<{
  success: boolean;
  data: {
    reports: HazardReportItem[];
    counts: {
      TOTAL: number;
      PENDING: number;
      APPROVED: number;
      REJECTED: number;
      RESOLVED: number;
    };
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
}> {
  const mergedParams = { all: 'true', limit: '100', ...params };
  const query = new URLSearchParams(mergedParams).toString();
  const endpoint = query ? `/hazard-reports?${query}` : '/hazard-reports';
  return fetchWithAuth(endpoint, { method: 'GET' });
}

export async function reviewHazardReport(
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'RESOLVED',
  reviewNote?: string,
  extraData?: Partial<HazardReportItem>
): Promise<{ success: boolean; data: HazardReportItem }> {
  return fetchWithAuth(`/hazard-reports/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reviewNote, ...(extraData || {}) }),
  });
}

export async function createHazardReport(payload: {
  title: string;
  description: string;
  hazardType: string;
  customHazardType?: string;
  severity: string;
  location: { type: 'Point'; coordinates: [number, number] };
  address: string;
  areaId?: string;
  images?: string[];
  status?: 'APPROVED' | 'PENDING' | string;
  reviewNote?: string;
}): Promise<{ success: boolean; data: HazardReportItem; message?: string }> {
  return fetchWithAuth('/hazard-reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteHazardReport(id: string): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/hazard-reports/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Giải mã liên kết Google Maps hoặc chuỗi tọa độ qua Backend (hỗ trợ cả link rút gọn)
 */
export async function resolveMapLink(url: string): Promise<{
  success: boolean;
  data?: { lat: number; lng: number; placeName?: string; resolvedUrl?: string; source?: string };
  message?: string;
}> {
  return fetchWithAuth('/hazard-reports/resolve-map-link', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

/**
 * Đăng ký lắng nghe sự kiện Server-Sent Events (SSE) theo thời gian thực cho điểm nguy hiểm
 */
export function subscribeHazardEvents(onEvent: (payload: { action: 'CREATED' | 'REVIEWED' | 'DELETED'; data: any }) => void): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource('/api/hazard-reports/stream');
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.action) {
          onEvent(payload);
        }
      } catch (err) {
        console.warn('[SSE] Lỗi giải mã gói tin thời gian thực:', err);
      }
    };
    eventSource.onerror = () => {
      // EventSource tự động reconnect khi mất kết nối
    };
  } catch (err) {
    console.warn('[SSE] Không thể kết nối EventSource:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}

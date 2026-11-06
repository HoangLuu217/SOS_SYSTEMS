import { fetchWithAuth } from './client';

export interface CreateSafetyCheckPayload {
  title: string;
  description: string;
  disasterType?: 'STORM' | 'TYPHOON' | 'FLOOD' | 'FLASH_FLOOD' | 'LANDSLIDE' | 'HEAVY_RAIN' | 'EARTHQUAKE' | 'FIRE' | 'OTHER';
  areaId?: string; // null hoặc 'ALL' nếu toàn thành phố (chỉ dành cho ADMIN). Cán bộ địa phương tự động áp dụng Xã/Phường của mình.
  startTime?: string;
  endTime?: string;
}

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
    avatarUrl?: string;
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
  userId: {
    _id: string;
    fullName: string;
    phone?: string;
    avatarUrl?: string;
    email?: string;
  };
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
  sosRequestId?: {
    _id: string;
    sosCode: string;
    status: string;
    urgencyLevel: string;
  };
  respondedAt: string;
}

/**
 * Tạo đợt thông báo kiểm tra an toàn mới
 * - Admin: Được chọn bất kỳ xã nào (WARD), quận (DISTRICT) hoặc toàn thành phố (ALL)
 * - Địa phương (Cán bộ xã/phường): Scope luôn là cấp Xã (WARD) và chỉ gửi cho người dân thuộc Xã của mình
 */
export async function createSafetyCheckApi(
  payload: CreateSafetyCheckPayload
): Promise<{ success: boolean; data: SafetyCheckItem; message?: string }> {
  return fetchWithAuth('/safety-checks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Lấy danh sách các đợt kiểm tra an toàn
 */
export async function fetchSafetyChecksApi(query?: {
  status?: string;
  areaId?: string;
  scope?: 'ALL' | 'PROVINCE' | 'DISTRICT' | 'WARD' | string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data: SafetyCheckItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const params = new URLSearchParams();
  if (query?.status) params.append('status', query.status);
  if (query?.areaId) params.append('areaId', query.areaId);
  if (query?.scope) params.append('scope', query.scope);
  if (query?.page) params.append('page', String(query.page));
  if (query?.limit) params.append('limit', String(query.limit));
  const qStr = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/safety-checks${qStr}`, { method: 'GET' });
}

/**
 * Lấy chi tiết đợt kiểm tra an toàn
 */
export async function fetchSafetyCheckByIdApi(
  id: string
): Promise<{ success: boolean; data: { safetyCheck: SafetyCheckItem; myResponse?: any } }> {
  return fetchWithAuth(`/safety-checks/${id}`, { method: 'GET' });
}

/**
 * Lấy danh sách phản hồi của người dân cho 1 đợt kiểm tra an toàn (SAFE vs NEED_HELP)
 */
export async function fetchSafetyCheckResponsesApi(
  id: string,
  query?: {
    status?: 'SAFE' | 'NEED_HELP';
    search?: string;
    page?: number;
    limit?: number;
  }
): Promise<{
  success: boolean;
  data: {
    safetyCheck: { _id: string; title: string; status: string; scope?: string; stats: SafetyCheckStats };
    responses: SafetyCheckResponseItem[];
  };
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const params = new URLSearchParams();
  if (query?.status) params.append('status', query.status);
  if (query?.search) params.append('search', query.search);
  if (query?.page) params.append('page', String(query.page));
  if (query?.limit) params.append('limit', String(query.limit));
  const qStr = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/safety-checks/${id}/responses${qStr}`, { method: 'GET' });
}

/**
 * Đóng đợt kiểm tra an toàn
 */
export async function closeSafetyCheckApi(
  id: string
): Promise<{ success: boolean; data: SafetyCheckItem; message: string }> {
  return fetchWithAuth(`/safety-checks/${id}/close`, { method: 'PATCH' });
}

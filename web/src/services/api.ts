import type { LoginResponse, User } from '../types/auth';
import type {
  SosRequestItem,
  AdminOverviewStats,
  VehicleItem,
  RescueTeamItem,
  AlertItem,
  AuditLogItem,
  AdministrativeAreaItem,
  AuthorityOrgItem,
  HazardReportItem,
  SafeLocationItem,
} from '../types/dashboard';

const RAW_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const DIRECT_BACKEND = `${RAW_BACKEND_URL}/api`;

async function safeParseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || !text.trim()) {
    if (!res.ok) {
      throw new Error(`Máy chủ không phản hồi nội dung (HTTP ${res.status}). Vui lòng kiểm tra Backend server.`);
    }
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Phản hồi máy chủ không hợp lệ (HTTP ${res.status}). Vui lòng kiểm tra Backend server.`);
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('sos_refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });

    const data = await safeParseResponse(res);
    if (res.ok && data.success && data.data?.accessToken) {
      const newAccessToken = data.data.accessToken;
      localStorage.setItem('sos_access_token', newAccessToken);
      if (data.data.refreshToken) {
        localStorage.setItem('sos_refresh_token', data.data.refreshToken);
      }
      return newAccessToken;
    }
  } catch (e) {
    console.warn('Lỗi tự động làm mới token:', e);
  }
  return null;
}

/**
 * Helper gọi API kèm Header Authorization token tự động và xử lý fallback URL & Silent Refresh Token
 */
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token = localStorage.getItem('sos_access_token');
  const userStr = localStorage.getItem('sos_auth_user');
  let userId = '';
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      userId = u._id || u.id || '';
    } catch { }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(userId ? { 'x-user-id': userId } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (userId) {
    headers['x-user-id'] = userId;
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    let res = await fetch(`${API_BASE}${endpoint}`, mergedOptions);

    // Xử lý khi Token hết hạn (HTTP 401): Tự động làm mới bằng Refresh Token mà không gián đoạn người dùng
    if (!res.ok && res.status === 401 && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        token = newToken;
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...mergedOptions,
          headers,
        });
      }
    }

    if (!res.ok && res.status >= 500) {
      throw new Error(`Proxy error HTTP ${res.status}`);
    }
    const data = await safeParseResponse(res);
    if (!res.ok) {
      throw new Error(data.message || 'Lỗi xử lý yêu cầu máy chủ');
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Proxy error') || message.includes('không phản hồi')) {
      const directRes = await fetch(`${DIRECT_BACKEND}${endpoint}`, mergedOptions);
      const directData = await safeParseResponse(directRes);
      if (!directRes.ok) {
        throw new Error(directData.message || 'Lỗi xử lý yêu cầu máy chủ', { cause: err });
      }
      return directData;
    }
    throw err;
  }
}

// ─── AUTHENTICATION ──────────────────────────────────────────────────────────

export async function loginApi(account: string, password: string): Promise<LoginResponse> {
  const isEmail = account.includes('@');
  const payload = isEmail
    ? { email: account.trim(), password }
    : { phone: account.trim(), password };

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok && res.status >= 500) {
      throw new Error(`Proxy error HTTP ${res.status}`);
    }

    const data = await safeParseResponse(res);
    if (!res.ok) {
      throw new Error(data.message || 'Đăng nhập không thành công');
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Proxy error') || message.includes('không phản hồi')) {
      try {
        const directRes = await fetch(`${DIRECT_BACKEND}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const directData = await safeParseResponse(directRes);
        if (!directRes.ok) {
          throw new Error(directData.message || 'Đăng nhập không thành công', { cause: err });
        }
        return directData;
      } catch (fallbackErr: unknown) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : '';
        if (fallbackMsg.includes('Failed to fetch') || fallbackMsg.includes('NetworkError')) {
          throw new Error('Không thể kết nối đến máy chủ Backend (Port 5000). Vui lòng đảm bảo Backend server đang chạy.', { cause: fallbackErr });
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function logoutApi(): Promise<void> {
  try {
    const token = localStorage.getItem('sos_access_token');
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
  } catch {
    // Bỏ qua lỗi mạng khi logout
  }
}

export async function resetPasswordApi(payload: {
  account?: string;
  email?: string;
  token?: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await safeParseResponse(res);
  if (!res.ok) {
    throw new Error(data.message || 'Không thể đặt lại mật khẩu');
  }
  return data;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    if (res.ok) return true;
  } catch {
    // Bỏ qua
  }

  try {
    const res = await fetch(`${RAW_BACKEND_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── SOS REQUESTS (CƠ SỞ DỮ LIỆU THẬT) ───────────────────────────────────────

export async function fetchSosRequests(params: Record<string, string> = {}): Promise<{ success: boolean; data: SosRequestItem[] }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/sos?${query}` : '/sos';
  return fetchWithAuth(endpoint, { method: 'GET' });
}

export async function createSosRequest(payload: {
  citizenId?: string;
  location: { type: 'Point'; coordinates: [number, number] };
  areaId: string;
  address: string;
  emergencyType: string;
  priority: string;
  people: number;
  description?: string;
}): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth('/sos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifySosRequest(
  sosId: string,
  payload: { priority: string; status: string }
): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth(`/sos/${sosId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function completeSosRequest(sosId: string): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth(`/sos/${sosId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ─── ADMIN STATISTICS & USERS (CƠ SỞ DỮ LIỆU THẬT) ───────────────────────────

export async function fetchAdminStatistics(): Promise<{ success: boolean; data: AdminOverviewStats }> {
  return fetchWithAuth('/admin/statistics', { method: 'GET' });
}

export async function fetchAdminUsers(params: Record<string, string> = {}): Promise<{
  success: boolean;
  data: {
    users: Array<{
      _id: string;
      fullName: string;
      email: string;
      phone?: string;
      roles: string[];
      status: string;
      isVerified: boolean;
      address?: string;
      rescuer?: {
        skills: string[];
        verificationStatus: string;
        availabilityStatus: string;
        vehicleType?: string;
        idNumber?: string;
      };
      authority?: {
        position?: string;
        department?: string;
      };
      createdAt: string;
    }>;
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/admin/users?${query}` : '/admin/users';
  const raw = await fetchWithAuth<any>(endpoint, { method: 'GET' });
  // Chuẩn hóa response: Nếu backend trả về raw.data dạng mảng users
  if (Array.isArray(raw.data)) {
    return {
      success: raw.success,
      data: {
        users: raw.data,
        pagination: raw.meta || { total: raw.data.length, page: 1, limit: 50, totalPages: 1 },
      },
    };
  }
  return raw;
}

export async function updateUserStatus(userId: string, status: string): Promise<{ success: boolean }> {
  return fetchWithAuth(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function createAdminUser(payload: {
  fullName: string;
  phone: string;
  email?: string;
  password?: string;
  roles?: string[];
  authority?: {
    organizationId?: string;
    areaId?: string;
    areaName?: string;
    position?: string;
    department?: string;
  };
}): Promise<{ success: boolean; data: any; message?: string }> {
  return fetchWithAuth('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  userId: string,
  payload: {
    fullName?: string;
    phone?: string;
    email?: string;
    password?: string;
    status?: string;
    authority?: {
      organizationId?: string;
      areaId?: string;
      areaName?: string;
      position?: string;
      department?: string;
    };
  }
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function verifyRescuer(
  userId: string,
  verificationStatus: 'VERIFIED' | 'REJECTED'
): Promise<{ success: boolean }> {
  return fetchWithAuth(`/admin/rescuers/${userId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ verificationStatus }),
  });
}

// ─── VEHICLES & RESCUE TEAMS (CƠ SỞ DỮ LIỆU THẬT) ────────────────────────────

export async function fetchVehicles(): Promise<{ success: boolean; data: VehicleItem[] }> {
  return fetchWithAuth('/vehicles', { method: 'GET' });
}

export async function fetchRescueTeams(): Promise<{ success: boolean; data: RescueTeamItem[] }> {
  return fetchWithAuth('/rescue-teams', { method: 'GET' });
}

// ─── ALERTS (CƠ SỞ DỮ LIỆU THẬT) ─────────────────────────────────────────────

export async function fetchAlerts(): Promise<{ success: boolean; data: AlertItem[] }> {
  return fetchWithAuth('/alerts', { method: 'GET' });
}

export async function createAlert(payload: {
  areaId: string;
  title: string;
  content: string;
  type: string;
  severity: string;
  startTime?: string;
  endTime?: string;
}): Promise<{ success: boolean; data: AlertItem }> {
  return fetchWithAuth('/alerts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface BroadcastNotificationPayload {
  title: string;
  content: string;
  type: 'INSTANT' | 'SYSTEM' | string;
  areaId?: string;
  priority?: 'NORMAL' | 'HIGH' | 'CRITICAL' | string;
  data?: any;
}

export interface BroadcastItem {
  id: string;
  title: string;
  content: string;
  type: 'INSTANT' | 'SYSTEM' | string;
  priority?: string;
  areaName?: string;
  areaId?: string;
  createdBy?: {
    _id: string;
    fullName: string;
    phone?: string;
    roles?: string[];
  };
  createdAt: string;
  recipientsCount?: number;
}

export async function broadcastNotificationApi(
  payload: BroadcastNotificationPayload
): Promise<{ success: boolean; data: any; message?: string }> {
  return fetchWithAuth('/notifications/broadcast', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchBroadcastHistory(query?: {
  type?: string;
  areaId?: string;
}): Promise<{ success: boolean; data: BroadcastItem[] }> {
  const params = new URLSearchParams();
  if (query?.type) params.append('type', query.type);
  if (query?.areaId) params.append('areaId', query.areaId);
  const qStr = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/notifications/broadcasts${qStr}`, { method: 'GET' });
}

export async function deleteBroadcastApi(id: string): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/notifications/broadcasts/${id}`, { method: 'DELETE' });
}

// ─── ADMINISTRATIVE AREAS & ORGANIZATIONS ────────────────────────────────────

export async function fetchAdministrativeAreas(): Promise<{ success: boolean; data: AdministrativeAreaItem[] }> {
  return fetchWithAuth('/administrative-areas', { method: 'GET' });
}

export async function fetchAuthorityOrganizations(): Promise<{ success: boolean; data: AuthorityOrgItem[] }> {
  return fetchWithAuth('/authority-organizations', { method: 'GET' });
}

export async function syncAdministrativeAreasToBackend(payload: {
  provinceName: string;
  provinceCode?: number | string;
  units: any[];
}): Promise<{ success: boolean; data: any }> {
  try {
    return await fetchWithAuth('/administrative-areas/sync-api', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Sync administrative areas to MongoDB failed:', e);
    return { success: false, data: null };
  }
}

export async function fetchAreaBoundary(params: {
  areaId?: string;
  name?: string;
  province?: string;
  district?: string;
}): Promise<{
  success: boolean;
  data: {
    areaId: string;
    name: string;
    code: string;
    boundary: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: any;
    };
    source: string;
  } | null;
}> {
  try {
    const q = new URLSearchParams();
    if (params.areaId) q.append('areaId', params.areaId);
    if (params.name) q.append('name', params.name);
    if (params.province) q.append('province', params.province);
    if (params.district) q.append('district', params.district);

    const res = await fetchWithAuth<any>(`/administrative-areas/boundary?${q.toString()}`, {
      method: 'GET',
    });
    if (res && res.success && res.data) {
      return { success: true, data: res.data };
    }
    return { success: false, data: null };
  } catch (e) {
    console.warn('Lỗi gọi API lấy boundary:', e);
    return { success: false, data: null };
  }
}

export interface AreaManagerInfo {
  hasManager: boolean;
  managerName?: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  organizationName?: string | null;
  areaName?: string;
  areaId?: string | null;
}

export async function fetchAreaManagers(): Promise<{ success: boolean; data: Record<string, AreaManagerInfo> }> {
  try {
    const raw = await fetchWithAuth<any>('/administrative-areas/managers', { method: 'GET' });
    if (raw && raw.data) {
      return { success: true, data: raw.data };
    }
    return { success: false, data: {} };
  } catch (e) {
    console.warn('Lấy danh sách cán bộ quản lý địa phương thất bại:', e);
    return { success: false, data: {} };
  }
}

// ─── AUDIT LOGS (CƠ SỞ DỮ LIỆU THẬT) ─────────────────────────────────────────

export async function fetchAuditLogs(): Promise<{ success: boolean; data: { logs: AuditLogItem[] } }> {
  const raw = await fetchWithAuth<any>('/audit-logs', { method: 'GET' });
  // Chuẩn hóa response: Nếu backend trả về raw.data dạng mảng logs
  if (Array.isArray(raw.data)) {
    return {
      success: raw.success,
      data: { logs: raw.data },
    };
  }
  return raw;
}

// ─── SOS ASSIGNMENTS (ĐIỀU PHỐI CỨU HỘ) ──────────────────────────────────────

export async function assignSosApi(sosId: string, payload: {
  rescueTeamId: string;
  rescuerId: string;
  vehicleId?: string;
  note?: string;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/sos/${sosId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAssignmentStatusApi(assignmentId: string, status: string): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function cancelAssignmentApi(assignmentId: string, reason: string): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function reassignMissionApi(assignmentId: string, payload: {
  rescueTeamId: string;
  rescuerId: string;
  vehicleId?: string;
  reason?: string;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─── HAZARD REPORTS (ĐÓNG GÓP & DUYỆT ĐIỂM NGUY HIỂM UC-L15) ─────────────────

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

/**
 * Đăng ký lắng nghe sự kiện Server-Sent Events (SSE) theo thời gian thực cho Thông báo & Cảnh báo khẩn cấp
 */
export function subscribeNotificationEvents(onEvent: (payload: { action: 'BROADCAST' | 'USER' | 'DELETED'; data?: any; broadcastId?: string }) => void): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource('/api/notifications/stream');
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && (payload.action === 'BROADCAST' || payload.action === 'USER' || payload.action === 'DELETED')) {
          onEvent(payload);
        }
      } catch (err) {
        console.warn('[SSE] Lỗi giải mã gói tin thông báo thời gian thực:', err);
      }
    };
    eventSource.onerror = () => {
      // EventSource tự động reconnect khi mất kết nối
    };
  } catch (err) {
    console.warn('[SSE] Không thể kết nối EventSource notifications:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}


// ─── SAFE LOCATIONS (ĐIỂM TRÚ ẨN & TRẠM Y TẾ AN TOÀN) ─────────────────────────

export async function fetchSafeLocations(params: Record<string, string> = {}): Promise<{ success: boolean; data: SafeLocationItem[] }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/safe-locations?${query}` : '/safe-locations';
  const raw = await fetchWithAuth<any>(endpoint, { method: 'GET' });
  if (Array.isArray(raw.data)) {
    return { success: raw.success, data: raw.data };
  }
  return raw;
}

export async function createSafeLocation(payload: {
  name: string;
  type: string;
  address: string;
  capacity: number;
  currentOccupancy?: number;
  status?: string;
  areaId: string;
  location: { type: 'Point'; coordinates: [number, number] };
}): Promise<{ success: boolean; data: SafeLocationItem; message?: string }> {
  return fetchWithAuth('/safe-locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── SAFE LOCATIONS (ĐIỂM TRÚ ẨN AN TOÀN) ──────────────────────────────────

export async function updateSafeLocation(
  id: string,
  payload: Partial<{
    name: string;
    type: string;
    address: string;
    capacity: number;
    currentOccupancy: number;
    status: string;
    areaId: string;
    location: { type: 'Point'; coordinates: [number, number] };
  }>
): Promise<{ success: boolean; data: SafeLocationItem; message?: string }> {
  return fetchWithAuth(`/safe-locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSafeLocation(
  id: string
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/safe-locations/${id}`, {
    method: 'DELETE',
  });
}

// ─── TACTICAL REALTIME CHAT (TRAO ĐỔI TÁC CHIẾN ADMIN & AUTHORITY) ───────────

import type { ChatMessageItem, ChatConversationItem, ChatSSEPayload } from '../types/chat';

export async function fetchChatConversations(): Promise<{ success: boolean; data: ChatConversationItem[] }> {
  return fetchWithAuth<{ success: boolean; data: ChatConversationItem[] }>('/chat/conversations', {
    method: 'GET',
  });
}

export async function fetchChatMessages(params: { channel?: string; recipientId?: string }): Promise<{
  success: boolean;
  data: { channel: string; messages: ChatMessageItem[] };
}> {
  const query = new URLSearchParams();
  if (params.channel) query.set('channel', params.channel);
  if (params.recipientId) query.set('recipientId', params.recipientId);

  return fetchWithAuth(`/chat/messages?${query.toString()}`, {
    method: 'GET',
  });
}

export async function sendChatMessage(payload: {
  content: string;
  recipientId?: string;
  channel?: string;
}): Promise<{ success: boolean; data: ChatMessageItem }> {
  return fetchWithAuth('/chat/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function markChatMessagesRead(payload: {
  channel?: string;
  partnerId?: string;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth('/chat/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Đăng ký luồng tin nhắn thời gian thực (SSE) - Tự động cập nhật không cần F5
 */
export function subscribeChatRealtimeEvents(
  onEvent: (payload: ChatSSEPayload) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource(`${API_BASE}/chat/stream`, { withCredentials: true });
    eventSource.onopen = () => {
      if (onStatusChange) onStatusChange(true);
    };
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.action) {
          onEvent(payload as ChatSSEPayload);
        }
      } catch (err) {
        console.warn('[ChatSSE] Lỗi giải mã gói tin thời gian thực:', err);
      }
    };
    eventSource.onerror = () => {
      if (onStatusChange) onStatusChange(false);
      // EventSource tự động reconnect khi đường truyền chập chờn
    };
  } catch (err) {
    if (onStatusChange) onStatusChange(false);
    console.warn('[ChatSSE] Không thể kết nối EventSource:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * Cập nhật hồ sơ cá nhân và chức vụ, địa bàn cán bộ (lưu trực tiếp vào MongoDB)
 */
export async function updateUserProfile(payload: {
  fullName?: string;
  phone?: string;
  email?: string;
  isPhoneVerified?: boolean;
  authority?: {
    position?: string;
    organizationName?: string;
    areaName?: string;
    provinceCode?: number;
    wardCode?: number;
  };
}): Promise<{ success: boolean; data?: User; message?: string }> {
  return fetchWithAuth<{ success: boolean; data?: User; message?: string }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Gửi mã OTP xác thực số điện thoại cán bộ
 */
export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; message?: string; otp?: string }> {
  return fetchWithAuth<{ success: boolean; message?: string; otp?: string }>('/users/me/send-phone-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/**
 * Xác thực mã OTP số điện thoại cán bộ và cập nhật vào Database
 */
export async function verifyPhoneOtp(phone: string, otp: string): Promise<{ success: boolean; message?: string; user?: User }> {
  return fetchWithAuth<{ success: boolean; message?: string; user?: User }>('/users/me/verify-phone-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp }),
  });
}

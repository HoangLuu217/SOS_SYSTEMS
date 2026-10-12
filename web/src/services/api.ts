import type { LoginResponse } from '../types/auth';
import type {
  SosRequestItem,
  AdminOverviewStats,
  VehicleItem,
  RescueTeamItem,
  AlertItem,
  AuditLogItem,
  AdministrativeAreaItem,
  AuthorityOrgItem,
} from '../types/dashboard';

const API_BASE = '/api';
const DIRECT_BACKEND = 'http://127.0.0.1:5000/api';

/**
 * Helper gọi API kèm Header Authorization token tự động và xử lý fallback URL
 */
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('sos_access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, mergedOptions);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Lỗi xử lý yêu cầu máy chủ');
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      const directRes = await fetch(`${DIRECT_BACKEND}${endpoint}`, mergedOptions);
      const directData = await directRes.json();
      if (!directRes.ok) {
        throw new Error(directData.message || 'Lỗi xử lý yêu cầu máy chủ');
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Đăng nhập không thành công');
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      const directRes = await fetch(`${DIRECT_BACKEND}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const directData = await directRes.json();
      if (!directRes.ok) {
        throw new Error(directData.message || 'Đăng nhập không thành công');
      }
      return directData;
    }
    throw err;
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Bỏ qua lỗi mạng khi logout
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    if (res.ok) return true;
  } catch {
    // Bỏ qua
  }

  try {
    const res = await fetch('http://127.0.0.1:5000/health', { method: 'GET' });
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
  return fetchWithAuth(endpoint, { method: 'GET' });
}

export async function updateUserStatus(userId: string, status: string): Promise<{ success: boolean }> {
  return fetchWithAuth(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
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

// ─── ADMINISTRATIVE AREAS & ORGANIZATIONS ────────────────────────────────────

export async function fetchAdministrativeAreas(): Promise<{ success: boolean; data: AdministrativeAreaItem[] }> {
  return fetchWithAuth('/administrative-areas', { method: 'GET' });
}

export async function fetchAuthorityOrganizations(): Promise<{ success: boolean; data: AuthorityOrgItem[] }> {
  return fetchWithAuth('/authority-organizations', { method: 'GET' });
}

// ─── AUDIT LOGS (CƠ SỞ DỮ LIỆU THẬT) ─────────────────────────────────────────

export async function fetchAuditLogs(): Promise<{ success: boolean; data: { logs: AuditLogItem[] } }> {
  return fetchWithAuth('/audit-logs', { method: 'GET' });
}

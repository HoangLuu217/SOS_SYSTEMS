import { fetchWithAuth } from './client';
import type { AdminOverviewStats, AuditLogItem } from '@/types/dashboard';

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

export async function fetchAuditLogs(): Promise<{ success: boolean; data: { logs: AuditLogItem[] } }> {
  const raw = await fetchWithAuth<any>('/audit-logs', { method: 'GET' });
  if (Array.isArray(raw.data)) {
    return {
      success: raw.success,
      data: { logs: raw.data },
    };
  }
  return raw;
}

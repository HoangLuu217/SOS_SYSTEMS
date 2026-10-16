import { fetchWithAuth } from './client';
import type { AdministrativeAreaItem, AuthorityOrgItem } from '@/types/dashboard';

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

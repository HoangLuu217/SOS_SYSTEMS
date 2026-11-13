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
  level?: 'PROVINCE' | 'DISTRICT' | 'WARD';
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
    if (params.level) q.append('level', params.level);

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

export interface AreaScopeNode {
  _id: string;
  name: string;
  code?: string;
  type?: string;
  parentId?: { _id: string; name?: string } | string | null;
}

const normalizeAreaText = (value?: string): string =>
  (value || '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function getParentAreaId(area?: AreaScopeNode | null): string | null {
  if (!area?.parentId) return null;
  if (typeof area.parentId === 'string') return area.parentId;
  return area.parentId._id ? String(area.parentId._id) : null;
}

export function findRootProvinceId<T extends AreaScopeNode>(
  area: T | undefined,
  areaById: Map<string, T>
): string | null {
  const visited = new Set<string>();
  let current: T | undefined = area;
  while (current) {
    const id = String(current._id);
    if (visited.has(id)) break;
    visited.add(id);
    if (current.type === 'PROVINCE') return id;
    const parentId = getParentAreaId(current);
    current = parentId ? areaById.get(parentId) : undefined;
  }
  return null;
}

/**
 * Extracts Đà Nẵng root province and its DB child wards from `fetchAdministrativeAreas()` results.
 */
export function getDaNangAreaScope<T extends AreaScopeNode>(areas: T[]): {
  areaById: Map<string, T>;
  daNangProvince: T | null;
  daNangProvinceId: string;
  daNangWards: T[];
  daNangAreaIds: Set<string>;
} {
  const areaById = new Map<string, T>();
  areas.forEach((a) => {
    if (a?._id) areaById.set(String(a._id), a);
  });

  const provinces = areas.filter((a) => a.type === 'PROVINCE');
  const daNangProvince =
    provinces.find(
      (p) => (p.code || '').trim().toUpperCase() === 'DANANG' || normalizeAreaText(p.name).includes('da nang')
    ) ||
    (provinces.length === 1 ? provinces[0] : null);
  const daNangProvinceId = daNangProvince ? String(daNangProvince._id) : '';

  const daNangAreaIds = new Set<string>();
  if (daNangProvinceId) daNangAreaIds.add(daNangProvinceId);

  const daNangWards = areas
    .filter((a) => {
      if (a.type !== 'WARD') return false;
      if (!daNangProvinceId) return true;
      const rootProvId = findRootProvinceId(a, areaById);
      const directParentId = getParentAreaId(a);
      return (
        rootProvId === daNangProvinceId ||
        directParentId === daNangProvinceId ||
        (provinces.length <= 1 && !directParentId)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

  daNangWards.forEach((w) => daNangAreaIds.add(String(w._id)));

  return {
    areaById,
    daNangProvince,
    daNangProvinceId,
    daNangWards,
    daNangAreaIds,
  };
}

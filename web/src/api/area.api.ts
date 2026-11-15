import { fetchWithAuth } from './client';
import type { AdministrativeAreaItem, AuthorityOrgItem } from '@/types/dashboard';

const AREAS_CACHE_TTL_MS = 15 * 1000;
let cachedAreasResponse: { timestamp: number; value: { success: boolean; data: AdministrativeAreaItem[] } } | null = null;
let areasInFlightPromise: Promise<{ success: boolean; data: AdministrativeAreaItem[] }> | null = null;

export function invalidateAdministrativeAreasCache() {
  cachedAreasResponse = null;
}

export async function fetchAdministrativeAreas(options?: {
  force?: boolean;
}): Promise<{ success: boolean; data: AdministrativeAreaItem[] }> {
  const now = Date.now();
  if (!options?.force && cachedAreasResponse && now - cachedAreasResponse.timestamp < AREAS_CACHE_TTL_MS) {
    return cachedAreasResponse.value;
  }
  if (!options?.force && areasInFlightPromise) {
    return areasInFlightPromise;
  }

  areasInFlightPromise = fetchWithAuth<{ success: boolean; data: AdministrativeAreaItem[] }>('/administrative-areas', {
    method: 'GET',
  })
    .then((res) => {
      if (res?.success && Array.isArray(res.data)) {
        cachedAreasResponse = { timestamp: Date.now(), value: res };
      }
      return res;
    })
    .finally(() => {
      areasInFlightPromise = null;
    });

  return areasInFlightPromise;
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

export interface ProvinceMapBundleArea {
  _id: string;
  name: string;
  code: string;
  type: 'PROVINCE' | 'DISTRICT' | 'WARD';
  parentId?: string | null;
  status?: string;
  boundary?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
}

export async function fetchProvinceMapBundle(
  provinceName: string = 'Thành phố Đà Nẵng'
): Promise<{
  success: boolean;
  data: {
    province: ProvinceMapBundleArea | null;
    wards: ProvinceMapBundleArea[];
    source?: string;
  } | null;
}> {
  try {
    const q = new URLSearchParams({ province: provinceName });
    const res = await fetchWithAuth<any>(`/administrative-areas/map-bundle?${q.toString()}`, {
      method: 'GET',
    });
    if (res && res.success && res.data) {
      return { success: true, data: res.data };
    }
    return { success: false, data: null };
  } catch (e) {
    console.warn('Lỗi tải map-bundle từ Backend DB:', e);
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
  status?: string;
  parentId?: { _id: string; name?: string } | string | null;
}

const normalizeAreaText = (value?: string): string =>
  (value || '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const isDaNangProvinceCode = (code?: string): boolean => {
  const upper = (code || '').trim().toUpperCase();
  return upper === 'DANANG' || upper === 'VN-48' || upper === 'VN48' || upper === '48';
};

const isDaNangProvinceNode = (area: AreaScopeNode): boolean =>
  area.type === 'PROVINCE' &&
  (isDaNangProvinceCode(area.code) || normalizeAreaText(area.name).includes('da nang'));

/**
 * Ranks duplicate DB ward records sharing the same normalized name so
 * official GSO bounded codes (e.g. VN48-20194) beat non-bounded sync-api clones (VN48-W01).
 */
const getWardRecordPriority = (ward: AreaScopeNode): number => {
  const code = (ward.code || '').trim().toUpperCase();
  if (/^VN\d+-\d+$/i.test(code)) return 3;
  if (/^VN\d+-W\d+$/i.test(code)) return 1;
  return 2;
};

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
 * Resolves the normalized `<select>` value for a selected ward / special zone,
 * returning '' when the current selection represents province-wide ('PROVINCE' / 'ALL').
 */
export function getSelectedWardValue(
  selectedAreaId: string | undefined,
  daNangWardIds: Set<string>,
  canonicalAreaIdMap: Map<string, string>
): string {
  if (!selectedAreaId) return '';
  const canonicalId = canonicalAreaIdMap.get(String(selectedAreaId)) || String(selectedAreaId);
  return daNangWardIds.has(canonicalId) ? canonicalId : '';
}

/**
 * Matches a record (shelter, hazard, etc.) against an Admin-selected Đà Nẵng ward/special zone name,
 * handling sibling DB IDs via `canonicalAreaIdMap` and "Đặc khu Hoàng Sa" without false-matching
 * "Đường Hoàng Sa" street addresses in Sơn Trà.
 */
export function matchesSelectedWardFilter<T extends AreaScopeNode>(
  itemAreaIdObjOrStr: any,
  searchableTexts: Array<string | undefined | null>,
  selectedAreaName: string,
  daNangWards: T[],
  canonicalAreaIdMap: Map<string, string>
): boolean {
  if (!selectedAreaName || selectedAreaName === 'ALL') return true;
  const rawLower = selectedAreaName.toLowerCase().trim();
  const targetClean = rawLower
    .replace(/^(tỉnh|thành phố|tp\.?|phường|xã|thị trấn)\s+/i, '')
    .trim();

  const rawItemAreaId = typeof itemAreaIdObjOrStr === 'object' ? itemAreaIdObjOrStr?._id : itemAreaIdObjOrStr;
  const matchedWard = daNangWards.find((w) => w.name === selectedAreaName);
  if (matchedWard && rawItemAreaId) {
    const itemCanonical = canonicalAreaIdMap.get(String(rawItemAreaId)) || String(rawItemAreaId);
    const wardCanonical = canonicalAreaIdMap.get(String(matchedWard._id)) || String(matchedWard._id);
    if (itemCanonical === wardCanonical || String(rawItemAreaId) === String(matchedWard._id)) {
      return true;
    }
  }

  const removeAccents = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const combinedText = searchableTexts
    .filter((t): t is string => Boolean(t && typeof t === 'string'))
    .join(' ')
    .toLowerCase();

  if (rawLower.startsWith('đặc khu')) {
    const specialZoneAliases = ['đặc khu hoàng sa', 'huyện hoàng sa', 'quần đảo hoàng sa', 'đảo hoàng sa'];
    const targetAccentless = removeAccents(targetClean);
    const combinedAccentless = removeAccents(combinedText);
    if (
      specialZoneAliases.some((alias) => combinedText.includes(alias)) ||
      combinedText.includes(rawLower) ||
      combinedAccentless.includes(targetAccentless)
    ) {
      return true;
    }
  } else if (
    combinedText.includes(targetClean) ||
    removeAccents(combinedText).includes(removeAccents(targetClean))
  ) {
    return true;
  }

  const areaName =
    (typeof itemAreaIdObjOrStr === 'object' && (itemAreaIdObjOrStr?.name || itemAreaIdObjOrStr?.districtName)) || '';
  if (areaName && typeof areaName === 'string') {
    const cleanArea = areaName.toLowerCase();
    const strippedArea = cleanArea.replace(/^(đặc khu|quận|huyện|phường|xã|thị trấn)\s+/i, '').trim();
    const strippedTarget = targetClean.replace(/^(đặc khu|quận|huyện)\s+/i, '').trim();
    if (
      cleanArea.includes(targetClean) ||
      removeAccents(cleanArea).includes(removeAccents(targetClean)) ||
      (strippedTarget && strippedArea === strippedTarget)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts Đà Nẵng canonical root province and its deduplicated DB child sub-units
 * (Phường/Xã + leaf Đặc khu such as Đặc khu Hoàng Sa) across all Đà Nẵng province trees
 * (e.g. VN-48 and legacy DANANG) from `fetchAdministrativeAreas()`.
 */
export function getDaNangAreaScope<T extends AreaScopeNode>(areas: T[]): {
  areaById: Map<string, T>;
  daNangProvince: T | null;
  daNangProvinceId: string;
  daNangProvinceIds: Set<string>;
  daNangWards: T[];
  daNangWardIds: Set<string>;
  daNangAreaIds: Set<string>;
  canonicalAreaIdMap: Map<string, string>;
} {
  const areaById = new Map<string, T>();
  areas.forEach((a) => {
    if (a?._id) areaById.set(String(a._id), a);
  });

  const activeAreas = areas.filter((a) => a && a.status !== 'INACTIVE');
  const provinces = activeAreas.filter((a) => a.type === 'PROVINCE');
  const matchedDaNangProvinces = provinces.filter(isDaNangProvinceNode);
  const daNangProvinces =
    matchedDaNangProvinces.length > 0
      ? matchedDaNangProvinces
      : provinces.length === 1
        ? [provinces[0]]
        : [];
  const daNangProvinceIds = new Set(daNangProvinces.map((p) => String(p._id)));

  // Prefer the Đà Nẵng province tree that owns the most sub-areas in DB (tie-break: VN-48 > DANANG)
  const descendantCounts = new Map<string, number>();
  activeAreas.forEach((a) => {
    if (a.type === 'PROVINCE') return;
    const rootProvId = findRootProvinceId(a, areaById);
    if (rootProvId && daNangProvinceIds.has(rootProvId)) {
      descendantCounts.set(rootProvId, (descendantCounts.get(rootProvId) || 0) + 1);
    }
  });

  const daNangProvince =
    [...daNangProvinces].sort((a, b) => {
      const countDiff = (descendantCounts.get(String(b._id)) || 0) - (descendantCounts.get(String(a._id)) || 0);
      if (countDiff !== 0) return countDiff;
      const aCode = (a.code || '').trim().toUpperCase();
      const bCode = (b.code || '').trim().toUpperCase();
      const aScore = /^VN-?\d+$/i.test(aCode) ? 2 : aCode === 'DANANG' ? 1 : 0;
      const bScore = /^VN-?\d+$/i.test(bCode) ? 2 : bCode === 'DANANG' ? 1 : 0;
      return bScore - aScore;
    })[0] || null;

  const daNangProvinceId = daNangProvince ? String(daNangProvince._id) : '';
  const daNangAreaIds = new Set<string>(daNangProvinceIds);
  const canonicalAreaIdMap = new Map<string, string>();
  if (daNangProvinceId) {
    daNangProvinceIds.forEach((id) => canonicalAreaIdMap.set(id, daNangProvinceId));
  }

  const parentIdsWithWards = new Set<string>();
  activeAreas.forEach((a) => {
    if (a.type === 'WARD') {
      const pid = getParentAreaId(a);
      if (pid) parentIdsWithWards.add(pid);
    }
  });

  const rawDaNangWards: T[] = [];
  activeAreas.forEach((a) => {
    const rootProvId = findRootProvinceId(a, areaById);
    const directParentId = getParentAreaId(a);
    const belongsToDaNang =
      daNangProvinceIds.size === 0 ||
      (rootProvId !== null && daNangProvinceIds.has(rootProvId)) ||
      (directParentId !== null && daNangProvinceIds.has(directParentId)) ||
      (provinces.length <= 1 && !directParentId);

    if (!belongsToDaNang) return;

    const idStr = String(a._id);
    if (a.type === 'DISTRICT' || a.type === 'WARD') {
      daNangAreaIds.add(idStr);
    }
    // Include all WARDs plus leaf DISTRICTs with no child WARDs (e.g. Đặc khu Hoàng Sa)
    if (a.type === 'WARD' || (a.type === 'DISTRICT' && !parentIdsWithWards.has(idStr))) {
      rawDaNangWards.push(a);
    }
  });

  // Deduplicate exact same-name sub-unit entries across sibling trees/sync duplicates while preserving canonical IDs
  const groupedByName = new Map<string, T[]>();
  rawDaNangWards.forEach((w) => {
    const key = normalizeAreaText(w.name) || String(w._id);
    const bucket = groupedByName.get(key) || [];
    bucket.push(w);
    groupedByName.set(key, bucket);
  });

  const daNangWards: T[] = [];
  const daNangWardIds = new Set<string>();
  groupedByName.forEach((group) => {
    group.sort((a, b) => getWardRecordPriority(b) - getWardRecordPriority(a));
    const canonical = group[0];
    const canonicalId = String(canonical._id);
    daNangWards.push(canonical);
    daNangWardIds.add(canonicalId);
    group.forEach((item) => {
      const itemId = String(item._id);
      daNangWardIds.add(itemId);
      canonicalAreaIdMap.set(itemId, canonicalId);
    });
  });

  daNangWards.sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

  return {
    areaById,
    daNangProvince,
    daNangProvinceId,
    daNangProvinceIds,
    daNangWards,
    daNangWardIds,
    daNangAreaIds,
    canonicalAreaIdMap,
  };
}

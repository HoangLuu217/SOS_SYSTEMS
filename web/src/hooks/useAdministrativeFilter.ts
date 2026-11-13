import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AdministrativeAreaItem, RescueTeamItem } from '@/types/dashboard';
import { fetchAdministrativeAreas } from '@/api';
import {
  fetchVietnamProvincesService,
  fetchProvinceSubUnitsService,
  type VietnamProvinceItem,
  type ProvinceSubUnitItem,
} from '@/services/geoapifyBoundariesService';

export interface WardOption {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

const normalizeStr = (s?: string | null): string => {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

const cleanAreaName = (s?: string | null): string => {
  if (!s) return '';
  return s.toLowerCase().replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|thành phố|tỉnh|tp\.?)\s+/i, '').trim();
};

export function useAdministrativeFilter(options: {
  isAdmin: boolean;
  userAreaId?: string;
  userAreaName?: string;
}) {
  const { isAdmin, userAreaId, userAreaName } = options;

  // 1. Dữ liệu từ API Open-API Vietnam & Database MongoDB
  const [provinces, setProvinces] = useState<VietnamProvinceItem[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(false);

  const [dbAreas, setDbAreas] = useState<AdministrativeAreaItem[]>([]);
  const [dbAreasLoading, setDbAreasLoading] = useState(false);

  // 2. State bộ lọc được chọn
  const [selectedProvince, setSelectedProvince] = useState<string>('ALL');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('ALL');

  // 3. Danh sách xã / phường / quận huyện của Tỉnh đã chọn (được gọi qua API động)
  const [wards, setWards] = useState<WardOption[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);

  // Map ID -> AdministrativeAreaItem tra cứu O(1)
  const areaMap = useMemo(() => {
    const map = new Map<string, AdministrativeAreaItem>();
    dbAreas.forEach((a) => {
      if (a && a._id) map.set(String(a._id), a);
    });
    return map;
  }, [dbAreas]);

  // Cán bộ địa phương: Tìm khu vực quản lý
  const managedArea = useMemo(() => {
    if (isAdmin) return null;
    if (userAreaId) {
      const byId = dbAreas.find((a) => String(a._id) === String(userAreaId) || a.code === userAreaId);
      if (byId) return byId;
    }
    if (userAreaName) {
      const cleanUser = cleanAreaName(userAreaName);
      const byName = dbAreas.find((a) => {
        const cleanArea = cleanAreaName(a.name);
        return cleanUser && (cleanArea.includes(cleanUser) || cleanUser.includes(cleanArea));
      });
      if (byName) return byName;
    }
    return null;
  }, [dbAreas, isAdmin, userAreaId, userAreaName]);

  // Tải danh sách Tỉnh/Thành phố từ API & Khu vực hành chính từ DB khi khởi tạo
  useEffect(() => {
    let isMounted = true;
    async function initData() {
      try {
        setProvincesLoading(true);
        setDbAreasLoading(true);

        const [provList, areasRes] = await Promise.all([
          fetchVietnamProvincesService().catch(() => []),
          fetchAdministrativeAreas().catch(() => ({ success: false, data: [] })),
        ]);

        if (!isMounted) return;

        if (Array.isArray(provList) && provList.length > 0) {
          setProvinces(provList);
        }

        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setDbAreas(areasRes.data);
        }
      } catch (err) {
        console.warn('Lỗi khi tải dữ liệu Tỉnh / TP & Địa bàn:', err);
      } finally {
        if (isMounted) {
          setProvincesLoading(false);
          setDbAreasLoading(false);
        }
      }
    }

    initData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Truy vết Tỉnh/Thành phố gốc của một khu vực (Xã -> Huyện -> Tỉnh)
  const getProvinceOfArea = useCallback(
    (areaOrId: any): string | null => {
      if (!areaOrId) return null;
      const id = typeof areaOrId === 'object' && areaOrId ? areaOrId._id || areaOrId.code : areaOrId;
      let curr = areaMap.get(String(id));
      let depth = 0;
      while (curr && depth < 5) {
        if (curr.type === 'PROVINCE') return curr.name;
        const pId = typeof curr.parentId === 'object' && curr.parentId ? (curr.parentId as any)._id : curr.parentId;
        if (!pId) break;
        curr = areaMap.get(String(pId));
        depth++;
      }
      return null;
    },
    [areaMap]
  );

  // Khi chọn Tỉnh/Thành phố khác: TỰ ĐỘNG GỌI API LẤY CÁC XÃ, PHƯỜNG CỦA TỈNH ĐÓ
  useEffect(() => {
    let isMounted = true;

    async function loadWardsForProvince() {
      // 1. Nếu chọn 'ALL' (Tất cả Tỉnh/TP): Lấy toàn bộ xã/phường từ DB
      if (selectedProvince === 'ALL') {
        const defaultWards: WardOption[] = dbAreas
          .filter((a) => a.type !== 'PROVINCE')
          .map((a) => ({
            id: String(a._id),
            name: a.name,
            code: a.code,
            type: a.type,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

        setWards(defaultWards);
        return;
      }

      // 2. Nếu chọn một Tỉnh/TP cụ thể: Gọi API fetchProvinceSubUnitsService
      setWardsLoading(true);
      try {
        const provObj = provinces.find((p) => p.name === selectedProvince);
        const placeId = provObj?.placeId || `prov-${provObj?.code || ''}`;
        const provCode = provObj?.code;

        // Gọi trực tiếp API Wards của Tỉnh từ Open-API Vietnam
        const apiUnits: ProvinceSubUnitItem[] = await fetchProvinceSubUnitsService(
          placeId,
          selectedProvince,
          provCode
        );

        if (!isMounted) return;

        // Chuẩn hóa danh sách xã/phường từ API
        const wardList: WardOption[] = apiUnits.map((u) => ({
          id: u.name, // Dùng tên xã/phường làm định danh lọc thống nhất
          name: u.name,
          code: u.code,
          type: u.type,
        }));

        const seenNames = new Set(wardList.map((w) => normalizeStr(cleanAreaName(w.name))));

        // Hợp nhất thêm các xã/phường có trong DB của Tỉnh này (đảm bảo không sót dữ liệu nghiệp vụ)
        dbAreas.forEach((dbA) => {
          if (dbA.type === 'PROVINCE') return;
          const provName = getProvinceOfArea(dbA._id);
          const isBelong = provName === selectedProvince || (selectedProvince && dbA.name && selectedProvince.includes(dbA.name));
          if (isBelong) {
            const cleanKey = normalizeStr(cleanAreaName(dbA.name));
            if (!seenNames.has(cleanKey)) {
              seenNames.add(cleanKey);
              wardList.push({
                id: String(dbA._id),
                name: dbA.name,
                code: dbA.code,
                type: dbA.type,
              });
            }
          }
        });

        wardList.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        setWards(wardList);
      } catch (err) {
        console.warn(`Lỗi khi gọi API xã/phường cho ${selectedProvince}:`, err);
        // Fallback lấy từ DB
        const fallback = dbAreas
          .filter((a) => a.type !== 'PROVINCE' && getProvinceOfArea(a._id) === selectedProvince)
          .map((a) => ({ id: String(a._id), name: a.name, code: a.code, type: a.type }));
        setWards(fallback);
      } finally {
        if (isMounted) {
          setWardsLoading(false);
        }
      }
    }

    loadWardsForProvince();
    return () => {
      isMounted = false;
    };
  }, [selectedProvince, provinces, dbAreas, getProvinceOfArea]);

  // Đổi Tỉnh/Thành phố thì tự động reset xã/phường về 'ALL'
  const handleSelectProvince = useCallback((provName: string) => {
    setSelectedProvince(provName);
    setSelectedAreaId('ALL');
  }, []);

  const handleSelectArea = useCallback((areaId: string) => {
    setSelectedAreaId(areaId);
  }, []);

  const resetFilters = useCallback(() => {
    setSelectedProvince('ALL');
    setSelectedAreaId('ALL');
  }, []);

  // Kiểm tra Đội cứu hộ có thuộc Tỉnh & Xã/Phường đang chọn hay không
  const isTeamInTargetArea = useCallback(
    (team: RescueTeamItem | any): boolean => {
      if (!team) return true;

      // 1. Phân quyền Local Authority: Khóa chặt theo địa phương cán bộ phụ trách
      if (!isAdmin && (managedArea || userAreaName || userAreaId)) {
        const targetAreaId = managedArea?._id || userAreaId;
        const targetAreaName = cleanAreaName(userAreaName || managedArea?.name || '');
        const normTarget = normalizeStr(targetAreaName);

        const teamAreaObj = typeof team?.areaId === 'object' && team?.areaId !== null ? team.areaId : null;
        const teamAreaId = teamAreaObj?._id || (typeof team?.areaId === 'string' ? team.areaId : null);
        const teamAreaName = cleanAreaName(teamAreaObj?.name || (team as any)?.areaName || '');
        const teamName = cleanAreaName(team?.name || '');

        const matchId = targetAreaId && (String(teamAreaId) === String(targetAreaId) || teamAreaId === managedArea?.code);
        const matchName = Boolean(
          targetAreaName &&
            (teamAreaName.includes(targetAreaName) ||
              teamName.includes(targetAreaName) ||
              normalizeStr(teamAreaName).includes(normTarget) ||
              normalizeStr(teamName).includes(normTarget))
        );

        return Boolean(matchId || matchName);
      }

      // 2. Phân quyền Admin:
      if (isAdmin) {
        // 2A. Nếu đang chọn Xã / Phường cụ thể
        if (selectedAreaId && selectedAreaId !== 'ALL') {
          const selectedWardObj = wards.find((w) => w.id === selectedAreaId || w.code === selectedAreaId || w.name === selectedAreaId);
          const targetWardName = cleanAreaName(selectedWardObj?.name || selectedAreaId);
          const normWard = normalizeStr(targetWardName);

          const teamAreaObj = typeof team?.areaId === 'object' && team?.areaId !== null ? team.areaId : null;
          const teamAreaId = teamAreaObj?._id || (typeof team?.areaId === 'string' ? team.areaId : null);
          const teamAreaName = cleanAreaName(teamAreaObj?.name || (team as any)?.areaName || '');
          const teamName = cleanAreaName(team?.name || '');

          const matchId = selectedWardObj && (String(teamAreaId) === String(selectedWardObj.id) || teamAreaId === selectedWardObj.code);
          const matchName = Boolean(
            targetWardName &&
              (teamAreaName.includes(targetWardName) ||
                teamName.includes(targetWardName) ||
                normalizeStr(teamAreaName).includes(normWard) ||
                normalizeStr(teamName).includes(normWard))
          );

          return Boolean(matchId || matchName);
        }

        // 2B. Nếu đang chọn Tỉnh / TP (và Xã / Phường là ALL)
        if (selectedProvince && selectedProvince !== 'ALL') {
          const teamAreaObj = typeof team?.areaId === 'object' && team?.areaId !== null ? team.areaId : null;
          const teamAreaId = teamAreaObj?._id || (typeof team?.areaId === 'string' ? team.areaId : null);
          const provFromArea = getProvinceOfArea(teamAreaId);
          if (provFromArea && cleanAreaName(provFromArea) === cleanAreaName(selectedProvince)) {
            return true;
          }

          const provClean = cleanAreaName(selectedProvince);
          const normProv = normalizeStr(provClean);
          const teamAreaName = cleanAreaName(teamAreaObj?.name || (team as any)?.areaName || '');
          const teamName = cleanAreaName(team?.name || '');

          if (provClean && (teamAreaName.includes(provClean) || teamName.includes(provClean) || normalizeStr(teamAreaName).includes(normProv) || normalizeStr(teamName).includes(normProv))) {
            return true;
          }

          return false;
        }
      }

      return true;
    },
    [isAdmin, managedArea, userAreaName, userAreaId, selectedAreaId, selectedProvince, wards, getProvinceOfArea]
  );

  // Kiểm tra Hồ sơ cứu hộ viên có thuộc Tỉnh & Xã/Phường đang chọn hay không
  const isApplicantInTargetArea = useCallback(
    (app: any): boolean => {
      if (!app) return true;

      if (isAdmin) {
        // 2A. Nếu đang chọn Xã / Phường cụ thể
        if (selectedAreaId && selectedAreaId !== 'ALL') {
          const selectedWardObj = wards.find((w) => w.id === selectedAreaId || w.code === selectedAreaId || w.name === selectedAreaId);
          const targetWardName = cleanAreaName(selectedWardObj?.name || selectedAreaId);
          const normWard = normalizeStr(targetWardName);

          const appLocation = cleanAreaName(`${app.communeName || ''} ${app.areaName || ''} ${app.address || ''}`);
          const matchId = selectedWardObj && app.areaId && (String(app.areaId) === String(selectedWardObj.id) || app.areaId === selectedWardObj.code);
          const matchName = Boolean(targetWardName && (appLocation.includes(targetWardName) || normalizeStr(appLocation).includes(normWard)));

          return Boolean(matchId || matchName);
        }

        // 2B. Nếu đang chọn Tỉnh / TP
        if (selectedProvince && selectedProvince !== 'ALL') {
          const provFromArea = app.areaId ? getProvinceOfArea(app.areaId) : null;
          if (provFromArea && cleanAreaName(provFromArea) === cleanAreaName(selectedProvince)) {
            return true;
          }

          const provClean = cleanAreaName(selectedProvince);
          const normProv = normalizeStr(provClean);
          const appLocation = cleanAreaName(`${app.provinceName || ''} ${app.areaName || ''} ${app.address || ''}`);

          if (provClean && (appLocation.includes(provClean) || normalizeStr(appLocation).includes(normProv))) {
            return true;
          }

          return false;
        }
      }

      return true;
    },
    [isAdmin, selectedAreaId, selectedProvince, wards, getProvinceOfArea]
  );

  return {
    provinces,
    provincesLoading,
    selectedProvince,
    setSelectedProvince: handleSelectProvince,
    wards,
    wardsLoading,
    selectedAreaId,
    setSelectedAreaId: handleSelectArea,
    dbAreas,
    dbAreasLoading,
    managedArea,
    isTeamInTargetArea,
    isApplicantInTargetArea,
    resetFilters,
  };
}


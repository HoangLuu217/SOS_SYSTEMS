import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  MapPin,
  Search,
  ExternalLink,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Trash2,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  Edit,
  RotateCcw,
  EyeOff
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { SafeLocationItem, AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchSafeLocations,
  createSafeLocation,
  updateSafeLocation,
  deleteSafeLocation,
  fetchAdministrativeAreas,
  fetchProvincesV2,
  type ProvinceV2,
} from '@/api';
import { resolveGoogleMapsInput } from '@/utils/mapLinkParser';
import { domainDService, JURISDICTION_CONFIGS, type JurisdictionConfig } from '@/services/domainDService';
import { FALLBACK_SHELTERS } from '@/constants';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import {
  ShelterTypeIcon,
  SHELTER_TYPE_CARDS,
  ShelterMiniMap,
} from './shelterConstants';
import './SheltersView.css';

export interface SheltersViewProps {
  user?: User;
  onOpenMap: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

const EMPTY_AREAS: AdministrativeAreaItem[] = [];

export const SheltersView: React.FC<SheltersViewProps> = ({
  user,
  onOpenMap,
  areas: propAreas = EMPTY_AREAS,
}) => {
  const { showToast, setConfirmModal, renderGlobalModals } = useGlobalModals();
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);
  const [shelterFilter, setShelterFilter] = useState<'ALL' | 'ACTIVE' | 'FULL' | 'MAINTENANCE' | 'INACTIVE'>('ALL');
  const [shelterTypeFilter, setShelterTypeFilter] = useState<'ALL' | 'EVACUATION_CENTER' | 'HOSPITAL' | 'SHELTER' | 'RESCUE_STATION' | 'MEETING_POINT'>('ALL');
  const [shelterManagementScope, setShelterManagementScope] = useState<'LOCAL' | 'CITY'>('LOCAL');
  const [selectedAdminProvince, setSelectedAdminProvince] = useState<string>('ALL');
  const [allProvinces, setAllProvinces] = useState<ProvinceV2[]>([]);
  const [shelterSearchText, setShelterSearchText] = useState('');
  const [shelterPage, setShelterPage] = useState<number>(1);
  const [shelterSortField, setShelterSortField] = useState<'createdAt' | 'name' | 'capacity' | 'occupancyRate' | 'district' | 'address' | 'status'>('createdAt');
  const [shelterSortOrder, setShelterSortOrder] = useState<'asc' | 'desc'>('desc');
  const [shelterJumpInputPage, setShelterJumpInputPage] = useState<string>('');

  // Modal Chi tiết Điểm trú ẩn
  const [detailShelter, setDetailShelter] = useState<SafeLocationItem | null>(null);

  // Chọn hàng loạt (Bulk selection)
  const [selectedShelterIds, setSelectedShelterIds] = useState<string[]>([]);
  const [isBulkShelterAction, setIsBulkShelterAction] = useState<boolean>(false);

  // Modal Tạo Điểm Trú Ẩn Mới
  const [isCreateShelterOpen, setIsCreateShelterOpen] = useState(false);
  const [createShelterName, setCreateShelterName] = useState('');
  const [createShelterType, setCreateShelterType] = useState<'EVACUATION_CENTER' | 'HOSPITAL' | 'SHELTER' | 'RESCUE_STATION' | 'MEETING_POINT'>('EVACUATION_CENTER');
  const [createShelterAreaId, setCreateShelterAreaId] = useState('');
  const [createShelterAddress, setCreateShelterAddress] = useState('');
  const [createShelterCapacity, setCreateShelterCapacity] = useState<number>(200);
  const [createShelterOccupancy, setCreateShelterOccupancy] = useState<number>(0);
  const [createShelterStatus, setCreateShelterStatus] = useState<'ACTIVE' | 'FULL' | 'MAINTENANCE' | 'INACTIVE'>('ACTIVE');
  const [createShelterLat, setCreateShelterLat] = useState<number>(16.0570);
  const [createShelterLng, setCreateShelterLng] = useState<number>(108.2170);
  const [createShelterNotes, setCreateShelterNotes] = useState('');
  const [createShelterMapLinkInput, setCreateShelterMapLinkInput] = useState('');
  const [resolvingCreateShelterMapLink, setResolvingCreateShelterMapLink] = useState(false);
  const [createShelterMapLinkStatus, setCreateShelterMapLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submittingCreateShelter, setSubmittingCreateShelter] = useState(false);
  const [createShelterErrors, setCreateShelterErrors] = useState<{
    name?: string;
    address?: string;
    capacity?: string;
    coordinates?: string;
    general?: string;
  }>({});

  // Modal Chỉnh Sửa Điểm Trú Ẩn
  const [editingShelter, setEditingShelter] = useState<SafeLocationItem | null>(null);
  const [editShelterName, setEditShelterName] = useState('');
  const [editShelterType, setEditShelterType] = useState<'EVACUATION_CENTER' | 'HOSPITAL' | 'SHELTER' | 'RESCUE_STATION' | 'MEETING_POINT'>('EVACUATION_CENTER');
  const [editShelterAreaId, setEditShelterAreaId] = useState('');
  const [editShelterAddress, setEditShelterAddress] = useState('');
  const [editShelterCapacity, setEditShelterCapacity] = useState<number>(200);
  const [editShelterOccupancy, setEditShelterOccupancy] = useState<number>(0);
  const [editShelterStatus, setEditShelterStatus] = useState<'ACTIVE' | 'FULL' | 'MAINTENANCE' | 'INACTIVE'>('ACTIVE');
  const [editShelterLat, setEditShelterLat] = useState<number>(16.0570);
  const [editShelterLng, setEditShelterLng] = useState<number>(108.2170);
  const [editShelterNotes, setEditShelterNotes] = useState('');
  const [editShelterMapLinkInput, setEditShelterMapLinkInput] = useState('');
  const [resolvingEditShelterMapLink, setResolvingEditShelterMapLink] = useState(false);
  const [editShelterMapLinkStatus, setEditShelterMapLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submittingEditShelter, setSubmittingEditShelter] = useState(false);
  const [editShelterErrors, setEditShelterErrors] = useState<{
    name?: string;
    address?: string;
    capacity?: string;
    coordinates?: string;
    general?: string;
  }>({});


  // Tự động tải danh sách điểm an toàn và địa bàn hành chính
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [res, areasRes] = await Promise.all([
          fetchSafeLocations({ all: 'true', limit: '100' }),
          propAreas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
        ]);
        if (!isMounted) return;
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setShelters(res.data);
        } else {
          setShelters(FALLBACK_SHELTERS);
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
      } catch {
        if (isMounted) setShelters(FALLBACK_SHELTERS);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [propAreas.length, refreshIndex]);

  // Cập nhật areas nếu props thay đổi
  useEffect(() => {
    if (propAreas && propAreas.length > 0) {
      setAreas(propAreas);
    }
  }, [propAreas.length]);

  useEffect(() => {
    fetchProvincesV2().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setAllProvinces(list);
      }
    });
  }, []);

  domainDService.syncFromStoredAuthUser();
  const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_auth_user') : null;
  const authUser = user || (authUserStr ? JSON.parse(authUserStr) : null);
  const activeOfficer = domainDService.getActiveOfficer();
  const isAdmin = Boolean(
    user?.roles?.includes('ADMIN') ||
    authUser?.roles?.includes('ADMIN') ||
    (user as any)?.role === 'ADMIN' ||
    (authUser as any)?.role === 'ADMIN'
  );

    // 1. XÁC ĐỊNH ĐỊA BÀN PHÂN CÔNG QUẢN LÝ CỐ ĐỊNH TỪ TÀI KHOẢN (KHÔNG CHO PHÉP THAY ĐỔI)
    const determineOfficerJurKey = (): string => {
      if (isAdmin) return 'national';

      // 1. Kiểm tra nếu có mã hoặc ID khu vực trực tiếp từ tài khoản
      const directAreaId = (user?.authority?.areaId || authUser?.authority?.areaId || '').toLowerCase();
      if (directAreaId) {
        if (directAreaId.includes('nhs') || directAreaId.includes('ngu_hanh_son')) return 'ngu_hanh_son';
        if (directAreaId.includes('hc') || directAreaId.includes('hai_chau')) return 'hai_chau';
        if (directAreaId.includes('st') || directAreaId.includes('son_tra')) return 'son_tra';
        if (directAreaId.includes('tk') || directAreaId.includes('thanh_khe')) return 'thanh_khe';
        if (directAreaId.includes('cl') || directAreaId.includes('cam_le')) return 'cam_le';
        if (directAreaId.includes('lc') || directAreaId.includes('lien_chieu')) return 'lien_chieu';
        if (directAreaId.includes('hv') || directAreaId.includes('hoa_vang')) return 'hoa_vang';
        if (directAreaId.includes('hs') || directAreaId.includes('hoang_sa')) return 'hoang_sa';
      }

      // 2. Tìm tên từ khu vực trong cơ sở dữ liệu nếu có areaId
      const userAreaObj = areas.find((a) => a._id === (user?.authority?.areaId || authUser?.authority?.areaId));
      const userAreaText = userAreaObj ? `${userAreaObj.name} ${userAreaObj.code || ''}` : '';

      const dept = (
        (user?.authority?.areaName || '') + ' ' +
        (user?.authority?.department || '') + ' ' +
        (user?.authority?.position || '') + ' ' +
        (user?.authority?.organizationName || '') + ' ' +
        (authUser?.authority?.areaName || '') + ' ' +
        (authUser?.authority?.department || '') + ' ' +
        (authUser?.authority?.position || '') + ' ' +
        (authUser?.authority?.organizationName || '') + ' ' +
        userAreaText + ' ' +
        (activeOfficer?.jurisdictionAreaName || '') + ' ' +
        (activeOfficer?.districtName || '') + ' ' +
        (activeOfficer?.department || '')
      ).toLowerCase();

      if (dept.includes('ngũ hành sơn') || dept.includes('ngu hanh son')) return 'ngu_hanh_son';
      if (dept.includes('hải châu') || dept.includes('hai chau')) return 'hai_chau';
      if (dept.includes('sơn trà') || dept.includes('son tra')) return 'son_tra';
      if (dept.includes('thanh khê') || dept.includes('thanh khe')) return 'thanh_khe';
      if (dept.includes('cẩm lệ') || dept.includes('cam le')) return 'cam_le';
      if (dept.includes('liên chiểu') || dept.includes('lien chieu')) return 'lien_chieu';
      if (dept.includes('hòa vang') || dept.includes('hoa vang')) return 'hoa_vang';
      if (dept.includes('hoàng sa') || dept.includes('hoang sa')) return 'hoang_sa';

      return 'ngu_hanh_son';
    };

    const fixedJurKey = determineOfficerJurKey();
    const fixedJurisdictionConfig: JurisdictionConfig = JURISDICTION_CONFIGS[fixedJurKey] || {
      name: user?.authority?.areaName || authUser?.authority?.areaName || activeOfficer?.jurisdictionAreaName || 'Toàn Quốc (63 Tỉnh Thành)',
      district: '',
      areaId: user?.authority?.areaId || authUser?.authority?.areaId || 'area-all',
      keywords: [],
    };

    // Tìm đơn vị hành chính quản lý tương ứng từ tài khoản người dùng
    const userAreaIdFromAuth = user?.authority?.areaId || authUser?.authority?.areaId;
    const userAreaNameFromAuth = user?.authority?.areaName || authUser?.authority?.areaName;

    const isAreaMatchingUserAuth = (areaName?: string) => {
      if (!areaName || !userAreaNameFromAuth) return true;
      const cleanA = areaName.toLowerCase().replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
      const cleanU = userAreaNameFromAuth.toLowerCase().replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
      const uFirstPart = cleanU.split(',')[0].trim();
      return cleanA.length > 1 && (uFirstPart.includes(cleanA) || cleanA.includes(uFirstPart));
    };

    const resolvedAccountArea = (() => {
      // 1. Khớp theo tên từ hồ sơ trước
      if (userAreaNameFromAuth) {
        const lowerName = userAreaNameFromAuth.toLowerCase();
        const found = areas.find((a) => {
          const aName = (a.name || '').toLowerCase();
          return aName.includes(lowerName) || lowerName.includes(aName);
        });
        if (found) return found;
      }
      // 2. Chỉ dùng ID nếu tên phù hợp với hồ sơ
      if (userAreaIdFromAuth) {
        const found = areas.find((a) => a._id === userAreaIdFromAuth || a.code === userAreaIdFromAuth);
        if (found && isAreaMatchingUserAuth(found.name)) return found;
      }
      // 3. Nếu cán bộ thuộc tỉnh khác (không có trong areas), trả về null thay vì ép về quận Đà Nẵng
      if (userAreaNameFromAuth) {
        return null;
      }
      const cfg = fixedJurisdictionConfig;
      const foundByCfg = areas.find((a) => {
        const aName = (a.name || '').toLowerCase();
        const aCode = (a.code || '').toLowerCase();
        return (
          aCode.includes(fixedJurKey) ||
          cfg.keywords.some((kw) => aName.includes(kw)) ||
          aName.includes(cfg.name.toLowerCase())
        );
      });
      if (foundByCfg) return foundByCfg;
      return areas[0] || null;
    })();

    const accountAreaDisplayName =
      userAreaNameFromAuth ||
      resolvedAccountArea?.name ||
      activeOfficer?.jurisdictionAreaName ||
      fixedJurisdictionConfig.name;

    // Xác định tên cấp trên (Quận/Huyện, Tỉnh/TP) từ cơ cấu cây hành chính thực tế (không mock cứng)
    const resolveAreaParents = (area: typeof resolvedAccountArea) => {
      if (!area || !area.name) return { parentName: '', provinceName: '', fullName: '' };
      const chain: string[] = [area.name];
      const visited = new Set<string>();
      if (area._id) visited.add(String(area._id));
      let curr = area;
      let province = '';
      let depth = 0;

      while (curr && curr.parentId && depth < 10) {
        depth++;
        const pId = String((curr.parentId as any)?._id || curr.parentId);
        if (!pId || visited.has(pId)) break;
        visited.add(pId);

        const parent = areas.find(
          (a) => String(a._id) === pId || (a.code && a.code === pId)
        );
        if (!parent || parent === curr || visited.has(String(parent._id))) break;
        visited.add(String(parent._id));
        chain.push(parent.name);
        if (parent.type === 'PROVINCE') {
          province = parent.name;
        }
        curr = parent;
      }

      if (!province && chain.length > 1) {
        province = chain[chain.length - 1];
      }

      return {
        parentName: chain[1] || '',
        provinceName: province,
        fullName: chain.join(', '),
      };
    };

    const areaHierarchy = resolveAreaParents(resolvedAccountArea);

    // Tên đầy đủ kèm tỉnh/thành phố cho Địa bàn phụ trách (lấy theo dữ liệu thực tế)
    const accountAreaWithCity = (() => {
      if (isAdmin) return 'Toàn quốc';
      if (userAreaNameFromAuth) {
        return userAreaNameFromAuth;
      }
      if (areaHierarchy.fullName && areaHierarchy.fullName.includes(',')) {
        return areaHierarchy.fullName;
      }
      return accountAreaDisplayName;
    })();

    // Tên rút gọn hiển thị trên tab (ví dụ: "Xã Hợp Kim" hoặc "Phường Ngũ Hành Sơn")
    const localTabLabel = (
      userAreaNameFromAuth
        ? userAreaNameFromAuth.split(',')[0]
        : resolvedAccountArea?.name || accountAreaDisplayName.split(',')[0]
    ).trim();

    // Tên tỉnh/thành phố hiển thị trên tab cấp thành phố (lấy động theo cây đơn vị hành chính)
    const cityTabLabel = (() => {
      if (userAreaNameFromAuth && userAreaNameFromAuth.includes(',')) {
        return userAreaNameFromAuth.split(',').slice(-1)[0].trim();
      }
      if (areaHierarchy.provinceName) return areaHierarchy.provinceName;
      const prov = areas.find((a) => a.type === 'PROVINCE');
      if (prov) return prov.name;
      return 'Thành phố Đà Nẵng';
    })();

    const accountAreaId =
      resolvedAccountArea?._id ||
      (resolvedAccountArea ? userAreaIdFromAuth : null) ||
      fixedJurisdictionConfig.areaId;

    // 2. HÀM KIỂM TRA ĐIỂM TRÚ ẨN CÓ THUỘC ĐỊA BÀN PHÂN CÔNG HAY KHÔNG
    const isShelterInOfficerJurisdiction = (sh: SafeLocationItem): boolean => {
      if (isAdmin) return true;
      const addrLower = (sh.address || '').toLowerCase();
      const nameLower = (sh.name || '').toLowerCase();
      const fullText = `${addrLower} ${nameLower}`;
      const cleanAccAreaName = localTabLabel.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();

      // 1. So khớp ID khu vực nếu có và hợp lệ
      const shAreaId = String((sh.areaId as any)?._id || (sh.areaId as any)?.id || (sh.areaId as any)?.code || sh.areaId || '');
      if (resolvedAccountArea?._id && shAreaId && String(resolvedAccountArea._id) === shAreaId) {
        return true;
      }

      // 2. So khớp theo tên đơn vị hành chính
      const shAreaName = String((sh.areaId as any)?.name || '').toLowerCase();
      if (shAreaName && cleanAccAreaName.length > 2) {
        const cleanSh = shAreaName.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();
        if (cleanSh === cleanAccAreaName || cleanSh.includes(cleanAccAreaName) || cleanAccAreaName.includes(cleanSh)) {
          return true;
        }
      }

      // 3. So khớp từ khóa tên xã/phường trong địa chỉ
      if (cleanAccAreaName.length > 2 && fullText.includes(cleanAccAreaName)) {
        return true;
      }

      // 4. Chỉ kiểm tra bounds quận Đà Nẵng nếu địa bàn cán bộ thực sự thuộc Đà Nẵng
      const isDaNangOfficer =
        userAreaNameFromAuth.toLowerCase().includes('đà nẵng') ||
        userAreaNameFromAuth.toLowerCase().includes('da nang') ||
        Boolean(resolvedAccountArea && !userAreaNameFromAuth);

      if (isDaNangOfficer && fixedJurisdictionConfig) {
        const cfg = fixedJurisdictionConfig;
        if (cfg.keywords && cfg.keywords.some((kw) => fullText.includes(kw))) {
          return true;
        }
        const coords = sh.location?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!isNaN(lat) && !isNaN(lng) && cfg.bounds) {
            if (
              lat >= cfg.bounds.minLat &&
              lat <= cfg.bounds.maxLat &&
              lng >= cfg.bounds.minLng &&
              lng <= cfg.bounds.maxLng
            ) {
              const otherConfigs = Object.entries(JURISDICTION_CONFIGS).filter(
                ([k]) => k !== fixedJurKey && k !== 'toan_thanh_pho'
              );
              const inOtherDistrict = otherConfigs.some(([, other]) =>
                other.keywords.some((k) => addrLower.includes(k))
              );
              if (!inOtherDistrict) {
                return true;
              }
            }
          }
        }
      }

      return false;
    };

    // 3. HÀM XÁC ĐỊNH TÊN ĐỊA PHƯƠNG QUẢN LÝ CHO TỪNG ĐIỂM TRÚ ẨN
    const getShelterDistrictName = (sh: SafeLocationItem): string => {
      const shAreaName = (sh.areaId as any)?.name;
      if (shAreaName && typeof shAreaName === 'string') {
        return shAreaName;
      }
      if (isShelterInOfficerJurisdiction(sh)) {
        return localTabLabel;
      }
      const fullText = `${sh.address || ''} ${sh.name || ''}`.toLowerCase();
      for (const [key, cfg] of Object.entries(JURISDICTION_CONFIGS)) {
        if (key === 'toan_thanh_pho') continue;
        if (cfg.keywords && cfg.keywords.some((kw) => fullText.includes(kw))) {
          return cfg.name;
        }
      }
      const coords = sh.location?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          for (const [key, cfg] of Object.entries(JURISDICTION_CONFIGS)) {
            if (key === 'toan_thanh_pho' || !cfg.bounds) continue;
            if (
              lat >= cfg.bounds.minLat &&
              lat <= cfg.bounds.maxLat &&
              lng >= cfg.bounds.minLng &&
              lng <= cfg.bounds.maxLng
            ) {
              return cfg.name;
            }
          }
        }
      }
      return 'Quận Hải Châu';
    };

    const getShelterTypeLabel = (type: string) => {
      switch (type) {
        case 'EVACUATION_CENTER':
          return 'Trung tâm sơ tán';
        case 'HOSPITAL':
          return 'Trạm Y tế Dã chiến';
        case 'SHELTER':
          return 'Điểm tránh trú kiên cố';
        case 'RESCUE_STATION':
          return 'Trạm cứu hộ tác chiến';
        case 'MEETING_POINT':
          return 'Điểm tập kết an toàn';
        default:
          return 'Cơ sở an toàn';
      }
    };

    const getShelterStatusBadge = (status: string, currentOccupancy = 0, capacity = 0) => {
      const isFull = (capacity > 0 && currentOccupancy >= capacity) || status === 'FULL';
      if (isFull) {
        return { label: 'Đã đầy', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#dc2626' };
      }
      switch (status) {
        case 'ACTIVE':
          return { label: 'Sẵn sàng tiếp nhận', bg: '#f0fdf4', color: '#15803d', border: '#dcfce7', dot: '#16a34a' };
        case 'MAINTENANCE':
          return { label: 'Đang bảo trì / Sửa chữa', bg: '#fffbeb', color: '#b45309', border: '#fef3c7', dot: '#d97706' };
        case 'INACTIVE':
          return { label: 'Tạm ngưng hoạt động', bg: '#f8fafc', color: '#475569', border: '#e2e8f0', dot: '#94a3b8' };
        default:
          return { label: 'Sẵn sàng tiếp nhận', bg: '#f0fdf4', color: '#15803d', border: '#dcfce7', dot: '#16a34a' };
      }
    };

    const formatShelterTime = (iso?: string) => {
      if (!iso) return 'Vừa cập nhật';
      try {
        const d = new Date(iso);
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${time} ${date}`;
      } catch {
        return iso;
      }
    };

    // 4. TẬP DỮ LIỆU ĐỊA PHƯƠNG & THÀNH PHỐ QUẢN LÝ
    const displayShelters = shelters.length > 0 ? shelters : FALLBACK_SHELTERS;

    // Hàm xác định điểm trú ẩn có thuộc Tỉnh / Thành phố được chọn (cho Admin)
    const isShelterInProvince = (s: SafeLocationItem, provinceName: string): boolean => {
      if (!provinceName || provinceName === 'ALL') return true;
      const targetClean = provinceName
        .toLowerCase()
        .replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '')
        .trim();

      const addr = (s.address || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      const fullText = `${addr} ${name}`;

      if (fullText.includes(targetClean)) return true;

      const removeAccents = (str: string) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (removeAccents(fullText).includes(removeAccents(targetClean))) return true;

      const areaName = (s.areaId as any)?.name || (s.areaId as any)?.districtName;
      if (areaName && typeof areaName === 'string') {
        const cleanArea = areaName.toLowerCase();
        if (cleanArea.includes(targetClean) || removeAccents(cleanArea).includes(removeAccents(targetClean))) {
          return true;
        }
      }

      if (targetClean.includes('đà nẵng') || targetClean.includes('da nang')) {
        const daNangDistricts = ['ngũ hành sơn', 'hải châu', 'sơn trà', 'thanh khê', 'cẩm lệ', 'liên chiểu', 'hòa vang', 'hoàng sa'];
        if (daNangDistricts.some((d) => fullText.includes(d) || removeAccents(fullText).includes(removeAccents(d)))) {
          return true;
        }
        const coords = s.location?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (lat >= 15.9 && lat <= 16.3 && lng >= 107.9 && lng <= 108.4) return true;
        }
      }

      return false;
    };

    // Danh sách Tỉnh/Thành cho Admin kèm số lượng điểm trú ẩn thực tế (không mock)
    const adminProvinceOptions = useMemo(() => {
      if (!isAdmin) return [];
      const countsMap = new Map<string, number>();

      allProvinces.forEach((p) => {
        const c = displayShelters.filter((s) => isShelterInProvince(s, p.name)).length;
        countsMap.set(p.name, c);
      });

      return [...allProvinces]
        .map((p) => ({
          code: p.code,
          name: p.name,
          count: countsMap.get(p.name) || 0,
        }))
        .sort((a, b) => {
          if (a.count > 0 && b.count === 0) return -1;
          if (a.count === 0 && b.count > 0) return 1;
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
        });
    }, [isAdmin, allProvinces, displayShelters]);

    const localShelters = displayShelters.filter((s) => isShelterInOfficerJurisdiction(s));

    // Lọc theo Cấp quản lý: Admin lọc theo 1 tab và chọn Tỉnh/Thành phố (Toàn quốc hoặc Tỉnh cụ thể), Cán bộ lọc theo Địa phương vs Tổng Tỉnh/Thành
    const baseScopedShelters = isAdmin
      ? (selectedAdminProvince === 'ALL'
          ? displayShelters
          : displayShelters.filter((s) => isShelterInProvince(s, selectedAdminProvince)))
      : (shelterManagementScope === 'LOCAL' ? localShelters : displayShelters);

    // Thống kê nhanh theo phạm vi đang chọn
    const scopeTotalCapacity = baseScopedShelters.reduce((acc, curr) => acc + (curr.capacity || 0), 0);
    const scopeTotalOccupancy = baseScopedShelters.reduce((acc, curr) => acc + (curr.currentOccupancy || 0), 0);
    const scopeAvailableSlots = Math.max(0, scopeTotalCapacity - scopeTotalOccupancy);

    // Lọc theo Tab trạng thái, Phân loại cơ sở & Tìm kiếm từ khóa
    const filteredShelters = baseScopedShelters.filter((s) => {
      const isFull = (s.capacity > 0 && (s.currentOccupancy || 0) >= s.capacity) || s.status === 'FULL';
      if (shelterFilter === 'ACTIVE' && (isFull || s.status !== 'ACTIVE')) return false;
      if (shelterFilter === 'FULL' && !isFull) return false;
      if (shelterFilter === 'MAINTENANCE' && s.status !== 'MAINTENANCE' && s.status !== 'INACTIVE') return false;

      if (shelterTypeFilter !== 'ALL' && s.type !== shelterTypeFilter) return false;

      if (shelterSearchText.trim()) {
        const q = shelterSearchText.toLowerCase();
        const typeLabel = getShelterTypeLabel(s.type).toLowerCase();
        const district = getShelterDistrictName(s).toLowerCase();
        const creatorName = typeof s.createdBy === 'object' ? (s.createdBy?.fullName || '') : '';
        const match =
          (s.name || '').toLowerCase().includes(q) ||
          (s.address || '').toLowerCase().includes(q) ||
          typeLabel.includes(q) ||
          district.includes(q) ||
          creatorName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    // Sắp xếp dữ liệu đa tiêu chí
    const sortedShelters = [...filteredShelters].sort((a, b) => {
      let cmp: number;
      switch (shelterSortField) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' });
          break;
        case 'capacity':
          cmp = (a.capacity || 0) - (b.capacity || 0);
          break;
        case 'occupancyRate': {
          const rateA = (a.capacity || 0) > 0 ? (a.currentOccupancy || 0) / (a.capacity || 1) : 0;
          const rateB = (b.capacity || 0) > 0 ? (b.currentOccupancy || 0) / (b.capacity || 1) : 0;
          cmp = rateA - rateB;
          break;
        }
        case 'district': {
          const dA = getShelterDistrictName(a);
          const dB = getShelterDistrictName(b);
          cmp = dA.localeCompare(dB, 'vi', { sensitivity: 'base' });
          break;
        }
        case 'address':
          cmp = (a.address || '').localeCompare(b.address || '', 'vi', { sensitivity: 'base' });
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'createdAt':
        default: {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = tA - tB;
          break;
        }
      }
      return shelterSortOrder === 'asc' ? cmp : -cmp;
    });

    // Phân trang 10 điểm
    const SHELTER_PAGE_SIZE = 10;
    const totalShelterItems = sortedShelters.length;
    const totalShelterPages = Math.max(1, Math.ceil(totalShelterItems / SHELTER_PAGE_SIZE));
    const safeShelterPage = Math.min(Math.max(1, shelterPage), totalShelterPages);
    const shelterStartIndex = (safeShelterPage - 1) * SHELTER_PAGE_SIZE;
    const paginatedShelters = sortedShelters.slice(shelterStartIndex, shelterStartIndex + SHELTER_PAGE_SIZE);

    const handleSort = (field: typeof shelterSortField) => {
      if (shelterSortField === field) {
        setShelterSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setShelterSortField(field);
        if (field === 'createdAt' || field === 'capacity' || field === 'occupancyRate') {
          setShelterSortOrder('desc');
        } else {
          setShelterSortOrder('asc');
        }
      }
      setShelterPage(1);
    };

    const renderSortIcon = (field: typeof shelterSortField) => {
      if (shelterSortField !== field) {
        return <ArrowUpDown size={12} style={{ color: '#94a3b8', marginLeft: '6px', opacity: 0.6 }} />;
      }
      return shelterSortOrder === 'asc' ? (
        <ArrowUp size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
      ) : (
        <ArrowDown size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
      );
    };

    // Mở Form Thêm Điểm Trú Ẩn Mới (Chỉ dành cho Cán bộ chính quyền địa phương)
    const handleOpenCreateShelterModal = () => {
      if (isAdmin) {
        showToast('Quản trị viên (ADMIN) không có thẩm quyền tạo điểm an toàn. Chức năng này chỉ dành riêng cho Cán bộ chính quyền địa phương.', 'error');
        return;
      }

      let defaultLat = 16.0570;
      let defaultLng = 108.2170;
      if (fixedJurisdictionConfig.bounds) {
        defaultLat = Number(((fixedJurisdictionConfig.bounds.minLat + fixedJurisdictionConfig.bounds.maxLat) / 2).toFixed(5));
        defaultLng = Number(((fixedJurisdictionConfig.bounds.minLng + fixedJurisdictionConfig.bounds.maxLng) / 2).toFixed(5));
      }

      setCreateShelterName('');
      setCreateShelterType('EVACUATION_CENTER');
      let initAreaId = '';
      if (isAdmin) {
        if (selectedAdminProvince !== 'ALL') {
          const matched = areas.find(
            (a) =>
              a.name.toLowerCase().includes(selectedAdminProvince.toLowerCase()) ||
              selectedAdminProvince.toLowerCase().includes(a.name.toLowerCase())
          );
          initAreaId = matched ? String(matched._id) : `PROV_${selectedAdminProvince}`;
        } else if (areas.length > 0) {
          initAreaId = String(areas[0]._id);
        }
      } else {
        initAreaId = (resolvedAccountArea?._id as string) || accountAreaId || '';
      }
      setCreateShelterAreaId(initAreaId);
      setCreateShelterAddress(isAdmin ? (selectedAdminProvince !== 'ALL' ? selectedAdminProvince : '') : (accountAreaWithCity || accountAreaDisplayName));
      setCreateShelterCapacity(300);
      setCreateShelterOccupancy(0);
      setCreateShelterStatus('ACTIVE');
      setCreateShelterLat(defaultLat);
      setCreateShelterLng(defaultLng);
      setCreateShelterNotes(isAdmin ? 'Điểm trú ẩn an toàn thuộc Quản trị viên hệ thống SOS quản lý' : `Điểm trú ẩn an toàn thuộc quản lý Ban Chỉ Huy PCTT ${localTabLabel}`);
      setCreateShelterMapLinkInput('');
      setCreateShelterMapLinkStatus(null);
      setCreateShelterErrors({});
      setIsCreateShelterOpen(true);
    };

    // Mở Form Chỉnh Sửa Điểm Trú Ẩn
    const handleOpenEditShelterModal = (sh: SafeLocationItem) => {
      setDetailShelter(null);
      setEditingShelter(sh);
      setEditShelterName(sh.name || '');
      setEditShelterType(sh.type || 'EVACUATION_CENTER');
      const curAreaId = typeof sh.areaId === 'object' && sh.areaId !== null ? (sh.areaId._id || (sh.areaId as any).id) : (sh.areaId || '');
      setEditShelterAreaId(curAreaId || (resolvedAccountArea?._id as string) || accountAreaId || (areas[0]?._id as string) || '');
      setEditShelterAddress(sh.address || '');
      setEditShelterCapacity(sh.capacity ?? 200);
      setEditShelterOccupancy(sh.currentOccupancy ?? 0);
      setEditShelterStatus(sh.status || 'ACTIVE');
      const coords = sh.location?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        setEditShelterLng(coords[0]);
        setEditShelterLat(coords[1]);
      } else {
        setEditShelterLng(108.2170);
        setEditShelterLat(16.0570);
      }
      setEditShelterNotes('');
      setEditShelterMapLinkInput('');
      setEditShelterMapLinkStatus(null);
      setEditShelterErrors({});
    };

    // Chuyển đổi liên kết Google Maps sang tọa độ khi tạo mới
    const handleConvertCreateMapLink = async (customText?: string) => {
      const textToResolve = (typeof customText === 'string' ? customText : createShelterMapLinkInput).trim();
      if (!textToResolve) return;

      setResolvingCreateShelterMapLink(true);
      setCreateShelterMapLinkStatus(null);

      try {
        const res = await resolveGoogleMapsInput(textToResolve);
        setCreateShelterLat(res.lat);
        setCreateShelterLng(res.lng);
        setCreateShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
        if (res.placeName && (!createShelterAddress || createShelterAddress === (accountAreaWithCity || accountAreaDisplayName) || createShelterAddress === localTabLabel)) {
          setCreateShelterAddress(res.placeName);
          setCreateShelterErrors((prev) => ({ ...prev, address: undefined }));
        }
        setCreateShelterMapLinkStatus({
          type: 'success',
          message: `Đã ghim tọa độ: [${res.lat}, ${res.lng}]${res.placeName ? ` - ${res.placeName}` : ''}`,
        });
      } catch (err: any) {
        setCreateShelterMapLinkStatus({
          type: 'error',
          message: err.message || 'Không thể nhận diện tọa độ từ liên kết này.',
        });
      } finally {
        setResolvingCreateShelterMapLink(false);
      }
    };

    // Chuyển đổi liên kết Google Maps sang tọa độ khi chỉnh sửa
    const handleConvertEditMapLink = async (customText?: string) => {
      const textToResolve = (typeof customText === 'string' ? customText : editShelterMapLinkInput).trim();
      if (!textToResolve) return;

      setResolvingEditShelterMapLink(true);
      setEditShelterMapLinkStatus(null);

      try {
        const res = await resolveGoogleMapsInput(textToResolve);
        setEditShelterLat(res.lat);
        setEditShelterLng(res.lng);
        setEditShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
        if (res.placeName && (!editShelterAddress || editShelterAddress.trim().length <= 3)) {
          setEditShelterAddress(res.placeName);
          setEditShelterErrors((prev) => ({ ...prev, address: undefined }));
        }
        setEditShelterMapLinkStatus({
          type: 'success',
          message: `Đã ghim tọa độ: [${res.lat}, ${res.lng}]${res.placeName ? ` - ${res.placeName}` : ''}`,
        });
      } catch (err: any) {
        setEditShelterMapLinkStatus({
          type: 'error',
          message: err.message || 'Không thể nhận diện tọa độ từ liên kết này.',
        });
      } finally {
        setResolvingEditShelterMapLink(false);
      }
    };

    // Gửi yêu cầu Tạo Điểm Trú Ẩn Mới lên server
    const handleSubmitCreateShelter = () => {
      if (isAdmin) {
        showToast('Quản trị viên (ADMIN) không có thẩm quyền tạo điểm an toàn. Chức năng này chỉ dành riêng cho Cán bộ chính quyền địa phương.', 'error');
        return;
      }
      const errors: typeof createShelterErrors = {};

      if (!createShelterName.trim()) {
        errors.name = 'Vui lòng nhập tên điểm trú ẩn / cơ sở an toàn!';
      }
      if (!createShelterAddress.trim()) {
        errors.address = 'Vui lòng nhập địa chỉ cụ thể của cơ sở!';
      }
      if (isNaN(createShelterCapacity) || createShelterCapacity <= 0) {
        errors.capacity = 'Sức chứa tối đa phải là số nguyên lớn hơn 0!';
      }
      if (
        isNaN(createShelterLat) ||
        isNaN(createShelterLng) ||
        createShelterLat < -90 ||
        createShelterLat > 90 ||
        createShelterLng < -180 ||
        createShelterLng > 180
      ) {
        errors.coordinates = 'Tọa độ GPS không hợp lệ. Vui lòng chọn điểm trên bản đồ hoặc dán link Google Maps!';
      }

      if (Object.keys(errors).length > 0) {
        errors.general = 'Vui lòng hoàn thiện các trường thông tin bắt buộc còn thiếu!';
        setCreateShelterErrors(errors);
        return;
      }
      setCreateShelterErrors({});

      const typeLabel = getShelterTypeLabel(createShelterType);

      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận tạo điểm trú ẩn an toàn',
        message: `Bạn có chắc chắn muốn khởi tạo cơ sở "${createShelterName.trim()}" với sức chứa ${createShelterCapacity} người không?`,
        type: 'primary',
        confirmText: 'Xác nhận tạo',
        cancelText: 'Quay lại',
        details: [
          { label: 'Tên cơ sở an toàn', value: createShelterName.trim() },
          { label: 'Phân loại cơ sở', value: typeLabel },
          { label: 'Sức chứa tối đa', value: `${createShelterCapacity.toLocaleString()} người` },
          { label: 'Địa chỉ cụ thể', value: createShelterAddress.trim() },
          { label: 'Trạng thái ban đầu', value: createShelterStatus === 'ACTIVE' ? 'Sẵn sàng tiếp nhận' : createShelterStatus },
        ],
        onConfirm: async () => {
          await executeSubmitCreateShelter();
        },
      });
    };

    // Thực hiện gọi API tạo điểm trú ẩn
    const executeSubmitCreateShelter = async () => {
      if (isAdmin) {
        showToast('Quản trị viên (ADMIN) không có thẩm quyền tạo điểm an toàn.', 'error');
        return;
      }
      try {
        setSubmittingCreateShelter(true);
        const resolvedAreaId =
          createShelterAreaId ||
          (isAdmin && selectedAdminProvince !== 'ALL' ? `PROV_${selectedAdminProvince}` : '') ||
          (resolvedAccountArea?._id as string) ||
          accountAreaId ||
          (areas[0]?._id as string) ||
          fixedJurisdictionConfig.areaId;
        const payload = {
          name: createShelterName.trim(),
          type: createShelterType,
          address: createShelterAddress.trim(),
          capacity: Number(createShelterCapacity) || 100,
          currentOccupancy: Number(createShelterOccupancy) || 0,
          status: createShelterStatus,
          areaId: resolvedAreaId,
          location: {
            type: 'Point' as const,
            coordinates: [Number(createShelterLng), Number(createShelterLat)] as [number, number],
          },
        };

        const res = await createSafeLocation(payload);
        if (res.success && res.data) {
          const newShelter = res.data;
          setShelters((prev) => [newShelter, ...prev]);
          setIsCreateShelterOpen(false);
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(res.message || 'Khởi tạo điểm trú ẩn / cơ sở an toàn mới thành công!', 'success');
        } else {
          setCreateShelterErrors((prev) => ({
            ...prev,
            general: 'Không thể tạo điểm trú ẩn. Vui lòng kiểm tra lại thông tin!',
          }));
          showToast('Không thể tạo điểm trú ẩn. Vui lòng kiểm tra lại!', 'error');
        }
      } catch (err: any) {
        setCreateShelterErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi tạo điểm trú ẩn an toàn',
        }));
        showToast(err.message || 'Lỗi khi tạo điểm trú ẩn an toàn', 'error');
      } finally {
        setSubmittingCreateShelter(false);
      }
    };

    // Gửi yêu cầu Chỉnh Sửa Điểm Trú Ẩn
    const handleSubmitEditShelter = () => {
      if (!editingShelter) return;
      const errors: typeof editShelterErrors = {};

      if (!editShelterName.trim()) {
        errors.name = 'Vui lòng nhập tên điểm trú ẩn / cơ sở an toàn!';
      }
      if (!editShelterAddress.trim()) {
        errors.address = 'Vui lòng nhập địa chỉ cụ thể!';
      }
      if (isNaN(editShelterCapacity) || editShelterCapacity <= 0) {
        errors.capacity = 'Sức chứa tối đa phải lớn hơn 0!';
      }
      if (
        isNaN(editShelterLat) ||
        isNaN(editShelterLng) ||
        editShelterLat < -90 ||
        editShelterLat > 90 ||
        editShelterLng < -180 ||
        editShelterLng > 180
      ) {
        errors.coordinates = 'Tọa độ GPS không hợp lệ!';
      }

      if (Object.keys(errors).length > 0) {
        errors.general = 'Vui lòng hoàn thiện các trường thông tin chuẩn hóa trước khi cập nhật!';
        setEditShelterErrors(errors);
        return;
      }
      setEditShelterErrors({});

      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận cập nhật thông tin điểm trú ẩn',
        message: `Bạn có chắc chắn muốn lưu thông tin cập nhật cho cơ sở "${editShelterName.trim()}" không?`,
        type: 'primary',
        confirmText: 'Lưu thay đổi',
        cancelText: 'Quay lại',
        details: [
          { label: 'Tên cơ sở an toàn', value: editShelterName.trim() },
          { label: 'Phân loại cơ sở', value: getShelterTypeLabel(editShelterType) },
          { label: 'Sức chứa / Hiện có', value: `${editShelterOccupancy} / ${editShelterCapacity} người` },
          { label: 'Địa chỉ cụ thể', value: editShelterAddress.trim() },
        ],
        onConfirm: async () => {
          await executeSubmitEditShelter();
        },
      });
    };

    // Thực hiện lưu chỉnh sửa lên server
    const executeSubmitEditShelter = async () => {
      if (!editingShelter) return;
      try {
        setSubmittingEditShelter(true);
        const resolvedAreaId =
          editShelterAreaId ||
          (editingShelter.areaId ? ((editingShelter.areaId as any)._id || editingShelter.areaId) : '') ||
          (resolvedAccountArea?._id as string) ||
          accountAreaId ||
          (areas[0]?._id as string);
        const payload = {
          name: editShelterName.trim(),
          type: editShelterType,
          address: editShelterAddress.trim(),
          capacity: Number(editShelterCapacity) || 100,
          currentOccupancy: Number(editShelterOccupancy) || 0,
          status: editShelterStatus,
          areaId: resolvedAreaId,
          location: {
            type: 'Point' as const,
            coordinates: [Number(editShelterLng), Number(editShelterLat)] as [number, number],
          },
        };

        const res = await updateSafeLocation(editingShelter._id, payload);
        if (res.success) {
          const updatedItem = res.data;
          setShelters((prev) => prev.map((s) => (s._id === editingShelter._id ? updatedItem : s)));
          if (detailShelter && detailShelter._id === editingShelter._id) {
            setDetailShelter(updatedItem);
          }
          setEditingShelter(null);
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(res.message || 'Cập nhật thông tin điểm trú ẩn an toàn thành công!', 'success');
        } else {
          setEditShelterErrors((prev) => ({
            ...prev,
            general: 'Không thể cập nhật điểm trú ẩn. Vui lòng kiểm tra lại!',
          }));
          showToast('Không thể cập nhật điểm trú ẩn. Vui lòng kiểm tra lại!', 'error');
        }
      } catch (err: any) {
        setEditShelterErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi cập nhật điểm trú ẩn',
        }));
        showToast(err.message || 'Lỗi khi cập nhật điểm trú ẩn', 'error');
      } finally {
        setSubmittingEditShelter(false);
      }
    };

    // Đổi trạng thái điểm trú ẩn (ẩn sang INACTIVE trước khi xóa, hoặc mở lại sang ACTIVE)
    const executeChangeShelterStatus = async (id: string, newStatus: string, successMessage: string) => {
      try {
        setLoading(true);
        const res = await updateSafeLocation(id, { status: newStatus });
        if (res.success && res.data) {
          const updated = res.data;
          setShelters((prev) => prev.map((s) => (s._id === id ? updated : s)));
          if (detailShelter && detailShelter._id === id) {
            setDetailShelter(updated);
          }
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(successMessage, 'success');
        } else {
          showToast(res.message || 'Không thể cập nhật trạng thái cơ sở', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Lỗi khi cập nhật trạng thái', 'error');
      } finally {
        setLoading(false);
      }
    };

    // Mở modal xác nhận Ẩn cơ sở an toàn (đổi status sang INACTIVE trước)
    const handleToggleHideShelter = (sh: SafeLocationItem) => {
      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận ẩn điểm trú ẩn an toàn',
        message: `Bạn có chắc chắn muốn ẩn cơ sở "${sh.name || 'này'}" không? Hệ thống sẽ chuyển trạng thái sang Tạm ngưng hoạt động (INACTIVE) trước khi cho phép xóa vĩnh viễn.`,
        type: 'warning',
        confirmText: 'Xác nhận ẩn cơ sở',
        cancelText: 'Hủy bỏ',
        details: [
          { label: 'Tên cơ sở an toàn', value: sh.name || '' },
          { label: 'Trạng thái chuyển đổi', value: 'Tạm ngưng hoạt động (INACTIVE)' },
        ],
        onConfirm: async () => {
          await executeChangeShelterStatus(sh._id, 'INACTIVE', 'Đã ẩn cơ sở an toàn (chuyển sang Tạm ngưng hoạt động)!');
        },
      });
    };

    // Mở modal xác nhận Kích hoạt mở lại cơ sở an toàn
    const handleActivateShelter = (sh: SafeLocationItem) => {
      setConfirmModal({
        isOpen: true,
        title: 'Mở lại hoạt động cơ sở an toàn',
        message: `Bạn có muốn mở lại hoạt động đón tiếp người dân cho cơ sở "${sh.name || 'này'}" không? Trạng thái sẽ được chuyển về Sẵn sàng đón tiếp (ACTIVE).`,
        type: 'primary',
        confirmText: 'Mở lại cơ sở',
        cancelText: 'Hủy bỏ',
        details: [
          { label: 'Tên cơ sở an toàn', value: sh.name || '' },
          { label: 'Trạng thái chuyển đổi', value: 'Sẵn sàng đón tiếp (ACTIVE)' },
        ],
        onConfirm: async () => {
          await executeChangeShelterStatus(sh._id, 'ACTIVE', 'Đã mở lại hoạt động đón tiếp cho cơ sở an toàn thành công!');
        },
      });
    };

    // Mở modal xác nhận trước khi xóa (chỉ xóa khi đã được ẩn/INACTIVE)
    const handleDeleteShelter = (id: string, name?: string) => {
      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận xóa vĩnh viễn điểm trú ẩn an toàn',
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn cơ sở "${name || 'này'}" không? Thao tác này sẽ gỡ bỏ dữ liệu hoàn toàn khỏi cơ sở dữ liệu và bản đồ tác chiến cứu hộ.`,
        type: 'danger',
        confirmText: 'Xác nhận xóa vĩnh viễn',
        cancelText: 'Hủy bỏ',
        details: name ? [{ label: 'Tên cơ sở', value: name }, { label: 'Tình trạng', value: 'Đã tạm ngưng / ẩn' }] : undefined,
        onConfirm: async () => {
          await executeDeleteShelter(id);
        },
      });
    };

    // Thực hiện xóa điểm trú ẩn
    const executeDeleteShelter = async (id: string) => {
      try {
        setLoading(true);
        const res = await deleteSafeLocation(id);
        if (res.success) {
          setShelters((prev) => prev.filter((s) => s._id !== id));
          setSelectedShelterIds((prev) => prev.filter((itemId) => itemId !== id));
          if (detailShelter && detailShelter._id === id) {
            setDetailShelter(null);
          }
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast('Đã xóa vĩnh viễn điểm trú ẩn an toàn thành công!', 'success');
        }
      } catch (err: any) {
        showToast(err.message || 'Lỗi khi xóa điểm trú ẩn', 'error');
      } finally {
        setLoading(false);
      }
    };

    // Ẩn hàng loạt cơ sở đã chọn
    const handleBulkHideShelters = () => {
      if (selectedShelterIds.length === 0) return;
      const count = selectedShelterIds.length;
      setConfirmModal({
        isOpen: true,
        title: `Xác nhận ẩn ${count} điểm trú ẩn đã chọn`,
        message: `Bạn có chắc chắn muốn ẩn ${count} cơ sở an toàn đã chọn không? Trạng thái các cơ sở này sẽ được chuyển sang Tạm ngưng hoạt động (INACTIVE).`,
        type: 'warning',
        confirmText: `Xác nhận ẩn (${count})`,
        cancelText: 'Hủy bỏ',
        onConfirm: async () => {
          setIsBulkShelterAction(true);
          try {
            let successCount = 0;
            await Promise.allSettled(
              selectedShelterIds.map(async (id) => {
                const res = await updateSafeLocation(id, { status: 'INACTIVE' });
                if (res.success && res.data) {
                  successCount++;
                  setShelters((prev) => prev.map((s) => (s._id === id ? res.data : s)));
                }
              })
            );
            setSelectedShelterIds([]);
            refreshData();
            window.dispatchEvent(new CustomEvent('sos_data_updated'));
            setConfirmModal((c) => ({ ...c, isOpen: false }));
            showToast(`✅ Đã chuyển ${successCount} cơ sở an toàn sang Tạm ngưng hoạt động (ẩn)!`, 'success');
          } catch (err: any) {
            showToast('❌ Có lỗi khi ẩn hàng loạt: ' + (err.message || 'Lỗi không xác định'), 'error');
          } finally {
            setIsBulkShelterAction(false);
          }
        },
      });
    };

    // Mở lại hoạt động hàng loạt cơ sở đã chọn
    const handleBulkActivateShelters = () => {
      if (selectedShelterIds.length === 0) return;
      const count = selectedShelterIds.length;
      setConfirmModal({
        isOpen: true,
        title: `Mở lại hoạt động ${count} cơ sở an toàn đã chọn`,
        message: `Bạn có chắc chắn muốn mở lại hoạt động đón tiếp người dân cho ${count} cơ sở đã chọn không? Trạng thái sẽ chuyển về Sẵn sàng đón tiếp (ACTIVE).`,
        type: 'primary',
        confirmText: `Mở lại (${count})`,
        cancelText: 'Hủy bỏ',
        onConfirm: async () => {
          setIsBulkShelterAction(true);
          try {
            let successCount = 0;
            await Promise.allSettled(
              selectedShelterIds.map(async (id) => {
                const res = await updateSafeLocation(id, { status: 'ACTIVE' });
                if (res.success && res.data) {
                  successCount++;
                  setShelters((prev) => prev.map((s) => (s._id === id ? res.data : s)));
                }
              })
            );
            setSelectedShelterIds([]);
            refreshData();
            window.dispatchEvent(new CustomEvent('sos_data_updated'));
            setConfirmModal((c) => ({ ...c, isOpen: false }));
            showToast(`✅ Đã mở lại hoạt động đón tiếp cho ${successCount} cơ sở an toàn!`, 'success');
          } catch (err: any) {
            showToast('❌ Có lỗi khi mở lại hàng loạt: ' + (err.message || 'Lỗi không xác định'), 'error');
          } finally {
            setIsBulkShelterAction(false);
          }
        },
      });
    };

    // Xóa vĩnh viễn hàng loạt cơ sở đã chọn
    const handleBulkDeleteShelters = () => {
      if (selectedShelterIds.length === 0) return;
      const count = selectedShelterIds.length;
      setConfirmModal({
        isOpen: true,
        title: `Xác nhận xóa vĩnh viễn ${count} điểm trú ẩn đã chọn`,
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${count} cơ sở an toàn đã chọn không? Thao tác này sẽ gỡ bỏ dữ liệu hoàn toàn khỏi cơ sở dữ liệu và bản đồ cứu hộ.`,
        type: 'danger',
        confirmText: `Xác nhận xóa vĩnh viễn (${count})`,
        cancelText: 'Hủy bỏ',
        onConfirm: async () => {
          setIsBulkShelterAction(true);
          try {
            let successCount = 0;
            let failCount = 0;
            await Promise.allSettled(
              selectedShelterIds.map(async (id) => {
                try {
                  const res = await deleteSafeLocation(id);
                  if (res.success) {
                    successCount++;
                  } else {
                    failCount++;
                  }
                } catch {
                  failCount++;
                }
              })
            );
            const deletedIdSet = new Set(selectedShelterIds);
            setShelters((prev) => prev.filter((s) => !deletedIdSet.has(s._id)));
            if (detailShelter && deletedIdSet.has(detailShelter._id)) {
              setDetailShelter(null);
            }
            setSelectedShelterIds([]);
            refreshData();
            window.dispatchEvent(new CustomEvent('sos_data_updated'));
            setConfirmModal((c) => ({ ...c, isOpen: false }));
            if (failCount === 0) {
              showToast(`✅ Đã xóa vĩnh viễn ${successCount} cơ sở an toàn thành công!`, 'success');
            } else {
              showToast(`⚠️ Đã xóa ${successCount} cơ sở, ${failCount} cơ sở thất bại.`, 'warning');
            }
          } catch (err: any) {
            showToast('❌ Có lỗi khi xóa hàng loạt: ' + (err.message || 'Lỗi không xác định'), 'error');
          } finally {
            setIsBulkShelterAction(false);
          }
        },
      });
    };

    return (
      <div
        className="sos-views-container"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          gap: '12px',
        }}
      >
        {/* 1. TIÊU ĐỀ TRANG & ĐỊA BÀN PHỤ TRÁCH (CỐ ĐỊNH) */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={16} color="#0284c7" />
            <span style={{ color: '#64748b', fontWeight: 500, fontSize: '13.5px' }}>
              {isAdmin ? 'Phạm vi quản trị:' : 'Địa bàn phụ trách:'}
            </span>
            <strong style={{ color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
              {isAdmin ? 'Toàn quốc' : accountAreaWithCity}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isAdmin && (
              <button
                type="button"
                className="sos-btn-flat primary"
                onClick={handleOpenCreateShelterModal}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  borderColor: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <PlusCircle size={15} />
                <span>Thêm Điểm Trú Ẩn Mới</span>
              </button>
            )}

            <button
              type="button"
              className="sos-btn-flat"
              onClick={() => onOpenMap()}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <MapPin size={15} />
              <span>Mở Bản Đồ Tác Chiến</span>
            </button>
          </div>
        </div>

        {/* 2. CHỌN PHẠM VI XEM: ADMIN (1 TAB TOÀN QUỐC + DROPDOWN CHỌN TỈNH/THÀNH) VS CÁN BỘ ĐỊA PHƯƠNG (2 TAB) + KPI NĂNG LỰC */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
          <div className="sos-scope-tabs" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className="sos-scope-tab active"
                  onClick={() => {
                    setSelectedAdminProvince('ALL');
                    setShelterPage(1);
                  }}
                  title="Hiển thị tất cả điểm trú ẩn trên toàn quốc"
                >
                  <span>{selectedAdminProvince === 'ALL' ? 'Toàn quốc' : selectedAdminProvince}</span>
                  <span className="sos-scope-badge">{baseScopedShelters.length}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
                  <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500 }}>
                    Lọc theo Tỉnh / Thành phố:
                  </span>
                  <select
                    value={selectedAdminProvince}
                    onChange={(e) => {
                      setSelectedAdminProvince(e.target.value);
                      setShelterPage(1);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 500,
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '220px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <option value="ALL">-- Tất cả Tỉnh / Thành phố (Toàn quốc) --</option>
                    {adminProvinceOptions.map((p: { code?: number; name: string; count: number }) => (
                      <option key={p.code || p.name} value={p.name}>
                        {p.name} {p.count > 0 ? `(${p.count})` : ''}
                      </option>
                    ))}
                  </select>

                  {selectedAdminProvince !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAdminProvince('ALL');
                        setShelterPage(1);
                      }}
                      title="Quay lại xem Toàn quốc"
                      style={{
                        padding: '5px 10px',
                        fontSize: '12px',
                        color: '#0284c7',
                        backgroundColor: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ✕ Xem Toàn quốc
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`sos-scope-tab ${shelterManagementScope === 'LOCAL' ? 'active' : ''}`}
                  onClick={() => {
                    setShelterManagementScope('LOCAL');
                    setShelterPage(1);
                  }}
                >
                  <span>{localTabLabel}</span>
                  <span className="sos-scope-badge">{localShelters.length}</span>
                </button>

                <button
                  type="button"
                  className={`sos-scope-tab ${shelterManagementScope === 'CITY' ? 'active' : ''}`}
                  onClick={() => {
                    setShelterManagementScope('CITY');
                    setShelterPage(1);
                  }}
                >
                  <span>{cityTabLabel}</span>
                  <span className="sos-scope-badge">{displayShelters.length}</span>
                </button>
              </>
            )}
          </div>

          {/* Quick Stats Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#64748b' }}>Tổng sức chứa:</span>
              <strong style={{ color: '#0284c7' }}>{scopeTotalCapacity.toLocaleString()} chỗ</strong>
            </div>
            <div style={{ width: 1, height: 14, background: '#cbd5e1' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#64748b' }}>Đang lưu trú:</span>
              <strong style={{ color: '#b45309' }}>{scopeTotalOccupancy.toLocaleString()} người</strong>
            </div>
            <div style={{ width: 1, height: 14, background: '#cbd5e1' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#64748b' }}>Còn khả dụng:</span>
              <strong style={{ color: '#16a34a' }}>{scopeAvailableSlots.toLocaleString()} chỗ</strong>
            </div>
          </div>
        </div>

        {/* 3. THANH CÔNG CỤ: TAB LỌC TRẠNG THÁI, LOẠI CƠ SỞ, SẮP XẾP & TÌM KIẾM */}
        <div className="sos-clean-toolbar" style={{ flexShrink: 0 }}>
          <div className="sos-clean-tabs">
            <button
              type="button"
              className={`sos-clean-tab ${shelterFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setShelterFilter('ALL');
                setShelterPage(1);
              }}
            >
              Tất cả <span className="sos-clean-tab-count">{baseScopedShelters.length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${shelterFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => {
                setShelterFilter('ACTIVE');
                setShelterPage(1);
              }}
            >
              Sẵn sàng đón tiếp <span className="sos-clean-tab-count">{baseScopedShelters.filter((s) => s.status === 'ACTIVE' && (s.capacity <= 0 || (s.currentOccupancy || 0) < s.capacity)).length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${shelterFilter === 'FULL' ? 'active' : ''}`}
              onClick={() => {
                setShelterFilter('FULL');
                setShelterPage(1);
              }}
            >
              Đã đầy <span className="sos-clean-tab-count">{baseScopedShelters.filter((s) => s.status === 'FULL' || (s.capacity > 0 && (s.currentOccupancy || 0) >= s.capacity)).length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${shelterFilter === 'MAINTENANCE' ? 'active' : ''}`}
              onClick={() => {
                setShelterFilter('MAINTENANCE');
                setShelterPage(1);
              }}
            >
              Tạm ngưng / Bảo trì <span className="sos-clean-tab-count">{baseScopedShelters.filter((s) => s.status === 'MAINTENANCE' || s.status === 'INACTIVE').length}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Lọc theo Loại cơ sở */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Loại cơ sở:</span>
              <select
                className="sos-clean-sort-select"
                value={shelterTypeFilter}
                onChange={(e) => {
                  setShelterTypeFilter(e.target.value as any);
                  setShelterPage(1);
                }}
              >
                <option value="ALL">Tất cả loại cơ sở</option>
                <option value="EVACUATION_CENTER">Trung tâm sơ tán</option>
                <option value="HOSPITAL">Trạm Y tế Dã chiến</option>
                <option value="SHELTER">Điểm tránh trú kiên cố</option>
                <option value="RESCUE_STATION">Trạm cứu hộ tác chiến</option>
                <option value="MEETING_POINT">Điểm tập kết an toàn</option>
              </select>
            </div>

            {/* Sắp xếp đa tiêu chí */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Sắp xếp:</span>
              <select
                className="sos-clean-sort-select"
                value={`${shelterSortField}-${shelterSortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split('-') as [any, any];
                  setShelterSortField(f);
                  setShelterSortOrder(o);
                  setShelterPage(1);
                }}
              >
                <option value="createdAt-desc">Mới nhất trước</option>
                <option value="createdAt-asc">Cũ nhất trước</option>
                <option value="name-asc">Tên cơ sở (A → Z)</option>
                <option value="name-desc">Tên cơ sở (Z → A)</option>
                <option value="capacity-desc">Sức chứa: Cao đến thấp</option>
                <option value="capacity-asc">Sức chứa: Thấp đến cao</option>
                <option value="occupancyRate-desc">Tỷ lệ lưu trú: Đầy nhất</option>
                <option value="district-asc">Địa phương (A → Z)</option>
                <option value="status-asc">Trạng thái cơ sở</option>
              </select>
            </div>

            {/* Ô tìm kiếm từ khóa */}
            <div className="sos-clean-search">
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="Tìm theo tên điểm, địa chỉ, người quản lý..."
                value={shelterSearchText}
                onChange={(e) => {
                  setShelterSearchText(e.target.value);
                  setShelterPage(1);
                }}
              />
              {shelterSearchText && (
                <button
                  type="button"
                  onClick={() => {
                    setShelterSearchText('');
                    setShelterPage(1);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4. BẢNG DỮ LIỆU ĐIỂM TRÚ ẨN: THEAD CỐ ĐỊNH, CUỘN NỘI DUNG MƯỢT MÀ */}
        <div
          className="sos-clean-table-container"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* THANH THAO TÁC HÀNG LOẠT (BULK ACTIONS BAR) */}
          {selectedShelterIds.length > 0 && (
            <div
              style={{
                padding: '10px 16px',
                backgroundColor: '#f0fdf4',
                borderBottom: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 600, color: '#166534', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} color="#16a34a" />
                  <span>Đã chọn <strong>{selectedShelterIds.length}</strong> cơ sở an toàn</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedShelterIds([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 4px',
                  }}
                >
                  Bỏ chọn
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleBulkHideShelters}
                  disabled={isBulkShelterAction}
                  className="sos-btn-flat warning"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isBulkShelterAction ? 'not-allowed' : 'pointer',
                  }}
                  title="Ẩn các cơ sở đã chọn (chuyển sang Tạm ngưng hoạt động)"
                >
                  <EyeOff size={13} />
                  <span>Ẩn ({selectedShelterIds.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkActivateShelters}
                  disabled={isBulkShelterAction}
                  className="sos-btn-flat success"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isBulkShelterAction ? 'not-allowed' : 'pointer',
                  }}
                  title="Mở lại hoạt động đón tiếp cho các cơ sở đã chọn"
                >
                  <Eye size={13} />
                  <span>Mở lại ({selectedShelterIds.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkDeleteShelters}
                  disabled={isBulkShelterAction}
                  className="sos-btn-flat danger"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isBulkShelterAction ? 'not-allowed' : 'pointer',
                  }}
                  title="Xóa vĩnh viễn các cơ sở đã chọn"
                >
                  <Trash2 size={13} />
                  <span>Xóa ({selectedShelterIds.length})</span>
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
            <table className="sos-clean-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center', padding: '10px 8px' }}>
                    <input
                      type="checkbox"
                      style={{ width: '16px', height: '16px', cursor: 'pointer', verticalAlign: 'middle' }}
                      checked={
                        paginatedShelters.length > 0 &&
                        paginatedShelters.every((sh) => selectedShelterIds.includes(sh._id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pageIds = paginatedShelters.map((sh) => sh._id);
                          setSelectedShelterIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                        } else {
                          const pageIdSet = new Set(paginatedShelters.map((sh) => sh._id));
                          setSelectedShelterIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
                        }
                      }}
                      title="Chọn tất cả cơ sở trên trang hiện tại"
                    />
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'name' ? 'sorted' : ''}`}
                    onClick={() => handleSort('name')}
                    style={{ width: '22%' }}
                    title="Nhấn để sắp xếp theo tên cơ sở an toàn"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Điểm trú ẩn / Loại cơ sở</span>
                      {renderSortIcon('name')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'district' ? 'sorted' : ''}`}
                    onClick={() => handleSort('district')}
                    style={{ width: '15%' }}
                    title="Nhấn để sắp xếp theo địa phương quản lý"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Địa phương quản lý</span>
                      {renderSortIcon('district')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'capacity' || shelterSortField === 'occupancyRate' ? 'sorted' : ''}`}
                    onClick={() => handleSort('capacity')}
                    style={{ width: '18%' }}
                    title="Nhấn để sắp xếp theo sức chứa & tỷ lệ lưu trú"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Sức chứa &amp; Tỷ lệ lưu trú</span>
                      {renderSortIcon('capacity')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'address' ? 'sorted' : ''}`}
                    onClick={() => handleSort('address')}
                    style={{ width: '21%' }}
                    title="Nhấn để sắp xếp theo địa chỉ"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Địa chỉ cụ thể</span>
                      {renderSortIcon('address')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'createdAt' ? 'sorted' : ''}`}
                    onClick={() => handleSort('createdAt')}
                    style={{ width: '11%' }}
                    title="Nhấn để sắp xếp theo thời gian"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Thời gian cập nhật</span>
                      {renderSortIcon('createdAt')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${shelterSortField === 'status' ? 'sorted' : ''}`}
                    onClick={() => handleSort('status')}
                    style={{ width: '9%', textAlign: 'center' }}
                    title="Nhấn để sắp xếp theo trạng thái"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>Trạng thái</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {totalShelterItems === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: '13px' }}>
                      <Shield size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                      <div>Không có điểm trú ẩn an toàn nào trong danh mục này.</div>
                      {!isAdmin && (
                        <button
                          type="button"
                          onClick={handleOpenCreateShelterModal}
                          style={{
                            marginTop: '12px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            color: '#0284c7',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <PlusCircle size={13} />
                          <span>Thêm điểm trú ẩn mới ngay</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedShelters.map((sh) => {
                    const capacity = sh.capacity || 1;
                    const occupancy = sh.currentOccupancy || 0;
                    const percent = Math.min(100, Math.round((occupancy / capacity) * 100));
                    const isLocal = isShelterInOfficerJurisdiction(sh);
                    const districtName = getShelterDistrictName(sh);
                    const typeLabel = getShelterTypeLabel(sh.type);
                    const statusBadge = getShelterStatusBadge(sh.status, occupancy, capacity);

                    return (
                      <tr
                        key={sh._id}
                        style={{
                          backgroundColor: selectedShelterIds.includes(sh._id) ? '#f0fdf4' : undefined,
                        }}
                      >
                        {/* 0. Checkbox chọn từng mục */}
                        <td style={{ textAlign: 'center', width: '40px', padding: '10px 8px' }}>
                          <input
                            type="checkbox"
                            style={{ width: '16px', height: '16px', cursor: 'pointer', verticalAlign: 'middle' }}
                            checked={selectedShelterIds.includes(sh._id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedShelterIds((prev) =>
                                prev.includes(sh._id) ? prev.filter((id) => id !== sh._id) : [...prev, sh._id]
                              );
                            }}
                          />
                        </td>

                        {/* 1. Tên điểm & Phân loại cơ sở */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '8px',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              title={typeLabel}
                            >
                              <ShelterTypeIcon type={sh.type} size={18} color="#16a34a" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px', lineHeight: '1.4' }}>
                                {sh.name}
                              </div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  backgroundColor: '#f8fafc',
                                  color: '#475569',
                                  border: '1px solid #e2e8f0',
                                  marginTop: '3px',
                                }}
                              >
                                <ShelterTypeIcon type={sh.type} size={12} color="#64748b" />
                                {typeLabel}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Địa phương quản lý */}
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: isLocal ? 700 : 500,
                              background: isLocal ? '#f0fdf4' : '#f8fafc',
                              color: isLocal ? '#15803d' : '#475569',
                              border: `1px solid ${isLocal ? '#bbf7d0' : '#cbd5e1'}`,
                              whiteSpace: 'nowrap',
                            }}
                            title={`Địa bàn quản lý: ${districtName}`}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLocal ? '#16a34a' : '#94a3b8' }} />
                            {districtName}
                          </span>
                        </td>

                        {/* 3. Sức chứa & Tỷ lệ lưu trú */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                              <span style={{ color: '#0f172a', fontWeight: 600 }}>
                                <strong>{occupancy.toLocaleString()}</strong> / {capacity.toLocaleString()} người
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: percent >= 90 ? '#b91c1c' : percent >= 60 ? '#b45309' : '#15803d',
                                }}
                              >
                                {percent}%
                              </span>
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: 6,
                                background: '#e2e8f0',
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${percent}%`,
                                  height: '100%',
                                  background: percent >= 90 ? '#ef4444' : percent >= 60 ? '#f59e0b' : '#22c55e',
                                  borderRadius: 3,
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              Còn trống: <strong style={{ color: capacity - occupancy > 0 ? '#16a34a' : '#dc2626' }}>{Math.max(0, capacity - occupancy).toLocaleString()} chỗ</strong>
                            </div>
                          </div>
                        </td>

                        {/* 4. Địa chỉ cụ thể */}
                        <td>
                          <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 500, lineHeight: '1.45' }}>
                            {sh.address}
                          </div>
                        </td>

                        {/* 5. Thời gian cập nhật & Người phụ trách */}
                        <td>
                          <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600 }}>
                            {formatShelterTime(sh.createdAt)}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                            {typeof sh.createdBy === 'object' ? (sh.createdBy?.fullName || 'Ban chỉ huy PCTT') : 'Ban chỉ huy PCTT'}
                          </div>
                        </td>

                        {/* 6. Trạng thái */}
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: statusBadge.bg,
                              color: statusBadge.color,
                              border: `1px solid ${statusBadge.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusBadge.dot }} />
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* 7. Thao tác */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="sos-btn-flat"
                              onClick={() => setDetailShelter(sh)}
                              title="Xem chi tiết điểm trú ẩn, vị trí bản đồ và năng lực tiếp nhận"
                            >
                              <Eye size={13} />
                              <span>Chi tiết</span>
                            </button>

                            {isLocal ? (
                              <>
                                <button
                                  type="button"
                                  className="sos-btn-flat"
                                  onClick={() => handleOpenEditShelterModal(sh)}
                                  title="Chỉnh sửa thông tin điểm trú ẩn"
                                >
                                  <Edit size={13} />
                                  <span>Sửa</span>
                                </button>

                                {sh.status === 'INACTIVE' ? (
                                  <>
                                    <button
                                      type="button"
                                      className="sos-btn-flat success"
                                      onClick={() => handleActivateShelter(sh)}
                                      title="Mở lại hoạt động cơ sở an toàn"
                                    >
                                      <RotateCcw size={13} />
                                      <span>Mở lại</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="sos-btn-flat danger"
                                      disabled={loading}
                                      onClick={() => handleDeleteShelter(sh._id, sh.name)}
                                      title="Xóa vĩnh viễn điểm trú ẩn này (đã được ẩn)"
                                    >
                                      <Trash2 size={13} />
                                      <span>Xóa</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="sos-btn-flat warning"
                                    disabled={loading}
                                    onClick={() => handleToggleHideShelter(sh)}
                                    title="Ẩn điểm trú ẩn này (Đổi trạng thái sang Tạm ngưng trước khi xóa)"
                                  >
                                    <EyeOff size={13} />
                                    <span>Ẩn</span>
                                  </button>
                                )}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 5. THANH PHÂN TRANG 10 ĐIỂM (CỐ ĐỊNH Ở ĐÁY BẢNG) */}
          <div className="sos-clean-pagination">
            <div className="sos-pagination-info">
              {totalShelterItems === 0 ? (
                'Không có dữ liệu'
              ) : (
                <>
                  Hiển thị <strong style={{ color: '#0f172a' }}>{shelterStartIndex + 1}</strong> – <strong style={{ color: '#0f172a' }}>{Math.min(shelterStartIndex + SHELTER_PAGE_SIZE, totalShelterItems)}</strong> trên tổng số <strong style={{ color: '#0284c7' }}>{totalShelterItems}</strong> cơ sở an toàn
                </>
              )}
            </div>

            {totalShelterPages > 1 && (
              <div className="sos-pagination-controls">
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeShelterPage === 1}
                  onClick={() => setShelterPage(1)}
                  title="Trang đầu"
                >
                  « Đầu
                </button>
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeShelterPage === 1}
                  onClick={() => setShelterPage((p) => Math.max(1, p - 1))}
                  title="Trang trước"
                >
                  ‹ Trước
                </button>

                {(() => {
                  const pages: (number | string)[] = [];
                  if (totalShelterPages <= 7) {
                    for (let i = 1; i <= totalShelterPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (safeShelterPage > 3) pages.push('...');
                    const start = Math.max(2, safeShelterPage - 1);
                    const end = Math.min(totalShelterPages - 1, safeShelterPage + 1);
                    for (let i = start; i <= end; i++) {
                      pages.push(i);
                    }
                    if (safeShelterPage < totalShelterPages - 2) pages.push('...');
                    pages.push(totalShelterPages);
                  }

                  return pages.map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={`dots-sh-${idx}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: '13px' }}>
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`sos-pagination-btn ${p === safeShelterPage ? 'active' : ''}`}
                        onClick={() => setShelterPage(Number(p))}
                      >
                        {p}
                      </button>
                    );
                  });
                })()}

                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeShelterPage === totalShelterPages}
                  onClick={() => setShelterPage((p) => Math.min(totalShelterPages, p + 1))}
                  title="Trang sau"
                >
                  Sau ›
                </button>
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeShelterPage === totalShelterPages}
                  onClick={() => setShelterPage(totalShelterPages)}
                  title="Trang cuối"
                >
                  Cuối »
                </button>

                {/* Ô NHẬP SỐ TRANG TRỰC TIẾP */}
                <div className="sos-pagination-jump">
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Đến trang:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalShelterPages}
                    value={shelterJumpInputPage}
                    placeholder={String(safeShelterPage)}
                    onChange={(e) => setShelterJumpInputPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = parseInt(shelterJumpInputPage, 10);
                        if (!isNaN(target) && target >= 1 && target <= totalShelterPages) {
                          setShelterPage(target);
                          setShelterJumpInputPage('');
                        } else {
                          showToast(`Vui lòng nhập số trang từ 1 đến ${totalShelterPages}`, 'warning');
                        }
                      }
                    }}
                    className="sos-pagination-jump-input"
                    title={`Nhập số trang từ 1 đến ${totalShelterPages}`}
                  />
                  <button
                    type="button"
                    className="sos-pagination-btn"
                    style={{ padding: '4px 9px', fontSize: '12px' }}
                    onClick={() => {
                      const target = parseInt(shelterJumpInputPage, 10);
                      if (!isNaN(target) && target >= 1 && target <= totalShelterPages) {
                        setShelterPage(target);
                        setShelterJumpInputPage('');
                      } else {
                        showToast(`Vui lòng nhập số trang từ 1 đến ${totalShelterPages}`, 'warning');
                      }
                    }}
                  >
                    Đi
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL CHI TIẾT ĐIỂM TRÚ ẨN (2 CỘT TƯƠNG ĐỒNG VỚI HAZARD) */}
        {/* ============================================================ */}
        {detailShelter && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px',
            }}
            onClick={() => setDetailShelter(null)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '6px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ShelterTypeIcon type={detailShelter.type} size={18} color="#16a34a" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                      {detailShelter.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                      Mã: {detailShelter._id} • Cập nhật: {formatShelterTime(detailShelter.createdAt)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailShelter(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body: 2 Columns */}
              <div
                style={{
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: '20px',
                }}
              >
                {/* Cột 1: Thông tin năng lực & Quản lý */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Phân loại &amp; Địa phương
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <ShelterTypeIcon type={detailShelter.type} size={15} color="#16a34a" />
                        {getShelterTypeLabel(detailShelter.type)}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          color: '#0f172a',
                          fontWeight: 600,
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <MapPin size={13} color="#2563eb" />
                        {getShelterDistrictName(detailShelter)}
                      </span>

                      {(() => {
                        const st = getShelterStatusBadge(detailShelter.status, detailShelter.currentOccupancy, detailShelter.capacity);
                        return (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: st.bg,
                              color: st.color,
                              border: `1px solid ${st.border}`,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Thống kê năng lực tiếp nhận */}
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Năng lực tiếp nhận &amp; Lưu trú an toàn
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Sức chứa tối đa</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                          {(detailShelter.capacity || 0).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Đang lưu trú</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#b45309', marginTop: '2px' }}>
                          {(detailShelter.currentOccupancy || 0).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Chỗ còn trống</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>
                          {Math.max(0, (detailShelter.capacity || 0) - (detailShelter.currentOccupancy || 0)).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Thanh tỷ lệ % */}
                    {(() => {
                      const cap = detailShelter.capacity || 1;
                      const occ = detailShelter.currentOccupancy || 0;
                      const pct = Math.min(100, Math.round((occ / cap) * 100));
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ color: '#64748b' }}>Tỷ lệ tiếp nhận:</span>
                            <strong style={{ color: pct >= 90 ? '#b91c1c' : pct >= 60 ? '#b45309' : '#15803d' }}>
                              {pct}%
                            </strong>
                          </div>
                          <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e',
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Địa chỉ cụ thể
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a', lineHeight: '1.4' }}>
                      {detailShelter.address}
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>
                      Đơn vị quản lý cơ sở
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                      {typeof detailShelter.createdBy === 'object' ? (detailShelter.createdBy?.fullName || 'Ban chỉ huy PCTT địa phương') : 'Ban chỉ huy PCTT địa phương'}
                    </div>
                  </div>
                </div>

                {/* Cột 2: Bản đồ nhỏ hiển thị vị trí */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                        Vị trí trên bản đồ
                      </span>
                      {detailShelter.location?.coordinates && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          [{detailShelter.location.coordinates[1].toFixed(5)}, {detailShelter.location.coordinates[0].toFixed(5)}]
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1, minHeight: '280px' }}>
                      {detailShelter.location?.coordinates ? (
                        <ShelterMiniMap
                          lat={detailShelter.location.coordinates[1]}
                          lng={detailShelter.location.coordinates[0]}
                          name={detailShelter.name}
                          type={detailShelter.type}
                        />
                      ) : (
                        <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#94a3b8' }}>
                          Chưa có dữ liệu tọa độ
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      {detailShelter.location?.coordinates && (
                        <a
                          href={`https://www.google.com/maps?q=${detailShelter.location.coordinates[1]},${detailShelter.location.coordinates[0]}`}
                          target="_blank"
                          rel="noreferrer"
                          className="sos-btn-flat"
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          <ExternalLink size={13} />
                          <span>Google Maps</span>
                        </a>
                      )}
                      <button
                        type="button"
                        className="sos-btn-flat primary"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => {
                          setDetailShelter(null);
                          onOpenMap();
                        }}
                      >
                        <MapPin size={13} />
                        <span>Bản đồ Tác chiến</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {detailShelter.status === 'INACTIVE' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="sos-btn-flat danger"
                      onClick={() => handleDeleteShelter(detailShelter._id, detailShelter.name)}
                      disabled={loading}
                    >
                      <Trash2 size={14} />
                      <span>Xóa vĩnh viễn</span>
                    </button>

                    <button
                      type="button"
                      className="sos-btn-flat success"
                      onClick={() => handleActivateShelter(detailShelter)}
                      disabled={loading}
                    >
                      <RotateCcw size={14} />
                      <span>Mở lại cơ sở</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sos-btn-flat warning"
                    onClick={() => handleToggleHideShelter(detailShelter)}
                    disabled={loading}
                  >
                    <EyeOff size={14} />
                    <span>Ẩn cơ sở này (Tạm ngưng)</span>
                  </button>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="sos-btn-flat"
                    onClick={() => handleOpenEditShelterModal(detailShelter)}
                    disabled={loading}
                  >
                    <Edit size={14} />
                    <span>Chỉnh sửa thông tin</span>
                  </button>

                  <button
                    type="button"
                    className="sos-btn-flat"
                    onClick={() => setDetailShelter(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL TẠO ĐIỂM TRÚ ẨN MỚI (CHỈ DÀNH CHO CÁN BỘ CHÍNH QUYỀN ĐỊA PHƯƠNG) */}
        {/* ============================================================ */}
        {isCreateShelterOpen && !isAdmin && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: '16px',
            }}
            onClick={() => !submittingCreateShelter && setIsCreateShelterOpen(false)}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: '#e0f2fe',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                      Khởi Tạo Điểm Trú Ẩn / Trạm An Toàn Mới
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      Cán bộ địa phương {accountAreaDisplayName} thiết lập cơ sở sơ tán và công bố phục vụ ứng cứu thiên tai.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => !submittingCreateShelter && setIsCreateShelterOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: '4px',
                  }}
                  title="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body Form 2 Cột */}
              <div
                style={{
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* Thông báo lỗi tổng quát */}
                {createShelterErrors.general && (
                  <div
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#b91c1c',
                      fontSize: '12.5px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                    <span>{createShelterErrors.general}</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* CỘT TRÁI: TÊN CƠ SỞ, CHỌN LOẠI CƠ SỞ (CARDS GRID), ĐỊA BÀN, SỨC CHỨA, ĐỊA CHỈ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Tên cơ sở */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Tên điểm trú ẩn / cơ sở an toàn <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={createShelterName}
                        onChange={(e) => {
                          setCreateShelterName(e.target.value);
                          if (createShelterErrors.name) {
                            setCreateShelterErrors((prev) => ({ ...prev, name: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Ví dụ: Trường Tiểu học Lê Quý Đôn - Điểm Sơ Tán Bão Lũ"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: createShelterErrors.name ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: createShelterErrors.name ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createShelterErrors.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createShelterErrors.name}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. CHỌN LOẠI CƠ SỞ (CARDS GRID) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                        Phân loại cơ sở an toàn <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div className="sos-hazard-type-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                        {SHELTER_TYPE_CARDS.map((item) => {
                          const isSelected = createShelterType === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setCreateShelterType(item.key as any)}
                              className={`sos-hazard-type-card ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="sos-hazard-type-card-icon">
                                <ShelterTypeIcon
                                  type={item.key}
                                  size={24}
                                  color={isSelected ? '#ffffff' : '#334155'}
                                />
                              </div>
                              <span className="sos-hazard-type-card-label">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Khu vực hành chính (Lấy cố định từ tài khoản quản lý) & Trạng thái ban đầu */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Khu vực quản lý
                        </label>
                        {isAdmin ? (
                          <select
                            value={createShelterAreaId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCreateShelterAreaId(val);
                              const found = areas.find((a) => a._id === val);
                              if (found && !createShelterAddress) {
                                setCreateShelterAddress(found.name);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="">-- Chọn khu vực hành chính ({accountAreaDisplayName || 'Toàn quốc'}) --</option>
                            {areas.length > 0 && (
                              <optgroup label="Khu vực hành chính hệ thống">
                                {areas.map((a) => (
                                  <option key={a._id} value={a._id}>
                                    {a.name} {a.code ? `[${a.code}]` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {allProvinces.length > 0 && (
                              <optgroup label="Tất cả 63 Tỉnh / Thành phố">
                                {allProvinces.map((p) => {
                                  const matchedArea = areas.find((a) => a.name.toLowerCase() === p.name.toLowerCase());
                                  const val = matchedArea ? matchedArea._id : `PROV_${p.name}`;
                                  return (
                                    <option key={`c-prov-${p.code || p.name}`} value={val}>
                                      {p.name}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              boxSizing: 'border-box',
                              minHeight: '36px',
                            }}
                          >
                            <MapPin size={15} color="#0284c7" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                              {accountAreaDisplayName}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Trạng thái ban đầu
                        </label>
                        <select
                          value={createShelterStatus}
                          onChange={(e) => setCreateShelterStatus(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12.5px',
                            color: '#0f172a',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="ACTIVE">Sẵn sàng đón tiếp (ACTIVE)</option>
                          <option value="MAINTENANCE">Bảo trì / Sửa chữa</option>
                          <option value="FULL">Đã đầy công suất (FULL)</option>
                        </select>
                      </div>
                    </div>

                    {/* Sức chứa tối đa & Đang lưu trú ban đầu */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Sức chứa tối đa (người) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={createShelterCapacity}
                          onChange={(e) => {
                            setCreateShelterCapacity(parseInt(e.target.value, 10) || 0);
                            if (createShelterErrors.capacity) {
                              setCreateShelterErrors((prev) => ({ ...prev, capacity: undefined, general: undefined }));
                            }
                          }}
                          placeholder="VD: 500"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: createShelterErrors.capacity ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                            background: createShelterErrors.capacity ? '#fff5f5' : '#ffffff',
                            fontSize: '13px',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        {createShelterErrors.capacity && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                            <span>{createShelterErrors.capacity}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Đang lưu trú ban đầu
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={createShelterOccupancy}
                          onChange={(e) => setCreateShelterOccupancy(parseInt(e.target.value, 10) || 0)}
                          placeholder="VD: 0"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            color: '#0f172a',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* 4. Địa chỉ cụ thể */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Địa chỉ cụ thể cơ sở <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={createShelterAddress}
                        onChange={(e) => {
                          setCreateShelterAddress(e.target.value);
                          if (createShelterErrors.address) {
                            setCreateShelterErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Số nhà, tên đường, phường/xã..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: createShelterErrors.address ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: createShelterErrors.address ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createShelterErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createShelterErrors.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CỘT PHẢI: GOOGLE MAPS LINK RESOLVER, TỌA ĐỘ GPS, BẢN ĐỒ MINI & GHI CHÚ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Nhập link Google Maps hoặc tọa độ */}
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            margin: 0,
                          }}
                        >
                          <MapPin size={14} color="#0284c7" />
                          <span>Link Google Map - Tọa độ</span>
                        </label>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Hỗ trợ cả link rút gọn (maps.app.goo.gl)
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type="text"
                            value={createShelterMapLinkInput}
                            onChange={(e) => {
                              setCreateShelterMapLinkInput(e.target.value);
                              if (createShelterMapLinkStatus) setCreateShelterMapLinkStatus(null);
                            }}
                            onPaste={(e) => {
                              const pastedText = e.clipboardData.getData('text');
                              if (
                                pastedText &&
                                (pastedText.includes('google') ||
                                  pastedText.includes('goo.gl') ||
                                  pastedText.includes('http') ||
                                  pastedText.includes(',') ||
                                  pastedText.includes('°'))
                              ) {
                                setTimeout(() => handleConvertCreateMapLink(pastedText), 50);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConvertCreateMapLink();
                              }
                            }}
                            placeholder="Dán link Google Maps hoặc tọa độ (ví dụ 16.0605, 108.2170)..."
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              paddingRight: createShelterMapLinkInput ? '28px' : '10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                          {createShelterMapLinkInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setCreateShelterMapLinkInput('');
                                setCreateShelterMapLinkStatus(null);
                              }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="Xóa nội dung"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleConvertCreateMapLink()}
                          disabled={resolvingCreateShelterMapLink || !createShelterMapLinkInput.trim()}
                          className="sos-btn-flat"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: resolvingCreateShelterMapLink ? '#f1f5f9' : '#0284c7',
                            color: resolvingCreateShelterMapLink ? '#94a3b8' : '#ffffff',
                            borderColor: resolvingCreateShelterMapLink ? '#cbd5e1' : '#0284c7',
                            cursor: resolvingCreateShelterMapLink || !createShelterMapLinkInput.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {resolvingCreateShelterMapLink ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Đang xử lý...</span>
                            </>
                          ) : (
                            <>
                              <Navigation size={13} />
                              <span>Ghim vị trí</span>
                            </>
                          )}
                        </button>
                      </div>

                      {createShelterMapLinkStatus && (
                        <div
                          style={{
                            fontSize: '11px',
                            padding: '5px 8px',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: createShelterMapLinkStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: createShelterMapLinkStatus.type === 'success' ? '#166534' : '#991b1b',
                            border: `1px solid ${createShelterMapLinkStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                          }}
                        >
                          {createShelterMapLinkStatus.type === 'success' ? (
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                          ) : (
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          )}
                          <span>{createShelterMapLinkStatus.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Tọa độ GPS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                          Tọa độ GPS [Vĩ độ, Kinh độ]
                        </label>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Kéo ghim hoặc click trên bản đồ
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <input
                            type="number"
                            step="0.00001"
                            value={createShelterLat}
                            onChange={(e) => {
                              setCreateShelterLat(parseFloat(e.target.value) || 0);
                              if (createShelterErrors.coordinates) {
                                setCreateShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            title="Vĩ độ (Latitude)"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: createShelterErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: createShelterErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.00001"
                            value={createShelterLng}
                            onChange={(e) => {
                              setCreateShelterLng(parseFloat(e.target.value) || 0);
                              if (createShelterErrors.coordinates) {
                                setCreateShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            title="Kinh độ (Longitude)"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: createShelterErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: createShelterErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                      {createShelterErrors.coordinates && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createShelterErrors.coordinates}</span>
                        </div>
                      )}
                    </div>

                    {/* Bản đồ mini tương tác */}
                    <div style={{ flex: 1, minHeight: '220px' }}>
                      <ShelterMiniMap
                        lat={createShelterLat}
                        lng={createShelterLng}
                        name={createShelterName || 'Vị trí điểm trú ẩn'}
                        type={createShelterType}
                        interactive={true}
                        onLocationChange={(newLat, newLng) => {
                          setCreateShelterLat(Number(newLat.toFixed(5)));
                          setCreateShelterLng(Number(newLng.toFixed(5)));
                          if (createShelterErrors.coordinates) {
                            setCreateShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                          }
                        }}
                      />
                    </div>

                    {/* Ghi chú cơ sở vật chất / Hướng dẫn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Ghi chú trang thiết bị &amp; Hướng dẫn tiếp cận
                      </label>
                      <textarea
                        rows={2}
                        value={createShelterNotes}
                        onChange={(e) => setCreateShelterNotes(e.target.value)}
                        placeholder="Ví dụ: Có máy phát điện dự phòng, 2 bồn chứa nước sạch, phụ trách bởi Đ/c Minh..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal Actions */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  className="sos-btn-flat"
                  disabled={submittingCreateShelter}
                  onClick={() => setIsCreateShelterOpen(false)}
                >
                  Hủy bỏ
                </button>

                <button
                  type="button"
                  className="sos-btn-flat primary"
                  disabled={submittingCreateShelter}
                  onClick={handleSubmitCreateShelter}
                  style={{
                    padding: '7px 18px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    borderColor: '#0284c7',
                  }}
                >
                  {submittingCreateShelter ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>Xác nhận tạo điểm trú ẩn</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL CHỈNH SỬA ĐIỂM TRÚ ẨN (2 CỘT TƯƠNG ĐỒNG VỚI HAZARD) */}
        {/* ============================================================ */}
        {editingShelter && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: '16px',
            }}
            onClick={() => !submittingEditShelter && setEditingShelter(null)}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Chỉnh Sửa &amp; Cập Nhật Thông Tin Điểm Trú Ẩn
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Cập nhật chuẩn hóa thông tin cơ sở, sức chứa và vị trí địa lý trên bản đồ tác chiến.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => !submittingEditShelter && setEditingShelter(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: '4px',
                  }}
                  title="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body Form 2 Cột */}
              <div
                style={{
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* Thông báo lỗi nếu có */}
                {editShelterErrors.general && (
                  <div
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#b91c1c',
                      fontSize: '12.5px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                    <span>{editShelterErrors.general}</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* CỘT TRÁI */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Tên cơ sở */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Tên điểm trú ẩn chuẩn hóa <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editShelterName}
                        onChange={(e) => {
                          setEditShelterName(e.target.value);
                          if (editShelterErrors.name) {
                            setEditShelterErrors((prev) => ({ ...prev, name: undefined, general: undefined }));
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: editShelterErrors.name ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: editShelterErrors.name ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editShelterErrors.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editShelterErrors.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Phân loại cơ sở */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                        Phân loại cơ sở an toàn <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div className="sos-hazard-type-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                        {SHELTER_TYPE_CARDS.map((item) => {
                          const isSelected = editShelterType === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setEditShelterType(item.key as any)}
                              className={`sos-hazard-type-card ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="sos-hazard-type-card-icon">
                                <ShelterTypeIcon
                                  type={item.key}
                                  size={24}
                                  color={isSelected ? '#ffffff' : '#334155'}
                                />
                              </div>
                              <span className="sos-hazard-type-card-label">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Khu vực & Trạng thái */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Khu vực quản lý
                        </label>
                        {isAdmin ? (
                          <select
                            value={editShelterAreaId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditShelterAreaId(val);
                              const found = areas.find((a) => a._id === val);
                              if (found && !editShelterAddress) {
                                setEditShelterAddress(found.name);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="">-- Chọn khu vực hành chính ({accountAreaDisplayName || 'Toàn quốc'}) --</option>
                            {areas.length > 0 && (
                              <optgroup label="Khu vực hành chính hệ thống">
                                {areas.map((a) => (
                                  <option key={`edit-area-${a._id}`} value={a._id}>
                                    {a.name} {a.code ? `[${a.code}]` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {allProvinces.length > 0 && (
                              <optgroup label="Tất cả 63 Tỉnh / Thành phố">
                                {allProvinces.map((p) => {
                                  const matchedArea = areas.find((a) => a.name.toLowerCase() === p.name.toLowerCase());
                                  const val = matchedArea ? matchedArea._id : `PROV_${p.name}`;
                                  return (
                                    <option key={`edit-prov-${p.code || p.name}`} value={val}>
                                      {p.name}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              boxSizing: 'border-box',
                              minHeight: '36px',
                            }}
                          >
                            <MapPin size={15} color="#0284c7" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                              {accountAreaDisplayName}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Trạng thái hoạt động
                        </label>
                        <select
                          value={editShelterStatus}
                          onChange={(e) => setEditShelterStatus(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12.5px',
                            color: '#0f172a',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="ACTIVE">Sẵn sàng tiếp nhận (ACTIVE)</option>
                          <option value="FULL">Đã đầy công suất (FULL)</option>
                          <option value="MAINTENANCE">Bảo trì / Sửa chữa</option>
                          <option value="INACTIVE">Tạm ngưng hoạt động</option>
                        </select>
                      </div>
                    </div>

                    {/* Sức chứa tối đa & Đang lưu trú */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Sức chứa tối đa (người) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={editShelterCapacity}
                          onChange={(e) => {
                            setEditShelterCapacity(parseInt(e.target.value, 10) || 0);
                            if (editShelterErrors.capacity) {
                              setEditShelterErrors((prev) => ({ ...prev, capacity: undefined, general: undefined }));
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: editShelterErrors.capacity ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                            background: editShelterErrors.capacity ? '#fff5f5' : '#ffffff',
                            fontSize: '13px',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        {editShelterErrors.capacity && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                            <span>{editShelterErrors.capacity}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                          Đang lưu trú hiện tại
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editShelterOccupancy}
                          onChange={(e) => setEditShelterOccupancy(parseInt(e.target.value, 10) || 0)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            color: '#0f172a',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Địa chỉ cụ thể */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Địa chỉ cụ thể <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editShelterAddress}
                        onChange={(e) => {
                          setEditShelterAddress(e.target.value);
                          if (editShelterErrors.address) {
                            setEditShelterErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: editShelterErrors.address ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: editShelterErrors.address ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editShelterErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editShelterErrors.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CỘT PHẢI */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Link Google Maps */}
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            margin: 0,
                          }}
                        >
                          <MapPin size={14} color="#0284c7" />
                          <span>Link Google Map - Tọa độ</span>
                        </label>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Hỗ trợ cả link rút gọn
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type="text"
                            value={editShelterMapLinkInput}
                            onChange={(e) => {
                              setEditShelterMapLinkInput(e.target.value);
                              if (editShelterMapLinkStatus) setEditShelterMapLinkStatus(null);
                            }}
                            onPaste={(e) => {
                              const pastedText = e.clipboardData.getData('text');
                              if (
                                pastedText &&
                                (pastedText.includes('google') ||
                                  pastedText.includes('goo.gl') ||
                                  pastedText.includes('http') ||
                                  pastedText.includes(',') ||
                                  pastedText.includes('°'))
                              ) {
                                setTimeout(() => handleConvertEditMapLink(pastedText), 50);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConvertEditMapLink();
                              }
                            }}
                            placeholder="Dán link Google Maps hoặc tọa độ..."
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              paddingRight: editShelterMapLinkInput ? '28px' : '10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                          {editShelterMapLinkInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditShelterMapLinkInput('');
                                setEditShelterMapLinkStatus(null);
                              }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="Xóa nội dung"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleConvertEditMapLink()}
                          disabled={resolvingEditShelterMapLink || !editShelterMapLinkInput.trim()}
                          className="sos-btn-flat"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: resolvingEditShelterMapLink ? '#f1f5f9' : '#0284c7',
                            color: resolvingEditShelterMapLink ? '#94a3b8' : '#ffffff',
                            borderColor: resolvingEditShelterMapLink ? '#cbd5e1' : '#0284c7',
                            cursor: resolvingEditShelterMapLink || !editShelterMapLinkInput.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {resolvingEditShelterMapLink ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Đang xử lý...</span>
                            </>
                          ) : (
                            <>
                              <Navigation size={13} />
                              <span>Ghim vị trí</span>
                            </>
                          )}
                        </button>
                      </div>

                      {editShelterMapLinkStatus && (
                        <div
                          style={{
                            fontSize: '11px',
                            padding: '5px 8px',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: editShelterMapLinkStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: editShelterMapLinkStatus.type === 'success' ? '#166534' : '#991b1b',
                            border: `1px solid ${editShelterMapLinkStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                          }}
                        >
                          {editShelterMapLinkStatus.type === 'success' ? (
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                          ) : (
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          )}
                          <span>{editShelterMapLinkStatus.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Tọa độ GPS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                          Tọa độ GPS [Vĩ độ, Kinh độ]
                        </label>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Kéo ghim hoặc click trên bản đồ
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <input
                            type="number"
                            step="0.00001"
                            value={editShelterLat}
                            onChange={(e) => {
                              setEditShelterLat(parseFloat(e.target.value) || 0);
                              if (editShelterErrors.coordinates) {
                                setEditShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            title="Vĩ độ (Latitude)"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: editShelterErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: editShelterErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.00001"
                            value={editShelterLng}
                            onChange={(e) => {
                              setEditShelterLng(parseFloat(e.target.value) || 0);
                              if (editShelterErrors.coordinates) {
                                setEditShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            title="Kinh độ (Longitude)"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: editShelterErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: editShelterErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                      {editShelterErrors.coordinates && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editShelterErrors.coordinates}</span>
                        </div>
                      )}
                    </div>

                    {/* Bản đồ mini tương tác */}
                    <div style={{ flex: 1, minHeight: '220px' }}>
                      <ShelterMiniMap
                        lat={editShelterLat}
                        lng={editShelterLng}
                        name={editShelterName || 'Vị trí điểm trú ẩn'}
                        type={editShelterType}
                        interactive={true}
                        onLocationChange={(newLat, newLng) => {
                          setEditShelterLat(Number(newLat.toFixed(5)));
                          setEditShelterLng(Number(newLng.toFixed(5)));
                          if (editShelterErrors.coordinates) {
                            setEditShelterErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                          }
                        }}
                      />
                    </div>

                    {/* Ghi chú */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Ghi chú trang thiết bị &amp; Hướng dẫn tiếp cận
                      </label>
                      <textarea
                        rows={2}
                        value={editShelterNotes}
                        onChange={(e) => setEditShelterNotes(e.target.value)}
                        placeholder="Ví dụ: Đã nâng cấp sức chứa và chuẩn bị 200 suất cứu trợ..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal Actions */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  className="sos-btn-flat"
                  disabled={submittingEditShelter}
                  onClick={() => setEditingShelter(null)}
                >
                  Hủy bỏ
                </button>

                <button
                  type="button"
                  className="sos-btn-flat primary"
                  disabled={submittingEditShelter}
                  onClick={handleSubmitEditShelter}
                  style={{
                    padding: '7px 18px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    borderColor: '#0284c7',
                  }}
                >
                  {submittingEditShelter ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>Xác nhận cập nhật thông tin</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOASTS VÀ CONFIRMATION MODAL TOÀN CỤC */}
        {renderGlobalModals()}
      </div>
    );
};

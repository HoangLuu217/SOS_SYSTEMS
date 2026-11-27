import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  Edit,
  Compass,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  ExcelExportButton,
  TableBulkActionBar,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  runBulkOperation,
} from '@/components/common/TableBulkKit';
import {
  exportWorkbookSheets,
  buildSheetFormHeader,
  appendDataTable,
  formatDateVi,
} from '@/features/admin/exportReportsExcel';
import type { User } from '@/types/auth';
import type { HazardReportItem, AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchHazardReports,
  reviewHazardReport,
  createHazardReport,
  deleteHazardReport,
  uploadHazardImage,
  subscribeHazardEvents,
  fetchAdministrativeAreas,
  getDaNangAreaScope,
  matchesSelectedWardFilter,
} from '@/api';
import { MultiImageUploader } from '@/components/common/MultiImageUploader';
import { PhotoLightboxModal, type PhotoLightboxState } from '@/components/common/PhotoLightboxModal';
import { DaNangAreaSelect } from '@/components/common/DaNangAreaSelect';
import {
  appendPendingImageFiles,
  removePendingImageItem,
  revokePendingImagePreviews,
  uploadPendingImageItems,
  type PendingUploadImage,
} from '@/utils/imageUpload';
import { LocationSearchMapPicker } from '@/components/common/LocationSearchMapPicker';
import { DetailSheet } from '@/components/common/DetailSheet';
import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
import { domainDService, JURISDICTION_CONFIGS, type JurisdictionConfig } from '@/services/domainDService';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import {
  HAZARD_TYPE_OPTIONS,
  HazardTypeIcon,
  HazardMiniMap,
  getHazardMarkerHtml,
} from './hazardConstants';
import './HazardReportsView.css';

const HAZARD_SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--dm-border-strong)',
  fontSize: '12.5px',
  color: 'var(--dm-text-strong)',
  background: 'var(--dm-surface)',
  boxSizing: 'border-box',
};

type HazardSeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const HAZARD_SEVERITY_OPTIONS: ReadonlyArray<{ key: HazardSeverityLevel; label: string }> = [
  { key: 'LOW', label: 'Thấp' },
  { key: 'MEDIUM', label: 'Trung bình' },
  { key: 'HIGH', label: 'Cao' },
  { key: 'CRITICAL', label: 'Cực kỳ nguy cấp' },
];

const renderSeveritySelector = (
  selected: HazardSeverityLevel,
  onSelect: (next: HazardSeverityLevel) => void
) => (
  <div>
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
      Mức độ nguy cấp <span style={{ color: 'var(--dm-red-text)' }}>*</span>
    </label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
      {HAZARD_SEVERITY_OPTIONS.map((s) => {
        const isSel = selected === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            className="sos-btn-flat"
            style={{
              justifyContent: 'center',
              padding: '7px 4px',
              fontSize: '11.5px',
              background: isSel ? '#0284c7' : 'var(--dm-surface)',
              color: isSel ? '#ffffff' : 'var(--dm-text-secondary)',
              borderColor: isSel ? '#0284c7' : 'var(--dm-border-strong)',
              fontWeight: isSel ? 700 : 500,
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  </div>
);

export interface HazardReportsViewProps {
  user?: User;
  onOpenMap: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

const EMPTY_AREAS: AdministrativeAreaItem[] = [];

export const HazardReportsView: React.FC<HazardReportsViewProps> = ({
  user,
  onOpenMap,
  areas: propAreas = EMPTY_AREAS,
}) => {
  const { showToast, setConfirmModal, setConfirmPromptValue, renderGlobalModals } = useGlobalModals();
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  const [hazardReports, setHazardReports] = useState<HazardReportItem[]>([]);
  const [_hazardCounts, setHazardCounts] = useState<{
    TOTAL: number;
    PENDING: number;
    APPROVED: number;
    REJECTED: number;
    RESOLVED: number;
  }>({ TOTAL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, RESOLVED: 0 });
  const [hazardFilter, setHazardFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedAdminProvince, setSelectedAdminProvince] = useState<string>('ALL');
  const [hazardSearchText, setHazardSearchText] = useState('');
  const [hazardPage, setHazardPage] = useState<number>(1);
  const [hazardSortField, setHazardSortField] = useState<'createdAt' | 'severity' | 'title' | 'district' | 'address' | 'status'>('createdAt');
  const [hazardSortOrder, setHazardSortOrder] = useState<'asc' | 'desc'>('desc');
  const [jumpInputPage, setJumpInputPage] = useState<string>('');
  const [selectedHazardPhoto, setSelectedHazardPhoto] = useState<PhotoLightboxState | null>(null);
  const [detailHazard, setDetailHazard] = useState<HazardReportItem | null>(null);

  // Chọn hàng loạt (Bulk selection)
  const [selectedHazardIds, setSelectedHazardIds] = useState<string[]>([]);
  const [isBulkHazardAction, setIsBulkHazardAction] = useState<boolean>(false);

  // State phục vụ Form Thẩm định & Chuẩn hóa điểm nguy hiểm (cho chính quyền nhập lại thông tin chuẩn)
  const [reviewingHazard, setReviewingHazard] = useState<HazardReportItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHazardType, setEditHazardType] = useState('FLOOD');
  const [editCustomHazardType, setEditCustomHazardType] = useState('');
  const [editSeverity, setEditSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState<number>(10.7769);
  const [editLng, setEditLng] = useState<number>(106.7009);
  const [editDescription, setEditDescription] = useState('');
  const [editReviewNote, setEditReviewNote] = useState('');
  const [editExistingImages, setEditExistingImages] = useState<string[]>([]);
  const [editPendingImages, setEditPendingImages] = useState<PendingUploadImage[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editErrors, setEditErrors] = useState<{
    title?: string;
    address?: string;
    description?: string;
    customHazardType?: string;
    coordinates?: string;
    general?: string;
  }>({});

  // State phục vụ Modal Tạo điểm nguy hiểm mới (Cán bộ chính quyền LOCAL_AUTHORITY / ADMIN)
  const [isCreateHazardOpen, setIsCreateHazardOpen] = useState(false);
  const [createHazardAreaId, setCreateHazardAreaId] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createHazardType, setCreateHazardType] = useState('FLOOD');
  const [createCustomHazardType, setCreateCustomHazardType] = useState('');
  const [createSeverity, setCreateSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [createAddress, setCreateAddress] = useState('');
  const [createLat, setCreateLat] = useState<number>(16.0570);
  const [createLng, setCreateLng] = useState<number>(108.2170);
  const [createDescription, setCreateDescription] = useState('');
  const [createStatus, setCreateStatus] = useState<'APPROVED' | 'PENDING'>('APPROVED');
  const [createReviewNote, setCreateReviewNote] = useState('');
  const [createPendingImages, setCreatePendingImages] = useState<PendingUploadImage[]>([]);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createErrors, setCreateErrors] = useState<{
    title?: string;
    address?: string;
    description?: string;
    customHazardType?: string;
    coordinates?: string;
    general?: string;
  }>({});


  // Tự động tải danh sách điểm nguy hiểm & lắng nghe SSE realtime
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [res, areasRes] = await Promise.all([
          fetchHazardReports({ all: 'true', limit: '100' }),
          propAreas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
        ]);
        if (!isMounted) return;
        if (res.success && res.data) {
          setHazardReports(res.data.reports || []);
          if (res.data.counts) {
            setHazardCounts(res.data.counts);
          }
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
      } catch (e) {
        console.warn('Lỗi fetchHazardReports:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();

    // Định kỳ tự động quét (polling) mỗi 4 giây
    const pollTimer = setInterval(() => {
      fetchHazardReports({ all: 'true', limit: '100' })
        .then((res) => {
          if (!isMounted) return;
          if (res.success && res.data) {
            setHazardReports(res.data.reports || []);
            if (res.data.counts) {
              setHazardCounts(res.data.counts);
            }
          }
        })
        .catch(() => {});
    }, 4000);

    // Lắng nghe realtime SSE
    const unsubscribeSSE = subscribeHazardEvents((payload) => {
      if (!isMounted) return;
      console.log('⚡ [HazardReportsView] Nhận sự kiện thời gian thực điểm nguy hiểm:', payload);
      refreshData();
    });

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      unsubscribeSSE();
    };
  }, [propAreas.length, refreshIndex]);

  // Cập nhật areas nếu props thay đổi
  useEffect(() => {
    if (propAreas && propAreas.length > 0) {
      setAreas(propAreas);
    }
  }, [propAreas.length]);

  // Tự động mở modal chi tiết điểm nguy hiểm khi điều hướng từ bản đồ sang (/authority/hazard_reports/:id hoặc /admin/hazard_reports/:id)
  useEffect(() => {
    if (hazardReports.length === 0) return;
    let targetId = '';
    try {
      const raw = sessionStorage.getItem('sos_open_detail_id');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.key === 'hazard_reports' && parsed?.id) {
          targetId = String(parsed.id);
          sessionStorage.removeItem('sos_open_detail_id');
        }
      }
    } catch {}
    if (!targetId) {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'hazard_reports' || p === 'danger_points');
      if (idx !== -1 && parts[idx + 1]) {
        targetId = parts[idx + 1];
      }
    }
    if (!targetId) return;
    const matched = hazardReports.find((r) => r._id === targetId);
    if (matched) {
      setDetailHazard(matched);
      const parts = window.location.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'hazard_reports' || p === 'danger_points');
      if (idx !== -1 && parts[idx + 1]) {
        window.history.replaceState(null, '', `/${parts.slice(0, idx + 1).join('/')}`);
      }
    }
  }, [hazardReports]);

  const { daNangProvince, daNangProvinceId, daNangWards, canonicalAreaIdMap } = useMemo(
    () => getDaNangAreaScope(areas),
    [areas]
  );

  domainDService.syncFromStoredAuthUser();
  const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_auth_user') : null;
  const authUser = (authUserStr ? JSON.parse(authUserStr) : null) || user;
  const activeOfficer = domainDService.getActiveOfficer();
  const isAdmin = Boolean(
    user?.roles?.includes('ADMIN') ||
    authUser?.roles?.includes('ADMIN') ||
    (user as any)?.role === 'ADMIN' ||
    (authUser as any)?.role === 'ADMIN'
  );

    // 1. XÁC ĐỊNH THÔNG TIN ĐỊA BÀN PHÂN CÔNG TỪ TÀI KHOẢN CÁN BỘ CHÍNH QUYỀN
    const userAreaIdFromAuth = (user?.authority?.areaId || authUser?.authority?.areaId || '') ? String(user?.authority?.areaId || authUser?.authority?.areaId) : '';
    const userAreaNameFromAuth = (user?.authority?.areaName || authUser?.authority?.areaName || '').trim();
    const userDepartment = (user?.authority?.department || authUser?.authority?.department || '').trim();

    // Tìm đơn vị hành chính tương ứng trong danh mục Administrative Areas từ ID hoặc Tên
    const foundAreaById = userAreaIdFromAuth
      ? areas.find((a) => String(a._id) === userAreaIdFromAuth || a.code === userAreaIdFromAuth)
      : null;

    const foundAreaByName = userAreaNameFromAuth
      ? areas.find((a) => {
          const aName = (a.name || '').toLowerCase();
          const uName = userAreaNameFromAuth.toLowerCase();
          const cleanUName = uName.split(',')[0].replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
          const cleanAName = aName.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
          return (
            aName === uName ||
            uName.includes(aName) ||
            aName.includes(uName) ||
            (cleanUName.length > 2 && (cleanAName === cleanUName || cleanAName.includes(cleanUName) || cleanUName.includes(cleanAName)))
          );
        })
      : null;

    const foundAreaByDept = userDepartment
      ? areas.find((a) => {
          if (!a.name) return false;
          const cleanAName = a.name.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();
          return cleanAName.length > 2 && userDepartment.toLowerCase().includes(cleanAName);
        })
      : null;

    const isAreaMatchingUserAuth = (areaName?: string) => {
      if (!areaName || !userAreaNameFromAuth) return true;
      const cleanA = areaName.toLowerCase().replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
      const cleanU = userAreaNameFromAuth.toLowerCase().replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim();
      const uFirstPart = cleanU.split(',')[0].trim();
      return cleanA.length > 1 && (uFirstPart.includes(cleanA) || cleanA.includes(uFirstPart));
    };

    // Chỉ dùng foundAreaById nếu tên của nó phù hợp với địa bàn hiện tại của tài khoản
    const validAreaById = (foundAreaById && isAreaMatchingUserAuth(foundAreaById.name)) ? foundAreaById : null;

    // Xác định cấu hình quận/huyện tương ứng trong JURISDICTION_CONFIGS (dùng cho bounds / GPS map)
    const determineOfficerJurKey = (): string => {
      const rawCheck = (
        userAreaNameFromAuth + ' ' +
        (validAreaById?.name || '') + ' ' +
        (foundAreaByName?.name || '') + ' ' +
        (foundAreaByDept?.name || '') + ' ' +
        userDepartment + ' ' +
        (activeOfficer?.jurisdictionAreaName || '') + ' ' +
        (activeOfficer?.districtName || '')
      ).toLowerCase();

      if (rawCheck.includes('ngũ hành sơn') || rawCheck.includes('ngu hanh son')) return 'ngu_hanh_son';
      if (rawCheck.includes('hải châu') || rawCheck.includes('hai chau')) return 'hai_chau';
      if (rawCheck.includes('sơn trà') || rawCheck.includes('son tra')) return 'son_tra';
      if (rawCheck.includes('thanh khê') || rawCheck.includes('thanh khe')) return 'thanh_khe';
      if (rawCheck.includes('cẩm lệ') || rawCheck.includes('cam le')) return 'cam_le';
      if (rawCheck.includes('liên chiểu') || rawCheck.includes('lien chieu')) return 'lien_chieu';
      if (rawCheck.includes('hòa vang') || rawCheck.includes('hoa vang')) return 'hoa_vang';
      if (rawCheck.includes('hoàng sa') || rawCheck.includes('hoang sa')) return 'hoang_sa';

      return 'ngu_hanh_son';
    };

    const matchedJurKey = determineOfficerJurKey();
    const fixedJurisdictionConfig: JurisdictionConfig = JURISDICTION_CONFIGS[matchedJurKey] || JURISDICTION_CONFIGS.national || {
      name: userAreaNameFromAuth || 'Toàn Quốc (63 Tỉnh Thành)',
      district: '',
      areaId: userAreaIdFromAuth || 'area-all',
      keywords: [],
    };

    // 2. TÊN HIỂN THỊ ĐỊA BÀN PHỤ TRÁCH CHUẨN XÁC CỦA TÀI KHOẢN (ƯU TIÊN THEO HỒ SƠ TÀI KHOẢN)
    const accountAreaDisplayName = (() => {
      if (isAdmin) return 'Toàn quốc';
      // 1. Ưu tiên hàng đầu: Tên địa bàn khai báo trong hồ sơ cán bộ (areaName)
      if (userAreaNameFromAuth) return userAreaNameFromAuth;
      // 2. Khu vực theo ID trong cơ sở dữ liệu nếu hợp lệ
      if (validAreaById?.name) return validAreaById.name;
      // 3. Khớp qua tên hoặc phòng ban cơ quan
      if (foundAreaByName?.name) return foundAreaByName.name;
      if (foundAreaByDept?.name && isAreaMatchingUserAuth(foundAreaByDept.name)) return foundAreaByDept.name;
      if (activeOfficer?.jurisdictionAreaName && activeOfficer.jurisdictionAreaName !== 'Địa Bàn PhỤ Trách') {
        return activeOfficer.jurisdictionAreaName;
      }
      return fixedJurisdictionConfig?.name || 'Toàn quốc';
    })();

    // Xác định tên cấp trên (Quận/Huyện, Tỉnh/TP) từ cơ cấu cây hành chính thực tế (không mock cứng)
    const targetArea = validAreaById || foundAreaByName || (foundAreaByDept && isAreaMatchingUserAuth(foundAreaByDept.name) ? foundAreaByDept : null);
    const resolveAreaParents = (area: typeof targetArea) => {
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

    const areaHierarchy = resolveAreaParents(targetArea);

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

    const accountAreaId =
      validAreaById?._id ||
      foundAreaByName?._id ||
      (foundAreaByDept && isAreaMatchingUserAuth(foundAreaByDept.name) ? foundAreaByDept._id : null) ||
      (validAreaById ? userAreaIdFromAuth : null) ||
      fixedJurisdictionConfig?.areaId ||
      'area-all';

    // Tên rút gọn hiển thị trên tab (ví dụ: "Xã Hợp Kim" hoặc "Phường Ngũ Hành Sơn")
    const localTabLabel = (
      userAreaNameFromAuth
        ? userAreaNameFromAuth.split(',')[0]
        : targetArea?.name || accountAreaDisplayName.split(',')[0]
    ).trim();

    // 3. HÀM KIỂM TRA ĐIỂM NGUY HIỂM CÓ THUỘC ĐỊA BÀN PHÂN CÔNG HAY KHÔNG
    const isHazardInOfficerJurisdiction = (r: HazardReportItem): boolean => {
      if (isAdmin) return true;

      const deptLower = userDepartment.toLowerCase();
      if (
        deptLower.includes('toàn thành phố') ||
        deptLower.includes('tp. đà nẵng') ||
        deptLower.includes('tp đà nẵng') ||
        deptLower.includes('thành phố đà nẵng') ||
        accountAreaDisplayName.toLowerCase().includes('toàn tp')
      ) {
        return true;
      }

      // 1. So khớp ID khu vực trực tiếp (chỉ khi có validAreaById)
      const rAreaId = String((r.areaId as any)?._id || (r.areaId as any)?.id || (r.areaId as any)?.code || r.areaId || '');
      if (validAreaById && rAreaId && String(rAreaId) === String(validAreaById._id)) {
        return true;
      }

      // 2. So khớp theo tên đơn vị hành chính trong areaId của report
      const rAreaName = String((r.areaId as any)?.name || (r as any).district || (r as any).districtName || '').toLowerCase();
      const cleanAccAreaName = localTabLabel.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();

      if (rAreaName && cleanAccAreaName.length > 2) {
        const cleanRArea = rAreaName.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();
        if (cleanRArea === cleanAccAreaName || cleanRArea.includes(cleanAccAreaName) || cleanAccAreaName.includes(cleanRArea)) {
          return true;
        }
      }

      // 3. So khớp từ khóa đặc trưng trong văn bản (địa chỉ, tiêu đề, mô tả)
      const addrLower = (r.address || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();
      const titleLower = (r.title || '').toLowerCase();
      const fullText = `${addrLower} ${descLower} ${titleLower}`;

      const targetKeywords: string[] = [];
      if (cleanAccAreaName.length > 2) {
        targetKeywords.push(cleanAccAreaName);
        targetKeywords.push(localTabLabel.toLowerCase());
      }
      if (validAreaById?.name) {
        targetKeywords.push(validAreaById.name.toLowerCase());
        targetKeywords.push(validAreaById.name.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase());
      }

      // Chỉ áp dụng keywords quận Đà Nẵng nếu cán bộ thuộc địa bàn Đà Nẵng
      const isDaNangOfficer =
        userAreaNameFromAuth.toLowerCase().includes('đà nẵng') ||
        userAreaNameFromAuth.toLowerCase().includes('da nang') ||
        Boolean(validAreaById && !userAreaNameFromAuth);

      if (isDaNangOfficer && fixedJurisdictionConfig && fixedJurisdictionConfig.keywords) {
        const isDistrictOfficer =
          accountAreaDisplayName.toLowerCase().includes('quận') ||
          accountAreaDisplayName.toLowerCase().includes('huyện') ||
          cleanAccAreaName === fixedJurisdictionConfig.name.replace(/^(quận|huyện)\s+/i, '').toLowerCase();

        if (isDistrictOfficer) {
          targetKeywords.push(...fixedJurisdictionConfig.keywords);
        } else {
          const specificKeywords = fixedJurisdictionConfig.keywords.filter((kw) => fullText.includes(kw) && fullText.includes(cleanAccAreaName));
          targetKeywords.push(...specificKeywords);
        }
      }

      const matchesKeyword = targetKeywords.some((kw) => kw && kw.length > 2 && fullText.includes(kw));
      if (matchesKeyword) return true;

      // 4. So khớp tọa độ GPS nằm trong bounds nếu cán bộ thuộc Đà Nẵng
      const coords = r.location?.coordinates;
      if (isDaNangOfficer && Array.isArray(coords) && coords.length === 2 && fixedJurisdictionConfig?.bounds) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          const b = fixedJurisdictionConfig.bounds;
          if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
            const matchesLocalWard = cleanAccAreaName.length > 2 && fullText.includes(cleanAccAreaName);
            const isDistrictLevel = accountAreaDisplayName.toLowerCase().includes('quận') || accountAreaDisplayName.toLowerCase().includes('huyện');

            if (matchesLocalWard || isDistrictLevel) {
              return true;
            }
          }
        }
      }

      return false;
    };

    // 4. HÀM XÁC ĐỊNH TÊN ĐỊA PHƯƠNG QUẢN LÝ CHO TỪNG ĐIỂM NGUY HIỂM
    const getHazardDistrictName = (r: HazardReportItem): string => {
      // 1. Tên khu vực cụ thể từ areaId của report
      const rAreaName = (r.areaId as any)?.name || (r.areaId as any)?.districtName;
      if (rAreaName && typeof rAreaName === 'string' && rAreaName.trim()) {
        return rAreaName;
      }

      // 2. Tên quận/huyện từ thuộc tính district của report
      const dName = (r as any).district || (r as any).districtName;
      if (dName && typeof dName === 'string' && dName.trim()) {
        return dName;
      }

      // 3. Nếu điểm thuộc địa bàn của cán bộ, trả về tên địa bàn cán bộ
      if (isHazardInOfficerJurisdiction(r)) {
        return localTabLabel;
      }

      // 4. So khớp danh mục AdministrativeAreas trong hệ thống
      const fullText = `${r.address || ''} ${r.title || ''} ${r.description || ''}`.toLowerCase();
      const matchedArea = areas.find((a) => {
        if (!a.name) return false;
        return fullText.includes(a.name.toLowerCase());
      });
      if (matchedArea) return matchedArea.name;

      // 5. So khớp cấu hình quận huyện
      for (const [key, cfg] of Object.entries(JURISDICTION_CONFIGS)) {
        if (key === 'toan_thanh_pho') continue;
        if (cfg.keywords && cfg.keywords.some((kw) => fullText.includes(kw))) {
          return cfg.name;
        }
      }

      // 6. Quét các tên quận thông dụng
      if (fullText.includes('hải châu') || fullText.includes('hai chau')) return 'Quận Hải Châu';
      if (fullText.includes('sơn trà') || fullText.includes('son tra')) return 'Quận Sơn Trà';
      if (fullText.includes('thanh khê') || fullText.includes('thanh khe')) return 'Quận Thanh Khê';
      if (fullText.includes('cẩm lệ') || fullText.includes('cam le')) return 'Quận Cẩm Lệ';
      if (fullText.includes('liên chiểu') || fullText.includes('lien chieu')) return 'Quận Liên Chiểu';
      if (fullText.includes('ngũ hành sơn') || fullText.includes('ngu hanh son')) return 'Quận Ngũ Hành Sơn';
      if (fullText.includes('hòa vang') || fullText.includes('hoa vang')) return 'Huyện Hòa Vang';
      if (fullText.includes('hoàng sa') || fullText.includes('hoang sa')) {
        return daNangWards.find((w) => /hoàng\s*sa/i.test(w.name))?.name || 'Đặc khu Hoàng Sa';
      }

      return 'TP Đà Nẵng';
    };

    // Hàm xác định điểm nguy hiểm có thuộc Phường / Xã Đà Nẵng được chọn (cho Admin)
    const isHazardInProvince = (r: HazardReportItem, selectedAreaName: string): boolean =>
      matchesSelectedWardFilter(
        r.areaId,
        [r.address, r.title, r.description],
        selectedAreaName,
        daNangWards,
        canonicalAreaIdMap
      );

    // 4. TẬP DỮ LIỆU ĐỊA PHƯƠNG & THÀNH PHỐ QUẢN LÝ
    const localReports = hazardReports.filter((r) => isHazardInOfficerJurisdiction(r));

    // Lọc theo Cấp quản lý: Admin lọc khu vực Đà Nẵng (toàn Đà Nẵng hoặc theo Phường/Xã), Cán bộ chỉ xem địa phương mình
    const baseScopedReports = isAdmin
      ? (selectedAdminProvince === 'ALL'
          ? hazardReports
          : hazardReports.filter((r) => isHazardInProvince(r, selectedAdminProvince)))
      : localReports;

    // Lọc theo Tab trạng thái và Tìm kiếm từ khóa
    const filteredReports = baseScopedReports.filter((r) => {
      if (hazardFilter !== 'ALL' && r.status !== hazardFilter) return false;
      if (hazardSearchText.trim()) {
        const q = hazardSearchText.toLowerCase();
        const reporterName = typeof r.reportedBy === 'object' ? (r.reportedBy?.fullName || '') : '';
        const match =
          (r.title || '').toLowerCase().includes(q) ||
          (r.address || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          reporterName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    // Sắp xếp dữ liệu theo trường đã chọn (hazardSortField) và thứ tự (hazardSortOrder)
    const severityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    const statusWeight: Record<string, number> = {
      PENDING: 3,
      APPROVED: 2,
      REJECTED: 1,
    };

    const sortedReports = [...filteredReports].sort((a, b) => {
      let cmp: number;
      switch (hazardSortField) {
        case 'severity': {
          const wA = severityWeight[a.severity] || 0;
          const wB = severityWeight[b.severity] || 0;
          cmp = wA - wB;
          break;
        }
        case 'title': {
          cmp = (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' });
          break;
        }
        case 'district': {
          const dA = getHazardDistrictName(a);
          const dB = getHazardDistrictName(b);
          cmp = dA.localeCompare(dB, 'vi', { sensitivity: 'base' });
          break;
        }
        case 'address': {
          cmp = (a.address || '').localeCompare(b.address || '', 'vi', { sensitivity: 'base' });
          break;
        }
        case 'status': {
          const sA = statusWeight[a.status] || 0;
          const sB = statusWeight[b.status] || 0;
          cmp = sA - sB;
          break;
        }
        case 'createdAt':
        default: {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = tA - tB;
          break;
        }
      }
      return hazardSortOrder === 'asc' ? cmp : -cmp;
    });

    const HAZARD_PAGE_SIZE = 10;
    const totalHazardItems = sortedReports.length;
    const totalHazardPages = Math.max(1, Math.ceil(totalHazardItems / HAZARD_PAGE_SIZE));
    const safeHazardPage = Math.min(Math.max(1, hazardPage), totalHazardPages);
    const hazardStartIndex = (safeHazardPage - 1) * HAZARD_PAGE_SIZE;
    const paginatedReports = sortedReports.slice(hazardStartIndex, hazardStartIndex + HAZARD_PAGE_SIZE);

    const handleSort = (field: 'createdAt' | 'severity' | 'title' | 'district' | 'address' | 'status') => {
      if (hazardSortField === field) {
        setHazardSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setHazardSortField(field);
        if (field === 'createdAt' || field === 'severity' || field === 'status') {
          setHazardSortOrder('desc');
        } else {
          setHazardSortOrder('asc');
        }
      }
      setHazardPage(1);
    };

    const renderSortIcon = (field: 'createdAt' | 'severity' | 'title' | 'district' | 'address' | 'status') => {
      if (hazardSortField !== field) {
        return <ArrowUpDown size={12} style={{ color: 'var(--dm-text-muted)', marginLeft: '6px', opacity: 0.6 }} />;
      }
      return hazardSortOrder === 'asc' ? (
        <ArrowUp size={12} style={{ color: 'var(--dm-blue-text)', marginLeft: '6px' }} />
      ) : (
        <ArrowDown size={12} style={{ color: 'var(--dm-blue-text)', marginLeft: '6px' }} />
      );
    };

    const getHazardTypeConfig = (type: string, custom?: string) => {
      switch (type) {
        case 'FLOOD':
          return { label: 'Ngập lụt', code: 'FLOOD' };
        case 'LANDSLIDE':
          return { label: 'Sạt lở đất', code: 'LANDSLIDE' };
        case 'FALLEN_TREE':
        case 'OBSTACLE':
          return { label: 'Cây đổ / Cản trở', code: 'FALLEN_TREE' };
        case 'ELECTRICAL':
          return { label: 'Sự cố điện', code: 'ELECTRICAL' };
        case 'ROAD_DAMAGE':
        case 'EROSION':
          return { label: 'Hư hỏng đường', code: 'ROAD_DAMAGE' };
        default:
          return { label: custom ? `Khác: ${custom}` : 'Nguy hiểm khác', code: 'OTHER' };
      }
    };

    const getSeverityBadge = (severity: string) => {
      switch (severity) {
        case 'CRITICAL':
          return { label: 'Cực kỳ nguy cấp', bg: 'var(--dm-red-bg)', color: 'var(--dm-red-text)', border: 'var(--dm-red-border)' };
        case 'HIGH':
          return { label: 'Mức độ cao', bg: 'var(--dm-orange-bg)', color: 'var(--dm-orange-text)', border: 'var(--dm-orange-border)' };
        case 'MEDIUM':
          return { label: 'Trung bình', bg: 'var(--dm-amber-bg)', color: 'var(--dm-amber-text)', border: 'var(--dm-amber-border)' };
        default:
          return { label: 'Mức thấp', bg: 'var(--dm-surface-subtle)', color: 'var(--dm-text-secondary)', border: 'var(--dm-border)' };
      }
    };

    const formatHazardTime = (iso?: string) => {
      if (!iso) return 'Vừa xong';
      try {
        const d = new Date(iso);
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${time} ${date}`;
      } catch {
        return iso;
      }
    };

    const handleExportHazardsExcel = (onlySelected = false) => {
      const targetList = onlySelected
        ? sortedReports.filter((r) => selectedHazardIds.includes(r._id))
        : sortedReports;
      if (targetList.length === 0) {
        showToast('Chưa có điểm nguy hiểm nào để xuất file Excel!', 'error');
        return;
      }

      const getStatusLabel = (status: string) => {
        if (status === 'APPROVED') return 'Đã duyệt';
        if (status === 'PENDING') return 'Chờ thẩm định';
        if (status === 'REJECTED') return 'Từ chối';
        return status || '—';
      };

      const headers = [
        'STT',
        'Tiêu đề điểm nguy hiểm',
        'Loại hiểm họa',
        'Mức độ nguy hiểm',
        'Trạng thái',
        'Khu vực / Địa phương',
        'Địa chỉ hiện trường',
        'Mô tả hiện trường',
        'Người báo cáo',
        'SĐT người báo',
        'Link GPS Google Maps',
        'Link ảnh hiện trường',
        'Thời gian ghi nhận',
      ];

      let approvedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;
      let highSeverityCount = 0;

      const dataMatrix = targetList.map((r, idx) => {
        const typeCfg = getHazardTypeConfig(r.hazardType, r.customHazardType);
        const sevCfg = getSeverityBadge(r.severity);
        const reporterName = typeof r.reportedBy === 'object' ? (r.reportedBy?.fullName || 'Người dân') : 'Hệ thống';
        const reporterPhone = typeof r.reportedBy === 'object' ? (r.reportedBy?.phone || '—') : '—';
        const coords = r.location?.coordinates;
        const mapsLink =
          Array.isArray(coords) && coords.length === 2
            ? `https://www.google.com/maps/search/?api=1&query=${Number(coords[1]).toFixed(6)},${Number(coords[0]).toFixed(6)}`
            : '—';
        const imageList = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
        const imageLinks = imageList.length > 0 ? imageList.join('\n') : '—';

        if (r.status === 'APPROVED') approvedCount += 1;
        else if (r.status === 'PENDING') pendingCount += 1;
        else if (r.status === 'REJECTED') rejectedCount += 1;
        if (r.severity === 'CRITICAL' || r.severity === 'HIGH') highSeverityCount += 1;

        return [
          { v: idx + 1, align: 'center' as const },
          { v: r.title || '—', align: 'left' as const },
          { v: typeCfg.label, align: 'center' as const },
          { v: sevCfg.label, align: 'center' as const },
          { v: getStatusLabel(r.status), align: 'center' as const },
          { v: getHazardDistrictName(r), align: 'left' as const },
          { v: r.address || '—', align: 'left' as const },
          { v: r.description || '—', align: 'left' as const },
          { v: reporterName, align: 'left' as const },
          { v: reporterPhone, align: 'center' as const },
          { v: mapsLink, align: 'left' as const },
          { v: imageLinks, align: 'left' as const },
          { v: formatDateVi(r.createdAt), align: 'center' as const },
        ];
      });

      const { rows, merges } = buildSheetFormHeader(
        'BÁO CÁO ĐIỂM NGUY HIỂM & HIỆN TRƯỜNG THIÊN TAI — HỆ THỐNG CỨU HỘ KHẨN CẤP (SOS)',
        `Thời gian xuất: ${formatDateVi(new Date().toISOString())} | Tổng số điểm nguy hiểm: ${targetList.length}`,
        headers.length,
        [
          ['Đơn vị xuất báo cáo', user?.fullName || 'Quản trị viên SOS', 'Tổng số điểm nguy hiểm', targetList.length],
          ['Đã duyệt hiển thị', approvedCount, 'Chờ thẩm định', pendingCount],
          ['Đã từ chối', rejectedCount, 'Mức độ Rất cao / Cao', highSeverityCount],
        ]
      );

      appendDataTable(rows, headers, dataMatrix, [
        'TỔNG',
        `${targetList.length} điểm nguy hiểm`,
        '',
        `Cao/Rất cao: ${highSeverityCount}`,
        `Duyệt: ${approvedCount} | Chờ: ${pendingCount}`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);

      exportWorkbookSheets(
        [
          {
            name: 'Diem nguy hiem',
            colWidths: [7, 28, 18, 18, 16, 22, 30, 34, 22, 16, 46, 46, 20],
            rows,
            merges,
          },
        ],
        `Bao_cao_diem_nguy_hiem_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      showToast(`Đã xuất ${targetList.length} điểm nguy hiểm ra file Excel!`, 'success');
    };

    const notifyInvalidImageFile = () => {
      showToast('Chỉ hỗ trợ tải lên tệp hình ảnh', 'warning');
    };

    const closeEditReviewModal = () => {
      if (submittingReview) return;
      revokePendingImagePreviews(editPendingImages);
      setEditPendingImages([]);
      setReviewingHazard(null);
    };

    const closeCreateHazardModal = () => {
      if (submittingCreate) return;
      revokePendingImagePreviews(createPendingImages);
      setCreatePendingImages([]);
      setIsCreateHazardOpen(false);
    };

    // Mở Form thẩm định & chuẩn hóa thông tin điểm nguy hiểm ngay trong DetailSheet
    const handleOpenReviewModal = (hazard: HazardReportItem) => {
      setDetailHazard(hazard);
      setReviewingHazard(hazard);
      setEditTitle(hazard.title || '');
      setEditHazardType(hazard.hazardType || 'FLOOD');
      setEditCustomHazardType(hazard.customHazardType || '');
      setEditSeverity(hazard.severity || 'HIGH');
      setEditAddress(hazard.address || '');
      const coords = hazard.location?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        setEditLng(coords[0]);
        setEditLat(coords[1]);
      } else {
        setEditLng(108.2170);
        setEditLat(16.0605);
      }
      setEditDescription(hazard.description || '');
      setEditReviewNote(
        hazard.reviewNote ||
          (hazard.status === 'APPROVED'
            ? 'Đã thẩm định thông tin và phê duyệt đưa lên bản đồ tác chiến'
            : 'Đã xác minh và chuẩn hóa thông tin cảnh báo')
      );
      setEditExistingImages(Array.isArray(hazard.images) ? hazard.images : []);
      revokePendingImagePreviews(editPendingImages);
      setEditPendingImages([]);
      setEditErrors({});
    };

    // Mở Form Tạo Điểm Nguy Hiểm Mới (Dành cho Quản trị viên ADMIN & Cán bộ chính quyền địa phương)
    const handleOpenCreateHazardModal = () => {
      let defaultLat = 16.0570;
      let defaultLng = 108.2170;
      if (fixedJurisdictionConfig?.bounds) {
        defaultLat = Number(((fixedJurisdictionConfig.bounds.minLat + fixedJurisdictionConfig.bounds.maxLat) / 2).toFixed(5));
        defaultLng = Number(((fixedJurisdictionConfig.bounds.minLng + fixedJurisdictionConfig.bounds.maxLng) / 2).toFixed(5));
      }
      setCreateTitle('');
      setCreateHazardType('FLOOD');
      setCreateCustomHazardType('');
      setCreateSeverity('HIGH');
      let initAreaId = '';
      if (isAdmin) {
        if (selectedAdminProvince !== 'ALL') {
          const matched = daNangWards.find(
            (a) =>
              String(a._id) === selectedAdminProvince ||
              a.name.toLowerCase().includes(selectedAdminProvince.toLowerCase()) ||
              selectedAdminProvince.toLowerCase().includes(a.name.toLowerCase())
          );
          initAreaId = matched ? String(matched._id) : daNangProvinceId || (areas[0] ? String(areas[0]._id) : '');
        } else {
          initAreaId = daNangProvinceId || (areas[0] ? String(areas[0]._id) : '');
        }
      } else {
        initAreaId = (validAreaById?._id as string) || (foundAreaByName?._id as string) || accountAreaId || '';
      }
      const selectedInitArea = areas.find((a) => String(a._id) === initAreaId);
      setCreateHazardAreaId(initAreaId);
      setCreateAddress(
        isAdmin
          ? selectedInitArea?.name || (selectedAdminProvince !== 'ALL' ? selectedAdminProvince : daNangProvince?.name || 'Thành phố Đà Nẵng')
          : accountAreaWithCity || accountAreaDisplayName
      );
      setCreateLat(defaultLat);
      setCreateLng(defaultLng);
      setCreateDescription('');
      setCreateStatus('APPROVED');
      setCreateReviewNote(isAdmin ? 'Điểm nguy hiểm được thiết lập bởi Quản Trị Viên Hệ Thống SOS' : `Điểm nguy hiểm được thiết lập bởi Cán bộ ${localTabLabel}`);
      revokePendingImagePreviews(createPendingImages);
      setCreatePendingImages([]);
      setCreateErrors({});
      setIsCreateHazardOpen(true);
    };

    const isPlaceholderHazardAddress = (value: string): boolean => {
      const trimmed = value.trim();
      if (!trimmed || trimmed.length <= 3) return true;
      const placeholders = [
        daNangProvince?.name,
        'Thành phố Đà Nẵng',
        accountAreaWithCity,
        accountAreaDisplayName,
        localTabLabel,
      ].filter(Boolean);
      return (
        placeholders.includes(trimmed) ||
        daNangWards.some((w) => w.name.trim() === trimmed)
      );
    };

    // Gửi yêu cầu Tạo Điểm Nguy Hiểm Mới lên server
    const handleSubmitCreateHazard = async () => {
      const errors: {
        title?: string;
        address?: string;
        description?: string;
        customHazardType?: string;
        coordinates?: string;
        general?: string;
      } = {};

      if (!createTitle.trim()) {
        errors.title = 'Vui lòng nhập tiêu đề điểm nguy hiểm!';
      }
      if (!createAddress.trim()) {
        errors.address = 'Vui lòng nhập địa chỉ hiện trường cụ thể!';
      }
      if (!createDescription.trim()) {
        errors.description = 'Vui lòng nhập mô tả hiện trường & khuyến cáo an toàn!';
      }
      if (createHazardType === 'OTHER' && !createCustomHazardType.trim()) {
        errors.customHazardType = 'Vui lòng nhập cụ thể tên hiểm họa khác!';
      }
      if (
        isNaN(createLat) ||
        isNaN(createLng) ||
        createLat < -90 ||
        createLat > 90 ||
        createLng < -180 ||
        createLng > 180
      ) {
        errors.coordinates = 'Tọa độ GPS không hợp lệ. Vui lòng chọn điểm trên bản đồ hoặc dán link Google Maps!';
      }

      if (Object.keys(errors).length > 0) {
        errors.general = 'Vui lòng hoàn thiện các trường thông tin bắt buộc còn thiếu bên dưới!';
        setCreateErrors(errors);
        return;
      }
      setCreateErrors({});

      // Mở modal xác nhận trước khi gửi API
      const statusLabel = createStatus === 'APPROVED' ? 'Duyệt & Công bố ngay' : 'Lưu nháp / Chờ duyệt';
      const typeConfig = getHazardTypeConfig(createHazardType, createCustomHazardType);
      const sevBadge = getSeverityBadge(createSeverity);

      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận tạo điểm nguy hiểm',
        message: `Bạn có chắc chắn muốn khởi tạo điểm nguy hiểm này với trạng thái "${statusLabel}" không?`,
        type: 'primary',
        confirmText: 'Xác nhận tạo',
        cancelText: 'Quay lại',
        details: [
          { label: 'Tiêu đề điểm', value: createTitle.trim() },
          { label: 'Loại hiểm họa', value: typeConfig.label },
          { label: 'Mức độ', value: sevBadge.label },
          { label: 'Địa chỉ', value: createAddress.trim() },
          { label: 'Trạng thái công bố', value: statusLabel },
          ...(createPendingImages.length > 0
            ? [{ label: 'Ảnh hiện trường', value: `${createPendingImages.length} ảnh` }]
            : []),
        ],
        onConfirm: async () => {
          await executeSubmitCreateHazard();
        },
      });
    };

    // Thực hiện gọi API tạo điểm nguy hiểm sau khi đã xác nhận
    const executeSubmitCreateHazard = async () => {
      try {
        setSubmittingCreate(true);
        const uploadedImages = await uploadPendingImageItems(
          createPendingImages,
          uploadHazardImage,
          'Không thể tải lên đầy đủ hình ảnh điểm nguy hiểm'
        );
        const resolvedAreaId =
          createHazardAreaId ||
          (validAreaById?._id as string) ||
          (foundAreaByName?._id as string) ||
          daNangProvinceId ||
          (areas[0]?._id as string) ||
          accountAreaId;

        const payload = {
          title: createTitle.trim(),
          description: createDescription.trim(),
          hazardType: createHazardType,
          customHazardType: createHazardType === 'OTHER' ? createCustomHazardType.trim() : undefined,
          severity: createSeverity,
          location: {
            type: 'Point' as const,
            coordinates: [Number(createLng), Number(createLat)] as [number, number],
          },
          address: createAddress.trim(),
          areaId: resolvedAreaId,
          images: uploadedImages,
          status: createStatus,
          reviewNote: createReviewNote.trim() || `Cán bộ ${localTabLabel} tạo trực tiếp`,
        };

        const res = await createHazardReport(payload);
        if (res.success && res.data) {
          const newReport = res.data;
          setHazardReports((prev) => [newReport, ...prev]);
          setHazardCounts((prev) => ({
            ...prev,
            TOTAL: prev.TOTAL + 1,
            [createStatus]: (prev as any)[createStatus] !== undefined ? (prev as any)[createStatus] + 1 : prev.APPROVED + 1,
          }));

          revokePendingImagePreviews(createPendingImages);
          setCreatePendingImages([]);
          setIsCreateHazardOpen(false);
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(
            res.message ||
              (createStatus === 'APPROVED'
                ? 'Khởi tạo và công bố điểm nguy hiểm thành công!'
                : 'Tạo điểm nguy hiểm (Lưu nháp / Chờ duyệt) thành công!'),
            'success'
          );
        } else {
          setCreateErrors((prev) => ({
            ...prev,
            general: 'Không thể tạo điểm nguy hiểm. Vui lòng kiểm tra lại!',
          }));
          showToast('Không thể tạo điểm nguy hiểm. Vui lòng kiểm tra lại!', 'error');
        }
      } catch (err: any) {
        setCreateErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi tạo điểm nguy hiểm mới',
        }));
        showToast(err.message || 'Lỗi khi tạo điểm nguy hiểm mới', 'error');
      } finally {
        setSubmittingCreate(false);
      }
    };

    // Gửi dữ liệu thẩm định & chuẩn hóa lên server
    const handleSubmitReview = async (status: 'APPROVED' | 'REJECTED') => {
      if (!reviewingHazard) return;

      if (status === 'APPROVED') {
        const errors: {
          title?: string;
          address?: string;
          description?: string;
          customHazardType?: string;
          coordinates?: string;
          general?: string;
        } = {};

        if (!editTitle.trim()) {
          errors.title = 'Vui lòng nhập tiêu đề điểm nguy hiểm chuẩn xác!';
        }
        if (!editAddress.trim()) {
          errors.address = 'Vui lòng nhập địa chỉ hiện trường chuẩn xác!';
        }
        if (!editDescription.trim()) {
          errors.description = 'Vui lòng nhập mô tả hiện trường & khuyến cáo an toàn!';
        }
        if (editHazardType === 'OTHER' && !editCustomHazardType.trim()) {
          errors.customHazardType = 'Vui lòng nhập cụ thể tên hiểm họa khác!';
        }
        if (
          isNaN(editLat) ||
          isNaN(editLng) ||
          editLat < -90 ||
          editLat > 90 ||
          editLng < -180 ||
          editLng > 180
        ) {
          errors.coordinates = 'Tọa độ GPS không hợp lệ. Vui lòng chọn điểm trên bản đồ hoặc dán link Google Maps!';
        }

        if (Object.keys(errors).length > 0) {
          errors.general = 'Vui lòng hoàn thiện các trường thông tin chuẩn hóa trước khi phê duyệt!';
          setEditErrors(errors);
          return;
        }
        setEditErrors({});

        // Mở modal xác nhận trước khi phê duyệt
        const typeConfig = getHazardTypeConfig(editHazardType, editCustomHazardType);
        const sevBadge = getSeverityBadge(editSeverity);
        setConfirmModal({
          isOpen: true,
          title: 'Xác nhận chuẩn hóa & Phê duyệt',
          message: 'Điểm nguy hiểm sau khi phê duyệt sẽ được chuẩn hóa dữ liệu và công bố trực tiếp lên bản đồ tác chiến cứu hộ.',
          type: 'primary',
          confirmText: 'Xác nhận phê duyệt',
          cancelText: 'Quay lại',
          details: [
            { label: 'Tiêu đề điểm', value: editTitle.trim() },
            { label: 'Loại hiểm họa', value: typeConfig.label },
            { label: 'Mức độ', value: sevBadge.label },
            { label: 'Địa chỉ', value: editAddress.trim() },
            ...(editExistingImages.length + editPendingImages.length > 0
              ? [{ label: 'Ảnh hiện trường', value: `${editExistingImages.length + editPendingImages.length} ảnh` }]
              : []),
          ],
          onConfirm: async () => {
            await executeSubmitReview('APPROVED');
          },
        });
        return;
      }

      // Nếu từ chối: mở modal xác nhận kèm lý do
      handleInitiateRejectHazard();
    };

    // Thực hiện lưu thẩm định lên server
    const executeSubmitReview = async (status: 'APPROVED' | 'REJECTED', customNote?: string) => {
      if (!reviewingHazard) return;

      try {
        setSubmittingReview(true);
        const uploadedNewImages =
          status === 'APPROVED'
            ? await uploadPendingImageItems(
                editPendingImages,
                uploadHazardImage,
                'Không thể tải lên đầy đủ hình ảnh điểm nguy hiểm'
              )
            : [];
        const extraData: any = {
          title: editTitle.trim(),
          hazardType: editHazardType,
          customHazardType: editHazardType === 'OTHER' ? editCustomHazardType.trim() : undefined,
          severity: editSeverity,
          address: editAddress.trim(),
          description: editDescription.trim(),
          ...(status === 'APPROVED' ? { images: [...editExistingImages, ...uploadedNewImages] } : {}),
          location: {
            type: 'Point',
            coordinates: [Number(editLng), Number(editLat)],
          },
        };

        const finalNote =
          (customNote !== undefined ? customNote : editReviewNote).trim() ||
          (status === 'APPROVED' ? 'Đã chuẩn hóa và phê duyệt' : 'Từ chối điểm báo');

        const res = await reviewHazardReport(reviewingHazard._id, status, finalNote, extraData);
        if (res.success) {
          const updatedItem = res.data;
          setHazardReports((prev) =>
            prev.map((r) => (r._id === reviewingHazard._id ? updatedItem : r))
          );
          setHazardCounts((prev) => {
            const wasPending = reviewingHazard.status === 'PENDING';
            const wasApproved = reviewingHazard.status === 'APPROVED';
            const wasRejected = reviewingHazard.status === 'REJECTED';
            return {
              ...prev,
              PENDING: wasPending ? Math.max(0, prev.PENDING - 1) : prev.PENDING,
              APPROVED: status === 'APPROVED' ? (wasApproved ? prev.APPROVED : prev.APPROVED + 1) : (wasApproved ? Math.max(0, prev.APPROVED - 1) : prev.APPROVED),
              REJECTED: status === 'REJECTED' ? (wasRejected ? prev.REJECTED : prev.REJECTED + 1) : (wasRejected ? Math.max(0, prev.REJECTED - 1) : prev.REJECTED),
            };
          });

          if (detailHazard && detailHazard._id === reviewingHazard._id) {
            setDetailHazard(updatedItem);
          }

          revokePendingImagePreviews(editPendingImages);
          setEditPendingImages([]);
          setReviewingHazard(null);
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(
            status === 'APPROVED'
              ? 'Đã chuẩn hóa và phê duyệt điểm nguy hiểm thành công!'
              : 'Đã từ chối điểm nguy hiểm thành công!',
            status === 'APPROVED' ? 'success' : 'info'
          );
        }
      } catch (err: any) {
        setEditErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi cập nhật thẩm định điểm nguy hiểm',
        }));
        showToast(err.message || 'Lỗi khi cập nhật thẩm định điểm nguy hiểm', 'error');
      } finally {
        setSubmittingReview(false);
      }
    };

    // Mở modal xác nhận từ chối điểm báo (thay thế prompt)
    const handleInitiateRejectHazard = (hazardId?: string) => {
      const defaultReason = editReviewNote.trim() || 'Thông tin chưa đủ căn cứ xác thực';
      setConfirmPromptValue(defaultReason);
      setConfirmModal({
        isOpen: true,
        title: 'Từ chối điểm nguy hiểm',
        message: 'Bạn có chắc chắn muốn từ chối điểm nguy hiểm này? Điểm báo sẽ chuyển sang trạng thái "Từ chối" và không công bố.',
        type: 'danger',
        confirmText: 'Từ chối điểm báo',
        cancelText: 'Hủy bỏ',
        promptInput: {
          label: 'Lý do từ chối (tùy chọn):',
          defaultValue: defaultReason,
          placeholder: 'Nhập lý do từ chối điểm nguy hiểm này...',
        },
        onConfirm: async (customReason) => {
          const finalReason = (customReason || defaultReason).trim();
          if (hazardId) {
            await handleQuickReview(hazardId, 'REJECTED', finalReason);
            setDetailHazard(null);
          } else {
            setEditReviewNote(finalReason);
            await executeSubmitReview('REJECTED', finalReason);
          }
        },
      });
    };

    const handleQuickReview = async (id: string, status: 'APPROVED' | 'REJECTED', defaultNote?: string) => {
      try {
        setLoading(true);
        const finalNote = defaultNote || (status === 'APPROVED' ? 'Đã phê duyệt và đồng bộ lên bản đồ cảnh báo' : 'Từ chối điểm báo');
        const res = await reviewHazardReport(id, status, finalNote);
        if (res.success) {
          setHazardReports((prev) =>
            prev.map((r) => (r._id === id ? { ...r, status, reviewNote: finalNote } : r))
          );
          setHazardCounts((prev) => {
            const nextPending = Math.max(0, prev.PENDING - 1);
            return {
              ...prev,
              PENDING: nextPending,
              APPROVED: status === 'APPROVED' ? prev.APPROVED + 1 : prev.APPROVED,
              REJECTED: status === 'REJECTED' ? prev.REJECTED + 1 : prev.REJECTED,
            };
          });
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast(
            status === 'APPROVED'
              ? 'Đã phê duyệt và công bố điểm nguy hiểm lên bản đồ!'
              : 'Đã từ chối điểm báo nguy hiểm!',
            status === 'APPROVED' ? 'success' : 'info'
          );
        }
      } catch (err: any) {
        showToast(err.message || 'Lỗi khi cập nhật trạng thái duyệt', 'error');
      } finally {
        setLoading(false);
      }
    };

    // Mở modal xác nhận trước khi xóa (thay thế window.confirm)
    const handleDeleteHazard = (id: string, title?: string) => {
      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận xóa điểm nguy hiểm',
        message: `Bạn có chắc chắn muốn xóa điểm nguy hiểm "${title || 'này'}" không? Thao tác này sẽ gỡ bỏ dữ liệu khỏi cơ sở dữ liệu và bản đồ tác chiến.`,
        type: 'danger',
        confirmText: 'Xác nhận xóa',
        cancelText: 'Hủy bỏ',
        details: title ? [{ label: 'Tên điểm nguy hiểm', value: title }] : undefined,
        onConfirm: async () => {
          await executeDeleteHazard(id);
        },
      });
    };

    // Thực hiện xóa điểm nguy hiểm
    const executeDeleteHazard = async (id: string) => {
      try {
        setLoading(true);
        const res = await deleteHazardReport(id);
        if (res.success) {
          setHazardReports((prev) => prev.filter((r) => r._id !== id));
          setSelectedHazardIds((prev) => prev.filter((itemId) => itemId !== id));
          setHazardCounts((prev) => {
            const currentItem = hazardReports.find((r) => r._id === id);
            const st = currentItem?.status || 'PENDING';
            return {
              ...prev,
              TOTAL: Math.max(0, prev.TOTAL - 1),
              [st]: Math.max(0, (prev as any)[st] - 1),
            };
          });
          if (detailHazard && detailHazard._id === id) {
            setDetailHazard(null);
          }
          refreshData();
          window.dispatchEvent(new CustomEvent('sos_data_updated'));
          showToast('Đã xóa vĩnh viễn điểm nguy hiểm thành công!', 'success');
        }
      } catch (err: any) {
        showToast(err.message || 'Lỗi khi xóa điểm nguy hiểm', 'error');
      } finally {
        setLoading(false);
      }
    };

    // Duyệt nhanh hàng loạt các điểm nguy hiểm đã chọn
    const handleBulkApproveHazards = () => {
      if (selectedHazardIds.length === 0) return;
      const count = selectedHazardIds.length;
      setConfirmModal({
        isOpen: true,
        title: `Phê duyệt nhanh ${count} điểm nguy hiểm đã chọn`,
        message: `Bạn có chắc chắn muốn phê duyệt nhanh ${count} điểm nguy hiểm đã chọn? Các điểm này sẽ được chuyển sang trạng thái ĐÃ DUYỆT (APPROVED) và hiển thị trực tiếp lên bản đồ cứu hộ.`,
        type: 'primary',
        confirmText: `Duyệt (${count})`,
        cancelText: 'Hủy bỏ',
        onConfirm: async () => {
          setIsBulkHazardAction(true);
          try {
            let successCount = 0;
            await Promise.allSettled(
              selectedHazardIds.map(async (id) => {
                const res = await reviewHazardReport(id, 'APPROVED', 'Đã thẩm định và phê duyệt hàng loạt');
                if (res.success && res.data) {
                  successCount++;
                  setHazardReports((prev) => prev.map((r) => (r._id === id ? res.data : r)));
                }
              })
            );
            setSelectedHazardIds([]);
            refreshData();
            window.dispatchEvent(new CustomEvent('sos_data_updated'));
            setConfirmModal((c) => ({ ...c, isOpen: false }));
            showToast(`✅ Đã phê duyệt thành công ${successCount} điểm nguy hiểm!`, 'success');
          } catch (err: any) {
            showToast('❌ Có lỗi khi phê duyệt hàng loạt: ' + (err.message || 'Lỗi không xác định'), 'error');
          } finally {
            setIsBulkHazardAction(false);
          }
        },
      });
    };

    // Đóng / Từ chối hàng loạt điểm nguy hiểm đã chọn (xác nhận bởi TableBulkActionBar)
    const handleBulkRejectHazards = async () => {
      if (selectedHazardIds.length === 0) return;
      setIsBulkHazardAction(true);
      try {
        const ids = [...selectedHazardIds];
        const { succeeded, failed } = await runBulkOperation(ids, (id) =>
          reviewHazardReport(id, 'REJECTED', 'Đã đóng / từ chối hàng loạt')
        );
        if (succeeded.length > 0) {
          showToast(`✅ Đã đóng / từ chối ${succeeded.length} điểm nguy hiểm!`, 'success');
        }
        if (failed.length > 0) {
          showToast(`⚠️ Không thể đóng ${failed.length} điểm nguy hiểm.`, 'warning');
        }
        setSelectedHazardIds([]);
        refreshData();
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
      } finally {
        setIsBulkHazardAction(false);
      }
    };

    // Xóa vĩnh viễn hàng loạt các điểm nguy hiểm đã chọn (xác nhận bởi TableBulkActionBar)
    const handleBulkDeleteHazards = async () => {
      if (selectedHazardIds.length === 0) return;
      setIsBulkHazardAction(true);
      try {
        const ids = [...selectedHazardIds];
        const { succeeded, failed } = await runBulkOperation(ids, (id) => deleteHazardReport(id));
        if (succeeded.length > 0) {
          const deletedIdSet = new Set(succeeded);
          setHazardReports((prev) => prev.filter((r) => !deletedIdSet.has(r._id)));
          if (detailHazard && deletedIdSet.has(detailHazard._id)) {
            setDetailHazard(null);
          }
          showToast(`✅ Đã xóa vĩnh viễn ${succeeded.length} điểm nguy hiểm!`, 'success');
        }
        if (failed.length > 0) {
          showToast(`⚠️ Không thể xóa ${failed.length} điểm nguy hiểm.`, 'warning');
        }
        setSelectedHazardIds([]);
        refreshData();
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
      } finally {
        setIsBulkHazardAction(false);
      }
    };

    const actionButtons = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <ExcelExportButton
          onClick={() => handleExportHazardsExcel(false)}
          disabled={sortedReports.length === 0}
          title="Xuất danh sách điểm nguy hiểm đang lọc ra file Excel có biểu mẫu"
        />

        <button
          type="button"
          className="sos-btn-flat primary"
          onClick={handleOpenCreateHazardModal}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <PlusCircle size={15} />
          <span>Tạo Điểm Nguy Hiểm</span>
        </button>
      </div>
    );

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
        {/* 1. TIÊU ĐỀ TRANG & ĐỊA BÀN PHỤ TRÁCH (Chỉ hiển thị cho Admin) */}
        {isAdmin && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              background: 'var(--dm-surface)',
              border: '1px solid var(--dm-border-strong)',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} color="#0284c7" />
              <span style={{ color: 'var(--dm-text-muted)', fontWeight: 500, fontSize: '13.5px' }}>
                Phạm vi quản trị:
              </span>
              <strong style={{ color: 'var(--dm-text-strong)', fontWeight: 700, fontSize: '14px' }}>
                {daNangProvince?.name || 'Thành phố Đà Nẵng'}
              </strong>
            </div>

            {actionButtons}
          </div>
        )}

        {/* 2. CHỌN PHẠM VI XEM (Chỉ hiển thị cho Admin) */}
        {isAdmin && (
          <div className="sos-scope-tabs" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="sos-scope-tab active"
              onClick={() => {
                setSelectedAdminProvince('ALL');
                setHazardPage(1);
              }}
              title="Hiển thị tất cả điểm nguy hiểm tại Đà Nẵng"
            >
              <span>{selectedAdminProvince === 'ALL' ? 'Toàn Đà Nẵng' : selectedAdminProvince}</span>
              <span className="sos-scope-badge">{baseScopedReports.length}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
              <DaNangAreaSelect
                wards={daNangWards}
                valueKey="name"
                value={selectedAdminProvince}
                onChange={(val) => {
                  setSelectedAdminProvince(val);
                  setHazardPage(1);
                }}
              />

              {selectedAdminProvince !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAdminProvince('ALL');
                    setHazardPage(1);
                  }}
                  title="Quay lại xem Toàn Đà Nẵng"
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    color: 'var(--dm-blue-text)',
                    backgroundColor: 'var(--dm-blue-bg)',
                    border: '1px solid var(--dm-blue-border)',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  ✕ Xem Toàn Đà Nẵng
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. THANH CÔNG CỤ: TAB LỌC TRẠNG THÁI & TÌM KIẾM (CỐ ĐỊNH) */}
        <div className="sos-clean-toolbar" style={{ flexShrink: 0 }}>
          <div className="sos-clean-tabs">
            <button
              type="button"
              className={`sos-clean-tab ${hazardFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setHazardFilter('ALL');
                setHazardPage(1);
              }}
            >
              Tất cả <span className="sos-clean-tab-count">{baseScopedReports.length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${hazardFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => {
                setHazardFilter('PENDING');
                setHazardPage(1);
              }}
            >
              Chờ thẩm định <span className="sos-clean-tab-count">{baseScopedReports.filter((r) => r.status === 'PENDING').length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${hazardFilter === 'APPROVED' ? 'active' : ''}`}
              onClick={() => {
                setHazardFilter('APPROVED');
                setHazardPage(1);
              }}
            >
              Đã duyệt <span className="sos-clean-tab-count">{baseScopedReports.filter((r) => r.status === 'APPROVED').length}</span>
            </button>
            <button
              type="button"
              className={`sos-clean-tab ${hazardFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => {
                setHazardFilter('REJECTED');
                setHazardPage(1);
              }}
            >
              Từ chối <span className="sos-clean-tab-count">{baseScopedReports.filter((r) => r.status === 'REJECTED').length}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="sos-clean-search">
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="Tìm theo tiêu đề, địa chỉ, người gửi..."
                value={hazardSearchText}
                onChange={(e) => {
                  setHazardSearchText(e.target.value);
                  setHazardPage(1);
                }}
              />
              {hazardSearchText && (
                <button
                  type="button"
                  onClick={() => {
                    setHazardSearchText('');
                    setHazardPage(1);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--dm-text-muted)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {!isAdmin && actionButtons}
          </div>
        </div>

        {/* 4. BẢNG DỮ LIỆU ĐIỂM NGUY HIỂM: THEAD CỐ ĐỊNH, CÁC HÀNG BÊN DƯỚI CUỘN ĐƯỢC */}
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
          <TableBulkActionBar
            selectedCount={selectedHazardIds.length}
            totalFilteredCount={sortedReports.length}
            unitLabel="điểm nguy hiểm"
            onSelectAllFiltered={() => setSelectedHazardIds(sortedReports.map((r) => r._id))}
            onClearSelection={() => setSelectedHazardIds([])}
            onExportSelected={() => handleExportHazardsExcel(true)}
            onCloseSelected={handleBulkRejectHazards}
            closeLabel="Đóng / Từ chối"
            closeConfirmTitle={`Đóng / Từ chối ${selectedHazardIds.length} điểm nguy hiểm?`}
            closeConfirmDesc="Các điểm nguy hiểm đã chọn sẽ chuyển sang trạng thái Từ chối và gỡ khỏi bản đồ công khai."
            onDeleteSelected={handleBulkDeleteHazards}
            deleteLabel="Xóa đã chọn"
            extraActions={
              <button
                type="button"
                onClick={handleBulkApproveHazards}
                disabled={isBulkHazardAction}
                className="sos-bulk-btn"
                style={{
                  background: 'var(--dm-blue-bg)',
                  color: 'var(--dm-blue-text)',
                  borderColor: 'var(--dm-blue-border)',
                }}
                title="Duyệt nhanh tất cả các điểm nguy hiểm đã chọn"
              >
                <CheckCircle2 size={13} />
                <span>Duyệt nhanh ({selectedHazardIds.length})</span>
              </button>
            }
          />

          {/* KHUNG CUỘN CỦA BẢNG DỮ LIỆU */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
            <table className="sos-clean-table">
              <thead>
                <tr>
                  <th className="sos-checkbox-col">
                    <TableSelectAllCheckbox
                      checked={
                        paginatedReports.length > 0 &&
                        paginatedReports.every((r) => selectedHazardIds.includes(r._id))
                      }
                      indeterminate={
                        paginatedReports.some((r) => selectedHazardIds.includes(r._id)) &&
                        !paginatedReports.every((r) => selectedHazardIds.includes(r._id))
                      }
                      disabled={paginatedReports.length === 0}
                      onChange={() => {
                        const allOnPage =
                          paginatedReports.length > 0 &&
                          paginatedReports.every((r) => selectedHazardIds.includes(r._id));
                        if (!allOnPage) {
                          const pageIds = paginatedReports.map((r) => r._id);
                          setSelectedHazardIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                        } else {
                          const pageIdSet = new Set(paginatedReports.map((r) => r._id));
                          setSelectedHazardIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
                        }
                      }}
                      title="Chọn tất cả điểm nguy hiểm trên trang hiện tại"
                    />
                  </th>
                  <th
                    className={`sortable ${hazardSortField === 'title' ? 'sorted' : ''}`}
                    onClick={() => handleSort('title')}
                    style={{ width: '23%' }}
                    title="Nhấn để sắp xếp theo tên / loại điểm nguy hiểm"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Điểm nguy hiểm / Loại</span>
                      {renderSortIcon('title')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${hazardSortField === 'district' ? 'sorted' : ''}`}
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
                    className={`sortable ${hazardSortField === 'severity' ? 'sorted' : ''}`}
                    onClick={() => handleSort('severity')}
                    style={{ width: '11%' }}
                    title="Nhấn để sắp xếp theo mức độ nghiêm trọng"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Mức độ</span>
                      {renderSortIcon('severity')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${hazardSortField === 'address' ? 'sorted' : ''}`}
                    onClick={() => handleSort('address')}
                    style={{ width: '28%' }}
                    title="Nhấn để sắp xếp theo địa chỉ hiện trường"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Địa chỉ hiện trường</span>
                      {renderSortIcon('address')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${hazardSortField === 'createdAt' ? 'sorted' : ''}`}
                    onClick={() => handleSort('createdAt')}
                    style={{ width: '13%' }}
                    title="Nhấn để sắp xếp theo thời gian"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span>Thời gian</span>
                      {renderSortIcon('createdAt')}
                    </div>
                  </th>
                  <th
                    className={`sortable ${hazardSortField === 'status' ? 'sorted' : ''}`}
                    onClick={() => handleSort('status')}
                    style={{ width: '10%', textAlign: 'center' }}
                    title="Nhấn để sắp xếp theo trạng thái"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>Trạng thái</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && hazardReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '16px 20px' }}>
                      <SyncLogoLoader size="md" message="Đang tải danh sách điểm nguy hiểm..." />
                    </td>
                  </tr>
                ) : totalHazardItems === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--dm-text-muted)', fontSize: '13px' }}>
                      <AlertTriangle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                      <div>Không có điểm nguy hiểm nào trong danh mục này.</div>
                      <button
                        type="button"
                        onClick={handleOpenCreateHazardModal}
                        style={{
                          marginTop: '12px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          color: 'var(--dm-blue-text)',
                          background: 'var(--dm-blue-bg)',
                          border: '1px solid var(--dm-blue-border)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <PlusCircle size={13} />
                        <span>Tạo điểm nguy hiểm mới ngay</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  paginatedReports.map((r) => {
                    const reporterName = typeof r.reportedBy === 'object' ? (r.reportedBy?.fullName || 'Người dân') : 'Người dân';
                    const typeCfg = getHazardTypeConfig(r.hazardType, r.customHazardType);
                    const sevBadge = getSeverityBadge(r.severity);
                    const isLocal = isHazardInOfficerJurisdiction(r);
                    const districtName = getHazardDistrictName(r);

                    return (
                      <tr
                        key={r._id}
                        className={`ra-clickable-row ${detailHazard?._id === r._id || selectedHazardIds.includes(r._id) ? 'row-selected' : ''}`}
                        onClick={() => setDetailHazard(r)}
                        title="Nhấn để xem chi tiết điểm nguy hiểm"
                        style={{
                          cursor: 'pointer',
                        }}
                      >
                        {/* 0. Checkbox chọn từng mục */}
                        <td
                          className="sos-checkbox-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TableRowCheckbox
                            checked={selectedHazardIds.includes(r._id)}
                            onChange={() => {
                              setSelectedHazardIds((prev) =>
                                prev.includes(r._id) ? prev.filter((id) => id !== r._id) : [...prev, r._id]
                              );
                            }}
                            ariaLabel={`Chọn điểm nguy hiểm ${r.title}`}
                          />
                        </td>

                        {/* 1. Điểm nguy hiểm & Loại hiểm họa */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '8px',
                                backgroundColor: 'var(--dm-surface-muted)',
                                border: '1px solid var(--dm-border-strong)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              title={typeCfg.label}
                            >
                              <HazardTypeIcon type={r.hazardType} size={18} color="#334155" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="ch-tbl-primary">
                                {r.title}
                              </div>
                              <span
                                className="ch-tbl-meta"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  marginTop: '2px',
                                }}
                              >
                                <HazardTypeIcon type={r.hazardType} size={12} color="currentColor" />
                                {typeCfg.label}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Địa phương quản lý */}
                        <td>
                          <span
                            className="ch-tbl-body"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: isLocal ? 500 : 400,
                              whiteSpace: 'nowrap',
                            }}
                            title={`Địa bàn quản lý: ${districtName}`}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLocal ? '#16a34a' : '#94a3b8', flexShrink: 0 }} />
                            {districtName}
                          </span>
                        </td>

                        {/* 3. Mức độ nghiêm trọng */}
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              backgroundColor: sevBadge.bg,
                              color: sevBadge.color,
                              border: `1px solid ${sevBadge.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sevBadge.label}
                          </span>
                        </td>

                        {/* 4. Địa chỉ hiện trường */}
                        <td>
                          <div className="ch-tbl-body">
                            {r.address}
                          </div>
                        </td>

                        {/* 5. Thời gian & Người báo */}
                        <td>
                          <div className="ch-tbl-body" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatHazardTime(r.createdAt)}
                          </div>
                          <div className="ch-tbl-meta" style={{ marginTop: '2px' }}>
                            {reporterName}
                          </div>
                        </td>

                        {/* 6. Trạng thái */}
                        <td style={{ textAlign: 'center' }}>
                          {r.status === 'PENDING' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: 'var(--dm-amber-bg)', color: 'var(--dm-amber-text)', border: '1px solid var(--dm-amber-border)', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} /> Chờ duyệt
                            </span>
                          )}
                          {r.status === 'APPROVED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: 'var(--dm-green-bg)', color: 'var(--dm-green-text)', border: '1px solid #dcfce7', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} /> Đã duyệt
                            </span>
                          )}
                          {r.status === 'REJECTED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: 'var(--dm-red-bg)', color: 'var(--dm-red-text)', border: '1px solid var(--dm-red-border)', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} /> Từ chối
                            </span>
                          )}
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
              {totalHazardItems === 0 ? (
                'Không có dữ liệu'
              ) : (
                <>
                  Hiển thị <strong style={{ color: 'var(--dm-text-strong)' }}>{hazardStartIndex + 1}</strong> – <strong style={{ color: 'var(--dm-text-strong)' }}>{Math.min(hazardStartIndex + HAZARD_PAGE_SIZE, totalHazardItems)}</strong> trên tổng số <strong style={{ color: 'var(--dm-blue-text)' }}>{totalHazardItems}</strong> điểm nguy hiểm
                </>
              )}
            </div>

            {totalHazardPages > 1 && (
              <div className="sos-pagination-controls">
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeHazardPage === 1}
                  onClick={() => setHazardPage(1)}
                  title="Trang đầu"
                >
                  « Đầu
                </button>
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeHazardPage === 1}
                  onClick={() => setHazardPage((p) => Math.max(1, p - 1))}
                  title="Trang trước"
                >
                  ‹ Trước
                </button>

                {(() => {
                  const pages: (number | string)[] = [];
                  if (totalHazardPages <= 7) {
                    for (let i = 1; i <= totalHazardPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (safeHazardPage > 3) pages.push('...');
                    const start = Math.max(2, safeHazardPage - 1);
                    const end = Math.min(totalHazardPages - 1, safeHazardPage + 1);
                    for (let i = start; i <= end; i++) {
                      pages.push(i);
                    }
                    if (safeHazardPage < totalHazardPages - 2) pages.push('...');
                    pages.push(totalHazardPages);
                  }

                  return pages.map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--dm-text-muted)', fontSize: '13px' }}>
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`sos-pagination-btn ${p === safeHazardPage ? 'active' : ''}`}
                        onClick={() => setHazardPage(Number(p))}
                      >
                        {p}
                      </button>
                    );
                  });
                })()}

                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeHazardPage === totalHazardPages}
                  onClick={() => setHazardPage((p) => Math.min(totalHazardPages, p + 1))}
                  title="Trang sau"
                >
                  Sau ›
                </button>
                <button
                  type="button"
                  className="sos-pagination-btn"
                  disabled={safeHazardPage === totalHazardPages}
                  onClick={() => setHazardPage(totalHazardPages)}
                  title="Trang cuối"
                >
                  Cuối »
                </button>

                {/* Ô NHẬP SỐ TRANG TRỰC TIẾP */}
                <div className="sos-pagination-jump">
                  <span style={{ fontSize: '12px', color: 'var(--dm-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Đến trang:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalHazardPages}
                    value={jumpInputPage}
                    placeholder={String(safeHazardPage)}
                    onChange={(e) => setJumpInputPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = parseInt(jumpInputPage, 10);
                        if (!isNaN(target) && target >= 1 && target <= totalHazardPages) {
                          setHazardPage(target);
                          setJumpInputPage('');
                        } else {
                          showToast(`Vui lòng nhập số trang từ 1 đến ${totalHazardPages}`, 'warning');
                        }
                      }
                    }}
                    className="sos-pagination-jump-input"
                    title={`Nhập số trang từ 1 đến ${totalHazardPages}`}
                  />
                  <button
                    type="button"
                    className="sos-pagination-btn"
                    style={{ padding: '4px 9px', fontSize: '12px' }}
                    onClick={() => {
                      const target = parseInt(jumpInputPage, 10);
                      if (!isNaN(target) && target >= 1 && target <= totalHazardPages) {
                        setHazardPage(target);
                        setJumpInputPage('');
                      } else {
                        showToast(`Vui lòng nhập số trang từ 1 đến ${totalHazardPages}`, 'warning');
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

        {/* DRAWER CHI TIẾT & CHỈNH SỬA ĐIỂM NGUY HIỂM (CHRONICLE DETAIL SHEET) */}
        {(() => {
          const isEditingHazard = Boolean(
            reviewingHazard && detailHazard && reviewingHazard._id === detailHazard._id
          );
          const origCoords = reviewingHazard?.location?.coordinates;
          const origLng = Array.isArray(origCoords) && origCoords.length === 2 ? origCoords[0] : 108.217;
          const origLat = Array.isArray(origCoords) && origCoords.length === 2 ? origCoords[1] : 16.0605;
          const origReviewNote =
            reviewingHazard?.reviewNote ||
            (reviewingHazard?.status === 'APPROVED'
              ? 'Đã thẩm định thông tin và phê duyệt đưa lên bản đồ tác chiến'
              : 'Đã xác minh và chuẩn hóa thông tin cảnh báo');
          const isEditHazardDirty = Boolean(
            isEditingHazard &&
              reviewingHazard &&
              (editTitle !== (reviewingHazard.title || '') ||
                editHazardType !== (reviewingHazard.hazardType || 'FLOOD') ||
                editCustomHazardType !== (reviewingHazard.customHazardType || '') ||
                editSeverity !== (reviewingHazard.severity || 'HIGH') ||
                editAddress !== (reviewingHazard.address || '') ||
                Math.abs(Number(editLat) - Number(origLat)) > 1e-5 ||
                Math.abs(Number(editLng) - Number(origLng)) > 1e-5 ||
                editDescription !== (reviewingHazard.description || '') ||
                editReviewNote !== origReviewNote ||
                editPendingImages.length > 0 ||
                JSON.stringify(editExistingImages) !==
                  JSON.stringify(Array.isArray(reviewingHazard.images) ? reviewingHazard.images : []))
          );

          return (
        <DetailSheet
          open={Boolean(detailHazard)}
          onOpenChange={(open) => {
            if (!open && !selectedHazardPhoto && !submittingReview) {
              closeEditReviewModal();
              setDetailHazard(null);
            }
          }}
          size={isEditingHazard ? '2xl' : 'xl'}
          icon={
            detailHazard ? (
              <HazardTypeIcon type={detailHazard.hazardType} size={18} color="currentColor" />
            ) : undefined
          }
          title={
            isEditingHazard
              ? reviewingHazard?.status === 'APPROVED'
                ? `Chỉnh sửa: ${detailHazard?.title || ''}`
                : `Thẩm định & chuẩn hóa: ${detailHazard?.title || ''}`
              : detailHazard?.title || ''
          }
          description={
            detailHazard
              ? isEditingHazard
                ? 'Kiểm tra và chuẩn hóa các trường thông tin chuẩn xác trước khi công bố lên bản đồ tác chiến.'
                : `Mã: ${detailHazard._id} • Báo lúc: ${formatHazardTime(detailHazard.createdAt)}`
              : undefined
          }
          saveBar={
            isEditingHazard && reviewingHazard
              ? {
                  dirty: isEditHazardDirty,
                  saving: submittingReview,
                  onSave: () => handleSubmitReview('APPROVED'),
                  onDiscard: () => handleOpenReviewModal(reviewingHazard),
                  saveLabel:
                    reviewingHazard.status === 'APPROVED'
                      ? 'Lưu điểm nguy hiểm'
                      : 'Lưu & Phê duyệt',
                }
              : undefined
          }
          footer={
            detailHazard &&
            (() => {
              if (isEditingHazard && reviewingHazard) {
                return (
                  <>
                    <button
                      type="button"
                      className="sos-btn-flat danger"
                      disabled={submittingReview}
                      onClick={() => handleInitiateRejectHazard()}
                    >
                      <XCircle size={14} />
                      <span>Từ chối điểm báo</span>
                    </button>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {reviewingHazard.status !== 'APPROVED' && !isEditHazardDirty && (
                        <button
                          type="button"
                          className="sos-btn-flat primary"
                          disabled={submittingReview}
                          onClick={() => handleSubmitReview('APPROVED')}
                          style={{ padding: '7px 16px' }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Phê duyệt ngay</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="sos-btn-flat"
                        disabled={submittingReview}
                        onClick={closeEditReviewModal}
                      >
                        Quay lại xem chi tiết
                      </button>
                      <button
                        type="button"
                        className="sos-btn-flat"
                        disabled={submittingReview}
                        onClick={() => {
                          closeEditReviewModal();
                          setDetailHazard(null);
                        }}
                      >
                        Đóng
                      </button>
                    </div>
                  </>
                );
              }

              const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
              const isDetailInJurisdiction = isAdmin || isHazardInOfficerJurisdiction(detailHazard);
              return (
                <>
                  {isDetailInJurisdiction ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteHazard(detailHazard._id, detailHazard.title)}
                      disabled={loading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: 'var(--dm-red-bg)',
                        color: 'var(--dm-red-text)',
                        border: '1px solid var(--dm-red-border)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={15} />
                      <span>Xóa điểm nguy hiểm</span>
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'var(--dm-amber-bg)',
                        color: 'var(--dm-amber-text)',
                        border: '1px solid var(--dm-amber-border)',
                        fontSize: '12.5px',
                        fontWeight: 600,
                      }}
                    >
                      <i className="bi bi-shield-lock-fill" style={{ fontSize: '15px', color: 'var(--dm-amber-text)' }}></i>
                      <span>
                        Điểm nguy hiểm này ngoài khu vực quản lý ({accountAreaDisplayName}) — Bạn chỉ có quyền xem thông tin.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isDetailInJurisdiction && detailHazard.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleInitiateRejectHazard(detailHazard._id)}
                          disabled={loading}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: 'var(--dm-orange-bg)',
                            color: 'var(--dm-orange-text)',
                            border: '1px solid var(--dm-orange-border)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <XCircle size={15} />
                          <span>Từ chối</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleOpenReviewModal(detailHazard);
                          }}
                          disabled={loading}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                          }}
                        >
                          <i className="bi bi-pencil-square"></i>
                          <span>Chuẩn hóa &amp; Phê duyệt</span>
                        </button>
                      </>
                    )}

                    {isDetailInJurisdiction && detailHazard.status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenReviewModal(detailHazard);
                        }}
                        disabled={loading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: 'var(--dm-blue-bg)',
                          color: 'var(--dm-blue-text)',
                          border: '1px solid var(--dm-blue-border)',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit size={14} />
                        <span>Chỉnh sửa thông tin</span>
                      </button>
                    )}

                    {isDetailInJurisdiction && detailHazard.status === 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenReviewModal(detailHazard);
                        }}
                        disabled={loading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <CheckCircle2 size={15} />
                        <span>Duyệt lại &amp; Chuẩn hóa</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDetailHazard(null)}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '8px',
                        background: 'var(--dm-surface)',
                        color: 'var(--dm-text-secondary)',
                        border: '1px solid var(--dm-border-strong)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Đóng
                    </button>
                  </div>
                </>
              );
            })()
          }
        >
          {detailHazard && (
            isEditingHazard && reviewingHazard ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    background: 'var(--dm-surface-subtle)',
                    border: '1px solid var(--dm-border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Thông tin người dân gửi ban đầu:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                    <div>
                      <span style={{ color: 'var(--dm-text-muted)' }}>Người gửi: </span>
                      <strong style={{ color: 'var(--dm-text-strong)' }}>
                        {typeof reviewingHazard.reportedBy === 'object'
                          ? reviewingHazard.reportedBy?.fullName || 'Người dân'
                          : 'Người dân'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--dm-text-muted)' }}>Thời gian: </span>
                      <strong style={{ color: 'var(--dm-text-strong)' }}>{formatHazardTime(reviewingHazard.createdAt)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--dm-text-muted)' }}>Tiêu đề gốc: </span>
                      <strong style={{ color: 'var(--dm-text-strong)' }}>"{reviewingHazard.title}"</strong>
                    </div>
                  </div>
                </div>

                {editErrors.general && (
                  <div
                    style={{
                      background: 'var(--dm-red-bg)',
                      border: '1px solid var(--dm-red-border)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--dm-red-text)',
                      fontSize: '12.5px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={16} style={{ color: 'var(--dm-red-text)', flexShrink: 0 }} />
                    <span>{editErrors.general}</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                    gap: '18px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Tiêu đề điểm nguy hiểm chuẩn hóa <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => {
                          setEditTitle(e.target.value);
                          if (editErrors.title) {
                            setEditErrors((prev) => ({ ...prev, title: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Ví dụ: Ngập lụt sâu 0.8m ngã tư Nguyễn Văn Linh"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: editErrors.title ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: editErrors.title ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editErrors.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.title}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '6px' }}>
                        Loại nguy hiểm thiên tai <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <select
                        value={editHazardType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setEditHazardType(nextType);
                          if (nextType !== 'OTHER' && editErrors.customHazardType) {
                            setEditErrors((prev) => ({ ...prev, customHazardType: undefined }));
                          }
                        }}
                        style={HAZARD_SELECT_STYLE}
                      >
                        {HAZARD_TYPE_OPTIONS.map((item) => (
                          <option key={`edit-hazard-type-${item.key}`} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      {editHazardType === 'OTHER' && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="text"
                            value={editCustomHazardType}
                            onChange={(e) => {
                              setEditCustomHazardType(e.target.value);
                              if (editErrors.customHazardType) {
                                setEditErrors((prev) => ({ ...prev, customHazardType: undefined, general: undefined }));
                              }
                            }}
                            placeholder="Nhập tên cụ thể loại hiểm họa khác..."
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: editErrors.customHazardType ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                              background: editErrors.customHazardType ? '#fff5f5' : 'var(--dm-surface)',
                              fontSize: '13px',
                              color: 'var(--dm-text-strong)',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                          {editErrors.customHazardType && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                              <span>{editErrors.customHazardType}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {renderSeveritySelector(editSeverity, setEditSeverity)}

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Địa chỉ hiện trường chuẩn xác <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => {
                          setEditAddress(e.target.value);
                          if (editErrors.address) {
                            setEditErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Số nhà, tên đường, phường/xã..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: editErrors.address ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: editErrors.address ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.address}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Mô tả hiện trường &amp; Khuyến cáo an toàn <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={editDescription}
                        onChange={(e) => {
                          setEditDescription(e.target.value);
                          if (editErrors.description) {
                            setEditErrors((prev) => ({ ...prev, description: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Mô tả mức độ nguy hiểm, hướng dẫn người dân tránh di chuyển qua đoạn này..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: editErrors.description ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: editErrors.description ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                      />
                      {editErrors.description && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.description}</span>
                        </div>
                      )}
                    </div>

                    <MultiImageUploader
                      inputId="edit-hazard-images"
                      label="Ảnh hiện trường"
                      existingUrls={editExistingImages}
                      onRemoveExisting={(url) => setEditExistingImages((prev) => prev.filter((u) => u !== url))}
                      pendingImages={editPendingImages}
                      onAddFiles={(files) =>
                        appendPendingImageFiles(files, setEditPendingImages, notifyInvalidImageFile)
                      }
                      onRemovePending={(id) => removePendingImageItem(id, setEditPendingImages)}
                      onPreviewImage={(_url, images, index) =>
                        setSelectedHazardPhoto({ images, activeIndex: index, title: editTitle || 'Ảnh hiện trường' })
                      }
                      disabled={submittingReview}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <LocationSearchMapPicker
                      lat={editLat}
                      lng={editLng}
                      markerHtml={getHazardMarkerHtml(editHazardType)}
                      selectedAreaName={daNangProvince?.name || 'Thành phố Đà Nẵng'}
                      accentColor="#dc2626"
                      mapHeight={250}
                      error={editErrors.coordinates}
                      onLocationSelected={(newLat, newLng, detectedAddress) => {
                        setEditLat(Number(newLat.toFixed(5)));
                        setEditLng(Number(newLng.toFixed(5)));
                        if (editErrors.coordinates) {
                          setEditErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                        }
                        if (detectedAddress && isPlaceholderHazardAddress(editAddress)) {
                          setEditAddress(detectedAddress);
                          setEditErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                        }
                      }}
                    />

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Ghi chú thẩm định &amp; Phương án xử lý của chính quyền
                      </label>
                      <textarea
                        rows={2}
                        value={editReviewNote}
                        onChange={(e) => setEditReviewNote(e.target.value)}
                        placeholder="Ví dụ: Đã cử lực lượng giăng dây cảnh báo và đặt biển báo cấm qua..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--dm-border-strong)',
                          fontSize: '12.5px',
                          color: 'var(--dm-text-strong)',
                          background: 'var(--dm-surface)',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
                {/* Cột 1: Thông tin mô tả & Người báo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'var(--dm-surface-subtle)', padding: '14px', borderRadius: '8px', border: '1px solid var(--dm-border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Phân loại &amp; Mức độ
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'var(--dm-surface)',
                          color: 'var(--dm-text-strong)',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          border: '1px solid var(--dm-border-strong)',
                        }}
                      >
                        <HazardTypeIcon type={detailHazard.hazardType} size={15} color="#334155" />
                        {getHazardTypeConfig(detailHazard.hazardType, detailHazard.customHazardType).label}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: getSeverityBadge(detailHazard.severity).bg,
                          color: getSeverityBadge(detailHazard.severity).color,
                          fontWeight: 600,
                          fontSize: '12.5px',
                          border: `1px solid ${getSeverityBadge(detailHazard.severity).border}`,
                        }}
                      >
                        {getSeverityBadge(detailHazard.severity).label}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'var(--dm-surface-subtle)',
                          color: 'var(--dm-text-strong)',
                          fontWeight: 600,
                          fontSize: '12px',
                          border: '1px solid var(--dm-border-strong)',
                        }}
                      >
                        <MapPin size={13} color="#2563eb" />
                        {getHazardDistrictName(detailHazard)}
                      </span>

                      {detailHazard.status === 'APPROVED' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--dm-green-bg)', color: 'var(--dm-green-text)', border: '1px solid #dcfce7' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} /> Đã duyệt
                        </span>
                      )}
                      {detailHazard.status === 'PENDING' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--dm-amber-bg)', color: 'var(--dm-amber-text)', border: '1px solid var(--dm-amber-border)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} /> Chờ duyệt
                        </span>
                      )}
                      {detailHazard.status === 'REJECTED' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--dm-red-bg)', color: 'var(--dm-red-text)', border: '1px solid var(--dm-red-border)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} /> Từ chối
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ background: 'var(--dm-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--dm-border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Người đóng góp thông tin
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--dm-text-strong)', fontSize: '13.5px' }}>
                        {typeof detailHazard.reportedBy === 'object' ? (detailHazard.reportedBy?.fullName || 'Người dân') : 'Người dân'}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          background: detailHazard.reporterRole === 'RESCUER' ? 'var(--dm-blue-bg)' : 'var(--dm-surface-muted)',
                          color: detailHazard.reporterRole === 'RESCUER' ? 'var(--dm-blue-text)' : 'var(--dm-text-secondary)',
                          border: '1px solid var(--dm-border)',
                        }}
                      >
                        {detailHazard.reporterRole === 'RESCUER' ? 'Cứu hộ viên' : 'Người dân'}
                      </span>
                    </div>
                    {typeof detailHazard.reportedBy === 'object' && detailHazard.reportedBy?.phone ? (
                      <div style={{ fontSize: '12px', color: 'var(--dm-text-secondary)', marginTop: '4px' }}>
                        Điện thoại liên hệ: <strong>{detailHazard.reportedBy.phone}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ background: 'var(--dm-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--dm-border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Địa chỉ hiện trường
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dm-text-strong)', lineHeight: '1.4' }}>
                      {detailHazard.address}
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-muted)', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>
                      Mô tả chi tiết
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--dm-text-secondary)', lineHeight: '1.5' }}>
                      {detailHazard.description || 'Không có mô tả chi tiết'}
                    </div>

                    {detailHazard.reviewNote && (
                      <div style={{ marginTop: '12px', padding: '8px 10px', background: 'var(--dm-surface-subtle)', border: '1px solid var(--dm-border)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--dm-text-secondary)' }}>
                        <strong>Ghi chú chính quyền:</strong> {detailHazard.reviewNote}
                      </div>
                    )}
                  </div>

                  {detailHazard.images && detailHazard.images.length > 0 && (
                    <div style={{ background: 'var(--dm-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--dm-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dm-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Ảnh hiện trường ({detailHazard.images.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px' }}>
                        {detailHazard.images.map((imgUrl, i) => (
                          <div
                            key={i}
                            onClick={() =>
                              setSelectedHazardPhoto({
                                images: detailHazard.images || [],
                                activeIndex: i,
                                title: detailHazard.title,
                              })
                            }
                            style={{
                              height: '80px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid var(--dm-border-strong)',
                            }}
                            title="Bấm để xem ảnh phóng to"
                          >
                            <img src={imgUrl} alt="Hiện trường" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cột 2: Bản đồ nhỏ hiển thị vị trí */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'var(--dm-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--dm-border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dm-text-strong)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={16} color="#dc2626" />
                        <span>Vị trí trên Bản đồ</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)', fontWeight: 600 }}>
                        GPS: [{detailHazard.location.coordinates[1].toFixed(5)}, {detailHazard.location.coordinates[0].toFixed(5)}]
                      </span>
                    </div>

                    {/* Khung Bản đồ nhỏ */}
                    <div style={{ flex: 1, minHeight: '300px' }}>
                      <HazardMiniMap
                        lat={detailHazard.location.coordinates[1]}
                        lng={detailHazard.location.coordinates[0]}
                        title={detailHazard.title}
                        hazardType={detailHazard.hazardType}
                      />
                    </div>

                    {/* Nút tác vụ mở bản đồ tác chiến nội bộ */}
                    <div style={{ marginTop: '14px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailHazard(null);
                          onOpenMap();
                        }}
                        style={{
                          width: '100%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: '13px',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Compass size={15} />
                        <span>Xem trên Bản đồ Tác chiến</span>
                      </button>
                    </div>
                  </div>
                </div>
            </div>
            )
          )}
        </DetailSheet>
          );
        })()}

        {/* MODAL TẠO ĐIỂM NGUY HIỂM MỚI (DÀNH CHO ADMIN & CÁN BỘ ĐỊA PHƯƠNG) */}
        {isCreateHazardOpen && (
          <div
            data-modal-layer="confirm"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '16px',
            }}
            onClick={closeCreateHazardModal}
          >
            <div
              style={{
                backgroundColor: 'var(--dm-surface)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--dm-border-strong)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--dm-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--dm-surface-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--dm-blue-bg)',
                      color: 'var(--dm-blue-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--dm-text-strong)' }}>
                      Khởi Tạo Điểm Nguy Hiểm Mới
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--dm-text-muted)' }}>
                      {isAdmin
                        ? 'Quản trị viên thiết lập điểm cảnh báo nguy hiểm và chọn khu vực hành chính trên toàn hệ thống.'
                        : `Cán bộ địa phương ${localTabLabel} thiết lập điểm cảnh báo và công bố trực tiếp lên hệ thống.`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeCreateHazardModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--dm-text-muted)',
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
                {/* Thông báo lỗi tổng quát nếu có trường chưa điền */}
                {createErrors.general && (
                  <div
                    style={{
                      background: 'var(--dm-red-bg)',
                      border: '1px solid var(--dm-red-border)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--dm-red-text)',
                      fontSize: '12.5px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={16} style={{ color: 'var(--dm-red-text)', flexShrink: 0 }} />
                    <span>{createErrors.general}</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* CỘT TRÁI */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Tiêu đề điểm nguy hiểm */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Tiêu đề điểm nguy hiểm <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={createTitle}
                        onChange={(e) => {
                          setCreateTitle(e.target.value);
                          if (createErrors.title) {
                            setCreateErrors((prev) => ({ ...prev, title: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Ví dụ: Đoạn ngập sâu 0.8m ngã tư Nguyễn Văn Linh - Trưng Nữ Vương"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: createErrors.title ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: createErrors.title ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createErrors.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.title}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Loại nguy hiểm thiên tai */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '6px' }}>
                        Loại hiểm họa thiên tai <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <select
                        value={createHazardType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setCreateHazardType(nextType);
                          if (nextType !== 'OTHER' && createErrors.customHazardType) {
                            setCreateErrors((prev) => ({ ...prev, customHazardType: undefined }));
                          }
                        }}
                        style={HAZARD_SELECT_STYLE}
                      >
                        {HAZARD_TYPE_OPTIONS.map((item) => (
                          <option key={`create-hazard-type-${item.key}`} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      {createHazardType === 'OTHER' && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="text"
                            value={createCustomHazardType}
                            onChange={(e) => {
                              setCreateCustomHazardType(e.target.value);
                              if (createErrors.customHazardType) {
                                setCreateErrors((prev) => ({ ...prev, customHazardType: undefined, general: undefined }));
                              }
                            }}
                            placeholder="Nhập tên cụ thể loại hiểm họa khác..."
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: createErrors.customHazardType ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                              background: createErrors.customHazardType ? '#fff5f5' : 'var(--dm-surface)',
                              fontSize: '13px',
                              color: 'var(--dm-text-strong)',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                          {createErrors.customHazardType && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                              <span>{createErrors.customHazardType}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. Mức độ nguy cấp */}
                    {renderSeveritySelector(createSeverity, setCreateSeverity)}

                    {/* 4. Khu vực quản lý hành chính */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Khu vực quản lý
                      </label>
                      {isAdmin ? (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '3px' }}>
                            Phường / Xã ({daNangProvince?.name || 'Thành phố Đà Nẵng'})
                          </div>
                          <DaNangAreaSelect
                            wards={daNangWards}
                            allValue={daNangProvinceId}
                            valueKey="_id"
                            ariaLabel="Chọn địa bàn quản lý điểm nguy hiểm"
                            highlightActive={false}
                            value={createHazardAreaId || daNangProvinceId}
                            onChange={(val) => {
                              setCreateHazardAreaId(val);
                              const found = areas.find((a) => String(a._id) === val);
                              if (found && (!createAddress || areas.some((a) => a.name === createAddress))) {
                                setCreateAddress(found.name);
                              }
                            }}
                            triggerStyle={HAZARD_SELECT_STYLE}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--dm-border-strong)',
                            background: 'var(--dm-surface-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxSizing: 'border-box',
                            minHeight: '36px',
                          }}
                        >
                          <MapPin size={15} color="#0284c7" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)' }}>
                            {accountAreaDisplayName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 5. Địa chỉ hiện trường */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Địa chỉ hiện trường cụ thể <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={createAddress}
                        onChange={(e) => {
                          setCreateAddress(e.target.value);
                          if (createErrors.address) {
                            setCreateErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Số nhà, tên đường, khu vực..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: createErrors.address ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: createErrors.address ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.address}</span>
                        </div>
                      )}
                    </div>

                    {/* 5. Mô tả chi tiết & Cảnh báo an toàn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Mô tả hiện trường &amp; Khuyến cáo an toàn <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={createDescription}
                        onChange={(e) => {
                          setCreateDescription(e.target.value);
                          if (createErrors.description) {
                            setCreateErrors((prev) => ({ ...prev, description: undefined, general: undefined }));
                          }
                        }}
                        placeholder="Mô tả hiện trạng hiểm họa, lưu ý hướng di chuyển, cảnh báo người dân không lưu thông..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: createErrors.description ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                          background: createErrors.description ? '#fff5f5' : 'var(--dm-surface)',
                          fontSize: '13px',
                          color: 'var(--dm-text-strong)',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                      />
                      {createErrors.description && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.description}</span>
                        </div>
                      )}
                    </div>

                    <MultiImageUploader
                      inputId="create-hazard-images"
                      label="Ảnh hiện trường"
                      pendingImages={createPendingImages}
                      onAddFiles={(files) =>
                        appendPendingImageFiles(files, setCreatePendingImages, notifyInvalidImageFile)
                      }
                      onRemovePending={(id) => removePendingImageItem(id, setCreatePendingImages)}
                      onPreviewImage={(_url, images, index) =>
                        setSelectedHazardPhoto({ images, activeIndex: index, title: createTitle || 'Ảnh hiện trường' })
                      }
                      disabled={submittingCreate}
                    />
                  </div>

                  {/* CỘT PHẢI: TÌM KIẾM ĐỊA ĐIỂM, TỌA ĐỘ & BẢN ĐỒ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <LocationSearchMapPicker
                      lat={createLat}
                      lng={createLng}
                      markerHtml={getHazardMarkerHtml(createHazardType)}
                      selectedAreaName={daNangProvince?.name || 'Thành phố Đà Nẵng'}
                      accentColor="#dc2626"
                      mapHeight={250}
                      error={createErrors.coordinates}
                      onLocationSelected={(newLat, newLng, detectedAddress) => {
                        setCreateLat(Number(newLat.toFixed(5)));
                        setCreateLng(Number(newLng.toFixed(5)));
                        if (createErrors.coordinates) {
                          setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                        }
                        if (detectedAddress && isPlaceholderHazardAddress(createAddress)) {
                          setCreateAddress(detectedAddress);
                          setCreateErrors((prev) => ({ ...prev, address: undefined, general: undefined }));
                        }
                      }}
                    />

                    {/* Trạng thái công bố */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '6px' }}>
                        Trạng thái phê duyệt &amp; Công bố
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setCreateStatus('APPROVED')}
                          className="sos-btn-flat"
                          style={{
                            padding: '8px 10px',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: createStatus === 'APPROVED' ? 700 : 500,
                            background: createStatus === 'APPROVED' ? 'var(--dm-green-bg)' : 'var(--dm-surface)',
                            color: createStatus === 'APPROVED' ? 'var(--dm-green-text)' : 'var(--dm-text-secondary)',
                            borderColor: createStatus === 'APPROVED' ? '#22c55e' : 'var(--dm-border-strong)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <CheckCircle2 size={14} color={createStatus === 'APPROVED' ? '#15803d' : '#94a3b8'} />
                          <span>Duyệt &amp; Công bố ngay</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCreateStatus('PENDING')}
                          className="sos-btn-flat"
                          style={{
                            padding: '8px 10px',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: createStatus === 'PENDING' ? 700 : 500,
                            background: createStatus === 'PENDING' ? 'var(--dm-amber-bg)' : 'var(--dm-surface)',
                            color: createStatus === 'PENDING' ? 'var(--dm-amber-text)' : 'var(--dm-text-secondary)',
                            borderColor: createStatus === 'PENDING' ? '#eab308' : 'var(--dm-border-strong)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <Clock size={14} color={createStatus === 'PENDING' ? '#854d0e' : '#94a3b8'} />
                          <span>Lưu nháp / Chờ duyệt</span>
                        </button>
                      </div>
                    </div>

                    {/* Ghi chú chính quyền */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '5px' }}>
                        Ghi chú thẩm định &amp; Phương án xử lý
                      </label>
                      <input
                        type="text"
                        value={createReviewNote}
                        onChange={(e) => setCreateReviewNote(e.target.value)}
                        placeholder="Ví dụ: Đã cử lực lượng giăng dây cảnh báo và đặt biển báo cấm qua..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--dm-border-strong)',
                          fontSize: '12.5px',
                          color: 'var(--dm-text-strong)',
                          background: 'var(--dm-surface)',
                          boxSizing: 'border-box',
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
                  borderTop: '1px solid var(--dm-border)',
                  background: 'var(--dm-surface-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--dm-text-muted)' }}>
                  <span>⚡ Điểm nguy hiểm công bố sẽ được đồng bộ ngay lập tức tới App và Bản đồ tác chiến.</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="sos-btn-flat"
                    disabled={submittingCreate}
                    onClick={closeCreateHazardModal}
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="button"
                    className="sos-btn-flat primary"
                    disabled={submittingCreate}
                    onClick={handleSubmitCreateHazard}
                    style={{
                      padding: '8px 18px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {submittingCreate ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Đang khởi tạo...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        <span>Xác Nhận &amp; Tạo Điểm Nguy Hiểm</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PHÓNG TO ẢNH HIỆN TRƯỜNG */}
        <PhotoLightboxModal
          state={selectedHazardPhoto}
          onClose={() => setSelectedHazardPhoto(null)}
        />

        {/* TOASTS VÀ CONFIRMATION MODAL TOÀN CỤC */}
        {renderGlobalModals()}
      </div>
    );
};

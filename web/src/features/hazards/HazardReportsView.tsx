import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Search,
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
  Compass,
  XCircle,
  Clock
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { HazardReportItem, AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchHazardReports,
  reviewHazardReport,
  createHazardReport,
  deleteHazardReport,
  subscribeHazardEvents,
  fetchAdministrativeAreas,
} from '@/api';
import { resolveGoogleMapsInput } from '@/utils/mapLinkParser';
import { domainDService, JURISDICTION_CONFIGS } from '@/services/domainDService';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import {
  HAZARD_TYPE_OPTIONS,
  HazardTypeIcon,
  HazardMiniMap,
} from './hazardConstants';
import './HazardReportsView.css';

export interface HazardReportsViewProps {
  user?: User;
  onOpenMap: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

export const HazardReportsView: React.FC<HazardReportsViewProps> = ({
  user,
  onOpenMap,
  areas: propAreas = [],
}) => {
  const { showToast, setConfirmModal, setConfirmPromptValue, renderGlobalModals } = useGlobalModals();
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(false);
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
  const [managementScope, setManagementScope] = useState<'LOCAL' | 'CITY'>('LOCAL');
  const [hazardSearchText, setHazardSearchText] = useState('');
  const [hazardPage, setHazardPage] = useState<number>(1);
  const [hazardSortField, setHazardSortField] = useState<'createdAt' | 'severity' | 'title' | 'district' | 'address' | 'status'>('createdAt');
  const [hazardSortOrder, setHazardSortOrder] = useState<'asc' | 'desc'>('desc');
  const [jumpInputPage, setJumpInputPage] = useState<string>('');
  const [selectedHazardPhoto, setSelectedHazardPhoto] = useState<string | null>(null);
  const [detailHazard, setDetailHazard] = useState<HazardReportItem | null>(null);

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
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editMapLinkInput, setEditMapLinkInput] = useState('');
  const [resolvingEditMapLink, setResolvingEditMapLink] = useState(false);
  const [editMapLinkStatus, setEditMapLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createMapLinkInput, setCreateMapLinkInput] = useState('');
  const [resolvingCreateMapLink, setResolvingCreateMapLink] = useState(false);
  const [createMapLinkStatus, setCreateMapLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
  }, [propAreas, refreshIndex]);

  // Cập nhật areas nếu props thay đổi
  useEffect(() => {
    if (propAreas && propAreas.length > 0) {
      setAreas(propAreas);
    }
  }, [propAreas]);

    domainDService.syncFromStoredAuthUser();
    const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_auth_user') : null;
    const authUser = user || (authUserStr ? JSON.parse(authUserStr) : null);
    const activeOfficer = domainDService.getActiveOfficer();

    // 1. XÁC ĐỊNH ĐỊA BÀN PHÂN CÔNG QUẢN LÝ CỐ ĐỊNH TỪ TÀI KHOẢN (KHÔNG CHO PHÉP THAY ĐỔI)
    const determineOfficerJurKey = (): string => {
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

      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_authority_jurisdiction_key') : null;
      if (stored && JURISDICTION_CONFIGS[stored] && stored !== 'toan_thanh_pho') return stored;
      return 'ngu_hanh_son';
    };

    const fixedJurKey = determineOfficerJurKey();
    const fixedJurisdictionConfig = JURISDICTION_CONFIGS[fixedJurKey] || JURISDICTION_CONFIGS.ngu_hanh_son;

    try {
      localStorage.setItem('sos_authority_jurisdiction_key', fixedJurKey);
    } catch {}

    // 2. HÀM KIỂM TRA ĐIỂM NGUY HIỂM CÓ THUỘC ĐỊA BÀN PHÂN CÔNG HAY KHÔNG
    const isHazardInOfficerJurisdiction = (r: HazardReportItem): boolean => {
      const cfg = fixedJurisdictionConfig;

      const addrLower = (r.address || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();
      const titleLower = (r.title || '').toLowerCase();
      const fullText = `${addrLower} ${descLower} ${titleLower}`;

      // 1. So khớp từ khóa đặc trưng của địa bàn phụ trách
      const matchesKeyword = cfg.keywords.some((kw) => fullText.includes(kw));
      if (matchesKeyword) return true;

      // 2. So khớp tọa độ GPS nằm trong bounding box địa lý của quận/huyện
      const coords = r.location?.coordinates;
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
            // Kiểm tra xem địa chỉ có ghi rõ quận huyện khác hay không
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

      // 3. So khớp ID khu vực nếu có
      const rAreaId = (r.areaId as any)?._id || (r.areaId as any)?.id || (r.areaId as any)?.code || r.areaId;
      if (rAreaId && (rAreaId === cfg.areaId || (r.areaId as any)?.name === cfg.name)) {
        return true;
      }

      return false;
    };

    // 3. HÀM XÁC ĐỊNH TÊN ĐỊA PHƯƠNG QUẢN LÝ CHO TỪNG ĐIỂM NGUY HIỂM
    const getHazardDistrictName = (r: HazardReportItem): string => {
      // Nếu thuộc địa bàn cán bộ
      if (isHazardInOfficerJurisdiction(r)) {
        return fixedJurisdictionConfig.name;
      }

      // Nếu có district rõ ràng
      const dName = (r as any).district || (r as any).districtName;
      if (dName && typeof dName === 'string' && dName.trim()) {
        return dName;
      }

      // Nếu có areaId
      const rAreaName = (r.areaId as any)?.name || (r.areaId as any)?.districtName;
      if (rAreaName && typeof rAreaName === 'string') {
        return rAreaName;
      }

      // So khớp từ khóa các quận/huyện
      const fullText = `${r.address || ''} ${r.title || ''} ${r.description || ''}`.toLowerCase();
      for (const [key, cfg] of Object.entries(JURISDICTION_CONFIGS)) {
        if (key === 'toan_thanh_pho') continue;
        if (cfg.keywords && cfg.keywords.some((kw) => fullText.includes(kw))) {
          return cfg.name;
        }
      }

      // So khớp tọa độ GPS bounds
      const coords = r.location?.coordinates;
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

      // Quét các tên quận thông dụng trong địa chỉ
      if (fullText.includes('hải châu') || fullText.includes('hai chau')) return 'Quận Hải Châu';
      if (fullText.includes('sơn trà') || fullText.includes('son tra')) return 'Quận Sơn Trà';
      if (fullText.includes('thanh khê') || fullText.includes('thanh khe')) return 'Quận Thanh Khê';
      if (fullText.includes('cẩm lệ') || fullText.includes('cam le')) return 'Quận Cẩm Lệ';
      if (fullText.includes('liên chiểu') || fullText.includes('lien chieu')) return 'Quận Liên Chiểu';
      if (fullText.includes('hòa vang') || fullText.includes('hoa vang')) return 'Huyện Hòa Vang';
      if (fullText.includes('hoàng sa') || fullText.includes('hoang sa')) return 'Huyện Hoàng Sa';

      return 'Quận Hải Châu';
    };

    // 4. TẬP DỮ LIỆU ĐỊA PHƯƠNG & THÀNH PHỐ QUẢN LÝ
    const localReports = hazardReports.filter((r) => isHazardInOfficerJurisdiction(r));

    // Lọc theo Cấp quản lý: Địa phương vs Điểm nguy hiểm Thành phố (Tổng cả thành phố)
    const baseScopedReports = managementScope === 'LOCAL' ? localReports : hazardReports;

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
      let cmp = 0;
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
        return <ArrowUpDown size={12} style={{ color: '#94a3b8', marginLeft: '6px', opacity: 0.6 }} />;
      }
      return hazardSortOrder === 'asc' ? (
        <ArrowUp size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
      ) : (
        <ArrowDown size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
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
          return { label: 'Cực kỳ nguy cấp', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
        case 'HIGH':
          return { label: 'Mức độ cao', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
        case 'MEDIUM':
          return { label: 'Trung bình', bg: '#fefce8', color: '#854d0e', border: '#fef08a' };
        default:
          return { label: 'Mức thấp', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
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

    // Mở Form thẩm định & chuẩn hóa thông tin điểm nguy hiểm (Tự động ẩn form chi tiết)
    const handleOpenReviewModal = (hazard: HazardReportItem) => {
      setDetailHazard(null);
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
      setEditMapLinkInput('');
      setEditMapLinkStatus(null);
      setEditErrors({});
    };

    // Mở Form Tạo Điểm Nguy Hiểm Mới (Dành cho cán bộ quản lý / Admin)
    const handleOpenCreateHazardModal = () => {
      let defaultLat = 16.0570;
      let defaultLng = 108.2170;
      if (fixedJurisdictionConfig.bounds) {
        defaultLat = Number(((fixedJurisdictionConfig.bounds.minLat + fixedJurisdictionConfig.bounds.maxLat) / 2).toFixed(5));
        defaultLng = Number(((fixedJurisdictionConfig.bounds.minLng + fixedJurisdictionConfig.bounds.maxLng) / 2).toFixed(5));
      }
      setCreateTitle('');
      setCreateHazardType('FLOOD');
      setCreateCustomHazardType('');
      setCreateSeverity('HIGH');
      setCreateAddress(`${fixedJurisdictionConfig.name}, TP Đà Nẵng`);
      setCreateLat(defaultLat);
      setCreateLng(defaultLng);
      setCreateDescription('');
      setCreateStatus('APPROVED');
      setCreateReviewNote(`Điểm nguy hiểm được thiết lập bởi Cán bộ ${fixedJurisdictionConfig.name}`);
      setCreateMapLinkInput('');
      setCreateMapLinkStatus(null);
      setCreateErrors({});
      setIsCreateHazardOpen(true);
    };

    // Chuyển đổi liên kết Google Maps sang tọa độ khi chỉnh sửa
    const handleConvertEditMapLink = async (customText?: string) => {
      const textToResolve = (typeof customText === 'string' ? customText : editMapLinkInput).trim();
      if (!textToResolve) return;

      setResolvingEditMapLink(true);
      setEditMapLinkStatus(null);

      try {
        const res = await resolveGoogleMapsInput(textToResolve);
        setEditLat(res.lat);
        setEditLng(res.lng);
        setEditErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
        if (res.placeName && (!editAddress || editAddress.trim().length <= 3)) {
          setEditAddress(res.placeName);
          setEditErrors((prev) => ({ ...prev, address: undefined }));
        }
        setEditMapLinkStatus({
          type: 'success',
          message: `Đã ghim tọa độ: [${res.lat}, ${res.lng}]${res.placeName ? ` - ${res.placeName}` : ''}`,
        });
      } catch (err: any) {
        setEditMapLinkStatus({
          type: 'error',
          message: err.message || 'Không thể nhận diện tọa độ từ liên kết này.',
        });
      } finally {
        setResolvingEditMapLink(false);
      }
    };

    // Chuyển đổi liên kết Google Maps sang tọa độ khi tạo mới
    const handleConvertCreateMapLink = async (customText?: string) => {
      const textToResolve = (typeof customText === 'string' ? customText : createMapLinkInput).trim();
      if (!textToResolve) return;

      setResolvingCreateMapLink(true);
      setCreateMapLinkStatus(null);

      try {
        const res = await resolveGoogleMapsInput(textToResolve);
        setCreateLat(res.lat);
        setCreateLng(res.lng);
        setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
        if (res.placeName && (!createAddress || createAddress.includes('TP Đà Nẵng'))) {
          setCreateAddress(res.placeName);
          setCreateErrors((prev) => ({ ...prev, address: undefined }));
        }
        setCreateMapLinkStatus({
          type: 'success',
          message: `Đã ghim tọa độ: [${res.lat}, ${res.lng}]${res.placeName ? ` - ${res.placeName}` : ''}`,
        });
      } catch (err: any) {
        setCreateMapLinkStatus({
          type: 'error',
          message: err.message || 'Không thể nhận diện tọa độ từ liên kết này.',
        });
      } finally {
        setResolvingCreateMapLink(false);
      }
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
          areaId: fixedJurisdictionConfig.areaId,
          status: createStatus,
          reviewNote: createReviewNote.trim() || `Cán bộ ${fixedJurisdictionConfig.name} tạo trực tiếp`,
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
        const extraData: any = {
          title: editTitle.trim(),
          hazardType: editHazardType,
          customHazardType: editHazardType === 'OTHER' ? editCustomHazardType.trim() : undefined,
          severity: editSeverity,
          address: editAddress.trim(),
          description: editDescription.trim(),
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} color="#0284c7" />
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '0.2px',
                  textTransform: 'uppercase',
                }}
              >
                Duyệt & Quản Lý Điểm Nguy Hiểm
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', fontSize: '13.5px' }}>
              <MapPin size={15} color="#64748b" />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Địa bàn phụ trách:</span>
              <strong style={{ color: '#0f172a', fontWeight: 700 }}>{fixedJurisdictionConfig.name}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="sos-btn-flat primary"
              onClick={handleOpenCreateHazardModal}
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
              <span>Tạo Điểm Nguy Hiểm</span>
            </button>

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

        {/* 2. CHỌN PHẠM VI XEM: TÊN ĐỊA PHƯƠNG & TÊN THÀNH PHỐ (CỐ ĐỊNH) */}
        <div className="sos-scope-tabs" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className={`sos-scope-tab ${managementScope === 'LOCAL' ? 'active' : ''}`}
            onClick={() => {
              setManagementScope('LOCAL');
              setHazardPage(1);
            }}
          >
            <span>{fixedJurisdictionConfig.name}</span>
            <span className="sos-scope-badge">{localReports.length}</span>
          </button>

          <button
            type="button"
            className={`sos-scope-tab ${managementScope === 'CITY' ? 'active' : ''}`}
            onClick={() => {
              setManagementScope('CITY');
              setHazardPage(1);
            }}
          >
            <span>Thành phố Đà Nẵng</span>
            <span className="sos-scope-badge">{hazardReports.length}</span>
          </button>
        </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Sắp xếp:</span>
              <select
                className="sos-clean-sort-select"
                value={`${hazardSortField}-${hazardSortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split('-') as [any, any];
                  setHazardSortField(f);
                  setHazardSortOrder(o);
                  setHazardPage(1);
                }}
              >
                <option value="createdAt-desc">Mới nhất trước</option>
                <option value="createdAt-asc">Cũ nhất trước</option>
                <option value="severity-desc">Mức độ: Nguy cấp nhất</option>
                <option value="severity-asc">Mức độ: Thấp đến cao</option>
                <option value="title-asc">Tên điểm (A → Z)</option>
                <option value="title-desc">Tên điểm (Z → A)</option>
                <option value="district-asc">Địa phương (A → Z)</option>
                <option value="status-desc">Trạng thái: Chờ duyệt trước</option>
              </select>
            </div>

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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
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
          {/* KHUNG CUỘN CỦA BẢNG DỮ LIỆU */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
            <table className="sos-clean-table">
              <thead>
                <tr>
                  <th
                    className={`sortable ${hazardSortField === 'title' ? 'sorted' : ''}`}
                    onClick={() => handleSort('title')}
                    style={{ width: '22%' }}
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
                    style={{ width: '24%' }}
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
                    style={{ width: '12%' }}
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
                    style={{ width: '8%', textAlign: 'center' }}
                    title="Nhấn để sắp xếp theo trạng thái"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>Trạng thái</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {totalHazardItems === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: '13px' }}>
                      <AlertTriangle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                      <div>Không có điểm nguy hiểm nào trong danh mục này.</div>
                      <button
                        type="button"
                        onClick={handleOpenCreateHazardModal}
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
                      <tr key={r._id}>
                        {/* 1. Điểm nguy hiểm & Loại hiểm họa */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '8px',
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #cbd5e1',
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
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px', lineHeight: '1.4' }}>
                                {r.title}
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
                                <HazardTypeIcon type={r.hazardType} size={12} color="#64748b" />
                                {typeCfg.label}
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

                        {/* 3. Mức độ nghiêm trọng */}
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 700,
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
                          <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 500, lineHeight: '1.45' }}>
                            {r.address}
                          </div>
                        </td>

                        {/* 5. Thời gian & Người báo */}
                        <td>
                          <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600 }}>
                            {formatHazardTime(r.createdAt)}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                            {reporterName}
                          </div>
                        </td>

                        {/* 6. Trạng thái */}
                        <td style={{ textAlign: 'center' }}>
                          {r.status === 'PENDING' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} /> Chờ duyệt
                            </span>
                          )}
                          {r.status === 'APPROVED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #dcfce7', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} /> Đã duyệt
                            </span>
                          )}
                          {r.status === 'REJECTED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} /> Từ chối
                            </span>
                          )}
                        </td>

                        {/* 7. Thao tác */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="sos-btn-flat"
                              onClick={() => setDetailHazard(r)}
                              title="Xem chi tiết đầy đủ (mô tả, ảnh hiện trường, bản đồ, GPS, người gửi...)"
                            >
                              <Eye size={13} />
                              <span>Chi tiết</span>
                            </button>

                            {isLocal ? (
                              <>
                                {r.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    className="sos-btn-flat success"
                                    disabled={loading}
                                    onClick={() => handleOpenReviewModal(r)}
                                    title="Duyệt & chuẩn hóa thông tin"
                                  >
                                    <Edit size={13} />
                                    <span>Duyệt</span>
                                  </button>
                                )}

                                {r.status === 'APPROVED' && (
                                  <button
                                    type="button"
                                    className="sos-btn-flat"
                                    onClick={() => handleOpenReviewModal(r)}
                                    title="Chỉnh sửa thông tin điểm nguy hiểm"
                                  >
                                    <Edit size={13} />
                                    <span>Sửa</span>
                                  </button>
                                )}

                                {r.status === 'REJECTED' && (
                                  <button
                                    type="button"
                                    className="sos-btn-flat success"
                                    disabled={loading}
                                    onClick={() => handleOpenReviewModal(r)}
                                    title="Duyệt lại điểm nguy hiểm"
                                  >
                                    <CheckCircle2 size={13} />
                                    <span>Duyệt lại</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="sos-btn-flat danger"
                                  disabled={loading}
                                  onClick={() => handleDeleteHazard(r._id, r.title)}
                                  title="Xóa điểm nguy hiểm này"
                                >
                                  <Trash2 size={13} />
                                  <span>Xóa</span>
                                </button>
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
              {totalHazardItems === 0 ? (
                'Không có dữ liệu'
              ) : (
                <>
                  Hiển thị <strong style={{ color: '#0f172a' }}>{hazardStartIndex + 1}</strong> – <strong style={{ color: '#0f172a' }}>{Math.min(hazardStartIndex + HAZARD_PAGE_SIZE, totalHazardItems)}</strong> trên tổng số <strong style={{ color: '#0284c7' }}>{totalHazardItems}</strong> điểm nguy hiểm
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
                        <span key={`dots-${idx}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: '13px' }}>
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
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Đến trang:</span>
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

        {/* MODAL CHI TIẾT ĐIỂM NGUY HIỂM (MINIMAL 2 COLUMNS) */}
        {detailHazard && (
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
            onClick={() => setDetailHazard(null)}
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
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <HazardTypeIcon type={detailHazard.hazardType} size={18} color="#334155" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                      {detailHazard.title}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                      Mã: {detailHazard._id} • Báo lúc: {formatHazardTime(detailHazard.createdAt)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailHazard(null)}
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
                {/* Cột 1: Thông tin mô tả & Người báo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
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
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          border: '1px solid #cbd5e1',
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
                          background: '#f8fafc',
                          color: '#0f172a',
                          fontWeight: 600,
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <MapPin size={13} color="#2563eb" />
                        {getHazardDistrictName(detailHazard)}
                      </span>

                      {detailHazard.status === 'APPROVED' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #dcfce7' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} /> Đã duyệt
                        </span>
                      )}
                      {detailHazard.status === 'PENDING' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} /> Chờ duyệt
                        </span>
                      )}
                      {detailHazard.status === 'REJECTED' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} /> Từ chối
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Người đóng góp thông tin
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13.5px' }}>
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
                          background: detailHazard.reporterRole === 'RESCUER' ? '#e0f2fe' : '#f1f5f9',
                          color: detailHazard.reporterRole === 'RESCUER' ? '#0369a1' : '#475569',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {detailHazard.reporterRole === 'RESCUER' ? 'Cứu hộ viên' : 'Người dân'}
                      </span>
                    </div>
                    {typeof detailHazard.reportedBy === 'object' && detailHazard.reportedBy?.phone ? (
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                        Điện thoại liên hệ: <strong>{detailHazard.reportedBy.phone}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Địa chỉ hiện trường
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a', lineHeight: '1.4' }}>
                      {detailHazard.address}
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>
                      Mô tả chi tiết
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                      {detailHazard.description || 'Không có mô tả chi tiết'}
                    </div>

                    {detailHazard.reviewNote && (
                      <div style={{ marginTop: '12px', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12.5px', color: '#475569' }}>
                        <strong>Ghi chú chính quyền:</strong> {detailHazard.reviewNote}
                      </div>
                    )}
                  </div>

                  {detailHazard.images && detailHazard.images.length > 0 && (
                    <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Ảnh hiện trường ({detailHazard.images.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px' }}>
                        {detailHazard.images.map((imgUrl, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedHazardPhoto(imgUrl)}
                            style={{
                              height: '80px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid #cbd5e1',
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
                  <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={16} color="#dc2626" />
                        <span>Vị trí trên Bản đồ</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
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

              {/* Footer Modal với nút Xóa, Duyệt, Từ chối */}
              {(() => {
                const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
                const isDetailInJurisdiction = isAdmin || isHazardInOfficerJurisdiction(detailHazard);
                return (
                  <div
                    style={{
                      padding: '16px 24px',
                      borderTop: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
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
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5',
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
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          fontSize: '12.5px',
                          fontWeight: 600,
                        }}
                      >
                        <i className="bi bi-shield-lock-fill" style={{ fontSize: '15px', color: '#b45309' }}></i>
                        <span>
                          Điểm nguy hiểm này ngoài khu vực quản lý ({activeOfficer?.jurisdictionAreaName || 'Địa bàn phụ trách'}) — Bạn chỉ có quyền xem thông tin.
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      {isDetailInJurisdiction && detailHazard.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const reason = prompt('Nhập lý do từ chối (tùy chọn):', 'Thông tin chưa đủ căn cứ');
                              if (reason !== null) {
                                handleQuickReview(detailHazard._id, 'REJECTED', reason);
                                setDetailHazard(null);
                              }
                            }}
                            disabled={loading}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              background: '#ffedd5',
                              color: '#c2410c',
                              border: '1px solid #fed7aa',
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
                            background: '#f0f9ff',
                            color: '#0284c7',
                            border: '1px solid #bae6fd',
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
                          background: '#ffffff',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL THẨM ĐỊNH & CHUẨN HÓA ĐIỂM NGUY HIỂM (GRID ICON THEO ĐÚNG ẢNH 2) */}
        {reviewingHazard && (
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
            onClick={() => setReviewingHazard(null)}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '920px',
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
                    {reviewingHazard.status === 'APPROVED'
                      ? 'Chỉnh Sửa & Chuẩn Hóa Điểm Nguy Hiểm'
                      : 'Thẩm Định & Chuẩn Hóa Thông Tin Điểm Nguy Hiểm'}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Kiểm tra và chuẩn hóa các trường thông tin chuẩn xác trước khi công bố lên bản đồ tác chiến.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setReviewingHazard(null)}
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

              {/* Body Form */}
              <div
                style={{
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* Đối chiếu thông tin người dân gửi ban đầu */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Thông tin người dân gửi ban đầu:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Người gửi: </span>
                      <strong style={{ color: '#0f172a' }}>
                        {typeof reviewingHazard.reportedBy === 'object'
                          ? (reviewingHazard.reportedBy?.fullName || 'Người dân')
                          : 'Người dân'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Thời gian: </span>
                      <strong style={{ color: '#0f172a' }}>{formatHazardTime(reviewingHazard.createdAt)}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Tiêu đề gốc: </span>
                      <strong style={{ color: '#0f172a' }}>"{reviewingHazard.title}"</strong>
                    </div>
                  </div>
                </div>

                {/* Thông báo lỗi tổng quát nếu có trường chưa điền */}
                {editErrors.general && (
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
                    <span>{editErrors.general}</span>
                  </div>
                )}

                {/* Form 2 Cột */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* CỘT TRÁI: TIÊU ĐỀ, BẢNG CHỌN LOẠI NGUY HIỂM (ẢNH 2), MỨC ĐỘ, ĐỊA CHỈ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Tiêu đề chuẩn hóa */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Tiêu đề điểm nguy hiểm chuẩn hóa <span style={{ color: '#dc2626' }}>*</span>
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
                          border: editErrors.title ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: editErrors.title ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editErrors.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.title}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. LOẠI NGUY HIỂM THIÊN TAI (ĐÚNG THEO THIẾT KẾ ẢNH 2) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                        Loại nguy hiểm thiên tai <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div className="sos-hazard-type-grid">
                        {HAZARD_TYPE_OPTIONS.map((item) => {
                          const isSelected = editHazardType === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setEditHazardType(item.key);
                                if (item.key !== 'OTHER' && editErrors.customHazardType) {
                                  setEditErrors((prev) => ({ ...prev, customHazardType: undefined }));
                                }
                              }}
                              className={`sos-hazard-type-card ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="sos-hazard-type-card-icon">
                                <HazardTypeIcon
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
                              border: editErrors.customHazardType ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: editErrors.customHazardType ? '#fff5f5' : '#ffffff',
                              fontSize: '13px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                          {editErrors.customHazardType && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                              <span>{editErrors.customHazardType}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. Mức độ nguy cấp */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Mức độ nguy cấp <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {[
                          { key: 'LOW', label: 'Thấp' },
                          { key: 'MEDIUM', label: 'Trung bình' },
                          { key: 'HIGH', label: 'Cao' },
                          { key: 'CRITICAL', label: 'Cực kỳ nguy cấp' },
                        ].map((s) => {
                          const isSel = editSeverity === s.key;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => setEditSeverity(s.key as any)}
                              className="sos-btn-flat"
                              style={{
                                justifyContent: 'center',
                                padding: '7px 4px',
                                fontSize: '11.5px',
                                background: isSel ? '#0f172a' : '#ffffff',
                                color: isSel ? '#ffffff' : '#334155',
                                borderColor: isSel ? '#0f172a' : '#cbd5e1',
                              }}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4. Địa chỉ hiện trường */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Địa chỉ hiện trường chuẩn xác <span style={{ color: '#dc2626' }}>*</span>
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
                          border: editErrors.address ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: editErrors.address ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {editErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.address}</span>
                        </div>
                      )}
                    </div>

                    {/* 5. Mô tả */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Mô tả hiện trường &amp; Khuyến cáo an toàn <span style={{ color: '#dc2626' }}>*</span>
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
                          border: editErrors.description ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: editErrors.description ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                      />
                      {editErrors.description && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.description}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CỘT PHẢI: TỌA ĐỘ GPS, BẢN ĐỒ MINI & GHI CHÚ */}
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
                            value={editMapLinkInput}
                            onChange={(e) => {
                              setEditMapLinkInput(e.target.value);
                              if (editMapLinkStatus) setEditMapLinkStatus(null);
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
                            placeholder="Dán link Google Maps hoặc tọa độ (ví dụ 16.0605, 108.2170)..."
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              paddingRight: editMapLinkInput ? '28px' : '10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                          {editMapLinkInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditMapLinkInput('');
                                setEditMapLinkStatus(null);
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
                          disabled={resolvingEditMapLink || !editMapLinkInput.trim()}
                          className="sos-btn-flat"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: resolvingEditMapLink ? '#f1f5f9' : '#0284c7',
                            color: resolvingEditMapLink ? '#94a3b8' : '#ffffff',
                            borderColor: resolvingEditMapLink ? '#cbd5e1' : '#0284c7',
                            cursor: resolvingEditMapLink || !editMapLinkInput.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {resolvingEditMapLink ? (
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

                      {editMapLinkStatus && (
                        <div
                          style={{
                            fontSize: '11px',
                            padding: '5px 8px',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: editMapLinkStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: editMapLinkStatus.type === 'success' ? '#166534' : '#991b1b',
                            border: `1px solid ${editMapLinkStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                          }}
                        >
                          {editMapLinkStatus.type === 'success' ? (
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                          ) : (
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          )}
                          <span>{editMapLinkStatus.message}</span>
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
                            value={editLat}
                            onChange={(e) => {
                              setEditLat(parseFloat(e.target.value) || 0);
                              if (editErrors.coordinates) {
                                setEditErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (
                                text &&
                                (text.includes('http') ||
                                  text.includes('google') ||
                                  text.includes(',') ||
                                  text.includes('°'))
                              ) {
                                e.preventDefault();
                                setEditMapLinkInput(text);
                                handleConvertEditMapLink(text);
                              }
                            }}
                            title="Vĩ độ (Latitude) - Có thể dán link Google Maps vào đây"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: editErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: editErrors.coordinates ? '#fff5f5' : '#ffffff',
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
                            value={editLng}
                            onChange={(e) => {
                              setEditLng(parseFloat(e.target.value) || 0);
                              if (editErrors.coordinates) {
                                setEditErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (
                                text &&
                                (text.includes('http') ||
                                  text.includes('google') ||
                                  text.includes(',') ||
                                  text.includes('°'))
                              ) {
                                e.preventDefault();
                                setEditMapLinkInput(text);
                                handleConvertEditMapLink(text);
                              }
                            }}
                            title="Kinh độ (Longitude) - Có thể dán link Google Maps vào đây"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: editErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: editErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                      {editErrors.coordinates && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{editErrors.coordinates}</span>
                        </div>
                      )}
                    </div>

                    {/* Bản đồ mini tương tác */}
                    <div style={{ flex: 1, minHeight: '220px' }}>
                      <HazardMiniMap
                        lat={editLat}
                        lng={editLng}
                        title={editTitle || 'Vị trí điểm nguy hiểm'}
                        hazardType={editHazardType}
                        interactive={true}
                        onLocationChange={(newLat, newLng) => {
                          setEditLat(Number(newLat.toFixed(5)));
                          setEditLng(Number(newLng.toFixed(5)));
                          if (editErrors.coordinates) {
                            setEditErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                          }
                        }}
                      />
                    </div>

                    {/* Ghi chú chính quyền */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
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
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="sos-btn-flat danger"
                  disabled={submittingReview}
                  onClick={() => handleInitiateRejectHazard()}
                >
                  <XCircle size={14} />
                  <span>Từ chối điểm báo</span>
                </button>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="sos-btn-flat"
                    disabled={submittingReview}
                    onClick={() => setReviewingHazard(null)}
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="button"
                    className="sos-btn-flat primary"
                    disabled={submittingReview}
                    onClick={() => handleSubmitReview('APPROVED')}
                    style={{ padding: '7px 18px' }}
                  >
                    {submittingReview ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span>Xác nhận chuẩn hóa &amp; Phê duyệt</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL TẠO ĐIỂM NGUY HIỂM MỚI (CHO CÁN BỘ ĐỊA PHƯƠNG & ADMIN) */}
        {isCreateHazardOpen && (
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
            onClick={() => !submittingCreate && setIsCreateHazardOpen(false)}
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
                      Khởi Tạo Điểm Nguy Hiểm Mới
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      Cán bộ địa phương {fixedJurisdictionConfig.name} thiết lập điểm cảnh báo và công bố trực tiếp lên hệ thống.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => !submittingCreate && setIsCreateHazardOpen(false)}
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
                {/* Thông báo lỗi tổng quát nếu có trường chưa điền */}
                {createErrors.general && (
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
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Tiêu đề điểm nguy hiểm <span style={{ color: '#dc2626' }}>*</span>
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
                          border: createErrors.title ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: createErrors.title ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createErrors.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.title}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Loại nguy hiểm thiên tai */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                        Loại hiểm họa thiên tai <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div className="sos-hazard-type-grid">
                        {HAZARD_TYPE_OPTIONS.map((item) => {
                          const isSelected = createHazardType === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setCreateHazardType(item.key);
                                if (item.key !== 'OTHER' && createErrors.customHazardType) {
                                  setCreateErrors((prev) => ({ ...prev, customHazardType: undefined }));
                                }
                              }}
                              className={`sos-hazard-type-card ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="sos-hazard-type-card-icon">
                                <HazardTypeIcon
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
                              border: createErrors.customHazardType ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: createErrors.customHazardType ? '#fff5f5' : '#ffffff',
                              fontSize: '13px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                          {createErrors.customHazardType && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                              <span>{createErrors.customHazardType}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. Mức độ nguy cấp */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Mức độ nguy cấp <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {[
                          { key: 'LOW', label: 'Thấp', color: '#16a34a' },
                          { key: 'MEDIUM', label: 'Trung bình', color: '#ca8a04' },
                          { key: 'HIGH', label: 'Cao', color: '#ea580c' },
                          { key: 'CRITICAL', label: 'Cực kỳ nguy cấp', color: '#dc2626' },
                        ].map((s) => {
                          const isSel = createSeverity === s.key;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => setCreateSeverity(s.key as any)}
                              className="sos-btn-flat"
                              style={{
                                justifyContent: 'center',
                                padding: '7px 4px',
                                fontSize: '11.5px',
                                background: isSel ? s.color : '#ffffff',
                                color: isSel ? '#ffffff' : '#334155',
                                borderColor: isSel ? s.color : '#cbd5e1',
                                fontWeight: isSel ? 700 : 500,
                              }}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4. Địa chỉ hiện trường */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Địa chỉ hiện trường cụ thể <span style={{ color: '#dc2626' }}>*</span>
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
                          border: createErrors.address ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: createErrors.address ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      {createErrors.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.address}</span>
                        </div>
                      )}
                    </div>

                    {/* 5. Mô tả chi tiết & Cảnh báo an toàn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                        Mô tả hiện trường &amp; Khuyến cáo an toàn <span style={{ color: '#dc2626' }}>*</span>
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
                          border: createErrors.description ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: createErrors.description ? '#fff5f5' : '#ffffff',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                      />
                      {createErrors.description && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.description}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CỘT PHẢI */}
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
                            value={createMapLinkInput}
                            onChange={(e) => {
                              setCreateMapLinkInput(e.target.value);
                              if (createMapLinkStatus) setCreateMapLinkStatus(null);
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
                              paddingRight: createMapLinkInput ? '28px' : '10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '12px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                          {createMapLinkInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setCreateMapLinkInput('');
                                setCreateMapLinkStatus(null);
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
                          disabled={resolvingCreateMapLink || !createMapLinkInput.trim()}
                          className="sos-btn-flat"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: resolvingCreateMapLink ? '#f1f5f9' : '#0284c7',
                            color: resolvingCreateMapLink ? '#94a3b8' : '#ffffff',
                            borderColor: resolvingCreateMapLink ? '#cbd5e1' : '#0284c7',
                            cursor: resolvingCreateMapLink || !createMapLinkInput.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {resolvingCreateMapLink ? (
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

                      {createMapLinkStatus && (
                        <div
                          style={{
                            fontSize: '11px',
                            padding: '5px 8px',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: createMapLinkStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: createMapLinkStatus.type === 'success' ? '#166534' : '#991b1b',
                            border: `1px solid ${createMapLinkStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                          }}
                        >
                          {createMapLinkStatus.type === 'success' ? (
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                          ) : (
                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          )}
                          <span>{createMapLinkStatus.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Tọa độ GPS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                          Tọa độ GPS [Vĩ độ, Kinh độ] <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (fixedJurisdictionConfig.bounds) {
                              const b = fixedJurisdictionConfig.bounds;
                              setCreateLat(Number(((b.minLat + b.maxLat) / 2).toFixed(5)));
                              setCreateLng(Number(((b.minLng + b.maxLng) / 2).toFixed(5)));
                              if (createErrors.coordinates) {
                                setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          📍 Tọa độ trung tâm địa bàn
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <input
                            type="number"
                            step="0.00001"
                            value={createLat}
                            onChange={(e) => {
                              setCreateLat(parseFloat(e.target.value) || 0);
                              if (createErrors.coordinates) {
                                setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (
                                text &&
                                (text.includes('http') ||
                                  text.includes('google') ||
                                  text.includes(',') ||
                                  text.includes('°'))
                              ) {
                                e.preventDefault();
                                setCreateMapLinkInput(text);
                                handleConvertCreateMapLink(text);
                              }
                            }}
                            title="Vĩ độ (Latitude) - Có thể dán link Google Maps vào đây"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: createErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: createErrors.coordinates ? '#fff5f5' : '#ffffff',
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
                            value={createLng}
                            onChange={(e) => {
                              setCreateLng(parseFloat(e.target.value) || 0);
                              if (createErrors.coordinates) {
                                setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                              }
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (
                                text &&
                                (text.includes('http') ||
                                  text.includes('google') ||
                                  text.includes(',') ||
                                  text.includes('°'))
                              ) {
                                e.preventDefault();
                                setCreateMapLinkInput(text);
                                handleConvertCreateMapLink(text);
                              }
                            }}
                            title="Kinh độ (Longitude) - Có thể dán link Google Maps vào đây"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: createErrors.coordinates ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                              background: createErrors.coordinates ? '#fff5f5' : '#ffffff',
                              fontSize: '12.5px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                      {createErrors.coordinates && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 500 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          <span>{createErrors.coordinates}</span>
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        💡 Click hoặc kéo ghim trên bản đồ để chọn tọa độ chính xác
                      </div>
                    </div>

                    {/* Bản đồ mini tương tác */}
                    <div style={{ flex: 1, minHeight: '220px' }}>
                      <HazardMiniMap
                        lat={createLat}
                        lng={createLng}
                        title={createTitle || 'Điểm nguy hiểm mới'}
                        hazardType={createHazardType}
                        interactive={true}
                        onLocationChange={(newLat, newLng) => {
                          setCreateLat(Number(newLat.toFixed(5)));
                          setCreateLng(Number(newLng.toFixed(5)));
                          if (createErrors.coordinates) {
                            setCreateErrors((prev) => ({ ...prev, coordinates: undefined, general: undefined }));
                          }
                        }}
                      />
                    </div>

                    {/* Trạng thái công bố */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
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
                            background: createStatus === 'APPROVED' ? '#dcfce7' : '#ffffff',
                            color: createStatus === 'APPROVED' ? '#15803d' : '#475569',
                            borderColor: createStatus === 'APPROVED' ? '#22c55e' : '#cbd5e1',
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
                            background: createStatus === 'PENDING' ? '#fef9c3' : '#ffffff',
                            color: createStatus === 'PENDING' ? '#854d0e' : '#475569',
                            borderColor: createStatus === 'PENDING' ? '#eab308' : '#cbd5e1',
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
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
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
                          border: '1px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          background: '#ffffff',
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
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                  <span>⚡ Điểm nguy hiểm công bố sẽ được đồng bộ ngay lập tức tới App và Bản đồ tác chiến.</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="sos-btn-flat"
                    disabled={submittingCreate}
                    onClick={() => setIsCreateHazardOpen(false)}
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
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      borderColor: '#0284c7',
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
        {selectedHazardPhoto && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: 24,
            }}
            onClick={() => setSelectedHazardPhoto(null)}
          >
            <div
              style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedHazardPhoto}
                alt="Hiện trường phóng to"
                style={{
                  maxWidth: '88vw',
                  maxHeight: '84vh',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
              <button
                type="button"
                onClick={() => setSelectedHazardPhoto(null)}
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: 'none',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                }}
                title="Đóng xem ảnh"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* TOASTS VÀ CONFIRMATION MODAL TOÀN CỤC */}
        {renderGlobalModals()}
      </div>
    );
};

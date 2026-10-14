import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { NavItemKey } from './Sidebar';
import type { User } from '../types/auth';
import type {
  SosRequestItem,
  AdminOverviewStats,
  VehicleItem,
  AlertItem,
  AuditLogItem,
  AdministrativeAreaItem,
  AuthorityOrgItem,
  HazardReportItem,
  SafeLocationItem,
} from '../types/dashboard';
import {
  fetchSosRequests,
  createSosRequest,
  completeSosRequest,
  fetchAdminStatistics,
  fetchAdminUsers,
  updateUserStatus,
  verifyRescuer,
  fetchVehicles,
  fetchAlerts,
  createAlert,
  fetchAdministrativeAreas,
  fetchAuthorityOrganizations,
  fetchAuditLogs,
  fetchHazardReports,
  reviewHazardReport,
  deleteHazardReport,
  subscribeHazardEvents,
  fetchSafeLocations,
  createSafeLocation,
  createAdminUser,
  updateAdminUser,
  fetchAreaManagers,
  type AreaManagerInfo,
} from '../services/api';
import { onSosCreated, onSosUpdated } from '../services/socketService';
import {
  Siren,
  PhoneCall,
  CheckCircle2,
  XCircle,
  MapPin,
  Truck,
  Users,
  Shield,
  LifeBuoy,
  BellRing,
  AlertTriangle,
  BarChart3,
  Building2,
  Globe2,
  History,
  Lock,
  Unlock,
  Clock,
  Radio,
  FileCheck,
  Send,
  RefreshCw,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowUp,
  Search,
  Camera,
  X,
  Compass,
  Phone,
  Eye,
  Trash2,
  ExternalLink,
  Edit,
  Plus,
  Home,
  UserPlus,
  Sliders,
  Layers,
  Wifi,
  Check,
  Boxes,
  Package,
  ArrowLeft,
  UserCheck,
  UserX,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './DashboardViews.css';

import {
  fetchVietnamProvincesService,
  fetchProvinceSubUnitsService,
  VIETNAM_34_PROVINCES_STANDARD,
  type VietnamProvinceItem,
  type ProvinceSubUnitItem,
} from '../services/geoapifyBoundariesService';
import { domainDService, JURISDICTION_CONFIGS } from '../services/domainDService';
import { INITIAL_SOS_REQUESTS } from '../services/mockData';
import {
  FALLBACK_SOS_LIST,
  FALLBACK_RESCUERS,
  FALLBACK_VEHICLES,
  FALLBACK_SUPPLIES,
  FALLBACK_SHELTERS,
  FALLBACK_ALERTS,
  FALLBACK_AUDIT_LOGS,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettingsConfig,
} from '../services/dashboardFallbackData';

// Danh sách các đơn vị hành chính phường/xã/quận thuộc TP Đà Nẵng
export const DANANG_ADMIN_AREAS = [
  { id: 'area-htd', name: 'Phường Hòa Cường', district: 'Quận Hải Châu' },
  { id: 'area-hc', name: 'Phường Hải Châu', district: 'Quận Hải Châu' },
  { id: 'area-cl', name: 'Phường Cẩm Lệ', district: 'Quận Cẩm Lệ' },
  { id: 'area-hx', name: 'Phường Hòa Xuân', district: 'Quận Cẩm Lệ' },
  { id: 'area-st', name: 'Phường Sơn Trà', district: 'Quận Sơn Trà' },
  { id: 'area-ah', name: 'Phường An Hải', district: 'Quận Sơn Trà' },
  { id: 'area-tk', name: 'Phường Thanh Khê', district: 'Quận Thanh Khê' },
  { id: 'area-ak', name: 'Phường An Khê', district: 'Quận Thanh Khê' },
  { id: 'area-nhs', name: 'Phường Ngũ Hành Sơn', district: 'Quận Ngũ Hành Sơn' },
  { id: 'area-lc', name: 'Phường Liên Chiểu', district: 'Quận Liên Chiểu' },
  { id: 'area-hk', name: 'Phường Hòa Khánh', district: 'Quận Liên Chiểu' },
  { id: 'area-hvan', name: 'Phường Hải Vân', district: 'Quận Liên Chiểu' },
  { id: 'area-hv', name: 'Xã Hòa Vang', district: 'Huyện Hòa Vang' },
  { id: 'area-bana', name: 'Xã Bà Nà', district: 'Huyện Hòa Vang' },
  { id: 'area-htien', name: 'Xã Hòa Tiến', district: 'Huyện Hòa Vang' },
  { id: 'area-hs', name: 'Huyện Hoàng Sa', district: 'Huyện Hoàng Sa' },
];

// Hàm sinh mã icon ghim điểm nguy hiểm theo chuẩn Bootstrap Icons
const getHazardMarkerHtml = (type: string) => {
  const configs: Record<string, { bg: string; svg: string }> = {
    FLOOD: {
      bg: '#0284c7',
      // Bootstrap Icons: bi-water
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M.036 12.316a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586zm0-4a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586zm0-4a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586z"/></svg>',
    },
    LANDSLIDE: {
      bg: '#b45309',
      // Bootstrap Icons: bi-cone-striped
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="m9.97 4.88.953 3.811C10.159 8.878 9.14 9 8 9s-2.158-.122-2.923-.309L6.03 4.88C6.635 4.957 7.3 5 8 5s1.365-.043 1.97-.12zm-.241-1.011C9.13 3.93 8.585 4 8 4s-1.13-.07-1.729-.131L7.043 1.01A.5.5 0 0 1 7.53 0h.94a.5.5 0 0 1 .487.61zM5.337 9.992c.767.19 1.706.308 2.663.308s1.896-.118 2.663-.308l.966 3.864c.264.048.533.09.802.126.155.02.269.155.269.311v.207a.5.5 0 0 1-.5.5H3.8a.5.5 0 0 1-.5-.5v-.207c0-.156.114-.29.269-.311.269-.036.538-.078.802-.126z"/></svg>',
    },
    FALLEN_TREE: {
      bg: '#16a34a',
      // Bootstrap Icons: bi-tree-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8.416.223a.5.5 0 0 0-.832 0l-3 4.5A.5.5 0 0 0 5 5.5h.098L3.076 8.735A.5.5 0 0 0 3.5 9.5h.191l-1.638 3.276a.5.5 0 0 0 .447.724H7V16h2v-2.5h4.5a.5.5 0 0 0 .447-.724L12.31 9.5h.191a.5.5 0 0 0 .424-.765L10.902 5.5H11a.5.5 0 0 0 .416-.777z"/></svg>',
    },
    ELECTRICAL: {
      bg: '#ca8a04',
      // Bootstrap Icons: bi-lightning-charge-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>',
    },
    ROAD_DAMAGE: {
      bg: '#ea580c',
      // Bootstrap Icons: bi-sign-stop-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M10.371 1.415a.5.5 0 0 1 .454.292L14.7 9.47a.5.5 0 0 1-.454.71H1.754a.5.5 0 0 1-.454-.71L5.175 1.7a.5.5 0 0 1 .454-.292zM7.002 11a1 1 0 1 0 2 0 1 1 0 0 0-2 0m.93-6.415-1.9 3.8a.5.5 0 0 0 .447.724h3.042a.5.5 0 0 0 .447-.724l-1.9-3.8a.5.5 0 0 0-.894 0"/></svg>',
    },
    OTHER: {
      bg: '#dc2626',
      // Bootstrap Icons: bi-exclamation-triangle-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>',
    },
  };

  const c = configs[type] || configs.OTHER;
  return (
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:' + c.bg + ';width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);">' +
        c.svg +
      '</div>' +
      '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
    '</div>'
  );
};

const EMERGENCY_TYPE_LABELS: Record<string, string> = {
  FLOOD: 'Ngập lụt nước dâng',
  LANDSLIDE: 'Sạt lở đất đá',
  MEDICAL: 'Cấp cứu y tế / Thương tích',
  FIRE: 'Hỏa hoạn / Cháy nổ',
  RESCUE: 'Cứu hộ sông nước / Mắc kẹt',
  STORM: 'Bão lũ thiên tai',
  ACCIDENT: 'Tai nạn sập đổ / Giao thông',
  MISSING_PERSON: 'Tìm kiếm người mất tích',
  POLICE: 'An ninh trật tự',
  OTHER: 'Tình huống khẩn cấp khác',
};

// Component Bản đồ nhỏ (Mini Map) cho điểm nguy hiểm với khả năng tương tác chọn tọa độ
const HazardMiniMap: React.FC<{
  lat: number;
  lng: number;
  title: string;
  hazardType: string;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}> = ({ lat, lng, title, hazardType, interactive, onLocationChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 10.7769;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : 106.7009;

    const map = L.map(containerRef.current, {
      center: [validLat, validLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    const pinHtml = getHazardMarkerHtml(hazardType);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });

    const marker = L.marker([validLat, validLng], {
      icon: customIcon,
      draggable: !!interactive,
    }).addTo(map);

    marker.bindPopup(`<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${title || 'Vị trí điểm nguy hiểm'}<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`).openPopup();

    if (interactive && onLocationChange) {
      marker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        onLocationChange(pos.lat, pos.lng);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onLocationChange(e.latlng.lat, e.latlng.lng);
      });
    }

    markerRef.current = marker;
    mapRef.current = map;

    const t = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, title, hazardType, interactive, onLocationChange]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '260px', borderRadius: '10px', border: '1px solid #cbd5e1' }} />;
};

interface DashboardViewsProps {
  activeKey: NavItemKey;
  onOpenMap: () => void;
  user?: User;
}

export const DashboardViews: React.FC<DashboardViewsProps> = ({
  activeKey,
  onOpenMap,
  user,
}) => {
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Dữ liệu thật từ MongoDB
  const [sosList, setSosList] = useState<SosRequestItem[]>([]);
  const [adminStats, setAdminStats] = useState<AdminOverviewStats | null>(null);
  const [citizens, setCitizens] = useState<any[]>([]);
  const [rescuers, setRescuers] = useState<any[]>([]);
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>([]);
  const [_orgs, setOrgs] = useState<AuthorityOrgItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // State phong cách Executive Overview & Triage (Theo thiết kế chuẩn)
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [timeRange, setTimeRange] = useState<'15m' | '30m' | 'today'>('30m');
  const [triageFilter, setTriageFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'PENDING' | 'ACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [selectedSosDetail, setSelectedSosDetail] = useState<SosRequestItem | null>(null);

  // State phục vụ modal nhận SOS hotline thủ công (UC-L02)
  const [showHotlineModal, setShowHotlineModal] = useState(false);
  const [hotlineForm, setHotlineForm] = useState({
    name: '',
    phone: '',
    people: '1',
    emergencyType: 'FLOOD',
    priority: 'CRITICAL',
    address: '',
    description: '',
    areaId: '',
  });

  // State phục vụ modal phát cảnh báo mới (UC-L12)
  const [alertForm, setAlertForm] = useState({
    title: '',
    content: '',
    type: 'FLOOD',
    severity: 'HIGH',
    areaId: '',
  });

  // State phục vụ Duyệt điểm nguy hiểm (UC-L15)
  const [hazardReports, setHazardReports] = useState<HazardReportItem[]>([]);
  const [hazardCounts, setHazardCounts] = useState<{
    TOTAL: number;
    PENDING: number;
    APPROVED: number;
    REJECTED: number;
    RESOLVED: number;
  }>({ TOTAL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, RESOLVED: 0 });
  const [hazardFilter, setHazardFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [hazardScopeFilter, setHazardScopeFilter] = useState<'MY_JURISDICTION' | 'ALL'>('MY_JURISDICTION');
  const [currentJurisdictionKey, setCurrentJurisdictionKey] = useState<string>(() => domainDService.getJurisdictionKey());
  const [selectedHazardPhoto, setSelectedHazardPhoto] = useState<string | null>(null);
  const [detailHazard, setDetailHazard] = useState<HazardReportItem | null>(null);

  const handleJurisdictionChange = (newKey: string) => {
    setCurrentJurisdictionKey(newKey);
    domainDService.setJurisdictionKey(newKey);
    setRefreshIndex((prev) => prev + 1);
  };

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

  // State phục vụ Quản lý Điểm trú ẩn & Trạm an toàn (UC-L12)
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);
  const [showShelterModal, setShowShelterModal] = useState(false);
  const [shelterForm, setShelterForm] = useState({
    name: '',
    type: 'EVACUATION_CENTER',
    address: '',
    capacity: 100,
    currentOccupancy: 0,
    areaId: '',
    coordinates: '108.2540, 15.9720',
  });

  // State bộ lọc và tìm kiếm cho yêu cầu cứu nạn
  const [_sosStatusFilter, _setSosStatusFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [_sosSearchQuery, _setSosSearchQuery] = useState('');

  // State chuyển tab trong mục Phương tiện & Vật tư
  const [resourceTab, setResourceTab] = useState<'VEHICLES' | 'SUPPLIES'>('VEHICLES');



  // State phân cấp 2 tầng: Tỉnh/Thành phố toàn quốc & Xã/Phường/Quận/Huyện trực thuộc
  const [vietnamProvinces, setVietnamProvinces] = useState<VietnamProvinceItem[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState<VietnamProvinceItem | null>(null);
  const [subUnits, setSubUnits] = useState<ProvinceSubUnitItem[]>([]);
  const [subUnitsLoading, setSubUnitsLoading] = useState(false);
  const [provinceSearchQuery, setProvinceSearchQuery] = useState('');
  const [_provinceManagerFilter, _setProvinceManagerFilter] = useState<'ALL' | 'MANAGED' | 'UNMANAGED'>('ALL');
  const [subUnitTypeFilter, setSubUnitTypeFilter] = useState<'ALL' | 'DISTRICT' | 'WARD'>('ALL');
  const [subUnitManagerFilter, setSubUnitManagerFilter] = useState<'ALL' | 'MANAGED' | 'UNMANAGED'>('ALL');
  const [subUnitSearchQuery, setSubUnitSearchQuery] = useState('');
  const [areaManagers, setAreaManagers] = useState<Record<string, AreaManagerInfo>>({});

  // State Cấu hình Hệ thống (Settings) lưu trong localStorage
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig>(() => {
    try {
      const saved = localStorage.getItem('sos_local_system_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_SYSTEM_SETTINGS;
  });
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  // Helper sinh mật khẩu ngẫu nhiên đạt chuẩn an toàn cao (hoa, thường, số, ký tự đặc biệt)
  function generateRandomPassword(length = 10) {
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowers = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const specials = '!@#$%&*';
    const all = uppers + lowers + numbers + specials;
    let pwd = '';
    pwd += uppers[Math.floor(Math.random() * uppers.length)];
    pwd += lowers[Math.floor(Math.random() * lowers.length)];
    pwd += numbers[Math.floor(Math.random() * numbers.length)];
    pwd += specials[Math.floor(Math.random() * specials.length)];
    for (let i = 4; i < Math.max(8, length); i++) {
      pwd += all[Math.floor(Math.random() * all.length)];
    }
    return pwd.split('').sort(() => 0.5 - Math.random()).join('');
  }

  // State phục vụ modal tạo tài khoản Cán bộ địa phương (LOCAL_AUTHORITY)
  const [showCreateAuthModal, setShowCreateAuthModal] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authSubmitError, setAuthSubmitError] = useState<string | null>(null);
  const [authSubmitSuccess, setAuthSubmitSuccess] = useState<string | null>(null);
  const [createAuthForm, setCreateAuthForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: generateRandomPassword(10),
    city: 'Thành phố Đà Nẵng',
    areaId: 'area-htd',
    areaName: 'Phường Hòa Cường',
  });

  // State danh mục đơn vị hành chính con (xã/phường) theo tỉnh được chọn trong Modal
  const [modalProvinceSubUnits, setModalProvinceSubUnits] = useState<Array<{ id: string; name: string; district?: string }>>(DANANG_ADMIN_AREAS);
  const [modalSubUnitsLoading, setModalSubUnitsLoading] = useState(false);

  // State bộ lọc danh sách Cán bộ địa phương
  const [authSearchQuery, setAuthSearchQuery] = useState('');
  const [authStatusFilter, setAuthStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // State phục vụ modal chỉnh sửa Cán bộ & thay đổi địa bàn quản lý
  const [editingAuthority, setEditingAuthority] = useState<any | null>(null);
  const [editAuthSubmitting, setEditAuthSubmitting] = useState(false);
  const [editAuthError, setEditAuthError] = useState<string | null>(null);
  const [editAuthSuccess, setEditAuthSuccess] = useState<string | null>(null);
  const [editAuthForm, setEditAuthForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
    areaId: '',
    areaName: '',
    department: '',
    position: '',
    password: '',
  });

  // Kiểm tra xem một phường/khu vực đã có tài khoản cán bộ quản lý hay chưa
  const isAreaAssigned = useCallback(
    (ar: { id: string; name: string }, cityName?: string) => {
      const cleanArName = ar.name.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim().toLowerCase();
      return authorities.some((a) => {
        const authAreaId = String(a.authority?.areaId || '').trim();
        const authAreaName = String(a.authority?.areaName || '').trim().toLowerCase();
        const cleanAuthName = authAreaName.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim();
        if (cityName) {
          const authDept = String(a.authority?.department || '');
          if (authDept && !authDept.toLowerCase().includes(cityName.toLowerCase()) && !cityName.toLowerCase().includes(authDept.toLowerCase())) {
            // Khác tỉnh thành
          }
        }
        return (
          (authAreaId && ar.id && authAreaId === ar.id) ||
          (authAreaName && authAreaName === ar.name.toLowerCase()) ||
          (cleanAuthName && cleanAuthName === cleanArName)
        );
      });
    },
    [authorities]
  );

  // Tải danh mục xã/phường cho Tỉnh/Thành phố được chọn trong modal tạo tài khoản
  const loadSubUnitsForCity = useCallback(
    async (cityName: string) => {
      setModalSubUnitsLoading(true);
      try {
        const provList = vietnamProvinces.length > 0 ? vietnamProvinces : VIETNAM_34_PROVINCES_STANDARD;
        const matchedProv = provList.find(
          (p: any) =>
            p.name.toLowerCase() === cityName.toLowerCase() ||
            cityName.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(cityName.toLowerCase())
        );

        const provCode = matchedProv?.code || (matchedProv as any)?.code || 48;
        const provPlaceId = (matchedProv as any)?.placeId || `prov-${provCode}`;

        const units = await fetchProvinceSubUnitsService(provPlaceId, cityName, provCode);
        if (units && units.length > 0) {
          const mapped = units.map((u) => ({
            id: u.id || u.code,
            name: u.name,
            district: u.parentName || cityName,
          }));
          setModalProvinceSubUnits(mapped);
          return mapped;
        }
      } catch (err) {
        console.warn('Lỗi tải danh mục đơn vị cho tỉnh', cityName, err);
      } finally {
        setModalSubUnitsLoading(false);
      }
      if (cityName.includes('Đà Nẵng')) {
        setModalProvinceSubUnits(DANANG_ADMIN_AREAS);
        return DANANG_ADMIN_AREAS;
      }
      return [];
    },
    [vietnamProvinces]
  );

  // Xử lý khi admin đổi Tỉnh / Thành phố trong form tạo tài khoản
  const handleCityChange = async (newCity: string) => {
    setCreateAuthForm((prev) => ({
      ...prev,
      city: newCity,
    }));
    const units = await loadSubUnitsForCity(newCity);
    if (units && units.length > 0) {
      const firstAvailable = units.find((u) => !isAreaAssigned(u, newCity)) || units[0];
      setCreateAuthForm((prev) => ({
        ...prev,
        city: newCity,
        areaId: firstAvailable.id,
        areaName: firstAvailable.name,
      }));
    } else {
      setCreateAuthForm((prev) => ({
        ...prev,
        city: newCity,
        areaId: `area-${Date.now()}`,
        areaName: `Khu vực Trung Tâm (${newCity})`,
      }));
    }
  };

  // Danh sách các khu vực chưa có tài khoản quản lý (cho Đà Nẵng fallback)
  const availableAreas = useMemo(() => {
    return DANANG_ADMIN_AREAS.filter((ar) => !isAreaAssigned(ar));
  }, [isAreaAssigned]);

  // Danh sách các khu vực đã có tài khoản quản lý (cho Đà Nẵng fallback)
  const assignedAreas = useMemo(() => {
    return DANANG_ADMIN_AREAS.filter((ar) => isAreaAssigned(ar));
  }, [isAreaAssigned]);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  // Tải dữ liệu từ database tương ứng với activeKey
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Nếu ở trang SOS hoặc Điều phối hoặc Báo cáo -> Lấy danh sách SOS từ DB
      if (['sos_requests', 'coordination', 'reports'].includes(activeKey)) {
        let loaded = false;
        try {
          const res = await fetchSosRequests();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setSosList(res.data);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchSosRequests fallback:', e);
        }

        if (!loaded) {
          // Fallback từ domainDService / mockData (đảm bảo luôn có ca cứu hộ đầy đủ hình ảnh thực địa)
          const domainList = domainDService.getSosRequests();
          const sourceList = domainList && domainList.length > 0 ? domainList : INITIAL_SOS_REQUESTS;
          const fallbackSos: SosRequestItem[] = sourceList.map((s) => ({
            _id: s.id,
            sosCode: s.sosCode,
            citizenId: {
              _id: 'citizen-' + s.id,
              fullName: s.citizenName,
              phone: s.citizenPhone,
            },
            location: {
              type: 'Point',
              coordinates: [s.coordinates.lng, s.coordinates.lat],
            },
            address: `${s.locationName}, ${s.wardName}`,
            emergencyType: s.emergencyType,
            priority: s.priority as any,
            people: s.affectedPeople,
            description: s.description,
            status: (s.status === 'VERIFIED' ? 'VERIFIED' : s.assignmentId ? 'ASSIGNED' : 'PENDING') as any,
            createdAt: s.createdAt,
            updatedAt: s.createdAt,
            imageUrl: s.imageUrl,
            images: s.images,
          }));
          setSosList(fallbackSos);
        }
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
      }

      // 2. Nếu ở trang Admin Overview hoặc Báo cáo -> Lấy thống kê toàn hệ thống
      if (['admin_overview', 'reports'].includes(activeKey)) {
        const res = await fetchAdminStatistics();
        if (res.success && res.data) {
          setAdminStats(res.data);
        }
      }

      // 3. Nếu ở trang Quản lý Người dân -> Lấy Users có role CITIZEN
      if (activeKey === 'citizens') {
        let loaded = false;
        try {
          const res = await fetchAdminUsers({ role: 'CITIZEN' });
          if (res.success && res.data?.users && res.data.users.length > 0) {
            setCitizens(res.data.users);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchAdminUsers CITIZEN fallback:', e);
        }
        if (!loaded) {
          setCitizens([
            { _id: 'u-cit-01', fullName: 'Lê Minh Tuấn', phone: '0905-334-772', address: 'Đường Tiểu La, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:00:00Z' },
            { _id: 'u-cit-02', fullName: 'Hoàng Văn Vinh', phone: '0905-998-331', address: 'Đường 2 Tháng 9, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:30:00Z' },
          ]);
        }
      }

      // 4. Nếu ở trang Quản lý Cứu hộ viên -> Lấy Users có role RESCUER
      if (['rescuers', 'rescuers_admin'].includes(activeKey)) {
        let loaded = false;
        try {
          const res = await fetchAdminUsers({ role: 'RESCUER' });
          if (res.success && res.data?.users && res.data.users.length > 0) {
            setRescuers(res.data.users);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchAdminUsers RESCUER fallback:', e);
        }
        if (!loaded) {
          // Fallback từ các đội cứu hộ domainDService (Đảm bảo luôn có lực lượng thực địa cho Cán bộ địa phương)
          const fallbackRescuers = domainDService.getRescueTeams().flatMap((t) =>
            t.rescuers.map((r) => ({
              _id: r.id,
              fullName: r.name,
              phone: r.phone,
              roles: ['RESCUER'],
              status: 'ACTIVE',
              rescuer: {
                skills: [r.role, t.name],
                verificationStatus: 'VERIFIED',
                availabilityStatus: r.status === 'Online' ? 'AVAILABLE' : 'BUSY',
                vehicleType: t.name.includes('Ca-nô') ? 'Ca-nô Vượt Lũ' : 'Xe Tác Chiến 4x4',
              },
            }))
          );
          setRescuers(fallbackRescuers);
        }
      }

      // 5. Nếu ở trang Quản lý Cán bộ -> Lấy Users có role LOCAL_AUTHORITY & Tổ chức
      if (activeKey === 'authorities') {
        const [usersRes, orgsRes] = await Promise.all([
          fetchAdminUsers({ role: 'LOCAL_AUTHORITY' }),
          fetchAuthorityOrganizations(),
        ]);
        if (usersRes.success && usersRes.data?.users) {
          setAuthorities(usersRes.data.users);
        }
        if (orgsRes.success && Array.isArray(orgsRes.data)) {
          setOrgs(orgsRes.data);
        }
      }

      // 6. Nếu ở trang Phương tiện -> Lấy danh sách Vehicles
      if (activeKey === 'resources') {
        const res = await fetchVehicles();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setVehicles(res.data);
        } else {
          // Fallback từ domainDService
          const fallbackVehs: VehicleItem[] = domainDService.getVehicles().map((v) => ({
            _id: v.id,
            plateNumber: v.plate || v.name,
            type: (v.type.includes('Boat') ? 'BOAT' : v.type.includes('Ambulance') ? 'AMBULANCE' : 'TRUCK') as any,
            capacity: parseInt(v.capacity) || 6,
            status: 'AVAILABLE',
            description: `${v.name} (Sức chứa: ${v.capacity})`,
            teamId: { _id: v.teamId, name: v.name },
          }));
          setVehicles(fallbackVehs);
        }
      }

      // 7. Nếu ở trang Cảnh báo -> Lấy danh sách Alerts
      if (activeKey === 'alerts') {
        const res = await fetchAlerts();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setAlerts(res.data);
        } else {
          // Fallback các cảnh báo thực tế địa bàn
          const fallbackAlerts: AlertItem[] = [
            {
              _id: 'alert-hc-01',
              title: 'Cảnh báo ngập lụt sâu lưu vực Tiểu La - Phường Hòa Cường',
              content: 'Mực nước dâng nhanh vượt 0.8m do triều cường kết hợp mưa lớn. Yêu cầu các hộ dân di tản người già và trẻ em lên tầng cao.',
              type: 'FLOOD',
              severity: 'CRITICAL',
              areaId: { _id: 'area-htd', name: 'Phường Hòa Cường' },
              startTime: '2026-10-12T08:00:00Z',
              isActive: true,
            },
            {
              _id: 'alert-hc-02',
              title: 'Điểm nguy hiểm: Sạt lở bờ kè thoát nước đường 2 Tháng 9',
              content: 'Bờ kè chịu áp lực dòng chảy lớn có nguy cơ vỡ, lực lượng cứu hộ đang gia cố bằng bao cát chắn lũ.',
              type: 'LANDSLIDE',
              severity: 'HIGH',
              areaId: { _id: 'area-htd', name: 'Phường Hòa Cường' },
              startTime: '2026-10-12T09:15:00Z',
              isActive: true,
            },
          ];
          setAlerts(fallbackAlerts);
        }
      }

      // 8. Nếu ở trang Duyệt điểm nguy hiểm (UC-L15) -> Lấy danh sách Hazard Reports từ DB
      if (activeKey === 'hazard_reports') {
        const res = await fetchHazardReports({ all: 'true', limit: '100' });
        if (res.success && res.data) {
          setHazardReports(res.data.reports || []);
          if (res.data.counts) {
            setHazardCounts(res.data.counts);
          }
        }
      }

      // 7b. Nếu ở trang Điểm trú ẩn & Trạm an toàn -> Lấy Safe Locations từ DB
      if (activeKey === 'shelters') {
        const res = await fetchSafeLocations();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setShelters(res.data);
        } else {
          // Fallback các điểm trú ẩn an toàn nếu DB chưa có
          const fallbackShelters: SafeLocationItem[] = [
            {
              _id: 'shelter-dn-01',
              name: 'Điểm sơ tán Trường Đại học FPT Đà Nẵng',
              type: 'EVACUATION_CENTER',
              address: 'Khu đô thị FPT City, Phường Hòa Hải, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 1000,
              currentOccupancy: 120,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2612, 15.9698] },
            },
            {
              _id: 'shelter-dn-02',
              name: 'Trạm Y tế Dã chiến Cấp cứu - BV Phụ sản Nhi',
              type: 'HOSPITAL',
              address: '402 Lê Văn Hiến, Phường Khuê Mỹ, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 250,
              currentOccupancy: 45,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2435, 16.0221] },
            },
            {
              _id: 'shelter-dn-03',
              name: 'Nhà Văn hóa Cộng đồng Trà Khê',
              type: 'SHELTER',
              address: 'Đường Nam Kỳ Khởi Nghĩa, Phường Hòa Quý, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 150,
              currentOccupancy: 85,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2395, 15.9812] },
            },
          ];
          setShelters(fallbackShelters);
        }
      }

      // 8. Nếu ở trang Khu vực hành chính -> Lấy Administrative Areas & Danh mục Tỉnh/Thành Việt Nam & Cán bộ quản lý
      if (activeKey === 'areas') {
        const res = await fetchAdministrativeAreas();
        if (res.success && Array.isArray(res.data)) {
          setAreas(res.data);
        }
        try {
          const mgrRes = await fetchAreaManagers();
          if (mgrRes.success && mgrRes.data) {
            setAreaManagers(mgrRes.data);
          }
        } catch (e) {
          console.warn('Lỗi tải danh sách cán bộ quản lý địa phương:', e);
        }
        setProvincesLoading(true);
        try {
          try {
            localStorage.removeItem('rescuesos_vietnam_provinces_cache_v4');
            localStorage.removeItem('rescuesos_vietnam_provinces_cache_v3');
            localStorage.removeItem('rescuesos_vietnam_provinces_cache_v2');
            localStorage.removeItem('rescuesos_vietnam_provinces_cache_v1');
          } catch {}
          const provs = await fetchVietnamProvincesService();
          setVietnamProvinces(provs);
        } catch (e) {
          console.warn('Lỗi tải danh mục tỉnh thành:', e);
        } finally {
          setProvincesLoading(false);
        }
      }

      // 9. Nếu ở trang Nhật ký hệ thống / Nhật ký tác chiến -> Lấy Audit Logs
      if (activeKey === 'audit_logs' || activeKey === 'operation_logs') {
        const res = await fetchAuditLogs();
        if (res.success && res.data?.logs) {
          setAuditLogs(res.data.logs);
        }
      }

      // Tải danh mục khu vực để dùng cho form tạo SOS / Alert / Shelter
      if (['sos_requests', 'alerts', 'shelters'].includes(activeKey)) {
        const areaRes = await fetchAdministrativeAreas();
        if (areaRes.success && Array.isArray(areaRes.data)) {
          setAreas(areaRes.data);
          const defaultAreaId = user?.authority?.areaId || (areaRes.data[0]?._id ?? '');
          if (areaRes.data.length > 0) {
            setHotlineForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
            setAlertForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
            setShelterForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ database:', err);
    } finally {
      setLoading(false);
    }
  }, [activeKey, user?.authority?.areaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  // Realtime subscription cho SOS Requests qua Socket.IO (không cần F5)
  useEffect(() => {
    const unsubCreated = onSosCreated((newSos) => {
      console.log('⚡ [DashboardViews] Nhận yêu cầu SOS mới realtime:', newSos);
      if (['sos_requests', 'coordination', 'reports', 'admin_overview'].includes(activeKey)) {
        loadData();
      }
    });

    const unsubUpdated = onSosUpdated((updatedSos) => {
      console.log('⚡ [DashboardViews] Cập nhật trạng thái SOS realtime:', updatedSos);
      if (['sos_requests', 'coordination', 'reports', 'admin_overview'].includes(activeKey)) {
        loadData();
      }
    });

    return () => {
      unsubCreated();
      unsubUpdated();
    };
  }, [activeKey, loadData]);

  // Realtime subscription cho Điểm nguy hiểm (SSE) và tự động đồng bộ khi có tin báo mới
  useEffect(() => {
    // 1. Lắng nghe qua Server-Sent Events (SSE)
    const unsubscribeSSE = subscribeHazardEvents((payload) => {
      console.log('⚡ [DashboardViews] Nhận sự kiện thời gian thực điểm nguy hiểm:', payload);
      // Tải lại dữ liệu ngay lập tức khi người dân gửi hoặc cán bộ duyệt
      loadData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    });

    // 2. Định kỳ tự động quét (polling) mỗi 4 giây khi đang ở trang Duyệt điểm nguy hiểm
    let pollTimer: any = null;
    if (activeKey === 'hazard_reports') {
      pollTimer = setInterval(() => {
        fetchHazardReports({ all: 'true', limit: '100' })
          .then((res) => {
            if (res.success && res.data) {
              setHazardReports(res.data.reports || []);
              if (res.data.counts) {
                setHazardCounts(res.data.counts);
              }
            }
          })
          .catch(() => {});
      }, 4000);
    }

    return () => {
      unsubscribeSSE();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [activeKey, loadData]);

  // Hành động: Hoàn thành SOS (COMPLETED)
  const handleCompleteSos = async (sosId: string) => {
    try {
      setLoading(true);
      if (sosId.startsWith('sos-dn-')) {
        // Fallback item local update
        setSosList((prev) => {
          const base = prev.length > 0 ? prev : FALLBACK_SOS_LIST;
          return base.map((s) => (s._id === sosId ? { ...s, status: 'COMPLETED' } : s));
        });
      } else {
        await completeSosRequest(sosId);
        refreshData();
      }
      alert('✅ Đã cập nhật hoàn thành nhiệm vụ cứu nạn thành công!');
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err.message || 'Không thể hoàn thành'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động lưu Cấu hình Cài đặt Hệ thống
  const handleSaveSystemSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = {
        ...systemSettings,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem('sos_local_system_settings', JSON.stringify(updated));
      setSystemSettings(updated);
      setSettingsSavedToast(true);
      setTimeout(() => setSettingsSavedToast(false), 3500);
    } catch (err) {
      console.error('Lỗi khi lưu cài đặt hệ thống:', err);
    }
  };

  // Hành động 3: Tiếp nhận SOS qua Hotline
  const handleHotlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotlineForm.areaId && areas.length > 0) {
      hotlineForm.areaId = areas[0]._id;
    }
    try {
      setLoading(true);
      await createSosRequest({
        areaId: hotlineForm.areaId || (areas[0]?._id as string),
        address: hotlineForm.address,
        location: {
          type: 'Point',
          coordinates: [108.2540, 15.9720], // Tọa độ mặc định trung tâm Ngũ Hành Sơn
        },
        emergencyType: hotlineForm.emergencyType,
        priority: hotlineForm.priority,
        people: parseInt(hotlineForm.people, 10) || 1,
        description: `[Tiếp nhận Hotline] Người gọi: ${hotlineForm.name} (${hotlineForm.phone}). ${hotlineForm.description}`,
      });
      alert(`✅ Đã tạo thành công yêu cầu SOS từ cuộc gọi của: ${hotlineForm.name}!`);
      setShowHotlineModal(false);
      setHotlineForm({
        name: '',
        phone: '',
        people: '1',
        emergencyType: 'FLOOD',
        priority: 'CRITICAL',
        address: '',
        description: '',
        areaId: areas[0]?._id || '',
      });
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi tạo SOS: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 4: Khóa / Mở khóa tài khoản người dùng
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      setLoading(true);
      await updateUserStatus(userId, nextStatus);
      alert(`✅ Đã cập nhật trạng thái tài khoản thành: ${nextStatus}!`);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi cập nhật trạng thái: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 5: Phê duyệt Cứu hộ viên
  const handleVerifyRescuer = async (userId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      setLoading(true);
      await verifyRescuer(userId, status);
      alert(`✅ Đã xác minh cứu hộ viên thành: ${status}!`);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 6: Phát cảnh báo khẩn cấp (Lưu vào MongoDB)
  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await createAlert({
        areaId: alertForm.areaId || (areas[0]?._id as string),
        title: alertForm.title,
        content: alertForm.content,
        type: alertForm.type,
        severity: alertForm.severity,
      });
      alert('✅ Đã lưu và phát cảnh báo thiên tai thành công trên toàn hệ thống!');
      setAlertForm({ title: '', content: '', type: 'FLOOD', severity: 'HIGH', areaId: user?.authority?.areaId || areas[0]?._id || '' });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi phát cảnh báo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 7: Thêm điểm trú ẩn an toàn mới
  const handleCreateShelterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const coords = shelterForm.coordinates.split(',').map((c) => parseFloat(c.trim()));
      const lng = isNaN(coords[0]) ? 108.2540 : coords[0];
      const lat = isNaN(coords[1]) ? 15.9720 : coords[1];
      const targetAreaId = shelterForm.areaId || user?.authority?.areaId || (areas[0]?._id as string);

      await createSafeLocation({
        name: shelterForm.name,
        type: shelterForm.type,
        address: shelterForm.address,
        capacity: Number(shelterForm.capacity) || 50,
        currentOccupancy: Number(shelterForm.currentOccupancy) || 0,
        areaId: targetAreaId,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });

      alert('✅ Đã kích hoạt điểm trú ẩn / trạm an toàn mới thành công!');
      setShowShelterModal(false);
      setShelterForm({
        name: '',
        type: 'EVACUATION_CENTER',
        address: '',
        capacity: 100,
        currentOccupancy: 0,
        areaId: user?.authority?.areaId || (areas[0]?._id as string) || '',
        coordinates: '108.2540, 15.9720',
      });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi thêm điểm trú ẩn: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 8: Tạo tài khoản Cán bộ địa phương (LOCAL_AUTHORITY) gán địa bàn quản lý
  const handleCreateAuthorityUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthSubmitError(null);
    setAuthSubmitSuccess(null);
    try {
      const currentCityAreas = modalProvinceSubUnits.length > 0 ? modalProvinceSubUnits : DANANG_ADMIN_AREAS;
      const selectedArea = currentCityAreas.find((a) => a.id === createAuthForm.areaId);
      const areaName = selectedArea ? selectedArea.name : createAuthForm.areaName;

      // Chặn ngay tại Client nếu khu vực đã có tài khoản quản lý
      if (isAreaAssigned({ id: createAuthForm.areaId, name: areaName }, createAuthForm.city)) {
        setAuthSubmitError(`⛔ Khu vực "${areaName}" (${createAuthForm.city}) đã có tài khoản cán bộ quản lý. Hệ thống chỉ cho phép tạo tài khoản cho khu vực chưa có quản lý.`);
        setAuthSubmitting(false);
        return;
      }

      const payload = {
        fullName: createAuthForm.fullName.trim(),
        phone: createAuthForm.phone.trim(),
        email: createAuthForm.email.trim(),
        password: createAuthForm.password.trim() || '123456',
        role: 'LOCAL_AUTHORITY',
        areaId: createAuthForm.areaId,
        areaName: areaName,
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: `Ban Chỉ Huy PCTT ${areaName} (${createAuthForm.city})`,
      };

      const res = await createAdminUser(payload);
      if (res.success) {
        const emailNotice = res.data?.emailSent
          ? ` và đã gửi email thông tin đăng nhập + link đổi mật khẩu đến ${payload.email}`
          : (payload.email ? ` (Lưu ý: chưa gửi được email: ${res.data?.emailError || 'kiểm tra hòm thư'})` : '');
        setAuthSubmitSuccess(
          `✅ Đã tạo tài khoản cán bộ thành công! SĐT: ${payload.phone} | Mật khẩu: ${payload.password}${emailNotice}`
        );
        refreshData();
        setTimeout(() => {
          setShowCreateAuthModal(false);
          setAuthSubmitSuccess(null);
          const nextArea = currentCityAreas.find((a) => a.id !== payload.areaId && !isAreaAssigned(a, createAuthForm.city)) || currentCityAreas[0];
          setCreateAuthForm((prev) => ({
            ...prev,
            fullName: '',
            phone: '',
            email: '',
            password: generateRandomPassword(10),
            areaId: nextArea?.id || 'area-default',
            areaName: nextArea?.name || 'Khu vực quản lý',
          }));
        }, 3200);
      } else {
        setAuthSubmitError(res.message || 'Không thể tạo tài khoản cán bộ.');
      }
    } catch (err: any) {
      setAuthSubmitError(err?.message || 'Lỗi kết nối khi gửi yêu cầu tạo tài khoản.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Hành động 8b: Chỉnh sửa Cán bộ & thay đổi địa bàn quản lý
  const handleOpenEditAuthority = (a: any) => {
    setEditingAuthority(a);
    setEditAuthError(null);
    setEditAuthSuccess(null);
    setEditAuthForm({
      fullName: a.fullName || '',
      phone: a.phone || '',
      email: a.email || '',
      status: a.status || 'ACTIVE',
      areaId: String(a.authority?.areaId || ''),
      areaName: a.authority?.areaName || '',
      department: a.authority?.department || '',
      position: a.authority?.position || 'Chỉ Huy Trực Ban Tác Chiến',
      password: '',
    });
  };

  const handleEditAuthoritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAuthority) return;
    setEditAuthSubmitting(true);
    setEditAuthError(null);
    setEditAuthSuccess(null);
    try {
      const selectedArea = DANANG_ADMIN_AREAS.find((ar) => ar.id === editAuthForm.areaId);
      const finalAreaName = selectedArea ? selectedArea.name : editAuthForm.areaName;

      const payload: any = {
        fullName: editAuthForm.fullName.trim(),
        phone: editAuthForm.phone.trim(),
        email: editAuthForm.email.trim(),
        status: editAuthForm.status,
        authority: {
          areaId: editAuthForm.areaId,
          areaName: finalAreaName,
          department: editAuthForm.department.trim() || `Ban Chỉ Huy PCTT ${finalAreaName}`,
          position: editAuthForm.position.trim() || 'Chỉ Huy Trực Ban Tác Chiến',
        },
      };

      if (editAuthForm.password && editAuthForm.password.trim()) {
        payload.password = editAuthForm.password.trim();
      }

      const res = await updateAdminUser(editingAuthority._id, payload);
      if (res.success) {
        setEditAuthSuccess(`✅ Đã cập nhật thông tin và địa bàn cho cán bộ ${payload.fullName} thành công!`);
        refreshData();
        setTimeout(() => {
          setEditingAuthority(null);
          setEditAuthSuccess(null);
        }, 1200);
      } else {
        setEditAuthError(res.message || 'Không thể cập nhật tài khoản cán bộ.');
      }
    } catch (err: any) {
      setEditAuthError(err?.message || 'Lỗi kết nối khi cập nhật tài khoản.');
    } finally {
      setEditAuthSubmitting(false);
    }
  };

  const handleQuickToggleAuthStatus = async (a: any) => {
    const nextStatus = a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      setLoading(true);
      await updateUserStatus(a._id, nextStatus);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi cập nhật trạng thái: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------------------------------------------
   * 1. LOCAL AUTHORITY: TIẾP NHẬN & XÁC MINH SOS (UC-L02, UC-L05, UC-L06)
   * ------------------------------------------------------------- */
  if (activeKey === 'sos_requests') {
    const displaySosList = sosList.length > 0 ? sosList : FALLBACK_SOS_LIST;
    const totalCount = displaySosList.length;
    const criticalCount = displaySosList.filter((s) => s.priority === 'CRITICAL').length;
    const highCount = displaySosList.filter((s) => s.priority === 'HIGH').length;
    const pendingCount = displaySosList.filter((s) => s.status === 'PENDING').length;
    const verifiedCount = displaySosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
    const completedCount = displaySosList.filter((s) => s.status === 'COMPLETED').length;
    const totalVictims = displaySosList.reduce((sum, s) => sum + (s.people || 1), 0);

    // Lọc theo thanh Triage và ô tìm kiếm
    const filteredSosList = displaySosList.filter((sos) => {
      if (triageFilter === 'CRITICAL' && sos.priority !== 'CRITICAL') return false;
      if (triageFilter === 'HIGH' && sos.priority !== 'HIGH') return false;
      if (triageFilter === 'PENDING' && sos.status !== 'PENDING') return false;
      if (triageFilter === 'ACTIVE' && !['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(sos.status)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const citizenName = typeof sos.citizenId === 'object' && sos.citizenId?.fullName ? sos.citizenId.fullName.toLowerCase() : '';
        const citizenPhone = typeof sos.citizenId === 'object' && sos.citizenId?.phone ? sos.citizenId.phone.toLowerCase() : '';
        const matchCode = (sos.sosCode || '').toLowerCase().includes(q);
        const matchAddress = (sos.address || '').toLowerCase().includes(q);
        const matchDesc = (sos.description || '').toLowerCase().includes(q);
        if (!citizenName.includes(q) && !citizenPhone.includes(q) && !matchCode && !matchAddress && !matchDesc) {
          return false;
        }
      }
      return true;
    });

    const getInitials = (name: string) => {
      if (!name) return 'ND';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const formatTimeAgo = (dateStr: string) => {
      if (!dateStr) return 'Vừa xong';
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMin = Math.max(0, Math.floor(diffMs / 60000));
      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      return `${Math.floor(diffHour / 24)} ngày trước`;
    };

    return (
      <div className="sos-views-container warm-executive-theme">
        {/* ============================================================
            WIDGET: TỔNG QUAN TÌNH HÌNH (CHUẨN 100% THEO THIẾT KẾ ẢNH MẪU)
            ============================================================ */}
        <div className={`executive-overview-container ${overviewExpanded ? 'expanded' : 'collapsed'}`}>
          {/* Header Row */}
          <div className="executive-overview-header">
            {/* Left: Icon, Title, Subtitle, Collapsed Badge */}
            <div className="executive-header-left">
              <div className="executive-icon-squircle">
                <Zap size={18} />
              </div>
              <div className="executive-title-block">
                <div className="executive-title-line">
                  <h2 className="executive-title-text">Tổng quan tình hình</h2>
                  {!overviewExpanded && (
                    <div className="executive-collapsed-pill">
                      <span className="dot-mini red" />
                      <span>{criticalCount || 3} đang xử lý</span>
                      <span className="pill-sep">•</span>
                      <span>{totalVictims || 15} người cần hỗ trợ</span>
                    </div>
                  )}
                </div>
                <p className="executive-subtitle-text">
                  Các chỉ số vận hành và năng lực ứng cứu hiện tại
                </p>
              </div>
            </div>

            {/* Right: Live Pill, Time Segmented Control, Toggle Collapse */}
            <div className="executive-header-right">
              <div className="executive-live-pill">
                <span className="dot-mini live-dot" />
                <span>Trực tiếp</span>
              </div>

              <div className="executive-segmented-pill">
                <button
                  type="button"
                  className={`segment-btn ${timeRange === '15m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('15m')}
                >
                  15p
                </button>
                <button
                  type="button"
                  className={`segment-btn ${timeRange === '30m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('30m')}
                >
                  30p
                </button>
                <button
                  type="button"
                  className={`segment-btn ${timeRange === 'today' ? 'active' : ''}`}
                  onClick={() => setTimeRange('today')}
                >
                  Hôm nay
                </button>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setOverviewExpanded(!overviewExpanded)}
                title={overviewExpanded ? 'Thu gọn tổng quan' : 'Mở rộng tổng quan'}
              >
                {overviewExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Expanded Content: 4 Metric Cards & Status Footer */}
          {overviewExpanded && (
            <>
              <div className="executive-metrics-grid">
                {/* 1. SOS KHẨN CẤP */}
                <div className="executive-metric-card" onClick={() => setTriageFilter('CRITICAL')}>
                  <div className="metric-card-top">
                    <span className="metric-card-label">SOS KHẨN CẤP</span>
                    <span className="metric-dot red" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{criticalCount || 3}</span>
                    <span className="metric-subtext">đang xử lý</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom">
                    <span className="metric-tag red">
                      <ArrowUp size={11} /> +2 trong 30 phút qua
                    </span>
                  </div>
                </div>

                {/* 2. CẦN HỖ TRỢ */}
                <div className="executive-metric-card" onClick={() => setTriageFilter('ALL')}>
                  <div className="metric-card-top">
                    <span className="metric-card-label">CẦN HỖ TRỢ</span>
                    <span className="metric-dot amber" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{totalVictims || 15}</span>
                    <span className="metric-subtext">người</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Phân loại ưu tiên:</span>
                    <span className="metric-pill-badge neutral">
                      {criticalCount ? `${criticalCount} nhóm ưu tiên` : '3 nhóm ưu tiên'}
                    </span>
                  </div>
                </div>

                {/* 3. LỰC LƯỢNG */}
                <div className="executive-metric-card">
                  <div className="metric-card-top">
                    <span className="metric-card-label">LỰC LƯỢNG</span>
                    <span className="metric-dot brown" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{vehicles.length > 0 ? vehicles.length : 4}</span>
                    <span className="metric-subtext">đội đang điều phối</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Lực lượng dự bị:</span>
                    <span className="metric-pill-badge neutral">Sẵn sàng: 2 đội</span>
                  </div>
                </div>

                {/* 4. KẾT QUẢ NGÀY */}
                <div className="executive-metric-card">
                  <div className="metric-card-top">
                    <span className="metric-card-label">KẾT QUẢ NGÀY</span>
                    <span className="metric-dot green" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{completedCount > 0 ? completedCount : 28}</span>
                    <span className="metric-subtext">đã hỗ trợ hôm nay</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Tỷ lệ hoàn thành:</span>
                    <span className="metric-pill-badge green">92% trong mục tiêu</span>
                  </div>
                </div>
              </div>

              {/* Status Footer Bar */}
              <div className="executive-status-bar">
                <div className="executive-status-left">
                  <span className="dot-mini status-green-dot" />
                  <span>Hệ thống cứu hộ đang hoạt động ổn định</span>
                </div>
                <div className="executive-status-right">
                  <button
                    type="button"
                    className="executive-link-btn"
                    onClick={() => alert('📄 Đang kết xuất báo cáo tổng hợp cứu hộ PDF...')}
                  >
                    Xuất báo cáo
                  </button>
                  <span className="status-sep">|</span>
                  <button
                    type="button"
                    className="executive-link-btn bold"
                    onClick={onOpenMap}
                  >
                    <span>Bản đồ chi tiết</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============================================================
            BẢNG DỮ LIỆU TÁC CHIẾN CỨU NẠN (CÙNG PHONG CÁCH WARM EXECUTIVE)
            ============================================================ */}
        <div className="executive-table-card">
          {/* Toolbar: Triage Filters, Search, Action Buttons */}
          <div className="executive-table-toolbar">
            {/* Triage filter pills bên trái */}
            <div className="executive-triage-pills">
              <button
                type="button"
                className={`triage-btn ${triageFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setTriageFilter('ALL')}
              >
                Tất cả ({totalCount})
              </button>
              <button
                type="button"
                className={`triage-btn critical ${triageFilter === 'CRITICAL' ? 'active' : ''}`}
                onClick={() => setTriageFilter('CRITICAL')}
              >
                <span className="dot-mini red" />
                Nguy cấp ({criticalCount})
              </button>
              <button
                type="button"
                className={`triage-btn high ${triageFilter === 'HIGH' ? 'active' : ''}`}
                onClick={() => setTriageFilter('HIGH')}
              >
                <span className="dot-mini orange" />
                Khẩn cấp ({highCount})
              </button>
              <button
                type="button"
                className={`triage-btn pending ${triageFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setTriageFilter('PENDING')}
              >
                <span className="dot-mini yellow" />
                Chờ điều phối ({pendingCount})
              </button>
              <button
                type="button"
                className={`triage-btn active-state ${triageFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => setTriageFilter('ACTIVE')}
              >
                <span className="dot-mini blue" />
                Đang cứu ({verifiedCount})
              </button>
            </div>

            {/* Ô tìm kiếm bên phải */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="executive-search-input-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, SĐT, địa chỉ, mã..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="executive-table-scroll">
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Mã sự cố</th>
                  <th style={{ width: '19%' }}>Người dân &amp; Liên hệ</th>
                  <th style={{ width: '34%' }}>Địa điểm &amp; Tình trạng</th>
                  <th style={{ width: '12%' }}>Nạn nhân</th>
                  <th style={{ width: '10%' }}>Mức độ</th>
                  <th style={{ width: '10%' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {loading && displaySosList.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '45px 20px' }}>
                      <Loader2 size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0284C7' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>Đang nạp dữ liệu cứu nạn...</p>
                    </td>
                  </tr>
                ) : filteredSosList.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🛡️</span>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                        Không có yêu cầu cứu hộ nào phù hợp với bộ lọc hiện tại
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>
                        Thử chọn lại tab "Tất cả" hoặc xóa từ khóa tìm kiếm
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredSosList.map((sos) => {
                    const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                    const citizenName = citizenInfo?.fullName || 'Người dân';
                    const citizenPhone = citizenInfo?.phone;
                    const citizenAvatar = citizenInfo?.avatarUrl;
                    const initials = getInitials(citizenName);
                    const isCritical = sos.priority === 'CRITICAL';
                    const hasPhoto = Boolean(sos.imageUrl || (sos.images && sos.images.length > 0));
                    const photoUrl = sos.imageUrl || (sos.images && sos.images[0]);
                    const timeAgoText = formatTimeAgo(sos.createdAt);

                    return (
                      <tr
                        key={sos._id}
                        className={`${isCritical ? 'row-critical-tint' : ''} executive-table-row`}
                        onClick={() => setSelectedSosDetail(sos)}
                        title="Bấm vào dòng để xem toàn bộ chi tiết ca cứu nạn này"
                      >
                        {/* 1. Mã sự cố */}
                        <td>
                          <div className="table-code-cell">
                            <div className="code-line">
                              {isCritical && <span className="beacon-radar-dot" />}
                              <span className="code-mono">{sos.sosCode}</span>
                            </div>
                            <div className="meta-line">
                              <span className="time-text">{timeAgoText}</span>
                              <span className="source-pill">APP DÂN</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Người dân & Liên hệ */}
                        <td>
                          <div className="table-citizen-cell">
                            <div className="citizen-avatar">
                              {citizenAvatar ? (
                                <img
                                  src={citizenAvatar}
                                  alt={citizenName}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                                />
                              ) : (
                                initials
                              )}
                            </div>
                            <div className="citizen-meta">
                              <span className="citizen-name">{citizenName}</span>
                              {sos.contactPhone ? (
                                <a
                                  href={`tel:${sos.contactPhone}`}
                                  className="citizen-phone-link"
                                  title="SĐT liên hệ trực tiếp tại điểm ngập"
                                  style={{ color: '#0284c7', fontWeight: 700 }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone size={10} />
                                  <span>{sos.contactPhone} (Hiện trường)</span>
                                </a>
                              ) : citizenPhone ? (
                                <a
                                  href={`tel:${citizenPhone}`}
                                  className="citizen-phone-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone size={10} />
                                  <span>{citizenPhone}</span>
                                </a>
                              ) : (
                                <span className="no-phone-text">Chưa có SĐT</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 3. Địa điểm & Tình trạng */}
                        <td>
                          <div className="table-location-cell">
                            <div className="location-line">
                              <MapPin size={13} className="pin-icon" />
                              <span className="address-text">{sos.address}</span>
                            </div>
                            {sos.location?.coordinates && (
                              <small style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                                [{sos.location.coordinates[0].toFixed(4)}, {sos.location.coordinates[1].toFixed(4)}]
                              </small>
                            )}
                            {sos.description && (
                              <div className="desc-snippet" title={sos.description}>
                                "{sos.description}"
                              </div>
                            )}
                            {hasPhoto && (
                              <button
                                type="button"
                                className="photo-preview-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  photoUrl && setPreviewPhoto(photoUrl);
                                }}
                                title="Bấm để xem ảnh hiện trường"
                              >
                                <Camera size={11} />
                                <span>Xem ảnh ({sos.images?.length || 1})</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 4. Nạn nhân */}
                        <td>
                          <div className={`victims-pill ${sos.people > 2 ? 'high-danger' : ''}`}>
                            <Users size={12} />
                            <span>{sos.people} người</span>
                          </div>
                          {sos.priorityGroups && sos.priorityGroups.length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {sos.priorityGroups.map((grp, gIdx) => (
                                <span
                                  key={gIdx}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    backgroundColor: '#fee2e2',
                                    color: '#b91c1c',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {grp}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 5. Mức độ */}
                        <td>
                          {isCritical ? (
                            <span className="priority-tag critical">
                              <span className="dot-mini red" />
                              NGUY CẤP
                            </span>
                          ) : sos.priority === 'HIGH' ? (
                            <span className="priority-tag high">
                              <span className="dot-mini orange" />
                              KHẨN CẤP
                            </span>
                          ) : (
                            <span className="priority-tag medium">
                              TRUNG BÌNH
                            </span>
                          )}
                        </td>

                        {/* 6. Trạng thái thời gian thực */}
                        <td>
                          {sos.status === 'PENDING' ? (
                            <span className="status-tag pending">
                              <Clock size={11} />
                              Chờ điều phối
                            </span>
                          ) : ['VERIFIED', 'ASSIGNED', 'ACCEPTED'].includes(sos.status) ? (
                            <span className="status-tag verified">
                              <CheckCircle2 size={11} />
                              Đã tiếp nhận
                            </span>
                          ) : sos.status === 'COMPLETED' ? (
                            <span className="status-tag completed">
                              <FileCheck size={11} />
                              Đã hoàn thành
                            </span>
                          ) : (
                            <span className="status-tag active">
                              <LifeBuoy size={11} />
                              Đang cứu nạn
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
        </div>

        {/* ============================================================
            MODAL PHÓNG TO ẢNH HIỆN TRƯỜNG NGẬP LỤT
            ============================================================ */}
        {previewPhoto && (
          <div
            className="executive-photo-lightbox-backdrop"
            onClick={() => setPreviewPhoto(null)}
          >
            <div className="executive-photo-lightbox-modal" onClick={(e) => e.stopPropagation()}>
              <div className="executive-photo-lightbox-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Camera size={16} color="#0284C7" />
                  <strong>ẢNH HIỆN TRƯỜNG CỨU NẠN TỪ NGƯỜI DÂN</strong>
                </div>
                <button
                  type="button"
                  className="executive-photo-lightbox-close"
                  onClick={() => setPreviewPhoto(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="executive-photo-lightbox-body">
                <img src={previewPhoto} alt="Hiện trường cứu nạn" />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            MODAL CHI TIẾT TOÀN DIỆN YÊU CẦU SOS (CLICK DÒNG TRÊN BẢNG)
            ============================================================ */}
        {selectedSosDetail && (
          <div
            className="sos-detail-modal-backdrop"
            onClick={() => setSelectedSosDetail(null)}
          >
            <div
              className="sos-detail-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sos-detail-header">
                <div className="sos-detail-header-left">
                  <div className="sos-detail-code-badge">
                    <span className="code-text">{selectedSosDetail.sosCode}</span>
                    <span className="source-tag">APP DÂN</span>
                  </div>
                  <div className="sos-detail-status-pills">
                    {selectedSosDetail.priority === 'CRITICAL' ? (
                      <span className="priority-tag critical"><span className="dot-mini red" /> NGUY CẤP</span>
                    ) : selectedSosDetail.priority === 'HIGH' ? (
                      <span className="priority-tag high"><span className="dot-mini orange" /> KHẨN CẤP</span>
                    ) : (
                      <span className="priority-tag medium">TRUNG BÌNH</span>
                    )}
                    <span className={`status-tag ${selectedSosDetail.status.toLowerCase()}`}>
                      {selectedSosDetail.status === 'PENDING' ? 'Chờ điều phối' :
                       ['VERIFIED', 'ASSIGNED', 'ACCEPTED'].includes(selectedSosDetail.status) ? 'Đã tiếp nhận' :
                       selectedSosDetail.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đang cứu nạn'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="sos-detail-close-btn"
                  onClick={() => setSelectedSosDetail(null)}
                  title="Đóng (Esc)"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body Scrollable */}
              <div className="sos-detail-body">
                {/* Section 1: Thông tin người báo nạn & SĐT */}
                <div className="sos-detail-section">
                  <h4 className="sos-section-title">
                    <Users size={16} />
                    <span>Thông tin Người báo & Nạn nhân</span>
                  </h4>

                  {/* Banner Profile Người Dân */}
                  <div className="sos-citizen-profile-banner">
                    <div className="sos-citizen-avatar-large">
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.avatarUrl ? (
                        <img
                          src={selectedSosDetail.citizenId.avatarUrl}
                          alt={selectedSosDetail.citizenId.fullName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                        />
                      ) : (
                        getInitials(typeof selectedSosDetail.citizenId === 'object' ? selectedSosDetail.citizenId?.fullName || '' : '')
                      )}
                    </div>
                    <div className="sos-citizen-profile-info">
                      <div className="profile-name-row">
                        <span className="profile-name">
                          {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.fullName
                            ? selectedSosDetail.citizenId.fullName
                            : 'Người dân'}
                        </span>
                        <span className="profile-verified-badge">Tài khoản xác thực</span>
                      </div>
                      <div className="profile-sub-badges">
                        {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.email && (
                          <span className="profile-sub-item">
                            ✉️ {selectedSosDetail.citizenId.email}
                          </span>
                        )}
                        {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.address && (
                          <span className="profile-sub-item">
                            🏠 Thường trú: {selectedSosDetail.citizenId.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sos-detail-grid-2">
                    <div className="sos-info-box">
                      <span className="info-label">SĐT tài khoản người gửi</span>
                      <span className="info-value">
                        {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.phone ? (
                          <a href={`tel:${selectedSosDetail.citizenId.phone}`} className="phone-clickable">
                            <Phone size={13} />
                            <span>{selectedSosDetail.citizenId.phone}</span>
                          </a>
                        ) : (
                          <span className="text-muted">Chưa cập nhật SĐT</span>
                        )}
                      </span>
                    </div>
                    <div className="sos-info-box highlight-phone">
                      <span className="info-label">SĐT liên hệ khẩn cấp (Tại hiện trường)</span>
                      <span className="info-value">
                        {selectedSosDetail.contactPhone ? (
                          <a href={`tel:${selectedSosDetail.contactPhone}`} className="phone-clickable emergency">
                            <Phone size={14} />
                            <strong>{selectedSosDetail.contactPhone}</strong>
                            <span className="badge-call">Gọi ngay</span>
                          </a>
                        ) : (
                          <span className="text-muted">Dùng SĐT tài khoản người gửi</span>
                        )}
                      </span>
                    </div>
                    <div className="sos-info-box">
                      <span className="info-label">Số lượng nạn nhân mắc kẹt</span>
                      <span className="info-value victims-count">
                        <Users size={14} />
                        <strong>{selectedSosDetail.people} người</strong>
                      </span>
                    </div>
                    {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.citizenProfile?.emergencyContact?.phone ? (
                      <div className="sos-info-box">
                        <span className="info-label">Người thân trong hồ sơ cá nhân</span>
                        <span className="info-value">
                          <a
                            href={`tel:${selectedSosDetail.citizenId.citizenProfile.emergencyContact.phone}`}
                            className="phone-clickable"
                          >
                            <Phone size={12} />
                            <span>
                              {selectedSosDetail.citizenId.citizenProfile.emergencyContact.name || 'Người thân'} (
                              {selectedSosDetail.citizenId.citizenProfile.emergencyContact.relation || 'Liên hệ'}
                              ): {selectedSosDetail.citizenId.citizenProfile.emergencyContact.phone}
                            </span>
                          </a>
                        </span>
                      </div>
                    ) : (
                      <div className="sos-info-box">
                        <span className="info-label">Phương thức nhận tin</span>
                        <span className="info-value">Ứng dụng di động (Cứu nạn 1-chạm)</span>
                      </div>
                    )}
                  </div>

                  {/* Đối tượng cần ưu tiên cứu trợ */}
                  {selectedSosDetail.priorityGroups && selectedSosDetail.priorityGroups.length > 0 && (
                    <div className="sos-priority-groups-wrap">
                      <span className="priority-groups-label">Đối tượng cần ưu tiên đặc biệt:</span>
                      <div className="priority-chips">
                        {selectedSosDetail.priorityGroups.map((grp, idx) => (
                          <span key={idx} className="priority-chip-item">
                            {grp}{idx < selectedSosDetail.priorityGroups!.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: Vị trí & Tọa độ GPS */}
                <div className="sos-detail-section">
                  <h4 className="sos-section-title">
                    <MapPin size={16} />
                    <span>Địa điểm & Tọa độ vệ tinh (GPS)</span>
                  </h4>
                  <div className="sos-location-card">
                    <div className="location-row">
                      <MapPin size={16} className="loc-pin-icon" />
                      <div className="loc-text-col">
                        <span className="loc-address">{selectedSosDetail.address}</span>
                        {selectedSosDetail.location?.coordinates && (
                          <span className="loc-coords">
                            Tọa độ GPS: [{selectedSosDetail.location.coordinates[1]?.toFixed(6)}, {selectedSosDetail.location.coordinates[0]?.toFixed(6)}]
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="location-actions">
                      <button
                        type="button"
                        className="btn-open-tactical-map"
                        onClick={() => {
                          setSelectedSosDetail(null);
                          onOpenMap();
                        }}
                      >
                        <Compass size={14} />
                        <span>Xem trên Bản đồ Tác chiến</span>
                      </button>
                      {selectedSosDetail.location?.coordinates && (
                        <a
                          href={`https://www.google.com/maps?q=${selectedSosDetail.location.coordinates[1]},${selectedSosDetail.location.coordinates[0]}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-google-maps"
                        >
                          <ExternalLink size={13} />
                          <span>Google Maps</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 3: Loại tình huống & Diễn biến */}
                <div className="sos-detail-section">
                  <h4 className="sos-section-title">
                    <AlertTriangle size={16} />
                    <span>Tình huống khẩn cấp & Diễn biến</span>
                  </h4>
                  <div className="sos-detail-grid-2">
                    <div className="sos-info-box">
                      <span className="info-label">Loại tình huống</span>
                      <span className="info-value emergency-type-badge">
                        {EMERGENCY_TYPE_LABELS[selectedSosDetail.emergencyType] || selectedSosDetail.emergencyType}
                      </span>
                    </div>
                    <div className="sos-info-box">
                      <span className="info-label">Thời điểm phát tín hiệu SOS</span>
                      <span className="info-value">
                        {new Date(selectedSosDetail.createdAt).toLocaleString('vi-VN')} ({formatTimeAgo(selectedSosDetail.createdAt)})
                      </span>
                    </div>
                  </div>
                  {selectedSosDetail.description && (
                    <div className="sos-description-box">
                      <span className="desc-label">Mô tả / Lời nhắn từ người dân:</span>
                      <p className="desc-content">"{selectedSosDetail.description}"</p>
                    </div>
                  )}
                </div>

                {/* Section 4: Ảnh hiện trường */}
                <div className="sos-detail-section">
                  <h4 className="sos-section-title">
                    <Camera size={16} />
                    <span>Hình ảnh hiện trường do người dân gửi</span>
                  </h4>
                  {((selectedSosDetail.images && selectedSosDetail.images.length > 0) || selectedSosDetail.imageUrl) ? (
                    <div className="sos-photos-gallery">
                      {(selectedSosDetail.images && selectedSosDetail.images.length > 0
                        ? selectedSosDetail.images
                        : [selectedSosDetail.imageUrl!]
                      ).map((imgUrl, i) => (
                        <div
                          key={i}
                          className="photo-thumb-item"
                          onClick={() => setPreviewPhoto(imgUrl)}
                          title="Bấm để phóng to ảnh"
                        >
                          <img src={imgUrl} alt={`Ảnh hiện trường ${i + 1}`} />
                          <div className="photo-thumb-overlay">
                            <Camera size={18} />
                            <span>Xem lớn</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-photos-card">
                      <Camera size={24} className="no-photo-icon" />
                      <span>Người dân không đính kèm hình ảnh cho yêu cầu này</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Quick Action Buttons */}
              <div className="sos-detail-footer">
                <div className="sos-detail-footer-left">
                  <span className="meta-time">
                    Mã hệ thống: <code>{selectedSosDetail._id}</code>
                  </span>
                </div>
                <div className="sos-detail-footer-actions">
                  <button
                    type="button"
                    className="action-btn map large"
                    onClick={() => {
                      setSelectedSosDetail(null);
                      onOpenMap();
                    }}
                  >
                    <Compass size={15} />
                    <span>Điều phối trên Bản đồ</span>
                  </button>

                  <button
                    type="button"
                    className="action-btn secondary large"
                    onClick={() => setSelectedSosDetail(null)}
                  >
                    <span>Đóng</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal tiếp nhận hotline lưu vào MongoDB */}
        {showHotlineModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}>
            <div className="sos-modal-card" style={{
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%'
            }}>
              <h3 className="sos-modal-title" style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PhoneCall size={20} color="#ef4444" />
                <span>Tiếp nhận cuộc gọi Hotline &amp; Lưu trực tiếp vào Database</span>
              </h3>
              <form onSubmit={handleHotlineSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Họ tên người dân:</label>
                  <input
                    type="text"
                    required
                    className="sos-form-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.name}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Số điện thoại:</label>
                  <input
                    type="text"
                    required
                    className="sos-form-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.phone}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, phone: e.target.value })}
                    placeholder="09xx xxx xxx"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Số người cần cứu:</label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="sos-form-input"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                      value={hotlineForm.people}
                      onChange={(e) => setHotlineForm({ ...hotlineForm, people: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Mức độ khẩn cấp:</label>
                    <select
                      className="sos-form-select"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                      value={hotlineForm.priority}
                      onChange={(e) => setHotlineForm({ ...hotlineForm, priority: e.target.value })}
                    >
                      <option value="CRITICAL">🔴 CRITICAL</option>
                      <option value="HIGH">🟠 HIGH</option>
                      <option value="MEDIUM">🟡 MEDIUM</option>
                      <option value="LOW">🟢 LOW</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Khu vực hành chính:</label>
                  <select
                    className="sos-form-select"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.areaId}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, areaId: e.target.value })}
                  >
                    {areas.map((a) => (
                      <option key={a._id} value={a._id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Địa chỉ hiện tại:</label>
                  <input
                    type="text"
                    required
                    className="sos-form-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.address}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, address: e.target.value })}
                    placeholder="Số nhà, đường, khu vực ngập"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="sos-btn-action sos-btn-refresh"
                    style={{ padding: '8px 16px', borderRadius: '6px' }}
                    onClick={() => setShowHotlineModal(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{ padding: '8px 16px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    {loading ? 'Đang lưu vào DB...' : 'Lưu Vào Database'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 2. LOCAL AUTHORITY: ĐIỀU PHỐI & PHÂN CÔNG (UC-L07, UC-L08, UC-L13)
   * ------------------------------------------------------------- */
  if (activeKey === 'coordination') {
    const baseSos = sosList.length > 0 ? sosList : FALLBACK_SOS_LIST;
    const activeMissions = baseSos.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status));

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Radio size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{activeMissions.length} Vụ</span>
              <span className="sos-stat-label">Nhiệm Vụ Đang Điều Phối</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">5 Đội</span>
              <span className="sos-stat-label">Lực Lượng Đang Cơ Động</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><AlertTriangle size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">
                {activeMissions.filter((m) => m.priority === 'CRITICAL').length} Vụ
              </span>
              <span className="sos-stat-label">Mức Độ Cực Kỳ Khẩn Cấp</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Radio size={18} color="#0284c7" />
              <span>Bảng Điều Phối &amp; Giám Sát Tiến Trình Thực Địa ({activeMissions.length} vụ đang xử lý)</span>
            </div>
            <button type="button" className="sos-btn-action primary" onClick={onOpenMap}>
              Mở Bản Đồ Realtime
            </button>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Mã SOS</th>
                  <th>Địa điểm / Hiện trường</th>
                  <th>Mức độ</th>
                  <th>Số người</th>
                  <th>Trạng thái điều phối</th>
                  <th>Hành động kết thúc</th>
                </tr>
              </thead>
              <tbody>
                {activeMissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Hiện chưa có yêu cầu nào trong trạng thái điều phối. Hãy vào tab "Tiếp nhận &amp; Xác minh SOS" để phân công nhiệm vụ mới!
                    </td>
                  </tr>
                ) : (
                  activeMissions.map((sos) => (
                    <tr key={sos._id}>
                      <td><strong>{sos.sosCode}</strong></td>
                      <td>{sos.address}</td>
                      <td><span className={`sos-badge ${sos.priority.toLowerCase()}`}>{sos.priority}</span></td>
                      <td><strong>{sos.people} người</strong></td>
                      <td><span className={`sos-badge ${sos.status.toLowerCase()}`}>{sos.status}</span></td>
                      <td>
                        <button
                          type="button"
                          className="sos-btn-action success"
                          onClick={() => handleCompleteSos(sos._id)}
                        >
                          Xác nhận hoàn thành
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 3. LOCAL AUTHORITY: ĐỘI CỨU HỘ ĐỊA PHƯƠNG (UC-L10)
   * ------------------------------------------------------------- */
  if (activeKey === 'rescuers') {
    const displayRescuers = rescuers.length > 0 ? rescuers : FALLBACK_RESCUERS;
    const availableCount = displayRescuers.filter((r) => r.rescuer?.availabilityStatus === 'AVAILABLE').length;

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{displayRescuers.length} Đội</span>
              <span className="sos-stat-label">Lực Lượng Cứu Hộ Đã Sẵn Sàng</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{availableCount} Đội</span>
              <span className="sos-stat-label">Trực Tuyến Sẵn Sàng Xuất Kích</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Users size={18} color="#38bdf8" />
            <span>Danh Sách Lực Lượng Cứu Hộ &amp; Tình Nguyện Viên Thực Địa ({displayRescuers.length} đơn vị)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên đội / Cán bộ phụ trách</th>
                  <th>Số điện thoại trực ban</th>
                  <th>Kỹ năng chuyên môn</th>
                  <th>Phương tiện trang bị</th>
                  <th>Trạng thái sẵn sàng</th>
                  <th>Chứng nhận</th>
                </tr>
              </thead>
              <tbody>
                {displayRescuers.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td>{r.phone || 'Chưa cập nhật'}</td>
                    <td>{Array.isArray(r.rescuer?.skills) ? r.rescuer.skills.join(', ') : 'Cứu nạn tổng hợp'}</td>
                    <td>{r.rescuer?.vehicleType || 'Ca-nô / Xuồng cứu sinh'}</td>
                    <td>
                      <span className="sos-badge active">
                        {r.rescuer?.availabilityStatus || 'SẴN SÀNG'}
                      </span>
                    </td>
                    <td>
                      <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                        {r.rescuer?.verificationStatus === 'VERIFIED' ? 'ĐÃ PHÊ DUYỆT' : 'CHỜ DUYỆT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 4. LOCAL AUTHORITY: NGUỒN LỰC & PHƯƠNG TIỆN (UC-L11)
   * ------------------------------------------------------------- */
  if (activeKey === 'resources') {
    const displayVehicles = vehicles.length > 0 ? vehicles : FALLBACK_VEHICLES;
    const totalSuppliesAvailable = FALLBACK_SUPPLIES.reduce((acc, s) => acc + s.available, 0);
    const totalSuppliesDeployed = FALLBACK_SUPPLIES.reduce((acc, s) => acc + s.deployed, 0);

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{displayVehicles.length} Phương Tiện</span>
              <span className="sos-stat-label">Phương Tiện Sẵn Sàng Tác Chiến</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Package size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSuppliesAvailable.toLocaleString()} Đơn Vị</span>
              <span className="sos-stat-label">Vật Tư Cứu Sinh Sẵn Sàng Cấp Phát</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Boxes size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSuppliesDeployed.toLocaleString()} Đơn Vị</span>
              <span className="sos-stat-label">Đang Tiếp Tế Tại Vùng Lũ</span>
            </div>
          </div>
        </div>

        {/* Tab chuyển đổi giữa Phương tiện cơ động và Kho vật tư cứu trợ */}
        <div className="sos-view-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setResourceTab('VEHICLES')}
                className={`sos-btn-filter-pill ${resourceTab === 'VEHICLES' ? 'active blue' : ''}`}
                style={{ fontSize: '13px', padding: '8px 16px' }}
              >
                <Truck size={15} style={{ marginRight: 6 }} />
                Phương Tiện Cơ Động &amp; Cano ({displayVehicles.length})
              </button>
              <button
                type="button"
                onClick={() => setResourceTab('SUPPLIES')}
                className={`sos-btn-filter-pill ${resourceTab === 'SUPPLIES' ? 'active green' : ''}`}
                style={{ fontSize: '13px', padding: '8px 16px' }}
              >
                <Package size={15} style={{ marginRight: 6 }} />
                Kho Vật Tư &amp; Thiết Bị Cứu Nạn ({FALLBACK_SUPPLIES.length} danh mục)
              </button>
            </div>
            <button type="button" className="sos-btn-action sos-btn-refresh" onClick={refreshData}>
              <RefreshCw size={14} /> Làm mới
            </button>
          </div>

          {resourceTab === 'VEHICLES' ? (
            <div className="sos-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th>Biển số / Định danh</th>
                    <th>Loại phương tiện</th>
                    <th>Sức chở tối đa</th>
                    <th>Mô tả trang bị chuyên dụng</th>
                    <th>Tình trạng hoạt động</th>
                  </tr>
                </thead>
                <tbody>
                  {displayVehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.plateNumber}</strong></td>
                      <td>
                        <span className="sos-badge active">
                          {v.type === 'BOAT' ? 'Ca-nô / Xuồng cứu nạn' : v.type === 'AMBULANCE' ? 'Xe cấp cứu dã chiến' : v.type === 'TRUCK' ? 'Xe tải lội nước 4x4' : v.type}
                        </span>
                      </td>
                      <td><strong>{v.capacity} người</strong></td>
                      <td>{v.description || 'Phương tiện cứu hộ chuyên dụng'}</td>
                      <td><span className="sos-badge active">{v.status === 'AVAILABLE' ? 'SẴN SÀNG' : v.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sos-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th>Tên vật tư / Trang thiết bị</th>
                    <th>Phân loại</th>
                    <th>Sẵn sàng trong kho</th>
                    <th>Đang cấp phát</th>
                    <th>Tổng cơ số</th>
                    <th>Mức dự trữ an toàn</th>
                    <th>Vị trí kho lưu trữ</th>
                  </tr>
                </thead>
                <tbody>
                  {FALLBACK_SUPPLIES.map((sup) => {
                    const pct = Math.round((sup.available / sup.total) * 100);
                    return (
                      <tr key={sup.id}>
                        <td><strong>{sup.name}</strong></td>
                        <td>
                          <span className="sos-badge active">
                            {sup.category === 'LIFE_SAVING' ? 'Cứu sinh vượt lũ' : sup.category === 'MEDICAL' ? 'Y tế & Cấp cứu' : sup.category === 'FOOD_WATER' ? 'Lương thực & Nước' : 'Thiết bị kỹ thuật'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#059669', fontSize: '14px' }}>
                            {sup.available.toLocaleString()} {sup.unit}
                          </strong>
                        </td>
                        <td>{sup.deployed.toLocaleString()} {sup.unit}</td>
                        <td><strong>{sup.total.toLocaleString()} {sup.unit}</strong></td>
                        <td style={{ minWidth: '130px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <span>Tồn kho: {pct}%</span>
                            <span style={{ color: pct < 50 ? '#ef4444' : '#059669' }}>
                              {pct >= 50 ? 'Dồi dào' : 'Cần bổ sung'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct < 50 ? '#ef4444' : '#10b981' }} />
                          </div>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12px' }}>{sup.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 5. LOCAL AUTHORITY: PHÁT CẢNH BÁO CHO NGƯỜI DÂN ĐỊA PHƯƠNG (UC-L12)
   * ------------------------------------------------------------- */
  /* -------------------------------------------------------------
   * 5. LOCAL AUTHORITY: PHÁT CẢNH BÁO CHO NGƯỜI DÂN ĐỊA PHƯƠNG (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'alerts') {
    const displayAlerts = alerts.length > 0 ? alerts : FALLBACK_ALERTS;
    const currentArea = areas.find((a) => a._id === alertForm.areaId || a._id === user?.authority?.areaId) || areas[0];

    const quickTemplates = [
      {
        title: '🌊 Cảnh báo ngập lụt dâng cao',
        type: 'FLOOD',
        severity: 'CRITICAL',
        headline: `Cảnh báo ngập lụt khẩn cấp lưu vực ${currentArea?.name || 'địa phương'}`,
        content: `Mực nước dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường.`,
      },
      {
        title: '⚡ Cảnh báo bão & gió giật mạnh',
        type: 'STORM',
        severity: 'HIGH',
        headline: `Cảnh báo bão đổ bộ sức gió cấp 9-10 tại ${currentArea?.name || 'địa phương'}`,
        content: `Gió giật mạnh nguy hiểm. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện.`,
      },
      {
        title: '⛰️ Báo động sạt lở ven sông / taluy',
        type: 'LANDSLIDE',
        severity: 'HIGH',
        headline: `Cảnh báo sạt lở nguy hiểm ven sông và triền dốc tại ${currentArea?.name || 'địa bàn'}`,
        content: `Xuất hiện dấu hiệu nứt trượt bờ sông và taluy dốc. Yêu cầu các hộ dân nằm trong bán kính 100m khẩn cấp sơ tán ngay đến nhà văn hóa hoặc trường học an toàn đã bố trí.`,
      },
      {
        title: '📢 Hiệu lệnh sơ tán dân khẩn cấp',
        type: 'EVACUATION',
        severity: 'CRITICAL',
        headline: `Lệnh sơ tán khẩn cấp toàn bộ cư dân khu vực nguy hiểm ${currentArea?.name || ''}`,
        content: `Mức nước vượt ngưỡng báo động khẩn. Lực lượng cứu hộ địa phương đang bố trí ca-nô và xe đặc chủng tại đầu đường chính để đón người dân đến Trạm sơ tán. Gọi Hotline SOS nếu cần hỗ trợ đặc biệt.`,
      },
    ];

    return (
      <div className="sos-views-container">
        {/* Form Phát cảnh báo */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#ef4444" />
              <span>Soạn &amp; Phát Cảnh Báo Khẩn Cấp Cho Người Dân</span>
            </div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Truyền phát đồng thời qua Ứng Dụng Cứu Nạn, Tin Nhắn SMS &amp; Hệ Thống Loa Truyền Thanh
            </span>
          </div>

          {/* Mẫu cảnh báo nhanh một chạm */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Mẫu cảnh báo địa phương soạn sẵn (Nhấp để điền nhanh):
            </div>
            <div className="sos-quick-broadcast-grid">
              {quickTemplates.map((t, idx) => (
                <button
                  type="button"
                  key={idx}
                  className="sos-quick-template-btn"
                  onClick={() => {
                    setAlertForm({
                      ...alertForm,
                      title: t.headline,
                      content: t.content,
                      type: t.type,
                      severity: t.severity as any,
                      areaId: alertForm.areaId || user?.authority?.areaId || (areas[0]?._id as string),
                    });
                  }}
                >
                  <span className="sos-quick-template-title">{t.title}</span>
                  <span className="sos-quick-template-snippet">{t.content}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tiêu đề cảnh báo:</label>
                <input
                  type="text"
                  required
                  value={alertForm.title}
                  onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                  placeholder="VD: Cảnh báo nước sông dâng cao vượt báo động 3"
                  className="sos-form-input"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Địa bàn người dân tiếp nhận cảnh báo:</label>
                <select
                  value={alertForm.areaId}
                  onChange={(e) => setAlertForm({ ...alertForm, areaId: e.target.value })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  {areas.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.code}) {user?.authority?.areaId === a._id ? '★ Địa bàn quản lý' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Loại thiên tai / tình huống:</label>
                <select
                  value={alertForm.type}
                  onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  <option value="FLOOD">LŨ LỤT &amp; NGẬP ÚNG</option>
                  <option value="STORM">BÃO LỚN &amp; LỐC XOÁY</option>
                  <option value="LANDSLIDE">SẠT LỞ ĐẤT ĐÁ</option>
                  <option value="EVACUATION">HIỆU LỆNH SƠ TÁN</option>
                  <option value="GENERAL">CẢNH BÁO CHUNG</option>
                </select>
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Mức độ nghiêm trọng:</label>
                <select
                  value={alertForm.severity}
                  onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  <option value="CRITICAL">NGUY CẤP (Báo động đỏ - Còi hú &amp; Khẩn cấp)</option>
                  <option value="HIGH">CAO (Cảnh báo cam - Nguy hiểm cao)</option>
                  <option value="MEDIUM">TRUNG BÌNH (Cảnh báo vàng)</option>
                  <option value="LOW">THÔNG BÁO (Hướng dẫn phòng ngừa)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nội dung cảnh báo &amp; hướng dẫn hành động cho người dân:</label>
              <textarea
                rows={3}
                required
                value={alertForm.content}
                onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                placeholder="Nhập thông tin hướng dẫn sơ tán, địa điểm trạm trú ẩn, số hotline liên hệ khẩn cấp..."
                className="sos-form-textarea"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>

            <div>
              <button type="submit" disabled={loading} className="sos-hotline-btn">
                <Send size={15} />
                <span>{loading ? 'Đang phát cảnh báo...' : '📢 Phát Cảnh Báo Khẩn Cấp Cho Người Dân'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách cảnh báo đang phát sóng */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#0284c7" />
              <span>Cảnh Báo Đang Hoạt Động Trên Địa Bàn ({displayAlerts.length} bản tin)</span>
            </div>
            <button type="button" onClick={refreshData} className="sos-btn-refresh">
              <RefreshCw size={14} />
              <span>Làm mới</span>
            </button>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tiêu đề cảnh báo</th>
                  <th>Loại</th>
                  <th>Mức độ</th>
                  <th>Địa bàn áp dụng</th>
                  <th>Nội dung hướng dẫn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {displayAlerts.map((al) => {
                  const areaName = typeof al.areaId === 'object' && al.areaId !== null ? al.areaId.name : 'Địa bàn toàn quận';
                  return (
                    <tr key={al._id}>
                      <td><strong>{al.title}</strong></td>
                      <td>{al.type}</td>
                      <td><span className={`sos-badge ${al.severity?.toLowerCase()}`}>{al.severity}</span></td>
                      <td><span className="sos-badge verified">{areaName}</span></td>
                      <td style={{ maxWidth: '320px' }}>{al.content}</td>
                      <td><span className="sos-badge active">{al.isActive ? 'ĐANG PHÁT TỚI DÂN' : 'HẾT HẠN'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 5b. LOCAL AUTHORITY: ĐIỂM TRÚ ẨN & TRẠM AN TOÀN (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'shelters') {
    const displayShelters = shelters.length > 0 ? shelters : FALLBACK_SHELTERS;
    const totalCapacity = displayShelters.reduce((acc, curr) => acc + (curr.capacity || 0), 0);
    const totalOccupancy = displayShelters.reduce((acc, curr) => acc + (curr.currentOccupancy || 0), 0);
    const availableSlots = Math.max(0, totalCapacity - totalOccupancy);

    const typeLabels: Record<string, string> = {
      EVACUATION_CENTER: 'Trung tâm sơ tán tập trung',
      HOSPITAL: 'Trạm Y tế Dã chiến',
      SHELTER: 'Điểm tránh trú bão lũ',
      RESCUE_STATION: 'Trạm cứu hộ tác chiến',
      MEETING_POINT: 'Điểm tập kết an toàn',
    };

    return (
      <div className="sos-views-container">
        {/* KPI Thống kê sức chứa trú ẩn an toàn */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Shield size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{displayShelters.length} Điểm</span>
              <span className="sos-stat-label">Tổng Điểm Trú Ẩn &amp; Trạm An Toàn</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCapacity.toLocaleString()} Chỗ</span>
              <span className="sos-stat-label">Tổng Sức Chứa Tiếp Nhận Tối Đa</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Home size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalOccupancy.toLocaleString()} Người</span>
              <span className="sos-stat-label">Người Dân Đang Tạm Trú An Toàn</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{availableSlots.toLocaleString()} Chỗ</span>
              <span className="sos-stat-label">Sức Chứa Còn Khả Dụng Tiếp Nhận</span>
            </div>
          </div>
        </div>

        {/* Danh sách các Điểm Trú Ẩn */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Shield size={18} color="#22c55e" />
              <span>Danh Sách Điểm Trú Ẩn &amp; Trạm Y Tế An Toàn Địa Phương ({displayShelters.length} cơ sở)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowShelterModal(true)}
                className="sos-hotline-btn"
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                <Plus size={15} />
                <span>Thêm Điểm Trú Ẩn Mới</span>
              </button>
              <button type="button" onClick={refreshData} className="sos-btn-refresh">
                <RefreshCw size={14} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên cơ sở an toàn</th>
                  <th>Phân loại</th>
                  <th>Địa chỉ cụ thể</th>
                  <th>Sức chứa &amp; Tỷ lệ lưu trú</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {displayShelters.map((sh) => {
                  const capacity = sh.capacity || 1;
                  const occupancy = sh.currentOccupancy || 0;
                  const percent = Math.min(100, Math.round((occupancy / capacity) * 100));
                  const barColor = percent >= 90 ? 'full' : percent >= 60 ? 'warning' : 'safe';

                  return (
                    <tr key={sh._id}>
                      <td>
                        <strong>{sh.name}</strong>
                        {sh.location?.coordinates && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <MapPin size={11} />
                            <span>{sh.location.coordinates[1].toFixed(4)}, {sh.location.coordinates[0].toFixed(4)}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="sos-badge verified">
                          {typeLabels[sh.type] || sh.type}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>{sh.address}</td>
                      <td>
                        <div className="sos-occupancy-cell">
                          <div className="sos-occupancy-meta">
                            <span>{occupancy} / {capacity} người</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="sos-occupancy-bar-bg">
                            <div
                              className={`sos-occupancy-bar-fill ${barColor}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`sos-badge ${percent >= 100 ? 'critical' : 'active'}`}>
                          {percent >= 100 ? 'ĐÃ ĐẦY' : sh.status === 'ACTIVE' ? 'SẴN SÀNG TIẾP NHẬN' : sh.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={onOpenMap}
                          className="sos-btn-action view"
                          title="Định vị điểm trú ẩn này trên Bản đồ tác chiến"
                        >
                          <MapPin size={13} />
                          <span>Bản đồ</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Thêm Điểm Trú Ẩn Mới */}
        {showShelterModal && (
          <div className="sos-modal-overlay">
            <div className="sos-modal-card" style={{ maxWidth: '560px' }}>
              <div className="sos-modal-header">
                <div className="sos-modal-title">
                  <Shield size={20} color="#22c55e" />
                  <span>Thêm Điểm Trú Ẩn / Trạm An Toàn Mới</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowShelterModal(false)}
                  className="sos-modal-close"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateShelterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tên điểm sơ tán / trạm an toàn:</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.name}
                    onChange={(e) => setShelterForm({ ...shelterForm, name: e.target.value })}
                    placeholder="VD: Trường Tiểu học Lê Quý Đôn - Điểm Tránh Trú"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Loại cơ sở:</label>
                    <select
                      value={shelterForm.type}
                      onChange={(e) => setShelterForm({ ...shelterForm, type: e.target.value as any })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="EVACUATION_CENTER">Trung tâm sơ tán tập trung</option>
                      <option value="HOSPITAL">Trạm Y tế dã chiến</option>
                      <option value="SHELTER">Điểm trú ẩn kiên cố</option>
                      <option value="RESCUE_STATION">Trạm chỉ huy cứu hộ</option>
                      <option value="MEETING_POINT">Điểm hẹn tập kết</option>
                    </select>
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Khu vực hành chính:</label>
                    <select
                      value={shelterForm.areaId}
                      onChange={(e) => setShelterForm({ ...shelterForm, areaId: e.target.value })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      {areas.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Địa chỉ cụ thể:</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.address}
                    onChange={(e) => setShelterForm({ ...shelterForm, address: e.target.value })}
                    placeholder="VD: Số 45 đường Nguyễn Du, Phường Hòa Cường"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Sức chứa tối đa (người):</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={shelterForm.capacity}
                      onChange={(e) => setShelterForm({ ...shelterForm, capacity: parseInt(e.target.value, 10) || 50 })}
                      className="sos-form-input"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Đang lưu trú hiện tại:</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={shelterForm.currentOccupancy}
                      onChange={(e) => setShelterForm({ ...shelterForm, currentOccupancy: parseInt(e.target.value, 10) || 0 })}
                      className="sos-form-input"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tọa độ GPS (Kinh độ, Vĩ độ):</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.coordinates}
                    onChange={(e) => setShelterForm({ ...shelterForm, coordinates: e.target.value })}
                    placeholder="VD: 108.2540, 15.9720"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowShelterModal(false)}
                    className="sos-btn-refresh"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="sos-hotline-btn"
                  >
                    <Send size={15} />
                    <span>{loading ? 'Đang lưu...' : 'Lưu & Kích Hoạt Điểm Trú Ẩn'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 6. LOCAL AUTHORITY: DUYỆT ĐIỂM NGUY HIỂM (UC-L15)
   * ------------------------------------------------------------- */
  if (activeKey === 'hazard_reports') {
    domainDService.syncFromStoredAuthUser();
    const authUserStr = localStorage.getItem('sos_auth_user');
    const authUser = authUserStr ? JSON.parse(authUserStr) : null;
    const activeOfficer = domainDService.getActiveOfficer();
    const isAdmin = authUser?.roles?.includes('ADMIN') || activeOfficer?.role === 'ADMIN';

    // Cấu hình địa bàn quản lý hiện tại
    const currentCfg = JURISDICTION_CONFIGS[currentJurisdictionKey] || JURISDICTION_CONFIGS.ngu_hanh_son;

    // Hàm kiểm tra điểm nguy hiểm có thuộc địa bàn quản lý của cán bộ hay không
    const isHazardInOfficerJurisdiction = (r: HazardReportItem): boolean => {
      if (isAdmin) return true;
      if (currentJurisdictionKey === 'toan_thanh_pho') return true;
      const cfg = currentCfg;

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
              ([k]) => k !== currentJurisdictionKey && k !== 'toan_thanh_pho'
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

    const myJurisdictionCount = hazardReports.filter((r) => isHazardInOfficerJurisdiction(r)).length;

    // Tính toán số lượng theo phạm vi lọc thực tế của cán bộ
    const scopedHazardReports = !isAdmin && hazardScopeFilter === 'MY_JURISDICTION'
      ? hazardReports.filter((r) => isHazardInOfficerJurisdiction(r))
      : hazardReports;

    const displayHazardCounts = !isAdmin && hazardScopeFilter === 'MY_JURISDICTION'
      ? {
          TOTAL: scopedHazardReports.length,
          PENDING: scopedHazardReports.filter((r) => r.status === 'PENDING').length,
          APPROVED: scopedHazardReports.filter((r) => r.status === 'APPROVED').length,
          REJECTED: scopedHazardReports.filter((r) => r.status === 'REJECTED').length,
        }
      : hazardCounts;

    const filteredReports = hazardReports.filter((r) => {
      if (hazardFilter !== 'ALL' && r.status !== hazardFilter) return false;
      if (!isAdmin && hazardScopeFilter === 'MY_JURISDICTION') {
        return isHazardInOfficerJurisdiction(r);
      }
      return true;
    });

    const getHazardTypeConfig = (type: string, custom?: string) => {
      switch (type) {
        case 'FLOOD':
          return {
            label: 'Ngập lụt sâu',
            bg: '#eff6ff',
            color: '#1d4ed8',
            border: '#bfdbfe',
            badgeBg: '#0284c7',
            bsIcon: 'bi-water',
          };
        case 'LANDSLIDE':
          return {
            label: 'Sạt lở đất đá',
            bg: '#fef3c7',
            color: '#92400e',
            border: '#fde68a',
            badgeBg: '#b45309',
            bsIcon: 'bi-cone-striped',
          };
        case 'FALLEN_TREE':
          return {
            label: 'Cây đổ / Chướng ngại',
            bg: '#f0fdf4',
            color: '#166534',
            border: '#bbf7d0',
            badgeBg: '#16a34a',
            bsIcon: 'bi-tree-fill',
          };
        case 'ELECTRICAL':
          return {
            label: 'Sự cố điện hạ thế',
            bg: '#fffbeb',
            color: '#b45309',
            border: '#fde68a',
            badgeBg: '#ca8a04',
            bsIcon: 'bi-lightning-charge-fill',
          };
        case 'ROAD_DAMAGE':
          return {
            label: 'Sập / Hỏng đường cống',
            bg: '#fff7ed',
            color: '#c2410c',
            border: '#fed7aa',
            badgeBg: '#ea580c',
            bsIcon: 'bi-sign-stop-fill',
          };
        default:
          return {
            label: custom ? `Khác: ${custom}` : 'Nguy hiểm khác',
            bg: '#fef2f2',
            color: '#b91c1c',
            border: '#fecaca',
            badgeBg: '#dc2626',
            bsIcon: 'bi-exclamation-triangle-fill',
          };
      }
    };

    const getSeverityBadge = (severity: string) => {
      switch (severity) {
        case 'CRITICAL':
          return { label: 'CỰC KỲ NGUY HIỂM', bg: '#fee2e2', color: '#991b1b', border: '#f87171' };
        case 'HIGH':
          return { label: 'MỨC ĐỘ CAO', bg: '#ffedd5', color: '#9a3412', border: '#fb923c' };
        case 'MEDIUM':
          return { label: 'TRUNG BÌNH', bg: '#fef9c3', color: '#854d0e', border: '#facc15' };
        default:
          return { label: 'MỨC THẤP', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
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

    // Mở Form thẩm định & chuẩn hóa thông tin điểm nguy hiểm (Chỉ khi trong địa bàn quản lý)
    const handleOpenReviewModal = (hazard: HazardReportItem) => {
      if (!isAdmin && !isHazardInOfficerJurisdiction(hazard)) {
        alert(
          `Bạn không có quyền thẩm định điểm nguy hiểm này!\n\nĐiểm nguy hiểm này nằm ngoài phạm vi khu vực quản lý của bạn (${activeOfficer?.jurisdictionAreaName || 'Địa bàn phụ trách'}).`
        );
        return;
      }
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
        setEditLng(106.7009);
        setEditLat(10.7769);
      }
      setEditDescription(hazard.description || '');
      setEditReviewNote(
        hazard.reviewNote ||
          (hazard.status === 'APPROVED'
            ? 'Đã thẩm định thông tin và phê duyệt đưa lên bản đồ'
            : 'Đã xác minh và chuẩn hóa thông tin cảnh báo')
      );
    };

    // Gửi dữ liệu thẩm định & chuẩn hóa lên server
    const handleSubmitReview = async (status: 'APPROVED' | 'REJECTED') => {
      if (!reviewingHazard) return;

      if (!isAdmin && !isHazardInOfficerJurisdiction(reviewingHazard)) {
        alert(
          `Bạn không có quyền phê duyệt điểm nguy hiểm này!\n\nĐiểm nguy hiểm này nằm ngoài phạm vi địa bàn quản lý của bạn (${activeOfficer?.jurisdictionAreaName || 'Địa bàn phụ trách'}).`
        );
        return;
      }

      if (status === 'APPROVED') {
        if (!editTitle.trim()) {
          alert('Vui lòng nhập tiêu đề điểm nguy hiểm chuẩn xác!');
          return;
        }
        if (!editAddress.trim()) {
          alert('Vui lòng nhập địa chỉ hiện trường chuẩn xác!');
          return;
        }
      }

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
          editReviewNote.trim() ||
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
        }
      } catch (err: any) {
        alert(err.message || 'Lỗi khi cập nhật thẩm định điểm nguy hiểm');
      } finally {
        setSubmittingReview(false);
      }
    };

    const handleQuickReview = async (id: string, status: 'APPROVED' | 'REJECTED', defaultNote?: string) => {
      const target = hazardReports.find((r) => r._id === id);
      if (target && !isAdmin && !isHazardInOfficerJurisdiction(target)) {
        alert(
          `Bạn không có quyền duyệt điểm nguy hiểm này!\n\nĐiểm nguy hiểm này nằm ngoài phạm vi khu vực quản lý của bạn (${activeOfficer?.jurisdictionAreaName || 'Địa bàn phụ trách'}).`
        );
        return;
      }

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
        }
      } catch (err: any) {
        alert(err.message || 'Lỗi khi cập nhật trạng thái duyệt');
      } finally {
        setLoading(false);
      }
    };

    const handleDeleteHazard = async (id: string, title?: string) => {
      const target = hazardReports.find((r) => r._id === id);
      if (target && !isAdmin && !isHazardInOfficerJurisdiction(target)) {
        alert(
          `Bạn không có quyền xóa điểm nguy hiểm này!\n\nĐiểm nguy hiểm này nằm ngoài phạm vi khu vực quản lý của bạn (${activeOfficer?.jurisdictionAreaName || 'Địa bàn phụ trách'}).`
        );
        return;
      }

      const confirmed = window.confirm(
        `Bạn có chắc chắn muốn xóa điểm nguy hiểm "${title || 'này'}" không?\n\nĐiểm nguy hiểm này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu và bản đồ tác chiến.`
      );
      if (!confirmed) return;

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
        }
      } catch (err: any) {
        alert(err.message || 'Lỗi khi xóa điểm nguy hiểm');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="sos-views-container" style={{ width: '100%' }}>
        {/* THỐNG KÊ TỔNG QUAN ĐIỂM NGUY HIỂM */}
        <div className="sos-stats-grid" style={{ width: '100%' }}>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow">
              <AlertTriangle size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value" style={{ color: '#0f172a' }}>{displayHazardCounts.PENDING}</span>
              <span className="sos-stat-label" style={{ color: '#475569', fontWeight: 600 }}>Chờ duyệt (PENDING)</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon green">
              <CheckCircle2 size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value" style={{ color: '#0f172a' }}>{displayHazardCounts.APPROVED}</span>
              <span className="sos-stat-label" style={{ color: '#475569', fontWeight: 600 }}>Đã duyệt (Lên bản đồ)</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon red">
              <XCircle size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value" style={{ color: '#0f172a' }}>{displayHazardCounts.REJECTED}</span>
              <span className="sos-stat-label" style={{ color: '#475569', fontWeight: 600 }}>Từ chối (REJECTED)</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon blue">
              <Shield size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value" style={{ color: '#0f172a' }}>{displayHazardCounts.TOTAL}</span>
              <span className="sos-stat-label" style={{ color: '#475569', fontWeight: 600 }}>
                {!isAdmin && hazardScopeFilter === 'MY_JURISDICTION' ? 'Tin báo địa bàn' : 'Tổng tin báo'}
              </span>
            </div>
          </div>
        </div>

        {/* BẢNG QUẢN LÝ & DUYỆT ĐIỂM NGUY HIỂM */}
        <div className="sos-view-card" style={{ width: '100%', boxSizing: 'border-box' }}>
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <AlertTriangle size={20} color="#f59e0b" />
              <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '16px' }}>
                Thẩm Định &amp; Duyệt Điểm Nguy Hiểm Đóng Góp Từ App (UC-L15)
              </span>
            </div>

            <button type="button" className="sos-btn-action primary" onClick={onOpenMap} style={{ padding: '8px 14px' }}>
              <MapPin size={15} />
              <span>Mở Bản Đồ Tác Chiến</span>
            </button>
          </div>

          {/* BỘ LỌC ĐỊA BÀN PHÂN CÔNG QUẢN LÝ (ROLE LOCAL_AUTHORITY) */}
          {!isAdmin && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 18px',
                margin: '12px 16px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '17px',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <i className="bi bi-geo-alt-fill"></i>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      Địa bàn phụ trách:
                    </span>
                    <select
                      value={currentJurisdictionKey}
                      onChange={(e) => handleJurisdictionChange(e.target.value)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #2563eb',
                        background: '#ffffff',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: '0 1px 3px rgba(37,99,235,0.1)',
                      }}
                      title="Chọn địa bàn phân công quản lý để thẩm định & duyệt"
                    >
                      <option value="ngu_hanh_son">🛡️ Quận Ngũ Hành Sơn (P. Ngũ Hành Sơn, Khuê Mỹ, Mỹ An...)</option>
                      <option value="hai_chau">🛡️ Quận Hải Châu (P. Hải Châu, Hòa Cường, Thuận Phước...)</option>
                      <option value="son_tra">🛡️ Quận Sơn Trà (P. Sơn Trà, An Hải, Phước Mỹ...)</option>
                      <option value="thanh_khe">🛡️ Quận Thanh Khê (P. Thanh Khê, An Khê...)</option>
                      <option value="cam_le">🛡️ Quận Cẩm Lệ (P. Cẩm Lệ, Hòa Xuân...)</option>
                      <option value="lien_chieu">🛡️ Quận Liên Chiểu (P. Liên Chiểu, Hòa Khánh, Hải Vân...)</option>
                      <option value="hoa_vang">🛡️ Huyện Hòa Vang (Xã Hòa Vang, Bà Nà, Hòa Tiến...)</option>
                      <option value="hoang_sa">🛡️ Huyện Hoàng Sa</option>
                      <option value="toan_thanh_pho">🌐 Toàn TP Đà Nẵng (Cán bộ Chỉ huy Tác chiến Toàn TP)</option>
                    </select>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                    Cán bộ cấp địa phương chỉ được duyệt, chỉnh sửa hoặc xóa các điểm nguy hiểm nằm trong địa bàn phân công.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setHazardScopeFilter('MY_JURISDICTION')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: hazardScopeFilter === 'MY_JURISDICTION' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: hazardScopeFilter === 'MY_JURISDICTION' ? '#eff6ff' : '#ffffff',
                    color: hazardScopeFilter === 'MY_JURISDICTION' ? '#1d4ed8' : '#475569',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <i className="bi bi-shield-check"></i>
                  <span>Địa bàn của tôi ({myJurisdictionCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHazardScopeFilter('ALL')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: hazardScopeFilter === 'ALL' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: hazardScopeFilter === 'ALL' ? '#eff6ff' : '#ffffff',
                    color: hazardScopeFilter === 'ALL' ? '#1d4ed8' : '#475569',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <i className="bi bi-globe2"></i>
                  <span>Toàn thành phố ({hazardReports.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* THANH TAB LỌC TRẠNG THÁI */}
          <div className="sos-filter-tabs">
            <button
              type="button"
              className={`sos-filter-tab ${hazardFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setHazardFilter('ALL')}
            >
              <i className="bi bi-grid-fill" style={{ marginRight: '5px' }}></i> Tất cả ({displayHazardCounts.TOTAL})
            </button>
            <button
              type="button"
              className={`sos-filter-tab ${hazardFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setHazardFilter('PENDING')}
              style={displayHazardCounts.PENDING > 0 ? { borderColor: '#f59e0b', color: '#b45309', fontWeight: 700 } : {}}
            >
              <i className="bi bi-hourglass-split" style={{ color: '#d97706', marginRight: '5px' }}></i> Chờ duyệt ({displayHazardCounts.PENDING})
            </button>
            <button
              type="button"
              className={`sos-filter-tab ${hazardFilter === 'APPROVED' ? 'active' : ''}`}
              onClick={() => setHazardFilter('APPROVED')}
            >
              <i className="bi bi-check-circle-fill" style={{ color: '#16a34a', marginRight: '5px' }}></i> Đã phê duyệt ({displayHazardCounts.APPROVED})
            </button>
            <button
              type="button"
              className={`sos-filter-tab ${hazardFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => setHazardFilter('REJECTED')}
            >
              <i className="bi bi-x-circle-fill" style={{ color: '#dc2626', marginRight: '5px' }}></i> Từ chối ({displayHazardCounts.REJECTED})
            </button>
          </div>

          {/* DANH SÁCH BẢNG FULL WIDTH */}
          <div className="sos-table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
            <table className="sos-table" style={{ width: '100%', minWidth: '950px' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%', color: '#0f172a', fontWeight: 700 }}>Điểm nguy hiểm / Loại</th>
                  <th style={{ width: '16%', color: '#0f172a', fontWeight: 700 }}>Người đóng góp &amp; Thời gian</th>
                  <th style={{ width: '10%', color: '#0f172a', fontWeight: 700 }}>Mức độ</th>
                  <th style={{ width: '20%', color: '#0f172a', fontWeight: 700 }}>Địa chỉ &amp; Tọa độ GPS</th>
                  <th style={{ width: '18%', color: '#0f172a', fontWeight: 700 }}>Mô tả hiện trường</th>
                  <th style={{ width: '9%', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>Trạng thái</th>
                  <th style={{ width: '15%', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }}>
                      Không có điểm nguy hiểm nào trong danh mục này.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => {
                    const reporterName = typeof r.reportedBy === 'object' ? r.reportedBy?.fullName : 'Người dân';
                    const reporterPhone = typeof r.reportedBy === 'object' ? r.reportedBy?.phone : '';
                    const isRescuer = r.reporterRole === 'RESCUER';
                    const typeCfg = getHazardTypeConfig(r.hazardType, r.customHazardType);
                    const sevBadge = getSeverityBadge(r.severity);
                    const inJurisdiction = isAdmin || isHazardInOfficerJurisdiction(r);

                    return (
                      <tr key={r._id}>
                        {/* 1. Điểm nguy hiểm & Loại hiểm họa (Icon Bootstrap) */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                backgroundColor: typeCfg.badgeBg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '17px',
                                flexShrink: 0,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                              }}
                              title={typeCfg.label}
                            >
                              <i className={`bi ${typeCfg.bsIcon}`}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px', marginBottom: 3, lineHeight: '1.4' }}>
                                {r.title}
                              </div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  backgroundColor: typeCfg.bg,
                                  color: typeCfg.color,
                                  border: `1px solid ${typeCfg.border}`,
                                }}
                              >
                                <i className={`bi ${typeCfg.bsIcon}`} style={{ fontSize: '11px' }}></i>
                                {typeCfg.label}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Người đóng góp & Thời gian */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{reporterName}</div>
                          {reporterPhone ? (
                            <div style={{ fontSize: '11.5px', color: '#475569', marginTop: 1 }}>
                              <i className="bi bi-telephone-fill" style={{ fontSize: '10.5px', marginRight: 4 }}></i>
                              {reporterPhone}
                            </div>
                          ) : null}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                            <span className={`sos-role-tag ${isRescuer ? 'rescuer' : 'citizen'}`} style={{ fontSize: '10.5px' }}>
                              {isRescuer ? (
                                <>
                                  <i className="bi bi-life-preserver" style={{ marginRight: 4 }}></i>
                                  Cứu hộ viên
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-person-fill" style={{ marginRight: 4 }}></i>
                                  Người dân
                                </>
                              )}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: 3 }}>
                            <i className="bi bi-clock" style={{ fontSize: '10.5px', marginRight: 4 }}></i>
                            {formatHazardTime(r.createdAt)}
                          </div>
                        </td>

                        {/* 3. Mức độ nghiêm trọng */}
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
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

                        {/* 4. Địa chỉ & Tọa độ GPS */}
                        <td>
                          <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600, lineHeight: '1.4' }}>
                            <i className="bi bi-geo-alt-fill" style={{ color: '#dc2626', marginRight: 4, fontSize: '12px' }}></i>
                            {r.address}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600, marginTop: 3 }}>
                            <i className="bi bi-pin-map-fill" style={{ fontSize: '11px', marginRight: 4 }}></i>
                            GPS: [{r.location.coordinates[1].toFixed(4)}, {r.location.coordinates[0].toFixed(4)}]
                          </div>
                          {!isAdmin && (
                            <div style={{ marginTop: 5 }}>
                              {inJurisdiction ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 600,
                                    background: '#ecfdf5',
                                    color: '#047857',
                                    border: '1px solid #a7f3d0',
                                  }}
                                  title="Điểm nguy hiểm nằm trong địa bàn phân công quản lý"
                                >
                                  <i className="bi bi-shield-check"></i>
                                  Thuộc địa bàn
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 600,
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    border: '1px solid #e2e8f0',
                                  }}
                                  title="Điểm nguy hiểm ngoài phạm vi phụ trách - Chỉ có quyền xem"
                                >
                                  <i className="bi bi-shield-lock"></i>
                                  Ngoài địa bàn (Chỉ xem)
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Mô tả hiện trường & Thumbnail ảnh */}
                        <td>
                          <div style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: '1.4', marginBottom: 4 }}>
                            {r.description || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có mô tả</span>}
                          </div>
                          {r.images && r.images.length > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 6, marginBottom: 4 }}>
                              {r.images.map((imgUrl, idx) => (
                                <img
                                  key={idx}
                                  src={imgUrl}
                                  alt="Hiện trường"
                                  onClick={() => setSelectedHazardPhoto(imgUrl)}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    objectFit: 'cover',
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s',
                                  }}
                                  title="Bấm để xem ảnh hiện trường phóng to"
                                />
                              ))}
                            </div>
                          ) : null}
                          {r.reviewNote ? (
                            <div style={{ fontSize: '11.5px', color: '#0284c7', marginTop: 4, fontStyle: 'italic', background: '#f0f9ff', padding: '3px 8px', borderRadius: 4, border: '1px solid #e0f2fe' }}>
                              Ghi chú: {r.reviewNote}
                            </div>
                          ) : null}
                        </td>

                        {/* 6. Trạng thái */}
                        <td style={{ textAlign: 'center' }}>
                          {r.status === 'PENDING' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', whiteSpace: 'nowrap' }}>
                              <i className="bi bi-hourglass-split"></i> CHỜ DUYỆT
                            </span>
                          )}
                          {r.status === 'APPROVED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                              <i className="bi bi-check-circle-fill"></i> ĐÃ DUYỆT
                            </span>
                          )}
                          {r.status === 'REJECTED' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                              <i className="bi bi-x-circle-fill"></i> TỪ CHỐI
                            </span>
                          )}
                        </td>

                        {/* 7. Thao tác thẩm định & Xóa */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            {/* Nút Xem Detail (Chi tiết + Bản đồ nhỏ) */}
                            <button
                              type="button"
                              className="sos-btn-action primary"
                              onClick={() => setDetailHazard(r)}
                              title="Xem chi tiết đầy đủ và vị trí bản đồ"
                            >
                              <Eye size={13} />
                              <span>Chi tiết</span>
                            </button>

                            {r.status === 'PENDING' && (
                              <>
                                {inJurisdiction ? (
                                  <>
                                    {/* Nút Duyệt & Chuẩn hóa: Mở FORM nhập lại thông tin chuẩn xác */}
                                    <button
                                      type="button"
                                      className="sos-btn-action success"
                                      disabled={loading}
                                      onClick={() => handleOpenReviewModal(r)}
                                      title="Mở form chuẩn hóa thông tin để phê duyệt"
                                    >
                                      <i className="bi bi-pencil-square" style={{ fontSize: '12px' }}></i>
                                      <span>Duyệt &amp; Chuẩn hóa</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="sos-btn-action danger"
                                      disabled={loading}
                                      onClick={() => {
                                        const reason = prompt('Nhập lý do từ chối điểm nguy hiểm này (tùy chọn):', 'Thông tin chưa đủ căn cứ');
                                        if (reason !== null) {
                                          handleQuickReview(r._id, 'REJECTED', reason);
                                        }
                                      }}
                                      title="Từ chối tin báo"
                                    >
                                      <XCircle size={13} />
                                      <span>Từ chối</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="sos-btn-action"
                                    disabled
                                    style={{
                                      background: '#f1f5f9',
                                      color: '#94a3b8',
                                      border: '1px solid #e2e8f0',
                                      cursor: 'not-allowed',
                                    }}
                                    title="Điểm báo nằm ngoài địa bàn phân công quản lý - Không có quyền thẩm định/duyệt"
                                  >
                                    <i className="bi bi-shield-lock-fill" style={{ fontSize: '11px', marginRight: 4 }}></i>
                                    <span>Ngoài địa bàn</span>
                                  </button>
                                )}
                              </>
                            )}

                            {r.status === 'APPROVED' && (
                              <>
                                {inJurisdiction && (
                                  <button
                                    type="button"
                                    className="sos-btn-action"
                                    style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}
                                    onClick={() => handleOpenReviewModal(r)}
                                    title="Chỉnh sửa lại thông tin chuẩn hóa của điểm nguy hiểm này"
                                  >
                                    <Edit size={13} />
                                    <span>Chỉnh sửa</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="sos-btn-action"
                                  style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1' }}
                                  onClick={onOpenMap}
                                  title="Xem vị trí điểm nguy hiểm trên bản đồ tác chiến"
                                >
                                  <MapPin size={13} color="#dc2626" />
                                  <span>Xem Map</span>
                                </button>
                              </>
                            )}

                            {r.status === 'REJECTED' && (
                              <>
                                {inJurisdiction ? (
                                  <button
                                    type="button"
                                    className="sos-btn-action success"
                                    disabled={loading}
                                    onClick={() => handleOpenReviewModal(r)}
                                    title="Thẩm định và phê duyệt lại điểm nguy hiểm"
                                  >
                                    <CheckCircle2 size={13} />
                                    <span>Duyệt lại</span>
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '0 4px' }}>
                                    Ngoài địa bàn
                                  </span>
                                )}
                              </>
                            )}

                            {/* Nút Xóa Điểm Nguy Hiểm (Chỉ hiển thị khi trong địa bàn hoặc Admin) */}
                            {inJurisdiction && (
                              <button
                                type="button"
                                className="sos-btn-action"
                                style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                                disabled={loading}
                                onClick={() => handleDeleteHazard(r._id, r.title)}
                                title="Xóa vĩnh viễn điểm nguy hiểm này khỏi hệ thống"
                              >
                                <Trash2 size={13} />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL CHI TIẾT ĐIỂM NGUY HIỂM (KÈM BẢN ĐỒ NHỎ VÀ NÚT XÓA) */}
        {detailHazard && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(5px)',
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
                borderRadius: '16px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '10px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                      Chi Tiết Điểm Nguy Hiểm: {detailHazard.title}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
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
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body: 2 Columns */}
              <div
                style={{
                  padding: '24px',
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: '24px',
                }}
              >
                {/* Cột 1: Thông tin mô tả & Người báo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Phân loại & Mức độ */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Phân loại hiểm họa &amp; Mức độ
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontWeight: 700,
                          fontSize: '13px',
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        <i
                          className={`bi ${getHazardTypeConfig(detailHazard.hazardType, detailHazard.customHazardType).bsIcon}`}
                          style={{ fontSize: '15px' }}
                        ></i>{' '}
                        {getHazardTypeConfig(detailHazard.hazardType, detailHazard.customHazardType).label}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: detailHazard.severity === 'CRITICAL' ? '#fee2e2' : detailHazard.severity === 'HIGH' ? '#ffedd5' : '#fef9c3',
                          color: detailHazard.severity === 'CRITICAL' ? '#991b1b' : detailHazard.severity === 'HIGH' ? '#9a3412' : '#854d0e',
                          fontWeight: 700,
                          fontSize: '13px',
                          border: `1px solid ${detailHazard.severity === 'CRITICAL' ? '#f87171' : detailHazard.severity === 'HIGH' ? '#fb923c' : '#facc15'}`,
                        }}
                      >
                        {getSeverityBadge(detailHazard.severity).label}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: detailHazard.status === 'APPROVED' ? '#dcfce7' : detailHazard.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                          color: detailHazard.status === 'APPROVED' ? '#15803d' : detailHazard.status === 'REJECTED' ? '#b91c1c' : '#b45309',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {detailHazard.status === 'APPROVED' ? (
                          <>
                            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }}></i>
                            Đã phê duyệt
                          </>
                        ) : detailHazard.status === 'REJECTED' ? (
                          <>
                            <i className="bi bi-x-circle-fill" style={{ marginRight: 5 }}></i>
                            Bị từ chối
                          </>
                        ) : (
                          <>
                            <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i>
                            Chờ thẩm định
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Người báo */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Người đóng góp thông tin
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {typeof detailHazard.reportedBy === 'object' && detailHazard.reportedBy?.fullName ? detailHazard.reportedBy.fullName[0].toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                          {typeof detailHazard.reportedBy === 'object' ? detailHazard.reportedBy?.fullName : 'Người dân'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                          {typeof detailHazard.reportedBy === 'object' && detailHazard.reportedBy?.phone ? (
                            <>
                              <i className="bi bi-telephone-fill" style={{ fontSize: '10.5px', marginRight: 4 }}></i>
                              {detailHazard.reportedBy.phone} •{' '}
                            </>
                          ) : ''}
                          {detailHazard.reporterRole === 'RESCUER' ? (
                            <>
                              <i className="bi bi-life-preserver" style={{ marginRight: 3 }}></i>
                              Cứu hộ viên
                            </>
                          ) : (
                            <>
                              <i className="bi bi-person-fill" style={{ marginRight: 3 }}></i>
                              Người dân
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Địa chỉ & Mô tả */}
                  <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Địa chỉ hiện trường
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a', lineHeight: '1.5' }}>
                        <i className="bi bi-geo-alt-fill" style={{ color: '#dc2626', marginRight: 5 }}></i>
                        {detailHazard.address}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Mô tả chi tiết
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#1e293b', lineHeight: '1.6', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                        {detailHazard.description || 'Không có mô tả chi tiết'}
                      </div>
                    </div>

                    {detailHazard.reviewNote && (
                      <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0369a1' }}>Ghi chú thẩm định:</div>
                        <div style={{ fontSize: '13px', color: '#0284c7', marginTop: '2px' }}>{detailHazard.reviewNote}</div>
                      </div>
                    )}
                  </div>

                  {/* Ảnh chụp hiện trường */}
                  {detailHazard.images && detailHazard.images.length > 0 && (
                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Hình ảnh hiện trường ({detailHazard.images.length} ảnh)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px' }}>
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

                    {/* Nút tác vụ mở bản đồ ngoài */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                      <a
                        href={`https://www.google.com/maps?q=${detailHazard.location.coordinates[1]},${detailHazard.location.coordinates[0]}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#f1f5f9',
                          color: '#334155',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Google Maps</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setDetailHazard(null);
                          onOpenMap();
                        }}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <MapPin size={14} />
                        <span>Bản đồ Tác chiến</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal với nút Xóa, Duyệt, Từ chối */}
              {(() => {
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

        {/* MODAL THẨM ĐỊNH & CHUẨN HÓA ĐIỂM NGUY HIỂM (FORM EDIT CHUẨN TRƯỚC KHI DUYỆT) */}
        {reviewingHazard && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
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
                borderRadius: '16px',
                width: '100%',
                maxWidth: '980px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. Header Modal */}
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#e0f2fe',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="bi bi-shield-check" style={{ fontSize: '22px' }}></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                      {reviewingHazard.status === 'APPROVED'
                        ? 'Chỉnh Sửa & Chuẩn Hóa Điểm Nguy Hiểm'
                        : 'Thẩm Định & Chuẩn Hóa Thông Tin Điểm Nguy Hiểm'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Chính quyền kiểm tra và chỉnh sửa lại các thông tin chuẩn xác trước khi phê duyệt đưa lên bản đồ tác chiến.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setReviewingHazard(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 2. Body Form cuộn */}
              <div
                style={{
                  padding: '20px 24px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                }}
              >
                {/* Banner Thông tin gốc người dân gửi */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 18px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#0284c7',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bi bi-person-badge"></i> Thông tin đối chiếu người dân gửi ban đầu:
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '10px',
                      fontSize: '12.5px',
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748b' }}>Người gửi: </span>
                      <strong style={{ color: '#0f172a' }}>
                        {typeof reviewingHazard.reportedBy === 'object'
                          ? reviewingHazard.reportedBy?.fullName
                          : 'Người dân'}
                      </strong>
                      {typeof reviewingHazard.reportedBy === 'object' && reviewingHazard.reportedBy?.phone ? (
                        <span style={{ color: '#475569' }}> ({reviewingHazard.reportedBy.phone})</span>
                      ) : null}
                    </div>

                    <div>
                      <span style={{ color: '#64748b' }}>Thời gian: </span>
                      <strong style={{ color: '#0f172a' }}>{formatHazardTime(reviewingHazard.createdAt)}</strong>
                    </div>

                    <div>
                      <span style={{ color: '#64748b' }}>Tiêu đề người dân gửi: </span>
                      <strong style={{ color: '#ea580c' }}>"{reviewingHazard.title}"</strong>
                    </div>
                  </div>

                  {reviewingHazard.images && reviewingHazard.images.length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '6px' }}>
                        Ảnh hiện trường người dân gửi ({reviewingHazard.images.length} ảnh):
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {reviewingHazard.images.map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt="Hiện trường"
                            onClick={() => setSelectedHazardPhoto(imgUrl)}
                            style={{
                              width: '48px',
                              height: '48px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              cursor: 'pointer',
                            }}
                            title="Bấm để xem ảnh phóng to"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Form chuẩn hóa 2 cột */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                    gap: '20px',
                  }}
                >
                  {/* CỘT TRÁI: TIÊU ĐỀ, LOẠI HIỂM HỌA, MỨC ĐỘ, ĐỊA CHỈ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* 1. Tiêu đề chuẩn hóa */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Tiêu đề điểm nguy hiểm chuẩn hóa <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Ví dụ: Ngập sâu 0.8m - 1.2m đường Nguyễn Hữu Cảnh"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                        * Đặt lại tên rõ ràng, kèm địa danh để người dân và lực lượng cứu hộ dễ nhận biết.
                      </span>
                    </div>

                    {/* 2. Loại hiểm họa thiên tai (Bootstrap Icons) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Loại hiểm họa thiên tai <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '8px',
                        }}
                      >
                        {[
                          { key: 'FLOOD', label: 'Ngập lụt sâu', bsIcon: 'bi-water', color: '#0284c7' },
                          { key: 'LANDSLIDE', label: 'Sạt lở đất đá', bsIcon: 'bi-cone-striped', color: '#b45309' },
                          { key: 'FALLEN_TREE', label: 'Cây đổ / Cản trở', bsIcon: 'bi-tree-fill', color: '#16a34a' },
                          { key: 'ELECTRICAL', label: 'Sự cố điện hạ thế', bsIcon: 'bi-lightning-charge-fill', color: '#ca8a04' },
                          { key: 'ROAD_DAMAGE', label: 'Sập / Hỏng đường cống', bsIcon: 'bi-sign-stop-fill', color: '#ea580c' },
                          { key: 'OTHER', label: 'Nguy hiểm khác', bsIcon: 'bi-exclamation-triangle-fill', color: '#dc2626' },
                        ].map((item) => {
                          const isSelected = editHazardType === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setEditHazardType(item.key)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: isSelected ? `2px solid ${item.color}` : '1px solid #cbd5e1',
                                background: isSelected ? '#f0fdf4' : '#ffffff',
                                color: isSelected ? '#0f172a' : '#475569',
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: '12.5px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <i className={`bi ${item.bsIcon}`} style={{ color: item.color, fontSize: '16px' }}></i>
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {editHazardType === 'OTHER' && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="text"
                            value={editCustomHazardType}
                            onChange={(e) => setEditCustomHazardType(e.target.value)}
                            placeholder="Nhập tên loại hiểm họa khác..."
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '13px',
                              color: '#0f172a',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* 3. Mức độ nguy cấp */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Mức độ nguy cấp <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {[
                          { key: 'LOW', label: 'Thấp', bg: '#ecfdf5', color: '#059669' },
                          { key: 'MEDIUM', label: 'Trung bình', bg: '#fef3c7', color: '#b45309' },
                          { key: 'HIGH', label: 'Cao', bg: '#ffedd5', color: '#c2410c' },
                          { key: 'CRITICAL', label: 'Cực kỳ nguy cấp', bg: '#fee2e2', color: '#dc2626' },
                        ].map((s) => {
                          const isSel = editSeverity === s.key;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => setEditSeverity(s.key as any)}
                              style={{
                                padding: '8px 4px',
                                borderRadius: '8px',
                                border: isSel ? `2px solid ${s.color}` : '1px solid #cbd5e1',
                                background: isSel ? s.bg : '#ffffff',
                                color: isSel ? s.color : '#64748b',
                                fontWeight: isSel ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                textAlign: 'center',
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
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Địa chỉ hiện trường chuẩn xác <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Số nhà, tên đường, khu vực, phường/xã, quận/huyện..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          color: '#0f172a',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* 5. Mô tả hiện trường & Hướng dẫn an toàn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Mô tả hiện trường &amp; Khuyến cáo an toàn
                      </label>
                      <textarea
                        rows={3}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Mô tả mức độ nguy hiểm, hướng dẫn phương tiện tránh di chuyển qua đoạn đường này..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          color: '#0f172a',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>

                  {/* CỘT PHẢI: TỌA ĐỘ GPS, BẢN ĐỒ MINI & GHI CHÚ CHÍNH QUYỀN */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Tọa độ GPS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                          Tọa độ vị trí GPS [Vĩ độ, Kinh độ]
                        </label>
                        <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                          💡 Kéo ghim hoặc click trên bản đồ
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Vĩ độ (Lat):</span>
                          <input
                            type="number"
                            step="0.00001"
                            value={editLat}
                            onChange={(e) => setEditLat(parseFloat(e.target.value) || 0)}
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
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Kinh độ (Lng):</span>
                          <input
                            type="number"
                            step="0.00001"
                            value={editLng}
                            onChange={(e) => setEditLng(parseFloat(e.target.value) || 0)}
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
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bản đồ nhỏ tương tác */}
                    <div style={{ flex: 1, minHeight: '260px' }}>
                      <HazardMiniMap
                        lat={editLat}
                        lng={editLng}
                        title={editTitle || 'Vị trí điểm nguy hiểm'}
                        hazardType={editHazardType}
                        interactive={true}
                        onLocationChange={(newLat, newLng) => {
                          setEditLat(Number(newLat.toFixed(5)));
                          setEditLng(Number(newLng.toFixed(5)));
                        }}
                      />
                    </div>

                    {/* Ghi chú thẩm định của chính quyền */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Ghi chú thẩm định &amp; Phương án xử lý của chính quyền
                      </label>
                      <textarea
                        rows={2}
                        value={editReviewNote}
                        onChange={(e) => setEditReviewNote(e.target.value)}
                        placeholder="Ví dụ: Đã cử đội CSGT cắm chốt phân luồng và trạm bơm ứng trực..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
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

              {/* 3. Footer Actions */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => {
                    const reason = prompt(
                      'Nhập lý do từ chối điểm nguy hiểm này (tùy chọn):',
                      editReviewNote || 'Thông tin không chính xác hoặc chưa đủ căn cứ'
                    );
                    if (reason !== null) {
                      setEditReviewNote(reason);
                      handleSubmitReview('REJECTED');
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <XCircle size={16} />
                  <span>Từ chối điểm báo</span>
                </button>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => setReviewingHazard(null)}
                    style={{
                      padding: '9px 18px',
                      borderRadius: '8px',
                      background: '#ffffff',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => handleSubmitReview('APPROVED')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 22px',
                      borderRadius: '8px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    {submittingReview ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    <span>Xác nhận chuẩn hóa &amp; Phê duyệt</span>
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
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.88)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: 24,
            }}
            onClick={() => setSelectedHazardPhoto(null)}
          >
            <div
              style={{ position: 'relative', maxWidth: '92vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedHazardPhoto}
                alt="Ảnh hiện trường phóng to"
                style={{
                  maxWidth: '90vw',
                  maxHeight: '85vh',
                  borderRadius: 12,
                  objectFit: 'contain',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              />
              <button
                type="button"
                onClick={() => setSelectedHazardPhoto(null)}
                style={{
                  position: 'absolute',
                  top: -14,
                  right: -14,
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: '2px solid #ffffff',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}
                title="Đóng xem ảnh"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 7. LOCAL AUTHORITY: BÁO CÁO THỐNG KÊ (UC-L14)
   * ------------------------------------------------------------- */
  if (activeKey === 'reports') {
    const displaySosList = sosList.length > 0 ? sosList : FALLBACK_SOS_LIST;
    const totalSos = displaySosList.length;
    const completed = displaySosList.filter((s) => s.status === 'COMPLETED').length;
    const rate = totalSos > 0 ? ((completed / totalSos) * 100).toFixed(1) : '100';
    const totalPeople = displaySosList.reduce((acc, curr) => acc + (curr.people || 0), 0);

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><BarChart3 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rate}%</span>
              <span className="sos-stat-label">Tỷ lệ hoàn thành cứu nạn</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSos} Vụ</span>
              <span className="sos-stat-label">Tổng vụ cứu nạn tiếp nhận</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalPeople} Người</span>
              <span className="sos-stat-label">Người dân được hỗ trợ an toàn</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><Clock size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">7.8 Phút</span>
              <span className="sos-stat-label">Thời gian phản ứng trung bình</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 8. ADMIN: TỔNG QUAN & GIÁM SÁT TOÀN DIỆN (UC-A07, UC-A08)
   * ------------------------------------------------------------- */
  if (activeKey === 'admin_overview') {
    const stats = adminStats?.overview;

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalSos ?? 6}</span>
              <span className="sos-stat-label">Tổng Tiếp Nhận Cứu Nạn</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalCitizens ?? 1240}</span>
              <span className="sos-stat-label">Người Dân Kết Nối</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalRescuers ?? 18}</span>
              <span className="sos-stat-label">Lực Lượng Cứu Hộ Sẵn Sàng</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><Building2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalVehicles ?? 12}</span>
              <span className="sos-stat-label">Phương Tiện Cơ Động</span>
            </div>
          </div>
        </div>

        {/* Phân bố SOS theo trạng thái */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 12 }}>
            <BarChart3 size={18} color="#ef4444" />
            <span>Phân Bố Yêu Cầu Cứu Nạn SOS Theo Trạng Thái (Thống Kê Thời Gian Thực)</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {adminStats?.sosByStatus?.map((st) => (
              <div key={st.status} style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{st.status}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>{st.count}</div>
              </div>
            )) || (
              <>
                <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>PENDING</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#fbbf24' }}>1</div>
                </div>
                <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>VERIFIED</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>3</div>
                </div>
                <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>COMPLETED</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80' }}>2</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 9. ADMIN: QUẢN LÝ NGƯỜI DÂN (UC-A02)
   * ------------------------------------------------------------- */
  if (activeKey === 'citizens') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Users size={18} color="#ef4444" />
              <span>Quản Lý Tài Khoản Người Dân Thực Tế Trong Database ({citizens.length} người dùng)</span>
            </div>
            <button
              type="button"
              className="sos-btn-action"
              style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
              onClick={refreshData}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Email</th>
                  <th>Địa chỉ</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {citizens.map((u) => (
                  <tr key={u._id}>
                    <td><strong>{u.fullName}</strong></td>
                    <td>{u.phone || 'Chưa có'}</td>
                    <td>{u.email}</td>
                    <td>{u.address || 'Chưa cung cấp'}</td>
                    <td>
                      <span className={`sos-badge ${u.status === 'ACTIVE' ? 'active' : 'critical'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`sos-btn-action ${u.status === 'ACTIVE' ? 'danger' : 'success'}`}
                        onClick={() => handleToggleUserStatus(u._id, u.status)}
                      >
                        {u.status === 'ACTIVE' ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{u.status === 'ACTIVE' ? 'Khóa' : 'Kích hoạt'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 10. ADMIN: XÁC MINH ĐỘI CỨU NẠN (UC-A03)
   * ------------------------------------------------------------- */
  if (activeKey === 'rescuers_admin') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <LifeBuoy size={18} color="#38bdf8" />
            <span>Xác Minh Cứu Hộ Viên Từ Database ({rescuers.length} hồ sơ)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Kỹ năng</th>
                  <th>Trạng thái xác minh</th>
                  <th>Phê duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td>{r.phone || 'Chưa có'}</td>
                    <td>{r.rescuer?.skills?.join(', ') || 'Cứu nạn lũ lụt'}</td>
                    <td>
                      <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                        {r.rescuer?.verificationStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="sos-btn-action success"
                          onClick={() => handleVerifyRescuer(r._id, 'VERIFIED')}
                        >
                          Duyệt (VERIFY)
                        </button>
                        <button
                          type="button"
                          className="sos-btn-action danger"
                          onClick={() => handleVerifyRescuer(r._id, 'REJECTED')}
                        >
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 11. ADMIN: QUẢN LÝ CÁN BỘ & ĐỊA PHƯƠNG (UC-A04)
   * ------------------------------------------------------------- */
  if (activeKey === 'authorities') {
    const activeOfficersCount = authorities.filter((a) => a.status === 'ACTIVE').length;
    const inactiveOfficersCount = authorities.length - activeOfficersCount;

    const filteredAuthorities = authorities.filter((a) => {
      if (authStatusFilter === 'ACTIVE' && a.status !== 'ACTIVE') return false;
      if (authStatusFilter === 'INACTIVE' && a.status === 'ACTIVE') return false;
      if (authSearchQuery.trim()) {
        const q = authSearchQuery.toLowerCase();
        const matchName = (a.fullName || '').toLowerCase().includes(q);
        const matchPhone = (a.phone || '').includes(q);
        const matchEmail = (a.email || '').toLowerCase().includes(q);
        const matchArea = (a.authority?.areaName || a.authority?.areaId || '').toLowerCase().includes(q);
        const matchDept = (a.authority?.department || '').toLowerCase().includes(q);
        const matchPos = (a.authority?.position || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchEmail || matchArea || matchDept || matchPos;
      }
      return true;
    });

    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <div className="sos-view-card-title">
              <Building2 size={18} color="#a855f7" />
              <span>
                Cán Bộ &amp; Địa Bàn Phụ Trách ({authorities.length} cán bộ điều hành toàn quốc)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sos-btn-action"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setAuthSubmitError(null);
                  setAuthSubmitSuccess(null);
                  setCreateAuthForm((prev) => ({
                    ...prev,
                    password: generateRandomPassword(10),
                  }));
                  setShowCreateAuthModal(true);
                  if (modalProvinceSubUnits.length === 0) {
                    loadSubUnitsForCity(createAuthForm.city || 'Thành phố Đà Nẵng');
                  }
                }}
              >
                <UserPlus size={16} />
                <span>+ Tạo Tài Khoản Cán Bộ</span>
              </button>
              <button
                type="button"
                className="sos-btn-action"
                style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569', padding: '8px 12px', borderRadius: '6px' }}
                onClick={refreshData}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Thanh lọc nhanh trạng thái & Tìm kiếm */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '12px 18px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`sos-btn-filter-pill ${authStatusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setAuthStatusFilter('ALL')}
              >
                Tất cả ({authorities.length})
              </button>
              <button
                type="button"
                className={`sos-btn-filter-pill ${authStatusFilter === 'ACTIVE' ? 'active-green' : ''}`}
                onClick={() => setAuthStatusFilter('ACTIVE')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <UserCheck size={13} />
                <span>Đang hoạt động ({activeOfficersCount})</span>
              </button>
              <button
                type="button"
                className={`sos-btn-filter-pill ${authStatusFilter === 'INACTIVE' ? 'active-red' : ''}`}
                onClick={() => setAuthStatusFilter('INACTIVE')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <UserX size={13} />
                <span>Tạm khóa / Ngừng ({inactiveOfficersCount})</span>
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Tìm cán bộ, SĐT, email hoặc địa bàn..."
                value={authSearchQuery}
                onChange={(e) => setAuthSearchQuery(e.target.value)}
                style={{
                  padding: '7px 14px 7px 32px',
                  borderRadius: '20px',
                  fontSize: '12.5px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  minWidth: '270px',
                }}
              />
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Họ và tên</th>
                  <th style={{ width: '20%' }}>Số điện thoại / Email</th>
                  <th style={{ width: '20%' }}>Khu vực phụ trách (Địa bàn)</th>
                  <th style={{ width: '18%' }}>Đơn vị / Cơ quan</th>
                  <th style={{ width: '12%' }}>Chức vụ</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ width: '14%', textAlign: 'center' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthorities.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                      {authorities.length === 0
                        ? 'Chưa có tài khoản cán bộ địa phương nào. Nhấn "+ Tạo Tài Khoản Cán Bộ" để tạo mới!'
                        : 'Không có cán bộ nào phù hợp với bộ lọc tìm kiếm.'}
                    </td>
                  </tr>
                ) : (
                  filteredAuthorities.map((a) => {
                    const areaName = a.authority?.areaName || a.authority?.areaId || 'Địa bàn phụ trách';
                    const isActive = a.status === 'ACTIVE';
                    return (
                      <tr key={a._id}>
                        <td><strong>{a.fullName}</strong></td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{a.phone}</div>
                          <small style={{ color: '#94a3b8' }}>{a.email || '--'}</small>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                            }}
                          >
                            <MapPin size={13} />
                            <span>{areaName}</span>
                          </span>
                        </td>
                        <td>{a.authority?.department || 'Ban chỉ huy PCTT'}</td>
                        <td>{a.authority?.position || 'Cán bộ tác chiến'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`sos-badge ${isActive ? 'active' : 'critical'}`}
                            style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Bấm để chuyển nhanh trạng thái"
                            onClick={() => handleQuickToggleAuthStatus(a)}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#16a34a' : '#ef4444' }} />
                            {isActive ? 'HOẠT ĐỘNG' : a.status || 'TẠM KHÓA'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="sos-btn-action"
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                                color: '#0284c7',
                                border: '1px solid rgba(2, 132, 199, 0.3)',
                                fontSize: '12px',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                              }}
                              title="Chỉnh sửa thông tin & đổi địa bàn quản lý"
                              onClick={() => handleOpenEditAuthority(a)}
                            >
                              <Edit size={13} />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              className={`sos-btn-action ${isActive ? 'danger' : 'success'}`}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                              }}
                              title={isActive ? 'Khóa tài khoản cán bộ' : 'Mở khóa kích hoạt lại'}
                              onClick={() => handleQuickToggleAuthStatus(a)}
                            >
                              {isActive ? <Lock size={13} /> : <Unlock size={13} />}
                              <span>{isActive ? 'Khóa' : 'Mở'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL: CHỈNH SỬA THÔNG TIN CÁN BỘ & THAY ĐỔI ĐỊA BÀN QUẢN LÝ */}
        {editingAuthority && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 125,
              padding: '20px',
            }}
          >
            <div
              className="sos-modal-card"
              style={{
                borderRadius: '14px',
                padding: '24px',
                maxWidth: '560px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="sos-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px' }}>
                  <Edit size={20} color="#0284c7" />
                  <span>Chỉnh Sửa Cán Bộ &amp; Thay Đổi Địa Bàn</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingAuthority(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              {editAuthError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {editAuthError}
                </div>
              )}

              {editAuthSuccess && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {editAuthSuccess}
                </div>
              )}

              <form onSubmit={handleEditAuthoritySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Họ và tên cán bộ <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="sos-form-input"
                      placeholder="VD: Nguyễn Văn Sơn"
                      value={editAuthForm.fullName}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, fullName: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Số điện thoại đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      className="sos-form-input"
                      placeholder="VD: 0905123456"
                      value={editAuthForm.phone}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Email liên hệ
                    </label>
                    <input
                      type="email"
                      className="sos-form-input"
                      placeholder="VD: officer@danang.gov.vn"
                      value={editAuthForm.email}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, email: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Trạng thái tài khoản <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      className="sos-form-select"
                      value={editAuthForm.status}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, status: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    >
                      <option value="ACTIVE">🟢 ACTIVE - Đang hoạt động tác chiến</option>
                      <option value="INACTIVE">🔴 INACTIVE - Tạm khóa / Ngừng điều hành</option>
                      <option value="SUSPENDED">⛔ SUSPENDED - Đình chỉ tác chiến</option>
                    </select>
                  </div>
                </div>

                {/* Thay đổi địa bàn quản lý */}
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                    Khu vực phụ trách (Thay đổi địa bàn điều phối) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    className="sos-form-select"
                    value={editAuthForm.areaId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      const match = DANANG_ADMIN_AREAS.find((a) => a.id === targetId);
                      const areaName = match ? match.name : '';
                      setEditAuthForm({
                        ...editAuthForm,
                        areaId: targetId,
                        areaName: areaName,
                        department: `Ban Chỉ Huy PCTT ${areaName}`,
                      });
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                  >
                    {/* Địa bàn hiện tại */}
                    {editAuthForm.areaName && (
                      <option value={editAuthForm.areaId}>
                        ⭐ {editAuthForm.areaName} (Địa bàn đang quản lý)
                      </option>
                    )}
                    {/* Các địa bàn còn trống */}
                    <optgroup label="Các địa bàn chưa có cán bộ quản lý (Trống)">
                      {availableAreas.map((ar: { id: string; name: string; district: string }) => (
                        <option key={ar.id} value={ar.id}>
                          🟢 {ar.name} ({ar.district})
                        </option>
                      ))}
                    </optgroup>
                    {/* Các địa bàn khác */}
                    <optgroup label="Các địa bàn khác">
                      {assignedAreas
                        .filter((ar: { id: string; name: string }) => ar.id !== editAuthForm.areaId && ar.name !== editAuthForm.areaName)
                        .map((ar: { id: string; name: string; district: string }) => (
                          <option key={ar.id} value={ar.id}>
                            ⚠️ {ar.name} ({ar.district}) – Đã có cán bộ khác
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    * Chọn địa bàn mới để chuyển quyền điều phối tác chiến của cán bộ này sang khu vực đó.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Đơn vị / Cơ quan
                    </label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={editAuthForm.department}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, department: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Chức vụ
                    </label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={editAuthForm.position}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, position: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px' }}
                    />
                  </div>
                </div>

                {/* Đổi mật khẩu mới nếu muốn */}
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                    Đặt mật khẩu mới (Bỏ trống nếu không muốn đổi mật khẩu)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="sos-form-input"
                      placeholder="Để trống nếu giữ nguyên mật khẩu cũ"
                      value={editAuthForm.password}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, password: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 38px 9px 12px',
                        borderRadius: '6px',
                        fontFamily: editAuthForm.password ? 'monospace' : 'inherit',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditAuthForm((prev) => ({
                          ...prev,
                          password: generateRandomPassword(8),
                        }))
                      }
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        cursor: 'pointer',
                        padding: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                      title="Sinh mật khẩu ngẫu nhiên"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="sos-btn-action sos-btn-refresh"
                    style={{ padding: '9px 16px', borderRadius: '6px' }}
                    onClick={() => setEditingAuthority(null)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={editAuthSubmitting}
                    style={{
                      padding: '9px 20px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {editAuthSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Đang lưu thay đổi...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Lưu Thay Đổi &amp; Cập Nhật Địa Bàn</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: TẠO TÀI KHOẢN CÁN BỘ ĐỊA PHƯƠNG & GÁN ĐỊA BÀN QUẢN LÝ */}
        {showCreateAuthModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 120,
              padding: '20px',
            }}
          >
            <div
              className="sos-modal-card"
              style={{
                borderRadius: '16px',
                padding: '28px 32px',
                maxWidth: '680px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                background: '#ffffff',
              }}
            >
              {(() => {
                const currentCityAreas = modalProvinceSubUnits.length > 0 ? modalProvinceSubUnits : DANANG_ADMIN_AREAS;
                const currentAvailableAreas = currentCityAreas.filter((ar) => !isAreaAssigned(ar, createAuthForm.city));
                const currentAssignedAreas = currentCityAreas.filter((ar) => isAreaAssigned(ar, createAuthForm.city));
                const allProvincesList = vietnamProvinces.length > 0 ? vietnamProvinces : VIETNAM_34_PROVINCES_STANDARD;

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '10px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <UserPlus size={22} />
                        </div>
                        <div>
                          <h3 className="sos-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Tạo Tài Khoản Cán Bộ &amp; Gán Khu Vực Quản Lý
                          </h3>
                          <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                            Cấp tài khoản điều hành tác chiến theo địa bàn hành chính trên toàn quốc
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateAuthModal(false)}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {authSubmitError && (
                      <div
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#dc2626',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          marginBottom: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{authSubmitError}</span>
                      </div>
                    )}

                    {authSubmitSuccess && (
                      <div
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#059669',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          marginBottom: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{authSubmitSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleCreateAuthorityUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* PHẦN 1: THÔNG TIN TÀI KHOẢN CÁN BỘ */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.6px' }}>
                          1. Thông Tin Tài Khoản Đăng Nhập
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Họ và tên cán bộ <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="text"
                              required
                              className="sos-form-input"
                              placeholder="VD: Nguyễn Văn Thắng"
                              value={createAuthForm.fullName}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, fullName: e.target.value })}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Số điện thoại đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              className="sos-form-input"
                              placeholder="VD: 0905123456"
                              value={createAuthForm.phone}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, phone: e.target.value })}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Email liên hệ <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="email"
                              required
                              className="sos-form-input"
                              placeholder="VD: thang.nguyen@danang.gov.vn"
                              value={createAuthForm.email}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, email: e.target.value })}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Mật khẩu khởi tạo
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                required
                                className="sos-form-input"
                                placeholder="Mật khẩu ngẫu nhiên"
                                value={createAuthForm.password}
                                onChange={(e) => setCreateAuthForm({ ...createAuthForm, password: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '10px 42px 10px 14px',
                                  borderRadius: '8px',
                                  fontFamily: 'monospace',
                                  fontWeight: 700,
                                  fontSize: '13.5px',
                                  letterSpacing: '0.8px',
                                  color: '#0284c7',
                                  backgroundColor: 'rgba(2, 132, 199, 0.04)',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setCreateAuthForm((prev) => ({
                                    ...prev,
                                    password: generateRandomPassword(8),
                                  }))
                                }
                                style={{
                                  position: 'absolute',
                                  right: '6px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  color: '#0284c7',
                                  cursor: 'pointer',
                                  padding: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '6px',
                                }}
                                title="Đổi mật khẩu ngẫu nhiên mới"
                              >
                                <RefreshCw size={15} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginTop: '-2px' }}>
                          * Mật khẩu ngẫu nhiên kèm liên kết xác thực sẽ được tự động gửi về Email của cán bộ.
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #f1f5f9', margin: '2px 0' }} />

                      {/* PHẦN 2: PHẠM VI ĐỊA BÀN PHÂN QUYỀN TÁC CHIẾN */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <MapPin size={13} />
                            <span>2. Phạm Vi Địa Bàn Quản Lý (34 Tỉnh Thành Cả Nước)</span>
                          </div>
                          {modalSubUnitsLoading && (
                            <span style={{ fontSize: '11.5px', color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Loader2 size={12} className="animate-spin" />
                              Đang nạp xã/phường...
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Tỉnh / Thành phố <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                              className="sos-form-select"
                              value={createAuthForm.city}
                              onChange={(e) => handleCityChange(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
                            >
                              {allProvincesList.map((p) => (
                                <option key={p.code || p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Khu vực quản lý (Còn trống: {currentAvailableAreas.length}/{currentCityAreas.length}) <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                              className="sos-form-select"
                              value={createAuthForm.areaId}
                              disabled={modalSubUnitsLoading}
                              onChange={(e) => {
                                const targetId = e.target.value;
                                const match = currentCityAreas.find((a) => a.id === targetId);
                                const areaName = match ? match.name : '';
                                setCreateAuthForm({
                                  ...createAuthForm,
                                  areaId: targetId,
                                  areaName: areaName,
                                });
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
                            >
                              {currentAvailableAreas.length === 0 ? (
                                <option value="" disabled>
                                  Không còn địa bàn nào chưa có quản lý tại {createAuthForm.city}
                                </option>
                              ) : (
                                <optgroup label={`Khu vực chưa có quản lý (${currentAvailableAreas.length} địa bàn khả dụng)`}>
                                  {currentAvailableAreas.map((ar) => (
                                    <option key={ar.id} value={ar.id}>
                                      {ar.name} {ar.district ? `(${ar.district})` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {currentAssignedAreas.length > 0 && (
                                <optgroup label="Khu vực đã có tài khoản quản lý (Khóa)">
                                  {currentAssignedAreas.map((ar) => {
                                    const mgr = authorities.find((a: any) => {
                                      const authAreaId = String(a.authority?.areaId || '').trim();
                                      const authAreaName = String(a.authority?.areaName || '').trim().toLowerCase();
                                      const cleanAuthName = authAreaName.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim();
                                      const cleanArName = ar.name.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim().toLowerCase();
                                      return authAreaId === ar.id || authAreaName === ar.name.toLowerCase() || (cleanAuthName && cleanAuthName === cleanArName);
                                    });
                                    return (
                                      <option key={ar.id} value={ar.id} disabled style={{ color: '#94a3b8' }}>
                                        ⛔ {ar.name} – Đã có: {mgr?.fullName || 'Cán bộ'} ({mgr?.phone || ''})
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginTop: '-2px' }}>
                          * Mỗi phường/xã chỉ có 1 tài khoản điều phối. Hệ thống chỉ cho phép gán khu vực chưa có quản lý để tránh xung đột tác chiến.
                        </div>
                      </div>

                      {/* THẺ TÓM TẮT ĐỊNH VỊ TÁC CHIẾN */}
                      <div
                        style={{
                          backgroundColor: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          borderRadius: '12px',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          marginTop: '4px',
                        }}
                      >
                        <MapPin size={20} color="#0284c7" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '13px', lineHeight: 1.55, color: '#334155' }}>
                          <div style={{ color: '#0369a1', fontWeight: 700, marginBottom: '3px' }}>
                            Cơ chế tự động định vị địa bàn tác chiến:
                          </div>
                          <div>
                            Khi cán bộ đăng nhập bằng SĐT này, hệ thống sẽ tự động khóa định vị và quản lý tại{' '}
                            <strong style={{ color: '#0284c7', fontWeight: 700 }}>{createAuthForm.areaName || 'Khu vực quản lý'}</strong>{' '}
                            (thuộc <strong style={{ color: '#0f172a' }}>{createAuthForm.city}</strong>) – Mã ranh giới:{' '}
                            <span
                              style={{
                                backgroundColor: '#e0f2fe',
                                color: '#0369a1',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                border: '1px solid #bae6fd',
                              }}
                            >
                              {createAuthForm.areaId}
                            </span>
                            .
                          </div>
                          <div style={{ marginTop: '5px', fontSize: '12px', color: '#64748b' }}>
                            • Vai trò tác chiến: <strong style={{ color: '#0f172a' }}>Chỉ Huy Trực Ban Tác Chiến</strong> (tiếp nhận SOS, cảnh báo rủi ro &amp; chỉ đạo các đội cứu hộ tại địa bàn).
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="sos-btn-action"
                          style={{
                            padding: '10px 18px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={() => setShowCreateAuthModal(false)}
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={authSubmitting || modalSubUnitsLoading}
                          style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            border: 'none',
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '13.5px',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                          }}
                        >
                          {authSubmitting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Đang tạo tài khoản...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} />
                              <span>Tạo Tài Khoản &amp; Gán Địa Bàn</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 12. ADMIN: KHU VỰC HÀNH CHÍNH (UC-A05)
   * ------------------------------------------------------------- */
  if (activeKey === 'areas') {
    const getSubUnitManager = (u: ProvinceSubUnitItem): AreaManagerInfo | null => {
      if (!areaManagers || Object.keys(areaManagers).length === 0) return null;

      const fullName = (u.name || '').toLowerCase().trim();
      if (areaManagers[fullName]) return areaManagers[fullName];

      const shortName = fullName.replace(/^(quận|huyện|thị xã|thành phố|tp\.|phường|xã)\s+/i, '').trim();
      if (shortName && areaManagers[shortName]) return areaManagers[shortName];

      if (u.id && areaManagers[u.id]) return areaManagers[u.id];
      if (u.code && areaManagers[u.code.toLowerCase()]) return areaManagers[u.code.toLowerCase()];

      for (const key of Object.keys(areaManagers)) {
        if (key && shortName && (key.includes(shortName) || shortName.includes(key))) {
          return areaManagers[key];
        }
      }

      return null;
    };



    const handleSelectProvince = async (prov: VietnamProvinceItem) => {
      setSelectedProvince(prov);
      setSubUnitsLoading(true);
      setSubUnitSearchQuery('');
      setSubUnitTypeFilter('ALL');
      setSubUnitManagerFilter('ALL');
      try {
        const [units, mgrRes] = await Promise.all([
          fetchProvinceSubUnitsService(prov.placeId, prov.name, prov.code),
          fetchAreaManagers(),
        ]);
        setSubUnits(units);
        if (mgrRes.success && mgrRes.data) {
          setAreaManagers(mgrRes.data);
        }
      } catch (err) {
        console.error('Lỗi khi tải đơn vị con:', err);
      } finally {
        setSubUnitsLoading(false);
      }
    };

    const handleBackToProvinces = () => {
      setSelectedProvince(null);
      setSubUnits([]);
      setSubUnitSearchQuery('');
      setSubUnitTypeFilter('ALL');
      setSubUnitManagerFilter('ALL');
    };

    // TẦNG 2: XEM CHI TIẾT CÁC XÃ, PHƯỜNG, QUẬN, HUYỆN CỦA TỈNH ĐƯỢC CHỌN
    if (selectedProvince) {
      const managedCount = subUnits.filter((u) => getSubUnitManager(u) !== null).length;
      const unmanagedCount = subUnits.length - managedCount;

      const filteredSubUnits = subUnits.filter((u) => {
        const mgr = getSubUnitManager(u);
        if (subUnitManagerFilter === 'MANAGED' && !mgr) return false;
        if (subUnitManagerFilter === 'UNMANAGED' && mgr) return false;
        if (subUnitTypeFilter !== 'ALL') {
          if (subUnitTypeFilter === 'DISTRICT' && u.type !== 'DISTRICT') return false;
          if (subUnitTypeFilter === 'WARD' && u.type !== 'WARD' && u.type !== 'COMMUNE' && u.type !== 'TOWN') return false;
        }
        if (subUnitSearchQuery.trim()) {
          const q = subUnitSearchQuery.toLowerCase();
          const matchName = (u.name || '').toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q);
          const matchMgr = mgr
            ? (mgr.managerName || '').toLowerCase().includes(q) ||
              (mgr.phone || '').includes(q) ||
              (mgr.department || '').toLowerCase().includes(q)
            : false;
          return matchName || matchMgr;
        }
        return true;
      });

      const districtCount = subUnits.filter((u) => u.type === 'DISTRICT').length;
      const wardCount = subUnits.filter((u) => u.type === 'WARD' || u.type === 'COMMUNE' || u.type === 'TOWN').length;

      return (
        <div className="sos-views-container">
          {/* THANH BREADCRUMB ĐIỀU HƯỚNG */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
              <button
                type="button"
                onClick={handleBackToProvinces}
                className="sos-btn-refresh"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px' }}
              >
                <ArrowLeft size={15} />
                <span>Quay lại Danh sách Tỉnh / Thành</span>
              </button>
              <span style={{ color: '#64748b' }}>/</span>
              <span style={{ color: '#64748b' }}>Toàn Quốc</span>
              <span style={{ color: '#64748b' }}>/</span>
              <strong style={{ color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
                <Building2 size={15} color="#0284c7" />
                {selectedProvince.name}
              </strong>
            </div>

            <span className="sos-badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
              KHẢ DỤNG HỆ THỐNG
            </span>
          </div>

          {/* STATS CỦA TỈNH ĐƯỢC CHỌN - LOẠI BỎ DÂN SỐ/DIỆN TÍCH, THAY BẰNG THỐNG KÊ QUẢN LÝ ĐỊA BÀN */}
          <div className="sos-stats-grid">
            <div className="sos-stat-box">
              <div className="sos-stat-icon blue">
                <Building2 size={20} />
              </div>
              <div className="sos-stat-meta">
                <span className="sos-stat-value">{subUnits.length}</span>
                <span className="sos-stat-label">Tổng Đơn Vị Con</span>
              </div>
            </div>
            <div className="sos-stat-box">
              <div className="sos-stat-icon green">
                <UserCheck size={20} />
              </div>
              <div className="sos-stat-meta">
                <span className="sos-stat-value" style={{ color: '#16a34a' }}>{managedCount}</span>
                <span className="sos-stat-label">Đã Có Địa Phương Quản Lý</span>
              </div>
            </div>
            <div className="sos-stat-box">
              <div className="sos-stat-icon red">
                <UserX size={20} />
              </div>
              <div className="sos-stat-meta">
                <span className="sos-stat-value" style={{ color: '#dc2626' }}>{unmanagedCount}</span>
                <span className="sos-stat-label">Chưa Phân Công Quản Lý</span>
              </div>
            </div>
            <div className="sos-stat-box">
              <div className="sos-stat-icon yellow">
                <Home size={20} />
              </div>
              <div className="sos-stat-meta">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', lineHeight: 1.2 }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{districtCount}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>Quận/Huyện</span>
                  <span style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 2px' }}>•</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{wardCount}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>Phường/Xã</span>
                </div>
                <span className="sos-stat-label">Cơ Cấu Đơn Vị Hành Chính</span>
              </div>
            </div>
          </div>

          {/* BẢNG DANH MỤC XÃ PHƯỜNG / QUẬN HUYỆN CỦA TỈNH */}
          <div className="sos-view-card">
            <div className="sos-view-card-header">
              <div className="sos-view-card-title">
                <Building2 size={18} color="#0284c7" />
                <span>Danh Mục Đơn Vị Trực Thuộc: {selectedProvince.name} ({filteredSubUnits.length}/{subUnits.length} đơn vị)</span>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Nút lọc nhanh dạng Pill theo trạng thái quản lý & phân cấp */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'ALL' && subUnitTypeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => {
                      setSubUnitManagerFilter('ALL');
                      setSubUnitTypeFilter('ALL');
                    }}
                  >
                    Tất cả ({subUnits.length})
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'MANAGED' ? 'active-green' : ''}`}
                    onClick={() => setSubUnitManagerFilter(subUnitManagerFilter === 'MANAGED' ? 'ALL' : 'MANAGED')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <UserCheck size={13} />
                    <span>Đã có quản lý ({managedCount})</span>
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'UNMANAGED' ? 'active-red' : ''}`}
                    onClick={() => setSubUnitManagerFilter(subUnitManagerFilter === 'UNMANAGED' ? 'ALL' : 'UNMANAGED')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <UserX size={13} />
                    <span>Chưa có quản lý ({unmanagedCount})</span>
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitTypeFilter === 'DISTRICT' ? 'active-yellow' : ''}`}
                    onClick={() => setSubUnitTypeFilter(subUnitTypeFilter === 'DISTRICT' ? 'ALL' : 'DISTRICT')}
                  >
                    Quận / Huyện ({districtCount})
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitTypeFilter === 'WARD' ? 'active-blue' : ''}`}
                    onClick={() => setSubUnitTypeFilter(subUnitTypeFilter === 'WARD' ? 'ALL' : 'WARD')}
                  >
                    Phường / Xã ({wardCount})
                  </button>
                </div>

                {/* Thanh tìm kiếm */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder={`Tìm đơn vị hoặc cán bộ phụ trách...`}
                    value={subUnitSearchQuery}
                    onChange={(e) => setSubUnitSearchQuery(e.target.value)}
                    style={{
                      padding: '7px 14px 7px 32px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                      minWidth: '240px',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="sos-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Tên đơn vị (Xã/Phường/Quận/Huyện)</th>
                    <th style={{ width: '15%' }}>Mã định danh tác chiến</th>
                    <th style={{ width: '13%' }}>Cấp hành chính</th>
                    <th style={{ width: '32%' }}>Địa phương quản lý</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {subUnitsLoading ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0284c7' }} />
                        Đang kết nối API bản đồ mới để tải các xã, phường của {selectedProvince.name}...
                      </td>
                    </tr>
                  ) : filteredSubUnits.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Không có đơn vị nào phù hợp với bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredSubUnits.map((u) => {
                      const isDistrict = u.type === 'DISTRICT';
                      const isCommune = u.type === 'COMMUNE';
                      const isTown = u.type === 'TOWN';

                      let typeLabel = 'Phường';
                      let typeBadgeClass = 'green';
                      if (isDistrict) {
                        if (u.name.startsWith('Quận')) typeLabel = 'Quận';
                        else if (u.name.startsWith('Huyện')) typeLabel = 'Huyện';
                        else if (u.name.startsWith('Thành phố') || u.name.startsWith('TP')) typeLabel = 'Thành phố';
                        else if (u.name.startsWith('Thị xã')) typeLabel = 'Thị xã';
                        else typeLabel = 'Quận / Huyện';
                        typeBadgeClass = 'yellow';
                      } else if (isCommune) {
                        typeLabel = 'Xã';
                        typeBadgeClass = 'blue';
                      } else if (isTown) {
                        typeLabel = 'Thị trấn';
                        typeBadgeClass = 'purple';
                      }

                      const mgr = getSubUnitManager(u);

                      return (
                        <tr key={u.id} style={{ height: '56px' }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  background: isDistrict
                                    ? 'rgba(217, 119, 6, 0.1)'
                                    : isCommune
                                    ? 'rgba(2, 132, 199, 0.1)'
                                    : 'rgba(22, 163, 74, 0.1)',
                                  color: isDistrict ? '#d97706' : isCommune ? '#0284c7' : '#16a34a',
                                }}
                              >
                                {isDistrict ? (
                                  <Building2 size={15} />
                                ) : isCommune ? (
                                  <Globe2 size={15} />
                                ) : (
                                  <Home size={15} />
                                )}
                              </div>
                              <span
                                style={{
                                  color: '#0f172a',
                                  fontSize: '13.5px',
                                  fontWeight: 600,
                                }}
                              >
                                {u.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <code
                              style={{
                                background: '#f8fafc',
                                padding: '3px 8px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                color: '#0369a1',
                                border: '1px solid #e2e8f0',
                                fontWeight: 600,
                                letterSpacing: '0.3px',
                              }}
                            >
                              {u.code}
                            </code>
                          </td>
                          <td>
                            <span
                              className={`sos-badge ${typeBadgeClass}`}
                              style={{ fontSize: '11.5px', padding: '3px 8px', fontWeight: 600 }}
                            >
                              {typeLabel}
                            </span>
                          </td>
                          <td>
                            {mgr ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                                    {mgr.managerName}
                                  </span>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '10.5px',
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      border: '1px solid #bbf7d0',
                                    }}
                                  >
                                    <CheckCircle2 size={10} color="#15803d" />
                                    Đã có quản lý
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{mgr.position || mgr.department || 'Cán bộ phụ trách'}</span>
                                  {mgr.phone && (
                                    <span style={{ color: '#0284c7', fontWeight: 600 }}>
                                      • {mgr.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                  <span style={{ fontWeight: 500, color: '#64748b', fontSize: '13px' }}>
                                    Chưa có cán bộ quản lý
                                  </span>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '10.5px',
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      background: '#fef2f2',
                                      color: '#b91c1c',
                                      border: '1px solid #fecaca',
                                    }}
                                  >
                                    <UserX size={10} color="#b91c1c" />
                                    Chưa phân công
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                  Chưa gán tài khoản địa phương phụ trách
                                </div>
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                color: '#16a34a',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                padding: '3px 8px',
                                borderRadius: '12px',
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                              HOẠT ĐỘNG
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // TẦNG 1: DANH MỤC CÁC TỈNH / THÀNH PHỐ VIỆT NAM (CHUẨN 34 TỈNH THÀNH MỚI)
    const filteredProvinces = vietnamProvinces.filter((p) => {
      if (!provinceSearchQuery.trim()) return true;
      const q = provinceSearchQuery.toLowerCase();
      return (p.name || '').toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q) || (p.isoCode || '').toLowerCase().includes(q);
    });

    return (
      <div className="sos-views-container">
        {/* STATS TỔNG QUAN CÁC TỈNH THÀNH VIỆT NAM */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue">
              <Globe2 size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{vietnamProvinces.length || 34}</span>
              <span className="sos-stat-label">34 Tỉnh / Thành Phố Cả Nước</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow">
              <Building2 size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">Toàn Quốc</span>
              <span className="sos-stat-label">Phạm Vi Quản Trị Hệ Thống</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green">
              <Layers size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">Mô Hình 2025</span>
              <span className="sos-stat-label">34 Đơn Vị Cấp Tỉnh Mới</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon purple">
              <Shield size={22} />
            </div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">2 Tầng</span>
              <span className="sos-stat-label">Tỉnh Thành ➔ Xã Phường Con</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div>
              <div className="sos-view-card-title">
                <Globe2 size={18} color="#0284c7" />
                <span>Danh Mục Tỉnh / Thành Phố Việt Nam ({filteredProvinces.length}/{vietnamProvinces.length} đơn vị cấp tỉnh)</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                Nhấn vào từng Tỉnh / Thành phố để xem danh sách các Quận, Huyện, Xã, Phường trực thuộc
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Thanh tìm kiếm tỉnh thành */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Tìm tỉnh, thành phố (Hà Nội, Đà Nẵng, TP.HCM...)"
                  value={provinceSearchQuery}
                  onChange={(e) => setProvinceSearchQuery(e.target.value)}
                  style={{
                    padding: '7px 14px 7px 32px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                    minWidth: '280px',
                  }}
                />
              </div>

              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('rescuesos_vietnam_34_provinces_v2');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v4');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v3');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v2');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v1');
                  } catch {}
                  setRefreshIndex((p) => p + 1);
                }}
                className="sos-btn-refresh"
              >
                <RefreshCw size={14} className={provincesLoading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Tên Tỉnh / Thành Phố</th>
                  <th style={{ width: '22%' }}>Mã ISO / Ký hiệu</th>
                  <th style={{ width: '20%' }}>Cấp hành chính</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>Thao tác phân cấp</th>
                </tr>
              </thead>
              <tbody>
                {provincesLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0284c7' }} />
                      Đang đồng bộ danh mục các Tỉnh / Thành phố Việt Nam từ API bản đồ...
                    </td>
                  </tr>
                ) : filteredProvinces.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      Không tìm thấy Tỉnh / Thành phố nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredProvinces.map((prov) => {
                    const isTWCity =
                      prov.name.toLowerCase().includes('thành phố') ||
                      prov.name.toLowerCase().includes('tp');

                    return (
                      <tr
                        key={prov.id}
                        onClick={() => handleSelectProvince(prov)}
                        style={{ cursor: 'pointer', height: '54px' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: isTWCity ? 'rgba(2, 132, 199, 0.1)' : 'rgba(124, 58, 237, 0.1)',
                                color: isTWCity ? '#0284c7' : '#7c3aed',
                              }}
                            >
                              <Globe2 size={15} />
                            </div>
                            <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>
                              {prov.name}
                            </span>
                          </div>
                        </td>
                        <td>
                          <code
                            style={{
                              background: '#f8fafc',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              color: '#0369a1',
                              border: '1px solid #e2e8f0',
                              fontWeight: 600,
                              letterSpacing: '0.3px',
                            }}
                          >
                            {prov.isoCode || prov.ref || 'VN-PROV'}
                          </code>
                        </td>
                        <td>
                          <span
                            className={`sos-badge ${isTWCity ? 'verified' : 'default'}`}
                            style={{ fontSize: '11.5px', padding: '3px 8px', fontWeight: 600 }}
                          >
                            {isTWCity ? 'Thành phố TW' : 'Tỉnh'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProvince(prov);
                            }}
                            className="sos-btn-filter-pill active-blue"
                            style={{ fontSize: '12px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>Xem Xã Phường</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 13. ADMIN: PHÂN QUYỀN (UC-A06)
   * ------------------------------------------------------------- */
  if (activeKey === 'rbac') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Shield size={18} color="#ef4444" />
            <span>Ma Trận Phân Quyền Vai Trò Tác Chiến Hệ Thống (RBAC Chuẩn SaaS)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Vai trò (Role)</th>
                  <th>Nền tảng</th>
                  <th>Quyền tiếp nhận SOS</th>
                  <th>Quyền điều phối lực lượng</th>
                  <th>Quản trị người dùng</th>
                  <th>Quản trị hệ thống</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>CITIZEN (Người dân)</strong></td>
                  <td>Mobile App</td>
                  <td>❌ Chỉ gửi SOS của mình</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong>RESCUER (Cứu hộ viên)</strong></td>
                  <td>Mobile App</td>
                  <td>✅ Nhận nhiệm vụ được giao</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#38bdf8' }}>LOCAL_AUTHORITY (Địa phương)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn địa bàn</td>
                  <td>✅ Toàn quyền điều phối</td>
                  <td>❌ Giới hạn đội cứu hộ</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#ef4444' }}>ADMIN (Quản trị viên)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn hệ thống</td>
                  <td>✅ Giám sát toàn bộ</td>
                  <td>✅ Toàn quyền quản trị</td>
                  <td>✅ Toàn quyền hệ thống</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 14. NHẬT KÝ TÁC CHIẾN & HỆ THỐNG (UC-A09 / UC-L16)
   * ------------------------------------------------------------- */
  if (activeKey === 'audit_logs' || activeKey === 'operation_logs') {
    const displayAuditLogs = auditLogs.length > 0 ? auditLogs : FALLBACK_AUDIT_LOGS;

    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <History size={18} color="#eab308" />
              <span>Nhật Ký Tác Chiến &amp; Lịch Sử Điều Hành Thực Địa ({displayAuditLogs.length} sự kiện)</span>
            </div>
            <button
              type="button"
              className="sos-btn-action"
              style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
              onClick={refreshData}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
          <div className="sos-timeline">
            {displayAuditLogs.map((log) => {
              const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
              return (
                <div key={log._id} className="sos-timeline-item">
                  <div className="sos-timeline-dot" />
                  <div className="sos-timeline-content">
                    <div className="sos-timeline-time">
                      {new Date(log.createdAt).toLocaleString('vi-VN')}
                    </div>
                    <div className="sos-timeline-text">
                      <strong>[{log.actorRole || 'CHỈ HUY'}] {actor?.fullName || actor?.email || 'Ban Chỉ Huy Tác Chiến'}</strong>
                      {' '}thực hiện hành động{' '}
                      <strong style={{ color: '#38bdf8' }}>{log.action}</strong>
                      {' '}đối với <strong>{log.entityType}</strong>
                      {log.metadata && (
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px', background: 'rgba(0,0,0,0.03)', padding: '5px 10px', borderRadius: '4px' }}>
                          Chi tiết: {JSON.stringify(log.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 15. CÀI ĐẶT HỆ THỐNG - TRUNG TÂM CẤU HÌNH TÁC CHIẾN SAAS
   * ------------------------------------------------------------- */
  if (activeKey === 'settings') {
    return (
      <div className="sos-views-container">
        {/* Toast thông báo lưu thành công */}
        {settingsSavedToast && (
          <div className="sos-profile-toast-success">
            <Check size={16} />
            <span>Cấu hình cài đặt hệ thống đã được lưu thành công!</span>
          </div>
        )}

        <form onSubmit={handleSaveSystemSettings}>
          <div className="sos-view-card" style={{ marginBottom: '20px' }}>
            <div className="sos-view-card-header">
              <div className="sos-view-card-title">
                <Sliders size={20} color="#2563eb" />
                <span>Trung Tâm Cài Đặt Hệ Thống &amp; Cấu Hình Tác Chiến Cứu Hộ</span>
              </div>
              <button type="submit" className="sos-hotline-btn" style={{ background: '#2563eb', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' }}>
                <Check size={16} />
                <span>Lưu Cấu Hình Cài Đặt</span>
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
              Thiết lập các tham số điều hành tự động, ngưỡng cảnh báo âm thanh, bán kính phân bổ lực lượng và hạ tầng bản đồ GIS trên địa bàn.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* NHÓM 1: KÊNH TIẾP NHẬN & HOTLINE */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <PhoneCall size={18} color="#ef4444" />
                  <h4>1. Kênh Tiếp Nhận &amp; Đầu Mối Hotline</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Đầu số Hotline khẩn cấp:</label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={systemSettings.hotline}
                      onChange={(e) => setSystemSettings({ ...systemSettings, hotline: e.target.value })}
                      placeholder="VD: 0236 3822 114 / 112"
                    />
                  </div>
                  <div className="sos-settings-row">
                    <label>Đơn vị chỉ huy trực ban tiếp nhận:</label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={systemSettings.headquarters}
                      onChange={(e) => setSystemSettings({ ...systemSettings, headquarters: e.target.value })}
                      placeholder="VD: Ban Chỉ Huy PCTT & TKCN TP Đà Nẵng"
                    />
                  </div>
                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Còi hú âm thanh Siren khi có SOS mới</strong>
                      <p>Phát âm thanh cảnh báo to rõ ngay khi hệ thống tiếp nhận ca cứu nạn</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.sirenSound}
                        onChange={(e) => setSystemSettings({ ...systemSettings, sirenSound: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Thông báo đẩy Web Push Notifications</strong>
                      <p>Gửi thông báo nổi trên màn hình máy tính ngay cả khi chuyển tab khác</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.pushNotifications}
                        onChange={(e) => setSystemSettings({ ...systemSettings, pushNotifications: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 2: BÁN KÍNH & QUY CHUẨN ĐIỀU PHỐI */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Compass size={18} color="#0284c7" />
                  <h4>2. Bán Kính Quét &amp; Tiêu Chuẩn Phân Bổ</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label>Bán kính quét đội cứu hộ gần nhất:</label>
                      <strong style={{ color: '#0284c7' }}>{systemSettings.scanRadiusKm} km</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={25}
                      step={1}
                      value={systemSettings.scanRadiusKm}
                      onChange={(e) => setSystemSettings({ ...systemSettings, scanRadiusKm: Number(e.target.value) })}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <small style={{ color: '#94a3b8' }}>Tự động dò tìm các đội ca-nô và lực lượng cứu hộ trong bán kính cài đặt.</small>
                  </div>

                  <div className="sos-settings-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label>Thời gian tự động nâng cấp mức cảnh báo:</label>
                      <strong style={{ color: '#ef4444' }}>{systemSettings.autoEscalateMinutes} phút</strong>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={30}
                      step={1}
                      value={systemSettings.autoEscalateMinutes}
                      onChange={(e) => setSystemSettings({ ...systemSettings, autoEscalateMinutes: Number(e.target.value) })}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <small style={{ color: '#94a3b8' }}>Nếu ca SOS chưa có đội cứu hộ nhận sau khoảng thời gian này, hệ thống sẽ báo động đỏ.</small>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Tự động đề xuất phương tiện phù hợp</strong>
                      <p>Gợi ý ca-nô hoặc xe lội nước 4x4 tùy thuộc vào độ sâu ngập úng</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.autoSuggestVehicles}
                        onChange={(e) => setSystemSettings({ ...systemSettings, autoSuggestVehicles: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 3: HẠ TẦNG BẢN ĐỒ & HIỂN THỊ GIS */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Layers size={18} color="#10b981" />
                  <h4>3. Hạ Tầng Bản Đồ GIS Thực Địa</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Lớp bản đồ nền mặc định:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'vector'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'vector' })}
                        />
                        <span>Bản đồ Tác Chiến Vector (Độ tương phản cao, tối ưu thực địa)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'satellite'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'satellite' })}
                        />
                        <span>Bản đồ Ảnh Vệ Tinh Độ Phân Giải Cao (Quan sát địa hình sông núi)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'flood'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'flood' })}
                        />
                        <span>Lớp Thủy Văn Cảnh Báo Ngập Úng &amp; Triều Cường Đà Nẵng</span>
                      </label>
                    </div>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Tự động bay camera (Auto Fly-To) đến ca SOS mới</strong>
                      <p>Khi có yêu cầu cứu nạn khẩn cấp, bản đồ tự động di chuyển tâm về vị trí người dân</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.autoFlyToNewSos}
                        onChange={(e) => setSystemSettings({ ...systemSettings, autoFlyToNewSos: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Hiển thị ranh giới 15 phường/xã Đà Nẵng</strong>
                      <p>Vẽ viền ranh giới hành chính để dễ dàng phân chia khu vực phụ trách</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.showAdminBoundaries}
                        onChange={(e) => setSystemSettings({ ...systemSettings, showAdminBoundaries: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 4: TẦN SUẤT ĐỒNG BỘ DỮ LIỆU */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Wifi size={18} color="#8b5cf6" />
                  <h4>4. Tần Suất Đồng Bộ Dữ Liệu Thời Gian Thực</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Chu kỳ làm mới dữ liệu với Server:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 6 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 6 ? 'active blue' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        6 Giây (Nhanh)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 15 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 15 ? 'active green' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        15 Giây (Chuẩn)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 30 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 30 ? 'active' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        30 Giây (Tiết kiệm)
                      </button>
                    </div>
                    <small style={{ color: '#94a3b8', marginTop: '6px', display: 'block' }}>
                      Tần suất càng nhanh giúp cập nhật tọa độ ca-nô và trạng thái SOS tức thì.
                    </small>
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px 14px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#059669', animation: 'pulseLive 1.5s infinite' }} />
                    <div style={{ fontSize: '12.5px', color: '#065f46' }}>
                      <strong>Realtime WebSocket:</strong> Kết nối trực tiếp máy chủ cứu hộ TP Đà Nẵng hoạt động 99.9%
                    </div>
                  </div>

                  {systemSettings.lastUpdated && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#94a3b8', textAlign: 'right' }}>
                      Cập nhật lần cuối: {new Date(systemSettings.lastUpdated).toLocaleString('vi-VN')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setSystemSettings(DEFAULT_SYSTEM_SETTINGS)}
                className="sos-btn-action"
                style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}
              >
                Khôi phục mặc định
              </button>
              <button
                type="submit"
                className="sos-hotline-btn"
                style={{ padding: '10px 24px', fontSize: '13.5px', background: '#2563eb' }}
              >
                <Check size={16} />
                <span>Lưu Cấu Hình Cài Đặt</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return null;
};

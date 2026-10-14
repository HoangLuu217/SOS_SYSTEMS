import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  verifySosRequest,
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
  createHazardReport,
  reviewHazardReport,
  deleteHazardReport,
  subscribeHazardEvents,
  fetchSafeLocations,
  createSafeLocation,
} from '../services/api';
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
  Eye,
  Trash2,
  X,
  ExternalLink,
  Edit,
  Plus,
  PlusCircle,
  Home,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Navigation,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './DashboardViews.css';

import { domainDService, JURISDICTION_CONFIGS } from '../services/domainDService';
import { resolveGoogleMapsInput } from '../utils/mapLinkParser';

// Danh sách 6 loại hiểm họa thiên tai đồng bộ chuẩn theo Ảnh 2
export const HAZARD_TYPE_OPTIONS = [
  { key: 'FLOOD', label: 'Ngập lụt' },
  { key: 'LANDSLIDE', label: 'Sạt lở đất' },
  { key: 'FALLEN_TREE', label: 'Cây đổ / Cản trở' },
  { key: 'ELECTRICAL', label: 'Sự cố điện' },
  { key: 'ROAD_DAMAGE', label: 'Hư hỏng đường' },
  { key: 'OTHER', label: 'Nguy hiểm khác' },
];

// Component Render Icon Loại nguy hiểm theo đúng thiết kế Ảnh 2
export const HazardTypeIcon: React.FC<{
  type: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ type, size = 20, color = 'currentColor', style }) => {
  switch (type) {
    case 'FLOOD':
      // 1. Ngập lụt: Giọt nước có dấu chấm than ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M12 2.5C12 2.5 5.5 11 5.5 16C5.5 19.866 8.41 23 12 23C15.866 23 19 19.866 19 16C19 11 12 2.5 12 2.5Z"
            fill={color}
          />
          <path
            d="M12 9.5V14.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="18" r="1.2" fill="white" />
        </svg>
      );

    case 'LANDSLIDE':
      // 2. Sạt lở đất: 2 đỉnh núi đá dốc (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M2.5 19.5L10 6.5L14.5 13.5L17.5 9.5L22 19.5H2.5Z"
            fill={color}
          />
          <path
            d="M14.5 13.5L12 19.5"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'FALLEN_TREE':
    case 'OBSTACLE':
      // 3. Cây đổ / Cản trở: Cây xanh tán tròn có thân (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M12 3C9 3 6.8 5.1 6.8 7.8C6.8 8.1 6.85 8.4 6.9 8.7C5.2 9.3 4 10.9 4 12.8C4 15.3 6 17.2 8.5 17.2H10.5V21H13.5V17.2H15.5C18 17.2 20 15.3 20 12.8C20 10.8 18.7 9.2 16.9 8.6C16.9 8.3 17 8.1 17 7.8C17 5.1 14.8 3 12 3Z"
            fill={color}
          />
        </svg>
      );

    case 'ELECTRICAL':
      // 4. Sự cố điện: Tia sét kèm dấu chấm than (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M11 2L4 12.5H9L7 21.5L15 9.5H10L12 2H11Z"
            fill={color}
          />
          <path
            d="M18.5 7V13.5"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="18.5" cy="17" r="1.3" fill={color} />
        </svg>
      );

    case 'ROAD_DAMAGE':
    case 'EROSION':
      // 5. Hư hỏng đường: Con đường có 2 lề đường và vạch phân làn ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path d="M4.5 4H8L6.5 20H3L4.5 4Z" fill={color} />
          <path d="M16 4H19.5L21 20H17.5L16 4Z" fill={color} />
          <path d="M11 4.5H13V8H11V4.5Z" fill={color} />
          <path d="M11 10.5H13V14H11V10.5Z" fill={color} />
          <path d="M11 16.5H13V20H11V16.5Z" fill={color} />
        </svg>
      );

    case 'OTHER':
    default:
      // 6. Nguy hiểm khác: Hình tròn có dấu chấm than ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <circle cx="12" cy="12" r="9.5" fill={color} />
          <path
            d="M12 7.5V13"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.5" r="1.3" fill="white" />
        </svg>
      );
  }
};

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

// Component Bản đồ nhỏ (Mini Map) cho điểm nguy hiểm với khả năng tương tác chọn tọa độ mượt mà
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
  const isDraggingRef = useRef<boolean>(false);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  // Khởi tạo Leaflet Map 1 lần duy nhất trên container để tránh giật lag khi kéo ghim / bản đồ
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 16.0570;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : 108.2170;

    const map = L.map(containerRef.current, {
      center: [validLat, validLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      wheelDebounceTime: 40,
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

    marker
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
          title || 'Vị trí điểm nguy hiểm'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      )
      .openPopup();

    if (interactive) {
      marker.on('dragstart', () => {
        isDraggingRef.current = true;
      });
      marker.on('dragend', (e: any) => {
        isDraggingRef.current = false;
        const pos = e.target.getLatLng();
        onLocationChangeRef.current?.(pos.lat, pos.lng);
        marker
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
              title || 'Vị trí điểm nguy hiểm'
            }<br/><span style="color:#64748b;font-weight:normal;">[${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}]</span></div>`
          )
          .openPopup();
      });
      map.on('click', (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        marker.setLatLng([clickLat, clickLng]);
        onLocationChangeRef.current?.(clickLat, clickLng);
        marker
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
              title || 'Vị trí điểm nguy hiểm'
            }<br/><span style="color:#64748b;font-weight:normal;">[${clickLat.toFixed(5)}, ${clickLng.toFixed(5)}]</span></div>`
          )
          .openPopup();
      });
    }

    markerRef.current = marker;
    mapRef.current = map;

    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    const t2 = setTimeout(() => {
      map.invalidateSize();
    }, 350);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Cập nhật vị trí ghim và tâm bản đồ mượt mà khi props lat/lng thay đổi từ bên ngoài (nhập tay tọa độ)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || isDraggingRef.current) return;
    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 16.0570;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : 108.2170;
    const curr = markerRef.current.getLatLng();
    if (Math.abs(curr.lat - validLat) > 0.00001 || Math.abs(curr.lng - validLng) > 0.00001) {
      markerRef.current.setLatLng([validLat, validLng]);
      mapRef.current.panTo([validLat, validLng], { animate: true, duration: 0.25 });
      markerRef.current.setPopupContent(
        `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
          title || 'Vị trí điểm nguy hiểm'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      );
    }
  }, [lat, lng, title]);

  // Cập nhật icon ghim khi đổi loại hiểm họa mà không reload bản đồ
  useEffect(() => {
    if (!markerRef.current) return;
    const pinHtml = getHazardMarkerHtml(hazardType);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });
    markerRef.current.setIcon(customIcon);
  }, [hazardType]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '260px',
        borderRadius: '10px',
        border: '1px solid #cbd5e1',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
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
  const [orgs, setOrgs] = useState<AuthorityOrgItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

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
    customHazardType?: string;
    coordinates?: string;
    general?: string;
  }>({});

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

  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  // Tải dữ liệu từ database tương ứng với activeKey
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Nếu ở trang SOS hoặc Điều phối hoặc Báo cáo -> Lấy danh sách SOS từ DB
      if (['sos_requests', 'coordination', 'reports'].includes(activeKey)) {
        const res = await fetchSosRequests();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSosList(res.data);
        } else {
          // Fallback từ domainDService
          const fallbackSos: SosRequestItem[] = domainDService.getSosRequests().map((s) => ({
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

      // 8. Nếu ở trang Khu vực hành chính -> Lấy Administrative Areas
      if (activeKey === 'areas') {
        const res = await fetchAdministrativeAreas();
        if (res.success && Array.isArray(res.data)) {
          setAreas(res.data);
        }
      }

      // 9. Nếu ở trang Nhật ký hệ thống -> Lấy Audit Logs
      if (activeKey === 'audit_logs') {
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
  }, [activeKey, hotlineForm.areaId, user?.authority?.areaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

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

  // Hành động 1: Xác minh SOS (PENDING -> VERIFIED)
  const handleVerifySos = async (sosId: string, currentPriority: string) => {
    try {
      setLoading(true);
      await verifySosRequest(sosId, { priority: currentPriority, status: 'VERIFIED' });
      alert('✅ Đã xác minh yêu cầu cứu nạn SOS thành công trên cơ sở dữ liệu!');
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err.message || 'Không thể xác minh'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 2: Hoàn thành SOS (COMPLETED)
  const handleCompleteSos = async (sosId: string) => {
    try {
      setLoading(true);
      await completeSosRequest(sosId);
      alert('✅ Đã đóng yêu cầu cứu nạn (COMPLETED) trong cơ sở dữ liệu!');
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err.message || 'Không thể hoàn thành'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 3: Tiếp nhận SOS qua Hotline (Lưu trực tiếp vào MongoDB)
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
      alert('✅ Đã lưu và phát cảnh báo thiên tai thành công trên cơ sở dữ liệu!');
      setAlertForm({ title: '', content: '', type: 'FLOOD', severity: 'HIGH', areaId: user?.authority?.areaId || areas[0]?._id || '' });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi phát cảnh báo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 7: Thêm điểm trú ẩn an toàn mới (Lưu vào MongoDB safe_locations)
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

      alert('✅ Đã thêm điểm trú ẩn / trạm an toàn mới vào cơ sở dữ liệu thành công!');
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

  /* -------------------------------------------------------------
   * 1. LOCAL AUTHORITY: TIẾP NHẬN & XÁC MINH SOS (UC-L02, UC-L05, UC-L06)
   * ------------------------------------------------------------- */
  if (activeKey === 'sos_requests') {
    const totalCount = sosList.length;
    const pendingCount = sosList.filter((s) => s.status === 'PENDING').length;
    const verifiedCount = sosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
    const completedCount = sosList.filter((s) => s.status === 'COMPLETED').length;

    return (
      <div className="sos-views-container">
        {/* KPI stats lấy trực tiếp từ MongoDB */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCount}</span>
              <span className="sos-stat-label">Tổng SOS Tiếp Nhận (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Clock size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{pendingCount}</span>
              <span className="sos-stat-label">Chờ Xác Minh (PENDING)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{verifiedCount}</span>
              <span className="sos-stat-label">Đang Điều Phối / Cứu Hộ</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><FileCheck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{completedCount}</span>
              <span className="sos-stat-label">Đã Cứu Hộ Thành Công</span>
            </div>
          </div>
        </div>

        {/* Bảng danh sách SOS từ Database */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Siren size={18} color="#ef4444" />
              <span>Dữ liệu SOS thực tế từ Cơ sở dữ liệu MongoDB ({totalCount} yêu cầu)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="sos-btn-action sos-btn-refresh"
                onClick={refreshData}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
              <button
                type="button"
                className="sos-hotline-btn"
                onClick={() => setShowHotlineModal(true)}
              >
                <PhoneCall size={15} />
                <span>+ Tiếp nhận qua Điện thoại (Hotline)</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Mã SOS</th>
                  <th>Người dân / Liên hệ</th>
                  <th>Địa điểm / Tọa độ</th>
                  <th>Số người</th>
                  <th>Mức độ</th>
                  <th>Trạng thái</th>
                  <th>Hành động nghiệp vụ</th>
                </tr>
              </thead>
              <tbody>
                {loading && sosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
                      <p style={{ marginTop: '8px', color: '#94a3b8' }}>Đang tải dữ liệu từ database...</p>
                    </td>
                  </tr>
                ) : sosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      Chưa có yêu cầu cứu nạn nào trong cơ sở dữ liệu. Nhấn "Tiếp nhận qua Điện thoại" để tạo mới!
                    </td>
                  </tr>
                ) : (
                  sosList.map((sos) => {
                    const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                    return (
                      <tr key={sos._id}>
                        <td><strong>{sos.sosCode}</strong></td>
                        <td>
                          <div><strong>{citizenInfo?.fullName || 'Người dân'}</strong></div>
                          <small style={{ color: '#94a3b8' }}>{citizenInfo?.phone || 'Chưa có SĐT'}</small>
                        </td>
                        <td>
                          <div>{sos.address}</div>
                          {sos.location?.coordinates && (
                            <small style={{ color: '#64748b' }}>
                              [{sos.location.coordinates[0].toFixed(4)}, {sos.location.coordinates[1].toFixed(4)}]
                            </small>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: sos.people > 2 ? '#ef4444' : 'inherit' }}>
                            {sos.people} người
                          </strong>
                        </td>
                        <td>
                          <span className={`sos-badge ${sos.priority.toLowerCase()}`}>
                            {sos.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`sos-badge ${sos.status.toLowerCase()}`}>
                            {sos.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {sos.status === 'PENDING' && (
                              <button
                                type="button"
                                className="sos-btn-action success"
                                onClick={() => handleVerifySos(sos._id, sos.priority)}
                              >
                                <CheckCircle2 size={13} /> Duyệt (VERIFY)
                              </button>
                            )}
                            {sos.status !== 'COMPLETED' && sos.status !== 'CANCELLED' && sos.status !== 'REJECTED' && (
                              <button
                                type="button"
                                className="sos-btn-action primary"
                                onClick={onOpenMap}
                              >
                                Bản đồ
                              </button>
                            )}
                            {['VERIFIED', 'ON_THE_WAY', 'RESCUING'].includes(sos.status) && (
                              <button
                                type="button"
                                className="sos-btn-action success"
                                onClick={() => handleCompleteSos(sos._id)}
                              >
                                Hoàn thành
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
    const activeMissions = sosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status));

    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Radio size={18} color="#0284c7" />
              <span>Tiến Trình Điều Phối Thực Địa Từ Cơ Sở Dữ Liệu ({activeMissions.length} vụ đang xử lý)</span>
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
                  <th>Địa điểm</th>
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
                      Hiện chưa có yêu cầu nào trong trạng thái điều phối. Hãy vào tab "Tiếp nhận &amp; Xác minh SOS" để duyệt các yêu cầu mới!
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
                          Xác nhận hoàn thành (COMPLETED)
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
    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rescuers.length}</span>
              <span className="sos-stat-label">Tổng cứu hộ viên (MongoDB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rescuers.filter((r) => r.rescuer?.availabilityStatus === 'AVAILABLE').length}</span>
              <span className="sos-stat-label">Sẵn sàng (AVAILABLE)</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Users size={18} color="#38bdf8" />
            <span>Danh Sách Lực Lượng Cứu Hộ Lấy Từ Database User (Roles: RESCUER)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Kỹ năng chuyên môn</th>
                  <th>Phương tiện</th>
                  <th>Trạng thái sẵn sàng</th>
                  <th>Xác minh</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có cứu hộ viên nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  rescuers.map((r) => (
                    <tr key={r._id}>
                      <td><strong>{r.fullName}</strong></td>
                      <td>{r.phone || 'Chưa cập nhật'}</td>
                      <td>{r.rescuer?.skills?.join(', ') || 'Cứu nạn tổng hợp'}</td>
                      <td>{r.rescuer?.vehicleType || 'Thuyền / Cano'}</td>
                      <td>
                        <span className="sos-badge active">
                          {r.rescuer?.availabilityStatus || 'AVAILABLE'}
                        </span>
                      </td>
                      <td>
                        <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                          {r.rescuer?.verificationStatus || 'PENDING'}
                        </span>
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
   * 4. LOCAL AUTHORITY: NGUỒN LỰC & PHƯƠNG TIỆN (UC-L11)
   * ------------------------------------------------------------- */
  if (activeKey === 'resources') {
    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{vehicles.length} Phương Tiện</span>
              <span className="sos-stat-label">Đã đăng ký trong MongoDB</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Truck size={18} color="#f59e0b" />
            <span>Phương Tiện Cứu Trợ Lấy Từ Collection `vehicles` ({vehicles.length} xe/cano)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Biển số / Định danh</th>
                  <th>Loại phương tiện</th>
                  <th>Sức chứa</th>
                  <th>Mô tả trang bị</th>
                  <th>Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có phương tiện nào trong database.
                    </td>
                  </tr>
                ) : (
                  vehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.plateNumber}</strong></td>
                      <td>{v.type}</td>
                      <td><strong>{v.capacity} người</strong></td>
                      <td>{v.description || 'Phương tiện cứu nạn chuyên dụng'}</td>
                      <td><span className="sos-badge active">{v.status}</span></td>
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
   * 5. LOCAL AUTHORITY: PHÁT CẢNH BÁO CHO NGƯỜI DÂN ĐỊA PHƯƠNG (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'alerts') {
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
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Dữ liệu lưu trực tiếp vào Collection `alerts` MongoDB
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

          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                <span>{loading ? 'Đang phát cảnh báo...' : '📢 Phát Cảnh Báo Cho Người Dân Địa Phương Vào Database'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách cảnh báo đang lưu trong DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#0284c7" />
              <span>Cảnh Báo Đang Hoạt Động Trên Địa Bàn ({alerts.length})</span>
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
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có cảnh báo nào trong khu vực.
                    </td>
                  </tr>
                ) : (
                  alerts.map((al) => {
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
   * 5b. LOCAL AUTHORITY: ĐIỂM TRÚ ẨN & TRẠM AN TOÀN (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'shelters') {
    const totalCapacity = shelters.reduce((acc, curr) => acc + (curr.capacity || 0), 0);
    const totalOccupancy = shelters.reduce((acc, curr) => acc + (curr.currentOccupancy || 0), 0);
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
              <span className="sos-stat-value">{shelters.length} Điểm</span>
              <span className="sos-stat-label">Tổng điểm trú ẩn &amp; trạm an toàn (DB)</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCapacity} Chỗ</span>
              <span className="sos-stat-label">Tổng sức chứa người dân tối đa</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Home size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalOccupancy} Người</span>
              <span className="sos-stat-label">Người dân đang tạm trú an toàn</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{availableSlots} Chỗ</span>
              <span className="sos-stat-label">Sức chứa còn khả dụng tiếp nhận</span>
            </div>
          </div>
        </div>

        {/* Danh sách các Điểm Trú Ẩn lấy từ DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Shield size={18} color="#22c55e" />
              <span>Danh Sách Điểm Trú Ẩn &amp; Trạm Y Tế An Toàn Địa Phương ({shelters.length})</span>
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
                {shelters.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có điểm trú ẩn nào trong database. Hãy nhấn "Thêm Điểm Trú Ẩn Mới".
                    </td>
                  </tr>
                ) : (
                  shelters.map((sh) => {
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Thêm Điểm Trú Ẩn Mới (Lưu MongoDB) */}
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
                    <span>{loading ? 'Đang lưu vào DB...' : 'Lưu Điểm Trú Ẩn Vào Database'}</span>
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
   * Giao diện tối giản, chuẩn mực hành chính, không màu mè.
   * Icon loại nguy hiểm chuẩn theo Ảnh 2.
   * Địa bàn quản lý cố định tuyệt đối theo tài khoản cán bộ quản lý.
   * ------------------------------------------------------------- */
  if (activeKey === 'hazard_reports') {
    domainDService.syncFromStoredAuthUser();
    const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_auth_user') : null;
    const authUser = authUserStr ? JSON.parse(authUserStr) : null;
    const activeOfficer = domainDService.getActiveOfficer();

    // 1. XÁC ĐỊNH ĐỊA BÀN PHÂN CÔNG QUẢN LÝ CỐ ĐỊNH (KHÔNG CHO PHÉP THAY ĐỔI)
    const determineOfficerJurKey = (): string => {
      const dept = (
        (authUser?.authority?.department || '') + ' ' +
        (authUser?.authority?.position || '') + ' ' +
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

      // Fallback: nếu trong localStorage trước đó đã lưu key hợp lệ thì sử dụng, mặc định là Hải Châu
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_authority_jurisdiction_key') : null;
      if (stored && JURISDICTION_CONFIGS[stored] && stored !== 'toan_thanh_pho') return stored;
      return 'hai_chau';
    };

    const fixedJurKey = determineOfficerJurKey();
    const fixedJurisdictionConfig = JURISDICTION_CONFIGS[fixedJurKey] || JURISDICTION_CONFIGS.hai_chau;

    // Lưu lại key cố định này
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

      try {
        setSubmittingCreate(true);
        const payload = {
          title: createTitle.trim(),
          description: createDescription.trim() || `Điểm nguy hiểm ${createTitle.trim()} tại ${createAddress.trim()}`,
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
          alert(res.message || 'Tạo điểm nguy hiểm thành công!');
        } else {
          setCreateErrors((prev) => ({
            ...prev,
            general: 'Không thể tạo điểm nguy hiểm. Vui lòng kiểm tra lại!',
          }));
        }
      } catch (err: any) {
        setCreateErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi tạo điểm nguy hiểm mới',
        }));
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
        setEditErrors((prev) => ({
          ...prev,
          general: err.message || 'Lỗi khi cập nhật thẩm định điểm nguy hiểm',
        }));
      } finally {
        setSubmittingReview(false);
      }
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
        }
      } catch (err: any) {
        alert(err.message || 'Lỗi khi cập nhật trạng thái duyệt');
      } finally {
        setLoading(false);
      }
    };

    const handleDeleteHazard = async (id: string, title?: string) => {
      const confirmed = window.confirm(
        `Bạn có chắc chắn muốn xóa điểm nguy hiểm "${title || 'này'}" không?\n\nĐiểm nguy hiểm này sẽ bị xóa khỏi cơ sở dữ liệu và bản đồ tác chiến.`
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
              onClick={onOpenMap}
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
                          alert(`Vui lòng nhập số trang từ 1 đến ${totalHazardPages}`);
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
                        alert(`Vui lòng nhập số trang từ 1 đến ${totalHazardPages}`);
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
                          <img
                            key={i}
                            src={imgUrl}
                            alt="Hiện trường"
                            onClick={() => setSelectedHazardPhoto(imgUrl)}
                            style={{
                              width: '100%',
                              height: '70px',
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

                {/* Cột 2: Bản đồ nhỏ hiển thị vị trí */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                        Vị trí hiện trường
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        [{detailHazard.location.coordinates[1].toFixed(5)}, {detailHazard.location.coordinates[0].toFixed(5)}]
                      </span>
                    </div>

                    <div style={{ flex: 1, minHeight: '280px' }}>
                      <HazardMiniMap
                        lat={detailHazard.location.coordinates[1]}
                        lng={detailHazard.location.coordinates[0]}
                        title={detailHazard.title}
                        hazardType={detailHazard.hazardType}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <a
                        href={`https://www.google.com/maps?q=${detailHazard.location.coordinates[1]},${detailHazard.location.coordinates[0]}`}
                        target="_blank"
                        rel="noreferrer"
                        className="sos-btn-flat"
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <ExternalLink size={13} />
                        <span>Google Maps</span>
                      </a>
                      <button
                        type="button"
                        className="sos-btn-flat primary"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => {
                          setDetailHazard(null);
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
                <button
                  type="button"
                  className="sos-btn-flat danger"
                  onClick={() => handleDeleteHazard(detailHazard._id, detailHazard.title)}
                  disabled={loading}
                >
                  <Trash2 size={14} />
                  <span>Xóa điểm này</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {detailHazard.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        className="sos-btn-flat danger"
                        onClick={() => {
                          const reason = prompt('Nhập lý do từ chối (tùy chọn):', 'Thông tin chưa đủ căn cứ');
                          if (reason !== null) {
                            handleQuickReview(detailHazard._id, 'REJECTED', reason);
                            setDetailHazard(null);
                          }
                        }}
                        disabled={loading}
                      >
                        <XCircle size={14} />
                        <span>Từ chối</span>
                      </button>
                      <button
                        type="button"
                        className="sos-btn-flat success"
                        onClick={() => handleOpenReviewModal(detailHazard)}
                        disabled={loading}
                      >
                        <Edit size={14} />
                        <span>Duyệt &amp; Chuẩn hóa</span>
                      </button>
                    </>
                  )}

                  {detailHazard.status === 'APPROVED' && (
                    <button
                      type="button"
                      className="sos-btn-flat"
                      onClick={() => handleOpenReviewModal(detailHazard)}
                      disabled={loading}
                    >
                      <Edit size={14} />
                      <span>Chỉnh sửa</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="sos-btn-flat"
                    onClick={() => setDetailHazard(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
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
                        Mô tả hiện trường &amp; Khuyến cáo an toàn
                      </label>
                      <textarea
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Mô tả mức độ nguy hiểm, hướng dẫn người dân tránh di chuyển qua đoạn này..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
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
                          <span>Dán link Google Maps để ghim vị trí</span>
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
                        Mô tả hiện trường &amp; Khuyến cáo an toàn
                      </label>
                      <textarea
                        rows={3}
                        value={createDescription}
                        onChange={(e) => setCreateDescription(e.target.value)}
                        placeholder="Mô tả hiện trạng hiểm họa, lưu ý hướng di chuyển, cảnh báo người dân không lưu thông..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
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
                          <span>Dán link Google Maps để ghim vị trí</span>
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
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 7. LOCAL AUTHORITY: BÁO CÁO THỐNG KÊ (UC-L14)
   * ------------------------------------------------------------- */
  if (activeKey === 'reports') {
    const totalSos = sosList.length;
    const completed = sosList.filter((s) => s.status === 'COMPLETED').length;
    const rate = totalSos > 0 ? ((completed / totalSos) * 100).toFixed(1) : '100';

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><BarChart3 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rate}%</span>
              <span className="sos-stat-label">Tỷ lệ hoàn thành nhiệm vụ</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSos}</span>
              <span className="sos-stat-label">Tổng vụ cứu nạn tiếp nhận</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">
                {sosList.reduce((acc, curr) => acc + (curr.people || 0), 0)} Người
              </span>
              <span className="sos-stat-label">Tổng số người dân cần hỗ trợ</span>
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
              <span className="sos-stat-value">{stats?.totalSos ?? 0}</span>
              <span className="sos-stat-label">Tổng SOS Toàn Quốc (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalCitizens ?? 0}</span>
              <span className="sos-stat-label">Người dân đăng ký (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalRescuers ?? 0}</span>
              <span className="sos-stat-label">Lực lượng cứu hộ (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><Building2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalVehicles ?? 0}</span>
              <span className="sos-stat-label">Phương tiện cứu trợ (DB)</span>
            </div>
          </div>
        </div>

        {/* Breakdown SOS theo mức độ từ DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 12 }}>
            <BarChart3 size={18} color="#ef4444" />
            <span>Phân bố Yêu cầu Cứu nạn SOS theo Trạng thái (Thống kê thực từ Database)</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {adminStats?.sosByStatus?.map((st) => (
              <div key={st.status} style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{st.status}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>{st.count}</div>
              </div>
            ))}
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
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Building2 size={18} color="#a855f7" />
            <span>Cán Bộ Địa Phương Từ Database ({authorities.length} cán bộ)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Đơn vị / Cơ quan</th>
                  <th>Chức vụ</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {authorities.map((a) => (
                  <tr key={a._id}>
                    <td><strong>{a.fullName}</strong></td>
                    <td>{a.email}</td>
                    <td>{a.phone}</td>
                    <td>{a.authority?.department || 'Ban chỉ huy PCTT'}</td>
                    <td>{a.authority?.position || 'Cán bộ tác chiến'}</td>
                    <td><span className="sos-badge active">{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Danh sách cơ quan */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Building2 size={18} color="#0284c7" />
            <span>Cơ Quan Chỉ Huy Từ Collection `authority_organizations` ({orgs.length} tổ chức)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên cơ quan</th>
                  <th>Mã cơ quan</th>
                  <th>Loại</th>
                  <th>Số điện thoại</th>
                  <th>Địa chỉ</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o._id}>
                    <td><strong>{o.name}</strong></td>
                    <td><code>{o.code}</code></td>
                    <td>{o.type}</td>
                    <td>{o.phone}</td>
                    <td>{o.address}</td>
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
   * 12. ADMIN: KHU VỰC HÀNH CHÍNH (UC-A05)
   * ------------------------------------------------------------- */
  if (activeKey === 'areas') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Globe2 size={18} color="#0284c7" />
            <span>Danh Mục Đơn Vị Hành Chính Từ Collection `administrative_areas` ({areas.length} khu vực)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên đơn vị</th>
                  <th>Mã định danh</th>
                  <th>Cấp hành chính</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((ar) => (
                  <tr key={ar._id}>
                    <td><strong>{ar.name}</strong></td>
                    <td><code>{ar.code}</code></td>
                    <td>{ar.type}</td>
                    <td><span className="sos-badge active">{ar.status}</span></td>
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
   * 13. ADMIN: PHÂN QUYỀN (UC-A06)
   * ------------------------------------------------------------- */
  if (activeKey === 'rbac') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Shield size={18} color="#ef4444" />
            <span>Ma Trận Phân Quyền Vai Trò Hệ Thống (RBAC Chuẩn Database)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Vai trò (Role)</th>
                  <th>Nền tảng</th>
                  <th>Quyền tiếp nhận SOS</th>
                  <th>Quyền điều phối lực lượng</th>
                  <th>Quản lý điểm nguy hiểm</th>
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
                  <td>⚠️ Gửi đóng góp (Chờ duyệt)</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong>RESCUER (Cứu hộ viên)</strong></td>
                  <td>Mobile App</td>
                  <td>✅ Nhận nhiệm vụ được giao</td>
                  <td>❌ Không</td>
                  <td>⚠️ Báo cáo hiểm họa (Chờ duyệt)</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#38bdf8' }}>LOCAL_AUTHORITY (Địa phương)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn địa bàn</td>
                  <td>✅ Toàn quyền điều phối</td>
                  <td><strong style={{ color: '#16a34a' }}>✅ Toàn quyền Tạo &amp; Duyệt địa bàn</strong></td>
                  <td>❌ Giới hạn đội cứu hộ</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#ef4444' }}>ADMIN (Quản trị viên)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn hệ thống</td>
                  <td>✅ Giám sát toàn bộ</td>
                  <td><strong style={{ color: '#16a34a' }}>✅ Toàn quyền Tạo &amp; Duyệt toàn TP</strong></td>
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
   * 14. ADMIN: NHẬT KÝ HỆ THỐNG (UC-A09)
   * ------------------------------------------------------------- */
  if (activeKey === 'audit_logs') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <History size={18} color="#eab308" />
              <span>Nhật Ký Tác Chiến Từ Collection `audit_logs` ({auditLogs.length} bản ghi)</span>
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
            {auditLogs.length === 0 ? (
              <p style={{ color: '#94a3b8', padding: '16px' }}>Chưa có bản ghi nhật ký nào trong database.</p>
            ) : (
              auditLogs.map((log) => {
                const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
                return (
                  <div key={log._id} className="sos-timeline-item">
                    <div className="sos-timeline-dot" />
                    <div className="sos-timeline-content">
                      <div className="sos-timeline-time">
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </div>
                      <div className="sos-timeline-text">
                        <strong>[{log.actorRole || 'SYSTEM'}] {actor?.fullName || actor?.email || 'Hệ thống'}</strong>
                        {' '}thực hiện hành động{' '}
                        <strong style={{ color: '#38bdf8' }}>{log.action}</strong>
                        {' '}trên thực thể <strong>{log.entityType}</strong>
                        {log.metadata && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            Chi tiết: {JSON.stringify(log.metadata)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

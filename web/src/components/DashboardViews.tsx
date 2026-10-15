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
  updateSafeLocation,
  deleteSafeLocation,
  createAdminUser,
  updateAdminUser,
  fetchAreaManagers,
  type AreaManagerInfo,
  broadcastNotificationApi,
  fetchBroadcastHistory,
  deleteBroadcastApi,
  type BroadcastItem,
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
  Hospital,
  LifeBuoy,
  BellRing,
  AlertTriangle,
  Zap,
  Megaphone,
  Smartphone,
  Info,
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
  UserPlus,
  Sliders,
  Compass,
  Layers,
  Wifi,
  Check,
  Boxes,
  Package,
  ArrowLeft,
  ChevronRight,
  UserCheck,
  UserX,
  EyeOff,
  RotateCcw,
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

// Component Render Icon Loại cơ sở an toàn / Điểm trú ẩn
export const ShelterTypeIcon: React.FC<{
  type: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ type, size = 20, color = 'currentColor', style }) => {
  switch (type) {
    case 'EVACUATION_CENTER':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      );
    case 'HOSPITAL':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 6v12M6 12h12"></path>
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        </svg>
      );
    case 'RESCUE_STATION':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      );
    case 'MEETING_POINT':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
          <line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>
      );
    case 'SHELTER':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      );
  }
};

// Danh mục loại cơ sở an toàn cho form chọn dạng thẻ grid
export const SHELTER_TYPE_CARDS = [
  { key: 'EVACUATION_CENTER', label: 'Trung tâm sơ tán', desc: 'Trường học, nhà văn hóa, trung tâm thi đấu' },
  { key: 'HOSPITAL', label: 'Trạm Y tế Dã chiến', desc: 'Bệnh viện, trung tâm cấp cứu khẩn cấp' },
  { key: 'SHELTER', label: 'Điểm trú kiên cố', desc: 'Trụ sở UBND, nhà cộng đồng cao tầng' },
  { key: 'RESCUE_STATION', label: 'Trạm cứu hộ tác chiến', desc: 'Đồn biên phòng, bến cano vượt lũ' },
  { key: 'MEETING_POINT', label: 'Điểm tập kết an toàn', desc: 'Khu đất cao, bãi đỗ tập trung di tản dân' },
];

// Hàm sinh mã icon ghim điểm an toàn trên Leaflet
export const getShelterMarkerHtml = (type: string) => {
  const configs: Record<string, { bg: string; svg: string }> = {
    EVACUATION_CENTER: {
      bg: '#0284c7',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    },
    HOSPITAL: {
      bg: '#059669',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12M6 12h12"></path></svg>',
    },
    RESCUE_STATION: {
      bg: '#d97706',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
    },
    MEETING_POINT: {
      bg: '#0891b2',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
    },
    SHELTER: {
      bg: '#7c3aed',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    },
  };

  const c = configs[type] || configs.SHELTER;
  return (
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:' + c.bg + ';width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);">' +
        c.svg +
      '</div>' +
      '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
    '</div>'
  );
};

// Component Bản đồ nhỏ (Mini Map) cho điểm trú ẩn an toàn với tương tác chọn tọa độ mượt mà
const ShelterMiniMap: React.FC<{
  lat: number;
  lng: number;
  name: string;
  type: string;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}> = ({ lat, lng, name, type, interactive, onLocationChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

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

    const pinHtml = getShelterMarkerHtml(type);
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
          name || 'Vị trí điểm trú ẩn'
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
              name || 'Vị trí điểm trú ẩn'
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
              name || 'Vị trí điểm trú ẩn'
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
          name || 'Vị trí điểm trú ẩn'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      );
    }
  }, [lat, lng, name]);

  useEffect(() => {
    if (!markerRef.current) return;
    const pinHtml = getShelterMarkerHtml(type);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });
    markerRef.current.setIcon(customIcon);
  }, [type]);

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
  const [_orgs, setOrgs] = useState<AuthorityOrgItem[]>([]);
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

  // State phục vụ Phát thông báo (Tin tức thời & Thông báo hệ thống)
  const [notificationCategory, setNotificationCategory] = useState<'INSTANT' | 'SYSTEM'>('INSTANT');
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastItem[]>([]);
  const [broadcastFilterTab, setBroadcastFilterTab] = useState<'ALL' | 'INSTANT' | 'SYSTEM'>('ALL');
  const [broadcastSearch, setBroadcastSearch] = useState('');

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

  // Hệ thống Toast Notifications thay thế alert()
  interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  }
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Hệ thống Confirmation Modal xác nhận trước khi thao tác
  interface ConfirmModalConfig {
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'primary' | 'danger' | 'warning';
    confirmText?: string;
    cancelText?: string;
    details?: { label: string; value: string }[];
    promptInput?: {
      label: string;
      defaultValue?: string;
      placeholder?: string;
    };
    onConfirm: (promptVal?: string) => void | Promise<void>;
  }
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [confirmPromptValue, setConfirmPromptValue] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Render chung Toast và Confirmation Modal
  const renderGlobalModals = () => (
    <>
      {/* TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 100000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const isWarning = toast.type === 'warning';
            const bg = isSuccess ? '#064e3b' : isError ? '#7f1d1d' : isWarning ? '#78350f' : '#0f172a';
            const borderCol = isSuccess ? '#10b981' : isError ? '#ef4444' : isWarning ? '#f59e0b' : '#38bdf8';
            const iconColor = isSuccess ? '#34d399' : isError ? '#f87171' : isWarning ? '#fbbf24' : '#38bdf8';

            return (
              <div
                key={toast.id}
                style={{
                  pointerEvents: 'auto',
                  minWidth: '320px',
                  maxWidth: '440px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: bg,
                  color: '#ffffff',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
                  borderLeft: `5px solid ${borderCol}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isSuccess && <CheckCircle2 size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {isError && <AlertTriangle size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {isWarning && <AlertTriangle size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {!isSuccess && !isError && !isWarning && <Info size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  <span style={{ lineHeight: 1.4 }}>{toast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Đóng thông báo"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}
          onClick={() => !confirmLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {confirmModal.type === 'danger' ? (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </div>
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                    <CheckCircle2 size={18} />
                  </div>
                )}
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {confirmModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !confirmLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                {confirmModal.message}
              </p>

              {confirmModal.details && confirmModal.details.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {confirmModal.details.map((d, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', gap: '10px' }}>
                      <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{d.label}:</span>
                      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {confirmModal.promptInput && (
                <div style={{ marginTop: '4px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                    {confirmModal.promptInput.label}
                  </label>
                  <textarea
                    rows={2}
                    value={confirmPromptValue}
                    onChange={(e) => setConfirmPromptValue(e.target.value)}
                    placeholder={confirmModal.promptInput.placeholder}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #f1f5f9',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                disabled={confirmLoading}
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="sos-btn-flat"
                style={{ padding: '7px 14px', fontSize: '12.5px' }}
              >
                {confirmModal.cancelText || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                disabled={confirmLoading}
                onClick={async () => {
                  try {
                    setConfirmLoading(true);
                    await confirmModal.onConfirm(confirmPromptValue);
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  } catch (err: any) {
                    showToast(err.message || 'Thao tác không thành công', 'error');
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
                className={`sos-btn-flat ${confirmModal.type === 'danger' ? 'danger' : 'primary'}`}
                style={{
                  padding: '7px 18px',
                  fontSize: '12.5px',
                  background: confirmModal.type === 'danger' ? '#dc2626' : '#0284c7',
                  color: '#ffffff',
                  borderColor: confirmModal.type === 'danger' ? '#dc2626' : '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {confirmLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  confirmModal.confirmText || 'Xác nhận'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // State phục vụ Quản lý Điểm trú ẩn & Trạm an toàn (UC-L12)
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);
  const [shelterFilter, setShelterFilter] = useState<'ALL' | 'ACTIVE' | 'FULL' | 'MAINTENANCE' | 'INACTIVE'>('ALL');
  const [shelterTypeFilter, setShelterTypeFilter] = useState<'ALL' | 'EVACUATION_CENTER' | 'HOSPITAL' | 'SHELTER' | 'RESCUE_STATION' | 'MEETING_POINT'>('ALL');
  const [shelterManagementScope, setShelterManagementScope] = useState<'LOCAL' | 'CITY'>('LOCAL');
  const [shelterSearchText, setShelterSearchText] = useState('');
  const [shelterPage, setShelterPage] = useState<number>(1);
  const [shelterSortField, setShelterSortField] = useState<'createdAt' | 'name' | 'capacity' | 'occupancyRate' | 'district' | 'address' | 'status'>('createdAt');
  const [shelterSortOrder, setShelterSortOrder] = useState<'asc' | 'desc'>('desc');
  const [shelterJumpInputPage, setShelterJumpInputPage] = useState<string>('');

  // Modal Chi tiết Điểm trú ẩn
  const [detailShelter, setDetailShelter] = useState<SafeLocationItem | null>(null);

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

  // State bộ lọc và tìm kiếm cho yêu cầu cứu nạn
  const [sosStatusFilter, setSosStatusFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [sosSearchQuery, setSosSearchQuery] = useState('');

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

        // Tải lịch sử thông báo đã phát tới các tài khoản
        try {
          const bRes = await fetchBroadcastHistory();
          if (bRes.success && Array.isArray(bRes.data)) {
            setBroadcastHistory(bRes.data);
          }
        } catch (bErr) {
          console.log('Lỗi khi tải lịch sử phát thông báo:', bErr);
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
        const [res, areasRes] = await Promise.all([
          fetchSafeLocations({ all: 'true', limit: '100' }),
          areas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
        ]);
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setShelters(res.data);
        } else {
          setShelters(FALLBACK_SHELTERS);
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
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
      if (sosId.startsWith('sos-dn-')) {
        // Fallback item local update
        setSosList((prev) => {
          const base = prev.length > 0 ? prev : FALLBACK_SOS_LIST;
          return base.map((s) => (s._id === sosId ? { ...s, status: 'VERIFIED' } : s));
        });
      } else {
        await verifySosRequest(sosId, { priority: currentPriority, status: 'VERIFIED' });
        refreshData();
      }
      alert('✅ Đã xác minh yêu cầu cứu nạn SOS thành công!');
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

  // Hành động 6: Phát thông báo / cảnh báo (Lưu vào MongoDB & gửi push ra ngoài app điện thoại)
  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertForm.title.trim()) {
      showToast('Vui lòng nhập tiêu đề thông báo', 'warning');
      return;
    }
    if (!alertForm.content.trim()) {
      showToast('Vui lòng nhập nội dung thông báo', 'warning');
      return;
    }

    try {
      setLoading(true);
      const isAuthority = user?.roles?.includes('LOCAL_AUTHORITY') && !user?.roles?.includes('ADMIN');
      const targetAreaId = isAuthority
        ? user?.authority?.areaId
        : (alertForm.areaId || (areas[0]?._id as string) || 'ALL');

      await broadcastNotificationApi({
        title: alertForm.title.trim(),
        content: alertForm.content.trim(),
        type: notificationCategory, // 'INSTANT' or 'SYSTEM'
        areaId: targetAreaId,
        priority: notificationCategory === 'INSTANT' ? alertForm.severity : 'NORMAL',
        data: {
          disasterType: alertForm.type,
        },
      });

      showToast(
        `✅ Đã phát ${notificationCategory === 'INSTANT' ? 'Tin tức thời' : 'Thông báo hệ thống'} thành công tới các tài khoản trong khu vực và đẩy thông báo ra ngoài app điện thoại!`,
        'success'
      );
      setAlertForm({
        title: '',
        content: '',
        type: 'FLOOD',
        severity: 'HIGH',
        areaId: user?.authority?.areaId || (areas[0]?._id as string) || '',
      });
      refreshData();
    } catch (err: any) {
      showToast('❌ Lỗi phát thông báo: ' + (err.message || 'Không thể gửi'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Hành động 6b: Thu hồi / Xóa thông báo đã phát
  const handleDeleteBroadcast = (broadcastId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Thu hồi / Xóa thông báo đã phát',
      message: 'Bạn có chắc chắn muốn thu hồi bản tin thông báo này khỏi tất cả tài khoản người nhận trong khu vực?',
      type: 'danger',
      confirmText: 'Xác nhận xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          await deleteBroadcastApi(broadcastId);
          showToast('✅ Đã thu hồi thông báo thành công', 'success');
          setBroadcastHistory((prev) => prev.filter((b) => b.id !== broadcastId));
          setConfirmModal((c) => ({ ...c, isOpen: false }));
        } catch (err: any) {
          showToast('❌ Không thể xóa thông báo: ' + err.message, 'error');
        }
      },
    });
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
    // Luôn đảm bảo có dữ liệu sinh động, không bị bảng trống trơn
    const displaySosList = sosList.length > 0 ? sosList : FALLBACK_SOS_LIST;

    const totalCount = displaySosList.length;
    const pendingCount = displaySosList.filter((s) => s.status === 'PENDING').length;
    const verifiedCount = displaySosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
    const completedCount = displaySosList.filter((s) => s.status === 'COMPLETED').length;

    // Lọc theo trạng thái và từ khóa tìm kiếm
    const filteredSosList = displaySosList.filter((s) => {
      if (sosStatusFilter === 'PENDING' && s.status !== 'PENDING') return false;
      if (sosStatusFilter === 'ACTIVE' && !['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)) return false;
      if (sosStatusFilter === 'COMPLETED' && s.status !== 'COMPLETED') return false;

      if (sosSearchQuery.trim()) {
        const q = sosSearchQuery.toLowerCase();
        const citizenInfo = typeof s.citizenId === 'object' && s.citizenId !== null ? s.citizenId : null;
        const matchCode = s.sosCode.toLowerCase().includes(q);
        const matchName = citizenInfo?.fullName?.toLowerCase().includes(q) || false;
        const matchPhone = citizenInfo?.phone?.toLowerCase().includes(q) || false;
        const matchAddress = s.address.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchPhone && !matchAddress) return false;
      }
      return true;
    });

    return (
      <div className="sos-views-container">
        {/* KPI stats - Nghiệp vụ điều hành tác chiến */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCount}</span>
              <span className="sos-stat-label">Tổng Tiếp Nhận Cứu Nạn</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Clock size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{pendingCount}</span>
              <span className="sos-stat-label">Chờ Xác Minh Khẩn Cấp</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{verifiedCount}</span>
              <span className="sos-stat-label">Đang Điều Phối Cứu Hộ</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><FileCheck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{completedCount}</span>
              <span className="sos-stat-label">Đã Cứu Hộ An Toàn</span>
            </div>
          </div>
        </div>

        {/* Bảng danh sách SOS tác chiến */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Siren size={18} color="#ef4444" />
              <span>Danh Sách Yêu Cầu Cứu Nạn Khẩn Cấp ({totalCount} sự vụ)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

          {/* Bộ lọc nhanh & Thanh tìm kiếm tác chiến */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSosStatusFilter('ALL')}
                className={`sos-btn-filter-pill ${sosStatusFilter === 'ALL' ? 'active' : ''}`}
              >
                Tất cả ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setSosStatusFilter('PENDING')}
                className={`sos-btn-filter-pill ${sosStatusFilter === 'PENDING' ? 'active yellow' : ''}`}
              >
                Chờ xác minh ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setSosStatusFilter('ACTIVE')}
                className={`sos-btn-filter-pill ${sosStatusFilter === 'ACTIVE' ? 'active blue' : ''}`}
              >
                Đang điều phối ({verifiedCount})
              </button>
              <button
                type="button"
                onClick={() => setSosStatusFilter('COMPLETED')}
                className={`sos-btn-filter-pill ${sosStatusFilter === 'COMPLETED' ? 'active green' : ''}`}
              >
                Đã hoàn thành ({completedCount})
              </button>
            </div>

            <div style={{ marginLeft: 'auto', position: 'relative', minWidth: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                value={sosSearchQuery}
                onChange={(e) => setSosSearchQuery(e.target.value)}
                placeholder="Tìm mã SOS, tên, địa chỉ..."
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Mã SOS</th>
                  <th>Người dân / Liên hệ</th>
                  <th>Địa điểm / Hiện trường</th>
                  <th>Số người</th>
                  <th>Mức độ</th>
                  <th>Trạng thái</th>
                  <th>Hành động nghiệp vụ</th>
                </tr>
              </thead>
              <tbody>
                {filteredSosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      Không có yêu cầu cứu nạn nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredSosList.map((sos) => {
                    const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                    return (
                      <tr key={sos._id}>
                        <td><strong>{sos.sosCode}</strong></td>
                        <td>
                          <div><strong>{citizenInfo?.fullName || 'Người dân'}</strong></div>
                          <small style={{ color: '#64748b' }}>{citizenInfo?.phone || 'Chưa có SĐT'}</small>
                        </td>
                        <td>
                          <div>{sos.address}</div>
                          {sos.location?.coordinates && (
                            <small style={{ color: '#94a3b8' }}>
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
    const isAuthority = Boolean(user?.roles?.includes('LOCAL_AUTHORITY') && !user?.roles?.includes('ADMIN'));
    const currentArea = areas.find((a) => a._id === alertForm.areaId || a._id === user?.authority?.areaId) || areas[0];
    const authorityAreaName = user?.authority?.areaName || currentArea?.name || 'Khu vực quản lý của bạn';

    // Mẫu thông báo nhanh cho "Tin tức thời" (Khẩn cấp / Bão lũ)
    const instantTemplates = [
      {
        title: '🌊 Cảnh báo ngập lụt dâng cao',
        type: 'FLOOD',
        severity: 'CRITICAL',
        headline: `Cảnh báo ngập lụt khẩn cấp lưu vực ${authorityAreaName}`,
        content: `Mực nước dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường. Lực lượng cứu hộ đang túc trực ca-nô hỗ trợ.`,
      },
      {
        title: '⚡ Cảnh báo bão & gió giật mạnh',
        type: 'STORM',
        severity: 'HIGH',
        headline: `Cảnh báo bão đổ bộ sức gió cấp 9-10 tại ${authorityAreaName}`,
        content: `Gió giật mạnh nguy hiểm kèm mưa lớn. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện cao thế.`,
      },
      {
        title: '⛰️ Báo động sạt lở ven sông / taluy',
        type: 'LANDSLIDE',
        severity: 'HIGH',
        headline: `Cảnh báo sạt lở nguy hiểm ven sông và triền dốc tại ${authorityAreaName}`,
        content: `Xuất hiện dấu hiệu nứt trượt bờ sông và taluy dốc. Yêu cầu các hộ dân nằm trong bán kính 100m khẩn cấp sơ tán ngay đến nhà văn hóa hoặc trường học an toàn đã bố trí.`,
      },
      {
        title: '📢 Hiệu lệnh sơ tán dân khẩn cấp',
        type: 'EVACUATION',
        severity: 'CRITICAL',
        headline: `Lệnh sơ tán khẩn cấp toàn bộ cư dân khu vực nguy hiểm ${authorityAreaName}`,
        content: `Mức nước vượt ngưỡng báo động khẩn. Lực lượng cứu hộ địa phương đang bố trí ca-nô và xe đặc chủng tại đầu đường chính để đón người dân đến Trạm sơ tán. Gọi Hotline SOS nếu cần hỗ trợ khẩn cấp.`,
      },
    ];

    // Mẫu thông báo nhanh cho "Thông báo hệ thống" (Bảo trì, chính sách, hướng dẫn)
    const systemTemplates = [
      {
        title: '🛠️ Lịch bảo trì hạ tầng máy chủ',
        type: 'GENERAL',
        severity: 'LOW',
        headline: 'Thông báo nâng cấp hệ thống điều phối cứu nạn SOS',
        content: 'Hệ thống máy chủ sẽ tiến hành bảo trì định kỳ từ 01:00 đến 02:00 sáng. Đường dây nóng cứu nạn 112 và ứng dụng di động vẫn tiếp nhận cuộc gọi khẩn cấp bình thường.',
      },
      {
        title: '📦 Hướng dẫn nhận gói cứu trợ & nước sạch',
        type: 'GENERAL',
        severity: 'LOW',
        headline: `Thông báo điểm tiếp nhận & cấp phát nhu yếu phẩm tại ${authorityAreaName}`,
        content: 'Ban cứu trợ địa phương đã bố trí 3 điểm cấp phát gạo, mì tôm, nước khoáng tinh khiết và thuốc khử trùng tại Trạm Y tế và Nhà văn hóa phường. Người dân mang CCCD/số điện thoại đăng ký đến nhận hỗ trợ.',
      },
      {
        title: '📱 Cập nhật ứng dụng di động nhận tin khẩn',
        type: 'GENERAL',
        severity: 'LOW',
        headline: 'Hướng dẫn cài đặt & bật quyền nhận thông báo khẩn cấp trên app điện thoại',
        content: 'Đề nghị toàn thể người dân và đội viên cứu trợ kiểm tra cấp quyền Thông báo (Push Notification) cho ứng dụng RescueSOS để nhận còi báo động tức thì khi có thiên tai bão lũ bất ngờ.',
      },
      {
        title: '👮 Quy chế trực ban & điều phối ca-nô cứu nạn',
        type: 'GENERAL',
        severity: 'MEDIUM',
        headline: `Quy chế trực chiến 24/24 giờ của lực lượng cứu nạn tại ${authorityAreaName}`,
        content: 'Yêu cầu các đội cứu hộ tình nguyện và cán bộ địa phương duy trì trạng thái trực máy thoại và định vị GPS trên app. Ca-nô sẵn sàng xuất phát trong vòng 5 phút kể từ khi nhận phân công.',
      },
    ];

    const currentTemplates = notificationCategory === 'INSTANT' ? instantTemplates : systemTemplates;

    // Lọc lịch sử phát thông báo theo tab & từ khóa tìm kiếm
    const filteredBroadcasts = broadcastHistory.filter((item) => {
      if (broadcastFilterTab === 'INSTANT') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'INSTANT' && t !== 'TIN_TUC_THOI' && t !== 'ALERT' && t !== 'WEATHER') return false;
      }
      if (broadcastFilterTab === 'SYSTEM') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'SYSTEM' && t !== 'THONG_BAO_HE_THONG') return false;
      }
      if (broadcastSearch.trim()) {
        const q = broadcastSearch.trim().toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchContent = item.content?.toLowerCase().includes(q);
        const matchArea = item.areaName?.toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchArea) return false;
      }
      return true;
    });

    return (
      <div className="sos-views-container">
        {/* ==================== 1. FORM SOẠN & PHÁT THÔNG BÁO ==================== */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div>
              <div className="sos-view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BellRing size={20} color="#ef4444" />
                <span>Trung Tâm Phát Thông Báo &amp; Cảnh Báo Cho Người Dân</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Do Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) khởi tạo tới các tài khoản trong khu vực &amp; đẩy thông báo trực tiếp ra ngoài ứng dụng điện thoại.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="sos-badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                <Smartphone size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Expo Push Service Ready
              </span>
            </div>
          </div>

          {/* BỘ CHUYỂN ĐỔI: TIN TỨC THỜI VS THÔNG BÁO HỆ THỐNG */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
              1. Lựa chọn phân loại thông báo muốn phát sóng:
            </div>
            <div className="sos-notif-category-grid">
              {/* Card 1: Tin tức thời */}
              <div
                className={`sos-notif-category-card ${notificationCategory === 'INSTANT' ? 'instant-active' : ''}`}
                onClick={() => setNotificationCategory('INSTANT')}
              >
                <div className="sos-notif-card-header">
                  <div className="sos-notif-card-title">
                    <Zap size={18} color="#ef4444" />
                    <span>⚡ Tin tức thời (Cảnh báo khẩn cấp)</span>
                  </div>
                  <span className="sos-badge instant">Khẩn cấp &amp; Bão lũ</span>
                </div>
                <div className="sos-notif-card-desc">
                  Phát báo động bão lũ ngập lụt dâng cao, sạt lở ven sông, lốc xoáy hoặc hiệu lệnh sơ tán khẩn cấp. Tự động kích hoạt còi hú và đẩy thông báo nổi ra ngoài màn hình điện thoại người dân.
                </div>
                <div className="sos-notif-card-tags">
                  <span className="sos-notif-tag">🚨 Báo động đỏ</span>
                  <span className="sos-notif-tag">📱 Push khẩn cấp ra app</span>
                  <span className="sos-notif-tag">🗺️ Tích hợp bản đồ</span>
                </div>
              </div>

              {/* Card 2: Thông báo hệ thống */}
              <div
                className={`sos-notif-category-card ${notificationCategory === 'SYSTEM' ? 'system-active' : ''}`}
                onClick={() => setNotificationCategory('SYSTEM')}
              >
                <div className="sos-notif-card-header">
                  <div className="sos-notif-card-title">
                    <Megaphone size={18} color="#2563eb" />
                    <span>📢 Thông báo hệ thống</span>
                  </div>
                  <span className="sos-badge system">Chính sách &amp; Quản trị</span>
                </div>
                <div className="sos-notif-card-desc">
                  Thông báo lịch bảo trì máy chủ, hướng dẫn nhận nhu yếu phẩm cứu trợ, quy chế tác chiến điều phối, cập nhật phần mềm di động và thông tin chỉ đạo điều hành chung.
                </div>
                <div className="sos-notif-card-tags">
                  <span className="sos-notif-tag">ℹ️ Hướng dẫn người dân</span>
                  <span className="sos-notif-tag">📦 Phân bổ cứu trợ</span>
                  <span className="sos-notif-tag">📋 Lưu hộp thư cá nhân</span>
                </div>
              </div>
            </div>
          </div>

          {/* MẪU SOẠN SẴN MỘT CHẠM THEO PHÂN LOẠI */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              Mẫu soạn sẵn {notificationCategory === 'INSTANT' ? 'Tin tức thời khẩn cấp' : 'Thông báo hệ thống'} (Nhấp để điền nhanh):
            </div>
            <div className="sos-quick-broadcast-grid">
              {currentTemplates.map((t, idx) => (
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
                      areaId: isAuthority ? (user?.authority?.areaId as string) : (alertForm.areaId || (areas[0]?._id as string)),
                    });
                  }}
                >
                  <span className="sos-quick-template-title">{t.title}</span>
                  <span className="sos-quick-template-snippet">{t.content}</span>
                </button>
              ))}
            </div>
          </div>

          {/* FORM NHẬP LIỆU THÔNG BÁO */}
          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {/* Tiêu đề thông báo */}
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  Tiêu đề thông báo: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={alertForm.title}
                  onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                  placeholder={
                    notificationCategory === 'INSTANT'
                      ? 'VD: Cảnh báo nước sông dâng cao vượt báo động 3 tại Hòa Cường'
                      : 'VD: Thông báo lịch tiếp nhận nhu yếu phẩm và nước uống tinh khiết'
                  }
                  className="sos-form-input"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                />
              </div>

              {/* Địa bàn tiếp nhận thông báo */}
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  Địa bàn các tài khoản tiếp nhận thông báo:
                </label>
                {isAuthority ? (
                  // Cán bộ địa phương: Cố định địa bàn phân công quản lý
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={14} color="#64748b" />
                      <span>{authorityAreaName}</span>
                    </div>
                    <span className="sos-badge verified" style={{ fontSize: '11px' }}>
                      ★ Địa bàn quản lý của tài khoản
                    </span>
                  </div>
                ) : (
                  // Admin: Chọn khu vực cụ thể hoặc toàn thành phố
                  <select
                    value={alertForm.areaId}
                    onChange={(e) => setAlertForm({ ...alertForm, areaId: e.target.value })}
                    className="sos-form-select"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  >
                    <option value="ALL">🌐 Toàn thành phố Đà Nẵng (Tất cả khu vực)</option>
                    {areas.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tùy chọn chuyên biệt cho Tin tức thời */}
              {notificationCategory === 'INSTANT' && (
                <>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                      Loại thiên tai / Tình huống khẩn cấp:
                    </label>
                    <select
                      value={alertForm.type}
                      onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="FLOOD">🌊 LŨ LỤT &amp; NGẬP ÚNG SÂU</option>
                      <option value="STORM">⚡ BÃO LỚN &amp; LỐC XOÁY</option>
                      <option value="LANDSLIDE">⛰️ SẠT LỞ ĐẤT ĐÁ VEN SÔNG</option>
                      <option value="EVACUATION">📢 HIỆU LỆNH SƠ TÁN DÂN</option>
                      <option value="GENERAL">⚠️ CẢNH BÁO THIÊN TAI CHUNG</option>
                    </select>
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                      Mức độ nghiêm trọng &amp; Âm báo:
                    </label>
                    <select
                      value={alertForm.severity}
                      onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="CRITICAL">🔴 NGUY CẤP (Báo động đỏ - Còi hú &amp; Đẩy Push)</option>
                      <option value="HIGH">🟠 CAO (Cảnh báo cam - Nguy hiểm cao)</option>
                      <option value="MEDIUM">🟡 TRUNG BÌNH (Cảnh báo vàng)</option>
                      <option value="LOW">🔵 THÔNG BÁO (Hướng dẫn phòng ngừa)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Nội dung thông báo */}
            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                Nội dung chi tiết thông báo &amp; hướng dẫn hành động cho người dân: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                required
                value={alertForm.content}
                onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                placeholder="Nhập thông tin hướng dẫn an toàn, địa điểm trạm trú ẩn, số hotline liên hệ trực ban cứu nạn..."
                className="sos-form-textarea"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>

            {/* Nút hành động phát thông báo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={15} color="#0066FF" />
                <span>
                  Thông báo sẽ được truyền tới toàn bộ tài khoản trong khu vực và phát ra ngoài điện thoại.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="sos-hotline-btn"
                style={{
                  padding: '11px 22px',
                  fontSize: '13.5px',
                  background: notificationCategory === 'INSTANT' ? '#ef4444' : '#2563eb',
                }}
              >
                {loading ? <Loader2 size={16} className="sos-spin" /> : <Send size={16} />}
                <span>
                  {loading
                    ? 'Đang truyền phát thông báo...'
                    : `📢 Phát ${notificationCategory === 'INSTANT' ? 'Tin Tức Thời' : 'Thông Báo Hệ Thống'} Ra App Điện Thoại`}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* ==================== 2. BẢNG LỊCH SỬ CÁC BẢN TIN ĐÃ PHÁT ==================== */}
        <div className="sos-view-card" style={{ marginTop: '20px' }}>
          <div className="sos-view-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={18} color="#0284c7" />
              <span className="sos-view-card-title">
                Lịch Sử Các Bản Tin Đã Phát Tới Người Dân &amp; Điện Thoại ({filteredBroadcasts.length} bản tin)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Ô tìm kiếm bản tin */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={broadcastSearch}
                  onChange={(e) => setBroadcastSearch(e.target.value)}
                  placeholder="Tìm theo tiêu đề, khu vực..."
                  className="sos-form-input"
                  style={{ paddingLeft: '32px', paddingRight: '12px', paddingVertical: '6px', fontSize: '12.5px', width: '220px' }}
                />
              </div>

              <button type="button" onClick={refreshData} className="sos-btn-refresh">
                <RefreshCw size={14} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Sub-filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setBroadcastFilterTab('ALL')}
            >
              Tất cả ({broadcastHistory.length})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'INSTANT' ? 'active red' : ''}`}
              onClick={() => setBroadcastFilterTab('INSTANT')}
            >
              ⚡ Tin tức thời
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'SYSTEM' ? 'active' : ''}`}
              onClick={() => setBroadcastFilterTab('SYSTEM')}
            >
              📢 Thông báo hệ thống
            </button>
          </div>

          {/* Bảng dữ liệu */}
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>Tiêu đề &amp; Nội dung bản tin</th>
                  <th>Phân loại</th>
                  <th>Mức độ</th>
                  <th>Khu vực tiếp nhận</th>
                  <th>Người phát hành</th>
                  <th>Thời gian phát</th>
                  <th>Tài khoản nhận</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredBroadcasts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      <BellRing size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4, display: 'block' }} />
                      Chưa có bản tin nào được phát sóng theo bộ lọc này. Hãy dùng form phía trên để phát thông báo mới.
                    </td>
                  </tr>
                ) : (
                  filteredBroadcasts.map((b) => {
                    const isInst = String(b.type || '').toUpperCase() === 'INSTANT' || String(b.type || '').toUpperCase() === 'ALERT';
                    return (
                      <tr key={b.id || b.title + b.createdAt}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
                            {b.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '320px', lineHeight: 1.4 }}>
                            {b.content}
                          </div>
                        </td>
                        <td>
                          <span className={`sos-badge ${isInst ? 'instant' : 'system'}`}>
                            {isInst ? '⚡ TIN TỨC THỜI' : '📢 HỆ THỐNG'}
                          </span>
                        </td>
                        <td>
                          <span className={`sos-badge ${String(b.priority || 'NORMAL').toLowerCase()}`}>
                            {b.priority || 'NORMAL'}
                          </span>
                        </td>
                        <td>
                          <span className="sos-badge verified">
                            {b.areaName || 'Toàn thành phố'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                            {b.createdBy?.fullName || 'Cán bộ quản lý'}
                          </div>
                          <small style={{ color: '#94a3b8' }}>{b.createdBy?.phone || 'Hệ thống SOS'}</small>
                        </td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {b.createdAt ? new Date(b.createdAt).toLocaleString('vi-VN') : 'Vừa xong'}
                        </td>
                        <td>
                          <span className="sos-badge active" style={{ fontSize: '11.5px' }}>
                            {b.recipientsCount ? `${b.recipientsCount} tài khoản` : 'Đã gửi tới dân'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteBroadcast(b.id)}
                            className="sos-btn-action"
                            style={{ padding: '6px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                            title="Thu hồi / Xóa thông báo khỏi các tài khoản"
                          >
                            <Trash2 size={14} />
                            <span>Thu hồi</span>
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
   * 5b. LOCAL AUTHORITY: ĐIỂM TRÚ ẨN & TRẠM Y TẾ AN TOÀN (UC-L12)
   * Giao diện chuẩn mực tác chiến hành chính, đồng bộ tuyệt đối với hazard_reports.
   * Đầy đủ bộ lọc, tab phạm vi, tìm kiếm, sắp xếp, phân trang.
   * Modal Chi tiết (2 cột + MiniMap), Modal Tạo mới & Chỉnh sửa (2 cột + Ghim tọa độ Leaflet).
   * ------------------------------------------------------------- */
  if (activeKey === 'shelters') {
    domainDService.syncFromStoredAuthUser();
    const authUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_auth_user') : null;
    const authUser = user || (authUserStr ? JSON.parse(authUserStr) : null);
    const activeOfficer = domainDService.getActiveOfficer();

    // 1. XÁC ĐỊNH ĐỊA BÀN PHÂN CÔNG QUẢN LÝ CỐ ĐỊNH TỪ TÀI KHOẢN (KHÔNG CHO PHÉP THAY ĐỔI)
    const determineOfficerJurKey = (): string => {
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

      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('sos_authority_jurisdiction_key') : null;
      if (stored && JURISDICTION_CONFIGS[stored] && stored !== 'toan_thanh_pho') return stored;
      return 'ngu_hanh_son';
    };

    const fixedJurKey = determineOfficerJurKey();
    const fixedJurisdictionConfig = JURISDICTION_CONFIGS[fixedJurKey] || JURISDICTION_CONFIGS.ngu_hanh_son;

    try {
      localStorage.setItem('sos_authority_jurisdiction_key', fixedJurKey);
    } catch {}

    // Tìm đơn vị hành chính quản lý tương ứng từ tài khoản người dùng
    const userAreaIdFromAuth = user?.authority?.areaId || authUser?.authority?.areaId;
    const userAreaNameFromAuth = user?.authority?.areaName || authUser?.authority?.areaName;

    const resolvedAccountArea = (() => {
      if (userAreaIdFromAuth) {
        const found = areas.find((a) => a._id === userAreaIdFromAuth || a.code === userAreaIdFromAuth);
        if (found) return found;
      }
      if (userAreaNameFromAuth) {
        const lowerName = userAreaNameFromAuth.toLowerCase();
        const found = areas.find((a) => {
          const aName = (a.name || '').toLowerCase();
          return aName.includes(lowerName) || lowerName.includes(aName);
        });
        if (found) return found;
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

    const accountAreaId =
      resolvedAccountArea?._id ||
      userAreaIdFromAuth ||
      fixedJurisdictionConfig.areaId;

    // 2. HÀM KIỂM TRA ĐIỂM TRÚ ẨN CÓ THUỘC ĐỊA BÀN PHÂN CÔNG HAY KHÔNG
    const isShelterInOfficerJurisdiction = (sh: SafeLocationItem): boolean => {
      const cfg = fixedJurisdictionConfig;
      const addrLower = (sh.address || '').toLowerCase();
      const nameLower = (sh.name || '').toLowerCase();
      const fullText = `${addrLower} ${nameLower}`;

      // 1. So khớp từ khóa đặc trưng của địa bàn phụ trách
      const matchesKeyword = cfg.keywords.some((kw) => fullText.includes(kw));
      if (matchesKeyword) return true;

      // 2. So khớp tọa độ GPS nằm trong bounding box địa lý của quận/huyện
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

      // 3. So khớp ID khu vực nếu có
      const shAreaId = (sh.areaId as any)?._id || (sh.areaId as any)?.id || (sh.areaId as any)?.code || sh.areaId;
      if (shAreaId && (shAreaId === cfg.areaId || (sh.areaId as any)?.name === cfg.name)) {
        return true;
      }

      return false;
    };

    // 3. HÀM XÁC ĐỊNH TÊN ĐỊA PHƯƠNG QUẢN LÝ CHO TỪNG ĐIỂM TRÚ ẨN
    const getShelterDistrictName = (sh: SafeLocationItem): string => {
      if (isShelterInOfficerJurisdiction(sh)) {
        return fixedJurisdictionConfig.name;
      }
      const shAreaName = (sh.areaId as any)?.name;
      if (shAreaName && typeof shAreaName === 'string') {
        return shAreaName;
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
    const localShelters = displayShelters.filter((s) => isShelterInOfficerJurisdiction(s));
    const baseScopedShelters = shelterManagementScope === 'LOCAL' ? localShelters : displayShelters;

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
      let cmp = 0;
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

    // Mở Form Thêm Điểm Trú Ẩn Mới
    const handleOpenCreateShelterModal = () => {
      let defaultLat = 16.0570;
      let defaultLng = 108.2170;
      if (fixedJurisdictionConfig.bounds) {
        defaultLat = Number(((fixedJurisdictionConfig.bounds.minLat + fixedJurisdictionConfig.bounds.maxLat) / 2).toFixed(5));
        defaultLng = Number(((fixedJurisdictionConfig.bounds.minLng + fixedJurisdictionConfig.bounds.maxLng) / 2).toFixed(5));
      }

      setCreateShelterName('');
      setCreateShelterType('EVACUATION_CENTER');
      setCreateShelterAreaId((resolvedAccountArea?._id as string) || accountAreaId || '');
      setCreateShelterAddress(`${accountAreaDisplayName}, TP Đà Nẵng`);
      setCreateShelterCapacity(300);
      setCreateShelterOccupancy(0);
      setCreateShelterStatus('ACTIVE');
      setCreateShelterLat(defaultLat);
      setCreateShelterLng(defaultLng);
      setCreateShelterNotes(`Điểm trú ẩn an toàn thuộc quản lý Ban Chỉ Huy PCTT ${accountAreaDisplayName}`);
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
      setEditShelterAreaId((resolvedAccountArea?._id as string) || accountAreaId || curAreaId || (areas[0]?._id as string) || fixedJurisdictionConfig.areaId || '');
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
        if (res.placeName && (!createShelterAddress || createShelterAddress.includes('TP Đà Nẵng'))) {
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
      try {
        setSubmittingCreateShelter(true);
        const resolvedAreaId = (resolvedAccountArea?._id as string) || accountAreaId || createShelterAreaId || fixedJurisdictionConfig.areaId || (areas[0]?._id as string);
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
        const resolvedAreaId = (resolvedAccountArea?._id as string) || accountAreaId || editShelterAreaId || fixedJurisdictionConfig.areaId || (areas[0]?._id as string);
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
              <Shield size={20} color="#0284c7" />
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
                Quản Lý &amp; Thiết Lập Điểm Trú Ẩn / Trạm An Toàn
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', fontSize: '13.5px' }}>
              <MapPin size={15} color="#64748b" />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Địa bàn phụ trách:</span>
              <strong style={{ color: '#0f172a', fontWeight: 700 }}>{accountAreaDisplayName}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

        {/* 2. CHỌN PHẠM VI XEM: TÊN ĐỊA PHƯƠNG & TỔNG THÀNH PHỐ + KPI NĂNG LỰC */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
          <div className="sos-scope-tabs">
            <button
              type="button"
              className={`sos-scope-tab ${shelterManagementScope === 'LOCAL' ? 'active' : ''}`}
              onClick={() => {
                setShelterManagementScope('LOCAL');
                setShelterPage(1);
              }}
            >
              <span>{accountAreaDisplayName}</span>
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
              <span>Thành phố Đà Nẵng</span>
              <span className="sos-scope-badge">{displayShelters.length}</span>
            </button>
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
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
            <table className="sos-clean-table">
              <thead>
                <tr>
                  <th
                    className={`sortable ${shelterSortField === 'name' ? 'sorted' : ''}`}
                    onClick={() => handleSort('name')}
                    style={{ width: '24%' }}
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: '13px' }}>
                      <Shield size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                      <div>Không có điểm trú ẩn an toàn nào trong danh mục này.</div>
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
                      <tr key={sh._id}>
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
        {/* MODAL TẠO ĐIỂM TRÚ ẨN MỚI (2 CỘT TƯƠNG ĐỒNG VỚI HAZARD) */}
        {/* ============================================================ */}
        {isCreateShelterOpen && (
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
                        onClick={() => handleInitiateRejectHazard(detailHazard._id)}
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

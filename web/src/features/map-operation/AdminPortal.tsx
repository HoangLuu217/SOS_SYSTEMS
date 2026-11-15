import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Plus,
  Minus,
  RotateCcw,
  ExternalLink,
  LogOut,
  Layers,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { fetchSosRequests } from '@/api/sos.api';
import { GOOGLE_MAP_TILES } from '@/services/mapGeoService';
import type { User } from '@/types/auth';
import type { HazardReportItem, SafeLocationItem, SosRequestItem } from '@/types/dashboard';
import { fetchHazardReports } from '@/api/hazard.api';
import { fetchSafeLocations } from '@/api/shelter.api';
import {
  extractPolygonLatLngRings,
  fetchGeoapifyBoundaries,
  fetchProvinceBoundaryFromApi,
  fetchProvinceMapBundleFromDb,
  getCachedProvinceBoundarySync,
  getCachedProvinceMapBundleSync,
  HOANG_SA_ISLAND_AREA,
} from '@/services/geoapifyBoundariesService';
import {
  getSocket,
  onSosCreated,
  onSosUpdated,
  onSosDeleted,
  onAssignmentUpdated,
} from '@/services/socketService';
import type { AdministrativeArea } from '@/types/domainD';
import {
  AdminMapHud,
  AdminMapContent,
  getAdminSosStatusMeta,
  mapBackendSosForAdmin,
  resolveSosWard,
  type AdminSosItem,
  type AdminSosFilterMode,
} from './AdminMapLayers';
import './RescueSos.css';

interface Props {
  user?: User | null;
  onSwitchToAuthor?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

const FALLBACK_DANANG_BOUNDS: L.LatLngBoundsExpression = [
  [14.94, 107.18],
  [16.34, 109.05],
];

const DANANG_WITH_HOANG_SA_BOUNDS: L.LatLngBoundsExpression = [
  [14.7, 107.0],
  [17.7, 113.45],
];

const filterAdminDaNangWards = (rawWards: AdministrativeArea[]): AdministrativeArea[] =>
  rawWards
    .filter((w) => {
      const name = (w.name || '').trim();
      if (!name) return false;
      if (/mở\s*rộng|lân\s*cận|geoapify/i.test(name)) return false;
      if (/^(thành\s*phố\s*|tp\.?\s*)?đà\s*nẵng$/i.test(name)) return false;
      if (/hoàng\s*sa|đặc\s*khu/i.test(name)) return true;
      if (/^(quận|huyện|thị\s*xã)\s+/i.test(name)) return false;
      return /^(phường|xã|thị\s*trấn)\s+/i.test(name);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

// Controller component điều khiển Leaflet map, cho phép kéo xem cả Đà Nẵng đất liền lẫn Đặc khu Hoàng Sa
const MapController = ({
  onMount,
  boundaryArea,
  hoangSaArea,
}: {
  onMount?: (map: L.Map) => void;
  boundaryArea: AdministrativeArea | null;
  hoangSaArea?: AdministrativeArea | null;
}) => {
  const map = useMap();

  const applyDanangBoundsLock = useCallback(() => {
    const mainlandPoints = extractPolygonLatLngRings(boundaryArea?.boundary).flat();
    const hoangSaPoints = extractPolygonLatLngRings(
      (hoangSaArea || HOANG_SA_ISLAND_AREA).boundary
    ).flat();

    const coreBounds =
      mainlandPoints.length >= 3
        ? L.latLngBounds(mainlandPoints)
        : L.latLngBounds(FALLBACK_DANANG_BOUNDS);

    const combinedBounds = L.latLngBounds(
      coreBounds.getSouthWest(),
      coreBounds.getNorthEast()
    );
    if (hoangSaPoints.length >= 3) {
      combinedBounds.extend(L.latLngBounds(hoangSaPoints));
    } else {
      combinedBounds.extend(DANANG_WITH_HOANG_SA_BOUNDS);
    }

    // Đệm nhẹ quanh toàn vùng Đà Nẵng + Hoàng Sa để kéo xem ngoài khơi mượt mà
    const lockedBounds = combinedBounds.pad(0.06);

    map.options.maxBoundsViscosity = 0.9;
    map.setMaxBounds(lockedBounds);

    const minZoom = 7.5;
    map.setMinZoom(minZoom);

    if (map.getZoom() < minZoom) {
      map.setZoom(minZoom);
    }
  }, [map, boundaryArea, hoangSaArea]);

  useEffect(() => {
    if (onMount) onMount(map);
    const timer = setTimeout(() => {
      map.invalidateSize();
      applyDanangBoundsLock();
    }, 150);

    map.on('resize', applyDanangBoundsLock);
    return () => {
      clearTimeout(timer);
      map.off('resize', applyDanangBoundsLock);
    };
  }, [map, onMount, applyDanangBoundsLock]);

  return null;
};

const TARGET_PROVINCE_NAME = 'Thành phố Đà Nẵng';

export const AdminPortal = ({ onSwitchToAuthor, onLogout, embedded = false }: Props) => {
  const { theme, mapMode } = useApp();
  const mapRef = useRef<L.Map | null>(null);

  const defaultCenter: [number, number] = [16.0544, 108.2022];
  const defaultZoom = 12;

  // Danh sách Điểm An Toàn & Điểm Nguy Hiểm (hiển thị đồng bộ khi lọc tab "Tất cả")
  const [hazards, setHazards] = useState<HazardReportItem[]>([]);
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadMapPoints = async () => {
      try {
        const [hazRes, shelterRes] = await Promise.all([
          fetchHazardReports({ status: 'APPROVED', limit: '300' }),
          fetchSafeLocations({ limit: '300' }),
        ]);
        if (!isMounted) return;
        if (hazRes?.success && Array.isArray(hazRes.data?.reports)) {
          setHazards(hazRes.data.reports);
        } else if (Array.isArray(hazRes?.data)) {
          setHazards(hazRes.data as any);
        }
        if (shelterRes?.success && Array.isArray(shelterRes.data)) {
          setShelters(shelterRes.data);
        }
      } catch (err) {
        console.warn('⚠️ [AdminPortal] Lỗi nạp điểm an toàn / nguy hiểm:', err);
      }
    };
    loadMapPoints();

    const socket = getSocket();
    const handleHazardEvt = (payload: any) => {
      if (!isMounted) return;
      if (payload?.action === 'CREATED' && payload.data) {
        setHazards((prev) => [payload.data, ...prev.filter((h) => h._id !== payload.data._id)]);
      } else if (payload?.action === 'DELETED' && payload.data?._id) {
        setHazards((prev) => prev.filter((h) => h._id !== payload.data._id));
      } else {
        loadMapPoints();
      }
    };
    const handleShelterEvt = (payload: any) => {
      if (!isMounted) return;
      if (payload?.action === 'CREATED' && payload.data) {
        setShelters((prev) => [payload.data, ...prev.filter((s) => s._id !== payload.data._id)]);
      } else if (payload?.action === 'DELETED' && payload.data?._id) {
        setShelters((prev) => prev.filter((s) => s._id !== payload.data._id));
      } else {
        loadMapPoints();
      }
    };

    socket.on('hazard:event', handleHazardEvt);
    socket.on('hazard:sync', loadMapPoints);
    socket.on('shelter:event', handleShelterEvt);
    socket.on('shelter:sync', loadMapPoints);

    const onDataUpdated = () => loadMapPoints();
    window.addEventListener('sos_data_updated', onDataUpdated);

    return () => {
      isMounted = false;
      socket.off('hazard:event', handleHazardEvt);
      socket.off('hazard:sync', loadMapPoints);
      socket.off('shelter:event', handleShelterEvt);
      socket.off('shelter:sync', loadMapPoints);
      window.removeEventListener('sos_data_updated', onDataUpdated);
    };
  }, []);

  const createShelterDivIcon = (shelter: SafeLocationItem) => {
    const isFull = shelter.status === 'FULL' || (shelter.capacity > 0 && (shelter.currentOccupancy || 0) >= shelter.capacity);
    const isMaintenance = shelter.status === 'MAINTENANCE' || shelter.status === 'INACTIVE';
    const color = isMaintenance ? '#64748b' : isFull ? '#ea580c' : '#10b981';
    const symbol = shelter.type === 'HOSPITAL' ? '🏥' : shelter.type === 'EVACUATION_CENTER' ? '🏫' : '🛡️';

    return L.divIcon({
      className: 'tactical-shelter-beacon',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="
            background:${color};
            color:#ffffff;
            font-size:10px;
            font-weight:800;
            padding:1.5px 6px;
            border-radius:4px;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
            white-space:nowrap;
            margin-bottom:2px;
            max-width:125px;
            overflow:hidden;
            text-overflow:ellipsis;
            border:1px solid rgba(255,255,255,0.4);
          ">
            ${shelter.name}
          </div>
          <div style="
            width:26px;
            height:26px;
            background:${color};
            border-radius:50%;
            border:2.5px solid #ffffff;
            box-shadow:0 0 10px ${color}bb;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:12px;
          ">
            ${symbol}
          </div>
        </div>
      `,
      iconSize: [125, 46],
      iconAnchor: [62, 42],
    });
  };

  const createHazardDivIcon = (hazard: HazardReportItem) => {
    const isCritical = hazard.severity === 'CRITICAL';
    const color = isCritical ? '#dc2626' : hazard.severity === 'HIGH' ? '#ea580c' : hazard.severity === 'MEDIUM' ? '#d97706' : '#64748b';
    const symbol =
      hazard.hazardType === 'FLOOD' ? '🌊' :
      hazard.hazardType === 'LANDSLIDE' ? '🪨' :
      hazard.hazardType === 'FALLEN_TREE' ? '🌳' :
      hazard.hazardType === 'ELECTRICAL' ? '⚡' :
      hazard.hazardType === 'ROAD_DAMAGE' ? '🚧' : '⚠️';

    return L.divIcon({
      className: 'tactical-hazard-beacon',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;">
          ${isCritical ? `
            <div style="
              position:absolute;
              top:13px;
              width:34px;
              height:34px;
              border-radius:50%;
              background:${color};
              opacity:0.35;
              animation:pulse-beacon 1.5s infinite;
            "></div>
          ` : ''}
          <div style="
            background:${color};
            color:#ffffff;
            font-size:10px;
            font-weight:800;
            padding:1.5px 6px;
            border-radius:4px;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
            white-space:nowrap;
            margin-bottom:2px;
            max-width:125px;
            overflow:hidden;
            text-overflow:ellipsis;
            border:1px solid rgba(255,255,255,0.4);
            position:relative;
            z-index:2;
          ">
            ${hazard.title}
          </div>
          <div style="
            width:26px;
            height:26px;
            background:${color};
            border-radius:50%;
            border:2.5px solid #ffffff;
            box-shadow:0 0 10px ${color}cc;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:12px;
            position:relative;
            z-index:2;
          ">
            ${symbol}
          </div>
        </div>
      `,
      iconSize: [125, 46],
      iconAnchor: [62, 42],
    });
  };

  const initialMapBundle = useMemo(
    () => getCachedProvinceMapBundleSync(TARGET_PROVINCE_NAME),
    []
  );

  const [boundaryArea, setBoundaryArea] = useState<AdministrativeArea | null>(
    () => initialMapBundle?.province || getCachedProvinceBoundarySync(TARGET_PROVINCE_NAME)
  );
  const [wardAreas, setWardAreas] = useState<AdministrativeArea[]>(() =>
    initialMapBundle?.wards ? filterAdminDaNangWards(initialMapBundle.wards) : []
  );
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [showWardBoundaries, setShowWardBoundaries] = useState(false);
  const [wardsLoading, setWardsLoading] = useState(false);

  const [rawSosList, setRawSosList] = useState<SosRequestItem[]>([]);
  const [sosLoadError, setSosLoadError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<AdminSosFilterMode>('ACTIVE');
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ lat: number; lng: number; seq: number } | null>(null);

  const hoangSaArea = useMemo(
    () => wardAreas.find((w) => /hoàng\s*sa/i.test(w.name || '')) || HOANG_SA_ISLAND_AREA,
    [wardAreas]
  );

  const [showShelters, setShowShelters] = useState(false);
  const [showHazards, setShowHazards] = useState(false);

  const loadDaNangWards = useCallback(async () => {
    setWardsLoading(true);
    try {
      // 1. Ưu tiên đọc đồng thời ranh giới tỉnh + xã/phường/đặc khu từ CSDL MongoDB cho tốc độ mở trang nhanh
      const dbBundle = await fetchProvinceMapBundleFromDb(TARGET_PROVINCE_NAME);
      if (dbBundle?.province?.boundary) {
        setBoundaryArea(dbBundle.province);
      }
      if (dbBundle?.wards && dbBundle.wards.length > 0) {
        setWardAreas(filterAdminDaNangWards(dbBundle.wards));
        return;
      }

      // 2. Fallback sang Geoapify / API riêng lẻ chỉ khi DB bundle chưa có đủ dữ liệu
      if (!dbBundle?.province?.boundary) {
        const fallbackProv = await fetchProvinceBoundaryFromApi(TARGET_PROVINCE_NAME);
        if (fallbackProv?.boundary) {
          setBoundaryArea(fallbackProv);
        }
      }
      const rawWards = await fetchGeoapifyBoundaries();
      setWardAreas(filterAdminDaNangWards(rawWards));
    } catch (err) {
      console.warn('Không thể tải ranh giới xã/phường từ API:', err);
    } finally {
      setWardsLoading(false);
    }
  }, []);

  const loadAreaSos = useCallback(async () => {
    try {
      const res = await fetchSosRequests({});
      if (res?.success && Array.isArray(res.data)) {
        setRawSosList(res.data);
        setSosLoadError(null);
      } else {
        setSosLoadError('Không thể tải danh sách SOS từ máy chủ.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải danh sách SOS từ máy chủ.';
      console.warn(`Không thể tải danh sách SOS tại ${TARGET_PROVINCE_NAME}:`, err);
      setSosLoadError(message);
    }
  }, []);

  // Tải boundary khu vực mục tiêu, danh sách xã/phường Đà Nẵng & danh sách SOS ban đầu
  useEffect(() => {
    loadAreaSos();
    loadDaNangWards();
  }, [loadAreaSos, loadDaNangWards]);

  // Đồng bộ dữ liệu SOS thời gian thực qua Socket.IO (chỉ xem)
  useEffect(() => {
    const unsubCreated = onSosCreated(() => loadAreaSos());
    const unsubUpdated = onSosUpdated(() => loadAreaSos());
    const unsubDeleted = onSosDeleted(() => loadAreaSos());
    const unsubAssignment = onAssignmentUpdated(() => loadAreaSos());
    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
      unsubAssignment();
    };
  }, [loadAreaSos]);

  const handleToggleWardBoundaries = useCallback(async () => {
    const nextState = !showWardBoundaries;
    setShowWardBoundaries(nextState);
    if (nextState && wardAreas.length === 0 && !wardsLoading) {
      await loadDaNangWards();
    }
  }, [showWardBoundaries, wardAreas.length, wardsLoading, loadDaNangWards]);

  const effectiveScopeArea = useMemo<AdministrativeArea>(
    () =>
      boundaryArea || {
        id: 'target-province-scope',
        name: TARGET_PROVINCE_NAME,
        code: 'VN-DN',
        type: 'PROVINCE',
        parentId: null,
      },
    [boundaryArea]
  );

  const areaSosList = useMemo(
    () => mapBackendSosForAdmin(rawSosList, effectiveScopeArea),
    [rawSosList, effectiveScopeArea]
  );

  const selectedWard = useMemo(
    () => (selectedWardId ? wardAreas.find((w) => w.id === selectedWardId) || null : null),
    [wardAreas, selectedWardId]
  );

  // Ánh xạ 1-1 mỗi SOS -> 1 xã/phường duy nhất để bộ đếm dropdown và danh sách lọc luôn khớp nhau
  const sosWardIdMap = useMemo(() => {
    const mapping = new Map<string, string>();
    if (wardAreas.length === 0 || areaSosList.length === 0) return mapping;

    for (const sos of areaSosList) {
      const matchedWard = resolveSosWard(sos, wardAreas);
      if (matchedWard) {
        mapping.set(sos.id, matchedWard.id);
      }
    }
    return mapping;
  }, [wardAreas, areaSosList]);

  // Đếm số SOS theo từng xã/phường để hiển thị nhanh trong bộ lọc
  const wardSosCountMap = useMemo(() => {
    const mapCounts: Record<string, number> = {};
    sosWardIdMap.forEach((wardId) => {
      mapCounts[wardId] = (mapCounts[wardId] || 0) + 1;
    });
    return mapCounts;
  }, [sosWardIdMap]);

  const scopedSosList = useMemo(() => {
    if (!selectedWard) return areaSosList;
    return areaSosList.filter((s) => sosWardIdMap.get(s.id) === selectedWard.id);
  }, [areaSosList, selectedWard, sosWardIdMap]);

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let cancelled = 0;
    for (const s of scopedSosList) {
      const grp = getAdminSosStatusMeta(s.status).group;
      if (grp === 'COMPLETED') completed += 1;
      else if (grp === 'CANCELLED') cancelled += 1;
      else active += 1;
    }
    return {
      all: scopedSosList.length,
      active,
      completed,
      cancelled,
    };
  }, [scopedSosList]);

  const filteredSosList = useMemo(() => {
    if (filterMode === 'ALL') return scopedSosList;
    return scopedSosList.filter((s) => getAdminSosStatusMeta(s.status).group === filterMode);
  }, [scopedSosList, filterMode]);

  const selectedSos = useMemo(
    () => scopedSosList.find((s) => s.id === selectedSosId) || null,
    [scopedSosList, selectedSosId]
  );

  const handleSelectWard = useCallback((wardId: string | null) => {
    setSelectedWardId(wardId);
    setSelectedSosId(null);
  }, []);

  const handleSelectSos = useCallback((sos: AdminSosItem | null) => {
    setSelectedSosId(sos ? sos.id : null);
  }, []);

  const handleFocusSos = useCallback((sos: AdminSosItem) => {
    setSelectedSosId(sos.id);
    setFocusRequest({ lat: sos.lat, lng: sos.lng, seq: Date.now() });
  }, []);

  const tileUrl =
    mapMode === 'satellite'
      ? GOOGLE_MAP_TILES.SATELLITE
      : GOOGLE_MAP_TILES.STREETS_CLEAN;

  const handleZoom = (delta: number) => {
    if (mapRef.current) {
      mapRef.current.setZoom(mapRef.current.getZoom() + delta);
    }
  };

  const handleReset = () => {
    if (!mapRef.current) return;
    const targetBoundary = selectedWard?.boundary || boundaryArea?.boundary;
    const rings = extractPolygonLatLngRings(targetBoundary);
    const points = rings.flat();
    if (points.length >= 3) {
      mapRef.current.fitBounds(L.latLngBounds(points), {
        padding: selectedWard ? [56, 56] : [32, 32],
        maxZoom: selectedWard ? 15 : 12,
      });
    } else {
      mapRef.current.flyTo(defaultCenter, defaultZoom, { duration: 0.8 });
    }
  };

  return (
    <div
      className="rescuesos-app admin-portal-wrapper"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Vùng bản đồ chính: Tràn viền 100% không còn thanh header trắng dư thừa */}
      <main style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <style>{`
          @keyframes pulse-beacon {
            0% { transform: scale(0.6); opacity: 0.9; }
            70% { transform: scale(1.6); opacity: 0; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          @keyframes admin-sos-pulse {
            0% { transform: scale(0.65); opacity: 0.9; }
            75% { transform: scale(1.65); opacity: 0; }
            100% { transform: scale(1.85); opacity: 0; }
          }
          .tactical-shelter-beacon, .tactical-hazard-beacon, .admin-sos-pin {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-container {
            width: 100% !important;
            height: 100% !important;
            font-family: inherit;
          }
        `}</style>

        <AdminMapHud
          targetAreaName={TARGET_PROVINCE_NAME}
          totalInArea={scopedSosList.length}
          counts={counts}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          filteredSosList={filteredSosList}
          selectedSos={selectedSos}
          onSelectSos={handleSelectSos}
          onFocusSos={handleFocusSos}
          wardsLoading={wardsLoading}
          wardAreas={wardAreas}
          selectedWard={selectedWard}
          onSelectWard={handleSelectWard}
          wardSosCountMap={wardSosCountMap}
        />

        {sosLoadError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.14)',
            }}
          >
            <AlertTriangle size={15} />
            <span>Lỗi tải SOS: {sosLoadError}</span>
            <button
              type="button"
              onClick={loadAreaSos}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Thanh điều khiển nổi góc trên phải: Nút chuyển cổng / đăng xuất (khi chạy độc lập) */}
        {!embedded && (onSwitchToAuthor || onLogout) && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              background: theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--sos-border)',
              borderRadius: 8,
              padding: 3,
              gap: 3,
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.15), 0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            {onSwitchToAuthor && (
              <button
                type="button"
                onClick={onSwitchToAuthor}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  color: '#dc2626',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>🛡️ Cổng Địa Phương</span>
                <ExternalLink size={12} />
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--sos-text-muted)',
                  cursor: 'pointer',
                  padding: 6,
                }}
                title="Đăng xuất"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        )}
        {/* Cụm nút điều khiển bản đồ góc dưới phải: Bật/tắt lớp (Ranh giới xã/phường, Trú ẩn, Nguy hiểm) + Zoom & Về trung tâm */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={handleToggleWardBoundaries}
              style={{
                width: 36,
                height: 36,
                background: showWardBoundaries ? '#2563eb' : '#ffffff',
                border: `1px solid ${showWardBoundaries ? '#1d4ed8' : '#e2e8f0'}`,
                borderBottom: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: showWardBoundaries ? '#ffffff' : '#334155',
                opacity: wardsLoading ? 0.65 : 1,
                transition: 'all 0.15s ease',
              }}
              title={
                wardsLoading
                  ? 'Đang tải ranh giới các xã/phường...'
                  : `Ranh giới Xã/Phường — ${showWardBoundaries ? 'Bấm để ẩn' : 'Bấm để hiện'}`
              }
              aria-label="Bật/tắt ranh giới các xã/phường"
              aria-pressed={showWardBoundaries}
            >
              <Layers size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowShelters((prev) => !prev)}
              style={{
                width: 36,
                height: 36,
                background: showShelters ? '#10b981' : '#ffffff',
                border: `1px solid ${showShelters ? '#059669' : '#e2e8f0'}`,
                borderBottom: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: showShelters ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
              }}
              title={`Trú ẩn (${shelters.length}) — ${showShelters ? 'Bấm để ẩn điểm an toàn' : 'Bấm để hiện điểm an toàn'}`}
              aria-label={`Trú ẩn (${shelters.length})`}
              aria-pressed={showShelters}
            >
              <Shield size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowHazards((prev) => !prev)}
              style={{
                width: 36,
                height: 36,
                background: showHazards ? '#dc2626' : '#ffffff',
                border: `1px solid ${showHazards ? '#b91c1c' : '#e2e8f0'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: showHazards ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
              }}
              title={`Nguy hiểm (${hazards.length}) — ${showHazards ? 'Bấm để ẩn điểm nguy hiểm' : 'Bấm để hiện điểm nguy hiểm'}`}
              aria-label={`Nguy hiểm (${hazards.length})`}
              aria-pressed={showHazards}
            >
              <AlertTriangle size={16} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => handleZoom(1)}
              style={{
                width: 36,
                height: 36,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderBottom: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
              }}
              title="Phóng to"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(-1)}
              style={{
                width: 36,
                height: 36,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderBottom: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
              }}
              title="Thu nhỏ"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                width: 36,
                height: 36,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
              }}
              title="Đưa về toàn cảnh bản đồ Đà Nẵng"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          minZoom={7}
          maxZoom={20}
          zoomSnap={0.5}
          zoomDelta={0.5}
          maxBounds={DANANG_WITH_HOANG_SA_BOUNDS}
          maxBoundsViscosity={0.9}
          preferCanvas={true}
          zoomControl={false}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            key={tileUrl}
            url={tileUrl}
            subdomains={['0', '1', '2', '3']}
            attribution="&copy; Google Maps"
            maxZoom={20}
          />
          <MapController
            boundaryArea={boundaryArea}
            hoangSaArea={hoangSaArea}
            onMount={(m) => {
              mapRef.current = m;
            }}
          />

          <AdminMapContent
            boundaryArea={boundaryArea}
            wardAreas={wardAreas}
            selectedWard={selectedWard}
            showWardBoundaries={showWardBoundaries}
            theme={theme}
            sosList={filteredSosList}
            selectedSos={selectedSos}
            onSelectSos={handleSelectSos}
            focusRequest={focusRequest}
          />

          {/* Ghim các điểm trú ẩn an toàn */}
          {showShelters &&
            shelters.map((sh) => {
              const coords = sh.location?.coordinates;
              if (!Array.isArray(coords) || coords.length < 2) return null;
              const [lng, lat] = coords;
              if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;
              const remaining = Math.max(0, (sh.capacity || 0) - (sh.currentOccupancy || 0));

              return (
                <Marker
                  key={`admin-sh-${sh._id}`}
                  position={[lat, lng]}
                  icon={createShelterDivIcon(sh)}
                  zIndexOffset={500}
                >
                  <Popup>
                    <div style={{ fontFamily: 'inherit', padding: '3px 2px', minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>🛡️</span>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                          {sh.name}
                        </div>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: 6 }}>
                        📍 {sh.address || 'Chưa cập nhật địa chỉ'}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 4,
                          background: '#f8fafc',
                          padding: '6px',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          fontSize: '11px',
                          marginBottom: 6,
                        }}
                      >
                        <div>Sức chứa: <strong>{sh.capacity || 0}</strong></div>
                        <div>Đang ở: <strong>{sh.currentOccupancy || 0}</strong></div>
                        <div
                          style={{
                            gridColumn: 'span 2',
                            color: remaining > 0 ? '#16a34a' : '#dc2626',
                            fontWeight: 700,
                          }}
                        >
                          {remaining > 0 ? `Còn trống: ${remaining} chỗ` : 'Đã kín chỗ'}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: sh.status === 'ACTIVE' ? '#16a34a' : '#64748b',
                        }}
                      >
                        Trạng thái: {sh.status === 'ACTIVE' ? '✓ Đang mở cửa tiếp nhận' : sh.status === 'FULL' ? '● Đã đầy' : '● Tạm ngưng'}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Ghim các điểm nguy hiểm */}
          {showHazards &&
            hazards.map((hz) => {
              const coords = hz.location?.coordinates;
              if (!Array.isArray(coords) || coords.length < 2) return null;
              const [lng, lat] = coords;
              if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;

              return (
                <Marker
                  key={`admin-hz-${hz._id}`}
                  position={[lat, lng]}
                  icon={createHazardDivIcon(hz)}
                  zIndexOffset={600}
                >
                  <Popup>
                    <div style={{ fontFamily: 'inherit', padding: '3px 2px', minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#dc2626' }}>
                          {hz.title}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: hz.severity === 'CRITICAL' ? '#fef2f2' : '#fff7ed',
                            color: hz.severity === 'CRITICAL' ? '#b91c1c' : '#c2410c',
                            border: `1px solid ${hz.severity === 'CRITICAL' ? '#fca5a5' : '#fed7aa'}`,
                          }}
                        >
                          {hz.severity === 'CRITICAL' ? 'NGUY CẤP' : hz.severity === 'HIGH' ? 'KHẨN CẤP' : hz.severity === 'MEDIUM' ? 'TRUNG BÌNH' : 'THẤP'}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: '#f1f5f9',
                            color: '#334155',
                          }}
                        >
                          {hz.hazardType}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: 4 }}>
                        📍 {hz.address || 'Chưa cập nhật địa chỉ'}
                      </div>
                      {hz.description && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#1e293b',
                            fontStyle: 'italic',
                            marginBottom: 6,
                            lineHeight: 1.35,
                          }}
                        >
                          "{hz.description}"
                        </div>
                      )}
                      {Array.isArray(hz.images) && hz.images.length > 0 && (
                        <div style={{ borderRadius: 6, overflow: 'hidden', height: 80, marginBottom: 4 }}>
                          <img
                            src={hz.images[0]}
                            alt="Hiện trường"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </main>
    </div>
  );
};

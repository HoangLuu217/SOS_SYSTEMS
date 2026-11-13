import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Plus,
  Minus,
  RotateCcw,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { fetchSosRequests } from '@/api/sos.api';
import { GOOGLE_MAP_TILES } from '@/services/mapGeoService';
import {
  extractPolygonLatLngRings,
  fetchGeoapifyBoundaries,
  fetchProvinceBoundaryFromApi,
  getCachedProvinceBoundarySync,
} from '@/services/geoapifyBoundariesService';
import {
  onSosCreated,
  onSosUpdated,
  onSosDeleted,
  onAssignmentUpdated,
} from '@/services/socketService';
import type { SosRequestItem } from '@/types/dashboard';
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
  onSwitchToAuthor?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

const FALLBACK_DANANG_BOUNDS: L.LatLngBoundsExpression = [
  [14.94, 107.18],
  [16.25, 108.78],
];

// Controller component điều khiển Leaflet map và khóa phạm vi zoom/kéo trong khu vực Đà Nẵng
const MapController = ({
  onMount,
  boundaryArea,
}: {
  onMount?: (map: L.Map) => void;
  boundaryArea: AdministrativeArea | null;
}) => {
  const map = useMap();

  const applyDanangBoundsLock = useCallback(() => {
    const rings = extractPolygonLatLngRings(boundaryArea?.boundary);
    const points = rings.flat();
    const coreBounds =
      points.length >= 3 ? L.latLngBounds(points) : L.latLngBounds(FALLBACK_DANANG_BOUNDS);
    // Đệm nhẹ 5% quanh ranh giới để không bị cắt mất nhãn/ghim ở sát mép Đà Nẵng
    const lockedBounds = coreBounds.pad(0.05);

    map.options.maxBoundsViscosity = 1.0;
    map.setMaxBounds(lockedBounds);

    const fitZoom = map.getBoundsZoom(coreBounds, false, L.point(24, 24));
    const minZoom = Number.isFinite(fitZoom) ? Math.max(9, fitZoom) : 9.5;
    map.setMinZoom(minZoom);

    if (map.getZoom() < minZoom) {
      map.setZoom(minZoom);
    }
  }, [map, boundaryArea]);

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

  const [boundaryArea, setBoundaryArea] = useState<AdministrativeArea | null>(() =>
    getCachedProvinceBoundarySync(TARGET_PROVINCE_NAME)
  );
  const [wardAreas, setWardAreas] = useState<AdministrativeArea[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [showWardBoundaries, setShowWardBoundaries] = useState(false);
  const [wardsLoading, setWardsLoading] = useState(false);

  const [rawSosList, setRawSosList] = useState<SosRequestItem[]>([]);
  const [filterMode, setFilterMode] = useState<AdminSosFilterMode>('ACTIVE');
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ lat: number; lng: number; seq: number } | null>(null);

  const loadDaNangWards = useCallback(async () => {
    setWardsLoading(true);
    try {
      const rawWards = await fetchGeoapifyBoundaries();
      const mainlandWards = rawWards
        .filter((w) => {
          const name = (w.name || '').trim();
          if (!name) return false;
          if (w.id === 'area-hs' || /hoàng\s*sa/i.test(name)) return false;
          if (/mở\s*rộng|lân\s*cận|geoapify/i.test(name)) return false;
          if (/^(thành\s*phố\s*|tp\.?\s*)?đà\s*nẵng$/i.test(name)) return false;
          if (/^(quận|huyện|thị\s*xã)\s+/i.test(name)) return false;
          return /^(phường|xã|thị\s*trấn)\s+/i.test(name);
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      setWardAreas(mainlandWards);
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
      }
    } catch (err) {
      console.warn(`Không thể tải danh sách SOS tại ${TARGET_PROVINCE_NAME}:`, err);
    }
  }, []);

  // Tải boundary khu vực mục tiêu, danh sách xã/phường Đà Nẵng & danh sách SOS ban đầu
  useEffect(() => {
    let mounted = true;
    if (!boundaryArea?.boundary) {
      fetchProvinceBoundaryFromApi(TARGET_PROVINCE_NAME)
        .then((area) => {
          if (mounted && area?.boundary) {
            setBoundaryArea(area);
          }
        });
    }
    loadAreaSos();
    loadDaNangWards();
    return () => {
      mounted = false;
    };
  }, [loadAreaSos, loadDaNangWards, boundaryArea?.boundary]);

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
          @keyframes admin-sos-pulse {
            0% { transform: scale(0.65); opacity: 0.9; }
            75% { transform: scale(1.65); opacity: 0; }
            100% { transform: scale(1.85); opacity: 0; }
          }
          .admin-sos-pin {
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
          showWardBoundaries={showWardBoundaries}
          onToggleWardBoundaries={handleToggleWardBoundaries}
          wardsLoading={wardsLoading}
          wardAreas={wardAreas}
          selectedWard={selectedWard}
          onSelectWard={handleSelectWard}
          wardSosCountMap={wardSosCountMap}
        />

        {/* Ẩn bộ chuyển đổi Đường phố / Vệ tinh; chỉ hiện thanh nổi góc phải khi ở chế độ độc lập */}
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
        <style>{`
          .leaflet-container {
            width: 100% !important;
            height: 100% !important;
            font-family: inherit;
          }
        `}</style>
        {/* Nút điều khiển Zoom và Về trung tâm */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            zIndex: 1000,
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

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          minZoom={9}
          maxZoom={20}
          zoomSnap={0.5}
          zoomDelta={0.5}
          maxBounds={FALLBACK_DANANG_BOUNDS}
          maxBoundsViscosity={1.0}
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
            onMount={(m) => {
              mapRef.current = m;
            }}
          />
          <AdminMapContent
            boundaryArea={boundaryArea}
            wardAreas={wardAreas}
            selectedWard={selectedWard}
            showWardBoundaries={showWardBoundaries}
            sosList={filteredSosList}
            selectedSos={selectedSos}
            onSelectSos={handleSelectSos}
            focusRequest={focusRequest}
          />
        </MapContainer>
      </main>
    </div>
  );
};

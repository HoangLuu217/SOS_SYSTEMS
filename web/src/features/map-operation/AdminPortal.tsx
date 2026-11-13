import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Map as MapIcon,
  Layers,
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
  type AdminSosItem,
  type AdminSosFilterMode,
} from './AdminMapLayers';
import './RescueSos.css';

interface Props {
  onSwitchToAuthor?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

// Controller component điều khiển Leaflet map
const MapController = ({ onMount }: { onMount?: (map: L.Map) => void }) => {
  const map = useMap();

  useEffect(() => {
    if (onMount) onMount(map);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map, onMount]);

  return null;
};

const TARGET_PROVINCE_NAME = 'Thành phố Đà Nẵng';

export const AdminPortal = ({ onSwitchToAuthor, onLogout, embedded = false }: Props) => {
  const { theme, mapMode, setMapMode } = useApp();
  const mapRef = useRef<L.Map | null>(null);

  const defaultCenter: [number, number] = [16.0544, 108.2022];
  const defaultZoom = 12;

  const [boundaryArea, setBoundaryArea] = useState<AdministrativeArea | null>(() =>
    getCachedProvinceBoundarySync(TARGET_PROVINCE_NAME)
  );
  const [wardAreas, setWardAreas] = useState<AdministrativeArea[]>([]);
  const [showWardBoundaries, setShowWardBoundaries] = useState(false);
  const [wardsLoading, setWardsLoading] = useState(false);

  const [rawSosList, setRawSosList] = useState<SosRequestItem[]>([]);
  const [filterMode, setFilterMode] = useState<AdminSosFilterMode>('ALL');
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ lat: number; lng: number; seq: number } | null>(null);

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

  // Tải boundary khu vực mục tiêu trực tiếp từ API & danh sách SOS ban đầu
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
    return () => {
      mounted = false;
    };
  }, [loadAreaSos, boundaryArea?.boundary]);

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
      try {
        setWardsLoading(true);
        const wards = await fetchGeoapifyBoundaries();
        setWardAreas(wards);
      } catch (err) {
        console.warn('Không thể tải ranh giới xã/phường từ API:', err);
      } finally {
        setWardsLoading(false);
      }
    }
  }, [showWardBoundaries, wardAreas.length, wardsLoading]);

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

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let cancelled = 0;
    for (const s of areaSosList) {
      const grp = getAdminSosStatusMeta(s.status).group;
      if (grp === 'COMPLETED') completed += 1;
      else if (grp === 'CANCELLED') cancelled += 1;
      else active += 1;
    }
    return {
      all: areaSosList.length,
      active,
      completed,
      cancelled,
    };
  }, [areaSosList]);

  const filteredSosList = useMemo(() => {
    if (filterMode === 'ALL') return areaSosList;
    return areaSosList.filter((s) => getAdminSosStatusMeta(s.status).group === filterMode);
  }, [areaSosList, filterMode]);

  const selectedSos = useMemo(
    () => areaSosList.find((s) => s.id === selectedSosId) || null,
    [areaSosList, selectedSosId]
  );

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
    const rings = extractPolygonLatLngRings(boundaryArea?.boundary);
    const points = rings.flat();
    if (points.length >= 3) {
      mapRef.current.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 12 });
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
          totalInArea={areaSosList.length}
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
        />

        {/* Chuyển đổi chế độ Đường phố / Vệ tinh - Nổi trực tiếp trên bản đồ */}
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
          <button
            type="button"
            onClick={() => setMapMode('street')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: mapMode === 'street' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
              color: mapMode === 'street' ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <MapIcon size={13} />
            <span>Đường phố</span>
          </button>
          <button
            type="button"
            onClick={() => setMapMode('satellite')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: mapMode === 'satellite' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
              color: mapMode === 'satellite' ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={13} />
            <span>Vệ tinh</span>
          </button>

          {!embedded && onSwitchToAuthor && (
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

          {!embedded && onLogout && (
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
            title="Đưa về trung tâm TP Đà Nẵng"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
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
            onMount={(m) => {
              mapRef.current = m;
            }}
          />
          <AdminMapContent
            boundaryArea={boundaryArea}
            wardAreas={wardAreas}
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

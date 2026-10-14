import { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Map as MapIcon,
  Layers,
  Plus,
  Minus,
  RotateCcw,
  Sun,
  Moon,
  ExternalLink,
  LogOut,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GOOGLE_MAP_TILES } from '../../services/mapGeoService';
import '../RescueSos.css';

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

export const AdminPortal = ({ onSwitchToAuthor, onLogout, embedded = false }: Props) => {
  const { theme, setTheme, mapMode, setMapMode, mapCleanMode, toggleMapCleanMode } = useApp();
  const mapRef = useRef<L.Map | null>(null);

  const defaultCenter: [number, number] = [16.0544, 108.2022];
  const defaultZoom = 12;

  const tileUrl =
    mapMode === 'satellite'
      ? GOOGLE_MAP_TILES.SATELLITE
      : (mapCleanMode ? GOOGLE_MAP_TILES.STREETS_CLEAN : GOOGLE_MAP_TILES.STREETS_FULL);

  const handleZoom = (delta: number) => {
    if (mapRef.current) {
      mapRef.current.setZoom(mapRef.current.getZoom() + delta);
    }
  };

  const handleReset = () => {
    if (mapRef.current) {
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
      {/* Thanh header điều hướng tối giản */}
      <header
        style={{
          height: 50,
          background: 'var(--sos-bg-primary)',
          borderBottom: '1px solid var(--sos-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 16px',
          zIndex: 500,
          flexShrink: 0,
        }}
      >
        {/* Chuyển đổi chế độ Đường phố / Vệ tinh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
              border: '1px solid var(--sos-border)',
              borderRadius: 6,
              padding: 2,
              gap: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setMapMode('street')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 5,
                border: 'none',
                background: mapMode === 'street' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
                color: mapMode === 'street' ? '#ffffff' : 'var(--sos-text-secondary)',
                fontWeight: 600,
                fontSize: 11.5,
                cursor: 'pointer',
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
                padding: '4px 10px',
                borderRadius: 5,
                border: 'none',
                background: mapMode === 'satellite' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
                color: mapMode === 'satellite' ? '#ffffff' : 'var(--sos-text-secondary)',
                fontWeight: 600,
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              <Layers size={13} />
              <span>Vệ tinh</span>
            </button>
          </div>

          {mapMode === 'street' && (
            <button
              type="button"
              onClick={toggleMapCleanMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                border: '1px solid var(--sos-border)',
                background: mapCleanMode ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                color: mapCleanMode ? '#10b981' : 'var(--sos-text-secondary)',
                fontWeight: 600,
                fontSize: 11.5,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={
                mapCleanMode
                  ? 'Đang ẩn các ký hiệu nhỏ (quán xá, bến xe buýt...). Bấm để hiện đầy đủ'
                  : 'Đang hiện đầy đủ mọi ký hiệu. Bấm để ẩn bớt ký hiệu không cần thiết'
              }
            >
              {mapCleanMode ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{mapCleanMode ? 'Ẩn ký hiệu phụ' : 'Hiện đầy đủ'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: 'transparent',
              border: '1px solid var(--sos-border)',
              borderRadius: 6,
              padding: '5px 7px',
              color: 'var(--sos-text-secondary)',
              cursor: 'pointer',
            }}
            title={theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
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
      </header>

      {/* Vùng bản đồ chính: Giữ nguyên vẹn bản đồ bình thường, không chứa bất kỳ sidebar hay overlay rườm rà nào */}
      <main style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
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
        </MapContainer>
      </main>
    </div>
  );
};

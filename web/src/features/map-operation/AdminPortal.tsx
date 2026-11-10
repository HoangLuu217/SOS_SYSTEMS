import { useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { GOOGLE_MAP_TILES } from '@/services/mapGeoService';
import type { User } from '@/types/auth';
import type { HazardReportItem, SafeLocationItem } from '@/types/dashboard';
import { fetchHazardReports } from '@/api/hazard.api';
import { fetchSafeLocations } from '@/api/shelter.api';
import { getSocket } from '@/services/socketService';
import './RescueSos.css';

interface Props {
  user?: User | null;
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
  const { theme, mapMode, setMapMode } = useApp();
  const mapRef = useRef<L.Map | null>(null);

  const defaultCenter: [number, number] = [16.0544, 108.2022];
  const defaultZoom = 12;

  // Ghim Điểm An Toàn & Điểm Nguy Hiểm
  const [hazards, setHazards] = useState<HazardReportItem[]>([]);
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);
  const [showHazards, setShowHazards] = useState<boolean>(true);
  const [showShelters, setShowShelters] = useState<boolean>(true);

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
      {/* Vùng bản đồ chính: Tràn viền 100% không còn thanh header trắng dư thừa */}
      <main style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <style>{`
          @keyframes pulse-beacon {
            0% { transform: scale(0.6); opacity: 0.9; }
            70% { transform: scale(1.6); opacity: 0; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          .tactical-shelter-beacon, .tactical-hazard-beacon {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-container {
            width: 100% !important;
            height: 100% !important;
            font-family: inherit;
          }
        `}</style>

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

          <button
            type="button"
            onClick={() => setShowShelters((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${showShelters ? '#059669' : '#cbd5e1'}`,
              background: showShelters ? '#10b981' : 'transparent',
              color: showShelters ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 700,
              fontSize: 11.5,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={showShelters ? 'Ẩn điểm trú ẩn' : 'Hiện điểm trú ẩn'}
          >
            <Shield size={13} />
            <span>Trú ẩn ({shelters.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHazards((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${showHazards ? '#b91c1c' : '#cbd5e1'}`,
              background: showHazards ? '#dc2626' : 'transparent',
              color: showHazards ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 700,
              fontSize: 11.5,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={showHazards ? 'Ẩn điểm nguy hiểm' : 'Hiện điểm nguy hiểm'}
          >
            <AlertTriangle size={13} />
            <span>Nguy hiểm ({hazards.length})</span>
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
          @keyframes pulse-beacon {
            0% { transform: scale(0.6); opacity: 0.9; }
            70% { transform: scale(1.6); opacity: 0; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          .tactical-shelter-beacon, .tactical-hazard-beacon {
            background: transparent !important;
            border: none !important;
          }
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

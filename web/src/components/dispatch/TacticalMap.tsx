import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  Polyline,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  AuthorityOfficer,
  AdministrativeArea,
} from '../../types/domainD';
import {
  isSosInOfficerJurisdiction,
} from '../../services/mapGeoService';
import { useApp } from '../../context/AppContext';

interface Props {
  selectedSos: SosRequest;
  assignment: SosAssignment | null;
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
  sosRequests?: SosRequest[];
  onSelectSos?: (sos: SosRequest) => void;
}

// Controller component để điều khiển Leaflet map (FlyTo, Zoom, Reset center)
const LeafletMapController = ({
  center,
  zoom,
  onMount,
}: {
  center: [number, number];
  zoom: number;
  onMount?: (map: L.Map) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (onMount) onMount(map);
  }, [map, onMount]);

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);

  return null;
};

export const TacticalMap = ({
  selectedSos,
  assignment,
  activeOfficer,
  areas = [],
  sosRequests = [],
  onSelectSos,
}: Props) => {
  const { mapMode } = useApp();
  const mapInstanceRef = useRef<L.Map | null>(null);

  const defaultLng = 108.2178;
  const defaultLat = 16.0465;
  const sosLng = selectedSos?.coordinates?.lng ?? defaultLng;
  const sosLat = selectedSos?.coordinates?.lat ?? defaultLat;

  // Google Maps Tiles URL (Streets & Satellite)
  const googleTilesUrl =
    mapMode === 'satellite'
      ? 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

  // Kiểm tra SOS có thuộc phạm vi quản lý của cán bộ không
  const managedWard = areas[0];
  const isSelectedInJurisdiction = isSosInOfficerJurisdiction(selectedSos, activeOfficer, managedWard);

  // Lọc các ca SOS khác thuộc khu vực
  const otherSosList = useMemo(() => {
    return sosRequests.filter(
      (s) => s.id !== selectedSos?.id && isSosInOfficerJurisdiction(s, activeOfficer, managedWard)
    );
  }, [sosRequests, selectedSos?.id, activeOfficer, managedWard]);

  // Icon SOS Beacon nhấp nháy đỏ dạng Radar SVG
  const mainSosIcon = useMemo(() => {
    return L.divIcon({
      className: 'tactical-main-sos-beacon',
      html: `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="
            position: absolute;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background-color: rgba(220, 38, 38, 0.4);
            border: 2px solid #dc2626;
            animation: pulse-beacon 1.4s infinite ease-out;
          "></div>
          <div style="
            position: relative;
            width: 24px;
            height: 24px;
            background: #dc2626;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 16px rgba(220, 38, 38, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }, []);

  // Icon cho các ca SOS khác trên địa bàn
  const createOtherSosIcon = (sosCode: string) => {
    return L.divIcon({
      className: 'tactical-other-sos-beacon',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div style="
            background: #dc2626;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
            margin-bottom: 3px;
            border: 1px solid rgba(255,255,255,0.7);
          ">
            ${sosCode}
          </div>
          <div style="
            width: 14px;
            height: 14px;
            background: #dc2626;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 0 8px rgba(220,38,38,0.7);
          "></div>
        </div>
      `,
      iconSize: [60, 32],
      iconAnchor: [30, 24],
    });
  };

  // Icon cho Đội cứu hộ (nếu đã phân công)
  const rescuerIcon = useMemo(() => {
    return L.divIcon({
      className: 'tactical-rescuer-beacon',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="
            background: #0284c7;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
            margin-bottom: 2px;
          ">
            ĐỘI CỨU HỘ
          </div>
          <div style="
            width: 24px;
            height: 24px;
            background: #0284c7;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 12px rgba(2, 132, 199, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
          ">
            🚤
          </div>
        </div>
      `,
      iconSize: [70, 40],
      iconAnchor: [35, 32],
    });
  }, []);

  // Lấy danh sách ranh giới Polygon của các khu vực hành chính được giao
  const wardPolygons = useMemo(() => {
    const list: Array<{ id: string; name: string; positions: [number, number][]; color: string }> = [];

    areas.forEach((area) => {
      const boundary = area.boundary;
      if (!boundary || !Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
        return;
      }

      if (boundary.type === 'Polygon') {
        const polygonCoords = boundary.coordinates as number[][][];
        if (polygonCoords.length > 0 && Array.isArray(polygonCoords[0])) {
          const latLngs: [number, number][] = polygonCoords[0]
            .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
            .map(([lng, lat]) => [lat, lng]);

          if (latLngs.length >= 3) {
            list.push({
              id: area.id,
              name: area.name,
              positions: latLngs,
              color: '#dc2626',
            });
          }
        }
      } else if (boundary.type === 'MultiPolygon') {
        const multiCoords = boundary.coordinates as number[][][][];
        multiCoords.forEach((poly, polyIdx) => {
          if (Array.isArray(poly) && poly.length > 0 && Array.isArray(poly[0])) {
            const latLngs: [number, number][] = poly[0]
              .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
              .map(([lng, lat]) => [lat, lng]);

            if (latLngs.length >= 3) {
              list.push({
                id: `${area.id}-${polyIdx}`,
                name: area.name,
                positions: latLngs,
                color: '#dc2626',
              });
            }
          }
        });
      }
    });

    return list;
  }, [areas]);

  // Tuyến đường cứu hộ nối từ rescuer tới SOS (nếu có assignment)
  const tacticalRouteLatLngs = useMemo<[number, number][] | null>(() => {
    if (!assignment || assignment.status === 'CANCELLED') return null;
    const rescuerLng = assignment.rescuerLocation?.lng ?? (sosLng + 0.009);
    const rescuerLat = assignment.rescuerLocation?.lat ?? (sosLat - 0.007);
    return [
      [rescuerLat, rescuerLng],
      [sosLat, sosLng],
    ];
  }, [assignment, sosLng, sosLat]);

  const typeIconMap: Record<string, string> = {
    MEDICAL: '🚑 Y Tế',
    FIRE: '🔥 Cháy',
    POLICE: '🚓 An Ninh',
    RESCUE: '🛟 Cứu Hộ',
    FLOOD: '🌊 Ngập Lụt',
  };
  const typeLabel = typeIconMap[selectedSos.emergencyType] || selectedSos.emergencyType;

  // Zoom controls
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleResetCenter = () => {
    mapInstanceRef.current?.flyTo([sosLat, sosLng], 15);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#f1f5f9',
      }}
    >
      <style>{`
        @keyframes pulse-beacon {
          0% { transform: scale(0.6); opacity: 0.9; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .tactical-main-sos-beacon, .tactical-other-sos-beacon, .tactical-rescuer-beacon {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
          font-family: inherit;
        }
      `}</style>

      {/* Google Maps Tiles qua React-Leaflet */}
      <MapContainer
        center={[sosLat, sosLng]}
        zoom={15}
        preferCanvas={true}
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          key={googleTilesUrl}
          url={googleTilesUrl}
          subdomains={['0', '1', '2', '3']}
          attribution="&copy; Google Maps"
          maxZoom={20}
        />

        <LeafletMapController
          center={[sosLat, sosLng]}
          zoom={15}
          onMount={(m) => {
            mapInstanceRef.current = m;
          }}
        />

        {/* 1. Vẽ Ranh Giới Hành Chính Khu Vực Phụ Trách */}
        {wardPolygons.map((w) => (
          <Polygon
            key={`ward-poly-${w.id}-pink-v4`}
            positions={w.positions}
            pathOptions={{
              color: '#e11d48',
              fillColor: '#f472b6',
              fillOpacity: 0.09,
              weight: 2,
              dashArray: '6, 6',
            }}
          />
        ))}

        {/* 2. Đường Lộ Trình Cứu Hộ Đang Xuất Kích (Nếu có) */}
        {tacticalRouteLatLngs && (
          <Polyline
            positions={tacticalRouteLatLngs}
            pathOptions={{
              color: '#0284c7',
              weight: 4,
              dashArray: '8, 8',
              opacity: 0.85,
            }}
          />
        )}

        {/* 3. Marker Điểm SOS Chính Đang Chọn (Kèm Radar & Popup chi tiết) */}
        {isSelectedInJurisdiction && (
          <Marker position={[sosLat, sosLng]} icon={mainSosIcon}>
            <Popup autoPan={false}>
              <div style={{ fontFamily: 'inherit', padding: '2px', minWidth: '200px' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#dc2626', marginBottom: '2px' }}>
                  {selectedSos.sosCode} • {typeLabel}
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600 }}>
                  👤 {selectedSos.citizenName} ({selectedSos.citizenPhone})
                </div>
                <div style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 700, marginTop: '2px' }}>
                  ⚠️ {selectedSos.affectedPeople} người gặp nạn [{selectedSos.priority}]
                </div>
                {selectedSos.description && (
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', fontStyle: 'italic', lineHeight: '1.3' }}>
                    "{selectedSos.description.substring(0, 100)}{selectedSos.description.length > 100 ? '...' : ''}"
                  </div>
                )}
                {selectedSos.imageUrl && (
                  <div style={{ marginTop: '6px', borderRadius: '4px', overflow: 'hidden', height: '80px' }}>
                    <img
                      src={selectedSos.imageUrl}
                      alt="Hiện trường"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* 4. Các điểm SOS khác trong khu vực */}
        {otherSosList.map((sos) => {
          const lat = sos.coordinates?.lat ?? defaultLat;
          const lng = sos.coordinates?.lng ?? defaultLng;
          return (
            <Marker
              key={sos.id}
              position={[lat, lng]}
              icon={createOtherSosIcon(sos.sosCode)}
              eventHandlers={{
                click: () => {
                  if (onSelectSos) onSelectSos(sos);
                },
              }}
            />
          );
        })}

        {/* 5. Marker Đội Cứu Hộ Đang Xuất Kích */}
        {isSelectedInJurisdiction && assignment && assignment.status !== 'CANCELLED' && (
          <Marker
            position={[
              assignment.rescuerLocation?.lat ?? (sosLat - 0.007),
              assignment.rescuerLocation?.lng ?? (sosLng + 0.009),
            ]}
            icon={rescuerIcon}
          >
            <Popup>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0284c7' }}>
                🚤 {assignment.rescueTeamName}
              </div>
              <div style={{ fontSize: '11px', color: '#334155' }}>
                Chỉ huy: {assignment.rescuerName} ({assignment.rescuerRole})
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Floating Tactical Map Controls (Top Right: Zoom in, Zoom out, Reset) */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={handleZoomIn}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#1e293b',
          }}
          title="Phóng to"
        >
          <Plus size={16} />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#1e293b',
          }}
          title="Thu nhỏ"
        >
          <Minus size={16} />
        </button>

        <button
          type="button"
          onClick={handleResetCenter}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#1e293b',
          }}
          title="Đưa về tâm điểm SOS"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Watermark Biển đảo Việt Nam (Đảm bảo chủ quyền Hoàng Sa & Trường Sa) */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: 10,
          zIndex: 1000,
          fontSize: '11px',
          fontWeight: 600,
          color: '#475569',
          background: 'rgba(255, 255, 255, 0.85)',
          padding: '2px 8px',
          borderRadius: 4,
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
        }}
      >
        🇻🇳 Bản đồ Google Maps • Toàn vẹn chủ quyền lãnh thổ Việt Nam
      </div>
    </div>
  );
};

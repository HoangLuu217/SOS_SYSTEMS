import { useEffect, useMemo, useRef, Fragment } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
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
  RescueTeam,
  RescuerProfile,
  Vehicle,
} from '../../types/domainD';
import {
  isSosInOfficerJurisdiction,
  GOOGLE_MAP_TILES,
} from '../../services/mapGeoService';
import { WARD_CENTROIDS, getAreaCentroid } from '../territorial/TerritorialMapCanvas';
import { useApp } from '../../context/AppContext';

interface Props {
  selectedSos: SosRequest | null;
  assignment: SosAssignment | null;
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
  sosRequests?: SosRequest[];
  onSelectSos?: (sos: SosRequest) => void;
  previewTeamIds?: string[];
  rescueTeams?: RescueTeam[];
  vehicles?: Vehicle[];
}

// Controller component để điều khiển Leaflet map (FlyTo, Zoom, FitBounds)
const LeafletMapController = ({
  center,
  zoom,
  onMount,
  boundaryPositions,
}: {
  center: [number, number];
  zoom: number;
  onMount?: (map: L.Map) => void;
  boundaryPositions?: [number, number][] | null;
}) => {
  const map = useMap();

  useEffect(() => {
    if (onMount) onMount(map);
  }, [map, onMount]);

  useEffect(() => {
    if (boundaryPositions && boundaryPositions.length >= 3) {
      const bounds = L.latLngBounds(boundaryPositions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 1.2 });
    } else {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center[0], center[1], zoom, boundaryPositions, map]);

  return null;
};

export const TacticalMap = ({
  selectedSos,
  assignment,
  activeOfficer,
  areas = [],
  sosRequests = [],
  onSelectSos,
  previewTeamIds = [],
  rescueTeams = [],
  vehicles = [],
}: Props) => {
  const { mapMode } = useApp();
  const mapInstanceRef = useRef<L.Map | null>(null);

  const defaultLng = 108.2178;
  const defaultLat = 16.0465;

  const managedWard = areas[0];
  const targetAreaId = managedWard?.id || activeOfficer?.jurisdictionAreaId || 'area-htd';
  const computedCentroid = managedWard ? getAreaCentroid(managedWard, areas) : null;
  const areaCentroid = computedCentroid || WARD_CENTROIDS[targetAreaId] || [defaultLng, defaultLat];

  const sosLng = selectedSos?.coordinates?.lng ?? areaCentroid[0];
  const sosLat = selectedSos?.coordinates?.lat ?? areaCentroid[1];

  // Active selected teams for live GPS member visualization & dispatch
  const activePreviewTeams = useMemo(() => {
    if (!previewTeamIds || previewTeamIds.length === 0) return [];
    return rescueTeams.filter((t) => previewTeamIds.includes(t.id));
  }, [previewTeamIds, rescueTeams]);

  // Operational base coordinate calculation per team
  const getTeamBaseCoord = (teamId: string, teamIdx: number): { lat: number; lng: number } => {
    const knownOffsets: Record<string, { lat: number; lng: number }> = {
      'team-cl-01': { lat: 0.0052, lng: -0.0058 }, // Hòa Xuân / Cẩm Lệ (~650m NW)
      'team-cl-02': { lat: -0.0045, lng: 0.0062 }, // Cẩm Lệ (~650m SE)
      'team-hc-htd': { lat: -0.0058, lng: -0.0048 }, // Hòa Cường (~700m SW)
      'team-water-alpha': { lat: 0.0065, lng: 0.0048 }, // Hải Châu (~750m NE)
      'team-qr-bravo': { lat: 0.0035, lng: 0.0072 }, // PCCC Hải Châu (~750m E)
      'team-sea-delta': { lat: -0.0028, lng: -0.0075 }, // Sơn Trà (~780m W)
      'team-nhs-01': { lat: -0.0068, lng: 0.0038 },
      'team-lc-01': { lat: 0.0075, lng: -0.0042 },
      'team-hv-01': { lat: -0.0072, lng: -0.0060 },
    };

    if (knownOffsets[teamId]) {
      return {
        lat: sosLat + knownOffsets[teamId].lat,
        lng: sosLng + knownOffsets[teamId].lng,
      };
    }

    const angle = (teamIdx * 1.35 + 0.4) * Math.PI;
    const dist = 0.0055 + (teamIdx % 3) * 0.0012;
    return {
      lat: sosLat + Math.sin(angle) * dist,
      lng: sosLng + Math.cos(angle) * dist,
    };
  };

  // Individual rescuer GPS coordinate within team perimeter
  const getRescuerCoord = (
    baseLat: number,
    baseLng: number,
    rescuerIdx: number,
    totalRescuers: number
  ): { lat: number; lng: number } => {
    const angle = (rescuerIdx / Math.max(totalRescuers, 1)) * 2 * Math.PI + 0.35;
    const dist = 0.0010 + (rescuerIdx * 0.00035);
    return {
      lat: baseLat + Math.sin(angle) * dist,
      lng: baseLng + Math.cos(angle) * dist * 1.15,
    };
  };

  // Rescuer Marker Icon generator
  const createRescuerDivIcon = (rescuer: RescuerProfile, index: number) => {
    const isLeader =
      rescuer.role.toLowerCase().includes('trưởng') ||
      rescuer.role.toLowerCase().includes('chỉ huy') ||
      rescuer.role.toLowerCase().includes('leader') ||
      index === 0;

    const isMedic =
      rescuer.role.toLowerCase().includes('y') ||
      rescuer.role.toLowerCase().includes('bác sĩ') ||
      rescuer.role.toLowerCase().includes('cấp cứu');

    const isDriver =
      rescuer.role.toLowerCase().includes('lái') ||
      rescuer.role.toLowerCase().includes('thuyền') ||
      rescuer.role.toLowerCase().includes('ca-nô');

    const badgeColor = isLeader ? '#0284c7' : isMedic ? '#059669' : isDriver ? '#0891b2' : '#4f46e5';
    const roleIcon = isLeader ? '⭐' : isMedic ? '🩺' : isDriver ? '🚤' : '🛟';

    return L.divIcon({
      className: 'tactical-rescuer-member-beacon',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
          <!-- Rescuer Name Badge with GPS LIVE Indicator -->
          <div style="
            background: #ffffff;
            color: #0f172a;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 5px;
            border: 1.5px solid ${badgeColor};
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 2px;
          ">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 6px #22c55e;"></span>
            <span>${rescuer.name}</span>
            <span style="font-size: 8.5px; color: ${badgeColor}; font-weight: 800;">[${rescuer.role.split(' ')[0]}]</span>
          </div>

          <!-- Pulsing GPS Marker -->
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
            <div style="
              position: absolute;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: rgba(22, 163, 74, 0.25);
              border: 1.5px solid #16a34a;
              animation: pulse-live-gps 1.4s infinite ease-out;
            "></div>
            <div style="
              position: relative;
              width: 20px;
              height: 20px;
              background: ${badgeColor};
              border-radius: 50%;
              border: 2px solid #ffffff;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10.5px;
              color: #ffffff;
              z-index: 5;
            ">
              ${roleIcon}
            </div>
          </div>
        </div>
      `,
      iconSize: [110, 48],
      iconAnchor: [55, 38],
    });
  };

  // Vehicle Marker Icon generator
  const createVehicleDivIcon = (vehicle: Vehicle) => {
    const isBoat =
      vehicle.type === 'Inflatable Boat' ||
      vehicle.name.toLowerCase().includes('ca-nô') ||
      vehicle.name.toLowerCase().includes('thuyền');
    const vIcon = isBoat ? '🚤' : '🚒';

    return L.divIcon({
      className: 'tactical-vehicle-beacon',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
          <div style="
            background: #0f172a;
            color: #f8fafc;
            font-size: 9.5px;
            font-weight: 800;
            padding: 1.5px 5px;
            border-radius: 4px;
            border: 1.5px solid #38bdf8;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            white-space: nowrap;
            margin-bottom: 2px;
            letter-spacing: 0.2px;
          ">
            ${vehicle.plate || vehicle.name.split(' ')[0]}
          </div>
          <div style="
            width: 24px;
            height: 24px;
            background: #0284c7;
            border-radius: 6px;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 8px rgba(2, 132, 199, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
          ">
            ${vIcon}
          </div>
        </div>
      `,
      iconSize: [80, 44],
      iconAnchor: [40, 36],
    });
  };

  const teamPalette = ['#0284c7', '#0d9488', '#7c3aed', '#ea580c', '#0891b2'];

  // Google Maps Tiles URL (Streets & Satellite)
  const googleTilesUrl =
    mapMode === 'satellite'
      ? GOOGLE_MAP_TILES.SATELLITE
      : GOOGLE_MAP_TILES.STREETS_CLEAN;

  // Kiểm tra SOS có thuộc phạm vi quản lý của cán bộ không
  const isSelectedInJurisdiction = selectedSos ? isSosInOfficerJurisdiction(selectedSos, activeOfficer, managedWard) : false;

  // Lọc các ca SOS khác thuộc khu vực được phân công của cán bộ
  const otherSosList = useMemo(() => {
    return sosRequests.filter(
      (s) => s.id !== selectedSos?.id && isSosInOfficerJurisdiction(s, activeOfficer, managedWard)
    );
  }, [sosRequests, selectedSos?.id, activeOfficer, managedWard]);

  // Icon SOS Beacon nhấp nháy đỏ dạng Radar SVG kèm mã SOS nổi bật cho ca đang chọn
  const mainSosIcon = useMemo(() => {
    const code = selectedSos?.sosCode || 'SOS';
    return L.divIcon({
      className: 'tactical-main-sos-beacon',
      html: `
        <div style="position: relative; width: 80px; height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer;">
          <!-- Badge nổi bật mã ID khi ca SOS này được chọn -->
          <div style="
            position: absolute;
            top: 2px;
            background: #dc2626;
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
            padding: 3px 8px;
            border-radius: 5px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            white-space: nowrap;
            border: 1.5px solid #ffffff;
            letter-spacing: 0.3px;
            z-index: 100;
          ">
            ${code}
          </div>
          <!-- Vòng tròn radar xung nhịp phát sóng -->
          <div style="
            position: absolute;
            bottom: 0px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background-color: rgba(220, 38, 38, 0.35);
            border: 2px solid #dc2626;
            animation: pulse-beacon 1.4s infinite ease-out;
          "></div>
          <!-- Chấm đỏ trung tâm phát sáng -->
          <div style="
            position: relative;
            bottom: 10px;
            width: 24px;
            height: 24px;
            background: #dc2626;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 16px rgba(220, 38, 38, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
          ">
            <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
          </div>
        </div>
      `,
      iconSize: [80, 70],
      iconAnchor: [40, 48],
    });
  }, [selectedSos?.sosCode]);

  // Icon cho các ca SOS khác trên địa bàn (Chỉ hiện chấm đỏ gọn gàng, không hiện mã text để tránh che khuất)
  const otherSosIcon = useMemo(() => {
    return L.divIcon({
      className: 'tactical-other-sos-beacon',
      html: `
        <div style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; cursor: pointer;">
          <div style="
            width: 14px;
            height: 14px;
            background: #dc2626;
            border-radius: 50%;
            border: 2.5px solid #ffffff;
            box-shadow: 0 2px 8px rgba(220, 38, 38, 0.75);
            transition: transform 0.15s ease;
          "></div>
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }, []);

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
  const typeLabel = selectedSos ? (typeIconMap[selectedSos.emergencyType] || selectedSos.emergencyType) : '';

  // Zoom controls
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const primaryBoundaryPositions = useMemo(() => {
    return wardPolygons[0]?.positions || null;
  }, [wardPolygons]);

  const handleResetCenter = () => {
    if (primaryBoundaryPositions && primaryBoundaryPositions.length >= 3) {
      const bounds = L.latLngBounds(primaryBoundaryPositions);
      mapInstanceRef.current?.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      mapInstanceRef.current?.flyTo([sosLat, sosLng], 15);
    }
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
        @keyframes pulse-live-gps {
          0% { transform: scale(0.6); opacity: 0.9; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .tactical-main-sos-beacon, .tactical-other-sos-beacon, .tactical-rescuer-beacon, .tactical-rescuer-member-beacon, .tactical-vehicle-beacon {
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
          boundaryPositions={primaryBoundaryPositions}
          onMount={(m) => {
            mapInstanceRef.current = m;
          }}
        />

        {/* 1. Vẽ Ranh Giới Hành Chính Khu Vực Phụ Trách (Viền chấm nhỏ chuẩn Google Maps) */}
        {wardPolygons.map((w) => (
          <Polygon
            key={`ward-poly-${w.id}-google-dots`}
            positions={w.positions}
            pathOptions={{
              color: '#dc2626',
              fillColor: '#ef4444',
              fillOpacity: 0.05,
              weight: 2.5,
              dashArray: '1, 6',
              lineCap: 'round',
              lineJoin: 'round',
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
        {selectedSos && isSelectedInJurisdiction && (
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

        {/* 4. Các điểm SOS khác trong khu vực (Chỉ hiện chấm đỏ, khi click sẽ chọn và nổi ID lên) */}
        {otherSosList.map((sos) => {
          const lat = sos.coordinates?.lat ?? defaultLat;
          const lng = sos.coordinates?.lng ?? defaultLng;
          return (
            <Marker
              key={sos.id}
              position={[lat, lng]}
              icon={otherSosIcon}
              eventHandlers={{
                click: () => {
                  if (onSelectSos) onSelectSos(sos);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.92}>
                <span style={{ fontWeight: 700, fontSize: '11px', color: '#b91c1c' }}>{sos.sosCode}</span>
              </Tooltip>
            </Marker>
          );
        })}

        {/* 5. Render GPS của các thành viên và phương tiện của các đội được chọn */}
        {activePreviewTeams.map((team, tIdx) => {
          const teamBase = getTeamBaseCoord(team.id, tIdx);
          const teamVeh = vehicles.find((v) => v.teamId === team.id);
          const routeColor = teamPalette[tIdx % teamPalette.length];

          return (
            <Fragment key={`preview-team-${team.id}`}>
              {/* Tuyến đường tiếp cận dự kiến từ vị trí đội tới điểm SOS */}
              {selectedSos && (
                <Polyline
                  positions={[
                    [teamBase.lat, teamBase.lng],
                    [sosLat, sosLng],
                  ]}
                  pathOptions={{
                    color: routeColor,
                    weight: 3,
                    dashArray: '6, 8',
                    opacity: 0.75,
                  }}
                />
              )}

              {/* Phương tiện cứu hộ của đội */}
              {teamVeh && (
                <Marker
                  position={[teamBase.lat + 0.0002, teamBase.lng + 0.0003]}
                  icon={createVehicleDivIcon(teamVeh)}
                >
                  <Popup>
                    <div style={{ fontFamily: 'inherit', padding: '2px', minWidth: '185px' }}>
                      <div style={{ fontWeight: 800, fontSize: '12px', color: '#0369a1' }}>
                        {teamVeh.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>
                        Biển số: <strong>{teamVeh.plate}</strong>
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: 1 }}>
                        Sức chứa: <strong>{teamVeh.capacity}</strong>
                      </div>
                      <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600, marginTop: 2 }}>
                        Đơn vị: {team.name}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Tọa độ GPS thời gian thực của từng thành viên trong đội */}
              {team.rescuers.map((rescuer, rIdx) => {
                const rCoord = getRescuerCoord(teamBase.lat, teamBase.lng, rIdx, team.rescuers.length);
                return (
                  <Marker
                    key={`rescuer-${team.id}-${rescuer.id}`}
                    position={[rCoord.lat, rCoord.lng]}
                    icon={createRescuerDivIcon(rescuer, rIdx)}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'inherit', padding: '2px', minWidth: '190px' }}>
                        <div style={{ fontWeight: 800, fontSize: '12.5px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#16a34a' }}>●</span> {rescuer.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginTop: 2 }}>
                          {rescuer.role} • {team.name}
                        </div>
                        <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />
                        <div style={{ fontSize: '11px', color: '#1e293b' }}>
                          📞 Điện thoại: <strong>{rescuer.phone}</strong>
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginTop: 3 }}>
                          📡 GPS Live: {rCoord.lat.toFixed(5)}, {rCoord.lng.toFixed(5)}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: 1 }}>
                          Trạng thái: Đang trực chiến - Sẵn sàng
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </Fragment>
          );
        })}

        {/* 6. Marker Đội Cứu Hộ Đang Xuất Kích (khi không có preview cụ thể) */}
        {isSelectedInJurisdiction && assignment && assignment.status !== 'CANCELLED' && activePreviewTeams.length === 0 && (
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

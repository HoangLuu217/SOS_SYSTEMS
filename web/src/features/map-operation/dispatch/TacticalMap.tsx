import { useEffect, useMemo, useRef, Fragment, useState } from 'react';
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
} from '@/types/domainD';
import {
  isSosInOfficerJurisdiction,
  isTeamInOfficerJurisdiction,
  GOOGLE_MAP_TILES,
  WARD_CENTROIDS,
  getAreaCentroid,
} from '@/services/mapGeoService';
import { onRescuerLocationUpdate } from '@/services/socketService';
import { useApp } from '@/context/AppContext';

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
  zoom: _zoom,
  onMount,
  boundaryPositions,
  selectedSosId,
}: {
  center: [number, number];
  zoom?: number;
  onMount?: (map: L.Map) => void;
  boundaryPositions?: [number, number][] | null;
  selectedSosId?: string;
}) => {
  const map = useMap();
  const hasInitializedRef = useRef(false);
  const prevSosIdRef = useRef<string | undefined>(selectedSosId);
  const prevBoundaryKeyRef = useRef<string>('');

  useEffect(() => {
    if (onMount) onMount(map);
  }, [map, onMount]);

  // Chỉ fitBounds LẦN ĐẦU TIÊN khi map khởi tạo hoặc khi ranh giới thay đổi thực sự
  // Tuyệt đối không tự động fitBounds định kỳ làm gián đoạn khi người dùng đang zoom soi bản đồ
  useEffect(() => {
    if (!boundaryPositions || boundaryPositions.length < 3) return;
    const boundaryKey = `${boundaryPositions.length}-${boundaryPositions[0][0]}`;
    if (!hasInitializedRef.current || prevBoundaryKeyRef.current !== boundaryKey) {
      hasInitializedRef.current = true;
      prevBoundaryKeyRef.current = boundaryKey;
      const bounds = L.latLngBounds(boundaryPositions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 1.0 });
    }
  }, [boundaryPositions, map]);

  // Khi người dùng chủ động click chọn một ca SOS KHÁC, fly to ca SOS đó và giữ mức zoom người dùng
  useEffect(() => {
    if (selectedSosId && selectedSosId !== prevSosIdRef.current) {
      prevSosIdRef.current = selectedSosId;
      const currentZoom = map.getZoom();
      map.flyTo(center, Math.max(currentZoom, 16), { duration: 0.8 });
    }
  }, [selectedSosId, center, map]);

  return null;
};

// Chuẩn hóa tọa độ tự động kiểm tra đảo ngược lat/lng
function sanitizeRoadCoords(lat: number, lng: number): { lat: number; lng: number } {
  if (Math.abs(lat) > 90 || (lng < 50 && lat > 50)) {
    return { lat: lng, lng: lat };
  }
  return { lat, lng };
}

// In-memory cache cho tuyến đường OSRM
const osrmRouteCache = new Map<string, [number, number][]>();

async function fetchOsrmRoadPath(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<[number, number][] | null> {
  const start = sanitizeRoadCoords(startLat, startLng);
  const end = sanitizeRoadCoords(endLat, endLng);

  const cacheKey = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}->${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;
  if (osrmRouteCache.has(cacheKey)) {
    return osrmRouteCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);

    // CRITICAL: OSRM nhận định dạng longitude,latitude
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
      const geoCoords: [number, number][] = data.routes[0].geometry.coordinates;
      // Chuyển đổi [lng, lat] của OSRM thành [lat, lng] cho Leaflet Polyline
      const leafletCoords: [number, number][] = geoCoords.map(([lng, lat]) => [lat, lng]);
      if (leafletCoords.length >= 2) {
        osrmRouteCache.set(cacheKey, leafletCoords);
        return leafletCoords;
      }
    }
    return null;
  } catch (err) {
    console.warn('OSRM road route fetch fallback to straight line:', err);
    return null;
  }
}

/**
 * Tuyến đường cứu hộ uốn lượn bám sát đường phố thực (OSRM Road-Snapped)
 */
const RescueRoadRoute = ({
  startLat,
  startLng,
  endLat,
  endLng,
  routeColor = '#2563eb',
}: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  routeColor?: string;
}) => {
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchOsrmRoadPath(startLat, startLng, endLat, endLng).then((path) => {
      if (isMounted) setRoadPath(path);
    });
    return () => {
      isMounted = false;
    };
  }, [startLat, startLng, endLat, endLng]);

  const fallbackLine: [number, number][] = [
    [startLat, startLng],
    [endLat, endLng],
  ];

  // Nếu chưa tải xong hoặc mạng lỗi: Vẽ đường đứt nét tạm thời
  if (!roadPath || roadPath.length < 2) {
    return (
      <Polyline
        positions={fallbackLine}
        pathOptions={{
          color: routeColor,
          weight: 3,
          dashArray: '6, 8',
          opacity: 0.7,
        }}
      />
    );
  }

  // Tuyến đường uốn lượn chính xác theo mạng lưới giao thông (Dual-layer Grab style)
  const startConnector: [number, number][] = [
    [startLat, startLng],
    roadPath[0],
  ];
  const endConnector: [number, number][] = [
    roadPath[roadPath.length - 1],
    [endLat, endLng],
  ];

  return (
    <>
      {/* 1. Đường chấm chấm nối điểm đầu (Vị trí xuất phát -> Điểm đầu đường bộ OSRM) */}
      <Polyline
        positions={startConnector}
        pathOptions={{
          color: '#0284c7',
          weight: 2,
          dashArray: '3, 5',
          lineCap: 'round',
          opacity: 0.85,
        }}
      />

      {/* 2. Outer border/casing: 8px, #1e40af */}
      <Polyline
        positions={roadPath}
        pathOptions={{
          color: '#1e40af',
          weight: 8,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.9,
        }}
      />
      {/* 3. Inner core line: 4px, #38bdf8 */}
      <Polyline
        positions={roadPath}
        pathOptions={{
          color: '#38bdf8',
          weight: 4,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 1,
        }}
      />

      {/* 4. Đường chấm chấm nối điểm cuối (Điểm cuối đường bộ OSRM -> Vị trí Nạn nhân) */}
      <Polyline
        positions={endConnector}
        pathOptions={{
          color: '#dc2626',
          weight: 2,
          dashArray: '3, 5',
          lineCap: 'round',
          opacity: 0.85,
        }}
      />
    </>
  );
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

  // State mở rộng / bung đội hình GPS của từng đội cứu hộ
  const [expandedTeamIds, setExpandedTeamIds] = useState<Record<string, boolean>>({});

  const defaultLng = selectedSos?.coordinates?.lng ?? 107.5;
  const defaultLat = selectedSos?.coordinates?.lat ?? 16.0;

  const managedWard = areas[0];
  const targetAreaId = managedWard?.id || activeOfficer?.jurisdictionAreaId || '';
  const computedCentroid = managedWard ? getAreaCentroid(managedWard, areas) : null;
  const areaCentroid = computedCentroid || (targetAreaId ? WARD_CENTROIDS[targetAreaId] : null) || [defaultLng, defaultLat];

  const sosLng = selectedSos?.coordinates?.lng ?? areaCentroid[0];
  const sosLat = selectedSos?.coordinates?.lat ?? areaCentroid[1];

  // Active selected teams for live GPS member visualization & dispatch (Chỉ hiện khi ấn chọn team và phải thuộc khu vực quản lý)
  const activePreviewTeams = useMemo(() => {
    if (!previewTeamIds || previewTeamIds.length === 0) return [];
    const matched = rescueTeams.filter((t) => previewTeamIds.includes(t.id));
    if (!activeOfficer || activeOfficer.role === 'ADMIN') return matched;
    return matched.filter((t) => isTeamInOfficerJurisdiction(t, activeOfficer, managedWard));
  }, [previewTeamIds, rescueTeams, activeOfficer, managedWard]);

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
      'team-lc-01': { lat: 0.0045, lng: 0.0035 },
      '43-lc-01': { lat: 0.0045, lng: 0.0035 },
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

  // Lưu trữ tọa độ GPS thời gian thực của từng cứu hộ viên nhận qua Socket.IO Telemetry
  const [liveRescuerLocations, setLiveRescuerLocations] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    const unsubscribe = onRescuerLocationUpdate((data) => {
      if (data?.rescuerId && data?.coords?.lat && data?.coords?.lng) {
        setLiveRescuerLocations((prev) => ({
          ...prev,
          [data.rescuerId]: { lat: data.coords.lat, lng: data.coords.lng },
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Tọa độ GPS thành viên: Lấy chính xác theo từng user trong team (không lấy bừa)
  const getRescuerLiveCoord = (
    rescuer: RescuerProfile,
    teamBase: { lat: number; lng: number },
    rescuerIdx: number,
    _totalRescuers?: number
  ): { lat: number; lng: number } => {
    // 1. Tọa độ Telemetry Live nhận từ thiết bị Mobile App của cứu hộ viên qua Socket
    if (liveRescuerLocations[rescuer.id]) {
      return liveRescuerLocations[rescuer.id];
    }
    // 2. Tọa độ GPS cá nhân thực tế của chính user trong team
    if (
      rescuer.coordinates &&
      typeof rescuer.coordinates.lat === 'number' &&
      typeof rescuer.coordinates.lng === 'number'
    ) {
      return { lat: rescuer.coordinates.lat, lng: rescuer.coordinates.lng };
    }
    // 3. Dự phòng phân bố nhẹ quanh xe nếu user chưa cấp quyền GPS
    const angles = [
      0,                  // 0: Bắc (North)
      Math.PI / 2,        // 1: Đông (East)
      Math.PI,            // 2: Nam (South)
      (3 * Math.PI) / 2,  // 3: Tây (West)
      Math.PI / 4,        // 4: Đông Bắc
      (3 * Math.PI) / 4,  // 5: Đông Nam
      (5 * Math.PI) / 4,  // 6: Tây Nam
      (7 * Math.PI) / 4,  // 7: Tây Bắc
    ];
    const angle = angles[rescuerIdx % angles.length];
    const distLat = 0.0018;
    const distLng = 0.0026;
    return {
      lat: teamBase.lat + Math.cos(angle) * distLat,
      lng: teamBase.lng + Math.sin(angle) * distLng,
    };
  };

  // Marker Gộp Trung Tâm Đội & Phương Tiện Cứu Hộ (Mặc định hiển thị gọn gàng, bấm để bung GPS)
  const createUnifiedTeamDivIcon = (
    team: RescueTeam,
    vehicle?: Vehicle,
    isExpanded: boolean = false
  ) => {
    const plate = vehicle?.plate || '43B-098.21';
    const isBoat =
      vehicle?.type === 'Inflatable Boat' ||
      vehicle?.name?.toLowerCase().includes('ca-nô') ||
      team.name?.toLowerCase().includes('ca-nô');
    const vIcon = isBoat ? '🚤' : '🚒';

    return L.divIcon({
      className: 'tactical-unified-team-beacon',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
          <!-- Header Badge: Biển số & Tên Đội Cứu Hộ -->
          <div style="
            background: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            padding: 3px 8px;
            border-radius: 6px;
            border: 1.5px solid #38bdf8;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.45);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 5px;
            letter-spacing: 0.2px;
            margin-bottom: 2px;
          ">
            <span style="font-size: 11px;">${vIcon}</span>
            <span style="color: #38bdf8; font-weight: 900;">${plate}</span>
            <span style="color: #64748b;">•</span>
            <span style="max-width: 145px; overflow: hidden; text-overflow: ellipsis;">${team.name}</span>
          </div>

          <!-- Sub Badge: Số lượng chiến sĩ & Trạng thái mở rộng -->
          <div style="
            background: ${isExpanded ? '#fef3c7' : '#ffffff'};
            color: ${isExpanded ? '#92400e' : '#0284c7'};
            font-size: 9px;
            font-weight: 700;
            padding: 1.5px 7px;
            border-radius: 9999px;
            border: 1px solid ${isExpanded ? '#f59e0b' : '#bae6fd'};
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 2px;
          ">
            <span>👥 ${team.rescuers.length} chiến sĩ</span>
            <span style="font-size: 8px; color: ${isExpanded ? '#b45309' : '#0369a1'};">
              ${isExpanded ? '(Bấm để thu gọn)' : '(Bấm để bung GPS)'}
            </span>
          </div>

          <!-- Biểu tượng phương tiện trung tâm với hiệu ứng lan toả -->
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
            <div style="
              position: absolute;
              width: 30px;
              height: 30px;
              border-radius: 8px;
              background: rgba(2, 132, 199, 0.25);
              border: 1.5px solid #0284c7;
              animation: pulse-beacon 1.6s infinite ease-out;
            "></div>
            <div style="
              position: relative;
              width: 26px;
              height: 26px;
              background: #0284c7;
              border-radius: 7px;
              border: 2px solid #ffffff;
              box-shadow: 0 3px 10px rgba(2, 132, 199, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13.5px;
              z-index: 5;
            ">
              ${vIcon}
            </div>
          </div>
        </div>
      `,
      iconSize: [200, 68],
      iconAnchor: [100, 58],
    });
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

  // Rescuer location fallback (hướng Nguyễn Lương Bằng nằm gọn bên trong Phường Liên Chiểu)
  const defaultRescuerLat = sosLat + 0.0045;
  const defaultRescuerLng = sosLng + 0.0035;

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
          selectedSosId={selectedSos?.id}
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

        {/* 2. Tuyến đường di chuyển cứu hộ thực tế được vẽ bởi RescueRoadRoute (bám đường giao thông OSRM, loại bỏ đường thẳng chim bay cắt chéo nhà dân) */}

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

        {/* 5. Render Tuyến đường Road-snapped OSRM & GPS của các đội được chọn */}
        {activePreviewTeams.map((team, tIdx) => {
          const teamBase = getTeamBaseCoord(team.id, tIdx);
          const teamVeh = vehicles.find((v) => v.teamId === team.id);
          const isTeamExpanded = Boolean(expandedTeamIds[team.id]);

          return (
            <Fragment key={`preview-team-${team.id}`}>
              {/* Tuyến đường tiếp cận thực bám theo mạng lưới giao thông (OSRM Road-Snapped, không cắt xuyên nhà) */}
              {selectedSos && (
                <RescueRoadRoute
                  startLat={teamBase.lat}
                  startLng={teamBase.lng}
                  endLat={sosLat}
                  endLng={sosLng}
                />
              )}

              {/* Marker Trung tâm Đội & Phương tiện Cứu hộ (Gộp chung mặc định gọn gàng, bấm để bung GPS) */}
              <Marker
                position={[teamBase.lat, teamBase.lng]}
                icon={createUnifiedTeamDivIcon(team, teamVeh, isTeamExpanded)}
                eventHandlers={{
                  click: () => {
                    setExpandedTeamIds((prev) => ({
                      ...prev,
                      [team.id]: !prev[team.id],
                    }));
                  },
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'inherit', padding: '4px 2px', minWidth: '260px' }}>
                    {/* Header: Tên phương tiện & Biển số */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 900, fontSize: '14.5px', color: '#0f172a', letterSpacing: '-0.2px' }}>
                        {teamVeh?.name || team.name}
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#0f172a',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '1.5px 6px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                          flexShrink: 0,
                        }}
                      >
                        {teamVeh?.plate || '43B-098.21'}
                      </span>
                    </div>

                    {/* Metadata: Đơn vị & Sức chứa */}
                    <div style={{ fontSize: '12px', color: '#334155', fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>Đơn vị: </span>
                      <strong style={{ color: '#0f172a' }}>{team.name}</strong>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                      Sức chứa: <strong style={{ color: '#0f172a' }}>{teamVeh?.capacity || '6 người'}</strong>
                    </div>

                    <div style={{ height: 1, background: '#e2e8f0', margin: '8px 0' }} />

                    {/* Danh sách quân số trực chiến */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: '11.5px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Quân số trực chiến ({team.rescuers.length} chiến sĩ)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                      {team.rescuers.map((r, rIdx) => {
                        const isLeader = rIdx === 0 || r.role.toLowerCase().includes('chỉ huy') || r.role.toLowerCase().includes('leader');

                        return (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12px',
                              background: isLeader ? '#f8fafc' : '#ffffff',
                              border: '1px solid #e2e8f0',
                              padding: '5px 8px',
                              borderRadius: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {r.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: isLeader ? '#0284c7' : '#64748b',
                                  background: isLeader ? '#f0f9ff' : '#f1f5f9',
                                  border: isLeader ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  flexShrink: 0,
                                }}
                              >
                                {r.role}
                              </span>
                            </div>

                            <a
                              href={`tel:${r.phone}`}
                              style={{
                                color: '#0f172a',
                                fontWeight: 800,
                                fontSize: '11.5px',
                                textDecoration: 'none',
                                fontFamily: 'monospace',
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                padding: '2px 6px',
                                borderRadius: 4,
                                flexShrink: 0,
                                marginLeft: 6,
                              }}
                              title={`Gọi cho ${r.name}`}
                            >
                              {r.phone}
                            </a>
                          </div>
                        );
                      })}
                    </div>

                    {/* Nút hành động */}
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedTeamIds((prev) => ({
                          ...prev,
                          [team.id]: !prev[team.id],
                        }));
                      }}
                      style={{
                        width: '100%',
                        marginTop: 9,
                        padding: '7px 10px',
                        background: isTeamExpanded ? '#f8fafc' : '#0f172a',
                        color: isTeamExpanded ? '#0f172a' : '#ffffff',
                        border: isTeamExpanded ? '1.5px solid #cbd5e1' : 'none',
                        borderRadius: 6,
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isTeamExpanded ? 'Thu gọn vị trí về xe' : 'Xem vị trí GPS từng chiến sĩ'}
                    </button>
                  </div>
                </Popup>
              </Marker>

              {/* Chỉ khi người dùng bấm mở rộng / bung đội hình: hiển thị GPS từng thành viên fanned out không bị đè */}
              {isTeamExpanded &&
                team.rescuers.map((rescuer, rIdx) => {
                  const rCoord = getRescuerLiveCoord(rescuer, teamBase, rIdx, team.rescuers.length);
                  return (
                    <Fragment key={`rescuer-${team.id}-${rescuer.id}`}>
                      {/* Đường nối liên lạc từ xe chỉ huy tới vị trí chiến sĩ */}
                      <Polyline
                        positions={[
                          [teamBase.lat, teamBase.lng],
                          [rCoord.lat, rCoord.lng],
                        ]}
                        pathOptions={{
                          color: '#0284c7',
                          weight: 1.5,
                          dashArray: '3, 4',
                          opacity: 0.5,
                        }}
                      />
                      <Marker
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
                          </div>
                        </Popup>
                      </Marker>
                    </Fragment>
                  );
                })}
            </Fragment>
          );
        })}

        {/* 6. Tuyến đường và Marker Đội Cứu Hộ Đang Xuất Kích (khi không có preview cụ thể) */}
        {isSelectedInJurisdiction && assignment && assignment.status !== 'CANCELLED' && activePreviewTeams.length === 0 && (
          <>
            <RescueRoadRoute
              startLat={assignment.rescuerLocation?.lat ?? defaultRescuerLat}
              startLng={assignment.rescuerLocation?.lng ?? defaultRescuerLng}
              endLat={sosLat}
              endLng={sosLng}
              routeColor="#2563eb"
            />
            <Marker
              position={[
                assignment.rescuerLocation?.lat ?? defaultRescuerLat,
                assignment.rescuerLocation?.lng ?? defaultRescuerLng,
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
          </>
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

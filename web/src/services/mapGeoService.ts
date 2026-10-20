import type { FeatureCollection, Feature } from 'geojson';
import type { AdministrativeArea, SosRequest, SosAssignment, AuthorityOfficer, RescueTeam } from '@/types/domainD';
import { getRegionColor, GEOAPIFY_CENTROIDS } from './geoapifyBoundariesService';

// Tinh chỉnh apistyle chuyên dụng cho bản đồ cứu hộ & phòng chống thiên tai:
// - ẨN các địa điểm thương mại không cần thiết: quán cafe, quán ăn, nhà hàng, shop bán lẻ (s.t:33|p.v:off)
// - GIỮ LẠI ĐẦY ĐỦ các địa điểm lớn & thiết yếu phục vụ cứu nạn bão lũ:
//   + Bệnh viện, trung tâm y tế, trạm cấp cứu (poi.medical)
//   + Trụ sở chính quyền, công an, BCH quân sự, trạm cứu hộ (poi.government)
//   + Trường học, trường đại học (điểm tập kết sơ tán khẩn cấp an toàn - poi.school)
//   + Đầu mối giao thông vận tải: Sân bay quốc tế Đà Nẵng, Ga đường sắt, Bến cảng, Bến xe (transit.station)
//   + Công viên, bãi đất trống, sân vận động, quảng trường (poi.park, poi.sports_complex)
//   + Địa danh tôn giáo kiên cố cao tầng trú ẩn (poi.place_of_worship)
//   + Toàn bộ mạng lưới giao thông đường bộ, cầu cống, sông ngòi, ranh giới và địa danh hành chính
export const TACTICAL_CLEAN_APISTYLE = encodeURIComponent('s.t:33|p.v:off');

// Google Maps Tile Server URLs (Miễn phí, tốc độ cao, hỗ trợ tiếng Việt đầy đủ)
export const GOOGLE_MAP_TILES = {
  STREETS_CLEAN: 'https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}',
  STREETS_FULL: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  STREETS: 'https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}',
  SATELLITE: 'https://mt{s}.google.com/vt/lyrs=y&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}',
  TERRAIN: 'https://mt{s}.google.com/vt/lyrs=p&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}',
  TRAFFIC: 'https://mt{s}.google.com/vt/lyrs=m,traffic&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}',
};

export function getGoogleTileUrl(
  mode: 'street' | 'satellite' | 'streets' = 'street',
  clean: boolean = true
): string {
  if (mode === 'satellite') return GOOGLE_MAP_TILES.SATELLITE;
  return clean ? GOOGLE_MAP_TILES.STREETS_CLEAN : GOOGLE_MAP_TILES.STREETS_FULL;
}

// Quick View Presets cho bản đồ tác chiến Toàn quốc Việt Nam và Biển Đảo Tổ Quốc
export const MAP_PRESETS = {
  VIETNAM_ALL: {
    label: 'Toàn cảnh Việt Nam (63 Tỉnh Thành)',
    center: [16.0, 107.5] as [number, number],
    zoom: 6,
  },
  NORTH: {
    label: 'Khu vực Miền Bắc',
    center: [21.0, 105.8] as [number, number],
    zoom: 8,
  },
  CENTRAL: {
    label: 'Khu vực Miền Trung & Tây Nguyên',
    center: [15.5, 108.0] as [number, number],
    zoom: 8,
  },
  SOUTH: {
    label: 'Khu vực Miền Nam',
    center: [10.8, 106.6] as [number, number],
    zoom: 8,
  },
  HOANG_SA: {
    label: 'Quần đảo Hoàng Sa (Việt Nam)',
    center: [16.5, 112.0] as [number, number],
    zoom: 8.5,
  },
  TRUONG_SA: {
    label: 'Quần đảo Trường Sa (Việt Nam)',
    center: [10.0, 113.8] as [number, number],
    zoom: 7.2,
  },
  BIEN_DONG: {
    label: 'Toàn cảnh Biển Đông (Việt Nam)',
    center: [13.2, 111.5] as [number, number],
    zoom: 6,
  },
};

// Sovereign Islands Markers
export interface SovereignIsland {
  id: string;
  name: string;
  subname: string;
  archipelago: 'Hoàng Sa' | 'Trường Sa';
  coordinates: [number, number]; // [lng, lat]
  isCapital?: boolean;
}

export const SOVEREIGN_ISLANDS: SovereignIsland[] = [
  // Quần đảo Hoàng Sa (Huyện Hoàng Sa, TP Đà Nẵng, Việt Nam)
  {
    id: 'hs-archipelago',
    name: 'QUẦN ĐẢO HOÀNG SA',
    subname: 'Huyện Hoàng Sa, TP Đà Nẵng, Việt Nam',
    archipelago: 'Hoàng Sa',
    coordinates: [112.0, 16.5],
    isCapital: true,
  },
  {
    id: 'hs-phulam',
    name: 'Đảo Phú Lâm',
    subname: 'Hoàng Sa (Đà Nẵng, VN)',
    archipelago: 'Hoàng Sa',
    coordinates: [112.33, 16.83],
  },
  {
    id: 'hs-hoangsa',
    name: 'Đảo Hoàng Sa',
    subname: 'Hoàng Sa (Đà Nẵng, VN)',
    archipelago: 'Hoàng Sa',
    coordinates: [111.60, 16.53],
  },
  {
    id: 'hs-triton',
    name: 'Đảo Tri Tôn',
    subname: 'Hoàng Sa (Đà Nẵng, VN)',
    archipelago: 'Hoàng Sa',
    coordinates: [111.20, 15.78],
  },
  {
    id: 'hs-quanghoa',
    name: 'Đảo Quang Hòa',
    subname: 'Hoàng Sa (Đà Nẵng, VN)',
    archipelago: 'Hoàng Sa',
    coordinates: [111.71, 16.45],
  },

  // Quần đảo Trường Sa (Huyện Trường Sa, Tỉnh Khánh Hòa, Việt Nam)
  {
    id: 'ts-archipelago',
    name: 'QUẦN ĐẢO TRƯỜNG SA',
    subname: 'Huyện Trường Sa, Tỉnh Khánh Hòa, Việt Nam',
    archipelago: 'Trường Sa',
    coordinates: [114.2, 10.2],
    isCapital: true,
  },
  {
    id: 'ts-truongsa-lon',
    name: 'Đảo Trường Sa Lớn',
    subname: 'Thị trấn Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [111.92, 8.64],
    isCapital: true,
  },
  {
    id: 'ts-songtuta',
    name: 'Đảo Song Tử Tây',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [114.33, 11.43],
  },
  {
    id: 'ts-sinhton',
    name: 'Đảo Sinh Tồn',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [114.32, 9.88],
  },
  {
    id: 'ts-namyet',
    name: 'Đảo Nam Yết',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [114.36, 10.18],
  },
  {
    id: 'ts-sonca',
    name: 'Đảo Sơn Ca',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [114.47, 10.38],
  },
  {
    id: 'ts-phanvinh',
    name: 'Đảo Phan Vinh',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [113.73, 8.97],
  },
  {
    id: 'ts-thuyenchai',
    name: 'Đảo Thuyền Chài',
    subname: 'Trường Sa (Khánh Hòa, VN)',
    archipelago: 'Trường Sa',
    coordinates: [113.30, 8.17],
  },
];

// GeoJSON conversion for administrative areas (Hỗ trợ động toàn bộ các tỉnh thành trên cả nước)
export function buildWardsGeoJSON(areas: AdministrativeArea[]): FeatureCollection {
  const validAreas = areas.filter(
    (a) => a.boundary?.coordinates && a.boundary.coordinates.length > 0 && a.type !== 'PROVINCE'
  );

  const features: Feature[] = validAreas.map((w, index) => {
    const palette = getRegionColor(w.id || index);
    const fillColor = palette.fill;
    const borderColor = palette.border;

    return {
      type: 'Feature',
      id: w.id,
      properties: {
        id: w.id,
        name: w.name,
        code: w.code,
        type: w.type,
        districtId: w.id,
        parentDistrictId: w.parentId || w.id,
        districtColor: fillColor,
        districtBorderColor: borderColor,
        paletteName: palette.name,
        assigned: Boolean(w.assignedAuthorityId),
        assignedAuthorityName: w.assignedAuthorityName || '',
        reviewPending: Boolean(w.reviewPending),
        areaKm2: w.areaKm2 || 0,
        population: w.population || 0,
        activeRescueTeams: w.activeRescueTeams || 0,
      },
      geometry: {
        type: w.boundary!.type as any,
        coordinates: w.boundary!.coordinates as any,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

// Tactical route LineString
export function buildTacticalRouteGeoJSON(
  sos: SosRequest,
  assignment: SosAssignment | null
): FeatureCollection {
  if (!assignment || assignment.status === 'CANCELLED' || !sos?.coordinates) {
    return { type: 'FeatureCollection', features: [] };
  }

  const rescuerLng = assignment.rescuerLocation?.lng ?? (sos.coordinates.lng + 0.0035);
  const rescuerLat = assignment.rescuerLocation?.lat ?? (sos.coordinates.lat + 0.0045);

  const midLng = (rescuerLng + sos.coordinates.lng) / 2 + 0.002;
  const midLat = (rescuerLat + sos.coordinates.lat) / 2 - 0.001;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          teamName: assignment.rescueTeamName,
          etaMinutes: assignment.etaMinutes,
          vehicleType: (assignment as any).vehicleType || assignment.vehicleName,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [rescuerLng, rescuerLat],
            [midLng, midLat],
            [sos.coordinates.lng, sos.coordinates.lat],
          ],
        },
      },
    ],
  };
}

/**
 * Check if a geographic coordinate [lng, lat] is located inside an AdministrativeArea's boundary polygon
 */
export function isPointInAreaBoundary(
  coords: { lng: number; lat: number },
  area: AdministrativeArea
): boolean {
  if (!area.boundary || !area.boundary.coordinates) return false;
  const { type, coordinates } = area.boundary;
  const point: [number, number] = [coords.lng, coords.lat];

  const pointInRing = (pt: [number, number], ring: number[][]): boolean => {
    const [x, y] = pt;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  if (type === 'Polygon') {
    const rings = coordinates as number[][][];
    if (rings.length === 0) return true;
    if (!pointInRing(point, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(point, rings[i])) return false;
    }
    return true;
  } else if (type === 'MultiPolygon') {
    const polygons = coordinates as number[][][][];
    for (const poly of polygons) {
      if (poly.length > 0 && pointInRing(point, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInRing(point, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return true;
}

/**
 * Strictly check if an SOS request belongs to the local officer's jurisdiction
 * (Ward name/ID match AND spatial boundary check)
 */
export function isSosInOfficerJurisdiction(
  sos: SosRequest,
  officer?: AuthorityOfficer,
  managedArea?: AdministrativeArea
): boolean {
  if (!officer || officer.role === 'ADMIN') return true;
  if (!sos || !sos.coordinates || typeof sos.coordinates.lat !== 'number' || typeof sos.coordinates.lng !== 'number') {
    return false;
  }

  const officerAreaId = officer.jurisdictionAreaId;
  // If ward ID or district ID explicitly matches officer's area, it directly belongs to this jurisdiction
  if (officerAreaId && (sos.wardId === officerAreaId || sos.districtId === officerAreaId)) {
    return true;
  }

  // 1. Authoritative GIS spatial check: If boundary polygon is defined, coordinates MUST be inside it
  if (managedArea && managedArea.boundary && managedArea.boundary.coordinates) {
    return isPointInAreaBoundary(sos.coordinates, managedArea);
  }

  // 2. Fallback if polygon boundary is not yet loaded: check administrative ward ID and name
  const wardKeyword = officer.jurisdictionAreaName
    ? officer.jurisdictionAreaName
        .toLowerCase()
        .replace('phường ', '')
        .replace('quận ', '')
        .replace('huyện ', '')
        .replace('xã ', '')
        .trim()
    : '';

  const matchesWard =
    sos.wardId === officerAreaId ||
    sos.districtId === officerAreaId ||
    (wardKeyword && sos.wardName && sos.wardName.toLowerCase().includes(wardKeyword));

  return !!matchesWard;
}

/**
 * Kiểm tra xem một đội cứu hộ có thuộc địa bàn quản lý của cán bộ hay không.
 * Nếu là ADMIN: được quyền xem tất cả.
 * Nếu là Cán bộ địa phương: chỉ các đội thuộc khu vực phụ trách mới được hiển thị GPS.
 */
export function isTeamInOfficerJurisdiction(
  team: RescueTeam,
  officer?: AuthorityOfficer,
  managedArea?: AdministrativeArea
): boolean {
  if (!officer || officer.role === 'ADMIN') return true;
  if (!team) return false;

  const officerAreaId = officer.jurisdictionAreaId;
  const teamWardId = team.wardId || (team as any).areaId;
  const teamDistrictId = team.districtId;

  // 1. Khớp mã định danh địa bàn
  if (officerAreaId) {
    if (teamWardId && (teamWardId === officerAreaId || teamWardId === `area-${officerAreaId}`)) return true;
    if (managedArea && (teamWardId === managedArea.id || teamWardId === managedArea.code)) return true;
    if (teamDistrictId && (teamDistrictId === officerAreaId || (managedArea && teamDistrictId === managedArea.id))) {
      return true;
    }
  }

  // 2. Khớp theo tên địa bàn phụ trách
  const areaNameTarget = (officer.jurisdictionAreaName || managedArea?.name || '')
    .toLowerCase()
    .replace(/^(phường|xã|quận|huyện|thị trấn|tp|thành phố)\s+/i, '')
    .trim();

  if (areaNameTarget) {
    const teamNameLower = (team.name || '').toLowerCase();
    const teamWardName = ((team as any).wardName || '').toLowerCase();
    const teamDistrictName = ((team as any).districtName || '').toLowerCase();
    if (
      teamNameLower.includes(areaNameTarget) ||
      teamWardName.includes(areaNameTarget) ||
      teamDistrictName.includes(areaNameTarget)
    ) {
      return true;
    }
  }

  // 3. Khớp tên quận/huyện của cán bộ
  const districtKeyword = (officer.districtName || '')
    .toLowerCase()
    .replace(/^(quận|huyện|thành phố|thị xã)\s+/i, '')
    .trim();

  if (districtKeyword && districtKeyword !== 'toàn quốc') {
    const teamNameLower = (team.name || '').toLowerCase();
    const teamDistrictLower = (team.districtId || '').toLowerCase();
    if (teamNameLower.includes(districtKeyword)) return true;
    if (districtKeyword.includes('hải châu') && teamDistrictLower === 'area-hc') return true;
    if (districtKeyword.includes('cẩm lệ') && teamDistrictLower === 'area-cl') return true;
    if (districtKeyword.includes('liên chiểu') && teamDistrictLower === 'area-lc') return true;
    if (districtKeyword.includes('sơn trà') && teamDistrictLower === 'area-st') return true;
    if (districtKeyword.includes('ngũ hành sơn') && teamDistrictLower === 'area-nhs') return true;
    if (districtKeyword.includes('thanh khê') && teamDistrictLower === 'area-tk') return true;
    if (districtKeyword.includes('hòa vang') && teamDistrictLower === 'area-hv') return true;
  }

  return false;
}

// Dynamic Centroid coordinates populated via live boundaries API (Hỗ trợ toàn bộ các tỉnh thành trên cả nước)
export const WARD_CENTROIDS: Record<string, [number, number]> = GEOAPIFY_CENTROIDS;

export function getAreaCentroid(
  areaOrId?: AdministrativeArea | string | null,
  allAreas?: AdministrativeArea[]
): [number, number] | null {
  if (!areaOrId) return null;
  const id = typeof areaOrId === 'string' ? areaOrId : areaOrId.id;
  if (GEOAPIFY_CENTROIDS[id]) return GEOAPIFY_CENTROIDS[id];

  const area = typeof areaOrId === 'object' ? areaOrId : allAreas?.find((a) => a.id === id);
  if (area?.boundary?.coordinates) {
    const coords: number[][] =
      area.boundary.type === 'MultiPolygon'
        ? (area.boundary.coordinates as number[][][][])[0][0]
        : (area.boundary.coordinates as number[][][])[0];
    if (coords && coords.length > 0) {
      let sumLng = 0;
      let sumLat = 0;
      for (const [lng, lat] of coords) {
        sumLng += lng;
        sumLat += lat;
      }
      const centroid: [number, number] = [sumLng / coords.length, sumLat / coords.length];
      GEOAPIFY_CENTROIDS[id] = centroid;
      return centroid;
    }
  }

  if (area?.parentId && GEOAPIFY_CENTROIDS[area.parentId]) {
    return GEOAPIFY_CENTROIDS[area.parentId];
  }

  return null;
}


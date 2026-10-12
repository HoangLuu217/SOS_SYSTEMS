import type { Style } from 'mapbox-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { AdministrativeArea, SosRequest, SosAssignment, AuthorityOfficer } from '../types/domainD';

// Free public Mapbox access token or token from env/localStorage
const ENV_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN) || '';
const PUBLIC_DEMO_TOKEN = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

export function getMapboxToken(): string {
  const custom = localStorage.getItem('rescuesos_mapbox_token');
  if (custom && custom.trim().length > 10) return custom.trim();
  if (ENV_TOKEN && ENV_TOKEN.trim().length > 10) return ENV_TOKEN.trim();
  return PUBLIC_DEMO_TOKEN;
}

export function setMapboxToken(token: string) {
  if (token && token.trim()) {
    localStorage.setItem('rescuesos_mapbox_token', token.trim());
  } else {
    localStorage.removeItem('rescuesos_mapbox_token');
  }
}

// Fallback OSM raster style if custom Mapbox token fails or is offline
export const OSM_RASTER_STYLE: Style = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap Contributors • Chủ quyền biển đảo Việt Nam',
    },
  },
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const SATELLITE_RASTER_STYLE: Style = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics • Biển Đông Việt Nam',
    },
  },
  layers: [
    {
      id: 'satellite-tiles-layer',
      type: 'raster',
      source: 'satellite-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const DARK_RASTER_STYLE: Style = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'dark-tiles': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© CARTO, OpenStreetMap Contributors • Chủ quyền biển đảo Việt Nam',
    },
  },
  layers: [
    {
      id: 'dark-tiles-layer',
      type: 'raster',
      source: 'dark-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export function getMapStyle(
  mode: 'street' | 'satellite',
  useDirectMapbox: boolean = true,
  theme: 'light' | 'dark' = 'light'
): string | Style {
  const token = getMapboxToken();
  if (useDirectMapbox && token && token.startsWith('pk.')) {
    if (mode === 'satellite') return 'mapbox://styles/mapbox/satellite-streets-v12';
    return theme === 'dark'
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12';
  }
  if (mode === 'satellite') return SATELLITE_RASTER_STYLE;
  return theme === 'dark' ? DARK_RASTER_STYLE : OSM_RASTER_STYLE;
}

// Quick View Presets
export const MAP_PRESETS = {
  DANANG: {
    label: 'Toàn cảnh 8 Quận / Huyện Đà Nẵng',
    center: [108.1600, 16.0600] as [number, number],
    zoom: 10.4,
  },
  URBAN: {
    label: 'Khu vực Đô thị Trung tâm',
    center: [108.2238, 16.068] as [number, number],
    zoom: 12.8,
  },
  HOANG_SA: {
    label: 'Quần đảo Hoàng Sa (Đà Nẵng)',
    center: [112.0, 16.5] as [number, number],
    zoom: 8.5,
  },
  TRUONG_SA: {
    label: 'Quần đảo Trường Sa (Khánh Hòa)',
    center: [113.8, 10.0] as [number, number],
    zoom: 7.2,
  },
  BIEN_DONG: {
    label: 'Toàn cảnh Biển Đông (VN)',
    center: [111.5, 13.2] as [number, number],
    zoom: 5.6,
  },
};

// Sovereign Islands Markers
export interface SovereignIsland {
  id: string;
  name: string;
  subname: string;
  archipelago: 'Hoàng Sa' | 'Trường Sa';
  coordinates: [number, number];
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

import { getRegionColor } from './geoapifyBoundariesService';

// District & Major Ward Metadata & Cartographic Color Palette
export const DISTRICT_METADATA: Record<string, {
  name: string;
  shortName: string;
  fillColor: string;
  borderColor: string;
  icon: string;
  center?: [number, number];
  zoom?: number;
}> = {
  'area-dn': {
    name: 'Thành phố Đà Nẵng',
    shortName: 'Đà Nẵng',
    fillColor: '#3b82f6',
    borderColor: '#1d4ed8',
    icon: '🌆',
    center: [108.16, 16.06],
    zoom: 10.4,
  },
  'area-hc': {
    name: 'Phường Hải Châu',
    shortName: 'Hải Châu',
    fillColor: '#3b82f6',
    borderColor: '#1d4ed8',
    icon: '🏛️',
    center: [108.2124, 16.0806],
    zoom: 14.5,
  },
  'area-htd': {
    name: 'Phường Hòa Cường',
    shortName: 'Hòa Cường',
    fillColor: '#2563eb',
    borderColor: '#1e40af',
    icon: '🏢',
    center: [108.2103, 16.0411],
    zoom: 14.8,
  },
  'area-tk': {
    name: 'Phường Thanh Khê',
    shortName: 'Thanh Khê',
    fillColor: '#14b8a6',
    borderColor: '#0f766e',
    icon: '🏬',
    center: [108.1896, 16.0682],
    zoom: 14.5,
  },
  'area-ak': {
    name: 'Phường An Khê',
    shortName: 'An Khê',
    fillColor: '#06b6d4',
    borderColor: '#0e7490',
    icon: '🏭',
    center: [108.1792, 16.0308],
    zoom: 14.5,
  },
  'area-st': {
    name: 'Phường Sơn Trà',
    shortName: 'Sơn Trà',
    fillColor: '#8b5cf6',
    borderColor: '#6d28d9',
    icon: '🌊',
    center: [108.2373, 16.1046],
    zoom: 13.8,
  },
  'area-ah': {
    name: 'Phường An Hải',
    shortName: 'An Hải',
    fillColor: '#a855f7',
    borderColor: '#7e22ce',
    icon: '🏖️',
    center: [108.2373, 16.0747],
    zoom: 14.5,
  },
  'area-nhs': {
    name: 'Phường Ngũ Hành Sơn',
    shortName: 'Ngũ Hành Sơn',
    fillColor: '#0284c7',
    borderColor: '#0369a1',
    icon: '⛰️',
    center: [108.2428, 15.9875],
    zoom: 13.8,
  },
  'area-cl': {
    name: 'Phường Cẩm Lệ',
    shortName: 'Cẩm Lệ',
    fillColor: '#f97316',
    borderColor: '#c2410c',
    icon: '🌉',
    center: [108.1904, 16.0155],
    zoom: 14.2,
  },
  'area-hx': {
    name: 'Phường Hòa Xuân',
    shortName: 'Hòa Xuân',
    fillColor: '#ea580c',
    borderColor: '#9a3412',
    icon: '🏘️',
    center: [108.2052, 15.9732],
    zoom: 14.0,
  },
  'area-lc': {
    name: 'Phường Liên Chiểu',
    shortName: 'Liên Chiểu',
    fillColor: '#f59e0b',
    borderColor: '#b45309',
    icon: '🏔️',
    center: [108.0850, 16.0826],
    zoom: 13.6,
  },
  'area-hk': {
    name: 'Phường Hòa Khánh',
    shortName: 'Hòa Khánh',
    fillColor: '#d97706',
    borderColor: '#92400e',
    icon: '🏗️',
    center: [108.1300, 16.0532],
    zoom: 14.0,
  },
  'area-hvan': {
    name: 'Phường Hải Vân',
    shortName: 'Hải Vân',
    fillColor: '#ca8a04',
    borderColor: '#854d0e',
    icon: '⛰️',
    center: [108.0145, 16.1380],
    zoom: 12.0,
  },
  'area-hv': {
    name: 'Xã Hòa Vang',
    shortName: 'Hòa Vang',
    fillColor: '#10b981',
    borderColor: '#047857',
    icon: '🌲',
    center: [108.0672, 15.9810],
    zoom: 12.5,
  },
  'area-bana': {
    name: 'Xã Bà Nà',
    shortName: 'Bà Nà',
    fillColor: '#059669',
    borderColor: '#065f46',
    icon: '🚠',
    center: [108.0596, 16.0411],
    zoom: 12.5,
  },
  'area-htien': {
    name: 'Xã Hòa Tiến',
    shortName: 'Hòa Tiến',
    fillColor: '#16a34a',
    borderColor: '#166534',
    icon: '🌾',
    center: [108.1255, 15.9576],
    zoom: 13.0,
  },
  'area-hs': {
    name: 'Huyện Hoàng Sa',
    shortName: 'Hoàng Sa (Đà Nẵng)',
    fillColor: '#ef4444',
    borderColor: '#b91c1c',
    icon: '🇻🇳',
    center: [112.0, 16.5],
    zoom: 8.5,
  },
};

// GeoJSON conversion for administrative areas (Geoapify Boundary Features)
export function buildWardsGeoJSON(areas: AdministrativeArea[]): FeatureCollection {
  const validAreas = areas.filter(
    (a) => a.boundary?.coordinates && a.boundary.coordinates.length > 0 && a.type !== 'PROVINCE'
  );

  const features: Feature[] = validAreas.map((w, index) => {
    const meta = DISTRICT_METADATA[w.id] || DISTRICT_METADATA[w.parentId || ''];
    const palette = getRegionColor(w.id || index);
    const fillColor = meta?.fillColor || palette.fill;
    const borderColor = meta?.borderColor || palette.border;

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

  const rescuerLng = assignment.rescuerLocation?.lng ?? (sos.coordinates.lng + 0.009);
  const rescuerLat = assignment.rescuerLocation?.lat ?? (sos.coordinates.lat - 0.007);

  const midLng = (rescuerLng + sos.coordinates.lng) / 2 + 0.002;
  const midLat = (rescuerLat + sos.coordinates.lat) / 2 + 0.001;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          assignmentId: assignment.id,
          status: assignment.status,
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
  if (!area.boundary || !area.boundary.coordinates) return true;
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

  // 1. Authoritative GIS spatial check: If boundary polygon is defined, coordinates MUST be inside it
  if (managedArea && managedArea.boundary && managedArea.boundary.coordinates) {
    return isPointInAreaBoundary(sos.coordinates, managedArea);
  }

  // 2. Fallback if polygon boundary is not yet loaded: check administrative ward ID and name
  const officerAreaId = officer.jurisdictionAreaId;
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
    (wardKeyword && sos.wardName && sos.wardName.toLowerCase().includes(wardKeyword));

  return !!matchesWard;
}


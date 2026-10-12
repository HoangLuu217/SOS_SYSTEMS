import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Edit3,
  UploadCloud,
  Plus,
  Minus,
  RotateCcw,
  Key,
} from 'lucide-react';
import type { AdministrativeArea, AuthorityOrganization, AuthorityOfficer } from '../../types/domainD';
import {
  getMapboxToken,
  setMapboxToken,
  getMapStyle,
  buildWardsGeoJSON,
  SOVEREIGN_ISLANDS,
  MAP_PRESETS,
  DISTRICT_METADATA,
} from '../../services/mapboxConfig';
import { SOVEREIGN_ISLANDS_GEOJSON } from '../../services/sovereignIslandsGeoJSON';

import { useApp } from '../../context/AppContext';

interface Props {
  areas: AdministrativeArea[];
  selectedArea: AdministrativeArea;
  onSelectArea: (area: AdministrativeArea) => void;
  onEditArea: (area: AdministrativeArea) => void;
  onAssignAuthority: (area: AdministrativeArea) => void;
  authorities: AuthorityOrganization[];
  activeOfficer?: AuthorityOfficer;
  onSwitchScreen?: (screen: 'territorial' | 'dispatch') => void;
}

import { GEOAPIFY_CENTROIDS, getRegionColor } from '../../services/geoapifyBoundariesService';

// Centroid coordinates for flying to districts and wards (powered by official Geoapify live boundaries)
export const WARD_CENTROIDS: Record<string, [number, number]> = {
  ...GEOAPIFY_CENTROIDS,
  'area-dn': [108.1600, 16.0600],
  'area-hs': [112.0, 16.5],
  'area-hs-arch': [112.0, 16.5],
  'area-htd': [108.2175, 16.0416], // Phường Hòa Cường (7.9 km²)
  'area-hc': [108.2195, 16.0590],  // Phường Hải Châu (3.6 km²)
  'area-tk': [108.1966, 16.0684],  // Phường Thanh Khê (4.0 km²)
  'area-ak': [108.1855, 16.0500],  // Phường An Khê (6.2 km²)
  'area-st': [108.2486, 16.1022],  // Phường Sơn Trà (26.0 km²)
  'area-ah': [108.2364, 16.0701],  // Phường An Hải (3.7 km²)
  'area-nhs': [108.2532, 16.0108], // Phường Ngũ Hành Sơn (20.1 km²)
  'area-cl': [108.2013, 16.0153],  // Phường Cẩm Lệ (7.1 km²)
  'area-hx': [108.2204, 16.0049],  // Phường Hòa Xuân (14.1 km²)
  'area-lc': [108.1392, 16.0767],  // Phường Liên Chiểu (20.7 km²)
  'area-hk': [108.1546, 16.0503],  // Phường Hòa Khánh (20.7 km²)
  'area-hvan': [108.1149, 16.1348], // Phường Hải Vân (204.4 km²)
  'area-hv': [108.0283, 15.9704],  // Xã Hòa Vang (54.2 km²)
  'area-bana': [108.0240, 16.0502], // Xã Bà Nà (68.6 km²)
  'area-htien': [108.1326, 15.9603], // Xã Hòa Tiến (33.1 km²)
};

// Robust dynamic centroid resolver for any area or ward
export function getAreaCentroid(
  areaOrId?: AdministrativeArea | string | null,
  allAreas?: AdministrativeArea[]
): [number, number] | null {
  if (!areaOrId) return null;
  const id = typeof areaOrId === 'string' ? areaOrId : areaOrId.id;
  if (WARD_CENTROIDS[id]) return WARD_CENTROIDS[id];

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
      return [sumLng / coords.length, sumLat / coords.length];
    }
  }

  if (area?.parentId && WARD_CENTROIDS[area.parentId]) {
    return WARD_CENTROIDS[area.parentId];
  }

  return [108.2020, 16.0540];
}

export const TerritorialMapCanvas = ({
  areas,
  selectedArea,
  onSelectArea,
  onEditArea: _onEditArea,
  onAssignAuthority: _onAssignAuthority,
  authorities: _authorities,
  activeOfficer,
  onSwitchScreen: _onSwitchScreen,
}: Props) => {
  const { theme, t, mapMode } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 16.0825,
    lng: 108.2238,
  });
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [inputToken, setInputToken] = useState(getMapboxToken());

  // Compute officer assigned jurisdiction
  const officerAreaId = activeOfficer?.jurisdictionAreaId || '';
  const officerArea = areas.find((a) => a.id === officerAreaId);
  const isOfficerWard = officerArea ? officerArea.type === 'WARD' : false;
  const isAuthorMode = !isAdmin && Boolean(officerAreaId);

  // Initialize Mapbox map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = getMapboxToken();

    // Default center & zoom depending on role
    const initialCenter: [number, number] = (!isAdmin && officerArea)
      ? (getAreaCentroid(officerArea, areas) || [108.2175, 16.0416])
      : [108.1600, 16.0600];
    const initialZoom = !isAdmin
      ? (officerAreaId === 'area-htd' ? 13.4 : (isOfficerWard ? 14.5 : 13.5))
      : 11.2;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(mapMode, true, theme) as any,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    mapRef.current = map;

    // Track mouse coordinates
    map.on('mousemove', (e) => {
      setCoords({
        lat: Number(e.lngLat.lat.toFixed(4)),
        lng: Number(e.lngLat.lng.toFixed(4)),
      });
    });

    map.on('load', () => {
      renderMapLayers(map);
      map.resize();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
    };
  }, []);

  // Update style when mapMode or theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(getMapStyle(mapMode, true, theme) as any);
    map.once('style.load', () => {
      renderMapLayers(map);
    });
  }, [mapMode, theme]);

  // Update polygon layers and fly to ward when selectedArea or activeOfficer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Update GeoJSON source
    const source = map.getSource('wards-source') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(buildWardsGeoJSON(areas));
    }

    // Dynamic layer filter: if Author mode, strictly show ONLY the Author's assigned jurisdiction!
    const wardsFilter: any = isAuthorMode
      ? ['==', ['get', 'id'], officerAreaId]
      : ['!=', ['get', 'type'], 'PROVINCE'];

    if (map.getLayer('wards-fill')) {
      map.setFilter('wards-fill', wardsFilter);
    }
    if (map.getLayer('wards-borders')) {
      map.setFilter('wards-borders', wardsFilter);
    }

    // City Master halo and border: ONLY visible to Admin TP!
    const cityMasterFilter: any = isAdmin
      ? ['==', ['get', 'type'], 'PROVINCE']
      : ['==', ['get', 'id'], '___none___'];

    if (map.getLayer('city-master-halo')) {
      map.setFilter('city-master-halo', cityMasterFilter);
    }
    if (map.getLayer('city-master-border')) {
      map.setFilter('city-master-border', cityMasterFilter);
    }

    // Sovereign islands: hide completely unless Admin or Hoang Sa author
    const islandVisibility = (isAdmin || officerAreaId === 'area-hs') ? 'visible' : 'none';
    [
      'sovereign-atolls-fill',
      'sovereign-atolls-border',
      'sovereign-islands-fill',
      'sovereign-islands-border',
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', islandVisibility);
      }
    });

    // Update highlight filter for selected area (author uses red Google Maps style exclusively)
    const targetSelectedId = isAuthorMode ? '___none___' : selectedArea.id;
    if (map.getLayer('wards-selected-fill')) {
      map.setFilter('wards-selected-fill', ['==', ['get', 'id'], targetSelectedId]);
    }
    if (map.getLayer('wards-selected-border')) {
      map.setFilter('wards-selected-border', ['==', ['get', 'id'], targetSelectedId]);
    }

    // Update officer's jurisdiction highlight filters
    if (map.getLayer('jurisdiction-officer-fill')) {
      map.setFilter('jurisdiction-officer-fill', ['==', ['get', 'id'], officerAreaId]);
    }
    if (map.getLayer('jurisdiction-officer-halo')) {
      map.setFilter('jurisdiction-officer-halo', ['==', ['get', 'id'], officerAreaId]);
    }
    if (map.getLayer('jurisdiction-officer-dashed-border')) {
      map.setFilter('jurisdiction-officer-dashed-border', ['==', ['get', 'id'], officerAreaId]);
    }

    // Refresh markers to match filter
    renderWardMarkers(map);

    // Fly to appropriate area
    const targetArea = !isAdmin && officerArea ? officerArea : selectedArea;
    const targetCoord = getAreaCentroid(targetArea, areas) || [108.2175, 16.0416];

    let zoomLevel = 14.8;
    if (isAdmin) {
      if (targetArea.type === 'PROVINCE' || targetArea.id === 'area-dn') zoomLevel = 11.2;
      else if (targetArea.type === 'DISTRICT') {
        if (targetArea.id === 'area-hs') zoomLevel = 8.5;
        else if (targetArea.id === 'area-hv') zoomLevel = 10.8;
        else if (targetArea.id === 'area-lc') zoomLevel = 11.8;
        else zoomLevel = 12.6;
      } else zoomLevel = 14.5;
    } else {
      const km2 = (targetArea as any)?.areaKm2 || 8;
      if (officerAreaId === 'area-hs') zoomLevel = 8.5;
      else if (km2 > 100) zoomLevel = 10.6;
      else if (km2 > 40) zoomLevel = 11.4;
      else if (km2 > 20) zoomLevel = 12.4;
      else if (km2 > 10) zoomLevel = 13.0;
      else if (km2 > 5) zoomLevel = 13.4;
      else zoomLevel = 14.0;
    }

    map.flyTo({
      center: targetCoord,
      zoom: zoomLevel,
      essential: true,
      duration: 800,
    });
  }, [selectedArea.id, activeOfficer?.jurisdictionAreaId, isAuthorMode, areas]);

  // Helper to add GeoJSON layers to Mapbox
  const renderMapLayers = (map: mapboxgl.Map) => {
    if (map.getSource('wards-source')) return;

    map.addSource('wards-source', {
      type: 'geojson',
      data: buildWardsGeoJSON(areas),
    });

    const officerAreaId = activeOfficer?.jurisdictionAreaId || '';
    const initialWardsFilter: any = isAuthorMode
      ? ['==', ['get', 'id'], officerAreaId]
      : ['!=', ['get', 'type'], 'PROVINCE'];
    const initialCityFilter: any = isAdmin
      ? ['==', ['get', 'type'], 'PROVINCE']
      : ['==', ['get', 'id'], '___none___'];

    // 0. Master City of Da Nang Provincial Boundary (Halo & Crimson Border)
    map.addLayer({
      id: 'city-master-halo',
      type: 'line',
      source: 'wards-source',
      filter: initialCityFilter,
      paint: {
        'line-color': '#ffffff',
        'line-width': 6,
        'line-opacity': 0.9,
      },
    });

    map.addLayer({
      id: 'city-master-border',
      type: 'line',
      source: 'wards-source',
      filter: initialCityFilter,
      paint: {
        'line-color': '#dc2626', // Crimson red for city boundary
        'line-width': 3.5,
        'line-dasharray': [6, 3], // Provincial boundary dashed pattern
      },
    });

    // 1. Fill layer with distinctive colors per major ward zone
    map.addLayer({
      id: 'wards-fill',
      type: 'fill',
      source: 'wards-source',
      filter: initialWardsFilter,
      paint: {
        'fill-color': [
          'coalesce',
          ['get', 'districtColor'],
          '#3b82f6',
        ],
        'fill-opacity': 0.25,
      },
    });

    // 2. Stroke boundary layer (Sharp, distinct color per major ward zone)
    map.addLayer({
      id: 'wards-borders',
      type: 'line',
      source: 'wards-source',
      filter: initialWardsFilter,
      paint: {
        'line-color': [
          'coalesce',
          ['get', 'districtBorderColor'],
          '#1d4ed8',
        ],
        'line-width': 2.2,
        'line-opacity': 0.95,
      },
    });

    // 3. Highlighted Selected Area Fill (Blue) - Only in Admin mode
    map.addLayer({
      id: 'wards-selected-fill',
      type: 'fill',
      source: 'wards-source',
      filter: isAuthorMode ? ['==', ['get', 'id'], '___none___'] : ['==', ['get', 'id'], selectedArea.id],
      paint: {
        'fill-color': '#2563eb',
        'fill-opacity': ['case', ['==', ['get', 'type'], 'PROVINCE'], 0.08, 0.22],
      },
    });

    // 4. Highlighted Selected Area Outer Border (Blue) - Only in Admin mode
    map.addLayer({
      id: 'wards-selected-border',
      type: 'line',
      source: 'wards-source',
      filter: isAuthorMode ? ['==', ['get', 'id'], '___none___'] : ['==', ['get', 'id'], selectedArea.id],
      paint: {
        'line-color': '#2563eb',
        'line-width': 2.8,
      },
    });

    // ========================================================
    // 5, 6, 7. Active Officer's Jurisdiction (Google Maps Soft Red Dotted Boundary & Tint)
    // ========================================================
    // 5. Officer Jurisdiction Soft Red Fill Tint (very faint, not dark)
    map.addLayer({
      id: 'jurisdiction-officer-fill',
      type: 'fill',
      source: 'wards-source',
      filter: ['==', ['get', 'id'], officerAreaId],
      paint: {
        'fill-color': '#ef4444',
        'fill-opacity': theme === 'dark' ? 0.06 : 0.035,
      },
    });

    // 6. Subtle soft halo under the dotted line
    map.addLayer({
      id: 'jurisdiction-officer-halo',
      type: 'line',
      source: 'wards-source',
      filter: ['==', ['get', 'id'], officerAreaId],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': theme === 'dark' ? '#090d16' : '#ffffff',
        'line-width': 4.2,
        'line-opacity': 0.65,
        'line-blur': 0.8,
      },
    });

    // 7. Fine round dotted boundary in soft Google Maps red (not too dark)
    map.addLayer({
      id: 'jurisdiction-officer-dashed-border',
      type: 'line',
      source: 'wards-source',
      filter: ['==', ['get', 'id'], officerAreaId],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#ea4335', // Google Maps soft coral red (vibrant, not dark)
        'line-width': 2.3,
        'line-dasharray': [0.1, 2.2], // Crisp round dots with Google Maps spacing
      },
    });

    // Interactive clicks on polygons
    map.on('click', 'wards-fill', (e) => {
      if (isAuthorMode) return;
      if (e.features && e.features[0]) {
        const clickedId = (e.features[0] as any).properties?.id;
        const matched = areas.find((a) => a.id === clickedId);
        if (matched) {
          onSelectArea(matched);
        }
      }
    });

    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'geoapify-hover-popup',
    });

    map.on('mousemove', 'wards-fill', (e) => {
      // In Author mode: do not show any hover popup over assigned area
      if (isAuthorMode) {
        hoverPopup.remove();
        map.getCanvas().style.cursor = 'default';
        return;
      }
      if (e.features && e.features[0]) {
        const props = (e.features[0] as any).properties;
        map.getCanvas().style.cursor = 'pointer';
        const color = props.districtColor || '#3b82f6';
        const border = props.districtBorderColor || '#1d4ed8';
        hoverPopup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: inherit; padding: 6px 10px; min-width: 170px;">
              <div style="display: flex; align-items: center; gap: 7px; font-weight: 800; font-size: 13px; color: #0f172a;">
                <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:${color}; border: 1.5px solid ${border};"></span>
                <span>${props.name}</span>
              </div>
              <div style="font-size: 11px; color: #475569; margin-top: 4px; display: flex; gap: 8px;">
                <span>Mã: <strong>${props.code}</strong></span>
                <span>•</span>
                <span>${props.areaKm2 ? `${props.areaKm2} km²` : ''}</span>
              </div>
              <div style="margin-top: 4px; font-size: 10px; color: ${props.assigned ? '#059669' : '#dc2626'}; font-weight: 700;">
                ${props.assigned ? `🛡️ ${props.assignedAuthorityName || 'Đã phân công'}` : '⚠️ Chưa phân công đơn vị'}
              </div>
            </div>
          `)
          .addTo(map);
      }
    });

    map.on('mouseleave', 'wards-fill', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    // ========================================================
    // Real Geographic Island & Coral Reef Polygon Layers (Hoàng Sa & Trường Sa)
    // ========================================================
    if (!map.getSource('sovereign-islands-source')) {
      map.addSource('sovereign-islands-source', {
        type: 'geojson',
        data: SOVEREIGN_ISLANDS_GEOJSON,
      });

      // 1. Coral reef atolls fill (Shallow lagoon / cyan water)
      map.addLayer({
        id: 'sovereign-atolls-fill',
        type: 'fill',
        source: 'sovereign-islands-source',
        filter: ['==', ['get', 'type'], 'reef_atoll'],
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': 0.5,
        },
      });

      // 2. Coral reef atolls border
      map.addLayer({
        id: 'sovereign-atolls-border',
        type: 'line',
        source: 'sovereign-islands-source',
        filter: ['==', ['get', 'type'], 'reef_atoll'],
        paint: {
          'line-color': '#0284c7',
          'line-width': 1.6,
          'line-dasharray': [3, 2],
        },
      });

      // 3. Island landmass fill (Natural golden sand / green land)
      map.addLayer({
        id: 'sovereign-islands-fill',
        type: 'fill',
        source: 'sovereign-islands-source',
        filter: ['==', ['get', 'type'], 'island'],
        paint: {
          'fill-color': '#fde68a',
          'fill-opacity': 0.95,
        },
      });

      // 4. Island coastline border
      map.addLayer({
        id: 'sovereign-islands-border',
        type: 'line',
        source: 'sovereign-islands-source',
        filter: ['==', ['get', 'type'], 'island'],
        paint: {
          'line-color': '#d97706',
          'line-width': 2,
        },
      });

      // Click on island polygon opens official sovereignty popup
      map.on('click', 'sovereign-islands-fill', (e) => {
        if (e.features && e.features[0]) {
          const props = (e.features[0] as any).properties;
          new mapboxgl.Popup({ offset: 15 })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family: inherit; padding: 6px 8px; min-width: 180px;">
                <div style="display: flex; align-items: center; gap: 5px; color: #b91c1c; font-weight: 800; font-size: 13px;">
                  <span>🇻🇳</span>
                  <span>${props.vietnameseName || props.name}</span>
                </div>
                <div style="font-size: 11px; color: #334155; margin-top: 3px; font-weight: 600;">
                  Quần đảo ${props.archipelago} (${props.province}, Việt Nam)
                </div>
                ${props.areaKm2 ? `<div style="font-size: 11px; color: #0284c7; margin-top: 3px;">Diện tích tự nhiên: <strong>${props.areaKm2} km²</strong></div>` : ''}
                <div style="margin-top: 6px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
                  Chủ quyền lãnh thổ thiêng liêng của Việt Nam
                </div>
              </div>
            `)
            .addTo(map);
        }
      });

      map.on('mouseenter', 'sovereign-islands-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'sovereign-islands-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Render HTML centroid markers with badges
    renderWardMarkers(map);
  };

  const renderWardMarkers = (map: mapboxgl.Map) => {
    // Clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Prominent Major Ward Zone Badges across Da Nang City (filtered to author's jurisdiction if in author mode)
    areas
      .filter((a) => a.type !== 'PROVINCE')
      .filter((zone) => {
        if (!isAuthorMode) return true;
        return zone.id === officerAreaId;
      })
      .forEach((zone) => {
        const coord = getAreaCentroid(zone, areas);
        if (!coord) return;

        const palette = getRegionColor(zone.id);
        const meta = DISTRICT_METADATA[zone.id] || {
          shortName: zone.name.replace(/^(Phường|Xã|Huyện)\s+/, ''),
          fillColor: palette.fill,
          borderColor: palette.border,
          icon: '📍',
        };

        const isSelected = selectedArea.id === zone.id;

        const el = document.createElement('div');
        el.className = `mapbox-district-marker marker-district-badge ${isSelected ? 'is-selected-marker' : 'marker-ward-mainland'}`;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'auto';

        if (isAuthorMode) {
          el.style.cursor = 'default';
          el.style.pointerEvents = 'none';
          el.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              pointer-events: none;
              text-align: center;
            ">
              <span style="
                font-size: 15px;
                font-weight: 800;
                color: #1e293b;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                text-shadow: 0 1px 4px #ffffff, 0 0 8px #ffffff, 0 0 12px #ffffff;
                font-family: inherit;
              ">
                ${zone.name ? zone.name.toUpperCase() : meta.shortName.toUpperCase()}
              </span>
            </div>
          `;
        } else {
          el.innerHTML = `
            <div style="
              background: ${isSelected ? meta.borderColor : 'rgba(255, 255, 255, 0.95)'};
              color: ${isSelected ? '#ffffff' : '#0f172a'};
              border: 2px solid ${meta.borderColor};
              border-radius: 18px;
              padding: 3px 9px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.18);
              display: flex;
              align-items: center;
              gap: 5px;
              white-space: nowrap;
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
              backdrop-filter: blur(4px);
            ">
              <span style="font-size: 13px;">${meta.icon}</span>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.2px;">
                  ${meta.shortName}
                </span>
                <span style="font-size: 9px; opacity: ${isSelected ? 0.9 : 0.75}; font-weight: 600;">
                  ${zone.areaKm2 ? `${zone.areaKm2} km²` : ''} • ${zone.population ? `${Math.round(zone.population / 1000)}k dân` : ''}
                </span>
              </div>
            </div>
          `;

          el.addEventListener('mouseenter', () => {
            const inner = el.firstElementChild as HTMLElement | null;
            if (inner) {
              inner.style.transform = 'scale(1.08)';
              inner.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
            }
          });
          el.addEventListener('mouseleave', () => {
            const inner = el.firstElementChild as HTMLElement | null;
            if (inner) {
              inner.style.transform = 'scale(1)';
              inner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)';
            }
          });

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelectArea(zone);
          });
        }

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coord)
          .addTo(map);

        markersRef.current.push(marker);
      });

    // If author mode is active, skip offshore island markers unless author is Hoang Sa
    if (isAuthorMode && officerAreaId !== 'area-hs') {
      return;
    }

    // 2. National Archipelago Markers (Zoom-adaptive: visible at overview zoom, elegant cartographic style)
    const archipelagos = [
      {
        name: 'QUẦN ĐẢO HOÀNG SA',
        sub: 'Thành phố Đà Nẵng, Việt Nam',
        coord: [112.0, 16.5] as [number, number],
      },
      {
        name: 'QUẦN ĐẢO TRƯỜNG SA',
        sub: 'Tỉnh Khánh Hòa, Việt Nam',
        coord: [113.8, 10.0] as [number, number],
      },
    ];

    archipelagos.forEach((arch) => {
      const el = document.createElement('div');
      el.className = 'marker-archipelago';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '5px';
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';

      el.innerHTML = `
        <div style="
          background: rgba(185, 28, 28, 0.92);
          border: 1.5px solid #fbbf24;
          border-radius: 5px;
          padding: 3px 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
          white-space: nowrap;
        ">
          <span style="font-size: 13px;">🇻🇳</span>
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.4px; color: #fef08a;">
              ${arch.name}
            </span>
            <span style="font-size: 9px; opacity: 0.95; font-weight: 600;">
              (${arch.sub})
            </span>
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        map.flyTo({
          center: arch.coord,
          zoom: 8.8,
          duration: 1000,
        });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(arch.coord)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // 3. Specific Individual Island Markers (Class: marker-island-detail)
    SOVEREIGN_ISLANDS.filter((i) => !i.isCapital).forEach((island) => {
      const el = document.createElement('div');
      el.className = 'marker-island-detail';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '4px';
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';

      el.innerHTML = `
        <div style="
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b91c1c;
          border: 1.5px solid #ffffff;
          box-shadow: 0 0 4px rgba(185, 28, 28, 0.8);
        "></div>
        <span style="
          font-size: 10px;
          font-weight: 700;
          color: #0f172a;
          text-shadow: 0 0 3px #ffffff, 0 0 3px #ffffff, 0 0 4px #ffffff;
          white-space: nowrap;
        ">
          ${island.name}
        </span>
      `;

      el.addEventListener('click', () => {
        map.flyTo({
          center: island.coordinates,
          zoom: 12.0,
          duration: 900,
        });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(island.coordinates)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Zoom-level visibility management: Prevents overcrowding
    const updateMarkerZoom = () => {
      const z = map.getZoom();

      // Archipelago badges: visible at overview zoom, hide when zoomed close
      document.querySelectorAll<HTMLElement>('.marker-archipelago').forEach((m) => {
        m.style.display = z < 8.2 ? 'flex' : 'none';
      });

      // Individual island markers: visible when zoomed into the archipelago
      document.querySelectorAll<HTMLElement>('.marker-island-detail').forEach((m) => {
        m.style.display = z >= 7.8 ? 'flex' : 'none';
      });

      // Mainland ward markers: visible when zoomed in to Da Nang city
      document.querySelectorAll<HTMLElement>('.marker-ward-mainland').forEach((m) => {
        m.style.display = z >= 10.5 ? 'flex' : 'none';
      });
    };

    map.on('zoom', updateMarkerZoom);
    updateMarkerZoom();
  };

  const handleZoom = (delta: number) => {
    if (!mapRef.current) return;
    mapRef.current.zoomTo(mapRef.current.getZoom() + delta, { duration: 300 });
  };

  const handleReset = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [108.2238, 16.075],
      zoom: 12.8,
      duration: 800,
    });
  };

  const handleSaveToken = () => {
    setMapboxToken(inputToken.trim());
    setTokenModalOpen(false);
    window.location.reload();
  };

  return (
    <div className="territorial-right-canvas">
      {/* Top Map Toolbar (Admin-Only Tactical Presets) */}
      {isAdmin && (
        <div className="map-top-toolbar">
          {/* Sovereign Region Quick Views */}
          <div className="map-control-group" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="map-tool-btn"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({
                      center: MAP_PRESETS.DANANG.center,
                      zoom: MAP_PRESETS.DANANG.zoom,
                      duration: 800,
                    });
                  }
                }}
                title="Bay đến Đất liền Đà Nẵng"
              >
                🏙️ Đà Nẵng
              </button>
              <button
                type="button"
                className="map-tool-btn"
                style={{ color: '#b91c1c', fontWeight: 700 }}
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({
                      center: MAP_PRESETS.HOANG_SA.center,
                      zoom: MAP_PRESETS.HOANG_SA.zoom,
                      duration: 1100,
                    });
                  }
                }}
                title="Bay đến Quần đảo Hoàng Sa (TP Đà Nẵng, Việt Nam)"
              >
                🇻🇳 Hoàng Sa
              </button>
              <button
                type="button"
                className="map-tool-btn"
                style={{ color: '#b91c1c', fontWeight: 700 }}
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({
                      center: MAP_PRESETS.TRUONG_SA.center,
                      zoom: MAP_PRESETS.TRUONG_SA.zoom,
                      duration: 1100,
                    });
                  }
                }}
                title="Bay đến Quần đảo Trường Sa (Tỉnh Khánh Hòa, Việt Nam)"
              >
                🇻🇳 Trường Sa
              </button>
              <button
                type="button"
                className="map-tool-btn"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({
                      center: MAP_PRESETS.BIEN_DONG.center,
                      zoom: MAP_PRESETS.BIEN_DONG.zoom,
                      duration: 1100,
                    });
                  }
                }}
                title="Xem Toàn cảnh Biển Đông Việt Nam"
              >
                🌊 Biển Đông VN
              </button>
            </div>

            <button
              type="button"
              className="map-action-btn"
              onClick={() => {
                alert('Mapbox GL Drawing Mode active: Click to define polygon vertices.');
              }}
              title="Vẽ ranh giới phân chia địa bàn"
            >
              <Edit3 size={14} />
              {t('territorial.drawBoundary')}
            </button>

            <button
              type="button"
              className="map-action-btn"
              onClick={() => {
                alert('GeoJSON Importer: Standard RFC 7946 Polygon geometry loaded.');
              }}
              title="Nhập GeoJSON phân chia địa bàn"
            >
              <UploadCloud size={14} />
              {t('territorial.importGeoJson')}
            </button>

            <button
              type="button"
              className="map-action-btn"
              onClick={() => setTokenModalOpen(true)}
              title="Configure Mapbox Access Token"
            >
              <Key size={14} />
              {t('territorial.mapboxApi')}
            </button>
        </div>
      )}

      {/* Map Zoom Controls */}
      <div className="map-zoom-controls">
        <button
          type="button"
          className="map-zoom-btn"
          onClick={() => handleZoom(0.6)}
          title="Zoom In"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="map-zoom-btn"
          onClick={() => handleZoom(-0.6)}
          title="Zoom Out"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="map-zoom-btn"
          onClick={handleReset}
          title="Reset View"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Mapbox Container Viewport */}
      <div
        ref={mapContainerRef}
        className="map-canvas-viewport"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
      </div>

      {/* Bottom Coordinates & Scale HUD */}
      <div className="map-coords-hud">
        <span style={{ color: '#b91c1c', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>🇻🇳</span>
          <span>{t('territorial.sovereigntyNotice')}</span>
        </span>
        <span style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 8 }}>
          LAT: <strong>{coords.lat}° N</strong>
        </span>
        <span style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 8 }}>
          LNG: <strong>{coords.lng}° E</strong>
        </span>
        <span style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 8 }}>
          WGS84 • Biển Đông Việt Nam
        </span>
      </div>

      {/* Mapbox Token Config Modal */}
      {tokenModalOpen && (
        <div className="sos-modal-overlay">
          <div className="sos-modal-window" style={{ width: 480 }}>
            <div className="sos-modal-header">
              <h3 className="sos-modal-title">Mapbox API Configuration</h3>
              <button
                type="button"
                className="sos-modal-close-icon"
                onClick={() => setTokenModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="sos-modal-content">
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                Enter your personal Mapbox Public Access Token (starts with <code>pk.eyJ1...</code>).
                If left blank, the app will automatically use the high-performance OpenStreetMap / ESRI raster tile fallback.
              </p>
              <div className="form-group" style={{ marginTop: 8 }}>
                <label className="form-label">Mapbox Access Token</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="pk.eyJ1..."
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                />
              </div>
            </div>
            <div className="sos-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTokenModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-action"
                onClick={handleSaveToken}
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

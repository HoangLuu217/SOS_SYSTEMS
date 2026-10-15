import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  GeoJSON,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Edit3,
  UploadCloud,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { AdministrativeArea, AuthorityOrganization, AuthorityOfficer } from '../../types/domainD';
import {
  MAP_PRESETS,
  SOVEREIGN_ISLANDS,
  DISTRICT_METADATA,
  GOOGLE_MAP_TILES,
} from '../../services/mapGeoService';
import { SOVEREIGN_ISLANDS_GEOJSON } from '../../services/sovereignIslandsGeoJSON';
import { GEOAPIFY_CENTROIDS, getRegionColor } from '../../services/geoapifyBoundariesService';
import { useApp } from '../../context/AppContext';

// Centroid coordinates for flying to districts and wards (Geoapify live boundaries)
export const WARD_CENTROIDS: Record<string, [number, number]> = {
  ...GEOAPIFY_CENTROIDS,
  'area-dn': [108.1600, 16.0600],
  'area-hs': [112.0, 16.5],
  'area-hs-arch': [112.0, 16.5],
  'area-htd': [108.2175, 16.0416], // Phường Hòa Cường
  'area-hc': [108.2195, 16.0590],  // Phường Hải Châu
  'area-tk': [108.1966, 16.0684],  // Phường Thanh Khê
  'area-ak': [108.1855, 16.0500],  // Phường An Khê
  'area-st': [108.2486, 16.1022],  // Phường Sơn Trà
  'area-ah': [108.2364, 16.0701],  // Phường An Hải
  'area-nhs': [108.2532, 16.0108], // Phường Ngũ Hành Sơn
  'area-cl': [108.2013, 16.0153],  // Phường Cẩm Lệ
  'area-hx': [108.2204, 16.0049],  // Phường Hòa Xuân
  'area-lc': [108.1392, 16.0767],  // Phường Liên Chiểu
  'area-hk': [108.1546, 16.0503],  // Phường Hòa Khánh
  'area-hvan': [108.1149, 16.1348], // Phường Hải Vân
  'area-hv': [108.0283, 15.9704],  // Xã Hòa Vang
  'area-bana': [108.0240, 16.0502], // Xã Bà Nà
  'area-htien': [108.1326, 15.9603], // Xã Hòa Tiến
};

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

// Controller component to control Map movement (flyTo, setZoom)
const LeafletMapController = ({
  center,
  zoom,
  onMount,
  onMouseMove,
}: {
  center: [number, number];
  zoom: number;
  onMount?: (map: L.Map) => void;
  onMouseMove?: (lat: number, lng: number) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (onMount) onMount(map);
  }, [map, onMount]);

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.0 });
  }, [center, zoom, map]);

  useMapEvents({
    mousemove(e) {
      if (onMouseMove) {
        onMouseMove(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4)));
      }
    },
  });

  return null;
};

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
  const { t, mapMode } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';
  const officerAreaId = activeOfficer?.jurisdictionAreaId || '';
  const officerArea = areas.find((a) => a.id === officerAreaId);
  const isOfficerWard = officerArea ? officerArea.type === 'WARD' : false;
  const isAuthorMode = !isAdmin && Boolean(officerAreaId);

  const mapInstanceRef = useRef<L.Map | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 16.0825,
    lng: 108.2238,
  });

  // Target view coordinates & zoom
  const [mapTarget, setMapTarget] = useState<{ center: [number, number]; zoom: number }>(() => {
    const rawCentroid = (!isAdmin && officerArea)
      ? (getAreaCentroid(officerArea, areas) || [108.2175, 16.0416])
      : [108.1600, 16.0600];
    const initialZoom = !isAdmin
      ? (officerAreaId === 'area-htd' ? 14 : (isOfficerWard ? 14.5 : 13.5))
      : 11.2;
    return {
      center: [rawCentroid[1], rawCentroid[0]], // [lat, lng]
      zoom: initialZoom,
    };
  });

  // When selectedArea changes, fly to its centroid
  useEffect(() => {
    const targetArea = !isAdmin && officerArea ? officerArea : selectedArea;
    const rawCentroid = getAreaCentroid(targetArea, areas) || [108.2175, 16.0416];
    const targetLatLng: [number, number] = [rawCentroid[1], rawCentroid[0]];

    let zoomLevel: number;
    if (isAdmin) {
      if (targetArea.type === 'PROVINCE' || targetArea.id === 'area-dn') zoomLevel = 11.2;
      else if (targetArea.type === 'DISTRICT') {
        if (targetArea.id === 'area-hs') zoomLevel = 8.5;
        else if (targetArea.id === 'area-hv') zoomLevel = 11;
        else if (targetArea.id === 'area-lc') zoomLevel = 12;
        else zoomLevel = 13;
      } else zoomLevel = 14.5;
    } else {
      const km2 = (targetArea as any)?.areaKm2 || 8;
      if (officerAreaId === 'area-hs') zoomLevel = 8.5;
      else if (km2 > 100) zoomLevel = 11;
      else if (km2 > 40) zoomLevel = 12;
      else if (km2 > 20) zoomLevel = 13;
      else zoomLevel = 14;
    }

    setMapTarget({ center: targetLatLng, zoom: zoomLevel });
  }, [selectedArea.id, officerAreaId, isAdmin, isAuthorMode]);

  // Google Maps Tile URL
  const googleTilesUrl = mapMode === 'satellite'
    ? GOOGLE_MAP_TILES.SATELLITE
    : GOOGLE_MAP_TILES.STREETS_CLEAN;

  // Manual Zoom controls
  const handleZoom = (delta: number) => {
    if (mapInstanceRef.current) {
      const cur = mapInstanceRef.current.getZoom();
      mapInstanceRef.current.setZoom(cur + delta);
    }
  };

  const handleReset = () => {
    setMapTarget({ center: [16.0600, 108.1600], zoom: 11 });
  };

  // Convert AdministrativeArea boundaries to Leaflet Polygon positions
  const wardPolygons = useMemo(() => {
    return areas
      .filter((a) => {
        if (!a.boundary?.coordinates || a.boundary.coordinates.length === 0) return false;
        if (isAuthorMode) return a.id === officerAreaId;
        return true;
      })
      .map((a) => {
        const { type, coordinates } = a.boundary!;
        const meta = DISTRICT_METADATA[a.id] || DISTRICT_METADATA[a.parentId || ''];
        const palette = getRegionColor(a.id);
        const fillColor = meta?.fillColor || palette.fill;
        const borderColor = meta?.borderColor || palette.border;
        const isSelected = selectedArea.id === a.id;
        const isOfficerAssigned = a.id === officerAreaId;
        const isProvince = a.type === 'PROVINCE';

        let positions: [number, number][][] = [];
        if (type === 'Polygon') {
          const ring = (coordinates as number[][][])[0];
          positions = [ring.map(([lng, lat]) => [lat, lng] as [number, number])];
        } else if (type === 'MultiPolygon') {
          const polys = coordinates as number[][][][];
          positions = polys.map((p) => p[0].map(([lng, lat]) => [lat, lng] as [number, number]));
        }

        return {
          id: a.id,
          name: a.name,
          code: a.code,
          area: a,
          positions,
          isProvince,
          isSelected,
          isOfficerAssigned,
          fillColor: isOfficerAssigned ? '#ef4444' : (isSelected ? '#2563eb' : fillColor),
          borderColor: isProvince ? '#dc2626' : (isOfficerAssigned ? '#dc2626' : (isSelected ? '#1d4ed8' : borderColor)),
          fillOpacity: isProvince ? 0.04 : (isOfficerAssigned ? 0.05 : (isSelected ? 0.18 : 0.12)),
          weight: isProvince ? 3 : (isOfficerAssigned ? 2.5 : (isSelected ? 3 : 2)),
          dashArray: isProvince ? '8, 4' : (isOfficerAssigned ? '1, 6' : undefined),
          lineCap: isOfficerAssigned ? ('round' as const) : undefined,
          lineJoin: isOfficerAssigned ? ('round' as const) : undefined,
        };
      });
  }, [areas, selectedArea.id, isAuthorMode, officerAreaId]);

  // Ward centroid markers
  const wardMarkers = useMemo(() => {
    return areas
      .filter((a) => a.type !== 'PROVINCE')
      .filter((zone) => {
        if (!isAuthorMode) return true;
        return zone.id === officerAreaId;
      })
      .map((zone) => {
        const coord = getAreaCentroid(zone, areas);
        if (!coord) return null;
        const [lng, lat] = coord;
        const palette = getRegionColor(zone.id);
        const meta = DISTRICT_METADATA[zone.id] || {
          shortName: zone.name.replace(/^(Phường|Xã|Huyện)\s+/, ''),
          fillColor: palette.fill,
          borderColor: palette.border,
          icon: '📍',
        };
        const isSelected = selectedArea.id === zone.id;

        const iconHtml = isAuthorMode
          ? `<div style="text-align: center; text-transform: uppercase; font-size: 14px; font-weight: 800; color: #1e293b; text-shadow: 0 1px 4px #fff, 0 0 8px #fff; pointer-events: none;">${zone.name}</div>`
          : `<div style="background: ${isSelected ? meta.borderColor : 'rgba(255, 255, 255, 0.95)'}; color: ${isSelected ? '#ffffff' : '#0f172a'}; border: 2px solid ${meta.borderColor}; border-radius: 18px; padding: 3px 9px; box-shadow: 0 4px 12px rgba(0,0,0,0.18); display: flex; align-items: center; gap: 5px; white-space: nowrap; font-family: inherit;">
              <span style="font-size: 13px;">${meta.icon}</span>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 11px; font-weight: 800;">${meta.shortName}</span>
                <span style="font-size: 9px; opacity: ${isSelected ? 0.9 : 0.75}; font-weight: 600;">${zone.areaKm2 ? `${zone.areaKm2} km²` : ''}</span>
              </div>
            </div>`;

        const divIcon = L.divIcon({
          html: iconHtml,
          className: 'leaflet-ward-badge-marker',
          iconSize: [110, 36],
          iconAnchor: [55, 18],
        });

        return {
          id: zone.id,
          position: [lat, lng] as [number, number],
          icon: divIcon,
          area: zone,
        };
      })
      .filter(Boolean);
  }, [areas, isAuthorMode, officerAreaId, selectedArea.id]);

  // Sovereign Islands GeoJSON style
  const sovereignStyle = (feature: any) => {
    const isAtoll = feature?.properties?.type === 'reef_atoll';
    if (isAtoll) {
      return {
        fillColor: '#38bdf8',
        fillOpacity: 0.5,
        color: '#0284c7',
        weight: 1.6,
        dashArray: '3, 2',
      };
    }
    return {
      fillColor: '#fde68a',
      fillOpacity: 0.95,
      color: '#d97706',
      weight: 2,
    };
  };

  return (
    <div
      className="territorial-canvas-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
      <style>{`
        .leaflet-ward-badge-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
          font-family: inherit;
        }
      `}</style>

      {/* Floating Status & Context Badge */}
      <div className="territorial-mode-badge" style={{ zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 10px #22c55e',
            }}
          />
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>
            {isAdmin ? 'ĐÀ NẴNG • GOOGLE MAPS GIS' : 'ĐỊA BÀN PHÂN CÔNG'}
          </span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
            {isAdmin ? selectedArea.name : activeOfficer?.jurisdictionAreaName || selectedArea.name}
          </span>
        </div>
      </div>

      {/* Admin Map Presets & GIS Action Bar */}
      {isAdmin && (
        <div className="territorial-quick-presets" style={{ zIndex: 1000 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setMapTarget({ center: MAP_PRESETS.DANANG.center, zoom: MAP_PRESETS.DANANG.zoom })}
              title="Toàn cảnh TP Đà Nẵng"
            >
              🌆 Đà Nẵng
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setMapTarget({ center: MAP_PRESETS.URBAN.center, zoom: MAP_PRESETS.URBAN.zoom })}
              title="Khu vực Đô thị Trung tâm"
            >
              🏢 Đô thị
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setMapTarget({ center: MAP_PRESETS.HOANG_SA.center, zoom: MAP_PRESETS.HOANG_SA.zoom })}
              title="Huyện Hoàng Sa (Đà Nẵng)"
            >
              🏝️ Hoàng Sa
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setMapTarget({ center: MAP_PRESETS.TRUONG_SA.center, zoom: MAP_PRESETS.TRUONG_SA.zoom })}
              title="Huyện Trường Sa (Khánh Hòa)"
            >
              ⚓ Trường Sa
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setMapTarget({ center: MAP_PRESETS.BIEN_DONG.center, zoom: MAP_PRESETS.BIEN_DONG.zoom })}
              title="Xem Toàn cảnh Biển Đông Việt Nam"
            >
              🌊 Biển Đông VN
            </button>
          </div>

          <button
            type="button"
            className="map-action-btn"
            onClick={() => {
              alert('GIS Drawing Mode: Click chuột vào bản đồ để xác định đỉnh ranh giới.');
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
              alert('GeoJSON Importer: Định dạng chuẩn RFC 7946 Polygon đã sẵn sàng.');
            }}
            title="Nhập GeoJSON phân chia địa bàn"
          >
            <UploadCloud size={14} />
            {t('territorial.importGeoJson')}
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 700,
              color: '#059669',
              background: '#ecfdf5',
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid #a7f3d0',
            }}
          >
            <Sparkles size={14} color="#059669" />
            <span>Google Maps HD</span>
          </div>
        </div>
      )}

      {/* Map Zoom Controls */}
      <div className="map-zoom-controls" style={{ zIndex: 1000 }}>
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

      {/* Leaflet MapContainer with Google Maps Tiles */}
      <MapContainer
        center={mapTarget.center}
        zoom={mapTarget.zoom}
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
          center={mapTarget.center}
          zoom={mapTarget.zoom}
          onMount={(m) => {
            mapInstanceRef.current = m;
          }}
          onMouseMove={(lat, lng) => setCoords({ lat, lng })}
        />

        {/* 1. Ward & District Boundary Polygons */}
        {wardPolygons.map((w) => (
          <React.Fragment key={w.id}>
            {w.positions.map((pos, pIdx) => (
              <Polygon
                key={`${w.id}-${pIdx}`}
                positions={pos}
                pathOptions={{
                  color: w.borderColor,
                  fillColor: w.fillColor,
                  fillOpacity: w.fillOpacity,
                  weight: w.weight,
                  dashArray: w.dashArray,
                  lineCap: w.lineCap,
                  lineJoin: w.lineJoin,
                }}
                eventHandlers={{
                  click: () => onSelectArea(w.area),
                }}
              >
                {!isAuthorMode && (
                  <Popup>
                    <div style={{ fontFamily: 'inherit', padding: '4px 6px', minWidth: 170 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                        Mã: <strong>{w.code}</strong> {w.area.areaKm2 ? `• ${w.area.areaKm2} km²` : ''}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: w.area.assignedAuthorityId ? '#059669' : '#dc2626', fontWeight: 700 }}>
                        {w.area.assignedAuthorityId ? `🛡️ ${w.area.assignedAuthorityName || 'Đã phân công'}` : '⚠️ Chưa phân công đơn vị'}
                      </div>
                    </div>
                  </Popup>
                )}
              </Polygon>
            ))}
          </React.Fragment>
        ))}

        {/* 2. Sovereign Islands GeoJSON (Admin or Hoang Sa) */}
        {(isAdmin || officerAreaId === 'area-hs') && (
          <GeoJSON
            data={SOVEREIGN_ISLANDS_GEOJSON as any}
            style={sovereignStyle}
            onEachFeature={(feature, layer) => {
              const props = feature.properties;
              if (props) {
                layer.bindPopup(`
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
                `);
              }
            }}
          />
        )}

        {/* 3. Prominent Ward Badges & Centroid Markers */}
        {wardMarkers.map((marker) => marker && (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={marker.icon}
            eventHandlers={{
              click: () => onSelectArea(marker.area),
            }}
          />
        ))}

        {/* 4. Sovereign Islands Markers */}
        {(isAdmin || officerAreaId === 'area-hs') &&
          SOVEREIGN_ISLANDS.map((island) => {
            const islandIcon = L.divIcon({
              html: `
                <div style="
                  background: rgba(185, 28, 28, 0.92);
                  border: 1.5px solid #fbbf24;
                  border-radius: 5px;
                  padding: 3px 7px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  color: #ffffff;
                  white-space: nowrap;
                  font-family: inherit;
                ">
                  <span style="font-size: 12px;">🇻🇳</span>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 10px; font-weight: 800; color: #fef08a;">${island.name}</span>
                    <span style="font-size: 8px; opacity: 0.9;">${island.subname}</span>
                  </div>
                </div>
              `,
              className: 'leaflet-ward-badge-marker',
              iconSize: [140, 32],
              iconAnchor: [70, 16],
            });

            return (
              <Marker
                key={island.id}
                position={[island.coordinates[1], island.coordinates[0]]}
                icon={islandIcon}
              />
            );
          })}
      </MapContainer>

      {/* Bottom Coordinates & Scale HUD */}
      <div className="map-coords-hud" style={{ zIndex: 1000 }}>
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
          WGS84 • Biển Đông Việt Nam • Google Maps HD
        </span>
      </div>
    </div>
  );
};

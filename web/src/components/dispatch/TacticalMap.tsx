import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import type { SosRequest, SosAssignment, AuthorityOfficer, AdministrativeArea } from '../../types/domainD';
import {
  getMapboxToken,
  getMapStyle,
  buildTacticalRouteGeoJSON,
  buildWardsGeoJSON,
  isSosInOfficerJurisdiction,
} from '../../services/mapboxConfig';
import { SOVEREIGN_ISLANDS_GEOJSON } from '../../services/sovereignIslandsGeoJSON';
import { useApp } from '../../context/AppContext';

interface Props {
  selectedSos: SosRequest;
  assignment: SosAssignment | null;
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
  sosRequests?: SosRequest[];
  onSelectSos?: (sos: SosRequest) => void;
}

export const TacticalMap = ({
  selectedSos,
  assignment,
  activeOfficer,
  areas,
  sosRequests,
  onSelectSos,
}: Props) => {
  const { theme, t, mapMode } = useApp();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const sosMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const otherSosMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const rescuerMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const defaultLng = 108.2178;
  const defaultLat = 16.0465;
  const sosLng = selectedSos?.coordinates?.lng ?? defaultLng;
  const sosLat = selectedSos?.coordinates?.lat ?? defaultLat;
  const isAdmin = activeOfficer?.role === 'ADMIN';
  const officerDistrictId = activeOfficer?.jurisdictionAreaId || 'area-hc';

  // Initialize Mapbox tactical map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = getMapboxToken();

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(mapMode, true, theme) as any,
      center: [sosLng, sosLat],
      zoom: 14.5,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      initTacticalLayers(map);
      renderMarkers(map);
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
      if (sosMarkerRef.current) sosMarkerRef.current.remove();
      if (rescuerMarkerRef.current) rescuerMarkerRef.current.remove();
      map.remove();
    };
  }, []);

  const initTacticalLayers = (map: mapboxgl.Map) => {
    // Add tactical route source & layer
    if (!map.getSource('tactical-route')) {
      map.addSource('tactical-route', {
        type: 'geojson',
        data: buildTacticalRouteGeoJSON(selectedSos, assignment),
      });

      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'tactical-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#93c5fd',
          'line-width': 8,
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'tactical-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': 4,
          'line-dasharray': [2, 2],
        },
      });
    }

    // Add sovereign island landmasses & coral atolls (Hoàng Sa & Trường Sa)
    if (!map.getSource('tactical-islands-source')) {
      map.addSource('tactical-islands-source', {
        type: 'geojson',
        data: SOVEREIGN_ISLANDS_GEOJSON,
      });

      const islandVis = (isAdmin || officerDistrictId === 'area-hs') ? 'visible' : 'none';

      map.addLayer({
        id: 'tactical-atolls-fill',
        type: 'fill',
        source: 'tactical-islands-source',
        layout: { visibility: islandVis },
        filter: ['==', ['get', 'type'], 'reef_atoll'],
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': 0.5,
        },
      });

      map.addLayer({
        id: 'tactical-islands-fill',
        type: 'fill',
        source: 'tactical-islands-source',
        layout: { visibility: islandVis },
        filter: ['==', ['get', 'type'], 'island'],
        paint: {
          'fill-color': '#fde68a',
          'fill-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'tactical-islands-border',
        type: 'line',
        source: 'tactical-islands-source',
        layout: { visibility: islandVis },
        filter: ['==', ['get', 'type'], 'island'],
        paint: {
          'line-color': '#d97706',
          'line-width': 2,
        },
      });
    }

    // Add administrative wards source for officer's jurisdiction boundary
    if (areas && areas.length > 0 && !map.getSource('tactical-wards-source')) {
      map.addSource('tactical-wards-source', {
        type: 'geojson',
        data: buildWardsGeoJSON(areas),
      });

      const officerAreaId = activeOfficer?.jurisdictionAreaId || '';

      // 1. Crystal-clear soft warm jurisdiction tint (Google Maps aesthetic, very faint, not dark)
      map.addLayer({
        id: 'tactical-jurisdiction-fill',
        type: 'fill',
        source: 'tactical-wards-source',
        filter: ['==', ['get', 'id'], officerAreaId],
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': theme === 'dark' ? 0.06 : 0.035,
        },
      });

      // 2. Soft subtle halo underneath the dots for high legibility
      map.addLayer({
        id: 'tactical-jurisdiction-halo',
        type: 'line',
        source: 'tactical-wards-source',
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

      // 3. Fine round dotted boundary in soft Google Maps red (not too dark)
      map.addLayer({
        id: 'tactical-jurisdiction-border',
        type: 'line',
        source: 'tactical-wards-source',
        filter: ['==', ['get', 'id'], officerAreaId],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ea4335', // Google Maps soft coral red (vibrant, not dark)
          'line-width': 2.3,
          'line-dasharray': [0.1, 2.2], // Perfect round dots evenly spaced like Google Maps
        },
      });
    }
  };

  // Re-apply style when theme changes (Light <-> Dark)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(getMapStyle(mapMode, true, theme) as any);
    map.once('style.load', () => {
      initTacticalLayers(map);
      renderMarkers(map);
    });
  }, [theme, mapMode]);

  // Update center, route, and markers when selectedSos, assignment, or activeOfficer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Update officer jurisdiction filters
    const officerAreaId = activeOfficer?.jurisdictionAreaId || '';
    if (map.getLayer('tactical-jurisdiction-fill')) {
      map.setFilter('tactical-jurisdiction-fill', ['==', ['get', 'id'], officerAreaId]);
    }
    if (map.getLayer('tactical-jurisdiction-halo')) {
      map.setFilter('tactical-jurisdiction-halo', ['==', ['get', 'id'], officerAreaId]);
    }
    if (map.getLayer('tactical-jurisdiction-border')) {
      map.setFilter('tactical-jurisdiction-border', ['==', ['get', 'id'], officerAreaId]);
    }

    // Fly to new incident
    if (selectedSos?.coordinates?.lng && selectedSos?.coordinates?.lat) {
      map.flyTo({
        center: [sosLng, sosLat],
        zoom: 14.5,
        essential: true,
        duration: 800,
      });
    }

    // Update route source
    const routeSource = map.getSource('tactical-route') as mapboxgl.GeoJSONSource | undefined;
    if (routeSource) {
      routeSource.setData(buildTacticalRouteGeoJSON(selectedSos, assignment));
    }

    renderMarkers(map);
  }, [selectedSos.id, assignment?.id, assignment?.status, activeOfficer?.jurisdictionAreaId, sosRequests]);

  const renderMarkers = (map: mapboxgl.Map) => {
    // 1. Clear old SOS markers
    if (sosMarkerRef.current) {
      sosMarkerRef.current.remove();
      sosMarkerRef.current = null;
    }
    otherSosMarkersRef.current.forEach((m) => m.remove());
    otherSosMarkersRef.current = [];

    const managedArea = (areas || []).find((a) => a.id === activeOfficer?.jurisdictionAreaId) || areas?.[0];

    // Filter scoped SOS requests strictly by jurisdiction (Author sees ONLY their local ward, Admin sees all)
    const scopedSosList = (sosRequests || []).filter((s) => {
      if (isAdmin) return true;
      return isSosInOfficerJurisdiction(s, activeOfficer, managedArea);
    });

    // Render other SOS markers in the district with clickable pills
    scopedSosList.forEach((otherSos) => {
      if (otherSos.id === selectedSos.id) return; // Selected SOS has its own primary beacon below

      const otherEl = document.createElement('div');
      otherEl.className = 'mapbox-other-sos-beacon';
      otherEl.style.cursor = 'pointer';
      otherEl.style.display = 'flex';
      otherEl.style.alignItems = 'center';
      otherEl.style.zIndex = '5';

      otherEl.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(220, 38, 38, 0.92);
          border: 1.5px solid #ffffff;
          border-radius: 12px;
          padding: 2px 7px;
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.5);
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
          transition: transform 0.15s ease;
        ">
          <span style="
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 0 6px #ffffff;
          "></span>
          <span>${otherSos.sosCode}</span>
        </div>
      `;

      otherEl.addEventListener('mouseenter', () => {
        const inner = otherEl.firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = 'scale(1.15)';
      });
      otherEl.addEventListener('mouseleave', () => {
        const inner = otherEl.firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = 'scale(1)';
      });
      otherEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectSos?.(otherSos);
      });

      const marker = new mapboxgl.Marker({ element: otherEl })
        .setLngLat([otherSos.coordinates.lng, otherSos.coordinates.lat])
        .addTo(map);

      otherSosMarkersRef.current.push(marker);
    });

    // 2. Primary Selected SOS Beacon Marker (High-Visibility Pulsating Radar)
    const isSelectedInJurisdiction = isAdmin || isSosInOfficerJurisdiction(selectedSos, activeOfficer, managedArea);

    if (isSelectedInJurisdiction) {
      const sosEl = document.createElement('div');
    sosEl.className = 'mapbox-sos-beacon';
    sosEl.style.width = '42px';
    sosEl.style.height = '42px';
    sosEl.style.display = 'flex';
    sosEl.style.alignItems = 'center';
    sosEl.style.justifyContent = 'center';
    sosEl.style.cursor = 'pointer';
    sosEl.style.zIndex = '15';

    sosEl.innerHTML = `
      <div style="
        position: relative;
        width: 26px;
        height: 26px;
        background: #dc2626;
        border-radius: 50%;
        border: 3.5px solid #ffffff;
        box-shadow: 0 0 20px rgba(220, 38, 38, 0.9), 0 0 40px rgba(220, 38, 38, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse-beacon 1.4s infinite ease-out;
      ">
        <div style="
          width: 9px;
          height: 9px;
          background: #ffffff;
          border-radius: 50%;
        "></div>
      </div>
    `;

    const typeIconMap: Record<string, string> = {
      MEDICAL: '🚑 Y Tế',
      FIRE: '🔥 Cháy',
      POLICE: '🚓 An Ninh',
      RESCUE: '🛟 Cứu Hộ',
    };
    const typeLabel = typeIconMap[selectedSos.emergencyType] || selectedSos.emergencyType;

    // Mapbox Popup for SOS
    const popupHtml = `
      <div style="font-family: inherit; padding: 4px; max-width: 220px;">
        <div style="font-weight: 700; font-size: 13px; color: #dc2626; margin-bottom: 2px;">
          ${selectedSos.sosCode} • ${typeLabel}
        </div>
        <div style="font-size: 11px; color: #1e293b; font-weight: 600;">
          👤 ${selectedSos.citizenName} (${selectedSos.citizenPhone})
        </div>
        <div style="font-size: 11px; color: #b91c1c; font-weight: 700; margin-top: 2px;">
          ⚠️ ${selectedSos.affectedPeople} người gặp nạn [${selectedSos.priority}]
        </div>
        ${
          selectedSos.description
            ? `<div style="font-size: 10px; color: #64748b; margin-top: 4px; line-height: 1.3; font-style: italic;">
                "${selectedSos.description.substring(0, 90)}${selectedSos.description.length > 90 ? '...' : ''}"
               </div>`
            : ''
        }
        ${
          selectedSos.imageUrl
            ? `<div style="margin-top: 6px; border-radius: 4px; overflow: hidden; height: 75px; background: #000;">
                 <img src="${selectedSos.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
               </div>`
            : ''
        }
      </div>
    `;

    const sosPopup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml);

    sosMarkerRef.current = new mapboxgl.Marker({ element: sosEl })
      .setLngLat([sosLng, sosLat])
      .setPopup(sosPopup)
      .addTo(map);

    sosPopup.addTo(map);
    }

    // 3. Rescuer Unit Marker (If assigned)
    if (rescuerMarkerRef.current) {
      rescuerMarkerRef.current.remove();
      rescuerMarkerRef.current = null;
    }

    if (isSelectedInJurisdiction && assignment && assignment.status !== 'CANCELLED') {
      const rescuerLng = assignment.rescuerLocation?.lng ?? (sosLng + 0.009);
      const rescuerLat = assignment.rescuerLocation?.lat ?? (sosLat - 0.007);

      const resEl = document.createElement('div');
      resEl.className = 'mapbox-rescuer-marker';
      resEl.style.display = 'flex';
      resEl.style.flexDirection = 'column';
      resEl.style.alignItems = 'center';
      resEl.style.cursor = 'pointer';

      resEl.innerHTML = `
        <div style="
          width: 28px;
          height: 28px;
          background: #2563eb;
          border-radius: 50%;
          border: 3px solid #ffffff;
          box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 12px;
        ">
          ⚡
        </div>
        <div style="
          margin-top: 3px;
          background: #0f172a;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.25);
          white-space: nowrap;
        ">
          ${assignment.rescueTeamName || 'Rescue Unit'}
        </div>
      `;

      rescuerMarkerRef.current = new mapboxgl.Marker({ element: resEl })
        .setLngLat([rescuerLng, rescuerLat])
        .addTo(map);
    }
  };

  const handleZoom = (delta: number) => {
    if (!mapRef.current) return;
    mapRef.current.zoomTo(mapRef.current.getZoom() + delta, { duration: 300 });
  };

  const handleReset = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [sosLng, sosLat],
      zoom: 14.5,
      duration: 700,
    });
  };

  return (
    <div className="dispatch-center-col">
      {/* Map Zoom Controls */}
      <div className="map-zoom-controls">
        <button
          type="button"
          className="map-zoom-btn"
          onClick={() => handleZoom(0.6)}
          title={t('dispatch.zoomIn')}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="map-zoom-btn"
          onClick={() => handleZoom(-0.6)}
          title={t('dispatch.zoomOut')}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="map-zoom-btn"
          onClick={handleReset}
          title={t('dispatch.recenter')}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Mapbox Container Viewport */}
      <div
        ref={mapContainerRef}
        className="map-canvas-viewport"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      />
    </div>
  );
};

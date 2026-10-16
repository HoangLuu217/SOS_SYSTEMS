import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export const ShelterTypeIcon: React.FC<{
  type: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ type, size = 20, color = 'currentColor', style }) => {
  switch (type) {
    case 'EVACUATION_CENTER':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      );
    case 'HOSPITAL':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 6v12M6 12h12"></path>
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        </svg>
      );
    case 'RESCUE_STATION':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      );
    case 'MEETING_POINT':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
          <line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>
      );
    case 'SHELTER':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      );
  }
};

// Danh mục loại cơ sở an toàn cho form chọn dạng thẻ grid
export const SHELTER_TYPE_CARDS = [
  { key: 'EVACUATION_CENTER', label: 'Trung tâm sơ tán', desc: 'Trường học, nhà văn hóa, trung tâm thi đấu' },
  { key: 'HOSPITAL', label: 'Trạm Y tế Dã chiến', desc: 'Bệnh viện, trung tâm cấp cứu khẩn cấp' },
  { key: 'SHELTER', label: 'Điểm trú kiên cố', desc: 'Trụ sở UBND, nhà cộng đồng cao tầng' },
  { key: 'RESCUE_STATION', label: 'Trạm cứu hộ tác chiến', desc: 'Đồn biên phòng, bến cano vượt lũ' },
  { key: 'MEETING_POINT', label: 'Điểm tập kết an toàn', desc: 'Khu đất cao, bãi đỗ tập trung di tản dân' },
];

// Hàm sinh mã icon ghim điểm an toàn trên Leaflet
export const getShelterMarkerHtml = (type: string) => {
  const configs: Record<string, { bg: string; svg: string }> = {
    EVACUATION_CENTER: {
      bg: '#0284c7',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    },
    HOSPITAL: {
      bg: '#059669',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12M6 12h12"></path></svg>',
    },
    RESCUE_STATION: {
      bg: '#d97706',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
    },
    MEETING_POINT: {
      bg: '#0891b2',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
    },
    SHELTER: {
      bg: '#7c3aed',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    },
  };

  const c = configs[type] || configs.SHELTER;
  return (
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:' + c.bg + ';width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);">' +
        c.svg +
      '</div>' +
      '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
    '</div>'
  );
};

// Component Bản đồ nhỏ (Mini Map) cho điểm trú ẩn an toàn với tương tác chọn tọa độ mượt mà
export const ShelterMiniMap: React.FC<{
  lat: number;
  lng: number;
  name: string;
  type: string;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}> = ({ lat, lng, name, type, interactive, onLocationChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 16.0570;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : 108.2170;

    const map = L.map(containerRef.current, {
      center: [validLat, validLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      wheelDebounceTime: 40,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    const pinHtml = getShelterMarkerHtml(type);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });

    const marker = L.marker([validLat, validLng], {
      icon: customIcon,
      draggable: !!interactive,
    }).addTo(map);

    marker
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
          name || 'Vị trí điểm trú ẩn'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      )
      .openPopup();

    if (interactive) {
      marker.on('dragstart', () => {
        isDraggingRef.current = true;
      });
      marker.on('dragend', (e: any) => {
        isDraggingRef.current = false;
        const pos = e.target.getLatLng();
        onLocationChangeRef.current?.(pos.lat, pos.lng);
        marker
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
              name || 'Vị trí điểm trú ẩn'
            }<br/><span style="color:#64748b;font-weight:normal;">[${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}]</span></div>`
          )
          .openPopup();
      });
      map.on('click', (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        marker.setLatLng([clickLat, clickLng]);
        onLocationChangeRef.current?.(clickLat, clickLng);
        marker
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
              name || 'Vị trí điểm trú ẩn'
            }<br/><span style="color:#64748b;font-weight:normal;">[${clickLat.toFixed(5)}, ${clickLng.toFixed(5)}]</span></div>`
          )
          .openPopup();
      });
    }

    markerRef.current = marker;
    mapRef.current = map;

    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    const t2 = setTimeout(() => {
      map.invalidateSize();
    }, 350);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || isDraggingRef.current) return;
    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 16.0570;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : 108.2170;
    const curr = markerRef.current.getLatLng();
    if (Math.abs(curr.lat - validLat) > 0.00001 || Math.abs(curr.lng - validLng) > 0.00001) {
      markerRef.current.setLatLng([validLat, validLng]);
      mapRef.current.panTo([validLat, validLng], { animate: true, duration: 0.25 });
      markerRef.current.setPopupContent(
        `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">${
          name || 'Vị trí điểm trú ẩn'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      );
    }
  }, [lat, lng, name]);

  useEffect(() => {
    if (!markerRef.current) return;
    const pinHtml = getShelterMarkerHtml(type);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });
    markerRef.current.setIcon(customIcon);
  }, [type]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '260px',
        borderRadius: '10px',
        border: '1px solid #cbd5e1',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
};

/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export const HAZARD_TYPE_OPTIONS = [
  { key: 'FLOOD', label: 'Ngập lụt' },
  { key: 'LANDSLIDE', label: 'Sạt lở đất' },
  { key: 'FALLEN_TREE', label: 'Cây đổ / Cản trở' },
  { key: 'ELECTRICAL', label: 'Sự cố điện' },
  { key: 'ROAD_DAMAGE', label: 'Hư hỏng đường' },
  { key: 'OTHER', label: 'Nguy hiểm khác' },
];

// Component Render Icon Loại nguy hiểm theo đúng thiết kế Ảnh 2
export const HazardTypeIcon: React.FC<{
  type: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ type, size = 20, color = 'currentColor', style }) => {
  switch (type) {
    case 'FLOOD':
      // 1. Ngập lụt: Giọt nước có dấu chấm than ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M12 2.5C12 2.5 5.5 11 5.5 16C5.5 19.866 8.41 23 12 23C15.866 23 19 19.866 19 16C19 11 12 2.5 12 2.5Z"
            fill={color}
          />
          <path
            d="M12 9.5V14.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="18" r="1.2" fill="white" />
        </svg>
      );

    case 'LANDSLIDE':
      // 2. Sạt lở đất: 2 đỉnh núi đá dốc (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M2.5 19.5L10 6.5L14.5 13.5L17.5 9.5L22 19.5H2.5Z"
            fill={color}
          />
          <path
            d="M14.5 13.5L12 19.5"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'FALLEN_TREE':
    case 'OBSTACLE':
      // 3. Cây đổ / Cản trở: Cây xanh tán tròn có thân (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M12 3C9 3 6.8 5.1 6.8 7.8C6.8 8.1 6.85 8.4 6.9 8.7C5.2 9.3 4 10.9 4 12.8C4 15.3 6 17.2 8.5 17.2H10.5V21H13.5V17.2H15.5C18 17.2 20 15.3 20 12.8C20 10.8 18.7 9.2 16.9 8.6C16.9 8.3 17 8.1 17 7.8C17 5.1 14.8 3 12 3Z"
            fill={color}
          />
        </svg>
      );

    case 'ELECTRICAL':
      // 4. Sự cố điện: Tia sét kèm dấu chấm than (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path
            d="M11 2L4 12.5H9L7 21.5L15 9.5H10L12 2H11Z"
            fill={color}
          />
          <path
            d="M18.5 7V13.5"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="18.5" cy="17" r="1.3" fill={color} />
        </svg>
      );

    case 'ROAD_DAMAGE':
    case 'EROSION':
      // 5. Hư hỏng đường: Con đường có 2 lề đường và vạch phân làn ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <path d="M4.5 4H8L6.5 20H3L4.5 4Z" fill={color} />
          <path d="M16 4H19.5L21 20H17.5L16 4Z" fill={color} />
          <path d="M11 4.5H13V8H11V4.5Z" fill={color} />
          <path d="M11 10.5H13V14H11V10.5Z" fill={color} />
          <path d="M11 16.5H13V20H11V16.5Z" fill={color} />
        </svg>
      );

    case 'OTHER':
    default:
      // 6. Nguy hiểm khác: Hình tròn có dấu chấm than ở giữa (Ảnh 2)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={style}
        >
          <circle cx="12" cy="12" r="9.5" fill={color} />
          <path
            d="M12 7.5V13"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.5" r="1.3" fill="white" />
        </svg>
      );
  }
};


export const getHazardMarkerHtml = (type: string) => {
  const configs: Record<string, { bg: string; svg: string }> = {
    FLOOD: {
      bg: '#0284c7',
      // Bootstrap Icons: bi-water
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M.036 12.316a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586zm0-4a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586zm0-4a.5.5 0 0 1 .586-.388c.843.197 1.488.372 2.13.372.636 0 1.282-.175 2.126-.372.846-.198 1.834-.43 3.122-.43s2.276.232 3.122.43c.844.197 1.49.372 2.126.372.642 0 1.287-.175 2.13-.372a.5.5 0 1 1 .23.974c-.947.222-1.684.426-2.36.426-.671 0-1.41-.204-2.355-.426-.848-.198-1.785-.418-2.893-.418s-2.045.22-2.893.418c-.946.222-1.684.426-2.355.426-.676 0-1.413-.204-2.36-.426a.5.5 0 0 1-.388-.586z"/></svg>',
    },
    LANDSLIDE: {
      bg: '#b45309',
      // Bootstrap Icons: bi-cone-striped
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="m9.97 4.88.953 3.811C10.159 8.878 9.14 9 8 9s-2.158-.122-2.923-.309L6.03 4.88C6.635 4.957 7.3 5 8 5s1.365-.043 1.97-.12zm-.241-1.011C9.13 3.93 8.585 4 8 4s-1.13-.07-1.729-.131L7.043 1.01A.5.5 0 0 1 7.53 0h.94a.5.5 0 0 1 .487.61zM5.337 9.992c.767.19 1.706.308 2.663.308s1.896-.118 2.663-.308l.966 3.864c.264.048.533.09.802.126.155.02.269.155.269.311v.207a.5.5 0 0 1-.5.5H3.8a.5.5 0 0 1-.5-.5v-.207c0-.156.114-.29.269-.311.269-.036.538-.078.802-.126z"/></svg>',
    },
    FALLEN_TREE: {
      bg: '#16a34a',
      // Bootstrap Icons: bi-tree-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8.416.223a.5.5 0 0 0-.832 0l-3 4.5A.5.5 0 0 0 5 5.5h.098L3.076 8.735A.5.5 0 0 0 3.5 9.5h.191l-1.638 3.276a.5.5 0 0 0 .447.724H7V16h2v-2.5h4.5a.5.5 0 0 0 .447-.724L12.31 9.5h.191a.5.5 0 0 0 .424-.765L10.902 5.5H11a.5.5 0 0 0 .416-.777z"/></svg>',
    },
    ELECTRICAL: {
      bg: '#ca8a04',
      // Bootstrap Icons: bi-lightning-charge-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>',
    },
    ROAD_DAMAGE: {
      bg: '#ea580c',
      // Bootstrap Icons: bi-sign-stop-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M10.371 1.415a.5.5 0 0 1 .454.292L14.7 9.47a.5.5 0 0 1-.454.71H1.754a.5.5 0 0 1-.454-.71L5.175 1.7a.5.5 0 0 1 .454-.292zM7.002 11a1 1 0 1 0 2 0 1 1 0 0 0-2 0m.93-6.415-1.9 3.8a.5.5 0 0 0 .447.724h3.042a.5.5 0 0 0 .447-.724l-1.9-3.8a.5.5 0 0 0-.894 0"/></svg>',
    },
    OTHER: {
      bg: '#dc2626',
      // Bootstrap Icons: bi-exclamation-triangle-fill
      svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>',
    },
  };

  const c = configs[type] || configs.OTHER;
  return (
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:' + c.bg + ';width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);">' +
        c.svg +
      '</div>' +
      '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
    '</div>'
  );
};

export const EMERGENCY_TYPE_LABELS: Record<string, string> = {
  FLOOD: 'Ngập lụt nước dâng',
  LANDSLIDE: 'Sạt lở đất đá',
  MEDICAL: 'Cấp cứu y tế / Thương tích',
  FIRE: 'Hỏa hoạn / Cháy nổ',
  RESCUE: 'Cứu hộ sông nước / Mắc kẹt',
  STORM: 'Bão lũ thiên tai',
  ACCIDENT: 'Tai nạn sập đổ / Giao thông',
  MISSING_PERSON: 'Tìm kiếm người mất tích',
  POLICE: 'An ninh trật tự',
  OTHER: 'Tình huống khẩn cấp khác',
};

// Component Bản đồ nhỏ (Mini Map) cho điểm nguy hiểm với khả năng tương tác chọn tọa độ
export const HazardMiniMap: React.FC<{
  lat: number;
  lng: number;
  title: string;
  hazardType: string;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}> = ({ lat, lng, title, hazardType, interactive, onLocationChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  // Khởi tạo Leaflet Map 1 lần duy nhất trên container để tránh giật lag khi kéo ghim / bản đồ
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

    const pinHtml = getHazardMarkerHtml(hazardType);
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
          title || 'Vị trí điểm nguy hiểm'
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
              title || 'Vị trí điểm nguy hiểm'
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
              title || 'Vị trí điểm nguy hiểm'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cập nhật vị trí ghim và tâm bản đồ mượt mà khi props lat/lng thay đổi từ bên ngoài (nhập tay tọa độ)
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
          title || 'Vị trí điểm nguy hiểm'
        }<br/><span style="color:#64748b;font-weight:normal;">[${validLat.toFixed(5)}, ${validLng.toFixed(5)}]</span></div>`
      );
    }
  }, [lat, lng, title]);

  // Cập nhật icon ghim khi đổi loại hiểm họa mà không reload bản đồ
  useEffect(() => {
    if (!markerRef.current) return;
    const pinHtml = getHazardMarkerHtml(hazardType);
    const customIcon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: [28, 34],
      iconAnchor: [14, 34],
      popupAnchor: [0, -34],
    });
    markerRef.current.setIcon(customIcon);
  }, [hazardType]);

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

// Component Render Icon Loại cơ sở an toàn / Điểm trú ẩn

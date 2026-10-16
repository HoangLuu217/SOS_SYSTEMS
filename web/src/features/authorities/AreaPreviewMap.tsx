import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { fetchAreaBoundary } from '@/api';
import { domainDService } from '@/services/domainDService';

export function getAreaCoordinates(areaName: string, department?: string): { lat: number; lng: number } {
  const name = (areaName || '').toLowerCase().trim();
  const dept = (department || '').toLowerCase().trim();

  // Hà Nội
  if (name.includes('cầu giấy') || dept.includes('cầu giấy')) return { lat: 21.0313, lng: 105.7925 };
  if (name.includes('ba đình') || dept.includes('ba đình')) return { lat: 21.0341, lng: 105.8235 };
  if (name.includes('hoàn kiếm') || dept.includes('hoàn kiếm')) return { lat: 21.0285, lng: 105.8542 };
  if (name.includes('đống đa') || dept.includes('đống đa')) return { lat: 21.0181, lng: 105.8268 };
  if (name.includes('hai bà trưng') || dept.includes('hai bà trưng')) return { lat: 21.0062, lng: 105.8569 };
  if (name.includes('hoàng mai') || dept.includes('hoàng mai')) return { lat: 20.9754, lng: 105.8617 };
  if (name.includes('thanh xuân') || dept.includes('thanh xuân')) return { lat: 20.9937, lng: 105.8118 };
  if (name.includes('hà đông') || dept.includes('hà đông')) return { lat: 20.9723, lng: 105.7725 };
  if (name.includes('tây hồ') || dept.includes('tây hồ')) return { lat: 21.0708, lng: 105.8211 };
  if (name.includes('long biên') || dept.includes('long biên')) return { lat: 21.0362, lng: 105.8943 };
  if (name.includes('nam từ liêm') || name.includes('bắc từ liêm')) return { lat: 21.0373, lng: 105.7656 };
  if (dept.includes('hà nội') || dept.includes('ha noi')) return { lat: 21.0285, lng: 105.8542 };

  // Đà Nẵng
  if (name.includes('hòa vang') || dept.includes('hòa vang')) return { lat: 15.9868, lng: 108.1154 };
  if (name.includes('hải châu') || dept.includes('hải châu')) return { lat: 16.0504, lng: 108.2208 };
  if (name.includes('hòa cường') || dept.includes('hòa cường')) return { lat: 16.0354, lng: 108.2173 };
  if (name.includes('thanh khê') || dept.includes('thanh khê')) return { lat: 16.0619, lng: 108.1880 };
  if (name.includes('an khê')) return { lat: 16.0601, lng: 108.1812 };
  if (name.includes('sơn trà') || dept.includes('sơn trà')) return { lat: 16.0967, lng: 108.2471 };
  if (name.includes('an hải') || name.includes('thọ quang')) return { lat: 16.0683, lng: 108.2392 };
  if (name.includes('ngũ hành sơn') || dept.includes('ngũ hành sơn')) return { lat: 16.0026, lng: 108.2520 };
  if (name.includes('khuê mỹ') || name.includes('hòa quý')) return { lat: 16.0125, lng: 108.2510 };
  if (name.includes('cẩm lệ') || dept.includes('cẩm lệ')) return { lat: 15.9996, lng: 108.2045 };
  if (name.includes('hòa xuân') || name.includes('khuê trung')) return { lat: 15.9880, lng: 108.2150 };
  if (name.includes('liên chiểu') || dept.includes('liên chiểu')) return { lat: 16.0820, lng: 108.1480 };
  if (name.includes('hòa khánh')) return { lat: 16.0650, lng: 108.1400 };
  if (name.includes('hải vân')) return { lat: 16.1350, lng: 108.1100 };
  if (name.includes('hoàng sa') || dept.includes('hoàng sa')) return { lat: 16.5385, lng: 111.6033 };

  // TP Hồ Chí Minh
  if (name.includes('quận 1') || name.includes('bến nghé') || name.includes('bến thành')) return { lat: 10.7769, lng: 106.7009 };
  if (name.includes('quận 3')) return { lat: 10.7844, lng: 106.6843 };
  if (name.includes('quận 7') || name.includes('tân phong')) return { lat: 10.7340, lng: 106.7218 };
  if (name.includes('thủ đức')) return { lat: 10.8494, lng: 106.7537 };
  if (name.includes('bình thạnh')) return { lat: 10.8106, lng: 106.7091 };
  if (dept.includes('hồ chí minh') || dept.includes('hcm')) return { lat: 10.7769, lng: 106.7009 };

  // Cao Bằng
  if (name.includes('nùng trí cao') || name.includes('cao bằng') || dept.includes('cao bằng')) return { lat: 22.6667, lng: 106.2667 };

  // Hải Phòng
  if (dept.includes('hải phòng')) return { lat: 20.8449, lng: 106.6881 };
  // Cần Thơ
  if (dept.includes('cần thơ')) return { lat: 10.0452, lng: 105.7469 };
  // Huế
  if (dept.includes('huế')) return { lat: 16.4637, lng: 107.5909 };
  // Quảng Ninh
  if (dept.includes('quảng ninh')) return { lat: 20.9500, lng: 107.0833 };

  return { lat: 16.0544, lng: 108.2022 };
}

// Component hiển thị bản đồ địa bàn tác chiến với ranh giới khu đỏ chuẩn GeoJSON
// Component hiển thị bản đồ địa bàn tác chiến với ranh giới khu đỏ chuẩn GeoJSON (Đa giác thực tế, không dùng hình tròn)
export const AreaPreviewMap: React.FC<{
  lat: number;
  lng: number;
  areaName: string;
  areaId?: string;
  department?: string;
}> = ({ lat, lng, areaName, areaId, department }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    let isSubscribed = true;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Centroid marker với icon ghim đỏ tác chiến
    const redPinIcon = L.divIcon({
      className: 'sos-area-red-pin',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          background: #dc2626;
          transform: rotate(-45deg);
          border: 2px solid #ffffff;
          box-shadow: 0 3px 8px rgba(220, 38, 38, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -34],
    });

    const marker = L.marker([lat, lng], { icon: redPinIcon }).addTo(map);
    marker
      .bindPopup(
        `<div style="font-family: inherit; font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.4; padding: 2px 4px;">
          <div style="color: #dc2626; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">
            🛡️ Vùng ranh giới tác chiến
          </div>
          <div>${areaName}</div>
        </div>`
      )
      .openPopup();

    const renderBoundary = (boundary: any) => {
      if (!isSubscribed || !mapRef.current) return;
      try {
        const geoLayer = L.geoJSON(
          {
            type: 'Feature',
            geometry: boundary,
            properties: { name: areaName },
          } as any,
          {
            style: {
              color: '#dc2626', // Viền đỏ đậm tác chiến giống map tổng
              fillColor: '#ef4444', // Vùng đỏ
              fillOpacity: 0.16,
              weight: 2.5,
              dashArray: '4, 4',
            },
          }
        ).addTo(mapRef.current);

        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          marker.setLatLng(bounds.getCenter());
          mapRef.current.fitBounds(bounds, { padding: [32, 32] });
        }
      } catch (err) {
        console.warn('Lỗi vẽ boundary GeoJSON:', err);
      }
    };

    // Tự động tìm và render boundary
    const loadBoundary = async () => {
      // 1. Tìm trong domainDService
      const allAreas = domainDService.getAreas();
      const cleanQuery = (areaName || '')
        .toLowerCase()
        .replace(/^(phường|xã|quận|huyện|thị xã|thị trấn|tp\.|thành phố)\s+/i, '')
        .trim();

      const matchedArea = allAreas.find((a: any) => {
        if (areaId && a.id === areaId) return true;
        const cleanAreaName = (a.name || '')
          .toLowerCase()
          .replace(/^(phường|xã|quận|huyện|thị xã|thị trấn|tp\.|thành phố)\s+/i, '')
          .trim();
        return (
          cleanAreaName === cleanQuery ||
          (cleanQuery && cleanAreaName.includes(cleanQuery)) ||
          (cleanAreaName && cleanQuery.includes(cleanAreaName))
        );
      });

      if (
        matchedArea?.boundary &&
        Array.isArray((matchedArea.boundary as any).coordinates) &&
        (matchedArea.boundary as any).coordinates.length > 0
      ) {
        renderBoundary(matchedArea.boundary);
        return;
      }

      // 2. Nếu chưa có trong local, gọi API backend
      try {
        const res = await fetchAreaBoundary({
          name: areaName,
          areaId,
          province: department,
        });

        if (isSubscribed && res.success && res.data?.boundary?.coordinates) {
          renderBoundary(res.data.boundary);
          return;
        }
      } catch (e) {
        console.warn('Lỗi fetchAreaBoundary:', e);
      }

      // 3. Fallback đa giác tự nhiên (KHÔNG BAO GIỜ DÙNG HÌNH TRÒN L.circle)
      if (isSubscribed && mapRef.current) {
        const angles = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
        const baseR = 0.016; // ~1.8km
        const ring: [number, number][] = angles.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const variation = 0.8 + ((i * 47) % 40) / 100;
          const r = baseR * variation;
          return [lng + r * Math.cos(rad) * 1.05, lat + r * Math.sin(rad)];
        });
        ring.push(ring[0]);
        renderBoundary({
          type: 'Polygon',
          coordinates: [ring],
        });
      }
    };

    loadBoundary();

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, areaName, areaId, department]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '380px', background: '#f1f5f9' }} />;
};


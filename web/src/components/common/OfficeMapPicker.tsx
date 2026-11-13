import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface OfficeMapPickerProps {
  mapUrl: string;
  latitude: number | null;
  longitude: number | null;
  officeAddress: string;
  defaultCenter?: { lat: number; lng: number };
  readOnly?: boolean;
  onChange?: (next: {
    mapUrl: string;
    latitude: number;
    longitude: number;
    officeAddress: string;
  }) => void;
}

/**
 * Trích xuất tọa độ (lat, lng) từ các định dạng link Google Maps phổ biến.
 */
export function parseCoordsFromGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const patterns = [
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
  ];
  for (const regex of patterns) {
    const m = url.match(regex);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export const OfficeMapPicker: React.FC<OfficeMapPickerProps> = ({
  mapUrl,
  latitude,
  longitude,
  officeAddress,
  defaultCenter = { lat: 16.0544, lng: 108.2022 },
  readOnly = false,
  onChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [resolvingAddr, setResolvingAddr] = useState(false);

  const currentLat = latitude !== null && Number.isFinite(latitude) ? latitude : defaultCenter.lat;
  const currentLng = longitude !== null && Number.isFinite(longitude) ? longitude : defaultCenter.lng;

  const effectiveMapUrl = mapUrl?.trim() || buildGoogleMapsUrl(currentLat, currentLng);

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      setResolvingAddr(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          return String(data.display_name);
        }
      }
    } catch {
      // Bỏ qua lỗi mạng khi reverse geocode
    } finally {
      setResolvingAddr(false);
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const handleSelectPoint = async (lat: number, lng: number) => {
    if (readOnly || !onChangeRef.current) return;
    const nextUrl = buildGoogleMapsUrl(lat, lng);
    onChangeRef.current({
      mapUrl: nextUrl,
      latitude: lat,
      longitude: lng,
      officeAddress: officeAddress || 'Đang xác định địa chỉ...',
    });

    const resolvedAddress = await reverseGeocode(lat, lng);
    onChangeRef.current?.({
      mapUrl: nextUrl,
      latitude: lat,
      longitude: lng,
      officeAddress: resolvedAddress,
    });
  };

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [currentLat, currentLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'sos-office-map-pin-icon',
      html: `<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(239,68,68,0.55);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:50%;background:#ffffff;"></div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([currentLat, currentLng], {
      icon: pinIcon,
      draggable: !readOnly,
    }).addTo(map);

    if (!readOnly) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        void handleSelectPoint(pos.lat, pos.lng);
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        void handleSelectPoint(e.latlng.lat, e.latlng.lng);
      });
    }

    mapRef.current = map;
    markerRef.current = marker;

    // Đảm bảo map render đúng kích thước bên trong modal
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng bộ vị trí ghim khi tọa độ thay đổi từ ngoài (vd: mở modal hoặc dán link)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const target = L.latLng(currentLat, currentLng);
    const curr = markerRef.current.getLatLng();
    if (Math.abs(curr.lat - target.lat) > 0.00001 || Math.abs(curr.lng - target.lng) > 0.00001) {
      markerRef.current.setLatLng(target);
      mapRef.current.setView(target, mapRef.current.getZoom(), { animate: true });
    }
  }, [currentLat, currentLng]);

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !onChange) return;
    const val = e.target.value;
    const parsed = parseCoordsFromGoogleMapsUrl(val);
    if (parsed) {
      onChange({
        mapUrl: val,
        latitude: parsed.lat,
        longitude: parsed.lng,
        officeAddress,
      });
      void reverseGeocode(parsed.lat, parsed.lng).then((addr) => {
        onChangeRef.current?.({
          mapUrl: val,
          latitude: parsed.lat,
          longitude: parsed.lng,
          officeAddress: addr,
        });
      });
    } else {
      onChange({
        mapUrl: val,
        latitude: currentLat,
        longitude: currentLng,
        officeAddress,
      });
    }
  };

  return (
    <div className="sos-office-map-section">
      {/* Ô nhập Link Google Maps + Nút Mở Maps (giống hình 2) */}
      <div className="sos-office-map-url-field">
        <label className="sos-profile-sublabel" style={{ fontWeight: 600, color: '#142235', marginBottom: 4, display: 'block' }}>
          Địa chỉ Google Maps / Link dẫn đường (Ủy ban)
        </label>
        <div className="sos-office-map-url-row">
          <input
            type="url"
            value={mapUrl}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={handleUrlInputChange}
            placeholder={readOnly ? 'Chưa cập nhật đường dẫn Google Maps' : 'https://www.google.com/maps?q=16.070975,108.192211'}
            style={readOnly ? { background: '#f8fafc', color: '#475569', cursor: 'default' } : undefined}
          />
          <button
            type="button"
            className="sos-office-open-maps-btn"
            onClick={() => window.open(effectiveMapUrl, '_blank', 'noopener,noreferrer')}
            title="Mở vị trí trên Google Maps"
          >
            <span>Mở Maps</span>
            <i className="bi bi-box-arrow-up-right" />
          </button>
        </div>
      </div>

      {/* Bản đồ tương tác chọn ghim (giống hình 3) */}
      <div className="sos-office-map-card">
        <div ref={mapContainerRef} className="sos-office-map-canvas" />
        <div className="sos-office-map-footer">
          <div className="sos-office-map-address-row">
            <i className="bi bi-geo-alt-fill" style={{ color: '#e11d48', flexShrink: 0 }} />
            <span>
              {resolvingAddr
                ? 'Đang xác định địa chỉ từ tọa độ...'
                : officeAddress || (readOnly ? 'Chưa có địa chỉ trụ sở Ủy ban được ghim' : 'Bấm lên bản đồ để ghim vị trí trụ sở Ủy ban')}
            </span>
          </div>
          <div className="sos-office-map-hint-row">
            <span className="sos-office-map-hint-text">
              <i className={`bi ${readOnly ? 'bi-info-circle-fill' : 'bi-lightbulb-fill'}`} style={{ color: readOnly ? '#0284c7' : '#eab308', marginRight: 4 }} />
              {readOnly
                ? 'Vị trí trụ sở Ủy ban do cán bộ địa phương cập nhật (chỉ xem).'
                : 'Bấm hoặc kéo ghim trên bản đồ để chọn chính xác.'}
            </span>
            <a
              href={effectiveMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sos-office-map-link"
            >
              Xem Google Maps <i className="bi bi-box-arrow-up-right" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};


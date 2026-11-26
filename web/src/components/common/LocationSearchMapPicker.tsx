import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Navigation, ExternalLink, Loader2, X, AlertTriangle } from 'lucide-react';
import {
  parseCoordinatesFromText,
  isShortGoogleMapsUrl,
  resolveGoogleMapsInput,
} from '@/utils/mapLinkParser';
import {
  reverseGeocodeCoords,
  searchGeocodeSuggestions,
  type GeocodeSearchResult,
} from '@/utils/geocode';

export interface LocationSearchMapPickerProps {
  lat: number;
  lng: number;
  markerHtml: string;
  selectedAreaName?: string;
  accentColor?: string;
  headerLabel?: string;
  mapHeight?: number;
  error?: string;
  onLocationSelected: (lat: number, lng: number, detectedAddress?: string) => void;
}

const DEFAULT_LAT = 16.057;
const DEFAULT_LNG = 108.217;

function sanitizeCoord(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildMarkerIcon(markerHtml: string): L.DivIcon {
  return L.divIcon({
    html: markerHtml,
    className: '',
    iconSize: [28, 34],
    iconAnchor: [14, 34],
  });
}

/**
 * Bản đồ chọn tọa độ dùng chung hỗ trợ tìm kiếm địa điểm, link Google Maps (bao gồm link rút gọn),
 * định vị vị trí hiện tại và bấm/kéo ghim trực tiếp.
 */
export const LocationSearchMapPicker: React.FC<LocationSearchMapPickerProps> = ({
  lat,
  lng,
  markerHtml,
  selectedAreaName = 'Thành phố Đà Nẵng',
  accentColor = '#ef4444',
  headerLabel = 'Bản đồ chọn địa điểm & Tìm kiếm tọa độ',
  mapHeight = 250,
  error,
  onLocationSelected,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef(false);
  const lastEmittedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const onLocationSelectedRef = useRef(onLocationSelected);

  useEffect(() => {
    onLocationSelectedRef.current = onLocationSelected;
  }, [onLocationSelected]);

  const initialLat = sanitizeCoord(lat, DEFAULT_LAT);
  const initialLng = sanitizeCoord(lng, DEFAULT_LNG);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [reverseAddress, setReverseAddress] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<{ type: 'success' | 'warn'; text: string } | null>(
    null
  );

  const updateLocation = useCallback(
    async (newLat: number, newLng: number, fly = false, addressHint?: string) => {
      const fixedLat = parseFloat(newLat.toFixed(6));
      const fixedLng = parseFloat(newLng.toFixed(6));

      lastEmittedCoordsRef.current = { lat: fixedLat, lng: fixedLng };
      setCurrentCoords({ lat: fixedLat, lng: fixedLng });

      if (markerRef.current) {
        markerRef.current.setLatLng([fixedLat, fixedLng]);
      }
      if (fly && mapRef.current) {
        mapRef.current.flyTo([fixedLat, fixedLng], 17, { animate: true, duration: 0.7 });
      }

      let resolvedAddr = addressHint || '';
      if (!resolvedAddr) {
        resolvedAddr = await reverseGeocodeCoords(fixedLat, fixedLng);
      }
      if (resolvedAddr) {
        setReverseAddress(resolvedAddr);
      }

      onLocationSelectedRef.current(fixedLat, fixedLng, resolvedAddr || undefined);
    },
    []
  );

  // Khởi tạo Leaflet Map 1 lần duy nhất
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
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

    const marker = L.marker([initialLat, initialLng], {
      icon: buildMarkerIcon(markerHtml),
      draggable: true,
    }).addTo(map);

    marker.on('dragstart', () => {
      isDraggingRef.current = true;
    });
    marker.on('dragend', (e: any) => {
      isDraggingRef.current = false;
      const pos = e.target.getLatLng();
      void updateLocation(pos.lat, pos.lng, false);
    });
    map.on('click', (e: any) => {
      const pos = e.latlng;
      void updateLocation(pos.lat, pos.lng, false);
    });

    mapRef.current = map;
    markerRef.current = marker;

    const t1 = setTimeout(() => map.invalidateSize(), 120);
    const t2 = setTimeout(() => map.invalidateSize(), 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng bộ khi tọa độ từ bên ngoài thay đổi (mở item mới để sửa hoặc reset form)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || isDraggingRef.current) return;
    const nextLat = sanitizeCoord(lat, DEFAULT_LAT);
    const nextLng = sanitizeCoord(lng, DEFAULT_LNG);

    if (
      lastEmittedCoordsRef.current &&
      Math.abs(lastEmittedCoordsRef.current.lat - nextLat) <= 0.00002 &&
      Math.abs(lastEmittedCoordsRef.current.lng - nextLng) <= 0.00002
    ) {
      return;
    }

    const curr = markerRef.current.getLatLng();
    if (Math.abs(curr.lat - nextLat) > 0.00002 || Math.abs(curr.lng - nextLng) > 0.00002) {
      markerRef.current.setLatLng([nextLat, nextLng]);
      mapRef.current.panTo([nextLat, nextLng], { animate: true, duration: 0.35 });
      setCurrentCoords({ lat: nextLat, lng: nextLng });
    }
  }, [lat, lng]);

  // Cập nhật icon ghim khi đổi loại điểm nguy hiểm / điểm trú ẩn mà không reload map
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setIcon(buildMarkerIcon(markerHtml));
  }, [markerHtml]);

  const handleSelectSearchResult = (item: GeocodeSearchResult) => {
    const parsedLat = parseFloat(item.lat);
    const parsedLng = parseFloat(item.lon);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      void updateLocation(parsedLat, parsedLng, true, item.display_name);
      setSearchResults([]);
      setSearchQuery('');
      setSearchFeedback(null);
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
    const q = (typeof overrideQuery === 'string' ? overrideQuery : searchQuery).trim();
    if (!q) return;

    setSearchFeedback(null);
    setSearchResults([]);

    // 1. Nhận diện tọa độ thô / link Google Maps đầy đủ tức thì trên máy khách
    const directCoords = parseCoordinatesFromText(q);
    if (directCoords && !isShortGoogleMapsUrl(q)) {
      void updateLocation(directCoords.lat, directCoords.lng, true, directCoords.placeName);
      setSearchQuery('');
      setSearchFeedback({
        type: 'success',
        text: `Đã nhận diện tọa độ: ${directCoords.lat.toFixed(5)}, ${directCoords.lng.toFixed(5)}`,
      });
      setTimeout(() => setSearchFeedback(null), 4000);
      return;
    }

    setIsSearching(true);
    try {
      // 2. Nếu là link rút gọn Google Maps hoặc URL bản đồ -> giải mã qua backend
      const looksLikeUrl =
        isShortGoogleMapsUrl(q) ||
        /^https?:\/\//i.test(q) ||
        q.toLowerCase().includes('google.') ||
        q.toLowerCase().includes('goo.gl');

      if (looksLikeUrl) {
        const resolved = await resolveGoogleMapsInput(q);
        void updateLocation(resolved.lat, resolved.lng, true, resolved.placeName);
        setSearchQuery('');
        setSearchFeedback({
          type: 'success',
          text: `Đã nhận diện tọa độ từ liên kết: ${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`,
        });
        setTimeout(() => setSearchFeedback(null), 4000);
        return;
      }

      // 3. Tìm kiếm theo tên địa chỉ / địa điểm
      const list = await searchGeocodeSuggestions(q, {
        areaBias: selectedAreaName,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
      });
      setSearchResults(list);
      if (list.length === 0) {
        setSearchFeedback({
          type: 'warn',
          text: 'Không tìm thấy địa điểm phù hợp. Hãy thử bấm chọn trực tiếp trên bản đồ hoặc dán link Google Maps.',
        });
      } else if (list.length === 1) {
        handleSelectSearchResult(list[0]);
      }
    } catch (err: any) {
      setSearchFeedback({
        type: 'warn',
        text: err?.message || 'Không thể tìm kiếm địa điểm. Vui lòng bấm hoặc kéo ghim trên bản đồ.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLocateCurrent = () => {
    if (!navigator.geolocation) {
      setSearchFeedback({ type: 'warn', text: 'Trình duyệt không hỗ trợ định vị GPS.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void updateLocation(pos.coords.latitude, pos.coords.longitude, true);
      },
      (err) => {
        setSearchFeedback({
          type: 'warn',
          text: `Không thể lấy vị trí hiện tại: ${err.message}`,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Tiêu đề & Nút định vị */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--dm-text-strong)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <MapPin size={16} color={accentColor} />
          <span>{headerLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleLocateCurrent}
          style={{
            background: 'var(--dm-surface-muted)',
            border: '1px solid var(--dm-border-strong)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--dm-text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
          title="Định vị vị trí hiện tại của bạn qua GPS"
        >
          <Navigation size={12} color="#2563eb" />
          <span>Vị trí của tôi</span>
        </button>
      </div>

      {/* Thanh tìm kiếm địa chỉ / link Google Maps / tọa độ */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--dm-surface-subtle)',
              border: '1px solid var(--dm-border-strong)',
              borderRadius: 8,
              padding: '6px 10px',
            }}
          >
            <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPaste={(e) => {
                const pastedText = e.clipboardData.getData('text').trim();
                if (
                  pastedText &&
                  (isShortGoogleMapsUrl(pastedText) ||
                    pastedText.toLowerCase().includes('google') ||
                    pastedText.startsWith('http') ||
                    Boolean(parseCoordinatesFromText(pastedText)))
                ) {
                  setTimeout(() => void handleSearch(pastedText), 40);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSearch();
                }
              }}
              placeholder="Nhập địa chỉ, địa điểm hoặc dán link Google Maps / tọa độ..."
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 12.5,
                color: 'var(--dm-text-strong)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchFeedback(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  color: 'var(--dm-text-muted)',
                }}
                title="Xóa tìm kiếm"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSearch();
            }}
            disabled={isSearching || !searchQuery.trim()}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isSearching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
              opacity: isSearching || !searchQuery.trim() ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            <span>Tìm</span>
          </button>
        </div>

        {searchFeedback && (
          <div
            style={{
              fontSize: 11.5,
              color: searchFeedback.type === 'success' ? 'var(--dm-green-text)' : 'var(--dm-amber-text)',
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            {searchFeedback.text}
          </div>
        )}

        {/* Dropdown kết quả tìm kiếm */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: 'var(--dm-surface)',
              borderRadius: 8,
              border: '1px solid var(--dm-border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              zIndex: 9999,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {searchResults.map((item) => (
              <div
                key={item.place_id}
                onClick={() => handleSelectSearchResult(item)}
                style={{
                  padding: '9px 12px',
                  fontSize: 12,
                  borderBottom: '1px solid var(--dm-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  color: 'var(--dm-text-strong)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              >
                <MapPin size={14} color={accentColor} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ lineHeight: 1.35 }}>{item.display_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Khung bản đồ Leaflet */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: mapHeight,
          borderRadius: 10,
          border: error ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
          overflow: 'hidden',
          background: 'var(--dm-surface-muted)',
        }}
      />

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--dm-red-text)',
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Tóm tắt tọa độ đã chọn */}
      <div
        style={{
          background: 'var(--dm-surface-subtle)',
          border: '1px solid var(--dm-border)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--dm-text-muted)', fontWeight: 600 }}>Tọa độ chọn:</span>
          <span style={{ color: 'var(--dm-text-strong)', fontWeight: 700 }}>
            {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
          </span>
        </div>

        {reverseAddress && (
          <div style={{ color: 'var(--dm-text-secondary)', fontSize: 11.5, lineHeight: 1.35 }}>
            📍 <span style={{ fontWeight: 500 }}>{reverseAddress}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--dm-text-muted)' }}>
            💡 Bấm hoặc kéo ghim trên bản đồ để chọn chính xác.
          </span>
          <a
            href={`https://www.google.com/maps?q=${currentCoords.lat.toFixed(6)},${currentCoords.lng.toFixed(6)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 11.5,
              color: 'var(--dm-blue-text)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <span>Xem Google Maps</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};


import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Navigation, ExternalLink, Loader2, X } from 'lucide-react';
import { getAreaCoordinates } from '@/features/authorities/AreaPreviewMap';

export interface BloodEventMapPickerProps {
  mapUrl?: string;
  onLocationSelected: (lat: number, lng: number, googleMapsUrl: string, address?: string) => void;
  selectedProvinceName?: string;
}

interface SearchResultItem {
  place_id: number | string;
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * Trích xuất tọa độ từ chuỗi: hỗ trợ tọa độ thô, link Google Maps các định dạng (?q=, /@lat,lng, place/...)
 */
export function parseGoogleMapsUrlOrCoords(input: string): { lat: number; lng: number } | null {
  if (!input || !input.trim()) return null;
  const str = input.trim();

  // 1. Tọa độ thuần: "16.0544, 108.2022" hoặc "16.0544,108.2022" hoặc "16.0544 108.2022"
  const rawCoordMatch = str.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (rawCoordMatch) {
    const lat = parseFloat(rawCoordMatch[1]);
    const lng = parseFloat(rawCoordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2. Query param ?q=lat,lng hoặc &q=lat,lng hoặc ?query= hoặc ?ll=
  const qMatch = str.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+)[,%20]+(-?\d{1,3}\.\d+)/i);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 3. Đường dẫn dạng /@lat,lng,zoom hoặc /place/.../@lat,lng
  const atMatch = str.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 4. Tìm kiếm chuỗi tọa độ bất kỳ trong link (ví dụ destination=lat,lng hoặc center=lat,lng)
  const generalMatch = str.match(/(-?\d{1,2}\.\d{3,})[,%20]+(-?\d{1,3}\.\d{3,})/);
  if (generalMatch) {
    const lat = parseFloat(generalMatch[1]);
    const lng = parseFloat(generalMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export const BloodEventMapPicker: React.FC<BloodEventMapPickerProps> = ({
  mapUrl,
  onLocationSelected,
  selectedProvinceName,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reverseAddress, setReverseAddress] = useState<string>('');
  const [searchFeedback, setSearchFeedback] = useState<string>('');

  // Tra cứu địa chỉ ngược từ tọa độ (Reverse Geocode qua backend proxy để tránh lỗi 403)
  const doReverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/blood-donations/geocode/reverse?lat=${lat}&lng=${lng}`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            setReverseAddress(json.data);
            return json.data;
          }
        }
      } catch {
        // Fallback Photon reverse nếu backend gặp sự cố
        try {
          const fbRes = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            if (fbData.features && fbData.features[0]) {
              const p = fbData.features[0].properties || {};
              const addr = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
              if (addr) {
                setReverseAddress(addr);
                return addr;
              }
            }
          }
        } catch {
          // ignore
        }
      }
      return '';
    },
    []
  );

  // Cập nhật vị trí ghim và đồng bộ ra ngoài
  const updateLocation = useCallback(
    async (lat: number, lng: number, fly = false, addressHint?: string) => {
      const fixedLat = parseFloat(lat.toFixed(6));
      const fixedLng = parseFloat(lng.toFixed(6));
      setCurrentCoords({ lat: fixedLat, lng: fixedLng });
      const googleMapsUrl = `https://www.google.com/maps?q=${fixedLat},${fixedLng}`;

      if (markerRef.current) {
        markerRef.current.setLatLng([fixedLat, fixedLng]);
        markerRef.current
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">
              📍 Vị trí đợt hiến máu<br/>
              <span style="color:#64748b;font-weight:normal;">[${fixedLat.toFixed(6)}, ${fixedLng.toFixed(6)}]</span><br/>
              <span style="color:#2563eb;font-weight:500;font-size:11px;">(Kéo thả ghim hoặc bấm bản đồ để chỉnh)</span>
            </div>`
          )
          .openPopup();
      }

      if (fly && mapRef.current) {
        mapRef.current.flyTo([fixedLat, fixedLng], 17, { animate: true, duration: 0.8 });
      }

      let detectedAddr = addressHint;
      if (!detectedAddr) {
        detectedAddr = await doReverseGeocode(fixedLat, fixedLng);
      } else {
        setReverseAddress(detectedAddr);
      }

      onLocationSelected(fixedLat, fixedLng, googleMapsUrl, detectedAddr);
    },
    [doReverseGeocode, onLocationSelected]
  );

  // Khởi tạo Leaflet Map 1 lần khi mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const urlCoords = parseGoogleMapsUrlOrCoords(mapUrl || '');
    const initialPos =
      urlCoords ||
      (selectedProvinceName
        ? getAreaCoordinates(selectedProvinceName)
        : { lat: 16.0544, lng: 108.2022 });

    const map = L.map(containerRef.current, {
      center: [initialPos.lat, initialPos.lng],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    const customIcon = L.divIcon({
      html: `
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #ef4444;
          border: 2.5px solid #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: grab;
        " title="Kéo thả ghim để chọn vị trí chính xác">
          🩸
        </div>
      `,
      className: '',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -34],
    });

    const marker = L.marker([initialPos.lat, initialPos.lng], {
      icon: customIcon,
      draggable: true,
    }).addTo(map);

    marker
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">
          📍 Vị trí đợt hiến máu<br/>
          <span style="color:#64748b;font-weight:normal;">[${initialPos.lat.toFixed(6)}, ${initialPos.lng.toFixed(6)}]</span><br/>
          <span style="color:#2563eb;font-weight:500;font-size:11px;">(Kéo thả ghim hoặc bấm bản đồ để chỉnh)</span>
        </div>`
      )
      .openPopup();

    mapRef.current = map;
    markerRef.current = marker;
    setCurrentCoords(initialPos);

    // Kéo thả ghim để chọn vị trí
    marker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      void updateLocation(pos.lat, pos.lng, false);
    });

    // Bấm trực tiếp lên bản đồ để chọn vị trí
    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      void updateLocation(lat, lng, false);
    });

    // Sửa lỗi hiển thị mảnh bản đồ trong modal
    const timer1 = setTimeout(() => map.invalidateSize(), 150);
    const timer2 = setTimeout(() => map.invalidateSize(), 450);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // Mount 1 lần

  // ĐỒNG BỘ: Khi người dùng dán hoặc nhập link Google Maps vào ô input bên trái, tự động bay và di chuyển ghim
  useEffect(() => {
    if (!mapUrl || !mapRef.current) return;
    const coords = parseGoogleMapsUrlOrCoords(mapUrl);
    if (!coords) return;

    if (
      !currentCoords ||
      Math.abs(currentCoords.lat - coords.lat) > 0.00001 ||
      Math.abs(currentCoords.lng - coords.lng) > 0.00001
    ) {
      setCurrentCoords(coords);
      if (markerRef.current) {
        markerRef.current.setLatLng([coords.lat, coords.lng]);
        markerRef.current
          .setPopupContent(
            `<div style="font-family:sans-serif;font-size:12px;font-weight:600;color:#0f172a;line-height:1.4;">
              📍 Vị trí từ Google Maps<br/>
              <span style="color:#64748b;font-weight:normal;">[${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]</span>
            </div>`
          )
          .openPopup();
      }
      mapRef.current.flyTo([coords.lat, coords.lng], 17, { animate: true, duration: 0.8 });
      void doReverseGeocode(coords.lat, coords.lng);
    }
  }, [mapUrl, currentCoords, doReverseGeocode]);

  // Khi chọn Tỉnh/Thành phố mới trên form, tự động pan bản đồ về tỉnh đó
  useEffect(() => {
    if (!selectedProvinceName || !mapRef.current) return;
    const coords = getAreaCoordinates(selectedProvinceName);
    if (coords && mapRef.current) {
      mapRef.current.flyTo([coords.lat, coords.lng], 13, { duration: 0.8 });
    }
  }, [selectedProvinceName]);

  // Tìm kiếm địa điểm hoặc giải mã link Google Maps / tọa độ
  const handleSearchAddress = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const q = searchQuery.trim();
    if (!q) return;

    setSearchFeedback('');

    // 1. Nếu người dùng dán link Google Maps hoặc chuỗi tọa độ vào ô tìm kiếm:
    const linkCoords = parseGoogleMapsUrlOrCoords(q);
    if (linkCoords) {
      void updateLocation(linkCoords.lat, linkCoords.lng, true);
      setSearchQuery('');
      setSearchResults([]);
      setSearchFeedback('Đã nhận diện tọa độ từ link Google Maps!');
      setTimeout(() => setSearchFeedback(''), 4000);
      return;
    }

    // 2. Tìm kiếm tên địa chỉ qua backend proxy (tránh hoàn toàn lỗi CORS / 403 Forbidden)
    setIsSearching(true);
    setSearchResults([]);
    try {
      const fullQuery = selectedProvinceName ? `${q}, ${selectedProvinceName}` : q;
      const res = await fetch(`/api/blood-donations/geocode/search?q=${encodeURIComponent(fullQuery)}`);
      let list: SearchResultItem[] = [];

      if (res.ok) {
        const json = await res.json();
        list = Array.isArray(json?.data) ? json.data : [];
      }

      // 3. Fallback: Nếu tìm kèm tỉnh không ra, thử tìm trực tiếp tên địa điểm
      if (list.length === 0 && selectedProvinceName) {
        const fbRes = await fetch(`/api/blood-donations/geocode/search?q=${encodeURIComponent(q)}`);
        if (fbRes.ok) {
          const fbJson = await fbRes.json();
          list = Array.isArray(fbJson?.data) ? fbJson.data : [];
        }
      }

      // 4. Fallback trực tiếp Photon API nếu backend gặp sự cố
      if (list.length === 0) {
        try {
          const photonRes = await fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`
          );
          if (photonRes.ok) {
            const photonData = await photonRes.json();
            if (photonData.features && photonData.features.length > 0) {
              list = photonData.features.map((f: any) => {
                const props = f.properties || {};
                const parts = [
                  props.name,
                  props.street,
                  props.city,
                  props.state,
                  props.country,
                ].filter(Boolean);
                return {
                  place_id: f.properties.osm_id || Math.random(),
                  display_name: parts.join(', ') || props.name,
                  lat: String(f.geometry.coordinates[1]),
                  lon: String(f.geometry.coordinates[0]),
                };
              });
            }
          }
        } catch {
          // ignore
        }
      }

      setSearchResults(list);
      if (list.length === 0) {
        setSearchFeedback('Không tìm thấy địa điểm phù hợp. Bạn có thể bấm chọn trực tiếp trên bản đồ hoặc dán link Google Maps.');
      } else if (list.length === 1) {
        // Tự động chọn luôn nếu chỉ có 1 kết quả chính xác
        handleSelectSearchResult(list[0]);
      }
    } catch (err) {
      console.warn('Lỗi tìm kiếm địa chỉ:', err);
      setSearchFeedback('Lỗi tìm kiếm. Bạn có thể bấm chọn trực tiếp trên bản đồ.');
    } finally {
      setIsSearching(false);
    }
  };

  // Chọn 1 kết quả từ danh sách tìm kiếm
  const handleSelectSearchResult = (item: SearchResultItem) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      void updateLocation(lat, lng, true, item.display_name);
      setSearchResults([]);
      setSearchQuery('');
      setSearchFeedback('');
    }
  };

  // Định vị vị trí hiện tại của thiết bị
  const handleLocateCurrent = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        void updateLocation(latitude, longitude, true);
      },
      (err) => {
        alert('Không thể lấy vị trí hiện tại: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Tiêu đề mục bên phải & Nút định vị */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={16} color="#ef4444" />
          <span>Bản đồ chọn địa điểm & Tìm kiếm tọa độ</span>
        </div>
        <button
          type="button"
          onClick={handleLocateCurrent}
          style={{
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11.5,
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Định vị vị trí hiện tại của bạn qua GPS"
        >
          <Navigation size={12} color="#2563eb" />
          <span>Vị trí của tôi</span>
        </button>
      </div>

      {/* Thanh tìm kiếm địa chỉ hoặc dán link Google Maps */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '6px 10px',
            }}
          >
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSearchAddress(e);
                }
              }}
              placeholder="Nhập địa chỉ, bệnh viện hoặc dán link Google Maps / tọa độ..."
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 12.5,
                color: '#0f172a',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchFeedback('');
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  color: '#94a3b8',
                }}
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
              void handleSearchAddress(e);
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

        {/* Thông báo kết quả tìm kiếm */}
        {searchFeedback && (
          <div
            style={{
              fontSize: 11.5,
              color: searchFeedback.includes('Đã nhận diện') ? '#16a34a' : '#d97706',
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            {searchFeedback}
          </div>
        )}

        {/* Danh sách gợi ý kết quả tìm kiếm */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: '#ffffff',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
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
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  color: '#0f172a',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              >
                <MapPin size={14} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
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
          height: 310,
          borderRadius: 10,
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          background: '#f1f5f9',
        }}
      />

      {/* Thông tin vị trí đã chọn & Link Google Maps */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b', fontWeight: 600 }}>Tọa độ chọn:</span>
          {currentCoords ? (
            <span style={{ color: '#0f172a', fontWeight: 700 }}>
              {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
            </span>
          ) : (
            <span style={{ color: '#94a3b8' }}>Chưa chọn</span>
          )}
        </div>

        {reverseAddress && (
          <div style={{ color: '#475569', fontSize: 11.5, lineHeight: 1.35 }}>
            📍 <span style={{ fontWeight: 500 }}>{reverseAddress}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            💡 Bấm hoặc kéo ghim trên bản đồ để chọn chính xác.
          </span>
          {currentCoords && (
            <a
              href={`https://www.google.com/maps?q=${currentCoords.lat.toFixed(6)},${currentCoords.lng.toFixed(6)}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11.5,
                color: '#2563eb',
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
          )}
        </div>
      </div>
    </div>
  );
};

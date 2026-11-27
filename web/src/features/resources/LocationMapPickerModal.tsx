import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, X, Trash2, Check, Shield, Loader2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { VehicleTerrainCapability } from '@/types/dashboard';
import { getAreaCoordinates } from '@/features/authorities/AreaPreviewMap';
import {
  reverseGeocodeCoords,
  searchGeocodeSuggestions,
  type GeocodeSearchResult,
} from '@/utils/geocode';
import {
  normalizeViText,
  isValidSafeLocationItem,
  getSafeLocationIcon,
  VEHICLE_TERRAIN_OPTIONS,
  VEHICLE_TYPE_GROUPS,
  STANDARD_VEHICLE_TYPES,
} from './resourcesConstants';

const MAX_DESTINATION_LENGTH = 140;

function formatGeocodeOption(place: GeocodeSearchResult): {
  primaryName: string;
  secondaryText: string;
  selectedLabel: string;
} {
  const parts = place.display_name.split(',').map((s) => s.trim()).filter(Boolean);
  const primaryName = place.title?.trim() || parts[0] || place.display_name;
  const secondaryText =
    place.address && place.address.trim() !== primaryName
      ? place.address.trim()
      : place.display_name;
  const baseLabel = place.display_name.replace(/,\s*Việt Nam$/i, '').trim() || place.display_name;
  return {
    primaryName,
    secondaryText,
    selectedLabel: baseLabel.slice(0, MAX_DESTINATION_LENGTH),
  };
}

export const VehicleTerrainSelector: React.FC<{
  value: VehicleTerrainCapability[];
  onChange: (next: VehicleTerrainCapability[]) => void;
}> = ({ value, onChange }) => (
  <div className="executive-modal-field">
    <label className="executive-modal-label">Địa hình phương tiện đã được xác nhận</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', padding: '8px 10px', border: '1px solid var(--dm-border-strong)', borderRadius: 7 }}>
      {VEHICLE_TERRAIN_OPTIONS.map((option) => (
        <label key={option.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--dm-text-secondary)' }}>
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={(event) => onChange(
              event.target.checked
                ? [...new Set([...value, option.value])]
                : value.filter((item) => item !== option.value)
            )}
          />
          {option.label}
        </label>
      ))}
    </div>
    <span style={{ color: 'var(--dm-text-muted)', fontSize: 11 }}>Chỉ chọn năng lực đã được xác minh. Để trống nếu chưa rõ.</span>
  </div>
);

export const VehicleTypeSelectOptions: React.FC = () => (
  <>
    {VEHICLE_TYPE_GROUPS.map(({ group, label }) => (
      <optgroup key={group} label={label}>
        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === group).map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </optgroup>
    ))}
  </>
);

/** Modal ghim vị trí trên bản đồ Leaflet (Google Maps Tiles). */
export const LocationMapPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialCoords?: [number, number] | null; // [lng, lat]
  areaName?: string;
  onConfirm: (coords: [number, number] | null, address?: string) => void;
}> = ({ isOpen, onClose, initialCoords, areaName, onConfirm }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(initialCoords || null);
  const [addressPreview, setAddressPreview] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    let activeReverseReqId = 0;
    setPicked(initialCoords || null);
    setAddressPreview('');
    setIsGeocoding(false);

    const timer = setTimeout(() => {
      if (!containerRef.current || disposed) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const defaultCenter = initialCoords
        ? [initialCoords[1], initialCoords[0]]
        : [getAreaCoordinates(areaName || 'Đà Nẵng').lat, getAreaCoordinates(areaName || 'Đà Nẵng').lng];

      const map = L.map(containerRef.current, {
        center: defaultCenter as [number, number],
        zoom: initialCoords ? 15 : 13,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      const redPinIcon = L.divIcon({
        className: 'sos-picker-red-pin',
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
      });

      if (initialCoords) {
        markerRef.current = L.marker([initialCoords[1], initialCoords[0]], { icon: redPinIcon }).addTo(map);
      }

      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setPicked([lng, lat]);

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: redPinIcon }).addTo(map);
        }

        const reqId = ++activeReverseReqId;
        setAddressPreview('');
        setIsGeocoding(true);
        try {
          const addr = await reverseGeocodeCoords(lat, lng);
          if (!disposed && activeReverseReqId === reqId && addr) {
            setAddressPreview(addr);
          }
        } catch {
          // Reverse geocoding failure should not block coordinate pinning
        } finally {
          if (!disposed && activeReverseReqId === reqId) {
            setIsGeocoding(false);
          }
        }
      });
    }, 120);

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, initialCoords, areaName]);

  if (!isOpen) return null;

  return (
    <div className="executive-modal-backdrop" onClick={onClose} style={{ zIndex: 10050 }}>
      <div
        className="executive-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: '92vw', padding: 0, overflow: 'hidden' }}
      >
        <div className="executive-modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--dm-border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--dm-text-strong)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color="#0284c7" />
              <span>Ghim vị trí điểm tiếp tế / vùng ngập lụt</span>
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--dm-text-muted)' }}>
              Click chuột trực tiếp lên bản đồ để đánh dấu tọa độ GPS chính xác cho Đội cứu hộ
            </p>
          </div>
          <button type="button" onClick={onClose} className="executive-modal-close">
            <X size={18} />
          </button>
        </div>

        <div style={{ height: 380, width: '100%', position: 'relative' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {!picked && (
            <div style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 500,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}>
              👆 Click lên bản đồ để ghim điểm cứu trợ
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', background: 'var(--dm-surface-subtle)', borderTop: '1px solid var(--dm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {picked ? (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--dm-text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--dm-green-text)' }}>●</span>
                  <span>Tọa độ GPS: [{picked[1].toFixed(5)}, {picked[0].toFixed(5)}]</span>
                </div>
                {(isGeocoding || addressPreview) && (
                  <div style={{ fontSize: 11.5, color: 'var(--dm-text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isGeocoding ? 'Đang tìm tên địa điểm...' : addressPreview}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dm-text-muted)' }}>
                Chưa có điểm nào được ghim trên bản đồ
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {picked && (
              <button
                type="button"
                onClick={() => {
                  onConfirm(null, '');
                  onClose();
                }}
                className="executive-btn-secondary"
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  borderRadius: 8,
                  color: 'var(--dm-red-text)',
                  borderColor: 'var(--dm-red-border)',
                  background: 'var(--dm-red-bg)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
                title="Bỏ ghim tọa độ này"
              >
                <Trash2 size={13} />
                <span>Bỏ ghim</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="executive-btn-secondary"
              style={{ padding: '7px 14px', fontSize: 12.5, borderRadius: 8 }}
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={() => {
                if (picked) {
                  onConfirm(picked, addressPreview);
                  onClose();
                }
              }}
              className="executive-btn-primary"
              style={{
                padding: '7px 16px',
                fontSize: 12.5,
                borderRadius: 8,
                background: picked ? '#0284c7' : '#94a3b8',
                cursor: picked ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Check size={15} />
              <span>Xác nhận vị trí này</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DestinationAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (label: string, coords: [number, number] | null) => void;
  safeLocations: any[];
  preferredSafeLocations: any[];
  placeholder?: string;
  required?: boolean;
  inputHeight?: number;
  openSafeTrigger?: number;
  coordinates?: [number, number] | null;
  areaBias?: string;
  biasCenterName?: string;
  onOpenMapPicker?: () => void;
}

export const DestinationAutocompleteInput: React.FC<DestinationAutocompleteInputProps> = ({
  value,
  onChange,
  onSelectPlace,
  safeLocations,
  preferredSafeLocations,
  placeholder = 'VD: Trường THCS Nguyễn Du, Thôn An Trạch...',
  required = true,
  inputHeight = 38,
  openSafeTrigger = 0,
  coordinates = null,
  areaBias = 'Thành phố Đà Nẵng',
  biasCenterName,
  onOpenMapPicker,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryCacheRef = useRef<Map<string, GeocodeSearchResult[]>>(new Map());
  const coordinatesRef = useRef<[number, number] | null>(coordinates);
  const lastSelectedLabelRef = useRef<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeResults, setPlaceResults] = useState<GeocodeSearchResult[]>([]);

  useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    if (openSafeTrigger > 0) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [openSafeTrigger]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const rawQuery = value.trim();
    const isAutoLabel = /\([^)]+\)$/.test(rawQuery) && rawQuery.length > 35;
    if (!isOpen || rawQuery.length < 2 || isAutoLabel || rawQuery === lastSelectedLabelRef.current) {
      if (rawQuery !== lastSelectedLabelRef.current) {
        setPlaceResults([]);
      }
      setIsSearchingPlaces(false);
      return;
    }

    const resolvedAreaBias = (areaBias || 'Thành phố Đà Nẵng').trim() || 'Thành phố Đà Nẵng';
    const cacheKey = `${normalizeViText(resolvedAreaBias)}|${normalizeViText(rawQuery)}`;
    const cached = queryCacheRef.current.get(cacheKey);
    if (cached) {
      setPlaceResults(cached);
      setIsSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    setIsSearchingPlaces(true);

    const timer = setTimeout(async () => {
      try {
        const biasTarget = (biasCenterName || resolvedAreaBias).trim() || resolvedAreaBias;
        const defaultCenter = getAreaCoordinates(biasTarget);
        const activeCoords = coordinatesRef.current;
        const results = await searchGeocodeSuggestions(rawQuery, {
          areaBias: resolvedAreaBias,
          lat: activeCoords ? activeCoords[1] : defaultCenter.lat,
          lng: activeCoords ? activeCoords[0] : defaultCenter.lng,
        });
        if (cancelled) return;
        queryCacheRef.current.set(cacheKey, results);
        setPlaceResults(results);
      } catch {
        if (!cancelled) {
          setPlaceResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingPlaces(false);
        }
      }
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, isOpen, areaBias, biasCenterName]);

  const filteredSafeLocations = useMemo(() => {
    const preferredIds = new Set(preferredSafeLocations.map((l) => String(l?._id)));
    const validAll = safeLocations.filter(isValidSafeLocationItem);
    const merged = [
      ...validAll.filter((l) => preferredIds.has(String(l._id))),
      ...validAll.filter((l) => !preferredIds.has(String(l._id))),
    ];
    const activeFirst = merged.sort((a, b) => {
      const aActive = a.status === 'ACTIVE' ? 0 : 1;
      const bActive = b.status === 'ACTIVE' ? 0 : 1;
      return aActive - bActive;
    });

    const q = normalizeViText(value);
    if (!q) return activeFirst.slice(0, 12);

    return activeFirst
      .filter((loc) => {
        const hay = normalizeViText(`${loc.name || ''} ${loc.address || ''}`);
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [safeLocations, preferredSafeLocations, value]);

  const showDropdown = isOpen && (
    filteredSafeLocations.length > 0 ||
    placeResults.length > 0 ||
    isSearchingPlaces ||
    value.trim().length >= 2
  );

  const hasSerpApiResult = placeResults.some((item) => item.source === 'serpapi_google_maps');

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          height: inputHeight,
          minHeight: inputHeight,
          maxHeight: inputHeight,
          background: 'var(--dm-surface)',
          borderRadius: 8,
          border: isOpen ? '1px solid #0284c7' : '1px solid var(--dm-border-strong)',
          boxShadow: isOpen ? '0 0 0 3px rgba(2, 132, 199, 0.12)' : 'none',
          padding: '0 6px 0 10px',
          boxSizing: 'border-box',
          transition: 'all 0.15s ease',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          required={required}
          maxLength={MAX_DESTINATION_LENGTH}
          title={value || undefined}
          placeholder={placeholder}
          value={value}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          onChange={(e) => {
            lastSelectedLabelRef.current = '';
            onChange(e.target.value.slice(0, MAX_DESTINATION_LENGTH));
            if (!isOpen) setIsOpen(true);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: 0,
            fontSize: 12.5,
            color: 'var(--dm-text-strong)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              lastSelectedLabelRef.current = '';
              onChange('');
              onSelectPlace('', null);
              setPlaceResults([]);
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            style={{
              flexShrink: 0,
              border: 'none',
              background: 'var(--dm-surface-muted)',
              borderRadius: '50%',
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--dm-text-muted)',
            }}
            title="Xóa địa điểm"
          >
            <X size={11} />
          </button>
        )}
        {onOpenMapPicker && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenMapPicker();
            }}
            style={{
              flexShrink: 0,
              border: coordinates ? '1px solid var(--dm-blue-border)' : '1px solid var(--dm-blue-border)',
              background: coordinates ? 'var(--dm-blue-bg)' : 'var(--dm-blue-bg)',
              borderRadius: 6,
              height: 26,
              padding: '0 7px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              color: coordinates ? 'var(--dm-blue-text)' : 'var(--dm-blue-text)',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            title={coordinates ? 'Đã ghim tọa độ GPS (bấm để đổi hoặc bỏ ghim trên bản đồ)' : 'Ghim vị trí trên bản đồ'}
          >
            <MapPin size={12} />
            <span>{coordinates ? 'Đã ghim' : 'Ghim'}</span>
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: inputHeight + 4,
            left: 0,
            right: 0,
            zIndex: 60,
            background: 'var(--dm-surface)',
            border: '1px solid var(--dm-border-strong)',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)',
            maxHeight: 260,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {filteredSafeLocations.length > 0 && (
            <div style={{ marginBottom: placeResults.length > 0 || isSearchingPlaces ? 6 : 0 }}>
              <div style={{
                padding: '4px 8px',
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--dm-blue-text)',
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <Shield size={11} />
                <span>ĐỊA ĐIỂM AN TOÀN / SƠ TÁN ({filteredSafeLocations.length})</span>
              </div>
              {filteredSafeLocations.map((loc: any) => {
                const statusBadge =
                  loc.status === 'ACTIVE'
                    ? { text: 'Hoạt động', bg: 'var(--dm-green-bg)', color: 'var(--dm-green-text)' }
                    : loc.status === 'FULL'
                      ? { text: 'Đã đầy', bg: 'var(--dm-amber-bg)', color: 'var(--dm-amber-text)' }
                      : { text: loc.status || 'Tạm dừng', bg: 'var(--dm-surface-muted)', color: 'var(--dm-text-secondary)' };
                const coords: [number, number] | null =
                  Array.isArray(loc.location?.coordinates) && loc.location.coordinates.length === 2
                    ? [Number(loc.location.coordinates[0]), Number(loc.location.coordinates[1])]
                    : null;

                return (
                  <button
                    key={loc._id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const fullLabel = `${loc.name}${loc.address ? ` (${loc.address})` : ''}`;
                      const compactLabel =
                        fullLabel.length <= MAX_DESTINATION_LENGTH
                          ? fullLabel
                          : String(loc.name || fullLabel).slice(0, MAX_DESTINATION_LENGTH);
                      lastSelectedLabelRef.current = compactLabel;
                      onSelectPlace(compactLabel, coords);
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      padding: '6px 8px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f9ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13, lineHeight: '18px' }}>{getSafeLocationIcon(loc.type)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {loc.name}
                        </div>
                        {loc.address && (
                          <div style={{ fontSize: 11, color: 'var(--dm-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {loc.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: statusBadge.bg,
                      color: statusBadge.color,
                    }}>
                      {statusBadge.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {(isSearchingPlaces || placeResults.length > 0) && (
            <div>
              <div style={{
                padding: '4px 8px',
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--dm-text-secondary)',
                borderTop: filteredSafeLocations.length > 0 ? '1px solid var(--dm-border)' : 'none',
                paddingTop: filteredSafeLocations.length > 0 ? 6 : 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 5,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={11} color="#0284c7" />
                  <span>GỢI Ý ĐỊA ĐIỂM TRÊN BẢN ĐỒ</span>
                </span>
                {hasSerpApiResult && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dm-blue-text)', background: 'var(--dm-blue-bg)', padding: '1px 6px', borderRadius: 999 }}>
                    Google Maps
                  </span>
                )}
              </div>
              {isSearchingPlaces && (
                <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--dm-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Đang tìm địa điểm Google Maps...</span>
                </div>
              )}
              {!isSearchingPlaces && placeResults.map((place) => {
                const { primaryName, secondaryText, selectedLabel } = formatGeocodeOption(place);
                return (
                  <button
                    key={place.place_id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const lng = Number(place.lon);
                      const lat = Number(place.lat);
                      const coords: [number, number] | null = !isNaN(lng) && !isNaN(lat) ? [lng, lat] : null;
                      lastSelectedLabelRef.current = selectedLabel;
                      onSelectPlace(selectedLabel, coords);
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      padding: '6px 8px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <MapPin size={13} color="#0284c7" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {primaryName}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--dm-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {secondaryText}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isSearchingPlaces && filteredSafeLocations.length === 0 && placeResults.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--dm-text-muted)' }}>
              Không tìm thấy gợi ý phù hợp — bạn vẫn có thể giữ địa chỉ tự nhập hoặc bấm <strong>Ghim bản đồ</strong>.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

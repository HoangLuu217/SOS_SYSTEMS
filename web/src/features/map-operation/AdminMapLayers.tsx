import { useEffect, useMemo, useRef, useState } from 'react';
import { Polygon, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  ChevronDown,
  Eye,
  Layers,
  ListFilter,
  MapPin,
  Phone,
  Search,
  ShieldAlert,
  Users,
  X,
  Clock,
  Truck,
} from 'lucide-react';
import type { SosRequestItem } from '@/types/dashboard';
import type { AdministrativeArea } from '@/types/domainD';
import { EMERGENCY_TYPE_LABELS } from '@/features/hazards';
import { isPointInAreaBoundary } from '@/services/mapGeoService';
import { extractPolygonLatLngRings } from '@/services/geoapifyBoundariesService';

export function isCoordsInsideArea(
  coords: { lat: number; lng: number },
  area: AdministrativeArea | null,
  addressOrAreaText?: string
): boolean {
  if (
    !coords ||
    typeof coords.lat !== 'number' ||
    typeof coords.lng !== 'number' ||
    Number.isNaN(coords.lat) ||
    Number.isNaN(coords.lng) ||
    (coords.lat === 0 && coords.lng === 0)
  ) {
    return false;
  }

  if (area?.boundary?.coordinates && isPointInAreaBoundary(coords, area)) {
    return true;
  }

  if (area?.name) {
    const strippedTarget = area.name
      .toLowerCase()
      .replace(/^(thành phố|tỉnh|tp\.?)\s+/i, '')
      .trim();
    const text = (addressOrAreaText || '').toLowerCase();
    if (strippedTarget && text.includes(strippedTarget)) {
      return true;
    }
  }

  return false;
}

function normalizeMatchText(value?: string | null): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripWardPrefix(name: string): string {
  return normalizeMatchText(name).replace(
    /^(phường|xã|thị\s*trấn|quận|huyện|thị\s*xã|thành\s*phố|tỉnh|tp\.?|p\.?|x\.?)\s+/i,
    ''
  ).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasBoundaryTokenMatch(normalizedText: string, phrase: string): boolean {
  if (!normalizedText || !phrase) return false;
  const pattern = new RegExp(`(?:^|[\\s,;.(/\\-])${escapeRegExp(phrase)}(?:$|[\\s,;.)/\\-])`, 'i');
  return pattern.test(normalizedText);
}

function doesTextMentionWard(
  normalizedText: string,
  ward: AdministrativeArea,
  requirePrefix: boolean
): boolean {
  if (!normalizedText || !ward?.name) return false;
  const fullName = normalizeMatchText(ward.name);
  const baseName = stripWardPrefix(ward.name);
  if (!baseName) return false;

  const isCommune = /^xã\s+/i.test(fullName);
  const shortPrefixes = isCommune ? ['xã', 'x.', 'x'] : ['phường', 'p.', 'p', 'quận', 'q.'];
  const prefixedCandidates = [fullName, ...shortPrefixes.map((p) => `${p} ${baseName}`)];

  if (prefixedCandidates.some((c) => hasBoundaryTokenMatch(normalizedText, c))) {
    return true;
  }

  return !requirePrefix && hasBoundaryTokenMatch(normalizedText, baseName);
}

/**
 * Xác định duy nhất 1 xã/phường mà ca SOS thuộc về (đồng nhất giữa bộ đếm dropdown và danh sách lọc).
 * Ưu tiên khớp đồng thuận giữa tọa độ GPS và địa chỉ/areaName; nếu địa chỉ ghi rõ tên xã/phường
 * khác với GPS (VD: dữ liệu test chọn địa bàn ở Duy Nghĩa nhưng GPS đặt ở tọa độ khác), tôn trọng
 * tên xã/phường ghi rõ trong địa bàn/địa chỉ để tránh đếm lệch sang xã khác.
 */
export function resolveSosWard(
  sos: Pick<AdminSosItem, 'lat' | 'lng' | 'areaName' | 'address'>,
  wardAreas: AdministrativeArea[]
): AdministrativeArea | null {
  if (!wardAreas.length) return null;

  const hasValidCoords =
    typeof sos.lat === 'number' &&
    typeof sos.lng === 'number' &&
    !Number.isNaN(sos.lat) &&
    !Number.isNaN(sos.lng) &&
    !(sos.lat === 0 && sos.lng === 0);

  const gpsWard = hasValidCoords
    ? wardAreas.find((w) => w.boundary?.coordinates && isPointInAreaBoundary({ lat: sos.lat, lng: sos.lng }, w)) || null
    : null;

  const areaText = normalizeMatchText(sos.areaName);
  const addressText = normalizeMatchText(sos.address);
  const combinedText = `${areaText} ${addressText}`.trim();

  if (gpsWard && doesTextMentionWard(combinedText, gpsWard, false)) {
    return gpsWard;
  }

  const wardsBySpecificity = [...wardAreas].sort(
    (a, b) => stripWardPrefix(b.name).length - stripWardPrefix(a.name).length
  );

  if (areaText) {
    const byAreaName = wardsBySpecificity.find((w) => doesTextMentionWard(areaText, w, false));
    if (byAreaName) return byAreaName;
  }

  if (addressText) {
    const byPrefixedAddress = wardsBySpecificity.find((w) => doesTextMentionWard(addressText, w, true));
    if (byPrefixedAddress) return byPrefixedAddress;

    if (!gpsWard) {
      const byBareAddress = wardsBySpecificity.find((w) => doesTextMentionWard(addressText, w, false));
      if (byBareAddress) return byBareAddress;
    }
  }

  return gpsWard;
}

export type AdminSosFilterMode = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface AdminSosItem {
  id: string;
  sosCode: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  emergencyType: string;
  emergencyTypeLabel: string;
  title: string;
  description: string;
  address: string;
  areaName: string;
  lat: number;
  lng: number;
  citizenName: string;
  citizenPhone: string;
  affectedPeople: number;
  priorityGroups: string[];
  images: string[];
  createdAt: string;
  timeAgo: string;
  assignmentSummary: {
    status: string;
    teamName?: string;
    rescuerName?: string;
    vehiclePlate?: string;
    orgName?: string;
  } | null;
}

const ADMIN_SOS_STATUS_META: Record<
  string,
  {
    label: string;
    color: string;
    bgColor: string;
    pinColor: string;
    group: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  }
> = {
  PENDING: { label: 'Chờ tiếp nhận', color: '#dc2626', bgColor: '#fee2e2', pinColor: '#dc2626', group: 'ACTIVE' },
  VERIFIED: { label: 'Đã xác minh', color: '#d97706', bgColor: '#fef3c7', pinColor: '#d97706', group: 'ACTIVE' },
  ASSIGNED: { label: 'Đã phân công', color: '#7c3aed', bgColor: '#ede9fe', pinColor: '#7c3aed', group: 'ACTIVE' },
  ACCEPTED: { label: 'Đội đã nhận lệnh', color: '#6d28d9', bgColor: '#ede9fe', pinColor: '#6d28d9', group: 'ACTIVE' },
  ON_THE_WAY: { label: 'Đang di chuyển', color: '#2563eb', bgColor: '#dbeafe', pinColor: '#2563eb', group: 'ACTIVE' },
  EN_ROUTE: { label: 'Đang di chuyển', color: '#2563eb', bgColor: '#dbeafe', pinColor: '#2563eb', group: 'ACTIVE' },
  ARRIVED: { label: 'Đã tới hiện trường', color: '#0284c7', bgColor: '#e0f2fe', pinColor: '#0284c7', group: 'ACTIVE' },
  IN_PROGRESS: { label: 'Đang cứu hộ', color: '#2563eb', bgColor: '#dbeafe', pinColor: '#2563eb', group: 'ACTIVE' },
  RESCUING: { label: 'Đang cứu nạn', color: '#ea580c', bgColor: '#ffedd5', pinColor: '#ea580c', group: 'ACTIVE' },
  COMPLETED: { label: 'Hoàn thành', color: '#16a34a', bgColor: '#dcfce7', pinColor: '#16a34a', group: 'COMPLETED' },
  RESOLVED: { label: 'Đã giải quyết', color: '#16a34a', bgColor: '#dcfce7', pinColor: '#16a34a', group: 'COMPLETED' },
  CANCELLED: { label: 'Đã hủy', color: '#64748b', bgColor: '#f1f5f9', pinColor: '#64748b', group: 'CANCELLED' },
  REJECTED: { label: 'Từ chối', color: '#64748b', bgColor: '#f1f5f9', pinColor: '#64748b', group: 'CANCELLED' },
};

const PRIORITY_META: Record<string, { label: string; color: string; bgColor: string }> = {
  CRITICAL: { label: 'Nguy cấp', color: '#b91c1c', bgColor: '#fee2e2' },
  HIGH: { label: 'Khẩn cấp', color: '#c2410c', bgColor: '#ffedd5' },
  MEDIUM: { label: 'Trung bình', color: '#b45309', bgColor: '#fef3c7' },
  LOW: { label: 'Thấp', color: '#0369a1', bgColor: '#e0f2fe' },
};

export function getAdminSosStatusMeta(status?: string) {
  const key = String(status || 'PENDING').toUpperCase();
  return (
    ADMIN_SOS_STATUS_META[key] || {
      label: key,
      color: '#475569',
      bgColor: '#f1f5f9',
      pinColor: '#475569',
      group: 'ACTIVE' as const,
    }
  );
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'Vừa xong';
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

function normalizeEmergencyType(rawType?: string): string {
  const upper = String(rawType || 'RESCUE').toUpperCase();
  if (upper === 'FLOOD' || upper === 'NGAP_LUT') return 'FLOOD';
  if (upper === 'FIRE' || upper === 'CHAY') return 'FIRE';
  if (upper === 'MEDICAL' || upper === 'Y_TE') return 'MEDICAL';
  if (upper === 'POLICE') return 'POLICE';
  return upper;
}

function cleanSosTitle(rawDesc: string, emergencyTypeLabel: string): string {
  if (!rawDesc) return emergencyTypeLabel;
  if (rawDesc.includes('[Loại yêu cầu:')) {
    const clean = rawDesc
      .replace(/\[Loại yêu cầu:[^\]]+\]/g, '')
      .replace(/\[SĐT:[^\]]+\]/g, '')
      .replace(/\[Ưu tiên:[^\]]+\]/g, '')
      .replace(/\[Đối tượng ưu tiên:[^\]]+\]/g, '')
      .trim();
    const typeMatch = rawDesc.match(/\[Loại yêu cầu:\s*([^\]]+)\]/);
    const candidate = clean || typeMatch?.[1] || emergencyTypeLabel;
    return candidate.length > 64 ? `${candidate.slice(0, 61)}...` : candidate;
  }
  return rawDesc.length > 64 ? `${rawDesc.slice(0, 61)}...` : rawDesc;
}

export function mapBackendSosForAdmin(
  items: SosRequestItem[],
  boundaryArea: AdministrativeArea | null
): AdminSosItem[] {
  return items
    .map((item): AdminSosItem | null => {
      const coords = item.location?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;

      const areaObj = typeof item.areaId === 'object' && item.areaId !== null ? item.areaId : null;
      const areaName = areaObj?.name || '';
      const combinedText = `${areaName} ${item.address || ''}`;

      if (!isCoordsInsideArea({ lat, lng }, boundaryArea, combinedText)) {
        return null;
      }

      const citizenObj =
        typeof item.citizenId === 'object' && item.citizenId !== null ? item.citizenId : null;
      const rawDesc = item.description || '';
      const phoneMatch = rawDesc.match(/\[SĐT:\s*([^\]]+)\]/);
      const citizenPhone =
        item.contactPhone ||
        phoneMatch?.[1]?.trim() ||
        citizenObj?.phone ||
        item.secondaryPhone ||
        'Chưa cập nhật';

      const emergencyType = normalizeEmergencyType(item.emergencyType);
      const emergencyTypeLabel =
        EMERGENCY_TYPE_LABELS[emergencyType] || emergencyType || 'Cứu hộ khẩn cấp';

      const priorityGroups = (() => {
        if (Array.isArray(item.priorityGroups) && item.priorityGroups.length > 0) {
          return item.priorityGroups;
        }
        const match = rawDesc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
        return match?.[1]
          ? match[1].split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      })();

      const images =
        Array.isArray(item.images) && item.images.length > 0
          ? item.images
          : item.imageUrl
            ? [item.imageUrl]
            : [];

      const assign = item.assignment;
      const assignmentSummary = assign
        ? {
          status: assign.status || item.status,
          teamName: assign.rescueTeamId?.name || assign.rescueTeamName || undefined,
          rescuerName: assign.rescuerId?.fullName || assign.rescuerName || undefined,
          vehiclePlate: assign.vehicleId?.plateNumber || assign.vehicleName || undefined,
          orgName: assign.authorityOrganizationId?.name || undefined,
        }
        : null;

      return {
        id: item._id,
        sosCode: item.sosCode || `#${item._id.slice(-5).toUpperCase()}`,
        status: String(item.status || 'PENDING').toUpperCase(),
        priority: (item.priority || 'HIGH') as AdminSosItem['priority'],
        emergencyType,
        emergencyTypeLabel,
        title: cleanSosTitle(rawDesc, emergencyTypeLabel),
        description: rawDesc,
        address: item.address || 'Chưa rõ địa chỉ',
        areaName,
        lat,
        lng,
        citizenName: citizenObj?.fullName || 'Người dân',
        citizenPhone,
        affectedPeople: item.people ?? 1,
        priorityGroups,
        images,
        createdAt: item.createdAt,
        timeAgo: formatTimeAgo(item.createdAt),
        assignmentSummary,
      };
    })
    .filter((entry): entry is AdminSosItem => entry !== null);
}

function createAdminSosPinIcon(sos: AdminSosItem, isSelected: boolean): L.DivIcon {
  const statusMeta = getAdminSosStatusMeta(sos.status);
  const isWaiting = sos.status === 'PENDING' || sos.status === 'VERIFIED';
  const showCodeBadge = isSelected || isWaiting;

  const dotSize = isSelected ? 22 : isWaiting ? 16 : 13;
  const haloSize = isSelected ? 42 : isWaiting ? 30 : 0;

  return L.divIcon({
    className: 'admin-sos-pin',
    iconSize: [110, 52],
    iconAnchor: [55, 36],
    popupAnchor: [0, -24],
    html: `
      <div style="position:relative;width:110px;height:52px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;cursor:pointer;">
        ${showCodeBadge
        ? `<div style="
                position:absolute;
                top:0;
                background:${isSelected ? '#0f172a' : statusMeta.pinColor};
                color:#ffffff;
                font-size:10px;
                font-weight:800;
                padding:1.5px 6px;
                border-radius:5px;
                border:1.5px solid #ffffff;
                box-shadow:0 2px 6px rgba(0,0,0,0.28);
                white-space:nowrap;
                letter-spacing:0.2px;
                z-index:20;
              ">${sos.sosCode}</div>`
        : ''
      }
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          ${haloSize > 0
        ? `<div style="
                  position:absolute;
                  width:${haloSize}px;
                  height:${haloSize}px;
                  border-radius:50%;
                  background:${statusMeta.pinColor}33;
                  border:1.5px solid ${statusMeta.pinColor};
                  animation:admin-sos-pulse 1.6s infinite ease-out;
                "></div>`
        : ''
      }
          <div style="
            position:relative;
            width:${dotSize}px;
            height:${dotSize}px;
            border-radius:50%;
            background:${statusMeta.pinColor};
            border:${isSelected ? '3px' : '2.5px'} solid #ffffff;
            box-shadow:0 2px 8px rgba(15,23,42,0.45);
            z-index:10;
          "></div>
        </div>
      </div>
    `,
  });
}

interface AdminMapContentProps {
  boundaryArea: AdministrativeArea | null;
  wardAreas: AdministrativeArea[];
  selectedWard: AdministrativeArea | null;
  showWardBoundaries: boolean;
  sosList: AdminSosItem[];
  selectedSos: AdminSosItem | null;
  onSelectSos: (sos: AdminSosItem | null) => void;
  focusRequest: { lat: number; lng: number; seq: number } | null;
}

export const AdminMapContent = ({
  boundaryArea,
  wardAreas,
  selectedWard,
  showWardBoundaries,
  sosList,
  selectedSos,
  onSelectSos,
  focusRequest,
}: AdminMapContentProps) => {
  const map = useMap();
  const hasFittedInitialRef = useRef(false);
  const prevSelectedWardIdRef = useRef<string | null>(null);

  const areaRings = useMemo(
    () => extractPolygonLatLngRings(boundaryArea?.boundary),
    [boundaryArea]
  );

  // Tự động căn khung bản đồ theo boundary khu vực mục tiêu khi tải xong từ API
  useEffect(() => {
    if (hasFittedInitialRef.current || selectedWard || areaRings.length === 0) return;
    const allPoints = areaRings.flat();
    if (allPoints.length >= 3) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [32, 32], maxZoom: 12 });
      hasFittedInitialRef.current = true;
    }
  }, [map, areaRings, selectedWard]);

  // Zoom vào đúng ranh giới xã/phường được chọn, hoặc quay về toàn thành phố khi bỏ chọn
  useEffect(() => {
    const nextWardId = selectedWard?.id || null;
    if (prevSelectedWardIdRef.current === nextWardId) return;
    prevSelectedWardIdRef.current = nextWardId;

    if (selectedWard) {
      const wardRings = extractPolygonLatLngRings(selectedWard.boundary);
      const wardPoints = wardRings.flat();
      if (wardPoints.length >= 3) {
        map.fitBounds(L.latLngBounds(wardPoints), {
          padding: [56, 56],
          maxZoom: 15,
          animate: true,
        });
        return;
      }
    }

    const allPoints = areaRings.flat();
    if (allPoints.length >= 3) {
      map.fitBounds(L.latLngBounds(allPoints), {
        padding: [32, 32],
        maxZoom: 12,
        animate: true,
      });
    }
  }, [map, selectedWard, areaRings]);

  useEffect(() => {
    if (!focusRequest) return;
    const nextZoom = Math.max(map.getZoom(), 14);
    map.flyTo([focusRequest.lat, focusRequest.lng], nextZoom, { duration: 0.65 });
  }, [map, focusRequest]);

  useMapEvents({
    click: () => {
      onSelectSos(null);
    },
  });

  const wardPolygons = useMemo(() => {
    if (!showWardBoundaries || wardAreas.length === 0) return [];
    return wardAreas.flatMap((area) => {
      if (selectedWard && area.id === selectedWard.id) return [];
      return extractPolygonLatLngRings(area.boundary).map((positions, idx) => ({
        key: `${area.id}-${idx}`,
        name: area.name,
        positions,
      }));
    });
  }, [showWardBoundaries, wardAreas, selectedWard]);

  const selectedWardPolygons = useMemo(() => {
    if (!selectedWard) return [];
    return extractPolygonLatLngRings(selectedWard.boundary).map((positions, idx) => ({
      key: `selected-${selectedWard.id}-${idx}`,
      name: selectedWard.name,
      positions,
    }));
  }, [selectedWard]);

  return (
    <>
      {wardPolygons.map((ward) => (
        <Polygon
          key={ward.key}
          positions={ward.positions}
          pathOptions={{
            color: '#df4f47',
            weight: 2.1,
            opacity: selectedWard ? 0.32 : 0.78,
            dashArray: '1, 5.5',
            lineCap: 'round',
            lineJoin: 'round',
            fillColor: '#ef5350',
            fillOpacity: selectedWard ? 0.01 : 0.02,
          }}
        >
          <Tooltip sticky direction="center" opacity={0.9}>
            <span style={{ fontWeight: 700, fontSize: 11 }}>{ward.name}</span>
          </Tooltip>
        </Polygon>
      ))}

      {selectedWardPolygons.map((ward) => (
        <Polygon
          key={ward.key}
          positions={ward.positions}
          pathOptions={{
            color: '#dc2626',
            weight: 2.8,
            opacity: 0.95,
            dashArray: '2, 5.5',
            lineCap: 'round',
            lineJoin: 'round',
            fillColor: '#ef4444',
            fillOpacity: 0.07,
          }}
        >
          <Tooltip sticky direction="center" opacity={0.95}>
            <span style={{ fontWeight: 800, fontSize: 11.5 }}>{ward.name}</span>
          </Tooltip>
        </Polygon>
      ))}

      {sosList.map((sos) => {
        const isSelected = selectedSos?.id === sos.id;
        const statusMeta = getAdminSosStatusMeta(sos.status);
        const priorityMeta = PRIORITY_META[sos.priority] || PRIORITY_META.HIGH;

        return (
          <Marker
            key={`${sos.id}-${sos.status}-${isSelected ? 'sel' : 'std'}`}
            position={[sos.lat, sos.lng]}
            icon={createAdminSosPinIcon(sos, isSelected)}
            zIndexOffset={isSelected ? 1000 : sos.status === 'PENDING' ? 500 : 100}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event);
                onSelectSos(sos);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -28]} opacity={0.96}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a' }}>
                <span style={{ color: statusMeta.color }}>{sos.sosCode}</span>
                {' • '}
                <span>{statusMeta.label}</span>
                {' • '}
                <span>{sos.affectedPeople} người</span>
              </div>
            </Tooltip>
            <Popup autoPan={false} maxWidth={290}>
              <div style={{ minWidth: 230, fontFamily: 'inherit', padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: statusMeta.color }}>
                    {sos.sosCode}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: statusMeta.color,
                      background: statusMeta.bgColor,
                      padding: '2px 6px',
                      borderRadius: 999,
                    }}
                  >
                    {statusMeta.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                  {sos.emergencyTypeLabel} •{' '}
                  <span style={{ color: priorityMeta.color }}>{priorityMeta.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 2 }}>
                  👤 {sos.citizenName} ({sos.citizenPhone}) — <strong>{sos.affectedPeople} người</strong>
                </div>
                <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.35 }}>
                  📍 {sos.address}
                </div>
                {sos.assignmentSummary?.teamName && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>
                    🚤 Đang phụ trách: {sos.assignmentSummary.teamName}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

interface AdminMapHudProps {
  targetAreaName: string;
  totalInArea: number;
  counts: { all: number; active: number; completed: number; cancelled: number };
  filterMode: AdminSosFilterMode;
  onFilterModeChange: (mode: AdminSosFilterMode) => void;
  filteredSosList: AdminSosItem[];
  selectedSos: AdminSosItem | null;
  onSelectSos: (sos: AdminSosItem | null) => void;
  onFocusSos: (sos: AdminSosItem) => void;
  showWardBoundaries: boolean;
  onToggleWardBoundaries: () => void;
  wardsLoading: boolean;
  wardAreas: AdministrativeArea[];
  selectedWard: AdministrativeArea | null;
  onSelectWard: (wardId: string | null) => void;
  wardSosCountMap: Record<string, number>;
}

export const AdminMapHud = ({
  targetAreaName,
  totalInArea,
  counts,
  filterMode,
  onFilterModeChange,
  filteredSosList,
  selectedSos,
  onSelectSos,
  onFocusSos,
  showWardBoundaries,
  onToggleWardBoundaries,
  wardsLoading,
  wardAreas,
  selectedWard,
  onSelectWard,
  wardSosCountMap,
}: AdminMapHudProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [wardSearch, setWardSearch] = useState('');
  const wardDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wardDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wardDropdownRef.current && !wardDropdownRef.current.contains(event.target as Node)) {
        setWardDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wardDropdownOpen]);

  const filteredWards = useMemo(() => {
    const q = wardSearch.trim().toLowerCase();
    const list = !q
      ? wardAreas
      : wardAreas.filter((w) => w.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const countDiff = (wardSosCountMap[b.id] || 0) - (wardSosCountMap[a.id] || 0);
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [wardAreas, wardSearch, wardSosCountMap]);

  const searchedList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return filteredSosList;
    return filteredSosList.filter(
      (s) =>
        s.sosCode.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.areaName.toLowerCase().includes(q) ||
        s.citizenName.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q)
    );
  }, [filteredSosList, searchTerm]);

  const filterChips: Array<{ id: AdminSosFilterMode; label: string; count: number; dot: string }> = [
    { id: 'ALL', label: 'Tất cả', count: counts.all, dot: '#0f172a' },
    { id: 'ACTIVE', label: 'Đang mở / Xử lý', count: counts.active, dot: '#dc2626' },
    { id: 'COMPLETED', label: 'Hoàn thành', count: counts.completed, dot: '#16a34a' },
    { id: 'CANCELLED', label: 'Đã hủy', count: counts.cancelled, dot: '#64748b' },
  ];

  const selectedStatus = selectedSos ? getAdminSosStatusMeta(selectedSos.status) : null;
  const selectedPriority = selectedSos
    ? PRIORITY_META[selectedSos.priority] || PRIORITY_META.HIGH
    : null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 1000,
          maxWidth: 'calc(100% - 32px)',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(10px)',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#fee2e2',
                color: '#dc2626',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={15} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                Giám sát SOS — {selectedWard ? selectedWard.name : targetAreaName}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>
                  {totalInArea} yêu cầu {selectedWard ? `tại ${selectedWard.name}` : `trong ranh giới ${targetAreaName}`}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' }}>
            {/* Bộ lọc theo Xã/Phường Đà Nẵng */}
            <div ref={wardDropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setWardDropdownOpen((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: selectedWard ? '1px solid #0f172a' : '1px solid #cbd5e1',
                  background: selectedWard ? '#f1f5f9' : '#ffffff',
                  color: '#0f172a',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  maxWidth: 210,
                }}
                title="Lọc và phóng to theo xã/phường Đà Nẵng"
              >
                <MapPin size={13} style={{ flexShrink: 0, color: selectedWard ? '#dc2626' : '#475569' }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedWard ? selectedWard.name : wardsLoading && wardAreas.length === 0 ? 'Đang tải khu vực...' : 'Tất cả xã/phường'}
                </span>
                {selectedWard ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectWard(null);
                      setWardDropdownOpen(false);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: 2,
                      color: '#64748b',
                    }}
                    title="Bỏ lọc xã/phường"
                  >
                    <X size={12} />
                  </span>
                ) : (
                  <ChevronDown size={13} style={{ flexShrink: 0, color: '#64748b' }} />
                )}
              </button>

              {wardDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: 265,
                    maxHeight: 320,
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
                    zIndex: 1200,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: 7,
                        padding: '5px 8px',
                      }}
                    >
                      <Search size={12.5} color="#64748b" />
                      <input
                        type="text"
                        value={wardSearch}
                        onChange={(e) => setWardSearch(e.target.value)}
                        placeholder="Tìm xã, phường..."
                        autoFocus
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: 12,
                          color: '#0f172a',
                          width: '100%',
                        }}
                      />
                      {wardSearch && (
                        <button
                          type="button"
                          onClick={() => setWardSearch('')}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#64748b', display: 'flex' }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filteredWards.length === 0 ? (
                      <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 11.5, color: '#64748b' }}>
                        {wardsLoading ? 'Đang tải danh sách xã/phường...' : 'Không tìm thấy xã/phường phù hợp'}
                      </div>
                    ) : (
                      filteredWards.map((ward) => {
                        const isSelected = selectedWard?.id === ward.id;
                        const sosCount = wardSosCountMap[ward.id] || 0;
                        return (
                          <button
                            key={ward.id}
                            type="button"
                            onClick={() => {
                              onSelectWard(isSelected ? null : ward.id);
                              setWardDropdownOpen(false);
                              setWardSearch('');
                            }}
                            style={{
                              textAlign: 'left',
                              width: '100%',
                              padding: '7px 9px',
                              borderRadius: 7,
                              border: 'none',
                              background: isSelected ? '#f1f5f9' : 'transparent',
                              color: '#0f172a',
                              fontSize: 12,
                              fontWeight: isSelected ? 800 : sosCount > 0 ? 700 : 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ward.name}
                            </span>
                            {sosCount > 0 && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  color: '#0f172a',
                                  background: '#e2e8f0',
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  flexShrink: 0,
                                }}
                              >
                                {sosCount} SOS
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleWardBoundaries}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 8,
                border: showWardBoundaries ? '1px solid #2563eb' : '1px solid #cbd5e1',
                background: showWardBoundaries ? '#eff6ff' : '#ffffff',
                color: showWardBoundaries ? '#1d4ed8' : '#334155',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Bật/tắt ranh giới các xã/phường"
            >
              <Layers size={13} />
              {wardsLoading ? 'Đang tải...' : 'Ranh giới Xã/Phường'}
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 8,
                border: drawerOpen ? '1px solid #0f172a' : '1px solid #cbd5e1',
                background: drawerOpen ? '#0f172a' : '#ffffff',
                color: drawerOpen ? '#ffffff' : '#334155',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <ListFilter size={13} />
              Danh sách ({filteredSosList.length})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {filterChips.map((chip) => {
            const active = filterMode === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onFilterModeChange(chip.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: active ? `1px solid ${chip.dot}` : '1px solid #e2e8f0',
                  background: active ? '#f8fafc' : '#ffffff',
                  color: active ? '#0f172a' : '#475569',
                  fontSize: 11.5,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: chip.dot,
                    display: 'inline-block',
                  }}
                />
                {chip.label} ({chip.count})
              </button>
            );
          })}
        </div>
      </div>

      {drawerOpen && (
        <div
          style={{
            position: 'absolute',
            top: 118,
            left: 16,
            zIndex: 999,
            width: 330,
            maxHeight: 'calc(100% - 140px)',
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 9px',
              }}
            >
              <Search size={13} color="#64748b" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã SOS, địa chỉ, khu vực..."
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 12,
                  color: '#0f172a',
                  width: '100%',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                padding: 4,
              }}
              title="Thu gọn danh sách"
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {searchedList.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                Không có yêu cầu SOS phù hợp trong khu vực.
              </div>
            ) : (
              searchedList.map((sos) => {
                const st = getAdminSosStatusMeta(sos.status);
                const isSelected = selectedSos?.id === sos.id;
                return (
                  <button
                    key={sos.id}
                    type="button"
                    onClick={() => onFocusSos(sos)}
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: 10,
                      border: isSelected ? `1.5px solid ${st.color}` : '1px solid #e2e8f0',
                      background: isSelected ? '#fef2f2' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: st.color }}>{sos.sosCode}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: st.color,
                          background: st.bgColor,
                          padding: '2px 7px',
                          borderRadius: 999,
                        }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {sos.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>
                      📍 {sos.address}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 10.5,
                        color: '#64748b',
                        marginTop: 2,
                      }}
                    >
                      <span>👤 {sos.citizenName} • {sos.affectedPeople} người</span>
                      <span>{sos.timeAgo}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedSos && selectedStatus && selectedPriority && (
        <div
          style={{
            position: 'absolute',
            top: 68,
            right: 16,
            zIndex: 1000,
            width: 340,
            maxWidth: 'calc(100% - 32px)',
            maxHeight: 'calc(100% - 210px)',
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {selectedSos.sosCode}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: selectedStatus.color,
                  background: selectedStatus.bgColor,
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {selectedStatus.label}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: selectedPriority.color,
                  background: selectedPriority.bgColor,
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {selectedPriority.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectSos(null)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                padding: 2,
              }}
              title="Đóng chi tiết"
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
              {selectedSos.emergencyTypeLabel}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#334155' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <MapPin size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{selectedSos.address}</div>
                  {selectedSos.areaName && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>Khu vực: {selectedSos.areaName}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: '#64748b' }}>
                    GPS: {selectedSos.lat.toFixed(5)}, {selectedSos.lng.toFixed(5)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} color="#0284c7" style={{ flexShrink: 0 }} />
                <span>
                  <strong>{selectedSos.citizenName}</strong> • {selectedSos.affectedPeople} người bị ảnh hưởng
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                <span>SĐT: <strong>{selectedSos.citizenPhone}</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <span>
                  Gửi lúc {selectedSos.timeAgo}
                  {selectedSos.createdAt ? ` (${new Date(selectedSos.createdAt).toLocaleString('vi-VN')})` : ''}
                </span>
              </div>
            </div>

            {selectedSos.priorityGroups.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedSos.priorityGroups.map((grp) => (
                  <span
                    key={grp}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#9a3412',
                      background: '#ffedd5',
                      padding: '2px 7px',
                      borderRadius: 6,
                    }}
                  >
                    {grp}
                  </span>
                ))}
              </div>
            )}

            {selectedSos.description && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11.5,
                  color: '#334155',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedSos.description}
              </div>
            )}

            {selectedSos.images.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {selectedSos.images.slice(0, 4).map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Hiện trường ${selectedSos.sosCode}`}
                    style={{
                      width: '100%',
                      height: 82,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  />
                ))}
              </div>
            )}

            {selectedSos.assignmentSummary && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11.5,
                  color: '#1e3a8a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700 }}>
                  <Truck size={13} />
                  Thông tin xử lý hiện tại
                </div>
                {selectedSos.assignmentSummary.teamName && (
                  <div>Đội cứu hộ: <strong>{selectedSos.assignmentSummary.teamName}</strong></div>
                )}
                {selectedSos.assignmentSummary.rescuerName && (
                  <div>Chỉ huy / Cứu hộ viên: {selectedSos.assignmentSummary.rescuerName}</div>
                )}
                {selectedSos.assignmentSummary.vehiclePlate && (
                  <div>Phương tiện: {selectedSos.assignmentSummary.vehiclePlate}</div>
                )}
                {selectedSos.assignmentSummary.orgName && (
                  <div>Đơn vị điều phối: {selectedSos.assignmentSummary.orgName}</div>
                )}
              </div>
            )}

            <div
              style={{
                borderTop: '1px dashed #cbd5e1',
                paddingTop: 8,
                fontSize: 11,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Eye size={12} />
              Trang giám sát chỉ xem — không thực hiện phân công tại đây.
            </div>
          </div>
        </div>
      )}
    </>
  );
};

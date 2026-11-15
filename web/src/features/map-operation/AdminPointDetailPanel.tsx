import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  MapPin,
  Shield,
  Users,
  X,
} from 'lucide-react';
import type { HazardReportItem, SafeLocationItem } from '@/types/dashboard';
import type { PhotoLightboxState } from '@/components/common/PhotoLightboxModal';
import { HAZARD_TYPE_OPTIONS, HazardTypeIcon } from '@/features/hazards/hazardConstants';
import {
  SHELTER_TYPE_CARDS,
  ShelterTypeIcon,
  getShelterOccupancyMetrics,
} from '@/features/shelters/shelterConstants';

export type SelectedAdminPoint =
  | { kind: 'SHELTER'; shelter: SafeLocationItem }
  | { kind: 'HAZARD'; hazard: HazardReportItem };

interface AdminPointDetailPanelProps {
  point: SelectedAdminPoint | null;
  hudCollapsed: boolean;
  onClose: () => void;
  onOpenPhoto: (state: PhotoLightboxState) => void;
}

const SHELTER_STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE: { label: 'Đang mở cửa tiếp nhận', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  FULL: { label: 'Đã đầy chỗ', color: '#c2410c', bg: '#ffedd5', border: '#fdba74' },
  MAINTENANCE: { label: 'Đang bảo trì', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  INACTIVE: { label: 'Tạm ngưng hoạt động', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
};

const HAZARD_SEVERITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  CRITICAL: { label: 'Cực kỳ nguy cấp', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  HIGH: { label: 'Nguy hiểm cao', color: '#c2410c', bg: '#fff7ed', border: '#fdba74' },
  MEDIUM: { label: 'Trung bình', color: '#b45309', bg: '#fefce8', border: '#fde047' },
  LOW: { label: 'Mức thấp', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};

const getCleanImages = (images?: string[]): string[] =>
  Array.isArray(images) ? images.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : [];

export const AdminPointDetailPanel: React.FC<AdminPointDetailPanelProps> = ({
  point,
  hudCollapsed,
  onClose,
  onOpenPhoto,
}) => {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  if (!point) return null;

  const isShelter = point.kind === 'SHELTER';
  const images = isShelter ? getCleanImages(point.shelter.images) : getCleanImages(point.hazard.images);
  const primaryImage = images.find((u) => !failedUrls[u]) || null;
  const title = isShelter ? point.shelter.name : point.hazard.title;
  const coords = isShelter ? point.shelter.location?.coordinates : point.hazard.location?.coordinates;
  const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
  const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const shelterTypeLabel = isShelter
    ? SHELTER_TYPE_CARDS.find((t) => t.key === point.shelter.type)?.label || 'Điểm trú ẩn an toàn'
    : '';
  const hazardTypeLabel = !isShelter
    ? HAZARD_TYPE_OPTIONS.find((t) => t.key === point.hazard.hazardType)?.label || point.hazard.customHazardType || point.hazard.hazardType
    : '';

  const shelterMetrics = isShelter
    ? getShelterOccupancyMetrics(point.shelter.currentOccupancy, point.shelter.capacity)
    : null;

  const shelterStatus = isShelter
    ? point.shelter.status !== 'MAINTENANCE' &&
      point.shelter.status !== 'INACTIVE' &&
      shelterMetrics?.isOverloaded
      ? {
          label: `Quá tải (${shelterMetrics.percent}%)`,
          color: '#991b1b',
          bg: '#fef2f2',
          border: '#fca5a5',
        }
      : SHELTER_STATUS_META[point.shelter.status] || SHELTER_STATUS_META.ACTIVE
    : null;
  const hazardSeverity = !isShelter
    ? HAZARD_SEVERITY_META[point.hazard.severity] || HAZARD_SEVERITY_META.MEDIUM
    : null;

  const markImageFailed = (url: string) => {
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  const renderFallbackThumb = () => (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isShelter ? '#ecfdf5' : '#fef2f2',
        border: `1px solid ${isShelter ? '#a7f3d0' : '#fecaca'}`,
      }}
    >
      {isShelter ? (
        <ShelterTypeIcon type={point.shelter.type} size={22} color="#059669" />
      ) : (
        <HazardTypeIcon type={point.hazard.hazardType} size={22} color="#dc2626" />
      )}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: hudCollapsed ? 60 : 124,
        left: 16,
        zIndex: 999,
        width: 376,
        maxWidth: 'calc(100% - 32px)',
        maxHeight: hudCollapsed ? 'calc(100% - 82px)' : 'calc(100% - 144px)',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        border: '1px solid #cbd5e1',
        boxShadow: '0 14px 36px rgba(15, 23, 42, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header: dùng ảnh địa điểm thay cho icon 🛡️ / ⚠️ khi địa điểm có ảnh */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 11,
        }}
      >
        {primaryImage ? (
          <button
            type="button"
            onClick={() =>
              onOpenPhoto({
                images,
                activeIndex: Math.max(0, images.indexOf(primaryImage)),
                title,
              })
            }
            title="Nhấn để phóng to ảnh địa điểm"
            style={{
              width: 48,
              height: 48,
              padding: 0,
              borderRadius: 10,
              overflow: 'hidden',
              border: `2px solid ${isShelter ? '#10b981' : '#ef4444'}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.14)',
              cursor: 'zoom-in',
              flexShrink: 0,
              background: '#e2e8f0',
            }}
          >
            <img
              src={primaryImage}
              alt={title}
              onError={() => markImageFailed(primaryImage)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </button>
        ) : (
          renderFallbackThumb()
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.2px',
                padding: '2px 8px',
                borderRadius: 999,
                color: isShelter ? '#047857' : '#b91c1c',
                background: isShelter ? '#d1fae5' : '#fee2e2',
              }}
            >
              {isShelter ? <Shield size={11} /> : <AlertTriangle size={11} />}
              {isShelter ? 'ĐIỂM AN TOÀN' : 'ĐIỂM NGUY HIỂM'}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: '#e2e8f0',
                color: '#334155',
              }}
            >
              {isShelter ? shelterTypeLabel : hazardTypeLabel}
            </span>
          </div>

          <h3
            style={{
              margin: 0,
              fontSize: 14.5,
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {title}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Đóng chi tiết"
          aria-label="Đóng chi tiết"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Body cuộn dọc */}
      <div style={{ padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Ảnh địa điểm / hiện trường lớn + dải thumbnail */}
        {primaryImage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div
              onClick={() =>
                onOpenPhoto({
                  images,
                  activeIndex: Math.max(0, images.indexOf(primaryImage)),
                  title,
                })
              }
              title="Nhấn để xem ảnh toàn màn hình"
              style={{
                position: 'relative',
                width: '100%',
                height: 156,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                cursor: 'zoom-in',
                background: '#f1f5f9',
              }}
            >
              <img
                src={primaryImage}
                alt={title}
                onError={() => markImageFailed(primaryImage)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'rgba(15, 23, 42, 0.76)',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <ImageIcon size={12} />
                {images.length > 1 ? `${images.length} ảnh • Xem toàn màn hình` : 'Xem toàn màn hình'}
              </div>
            </div>

            {images.length > 1 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {images.map((imgUrl, idx) => (
                  <button
                    key={`${imgUrl}-${idx}`}
                    type="button"
                    onClick={() =>
                      onOpenPhoto({
                        images,
                        activeIndex: idx,
                        title,
                      })
                    }
                    title={`Xem ảnh ${idx + 1}/${images.length}`}
                    style={{
                      width: 56,
                      height: 56,
                      padding: 0,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1.5px solid #cbd5e1',
                      cursor: 'zoom-in',
                      flexShrink: 0,
                      background: '#f8fafc',
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={`${title} - ${idx + 1}`}
                      onError={() => markImageFailed(imgUrl)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Trạng thái / Mức độ */}
        {isShelter && shelterStatus && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: 8,
              background: shelterStatus.bg,
              border: `1px solid ${shelterStatus.border}`,
              color: shelterStatus.color,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span>Trạng thái cơ sở</span>
            <span>{shelterStatus.label}</span>
          </div>
        )}

        {!isShelter && hazardSeverity && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: 8,
              background: hazardSeverity.bg,
              border: `1px solid ${hazardSeverity.border}`,
              color: hazardSeverity.color,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span>Mức độ cảnh báo</span>
            <span>{hazardSeverity.label}</span>
          </div>
        )}

        {/* Địa chỉ & Tọa độ */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '10px 11px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: '#0f172a' }}>
            <MapPin size={15} color={isShelter ? '#059669' : '#dc2626'} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, lineHeight: 1.4 }}>
                {(isShelter ? point.shelter.address : point.hazard.address) || 'Chưa cập nhật địa chỉ'}
              </div>
              {(() => {
                const area = isShelter ? point.shelter.areaId : point.hazard.areaId;
                const areaName = typeof area === 'object' && area !== null ? area.name : '';
                return areaName ? (
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Khu vực: {areaName}</div>
                ) : null;
              })()}
              {hasValidCoords && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Khối thông tin sức chứa Điểm Trú Ẩn */}
        {isShelter && shelterMetrics && (() => {
          const { capacity: cap, occupancy: occ, remaining, overloadCount, percent: pct, barPercent, isOverloaded } = shelterMetrics;

          return (
            <div
              style={{
                background: isOverloaded ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${isOverloaded ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: isOverloaded ? '#991b1b' : '#166534' }}>
                <Users size={14} />
                Tình trạng sức chứa hiện tại
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div style={{ background: '#ffffff', borderRadius: 8, padding: '6px 8px', border: `1px solid ${isOverloaded ? '#fecaca' : '#dcfce7'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{cap}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>Sức chứa</div>
                </div>
                <div style={{ background: '#ffffff', borderRadius: 8, padding: '6px 8px', border: `1px solid ${isOverloaded ? '#fecaca' : '#dcfce7'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isOverloaded ? '#b91c1c' : '#0284c7' }}>{occ}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>Đang ở</div>
                </div>
                <div style={{ background: '#ffffff', borderRadius: 8, padding: '6px 8px', border: `1px solid ${isOverloaded ? '#fecaca' : '#dcfce7'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isOverloaded ? '#b91c1c' : remaining > 0 ? '#16a34a' : '#dc2626' }}>
                    {isOverloaded ? `+${overloadCount}` : remaining}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>
                    {isOverloaded ? 'Quá tải thêm' : 'Còn trống'}
                  </div>
                </div>
              </div>
              {cap > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginBottom: 3 }}>
                    <span>Tỷ lệ sử dụng</span>
                    <strong style={{ color: isOverloaded ? '#991b1b' : pct >= 90 ? '#b91c1c' : '#0f172a' }}>
                      {pct}%{isOverloaded ? ' (Quá tải)' : ''}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: 6, background: isOverloaded ? '#fee2e2' : '#dcfce7', borderRadius: 999, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${barPercent}%`,
                        height: '100%',
                        background: pct >= 90 ? '#dc2626' : pct >= 60 ? '#f59e0b' : '#16a34a',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Khối mô tả & kiểm duyệt Điểm Nguy Hiểm */}
        {!isShelter && (
          <>
            {point.hazard.description && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '9px 11px',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                  Mô tả hiện trường
                </div>
                <div style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                  {point.hazard.description}
                </div>
              </div>
            )}

            {point.hazard.reviewNote && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 10,
                  padding: '8px 11px',
                  fontSize: 12,
                  color: '#92400e',
                  lineHeight: 1.4,
                }}
              >
                <strong>Ghi chú thẩm định:</strong> {point.hazard.reviewNote}
              </div>
            )}
          </>
        )}

        {/* Đơn vị / Người báo & Thời gian */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            fontSize: 11.5,
            color: '#475569',
            borderTop: '1px dashed #cbd5e1',
            paddingTop: 9,
          }}
        >
          {isShelter ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={13} color="#64748b" />
              <span>
                Đơn vị quản lý:{' '}
                <strong>
                  {typeof point.shelter.createdBy === 'object' && point.shelter.createdBy?.fullName
                    ? point.shelter.createdBy.fullName
                    : 'Ban chỉ huy PCTT địa phương'}
                </strong>
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} color="#64748b" />
              <span>
                Người báo tin:{' '}
                <strong>
                  {typeof point.hazard.reportedBy === 'object' && point.hazard.reportedBy?.fullName
                    ? point.hazard.reportedBy.fullName
                    : 'Hệ thống / Người dân'}
                </strong>
              </span>
            </div>
          )}

          {(isShelter ? point.shelter.createdAt : point.hazard.createdAt) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} color="#64748b" />
              <span>
                Cập nhật:{' '}
                {new Date((isShelter ? point.shelter.createdAt : point.hazard.createdAt) as string).toLocaleString('vi-VN')}
              </span>
            </div>
          )}

          {hasValidCoords && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#0f172a',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={13} />
              Mở vị trí trên Google Maps
            </a>
          )}
        </div>
      </div>
    </div>
  );
};


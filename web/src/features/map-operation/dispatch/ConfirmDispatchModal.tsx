import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Package,
  MapPin,
  Phone,
  Shield,
  Clock,
  Truck,
  Users,
  AlertCircle,
} from 'lucide-react';
import type { SosRequest, RescueTeam, Vehicle, DispatchSuggestedSupply } from '@/types/domainD';
import { FALLBACK_SUPPLIES } from '@/constants';
import type { EquipmentItem } from '@/api/equipment.api';

interface Props {
  isOpen: boolean;
  selectedSos: SosRequest;
  selectedTeams: RescueTeam[];
  vehicles: Vehicle[];
  allocatedSupplies?: Record<string, number>;
  areaSupplies?: EquipmentItem[];
  suggestedSupplies?: DispatchSuggestedSupply[];
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmDispatchModal: React.FC<Props> = ({
  isOpen,
  selectedSos,
  selectedTeams,
  vehicles,
  allocatedSupplies,
  areaSupplies = [],
  suggestedSupplies = [],
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  // Danh sách các mặt hàng vật tư đã cấp phát (> 0)
  const activeSupplies = Object.entries(allocatedSupplies || {}).filter(([_, qty]) => qty > 0);
  const totalSupplyUnits = activeSupplies.reduce((acc, [_, qty]) => acc + qty, 0);

  // Tính ETA tiếp cận dự kiến thực tế
  const estimatedEtaText = (() => {
    const sosWithGeo = selectedSos as SosRequest & { location?: { coordinates?: [number, number] } };
    const sosLat = selectedSos?.coordinates?.lat ?? sosWithGeo?.location?.coordinates?.[1];
    const sosLng = selectedSos?.coordinates?.lng ?? sosWithGeo?.location?.coordinates?.[0];
    if (typeof sosLat === 'number' && typeof sosLng === 'number') {
      const firstTeam = selectedTeams[0];
      const lead = firstTeam?.rescuers?.find(
        (r) => typeof r.coordinates?.lat === 'number' && typeof r.coordinates?.lng === 'number'
      );
      const origin = lead?.coordinates ?? firstTeam?.baseCoordinates;
      if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number') {
        const R = 6371;
        const dLat = ((sosLat - origin.lat) * Math.PI) / 180;
        const dLon = ((sosLng - origin.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((origin.lat * Math.PI) / 180) *
            Math.cos((sosLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const min = Math.max(3, Math.round((distKm / 25) * 60 + 2));
        return `~${min} phút (${distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km'})`;
      }
    }
    return '~5-7 phút';
  })();

  const modalContent = (
    <div
      data-modal-layer="confirm"
      className="sos-modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="sos-modal-window"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: '96vw',
          maxHeight: '92vh',
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          background: 'var(--dm-surface)',
          border: '1px solid var(--dm-border)',
        }}
      >
        {/* HEADER MODAL */}
        <div
          style={{
            background: 'var(--dm-surface)',
            borderBottom: '1px solid var(--dm-border)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'var(--dm-surface-subtle)',
                border: '1px solid var(--dm-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--dm-text-strong)',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--dm-text-strong)', letterSpacing: '-0.2px' }}>
                XÁC NHẬN PHÂN CÔNG ĐIỀU ĐỘNG CỨU HỘ
              </h3>
              <div style={{ fontSize: 11.5, color: 'var(--dm-text-body)', marginTop: 2, fontWeight: 400 }}>
                Kiểm tra thông tin hiện trường và lực lượng xuất kích trước khi phát lệnh
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--dm-surface)',
              border: '1px solid var(--dm-border)',
              borderRadius: 6,
              color: 'var(--dm-text-strong)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* NỘI DUNG CHÍNH (3 KHUNG CARD ĐÓNG GÓI RÕ RÀNG) */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: 'var(--dm-surface-subtle)',
          }}
        >
          {/* KHUNG 1: THÔNG TIN SỰ CỐ & HIỆN TRƯỜNG */}
          <div
            style={{
              background: 'var(--dm-surface)',
              border: '1px solid var(--dm-border)',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 1 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--dm-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--dm-text-strong)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <AlertCircle size={13.5} style={{ color: 'var(--dm-text-strong)' }} />
                <span>Thông tin sự cố &amp; Hiện trường</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    background: 'var(--dm-surface-subtle)',
                    color: 'var(--dm-text-strong)',
                    border: '1px solid var(--dm-border)',
                    padding: '2px 8px',
                    borderRadius: 5,
                    letterSpacing: '0.2px',
                  }}
                >
                  {selectedSos.sosCode}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--dm-surface-subtle)',
                    color: 'var(--dm-text-strong)',
                    border: '1px solid var(--dm-border)',
                    padding: '2px 7px',
                    borderRadius: 5,
                  }}
                >
                  {selectedSos.emergencyType}
                </span>
              </div>
            </div>

            {/* Thông tin nạn nhân & số điện thoại */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--dm-text-strong)' }}>
                  {selectedSos.citizenName || 'Người dân gặp nạn'}
                </span>
                {selectedSos.affectedPeople && (
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--dm-text-strong)',
                      background: 'var(--dm-surface-subtle)',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: '1px solid var(--dm-border)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Users size={11.5} style={{ color: 'var(--dm-text-strong)' }} />
                    <span>{selectedSos.affectedPeople} người gặp nạn</span>
                  </span>
                )}
              </div>

              {selectedSos.citizenPhone && (
                <a
                  href={`tel:${selectedSos.citizenPhone}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 800,
                    color: 'var(--dm-text-strong)',
                    textDecoration: 'none',
                    background: 'var(--dm-surface-subtle)',
                    padding: '2.5px 8px',
                    borderRadius: 5,
                    border: '1px solid var(--dm-border)',
                  }}
                >
                  <Phone size={11.5} style={{ color: 'var(--dm-text-strong)' }} />
                  <span>{selectedSos.citizenPhone}</span>
                </a>
              )}
            </div>

            {/* Vị trí hiện trường */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: 'var(--dm-text-strong)', lineHeight: 1.4 }}>
              <MapPin size={14} style={{ color: 'var(--dm-text-strong)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontWeight: 600 }}>{selectedSos.locationName}</span>
            </div>
          </div>

          {/* KHUNG 2: ĐỘI CỨU HỘ ĐƯỢC PHÂN CÔNG */}
          <div
            style={{
              background: 'var(--dm-surface)',
              border: '1px solid var(--dm-border)',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 2 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--dm-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--dm-text-strong)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <Shield size={13.5} style={{ color: 'var(--dm-text-strong)' }} />
                <span>Lực lượng điều động ({selectedTeams.length} đội)</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: 'var(--dm-text-strong)',
                  background: 'var(--dm-surface-subtle)',
                  border: '1px solid var(--dm-border)',
                  padding: '2px 8px',
                  borderRadius: 5,
                }}
              >
                <Clock size={11} style={{ color: 'var(--dm-text-strong)' }} />
                <span>
                  Dự kiến tiếp cận (ETA): <strong style={{ fontWeight: 800 }}>{estimatedEtaText}</strong>
                </span>
              </div>
            </div>

            {/* Danh sách các đội */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
              {selectedTeams.map((team, idx) => {
                const lead = team.rescuers?.[0];
                const teamVehs = (() => {
                  const matched = vehicles.filter((v) => v.teamId === team.id || v.id === (team as any).vehicleId);
                  const fromTeam = Array.isArray(team.vehicles) ? team.vehicles : [];
                  if (matched.length === 0) return fromTeam;
                  const byId = new Map<string, Vehicle>();
                  for (const v of [...matched, ...fromTeam]) {
                    if (v?.id && !byId.has(v.id)) byId.set(v.id, v);
                  }
                  return Array.from(byId.values());
                })();
                const vehName =
                  teamVehs.length > 0
                    ? teamVehs
                        .map((v) => {
                          const rawName = (v.name || 'Phương tiện').trim();
                          const plate = (v.plate || '').trim();
                          return plate && !rawName.toUpperCase().includes(plate.toUpperCase())
                            ? `${rawName} (${plate})`
                            : rawName;
                        })
                        .join(', ')
                    : 'Chưa gán phương tiện';
                const memberCount = team.rescuers?.length ?? team.availableRescuersCount ?? 0;

                return (
                  <div
                    key={team.id}
                    style={{
                      background: 'var(--dm-surface-subtle)',
                      border: '1px solid var(--dm-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ color: 'var(--dm-text-strong)', fontWeight: 800, fontSize: 13 }}>
                        {selectedTeams.length > 1 ? `${idx + 1}. ` : ''}{team.name}
                      </span>
                      {team.code && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dm-text-strong)', background: 'var(--dm-surface)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--dm-border)' }}>
                          {team.code}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4, fontSize: 12, color: 'var(--dm-text-strong)', fontWeight: 400 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={12} style={{ color: 'var(--dm-text-strong)' }} />
                        <span>
                          Chỉ huy: <strong style={{ fontWeight: 700, color: 'var(--dm-text-strong)' }}>{lead?.name || 'Trưởng đội'}</strong> ({memberCount} chiến sĩ)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Truck size={12} style={{ color: 'var(--dm-text-strong)' }} />
                        <span>
                          Phương tiện: <strong style={{ fontWeight: 700, color: 'var(--dm-text-strong)' }}>{vehName}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KHUNG 3: VẬT TƯ & HÀNG TIẾP TẾ CẤP PHÁT */}
          <div
            style={{
              background: 'var(--dm-surface)',
              border: '1px solid var(--dm-border)',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 3 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--dm-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--dm-text-strong)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <Package size={13.5} style={{ color: 'var(--dm-text-strong)' }} />
                <span>Vật tư &amp; Trang thiết bị cấp phát</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--dm-text-strong)',
                  background: 'var(--dm-surface-subtle)',
                  border: '1px solid var(--dm-border)',
                  padding: '1.5px 7px',
                  borderRadius: 4,
                }}
              >
                {totalSupplyUnits > 0 ? `${totalSupplyUnits} món` : 'Trang bị tiêu chuẩn'}
              </span>
            </div>

            {/* Chi tiết vật tư */}
            {totalSupplyUnits > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeSupplies.map(([id, qty]) => {
                  const areaItem = areaSupplies?.find((s) => s._id === id || (s as any).id === id);
                  const suggestedItem = suggestedSupplies?.find((s) => s.supplyId === id || s.name === id);
                  const fallbackItem = FALLBACK_SUPPLIES.find((s) => s.id === id);
                  const name = areaItem?.name || suggestedItem?.name || fallbackItem?.name || 'Vật tư cứu hộ';
                  const unit = areaItem?.unit || suggestedItem?.unit || fallbackItem?.unit || 'món';

                  return (
                    <div
                      key={id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'var(--dm-surface-subtle)',
                        border: '1px solid var(--dm-border)',
                        padding: '4px 9px',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--dm-text-strong)',
                        fontWeight: 600,
                      }}
                    >
                      <span>{name}</span>
                      <span
                        style={{
                          background: 'var(--dm-surface)',
                          border: '1px solid var(--dm-border)',
                          color: 'var(--dm-text-strong)',
                          fontWeight: 800,
                          fontSize: 11,
                          padding: '1px 5px',
                          borderRadius: 4,
                        }}
                      >
                        x{qty} {unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dm-text-strong)', fontWeight: 400, fontStyle: 'italic' }}>
                Chưa chọn cấp thêm vật tư từ kho (Đội xuất kích mang theo trang thiết bị cứu hộ tiêu chuẩn trên phương tiện).
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTION BUTTONS */}
        <div
          style={{
            padding: '12px 20px',
            background: 'var(--dm-surface)',
            borderTop: '1px solid var(--dm-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--dm-text-strong)',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}
          >
            Lệnh phân công sẽ truyền tức thời đến máy bộ đàm &amp; App cứu hộ
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'var(--dm-surface)',
                border: '1px solid var(--dm-border-strong)',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12.5,
                color: 'var(--dm-text-strong)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              HỦY BỎ
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                padding: '8px 18px',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={16} />
              <span style={{ whiteSpace: 'nowrap' }}>XÁC NHẬN PHÂN CÔNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
};

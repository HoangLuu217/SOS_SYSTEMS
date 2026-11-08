import React from 'react';
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
import type { SosRequest, RescueTeam, Vehicle } from '@/types/domainD';
import { FALLBACK_SUPPLIES } from '@/constants';
import type { EquipmentItem } from '@/api/equipment.api';

interface Props {
  isOpen: boolean;
  selectedSos: SosRequest;
  selectedTeams: RescueTeam[];
  vehicles: Vehicle[];
  allocatedSupplies?: Record<string, number>;
  areaSupplies?: EquipmentItem[];
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
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  // Danh sách các mặt hàng vật tư đã cấp phát (> 0)
  const activeSupplies = Object.entries(allocatedSupplies || {}).filter(([_, qty]) => qty > 0);
  const totalSupplyUnits = activeSupplies.reduce((acc, [_, qty]) => acc + qty, 0);

  // Tính ETA tiếp cận dự kiến thực tế
  const estimatedEtaText = (() => {
    const sosLat = selectedSos?.coordinates?.lat ?? (selectedSos as any)?.location?.coordinates?.[1];
    const sosLng = selectedSos?.coordinates?.lng ?? (selectedSos as any)?.location?.coordinates?.[0];
    if (typeof sosLat === 'number' && typeof sosLng === 'number') {
      const firstTeam = selectedTeams[0];
      const lead = firstTeam?.rescuers?.find((r) => r.coordinates?.lat && r.coordinates?.lng);
      if (lead?.coordinates) {
        const R = 6371;
        const dLat = ((sosLat - lead.coordinates.lat) * Math.PI) / 180;
        const dLon = ((sosLng - lead.coordinates.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lead.coordinates.lat * Math.PI) / 180) *
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

  return (
    <div
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
          background: '#ffffff',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* HEADER MODAL */}
        <div
          style={{
            background: 'linear-gradient(to right, #fef2f2, #fff1f2)',
            borderBottom: '1.5px solid #fecaca',
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
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#991b1b', letterSpacing: '-0.2px' }}>
                XÁC NHẬN PHÂN CÔNG ĐIỀU ĐỘNG CỨU HỘ
              </h3>
              <div style={{ fontSize: 11.5, color: '#7f1d1d', marginTop: 1, fontWeight: 600 }}>
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
              background: '#ffffff',
              border: '1px solid #fecaca',
              borderRadius: 6,
              color: '#64748b',
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
            background: '#f8fafc',
          }}
        >
          {/* KHUNG 1: THÔNG TIN SỰ CỐ & HIỆN TRƯỜNG */}
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 1 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <AlertCircle size={13.5} style={{ color: '#dc2626' }} />
                <span>Thông tin sự cố &amp; Hiện trường</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
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
                    fontWeight: 800,
                    background: '#eff6ff',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                  {selectedSos.citizenName || 'Người dân gặp nạn'}
                </span>
                {selectedSos.affectedPeople && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#b91c1c',
                      background: '#fef2f2',
                      padding: '1.5px 6px',
                      borderRadius: 4,
                      border: '1px solid #fecaca',
                    }}
                  >
                    🚨 {selectedSos.affectedPeople} người gặp nạn
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
                    fontWeight: 700,
                    color: '#0284c7',
                    textDecoration: 'none',
                    background: '#f0f9ff',
                    padding: '2.5px 8px',
                    borderRadius: 5,
                    border: '1px solid #bae6fd',
                  }}
                >
                  <Phone size={11} />
                  <span>{selectedSos.citizenPhone}</span>
                </a>
              )}
            </div>

            {/* Vị trí hiện trường */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: '#1e293b', lineHeight: 1.4 }}>
              <MapPin size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontWeight: 600 }}>{selectedSos.locationName}</span>
            </div>
          </div>

          {/* KHUNG 2: ĐỘI CỨU HỘ ĐƯỢC PHÂN CÔNG */}
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #bfdbfe',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 2 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed #dbeafe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <Shield size={13.5} style={{ color: '#0284c7' }} />
                <span>Lực lượng điều động ({selectedTeams.length} đội)</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#15803d',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '2px 7px',
                  borderRadius: 5,
                }}
              >
                <Clock size={11} />
                <span>Dự kiến tiếp cận (ETA): {estimatedEtaText}</span>
              </div>
            </div>

            {/* Danh sách các đội */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
              {selectedTeams.map((team, idx) => {
                const lead = team.rescuers?.[0];
                const veh = vehicles.find((v) => v.teamId === team.id || v.id === (team as any).vehicleId) || vehicles[0];
                const vehName = veh ? `${veh.name}${veh.plate ? ` (${veh.plate})` : ''}` : 'Phương tiện chuyên dụng';

                return (
                  <div
                    key={team.id}
                    style={{
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ color: '#0369a1', fontWeight: 900, fontSize: 13 }}>
                        {selectedTeams.length > 1 ? `${idx + 1}. ` : ''}{team.name}
                      </span>
                      {(team as any).code && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0284c7', background: '#ffffff', padding: '1px 6px', borderRadius: 4, border: '1px solid #bae6fd' }}>
                          {(team as any).code}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4, fontSize: 12, color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={12} style={{ color: '#64748b' }} />
                        <span>Chỉ huy: <strong style={{ color: '#0f172a' }}>{lead?.name || 'Trưởng đội'}</strong> ({team.availableRescuersCount || team.rescuers?.length || 4} chiến sĩ)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Truck size={12} style={{ color: '#64748b' }} />
                        <span>Phương tiện: <strong style={{ color: '#0f172a' }}>{vehName}</strong></span>
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
              background: totalSupplyUnits > 0 ? '#f0fdf4' : '#ffffff',
              border: totalSupplyUnits > 0 ? '1.5px solid #86efac' : '1.5px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Header khung 3 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: totalSupplyUnits > 0 ? '1px dashed #bbf7d0' : '1px dashed #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: totalSupplyUnits > 0 ? '#166534' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <Package size={13.5} style={{ color: totalSupplyUnits > 0 ? '#16a34a' : '#64748b' }} />
                <span>Vật tư &amp; Trang thiết bị cấp phát</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: totalSupplyUnits > 0 ? '#15803d' : '#64748b',
                  background: totalSupplyUnits > 0 ? '#dcfce7' : '#f1f5f9',
                  border: totalSupplyUnits > 0 ? '1px solid #86efac' : '1px solid #e2e8f0',
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
                  const item = areaSupplies?.find((s) => s._id === id || (s as any).id === id) || FALLBACK_SUPPLIES.find((s) => s.id === id);
                  const name = item?.name || 'Vật tư cứu hộ';
                  const unit = item?.unit || 'món';

                  return (
                    <div
                      key={id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: '#ffffff',
                        border: '1px solid #86efac',
                        padding: '4px 9px',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#166534',
                        fontWeight: 700,
                      }}
                    >
                      <span>{name}</span>
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontWeight: 900,
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
              <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                Chưa chọn cấp thêm vật tư từ kho (Đội xuất kích mang theo trang thiết bị cứu hộ tiêu chuẩn trên phương tiện).
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTION BUTTONS */}
        <div
          style={{
            padding: '12px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
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
              color: '#64748b',
              fontWeight: 600,
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
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12.5,
                color: '#475569',
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
                boxShadow: '0 3px 10px rgba(220, 38, 38, 0.35)',
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
};

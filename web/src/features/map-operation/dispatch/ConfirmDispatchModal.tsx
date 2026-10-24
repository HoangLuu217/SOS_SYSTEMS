import React from 'react';
import { AlertTriangle, CheckCircle2, X, Package } from 'lucide-react';
import type { SosRequest, RescueTeam, Vehicle } from '@/types/domainD';
import { FALLBACK_SUPPLIES } from '@/constants';

interface Props {
  isOpen: boolean;
  selectedSos: SosRequest;
  selectedTeams: RescueTeam[];
  vehicles: Vehicle[];
  allocatedSupplies?: Record<string, number>;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmDispatchModal: React.FC<Props> = ({
  isOpen,
  selectedSos,
  selectedTeams,
  vehicles,
  allocatedSupplies,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="sos-modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ zIndex: 10000 }}
    >
      <div
        className="sos-modal-window"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 540, maxWidth: '94vw', borderRadius: 12, overflow: 'hidden' }}
      >
        <div className="sos-modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#dc2626' }}>
            <AlertTriangle size={20} />
            <h3 className="sos-modal-title" style={{ color: '#b91c1c', margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '0.2px' }}>
              XÁC NHẬN ĐIỀU ĐỘNG CỨU HỘ KHẨN CẤP
            </h3>
          </div>
          <button
            type="button"
            className="sos-modal-close-icon"
            onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={17} />
          </button>
        </div>

        <div className="sos-modal-content" style={{ gap: 14, padding: '18px 22px' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--sos-text-secondary)', lineHeight: 1.55 }}>
            Bạn đang chuẩn bị xuất kích lệnh điều động cứu hộ chính thức cho tín hiệu:
          </p>

          <div
            style={{
              background: 'var(--sos-surface-subtle)',
              padding: '14px 16px',
              borderRadius: 9,
              border: '1px solid var(--sos-border)',
              fontSize: 13.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#0f172a' }}>Mã sự cố:</strong>{' '}
              <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 14.5 }}>{selectedSos.sosCode}</span>{' '}
              <span style={{ color: 'var(--sos-text-secondary)', fontWeight: 600 }}>({selectedSos.emergencyType})</span>
            </div>
            <div>
              <strong style={{ color: '#0f172a' }}>Địa điểm đến:</strong> {selectedSos.locationName}
            </div>
            <div>
              <strong style={{ color: '#0f172a' }}>Số người gặp nạn:</strong>{' '}
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedSos.affectedPeople} người</span>
            </div>

            {allocatedSupplies && Object.entries(allocatedSupplies).some(([_, qty]) => qty > 0) && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 8,
                  padding: '9px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                  <Package size={13.5} />
                  <span>Vật tư &amp; Hàng cứu trợ mang theo xuất kích:</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#15803d', lineHeight: 1.45 }}>
                  {Object.entries(allocatedSupplies)
                    .filter(([_, qty]) => qty > 0)
                    .map(([id, qty]) => {
                      const item = FALLBACK_SUPPLIES.find((s) => s.id === id);
                      return `${item?.name || 'Vật tư'} (${qty} ${item?.unit || 'món'})`;
                    })
                    .join(' • ')}
                </div>
              </div>
            )}

            <div style={{ height: 1, background: 'var(--sos-border)', margin: '4px 0' }} />

            <div>
              <strong style={{ color: '#0f172a', fontSize: 13.5 }}>
                Đội cứu nạn xuất kích ({selectedTeams.length} đội):
              </strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {selectedTeams.map((team, idx) => {
                const lead = team.rescuers[0];
                const veh = vehicles.find((v) => v.teamId === team.id) || vehicles[0];
                return (
                  <div
                    key={team.id}
                    style={{
                      background: 'rgba(2, 132, 199, 0.06)',
                      border: '1px solid #bae6fd',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ color: '#0284c7', fontWeight: 800, fontSize: 14 }}>
                      {idx + 1}. {team.name}
                    </div>
                    <div style={{ color: 'var(--sos-text-secondary)', fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                      Chỉ huy: <strong style={{ color: '#0f172a' }}>{lead?.name || 'Trưởng đội'}</strong> ({team.availableRescuersCount || 4} chiến sĩ) • Phương tiện: <strong style={{ color: '#0f172a' }}>{veh?.name || 'Ca-nô'}</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 3, fontSize: 13.5 }}>
              <strong style={{ color: '#0f172a' }}>Thời gian dự kiến tiếp cận (ETA):</strong>{' '}
              <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 14 }}>~5-7 phút</span>
            </div>
          </div>
        </div>

        <div className="sos-modal-footer" style={{ padding: '12px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{
              padding: '9px 16px',
              background: 'var(--sos-surface)',
              border: '1px solid var(--sos-border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--sos-text-secondary)',
            }}
          >
            HỦY BỎ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '9px 18px',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 13.5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
            }}
          >
            <CheckCircle2 size={16} />
            <span>XÁC NHẬN & XUẤT KÍCH NGAY</span>
          </button>
        </div>
      </div>
    </div>
  );
};

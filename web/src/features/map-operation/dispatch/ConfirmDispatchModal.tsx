import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { SosRequest, RescueTeam, Vehicle } from '@/types/domainD';

interface Props {
  isOpen: boolean;
  selectedSos: SosRequest;
  selectedTeams: RescueTeam[];
  vehicles: Vehicle[];
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmDispatchModal: React.FC<Props> = ({
  isOpen,
  selectedSos,
  selectedTeams,
  vehicles,
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
        style={{ width: 480, maxWidth: '92vw' }}
      >
        <div className="sos-modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#dc2626' }}>
            <AlertTriangle size={18} />
            <h3 className="sos-modal-title" style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>
              XÁC NHẬN ĐIỀU ĐỘNG CỨU HỘ KHẨN CẤP
            </h3>
          </div>
          <button
            type="button"
            className="sos-modal-close-icon"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        <div className="sos-modal-content" style={{ gap: 10, padding: '14px 18px' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sos-text-secondary)', lineHeight: 1.45 }}>
            Bạn đang chuẩn bị xuất kích lệnh điều động cứu hộ chính thức cho tín hiệu:
          </p>

          <div
            style={{
              background: 'var(--sos-surface-subtle)',
              padding: '10px 12px',
              borderRadius: 7,
              border: '1px solid var(--sos-border)',
              fontSize: 11.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div>
              <strong>Mã sự cố:</strong> <span style={{ color: '#dc2626', fontWeight: 700 }}>{selectedSos.sosCode}</span> ({selectedSos.emergencyType})
            </div>
            <div>
              <strong>Địa điểm đến:</strong> {selectedSos.locationName}
            </div>
            <div>
              <strong>Số người gặp nạn:</strong> {selectedSos.affectedPeople} người
            </div>
            <div style={{ height: 1, background: 'var(--sos-border)', margin: '3px 0' }} />
            <div>
              <strong>Đội cứu nạn xuất kích ({selectedTeams.length} đội):</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {selectedTeams.map((team, idx) => {
                const lead = team.rescuers[0];
                const veh = vehicles.find((v) => v.teamId === team.id) || vehicles[0];
                return (
                  <div
                    key={team.id}
                    style={{
                      background: 'rgba(2, 132, 199, 0.06)',
                      border: '1px solid #bae6fd',
                      borderRadius: 6,
                      padding: '7px 10px',
                    }}
                  >
                    <div style={{ color: '#0284c7', fontWeight: 700, fontSize: 12 }}>
                      {idx + 1}. {team.name}
                    </div>
                    <div style={{ color: 'var(--sos-text-secondary)', fontSize: 11, marginTop: 2 }}>
                      Chỉ huy: <strong>{lead?.name || 'Trưởng đội'}</strong> ({team.availableRescuersCount || 4} chiến sĩ) • Phương tiện: <strong>{veh?.name || 'Ca-nô'}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 2 }}>
              <strong>Thời gian dự kiến tiếp cận (ETA):</strong>{' '}
              <span style={{ color: '#16a34a', fontWeight: 700 }}>~5-7 phút</span>
            </div>
          </div>
        </div>

        <div className="sos-modal-footer" style={{ padding: '10px 18px' }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{
              padding: '7px 12px',
              background: 'var(--sos-surface)',
              border: '1px solid var(--sos-border)',
              borderRadius: 5,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 11.5,
              color: 'var(--sos-text-secondary)',
            }}
          >
            HỦY BỎ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '7px 14px',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 11.5,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <CheckCircle2 size={13} />
            <span>XÁC NHẬN & XUẤT KÍCH NGAY</span>
          </button>
        </div>
      </div>
    </div>
  );
};

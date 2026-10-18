import React from 'react';
import { Phone, RefreshCw, XCircle } from 'lucide-react';
import type { SosRequest, SosAssignment, RescueTeam, Vehicle } from '@/types/domainD';

interface Props {
  assignment: SosAssignment | null;
  selectedSos: SosRequest;
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
  onOpenReassign: () => void;
  onOpenCancel: () => void;
}

export const ActiveMissionConsole: React.FC<Props> = ({
  assignment,
  selectedSos,
  rescueTeams,
  vehicles,
  onOpenReassign,
  onOpenCancel,
}) => {
  const assignedRescuer = rescueTeams
    .flatMap((t) => t.rescuers)
    .find((r) => r.id === assignment?.rescuerId);
  const rescuerPhone = assignedRescuer?.phone || '0905-114-115';

  const assignedVehicle = vehicles.find((v) => v.id === assignment?.vehicleId);
  const vehiclePlate = assignedVehicle?.plate || '43C-554.12';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Top Status Card */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 6,
          background: 'var(--sos-surface-subtle)',
          border: '1px solid var(--sos-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#15803d' }}>
            {assignment?.status === 'ASSIGNED' || assignment?.status === 'ACCEPTED'
              ? 'Đã điều động • Đang xuất phát'
              : assignment?.status === 'ON_THE_WAY'
              ? 'Đang di chuyển đến điểm cứu nạn'
              : assignment?.status === 'ARRIVED'
              ? 'Đã tiếp cận vị trí ngập'
              : assignment?.status === 'RESCUING'
              ? 'Đang tiến hành ứng cứu'
              : 'Đã hoàn thành cứu nạn'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--sos-text-muted)', marginTop: 2 }}>
            Định vị GPS trực tiếp từ đội cứu hộ
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sos-text-primary)' }}>
            ~{assignment?.etaMinutes ?? 7}p
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--sos-text-muted)', fontWeight: 600 }}>
            DỰ KIẾN ĐẾN
          </div>
        </div>
      </div>

      {/* Rescuer & Vehicle Card */}
      <div
        style={{
          padding: '12px 13px',
          borderRadius: 8,
          background: 'var(--sos-surface)',
          border: '1px solid var(--sos-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Rescuer Officer Profile */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: '#1e293b',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {assignment?.rescuerName ? assignment.rescuerName.charAt(0) : 'C'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sos-text-primary)' }}>
                  {assignment?.rescuerName || 'Cứu Hộ Viên'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 1 }}>
                {assignment?.rescuerRole || 'Chỉ Huy'} • <strong>{assignment?.rescueTeamName}</strong>
              </div>
            </div>
          </div>

          {/* Call Rescuer Button */}
          <a
            href={`tel:${rescuerPhone}`}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: 'var(--sos-surface-subtle)',
              border: '1px solid var(--sos-border)',
              color: 'var(--sos-text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flexShrink: 0,
            }}
            title={`Gọi cho đội cứu hộ: ${rescuerPhone}`}
          >
            <Phone size={14} />
          </a>
        </div>

        {/* Vehicle Plate & Specs */}
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--sos-surface-subtle)',
            border: '1px solid var(--sos-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
          }}
        >
          <div>
            <strong style={{ color: 'var(--sos-text-primary)' }}>{assignment?.vehicleName}</strong>
            <div style={{ fontSize: 10, color: 'var(--sos-text-muted)' }}>
              Sức chứa: {assignment?.vehicleCapacity || '6 người'}
            </div>
          </div>

          <div
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--sos-surface)',
              border: '1px solid var(--sos-border)',
              color: 'var(--sos-text-primary)',
              fontWeight: 700,
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            {vehiclePlate}
          </div>
        </div>

        {/* Trip Route Tracker (A -> B) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingTop: 4,
          }}
        >
          {/* Point A: Base */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 0 1px #10b981',
                }}
              />
              <div style={{ width: 1.5, height: 26, background: '#cbd5e1', margin: '2px 0' }} />
            </div>
            <div style={{ flex: 1, fontSize: 11 }}>
              <div style={{ color: 'var(--sos-text-muted)', fontSize: 10 }}>Điểm xuất phát (Trạm cứu hộ):</div>
              <div style={{ fontWeight: 700, color: 'var(--sos-text-primary)' }}>
                {assignment?.authorityOrganizationName || 'Trạm Chỉ Huy PCCC & TKCN'}
              </div>
            </div>
          </div>

          {/* Point B: Destination (Citizen distress) */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 14, display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 0 1px #ef4444',
                }}
              />
            </div>
            <div style={{ flex: 1, fontSize: 11 }}>
              <div style={{ color: 'var(--sos-text-muted)', fontSize: 10 }}>Điểm cứu nạn (Vị trí gặp nạn):</div>
              <div style={{ fontWeight: 800, color: '#dc2626' }}>
                {selectedSos.locationName}, {selectedSos.wardName}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--sos-text-secondary)', marginTop: 1 }}>
                Nạn nhân: <strong>{selectedSos.citizenName}</strong> • {selectedSos.citizenPhone} ({selectedSos.affectedPeople} người)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions: Reassign & Cancel */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReassign();
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'var(--sos-surface)',
            border: '1px solid var(--sos-border)',
            borderRadius: 6,
            color: 'var(--sos-text-primary)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <RefreshCw size={13} />
          <span>Đổi đội cứu hộ</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCancel();
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <XCircle size={13} />
          <span>Hủy điều động</span>
        </button>
      </div>
    </div>
  );
};

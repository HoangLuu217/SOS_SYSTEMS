import React, { useMemo } from 'react';
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

  // Xác định trạng thái tác chiến chính xác, tránh trường hợp PENDING bị rơi vào else (Đã hoàn thành)
  const statusInfo = useMemo(() => {
    const aStatus = String(assignment?.status || '').toUpperCase();
    const sStatus = String(selectedSos?.status || '').toUpperCase();

    // 1. Hoàn thành
    if (aStatus === 'COMPLETED' || sStatus === 'COMPLETED') {
      return {
        text: 'Đã hoàn thành cứu nạn',
        subText: 'Nhiệm vụ cứu hộ kết thúc thành công',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: true,
      };
    }

    // 2. Đang tiến hành cứu hộ tại chỗ
    if (['RESCUING', 'IN_PROGRESS', 'ON_SCENE_RESCUING'].includes(aStatus) || sStatus === 'RESCUING') {
      return {
        text: 'Đang tiến hành ứng cứu tại chỗ',
        subText: 'Đội đang hỗ trợ đưa người dân lên ca-nô an toàn',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 3. Đã tiếp cận hiện trường
    if (['ARRIVED', 'ON_SCENE'].includes(aStatus) || sStatus === 'ARRIVED') {
      return {
        text: 'Đã tiếp cận vị trí ngập',
        subText: 'Đội đã có mặt tại hiện trường cứu nạn',
        bg: '#eff6ff',
        border: '#93c5fd',
        textColor: '#1d4ed8',
        dotColor: '#2563eb',
        isCompleted: false,
      };
    }

    // 4. Đang di chuyển đến điểm cứu nạn
    if (['ON_THE_WAY', 'EN_ROUTE', 'ON_WAY'].includes(aStatus) || sStatus === 'ON_THE_WAY') {
      return {
        text: 'Đang di chuyển đến điểm cứu nạn',
        subText: 'Định vị GPS trực tiếp từ đội cứu hộ',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 5. Đã chấp nhận lệnh
    if (aStatus === 'ACCEPTED') {
      return {
        text: 'Đội đã nhận lệnh • Đang xuất phát',
        subText: 'Ca-nô & lực lượng đang xuất kích tiếp cận',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 6. Mặc định khi vừa điều động / Chờ đội nhận lệnh (PENDING, ASSIGNED)
    return {
      text: 'Chờ đội chấp nhận nhiệm vụ',
      subText: 'Đang truyền lệnh đến máy cứu hộ viên, chờ phản hồi',
      bg: '#fffbeb',
      border: '#fde68a',
      textColor: '#b45309',
      dotColor: '#f59e0b',
      isCompleted: false,
    };
  }, [assignment?.status, selectedSos?.status]);

  const isAcceptedByTeam = useMemo(() => {
    const aStatus = String(assignment?.status || '').toUpperCase();
    return ['ACCEPTED', 'EN_ROUTE', 'ON_THE_WAY', 'ON_WAY', 'ARRIVED', 'ON_SCENE', 'IN_PROGRESS', 'RESCUING', 'COMPLETED'].includes(aStatus);
  }, [assignment?.status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* MAIN ASSIGNED FORCE & TRIP ROUTE CARD WITH INTEGRATED STATUS */}
      <div
        style={{
          borderRadius: 12,
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          overflow: 'hidden',
          boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Integrated Header: Section Title + Live Status + ETA */}
        <div
          style={{
            padding: '10px 14px',
            background: statusInfo.bg,
            borderBottom: `1.5px solid ${statusInfo.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusInfo.dotColor,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', lineHeight: 1.2 }}>
                Lực Lượng Tác Chiến Tiếp Cận
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 900,
                  color: statusInfo.textColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 1,
                }}
              >
                {statusInfo.text}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {statusInfo.isCompleted ? (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: '#15803d',
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  padding: '3px 8px',
                  borderRadius: 6,
                }}
              >
                ✓ HOÀN TẤT
              </span>
            ) : (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  padding: '3px 8px',
                  borderRadius: 7,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: '#0284c7' }}>
                  ~{assignment?.etaMinutes ?? 7}p
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', letterSpacing: '0.3px' }}>
                  DỰ KIẾN
                </span>
              </div>
            )}
          </div>
        </div>

        {/* MỤC THEO DÕI: TEAM ĐÃ CHẤP NHẬN NHIỆM VỤ HAY CHƯA */}
        <div
          style={{
            padding: '9px 14px',
            background: isAcceptedByTeam ? '#f0fdf4' : '#fffbeb',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isAcceptedByTeam ? '#16a34a' : '#f59e0b',
                boxShadow: isAcceptedByTeam ? '0 0 0 2.5px rgba(22, 163, 74, 0.25)' : '0 0 0 2.5px rgba(245, 158, 11, 0.3)',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: isAcceptedByTeam ? '#15803d' : '#b45309',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                {isAcceptedByTeam ? '✓ Đội cứu hộ đã chấp nhận nhiệm vụ' : '⏳ Chờ đội chấp nhận nhiệm vụ'}
              </div>
              <div style={{ fontSize: 11, color: isAcceptedByTeam ? '#166534' : '#92400e', marginTop: 1, lineHeight: 1.3 }}>
                {isAcceptedByTeam
                  ? 'Đội đã nhận lệnh và đang xuất phát tiếp cận vị trí ngập.'
                  : 'Chưa bấm tiếp nhận trên App. Quá 3 phút hãy đổi đội cứu hộ!'}
              </div>
            </div>
          </div>

          {!isAcceptedByTeam && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReassign();
              }}
              style={{
                padding: '4px 9px',
                background: '#ffffff',
                border: '1.5px solid #f59e0b',
                borderRadius: 6,
                color: '#b45309',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: '0 1px 2px rgba(245,158,11,0.1)',
              }}
              title="Đổi sang đội cứu hộ khác sẵn sàng nhận lệnh"
            >
              Đổi đội khác
            </button>
          )}
        </div>

        {/* 2A: Rescuer Leader Profile */}
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 800,
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)',
              }}
            >
              {assignment?.rescuerName ? assignment.rescuerName.charAt(0) : 'L'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px' }}>
                {assignment?.rescuerName || 'Lê Cứu Nạn'}
              </div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 2, fontWeight: 700, lineHeight: 1.35 }}>
                <span style={{ color: '#0284c7' }}>{assignment?.rescuerRole || 'LEADER'}</span>
                <span> • </span>
                <span>{assignment?.rescueTeamName || 'Đội Phản Ứng Nhanh Cứu Hộ Phường Liên Chiểu (43-LC-01)'}</span>
              </div>
            </div>
          </div>

          {/* Hotline Call Button */}
          <a
            href={`tel:${rescuerPhone}`}
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: '#f0f9ff',
              border: '1.5px solid #bae6fd',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title={`Gọi cho đội cứu hộ: ${rescuerPhone}`}
          >
            <Phone size={17} />
          </a>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#e2e8f0' }} />

        {/* 2B: Assigned Vehicle Specs */}
        <div
          style={{
            padding: '12px 16px',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>
              {assignment?.vehicleName || 'Ca-nô cứu hộ'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
              Sức chứa:{' '}
              <strong style={{ color: '#334155' }}>
                {String(assignment?.vehicleCapacity || '6').includes('chiến sĩ') ||
                String(assignment?.vehicleCapacity || '6').includes('người')
                  ? assignment?.vehicleCapacity
                  : `${assignment?.vehicleCapacity || '6'} người`}
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              color: '#0f172a',
              fontWeight: 900,
              fontFamily: 'monospace',
              fontSize: 13.5,
              letterSpacing: '0.5px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {vehiclePlate}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#e2e8f0' }} />

        {/* 2C: Tactical Route Stepper (Point A -> Point B) */}
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Point A: Base Station */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 0 0 2px #10b981',
                }}
              />
              <div style={{ width: 2, height: 32, background: '#cbd5e1', margin: '3px 0' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#64748b', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Điểm Xuất Phát (Trạm Cứu Hộ):
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                {assignment?.authorityOrganizationName || 'Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu'}
              </div>
            </div>
          </div>

          {/* Point B: Destination (Victim Distress Location) */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 16, display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 0 0 2px #ef4444',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#dc2626', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Điểm Cứu Nạn (Vị Trí Gặp Nạn):
              </div>
              <div style={{ fontWeight: 900, color: '#dc2626', fontSize: 14.5, marginTop: 2, lineHeight: 1.4 }}>
                {selectedSos.locationName}
              </div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 3, fontWeight: 700 }}>
                Nạn nhân: <strong style={{ color: '#0f172a' }}>{selectedSos.citizenName}</strong> • {selectedSos.citizenPhone} (<span style={{ color: '#dc2626' }}>{selectedSos.affectedPeople} người</span>)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TACTICAL ACTION BUTTONS */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReassign();
          }}
          style={{
            flex: 1,
            height: 44,
            padding: '0 14px',
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: 9,
            color: '#0f172a',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={15} style={{ color: '#0284c7' }} />
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
            height: 44,
            padding: '0 14px',
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            borderRadius: 9,
            color: '#dc2626',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            boxShadow: '0 1px 2px rgba(220,38,38,0.05)',
            transition: 'all 0.15s ease',
          }}
        >
          <XCircle size={16} />
          <span>Hủy điều động</span>
        </button>
      </div>
    </div>
  );
};

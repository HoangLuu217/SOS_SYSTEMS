import { useState, useEffect } from 'react';
import {
  RefreshCw,
  XCircle,
  Phone,
  Sliders,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  AuthorityOrganization,
  AssignmentStatus,
  AuthorityOfficer,
} from '../../types/domainD';
import { useApp } from '../../context/AppContext';

interface Props {
  selectedSos: SosRequest;
  assignment: SosAssignment | null;
  authorities: AuthorityOrganization[];
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
  activeOfficer?: AuthorityOfficer;
  onConfirmAssign: (params: {
    authorityOrganizationId: string;
    authorityOrganizationName: string;
    rescueTeamId: string;
    rescueTeamName: string;
    rescuerId: string;
    rescuerName: string;
    rescuerRole: string;
    vehicleId: string;
    vehicleName: string;
    vehicleCapacity: string;
  }) => void;
  onUpdateStatus: (assignmentId: string, nextStatus: AssignmentStatus) => void;
  onOpenReassign: () => void;
  onOpenCancel: () => void;
  onToggleCollapse?: () => void;
}

const LIFECYCLE_STEPS: { status: AssignmentStatus; labelVi: string; labelEn: string; icon: string }[] = [
  { status: 'ASSIGNED', labelVi: '1. ĐÃ LỆNH', labelEn: '1. ASSIGNED', icon: '📋' },
  { status: 'ACCEPTED', labelVi: '2. TIẾP NHẬN', labelEn: '2. ACCEPTED', icon: '📡' },
  { status: 'ON_THE_WAY', labelVi: '3. XUẤT PHÁT', labelEn: '3. EN ROUTE', icon: '🚤' },
  { status: 'ARRIVED', labelVi: '4. ĐẾN NƠI', labelEn: '4. ARRIVED', icon: '📍' },
  { status: 'RESCUING', labelVi: '5. CỨU NẠN', labelEn: '5. RESCUING', icon: '🏊' },
  { status: 'COMPLETED', labelVi: '6. HOÀN THÀNH', labelEn: '6. COMPLETED', icon: '✅' },
];

export const DispatchWorkflow = ({
  selectedSos,
  assignment,
  authorities,
  rescueTeams,
  vehicles,
  activeOfficer,
  onConfirmAssign,
  onUpdateStatus,
  onOpenReassign,
  onOpenCancel,
  onToggleCollapse,
}: Props) => {
  const { lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';

  // District scoping: determine which district this SOS belongs to
  const officerAreaId = !isAdmin ? activeOfficer?.jurisdictionAreaId : undefined;
  const targetDistrictId = selectedSos.districtId || (officerAreaId && !officerAreaId.startsWith('area-h') ? officerAreaId : 'area-hc');

  // Available rescue teams filtered by ward or district
  const districtFilteredTeams = rescueTeams.filter((t) => {
    // 1. Direct match with ward
    if (officerAreaId && (t as any).wardId === officerAreaId) return true;
    if (selectedSos.wardId && (t as any).wardId === selectedSos.wardId) return true;
    // 2. Match parent district
    if (targetDistrictId && t.districtId === targetDistrictId) return true;
    return false;
  });
  const availableTeams = districtFilteredTeams.length > 0 ? districtFilteredTeams : rescueTeams;

  // Selected team state
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    assignment?.rescueTeamId || availableTeams[0]?.id || ''
  );
  const [showAdvancedCrew, setShowAdvancedCrew] = useState<boolean>(false);

  // Active selected team
  const currentTeam = availableTeams.find((t) => t.id === selectedTeamId) || availableTeams[0];

  // Rescuers under this team
  const availableRescuers = currentTeam?.rescuers || [];
  const [selectedRescuerId, setSelectedRescuerId] = useState<string>(
    assignment?.rescuerId || availableRescuers[0]?.id || ''
  );
  const currentRescuer =
    availableRescuers.find((r) => r.id === selectedRescuerId) || availableRescuers[0];

  // Vehicles under this team
  const teamVehicles = vehicles.filter((v) => v.teamId === currentTeam?.id);
  const availableVehicles = teamVehicles.length > 0 ? teamVehicles : vehicles;
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    assignment?.vehicleId || availableVehicles[0]?.id || ''
  );
  const currentVehicle =
    availableVehicles.find((v) => v.id === selectedVehicleId) || availableVehicles[0];

  // Matched authority for the SOS
  const matchedAuthority =
    authorities.find((a) => a.id === currentTeam?.authorityOrganizationId) ||
    authorities.find(
      (a) => a.areaId === selectedSos.wardId || a.areaIds?.includes(selectedSos.wardId)
    ) ||
    authorities[0];

  // Reset when selectedSos changes or assignment changes
  useEffect(() => {
    if (assignment) {
      setSelectedTeamId(assignment.rescueTeamId);
      setSelectedRescuerId(assignment.rescuerId);
      setSelectedVehicleId(assignment.vehicleId);
    } else {
      const initialTeam = availableTeams[0];
      setSelectedTeamId(initialTeam?.id || '');
      if (initialTeam?.rescuers.length > 0) {
        setSelectedRescuerId(initialTeam.rescuers[0].id);
      }
      const initialVehs = vehicles.filter((v) => v.teamId === initialTeam?.id);
      setSelectedVehicleId(initialVehs[0]?.id || availableVehicles[0]?.id || '');
    }
  }, [selectedSos.id, assignment?.id]);

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    const newTeam = rescueTeams.find((t) => t.id === teamId);
    if (newTeam && newTeam.rescuers.length > 0) {
      setSelectedRescuerId(newTeam.rescuers[0].id);
    }
    const newTeamVehicles = vehicles.filter((v) => v.teamId === teamId);
    if (newTeamVehicles.length > 0) {
      setSelectedVehicleId(newTeamVehicles[0].id);
    }
  };

  const handleAssignClick = () => {
    if (!currentTeam || !currentRescuer || !currentVehicle) return;

    onConfirmAssign({
      authorityOrganizationId: matchedAuthority?.id || 'auth-general',
      authorityOrganizationName: matchedAuthority?.name || 'Cơ quan Cứu Hộ & Phòng Chống Thiên Tai',
      rescueTeamId: currentTeam.id,
      rescueTeamName: currentTeam.name,
      rescuerId: currentRescuer.id,
      rescuerName: currentRescuer.name,
      rescuerRole: currentRescuer.role,
      vehicleId: currentVehicle.id,
      vehicleName: currentVehicle.name,
      vehicleCapacity: currentVehicle.capacity,
    });
  };

  const isAssigned = Boolean(assignment && assignment.status !== 'CANCELLED');
  const currentStatus = assignment?.status || 'ASSIGNED';
  const currentStepIndex = LIFECYCLE_STEPS.findIndex((s) => s.status === currentStatus);

  // Friendly district name
  const districtNameLabel =
    selectedSos.districtId === 'area-hc' ? 'Hải Châu' :
    selectedSos.districtId === 'area-cl' ? 'Cẩm Lệ' :
    selectedSos.districtId === 'area-st' ? 'Sơn Trà' :
    selectedSos.districtId === 'area-tk' ? 'Thanh Khê' :
    selectedSos.districtId === 'area-nhs' ? 'Ngũ Hành Sơn' :
    selectedSos.districtId === 'area-lc' ? 'Liên Chiểu' :
    selectedSos.districtId === 'area-hv' ? 'Hòa Vang' :
    selectedSos.districtId === 'area-hs' ? 'Hoàng Sa' :
    'Địa Bàn';

  return (
    <aside className="dispatch-right-col" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* 1. SOS Emergency Header Banner */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--sos-border)',
          background: isAssigned
            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(59, 130, 246, 0.04))'
            : 'linear-gradient(135deg, rgba(220, 38, 38, 0.1), rgba(239, 68, 68, 0.04))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: isAssigned ? '#2563eb' : '#dc2626',
                boxShadow: isAssigned ? '0 0 10px #2563eb' : '0 0 10px #dc2626',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: isAssigned ? '#2563eb' : '#dc2626' }}>
              {isAssigned
                ? (lang === 'vi' ? 'ĐANG ĐIỀU ĐỘNG CỨU NẠN' : 'MISSION IN PROGRESS')
                : (lang === 'vi' ? '🚨 TÍN HIỆU SOS ĐANG CHỜ PHÂN CÔNG' : '🚨 AWAITING RESCUE DISPATCH')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className={`badge-priority ${
                selectedSos.priority === 'CRITICAL' ? 'critical' : selectedSos.priority === 'HIGH' ? 'high' : 'medium'
              }`}
            >
              {selectedSos.priority}
            </span>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Thu gọn bảng tác chiến để mở rộng bản đồ (kéo ra kéo vào)"
                style={{
                  background: 'var(--sos-surface)',
                  border: '1px solid var(--sos-border)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--sos-text-secondary)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s ease',
                }}
              >
                <ChevronRight size={13} />
                <span>{lang === 'vi' ? 'Thu gọn' : 'Collapse'}</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--sos-text-primary)', margin: 0 }}>
            {selectedSos.sosCode}
          </h2>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
            • {selectedSos.emergencyType}
          </span>
        </div>

        {/* Citizen Brief Box */}
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--sos-surface)',
            border: '1px solid var(--sos-border)',
            borderRadius: 8,
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--sos-text-primary)' }}>
              👤 {selectedSos.citizenName}
            </span>
            <a
              href={`tel:${selectedSos.citizenPhone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: '#2563eb',
                fontWeight: 700,
                textDecoration: 'none',
                background: 'rgba(37, 99, 235, 0.08)',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              <Phone size={10} />
              {selectedSos.citizenPhone}
            </a>
          </div>

          <div style={{ color: 'var(--sos-text-secondary)', marginTop: 4 }}>
            📍 <strong>{selectedSos.locationName}</strong> ({selectedSos.wardName})
          </div>

          <div style={{ color: '#dc2626', fontWeight: 700, marginTop: 4 }}>
            ⚠️ {selectedSos.affectedPeople} người cần cứu hộ khẩn cấp
          </div>

          {selectedSos.description && (
            <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--sos-text-muted)', lineHeight: 1.3 }}>
              "{selectedSos.description}"
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Allocation Section (Phân công các đội cứu hộ) */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        {!isAssigned ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sos-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛟</span>
                  <span>PHÂN CÔNG ĐỘI CỨU HỘ {districtNameLabel.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sos-text-muted)', marginTop: 2 }}>
                  {availableTeams.length} đội trực chiến sẵn sàng xuất kích
                </div>
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'rgba(37, 99, 235, 0.1)',
                  color: '#2563eb',
                  padding: '2px 8px',
                  borderRadius: 12,
                }}
              >
                {districtNameLabel}
              </span>
            </div>

            {/* Rescue Team Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableTeams.map((team) => {
                const isSelected = team.id === selectedTeamId;
                const leadRescuer = team.rescuers?.[0];
                const teamVeh = vehicles.find((v) => v.teamId === team.id) || vehicles[0];

                return (
                  <div
                    key={team.id}
                    onClick={() => handleSelectTeam(team.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: isSelected ? '2px solid #2563eb' : '1px solid var(--sos-border)',
                      background: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'var(--sos-surface)',
                      boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.12)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: `2px solid ${isSelected ? '#2563eb' : '#94a3b8'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {isSelected && (
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb' }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sos-text-primary)' }}>
                            {team.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 2 }}>
                            👤 Chỉ huy: <strong>{leadRescuer?.name || 'Trưởng đội'}</strong> ({team.availableRescuersCount || 4} chiến sĩ)
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sos-text-muted)', marginTop: 2 }}>
                            🚤 Phương tiện: <strong>{teamVeh?.name || 'Cano cứu hộ'}</strong> ({teamVeh?.capacity || '6 người'})
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          🟢 SẴN SÀNG
                        </span>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
                          ETA: ~5-7 phút
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fine-tune toggle */}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowAdvancedCrew(!showAdvancedCrew)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--sos-text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 0,
                }}
              >
                <Sliders size={12} />
                <span>{showAdvancedCrew ? 'Ẩn tùy chọn chi tiết' : 'Tùy chỉnh Trưởng đội & Phương tiện cụ thể'}</span>
                {showAdvancedCrew ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showAdvancedCrew && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    background: 'var(--sos-surface-subtle)',
                    border: '1px solid var(--sos-border)',
                    borderRadius: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--sos-text-secondary)' }}>
                      Trưởng đội chỉ huy:
                    </label>
                    <select
                      className="form-select"
                      value={selectedRescuerId}
                      onChange={(e) => setSelectedRescuerId(e.target.value)}
                      style={{ marginTop: 3 }}
                    >
                      {availableRescuers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} — {r.role} ({r.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--sos-text-secondary)' }}>
                      Phương tiện xuất kích:
                    </label>
                    <select
                      className="form-select"
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      style={{ marginTop: 3 }}
                    >
                      {availableVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.type}) — Sức chứa {v.capacity}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Launch Dispatch Action Button */}
            <div style={{ marginTop: 18 }}>
              <button
                type="button"
                onClick={handleAssignClick}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                  letterSpacing: '0.3px',
                }}
              >
                <span>🚨</span>
                <span>XÁC NHẬN PHÂN CÔNG & XUẤT KÍCH</span>
              </button>
            </div>
          </div>
        ) : (
          /* Active Mission Console when Assigned */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>
                  🛡️ ĐƠN VỊ ĐƯỢC ĐIỀU ĐỘNG:
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb' }}>
                  ETA: ~{assignment?.etaMinutes ?? 6} phút
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                {assignment?.rescueTeamName}
              </div>
              <div style={{ fontSize: 11, color: '#334155', marginTop: 3 }}>
                👤 Chỉ huy: <strong>{assignment?.rescuerName}</strong> ({assignment?.rescuerRole})
              </div>
              <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
                🚤 Phương tiện: <strong>{assignment?.vehicleName}</strong> ({assignment?.vehicleCapacity})
              </div>
            </div>

            {/* 6-Stage Lifecycle Progression */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--sos-text-muted)', marginBottom: 8 }}>
                TIẾN TRÌNH TÁC CHIẾN CỨU NẠN (BẤM ĐỂ CHUYỂN BƯỚC)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {LIFECYCLE_STEPS.map((step, idx) => {
                  const isCurrent = step.status === currentStatus;
                  const isPast = currentStepIndex > idx;

                  return (
                    <button
                      key={step.status}
                      type="button"
                      onClick={() => onUpdateStatus(assignment!.id, step.status)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: isCurrent
                          ? '2px solid #2563eb'
                          : isPast
                          ? '1px solid #10b981'
                          : '1px solid var(--sos-border)',
                        background: isCurrent
                          ? '#2563eb'
                          : isPast
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'var(--sos-surface)',
                        color: isCurrent
                          ? '#ffffff'
                          : isPast
                          ? '#047857'
                          : 'var(--sos-text-secondary)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'left',
                      }}
                    >
                      <span>{step.icon}</span>
                      <span>{lang === 'vi' ? step.labelVi : step.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reassign and Cancel Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onOpenReassign}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  background: 'var(--sos-surface)',
                  border: '1px solid var(--sos-border)',
                  borderRadius: 6,
                  color: 'var(--sos-text-primary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={13} />
                <span>Đổi đội cứu hộ</span>
              </button>

              <button
                type="button"
                onClick={onOpenCancel}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  color: '#dc2626',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <XCircle size={13} />
                <span>Hủy điều động</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

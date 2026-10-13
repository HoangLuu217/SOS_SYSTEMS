import { useState, useEffect } from 'react';
import {
  RefreshCw,
  XCircle,
  Phone,
  Maximize2,
  X,
  AlertTriangle,
  CheckCircle2,
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

export const DispatchWorkflow = ({
  selectedSos,
  assignment,
  authorities,
  rescueTeams,
  vehicles,
  activeOfficer,
  onConfirmAssign,
  onUpdateStatus: _onUpdateStatus,
  onOpenReassign,
  onOpenCancel,
  onToggleCollapse: _onToggleCollapse,
}: Props) => {
  const { lang: _lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';

  // Lightbox Modal state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Explicit Dispatch Confirmation Modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // District scoping: determine which district this SOS belongs to
  const officerAreaId = !isAdmin ? activeOfficer?.jurisdictionAreaId : undefined;
  const targetDistrictId =
    selectedSos?.districtId || (officerAreaId && !officerAreaId.startsWith('area-h') ? officerAreaId : 'area-hc');

  // Available rescue teams filtered by ward or district
  const districtFilteredTeams = rescueTeams.filter((t) => {
    if (officerAreaId && (t as any).wardId === officerAreaId) return true;
    if (selectedSos?.wardId && (t as any).wardId === selectedSos.wardId) return true;
    if (targetDistrictId && t.districtId === targetDistrictId) return true;
    return false;
  });
  const availableTeams = districtFilteredTeams.length > 0 ? districtFilteredTeams : rescueTeams;

  // Selected team state
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    assignment?.rescueTeamId || availableTeams[0]?.id || ''
  );

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
      (a) => a.areaId === selectedSos?.wardId || a.areaIds?.includes(selectedSos?.wardId)
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
  }, [selectedSos?.id, assignment?.id]);

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

  const handleExecuteDispatch = () => {
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
    setIsConfirmModalOpen(false);
  };

  // 1. Operational Empty State when no ticket is selected
  if (!selectedSos || !selectedSos.id || !selectedSos.sosCode) {
    return (
      <aside
        className="dispatch-right-col"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
          background: 'var(--sos-surface)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--sos-surface-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            border: '1px dashed var(--sos-border)',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#94a3b8' }}
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--sos-text-primary)' }}>
          Chưa chọn yêu cầu cứu nạn
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sos-text-muted)', lineHeight: 1.5, maxWidth: 260 }}>
          Vui lòng chọn một yêu cầu SOS từ danh sách hoặc bản đồ để xem chi tiết và điều phối đội cứu hộ.
        </p>
      </aside>
    );
  }

  const isAssigned = Boolean(assignment && assignment.status !== 'CANCELLED');

  // Friendly district name
  const districtNameLabel =
    selectedSos.districtId === 'area-hc' ? 'Hải Châu' :
    selectedSos.districtId === 'area-cl' ? 'Cẩm Lệ' :
    selectedSos.districtId === 'area-st' ? 'Sơn Trà' :
    selectedSos.districtId === 'area-tk' ? 'Thanh Khê' :
    selectedSos.districtId === 'area-nhs' ? 'Ngũ Hành Sơn' :
    selectedSos.districtId === 'area-lc' ? 'Liên Chiểu' :
    selectedSos.districtId === 'area-hv' ? 'Hòa Vang' :
    'Hải Châu';

  return (
    <aside
      className="dispatch-right-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--sos-surface)',
        borderLeft: '1px solid var(--sos-border)',
      }}
    >
      {/* 1. COMPACT TOP HEADER */}
      {/* 1. ELEGANT TOP HEADER */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px',
          borderBottom: '1px solid var(--sos-border)',
          background: isAssigned
            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(59, 130, 246, 0.02))'
            : 'linear-gradient(135deg, rgba(220, 38, 38, 0.08), rgba(239, 68, 68, 0.02))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: isAssigned ? '#2563eb' : '#dc2626',
              }}
            >
              {isAssigned ? 'Đang Điều Động Cứu Nạn' : 'Tín Hiệu SOS Chờ Phân Công'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className={`badge-priority ${
                selectedSos.priority === 'CRITICAL' ? 'critical' : selectedSos.priority === 'HIGH' ? 'high' : 'medium'
              }`}
              style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}
            >
              {selectedSos.priority}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--sos-text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
            {selectedSos.sosCode}
          </h2>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626', background: 'rgba(220, 38, 38, 0.08)', padding: '1px 6px', borderRadius: 4 }}>
            {selectedSos.emergencyType}
          </span>
          <span style={{ fontSize: 11, color: 'var(--sos-text-muted)' }}>
            • {selectedSos.timeAgo || 'Vừa xong'}
          </span>
        </div>
      </div>

      {/* 2. SCROLLABLE WORKSPACE CONTENT */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Citizen Distress Profile (Modern, clear hierarchy) */}
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--sos-surface)',
            border: '1px solid var(--sos-border)',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Row 1: Citizen Name + Direct hotline call */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 800, color: 'var(--sos-text-primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>👤</span>
              <span>{selectedSos.citizenName}</span>
            </span>
            <a
              href={`tel:${selectedSos.citizenPhone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: '#1d4ed8',
                fontWeight: 700,
                textDecoration: 'none',
                background: '#eff6ff',
                padding: '3px 9px',
                borderRadius: 6,
                border: '1px solid #bfdbfe',
                fontSize: 11.5,
                transition: 'all 0.15s ease',
              }}
            >
              <Phone size={12} />
              <span>{selectedSos.citizenPhone}</span>
            </a>
          </div>

          {/* Row 2: Location snippet */}
          <div style={{ color: 'var(--sos-text-primary)', lineHeight: 1.4, fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ color: '#dc2626', flexShrink: 0 }}>📍</span>
            <span><strong>{selectedSos.locationName}</strong></span>
          </div>

          {/* Row 3: Casualties and Vulnerabilities pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            <span
              style={{
                color: '#dc2626',
                fontWeight: 800,
                background: 'rgba(220, 38, 38, 0.08)',
                padding: '2.5px 7px',
                borderRadius: 5,
                fontSize: 11,
                border: '1px solid rgba(220, 38, 38, 0.2)',
              }}
            >
              ⚠️ {selectedSos.affectedPeople} người gặp nạn
            </span>
            <span
              style={{
                color: '#b45309',
                fontWeight: 700,
                background: '#fef3c7',
                padding: '2.5px 7px',
                borderRadius: 5,
                fontSize: 11,
                border: '1px solid #fde68a',
              }}
            >
              👴 1 người cao tuổi
            </span>
            <span
              style={{
                color: '#0369a1',
                fontWeight: 700,
                background: '#e0f2fe',
                padding: '2.5px 7px',
                borderRadius: 5,
                fontSize: 11,
                border: '1px solid #bae6fd',
              }}
            >
              👶 1 trẻ nhỏ
            </span>
          </div>

          {/* Row 4: Narrative Description */}
          {selectedSos.description && (
            <div
              style={{
                padding: '7px 10px',
                background: 'var(--sos-surface-subtle)',
                borderLeft: '3px solid #dc2626',
                fontStyle: 'italic',
                color: 'var(--sos-text-secondary)',
                lineHeight: 1.4,
                borderRadius: '0 6px 6px 0',
                fontSize: 11.5,
              }}
            >
              "{selectedSos.description}"
            </div>
          )}

          {/* Row 5: Photo Attachment */}
          {selectedSos.imageUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
              <div
                onClick={() => setIsLightboxOpen(true)}
                style={{
                  width: 58,
                  height: 42,
                  borderRadius: 6,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid var(--sos-border)',
                  flexShrink: 0,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
                title="Bấm để xem ảnh phóng to"
              >
                <img
                  src={selectedSos.imageUrl}
                  alt="Hiện trường"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#2563eb',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Maximize2 size={12} />
                <span>Xem ảnh hiện trường (Zoom phóng to)</span>
              </button>
            </div>
          )}
        </div>

        {/* Rescue Team Allocation Section */}
        {!isAssigned ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--sos-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛟</span>
                  <span>PHÂN CÔNG ĐỘI CỨU HỘ {districtNameLabel.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sos-text-muted)', marginTop: 1 }}>
                  {availableTeams.length} đội trực chiến sẵn sàng xuất kích
                </div>
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  padding: '2px 7px',
                  borderRadius: 12,
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                }}
              >
                {districtNameLabel}
              </span>
            </div>

            {/* Rescue Team Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableTeams.map((team, index) => {
                const isSelected = team.id === selectedTeamId;
                const leadRescuer = team.rescuers?.[0];
                const teamVeh = vehicles.find((v) => v.teamId === team.id) || vehicles[0];
                const isRecommended = index === 0;

                const vehicleSpec =
                  team.id === 'team-water-alpha'
                    ? 'Ca-nô 50HP + Bán tải (5 người)'
                    : team.id === 'team-qr-bravo'
                    ? 'Xe lội nước 4x4 (4 người)'
                    : team.id === 'team-hc-htd'
                    ? 'Ca-nô cứu sinh 43-HC (6 người)'
                    : `${teamVeh?.name || 'Ca-nô'} (${teamVeh?.capacity || '6 người'})`;

                const etaText = index === 1 ? '~6-7 phút' : '~5-7 phút';

                const teamDisplayName =
                  team.id === 'team-hc-htd'
                    ? 'Đội Cứu Hộ Phường Hòa Cường'
                    : team.name;

                return (
                  <div
                    key={team.id}
                    onClick={() => handleSelectTeam(team.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: isSelected ? '2px solid #0284c7' : '1px solid var(--sos-border)',
                      background: isSelected ? 'rgba(2, 132, 199, 0.05)' : 'var(--sos-surface)',
                      boxShadow: isSelected ? '0 3px 10px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.14s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
                        {/* Radio selection circle */}
                        <div
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: '50%',
                            border: `2px solid ${isSelected ? '#0284c7' : '#94a3b8'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 2,
                            background: isSelected ? '#ffffff' : 'transparent',
                          }}
                        >
                          {isSelected && (
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284c7' }} />
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sos-text-primary)', lineHeight: 1.35 }}>
                              {teamDisplayName}
                            </span>
                            {isRecommended && (
                              <span
                                style={{
                                  background: '#0284c7',
                                  color: '#ffffff',
                                  fontSize: 9,
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.2px',
                                  display: 'inline-block',
                                }}
                              >
                                Khuyến nghị
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 3 }}>
                            👤 Chỉ huy: <strong>{leadRescuer?.name || 'Trưởng đội'}</strong> ({team.availableRescuersCount || 4} chiến sĩ)
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sos-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>🚤</span>
                            <span>{vehicleSpec}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #bbf7d0',
                          }}
                        >
                          SẴN SÀNG
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7' }}>
                          ⏱️ {etaText}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tactical Selected Team Dispatch Plan (Fills void with mission intelligence) */}
            {currentTeam && (
              <div
                style={{
                  marginTop: 4,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--sos-surface-subtle)',
                  border: '1px solid var(--sos-border)',
                  fontSize: 11.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 800, color: 'var(--sos-text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>📋</span>
                  <span>KẾ HOẠCH XUẤT KÍCH NHANH:</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                  <div>
                    <span style={{ color: 'var(--sos-text-muted)' }}>Mũi xuất kích:</span>{' '}
                    <strong style={{ color: 'var(--sos-text-primary)' }}>{currentTeam.name.replace('Đội ', '')}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--sos-text-muted)' }}>Tiếp cận dự kiến:</span>{' '}
                    <strong style={{ color: '#0284c7' }}>~5-7 phút</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--sos-text-muted)' }}>Chỉ huy hiện trường:</span>{' '}
                    <strong style={{ color: 'var(--sos-text-primary)' }}>{currentRescuer?.name || 'Trưởng đội'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--sos-text-muted)' }}>Phương tiện chính:</span>{' '}
                    <strong style={{ color: 'var(--sos-text-primary)' }}>{currentVehicle?.name || 'Ca-nô 50HP'}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Mission Console when Assigned - GRAB STYLE LIVE TRACKER */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const assignedRescuer = rescueTeams
                .flatMap((t) => t.rescuers)
                .find((r) => r.id === assignment?.rescuerId);
              const rescuerPhone = assignedRescuer?.phone || '0905-114-115';

              const assignedVehicle = vehicles.find((v) => v.id === assignment?.vehicleId);
              const vehiclePlate = assignedVehicle?.plate || '43C-554.12';
              const isBoat = assignment?.vehicleName?.toLowerCase().includes('ca-nô');

              return (
                <>
                  {/* Top Status Banner with pulsing Radar dot */}
                  <div
                    style={{
                      padding: '11px 13px',
                      borderRadius: 9,
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      color: '#ffffff',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.22)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                        }}
                      >
                        {isBoat ? '🚤' : '🚙'}
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '0.2px' }}>
                          {assignment?.status === 'ASSIGNED' || assignment?.status === 'ACCEPTED'
                            ? 'ĐÃ ĐIỀU ĐỘNG • ĐANG XUẤT PHÁT'
                            : assignment?.status === 'ON_THE_WAY'
                            ? 'ĐANG DI CHUYỂN ĐẾN ĐIỂM CỨU NẠN'
                            : assignment?.status === 'ARRIVED'
                            ? 'ĐÃ TIẾP CẬN VỊ TRÍ NGẬP'
                            : assignment?.status === 'RESCUING'
                            ? 'ĐANG TIẾN HÀNH ỨNG CỨU'
                            : 'ĐÃ HOÀN THÀNH CỨU NẠN'}
                        </div>
                        <div style={{ fontSize: 10.5, opacity: 0.92, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
                          <span>Đang kết nối GPS trực tiếp từ đội cứu hộ</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1 }}>
                        ~{assignment?.etaMinutes ?? 7}p
                      </div>
                      <div style={{ fontSize: 9.5, opacity: 0.85, fontWeight: 700, marginTop: 2 }}>
                        DỰ KIẾN ĐẾN
                      </div>
                    </div>
                  </div>

                  {/* Grab Driver & Vehicle Card */}
                  <div
                    style={{
                      padding: '12px 13px',
                      borderRadius: 9,
                      background: 'var(--sos-surface)',
                      border: '1px solid var(--sos-border)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
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
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 17,
                            fontWeight: 800,
                            position: 'relative',
                            flexShrink: 0,
                          }}
                        >
                          {assignment?.rescuerName ? assignment.rescuerName.charAt(0) : 'C'}
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: '#10b981',
                              border: '2px solid #ffffff',
                            }}
                          />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--sos-text-primary)' }}>
                              {assignment?.rescuerName || 'Cứu Hộ Viên'}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '1px 5px',
                                borderRadius: 4,
                              }}
                            >
                              ⭐ 5.0
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 1 }}>
                            {assignment?.rescuerRole || 'Chỉ Huy Hiện Trường'} • <strong>{assignment?.rescueTeamName}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Call Rescuer Button */}
                      <a
                        href={`tel:${rescuerPhone}`}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: '#10b981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textDecoration: 'none',
                          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)',
                          flexShrink: 0,
                        }}
                        title={`Gọi cho đội cứu hộ: ${rescuerPhone}`}
                      >
                        <Phone size={16} />
                      </a>
                    </div>

                    {/* Vehicle Plate & Specs */}
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: 'var(--sos-surface-subtle, #f8fafc)',
                        border: '1px solid var(--sos-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15 }}>{isBoat ? '🚤' : '🚙'}</span>
                        <div>
                          <strong style={{ color: 'var(--sos-text-primary)' }}>{assignment?.vehicleName}</strong>
                          <div style={{ fontSize: 10, color: 'var(--sos-text-muted)' }}>
                            Sức chứa: {assignment?.vehicleCapacity || '6 người'}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#fef08a',
                          border: '1.5px solid #ca8a04',
                          color: '#713f12',
                          fontWeight: 900,
                          letterSpacing: '0.5px',
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
                      onClick={onOpenReassign}
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
                      onClick={onOpenCancel}
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
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* 3. STICKY ACTION FOOTER (ALWAYS VISIBLE AT BOTTOM) */}
      {!isAssigned && (
        <div
          style={{
            flexShrink: 0,
            padding: '12px 16px',
            borderTop: '1px solid var(--sos-border)',
            background: 'var(--sos-surface)',
            boxShadow: '0 -4px 14px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <button
            type="button"
            onClick={() => setIsConfirmModalOpen(true)}
            style={{
              width: '100%',
              padding: '12px 18px',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
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
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
              letterSpacing: '0.3px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🚨</span>
            <span>XÁC NHẬN PHÂN CÔNG & XUẤT KÍCH</span>
          </button>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--sos-text-muted)' }}>
            Lệnh xuất kích sẽ truyền tức thời đến máy bộ đàm &amp; App cứu hộ viên
          </div>
        </div>
      )}

      {/* Lightbox Zoom Modal for Photo Attachments */}
      {isLightboxOpen && selectedSos.imageUrl && (
        <div
          className="sos-modal-overlay"
          onClick={() => setIsLightboxOpen(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="sos-modal-window"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 640, maxWidth: '95vw', padding: 0, background: '#000000', overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#ffffff',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                📷 Ảnh hiện trường: {selectedSos.sosCode}
              </span>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#090d16' }}>
              <img
                src={selectedSos.imageUrl}
                alt="Hiện trường"
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Explicit Dispatch Confirmation Modal */}
      {isConfirmModalOpen && (
        <div
          className="sos-modal-overlay"
          onClick={() => setIsConfirmModalOpen(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="sos-modal-window"
            onClick={(e) => e.stopPropagation()}
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
                onClick={() => setIsConfirmModalOpen(false)}
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
                  gap: 5,
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
                  <strong>Đội cứu nạn tiếp nhận:</strong>{' '}
                  <span style={{ color: '#0284c7', fontWeight: 700 }}>{currentTeam?.name}</span>
                </div>
                <div>
                  <strong>Chỉ huy phụ trách:</strong> {currentRescuer?.name} ({currentRescuer?.role})
                </div>
                <div>
                  <strong>Phương tiện:</strong> {currentVehicle?.name} (Sức chứa: {currentVehicle?.capacity})
                </div>
                <div>
                  <strong>Thời gian dự kiến tiếp cận (ETA):</strong>{' '}
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>~5-7 phút</span>
                </div>
              </div>
            </div>

            <div className="sos-modal-footer" style={{ padding: '10px 18px' }}>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setIsConfirmModalOpen(false)}
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
                onClick={handleExecuteDispatch}
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
      )}
    </aside>
  );
};

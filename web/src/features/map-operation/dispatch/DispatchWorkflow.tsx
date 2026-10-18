import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  AuthorityOrganization,
  AssignmentStatus,
  AuthorityOfficer,
} from '@/types/domainD';
import { useApp } from '@/context/AppContext';
import { CitizenDistressProfile } from './CitizenDistressProfile';
import { TeamSelectorCard } from './TeamSelectorCard';
import { TeamMembersModal } from './TeamMembersModal';
import { ConfirmDispatchModal } from './ConfirmDispatchModal';
import { ActiveMissionConsole } from './ActiveMissionConsole';

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
  selectedTeamIds?: string[];
  onSelectedTeamsChange?: (teamIds: string[]) => void;
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
  onToggleCollapse,
  selectedTeamIds: propSelectedTeamIds,
  onSelectedTeamsChange,
}: Props) => {
  const { lang: _lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';

  // Explicit Dispatch Confirmation Modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Viewing Team Detail Modal state
  const [viewingTeamDetail, setViewingTeamDetail] = useState<RescueTeam | null>(null);

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

  // Selected team IDs state (supports selecting multiple teams)
  const [localSelectedTeamIds, setLocalSelectedTeamIds] = useState<string[]>(() => {
    if (assignment?.rescueTeamId) {
      return assignment.rescueTeamId.split(',').filter(Boolean);
    }
    return availableTeams[0]?.id ? [availableTeams[0].id] : [];
  });

  const activeSelectedTeamIds = propSelectedTeamIds ?? localSelectedTeamIds;

  // Active selected teams list
  const selectedTeams = availableTeams.filter((t) => activeSelectedTeamIds.includes(t.id));
  const currentTeam = selectedTeams[0] || availableTeams[0];

  // Rescuers under primary team
  const availableRescuers = currentTeam?.rescuers || [];
  const [_selectedRescuerId, setSelectedRescuerId] = useState<string>(
    assignment?.rescuerId || availableRescuers[0]?.id || ''
  );

  // Vehicles under primary team
  const teamVehicles = vehicles.filter((v) => v.teamId === currentTeam?.id);
  const availableVehicles = teamVehicles.length > 0 ? teamVehicles : vehicles;
  const [_selectedVehicleId, setSelectedVehicleId] = useState<string>(
    assignment?.vehicleId || availableVehicles[0]?.id || ''
  );

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
      const ids = assignment.rescueTeamId ? assignment.rescueTeamId.split(',').filter(Boolean) : [];
      setLocalSelectedTeamIds(ids);
      onSelectedTeamsChange?.(ids);
      setSelectedRescuerId(assignment.rescuerId);
      setSelectedVehicleId(assignment.vehicleId);
    } else {
      const initialTeam = availableTeams[0];
      const initialIds = initialTeam ? [initialTeam.id] : [];
      setLocalSelectedTeamIds(initialIds);
      onSelectedTeamsChange?.(initialIds);
      if (initialTeam?.rescuers.length > 0) {
        setSelectedRescuerId(initialTeam.rescuers[0].id);
      }
      const initialVehs = vehicles.filter((v) => v.teamId === initialTeam?.id);
      setSelectedVehicleId(initialVehs[0]?.id || availableVehicles[0]?.id || '');
    }
  }, [selectedSos?.id, assignment?.id]);

  const handleToggleTeam = (teamId: string) => {
    let next: string[];
    if (activeSelectedTeamIds.includes(teamId)) {
      next = activeSelectedTeamIds.filter((id) => id !== teamId);
    } else {
      next = [...activeSelectedTeamIds, teamId];
    }
    setLocalSelectedTeamIds(next);
    onSelectedTeamsChange?.(next);

    const targetTeam = rescueTeams.find((t) => t.id === teamId);
    if (targetTeam && targetTeam.rescuers.length > 0) {
      setSelectedRescuerId(targetTeam.rescuers[0].id);
    }
    const tVehicles = vehicles.filter((v) => v.teamId === teamId);
    if (tVehicles.length > 0) {
      setSelectedVehicleId(tVehicles[0].id);
    }
  };

  const handleExecuteDispatch = () => {
    if (selectedTeams.length === 0) return;

    const primaryTeam = selectedTeams[0];
    const primaryRescuer = primaryTeam.rescuers[0];
    const primaryVehicle = vehicles.find((v) => v.teamId === primaryTeam.id) || vehicles[0];

    onConfirmAssign({
      authorityOrganizationId: matchedAuthority?.id || 'auth-general',
      authorityOrganizationName: matchedAuthority?.name || 'Cơ quan Cứu Hộ & Phòng Chống Thiên Tai',
      rescueTeamId: activeSelectedTeamIds.join(','),
      rescueTeamName: selectedTeams.map((t) => t.name).join(' & '),
      rescuerId: primaryRescuer?.id || 'rescuer-lead',
      rescuerName: selectedTeams.map((t) => t.rescuers[0]?.name).filter(Boolean).join(', ') || 'Chỉ huy trưởng',
      rescuerRole: primaryRescuer?.role || 'Chỉ Huy Trưởng',
      vehicleId: primaryVehicle?.id || 'veh-main',
      vehicleName: selectedTeams
        .map((t) => {
          const v = vehicles.find((veh) => veh.teamId === t.id);
          return v?.name || 'Ca-nô';
        })
        .join(' + '),
      vehicleCapacity: `${selectedTeams.reduce((acc, t) => acc + (t.availableRescuersCount || 4), 0)} chiến sĩ`,
    });
    setIsConfirmModalOpen(false);
  };

  // 1. Operational Empty State when no ticket is selected
  if (!selectedSos || !selectedSos.id || !selectedSos.sosCode) {
    return (
      <aside
        className="dispatch-right-col"
        style={{
          position: 'relative',
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
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: '1px solid var(--sos-border)',
              borderRadius: 5,
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--sos-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 600,
            }}
            title="Thu gọn bảng tác chiến để mở rộng bản đồ"
          >
            <span>Thu gọn</span>
            <ChevronRight size={13} />
          </button>
        )}
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
      {/* 1. CLEAN TOP HEADER */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px',
          borderBottom: '1px solid var(--sos-border)',
          background: 'var(--sos-surface)',
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
                background: isAssigned ? '#1e293b' : '#dc2626',
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: isAssigned ? '#1e293b' : '#dc2626',
              }}
            >
              {isAssigned ? 'Đang Điều Động Cứu Nạn' : 'Yêu Cầu Chờ Phân Công'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className={`badge-priority ${
                selectedSos.priority === 'CRITICAL' ? 'critical' : selectedSos.priority === 'HIGH' ? 'high' : 'medium'
              }`}
              style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}
            >
              {selectedSos.priority}
            </span>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11.5,
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                title="Thu gọn bảng tác chiến để mở rộng toàn màn hình bản đồ"
              >
                <span>Thu gọn</span>
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: 0 }}>
            {selectedSos.sosCode}
          </h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sos-text-secondary)', background: 'var(--sos-surface-subtle)', border: '1px solid var(--sos-border)', padding: '2px 7px', borderRadius: 4 }}>
            {selectedSos.emergencyType}
          </span>
          <span style={{ fontSize: 12, color: 'var(--sos-text-muted)' }}>
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
        {/* Sub-component: Citizen Distress Profile */}
        <CitizenDistressProfile selectedSos={selectedSos} />

        {/* Rescue Team Allocation Section vs Active Mission Console */}
        {!isAssigned ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛟</span>
                  <span>PHÂN CÔNG ĐỘI CỨU HỘ {districtNameLabel.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--sos-text-muted)', marginTop: 2 }}>
                  {availableTeams.length} đội trực chiến sẵn sàng xuất kích
                </div>
              </div>

              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                }}
              >
                {districtNameLabel}
              </span>
            </div>

            {/* Sub-components: Rescue Team Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {availableTeams.map((team, index) => {
                const isSelected = activeSelectedTeamIds.includes(team.id);
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
                  <TeamSelectorCard
                    key={team.id}
                    team={team}
                    isSelected={isSelected}
                    isRecommended={isRecommended}
                    vehicleSpec={vehicleSpec}
                    etaText={etaText}
                    teamDisplayName={teamDisplayName}
                    onToggle={() => handleToggleTeam(team.id)}
                    onViewMembers={() => setViewingTeamDetail(team)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          /* Sub-component: Active Mission Console when Assigned */
          <ActiveMissionConsole
            assignment={assignment}
            selectedSos={selectedSos}
            rescueTeams={rescueTeams}
            vehicles={vehicles}
            onOpenReassign={onOpenReassign}
            onOpenCancel={onOpenCancel}
          />
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
            disabled={activeSelectedTeamIds.length === 0}
            onClick={() => setIsConfirmModalOpen(true)}
            style={{
              width: '100%',
              padding: '11px 18px',
              background: activeSelectedTeamIds.length === 0 ? '#94a3b8' : '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: activeSelectedTeamIds.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: '0.2px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>
              {activeSelectedTeamIds.length === 0
                ? 'VUI LÒNG CHỌN ĐỘI CỨU HỘ'
                : activeSelectedTeamIds.length === 1
                ? 'XÁC NHẬN PHÂN CÔNG & XUẤT KÍCH (1 ĐỘI)'
                : `XÁC NHẬN PHÂN CÔNG & XUẤT KÍCH (${activeSelectedTeamIds.length} ĐỘI)`}
            </span>
          </button>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--sos-text-muted)' }}>
            Lệnh xuất kích sẽ truyền tức thời đến máy bộ đàm &amp; App cứu hộ viên
          </div>
        </div>
      )}

      {/* Sub-component: Confirm Dispatch Modal */}
      <ConfirmDispatchModal
        isOpen={isConfirmModalOpen}
        selectedSos={selectedSos}
        selectedTeams={selectedTeams}
        vehicles={vehicles}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleExecuteDispatch}
      />

      {/* Sub-component: Team Members Detail Modal */}
      <TeamMembersModal
        team={viewingTeamDetail}
        onClose={() => setViewingTeamDetail(null)}
      />
    </aside>
  );
};

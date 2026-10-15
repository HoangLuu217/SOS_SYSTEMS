import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  AuthorityOrganization,
  AssignmentStatus,
  AuthorityOfficer,
  AdministrativeArea,
} from '../../types/domainD';
import { IncidentFeed } from './IncidentFeed';
import { TacticalMap } from './TacticalMap';
import { DispatchWorkflow } from './DispatchWorkflow';
import { ReassignModal } from './ReassignModal';
import { CancelAssignmentModal } from './CancelAssignmentModal';
import { CitizenSosModal } from './CitizenSosModal';

interface Props {
  sosRequests: SosRequest[];
  selectedSos: SosRequest;
  onSelectSos: (sos: SosRequest) => void;
  assignment: SosAssignment | null;
  authorities: AuthorityOrganization[];
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
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
  onReassign: (
    assignmentId: string,
    params: {
      rescueTeamId: string;
      rescueTeamName: string;
      rescuerId: string;
      rescuerName: string;
      rescuerRole: string;
      vehicleId: string;
      vehicleName: string;
      vehicleCapacity: string;
    }
  ) => void;
  onCancelAssignment: (assignmentId: string, reason: string) => void;
  onCreateCitizenSos?: (newSos: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
}

export const MissionDispatch = ({
  sosRequests,
  selectedSos,
  onSelectSos,
  assignment,
  authorities,
  rescueTeams,
  vehicles,
  onConfirmAssign,
  onUpdateStatus,
  onReassign,
  onCancelAssignment,
  onCreateCitizenSos,
  showToast,
  activeOfficer,
  areas,
}: Props) => {
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isCitizenSosOpen, setIsCitizenSosOpen] = useState(false);

  // Left Feed Collapse state
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

  // Multi-selected rescue teams for live GPS preview and dispatching
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  useEffect(() => {
    if (assignment?.rescueTeamId) {
      setSelectedTeamIds(assignment.rescueTeamId.split(',').filter(Boolean));
    } else {
      const officerAreaId = !activeOfficer?.role?.includes('ADMIN') ? activeOfficer?.jurisdictionAreaId : undefined;
      const targetDistrictId =
        selectedSos?.districtId || (officerAreaId && !officerAreaId.startsWith('area-h') ? officerAreaId : 'area-hc');
      const filtered = rescueTeams.filter((t) => {
        if (officerAreaId && (t as any).wardId === officerAreaId) return true;
        if (selectedSos?.wardId && (t as any).wardId === selectedSos.wardId) return true;
        if (targetDistrictId && t.districtId === targetDistrictId) return true;
        return false;
      });
      const defaultTeam = filtered[0] || rescueTeams[0];
      if (defaultTeam) {
        setSelectedTeamIds([defaultTeam.id]);
      }
    }
  }, [selectedSos?.id, assignment?.rescueTeamId, rescueTeams]);

  // Right Panel Slide & Resizable state ("kéo ra kéo vào")
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(390);
  const [isDragging, setIsDragging] = useState(false);

  // Ref to track drag start position and initial width
  const dragRef = useRef({ startX: 0, startWidth: 390 });

  const toggleRightPanel = () => {
    setIsRightPanelOpen((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 80);
  };

  const toggleLeftPanel = () => {
    setIsLeftPanelOpen((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 80);
  };

  const startDragging = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startWidth: rightPanelWidth,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = dragRef.current.startX - e.clientX;
      const newWidth = Math.min(Math.max(dragRef.current.startWidth + delta, 310), 650);
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        window.dispatchEvent(new Event('resize'));
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleReassignSubmit = (params: {
    rescueTeamId: string;
    rescueTeamName: string;
    rescuerId: string;
    rescuerName: string;
    rescuerRole: string;
    vehicleId: string;
    vehicleName: string;
    vehicleCapacity: string;
  }) => {
    if (!assignment) return;
    onReassign(assignment.id, params);
    setIsReassignOpen(false);
    showToast(`Đã chuyển điều động sang ${params.rescueTeamName} thành công!`, 'success');
  };

  const handleCancelSubmit = (reason: string) => {
    if (!assignment) return;
    onCancelAssignment(assignment.id, reason);
    setIsCancelOpen(false);
    showToast(`Đã hủy điều động cứu hộ cho ${selectedSos.sosCode}.`, 'error');
  };

  const handleCitizenSosSubmit = (newSos: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>) => {
    if (onCreateCitizenSos) {
      onCreateCitizenSos(newSos);
    }
  };

  return (
    <div className="dispatch-screen" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* 1. Tactical Map (Takes FULL width from sidebar to right dispatch panel) */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', height: '100%' }}>
        <TacticalMap
          selectedSos={selectedSos}
          assignment={assignment}
          activeOfficer={activeOfficer}
          areas={areas}
          sosRequests={sosRequests}
          onSelectSos={onSelectSos}
          previewTeamIds={selectedTeamIds}
          rescueTeams={rescueTeams}
          vehicles={vehicles}
        />

        {/* Floating Incident Queue Overlaid on Map */}
        {isLeftPanelOpen ? (
          <div
            className="floating-incident-overlay-card"
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              maxHeight: 'calc(100% - 28px)',
              width: 365,
              maxWidth: 'calc(100% - 28px)',
              zIndex: 450,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--sos-surface)',
              borderRadius: 14,
              boxShadow: '0 10px 32px rgba(15, 23, 42, 0.2), 0 0 0 1px var(--sos-border)',
              overflow: 'hidden',
              animation: 'fadeIn 0.18s ease-out',
            }}
          >
            <IncidentFeed
              sosRequests={sosRequests}
              selectedSos={selectedSos}
              onSelectSos={onSelectSos}
              activeOfficer={activeOfficer}
              onOpenCitizenModal={() => setIsCitizenSosOpen(true)}
              onToggleCollapse={toggleLeftPanel}
            />
          </div>
        ) : (
          /* Floating Re-open Button when Incident Queue is collapsed */
          <button
            type="button"
            onClick={toggleLeftPanel}
            className="floating-dock-feed-btn"
            title="Mở danh sách tín hiệu SOS địa bàn"
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 450,
              background: 'var(--sos-surface)',
              border: '1px solid var(--sos-border)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              borderRadius: 8,
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              color: 'var(--sos-text-primary)',
            }}
          >
            <Radio size={14} color="#dc2626" />
            <span>SOS Địa Bàn ({sosRequests.length})</span>
            <ChevronRight size={14} />
          </button>
        )}

        {/* Floating Toggle Button for Right Panel when Collapsed */}
        {!isRightPanelOpen && (
          <button
            type="button"
            onClick={toggleRightPanel}
            className="floating-dock-open-btn"
            title="Mở rộng bảng phân công cứu hộ & tác chiến"
            style={{
              position: 'absolute',
              top: 14,
              right: 54,
              zIndex: 1100,
            }}
          >
            <ChevronLeft size={16} color="#dc2626" />
            <span>Bảng Phân Công & Tác Chiến</span>
            {selectedSos && (
              <span className="floating-sos-code-badge">{selectedSos.sosCode}</span>
            )}
          </button>
        )}
      </div>

      {/* 3. Draggable Divider Bar ("thanh bên phải kéo ra kéo vào") */}
      {isRightPanelOpen && (
        <div
          className={`dispatch-resizer-bar ${isDragging ? 'dragging' : ''}`}
          onMouseDown={startDragging}
          onDoubleClick={toggleRightPanel}
          title="Kéo sang trái/phải để điều chỉnh độ rộng, hoặc nhấp đúp để thu gọn bảng tác chiến"
        >
          <div className="dispatch-resizer-line" />
          <button
            type="button"
            className="dispatch-resizer-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleRightPanel();
            }}
            title="Thu gọn bảng tác chiến để phóng to bản đồ"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 4. Right Column: Dispatch Workflow (Resizable & Collapsible Container) */}
      <div
        className="dispatch-right-container"
        style={{
          width: isRightPanelOpen ? `${rightPanelWidth}px` : 0,
          minWidth: isRightPanelOpen ? `${rightPanelWidth}px` : 0,
          maxWidth: isRightPanelOpen ? `${rightPanelWidth}px` : 0,
          transition: isDragging ? 'none' : 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <DispatchWorkflow
          selectedSos={selectedSos}
          assignment={assignment}
          authorities={authorities}
          rescueTeams={rescueTeams}
          vehicles={vehicles}
          activeOfficer={activeOfficer}
          onConfirmAssign={onConfirmAssign}
          onUpdateStatus={onUpdateStatus}
          onOpenReassign={() => setIsReassignOpen(true)}
          onOpenCancel={() => setIsCancelOpen(true)}
          onToggleCollapse={toggleRightPanel}
          selectedTeamIds={selectedTeamIds}
          onSelectedTeamsChange={setSelectedTeamIds}
        />
      </div>

      {/* Reassign Modal */}
      {assignment && (
        <ReassignModal
          isOpen={isReassignOpen}
          onClose={() => setIsReassignOpen(false)}
          rescueTeams={rescueTeams}
          vehicles={vehicles}
          currentTeamId={assignment.rescueTeamId}
          currentRescuerId={assignment.rescuerId}
          currentVehicleId={assignment.vehicleId}
          onSubmit={handleReassignSubmit}
        />
      )}

      {/* Cancel Assignment Modal */}
      {assignment && (
        <CancelAssignmentModal
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          sosCode={selectedSos.sosCode}
          onConfirmCancel={handleCancelSubmit}
        />
      )}

      {/* Citizen SOS Mobile App Simulator Modal */}
      <CitizenSosModal
        isOpen={isCitizenSosOpen}
        onClose={() => setIsCitizenSosOpen(false)}
        onSubmitSos={handleCitizenSosSubmit}
      />
    </div>
  );
};

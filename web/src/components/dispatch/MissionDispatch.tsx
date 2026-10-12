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
    showToast(`Reassigned mission to ${params.rescueTeamName} successfully!`, 'success');
  };

  const handleCancelSubmit = (reason: string) => {
    if (!assignment) return;
    onCancelAssignment(assignment.id, reason);
    showToast(`Mission assignment cancelled for ${selectedSos.sosCode}.`, 'error');
  };

  const handleCitizenSosSubmit = (newSos: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>) => {
    if (onCreateCitizenSos) {
      onCreateCitizenSos(newSos);
    }
  };

  return (
    <div className="dispatch-screen" style={{ position: 'relative' }}>
      {/* 1. Left Column: Incident Feed (Collapsible) */}
      <div
        style={{
          width: isLeftPanelOpen ? 340 : 0,
          minWidth: isLeftPanelOpen ? 340 : 0,
          maxWidth: isLeftPanelOpen ? 340 : 0,
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: isLeftPanelOpen ? '1px solid var(--sos-border)' : 'none',
          zIndex: 10,
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

      {/* 2. Center Column: Tactical Map (Takes remaining width) */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', height: '100%' }}>
        <TacticalMap
          selectedSos={selectedSos}
          assignment={assignment}
          activeOfficer={activeOfficer}
          areas={areas}
          sosRequests={sosRequests}
          onSelectSos={onSelectSos}
        />

        {/* Floating Toggle Button for Left Panel when Collapsed */}
        {!isLeftPanelOpen && (
          <button
            type="button"
            onClick={toggleLeftPanel}
            className="floating-dock-feed-btn"
            title="Mở danh sách tín hiệu SOS"
          >
            <Radio size={14} color="#dc2626" />
            <span>Danh Sách SOS ({sosRequests.length})</span>
            <ChevronRight size={14} />
          </button>
        )}

        {/* Floating Toggle Button for Right Panel when Collapsed */}
        {!isRightPanelOpen && (
          <button
            type="button"
            onClick={toggleRightPanel}
            className="floating-dock-open-btn"
            title="Mở rộng bảng phân công cứu hộ (kéo ra kéo vào)"
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

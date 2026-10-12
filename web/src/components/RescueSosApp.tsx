import { useState, useEffect, useMemo } from 'react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  AssignmentStatus,
} from '../types/domainD';
import { domainDService } from '../services/domainDService';
import { TopNavigation } from './common/TopNavigation';
import { TerritorialGovernance } from './territorial/TerritorialGovernance';
import { MissionDispatch } from './dispatch/MissionDispatch';
import './RescueSos.css';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface Props {
  onSwitchToLogin?: () => void;
}

export const RescueSosApp = ({ onSwitchToLogin }: Props) => {
  // Screen mode switcher state
  const [activeScreen, setActiveScreen] = useState<'territorial' | 'dispatch'>('territorial');

  // Domain D data states
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOrganization[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Officer / Jurisdiction state
  const [officers, setOfficers] = useState<AuthorityOfficer[]>(domainDService.getOfficers());
  const [activeOfficer, setActiveOfficer] = useState<AuthorityOfficer>(domainDService.getActiveOfficer());

  // Selection states (Preserved across tab switches!)
  const [selectedAreaId, setSelectedAreaId] = useState<string>(activeOfficer.jurisdictionAreaId || 'area-htd');
  const [selectedSosId, setSelectedSosId] = useState<string>('sos-8924'); // Default to Hoa Cuong SOS

  // Toast notifications
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = () => {
    domainDService.syncFromStoredAuthUser();
    const loadedAreas = domainDService.getAreas();
    const loadedAuths = domainDService.getAuthorities();
    const loadedSos = domainDService.getSosRequests();
    const loadedTeams = domainDService.getRescueTeams();
    const loadedVehicles = domainDService.getVehicles();
    const loadedOfficers = domainDService.getOfficers();
    const currentOfficer = domainDService.getActiveOfficer();

    setAreas(loadedAreas);
    setAuthorities(loadedAuths);
    setSosRequests(loadedSos);
    setRescueTeams(loadedTeams);
    setVehicles(loadedVehicles);
    setOfficers(loadedOfficers);
    setActiveOfficer(currentOfficer);

    // Default selections based on officer's jurisdiction
    if (currentOfficer && currentOfficer.jurisdictionAreaId) {
      setSelectedAreaId(currentOfficer.jurisdictionAreaId);
      const matchSos = loadedSos.find(
        (s) => s.districtId === currentOfficer.jurisdictionAreaId || s.wardId === currentOfficer.jurisdictionAreaId
      );
      if (matchSos) {
        setSelectedSosId(matchSos.id);
      } else if (loadedSos.length > 0) {
        setSelectedSosId(loadedSos[0].id);
      }
      showToast(
        `Đã xác định địa bàn phụ trách của bạn: ${currentOfficer.jurisdictionAreaName} (${currentOfficer.fullName})`,
        'success'
      );
    } else if (loadedAreas.length > 0) {
      setSelectedAreaId(loadedAreas[0].id);
      if (loadedSos.length > 0) setSelectedSosId(loadedSos[0].id);
    }

    // Sync live from Geoapify Boundaries API
    domainDService.syncFromGeoapify().then((synced) => {
      if (synced && synced.length > 0) {
        setAreas(synced);
      }
    });
  };

  const handleSwitchOfficer = (officerId: string) => {
    const next = domainDService.setActiveOfficer(officerId);
    setActiveOfficer(next);
    if (next.jurisdictionAreaId) {
      setSelectedAreaId(next.jurisdictionAreaId);
      const matchSos = sosRequests.find(
        (s) => s.districtId === next.jurisdictionAreaId || s.wardId === next.jurisdictionAreaId
      );
      if (matchSos) {
        setSelectedSosId(matchSos.id);
      }
    }
    showToast(`Đã chuyển tài khoản: ${next.fullName} • Phụ trách ${next.jurisdictionAreaName}!`, 'success');
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Selected area object
  const selectedArea = useMemo(() => {
    return areas.find((a) => a.id === selectedAreaId) || areas[0] || ({} as AdministrativeArea);
  }, [areas, selectedAreaId]);

  // Selected SOS object
  const selectedSos = useMemo(() => {
    return sosRequests.find((s) => s.id === selectedSosId) || sosRequests[0] || ({} as SosRequest);
  }, [sosRequests, selectedSosId]);

  // Current active assignment for selected SOS
  const currentAssignment = useMemo(() => {
    if (!selectedSos || !selectedSos.id) return null;
    return domainDService.getAssignmentBySosId(selectedSos.id);
  }, [selectedSos, sosRequests]);

  // Urgent SOS count for top badge
  const urgentCount = useMemo(() => {
    return sosRequests.filter(
      (s) => (s.priority === 'CRITICAL' || s.priority === 'HIGH') && s.status !== 'COMPLETED'
    ).length;
  }, [sosRequests]);

  // Handlers for Territorial Governance
  const handleUpdateArea = (id: string, updates: Partial<AdministrativeArea>) => {
    const updated = domainDService.updateArea(id, updates);
    setAreas((prev) => prev.map((a) => (a.id === id ? updated : a)));
  };

  const handleCreateAuthority = (data: Omit<AuthorityOrganization, 'id' | 'activeRescueTeams'>) => {
    domainDService.createAuthority(data);
    setAuthorities(domainDService.getAuthorities());
    setAreas(domainDService.getAreas());
  };

  const handleAssignAuthority = (areaId: string, authorityId: string) => {
    domainDService.assignAuthorityToArea(areaId, authorityId);
    setAreas(domainDService.getAreas());
    setAuthorities(domainDService.getAuthorities());
  };

  // Handlers for Mission Dispatch
  const handleConfirmAssign = (params: {
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
  }) => {
    domainDService.assignSos(selectedSos.id, params);
    setSosRequests(domainDService.getSosRequests());
    showToast(`Mission successfully assigned to ${params.rescueTeamName}!`, 'success');
  };

  const handleUpdateAssignmentStatus = (assignmentId: string, nextStatus: AssignmentStatus) => {
    domainDService.updateAssignmentStatus(assignmentId, nextStatus);
    setSosRequests(domainDService.getSosRequests());
    showToast(`Mission status updated to ${nextStatus.replace(/_/g, ' ')}.`, 'success');
  };

  const handleReassignMission = (
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
  ) => {
    domainDService.reassignMission(assignmentId, params);
    setSosRequests(domainDService.getSosRequests());
  };

  const handleCancelAssignment = (assignmentId: string, reason: string) => {
    domainDService.cancelAssignment(assignmentId, reason);
    setSosRequests(domainDService.getSosRequests());
  };

  const handleCreateCitizenSos = (
    data: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>
  ) => {
    const created = domainDService.createSosRequest(data);
    setSosRequests(domainDService.getSosRequests());
    setSelectedSosId(created.id);
    showToast(
      `🚨 Nhận tín hiệu SOS khẩn cấp: ${created.sosCode} [${created.emergencyType}] • ${created.affectedPeople} người gặp nạn!`,
      'error'
    );
  };

  const handleResetData = () => {
    if (confirm('Reset all demo data back to default initial state?')) {
      domainDService.resetAll();
      loadAllData();
      showToast('All demonstration data has been reset.', 'success');
    }
  };

  return (
    <div className="rescuesos-app">
      {/* Top Navigation Bar with Segmented Mode Switcher & Officer Switcher */}
      <TopNavigation
        activeScreen={activeScreen}
        onChangeScreen={(screen) => setActiveScreen(screen)}
        onResetData={handleResetData}
        onSwitchToLogin={onSwitchToLogin}
        urgentSosCount={urgentCount}
        activeOfficer={activeOfficer}
        officers={officers}
        onSwitchOfficer={handleSwitchOfficer}
      />

      {/* Screen 1: Territorial Governance (State Preserved) */}
      <div style={{ display: activeScreen === 'territorial' ? 'flex' : 'none', flex: 1 }}>
        {areas.length > 0 && selectedArea && (
          <TerritorialGovernance
            areas={areas}
            authorities={authorities}
            selectedArea={selectedArea}
            onSelectArea={(area) => setSelectedAreaId(area.id)}
            onUpdateArea={handleUpdateArea}
            onCreateAuthority={handleCreateAuthority}
            onAssignAuthority={handleAssignAuthority}
            showToast={showToast}
            activeOfficer={activeOfficer}
            onSwitchScreen={(screen) => setActiveScreen(screen)}
          />
        )}
      </div>

      {/* Screen 2: Mission Dispatch (State Preserved) */}
      <div style={{ display: activeScreen === 'dispatch' ? 'flex' : 'none', flex: 1 }}>
        {sosRequests.length > 0 && selectedSos && (
          <MissionDispatch
            sosRequests={sosRequests}
            selectedSos={selectedSos}
            onSelectSos={(sos) => setSelectedSosId(sos.id)}
            assignment={currentAssignment}
            authorities={authorities}
            rescueTeams={rescueTeams}
            vehicles={vehicles}
            onConfirmAssign={handleConfirmAssign}
            onUpdateStatus={handleUpdateAssignmentStatus}
            onReassign={handleReassignMission}
            onCancelAssignment={handleCancelAssignment}
            onCreateCitizenSos={handleCreateCitizenSos}
            showToast={showToast}
            activeOfficer={activeOfficer}
            areas={areas}
          />
        )}
      </div>

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <div key={toast.id} className={`sos-toast ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

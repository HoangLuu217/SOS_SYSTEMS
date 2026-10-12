import { useState, useEffect, useMemo } from 'react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  AssignmentStatus,
} from '../../types/domainD';
import { domainDService } from '../../services/domainDService';
import { TerritorialGovernance } from '../territorial/TerritorialGovernance';
import { MissionDispatch } from '../dispatch/MissionDispatch';
import {
  Radio,
  MapPin,
  LogOut,
  ExternalLink,
  Sun,
  Moon,
  Map as MapIcon,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import '../RescueSos.css';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface Props {
  onSwitchToAuthor?: () => void;
  onLogout?: () => void;
}

export const AdminPortal = ({ onSwitchToAuthor, onLogout }: Props) => {
  const { theme, setTheme, mapMode, setMapMode } = useApp();
  const [activeTab, setActiveTab] = useState<'territorial' | 'dispatch'>('territorial');

  // Domain D data
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOrganization[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Fixed Admin Officer
  const adminOfficer: AuthorityOfficer = useMemo(() => {
    return (
      domainDService.getOfficers().find((o) => o.role === 'ADMIN') || {
        id: 'officer-admin-01',
        fullName: 'Nguyễn Quốc Tuấn',
        role: 'ADMIN',
        email: 'admin@rescuesos.gov.vn',
        phone: '0909999999',
        position: 'Tổng Chỉ Huy TP Đà Nẵng (ADMIN)',
        department: 'Trung Tâm Chỉ Huy Tác Chiến Toàn Thành Phố',
        jurisdictionAreaId: 'area-dn',
        jurisdictionAreaName: 'Toàn TP Đà Nẵng',
        districtName: 'Thành phố Đà Nẵng',
      }
    );
  }, []);

  const [selectedAreaId, setSelectedAreaId] = useState<string>('area-dn');
  const [selectedSosId, setSelectedSosId] = useState<string>('sos-8924');
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = () => {
    domainDService.setActiveOfficer(adminOfficer.id);
    setAreas(domainDService.getAreas());
    setAuthorities(domainDService.getAuthorities());
    setSosRequests(domainDService.getSosRequests());
    setRescueTeams(domainDService.getRescueTeams());
    setVehicles(domainDService.getVehicles());
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  const selectedArea = useMemo(() => {
    return areas.find((a) => a.id === selectedAreaId) || areas[0] || ({} as AdministrativeArea);
  }, [areas, selectedAreaId]);

  const selectedSos = useMemo(() => {
    return sosRequests.find((s) => s.id === selectedSosId) || sosRequests[0] || ({} as SosRequest);
  }, [sosRequests, selectedSosId]);

  const currentAssignment = useMemo(() => {
    if (!selectedSos || !selectedSos.id) return null;
    return domainDService.getAssignmentBySosId(selectedSos.id);
  }, [selectedSos, sosRequests]);

  const urgentCount = useMemo(() => {
    return sosRequests.filter(
      (s) => (s.priority === 'CRITICAL' || s.priority === 'HIGH') && s.status !== 'COMPLETED'
    ).length;
  }, [sosRequests]);

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
  };

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
    if (!selectedSos) return;
    domainDService.assignSos(selectedSos.id, params);
    setSosRequests(domainDService.getSosRequests());
    showToast(`Đã ra lệnh điều phối cấp thành phố cho ca ${selectedSos.sosCode}!`, 'success');
  };

  const handleUpdateAssignmentStatus = (assignmentId: string, nextStatus: AssignmentStatus) => {
    domainDService.updateAssignmentStatus(assignmentId, nextStatus);
    setSosRequests(domainDService.getSosRequests());
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
    showToast(`🚨 Nhận tín hiệu SOS mới: ${created.sosCode} [${created.emergencyType}]!`, 'error');
  };

  return (
    <div className="rescuesos-app admin-portal-wrapper">
      {/* Dedicated Admin Header */}
      <header
        style={{
          height: 60,
          background: 'var(--sos-bg-primary)',
          borderBottom: '1px solid var(--sos-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          zIndex: 50,
        }}
      >
        {/* Brand & Admin Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
            }}
          >
            👑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--sos-text-primary)', letterSpacing: '0.2px' }}>
                SOS SYSTEMS • CỔNG QUẢN TRỊ ADMIN
              </span>
              <span
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#b45309',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                }}
              >
                TOÀN THÀNH PHỐ
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 1 }}>
              Trung Tâm Chỉ Huy Tác Chiến & Quản Lý Ranh Giới 93 Xã / Phường Đà Nẵng
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'var(--sos-bg-secondary)',
            border: '1px solid var(--sos-border)',
            borderRadius: 8,
            padding: 3,
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('territorial')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'territorial' ? '#2563eb' : 'transparent',
              color: activeTab === 'territorial' ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <MapPin size={14} />
            <span>Quản Trị Ranh Giới (93 Vùng)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'dispatch' ? '#dc2626' : 'transparent',
              color: activeTab === 'dispatch' ? '#ffffff' : 'var(--sos-text-secondary)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Radio size={14} />
            <span>Tổng Điều Phối SOS Cấp TP</span>
            {urgentCount > 0 && (
              <span
                style={{
                  background: activeTab === 'dispatch' ? '#ffffff' : '#dc2626',
                  color: activeTab === 'dispatch' ? '#dc2626' : '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 10,
                }}
              >
                {urgentCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Controls: Switch to Author, Theme, Profile, Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Quick Flow Switcher Button to Author Portal */}
          {onSwitchToAuthor && (
            <button
              type="button"
              onClick={onSwitchToAuthor}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                color: '#dc2626',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Chuyển sang luồng tác chiến dành riêng cho Cán bộ địa phương (Author)"
            >
              <span>🛡️ Sang Cổng Author (Địa Phương)</span>
              <ExternalLink size={13} />
            </button>
          )}

          {/* Map Mode Switcher: Street Map vs Satellite */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
              border: '1px solid var(--sos-border)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <button
              type="button"
              onClick={() => setMapMode('street')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: mapMode === 'street' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
                color: mapMode === 'street' ? '#ffffff' : 'var(--sos-text-secondary)',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Bản đồ đường phố"
            >
              <MapIcon size={12} />
              <span>Đường phố</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('satellite')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: mapMode === 'satellite' ? (theme === 'dark' ? '#334155' : '#0f172a') : 'transparent',
                color: mapMode === 'satellite' ? '#ffffff' : 'var(--sos-text-secondary)',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Bản đồ vệ tinh"
            >
              <Layers size={12} />
              <span>Vệ tinh</span>
            </button>
          </div>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: 'transparent',
              border: '1px solid var(--sos-border)',
              borderRadius: 6,
              padding: '6px 8px',
              color: 'var(--sos-text-secondary)',
              cursor: 'pointer',
            }}
            title={theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Admin Profile Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 14 }}>⭐</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309' }}>
                {adminOfficer.fullName}
              </div>
              <div style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>
                Tổng Chỉ Huy TP Đà Nẵng
              </div>
            </div>
          </div>

          {/* Logout Button */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--sos-text-muted)',
                cursor: 'pointer',
                padding: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
              }}
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Screen 1: Territorial Governance for ADMIN (Full 93 Areas) */}
      <div style={{ display: activeTab === 'territorial' ? 'flex' : 'none', flex: 1 }}>
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
            activeOfficer={adminOfficer}
            onSwitchScreen={(screen) => setActiveTab(screen)}
          />
        )}
      </div>

      {/* Screen 2: Mission Dispatch for ADMIN (Full Citywide Dispatch) */}
      <div style={{ display: activeTab === 'dispatch' ? 'flex' : 'none', flex: 1 }}>
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
            activeOfficer={adminOfficer}
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

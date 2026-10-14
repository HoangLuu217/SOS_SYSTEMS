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
import { MissionDispatch } from '../dispatch/MissionDispatch';
import { TacticalMap } from '../dispatch/TacticalMap';
import {
  ShieldAlert,
  LogOut,
  Sun,
  Moon,
  Map as MapIcon,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isSosInOfficerJurisdiction } from '../../services/mapGeoService';
import { navigateTo, getCurrentSosIdFromUrl } from '../../services/appRouter';
import '../RescueSos.css';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

import type { User } from '../../types/auth';

interface Props {
  user?: User | null;
  onSwitchToAdmin?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

export const AuthorPortal = ({ user, onLogout, embedded = false }: Props) => {
  const { theme, setTheme, mapMode, setMapMode } = useApp();

  // Domain D data
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOrganization[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Local Author Officers
  const allOfficers = useMemo(() => domainDService.getOfficers(), []);
  const authorOfficers = useMemo(() => allOfficers.filter((o) => o.role !== 'ADMIN'), [allOfficers]);

  // Current Active Author (dynamically resolved from logged-in user or defaults to Hoa Cuong)
  const activeOfficer = useMemo<AuthorityOfficer>(() => {
    if (user) {
      const synced = domainDService.syncLoggedInUser(user);
      if (synced) return synced;
    }
    return (
      authorOfficers[0] || {
        id: 'officer-default',
        fullName: 'Cán Bộ Trực Ban Địa Bàn',
        role: 'AUTHOR',
        email: 'canbo@danang.gov.vn',
        phone: '0905000000',
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: 'Ban Chỉ Huy PCTT Địa Phương',
        jurisdictionAreaId: 'area-htd',
        jurisdictionAreaName: 'Địa Bàn Phụ Trách',
        districtName: 'Thành phố Đà Nẵng',
      }
    );
  }, [user, authorOfficers]);

  // Selection states
  const [selectedSosId, setSelectedSosId] = useState<string>('sos-8924'); // Default to Hoa Cuong SOS
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadAllData(activeOfficer.id);
  }, [activeOfficer.id]);

  // Lắng nghe URL pathname để đồng bộ SOS được chọn (ví dụ: /localauthor/map/sos-8924)
  useEffect(() => {
    const syncSosFromUrl = () => {
      const sosId = getCurrentSosIdFromUrl();
      if (sosId) {
        setSelectedSosId(sosId);
      }
    };
    syncSosFromUrl();
    window.addEventListener('popstate', syncSosFromUrl);
    return () => window.removeEventListener('popstate', syncSosFromUrl);
  }, []);

  const loadAllData = (officerId: string) => {
    domainDService.setActiveOfficer(officerId);
    const loadedAreas = domainDService.getAreas();
    const loadedSos = domainDService.getSosRequests();

    setAreas(loadedAreas);
    setAuthorities(domainDService.getAuthorities());
    setSosRequests(loadedSos);
    setRescueTeams(domainDService.getRescueTeams());
    setVehicles(domainDService.getVehicles());

    // Ưu tiên SOS ID từ URL pathname (/localauthor/map/:id) nếu có
    const urlSosId = getCurrentSosIdFromUrl();

    if (urlSosId && loadedSos.some((s) => s.id === urlSosId)) {
      setSelectedSosId(urlSosId);
    } else {
      // Find local SOS for this officer
      const matchSos = loadedSos.find(
        (s) => s.wardId === activeOfficer.jurisdictionAreaId || s.districtId === activeOfficer.jurisdictionAreaId
      );
      if (matchSos) {
        setSelectedSosId(matchSos.id);
        navigateTo('map', user ?? null, matchSos.id, true);
      }
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Strictly scope areas: For Admin, highlight the ward of selected SOS; for Author scope to managed ward
  const authorScopedAreas = useMemo(() => {
    if (activeOfficer.role === 'ADMIN') {
      const activeWardId = selectedSosId ? sosRequests.find((s) => s.id === selectedSosId)?.wardId : null;
      if (activeWardId) {
        const found = areas.find((a) => a.id === activeWardId || a.code === activeWardId);
        if (found) return [found];
      }
      return areas.length > 0 ? [areas[0]] : [];
    }
    const targetArea = areas.find(
      (a) =>
        a.id === activeOfficer.jurisdictionAreaId ||
        a.code === activeOfficer.jurisdictionAreaId ||
        (activeOfficer.jurisdictionAreaName &&
          a.name.toLowerCase().includes(activeOfficer.jurisdictionAreaName.replace('Phường ', '').toLowerCase()))
    );
    return targetArea ? [targetArea] : (areas.length > 0 ? [areas[0]] : []);
  }, [areas, activeOfficer, selectedSosId, sosRequests]);

  // Strictly filter SOS requests: For Admin show all citywide SOS, for Author filter to managed ward
  const authorScopedSosRequests = useMemo(() => {
    if (activeOfficer.role === 'ADMIN') {
      return sosRequests;
    }
    const managedWard = authorScopedAreas[0];
    return sosRequests.filter((s) => isSosInOfficerJurisdiction(s, activeOfficer, managedWard));
  }, [sosRequests, activeOfficer, authorScopedAreas]);

  const selectedSos = useMemo(() => {
    return (
      authorScopedSosRequests.find((s) => s.id === selectedSosId) ||
      authorScopedSosRequests[0] ||
      ({} as SosRequest)
    );
  }, [authorScopedSosRequests, selectedSosId]);

  const currentAssignment = useMemo(() => {
    if (!selectedSos || !selectedSos.id) return null;
    return domainDService.getAssignmentBySosId(selectedSos.id);
  }, [selectedSos]);

  // Urgent local count
  const localUrgentCount = useMemo(() => {
    return authorScopedSosRequests.filter(
      (s) => (s.priority === 'CRITICAL' || s.priority === 'HIGH') && s.status !== 'COMPLETED'
    ).length;
  }, [authorScopedSosRequests]);

  // Compute officer initials for avatar badge (e.g. "TC" for Trần Văn Cường)
  const officerFullName = activeOfficer?.fullName;
  const officerInitials = useMemo(() => {
    if (!officerFullName) return 'CB';
    const parts = officerFullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [officerFullName]);

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
    showToast(`Đã xuất kích ${params.rescueTeamName} ứng cứu ca ${selectedSos.sosCode}!`, 'success');
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
    showToast(`🚨 Nhận báo cáo cứu nạn: ${created.sosCode}!`, 'error');
  };

  return (
    <div className={`rescuesos-app author-portal-wrapper ${embedded ? 'embedded-dashboard' : ''}`}>
      {/* Network Disconnect Alert Banner */}
      {!isOnline && (
        <div
          style={{
            background: '#dc2626',
            color: '#ffffff',
            textAlign: 'center',
            padding: '7px 16px',
            fontSize: 12,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            letterSpacing: '0.4px',
            zIndex: 100,
          }}
        >
          <ShieldAlert size={16} />
          <span>MẤT KẾT NỐI MẠNG - ĐANG THỬ KẾT NỐI LẠI...</span>
        </div>
      )}

      {/* Unified Command Bar Header */}
      <header className="author-command-nav">
        {/* Left: Sector & Status (Unified, cohesive cluster) */}
        <div className="author-header-left">
          <div className="author-jurisdiction-badge" title="Địa bàn tác chiến được giao quản lý">
            <ShieldAlert size={14} className="author-shield-icon" />
            <span className="author-jurisdiction-name">
              {activeOfficer.role === 'ADMIN' ? 'Toàn TP Đà Nẵng' : (activeOfficer.jurisdictionAreaName || 'Phường An Hải')}
            </span>
          </div>

          <span className="author-header-divider">/</span>

          <span className="author-view-label">
            {activeOfficer.role === 'ADMIN' ? 'Giám sát cứu nạn toàn thành phố' : 'Điều hành tác chiến SOS'}
          </span>

          {/* Integrated live status (immediately next to sector, not floating in the middle!) */}
          <div className={`author-live-chip ${localUrgentCount > 0 ? 'urgent' : 'normal'}`}>
            <span className="author-chip-dot" />
            <span>
              {localUrgentCount > 0
                ? `${localUrgentCount} sự cố khẩn cấp`
                : 'Trực ban 24/7'}
            </span>
          </div>
        </div>

        {/* Right: Map Mode, Theme, Officer Profile, Logout */}
        <div className="author-right-controls">
          {/* Map Mode Segmented Control */}
          <div className="author-segmented-map" title="Chế độ hiển thị bản đồ tác chiến">
            <button
              type="button"
              onClick={() => setMapMode('street')}
              className={`author-map-btn ${mapMode === 'street' ? 'active' : ''}`}
              title="Bản đồ đường phố"
            >
              <MapIcon size={12} />
              <span>Đường phố</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('satellite')}
              className={`author-map-btn ${mapMode === 'satellite' ? 'active' : ''}`}
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
            className="author-icon-action-btn"
            title={theme === 'dark' ? 'Chuyển sang Chế độ Sáng' : 'Chuyển sang Chế độ Tối'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Officer Profile Badge & Logout (Only if not embedded in main dashboard sidebar) */}
          {!embedded && (
            <>
              <div className="author-officer-chip" title={`${activeOfficer.fullName} • ${activeOfficer.jurisdictionAreaName}`}>
                <div className="author-officer-avatar">
                  <span>{officerInitials}</span>
                  <span className="author-officer-online-dot" title="Đang trực tuyến" />
                </div>
                <div className="author-officer-meta">
                  <div className="author-officer-name">{activeOfficer.fullName}</div>
                  <div className="author-officer-role">
                    {activeOfficer.position?.replace(` ${activeOfficer.jurisdictionAreaName}`, '') || 'Chỉ Huy Trực Ban'}
                  </div>
                </div>
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="author-logout-btn"
                  title="Đăng xuất khỏi phiên trực"
                >
                  <LogOut size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Mission Dispatch for AUTHOR (Scoped to Local Sector) */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {authorScopedSosRequests.length > 0 && selectedSos ? (
          <MissionDispatch
            sosRequests={authorScopedSosRequests}
            selectedSos={selectedSos}
            onSelectSos={(sos) => {
              setSelectedSosId(sos.id);
              navigateTo('map', user ?? null, sos.id);
            }}
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
            areas={authorScopedAreas}
          />
        ) : (
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <TacticalMap
              selectedSos={null}
              assignment={null}
              activeOfficer={activeOfficer}
              areas={authorScopedAreas}
              sosRequests={[]}
            />
            {/* Floating indicator: Khu vực an toàn */}
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 450,
                background: 'var(--sos-surface)',
                border: '1px solid var(--sos-border)',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                animation: 'fadeIn 0.2s ease-out',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                🛡️
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--sos-text-primary)' }}>
                  Địa Bàn An Toàn • {activeOfficer.jurisdictionAreaName}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--sos-text-secondary)', marginTop: 2 }}>
                  Hiện không có tín hiệu SOS khẩn cấp trong khu vực quản lý. Trực chiến 24/7.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <div key={toast.id} className={`sos-toast ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export { LocalAuthorityDashboard } from './LocalAuthorityDashboard';


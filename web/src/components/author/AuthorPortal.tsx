import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { fetchSosRequests } from '../../services/api';
import { MissionDispatch } from '../dispatch/MissionDispatch';
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

export const AuthorPortal = ({ user, onSwitchToAdmin: _onSwitchToAdmin, onLogout, embedded = false }: Props) => {
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
      authorOfficers.find((o) => o.jurisdictionAreaId === 'area-htd') ||
      authorOfficers[0] || {
        id: 'officer-hc-htd',
        fullName: 'Trần Văn Cường',
        role: 'AUTHOR',
        email: 'cuong.tran@hoacuong.danang.gov.vn',
        phone: '0905114116',
        position: 'Author Quản Lý Phường Hòa Cường',
        department: 'Ban Chỉ Huy PCTT Phường Hòa Cường',
        jurisdictionAreaId: 'area-htd',
        jurisdictionAreaName: 'Phường Hòa Cường',
        districtName: 'Quận Hải Châu',
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

  // Đồng bộ SOS thực tế từ cơ sở dữ liệu MongoDB (từ ứng dụng mobile app người dân)
  const syncRealSosFromApi = useCallback(async (officer: AuthorityOfficer) => {
    try {
      const res = await fetchSosRequests();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const realMapped: SosRequest[] = res.data.map((item) => {
          const lng = item.location?.coordinates?.[0] ?? 108.2178;
          const lat = item.location?.coordinates?.[1] ?? 16.0465;
          const citizenName =
            typeof item.citizenId === 'object' && item.citizenId?.fullName
              ? item.citizenId.fullName
              : 'Người dân';
          const citizenPhone =
            typeof item.citizenId === 'object' && item.citizenId?.phone
              ? item.citizenId.phone
              : '0905000000';

          const diffMinutes = Math.max(
            0,
            Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000)
          );
          const timeAgo =
            diffMinutes < 1
              ? 'Vừa xong'
              : diffMinutes < 60
              ? `${diffMinutes} phút trước`
              : `${Math.floor(diffMinutes / 60)} giờ trước`;

          return {
            id: item._id,
            sosCode: item.sosCode || `#${item._id.slice(-4).toUpperCase()}`,
            timeAgo,
            createdAt: item.createdAt,
            emergencyType:
              item.emergencyType === 'FLOOD'
                ? 'Flood'
                : item.emergencyType === 'FIRE'
                ? 'Fire'
                : item.emergencyType === 'MEDICAL'
                ? 'Medical Emergency'
                : 'RESCUE',
            priority: (item.priority || 'HIGH') as any,
            title: item.description
              ? item.description.length > 55
                ? item.description.slice(0, 52) + '...'
                : item.description
              : `Cứu hộ ngập lụt: ${item.people || 1} người gặp nguy`,
            description: item.description || `Yêu cầu cứu nạn khẩn cấp tại ${item.address}`,
            locationName: item.address || 'Vị trí cứu nạn',
            wardId: officer.jurisdictionAreaId,
            wardName: item.address || officer.jurisdictionAreaName,
            districtId: officer.jurisdictionAreaId,
            districtName: officer.districtName,
            citizenName,
            citizenPhone,
            affectedPeople: item.people || 1,
            status: (item.status === 'PENDING' ? 'VERIFIED' : item.status) as any,
            coordinates: {
              lat,
              lng,
              svgX: 370,
              svgY: 280,
            },
            assignmentId: null,
            imageUrl: item.imageUrl || (item.images && item.images.length > 0 ? item.images[0] : undefined),
            images: item.images || (item.imageUrl ? [item.imageUrl] : undefined),
          };
        });

        domainDService.syncRealSosRequests(realMapped);
        setSosRequests(domainDService.getSosRequests());

        // Nếu URL chưa chỉ định SOS cụ thể, ưu tiên chọn ca SOS mới nhất từ app
        const currentUrlId = getCurrentSosIdFromUrl();
        if (!currentUrlId && realMapped.length > 0) {
          setSelectedSosId((prev) => (prev.startsWith('sos-') && !prev.includes('real') ? realMapped[0].id : prev));
        }
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ dữ liệu SOS từ server:', err);
    }
  }, []);

  useEffect(() => {
    loadAllData(activeOfficer.id);

    // Định kỳ 6 giây tự động cập nhật tín hiệu SOS mới từ người dân
    const interval = setInterval(() => {
      syncRealSosFromApi(activeOfficer);
    }, 6000);

    const handleUpdateEvent = () => syncRealSosFromApi(activeOfficer);
    window.addEventListener('sos_data_updated', handleUpdateEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('sos_data_updated', handleUpdateEvent);
    };
  }, [activeOfficer.id, activeOfficer, syncRealSosFromApi]);

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

    // Đồng bộ ngay dữ liệu thật từ MongoDB
    syncRealSosFromApi(activeOfficer);

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

  // Strictly scope areas to ONLY the ward managed by this Author account
  const authorScopedAreas = useMemo(() => {
    const targetArea = areas.find(
      (a) =>
        a.id === activeOfficer.jurisdictionAreaId ||
        a.code === activeOfficer.jurisdictionAreaId ||
        (activeOfficer.jurisdictionAreaName &&
          a.name.toLowerCase().includes(activeOfficer.jurisdictionAreaName.replace('Phường ', '').toLowerCase()))
    );
    return targetArea ? [targetArea] : (areas.length > 0 ? [areas[0]] : []);
  }, [areas, activeOfficer.jurisdictionAreaId, activeOfficer.jurisdictionAreaName]);

  // Strictly filter SOS requests: các yêu cầu thật từ app (MongoDB _id) luôn được hiển thị để không bỏ sót cứu nạn
  const authorScopedSosRequests = useMemo(() => {
    const managedWard = authorScopedAreas[0];
    return sosRequests.filter((s) => {
      if (s.id.length === 24) return true; // SOS thật từ MongoDB
      return isSosInOfficerJurisdiction(s, activeOfficer, managedWard);
    });
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
  const officerInitials = useMemo(() => {
    if (!activeOfficer?.fullName) return 'CB';
    const parts = activeOfficer.fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [activeOfficer?.fullName]);

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

      {/* Ultra-modern Author Command Center Header */}
      <header className="author-command-nav">
        {/* Left: Brand & Local Sector Identity */}
        <div className="author-brand-group">
          <div className="author-brand-badge" title="Trung tâm Tác chiến Khẩn cấp Cấp Cơ Sở">
            <ShieldAlert size={19} />
          </div>
          <div className="author-brand-text">
            <div className="author-brand-row">
              <span className="author-brand-title">{embedded ? 'ĐIỀU HÀNH TÁC CHIẾN' : 'SOS SYSTEMS'}</span>
              <span className="author-brand-tag">
                {activeOfficer.jurisdictionAreaName}
              </span>
            </div>
            <div className="author-brand-sub">
              Ban Chỉ Huy PCTT & TKCN • Cấp Cơ Sở
            </div>
          </div>
        </div>

        {/* Center: Live Tactical Status HUD */}
        <div className="author-center-hud">
          {localUrgentCount > 0 ? (
            <div className="author-hud-pill urgent" title="Có sự cố khẩn cấp đang diễn ra trên địa bàn">
              <span className="author-radar-dot" />
              <span>ĐANG XỬ LÝ:</span>
              <span className="author-urgent-count-badge">{localUrgentCount} KHẨN CẤP</span>
            </div>
          ) : (
            <div className="author-hud-pill safe" title="Toàn bộ địa bàn an toàn, sẵn sàng trực chiến">
              <span className="author-safe-dot" />
              <span>ĐỊA BÀN ỔN ĐỊNH • TRỰC CHIẾN 24/7</span>
            </div>
          )}
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
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--sos-surface)',
              color: 'var(--sos-text-secondary)',
            }}
          >
            <span style={{ fontSize: 48, marginBottom: 12 }}>🛡️</span>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--sos-text-primary)' }}>
              Địa Bàn An Toàn - Không Có Tín Hiệu SOS
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sos-text-muted)' }}>
              Khu vực {activeOfficer.jurisdictionAreaName} hiện không có sự cố khẩn cấp nào cần điều phối.
            </p>
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


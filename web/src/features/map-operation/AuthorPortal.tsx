import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  AssignmentStatus,
} from '@/types/domainD';
import { domainDService } from '@/services/domainDService';
import { fetchSosRequests } from '@/api';
import { MissionDispatch } from './dispatch/MissionDispatch';
import { TacticalMap } from './dispatch/TacticalMap';
import {
  ShieldAlert,
  LogOut,
  Sun,
  Moon,
  Map as MapIcon,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { isSosInOfficerJurisdiction } from '@/services/mapGeoService';
import { navigateTo, getCurrentSosIdFromUrl } from '@/services/appRouter';
import { onSosCreated, onSosUpdated } from '@/services/socketService';
import './RescueSos.css';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

import type { User } from '@/types/auth';

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

  // Đồng bộ SOS thực tế từ cơ sở dữ liệu MongoDB (từ ứng dụng mobile app người dân)
  const syncRealSosFromApi = useCallback(async (officer: AuthorityOfficer) => {
    try {
      const fetchParams: Record<string, string> = {};
      if (officer.role !== 'ADMIN' && officer.jurisdictionAreaId) {
        fetchParams.areaId = officer.jurisdictionAreaId;
      }
      const res = await fetchSosRequests(fetchParams);
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const realMapped: SosRequest[] = res.data.map((item: any) => {
          const lng = item.location?.coordinates?.[0] ?? 108.2178;
          const lat = item.location?.coordinates?.[1] ?? 16.0465;

          const citizenObj =
            typeof item.citizenId === 'object' && item.citizenId !== null
              ? item.citizenId
              : null;
          const citizenName =
            citizenObj?.fullName ||
            (typeof item.citizenName === 'string' && item.citizenName ? item.citizenName : 'Người dân');
          const citizenPhone =
            item.contactPhone ||
            citizenObj?.phone ||
            (typeof item.citizenPhone === 'string' && item.citizenPhone ? item.citizenPhone : '0905000000');

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

          const areaObj =
            typeof item.areaId === 'object' && item.areaId !== null
              ? item.areaId
              : null;
          const itemAreaId = areaObj?._id || (typeof item.areaId === 'string' ? item.areaId : '') || '';
          const itemAreaName = areaObj?.name || item.address || '';

          // Chuẩn hóa loại khẩn cấp sang định dạng UPPERCASE chuẩn (MEDICAL, FLOOD, FIRE, RESCUE, ...)
          const rawType = (item.emergencyType || 'RESCUE').toUpperCase();
          const emergencyType =
            rawType === 'FLOOD' || rawType === 'NGAP_LUT'
              ? 'FLOOD'
              : rawType === 'FIRE' || rawType === 'CHAY'
              ? 'FIRE'
              : rawType === 'MEDICAL' || rawType === 'Y_TE'
              ? 'MEDICAL'
              : rawType === 'POLICE'
              ? 'POLICE'
              : 'RESCUE';

          // Đồng bộ khu vực với cán bộ đang đăng nhập
          const wardId = officer.jurisdictionAreaId || itemAreaId || 'area-cl';
          const wardName = itemAreaName || officer.jurisdictionAreaName || 'Địa bàn phụ trách';
          const districtId = officer.jurisdictionAreaId || itemAreaId || 'area-cl';
          const districtName = officer.districtName || 'Quận Cẩm Lệ';

          return {
            id: item._id,
            sosCode: item.sosCode || `#${item._id.slice(-4).toUpperCase()}`,
            timeAgo,
            createdAt: item.createdAt,
            emergencyType: emergencyType as any,
            priority: (item.priority || 'HIGH') as any,
            title: (() => {
              const rawDesc = item.description || '';
              if (rawDesc.includes('[Loại yêu cầu:')) {
                const userContent = rawDesc
                  .replace(/\[Loại yêu cầu:[^\]]+\]/g, '')
                  .replace(/\[SĐT:[^\]]+\]/g, '')
                  .replace(/\[Ưu tiên:[^\]]+\]/g, '')
                  .trim();
                const typeMatch = rawDesc.match(/\[Loại yêu cầu:\s*([^\]]+)\]/);
                if (userContent) {
                  return userContent.length > 55 ? userContent.slice(0, 52) + '...' : userContent;
                } else if (typeMatch && typeMatch[1]) {
                  return typeMatch[1];
                }
              }
              if (rawDesc) {
                return rawDesc.length > 55 ? rawDesc.slice(0, 52) + '...' : rawDesc;
              }
              return emergencyType === 'FLOOD' ? 'Cứu hộ ngập lụt / Mắc kẹt' : 'Yêu cầu cứu nạn khẩn cấp';
            })(),
            description: item.description || `Yêu cầu cứu nạn khẩn cấp tại ${item.address}`,
            locationName: item.address || 'Vị trí cứu nạn',
            wardId,
            wardName,
            districtId,
            districtName,
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
            priorityGroups: (() => {
              if (Array.isArray(item.priorityGroups) && item.priorityGroups.length > 0) {
                return item.priorityGroups;
              }
              const desc = item.description || '';
              if (desc.includes('[Đối tượng ưu tiên:')) {
                const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
                if (match && match[1]) {
                  return match[1].split(',').map((s: string) => s.trim()).filter(Boolean);
                }
              }
              return undefined;
            })(),
            senderRole: (() => {
              const citizen = typeof item.citizenId === 'object' && item.citizenId !== null ? item.citizenId : null;
              const roles = citizen?.roles;
              if (Array.isArray(roles) && roles.includes('RESCUER')) return 'RESCUER';
              return 'CITIZEN';
            })(),
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

    // Lắng nghe sự kiện Realtime Socket.IO khi có người dân bấm gửi SOS trên App
    const unsubCreated = onSosCreated((newSos) => {
      syncRealSosFromApi(activeOfficer);
      const citizenName =
        typeof newSos?.citizenId === 'object' && newSos.citizenId?.fullName
          ? newSos.citizenId.fullName
          : 'Người dân';
      const people = newSos?.people || 1;
      const addr = newSos?.address || 'Khu vực ngập lụt';
      showToast(`🚨 [SOS KHẨN CẤP] Nhận yêu cầu cứu trợ mới từ ${citizenName} (${people} người gặp nạn tại ${addr})!`, 'success');
      if (newSos?._id) {
        setSelectedSosId(newSos._id);
      }
    });

    // Lắng nghe sự kiện Realtime cập nhật trạng thái SOS (xác minh, hoàn thành ca)
    const unsubUpdated = onSosUpdated((updatedSos) => {
      syncRealSosFromApi(activeOfficer);
      if (updatedSos?._id) {
        showToast(`ℹ️ Cập nhật trạng thái SOS: ${updatedSos.status}`, 'success');
      }
    });

    // Định kỳ 15 giây dự phòng kiểm tra lại tín hiệu SOS từ server
    const interval = setInterval(() => {
      syncRealSosFromApi(activeOfficer);
    }, 15000);

    const handleUpdateEvent = () => syncRealSosFromApi(activeOfficer);
    window.addEventListener('sos_data_updated', handleUpdateEvent);

    return () => {
      unsubCreated();
      unsubUpdated();
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

    // Nạp tự động ranh giới GeoJSON cho cán bộ địa phương (đặc biệt ngoài Đà Nẵng)
    if (activeOfficer.role !== 'ADMIN' && (activeOfficer.jurisdictionAreaId || activeOfficer.jurisdictionAreaName)) {
      domainDService.loadBoundaryForOfficer(activeOfficer).then((updatedArea) => {
        if (updatedArea) {
          setAreas(domainDService.getAreas());
        }
      });
    }

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

  useEffect(() => {
    if (activeOfficer && activeOfficer.role !== 'ADMIN' && (activeOfficer.jurisdictionAreaId || activeOfficer.jurisdictionAreaName)) {
      domainDService.loadBoundaryForOfficer(activeOfficer).then((updatedArea) => {
        if (updatedArea) {
          setAreas(domainDService.getAreas());
        }
      });
    }
  }, [activeOfficer.jurisdictionAreaId, activeOfficer.jurisdictionAreaName, activeOfficer.districtName]);

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
    const cleanJurisdictionName = activeOfficer.jurisdictionAreaName
      ? activeOfficer.jurisdictionAreaName.replace(/^(phường|xã|quận|huyện)\s+/i, '').toLowerCase()
      : '';
    const targetArea = areas.find(
      (a) =>
        a.id === activeOfficer.jurisdictionAreaId ||
        a.code === activeOfficer.jurisdictionAreaId ||
        (cleanJurisdictionName &&
          a.name.toLowerCase().includes(cleanJurisdictionName))
    );
    if (targetArea) return [targetArea];

    // Fallback: Trả về stub khu vực quản lý của chính cán bộ, tuyệt đối không fallback về Đà Nẵng nếu cán bộ thuộc tỉnh thành khác
    if (activeOfficer.jurisdictionAreaName || activeOfficer.jurisdictionAreaId) {
      return [{
        id: activeOfficer.jurisdictionAreaId || 'temp-officer-area',
        name: activeOfficer.jurisdictionAreaName || 'Địa Bàn Phụ Trách',
        code: `VN-${activeOfficer.jurisdictionAreaId || 'OFFICER'}`,
        type: 'WARD' as any,
        parentId: null,
        status: 'ACTIVE' as any,
      }];
    }
    return areas.length > 0 ? [areas[0]] : [];
  }, [areas, activeOfficer, selectedSosId, sosRequests]);

  // Strictly filter SOS requests: For Admin show all citywide SOS, for Author filter strictly to managed area
  const authorScopedSosRequests = useMemo(() => {
    if (activeOfficer.role === 'ADMIN') {
      return sosRequests;
    }
    const managedWard = authorScopedAreas[0];
    return sosRequests.filter((s) => {
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

          {/* Điểm Nguy Hiểm Shortcut */}
          <button
            type="button"
            onClick={() => navigateTo('hazard_reports', user ?? null)}
            className="author-map-btn"
            style={{
              borderColor: '#f97316',
              color: '#ea580c',
              fontWeight: 600,
              gap: '5px',
            }}
            title="Quản lý & Tạo Điểm Nguy Hiểm trên địa bàn (UC-L15)"
          >
            <AlertTriangle size={12} color="#ea580c" />
            <span>Điểm Nguy Hiểm</span>
          </button>

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


import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@/types/auth';
import {
  fetchSosRequests,
  fetchAdminUsers,
  fetchChatConversations,
} from '@/api';
import { domainDService } from '@/services/domainDService';
import {
  onRescuerApplicationSubmitted,
  onRescuerVerificationChanged,
  onSosCreated,
  onSosUpdated,
  onSosDeleted,
  onAssignmentUpdated,
} from '@/services/socketService';
import { getRolePrefix } from '@/services/appRouter';
import {
  Map,
  Siren,
  LifeBuoy,
  Package,
  Truck,
  Bell,
  Home,
  AlertTriangle,
  BarChart3,
  History,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Users,
  UserCheck,
  Building2,
  Globe2,
  MessageSquare,
  CloudSun,
  ShieldCheck,
  Droplet,
  User as UserIcon,
  LogOut,
  MapPin,
  PhoneCall,
} from 'lucide-react';

import './Sidebar.css';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ==========================================================================
   TYPE DEFINITIONS & MENU CONFIGURATIONS
   ========================================================================== */

export type NavItemKey =
  | 'map'
  | 'sos_requests'
  | 'coordination'
  | 'rescuers'
  | 'rescuers_approval'
  | 'resources'
  | 'notifications'
  | 'alerts'
  | 'weather'
  | 'safety_checks'
  | 'blood_donations'
  | 'shelters'
  | 'hazard_reports'
  | 'reports'
  | 'operation_logs'
  | 'chat'
  | 'profile'
  | 'settings'
  | 'citizens'
  | 'rescuers_admin'
  | 'authorities'
  | 'areas'
  | 'rbac'
  | 'audit_logs';

export interface NavItemConfig {
  key: NavItemKey;
  label: string;
  useCase?: string;
  icon: React.ReactNode;
  badge?: string;
  badgeType?: 'danger' | 'info' | 'warning';
}

export interface NavGroupConfig {
  title?: string;
  items: NavItemConfig[];
}

export interface SidebarProps {
  user?: User | null;
  activeKey?: NavItemKey;
  onSelectKey?: (key: NavItemKey, subPath?: string) => void;
  onLogout?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  hiddenRail?: boolean;
}

/* ==========================================================================
   CHRONICLE APP SIDEBAR (WORKSPACE SWITCHER + CALM NAVMAIN + NAVUSER FOOTER)
   ========================================================================== */

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeKey = 'rescuers',
  onSelectKey,
  onLogout,
  collapsed = false,
  hiddenRail = false,
}) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const [sosCounts, setSosCounts] = useState<{ unassigned: number; active: number }>({
    unassigned: 0,
    active: 0,
  });
  const [pendingRescuersCount, setPendingRescuersCount] = useState<number>(0);
  const [chatUnreadCount, setChatUnreadCount] = useState<number>(0);

  // Chronicle inline tree for Phương tiện & Vật tư + collapsed flyout
  const [isResourcesExpanded, setIsResourcesExpanded] = useState<boolean>(
    () => activeKey === 'resources'
  );
  const [isResourcesFlyoutOpen, setIsResourcesFlyoutOpen] = useState(false);
  const [flyoutPosition, setFlyoutPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [currentResourceSubTab, setCurrentResourceSubTab] = useState<
    'VEHICLES' | 'SUPPLIES' | 'CONSUMABLES'
  >('VEHICLES');

  // Popover states for Workspace Switcher & NavUser
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const flyoutTimerRef = useRef<any>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const resourcesItemRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const userFooterRef = useRef<HTMLDivElement | null>(null);
  const isFetchingCountsRef = useRef(false);

  const [activePillRect, setActivePillRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [pillReady, setPillReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || hiddenRail || typeof window === 'undefined') {
      setActivePillRect(null);
      return;
    }

    const measure = () => {
      const target = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!target) {
        setActivePillRect(null);
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const elBox = target.getBoundingClientRect();
      if (elBox.width === 0 || elBox.height === 0) return;
      setActivePillRect({
        top: elBox.top - navBox.top - nav.clientTop + nav.scrollTop,
        left: elBox.left - navBox.left - nav.clientLeft + nav.scrollLeft,
        width: elBox.width,
        height: elBox.height,
      });
    };

    measure();
    const raf = window.requestAnimationFrame(() => {
      measure();
      setPillReady(true);
    });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(nav);

    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [activeKey, collapsed, hiddenRail, isResourcesExpanded, currentResourceSubTab, isAdmin]);

  // Close sidebar popovers on outside click / Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (workspaceRef.current && !workspaceRef.current.contains(target)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (userFooterRef.current && !userFooterRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWorkspaceMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Đồng bộ số liệu thời gian thực (chạy song song 3 API, tránh chồng chéo request)
  const fetchRealCounts = useCallback(async () => {
    if (isFetchingCountsRef.current) return;
    isFetchingCountsRef.current = true;

    try {
      const fetchParams: Record<string, string> = {};
      if (!isAdmin && user?.authority?.areaId) {
        fetchParams.areaId = user.authority.areaId;
      }

      const [sosResult, rescuerResult, chatResult] = await Promise.allSettled([
        fetchSosRequests(fetchParams),
        fetchAdminUsers({ role: 'RESCUER', limit: '100' }),
        fetchChatConversations(),
      ]);

      if (sosResult.status === 'fulfilled') {
        const res = sosResult.value;
        if (res.success && Array.isArray(res.data)) {
          const unassigned = res.data.filter((s) => ['PENDING', 'VERIFIED'].includes(s.status)).length;
          const active = res.data.filter((s) =>
            ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)
          ).length;
          setSosCounts({ unassigned, active });
        } else {
          const fallback = domainDService
            .getSosRequests()
            .filter((s) => !s.id?.startsWith('sos-89') && !s.id?.startsWith('sos-dn-'));
          const unassigned = fallback.filter((s) => ['PENDING', 'VERIFIED'].includes(s.status)).length;
          const active = fallback.filter(
            (s) =>
              ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(
                s.status as any
              ) || !!s.assignmentId
          ).length;
          setSosCounts({ unassigned, active });
        }
      }

      if (rescuerResult.status === 'fulfilled') {
        const rescuerRes = rescuerResult.value;
        if (rescuerRes.success && Array.isArray(rescuerRes.data?.users)) {
          let rescuers = rescuerRes.data.users;
          const isAdminUser = Boolean(
            user?.roles?.includes('ADMIN') || (user as any)?.role === 'ADMIN'
          );

          if (!isAdminUser) {
            const activeOfficer = domainDService.getActiveOfficer();
            const userAreaId =
              user?.authority?.areaId ||
              (user?.authority as any)?.administrativeAreaId ||
              (user?.authority as any)?.jurisdictionAreaId ||
              activeOfficer?.jurisdictionAreaId;

            const userAreaName =
              user?.authority?.areaName ||
              (user?.authority as any)?.jurisdictionAreaName ||
              activeOfficer?.jurisdictionAreaName ||
              '';

            const localCommuneName = (userAreaName || '').split(',')[0].trim();
            const cleanLocalCommune = localCommuneName
              .replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '')
              .trim()
              .toLowerCase();

            if (cleanLocalCommune || userAreaId) {
              const normalizeStr = (s: string) =>
                s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const normCommune = normalizeStr(cleanLocalCommune);

              rescuers = rescuers.filter((u: any) => {
                const rescuerAreaId =
                  u.rescuer?.areaId?._id ||
                  u.rescuer?.areaId ||
                  u.areaId?._id ||
                  u.areaId ||
                  u.citizen?.areaId?._id ||
                  u.citizen?.areaId;
                if (
                  userAreaId &&
                  (u.authority?.areaId === userAreaId ||
                    u.rescuer?.preferredAreaId === userAreaId ||
                    String(rescuerAreaId || '') === String(userAreaId))
                ) {
                  return true;
                }
                const addrStr =
                  typeof u.address === 'string'
                    ? u.address
                    : `${u.address?.street || ''} ${u.address?.communeName || u.address?.ward || ''} ${u.address?.province || ''}`;
                const target = `${u.rescuer?.areaName || ''} ${u.rescuer?.targetCommune || ''} ${addrStr}`.toLowerCase();
                return (
                  (cleanLocalCommune && target.includes(cleanLocalCommune)) ||
                  (normCommune && normalizeStr(target).includes(normCommune))
                );
              });
            }
          }

          const pendingCount = rescuers.filter(
            (u: any) =>
              (u.rescuer?.verificationStatus || u.verificationStatus || 'PENDING') === 'PENDING'
          ).length;
          setPendingRescuersCount(pendingCount);
        }
      }

      if (chatResult.status === 'fulfilled') {
        const chatRes = chatResult.value;
        if (chatRes.success && Array.isArray(chatRes.data)) {
          const total = chatRes.data.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
          setChatUnreadCount(total);
        }
      }
    } finally {
      isFetchingCountsRef.current = false;
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetchRealCounts();
    const timer = setInterval(fetchRealCounts, 10000);

    const onDataUpdated = () => fetchRealCounts();
    window.addEventListener('sos_data_updated', onDataUpdated);
    window.addEventListener('storage', onDataUpdated);
    window.addEventListener('sos_chat_unread_updated', onDataUpdated);

    const unsubApp = onRescuerApplicationSubmitted(() => fetchRealCounts());
    const unsubVer = onRescuerVerificationChanged(() => fetchRealCounts());
    const unsubSosCreated = onSosCreated(() => fetchRealCounts());
    const unsubSosUpdated = onSosUpdated(() => fetchRealCounts());
    const unsubSosDeleted = onSosDeleted(() => fetchRealCounts());
    const unsubAssign = onAssignmentUpdated(() => fetchRealCounts());

    return () => {
      clearInterval(timer);
      window.removeEventListener('sos_data_updated', onDataUpdated);
      window.removeEventListener('storage', onDataUpdated);
      window.removeEventListener('sos_chat_unread_updated', onDataUpdated);
      unsubApp();
      unsubVer();
      unsubSosCreated();
      unsubSosUpdated();
      unsubSosDeleted();
      unsubAssign();
    };
  }, [fetchRealCounts]);

  // Phát sự kiện đồng bộ số đếm thời gian thực lên Inset Header
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('sos_sidebar_counts', {
        detail: {
          sosUnassigned: sosCounts.unassigned,
          sosActive: sosCounts.active,
          pendingRescuers: pendingRescuersCount,
          chatUnread: chatUnreadCount,
        },
      })
    );
  }, [sosCounts.unassigned, sosCounts.active, pendingRescuersCount, chatUnreadCount]);

  // Đồng bộ sub-tab Phương tiện & Vật tư từ URL và sự kiện điều hướng
  useEffect(() => {
    const syncSubTab = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab')?.toUpperCase();
      const path = window.location.pathname.toLowerCase();
      if (
        tabParam === 'SUPPLIES' ||
        tabParam === 'CONSUMABLES' ||
        path.includes('/supplies') ||
        path.includes('/consumables')
      ) {
        setCurrentResourceSubTab('SUPPLIES');
      } else {
        setCurrentResourceSubTab('VEHICLES');
      }
    };

    syncSubTab();
    window.addEventListener('popstate', syncSubTab);
    const onTabSwitch = (e: any) => {
      if (e?.detail?.tab) {
        const t = e.detail.tab === 'CONSUMABLES' ? 'SUPPLIES' : e.detail.tab;
        setCurrentResourceSubTab(t);
      }
    };
    window.addEventListener('sos_switch_resource_tab', onTabSwitch);
    return () => {
      window.removeEventListener('popstate', syncSubTab);
      window.removeEventListener('sos_switch_resource_tab', onTabSwitch);
      if (flyoutTimerRef.current) {
        clearTimeout(flyoutTimerRef.current);
      }
    };
  }, []);

  const handleResourcesMouseEnter = () => {
    if (flyoutTimerRef.current) {
      clearTimeout(flyoutTimerRef.current);
      flyoutTimerRef.current = null;
    }
    if (resourcesItemRef.current) {
      const rect = resourcesItemRef.current.getBoundingClientRect();
      setFlyoutPosition({
        top: Math.max(16, rect.top - 6),
        left: rect.right + 10,
      });
    }
    setIsResourcesFlyoutOpen(true);
  };

  const handleResourcesMouseLeave = () => {
    flyoutTimerRef.current = setTimeout(() => {
      setIsResourcesFlyoutOpen(false);
    }, 180);
  };

  const handleFlyoutMouseEnter = () => {
    if (flyoutTimerRef.current) {
      clearTimeout(flyoutTimerRef.current);
      flyoutTimerRef.current = null;
    }
  };

  const handleFlyoutMouseLeave = () => {
    flyoutTimerRef.current = setTimeout(() => {
      setIsResourcesFlyoutOpen(false);
    }, 160);
  };

  const handleSelectResourceSubTab = (tab: 'VEHICLES' | 'SUPPLIES' | 'CONSUMABLES') => {
    if (flyoutTimerRef.current) {
      clearTimeout(flyoutTimerRef.current);
      flyoutTimerRef.current = null;
    }
    setIsResourcesFlyoutOpen(false);
    setCurrentResourceSubTab(tab);

    const prefix = getRolePrefix(user || null);
    const targetUrl = `${prefix}/resources?tab=${tab}`;

    if (onSelectKey) {
      onSelectKey('resources', tab.toLowerCase());
    }

    window.history.pushState(null, '', targetUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new CustomEvent('sos_switch_resource_tab', { detail: { tab } }));
  };

  const handleItemClick = (key: NavItemKey) => {
    if (key === 'resources') {
      if (!collapsed) {
        setIsResourcesExpanded((prev) => !prev);
      }
      if (activeKey !== 'resources') {
        handleSelectResourceSubTab(currentResourceSubTab || 'VEHICLES');
      }
      return;
    }
    if (onSelectKey) {
      onSelectKey(key);
    }
  };

  /* --------------------------------------------------------------------------
     CHRONICLE CALM SIDEBAR NAV GROUPS (PRIMARY TOP + SENTENCE-CASE GROUPS)
     -------------------------------------------------------------------------- */
  const operationMenuGroups: NavGroupConfig[] = [
    {
      items: [
        {
          key: 'map',
          label: 'Bản đồ SOS',
          icon: <Map size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'sos_requests',
          label: 'Điều phối SOS',
          icon: <Siren size={16} strokeWidth={1.8} className="ch-nav-icon" />,
          badge:
            sosCounts.unassigned > 0
              ? `${sosCounts.unassigned}`
              : sosCounts.active > 0
                ? `${sosCounts.active}`
                : undefined,
          badgeType: 'danger',
        },
      ],
    },
    {
      title: 'Tác chiến',
      items: [
        {
          key: 'chat',
          label: 'Trao đổi',
          icon: <MessageSquare size={16} strokeWidth={1.8} className="ch-nav-icon" />,
          badge: chatUnreadCount > 0 ? `${chatUnreadCount}` : undefined,
          badgeType: 'danger',
        },
      ],
    },
    {
      title: 'Lực lượng',
      items: [
        {
          key: 'rescuers_approval',
          label: 'Duyệt cứu hộ',
          icon: <UserCheck size={16} strokeWidth={1.8} className="ch-nav-icon" />,
          badge: pendingRescuersCount > 0 ? `${pendingRescuersCount}` : undefined,
          badgeType: 'warning',
        },
        {
          key: 'rescuers',
          label: 'Đội cứu hộ',
          icon: <LifeBuoy size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'resources',
          label: 'Phương tiện & Kho',
          icon: <Package size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
      ],
    },
    {
      title: 'Cộng đồng',
      items: [
        ...(isAdmin
          ? [
            {
              key: 'notifications' as NavItemKey,
              label: 'Thông báo',
              icon: <Bell size={16} strokeWidth={1.8} className="ch-nav-icon" />,
            },
          ]
          : []),
        {
          key: 'safety_checks',
          label: 'An toàn dân cư',
          icon: <ShieldCheck size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'blood_donations',
          label: 'Hiến máu',
          icon: <Droplet size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        ...(isAdmin
          ? [
            {
              key: 'weather' as NavItemKey,
              label: 'Thời tiết',
              icon: <CloudSun size={16} strokeWidth={1.8} className="ch-nav-icon" />,
            },
          ]
          : []),
        {
          key: 'shelters',
          label: 'Điểm trú ẩn',
          useCase: 'UC-L12',
          icon: <Home size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'hazard_reports',
          label: 'Điểm nguy hiểm',
          useCase: 'UC-L15',
          icon: <AlertTriangle size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
      ],
    },
    {
      title: 'Báo cáo',
      items: [
        {
          key: 'reports',
          label: 'Báo cáo',
          icon: <BarChart3 size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'operation_logs',
          label: 'Nhật ký',
          icon: <History size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
      ],
    },
  ];

  const adminAdditionalGroups: NavGroupConfig[] = [
    {
      title: 'Quản trị',
      items: [
        {
          key: 'citizens',
          label: 'Người dân',
          icon: <Users size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'rescuers_admin',
          label: 'Xác minh cứu hộ',
          icon: <UserCheck size={16} strokeWidth={1.8} className="ch-nav-icon" />,
          badge: pendingRescuersCount > 0 ? `${pendingRescuersCount}` : undefined,
          badgeType: 'warning',
        },
        {
          key: 'authorities',
          label: 'Cán bộ & Đơn vị',
          icon: <Building2 size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
        {
          key: 'areas',
          label: 'Địa bàn',
          icon: <Globe2 size={16} strokeWidth={1.8} className="ch-nav-icon" />,
        },
      ],
    },
  ];

  const currentGroups = isAdmin
    ? [...operationMenuGroups, ...adminAdditionalGroups]
    : operationMenuGroups;

  const isItemActive = (key: NavItemKey) => {
    if (activeKey) {
      if (key === 'notifications' && (activeKey === 'notifications' || activeKey === 'alerts')) {
        return true;
      }
      return activeKey === key;
    }
    return key === 'rescuers';
  };

  const normalizePosition = (pos?: string | null) => {
    if (isAdmin) return pos || 'Quản trị viên hệ thống';
    if (!pos || /phó\s*trưởng|trưởng\s*ban|cán\s*bộ/i.test(pos)) return 'Chỉ huy khu vực';
    return pos;
  };

  useEffect(() => {
    const onOpenProfile = () => onSelectKey?.('profile');
    window.addEventListener('sos_open_profile_modal', onOpenProfile);
    return () => window.removeEventListener('sos_open_profile_modal', onOpenProfile);
  }, [onSelectKey]);

  const managedArea = isAdmin
    ? 'Toàn TP. Đà Nẵng & Hoàng Sa'
    : user?.authority?.areaName ||
      (user?.authority?.department
        ? user.authority.department
            .replace(/^Ban Chỉ Huy PCTT\s*/i, '')
            .replace(/\(.*?\)/g, '')
            .trim()
        : 'TP. Đà Nẵng');

  const rawUserName = user?.fullName || (isAdmin ? 'Quản trị viên' : 'Cán bộ điều phối');
  const displayUserName = rawUserName.replace(/\s*\([^)]*\)/g, '').trim() || rawUserName;
  const displayEmail = user?.email || 'canbo@sos.gov.vn';
  const displayPosition = normalizePosition(user?.authority?.position);
  const displayAvatar = user?.avatarUrl || '';
  const userInitial = (displayUserName || 'U').trim().charAt(0).toUpperCase() || 'U';
  const scopeSubtitle = isAdmin
    ? 'Quản trị viên'
    : (managedArea || 'TP. Đà Nẵng').split(',')[0].trim();

  const isVehiclesSubActive = activeKey === 'resources' && currentResourceSubTab === 'VEHICLES';
  const isSuppliesSubActive =
    activeKey === 'resources' &&
    (currentResourceSubTab === 'SUPPLIES' || currentResourceSubTab === 'CONSUMABLES');

  return (
    <aside
      className={`ch-sidebar sos-sidebar ${collapsed ? 'collapsed' : ''} ${
        hiddenRail ? 'hidden-rail' : ''
      }`}
      aria-label="Thanh điều hướng dọc Cứu Hộ Cứu Nạn"
    >
      {/* 1. CHRONICLE WORKSPACE SWITCHER HEADER */}
      <div className="ch-sidebar-header" ref={workspaceRef}>
        <button
          type="button"
          className={`ch-workspace-btn ${isWorkspaceMenuOpen ? 'open' : ''}`}
          onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
          title="Cứu Hộ Cứu Nạn"
        >
          <span className="ch-workspace-mark">
            <img src="/logoSOS.png" alt="Logo Cứu Hộ Cứu Nạn" />
          </span>
          {!collapsed && (
            <>
              <span className="ch-workspace-copy">
                <strong>Cứu Hộ Cứu Nạn</strong>
                <span>{scopeSubtitle}</span>
              </span>
              <ChevronsUpDown size={14} className="ch-workspace-chev" />
            </>
          )}
        </button>

        {isWorkspaceMenuOpen && (
          <div className="ch-sidebar-popover ch-workspace-popover">
            <div className="ch-ws-pop-head">
              <span>Cổng hiện tại</span>
              <div className="ch-ws-pop-role">
                {isAdmin ? <ShieldCheck size={14} /> : <MapPin size={14} />}
                <strong>{isAdmin ? 'Quản trị viên (ADMIN)' : 'Chính quyền cơ sở'}</strong>
              </div>
              <small>{isAdmin ? 'Toàn TP. Đà Nẵng & Hoàng Sa' : managedArea}</small>
            </div>
            <div className="ch-ws-pop-actions">
              <button
                type="button"
                onClick={() => {
                  onSelectKey?.('map');
                  setIsWorkspaceMenuOpen(false);
                }}
              >
                <Map size={14} />
                <span>Bản đồ SOS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectKey?.('sos_requests');
                  setIsWorkspaceMenuOpen(false);
                }}
              >
                <Siren size={14} />
                <span>Điều phối SOS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectKey?.('reports');
                  setIsWorkspaceMenuOpen(false);
                }}
              >
                <BarChart3 size={14} />
                <span>Báo cáo</span>
              </button>
            </div>
            <div className="ch-ws-pop-foot">
              <PhoneCall size={12} />
              <span>Hotline: 112 • 114 • 115</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. CHRONICLE CALM NAVMAIN */}
      <nav ref={navRef} className="ch-sidebar-nav sos-sidebar-nav" role="navigation">
        {activePillRect && !hiddenRail && (
          <span
            aria-hidden="true"
            className={`ch-nav-active-pill ${pillReady ? 'is-ready' : ''}`}
            style={{
              transform: `translate3d(${activePillRect.left}px, ${activePillRect.top}px, 0)`,
              width: activePillRect.width,
              height: activePillRect.height,
            }}
          />
        )}
        {currentGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="ch-nav-group">
            {!collapsed && group.title && (
              <div className="ch-nav-group-label">{group.title}</div>
            )}
            <div className="ch-nav-group-items">
              {group.items.map((item) => {
                const active = isItemActive(item.key);
                const isResources = item.key === 'resources';
                const hasActiveSubitem = isResources && active && !collapsed && isResourcesExpanded;
                const isDirectActive = active && !hasActiveSubitem;
                return (
                  <React.Fragment key={item.key}>
                    <div
                      ref={isResources ? resourcesItemRef : undefined}
                      aria-current={isDirectActive ? 'page' : undefined}
                      className={`ch-nav-item ${isDirectActive ? 'active' : ''} ${
                        hasActiveSubitem ? 'has-active-child' : ''
                      }`}
                      onMouseEnter={isResources && collapsed ? handleResourcesMouseEnter : undefined}
                      onMouseLeave={isResources && collapsed ? handleResourcesMouseLeave : undefined}
                      onClick={() => handleItemClick(item.key)}
                      title={collapsed ? item.label : undefined}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleItemClick(item.key);
                        }
                      }}
                    >
                      {item.icon}

                      {!collapsed && (
                        <>
                          <span className="ch-nav-label">{item.label}</span>
                          {isResources ? (
                            <span className="ch-nav-caret">
                              {isResourcesExpanded ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )}
                            </span>
                          ) : (
                            item.badge && (
                              <span
                                className={`ch-nav-counter ${item.badgeType || 'info'}`}
                              >
                                {item.badge}
                              </span>
                            )
                          )}
                        </>
                      )}

                      {collapsed && item.badge && (
                        <span className="ch-collapsed-dot" title={item.label} />
                      )}
                    </div>

                    {/* Inline Hairline Submenu Tree for Phương tiện & Vật tư */}
                    {isResources && !collapsed && isResourcesExpanded && (
                      <div className="ch-nav-submenu">
                        <button
                          type="button"
                          aria-current={isVehiclesSubActive ? 'page' : undefined}
                          className={`ch-nav-subitem ${isVehiclesSubActive ? 'active' : ''}`}
                          onClick={() => handleSelectResourceSubTab('VEHICLES')}
                        >
                          <Truck size={14} className="ch-nav-subicon" />
                          <span>Phương tiện</span>
                        </button>
                        <button
                          type="button"
                          aria-current={isSuppliesSubActive ? 'page' : undefined}
                          className={`ch-nav-subitem ${isSuppliesSubActive ? 'active' : ''}`}
                          onClick={() => handleSelectResourceSubTab('SUPPLIES')}
                        >
                          <Package size={14} className="ch-nav-subicon" />
                          <span>Vật tư cứu trợ</span>
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 3. CHRONICLE NAVUSER FOOTER */}
      <div className="ch-sidebar-footer" ref={userFooterRef}>
        <button
          type="button"
          className={`ch-navuser-btn ${isUserMenuOpen ? 'open' : ''}`}
          onClick={() => setIsUserMenuOpen((prev) => !prev)}
          title={`${displayUserName} — ${displayEmail}`}
        >
          <span className={`ch-navuser-avatar ${isAdmin ? 'admin' : 'authority'}`}>
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={displayUserName}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              userInitial
            )}
          </span>
          {!collapsed && (
            <>
              <span className="ch-navuser-meta">
                <strong>{displayUserName}</strong>
                <span>{displayEmail}</span>
              </span>
              <ChevronsUpDown size={14} className="ch-workspace-chev" />
            </>
          )}
        </button>

        {isUserMenuOpen && (
          <div className="ch-sidebar-popover ch-navuser-popover">
            <div className="ch-navuser-pop-head">
              <span className={`ch-navuser-avatar ${isAdmin ? 'admin' : 'authority'}`}>
                {displayAvatar ? <img src={displayAvatar} alt={displayUserName} /> : userInitial}
              </span>
              <div className="ch-navuser-meta">
                <strong>{displayUserName}</strong>
                <span>{displayPosition}</span>
              </div>
            </div>
            <div className="ch-navuser-pop-items">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onSelectKey?.('profile');
                }}
              >
                <UserIcon size={14} />
                <span>Hồ sơ cá nhân</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onSelectKey?.('profile', 'account');
                }}
              >
                <ShieldCheck size={14} />
                <span>Tài khoản &amp; Bảo mật</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onSelectKey?.('reports');
                }}
              >
                <BarChart3 size={14} />
                <span>Báo cáo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onSelectKey?.('operation_logs');
                }}
              >
                <History size={14} />
                <span>Nhật ký</span>
              </button>
            </div>
            <div className="ch-navuser-pop-foot">
              <button
                type="button"
                className="ch-navuser-logout"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onLogout?.();
                }}
              >
                <LogOut size={14} />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Flyout Popover khi sidebar thu gọn và hover Phương tiện & Vật tư */}
      {isResourcesFlyoutOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="sos-nav-flyout-popover"
            style={{
              top: flyoutPosition.top,
              left: flyoutPosition.left,
            }}
            onMouseEnter={handleFlyoutMouseEnter}
            onMouseLeave={handleFlyoutMouseLeave}
          >
            <div className="sos-nav-flyout-menu">
              <div
                className={`sos-nav-flyout-item ${isVehiclesSubActive ? 'active' : ''}`}
                onClick={() => handleSelectResourceSubTab('VEHICLES')}
                role="button"
                tabIndex={0}
              >
                <Truck size={17} className="sos-nav-flyout-item-icon" />
                <div className="sos-nav-flyout-info">
                  <div className="sos-nav-flyout-title">Phương tiện cơ động</div>
                  <div className="sos-nav-flyout-desc">Ca-nô, xuồng máy, xe tải, cứu thương</div>
                </div>
              </div>

              <div
                className={`sos-nav-flyout-item ${isSuppliesSubActive ? 'active' : ''}`}
                onClick={() => handleSelectResourceSubTab('SUPPLIES')}
                role="button"
                tabIndex={0}
              >
                <Package size={17} className="sos-nav-flyout-item-icon" />
                <div className="sos-nav-flyout-info">
                  <div className="sos-nav-flyout-title">Thiết bị &amp; Hàng cứu trợ</div>
                  <div className="sos-nav-flyout-desc">
                    Áo phao, bộ đàm, đèn pin, lương thực, nước uống
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};

export default Sidebar;

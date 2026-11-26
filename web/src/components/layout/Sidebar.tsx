import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@/types/auth';
import { OfficeMapPicker } from '@/components/common/OfficeMapPicker';
import { getAreaCoordinates } from '@/features/authorities/AreaPreviewMap';
import {
  fetchSosRequests,
  fetchAdminUsers,
  fetchChatConversations,
  updateUserProfile,
  updateUserAvatar,
  changeUserPassword,
  sendPhoneOtp,
  verifyPhoneOtp,
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
  Check,
  MessageSquare,
  Camera,
  X,
  CloudSun,
  ShieldCheck,
  Droplet,
  User as UserIcon,
  LogOut,
  MapPin,
  PhoneCall,
} from 'lucide-react';

import './Sidebar.css';

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
  const resourcesItemRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const userFooterRef = useRef<HTMLDivElement | null>(null);
  const isFetchingCountsRef = useRef(false);

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

  const [localProfile, setLocalProfile] = useState<{
    fullName: string;
    position: string;
    organizationName: string;
    phone: string;
    email: string;
    managedArea: string;
    avatarUrl: string;
    mapUrl: string;
    latitude: number | null;
    longitude: number | null;
    officeAddress: string;
  }>(() => {
    const initialAreaName = isAdmin
      ? 'Toàn quốc'
      : user?.authority?.areaName ||
        (user?.authority?.department
          ? user.authority.department
              .replace(/^Ban Chỉ Huy PCTT\s*/i, '')
              .replace(/\(.*?\)/g, '')
              .trim()
          : 'Khu vực quản lý');
    const fallbackCoords = getAreaCoordinates(initialAreaName, user?.authority?.department);
    const lat = user?.authority?.latitude ?? fallbackCoords.lat;
    const lng = user?.authority?.longitude ?? fallbackCoords.lng;
    return {
      fullName: user?.fullName || 'Cán Bộ Phụ Trách',
      position: normalizePosition(user?.authority?.position),
      organizationName: user?.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN',
      phone: (user as any)?.phoneNumber || (user as any)?.phone || '112',
      email: user?.email || 'canbo@sos.gov.vn',
      managedArea: initialAreaName,
      avatarUrl: user?.avatarUrl || '',
      mapUrl:
        user?.authority?.mapUrl ||
        (user?.authority?.latitude && user?.authority?.longitude
          ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
          : ''),
      latitude: lat,
      longitude: lng,
      officeAddress: user?.authority?.officeAddress || '',
    };
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onOpenProfile = () => setIsProfileModalOpen(true);
    window.addEventListener('sos_open_profile_modal', onOpenProfile);
    return () => window.removeEventListener('sos_open_profile_modal', onOpenProfile);
  }, []);

  // Trạng thái đổi mật khẩu trong hồ sơ
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Trạng thái đổi ảnh đại diện (Cloudinary)
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileInputRef = React.useRef<HTMLInputElement>(null);

  // Trạng thái xác thực số điện thoại qua OTP
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean>(() => {
    return Boolean(user?.isPhoneVerified || user?.isVerified);
  });
  const [verifiedPhone, setVerifiedPhone] = useState<string>(() => {
    const p = (user as any)?.phoneNumber || (user as any)?.phone || '';
    return p ? String(p).replace(/[^0-9]/g, '') : '';
  });
  const [showOtpBox, setShowOtpBox] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccessNotice, setOtpSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (user) {
      const p = (user as any)?.phoneNumber || (user as any)?.phone || '0905 114 115';
      const cleanP = String(p).replace(/[^0-9]/g, '');
      const isVer = Boolean(user.isPhoneVerified || user.isVerified);
      setIsPhoneVerified(isVer);
      setVerifiedPhone(isVer ? cleanP : '');

      const syncedAreaName = isAdmin
        ? 'Toàn quốc'
        : user.authority?.areaName ||
          (user.authority?.department
            ? user.authority.department
                .replace(/^Ban Chỉ Huy PCTT\s*/i, '')
                .replace(/\(.*?\)/g, '')
                .trim()
            : 'Khu vực quản lý');
      const fallbackCoords = getAreaCoordinates(syncedAreaName, user.authority?.department);
      const lat = user.authority?.latitude ?? fallbackCoords.lat;
      const lng = user.authority?.longitude ?? fallbackCoords.lng;

      setLocalProfile({
        fullName: user.fullName || 'Cán Bộ Phụ Trách',
        position: normalizePosition(user.authority?.position),
        organizationName: user.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN',
        phone: p,
        email: user.email || 'canbo@sos.gov.vn',
        managedArea: syncedAreaName,
        avatarUrl: user.avatarUrl || '',
        mapUrl:
          user.authority?.mapUrl ||
          (user.authority?.latitude && user.authority?.longitude
            ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
            : ''),
        latitude: lat,
        longitude: lng,
        officeAddress: user.authority?.officeAddress || '',
      });
    }
  }, [user, isAdmin]);

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Vui lòng chọn file hình ảnh (JPG, PNG, WebP, GIF,...).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Kích thước ảnh tối đa cho phép là 10MB.');
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);

    const previewUrl = URL.createObjectURL(file);
    setLocalProfile((prev) => ({ ...prev, avatarUrl: previewUrl }));

    try {
      const res = await updateUserAvatar(file);
      if (res.success && res.data?.avatarUrl) {
        const cloudUrl = res.data.avatarUrl;
        setLocalProfile((prev) => ({ ...prev, avatarUrl: cloudUrl }));

        const rawUser = localStorage.getItem('sos_auth_user');
        if (rawUser) {
          try {
            const currentObj = JSON.parse(rawUser);
            const updated = { ...currentObj, avatarUrl: cloudUrl };
            localStorage.setItem('sos_auth_user', JSON.stringify(updated));
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updated }));
          } catch {}
        }

        setProfileSuccessMsg(true);
        setTimeout(() => setProfileSuccessMsg(false), 3500);
      } else {
        throw new Error(res.message || 'Không thể lưu ảnh đại diện lên Cloudinary');
      }
    } catch (err: any) {
      console.error('Lỗi khi tải avatar lên Cloudinary:', err);
      setAvatarError(err?.message || 'Lỗi khi tải ảnh đại diện lên Cloudinary');
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhone = e.target.value;
    setLocalProfile({ ...localProfile, phone: newPhone });
    const clean = newPhone.replace(/[^0-9]/g, '');
    if (clean && clean === verifiedPhone) {
      setIsPhoneVerified(true);
      setShowOtpBox(false);
    } else {
      setIsPhoneVerified(false);
    }
    setOtpError(null);
    setOtpSuccessNotice(null);
  };

  const handleSendPhoneOtp = async () => {
    const cleanPhone = localProfile.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setOtpError('Số điện thoại không hợp lệ (cần ít nhất 10 số).');
      return;
    }
    setSendingOtp(true);
    setOtpError(null);
    setOtpSuccessNotice(null);
    try {
      await sendPhoneOtp(cleanPhone);
      setShowOtpBox(true);
      setOtpCountdown(60);
    } catch (err: any) {
      setOtpError(err?.message || 'Không thể gửi mã xác thực OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const cleanPhone = localProfile.phone.replace(/[^0-9]/g, '');
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6) {
      setOtpError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await verifyPhoneOtp(cleanPhone, cleanOtp);
      setIsPhoneVerified(true);
      setVerifiedPhone(cleanPhone);
      setShowOtpBox(false);
      setOtpCode('');
      setOtpSuccessNotice('✓ Đã xác thực số điện thoại thành công!');
      setTimeout(() => setOtpSuccessNotice(null), 4000);

      const rawUser = localStorage.getItem('sos_auth_user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        const updated = {
          ...u,
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          isPhoneVerified: true,
          isVerified: true,
        };
        localStorage.setItem('sos_auth_user', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updated }));
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Mã xác thực OTP không đúng hoặc đã hết hạn.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrorMsg(null);
    try {
      const rawUser = localStorage.getItem('sos_auth_user');
      const currentUserObj = rawUser ? JSON.parse(rawUser) : user || {};

      const res = await updateUserProfile({
        fullName: localProfile.fullName,
        phone: localProfile.phone,
        email: localProfile.email,
        avatarUrl: localProfile.avatarUrl,
        isPhoneVerified: isPhoneVerified,
        authority: isAdmin
          ? {
              position: localProfile.position,
              organizationName: localProfile.organizationName,
              areaName: 'Toàn quốc',
            }
          : {
              position: localProfile.position,
              organizationName: localProfile.organizationName,
              mapUrl: localProfile.mapUrl,
              latitude: localProfile.latitude ?? undefined,
              longitude: localProfile.longitude ?? undefined,
              officeAddress: localProfile.officeAddress,
            },
      });

      const serverUser = res.success && res.data ? res.data : null;

      const updatedUser: User = {
        ...currentUserObj,
        ...(serverUser || {}),
        fullName: serverUser?.fullName || localProfile.fullName,
        avatarUrl: serverUser?.avatarUrl || localProfile.avatarUrl,
        phoneNumber: serverUser?.phone || (serverUser as any)?.phoneNumber || localProfile.phone,
        email: serverUser?.email || localProfile.email,
        authority: {
          ...(currentUserObj.authority || {}),
          ...(serverUser?.authority || {}),
          areaId: isAdmin
            ? null
            : serverUser?.authority?.areaId || currentUserObj.authority?.areaId || null,
          department: isAdmin
            ? serverUser?.authority?.department || 'Ban Quản Trị Hệ Thống SOS'
            : serverUser?.authority?.department || currentUserObj.authority?.department,
          position: localProfile.position,
          organizationName: localProfile.organizationName,
          areaName: isAdmin
            ? 'Toàn quốc'
            : serverUser?.authority?.areaName ||
              currentUserObj.authority?.areaName ||
              localProfile.managedArea,
          provinceCode: isAdmin
            ? undefined
            : serverUser?.authority?.provinceCode ?? currentUserObj.authority?.provinceCode,
          wardCode: isAdmin
            ? undefined
            : serverUser?.authority?.wardCode ?? currentUserObj.authority?.wardCode,
          mapUrl: serverUser?.authority?.mapUrl ?? localProfile.mapUrl,
          latitude: serverUser?.authority?.latitude ?? localProfile.latitude ?? undefined,
          longitude: serverUser?.authority?.longitude ?? localProfile.longitude ?? undefined,
          officeAddress: serverUser?.authority?.officeAddress ?? localProfile.officeAddress,
        } as any,
      };

      localStorage.setItem('sos_auth_user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updatedUser }));

      setIsProfileModalOpen(false);
      setProfileSuccessMsg(true);
      setTimeout(() => setProfileSuccessMsg(false), 3500);
    } catch (err: any) {
      console.error('Lỗi khi lưu hồ sơ vào Database:', err);
      setProfileErrorMsg(err?.message || 'Có lỗi khi lưu vào cơ sở dữ liệu');
    } finally {
      setSavingProfile(false);
    }
  };

  const rawUserName =
    localProfile.fullName || user?.fullName || (isAdmin ? 'Quản trị viên' : 'Cán bộ điều phối');
  const displayUserName = rawUserName.replace(/\s*\([^)]*\)/g, '').trim() || rawUserName;
  const displayAvatar = localProfile.avatarUrl || user?.avatarUrl || '';
  const userInitial = (displayUserName || 'U').trim().charAt(0).toUpperCase() || 'U';
  const scopeSubtitle = isAdmin
    ? 'Quản trị viên'
    : (localProfile.managedArea || 'TP. Đà Nẵng').split(',')[0].trim();

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
              <small>{isAdmin ? 'Toàn TP. Đà Nẵng & Hoàng Sa' : localProfile.managedArea}</small>
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
      <nav className="ch-sidebar-nav sos-sidebar-nav" role="navigation">
        {currentGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="ch-nav-group">
            {!collapsed && group.title && (
              <div className="ch-nav-group-label">{group.title}</div>
            )}
            <div className="ch-nav-group-items">
              {group.items.map((item) => {
                const active = isItemActive(item.key);
                const isResources = item.key === 'resources';
                return (
                  <React.Fragment key={item.key}>
                    <div
                      ref={isResources ? resourcesItemRef : undefined}
                      className={`ch-nav-item ${active ? 'active' : ''}`}
                      onMouseEnter={isResources && collapsed ? handleResourcesMouseEnter : undefined}
                      onMouseLeave={isResources && collapsed ? handleResourcesMouseLeave : undefined}
                      onClick={() => handleItemClick(item.key)}
                      title={collapsed ? item.label : undefined}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
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
                          className={`ch-nav-subitem ${
                            activeKey === 'resources' && currentResourceSubTab === 'VEHICLES'
                              ? 'active'
                              : ''
                          }`}
                          onClick={() => handleSelectResourceSubTab('VEHICLES')}
                        >
                          <Truck size={14} />
                          <span>Phương tiện</span>
                        </button>
                        <button
                          type="button"
                          className={`ch-nav-subitem ${
                            activeKey === 'resources' && currentResourceSubTab === 'SUPPLIES'
                              ? 'active'
                              : ''
                          }`}
                          onClick={() => handleSelectResourceSubTab('SUPPLIES')}
                        >
                          <Package size={14} />
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

      {/* 3. CHRONICLE NAVUSER FOOTER (MATCHING overview.webp BOTTOM USER ROW) */}
      <div className="ch-sidebar-footer" ref={userFooterRef}>
        <button
          type="button"
          className={`ch-navuser-btn ${isUserMenuOpen ? 'open' : ''}`}
          onClick={() => setIsUserMenuOpen((prev) => !prev)}
          title={`${displayUserName} — ${localProfile.email}`}
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
                <span>{localProfile.email}</span>
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
                <span>{localProfile.position}</span>
              </div>
            </div>
            <div className="ch-navuser-pop-items">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsProfileModalOpen(true);
                }}
              >
                <UserIcon size={14} />
                <span>Hồ sơ cá nhân</span>
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

      {/* Toast thông báo cập nhật hồ sơ thành công */}
      {profileSuccessMsg &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="sos-profile-toast-success">
            <Check size={16} />
            <span>Đã cập nhật hồ sơ địa phương thành công!</span>
          </div>,
          document.body
        )}

      {/* Modal Chỉnh Sửa Hồ Sơ Cán Bộ & Địa Phương (Preserved 100% logic) */}
      {isProfileModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="sos-modal-overlay" onClick={() => setIsProfileModalOpen(false)}>
            <div
              className="sos-profile-modal-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="sos-profile-modal-header">
                <div className="sos-profile-modal-title">
                  <div className="sos-profile-modal-icon">
                    <i className="bi bi-person"></i>
                  </div>
                  <div>
                    <h3>Hồ Sơ Cán Bộ &amp; Đơn Vị Địa Phương</h3>
                    <p>Cập nhật thông tin định danh &amp; đầu mối liên lạc cứu hộ</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="sos-profile-modal-close"
                  onClick={() => setIsProfileModalOpen(false)}
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="sos-profile-form">
                <div className="sos-profile-modal-body">
                  {/* Khối tóm tắt hồ sơ & Đổi Avatar Cloudinary */}
                  <div className="sos-profile-avatar-preview">
                    <div className="sos-profile-avatar-action-wrap">
                      <div
                        className="sos-profile-big-avatar"
                        onClick={() => avatarFileInputRef.current?.click()}
                        title="Nhấp để tải lên ảnh đại diện mới từ máy tính"
                      >
                        {displayAvatar ? (
                          <img
                            src={displayAvatar}
                            alt="Avatar"
                            className="sos-profile-avatar-img"
                          />
                        ) : (
                          userInitial
                        )}

                        <div className="sos-avatar-camera-overlay">
                          {uploadingAvatar ? (
                            <div className="sos-avatar-spinner" />
                          ) : (
                            <Camera size={15} />
                          )}
                        </div>
                      </div>

                      <input
                        type="file"
                        ref={avatarFileInputRef}
                        onChange={handleAvatarFileSelected}
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                      />
                    </div>
                    <div className="sos-profile-preview-text">
                      <strong>{localProfile.fullName || 'Cán bộ trực ban'}</strong>
                      <span>{localProfile.position || 'Chỉ huy cứu hộ'}</span>
                      <small>{localProfile.organizationName || 'Ban Chỉ Huy PCTT & TKCN'}</small>
                      {uploadingAvatar && (
                        <span className="sos-avatar-uploading-inline">
                          Đang lưu ảnh lên Cloudinary...
                        </span>
                      )}
                      {avatarError && <span className="sos-avatar-error-inline">{avatarError}</span>}
                    </div>
                  </div>

                  {/* Bố cục hai cột độc lập */}
                  <div className="sos-profile-columns-grid">
                    <div className="sos-profile-col sos-profile-col-left">
                      <div className="sos-profile-field sos-field-fullname">
                        <label>
                          <i className="bi bi-pencil"></i>
                          <span>Họ và tên cán bộ:</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={localProfile.fullName}
                          onChange={(e) =>
                            setLocalProfile({ ...localProfile, fullName: e.target.value })
                          }
                          placeholder="VD: Cán Bộ Điều Hành SOS"
                        />
                      </div>

                      <div className="sos-profile-field sos-field-email">
                        <label>
                          <i className="bi bi-envelope"></i>
                          <span>Hòm thư điện tử công vụ:</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={localProfile.email}
                          onChange={(e) =>
                            setLocalProfile({ ...localProfile, email: e.target.value })
                          }
                          placeholder="VD: authority@sos.vn"
                        />
                      </div>
                    </div>

                    <div className="sos-profile-col sos-profile-col-right">
                      <div className="sos-profile-field sos-field-phone">
                        <div className="sos-phone-label-row">
                          <label>
                            <i className="bi bi-telephone"></i>
                            <span>Số điện thoại trực ban / Hotline:</span>
                          </label>
                          {isPhoneVerified ? (
                            <span className="sos-phone-badge sos-phone-badge-verified">
                              Đã xác thực
                            </span>
                          ) : (
                            <span className="sos-phone-badge sos-phone-badge-unverified">
                              Chưa xác thực
                            </span>
                          )}
                        </div>

                        <div className="sos-phone-auth-group">
                          <div className="sos-phone-input-row">
                            <input
                              type="tel"
                              required
                              value={localProfile.phone}
                              onChange={handlePhoneChange}
                              placeholder="VD: 0909876543"
                              className={isPhoneVerified ? 'phone-verified' : ''}
                            />
                            {!isPhoneVerified && (
                              <button
                                type="button"
                                className="sos-btn-send-otp"
                                onClick={handleSendPhoneOtp}
                                disabled={
                                  sendingOtp || otpCountdown > 0 || !localProfile.phone.trim()
                                }
                                title="Gửi mã OTP xác minh số điện thoại này"
                              >
                                {sendingOtp
                                  ? 'Đang gửi...'
                                  : otpCountdown > 0
                                    ? `Gửi lại (${otpCountdown}s)`
                                    : showOtpBox
                                      ? 'Gửi lại'
                                      : 'Gửi mã'}
                              </button>
                            )}
                          </div>

                          {showOtpBox && !isPhoneVerified && (
                            <div className="sos-otp-row">
                              <div className="sos-otp-input-wrap">
                                <i className="bi bi-key sos-otp-icon"></i>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={6}
                                  className="sos-otp-input"
                                  placeholder="Mã OTP 6 số"
                                  value={otpCode}
                                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleVerifyPhoneOtp();
                                    }
                                  }}
                                  autoFocus
                                />
                              </div>

                              <button
                                type="button"
                                className="sos-btn-verify-otp"
                                onClick={handleVerifyPhoneOtp}
                                disabled={verifyingOtp || otpCode.trim().length !== 6}
                              >
                                {verifyingOtp ? 'Kiểm tra...' : 'Xác nhận'}
                              </button>
                            </div>
                          )}

                          {showOtpBox && !isPhoneVerified && (
                            <div className="sos-otp-note">
                              Mã xác thực đã gửi đến số điện thoại của bạn.
                            </div>
                          )}

                          {otpError && (
                            <div className="sos-field-error">
                              <i className="bi bi-exclamation-triangle"></i> {otpError}
                            </div>
                          )}
                          {otpSuccessNotice && (
                            <div className="sos-field-success">
                              <i className="bi bi-check-circle"></i> {otpSuccessNotice}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Địa bàn phụ trách */}
                  {isAdmin ? (
                    <div className="sos-profile-area-section">
                      <label className="sos-profile-section-label">
                        <i className="bi bi-shield-check" style={{ color: 'var(--primary)' }}></i>
                        <span>Phạm vi quản trị hệ thống:</span>
                      </label>
                      <div className="ch-profile-scope-banner">
                        <i className="bi bi-globe2"></i>
                        <div>
                          <strong>Toàn quốc (Quản trị viên toàn hệ thống)</strong>
                          Tài khoản Quản trị viên (Admin) có phạm vi điều hành, giám sát toàn diện
                          trên tất cả các Tỉnh / Thành phố trên cả nước.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="sos-profile-area-section">
                      <label className="sos-profile-section-label">
                        <i className="bi bi-geo-alt" style={{ color: 'var(--primary)' }}></i>
                        <span>Địa bàn phụ trách quản lý:</span>
                      </label>

                      <div className="sos-profile-managed-area">
                        <span className="sos-profile-sublabel">
                          Địa bàn hiển thị trong hồ sơ &amp; phân quyền:
                        </span>
                        <input
                          type="text"
                          required
                          readOnly
                          disabled={true}
                          value={(() => {
                            const baseArea = localProfile.managedArea || '';
                            const cityFromDept = user?.authority?.department
                              ?.match(/\(([^)]+)\)/)?.[1]
                              ?.trim();
                            if (
                              baseArea &&
                              cityFromDept &&
                              !baseArea.toLowerCase().includes(cityFromDept.toLowerCase())
                            ) {
                              return `${baseArea}, ${cityFromDept}`;
                            }
                            return baseArea;
                          })()}
                          placeholder="VD: Phường Hải Châu, Thành phố Đà Nẵng"
                          title="Địa bàn phân quyền cố định, liên hệ Ban chỉ huy nếu cần điều chỉnh"
                        />
                      </div>

                      <OfficeMapPicker
                        mapUrl={localProfile.mapUrl}
                        latitude={localProfile.latitude}
                        longitude={localProfile.longitude}
                        officeAddress={localProfile.officeAddress}
                        defaultCenter={getAreaCoordinates(
                          localProfile.managedArea,
                          user?.authority?.department
                        )}
                        onChange={(next) =>
                          setLocalProfile((prev) => ({
                            ...prev,
                            mapUrl: next.mapUrl,
                            latitude: next.latitude,
                            longitude: next.longitude,
                            officeAddress: next.officeAddress,
                          }))
                        }
                      />
                    </div>
                  )}

                  {/* Khu vực Đổi mật khẩu tài khoản */}
                  <div className="ch-profile-pwd-box">
                    <div className="ch-profile-pwd-head">
                      <div className="ch-profile-pwd-title">
                        <i className="bi bi-key"></i>
                        <span>Bảo mật &amp; Đổi mật khẩu</span>
                      </div>
                      <button
                        type="button"
                        className="ch-profile-pwd-toggle"
                        onClick={() => {
                          setShowPasswordSection((prev) => !prev);
                          setPasswordError(null);
                          setPasswordSuccess(null);
                        }}
                      >
                        {showPasswordSection ? 'Thu gọn' : 'Đổi mật khẩu'}
                      </button>
                    </div>

                    {showPasswordSection && (
                      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                        <div className="sos-profile-field" style={{ marginBottom: 0 }}>
                          <label>
                            <span>Mật khẩu hiện tại:</span>
                          </label>
                          <input
                            type="password"
                            value={oldPassword}
                            onChange={(e) => {
                              setOldPassword(e.target.value);
                              if (passwordError) setPasswordError(null);
                            }}
                            placeholder="Nhập mật khẩu hiện tại..."
                            autoComplete="current-password"
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div className="sos-profile-field" style={{ marginBottom: 0 }}>
                            <label>
                              <span>Mật khẩu mới:</span>
                            </label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => {
                                setNewPassword(e.target.value);
                                if (passwordError) setPasswordError(null);
                              }}
                              placeholder="Ít nhất 8 ký tự, chữ hoa, số..."
                              autoComplete="new-password"
                            />
                          </div>

                          <div className="sos-profile-field" style={{ marginBottom: 0 }}>
                            <label>
                              <span>Xác nhận mật khẩu mới:</span>
                            </label>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                if (passwordError) setPasswordError(null);
                              }}
                              placeholder="Nhập lại mật khẩu mới..."
                              autoComplete="new-password"
                            />
                          </div>
                        </div>

                        {passwordError && (
                          <div className="sos-profile-form-error" style={{ marginTop: 2 }}>
                            <i className="bi bi-exclamation-triangle"></i> {passwordError}
                          </div>
                        )}

                        {passwordSuccess && (
                          <div className="sos-field-success">
                            <i className="bi bi-check-circle-fill"></i>
                            <span>{passwordSuccess}</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="sos-profile-btn-save"
                            disabled={changingPassword}
                            onClick={async () => {
                              setPasswordError(null);
                              setPasswordSuccess(null);

                              if (!oldPassword.trim()) {
                                setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
                                return;
                              }
                              if (!newPassword.trim()) {
                                setPasswordError('Vui lòng nhập mật khẩu mới.');
                                return;
                              }
                              if (newPassword !== confirmPassword) {
                                setPasswordError('Xác nhận mật khẩu mới không khớp.');
                                return;
                              }

                              setChangingPassword(true);
                              try {
                                const res = await changeUserPassword({
                                  oldPassword,
                                  newPassword,
                                });
                                if (res.success) {
                                  setPasswordSuccess(res.message || 'Đổi mật khẩu thành công!');
                                  setOldPassword('');
                                  setNewPassword('');
                                  setConfirmPassword('');
                                } else {
                                  setPasswordError(res.message || 'Không thể đổi mật khẩu.');
                                }
                              } catch (err: any) {
                                setPasswordError(err?.message || 'Lỗi khi đổi mật khẩu.');
                              } finally {
                                setChangingPassword(false);
                              }
                            }}
                          >
                            {changingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {profileErrorMsg && (
                    <div className="sos-profile-form-error">
                      <i className="bi bi-exclamation-triangle"></i> {profileErrorMsg}
                    </div>
                  )}
                </div>

                <div className="sos-profile-modal-actions">
                  <button
                    type="button"
                    className="sos-profile-btn-cancel"
                    onClick={() => setIsProfileModalOpen(false)}
                    disabled={savingProfile}
                  >
                    Hủy bỏ
                  </button>
                  <button type="submit" className="sos-profile-btn-save" disabled={savingProfile}>
                    <i className="bi bi-check2"></i>
                    <span>{savingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

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
                className={`sos-nav-flyout-item ${
                  activeKey === 'resources' && currentResourceSubTab === 'VEHICLES' ? 'active' : ''
                }`}
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
                className={`sos-nav-flyout-item ${
                  activeKey === 'resources' && currentResourceSubTab === 'SUPPLIES' ? 'active' : ''
                }`}
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

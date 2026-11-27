import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Sun,
  Moon,
  Bell,
  PanelLeft,
  PanelLeftClose,
  LogOut,
  User as UserIcon,
  Globe2,
  Map,
  Siren,
  MessageSquare,
  LifeBuoy,
  Package,
  Home,
  AlertTriangle,
  Droplet,
  BarChart3,
  History,
  CloudSun,
  ShieldCheck,
  UserCheck,
  Users,
  Building2,
  X,
  ChevronRight,
  ChevronDown,
  CornerDownLeft,
  Menu,
  LayoutPanelLeft,
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { NavItemKey } from './Sidebar';
import { NAV_TITLES } from '@/constants/navConfig';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useCustomizer } from '@/kit/customizer/CustomizerProvider';
import { CustomizerPanel } from '@/kit/customizer/CustomizerPanel';
import { cn } from '@/lib/utils';

export type SidebarAppearance = 'default' | 'darker';

export interface PhoenixTopbarProps {
  user: User;
  activeNavKey: NavItemKey;
  categoryLabel?: string;
  pageTitle?: string;
  sidebarCollapsed: boolean;
  sidebarAppearance?: SidebarAppearance;
  onSelectNavKey: (key: NavItemKey, subPath?: string) => void;
  onToggleSidebarCollapse: () => void;
  onChangeSidebarAppearance?: (appearance: SidebarAppearance) => void;
  onLogout: () => void;
}

interface SearchModuleOption {
  key: NavItemKey;
  label: string;
  group: string;
  desc: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface TopNavDropdownGroup {
  id: string;
  label: string;
  items: { key: NavItemKey; label: string; icon: React.ReactNode; badge?: number }[];
}

const normalizeVi = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const PhoenixTopbar: React.FC<PhoenixTopbarProps> = ({
  user,
  activeNavKey,
  categoryLabel = 'Điều hành',
  pageTitle,
  sidebarCollapsed,
  onSelectNavKey,
  onToggleSidebarCollapse,
  onLogout,
}) => {
  const { theme, toggleTheme } = useApp();
  const { settings, updateSettings } = useCustomizer();
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const isTopLayout = settings.layout === 'top';

  const [liveCounts, setLiveCounts] = useState<{
    sosUnassigned: number;
    sosActive: number;
    pendingRescuers: number;
    chatUnread: number;
  }>({
    sosUnassigned: 0,
    sosActive: 0,
    pendingRescuers: 0,
    chatUnread: 0,
  });

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandCursor, setCommandCursor] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const commandInputRef = useRef<HTMLInputElement>(null);
  const notifWrapRef = useRef<HTMLDivElement>(null);
  const topNavRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onCountsSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setLiveCounts({
          sosUnassigned: Number(detail.sosUnassigned || 0),
          sosActive: Number(detail.sosActive || 0),
          pendingRescuers: Number(detail.pendingRescuers || 0),
          chatUnread: Number(detail.chatUnread || 0),
        });
      }
    };
    window.addEventListener('sos_sidebar_counts', onCountsSync);
    return () => window.removeEventListener('sos_sidebar_counts', onCountsSync);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
        setIsNotifOpen(false);
        setOpenTopMenu(null);
        setIsUserMenuOpen(false);
      } else if (e.key === 'Escape') {
        setIsCommandOpen(false);
        setIsNotifOpen(false);
        setOpenTopMenu(null);
        setIsUserMenuOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (isCommandOpen) {
      setCommandQuery('');
      setCommandCursor(0);
      setTimeout(() => commandInputRef.current?.focus(), 40);
    }
  }, [isCommandOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifWrapRef.current && !notifWrapRef.current.contains(target)) {
        setIsNotifOpen(false);
      }
      if (topNavRef.current && !topNavRef.current.contains(target)) {
        setOpenTopMenu(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const allModules: SearchModuleOption[] = useMemo(
    () => [
      { key: 'map', label: 'Bản đồ SOS', group: 'Điều hành', desc: NAV_TITLES.map.desc, icon: <Map size={15} /> },
      { key: 'sos_requests', label: 'Điều phối SOS', group: 'Điều hành', desc: NAV_TITLES.sos_requests.desc, icon: <Siren size={15} /> },
      { key: 'chat', label: 'Trao đổi', group: 'Tác chiến', desc: NAV_TITLES.chat.desc, icon: <MessageSquare size={15} /> },
      { key: 'rescuers_approval', label: 'Duyệt cứu hộ', group: 'Lực lượng', desc: NAV_TITLES.rescuers_approval.desc, icon: <UserCheck size={15} /> },
      { key: 'rescuers', label: 'Đội cứu hộ', group: 'Lực lượng', desc: NAV_TITLES.rescuers.desc, icon: <LifeBuoy size={15} /> },
      { key: 'resources', label: 'Phương tiện & Kho', group: 'Lực lượng', desc: NAV_TITLES.resources.desc, icon: <Package size={15} /> },
      { key: 'notifications', label: 'Thông báo', group: 'Cộng đồng', desc: NAV_TITLES.notifications.desc, icon: <Bell size={15} />, adminOnly: true },
      { key: 'weather', label: 'Thời tiết', group: 'Cộng đồng', desc: NAV_TITLES.weather.desc, icon: <CloudSun size={15} />, adminOnly: true },
      { key: 'safety_checks', label: 'An toàn dân cư', group: 'Cộng đồng', desc: NAV_TITLES.safety_checks.desc, icon: <ShieldCheck size={15} /> },
      { key: 'blood_donations', label: 'Hiến máu', group: 'Cộng đồng', desc: NAV_TITLES.blood_donations.desc, icon: <Droplet size={15} /> },
      { key: 'shelters', label: 'Điểm trú ẩn', group: 'Cộng đồng', desc: NAV_TITLES.shelters.desc, icon: <Home size={15} /> },
      { key: 'hazard_reports', label: 'Điểm nguy hiểm', group: 'Cộng đồng', desc: NAV_TITLES.hazard_reports.desc, icon: <AlertTriangle size={15} /> },
      { key: 'reports', label: 'Báo cáo', group: 'Báo cáo', desc: NAV_TITLES.reports.desc, icon: <BarChart3 size={15} /> },
      { key: 'operation_logs', label: 'Nhật ký', group: 'Báo cáo', desc: NAV_TITLES.operation_logs.desc, icon: <History size={15} /> },
      { key: 'citizens', label: 'Người dân', group: 'Quản trị', desc: NAV_TITLES.citizens.desc, icon: <Users size={15} />, adminOnly: true },
      { key: 'rescuers_admin', label: 'Xác minh cứu hộ', group: 'Quản trị', desc: NAV_TITLES.rescuers_admin.desc, icon: <UserCheck size={15} />, adminOnly: true },
      { key: 'authorities', label: 'Cán bộ & Đơn vị', group: 'Quản trị', desc: NAV_TITLES.authorities.desc, icon: <Building2 size={15} />, adminOnly: true },
      { key: 'areas', label: 'Địa bàn', group: 'Quản trị', desc: NAV_TITLES.areas.desc, icon: <Globe2 size={15} />, adminOnly: true },
      { key: 'profile', label: 'Hồ sơ cá nhân', group: 'Tài khoản', desc: NAV_TITLES.profile.desc, icon: <UserIcon size={15} /> },
    ],
    []
  );

  const accessibleModules = useMemo(
    () => allModules.filter((m) => !m.adminOnly || isAdmin),
    [allModules, isAdmin]
  );

  const filteredModules = useMemo(() => {
    const q = normalizeVi(commandQuery);
    if (!q) return accessibleModules;
    return accessibleModules.filter((m) => {
      const hay = normalizeVi(`${m.label} ${m.group} ${m.desc} ${m.key}`);
      return hay.includes(q);
    });
  }, [accessibleModules, commandQuery]);

  // Horizontal Top Bar dropdown groups (matching kit/shell/top-nav.tsx)
  const topDropdownGroups: TopNavDropdownGroup[] = useMemo(() => {
    const groups: TopNavDropdownGroup[] = [
      {
        id: 'forces',
        label: 'Lực lượng',
        items: [
          {
            key: 'rescuers_approval',
            label: 'Duyệt cứu hộ',
            icon: <UserCheck className="size-4" />,
            badge: liveCounts.pendingRescuers || undefined,
          },
          {
            key: 'rescuers',
            label: 'Đội cứu hộ',
            icon: <LifeBuoy className="size-4" />,
          },
          {
            key: 'resources',
            label: 'Phương tiện & Kho',
            icon: <Package className="size-4" />,
          },
        ],
      },
      {
        id: 'community',
        label: 'Cộng đồng',
        items: [
          ...(isAdmin
            ? [
              {
                key: 'notifications' as NavItemKey,
                label: 'Thông báo',
                icon: <Bell className="size-4" />,
              },
              {
                key: 'weather' as NavItemKey,
                label: 'Thời tiết',
                icon: <CloudSun className="size-4" />,
              },
            ]
            : []),
          {
            key: 'safety_checks',
            label: 'An toàn dân cư',
            icon: <ShieldCheck className="size-4" />,
          },
          {
            key: 'blood_donations',
            label: 'Hiến máu',
            icon: <Droplet className="size-4" />,
          },
          {
            key: 'shelters',
            label: 'Điểm trú ẩn',
            icon: <Home className="size-4" />,
          },
          {
            key: 'hazard_reports',
            label: 'Điểm nguy hiểm',
            icon: <AlertTriangle className="size-4" />,
          },
        ],
      },
      {
        id: 'reports',
        label: 'Báo cáo',
        items: [
          {
            key: 'reports',
            label: 'Báo cáo',
            icon: <BarChart3 className="size-4" />,
          },
          {
            key: 'operation_logs',
            label: 'Nhật ký',
            icon: <History className="size-4" />,
          },
        ],
      },
    ];

    if (isAdmin) {
      groups.push({
        id: 'admin',
        label: 'Quản trị',
        items: [
          { key: 'citizens', label: 'Người dân', icon: <Users className="size-4" /> },
          {
            key: 'rescuers_admin',
            label: 'Xác minh cứu hộ',
            icon: <UserCheck className="size-4" />,
            badge: liveCounts.pendingRescuers || undefined,
          },
          { key: 'authorities', label: 'Cán bộ & Đơn vị', icon: <Building2 className="size-4" /> },
          { key: 'areas', label: 'Địa bàn', icon: <Globe2 className="size-4" /> },
        ],
      });
    }

    return groups;
  }, [isAdmin, liveCounts.pendingRescuers]);

  const totalAlertCount =
    liveCounts.sosUnassigned + liveCounts.pendingRescuers + liveCounts.chatUnread;
  const sosCounter = liveCounts.sosUnassigned > 0 ? liveCounts.sosUnassigned : liveCounts.sosActive;
  const resolvedTitle = pageTitle || NAV_TITLES[activeNavKey]?.title || 'Bản đồ cứu hộ';

  const displayUserName =
    (user?.fullName || (isAdmin ? 'Quản trị viên' : 'Cán bộ điều phối'))
      .replace(/\s*\([^)]*\)/g, '')
      .trim() || 'Cán bộ';
  const userInitial = displayUserName.charAt(0).toUpperCase() || 'U';

  // Shared Right Toolbar matching kit/shell/app-shell.tsx
  const renderToolbarActions = () => (
    <div className="ms-auto flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        className="h-8 w-9 justify-center px-0 text-muted-foreground sm:w-52 sm:justify-between sm:px-2.5"
        onClick={() => {
          setIsNotifOpen(false);
          setOpenTopMenu(null);
          setIsCommandOpen(true);
        }}
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Tìm kiếm nhanh phân hệ (Ctrl K)"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          <span className="hidden text-xs sm:inline">Tìm nhanh...</span>
        </span>
        <KbdGroup aria-hidden className="hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      {/* Notifications Popover */}
      <div className="relative" ref={notifWrapRef}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsNotifOpen((prev) => !prev)}
          title="Cảnh báo trực ban"
          aria-label="Thông báo hệ thống"
          className={cn('relative', isNotifOpen && 'bg-muted text-foreground')}
        >
          <Bell className="size-4" />
          {(totalAlertCount > 0 || liveCounts.sosActive > 0) && (
            <span className="ch-notif-badge">
              {totalAlertCount > 9 ? '9+' : totalAlertCount || liveCounts.sosActive}
            </span>
          )}
        </Button>

        {isNotifOpen && (
          <div className="ch-popover-menu ch-notif-menu">
            <div className="ch-popover-head">
              <strong>Cảnh báo trực ban</strong>
              <span className="ch-live-chip">
                <span className="ch-live-chip-dot" />
                Trực tuyến
              </span>
            </div>
            <div className="ch-notif-items">
              <button
                type="button"
                className="ch-notif-item"
                onClick={() => {
                  onSelectNavKey('sos_requests');
                  setIsNotifOpen(false);
                }}
              >
                <span className="ch-notif-ico danger">
                  <Siren size={15} />
                </span>
                <div className="ch-notif-text">
                  <strong>
                    {liveCounts.sosUnassigned > 0
                      ? `${liveCounts.sosUnassigned} SOS chờ xử lý`
                      : liveCounts.sosActive > 0
                        ? `${liveCounts.sosActive} SOS đang cứu`
                        : 'SOS ổn định'}
                  </strong>
                  <span>Mở điều phối SOS</span>
                </div>
              </button>

              <button
                type="button"
                className="ch-notif-item"
                onClick={() => {
                  onSelectNavKey('rescuers_approval');
                  setIsNotifOpen(false);
                }}
              >
                <span className="ch-notif-ico warning">
                  <UserCheck size={15} />
                </span>
                <div className="ch-notif-text">
                  <strong>
                    {liveCounts.pendingRescuers > 0
                      ? `${liveCounts.pendingRescuers} hồ sơ chờ duyệt`
                      : 'Chưa có hồ sơ mới'}
                  </strong>
                  <span>Duyệt lực lượng cứu hộ</span>
                </div>
              </button>

              <button
                type="button"
                className="ch-notif-item"
                onClick={() => {
                  onSelectNavKey('chat');
                  setIsNotifOpen(false);
                }}
              >
                <span className="ch-notif-ico primary">
                  <MessageSquare size={15} />
                </span>
                <div className="ch-notif-text">
                  <strong>
                    {liveCounts.chatUnread > 0
                      ? `${liveCounts.chatUnread} tin nhắn mới`
                      : 'Trao đổi tác chiến'}
                  </strong>
                  <span>Liên lạc chỉ huy &amp; cơ sở</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mode Toggle */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        title={theme === 'light' ? 'Chuyển sang Chế độ Tối' : 'Chuyển sang Chế độ Sáng'}
        aria-label="Đổi chế độ Sáng / Tối"
      >
        {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      {/* Official Chronicle Customizer Popover (9 OKLCH Presets, Fonts, Radius, Width, Scale, Layout, Sidebar Variant) */}
      <CustomizerPanel showLayoutControls={true} />

      {/* Account Dropdown when in Horizontal Top Bar Layout */}
      {isTopLayout && (
        <div className="relative" ref={userMenuRef}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Tài khoản cán bộ"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
          >
            <span
              className={cn(
                'flex size-7 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white',
                isAdmin ? 'bg-destructive' : 'bg-primary'
              )}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayUserName}
                  className="size-full object-cover"
                />
              ) : (
                userInitial
              )}
            </span>
          </Button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-(--surface-shadow-raised)">
              <div className="border-b border-border px-3.5 py-3">
                <p className="truncate text-sm font-semibold text-foreground">{displayUserName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex flex-col gap-0.5 p-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSelectNavKey('profile');
                  }}
                >
                  <UserIcon className="size-4 text-muted-foreground" />
                  <span>Hồ sơ cá nhân</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSelectNavKey('profile', 'account');
                  }}
                >
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <span>Tài khoản &amp; Bảo mật</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSelectNavKey('reports');
                  }}
                >
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <span>Báo cáo</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSelectNavKey('operation_logs');
                  }}
                >
                  <History className="size-4 text-muted-foreground" />
                  <span>Nhật ký</span>
                </button>
              </div>
              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut className="size-4" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {isTopLayout ? (
        /* ===================================================================
           CHRONICLE HORIZONTAL TOP BAR LAYOUT (kit/shell/app-shell.tsx + top-nav.tsx)
           =================================================================== */
        <header
          role="banner"
          className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Mở menu điều hướng"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-4" />
          </Button>

          <button
            type="button"
            onClick={() => onSelectNavKey('map')}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap font-heading text-sm font-bold text-foreground"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-white p-1 shadow-xs">
              <img
                src="/logoSOS.png"
                alt="Logo Cứu Hộ Cứu Nạn"
                className="size-full object-contain"
              />
            </span>
            <span className="hidden sm:inline">Cứu Hộ Cứu Nạn</span>
          </button>

          <nav
            ref={topNavRef}
            aria-label="Điều hướng ngang"
            className="hidden items-center gap-1 lg:flex"
          >
            <button
              type="button"
              onClick={() => {
                setOpenTopMenu(null);
                onSelectNavKey('map');
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                activeNavKey === 'map'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Map className="size-3.5" />
              <span>Bản đồ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenTopMenu(null);
                onSelectNavKey('sos_requests');
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                activeNavKey === 'sos_requests'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Siren className="size-3.5" />
              <span>Điều phối SOS</span>
              {sosCounter > 0 && (
                <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                  {sosCounter}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenTopMenu(null);
                onSelectNavKey('chat');
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                activeNavKey === 'chat'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <MessageSquare className="size-3.5" />
              <span>Trao đổi</span>
              {liveCounts.chatUnread > 0 && (
                <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                  {liveCounts.chatUnread}
                </span>
              )}
            </button>

            {topDropdownGroups.map((group) => {
              const isGroupActive = group.items.some(
                (i) =>
                  i.key === activeNavKey ||
                  (i.key === 'notifications' && activeNavKey === 'alerts')
              );
              const isOpen = openTopMenu === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenTopMenu(isOpen ? null : group.id)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                      isGroupActive || isOpen
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn(
                        'size-3.5 transition-transform duration-150',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-(--surface-shadow-raised)">
                      {group.items.map((item) => {
                        const active =
                          activeNavKey === item.key ||
                          (item.key === 'notifications' && activeNavKey === 'alerts');
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              onSelectNavKey(item.key);
                              setOpenTopMenu(null);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors',
                              active
                                ? 'bg-accent text-accent-foreground'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="text-muted-foreground">{item.icon}</span>
                              <span className="truncate">{item.label}</span>
                            </span>
                            {item.badge && (
                              <span className="rounded-full bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-warning-foreground dark:text-warning">
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {renderToolbarActions()}
        </header>
      ) : (
        /* ===================================================================
           CHRONICLE SIDEBAR INSET HEADER (56px / h-14)
           =================================================================== */
        <header className="ch-inset-header" role="banner">
          <div className="ch-header-left">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebarCollapse}
              title={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              aria-label="Thu gọn hoặc mở rộng menu"
            >
              {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>

            <Separator orientation="vertical" className="h-4" />

            <nav className="ch-header-breadcrumb" aria-label="Breadcrumb">
              <button
                type="button"
                className="ch-bc-root"
                onClick={() => onSelectNavKey('map')}
              >
                Cứu Hộ Cứu Nạn
              </button>
              <ChevronRight size={13} className="ch-bc-chevron" />
              <span className="ch-bc-group hidden md:inline">{categoryLabel}</span>
              <ChevronRight size={13} className="ch-bc-chevron hidden md:inline" />
              <span className="ch-bc-page">{resolvedTitle}</span>
            </nav>
          </div>

          {renderToolbarActions()}
        </header>
      )}

      {/* Mobile Navigation Drawer for Horizontal Top Bar mode */}
      {isTopLayout && mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="flex h-full w-72 flex-col border-r border-border bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <span className="font-heading text-sm font-bold">Cứu Hộ Cứu Nạn</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2.5">
              {accessibleModules.map((mod) => (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => {
                    onSelectNavKey(mod.key);
                    setMobileNavOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium',
                    activeNavKey === mod.key
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="text-muted-foreground">{mod.icon}</span>
                  <span>{mod.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          CHRONICLE COMMAND PALETTE MODAL (⌘K / Ctrl+K)
          =================================================================== */}
      {isCommandOpen && (
        <div className="ch-cmd-backdrop" onClick={() => setIsCommandOpen(false)}>
          <div
            className="ch-cmd-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm nhanh phân hệ"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ch-cmd-input-row">
              <Search size={16} className="ch-cmd-search-ico" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => {
                  setCommandQuery(e.target.value);
                  setCommandCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCommandCursor((c) =>
                      Math.min(c + 1, Math.max(0, filteredModules.length - 1))
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCommandCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === 'Enter' && filteredModules[commandCursor]) {
                    e.preventDefault();
                    onSelectNavKey(filteredModules[commandCursor].key);
                    setIsCommandOpen(false);
                  }
                }}
                placeholder="Tìm phân hệ, bản đồ, SOS..."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsCommandOpen(false)}
                aria-label="Đóng"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="ch-cmd-list">
              {filteredModules.length === 0 ? (
                <div className="ch-cmd-empty">
                  Không tìm thấy phân hệ nào khớp với “{commandQuery}”
                </div>
              ) : (
                <>
                  <div className="ch-cmd-group-label">
                    Phân hệ điều hành ({filteredModules.length})
                  </div>
                  {filteredModules.map((mod, idx) => (
                    <button
                      key={mod.key}
                      type="button"
                      className={`ch-cmd-item ${idx === commandCursor ? 'focused' : ''} ${activeNavKey === mod.key ? 'current' : ''
                        }`}
                      onMouseEnter={() => setCommandCursor(idx)}
                      onClick={() => {
                        onSelectNavKey(mod.key);
                        setIsCommandOpen(false);
                      }}
                    >
                      <span className="ch-cmd-item-ico">{mod.icon}</span>
                      <div className="ch-cmd-item-copy">
                        <strong>{mod.label}</strong>
                        <span>{mod.group}</span>
                      </div>
                      <CornerDownLeft size={13} className="ch-cmd-enter" />
                    </button>
                  ))}
                </>
              )}

              {!commandQuery.trim() && (
                <>
                  <div className="ch-cmd-group-label">Thao tác nhanh</div>
                  <button
                    type="button"
                    className="ch-cmd-item"
                    onClick={() => {
                      updateSettings({ layout: isTopLayout ? 'sidebar' : 'top' });
                      setIsCommandOpen(false);
                    }}
                  >
                    <span className="ch-cmd-item-ico">
                      <LayoutPanelLeft size={15} />
                    </span>
                    <div className="ch-cmd-item-copy">
                      <strong>
                        Chuyển sang bố cục {isTopLayout ? 'Thanh bên (Sidebar)' : 'Thanh trên (Top bar)'}
                      </strong>
                      <span>Bố cục</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="ch-cmd-item"
                    onClick={() => {
                      toggleTheme();
                      setIsCommandOpen(false);
                    }}
                  >
                    <span className="ch-cmd-item-ico">
                      {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                    </span>
                    <div className="ch-cmd-item-copy">
                      <strong>
                        Chuyển sang giao diện {theme === 'light' ? 'Tối (Dark)' : 'Sáng (Light)'}
                      </strong>
                      <span>Hiển thị</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="ch-cmd-item"
                    onClick={() => {
                      setIsCommandOpen(false);
                      onSelectNavKey('profile');
                    }}
                  >
                    <span className="ch-cmd-item-ico">
                      <UserIcon size={15} />
                    </span>
                    <div className="ch-cmd-item-copy">
                      <strong>Hồ sơ cá nhân</strong>
                      <span>Tài khoản</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="ch-cmd-item danger"
                    onClick={() => {
                      setIsCommandOpen(false);
                      onLogout();
                    }}
                  >
                    <span className="ch-cmd-item-ico">
                      <LogOut size={15} />
                    </span>
                    <div className="ch-cmd-item-copy">
                      <strong>Đăng xuất hệ thống</strong>
                      <span>Phiên làm việc</span>
                    </div>
                  </button>
                </>
              )}
            </div>

            <div className="ch-cmd-foot">
              <span>↑↓ Di chuyển</span>
              <span>↵ Mở phân hệ</span>
              <span>ESC Đóng</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

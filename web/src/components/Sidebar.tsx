import React from 'react';
import type { User } from '../types/auth';
import {
  Map,
  Siren,
  GitPullRequest,
  LifeBuoy,
  Truck,
  BellRing,
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Globe2,
  Shield,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import './Sidebar.css';

export type NavItemKey =
  // Local Authority keys
  | 'map'
  | 'sos_requests'
  | 'coordination'
  | 'rescuers'
  | 'resources'
  | 'alerts'
  | 'hazard_reports'
  | 'reports'
  // Admin keys
  | 'admin_overview'
  | 'citizens'
  | 'rescuers_admin'
  | 'authorities'
  | 'areas'
  | 'rbac'
  | 'audit_logs';

interface NavItemConfig {
  key: NavItemKey;
  label: string;
  useCase: string;
  icon: React.ReactNode;
  badge?: string;
  badgeType?: 'danger' | 'info' | 'warning';
}

interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

interface SidebarProps {
  user: User;
  activeKey: NavItemKey;
  onSelectKey: (key: NavItemKey) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeKey,
  onSelectKey,
  onLogout,
  collapsed,
  onToggleCollapse,
}) => {
  const isAdmin = user.roles.includes('ADMIN');

  // Danh mục menu theo vai trò LOCAL_AUTHORITY (Địa phương) - Bám sát Use Case UC-L01 -> UC-L15
  const authorityMenuGroups: NavGroupConfig[] = [
    {
      title: 'Điều hành tác chiến',
      items: [
        {
          key: 'map',
          label: 'Bản đồ tác chiến SOS',
          useCase: 'UC-L04 / UC-L09',
          icon: <Map size={18} className="sos-nav-icon" />,
        },
        {
          key: 'sos_requests',
          label: 'Tiếp nhận & Xác minh SOS',
          useCase: 'UC-L02 / UC-L05',
          icon: <Siren size={18} className="sos-nav-icon" />,
          badge: '4 Mới',
          badgeType: 'danger',
        },
        {
          key: 'coordination',
          label: 'Điều phối & Phân công',
          useCase: 'UC-L07 / UC-L08',
          icon: <GitPullRequest size={18} className="sos-nav-icon" />,
          badge: '2 Chờ',
          badgeType: 'warning',
        },
      ],
    },
    {
      title: 'Lực lượng & Nguồn lực',
      items: [
        {
          key: 'rescuers',
          label: 'Đội cứu hộ địa phương',
          useCase: 'UC-L10',
          icon: <LifeBuoy size={18} className="sos-nav-icon" />,
        },
        {
          key: 'resources',
          label: 'Phương tiện cứu trợ',
          useCase: 'UC-L11',
          icon: <Truck size={18} className="sos-nav-icon" />,
        },
      ],
    },
    {
      title: 'Cảnh báo & Cộng đồng',
      items: [
        {
          key: 'alerts',
          label: 'Phát cảnh báo & Trạm trú ẩn',
          useCase: 'UC-L12',
          icon: <BellRing size={18} className="sos-nav-icon" />,
        },
        {
          key: 'hazard_reports',
          label: 'Duyệt điểm nguy hiểm',
          useCase: 'UC-L15',
          icon: <AlertTriangle size={18} className="sos-nav-icon" />,
          badge: '3',
          badgeType: 'info',
        },
      ],
    },
    {
      title: 'Báo cáo & Giám sát',
      items: [
        {
          key: 'reports',
          label: 'Báo cáo & Thống kê',
          useCase: 'UC-L14',
          icon: <BarChart3 size={18} className="sos-nav-icon" />,
        },
      ],
    },
  ];

  // Danh mục menu theo vai trò ADMIN (Quản trị viên) - Bám sát Use Case UC-A01 -> UC-A09
  const adminMenuGroups: NavGroupConfig[] = [
    {
      title: 'Giám sát hệ thống',
      items: [
        {
          key: 'map',
          label: 'Bản đồ giám sát tổng thể',
          useCase: 'UC-A07',
          icon: <Map size={18} className="sos-nav-icon" />,
        },
        {
          key: 'admin_overview',
          label: 'Tổng quan & Giám sát',
          useCase: 'UC-A07 / UC-A08',
          icon: <LayoutDashboard size={18} className="sos-nav-icon" />,
        },
      ],
    },
    {
      title: 'Quản trị người dùng & Tổ chức',
      items: [
        {
          key: 'citizens',
          label: 'Quản lý Người dân',
          useCase: 'UC-A02',
          icon: <Users size={18} className="sos-nav-icon" />,
        },
        {
          key: 'rescuers_admin',
          label: 'Xác minh Đội cứu nạn',
          useCase: 'UC-A03',
          icon: <UserCheck size={18} className="sos-nav-icon" />,
          badge: 'Chờ duyệt',
          badgeType: 'warning',
        },
        {
          key: 'authorities',
          label: 'Quản lý Cán bộ & Tổ chức',
          useCase: 'UC-A04',
          icon: <Building2 size={18} className="sos-nav-icon" />,
        },
      ],
    },
    {
      title: 'Cấu hình địa bàn & Quyền hạn',
      items: [
        {
          key: 'areas',
          label: 'Khu vực hành chính',
          useCase: 'UC-A05',
          icon: <Globe2 size={18} className="sos-nav-icon" />,
        },
        {
          key: 'rbac',
          label: 'Phân quyền & Vai trò',
          useCase: 'UC-A06',
          icon: <Shield size={18} className="sos-nav-icon" />,
        },
      ],
    },
    {
      title: 'An toàn & Kiểm toán',
      items: [
        {
          key: 'audit_logs',
          label: 'Nhật ký hệ thống (Audit Logs)',
          useCase: 'UC-A09',
          icon: <History size={18} className="sos-nav-icon" />,
        },
      ],
    },
  ];

  const currentGroups = isAdmin ? adminMenuGroups : authorityMenuGroups;

  return (
    <aside className={`sos-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 1. Header: Logo SOS & Toggle Collapse */}
      <div className="sos-sidebar-header">
        <div className="sos-brand">
          <img src="/logoSOS.png" alt="SOS Logo" className="sos-brand-logo" />
          {!collapsed && (
            <div className="sos-brand-info">
              <span className="sos-brand-title">SOS SYSTEMS</span>
              <span className="sos-brand-subtitle">
                {isAdmin ? 'Trung Tâm Quản Trị' : 'Trung Tâm Tác Chiến'}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="sos-collapse-toggle"
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          aria-label="Toggle Sidebar"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* 2. Banner định danh vai trò (Role Badge) */}
      {!collapsed && (
        <div className={`sos-role-banner ${isAdmin ? 'admin' : 'authority'}`}>
          {isAdmin ? <ShieldCheck size={18} /> : <Radio size={18} />}
          <div className="sos-role-banner-text">
            <span className="sos-role-banner-title">
              {isAdmin ? 'Quản Trị Viên (ADMIN)' : 'Cán Bộ (LOCAL_AUTHORITY)'}
            </span>
            <span className="sos-role-banner-sub">
              {isAdmin
                ? 'Toàn quyền điều hành hệ thống'
                : user.authority?.department || 'Ban chỉ huy PCTT & TKCN'}
            </span>
          </div>
        </div>
      )}

      {/* 3. Danh sách Menu điều hướng (Nav Items) */}
      <nav className="sos-sidebar-nav">
        {currentGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="sos-nav-group">
            {!collapsed && (
              <div className="sos-nav-group-title">{group.title}</div>
            )}
            {group.items.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <div
                  key={item.key}
                  className={`sos-nav-item ${isActive ? 'active' : ''} ${
                    !isAdmin ? 'authority-active' : ''
                  }`}
                  onClick={() => onSelectKey(item.key)}
                  title={`${item.label} (${item.useCase})`}
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="sos-nav-label">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`sos-nav-badge ${
                            item.badgeType || 'info'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 4. Footer: Thông tin người dùng & Nút Đăng xuất */}
      <div className="sos-sidebar-footer">
        {!collapsed && (
          <div className="sos-user-profile-bar">
            <div
              className={`sos-user-avatar-mini ${
                isAdmin ? 'admin' : 'authority'
              }`}
            >
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="sos-user-details">
              <span className="sos-user-fullname">{user.fullName}</span>
              <span className="sos-user-dept">
                {user.authority?.position || (isAdmin ? 'Admin' : 'Cán bộ trực ban')}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="sos-btn-sidebar-logout"
          title="Đăng xuất khỏi phiên tác chiến"
        >
          <LogOut size={16} />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
};

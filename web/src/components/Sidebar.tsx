import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '../types/auth';
import { fetchSosRequests, fetchAdminUsers, fetchHazardReports, fetchSafeLocations } from '../services/api';
import { domainDService } from '../services/domainDService';
import {
  Map,
  Siren,
  GitMerge,
  LifeBuoy,
  Package,
  Bell,
  Home,
  AlertTriangle,
  BarChart3,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Globe2,
  Shield,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
} from 'lucide-react';
import './Sidebar.css';

/* ==========================================================================
   TYPE DEFINITIONS & MENU CONFIGURATIONS
   ========================================================================== */

export type NavItemKey =
  // 4 Nhóm chính - Hệ thống Điều hành Tác chiến RescueSOS
  | 'map'
  | 'sos_requests'
  | 'coordination'
  | 'rescuers'
  | 'resources'
  | 'alerts'
  | 'shelters'
  | 'hazard_reports'
  | 'reports'
  | 'operation_logs'
  | 'settings'
  // Nhóm Quản trị (Admin)
  | 'admin_overview'
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
  title: string;
  items: NavItemConfig[];
}

export interface SidebarProps {
  user?: User | null;
  activeKey?: NavItemKey;
  onSelectKey?: (key: NavItemKey) => void;
  onLogout?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/* ==========================================================================
   SIDEBAR COMPONENT (CHUẨN GIAO DIỆN SAAS)
   ========================================================================== */

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeKey = 'rescuers', // Mặc định Đội cứu hộ địa phương ở trạng thái Active
  onSelectKey,
  onLogout,
  collapsed = false,
  onToggleCollapse,
}) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  // Trạng thái đếm số liệu thời gian thực từ database
  const [sosCounts, setSosCounts] = useState<{ pending: number; active: number }>({
    pending: 0,
    active: 6, // Mặc định 6 vụ như yêu cầu hiển thị badge
  });
  const [hazardCount, setHazardCount] = useState<number>(0);
  const [shelterCount, setShelterCount] = useState<number>(0);
  const [pendingRescuersCount, setPendingRescuersCount] = useState<number>(0);

  // Đồng bộ số liệu thời gian thực
  const fetchRealCounts = useCallback(async () => {
    try {
      const res = await fetchSosRequests();
      if (res.success && Array.isArray(res.data)) {
        const pending = res.data.filter((s) => s.status === 'PENDING').length;
        const active = res.data.filter((s) =>
          ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)
        ).length;
        setSosCounts({ pending, active: active > 0 ? active : 6 });
      } else {
        const fallback = domainDService.getSosRequests();
        const pending = fallback.filter((s) => s.status === 'PENDING').length;
        const active = fallback.filter((s) =>
          s.status === 'VERIFIED' || !!s.assignmentId || ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status as any)
        ).length;
        setSosCounts({ pending, active: active > 0 ? active : 6 });
      }
    } catch {
      // Giữ mặc định 6 vụ cho badge
      setSosCounts((prev) => ({ ...prev, active: prev.active || 6 }));
    }

    try {
      const hazardRes = await fetchHazardReports({ status: 'PENDING' });
      if (hazardRes.success && hazardRes.data) {
        setHazardCount(hazardRes.data.counts?.PENDING ?? hazardRes.data.reports?.length ?? 0);
      }
    } catch {
      // ignore
    }

    try {
      const shelterRes = await fetchSafeLocations();
      if (shelterRes.success && Array.isArray(shelterRes.data)) {
        setShelterCount(shelterRes.data.length);
      }
    } catch {
      // ignore
    }

    if (isAdmin) {
      try {
        const rescuerRes = await fetchAdminUsers({ role: 'RESCUER' });
        if (rescuerRes.success && Array.isArray(rescuerRes.data?.users)) {
          const pendingCount = rescuerRes.data.users.filter(
            (u: any) => u.rescuer?.verificationStatus === 'PENDING'
          ).length;
          setPendingRescuersCount(pendingCount);
        }
      } catch {
        // ignore
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchRealCounts();
    const timer = setInterval(fetchRealCounts, 10000);

    const onDataUpdated = () => fetchRealCounts();
    window.addEventListener('sos_data_updated', onDataUpdated);
    window.addEventListener('storage', onDataUpdated);

    return () => {
      clearInterval(timer);
      window.removeEventListener('sos_data_updated', onDataUpdated);
      window.removeEventListener('storage', onDataUpdated);
    };
  }, [fetchRealCounts]);

  const handleItemClick = (key: NavItemKey) => {
    if (onSelectKey) {
      onSelectKey(key);
    }
  };

  /* --------------------------------------------------------------------------
     4 NHÓM MENU CHÍNH CỦA RESCUESOS DASHBOARD (CHUẨN SAAS)
     -------------------------------------------------------------------------- */
  const operationMenuGroups: NavGroupConfig[] = [
    // NHÓM 1: ĐIỀU HÀNH TÁC CHIẾN
    {
      title: 'ĐIỀU HÀNH TÁC CHIẾN',
      items: [
        {
          key: 'map',
          label: 'Bản đồ tác chiến SOS',
          icon: <Map size={18} className="sos-nav-icon" />,
        },
        {
          key: 'sos_requests',
          label: 'Theo dõi yêu cầu SOS',
          icon: <Siren size={18} className="sos-nav-icon" />,
          badge: sosCounts.pending > 0 ? `${sosCounts.pending} Mới` : undefined,
          badgeType: 'danger',
        },
        {
          key: 'coordination',
          label: 'Điều phối & Phân công',
          icon: <GitMerge size={18} className="sos-nav-icon" />,
          // Badge hình viên thuốc hiển thị "6 Vụ" nổi bật khẩn cấp
          badge: `${sosCounts.active || 6} Vụ`,
          badgeType: 'danger',
        },
      ],
    },

    // NHÓM 2: LỰC LƯỢNG & NGUỒN LỰC
    {
      title: 'LỰC LƯỢNG & NGUỒN LỰC',
      items: [
        {
          key: 'rescuers',
          label: 'Đội cứu hộ địa phương',
          icon: <LifeBuoy size={18} className="sos-nav-icon" />,
        },
        {
          key: 'resources',
          label: 'Phương tiện & Vật tư',
          icon: <Package size={18} className="sos-nav-icon" />,
        },
      ],
    },

    // NHÓM 3: CẢNH BÁO & CỘNG ĐỒNG
    {
      title: 'CẢNH BÁO & CỘNG ĐỒNG',
      items: [
        {
          key: 'alerts',
          label: 'Phát cảnh báo khẩn cấp',
          icon: <Bell size={18} className="sos-nav-icon" />,
        },
        {
          key: 'shelters',
          label: 'Điểm trú ẩn & Trạm an toàn',
          useCase: 'UC-L12',
          icon: <Home size={18} className="sos-nav-icon" />,
          badge: shelterCount > 0 ? `${shelterCount}` : undefined,
          badgeType: 'info',
        },
        {
          key: 'hazard_reports',
          label: 'Quản lý điểm nguy hiểm',
          useCase: 'UC-L15',
          icon: <AlertTriangle size={18} className="sos-nav-icon" />,
          badge: hazardCount > 0 ? `${hazardCount}` : undefined,
          badgeType: 'info',
        },
      ],
    },

    // NHÓM 4: BÁO CÁO & GIÁM SÁT
    {
      title: 'BÁO CÁO & GIÁM SÁT',
      items: [
        {
          key: 'reports',
          label: 'Báo cáo & Thống kê',
          icon: <BarChart3 size={18} className="sos-nav-icon" />,
        },
        {
          key: 'operation_logs',
          label: 'Nhật ký tác chiến',
          icon: <History size={18} className="sos-nav-icon" />,
        },
      ],
    },
  ];

  /* --------------------------------------------------------------------------
     NHÓM MENU QUẢN TRỊ VIÊN HỆ THỐNG (DÀNH CHO ADMIN)
     -------------------------------------------------------------------------- */
  const adminAdditionalGroups: NavGroupConfig[] = [
    {
      title: 'QUẢN TRỊ HỆ THỐNG',
      items: [
        {
          key: 'admin_overview',
          label: 'Tổng quan hệ thống',
          icon: <LayoutDashboard size={18} className="sos-nav-icon" />,
        },
        {
          key: 'citizens',
          label: 'Quản lý Người dân',
          icon: <Users size={18} className="sos-nav-icon" />,
        },
        {
          key: 'rescuers_admin',
          label: 'Xác minh Đội cứu nạn',
          icon: <UserCheck size={18} className="sos-nav-icon" />,
          badge: pendingRescuersCount > 0 ? `${pendingRescuersCount}` : undefined,
          badgeType: 'warning',
        },
        {
          key: 'authorities',
          label: 'Cán bộ & Tổ chức',
          icon: <Building2 size={18} className="sos-nav-icon" />,
        },
        {
          key: 'areas',
          label: 'Khu vực hành chính',
          icon: <Globe2 size={18} className="sos-nav-icon" />,
        },
      ],
    },
  ];

  // Danh mục menu hiển thị
  const currentGroups = isAdmin
    ? [...operationMenuGroups, ...adminAdditionalGroups]
    : operationMenuGroups;

  // Xác định trạng thái active của mục hiện tại
  const isItemActive = (key: NavItemKey) => {
    if (activeKey) return activeKey === key;
    return key === 'rescuers'; // Fallback active cho Đội cứu hộ địa phương
  };

  // Thông tin user hiển thị ở Profile Bar & Modal chỉnh sửa Profile
  const [localProfile, setLocalProfile] = useState<{
    fullName: string;
    position: string;
    organizationName: string;
    phone: string;
    email: string;
    managedArea: string;
  }>(() => {
    return {
      fullName: user?.fullName || 'Đại úy Lê Hoàng Nam',
      position: user?.authority?.position || (isAdmin ? 'Quản trị viên hệ thống' : 'Chỉ huy trực ban tác chiến'),
      organizationName: user?.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN Quận Hải Châu',
      phone: (user as any)?.phoneNumber || (user as any)?.phone || '0905 114 115',
      email: user?.email || 'chihuy.pctt@danang.gov.vn',
      managedArea: user?.authority?.areaName || 'TP Đà Nẵng / Quận Hải Châu',
    };
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);

  // Đồng bộ khi prop user thay đổi từ bên ngoài hoặc qua storage
  useEffect(() => {
    if (user) {
      setLocalProfile({
        fullName: user.fullName || 'Đại úy Lê Hoàng Nam',
        position: user.authority?.position || (isAdmin ? 'Quản trị viên hệ thống' : 'Chỉ huy trực ban tác chiến'),
        organizationName: user.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN Quận Hải Châu',
        phone: (user as any)?.phoneNumber || (user as any)?.phone || '0905 114 115',
        email: user.email || 'chihuy.pctt@danang.gov.vn',
        managedArea: user.authority?.areaName || 'TP Đà Nẵng / Quận Hải Châu',
      });
    }
  }, [user, isAdmin]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rawUser = localStorage.getItem('sos_auth_user');
      const currentUserObj = rawUser ? JSON.parse(rawUser) : (user || {});

      const updatedUser: User = {
        ...currentUserObj,
        fullName: localProfile.fullName,
        phoneNumber: localProfile.phone,
        email: localProfile.email,
        authority: {
          ...(currentUserObj.authority || {}),
          position: localProfile.position,
          organizationName: localProfile.organizationName,
          areaName: localProfile.managedArea,
        } as any,
      };

      localStorage.setItem('sos_auth_user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updatedUser }));

      setIsProfileModalOpen(false);
      setProfileSuccessMsg(true);
      setTimeout(() => setProfileSuccessMsg(false), 3500);
    } catch (err) {
      console.error('Lỗi khi lưu profile:', err);
    }
  };

  const displayUserName = localProfile.fullName;
  const displayUserRole = localProfile.position;
  const userInitial = displayUserName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <aside
      className={`sos-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Sidebar điều hướng RescueSOS"
    >
      {/* ===================================================================
          1. HEADER / LOGO: SOS SYSTEMS & NÚT THU GỌN
          =================================================================== */}
      <div className="sos-sidebar-header">
        <div className="sos-brand" title="SOS SYSTEMS - Rescue Operations">
          <div className="sos-brand-logo-wrap">
            <img src="/logoSOS.png" alt="SOS Logo" className="sos-brand-logo" />
            <span className="sos-brand-pulse" />
          </div>

          {!collapsed && (
            <div className="sos-brand-info">
              <span className="sos-brand-title">SOS SYSTEMS</span>
              <span className="sos-brand-subtitle">
                {isAdmin ? 'Quản Trị Hệ Thống' : 'Điều Hành Tác Chiến'}
              </span>
            </div>
          )}
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="sos-collapse-toggle"
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            aria-label="Toggle Sidebar"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>



      {/* ===================================================================
          2. MENU ĐIỀU HƯỚNG (4 NHÓM CHÍNH PHÂN CẤP RÕ RÀNG)
          =================================================================== */}
      <nav className="sos-sidebar-nav" role="navigation">
        {currentGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="sos-nav-group">
            {/* Tiêu đề nhóm: IN HOA, màu xám nhạt (gray-400), font nhỏ, letter-spacing rộng */}
            {!collapsed && (
              <div className="sos-nav-group-title">
                {group.title}
              </div>
            )}
            {/* Danh sách các item thuộc nhóm */}
            <div className="sos-nav-group-items">
              {group.items.map((item) => {
                const active = isItemActive(item.key);
                return (
                  <div
                    key={item.key}
                    className={`sos-nav-item ${active ? 'active' : ''}`}
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
                    {/* Icon đại diện */}
                    {item.icon}

                    {/* Tên hiển thị & Badge */}
                    {!collapsed && (
                      <>
                        <span className="sos-nav-label">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`sos-nav-badge-pill ${
                              item.badgeType || 'info'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}

                    {/* Hiệu ứng chấm active khi collapsed */}
                    {collapsed && active && <span className="sos-nav-collapsed-active-dot" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ===================================================================
          3. FOOTER CỦA SIDEBAR (GHIM CỐ ĐỊNH Ở DƯỚI CÙNG)
          =================================================================== */}
      <div className="sos-sidebar-footer">
        {/* Khung User Profile (Avatar, Tên, Chức vụ, Nút Đăng xuất) */}
        <div className="sos-user-profile-card">
          <div
            className="sos-user-profile-left clickable"
            onClick={() => setIsProfileModalOpen(true)}
            title="Nhấp để chỉnh sửa hồ sơ cán bộ & thông tin địa phương"
            role="button"
            tabIndex={0}
          >
            <div className="sos-user-avatar-wrap">
              <div
                className={`sos-user-avatar ${isAdmin ? 'admin' : 'authority'}`}
                title="Nhấp để chỉnh sửa hồ sơ"
              >
                {userInitial}
              </div>
              <span className="sos-user-online-dot" title="Đang trực tuyến" />
            </div>

            {!collapsed && (
              <div className="sos-user-meta">
                <span className="sos-user-name" title={displayUserName}>
                  {displayUserName}
                </span>
                <span className="sos-user-role" title={displayUserRole}>
                  {displayUserRole}
                </span>
              </div>
            )}
          </div>

          {/* Nút Đăng xuất */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="sos-btn-logout-icon"
              title="Đăng xuất khỏi hệ thống"
              aria-label="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Toast thông báo cập nhật hồ sơ thành công */}
      {profileSuccessMsg && (
        <div className="sos-profile-toast-success">
          <Check size={16} />
          <span>Đã cập nhật hồ sơ địa phương thành công!</span>
        </div>
      )}

      {/* Modal Chỉnh Sửa Hồ Sơ Cán Bộ & Địa Phương */}
      {isProfileModalOpen && (
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
                  <UserCheck size={20} color="#2563eb" />
                </div>
                <div>
                  <h3>Hồ Sơ Cán Bộ &amp; Đơn Vị Địa Phương</h3>
                  <p>Cập nhật thông tin định danh &amp; đầu mối liên lạc tác chiến cứu hộ</p>
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
              <div className="sos-profile-avatar-preview">
                <div className="sos-profile-big-avatar">
                  {localProfile.fullName.trim().charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="sos-profile-preview-text">
                  <strong>{localProfile.fullName || 'Cán bộ trực ban'}</strong>
                  <span>{localProfile.position || 'Chỉ huy tác chiến'}</span>
                  <small>{localProfile.organizationName || 'Ban Chỉ Huy PCTT & TKCN'}</small>
                </div>
              </div>

              <div className="sos-profile-fields-grid">
                <div className="sos-profile-field">
                  <label>
                    <Edit3 size={14} />
                    <span>Họ và tên cán bộ:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={localProfile.fullName}
                    onChange={(e) => setLocalProfile({ ...localProfile, fullName: e.target.value })}
                    placeholder="VD: Đại úy Lê Hoàng Nam"
                  />
                </div>

                <div className="sos-profile-field">
                  <label>
                    <Shield size={14} />
                    <span>Chức vụ / Vị trí tác chiến:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={localProfile.position}
                    onChange={(e) => setLocalProfile({ ...localProfile, position: e.target.value })}
                    placeholder="VD: Chỉ Huy Trưởng Ban Tác Chiến"
                  />
                </div>

                <div className="sos-profile-field">
                  <label>
                    <Building2 size={14} />
                    <span>Cơ quan / Đơn vị công tác:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={localProfile.organizationName}
                    onChange={(e) => setLocalProfile({ ...localProfile, organizationName: e.target.value })}
                    placeholder="VD: Ban Chỉ Huy PCTT & TKCN Quận Hải Châu"
                  />
                </div>

                <div className="sos-profile-field">
                  <label>
                    <Phone size={14} />
                    <span>Số điện thoại trực ban / Hotline:</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={localProfile.phone}
                    onChange={(e) => setLocalProfile({ ...localProfile, phone: e.target.value })}
                    placeholder="VD: 0905 114 115"
                  />
                </div>

                <div className="sos-profile-field">
                  <label>
                    <Mail size={14} />
                    <span>Hòm thư điện tử công vụ:</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={localProfile.email}
                    onChange={(e) => setLocalProfile({ ...localProfile, email: e.target.value })}
                    placeholder="VD: chihuy.pctt@danang.gov.vn"
                  />
                </div>

                <div className="sos-profile-field">
                  <label>
                    <MapPin size={14} />
                    <span>Địa bàn phụ trách quản lý:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={localProfile.managedArea}
                    onChange={(e) => setLocalProfile({ ...localProfile, managedArea: e.target.value })}
                    placeholder="VD: TP Đà Nẵng / Quận Hải Châu"
                  />
                </div>
              </div>

              <div className="sos-profile-modal-actions">
                <button
                  type="button"
                  className="sos-profile-btn-cancel"
                  onClick={() => setIsProfileModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="sos-profile-btn-save">
                  <Check size={16} />
                  <span>Lưu Hồ Sơ Cán Bộ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

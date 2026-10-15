import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '../types/auth';
import {
  fetchSosRequests,
  fetchAdminUsers,
  fetchHazardReports,
  updateUserProfile,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '../services/api';
import { domainDService } from '../services/domainDService';
import {
  fetchProvincesV2,
  fetchProvinceWithWardsV2,
  type ProvinceV2,
  type WardV2,
} from '../services/provincesApi';
import {
  Map,
  Siren,
  GitMerge,
  LifeBuoy,
  Package,
  Bell,
  AlertTriangle,
  BarChart3,
  History,
  Settings,
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
  CheckCircle2,
  KeyRound,
  X,
  MessageSquare,
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
  | 'chat'
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
    // NHÓM 1: ĐIỀU HÀNH CỨU HỘ
    {
      title: 'ĐIỀU HÀNH CỨU HỘ',
      items: [
        {
          key: 'map',
          label: 'Bản đồ cứu hộ SOS',
          icon: <Map size={18} className="sos-nav-icon" />,
        },
        {
          key: 'sos_requests',
          label: 'Tiếp nhận & Xác minh SOS',
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
          label: 'Phát cảnh báo & Trạm trú ẩn',
          icon: <Bell size={18} className="sos-nav-icon" />,
        },
        {
          key: 'hazard_reports',
          label: 'Duyệt điểm nguy hiểm',
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
          label: 'Nhật ký',
          icon: <History size={18} className="sos-nav-icon" />,
        },
        {
          key: 'chat',
          label: 'Trao đổi',
          icon: <MessageSquare size={18} className="sos-nav-icon" />,
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
        {
          key: 'rbac',
          label: 'Phân quyền & Vai trò',
          icon: <Shield size={18} className="sos-nav-icon" />,
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
      position: user?.authority?.position || (isAdmin ? 'Quản trị viên hệ thống' : 'Chỉ huy trực ban cứu hộ'),
      organizationName: user?.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN Quận Hải Châu',
      phone: (user as any)?.phoneNumber || (user as any)?.phone || '0905 114 115',
      email: user?.email || 'chihuy.pctt@danang.gov.vn',
      managedArea: user?.authority?.areaName || 'TP Đà Nẵng / Quận Hải Châu',
    };
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

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

  // Bộ đếm lùi thời gian gửi lại mã OTP (60s)
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  // Dữ liệu Vietnam Provinces online API (2025)
  const [provinces, setProvinces] = useState<ProvinceV2[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<number | ''>('');
  const [wards, setWards] = useState<WardV2[]>([]);
  const [selectedWardCode, setSelectedWardCode] = useState<number | 'ALL'>('ALL');
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Khi mở Modal: tải danh mục 63 Tỉnh/TP từ Vietnam Provinces API v2 (2025) & nhận diện địa bàn hiện tại
  useEffect(() => {
    if (!isProfileModalOpen) return;
    let isMounted = true;
    setLoadingProvinces(true);

    fetchProvincesV2().then(async (list) => {
      if (!isMounted) return;
      setProvinces(list);
      setLoadingProvinces(false);

      const currentArea = (localProfile.managedArea || '').toLowerCase();
      if (currentArea && list.length > 0) {
        // Tự động tìm Tỉnh/TP khớp với hồ sơ hiện tại
        const foundProv = list.find((p) => {
          const cleanName = p.name.toLowerCase().replace(/tỉnh\s+|thành phố\s+/g, '').trim();
          return currentArea.includes(cleanName) || currentArea.includes(p.codename.replace(/_/g, ' '));
        });

        if (foundProv) {
          setSelectedProvinceCode(foundProv.code);
          setLoadingWards(true);
          const detail = await fetchProvinceWithWardsV2(foundProv.code);
          if (!isMounted) return;
          setLoadingWards(false);

          if (detail && Array.isArray(detail.wards)) {
            setWards(detail.wards);
            // Tìm Phường/Xã tương ứng
            const foundWard = detail.wards.find((w) => {
              const cleanW = w.name.toLowerCase().replace(/phường\s+|xã\s+|thị trấn\s+/g, '').trim();
              return currentArea.includes(cleanW) || currentArea.includes(w.codename.replace(/_/g, ' '));
            });
            if (foundWard) {
              setSelectedWardCode(foundWard.code);
            } else {
              setSelectedWardCode('ALL');
            }
          }
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isProfileModalOpen]);

  // Xử lý khi cán bộ chọn Tỉnh / Thành phố
  const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) {
      setSelectedProvinceCode('');
      setWards([]);
      setSelectedWardCode('ALL');
      return;
    }

    const code = Number(val);
    setSelectedProvinceCode(code);
    setSelectedWardCode('ALL');

    const chosenProv = provinces.find((p) => p.code === code);
    if (chosenProv) {
      setLocalProfile((prev) => ({
        ...prev,
        managedArea: chosenProv.name,
      }));
    }

    setLoadingWards(true);
    const detail = await fetchProvinceWithWardsV2(code);
    setLoadingWards(false);
    if (detail && Array.isArray(detail.wards)) {
      setWards(detail.wards);
    } else {
      setWards([]);
    }
  };

  // Xử lý khi cán bộ chọn Phường / Xã
  const handleWardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const chosenProv = provinces.find((p) => p.code === selectedProvinceCode);
    const provName = chosenProv ? chosenProv.name : '';

    if (val === 'ALL' || !val) {
      setSelectedWardCode('ALL');
      if (provName) {
        setLocalProfile((prev) => ({
          ...prev,
          managedArea: provName,
        }));
      }
      return;
    }

    const wardCode = Number(val);
    setSelectedWardCode(wardCode);
    const chosenWard = wards.find((w) => w.code === wardCode);
    if (chosenWard && provName) {
      setLocalProfile((prev) => ({
        ...prev,
        managedArea: `${chosenWard.name}, ${provName}`,
      }));
    }
  };

  // Đồng bộ khi prop user thay đổi từ bên ngoài hoặc qua storage
  useEffect(() => {
    if (user) {
      const p = (user as any)?.phoneNumber || (user as any)?.phone || '0905 114 115';
      const cleanP = String(p).replace(/[^0-9]/g, '');
      const isVer = Boolean(user.isPhoneVerified || user.isVerified);
      setIsPhoneVerified(isVer);
      setVerifiedPhone(isVer ? cleanP : '');

      setLocalProfile({
        fullName: user.fullName || 'Đại úy Lê Hoàng Nam',
        position: user.authority?.position || (isAdmin ? 'Quản trị viên hệ thống' : 'Chỉ huy trực ban cứu hộ'),
        organizationName: user.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN Quận Hải Châu',
        phone: p,
        email: user.email || 'chihuy.pctt@danang.gov.vn',
        managedArea: user.authority?.areaName || 'TP Đà Nẵng / Quận Hải Châu',
      });
    }
  }, [user, isAdmin]);

  // Khi cán bộ thay đổi số điện thoại trong ô input
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

  // Gửi mã OTP xác thực số điện thoại
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

  // Xác thực mã OTP 6 số
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

      // Cập nhật ngay bộ nhớ tạm auth user
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
      const currentUserObj = rawUser ? JSON.parse(rawUser) : (user || {});

      // 1. Gửi request PATCH /api/users/me lưu trực tiếp vào cơ sở dữ liệu MongoDB
      const res = await updateUserProfile({
        fullName: localProfile.fullName,
        phone: localProfile.phone,
        email: localProfile.email,
        isPhoneVerified: isPhoneVerified,
        authority: {
          position: localProfile.position,
          organizationName: localProfile.organizationName,
          areaName: localProfile.managedArea,
          provinceCode: selectedProvinceCode ? Number(selectedProvinceCode) : undefined,
          wardCode: selectedWardCode !== 'ALL' ? Number(selectedWardCode) : undefined,
        },
      });

      const serverUser = res.success && res.data ? res.data : null;

      const updatedUser: User = {
        ...currentUserObj,
        ...(serverUser || {}),
        fullName: serverUser?.fullName || localProfile.fullName,
        phoneNumber: serverUser?.phone || (serverUser as any)?.phoneNumber || localProfile.phone,
        email: serverUser?.email || localProfile.email,
        authority: {
          ...(currentUserObj.authority || {}),
          ...(serverUser?.authority || {}),
          position: localProfile.position,
          organizationName: localProfile.organizationName,
          areaName: localProfile.managedArea,
          provinceCode: selectedProvinceCode || undefined,
          wardCode: selectedWardCode !== 'ALL' ? selectedWardCode : undefined,
        } as any,
      };

      // 2. Lưu vào local storage & phát sự kiện đồng bộ toàn hệ thống
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
                {isAdmin ? 'Quản Trị Hệ Thống' : 'Điều Hành Cứu Hộ'}
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
                            className={`sos-nav-badge-pill ${item.badgeType || 'info'
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
        {/* Cài đặt hệ thống (Icon: Settings/Gear) */}
        <div
          className={`sos-settings-item ${isItemActive('settings') ? 'active' : ''}`}
          onClick={() => handleItemClick('settings')}
          title="Cài đặt hệ thống"
          role="button"
          tabIndex={0}
        >
          <Settings size={18} className="sos-nav-icon" />
          {!collapsed && <span className="sos-settings-label">Cài đặt hệ thống</span>}
        </div>

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
              <div className="sos-profile-avatar-preview">
                <div className="sos-profile-big-avatar">
                  {localProfile.fullName.trim().charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="sos-profile-preview-text">
                  <strong>{localProfile.fullName || 'Cán bộ trực ban'}</strong>
                  <span>{localProfile.position || 'Chỉ huy cứu hộ'}</span>
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
                    <span>Chức vụ / Vị trí:</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={localProfile.position}
                    onChange={(e) => setLocalProfile({ ...localProfile, position: e.target.value })}
                    placeholder="VD: Chỉ Huy Trưởng"
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
                  <div className="sos-profile-field-header">
                    <label>
                      <Phone size={14} />
                      <span>Số điện thoại trực ban / Hotline:</span>
                    </label>
                    {isPhoneVerified ? (
                      <span className="sos-phone-badge-verified">
                        <CheckCircle2 size={12} /> Đã xác thực
                      </span>
                    ) : (
                      <span className="sos-phone-badge-unverified">
                        Chưa xác thực
                      </span>
                    )}
                  </div>

                  <div className="sos-phone-input-wrap">
                    <input
                      type="tel"
                      required
                      value={localProfile.phone}
                      onChange={handlePhoneChange}
                      placeholder="VD: 0905 114 115"
                      className={isPhoneVerified ? 'phone-verified' : ''}
                    />
                    {!isPhoneVerified && (
                      <button
                        type="button"
                        className="sos-btn-send-otp"
                        onClick={handleSendPhoneOtp}
                        disabled={sendingOtp || otpCountdown > 0 || !localProfile.phone.trim()}
                        title="Gửi mã OTP xác minh số điện thoại này"
                      >
                        {sendingOtp
                          ? 'Đang gửi...'
                          : otpCountdown > 0
                          ? `Gửi lại (${otpCountdown}s)`
                          : showOtpBox
                          ? 'Gửi lại mã'
                          : 'Xác thực SĐT'}
                      </button>
                    )}
                  </div>

                  {/* Ô NHẬP MÃ OTP GỌN GÀNG HIỆN ĐẠI */}
                  {showOtpBox && !isPhoneVerified && (
                    <div className="sos-otp-compact-row">
                      <div className="sos-otp-input-wrap">
                        <KeyRound size={13} className="sos-otp-icon" />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          className="sos-otp-compact-input"
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
                        className="sos-btn-compact-verify"
                        onClick={handleVerifyPhoneOtp}
                        disabled={verifyingOtp || otpCode.trim().length !== 6}
                      >
                        {verifyingOtp ? 'Kiểm tra...' : 'Xác nhận'}
                      </button>
                    </div>
                  )}

                  {otpError && (
                    <div className="sos-otp-error-inline">
                      ⚠️ {otpError}
                    </div>
                  )}
                  {otpSuccessNotice && (
                    <div className="sos-otp-success-inline">
                      {otpSuccessNotice}
                    </div>
                  )}
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

                {/* Chọn địa bàn chuẩn Vietnam Provinces online API 2025 */}
                <div className="sos-profile-field full-width">
                  <label>
                    <MapPin size={14} color="#2563eb" />
                    <span>Địa bàn phụ trách quản lý:</span>
                  </label>

                  <div className="sos-profile-area-selects">
                    <div className="sos-profile-select-group">
                      <span className="sos-profile-sublabel">Tỉnh / Thành phố trực thuộc TW:</span>
                      <select
                        value={selectedProvinceCode}
                        onChange={handleProvinceChange}
                        disabled={loadingProvinces}
                      >
                        <option value="">
                          {loadingProvinces ? '-- Đang tải danh sách Tỉnh/TP... --' : '-- Chọn Tỉnh / Thành phố --'}
                        </option>
                        {provinces.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sos-profile-select-group">
                      <span className="sos-profile-sublabel">
                        Phường / Xã / Đơn vị cơ sở:
                        {loadingWards && <span style={{ marginLeft: 6, fontSize: 10, color: '#2563eb' }}>(Đang nạp...)</span>}
                      </span>
                      <select
                        value={selectedWardCode}
                        onChange={handleWardChange}
                        disabled={!selectedProvinceCode || loadingWards}
                      >
                        <option value="ALL">-- Toàn bộ Tỉnh / Thành phố (Cấp Tỉnh) --</option>
                        {wards.map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="sos-profile-area-preview">
                    <span className="sos-profile-sublabel">Tên địa bàn hiển thị trong hồ sơ &amp; phân quyền:</span>
                    <input
                      type="text"
                      required
                      value={localProfile.managedArea}
                      onChange={(e) => setLocalProfile({ ...localProfile, managedArea: e.target.value })}
                      placeholder="VD: Phường Hải Châu, Thành phố Đà Nẵng"
                    />
                  </div>
                </div>
              </div>

              {profileErrorMsg && (
                <div style={{ color: '#ef4444', fontSize: 12, padding: '4px 8px', background: '#fef2f2', borderRadius: 6 }}>
                  ⚠️ {profileErrorMsg}
                </div>
              )}

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
                  <Check size={16} />
                  <span>{savingProfile ? 'Đang lưu vào Database...' : 'Lưu Hồ Sơ Cán Bộ'}</span>
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

import { useState, useEffect, useCallback, useRef } from 'react';
import { LoginPage } from '@/features/auth';
import { DashboardLayout, DashboardViews, type NavItemKey } from '@/components/layout';
import { AppProvider } from '@/context/AppContext';
import { domainDService } from '@/services/domainDService';
import { getSocket } from '@/services/socketService';
import { logoutApi } from '@/api';
import { parseRoute, buildRouteUrl, navigateTo } from '@/services/appRouter';
import { ToastContainer } from '@/components/common/ToastContainer';
import { toast } from '@/components/common/toast';
import type { User } from '@/types/auth';
import './App.css';

// Kiểm tra quyền hạn hợp lệ: ADMIN, LOCAL_AUTHORITY hoặc có trường .authority
const hasAuthorizedRole = (roles: string[] | undefined, authority?: any): boolean => {
  if (authority && typeof authority === 'object' && Object.keys(authority).length > 0) return true;
  if (!roles || !Array.isArray(roles)) return false;
  return roles.includes('ADMIN') || roles.includes('LOCAL_AUTHORITY') || roles.includes('AUTHORITY');
};

// Đọc và xác minh thông tin tài khoản từ localStorage
const getAuthorizedUser = (): User | null => {
  try {
    const saved = localStorage.getItem('sos_auth_user');
    if (!saved) return null;
    const parsed = JSON.parse(saved) as User;
    if (hasAuthorizedRole(parsed?.roles, parsed?.authority)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const checkIsResetPasswordFlow = (): boolean => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'reset' || Boolean(params.get('token')) || window.location.pathname === '/reset-password';
  } catch {
    return false;
  }
};

function MainRouter() {
  const [authUser, setAuthUser] = useState<User | null>(() => getAuthorizedUser());
  const [isResetFlow, setIsResetFlow] = useState<boolean>(() => checkIsResetPasswordFlow());
  const [activeNavKey, setActiveNavKey] = useState<NavItemKey>(() => {
    const user = getAuthorizedUser();
    const parsed = parseRoute(window.location.pathname, window.location.hash, user);
    // Mặc định Đội cứu hộ địa phương ('rescuers') ở trạng thái Active nếu chưa chọn trang cụ thể
    if (
      parsed.navKey === 'map' &&
      (!window.location.hash &&
        (window.location.pathname === '/' ||
          window.location.pathname === '/authority' ||
          window.location.pathname === '/local_authority' ||
          window.location.pathname === '/localauthor' ||
          window.location.pathname === '/localauthority'))
    ) {
      return 'rescuers';
    }
    return parsed.navKey || 'rescuers';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Điều hướng tab và cập nhật URL sạch (e.g. /localauthor/sos_requests hoặc /admin/map)
  const handleNavSelect = (key: NavItemKey, subPath?: string) => {
    setActiveNavKey(key);
    navigateTo(key, authUser, subPath);
  };

  // Route Guard: Kiểm tra phiên và quyền hạn
  const checkRouteAccess = useCallback(() => {
    if (checkIsResetPasswordFlow()) {
      setIsResetFlow(true);
      return;
    }

    const user = getAuthorizedUser();
    setAuthUser(user);

    if (!user) {
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (checkIsResetPasswordFlow()) {
        setIsResetFlow(true);
        return;
      }
      setIsResetFlow(false);
      checkRouteAccess();
      const user = getAuthorizedUser();
      const parsed = parseRoute(window.location.pathname, window.location.hash, user);
      setActiveNavKey(parsed.navKey);
    };

    const handleProfileUpdated = (e: any) => {
      const updatedUser = e?.detail || getAuthorizedUser();
      if (updatedUser) {
        setAuthUser(updatedUser);
        domainDService.syncLoggedInUser(updatedUser);
      }
    };

    const handleNavigateTab = (e: any) => {
      const { key, subPath } = e?.detail || {};
      if (key) {
        handleNavSelect(key, subPath);
      }
    };

    const handleAuthExpired = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setAuthUser(null);
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
      toast.warning(
        detail?.message || 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
        'Phiên đăng nhập hết hạn',
        5000
      );
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('storage', checkRouteAccess);
    window.addEventListener('sos_user_profile_updated', handleProfileUpdated);
    window.addEventListener('sos_navigate_tab', handleNavigateTab);
    window.addEventListener('sos_auth_expired', handleAuthExpired);

    // Initial check: Nếu đang ở luồng reset mật khẩu từ email thì không auto-redirect vào dashboard
    if (checkIsResetPasswordFlow()) {
      setIsResetFlow(true);
      return () => {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('storage', checkRouteAccess);
      };
    }

    const user = getAuthorizedUser();
    if (user) {
      const parsed = parseRoute(window.location.pathname, window.location.hash, user);
      setActiveNavKey(parsed.navKey);
      const expectedUrl = buildRouteUrl(parsed.navKey, user, parsed.subPath);
      // Nếu còn hash cũ hoặc URL chưa đúng định dạng thì chuẩn hóa
      if (window.location.hash || window.location.pathname !== expectedUrl) {
        window.history.replaceState({ navKey: parsed.navKey, subPath: parsed.subPath }, '', expectedUrl);
      }
    } else {
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('storage', checkRouteAccess);
      window.removeEventListener('sos_user_profile_updated', handleProfileUpdated);
      window.removeEventListener('sos_navigate_tab', handleNavigateTab);
      window.removeEventListener('sos_auth_expired', handleAuthExpired);
    };
  }, [checkRouteAccess]);

  const isAuthorMapMountedRef = useRef(false);
  useEffect(() => {
    const isAuthPortal =
      Boolean(authUser?.roles?.includes('LOCAL_AUTHORITY')) ||
      Boolean(authUser?.roles?.includes('AUTHORITY')) ||
      Boolean(authUser?.authority && Object.keys(authUser.authority).length > 0);
    const isAdmin = Boolean(authUser?.roles?.includes('ADMIN'));
    isAuthorMapMountedRef.current = activeNavKey === 'map' && isAuthPortal && !isAdmin;
  }, [activeNavKey, authUser]);

  // Lắng nghe toàn cục khi đội cứu hộ hủy/từ chối nhận lệnh (hiển thị ngay cả khi không đứng ở tab Bản đồ tác chiến)
  useEffect(() => {
    if (!authUser || !hasAuthorizedRole(authUser.roles, authUser.authority)) return;
    const socket = getSocket();
    const seenCancelMap = new Map<string, number>();

    const handleGlobalTeamCancelled = (payload: any) => {
      if (!payload || isAuthorMapMountedRef.current) return;
      const statusUpper = String(payload.status || '').toUpperCase();
      if (!['REJECTED', 'CANCELLED'].includes(statusUpper)) return;
      if (statusUpper === 'CANCELLED' && payload.cancelledByTeam !== true) return;

      const key = `${String(payload.assignmentId || payload._id || payload.sosId || '')}-${statusUpper}`;
      const now = Date.now();
      if (key !== `-${statusUpper}` && now - (seenCancelMap.get(key) || 0) < 3000) return;
      seenCancelMap.set(key, now);

      const teamName =
        payload.rescueTeamName ||
        (typeof payload.rescueTeamId === 'object' ? payload.rescueTeamId?.name || payload.rescueTeamId?.teamName : '') ||
        'Đội cứu hộ';
      const missionLabel =
        payload.missionType === 'SHORE_HANDOFF'
          ? 'lệnh đón bờ'
          : payload.missionType === 'RELIEF_DISPATCH'
            ? 'lệnh tiếp tế cứu trợ'
            : 'yêu cầu cứu hộ';
      const codeStr = payload.sosCode ? ` ca ${String(payload.sosCode).startsWith('#') ? payload.sosCode : `#${payload.sosCode}`}` : '';
      const reasonStr = payload.cancelReason || payload.reason ? ` Lý do: ${payload.cancelReason || payload.reason}.` : '';

      toast.error(
        `Đội ${teamName} đã ${statusUpper === 'REJECTED' ? 'từ chối' : 'hủy'} ${missionLabel}${codeStr}!${reasonStr} Vui lòng kiểm tra và điều phối đội khác.`,
        '⚠️ Đội cứu hộ hủy nhận lệnh',
        8000
      );
    };

    const handleGlobalAssignmentUpdated = (data: any) => {
      const st = String(data?.status || '').toUpperCase();
      if (st === 'REJECTED' || (st === 'CANCELLED' && data?.cancelledByTeam === true)) {
        handleGlobalTeamCancelled(data);
      }
    };

    socket.on('assignment:rejected', handleGlobalTeamCancelled);
    socket.on('assignment:cancelled_by_team', handleGlobalTeamCancelled);
    socket.on('assignment:status_updated', handleGlobalAssignmentUpdated);
    socket.on('assignment:updated', handleGlobalAssignmentUpdated);

    return () => {
      socket.off('assignment:rejected', handleGlobalTeamCancelled);
      socket.off('assignment:cancelled_by_team', handleGlobalTeamCancelled);
      socket.off('assignment:status_updated', handleGlobalAssignmentUpdated);
      socket.off('assignment:updated', handleGlobalAssignmentUpdated);
    };
  }, [authUser]);

  const handleLoginSuccess = (user: User) => {
    setAuthUser(user);
    domainDService.syncLoggedInUser(user);
    const initialKey: NavItemKey = 'map';
    setActiveNavKey(initialKey);
    navigateTo(initialKey, user, undefined, true);
  };

  const handleLogout = async () => {
    await logoutApi();
    localStorage.removeItem('sos_auth_user');
    localStorage.removeItem('sos_access_token');
    localStorage.removeItem('sos_refresh_token');
    localStorage.removeItem('sos_active_portal');
    setAuthUser(null);
    window.history.replaceState(null, '', '/login');
  };

  // Ưu tiên cao nhất: Khi người dùng bấm link đổi mật khẩu từ Email, chuyển thẳng tới trang đổi mật khẩu
  if (isResetFlow) {
    return (
      <LoginPage
        isResetPasswordMode={true}
        onCloseResetMode={() => {
          setIsResetFlow(false);
          window.history.replaceState(null, '', '/login');
        }}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // 1. KHI ĐÃ ĐĂNG NHẬP VÀ XÁC THỰC ROLE HỢP LỆ (ADMIN, LOCAL_AUTHORITY hoặc có trường .authority)
  if (authUser && hasAuthorizedRole(authUser.roles, authUser.authority)) {
    return (
      <DashboardLayout
        user={authUser}
        activeNavKey={activeNavKey}
        sidebarCollapsed={sidebarCollapsed}
        onSelectNavKey={handleNavSelect}
        onToggleSidebarCollapse={() => {
          setSidebarCollapsed(!sidebarCollapsed);
          setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
        }}
        onLogout={handleLogout}
      >
        <DashboardViews
          activeKey={activeNavKey}
          onOpenMap={(sosId?: string) => handleNavSelect('map', sosId)}
          user={authUser || undefined}
        />
      </DashboardLayout>
    );
  }

  // 2. MẶC ĐỊNH KHI CHƯA ĐĂNG NHẬP: Hiển thị trang Login
  return <LoginPage onLoginSuccess={handleLoginSuccess} />;
}

function App() {
  return (
    <AppProvider>
      <MainRouter />
      <ToastContainer />
    </AppProvider>
  );
}

export default App;

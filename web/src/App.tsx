import { useState, useEffect, useCallback } from 'react';
import { LoginPage } from '@/features/auth';
import { DashboardLayout, DashboardViews, type NavItemKey } from '@/components/layout';
import { AppProvider } from '@/context/AppContext';
import { domainDService } from '@/services/domainDService';
import { logoutApi } from '@/api';
import { parseRoute, buildRouteUrl, navigateTo } from '@/services/appRouter';
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

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('storage', checkRouteAccess);

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
    };
  }, [checkRouteAccess]);

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
    </AppProvider>
  );
}

export default App;

import { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import type { NavItemKey } from './components/Sidebar';
import { DashboardViews } from './components/DashboardViews';
import { AuthorPortal } from './components/author/AuthorPortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { AppProvider } from './context/AppContext';
import { domainDService } from './services/domainDService';
import { logoutApi } from './services/api';
import { parseRoute, buildRouteUrl, navigateTo } from './services/appRouter';
import type { User } from './types/auth';
import './App.css';

// Kiểm tra quyền hạn hợp lệ: Chỉ ADMIN hoặc LOCAL_AUTHORITY
const hasAuthorizedRole = (roles: string[] | undefined): boolean => {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.includes('ADMIN') || roles.includes('LOCAL_AUTHORITY');
};

// Đọc và xác minh thông tin tài khoản từ localStorage
const getAuthorizedUser = (): User | null => {
  try {
    const saved = localStorage.getItem('sos_auth_user');
    if (!saved) return null;
    const parsed = JSON.parse(saved) as User;
    if (hasAuthorizedRole(parsed?.roles)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const navTitles: Record<NavItemKey, { title: string; desc: string }> = {
  map: {
    title: 'BẢN ĐỒ ĐIỀU HÀNH TÁC CHIẾN SOS',
    desc: 'Trung tâm giám sát thời gian thực & hỗ trợ ứng cứu khẩn cấp người dân',
  },
  sos_requests: {
    title: 'TIẾP NHẬN & XÁC MINH YÊU CẦU SOS',
    desc: 'Tiếp nhận dữ liệu từ App & cuộc gọi Hotline, xác minh và đánh giá mức độ khẩn cấp',
  },
  coordination: {
    title: 'ĐIỀU PHỐI & PHÂN CÔNG CỨU HỘ',
    desc: 'Phân công đội cứu nạn, theo dõi tiến trình thực địa và đóng yêu cầu hoàn thành',
  },
  rescuers: {
    title: 'ĐỘI NGŨ CỨU NẠN ĐỊA PHƯƠNG',
    desc: 'Quản lý lực lượng cứu hộ, trạng thái sẵn sàng và khu vực hoạt động',
  },
  resources: {
    title: 'PHƯƠNG TIỆN & VẬT TƯ',
    desc: 'Quản lý thuyền cano, xe cấp cứu, áo phao, túi y tế ứng phó thiên tai lũ lụt',
  },
  alerts: {
    title: 'PHÁT CẢNH BÁO ĐỊA PHƯƠNG',
    desc: 'Cán bộ phát cảnh báo thiên tai khẩn cấp tới toàn thể người dân trong cùng địa bàn quản lý',
  },
  shelters: {
    title: 'ĐIỂM TRÚ ẨN & TRẠM Y TẾ AN TOÀN',
    desc: 'Quản lý các trạm sơ tán, điểm tránh lũ và năng lực tiếp nhận người dân trong địa bàn',
  },
  hazard_reports: {
    title: 'DUYỆT ĐIỂM NGUY HIỂM TỪ NGƯỜI DÂN',
    desc: 'Thẩm định và xác nhận các vị trí sạt lở, nước dâng sâu do cộng đồng đóng góp',
  },
  reports: {
    title: 'BÁO CÁO & THỐNG KÊ ĐỊA PHƯƠNG',
    desc: 'Phân tích số liệu cứu hộ, thời gian phản hồi và tỷ lệ hỗ trợ người dân',
  },
  operation_logs: {
    title: 'NHẬT KÝ TÁC CHIẾN & SỰ KIỆN',
    desc: 'Theo dõi chi tiết lịch sử sự kiện, điều động lực lượng và biên bản tác chiến thực địa',
  },
  settings: {
    title: 'CÀI ĐẶT HỆ THỐNG',
    desc: 'Cấu hình tham số điều hành tác chiến, thông báo khẩn cấp và kết nối vệ tinh',
  },
  admin_overview: {
    title: 'TỔNG QUAN & GIÁM SÁT TOÀN DIỆN',
    desc: 'Bảng điều khiển trung tâm giám sát hoạt động hệ thống SOS trên toàn quốc',
  },
  citizens: {
    title: 'QUẢN TRỊ TÀI KHOẢN NGƯỜI DÂN',
    desc: 'Quản lý danh sách, thông tin liên lạc và trạng thái tài khoản người dân',
  },
  rescuers_admin: {
    title: 'XÁC MINH LỰC LƯỢNG CỨU NẠN',
    desc: 'Kiểm tra hồ sơ chứng chỉ, cấp phép và quản lý tài khoản đội cứu hộ',
  },
  authorities: {
    title: 'QUẢN LÝ CÁN BỘ & ĐỊA PHƯƠNG',
    desc: 'Khởi tạo và quản lý quyền hạn của các Ban chỉ huy PCTT & TKCN cấp tỉnh/huyện/xã',
  },
  areas: {
    title: 'KHU VỰC HÀNH CHÍNH & RANH GIỚI',
    desc: 'Quản lý danh mục địa giới hành chính, phạm vi quản lý và ranh giới bản đồ',
  },
  rbac: {
    title: 'PHÂN QUYỀN TRUY CẬP VAI TRÒ',
    desc: 'Cấu hình và kiểm soát ma trận quyền hạn theo từng Actor trong hệ thống',
  },
  audit_logs: {
    title: 'NHẬT KÝ HỆ THỐNG & KIỂM TOÁN',
    desc: 'Theo dõi chi tiết nhật ký thao tác: Ai? Làm gì? Khi nào? Đối tượng nào?',
  },
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
    if (parsed.navKey === 'map' && (!window.location.hash && (window.location.pathname === '/' || window.location.pathname === '/local_authority' || window.location.pathname === '/localauthor'))) {
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

  // 1. KHI ĐÃ ĐĂNG NHẬP VÀ XÁC THỰC ROLE HỢP LỆ (ADMIN hoặc LOCAL_AUTHORITY)
  if (authUser && hasAuthorizedRole(authUser.roles)) {
    const currentMeta = navTitles[activeNavKey] || navTitles.map;

    return (
      <div className="sos-dashboard-container">
        {/* 1. THANH SIDEBAR BÊN TRÁI PHÂN BIỆT THEO ROLE (LOCAL_AUTHORITY HOẶC ADMIN) */}
        <Sidebar
          user={authUser}
          activeKey={activeNavKey}
          onSelectKey={handleNavSelect}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed(!sidebarCollapsed);
            setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
          }}
        />

        {/* 2. KHÔNG GIAN NỘI DUNG CHÍNH (MAIN DASHBOARD CONTENT) */}
        <main
          className="sos-main-content"
          style={{
            overflow: activeNavKey === 'map' ? 'hidden' : 'auto',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeNavKey === 'map' ? (
            /* Phân biệt rõ: LOCAL_AUTHORITY dùng AuthorPortal (Khóa khu vực & SOS thực địa), ADMIN dùng AdminPortal (Toàn TP Đà Nẵng, không hiện SOS) */
            authUser.roles.includes('LOCAL_AUTHORITY') && !authUser.roles.includes('ADMIN') ? (
              <AuthorPortal
                user={authUser}
                embedded={true}
                onLogout={handleLogout}
              />
            ) : (
              <AdminPortal
                embedded={true}
                onLogout={handleLogout}
              />
            )
          ) : (
            /* Các màn hình quản trị nghiệp vụ khác */
            <>
              <header className="sos-main-header">
                <div className="sos-page-title-wrap">
                  <div>
                    <h1 className="sos-page-title">{currentMeta.title}</h1>
                    <p className="sos-page-desc">{currentMeta.desc}</p>
                  </div>
                </div>
              </header>

              <div className="sos-page-body">
                <div style={{ width: '100%' }}>
                  <DashboardViews
                    activeKey={activeNavKey}
                    onOpenMap={(sosId?: string) => handleNavSelect('map', sosId)}
                    user={authUser || undefined}
                  />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  // 2. MẶC ĐỊNH KHI CHƯA ĐĂNG NHẬP: Hiển thị trang Login
  return (
    <LoginPage
      onLoginSuccess={handleLoginSuccess}
    />
  );
}

function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}

export default App;

import { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import SOSMap from './components/SOSMap';
import { Sidebar } from './components/Sidebar';
import type { NavItemKey } from './components/Sidebar';
import { DashboardViews } from './components/DashboardViews';
import { logoutApi } from './services/api';
import type { User } from './types/auth';
import { ArrowLeft } from 'lucide-react';
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
    title: 'TIẾP NHẬN & XÁC MINH YÊU CẦU SOS (UC-L02, UC-L05, UC-L06)',
    desc: 'Tiếp nhận dữ liệu từ App & cuộc gọi Hotline, xác minh và đánh giá mức độ khẩn cấp',
  },
  coordination: {
    title: 'ĐIỀU PHỐI & PHÂN CÔNG CỨU HỘ (UC-L07, UC-L08, UC-L13)',
    desc: 'Phân công đội cứu nạn, theo dõi tiến trình thực địa và đóng yêu cầu hoàn thành',
  },
  rescuers: {
    title: 'ĐỘI NGŨ CỨU NẠN ĐỊA PHƯƠNG (UC-L10)',
    desc: 'Quản lý lực lượng cứu hộ, trạng thái sẵn sàng và khu vực hoạt động',
  },
  resources: {
    title: 'NGUỒN LỰC & PHƯƠNG TIỆN CỨU HỘ (UC-L11)',
    desc: 'Quản lý thuyền cano, xe cấp cứu, trang thiết bị ứng phó thiên tai lũ lụt',
  },
  alerts: {
    title: 'PHÁT CẢNH BÁO & TRẠM TRÚ ẨN (UC-L12)',
    desc: 'Phát thông báo nguy cấp đến người dân vùng ngập lụt và điểm sơ tán an toàn',
  },
  hazard_reports: {
    title: 'DUYỆT ĐIỂM NGUY HIỂM TỪ NGƯỜI DÂN (UC-L15)',
    desc: 'Thẩm định và xác nhận các vị trí sạt lở, nước dâng sâu do cộng đồng đóng góp',
  },
  reports: {
    title: 'BÁO CÁO & THỐNG KÊ ĐỊA PHƯƠNG (UC-L14)',
    desc: 'Phân tích số liệu cứu hộ, thời gian phản hồi và tỷ lệ hỗ trợ người dân',
  },
  admin_overview: {
    title: 'TỔNG QUAN & GIÁM SÁT TOÀN DIỆN (UC-A07, UC-A08)',
    desc: 'Bảng điều khiển trung tâm giám sát hoạt động hệ thống SOS trên toàn quốc',
  },
  citizens: {
    title: 'QUẢN TRỊ TÀI KHOẢN NGƯỜI DÂN (UC-A02)',
    desc: 'Quản lý danh sách, thông tin liên lạc và trạng thái tài khoản người dân',
  },
  rescuers_admin: {
    title: 'XÁC MINH LỰC LƯỢNG CỨU NẠN (UC-A03)',
    desc: 'Kiểm tra hồ sơ chứng chỉ, cấp phép và quản lý tài khoản đội cứu hộ',
  },
  authorities: {
    title: 'QUẢN LÝ CÁN BỘ & ĐỊA PHƯƠNG (UC-A04)',
    desc: 'Khởi tạo và quản lý quyền hạn của các Ban chỉ huy PCTT & TKCN cấp tỉnh/huyện/xã',
  },
  areas: {
    title: 'KHU VỰC HÀNH CHÍNH & RANH GIỚI (UC-A05)',
    desc: 'Quản lý danh mục địa giới hành chính, phạm vi quản lý và ranh giới bản đồ',
  },
  rbac: {
    title: 'PHÂN QUYỀN TRUY CẬP VAI TRÒ (UC-A06)',
    desc: 'Cấu hình và kiểm soát ma trận quyền hạn theo từng Actor trong hệ thống',
  },
  audit_logs: {
    title: 'NHẬT KÝ HỆ THỐNG & KIỂM TOÁN (UC-A09)',
    desc: 'Theo dõi chi tiết nhật ký thao tác: Ai? Làm gì? Khi nào? Đối tượng nào?',
  },
};

function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [authUser, setAuthUser] = useState<User | null>(() => getAuthorizedUser());
  const [activeNavKey, setActiveNavKey] = useState<NavItemKey>('map');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Route Guard: Kiểm tra phiên và quyền hạn trước khi cho phép vào các trang nội bộ
  const checkRouteAccess = useCallback(() => {
    const user = getAuthorizedUser();
    setAuthUser(user);

    // Nếu người dùng cố tình vào #map mà chưa đăng nhập hoặc không có quyền -> Chặn & điều hướng về Login
    if (window.location.hash === '#map') {
      if (!user) {
        window.location.hash = '';
        setCurrentHash('');
        return;
      }
    }
    setCurrentHash(window.location.hash);
  }, []);

  useEffect(() => {
    checkRouteAccess();

    const handleHashChange = () => {
      checkRouteAccess();
    };

    const handleStorageChange = () => {
      checkRouteAccess();
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkRouteAccess]);

  const handleLogout = async () => {
    await logoutApi();
    localStorage.removeItem('sos_auth_user');
    localStorage.removeItem('sos_access_token');
    setAuthUser(null);
    window.location.hash = '';
    setCurrentHash('');
  };

  // Route Guard: Khi đã xác thực role ADMIN hoặc LOCAL_AUTHORITY và URL có #map (hoặc sau khi login)
  if (currentHash === '#map' && authUser && hasAuthorizedRole(authUser.roles)) {
    const currentMeta = navTitles[activeNavKey] || navTitles.map;

    return (
      <div className="sos-dashboard-container">
        {/* 1. THANH SIDEBAR BÊN TRÁI PHÂN BIỆT THEO ROLE (LOCAL_AUTHORITY & ADMIN) */}
        <Sidebar
          user={authUser}
          activeKey={activeNavKey}
          onSelectKey={(key) => setActiveNavKey(key)}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* 2. KHÔNG GIAN NỘI DUNG CHÍNH (MAIN DASHBOARD CONTENT) */}
        <main className="sos-main-content">
          {/* Header thanh điều hướng phía trên */}
          <header className="sos-main-header">
            <div className="sos-page-title-wrap">
              <div>
                <h1 className="sos-page-title">{currentMeta.title}</h1>
                <p className="sos-page-desc">{currentMeta.desc}</p>
              </div>
            </div>

            <div className="sos-header-actions">
              <span className="sos-live-pill">
                <span className="sos-live-dot" />
                <span>TRỰC BAN REALTIME</span>
              </span>

              {/* Nút quay lại màn hình hồ sơ đăng nhập */}
              <button
                type="button"
                onClick={() => { window.location.hash = ''; }}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  backgroundColor: '#1e293b',
                  color: '#f1f5f9',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={14} />
                <span>Hồ sơ cán bộ</span>
              </button>
            </div>
          </header>

          {/* Vùng nội dung nghiệp vụ */}
          <div className="sos-page-body">
            {activeNavKey === 'map' ? (
              <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
                <SOSMap />
              </div>
            ) : (
              <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
                <DashboardViews
                  activeKey={activeNavKey}
                  onOpenMap={() => setActiveNavKey('map')}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Mặc định: Hiển thị nguyên bản trang Login
  return <LoginPage />;
}

export default App;

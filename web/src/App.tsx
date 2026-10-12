import { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import SOSMap from './components/SOSMap';
import { logoutApi } from './services/api';
import type { User } from './types/auth';
import { ShieldCheck, Radio, LogOut, ArrowLeft } from 'lucide-react';
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

function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [authUser, setAuthUser] = useState<User | null>(() => getAuthorizedUser());

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

  // Route Guard: Chỉ khi URL là #map VÀ tài khoản có quyền ADMIN hoặc LOCAL_AUTHORITY
  if (currentHash === '#map' && authUser && hasAuthorizedRole(authUser.roles)) {
    const isAdmin = authUser.roles.includes('ADMIN');

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #334155',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logoSOS.png" alt="SOS Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
              <div>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>
                  BẢN ĐỒ ĐIỀU HÀNH TÁC CHIẾN SOS
                </h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                  Trung tâm giám sát &amp; hỗ trợ ứng cứu khẩn cấp người dân
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Thẻ cán bộ / Admin đang trực ban tác chiến */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#1e293b',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #334155'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: isAdmin ? '#ef4444' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '12px'
                }}>
                  {authUser.fullName ? authUser.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>
                    {authUser.fullName}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isAdmin ? '#f87171' : '#60a5fa'
                  }}>
                    {isAdmin ? <ShieldCheck size={12} /> : <Radio size={12} />}
                    <span>{isAdmin ? 'Quản Trị Viên (ADMIN)' : 'Cán Bộ (LOCAL_AUTHORITY)'}</span>
                  </div>
                </div>
              </div>

              {/* Nút về trang tài khoản */}
              <button
                type="button"
                onClick={() => { window.location.hash = ''; }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  backgroundColor: '#1e293b',
                  color: '#f1f5f9',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={15} />
                <span>Hồ sơ tác chiến</span>
              </button>

              {/* Nút đăng xuất trực tiếp */}
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #7f1d1d',
                  backgroundColor: '#991b1b',
                  color: '#fee2e2',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>

          <SOSMap />
        </div>
      </div>
    );
  }

  // Mặc định: Hiển thị nguyên bản trang Login
  return <LoginPage />;
}

export default App;


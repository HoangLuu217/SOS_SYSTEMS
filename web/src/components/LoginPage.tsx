import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  LogOut, 
  ArrowRight 
} from 'lucide-react';

import { loginApi, logoutApi } from '../services/api';
import type { User } from '../types/auth';
import './Login.css';

export const LoginPage = () => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Restore session from localStorage if valid
  useEffect(() => {
    const savedUser = localStorage.getItem('sos_auth_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        if (hasAuthorizedRole(parsed.roles)) {
          setUser(parsed);
        } else {
          localStorage.removeItem('sos_auth_user');
        }
      } catch {
        localStorage.removeItem('sos_auth_user');
      }
    }
  }, []);

  // Strict check: Only LOCAL_AUTHORITY and ADMIN
  const hasAuthorizedRole = (roles: string[] | undefined): boolean => {
    if (!roles || !Array.isArray(roles)) return false;
    return roles.includes('ADMIN') || roles.includes('LOCAL_AUTHORITY');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!account.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setLoading(true);

    try {
      const res = await loginApi(account, password);

      if (res.success && res.data?.user) {
        const loggedInUser = res.data.user;

        // BẮT BUỘC: Kiểm tra quyền LOCAL_AUTHORITY hoặc ADMIN
        if (!hasAuthorizedRole(loggedInUser.roles)) {
          await logoutApi();
          setErrorMsg(
            `⛔ Quyền truy cập bị từ chối: Cổng này chỉ dành riêng cho Cán bộ Quản lý (LOCAL_AUTHORITY) và Quản trị viên (ADMIN). Tài khoản "${loggedInUser.fullName || account}" thuộc vai trò [${loggedInUser.roles.join(', ')}].`
          );
          setLoading(false);
          return;
        }

        // Đăng nhập hợp lệ
        setUser(loggedInUser);
        localStorage.setItem('sos_auth_user', JSON.stringify(loggedInUser));
        if (res.data.accessToken) {
          localStorage.setItem('sos_access_token', res.data.accessToken);
        }
      } else {
        setErrorMsg(res.message || 'Đăng nhập không thành công.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await logoutApi();
    localStorage.removeItem('sos_auth_user');
    localStorage.removeItem('sos_access_token');
    setUser(null);
    setAccount('');
    setPassword('');
    setErrorMsg(null);
    setLoading(false);
  };

  const fillQuickTest = (emailVal: string, passVal: string) => {
    setAccount(emailVal);
    setPassword(passVal);
    setErrorMsg(null);
  };

  return (
    <div className="sos-login-page">
      {/* Background Gradient Overlay */}
      <div className="sos-login-overlay" />

      {/* Left Form Sidebar */}
      <div className="sos-login-sidebar">
        {/* Top Brand Header: logoSOS.png + SOS CONNECT */}
        <div className="sos-brand-header">
          <img src="/logoSOS.png" alt="SOS Logo" className="sos-brand-logo-img" />
          <span className="sos-brand-name">SOS CONNECT</span>
        </div>



        {/* Central Content */}
        {user ? (
          /* LOGGED IN VIEW */
          <div className="sos-dashboard-box">
            <div className="sos-dash-user-row">
              <div className="sos-dash-avatar">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div className="sos-dash-name">{user.fullName || 'Cán bộ điều phối'}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>{user.email}</div>
                <div style={{ marginTop: '6px' }}>
                  {user.roles.includes('ADMIN') ? (
                    <span className="sos-dash-role admin">Quản Trị Viên (ADMIN)</span>
                  ) : (
                    <span className="sos-dash-role authority">Cơ Quan Chức Năng (LOCAL_AUTHORITY)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="sos-dash-info-list">
              <div>
                Trạng thái tài khoản: <strong>{user.status || 'ACTIVE'}</strong>
              </div>
              {user.authority?.position && (
                <div>
                  Chức vụ: <strong>{user.authority.position}</strong>
                </div>
              )}
              {user.authority?.department && (
                <div>
                  Đơn vị: <strong>{user.authority.department}</strong>
                </div>
              )}
              <div>
                Cổng tác chiến: <strong style={{ color: '#38bdf8' }}>Trung Tâm Điều Phối Cứu Hộ</strong>
              </div>
            </div>

            <button
              type="button"
              className="sos-btn-primary"
              style={{ marginBottom: 12 }}
              onClick={() => alert('Chuyển hướng vào hệ thống tác chiến cứu nạn...')}
            >
              <span>Vào Bảng Điều Phối Tác Chiến</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="sos-btn-google"
              onClick={handleLogout}
              disabled={loading}
            >
              <LogOut size={16} />
              <span>Đăng xuất tài khoản</span>
            </button>
          </div>
        ) : (
          /* LOGIN FORM (EXACT MATCH TO USER SCREENSHOT) */
          <div className="sos-form-body">
            <h1 className="sos-title">Đăng nhập hệ thống</h1>
            <p className="sos-subtitle">Cổng điều phối cứu hộ dành cho cơ quan chức năng</p>

            {errorMsg && (
              <div className="sos-alert error">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>{errorMsg}</div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Field: Email */}
              <div className="sos-field">
                <label className="sos-label" htmlFor="emailInput">
                  Email
                </label>
                <div className="sos-input-box">
                  <Mail size={18} className="sos-input-icon" />
                  <input
                    id="emailInput"
                    type="text"
                    className="sos-input"
                    placeholder="name@organization.gov.vn"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Field: Mật khẩu */}
              <div className="sos-field">
                <label className="sos-label" htmlFor="passwordInput">
                  Mật khẩu
                </label>
                <div className="sos-input-box">
                  <Lock size={18} className="sos-input-icon" />
                  <input
                    id="passwordInput"
                    type={showPassword ? 'text' : 'password'}
                    className="sos-input"
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="sos-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label="Toggle password"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Quên mật khẩu? */}
              <div className="sos-forgot-wrap">
                <span
                  className="sos-forgot-link"
                  onClick={() => alert('Vui lòng liên hệ Quản trị viên hệ thống để khôi phục mật khẩu công vụ.')}
                >
                  Quên mật khẩu?
                </span>
              </div>

              {/* Nút Đăng nhập */}
              <button type="submit" className="sos-btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <div className="sos-spinner" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <span>Đăng nhập</span>
                )}
              </button>

              {/* Divider: hoặc */}
              <div className="sos-divider">
                <div className="sos-divider-line" />
                <span className="sos-divider-text">hoặc</span>
                <div className="sos-divider-line" />
              </div>

              {/* Google Button */}
              <button
                type="button"
                className="sos-btn-google"
                onClick={() => alert('Tính năng đăng nhập Google dành cho tài khoản công vụ đang được kích hoạt.')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Tiếp tục với Google</span>
              </button>
            </form>

            {/* Quick Demo Test Buttons */}
            <div className="sos-test-helper">
              <div className="sos-test-helper-title">
                <span>Điền nhanh tài khoản kiểm thử:</span>
              </div>
              <div className="sos-test-buttons">
                <button
                  type="button"
                  className="sos-test-btn authority"
                  onClick={() => fillQuickTest('authority@sos.vn', 'Password@123')}
                >
                  🛡️ Cơ quan chức năng
                </button>
                <button
                  type="button"
                  className="sos-test-btn admin"
                  onClick={() => fillQuickTest('admin@sos.vn', 'Password@123')}
                >
                  ⚙️ Quản trị viên
                </button>
                <button
                  type="button"
                  className="sos-test-btn citizen"
                  onClick={() => fillQuickTest('nguyenvantest@sos.vn', 'Password@123')}
                  title="Tài khoản thường - Hệ thống sẽ chặn quyền"
                >
                  🚫 Thử chặn vai trò khác
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Footer Note */}
        <div className="sos-footer-text">
          Hệ thống hỗ trợ điều phối cứu hộ khẩn cấp
        </div>
      </div>
    </div>
  );
};

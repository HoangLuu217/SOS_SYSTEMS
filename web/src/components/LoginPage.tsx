import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  User as UserIcon, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  ArrowRight, 
  LogOut, 
  ShieldCheck, 
  Radio,
  FileText,
  X,
  CheckCircle2
} from 'lucide-react';
import { loginApi, logoutApi } from '../services/api';
import type { User } from '../types/auth';
import './Login.css';

export const LoginPage = () => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [termsModal, setTermsModal] = useState<'terms' | 'privacy' | null>(null);

  // Restore saved session or remembered password on mount
  useEffect(() => {
    // 1. Check if user already logged in
    const savedUser = localStorage.getItem('sos_auth_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        if (hasAuthorizedRole(parsed.roles)) {
          setUser(parsed);
          return;
        } else {
          localStorage.removeItem('sos_auth_user');
        }
      } catch {
        localStorage.removeItem('sos_auth_user');
      }
    }

    // 2. Check remembered credentials
    const isRemembered = localStorage.getItem('sos_remember_password') === 'true';
    if (isRemembered) {
      setRememberPassword(true);
      const savedAcc = localStorage.getItem('sos_saved_account');
      const savedPass = localStorage.getItem('sos_saved_password');
      if (savedAcc) setAccount(savedAcc);
      if (savedPass) setPassword(savedPass);
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
      setErrorMsg('Vui lòng nhập đầy đủ số điện thoại/email và mật khẩu.');
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

        // Xử lý ghi nhớ mật khẩu
        if (rememberPassword) {
          localStorage.setItem('sos_remember_password', 'true');
          localStorage.setItem('sos_saved_account', account.trim());
          localStorage.setItem('sos_saved_password', password);
        } else {
          localStorage.removeItem('sos_remember_password');
          localStorage.removeItem('sos_saved_account');
          localStorage.removeItem('sos_saved_password');
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
    if (!rememberPassword) {
      setAccount('');
      setPassword('');
    }
    setErrorMsg(null);
    setLoading(false);
  };

  return (

    <div className="sos-page-wrapper">
      {/* Background Video (Auto-looping) */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="sos-bg-video"
        poster="/backgroudWeb.jpg"
      >
        <source src="/backgroudWebv2.mp4" type="video/mp4" />
      </video>

      {/* Ambient Overlay for card contrast */}
      <div className="sos-video-overlay" />

      <div className="sos-glass-card">
        {user ? (

          /* LOGGED IN USER VIEW */
          <div className="sos-user-card">
            <div className="sos-user-avatar">
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <h2 className="sos-user-name">{user.fullName || 'Cán bộ điều hành'}</h2>
            <p className="sos-user-email">{user.email} {user.phone && `• ${user.phone}`}</p>

            <div>
              {user.roles.includes('ADMIN') ? (
                <span className="sos-user-role-badge admin">
                  <ShieldCheck size={14} /> Quản Trị Viên (ADMIN)
                </span>
              ) : (
                <span className="sos-user-role-badge authority">
                  <Radio size={14} /> Cán Bộ Chính Quyền (LOCAL_AUTHORITY)
                </span>
              )}
            </div>

            <div className="sos-user-info-box">
              <div>Trạng thái: <strong>{user.status || 'ACTIVE'}</strong></div>
              {user.authority?.position && (
                <div>Chức vụ: <strong>{user.authority.position}</strong></div>
              )}
              {user.authority?.department && (
                <div>Đơn vị: <strong>{user.authority.department}</strong></div>
              )}
              <div>Cổng điều hành: <strong style={{ color: '#0066f5' }}>Trung Tâm Tác Chiến SOS</strong></div>
            </div>

            <button
              type="button"
              className="sos-card-submit"
              style={{ marginBottom: 12 }}
              onClick={() => alert('Đang chuyển hướng vào Trung tâm tác chiến điều hành cứu nạn...')}
            >
              <span>Vào Bảng Điều Phối Tác Chiến</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="sos-btn-logout"
              onClick={handleLogout}
              disabled={loading}
            >
              <LogOut size={16} />
              <span>Đăng xuất tài khoản</span>
            </button>
          </div>
        ) : (
          /* LOGIN FORM - EXACT MATCH TO USER SCREENSHOT */
          <>
            {/* Header: Logo, Title, Subtitle */}
            <div className="sos-card-header">
              <img src="/logoSOS.png" alt="SOS Logo" className="sos-card-logo" />
              <h1 className="sos-card-title">Đăng nhập</h1>
              <p className="sos-card-subtitle">
                Cùng nhau chủ động – An toàn hơn trước thiên tai
              </p>
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="sos-card-alert error">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>{errorMsg}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="sos-card-form">
              {/* Field 1: Số điện thoại hoặc email */}
              <div className="sos-input-group">
                <UserIcon size={22} className="sos-group-icon" />
                <input
                  type="text"
                  className="sos-card-input"
                  placeholder="Số điện thoại hoặc email"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              {/* Field 2: Mật khẩu */}
              <div className="sos-input-group">
                <Lock size={22} className="sos-group-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="sos-card-input"
                  placeholder="Mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="sos-card-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <Eye size={22} /> : <EyeOff size={22} />}
                </button>
              </div>

              {/* Ghi nhớ mật khẩu */}
              <div className="sos-options-row">
                <label className="sos-remember-label">
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(e) => setRememberPassword(e.target.checked)}
                    className="sos-remember-checkbox"
                  />
                  <span>Ghi nhớ mật khẩu</span>
                </label>
              </div>

              {/* Button: Đăng nhập -> */}
              <button
                type="submit"
                className="sos-card-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="sos-btn-spinner" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              {/* Link: Quên mật khẩu? */}
              <div className="sos-forgot-center">
                <span
                  className="sos-forgot-text"
                  onClick={() => alert('Vui lòng liên hệ Quản trị viên để đặt lại mật khẩu của bạn.')}
                >
                  Quên mật khẩu?
                </span>
              </div>

              {/* Dòng điều khoản & chính sách */}
              <div className="sos-terms-divider" />
              <div className="sos-terms-box">
                <p className="sos-terms-text">
                  Bằng việc đăng nhập, bạn đồng ý tuân thủ{' '}
                  <span
                    className="sos-terms-link"
                    onClick={() => setTermsModal('terms')}
                  >
                    Điều khoản dịch vụ
                  </span>{' '}
                  &amp;{' '}
                  <span
                    className="sos-terms-link"
                    onClick={() => setTermsModal('privacy')}
                  >
                    Chính sách bảo mật
                  </span>{' '}
                  của Hệ thống Cứu nạn SOS.
                </p>
                <div className="sos-footer-secure">
                  <ShieldCheck size={14} className="sos-secure-icon" />
                  <span>Dữ liệu điều hành được mã hóa tác chiến 256-bit</span>
                </div>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Modal Điều Khoản & Chính Sách */}
      {termsModal && (
        <div className="sos-modal-backdrop" onClick={() => setTermsModal(null)}>
          <div className="sos-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sos-modal-header">
              <div className="sos-modal-title">
                <FileText size={20} color="#0066f5" />
                <span>
                  {termsModal === 'terms'
                    ? 'Điều khoản dịch vụ & Quy chuẩn tác chiến'
                    : 'Chính sách bảo mật dữ liệu cứu nạn SOS'}
                </span>
              </div>
              <button
                type="button"
                className="sos-modal-close-btn"
                onClick={() => setTermsModal(null)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sos-modal-body">
              {termsModal === 'terms' ? (
                <>
                  <h4>1. Mục đích sử dụng cổng điều hành</h4>
                  <p>
                    Cổng điều hành tác chiến SOS dành riêng cho Quản trị viên (ADMIN) và Cán bộ Chính quyền địa phương (LOCAL_AUTHORITY) thực hiện nhiệm vụ tiếp nhận, điều phối và ứng cứu khẩn cấp người dân trong thiên tai, lũ lụt.
                  </p>

                  <h4>2. Trách nhiệm của cán bộ được cấp quyền</h4>
                  <p>
                    Cán bộ chịu trách nhiệm bảo mật thông tin đăng nhập, không bàn giao tài khoản cho bên thứ ba. Mọi hành động duyệt cấp, điều động tàu thuyền, trực thăng hay cập nhật trạng thái cứu nạn đều được ghi nhận vào nhật ký hệ thống (Audit Logs).
                  </p>

                  <h4>3. Nghiêm cấm vi phạm tác chiến</h4>
                  <p>
                    Nghiêm cấm làm sai lệch dữ liệu vị trí người gặp nạn, tiết lộ thông tin cá nhân của người dân ra ngoài phạm vi cứu trợ hoặc sử dụng tài nguyên hệ thống vào mục đích phi nhân đạo.
                  </p>
                </>
              ) : (
                <>
                  <h4>1. Thu thập dữ liệu vị trí cứu nạn</h4>
                  <p>
                    Hệ thống chỉ thu thập tọa độ GPS, mức độ ngập lụt, hình ảnh khẩn cấp và danh sách người mắc kẹt nhằm phục vụ công tác điều phối lực lượng cứu hộ nhanh chóng và chính xác nhất.
                  </p>

                  <h4>2. Tiêu chuẩn mã hóa thông tin</h4>
                  <p>
                    Toàn bộ đường truyền và dữ liệu lưu trữ được mã hóa theo tiêu chuẩn cấp quân sự (AES-256 / TLS 1.3), ngăn chặn truy cập trái phép và rò rỉ dữ liệu chỉ huy.
                  </p>

                  <h4>3. Quyền hạn lưu trữ và chia sẻ</h4>
                  <p>
                    Dữ liệu được chia sẻ độc quyền giữa các lực lượng cứu nạn thực địa, đội bay trực thăng và ban chỉ đạo phòng chống thiên tai có thẩm quyền.
                  </p>
                </>
              )}
            </div>

            <div className="sos-modal-footer">
              <button
                type="button"
                className="sos-modal-btn-confirm"
                onClick={() => setTermsModal(null)}
              >
                <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                Đã hiểu và đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

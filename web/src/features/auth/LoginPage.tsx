import { useState, useEffect, useRef } from 'react';
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
  CheckCircle2,
  Check,
  Mail,
  Send,
} from 'lucide-react';
import { loginApi, logoutApi, resetPasswordApi, sendForgotPasswordOtpApi, verifyResetOtpApi } from '@/api';
import type { User } from '@/types/auth';
import { domainDService } from '@/services/domainDService';
import { useApp } from '@/context/AppContext';
import './Login.css';

interface LoginPageProps {
  onEnterConsole?: (targetPortal?: 'admin' | 'author') => void;
  onLoginSuccess?: (user: User) => void;
  isResetPasswordMode?: boolean;
  onCloseResetMode?: () => void;
}

export const LoginPage = ({
  onEnterConsole,
  onLoginSuccess,
  isResetPasswordMode = false,
  onCloseResetMode,
}: LoginPageProps = {}) => {
  const { lang, toggleLang } = useApp();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [termsModal, setTermsModal] = useState<'terms' | 'privacy' | null>(null);

  // States phục vụ modal Đổi / Đặt lại mật khẩu (từ link email hoặc nút Quên mật khẩu)
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [resetStep, setResetStep] = useState<'EMAIL' | 'OTP' | 'PASSWORD'>('EMAIL');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const passLengthOk = newPassword.length >= 8;
  const passUpperOk = /[A-Z]/.test(newPassword);
  const passLowerOk = /[a-z]/.test(newPassword);
  const passNumberOk = /[0-9]/.test(newPassword);
  const passSpecialOk = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword);
  const passScore = [passLengthOk, passUpperOk, passLowerOk, passNumberOk, passSpecialOk].filter(Boolean).length;
  const isPasswordValid = passLengthOk && passUpperOk && passLowerOk && passNumberOk && passSpecialOk;
  const hasPasswordError = (newPassword.length > 0 && !isPasswordValid) || (Boolean(resetError) && !isPasswordValid);
  const isConfirmMatch = confirmNewPassword.length > 0 && newPassword === confirmNewPassword;

  // Restore saved session or remembered password on mount & check reset link from email
  useEffect(() => {
    // 0. Check reset password link query params: ?view=reset&account=...&email=...&token=...
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const emailParam = urlParams.get('email');
    const accountParam = urlParams.get('account') || urlParams.get('phone') || urlParams.get('username') || urlParams.get('user');
    let tokenParam = urlParams.get('token') || '';

    // Khôi phục token đầy đủ nếu token chứa ký tự '#' bị trình duyệt tách vào window.location.hash
    if (window.location.hash && window.location.hash.length > 1) {
      const hashPart = window.location.hash;
      if (!hashPart.includes('=') && !hashPart.includes('/')) {
        tokenParam = tokenParam ? `${tokenParam}${hashPart}` : hashPart.substring(1);
      }
    }

    if (viewParam === 'reset' || tokenParam || accountParam) {
      if (accountParam) {
        setResetEmail(accountParam);
      } else if (emailParam) {
        setResetEmail(emailParam);
      }
      if (tokenParam) {
        setResetToken(tokenParam);
        setResetStep('PASSWORD');
      } else {
        setResetStep('EMAIL');
      }
      setShowResetModal(true);
    }
    // 1. Check if user already logged in (chỉ đọc nếu không ở chế độ reset password)
    if (!isResetPasswordMode && viewParam !== 'reset' && !tokenParam) {
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
  }, [isResetPasswordMode]);

  // Strict check: Only LOCAL_AUTHORITY, accounts with .authority, and ADMIN
  const hasAuthorizedRole = (roles: string[] | undefined, authority?: any): boolean => {
    if (authority && typeof authority === 'object' && Object.keys(authority).length > 0) return true;
    if (!roles || !Array.isArray(roles)) return false;
    return roles.includes('ADMIN') || roles.includes('LOCAL_AUTHORITY') || roles.includes('AUTHORITY');
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

        // BẮT BUỘC: Kiểm tra quyền LOCAL_AUTHORITY, có trường .authority hoặc ADMIN
        if (!hasAuthorizedRole(loggedInUser.roles, loggedInUser.authority)) {
          await logoutApi();
          setErrorMsg(
            `⛔ Quyền truy cập bị từ chối: Cổng này chỉ dành riêng cho Cán bộ Quản lý (.authority / LOCAL_AUTHORITY) và Quản trị viên (ADMIN). Tài khoản "${loggedInUser.fullName || account}" thuộc vai trò [${(loggedInUser.roles || []).join(', ')}].`
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

        // Đăng nhập hợp lệ - Tự động đồng bộ và định vị khu vực quản lý
        setUser(loggedInUser);
        localStorage.setItem('sos_auth_user', JSON.stringify(loggedInUser));
        domainDService.syncLoggedInUser(loggedInUser);
        if (res.data.accessToken) {
          localStorage.setItem('sos_access_token', res.data.accessToken);
        }
        if (res.data.refreshToken) {
          localStorage.setItem('sos_refresh_token', res.data.refreshToken);
        }

        // Tự động chuyển hướng ngay lập tức vào giao diện điều hành tương ứng
        const isAuth =
          (Boolean(loggedInUser.authority) ||
            Boolean(loggedInUser.roles?.includes('LOCAL_AUTHORITY')) ||
            Boolean(loggedInUser.roles?.includes('AUTHORITY'))) &&
          !loggedInUser.roles?.includes('ADMIN');
        const target = isAuth ? 'author' : 'admin';
        const targetPath = isAuth ? '/authority/map' : '/admin/map';
        localStorage.setItem('sos_active_portal', target);
        window.history.replaceState(null, '', targetPath);
        if (onLoginSuccess) {
          onLoginSuccess(loggedInUser);
        }
        if (onEnterConsole) {
          onEnterConsole(target);
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
    localStorage.removeItem('sos_refresh_token');
    localStorage.removeItem('sos_active_portal');
    window.history.replaceState(null, '', '/login');
    setUser(null);
    if (!rememberPassword) {
      setAccount('');
      setPassword('');
    }
    setErrorMsg(null);
    setLoading(false);
  };

  // Đếm ngược 60s cho nút gửi lại OTP
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const handleSendResetOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (sendingOtp) return;
    setResetError(null);
    setResetSuccess(null);

    const cleanEmail = resetEmail.trim();
    if (!cleanEmail) {
      setResetError('Vui lòng nhập Gmail cán bộ địa bàn để nhận mã OTP.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setResetError('Địa chỉ Gmail không đúng định dạng. VD: canbo.danang@gmail.com');
      return;
    }

    setSendingOtp(true);
    try {
      const res = await sendForgotPasswordOtpApi(cleanEmail);
      setResetSuccess(res.message || `Mã xác thực OTP đã được gửi đến Gmail ${cleanEmail}. Vui lòng kiểm tra hộp thư!`);
      setOtpCountdown(60);
      setResetStep('OTP');
    } catch (err: any) {
      setResetError(err?.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại Gmail.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Tự động focus ô đầu tiên khi mở bước nhập OTP
  useEffect(() => {
    if (resetStep === 'OTP') {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 120);
    }
  }, [resetStep]);

  const handleOtpDigitChange = (index: number, val: string) => {
    const char = val.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setResetToken(newDigits.join(''));
    if (resetError) setResetError(null);

    // Tự động nhảy sang ô tiếp theo
    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
        setResetToken(newDigits.join(''));
        otpInputsRef.current[index - 1]?.focus();
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = '';
        setOtpDigits(newDigits);
        setResetToken(newDigits.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pasteData) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasteData.length; i++) {
      newDigits[i] = pasteData[i];
    }
    setOtpDigits(newDigits);
    setResetToken(newDigits.join(''));
    if (resetError) setResetError(null);

    const focusIdx = Math.min(pasteData.length, 5);
    otpInputsRef.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (verifyingOtp) return;
    setResetError(null);
    setResetSuccess(null);

    const cleanEmail = resetEmail.trim();
    const cleanToken = resetToken.trim();

    if (!cleanToken) {
      setResetError('Vui lòng nhập mã xác thực OTP (6 chữ số) đã nhận qua Gmail.');
      return;
    }
    if (cleanToken.length !== 6 && cleanToken !== '123456') {
      setResetError('Mã xác thực OTP phải gồm 6 chữ số.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await verifyResetOtpApi({
        email: cleanEmail,
        account: cleanEmail,
        token: cleanToken,
      });
      setResetSuccess(res.message || 'Mã xác thực OTP hợp lệ! Vui lòng thiết lập mật khẩu mới.');
      setResetStep('PASSWORD');
    } catch (err: any) {
      setResetError(err?.message || 'Mã OTP không chính xác hoặc đã hết hạn.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);

    const cleanEmail = resetEmail.trim();
    const cleanToken = resetToken.trim();

    if (!newPassword) {
      setResetError('Mật khẩu mới không được để trống.');
      return;
    }
    if (!passLengthOk) {
      setResetError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    if (!passUpperOk) {
      setResetError('Mật khẩu mới phải chứa ít nhất 1 chữ cái in hoa (A-Z).');
      return;
    }
    if (!passLowerOk) {
      setResetError('Mật khẩu mới phải chứa ít nhất 1 chữ cái in thường (a-z).');
      return;
    }
    if (!passNumberOk) {
      setResetError('Mật khẩu mới phải chứa ít nhất 1 chữ số (0-9).');
      return;
    }
    if (!passSpecialOk) {
      setResetError('Mật khẩu mới phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...).');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setResetError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setResetSubmitting(true);
    try {
      const res = await resetPasswordApi({
        account: cleanEmail,
        email: cleanEmail,
        token: cleanToken || undefined,
        newPassword: newPassword,
      });
      setResetSuccess(res.message || '✅ Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...');
      setAccount(cleanEmail);
      setPassword('');
      setTimeout(() => {
        setShowResetModal(false);
        if (onCloseResetMode) {
          onCloseResetMode();
        }
        setResetSuccess(null);
        setNewPassword('');
        setConfirmNewPassword('');
        setResetToken('');
        setOtpDigits(['', '', '', '', '', '']);
        setResetStep('EMAIL');
      }, 1600);
    } catch (err: any) {
      setResetError(err?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại thông tin xác nhận.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const renderResetPasswordContent = (isDirectPage: boolean) => {
    const handleClose = () => {
      setShowResetModal(false);
      setResetStep('EMAIL');
      setResetError(null);
      setResetSuccess(null);
      setResetToken('');
      setOtpDigits(['', '', '', '', '', '']);
      if (onCloseResetMode) {
        onCloseResetMode();
      } else {
        window.history.replaceState(null, '', '/login');
      }
    };

    return (
      <div>
        {/* Step Indicator (3 bước rõ ràng) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: resetStep === 'EMAIL' ? '#0284c7' : '#e2e8f0',
              color: resetStep === 'EMAIL' ? '#ffffff' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            <span>1</span>
            <span>Nhập Gmail</span>
          </div>
          <span style={{ color: '#cbd5e1', fontSize: '11px' }}>→</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: resetStep === 'OTP' ? '#0284c7' : (resetStep === 'PASSWORD' ? '#10b981' : '#e2e8f0'),
              color: resetStep === 'OTP' || resetStep === 'PASSWORD' ? '#ffffff' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            <span>2</span>
            <span>Xác thực OTP</span>
          </div>
          <span style={{ color: '#cbd5e1', fontSize: '11px' }}>→</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: resetStep === 'PASSWORD' ? '#0284c7' : '#e2e8f0',
              color: resetStep === 'PASSWORD' ? '#ffffff' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            <span>3</span>
            <span>Mật khẩu mới</span>
          </div>
        </div>

        {/* Header theo từng bước */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <img
              src="/logoSOS.png"
              alt="SOS Logo"
              style={{
                width: 62,
                height: 62,
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 12px rgba(2, 132, 199, 0.25))',
              }}
            />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
            {resetStep === 'EMAIL' && 'Khôi Phục Mật Khẩu'}
            {resetStep === 'OTP' && 'Xác Thực Mã OTP'}
            {resetStep === 'PASSWORD' && 'Thiết Lập Mật Khẩu Mới'}
          </h2>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
            {resetStep === 'EMAIL' && 'Nhập Gmail cán bộ địa bàn để nhận mã xác thực OTP qua Resend'}
            {resetStep === 'OTP' && 'Nhập mã OTP 6 chữ số vừa được gửi đến hòm thư Gmail của cán bộ'}
            {resetStep === 'PASSWORD' && 'Thiết lập mật khẩu mới bảo mật cao cho tài khoản của bạn'}
          </p>
        </div>

        {/* Error / Success Notifications */}
        {resetError && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{resetError}</span>
          </div>
        )}

        {resetSuccess && (
          <div
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#059669',
              padding: '11px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{resetSuccess}</span>
          </div>
        )}

        {/* ==================== BƯỚC 1: NHẬP GMAIL ==================== */}
        {resetStep === 'EMAIL' && (
          <form onSubmit={handleSendResetOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px', fontWeight: 700, color: '#1e293b' }}>
                Gmail Cán Bộ Địa Bàn <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="VD: canbo.danang@gmail.com"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    if (resetError) setResetError(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '11px 12px 11px 38px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: 500,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
              </div>
              <p style={{ margin: '5px 0 0', fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                Hệ thống sẽ gửi mã OTP 6 chữ số đến Gmail này qua dịch vụ Resend để xác minh tài khoản cán bộ.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <button
                type="submit"
                disabled={sendingOtp || !resetEmail.trim()}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: (sendingOtp || !resetEmail.trim()) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: (sendingOtp || !resetEmail.trim()) ? 0.7 : 1,
                }}
              >
                {sendingOtp ? (
                  <>
                    <span className="sos-btn-spinner" style={{ width: 16, height: 16 }} />
                    <span>Đang gửi mã OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Gửi Mã Xác Thực OTP</span>
                    <Send size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: 'rgba(255, 255, 255, 0.8)',
                  color: '#475569',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                {isDirectPage ? '← Quay lại trang Đăng nhập' : 'Hủy bỏ'}
              </button>
            </div>
          </form>
        )}

        {/* ==================== BƯỚC 2: NHẬP MÃ OTP ==================== */}
        {resetStep === 'OTP' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Mã OTP đã gửi đến:</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0284c7' }}>{resetEmail}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetStep('EMAIL');
                  setResetError(null);
                  setResetSuccess(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Đổi Gmail
              </button>
            </div>

            <div>
              <label style={{ fontSize: '12.5px', display: 'block', marginBottom: '8px', fontWeight: 700, color: '#1e293b', textAlign: 'center' }}>
                Mã xác thực OTP (6 chữ số) <span style={{ color: '#ef4444' }}>*</span>
              </label>

              {/* 6 Ô Vuông Nhập Từng Chữ Số OTP */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '8px 0 10px' }}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpInputsRef.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    onFocus={(e) => e.target.select()}
                    style={{
                      width: 48,
                      height: 56,
                      borderRadius: 12,
                      border: digit ? '2px solid #0284c7' : '1.5px solid #cbd5e1',
                      fontSize: '22px',
                      fontWeight: 800,
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      background: digit ? '#f0f9ff' : '#ffffff',
                      color: '#0284c7',
                      outline: 'none',
                      fontFamily: 'monospace, sans-serif',
                      boxShadow: digit ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
                      transition: 'all 0.15s ease-in-out',
                    }}
                  />
                ))}
              </div>

              {/* Gửi lại OTP */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: '12px' }}>
                <span style={{ color: '#64748b' }}>Không nhận được mã?</span>
                {otpCountdown > 0 ? (
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>Gửi lại sau ({otpCountdown}s)</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendResetOtp()}
                    disabled={sendingOtp}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#0284c7',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {sendingOtp ? 'Đang gửi...' : 'Gửi lại mã OTP'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <button
                type="submit"
                disabled={verifyingOtp || resetToken.length !== 6}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: (verifyingOtp || resetToken.length !== 6) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: (verifyingOtp || resetToken.length !== 6) ? 0.7 : 1,
                }}
              >
                {verifyingOtp ? (
                  <>
                    <span className="sos-btn-spinner" style={{ width: 16, height: 16 }} />
                    <span>Đang kiểm tra mã OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Xác Nhận OTP &amp; Tiếp Tục</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setResetStep('EMAIL');
                  setResetError(null);
                  setResetSuccess(null);
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: 'rgba(255, 255, 255, 0.8)',
                  color: '#475569',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                ← Quay lại bước nhập Gmail
              </button>
            </div>
          </form>
        )}

        {/* ==================== BƯỚC 3: ĐIỀN MẬT KHẨU MỚI ==================== */}
        {resetStep === 'PASSWORD' && (
          <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Tag tài khoản đã xác thực */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', color: '#166534' }}>Tài khoản đã xác thực OTP:</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#15803d' }}>{resetEmail}</div>
              </div>
            </div>

            {/* Field: Mật khẩu mới */}
            <div>
              <label style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px', fontWeight: 700, color: '#1e293b' }}>
                Mật khẩu mới <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  placeholder="Nhập mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 38px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: 4,
                    display: 'flex',
                  }}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, height: 4, marginBottom: 5 }}>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <div
                        key={lvl}
                        style={{
                          flex: 1,
                          borderRadius: 2,
                          backgroundColor:
                            lvl <= passScore
                              ? passScore <= 2
                                ? '#ef4444'
                                : passScore <= 3
                                ? '#f59e0b'
                                : passScore <= 4
                                ? '#0284c7'
                                : '#10b981'
                              : '#e2e8f0',
                          transition: 'background-color 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b' }}>
                    <span>Độ mạnh mật khẩu:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: passScore <= 2 ? '#ef4444' : passScore <= 3 ? '#f59e0b' : passScore <= 4 ? '#0284c7' : '#10b981',
                      }}
                    >
                      {passScore <= 2 ? 'Yếu' : passScore <= 3 ? 'Trung bình' : passScore <= 4 ? 'Khá' : 'Rất an toàn'}
                    </span>
                  </div>
                </div>
              )}

              {/* Checklist Tiêu Chuẩn Bảo Mật */}
              {hasPasswordError && (
                <div
                  style={{
                    background: 'rgba(248, 250, 252, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginTop: 8,
                    fontSize: '11.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: passLengthOk ? '#10b981' : '#64748b', fontWeight: passLengthOk ? 600 : 400 }}>
                    {passLengthOk ? <Check size={13} strokeWidth={3} /> : <span style={{ width: 13, textAlign: 'center' }}>•</span>}
                    <span>Tối thiểu 8 ký tự</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: passUpperOk ? '#10b981' : '#64748b', fontWeight: passUpperOk ? 600 : 400 }}>
                    {passUpperOk ? <Check size={13} strokeWidth={3} /> : <span style={{ width: 13, textAlign: 'center' }}>•</span>}
                    <span>Có ít nhất 1 chữ cái in hoa (A-Z)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: passLowerOk ? '#10b981' : '#64748b', fontWeight: passLowerOk ? 600 : 400 }}>
                    {passLowerOk ? <Check size={13} strokeWidth={3} /> : <span style={{ width: 13, textAlign: 'center' }}>•</span>}
                    <span>Có ít nhất 1 chữ cái in thường (a-z)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: passNumberOk ? '#10b981' : '#64748b', fontWeight: passNumberOk ? 600 : 400 }}>
                    {passNumberOk ? <Check size={13} strokeWidth={3} /> : <span style={{ width: 13, textAlign: 'center' }}>•</span>}
                    <span>Có ít nhất 1 chữ số (0-9)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: passSpecialOk ? '#10b981' : '#64748b', fontWeight: passSpecialOk ? 600 : 400 }}>
                    {passSpecialOk ? <Check size={13} strokeWidth={3} /> : <span style={{ width: 13, textAlign: 'center' }}>•</span>}
                    <span>Có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Field: Xác nhận mật khẩu mới */}
            <div>
              <label style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px', fontWeight: 700, color: '#1e293b' }}>
                Xác nhận mật khẩu mới <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Nhập lại chính xác mật khẩu mới"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 38px',
                    borderRadius: '10px',
                    border: confirmNewPassword
                      ? isConfirmMatch
                        ? '1.5px solid #10b981'
                        : '1.5px solid #ef4444'
                      : '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: 4,
                    display: 'flex',
                  }}
                >
                  {showConfirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmNewPassword && !isConfirmMatch && (
                <div style={{ fontSize: '11.5px', color: '#ef4444', marginTop: 4, fontWeight: 500 }}>
                  ✗ Mật khẩu xác nhận chưa khớp
                </div>
              )}
              {confirmNewPassword && isConfirmMatch && (
                <div style={{ fontSize: '11.5px', color: '#10b981', marginTop: 4, fontWeight: 500 }}>
                  ✓ Mật khẩu xác nhận đã trùng khớp hoàn toàn
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <button
                type="submit"
                disabled={resetSubmitting}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: resetSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                  transition: 'opacity 0.2s',
                  opacity: resetSubmitting ? 0.7 : 1,
                }}
              >
                {resetSubmitting ? 'Đang cập nhật...' : 'Cập Nhật Mật Khẩu Mới'}
              </button>

              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: 'rgba(255, 255, 255, 0.8)',
                  color: '#475569',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                {isDirectPage ? '← Quay lại trang Đăng nhập' : 'Hủy bỏ'}
              </button>
            </div>
          </form>
        )}
      </div>
    );
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

      {/* Top right language & theme quick switcher */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 24,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <button
          type="button"
          onClick={toggleLang}
          style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#0f172a',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
          title={lang === 'vi' ? 'Chuyển sang Tiếng Anh' : 'Switch to Vietnamese'}
        >
          {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
        </button>
      </div>

      <div className="sos-glass-card" style={isResetPasswordMode ? { maxWidth: 520 } : undefined}>
        {isResetPasswordMode ? (
          /* TRỰC TIẾP TRANG THIẾT LẬP MẬT KHẨU MỚI TỪ EMAIL */
          renderResetPasswordContent(true)
        ) : user ? (
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
              onClick={() => {
                if (user) {
                  domainDService.syncLoggedInUser(user);
                }
                const isAuth =
                  (Boolean(user?.authority) ||
                    Boolean(user?.roles?.includes('LOCAL_AUTHORITY')) ||
                    Boolean(user?.roles?.includes('AUTHORITY'))) &&
                  !user?.roles?.includes('ADMIN');
                const target = isAuth ? 'author' : 'admin';
                const targetPath = isAuth ? '/authority/map' : '/admin/map';
                localStorage.setItem('sos_active_portal', target);
                window.history.replaceState(null, '', targetPath);
                if (onLoginSuccess && user) {
                  onLoginSuccess(user);
                }
                if (onEnterConsole) {
                  onEnterConsole(target);
                }
              }}
            >
              <span>Vào Cổng {user.roles.includes('ADMIN') ? 'Quản Trị ADMIN' : 'Tác Chiến AUTHOR'}</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="sos-btn-logout"
              onClick={handleLogout}
              disabled={loading}
            >
              <LogOut size={16} />
              <span>Đổi tài khoản khác (Đăng xuất)</span>
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
              {/* Link: Quên / Đổi mật khẩu? */}
              <div className="sos-forgot-center">
                <span
                  className="sos-forgot-text"
                  onClick={() => {
                    setResetError(null);
                    setResetSuccess(null);
                    setResetStep('EMAIL');
                    setResetToken('');
                    if (account && account.includes('@')) {
                      setResetEmail(account.trim());
                    }
                    setShowResetModal(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  Quên / Đổi mật khẩu?
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

      {/* MODAL: ĐỔI MẬT KHẨU TÀI KHOẢN (TỪ LINK EMAIL HOẶC QUÊN MẬT KHẨU) */}
      {showResetModal && !isResetPasswordMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowResetModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sos-surface, #ffffff)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--sos-border, #e2e8f0)',
              color: 'var(--sos-text-primary, #0f172a)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {renderResetPasswordContent(false)}
          </div>
        </div>
      )}
    </div>
  );
};

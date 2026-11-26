import React, { useState, useEffect, useRef } from 'react';
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
  MapPin,
  Siren,
  LifeBuoy,
  CloudRain,
  Home,
  PhoneCall,
  Sun,
  Moon,
  Activity,
  Layers,
  MessageSquare,
  BarChart3,
  Droplet,
  KeyRound,
  ChevronRight,
  Globe2,
  Package,
  UserCheck,
  Clock,
  LockKeyhole,
  Menu,
  CircleHelp,
  Compass,
  Sparkles,
} from 'lucide-react';
import {
  loginApi,
  logoutApi,
  resetPasswordApi,
  sendForgotPasswordOtpApi,
  verifyResetOtpApi,
} from '@/api';
import type { User } from '@/types/auth';
import { domainDService } from '@/services/domainDService';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Accordion } from '@/components/ui/accordion';
import { CustomizerPanel } from '@/kit/customizer/CustomizerPanel';
import { cn } from '@/lib/utils';
import './Login.css';

interface LoginPageProps {
  onEnterConsole?: (targetPortal?: 'admin' | 'author') => void;
  onLoginSuccess?: (user: User) => void;
  isResetPasswordMode?: boolean;
  onCloseResetMode?: () => void;
}

/* ============================================================================
   CHRONICLE FRONTIER LANDING HELPERS (ported from features/landing/section-heading.tsx)
   ============================================================================ */

function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(color-mix(in_oklch,var(--primary)_30%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent)]',
        className
      )}
    />
  );
}

function SectionHeading({
  eyebrow,
  title,
  lede,
  id,
  className,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto flex max-w-3xl flex-col items-center gap-4 text-center', className)}>
      <p className="w-fit rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
        {eyebrow}
      </p>
      <h2 id={id} className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {lede && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{lede}</p>}
    </div>
  );
}

function Section({
  id,
  className,
  labelledBy,
  children,
}: {
  id?: string;
  className?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('scroll-mt-16 py-20 sm:py-24 lg:py-28', className)}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export const LoginPage = ({
  onEnterConsole,
  onLoginSuccess,
  isResetPasswordMode = false,
  onCloseResetMode,
}: LoginPageProps = {}) => {
  const { lang, toggleLang, theme, toggleTheme } = useApp();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [termsModal, setTermsModal] = useState<'terms' | 'privacy' | null>(null);

  // Chronicle Landing UI states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States phục vụ modal Đổi / Đặt lại mật khẩu (3 bước Gmail OTP)
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
  const passScore = [passLengthOk, passUpperOk, passLowerOk, passNumberOk, passSpecialOk].filter(
    Boolean
  ).length;
  const isPasswordValid = passLengthOk && passUpperOk && passLowerOk && passNumberOk && passSpecialOk;
  const hasPasswordError =
    (newPassword.length > 0 && !isPasswordValid) || (Boolean(resetError) && !isPasswordValid);
  const isConfirmMatch = confirmNewPassword.length > 0 && newPassword === confirmNewPassword;

  // Strict RBAC check: Only LOCAL_AUTHORITY, accounts with .authority, and ADMIN
  const hasAuthorizedRole = (roles: string[] | undefined, authority?: any): boolean => {
    if (authority && typeof authority === 'object' && Object.keys(authority).length > 0) return true;
    if (!roles || !Array.isArray(roles)) return false;
    return roles.includes('ADMIN') || roles.includes('LOCAL_AUTHORITY') || roles.includes('AUTHORITY');
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLoginModal(false);
        setMobileMenuOpen(false);
        setTermsModal(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Restore saved session or remembered password on mount & check reset link from email
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const emailParam = urlParams.get('email');
    const accountParam =
      urlParams.get('account') ||
      urlParams.get('phone') ||
      urlParams.get('username') ||
      urlParams.get('user');
    let tokenParam = urlParams.get('token') || '';

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

    if (!isResetPasswordMode && viewParam !== 'reset' && !tokenParam) {
      const savedUser = localStorage.getItem('sos_auth_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser) as User;
          if (hasAuthorizedRole(parsed.roles, parsed.authority)) {
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

    const isRemembered = localStorage.getItem('sos_remember_password') === 'true';
    if (isRemembered) {
      setRememberPassword(true);
      const savedAcc = localStorage.getItem('sos_saved_account');
      const savedPass = localStorage.getItem('sos_saved_password');
      if (savedAcc) setAccount(savedAcc);
      if (savedPass) setPassword(savedPass);
    }
  }, [isResetPasswordMode]);

  const enterAuthorizedPortal = (targetUser: User) => {
    domainDService.syncLoggedInUser(targetUser);
    const isAuth =
      (Boolean(targetUser.authority) ||
        Boolean(targetUser.roles?.includes('LOCAL_AUTHORITY')) ||
        Boolean(targetUser.roles?.includes('AUTHORITY'))) &&
      !targetUser.roles?.includes('ADMIN');
    const target = isAuth ? 'author' : 'admin';
    const targetPath = isAuth ? '/authority/map' : '/admin/map';
    localStorage.setItem('sos_active_portal', target);
    window.history.replaceState(null, '', targetPath);
    if (onLoginSuccess) {
      onLoginSuccess(targetUser);
    }
    if (onEnterConsole) {
      onEnterConsole(target);
    }
  };

  const handleOpenLoginPopup = () => {
    setMobileMenuOpen(false);
    if (user) {
      enterAuthorizedPortal(user);
      return;
    }
    setErrorMsg(null);
    setShowLoginModal(true);
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

        if (!hasAuthorizedRole(loggedInUser.roles, loggedInUser.authority)) {
          await logoutApi();
          setErrorMsg(
            `⛔ Quyền truy cập bị từ chối: Cổng này chỉ dành riêng cho Cán bộ Quản lý (.authority / LOCAL_AUTHORITY) và Quản trị viên (ADMIN). Tài khoản "${loggedInUser.fullName || account}" thuộc vai trò [${(loggedInUser.roles || []).join(', ')}].`
          );
          setLoading(false);
          return;
        }

        if (rememberPassword) {
          localStorage.setItem('sos_remember_password', 'true');
          localStorage.setItem('sos_saved_account', account.trim());
          localStorage.setItem('sos_saved_password', password);
        } else {
          localStorage.removeItem('sos_remember_password');
          localStorage.removeItem('sos_saved_account');
          localStorage.removeItem('sos_saved_password');
        }

        setUser(loggedInUser);
        localStorage.setItem('sos_auth_user', JSON.stringify(loggedInUser));
        if (res.data.accessToken) {
          localStorage.setItem('sos_access_token', res.data.accessToken);
        }
        if (res.data.refreshToken) {
          localStorage.setItem('sos_refresh_token', res.data.refreshToken);
        }

        setShowLoginModal(false);
        enterAuthorizedPortal(loggedInUser);
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

  const openForgotModal = () => {
    setShowLoginModal(false);
    setResetError(null);
    setResetSuccess(null);
    setResetStep('EMAIL');
    setResetToken('');
    if (account && account.includes('@')) {
      setResetEmail(account.trim());
    }
    setShowResetModal(true);
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
      setResetSuccess(
        res.message ||
        `Mã xác thực OTP đã được gửi đến Gmail ${cleanEmail}. Vui lòng kiểm tra hộp thư!`
      );
      setOtpCountdown(60);
      setResetStep('OTP');
    } catch (err: any) {
      setResetError(err?.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại Gmail.');
    } finally {
      setSendingOtp(false);
    }
  };

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
    otpInputsRef.current[Math.min(pasteData.length, 5)]?.focus();
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
        newPassword,
      });
      setResetSuccess(res.message || 'Đặt lại mật khẩu thành công! Đang mở cổng đăng nhập...');
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
        setShowLoginModal(true);
      }, 1400);
    } catch (err: any) {
      setResetError(
        err?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại thông tin xác nhận.'
      );
    } finally {
      setResetSubmitting(false);
    }
  };

  /* --------------------------------------------------------------------------
     RESET PASSWORD (3-STEP GMAIL OTP) VIEW
     -------------------------------------------------------------------------- */
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

    const stepBadge = (active: boolean, done: boolean) =>
      cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : done
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-border bg-muted text-muted-foreground'
      );

    return (
      <div className="flex flex-col gap-5 p-6 sm:p-7">
        {/* Stepper */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className={stepBadge(resetStep === 'EMAIL', resetStep !== 'EMAIL')}>
            <span>1</span>
            <span>Gmail</span>
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className={stepBadge(resetStep === 'OTP', resetStep === 'PASSWORD')}>
            <span>2</span>
            <span>OTP</span>
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className={stepBadge(resetStep === 'PASSWORD', false)}>
            <span>3</span>
            <span>Mật khẩu mới</span>
          </span>
        </div>

        {/* Heading */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl border border-border/80 bg-white p-1.5 shadow-xs">
            <img src="/logoSOS.png" alt="Logo Cứu Hộ Cứu Nạn" className="size-full object-contain" />
          </span>
          <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {resetStep === 'EMAIL' && 'Khôi phục mật khẩu'}
            {resetStep === 'OTP' && 'Xác thực mã OTP'}
            {resetStep === 'PASSWORD' && 'Thiết lập mật khẩu mới'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {resetStep === 'EMAIL' && 'Nhập Gmail cán bộ địa bàn để nhận mã xác thực 6 chữ số'}
            {resetStep === 'OTP' && 'Nhập mã OTP vừa gửi đến hộp thư Gmail công vụ của bạn'}
            {resetStep === 'PASSWORD' && 'Cập nhật mật khẩu mới đạt chuẩn bảo mật hệ thống'}
          </p>
        </div>

        {resetError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{resetError}</span>
          </div>
        )}

        {resetSuccess && (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/15 px-3 py-2.5 text-xs text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>{resetSuccess}</span>
          </div>
        )}

        {resetStep === 'EMAIL' && (
          <form onSubmit={handleSendResetOtp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Gmail cán bộ địa bàn <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  autoFocus
                  placeholder="VD: canbo.danang@gmail.com"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    if (resetError) setResetError(null);
                  }}
                  className="h-10 pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Mã OTP 6 số sẽ được gửi tự động để xác minh danh tính cán bộ trực ban.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={sendingOtp || !resetEmail.trim()}>
              {sendingOtp ? (
                <>
                  <span className="sos-btn-spinner" />
                  <span>Đang gửi mã OTP...</span>
                </>
              ) : (
                <>
                  <span>Gửi mã xác thực OTP</span>
                  <Send className="size-4" />
                </>
              )}
            </Button>

            <Button type="button" variant="outline" className="w-full" onClick={handleClose}>
              {isDirectPage ? '← Quay lại Trang chủ' : 'Hủy bỏ'}
            </Button>
          </form>
        )}

        {resetStep === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">Mã OTP đã gửi đến:</span>
                <strong className="block truncate text-foreground">{resetEmail}</strong>
              </div>
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => {
                  setResetStep('EMAIL');
                  setResetError(null);
                  setResetSuccess(null);
                }}
              >
                Đổi Gmail
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-center text-xs font-medium text-foreground">
                Mã xác thực OTP (6 chữ số) <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-6 gap-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputsRef.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                      'h-12 w-full rounded-lg border bg-background text-center font-mono text-lg font-bold text-foreground outline-none transition-all focus:border-ring focus:ring-3 focus:ring-ring/30',
                      digit ? 'border-primary bg-primary/5' : 'border-input'
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span>Chưa nhận được mã?</span>
                {otpCountdown > 0 ? (
                  <strong className="font-mono text-foreground">Gửi lại sau ({otpCountdown}s)</strong>
                ) : (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => handleSendResetOtp()}
                    disabled={sendingOtp}
                  >
                    {sendingOtp ? 'Đang gửi...' : 'Gửi lại mã OTP'}
                  </button>
                )}
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={verifyingOtp || resetToken.length !== 6}
            >
              {verifyingOtp ? (
                <>
                  <span className="sos-btn-spinner" />
                  <span>Đang xác thực OTP...</span>
                </>
              ) : (
                <>
                  <span>Xác nhận OTP &amp; Tiếp tục</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setResetStep('EMAIL');
                setResetError(null);
                setResetSuccess(null);
              }}
            >
              ← Quay lại bước nhập Gmail
            </Button>
          </form>
        )}

        {resetStep === 'PASSWORD' && (
          <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/15 px-3 py-2 text-xs text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[11px] opacity-85">Tài khoản đã xác thực OTP:</span>
                <strong className="block truncate">{resetEmail}</strong>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Mật khẩu mới <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  placeholder="Nhập mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 pl-9 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {newPassword && (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <div
                        key={lvl}
                        className={cn(
                          'h-1.5 rounded-full transition-colors',
                          lvl <= passScore
                            ? passScore <= 2
                              ? 'bg-destructive'
                              : passScore <= 3
                                ? 'bg-warning'
                                : 'bg-success'
                            : 'bg-muted'
                        )}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Độ mạnh mật khẩu:</span>
                    <strong className="text-foreground">
                      {passScore <= 2
                        ? 'Yếu'
                        : passScore <= 3
                          ? 'Trung bình'
                          : passScore <= 4
                            ? 'Khá'
                            : 'Rất an toàn'}
                    </strong>
                  </div>
                </div>
              )}

              {hasPasswordError && (
                <div className="mt-1 grid gap-1 rounded-lg border border-border bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
                  <div className={cn('flex items-center gap-1.5', passLengthOk && 'text-success')}>
                    {passLengthOk ? <Check className="size-3" /> : <span>•</span>} Tối thiểu 8 ký tự
                  </div>
                  <div className={cn('flex items-center gap-1.5', passUpperOk && 'text-success')}>
                    {passUpperOk ? <Check className="size-3" /> : <span>•</span>} Có ít nhất 1 chữ in hoa (A-Z)
                  </div>
                  <div className={cn('flex items-center gap-1.5', passLowerOk && 'text-success')}>
                    {passLowerOk ? <Check className="size-3" /> : <span>•</span>} Có ít nhất 1 chữ thường (a-z)
                  </div>
                  <div className={cn('flex items-center gap-1.5', passNumberOk && 'text-success')}>
                    {passNumberOk ? <Check className="size-3" /> : <span>•</span>} Có ít nhất 1 chữ số (0-9)
                  </div>
                  <div className={cn('flex items-center gap-1.5', passSpecialOk && 'text-success')}>
                    {passSpecialOk ? <Check className="size-3" /> : <span>•</span>} Có ít nhất 1 ký tự đặc biệt (!@#$%...)
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Xác nhận mật khẩu mới <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="h-10 pl-9 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                >
                  {showConfirmNewPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {confirmNewPassword && (
                <small className={cn('text-[11px] font-medium', isConfirmMatch ? 'text-success' : 'text-destructive')}>
                  {isConfirmMatch
                    ? '✓ Mật khẩu xác nhận đã trùng khớp'
                    : '✗ Mật khẩu xác nhận chưa khớp'}
                </small>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={resetSubmitting}>
              {resetSubmitting ? 'Đang cập nhật...' : 'Cập nhật mật khẩu mới'}
            </Button>

            <Button type="button" variant="outline" className="w-full" onClick={handleClose}>
              {isDirectPage ? '← Quay lại Trang chủ' : 'Hủy bỏ'}
            </Button>
          </form>
        )}
      </div>
    );
  };

  /* --------------------------------------------------------------------------
     LOGIN FORM / ACTIVE SESSION FORM (RIGHT SIDE OF 2-COLUMN SPLIT POPUP)
     -------------------------------------------------------------------------- */
  const renderPortalAuthForm = () => {
    if (user) {
      const isAdminRole = Boolean(user.roles?.includes('ADMIN'));
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white',
                isAdminRole ? 'bg-destructive' : 'bg-primary'
              )}
            >
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  isAdminRole
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-primary/15 text-primary'
                )}
              >
                {isAdminRole ? (
                  <>
                    <ShieldCheck className="size-3" /> Quản Trị Viên (ADMIN)
                  </>
                ) : (
                  <>
                    <Radio className="size-3" /> Chính Quyền Địa Phương
                  </>
                )}
              </span>
              <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {user.fullName || 'Cán bộ điều hành'}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {user.email} {user.phone ? `• ${user.phone}` : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border border-border bg-background p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Trạng thái phiên</span>
              <strong className="text-success">{user.status || 'TRỰC TUYẾN'}</strong>
            </div>
            {user.authority?.position && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Chức vụ</span>
                <strong className="text-foreground">{user.authority.position}</strong>
              </div>
            )}
            {user.authority?.department && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Đơn vị</span>
                <strong className="truncate text-foreground">{user.authority.department}</strong>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-10 w-full"
              onClick={() => enterAuthorizedPortal(user)}
            >
              <span>Vào Cổng {isAdminRole ? 'Quản Trị Hệ Thống' : 'Tác Chiến Địa Phương'}</span>
              <ArrowRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleLogout}
              disabled={loading}
            >
              <LogOut className="size-4" />
              <span>Đổi tài khoản khác (Đăng xuất)</span>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Tài khoản (Email / SĐT)</label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="admin@cuuhocuunan.vn hoặc SĐT"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-foreground">Mật khẩu</label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={openForgotModal}
            >
              Quên mật khẩu?
            </button>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-10 pl-9 pr-10"
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label="Hiện hoặc ẩn mật khẩu"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={rememberPassword}
            onChange={(e) => setRememberPassword(e.target.checked)}
            className="size-3.5 rounded border-input accent-primary"
          />
          <span>Ghi nhớ đăng nhập</span>
        </label>

        <Button type="submit" size="lg" className="h-10 w-full" disabled={loading}>
          {loading ? (
            <>
              <span className="sos-btn-spinner" />
              <span>Đang xác thực...</span>
            </>
          ) : (
            <>
              <span>Đăng nhập</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <div className="flex flex-col items-center gap-2.5 pt-1 text-center text-[11.5px] text-muted-foreground">
          <p className="leading-relaxed">
            Đăng nhập đồng nghĩa tuân thủ{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setTermsModal('terms')}
            >
              Điều khoản
            </button>{' '}
            &amp;{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setTermsModal('privacy')}
            >
              Bảo mật
            </button>
            .
          </p>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-[11px] font-medium text-success">
            <ShieldCheck className="size-3.5" />
            <span>Mã hóa AES-256 • Phân quyền RBAC</span>
          </div>
        </div>
      </form>
    );
  };

  if (isResetPasswordMode) {
    return (
      <div
        className="relative isolate flex min-h-screen items-center justify-center bg-background p-4 text-foreground"
        data-theme={theme}
      >
        <DotGrid />
        <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-(--surface-shadow-raised)">
          {renderResetPasswordContent(true)}
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
     DOMAIN CONTENT FOR CHRONICLE FRONTIER SECTIONS
     -------------------------------------------------------------------------- */
  const navItems = [
    { id: 'top', label: lang === 'vi' ? 'Trang chủ' : 'Home' },
    { id: 'about', label: lang === 'vi' ? 'Giá trị' : 'About' },
    { id: 'features', label: lang === 'vi' ? 'Nghiệp vụ' : 'Modules' },
    { id: 'workflow', label: lang === 'vi' ? 'Quy trình' : 'Workflow' },
    { id: 'faq', label: lang === 'vi' ? 'Hỏi đáp' : 'FAQ' },
  ];

  const statItems = [
    {
      icon: Clock,
      value: '24/7',
      label: 'Trực chiến',
      detail: 'Giám sát SOS thời gian thực',
    },
    {
      icon: Globe2,
      value: '56+',
      label: 'Phường, xã & Hoàng Sa',
      detail: 'Phủ kín bản đồ GIS Đà Nẵng',
    },
    {
      icon: Activity,
      value: '4 Bước',
      label: 'Quy trình khép kín',
      detail: 'Tiếp nhận, xác minh, cứu hộ, sơ tán',
    },
    {
      icon: LockKeyhole,
      value: 'AES-256',
      label: 'Bảo mật công vụ',
      detail: 'Mã hóa TLS 1.3 & phân quyền RBAC',
    },
  ];

  const aboutValues = [
    {
      icon: Compass,
      title: 'Định vị chính xác',
      description: 'Quy chiếu tọa độ GPS về đúng phường/xã và mức độ khẩn cấp.',
    },
    {
      icon: Layers,
      title: 'Điều hành tập trung',
      description: 'Bản đồ, lực lượng, phương tiện và điểm trú ẩn trên một màn hình.',
    },
    {
      icon: ShieldCheck,
      title: 'Phân cấp rõ ràng',
      description: 'Tách biệt quyền ADMIN và địa phương, lưu đầy đủ nhật ký.',
    },
    {
      icon: LockKeyhole,
      title: 'An toàn dữ liệu',
      description: 'Xác thực OTP Gmail và mã hóa AES-256 bảo vệ thông tin dân cư.',
    },
  ];

  const featureRows = [
    {
      id: 'modules',
      badge: 'Bản đồ GIS & SOS',
      title: 'Giám sát và định vị SOS theo thời gian thực',
      lede: 'Hợp nhất tọa độ cầu cứu, đội cứu hộ, điểm ngập và trạm trú ẩn trên một bản đồ tốc độ cao.',
      image: '/assets/landing/command-gis.jpg',
      imageAlt: 'Trung tâm chỉ huy bản đồ GIS Cứu Hộ Cứu Nạn',
      cta: 'Mở Bản đồ SOS',
      points: [
        { icon: MapPin, title: 'Định vị GPS', desc: 'Tự động xác định xã/phường và số người gặp nạn.' },
        { icon: Siren, title: 'Ưu tiên khẩn cấp', desc: 'Phân luồng ngay các ca có trẻ nhỏ, người già.' },
        { icon: CloudRain, title: 'Lớp ngập & sạt lở', desc: 'Duyệt điểm nguy hiểm ngay trên bản đồ.' },
        { icon: Activity, title: 'Đồng bộ Socket.IO', desc: 'Cập nhật tức thì giữa chỉ huy và hiện trường.' },
      ],
    },
    {
      id: 'command-showcase',
      badge: 'Điều hành phân cấp',
      title: 'Phối hợp nhịp nhàng giữa Thành phố và Cơ sở',
      lede: 'Phân quyền RBAC chặt chẽ giúp điều động đúng địa bàn, đúng nguồn lực và minh bạch nhật ký.',
      image: '/assets/landing/coastal-storm.jpg',
      imageAlt: 'Cảnh báo bão biển và điều phối lực lượng cứu hộ',
      cta: 'Vào Cổng chỉ huy',
      points: [
        { icon: ShieldCheck, title: 'Quản trị (ADMIN)', desc: 'Điều hành toàn thành phố, thời tiết & thông báo.' },
        { icon: Radio, title: 'Địa phương', desc: 'Khóa vùng phụ trách, chủ động điều phối tại chỗ.' },
        { icon: MessageSquare, title: 'Trao đổi tác chiến', desc: 'Nhắn tin trực tiếp với đội cứu hộ hiện trường.' },
        { icon: BarChart3, title: 'Báo cáo & Nhật ký', desc: 'Lưu vết thao tác và xuất nhanh Excel.' },
      ],
    },
    {
      id: 'logistics',
      badge: 'Lực lượng & Hậu cần',
      title: 'Quản lý đội cứu hộ, phương tiện và điểm trú ẩn',
      lede: 'Duyệt tình nguyện viên, điều động xuồng máy – vật tư, theo dõi sức chứa sơ tán và hiến máu.',
      image: '/assets/landing/relief-shelter.jpg',
      imageAlt: 'Điểm trú ẩn an toàn và cứu trợ cộng đồng',
      cta: 'Quản lý Lực lượng',
      points: [
        { icon: UserCheck, title: 'Duyệt cứu hộ', desc: 'Thẩm định hồ sơ và mức sẵn sàng từng tổ đội.' },
        { icon: Package, title: 'Phương tiện & Kho', desc: 'Quản lý cano, áo phao, bộ đàm và nhu yếu phẩm.' },
        { icon: Home, title: 'Điểm trú ẩn', desc: 'Theo dõi sức chứa thực tế tại từng trạm sơ tán.' },
        { icon: Droplet, title: 'An toàn & Hiến máu', desc: 'Điểm danh an toàn và điều phối máu cấp cứu.' },
      ],
    },
  ];

  const workflowSteps = [
    {
      num: '01',
      title: 'Tiếp nhận SOS',
      desc: 'Tín hiệu kèm tọa độ GPS và số người gặp nạn hiện ngay trên bản đồ.',
    },
    {
      num: '02',
      title: 'Xác minh & Giao việc',
      desc: 'Đánh giá mức nguy hiểm và điều đội cứu hộ, phương tiện gần nhất.',
    },
    {
      num: '03',
      title: 'Ứng cứu thực địa',
      desc: 'Theo dõi lộ trình tiếp cận, hỗ trợ tiếp tế và đón bờ an toàn.',
    },
    {
      num: '04',
      title: 'Sơ tán & Tổng hợp',
      desc: 'Cập nhật sức chứa trú ẩn, đóng ca cứu nạn và xuất báo cáo.',
    },
  ];

  const faqItems = [
    {
      value: 'q1',
      question: 'Ai được cấp tài khoản đăng nhập hệ thống?',
      answer:
        'Cổng web dành cho Quản trị viên cấp Thành phố (ADMIN) và Cán bộ Chính quyền địa phương (LOCAL_AUTHORITY) đã được cấp quyền.',
    },
    {
      value: 'q2',
      question: 'Tín hiệu SOS cập nhật lên bản đồ nhanh cỡ nào?',
      answer:
        'Hệ thống đồng bộ tức thì qua Socket.IO. Khi người dân gửi SOS từ ứng dụng, tọa độ và cảnh báo xuất hiện ngay lập tức.',
    },
    {
      value: 'q3',
      question: 'ADMIN và LOCAL_AUTHORITY khác nhau điểm nào?',
      answer:
        'ADMIN quản lý toàn thành phố, thời tiết, địa bàn và thông báo khẩn. LOCAL_AUTHORITY tập trung điều phối SOS, đội cứu hộ, kho và trú ẩn tại địa bàn được giao.',
    },
    {
      value: 'q4',
      question: 'Quên mật khẩu thì khôi phục như thế nào?',
      answer:
        'Chọn "Quên mật khẩu?" trong khung Đăng nhập, nhập Gmail công vụ để nhận mã OTP 6 số và đặt mật khẩu mới.',
    },
    {
      value: 'q5',
      question: 'Hệ thống có chế độ tối cho ca trực đêm không?',
      answer:
        'Có. Cán bộ có thể đổi Sáng/Tối, 9 bộ màu, cỡ chữ và bố cục (Thanh bên / Thanh trên) ngay từ nút Tùy biến trên thanh công cụ.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-theme={theme}>
      {/* =====================================================================
          1. CHRONICLE STICKY BLUR NAVBAR (SINGLE LINE, COMPACT, NO LOGIN TAB)
          ===================================================================== */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-white p-1 shadow-xs">
              <img
                src="/logoSOS.png"
                alt="Logo Cứu Hộ Cứu Nạn"
                className="size-full object-contain"
              />
            </span>
            <span className="font-heading text-sm font-bold tracking-tight text-foreground sm:text-[15px]">
              Cứu Hộ Cứu Nạn
            </span>
          </a>

          <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            <span
              title="Đường dây nóng cứu hộ khẩn cấp"
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 font-mono text-xs font-semibold text-destructive sm:inline-flex"
            >
              <PhoneCall className="size-3.5" />
              <span>112 • 114</span>
            </span>

            {/* Shared Kit Customizer Popover (same 9 OKLCH presets as Dashboard!) */}
            <CustomizerPanel showLayoutControls={false} />

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Chuyển sang giao diện Tối' : 'Chuyển sang giao diện Sáng'}
              aria-label="Đổi chế độ Sáng/Tối"
            >
              {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              title="Chuyển đổi ngôn ngữ"
              className="hidden px-2 font-mono text-xs sm:inline-flex"
            >
              {lang === 'vi' ? 'VI' : 'EN'}
            </Button>

            <Button
              type="button"
              onClick={handleOpenLoginPopup}
              className="whitespace-nowrap px-3.5"
            >
              <KeyRound className="size-3.5" />
              <span>{user ? 'Vào hệ thống' : 'Đăng nhập'}</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Mở menu điều hướng"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-xs flex-col border-l border-border bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-white p-1 shadow-xs">
                  <img src="/logoSOS.png" alt="Logo" className="size-full object-contain" />
                </span>
                <span className="font-heading text-sm font-bold">Cứu Hộ Cứu Nạn</span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
              >
                <X className="size-4" />
              </Button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <Separator />
            <div className="flex flex-col gap-2 p-4">
              <Button size="lg" className="w-full" onClick={handleOpenLoginPopup}>
                <KeyRound className="size-4" />
                <span>{user ? 'Vào hệ thống' : 'Đăng nhập hệ thống'}</span>
              </Button>
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <span>Đường dây nóng khẩn cấp</span>
                <strong className="font-mono text-destructive">112 • 114 • 115</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. CHRONICLE FRONTIER HERO (DOTGRID + EDITORIAL HEADLINE + GLOW FRAME)
          ===================================================================== */}
      <section
        id="top"
        className="relative isolate overflow-hidden pt-16 pb-16 sm:pt-24 sm:pb-24"
      >
        <DotGrid />

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 sm:text-sm"
            >
              <Sparkles className="size-3.5" aria-hidden />
              <span>Cứu Hộ Cứu Nạn • Trực chiến 24/7</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </button>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Cảnh báo sớm,{' '}
              <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                ứng cứu thần tốc
              </span>{' '}
              trước bão lũ
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-xl">
              Kết nối Ban Chỉ Huy, đội cứu hộ và người dân trên một bản đồ GIS hợp nhất.
            </p>

            <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="h-11 px-6 text-base"
                onClick={handleOpenLoginPopup}
              >
                <KeyRound className="size-4" />
                <span>{user ? 'Vào hệ thống' : 'Đăng nhập'}</span>
                <ArrowRight className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11 bg-background px-6 text-base"
                onClick={() => scrollToSection('features')}
              >
                <Layers className="size-4" />
                <span>Xem nghiệp vụ</span>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
              Dành cho Quản trị viên (ADMIN) &amp; Chính quyền cơ sở (LOCAL_AUTHORITY).
            </p>
          </div>

          {/* Framed Showcase with Chronicle Cobalt Glow Halo (matches features/landing/hero.tsx) */}
          <div className="relative mx-auto mt-16 max-w-6xl sm:mt-20">
            <div
              aria-hidden
              className="absolute -top-8 left-1/2 -z-10 h-40 w-[85%] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl lg:h-72"
            />
            <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-card p-1.5 shadow-(--surface-shadow-raised) ring-4 ring-primary/5 sm:rounded-2xl sm:p-2">
              {/* Browser Chrome Strip */}
              <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/50 px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-destructive/70" />
                  <span className="size-2.5 rounded-full bg-warning/75" />
                  <span className="size-2.5 rounded-full bg-success/75" />
                </div>
                <div className="hidden items-center gap-1.5 rounded-md border border-border bg-background/80 px-3 py-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">
                  <ShieldCheck className="size-3 text-primary" />
                  <span>cuuhocuunan.vn • Bản đồ GIS</span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Trực tuyến
                </span>
              </div>

              {/* Hero Media */}
              <div className="relative overflow-hidden rounded-b-lg sm:rounded-b-xl">
                <img
                  src="/assets/landing/hero-rescue.jpg"
                  alt="Lực lượng Cứu Hộ Cứu Nạn triển khai xuồng máy ứng cứu vùng ngập lụt"
                  className="aspect-16/9 w-full object-cover sm:aspect-21/10"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent via-background/60 to-background sm:h-44"
                />
                <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2 sm:inset-x-5 sm:bottom-4 lg:grid-cols-4">
                  {[
                    { icon: Globe2, label: 'GIS 56+ xã/phường' },
                    { icon: Siren, label: 'SOS tức thì' },
                    { icon: LifeBuoy, label: 'Điều phối lực lượng' },
                    { icon: Home, label: 'Điểm trú ẩn' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-3 py-2 text-xs font-medium text-foreground shadow-xs backdrop-blur-md"
                    >
                      <item.icon className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. CHRONICLE 4-CARD STATS BAND (features/landing/stats.tsx)
          ===================================================================== */}
      <section aria-label="Chỉ số vận hành Cứu Hộ Cứu Nạn" className="bg-muted/50 py-16 sm:py-20">
        <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-4 px-4 sm:gap-6 sm:px-6 lg:grid-cols-4 lg:px-8">
          {statItems.map((stat) => (
            <li
              key={stat.label}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-8 text-center shadow-(--surface-shadow) sm:py-10"
            >
              <span className="order-1 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <stat.icon className="size-5" aria-hidden />
              </span>
              <p className="order-2 font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {stat.value}
              </p>
              <p className="order-3 flex flex-col gap-0.5">
                <span className="font-semibold text-foreground">{stat.label}</span>
                <span className="text-xs text-muted-foreground sm:text-sm">{stat.detail}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* =====================================================================
          4. CHRONICLE ABOUT / VALUES WITH RADIAL DOT MEDALLIONS (features/landing/about.tsx)
          ===================================================================== */}
      <Section id="about" labelledBy="about-title">
        <SectionHeading
          id="about-title"
          eyebrow="Giá trị cốt lõi"
          title="Nhanh và chính xác trong từng phút ứng cứu"
          lede="Hội tụ tín hiệu SOS, lực lượng và lệnh điều động trên cùng một màn hình chỉ huy."
        />

        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {aboutValues.map((value) => (
            <li
              key={value.title}
              className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-9 text-center shadow-(--surface-shadow)"
            >
              <span className="relative flex size-20 items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-0 [background-image:radial-gradient(color-mix(in_oklch,var(--primary)_35%,transparent)_1px,transparent_1px)] [background-size:8px_8px] [mask-image:radial-gradient(circle,black,transparent_70%)]"
                />
                <span className="relative flex size-11 items-center justify-center rounded-xl border border-primary/15 bg-background text-primary shadow-(--surface-shadow)">
                  <value.icon className="size-5" aria-hidden />
                </span>
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {value.title}
              </h3>
              <p className="text-sm text-pretty text-muted-foreground">{value.description}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* =====================================================================
          5. CHRONICLE ALTERNATING 2-COLUMN FEATURES (features/landing/features.tsx)
          ===================================================================== */}
      <Section id="features" className="bg-muted/50" labelledBy="features-title">
        <SectionHeading
          id="features-title"
          eyebrow="Nghiệp vụ"
          title="Trọn chu trình phòng chống thiên tai"
          lede="Từ cảnh báo sớm, điều phối cứu nạn đến sơ tán và an sinh sau bão lũ."
        />

        <div className="mt-16 flex flex-col gap-20 sm:mt-20 lg:gap-28">
          {featureRows.map((row, index) => (
            <div
              key={row.id}
              id={row.id}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <figure className={cn('relative', index % 2 === 1 && 'lg:order-2')}>
                <div
                  aria-hidden
                  className="absolute inset-x-6 -bottom-3 h-full rounded-2xl border border-primary/10 bg-primary/5"
                />
                <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-1.5 shadow-(--surface-shadow-raised)">
                  <img
                    src={row.image}
                    alt={row.imageAlt}
                    loading="lazy"
                    className="aspect-16/10 w-full rounded-xl object-cover"
                  />
                </div>
              </figure>

              <div className="flex flex-col gap-6">
                <span className="w-fit rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  {row.badge}
                </span>
                <h3 className="font-heading text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                  {row.title}
                </h3>
                <p className="text-base text-pretty text-muted-foreground sm:text-lg">{row.lede}</p>

                <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {row.points.map((pt) => (
                    <li key={pt.title} className="flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <pt.icon className="size-4" aria-hidden />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <h4 className="text-sm font-semibold text-foreground">{pt.title}</h4>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                          {pt.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-3 pt-1">
                  <Button type="button" onClick={handleOpenLoginPopup} className="px-4">
                    <span>{row.cta}</span>
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background px-4"
                    onClick={() => scrollToSection('workflow')}
                  >
                    Xem quy trình
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* =====================================================================
          6. OPERATIONAL WORKFLOW (4 CLEAN STEPS)
          ===================================================================== */}
      <Section id="workflow" labelledBy="workflow-title">
        <SectionHeading
          id="workflow-title"
          eyebrow="Quy trình"
          title="4 bước xử lý SOS chuẩn hóa"
          lede="Mỗi bước được ghi nhận mốc thời gian và đồng bộ tức thì lên Ban chỉ huy."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step) => (
            <div
              key={step.num}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-(--surface-shadow) transition-all hover:border-primary/30 hover:shadow-(--surface-shadow-raised)"
            >
              <span className="w-fit rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">
                {step.num}
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* =====================================================================
          7. CHRONICLE INTERACTIVE FAQ ACCORDION (features/landing/faq.tsx)
          ===================================================================== */}
      <Section id="faq" className="bg-muted/50" labelledBy="faq-title">
        <SectionHeading
          id="faq-title"
          eyebrow="Hỏi đáp"
          title="Câu hỏi thường gặp"
          lede="Thông tin nhanh về quyền truy cập và cách vận hành hệ thống."
        />

        <Accordion
          className="mx-auto mt-14 max-w-3xl"
          defaultValue="q1"
          items={faqItems.map((item) => ({
            value: item.value,
            trigger: (
              <>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CircleHelp className="size-4" aria-hidden />
                </span>
                <span>{item.question}</span>
              </>
            ),
            children: item.answer,
          }))}
        />
      </Section>

      {/* =====================================================================
          8. CHRONICLE DOTGRID CTA SECTION (features/landing/cta.tsx)
          ===================================================================== */}
      <section
        aria-labelledby="cta-title"
        className="relative isolate overflow-hidden py-24 sm:py-28"
      >
        <DotGrid className="[mask-image:radial-gradient(ellipse_50%_60%_at_50%_50%,black,transparent)]" />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
          <h2
            id="cta-title"
            className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Vào Trung tâm{' '}
            <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Cứu Hộ Cứu Nạn
            </span>
          </h2>
          <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            Dành cho Quản trị viên (ADMIN) và Chính quyền cơ sở (LOCAL_AUTHORITY).
          </p>
          <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="h-11 px-6 text-base"
              onClick={handleOpenLoginPopup}
            >
              <KeyRound className="size-4" />
              <span>{user ? 'Vào hệ thống' : 'Đăng nhập'}</span>
              <ArrowRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 bg-background px-6 text-base"
              onClick={() => setTermsModal('terms')}
            >
              <FileText className="size-4" />
              <span>Quy chuẩn</span>
            </Button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          9. CHRONICLE THEME-AWARE FOOTER (features/landing/footer.tsx)
          ===================================================================== */}
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div className="flex max-w-sm flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-white p-1 shadow-xs">
                  <img src="/logoSOS.png" alt="Logo Cứu Hộ Cứu Nạn" className="size-full object-contain" />
                </span>
                <span className="font-heading text-base font-bold text-foreground">
                  Cứu Hộ Cứu Nạn
                </span>
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                Nền tảng Phòng chống thiên tai &amp; Tìm kiếm cứu nạn kết nối Ban Chỉ Huy, lực lượng
                cứu hộ và cộng đồng.
              </p>
              <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1 font-mono text-xs font-semibold text-destructive">
                <PhoneCall className="size-3.5" />
                Khẩn cấp: 112 • 114 • 115
              </span>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">Điều hành</h3>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('modules')}>
                      Bản đồ SOS
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('modules')}>
                      Điều phối SOS
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('logistics')}>
                      Đội cứu hộ &amp; Kho
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('command-showcase')}>
                      Trao đổi tác chiến
                    </button>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">Cộng đồng</h3>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('modules')}>
                      Thời tiết
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('logistics')}>
                      Điểm trú ẩn
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('logistics')}>
                      An toàn &amp; Hiến máu
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => scrollToSection('faq')}>
                      Hỏi đáp (FAQ)
                    </button>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">Tài khoản</h3>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={handleOpenLoginPopup}>
                      Đăng nhập
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={openForgotModal}>
                      Quên mật khẩu
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => setTermsModal('terms')}>
                      Điều khoản
                    </button>
                  </li>
                  <li>
                    <button type="button" className="hover:text-foreground" onClick={() => setTermsModal('privacy')}>
                      Bảo mật
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Hệ Thống Cứu Hộ Cứu Nạn. Bảo lưu mọi quyền.</p>
            <p>Chủ Động Phòng Chống Thiên Tai • Tìm Kiếm Cứu Nạn</p>
          </div>
        </div>
      </footer>

      {/* =====================================================================
          POPUP ĐĂNG NHẬP 2 CỘT CHUẨN CHRONICLE AUTH PANEL + ẢNH MẪU
          ===================================================================== */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowLoginModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Đăng nhập Hệ thống Cứu Hộ Cứu Nạn"
            className="ch-modal-animate relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3 z-20 rounded-full bg-card/85 backdrop-blur-xs hover:bg-muted"
              onClick={() => setShowLoginModal(false)}
              aria-label="Đóng hộp thoại đăng nhập"
            >
              <X className="size-4" />
            </Button>

            <div className="grid md:grid-cols-2">
              {/* Cột trái: Dark Coastal Auth Panel */}
              <div
                className="relative hidden flex-col justify-between overflow-hidden bg-auth-panel bg-cover bg-center p-8 text-auth-panel-foreground md:flex"
                style={{ backgroundImage: `url('/assets/landing/coastal-storm.jpg')` }}
              >
                <div className="absolute inset-0 bg-linear-to-b from-slate-950/75 via-slate-950/70 to-slate-950/92" />
                <div className="relative z-10 flex flex-col gap-4">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-xs">
                    <ShieldCheck className="size-3.5" />
                    XÁC THỰC CÔNG VỤ
                  </span>
                  <h2 className="font-heading text-2xl font-bold leading-snug text-white">
                    Cứu Hộ Cứu Nạn
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-200/90">
                    Đăng nhập bằng tài khoản được cấp để vào bảng điều khiển theo phân quyền.
                  </p>
                </div>

                <div className="relative z-10 mt-8 flex flex-col gap-3">
                  <div className="rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md">
                    <strong className="block text-sm font-semibold text-white">
                      Quản trị viên (ADMIN)
                    </strong>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-200/85">
                      Điều hành toàn thành phố, thời tiết, địa bàn &amp; thông báo khẩn
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md">
                    <strong className="block text-sm font-semibold text-white">
                      Chính quyền cơ sở (LOCAL_AUTHORITY)
                    </strong>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-200/85">
                      Điều phối SOS, đội cứu hộ, kho vật tư, trú ẩn &amp; điểm nguy hiểm
                    </span>
                  </div>
                </div>
              </div>

              {/* Cột phải: Form Đăng nhập chuẩn shadcn/ui */}
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <div className="mb-6 flex flex-col items-center gap-2 text-center">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-border/80 bg-white p-1.5 shadow-xs">
                    <img
                      src="/logoSOS.png"
                      alt="Logo Cứu Hộ Cứu Nạn"
                      className="size-full object-contain"
                    />
                  </span>
                  <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
                    {user ? 'Phiên đăng nhập đang hoạt động' : 'Đăng nhập hệ thống'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Cùng nhau chủ động – An toàn hơn trước thiên tai
                  </p>
                </div>
                {renderPortalAuthForm()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: RESET PASSWORD (3-STEP OTP)
          ===================================================================== */}
      {showResetModal && !isResetPasswordMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowResetModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Khôi phục mật khẩu"
            className="ch-modal-animate relative w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3"
              onClick={() => setShowResetModal(false)}
              aria-label="Đóng"
            >
              <X className="size-4" />
            </Button>
            {renderResetPasswordContent(false)}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: ĐIỀU KHOẢN & CHÍNH SÁCH BẢO MẬT
          ===================================================================== */}
      {termsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setTermsModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="ch-modal-animate flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-primary" />
                <span>
                  {termsModal === 'terms'
                    ? 'Điều khoản dịch vụ & Quy chuẩn tác chiến'
                    : 'Chính sách bảo mật dữ liệu Cứu Hộ Cứu Nạn'}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setTermsModal(null)}
                aria-label="Đóng"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-muted-foreground">
              {termsModal === 'terms' ? (
                <>
                  <h4 className="font-semibold text-foreground">1. Mục đích sử dụng cổng điều hành</h4>
                  <p>
                    Cổng điều hành tác chiến Cứu Hộ Cứu Nạn dành riêng cho Quản trị viên (ADMIN) và
                    Cán bộ Chính quyền địa phương (LOCAL_AUTHORITY) thực hiện nhiệm vụ tiếp nhận,
                    điều phối và ứng cứu khẩn cấp người dân trong thiên tai, lũ lụt.
                  </p>
                  <h4 className="font-semibold text-foreground">2. Trách nhiệm của cán bộ được cấp quyền</h4>
                  <p>
                    Cán bộ chịu trách nhiệm bảo mật thông tin đăng nhập, không bàn giao tài khoản cho
                    bên thứ ba. Mọi hành động duyệt cấp, điều động tàu thuyền hay cập nhật trạng thái
                    cứu nạn đều được ghi nhận vào nhật ký hệ thống (Audit Logs).
                  </p>
                  <h4 className="font-semibold text-foreground">3. Nghiêm cấm vi phạm tác chiến</h4>
                  <p>
                    Nghiêm cấm làm sai lệch dữ liệu vị trí người gặp nạn, tiết lộ thông tin cá nhân
                    của người dân ra ngoài phạm vi cứu trợ hoặc sử dụng tài nguyên hệ thống vào mục
                    đích phi nhân đạo.
                  </p>
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-foreground">1. Thu thập dữ liệu vị trí cứu nạn</h4>
                  <p>
                    Hệ thống chỉ thu thập tọa độ GPS, mức độ ngập lụt, hình ảnh khẩn cấp và danh sách
                    người mắc kẹt nhằm phục vụ công tác điều phối lực lượng cứu hộ nhanh chóng và
                    chính xác nhất.
                  </p>
                  <h4 className="font-semibold text-foreground">2. Tiêu chuẩn mã hóa thông tin</h4>
                  <p>
                    Toàn bộ đường truyền và dữ liệu lưu trữ được mã hóa theo tiêu chuẩn AES-256 / TLS
                    1.3, ngăn chặn truy cập trái phép và rò rỉ dữ liệu chỉ huy.
                  </p>
                  <h4 className="font-semibold text-foreground">3. Quyền hạn lưu trữ và chia sẻ</h4>
                  <p>
                    Dữ liệu được chia sẻ độc quyền giữa các lực lượng cứu nạn thực địa và ban chỉ đạo
                    phòng chống thiên tai có thẩm quyền.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-border bg-muted/40 px-5 py-3">
              <Button type="button" onClick={() => setTermsModal(null)}>
                <CheckCircle2 className="size-4" />
                <span>Đã hiểu và đồng ý</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

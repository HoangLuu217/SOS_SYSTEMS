import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react';
import type { User } from '@/types/auth';
import { changeUserPassword } from '@/api';
import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/kit/ui-patterns';
import {
  FIT_HERO,
  IconTile,
  SETTINGS_PAGE,
  SettingsCard,
  SettingsHero,
  StrengthMeter,
} from '@/kit/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';

const MIN_PASSWORD = 8;

const detectCurrentDevice = (): string => {
  if (typeof navigator === 'undefined') return 'Trình duyệt web';
  const ua = navigator.userAgent || '';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua)
      ? 'macOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad/i.test(ua)
          ? 'iOS'
          : 'Linux';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Trình duyệt';
  return `${os} · ${browser}`;
};

const getInitials = (name: string): string => {
  const parts = name
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export interface AccountSectionTabProps {
  user?: User;
  onLogout?: () => void;
  onGoToProfile?: () => void;
}

export const AccountSectionTab: React.FC<AccountSectionTabProps> = ({
  user,
  onLogout,
  onGoToProfile,
}) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const displayName = (user?.fullName || (isAdmin ? 'Quản trị viên' : 'Cán bộ điều phối'))
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  const displayEmail = user?.email || '';
  const isPhoneVerified = Boolean(user?.isPhoneVerified || user?.isVerified);
  const managedScope = isAdmin
    ? 'Toàn TP. Đà Nẵng & Hoàng Sa'
    : user?.authority?.areaName || 'Địa bàn cơ sở';

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const clientPasswordValidation = useMemo(() => {
    if (newPassword && newPassword.length < MIN_PASSWORD) {
      return `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự.`;
    }
    if (confirmPassword && confirmPassword !== newPassword) {
      return 'Mật khẩu xác nhận không khớp.';
    }
    return null;
  }, [newPassword, confirmPassword]);

  const checks = useMemo(
    () => [
      {
        label: 'Xác thực số điện thoại',
        ok: isPhoneVerified,
        detail: isPhoneVerified ? 'Đã xác thực OTP' : 'Chưa xác thực',
      },
      {
        label: 'Email khôi phục',
        ok: Boolean(displayEmail),
        detail: displayEmail || 'Chưa cập nhật email',
      },
      {
        label: 'Phân quyền truy cập',
        ok: true,
        detail: isAdmin ? 'Quản trị hệ thống' : managedScope,
      },
    ],
    [displayEmail, isAdmin, isPhoneVerified, managedScope]
  );

  const passed = checks.filter((c) => c.ok).length;
  const deviceLabel = useMemo(() => detectCurrentDevice(), []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!oldPassword.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < MIN_PASSWORD) {
      setPasswordError(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await changeUserPassword({ oldPassword, newPassword });
      if (res.success) {
        const msg = res.message || 'Đổi mật khẩu thành công.';
        setPasswordSuccess(msg);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast.success(msg);
      } else {
        setPasswordError(res.message || 'Không thể đổi mật khẩu.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Lỗi khi đổi mật khẩu.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className={SETTINGS_PAGE}>
      {/* Security Checkup Hero — exact mirror of shadcn-ref AccountPage */}
      <SettingsHero
        className={FIT_HERO}
        aside={
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Kiểm tra bảo mật</span>
              <span className="font-mono text-sm tabular-nums">
                <span className="text-lg font-semibold text-foreground">{passed}</span>
                <span className="text-muted-foreground"> / {checks.length}</span>
              </span>
            </div>

            <div className="flex gap-1" aria-hidden>
              {checks.map((check, index) => (
                <span
                  key={check.label}
                  className={cn(
                    'h-2 flex-1 rounded-full transition-colors duration-200',
                    index < passed
                      ? passed === checks.length
                        ? 'bg-success'
                        : 'bg-warning'
                      : 'bg-muted'
                  )}
                />
              ))}
            </div>

            <ul className="grid grid-cols-1 gap-2">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 shadow-(--surface-shadow) ring-1 ring-foreground/5"
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                      check.ok
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/20 text-warning-foreground dark:text-warning'
                    )}
                  >
                    {check.ok ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      <AlertTriangle className="size-3.5" />
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-foreground">
                    {check.label}
                  </span>
                  <span className="ms-auto truncate text-xs text-muted-foreground">
                    {check.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        }
      >
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-chart-2 text-lg font-semibold text-primary-foreground ring-4 ring-primary/10 select-none">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="size-full object-cover"
                />
              ) : (
                getInitials(displayName)
              )}
            </span>
            <span
              className="absolute -end-0.5 -bottom-0.5 size-4 rounded-full bg-success ring-3 ring-card"
              title="Trực tuyến"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-semibold text-foreground">{displayName}</span>
            <span className="truncate text-sm text-muted-foreground">
              {displayEmail || 'Chưa có email'}
            </span>
            <StatusBadge tone="neutral" dot={false} className="mt-1.5 w-fit gap-1">
              <ShieldCheck className="size-3" />
              {isAdmin ? 'Quản trị viên' : 'Chính quyền cơ sở'}
            </StatusBadge>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Giữ mật khẩu mạnh và xác thực số điện thoại trực ban để bảo vệ tài khoản điều phối cứu hộ.
        </p>

        {!isPhoneVerified && onGoToProfile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={onGoToProfile}
          >
            Xác thực SĐT ngay
          </Button>
        )}
      </SettingsHero>

      {/* Change Password Card */}
      <SettingsCard
        icon={KeyRound}
        title="Đổi mật khẩu"
        description={`Tối thiểu ${MIN_PASSWORD} ký tự, nên kết hợp chữ hoa, chữ thường và số.`}
        footer={
          <Button
            type="submit"
            form="sos-profile-password-form"
            disabled={
              changingPassword ||
              !oldPassword ||
              !newPassword ||
              !confirmPassword ||
              Boolean(clientPasswordValidation)
            }
          >
            {changingPassword && <Loader2 className="size-3.5 animate-spin" />}
            Đổi mật khẩu
          </Button>
        }
      >
        <form
          id="sos-profile-password-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => void handleChangePassword(e)}
        >
          <div className="grid grid-cols-1 gap-4 @2xl/settings:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="current-password" className="text-sm font-medium text-foreground">
                Mật khẩu hiện tại
              </label>
              <Input
                id="current-password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder="Nhập mật khẩu cũ"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                Mật khẩu mới
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  aria-describedby="password-strength"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder={`Ít nhất ${MIN_PASSWORD} ký tự`}
                  className="pe-9"
                />
                <button
                  type="button"
                  onClick={() => setReveal((prev) => !prev)}
                  aria-label={reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Nhập lại mật khẩu mới
              </label>
              <Input
                id="confirm-password"
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder="Xác nhận mật khẩu mới"
              />
            </div>
          </div>

          <StrengthMeter id="password-strength" password={newPassword} minimum={MIN_PASSWORD} />

          {(clientPasswordValidation || passwordError) && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              {clientPasswordValidation || passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3.5 shrink-0" />
              {passwordSuccess}
            </p>
          )}
        </form>
      </SettingsCard>

      {/* Active Session Card */}
      <SettingsCard
        icon={MonitorSmartphone}
        tone="two"
        title="Phiên đăng nhập"
        description="Quản lý phiên làm việc hiện tại trên thiết bị này."
        footer={
          onLogout ? (
            <Button type="button" variant="destructive" onClick={onLogout}>
              <LogOut className="size-4" />
              Đăng xuất phiên này
            </Button>
          ) : undefined
        }
      >
        <ul className="flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <IconTile icon={Laptop} tone="lead" size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {deviceLabel}
                <StatusBadge tone="success">Thiết bị này</StatusBadge>
              </span>
              <span className="text-xs text-muted-foreground">
                {managedScope} · Đang hoạt động
              </span>
            </div>
          </li>
        </ul>
      </SettingsCard>
    </div>
  );
};

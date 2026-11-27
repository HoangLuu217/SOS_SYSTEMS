import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Globe2,
  KeyRound,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import type { User } from '@/types/auth';
import {
  sendPhoneOtp,
  updateUserAvatar,
  updateUserProfile,
  verifyPhoneOtp,
} from '@/api';
import { OfficeMapPicker } from '@/components/common/OfficeMapPicker';
import { getAreaCoordinates } from '@/features/authorities/AreaPreviewMap';
import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/kit/ui-patterns';
import {
  FIT_HERO,
  SETTINGS_PAGE,
  SaveBar,
  SettingsCard,
  SettingsHero,
} from '@/kit/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';

export interface ProfileFormState {
  fullName: string;
  position: string;
  organizationName: string;
  phone: string;
  email: string;
  managedArea: string;
  avatarUrl: string;
  mapUrl: string;
  latitude: number | null;
  longitude: number | null;
  officeAddress: string;
}

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

const normalizePosition = (isAdmin: boolean, pos?: string | null): string => {
  if (isAdmin) return pos || 'Quản trị viên hệ thống';
  if (!pos || /phó\s*trưởng|trưởng\s*ban|cán\s*bộ/i.test(pos)) return 'Chỉ huy khu vực';
  return pos;
};

const buildInitialProfile = (user: User | undefined, isAdmin: boolean): ProfileFormState => {
  const areaName = isAdmin
    ? 'Toàn TP. Đà Nẵng & Hoàng Sa'
    : user?.authority?.areaName ||
      (user?.authority?.department
        ? user.authority.department
            .replace(/^Ban Chỉ Huy PCTT\s*/i, '')
            .replace(/\(.*?\)/g, '')
            .trim()
        : 'Khu vực quản lý');

  const fallbackCoords = getAreaCoordinates(areaName, user?.authority?.department);
  const lat = user?.authority?.latitude ?? fallbackCoords.lat;
  const lng = user?.authority?.longitude ?? fallbackCoords.lng;

  return {
    fullName: user?.fullName || (isAdmin ? 'Quản trị viên' : 'Cán bộ phụ trách'),
    position: normalizePosition(isAdmin, user?.authority?.position),
    organizationName: user?.authority?.organizationName || 'Ban Chỉ Huy PCTT & TKCN',
    phone: (user as any)?.phoneNumber || (user as any)?.phone || '',
    email: user?.email || '',
    managedArea: areaName,
    avatarUrl: user?.avatarUrl || '',
    mapUrl:
      user?.authority?.mapUrl ||
      (user?.authority?.latitude && user?.authority?.longitude
        ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
        : ''),
    latitude: lat,
    longitude: lng,
    officeAddress: user?.authority?.officeAddress || '',
  };
};

function ProfileAvatar({
  avatarUrl,
  name,
  className,
}: {
  avatarUrl?: string;
  name: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  return (
    <span
      className={cn(
        'relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-chart-2 text-lg font-semibold text-primary-foreground ring-4 ring-primary/10 select-none',
        className
      )}
    >
      {avatarUrl && !imgFailed ? (
        <img
          src={avatarUrl}
          alt={name}
          className="size-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

/** Live preview card mirroring shadcn-ref's ProfileSettingsPage `Preview` aside */
function ProfilePreviewAside({
  profile,
  isAdmin,
  isPhoneVerified,
  areaDisplay,
}: {
  profile: ProfileFormState;
  isAdmin: boolean;
  isPhoneVerified: boolean;
  areaDisplay: string;
}) {
  const cleanName = profile.fullName.replace(/\s*\([^)]*\)/g, '').trim() || 'Họ và tên';

  return (
    <div className="flex flex-col gap-3" aria-label="Xem trước hồ sơ">
      <span className="text-sm text-muted-foreground">Hiển thị trong hệ thống</span>
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-(--surface-shadow) ring-1 ring-foreground/5">
        <div className="flex items-start gap-3">
          <ProfileAvatar
            avatarUrl={profile.avatarUrl}
            name={cleanName}
            className="size-9 text-xs ring-2"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="truncate text-sm font-semibold text-foreground">{cleanName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {profile.position || 'Chưa cập nhật chức vụ'}
              </span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {profile.organizationName || 'Ban Chỉ Huy PCTT & TKCN'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <ShieldCheck className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-foreground">
            Vai trò{' '}
            <span className="font-medium">
              {isAdmin ? 'Quản trị viên' : 'Chính quyền cơ sở'}
            </span>
          </span>
          <span className="ms-auto shrink-0 font-mono text-[11px] text-muted-foreground">
            {isAdmin ? 'ADMIN' : 'LOCAL'}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <MapPin className="size-3.5 shrink-0 text-chart-2" />
          <span className="truncate text-foreground">{areaDisplay}</span>
          <span
            className={cn(
              'ms-auto shrink-0 text-[11px] font-medium',
              isPhoneVerified ? 'text-success' : 'text-warning'
            )}
          >
            {isPhoneVerified ? 'SĐT đã xác thực' : 'Chưa xác thực'}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface ProfileSectionTabProps {
  user?: User;
}

export const ProfileSectionTab: React.FC<ProfileSectionTabProps> = ({ user }) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const [savedBaseline, setSavedBaseline] = useState<ProfileFormState>(() =>
    buildInitialProfile(user, isAdmin)
  );
  const [draft, setDraft] = useState<ProfileFormState>(() => buildInitialProfile(user, isAdmin));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Avatar Cloudinary upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Phone OTP verification state
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean>(() =>
    Boolean(user?.isPhoneVerified || user?.isVerified)
  );
  const [verifiedPhone, setVerifiedPhone] = useState<string>(() => {
    const p = (user as any)?.phoneNumber || (user as any)?.phone || '';
    return p ? String(p).replace(/[^0-9]/g, '') : '';
  });
  const [showOtpBox, setShowOtpBox] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (!user) return;
    const next = buildInitialProfile(user, isAdmin);
    setSavedBaseline(next);
    setDraft(next);
    const cleanP = String(next.phone || '').replace(/[^0-9]/g, '');
    const verified = Boolean(user.isPhoneVerified || user.isVerified);
    setIsPhoneVerified(verified);
    setVerifiedPhone(verified ? cleanP : '');
  }, [user, isAdmin]);

  const areaDisplay = useMemo(() => {
    if (isAdmin) return 'Toàn TP. Đà Nẵng & Hoàng Sa';
    const baseArea = draft.managedArea || '';
    const cityFromDept = user?.authority?.department?.match(/\(([^)]+)\)/)?.[1]?.trim();
    if (
      baseArea &&
      cityFromDept &&
      !baseArea.toLowerCase().includes(cityFromDept.toLowerCase())
    ) {
      return `${baseArea}, ${cityFromDept}`;
    }
    return baseArea || 'Khu vực quản lý';
  }, [draft.managedArea, isAdmin, user?.authority?.department]);

  const isDirty = useMemo(() => {
    return (
      draft.fullName.trim() !== savedBaseline.fullName.trim() ||
      draft.email.trim() !== savedBaseline.email.trim() ||
      draft.phone.trim() !== savedBaseline.phone.trim() ||
      draft.position.trim() !== savedBaseline.position.trim() ||
      draft.organizationName.trim() !== savedBaseline.organizationName.trim() ||
      draft.mapUrl.trim() !== savedBaseline.mapUrl.trim() ||
      draft.officeAddress.trim() !== savedBaseline.officeAddress.trim() ||
      draft.latitude !== savedBaseline.latitude ||
      draft.longitude !== savedBaseline.longitude
    );
  }, [draft, savedBaseline]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Vui lòng chọn tệp ảnh hợp lệ (JPG, PNG, WebP, GIF).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Kích thước ảnh tối đa 10MB.');
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);

    const previewUrl = URL.createObjectURL(file);
    setDraft((prev) => ({ ...prev, avatarUrl: previewUrl }));

    try {
      const res = await updateUserAvatar(file);
      if (res.success && res.data?.avatarUrl) {
        const cloudUrl = res.data.avatarUrl;
        setDraft((prev) => ({ ...prev, avatarUrl: cloudUrl }));
        setSavedBaseline((prev) => ({ ...prev, avatarUrl: cloudUrl }));

        const rawUser = localStorage.getItem('sos_auth_user');
        if (rawUser) {
          try {
            const currentObj = JSON.parse(rawUser);
            const updated = { ...currentObj, avatarUrl: cloudUrl };
            localStorage.setItem('sos_auth_user', JSON.stringify(updated));
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updated }));
          } catch {
            // ignore storage parse failure
          }
        }
        toast.success('Đã cập nhật ảnh đại diện.');
      } else {
        throw new Error(res.message || 'Không thể tải ảnh đại diện lên máy chủ.');
      }
    } catch (err: any) {
      setDraft((prev) => ({ ...prev, avatarUrl: savedBaseline.avatarUrl }));
      setAvatarError(err?.message || 'Lỗi khi tải ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePhoneInput = (value: string) => {
    setDraft((prev) => ({ ...prev, phone: value }));
    const clean = value.replace(/[^0-9]/g, '');
    if (clean && clean === verifiedPhone) {
      setIsPhoneVerified(true);
      setShowOtpBox(false);
    } else {
      setIsPhoneVerified(false);
    }
    setOtpError(null);
    setOtpSuccess(null);
  };

  const handleSendOtp = async () => {
    const cleanPhone = draft.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setOtpError('Số điện thoại cần tối thiểu 10 chữ số.');
      return;
    }
    setSendingOtp(true);
    setOtpError(null);
    setOtpSuccess(null);
    try {
      await sendPhoneOtp(cleanPhone);
      setShowOtpBox(true);
      setOtpCountdown(60);
    } catch (err: any) {
      setOtpError(err?.message || 'Không thể gửi mã xác thực OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanPhone = draft.phone.replace(/[^0-9]/g, '');
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6) {
      setOtpError('Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await verifyPhoneOtp(cleanPhone, cleanOtp);
      setIsPhoneVerified(true);
      setVerifiedPhone(cleanPhone);
      setShowOtpBox(false);
      setOtpCode('');
      setOtpSuccess('Đã xác thực số điện thoại thành công.');
      window.setTimeout(() => setOtpSuccess(null), 4000);

      const rawUser = localStorage.getItem('sos_auth_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const updated = {
          ...parsed,
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          isPhoneVerified: true,
          isVerified: true,
        };
        localStorage.setItem('sos_auth_user', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updated }));
      }
      toast.success('Số điện thoại đã được xác thực.');
    } catch (err: any) {
      setOtpError(err?.message || 'Mã OTP không đúng hoặc đã hết hạn.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSave = async () => {
    if (!draft.fullName.trim()) {
      setFormError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!draft.email.trim()) {
      setFormError('Vui lòng nhập email công vụ.');
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      const rawUser = localStorage.getItem('sos_auth_user');
      const currentUserObj = rawUser ? JSON.parse(rawUser) : user || {};

      const res = await updateUserProfile({
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        avatarUrl: draft.avatarUrl,
        isPhoneVerified,
        authority: isAdmin
          ? {
              position: draft.position.trim(),
              organizationName: draft.organizationName.trim(),
              areaName: 'Toàn quốc',
            }
          : {
              position: draft.position.trim(),
              organizationName: draft.organizationName.trim(),
              mapUrl: draft.mapUrl.trim(),
              latitude: draft.latitude ?? undefined,
              longitude: draft.longitude ?? undefined,
              officeAddress: draft.officeAddress.trim(),
            },
      });

      const serverUser = res.success && res.data ? res.data : null;

      const updatedUser: User = {
        ...currentUserObj,
        ...(serverUser || {}),
        fullName: serverUser?.fullName || draft.fullName.trim(),
        avatarUrl: serverUser?.avatarUrl || draft.avatarUrl,
        phoneNumber:
          serverUser?.phone || (serverUser as any)?.phoneNumber || draft.phone.trim(),
        email: serverUser?.email || draft.email.trim(),
        authority: {
          ...(currentUserObj.authority || {}),
          ...(serverUser?.authority || {}),
          areaId: isAdmin
            ? null
            : serverUser?.authority?.areaId || currentUserObj.authority?.areaId || null,
          department: isAdmin
            ? serverUser?.authority?.department || 'Ban Quản Trị Hệ Thống SOS'
            : serverUser?.authority?.department || currentUserObj.authority?.department,
          position: draft.position.trim(),
          organizationName: draft.organizationName.trim(),
          areaName: isAdmin
            ? 'Toàn quốc'
            : serverUser?.authority?.areaName ||
              currentUserObj.authority?.areaName ||
              draft.managedArea,
          provinceCode: isAdmin
            ? undefined
            : serverUser?.authority?.provinceCode ?? currentUserObj.authority?.provinceCode,
          wardCode: isAdmin
            ? undefined
            : serverUser?.authority?.wardCode ?? currentUserObj.authority?.wardCode,
          mapUrl: serverUser?.authority?.mapUrl ?? draft.mapUrl.trim(),
          latitude: serverUser?.authority?.latitude ?? draft.latitude ?? undefined,
          longitude: serverUser?.authority?.longitude ?? draft.longitude ?? undefined,
          officeAddress: serverUser?.authority?.officeAddress ?? draft.officeAddress.trim(),
        } as any,
      };

      localStorage.setItem('sos_auth_user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('sos_user_profile_updated', { detail: updatedUser }));

      const cleanNext: ProfileFormState = {
        ...draft,
        fullName: updatedUser.fullName || draft.fullName.trim(),
        email: updatedUser.email || draft.email.trim(),
        phone: (updatedUser as any).phoneNumber || draft.phone.trim(),
        avatarUrl: updatedUser.avatarUrl || draft.avatarUrl,
      };
      setSavedBaseline(cleanNext);
      setDraft(cleanNext);
      toast.success('Đã lưu thay đổi hồ sơ.');
    } catch (err: any) {
      const msg = err?.message || 'Không thể lưu hồ sơ lúc này.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={SETTINGS_PAGE}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        noValidate
        className="contents"
      >
        <SettingsHero
          aside={
            <ProfilePreviewAside
              profile={draft}
              isAdmin={isAdmin}
              isPhoneVerified={isPhoneVerified}
              areaDisplay={areaDisplay}
            />
          }
          className={FIT_HERO}
        >
          <div className="flex items-center gap-4 @3xl/settings:flex-col @3xl/settings:items-start @6xl/settings:flex-row @6xl/settings:items-center">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Đổi ảnh đại diện"
                className="group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ProfileAvatar avatarUrl={draft.avatarUrl} name={draft.fullName} />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingAvatar ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Camera className="size-5" />
                  )}
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-lg font-semibold text-foreground">
                {draft.fullName || 'Chưa cập nhật tên'}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {draft.email || 'Chưa có email'}
              </span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge tone="neutral" dot={false} className="w-fit">
                  {draft.position || (isAdmin ? 'Quản trị viên' : 'Chỉ huy khu vực')}
                </StatusBadge>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? 'Đang tải ảnh...' : 'Đổi ảnh'}
                </Button>
              </div>
            </div>
          </div>

          {avatarError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              {avatarError}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Họ tên, ảnh đại diện và thông tin đơn vị hiển thị trên ca SOS, lệnh điều phối và nhật
            ký hoạt động.
          </p>
        </SettingsHero>

        <SettingsCard
          icon={UserIcon}
          title="Thông tin cá nhân"
          description="Thông tin định danh cán bộ và đầu mối liên lạc trực ban."
        >
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="profile-fullname"
                  className="text-sm font-medium text-foreground"
                >
                  Họ và tên
                </label>
                <Input
                  id="profile-fullname"
                  autoComplete="name"
                  required
                  value={draft.fullName}
                  onChange={(e) => setDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Nhập họ và tên cán bộ"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-email" className="text-sm font-medium text-foreground">
                  Email công vụ
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={draft.email}
                  onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="canbo@cuuhocuunan.vn"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-position" className="text-sm font-medium text-foreground">
                  Chức vụ
                </label>
                <Input
                  id="profile-position"
                  autoComplete="organization-title"
                  value={draft.position}
                  onChange={(e) => setDraft((prev) => ({ ...prev, position: e.target.value }))}
                  placeholder="VD: Chỉ huy khu vực"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-org" className="text-sm font-medium text-foreground">
                  Cơ quan / Đơn vị
                </label>
                <Input
                  id="profile-org"
                  autoComplete="organization"
                  value={draft.organizationName}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, organizationName: e.target.value }))
                  }
                  placeholder="VD: Ban Chỉ Huy PCTT & TKCN"
                />
              </div>
            </div>

            {/* Số điện thoại & Xác thực OTP */}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="profile-phone"
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                >
                  <Phone className="size-3.5 text-muted-foreground" />
                  Số điện thoại trực ban
                </label>
                <StatusBadge tone={isPhoneVerified ? 'success' : 'warning'}>
                  {isPhoneVerified ? 'Đã xác thực' : 'Chưa xác thực'}
                </StatusBadge>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="profile-phone"
                  type="tel"
                  required
                  value={draft.phone}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  placeholder="VD: 0905123456"
                  className="flex-1 font-mono"
                />
                {!isPhoneVerified && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSendOtp()}
                    disabled={sendingOtp || otpCountdown > 0 || !draft.phone.trim()}
                    className="shrink-0"
                  >
                    {sendingOtp
                      ? 'Đang gửi...'
                      : otpCountdown > 0
                        ? `Gửi lại (${otpCountdown}s)`
                        : showOtpBox
                          ? 'Gửi lại mã'
                          : 'Xác thực OTP'}
                  </Button>
                )}
              </div>

              {showOtpBox && !isPhoneVerified && (
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
                  <span className="text-xs text-muted-foreground">
                    Nhập mã OTP 6 chữ số đã gửi tới số điện thoại của bạn.
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleVerifyOtp();
                          }
                        }}
                        placeholder="000000"
                        className="ps-9 font-mono tracking-widest"
                        autoFocus
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleVerifyOtp()}
                      disabled={verifyingOtp || otpCode.trim().length !== 6}
                    >
                      {verifyingOtp ? 'Đang kiểm tra...' : 'Xác nhận'}
                    </Button>
                  </div>
                </div>
              )}

              {otpError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {otpError}
                </p>
              )}
              {otpSuccess && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  {otpSuccess}
                </p>
              )}
            </div>

            {formError && (
              <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5 shrink-0" />
                {formError}
              </p>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          icon={isAdmin ? Globe2 : MapPin}
          tone="two"
          title={isAdmin ? 'Phạm vi quản trị' : 'Địa bàn & Vị trí trụ sở'}
          description={
            isAdmin
              ? 'Quyền giám sát và điều hành toàn diện trên hệ thống.'
              : 'Địa bàn phân quyền cố định và vị trí trụ sở Ủy ban trên bản đồ.'
          }
        >
          {isAdmin ? (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Globe2 className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Toàn TP. Đà Nẵng &amp; Đặc khu Hoàng Sa
                </span>
                <span className="text-xs text-muted-foreground">
                  Tài khoản Quản trị viên (ADMIN) có toàn quyền giám sát, phân bổ địa bàn và điều
                  phối lực lượng trên tất cả 94 phường/xã.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-area" className="text-sm font-medium text-foreground">
                  Địa bàn phân quyền
                </label>
                <Input id="profile-area" value={areaDisplay} readOnly disabled />
                <span className="text-xs text-muted-foreground">
                  Địa bàn do Ban Chỉ Huy phân công cố định; liên hệ Quản trị viên nếu cần thay đổi.
                </span>
              </div>

              <OfficeMapPicker
                mapUrl={draft.mapUrl}
                latitude={draft.latitude}
                longitude={draft.longitude}
                officeAddress={draft.officeAddress}
                defaultCenter={getAreaCoordinates(draft.managedArea, user?.authority?.department)}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    mapUrl: next.mapUrl,
                    latitude: next.latitude,
                    longitude: next.longitude,
                    officeAddress: next.officeAddress,
                  }))
                }
              />
            </div>
          )}
        </SettingsCard>
      </form>

      <SaveBar
        dirty={isDirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={() => {
          setDraft(savedBaseline);
          setFormError(null);
        }}
        saveLabel="Lưu hồ sơ"
      />
    </div>
  );
};

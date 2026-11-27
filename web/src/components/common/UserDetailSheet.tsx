import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Calendar,
  Check,
  CreditCard,
  Hash,
  LifeBuoy,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { fetchCitizenInfo } from '@/api';
import type { CitizenProfileInfo } from '@/types/chat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge, type StatusTone } from '@/kit/ui-patterns';
import { SOS_STATUS_CONFIG, SOS_TYPE_LABELS } from '@/features/chat/chatUtils';
import { cn } from '@/lib/utils';

export interface DetailUserRecord {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  address?: string;
  avatarUrl?: string;
  status?: string;
  roles?: string[];
  createdAt?: string;
  updatedAt?: string;
  isVerified?: boolean;
  rescuer?: {
    skills?: string[];
    verificationStatus?: string;
    availabilityStatus?: string;
    vehicleType?: string;
    idNumber?: string;
    areaName?: string;
    experienceYears?: number;
    bio?: string;
    idCardFrontUrl?: string;
    idCardBackUrl?: string;
    certificateUrls?: string[];
  };
}

const getInitials = (name?: string): string => {
  const parts = (name || 'U').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatDateVi = (iso?: string): string => {
  if (!iso) return 'Chưa có dữ liệu';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa có dữ liệu';
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const AVAILABILITY_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: 'Sẵn sàng', tone: 'success' },
  BUSY: { label: 'Đang làm nhiệm vụ', tone: 'warning' },
  ON_MISSION: { label: 'Đang làm nhiệm vụ', tone: 'warning' },
  OFFLINE: { label: 'Ngoại tuyến', tone: 'muted' },
  INACTIVE: { label: 'Tạm nghỉ', tone: 'muted' },
};

const VERIFICATION_META: Record<string, { label: string; tone: StatusTone }> = {
  VERIFIED: { label: 'Đã duyệt', tone: 'success' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
};

export interface UserDetailBodyProps {
  variant: 'citizen' | 'rescuer';
  record: DetailUserRecord;
  busy?: boolean;
  onToggleStatus?: (userId: string, currentStatus: string) => void;
  onDelete?: (userId: string) => void;
  onVerifyRescuer?: (userId: string, status: 'VERIFIED' | 'REJECTED') => void;
}

/**
 * Exact Chronicle UserDetail body ported from shadcn-ref/features/users/user-detail.tsx:
 * Avatar + name + badges -> icon/label/value <dl> -> <Separator /> -> context card -> action buttons.
 */
export const UserDetailBody: React.FC<UserDetailBodyProps> = ({
  variant,
  record,
  busy = false,
  onToggleStatus,
  onDelete,
  onVerifyRescuer,
}) => {
  const [citizenExtra, setCitizenExtra] = useState<CitizenProfileInfo | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setCitizenExtra(null);
    if (variant !== 'citizen' || !record._id || record._id.length !== 24) return;
    let active = true;
    setLoadingExtra(true);
    fetchCitizenInfo(record._id)
      .then((res) => {
        if (active && res.success && res.data) {
          setCitizenExtra(res.data);
        }
      })
      .catch(() => {
        // fallback to base record
      })
      .finally(() => {
        if (active) setLoadingExtra(false);
      });
    return () => {
      active = false;
    };
  }, [variant, record._id]);

  const accountStatus = String(record.status || 'ACTIVE').toUpperCase();
  const isSuspended = accountStatus === 'SUSPENDED';

  const verStatusKey = String(record.rescuer?.verificationStatus || 'PENDING').toUpperCase();
  const verMeta = VERIFICATION_META[verStatusKey] || VERIFICATION_META.PENDING;
  const availKey = String(record.rescuer?.availabilityStatus || 'OFFLINE').toUpperCase();
  const availMeta = AVAILABILITY_LABELS[availKey] || AVAILABILITY_LABELS.OFFLINE;

  const displayAddress =
    variant === 'rescuer'
      ? record.rescuer?.areaName || record.address || 'Chưa cập nhật'
      : citizenExtra?.address || record.address || 'Chưa cung cấp';

  const facts: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: React.ReactNode;
  }> = [
    {
      icon: Phone,
      label: 'Điện thoại',
      value: record.phone ? (
        <a href={`tel:${record.phone}`} className="font-mono hover:underline">
          {record.phone}
        </a>
      ) : (
        <span className="text-muted-foreground">Chưa có</span>
      ),
    },
    {
      icon: Mail,
      label: 'Email',
      value: record.email ? (
        <a href={`mailto:${record.email}`} className="hover:underline">
          {record.email}
        </a>
      ) : (
        <span className="text-muted-foreground">Chưa có</span>
      ),
    },
    {
      icon: MapPin,
      label: variant === 'rescuer' ? 'Địa bàn' : 'Địa chỉ',
      value: <span className="break-words whitespace-normal">{displayAddress}</span>,
    },
    ...(variant === 'rescuer'
      ? [
          {
            icon: CreditCard,
            label: 'Số CCCD',
            value: (
              <span className="font-mono">
                {record.rescuer?.idNumber || 'Chưa cập nhật'}
              </span>
            ),
          },
        ]
      : []),
    {
      icon: Calendar,
      label: 'Tham gia',
      value: formatDateVi(record.createdAt),
    },
    {
      icon: Hash,
      label: 'Mã hồ sơ',
      value: <span className="font-mono text-xs text-muted-foreground">{record._id}</span>,
    },
  ];

  const emergencyPrimary =
    citizenExtra?.emergencyContact || citizenExtra?.emergencyContacts?.[0] || null;
  const latestSos = citizenExtra?.latestSos || null;
  const latestSosMeta = latestSos
    ? SOS_STATUS_CONFIG[latestSos.status] || SOS_STATUS_CONFIG.PENDING
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Identity Header (exact mirror of user-detail.tsx) */}
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-base font-semibold text-primary ring-1 ring-border select-none">
          {record.avatarUrl ? (
            <img
              src={record.avatarUrl}
              alt={record.fullName}
              className="size-full object-cover"
            />
          ) : (
            getInitials(record.fullName)
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-lg font-semibold text-foreground">
            {record.fullName || 'Chưa cập nhật tên'}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {variant === 'rescuer' ? (
              <>
                <StatusBadge tone={verMeta.tone}>{verMeta.label}</StatusBadge>
                <Badge variant="outline" className="font-normal">
                  Cứu hộ viên
                </Badge>
              </>
            ) : (
              <>
                <StatusBadge tone={isSuspended ? 'muted' : 'success'}>
                  {isSuspended ? 'Tạm khóa' : 'Hoạt động'}
                </StatusBadge>
                <Badge variant="outline" className="font-normal">
                  Người dân
                </Badge>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Facts <dl> (exact mirror of user-detail.tsx) */}
      <dl className="grid gap-3 text-sm">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.label} className="grid grid-cols-[7.25rem_1fr] items-start gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-4 shrink-0" />
                {fact.label}
              </dt>
              <dd className="min-w-0 truncate text-foreground">{fact.value}</dd>
            </div>
          );
        })}
      </dl>

      <Separator />

      {/* Context Card Section (exact mirror of user-detail.tsx `Account` box) */}
      {variant === 'citizen' ? (
        <section aria-labelledby="citizen-context-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="citizen-context-heading" className="text-sm font-medium text-foreground">
              Thông tin cứu nạn &amp; Liên hệ khẩn cấp
            </h3>
            {loadingExtra && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Users className="size-4 text-muted-foreground" />
                Người liên hệ khẩn cấp
              </span>
              {emergencyPrimary?.phone ? (
                <a
                  href={`tel:${emergencyPrimary.phone}`}
                  className="font-mono text-xs font-medium text-primary hover:underline"
                >
                  {emergencyPrimary.phone}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Chưa khai báo</span>
              )}
            </div>
            {emergencyPrimary?.name && (
              <p className="text-xs text-muted-foreground">
                {emergencyPrimary.name}
                {emergencyPrimary.relation ? ` · ${emergencyPrimary.relation}` : ''}
              </p>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <LifeBuoy className="size-4 text-muted-foreground" />
                Lịch sử yêu cầu SOS
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {citizenExtra?.totalSosCount ?? (latestSos ? 1 : 0)} ca
              </span>
            </div>

            {latestSos && latestSosMeta ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-foreground">
                    {latestSos.sosCode}
                  </span>
                  <StatusBadge tone={latestSosMeta.tone}>{latestSosMeta.label}</StatusBadge>
                </div>
                <span className="text-muted-foreground">
                  {SOS_TYPE_LABELS[latestSos.emergencyType] || latestSos.emergencyType} ·{' '}
                  {latestSos.people || 1} người
                </span>
                {latestSos.description && (
                  <p className="text-foreground/90 italic">“{latestSos.description}”</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {loadingExtra
                  ? 'Đang tải lịch sử cứu nạn...'
                  : 'Người dân chưa gửi yêu cầu SOS nào.'}
              </p>
            )}
          </div>
        </section>
      ) : (
        <section aria-labelledby="rescuer-context-heading" className="flex flex-col gap-3">
          <h3 id="rescuer-context-heading" className="text-sm font-medium text-foreground">
            Hồ sơ năng lực cứu hộ
          </h3>
          <div className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="size-4 text-muted-foreground" />
                Trạng thái trực chiến
              </span>
              <StatusBadge tone={availMeta.tone}>{availMeta.label}</StatusBadge>
            </div>

            {record.rescuer?.vehicleType && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Truck className="size-3.5" />
                  Phương tiện đăng ký
                </span>
                <span className="font-medium text-foreground">{record.rescuer.vehicleType}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <span className="text-xs font-medium text-muted-foreground">Kỹ năng cứu nạn</span>
              {record.rescuer?.skills && record.rescuer.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {record.rescuer.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Chưa cập nhật kỹ năng</span>
              )}
            </div>

            {record.rescuer?.bio && (
              <p className="border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
                {record.rescuer.bio}
              </p>
            )}

            {(record.rescuer?.idCardFrontUrl || record.rescuer?.idCardBackUrl) && (
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5">
                {record.rescuer.idCardFrontUrl && (
                  <a
                    href={record.rescuer.idCardFrontUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <img
                      src={record.rescuer.idCardFrontUrl}
                      alt="CCCD mặt trước"
                      className="h-24 w-full object-cover"
                    />
                  </a>
                )}
                {record.rescuer.idCardBackUrl && (
                  <a
                    href={record.rescuer.idCardBackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <img
                      src={record.rescuer.idCardBackUrl}
                      alt="CCCD mặt sau"
                      className="h-24 w-full object-cover"
                    />
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Action Buttons Row (exact mirror of user-detail.tsx footer actions) */}
      <div className="flex flex-wrap items-center gap-2">
        {variant === 'citizen' && onToggleStatus && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onToggleStatus(record._id, accountStatus)}
          >
            {isSuspended ? (
              <>
                <RotateCcw className="size-3.5" />
                Kích hoạt lại
              </>
            ) : (
              <>
                <Ban className="size-3.5" />
                Tạm khóa
              </>
            )}
          </Button>
        )}

        {variant === 'citizen' && onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1">
              <AlertTriangle className="size-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">Xóa tài khoản này?</span>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                disabled={busy}
                onClick={() => onDelete(record._id)}
              >
                Xác nhận
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Hủy
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
              Xóa tài khoản
            </Button>
          )
        )}

        {variant === 'rescuer' && onVerifyRescuer && (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy || verStatusKey === 'VERIFIED'}
              onClick={() => onVerifyRescuer(record._id, 'VERIFIED')}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Phê duyệt
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || verStatusKey === 'REJECTED'}
              onClick={() => onVerifyRescuer(record._id, 'REJECTED')}
              className={cn(verStatusKey !== 'REJECTED' && 'text-destructive hover:text-destructive')}
            >
              <Ban className="size-3.5" />
              Từ chối
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Side Sheet (exact mirror of shadcn-ref/features/users/user-sheet.tsx)
   ========================================================================== */

export interface UserDetailSheetProps {
  variant: 'citizen' | 'rescuer';
  record: DetailUserRecord | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullPage?: (record: DetailUserRecord) => void;
  onToggleStatus?: (userId: string, currentStatus: string) => void;
  onDelete?: (userId: string) => void;
  onVerifyRescuer?: (userId: string, status: 'VERIFIED' | 'REJECTED') => void;
}

export const UserDetailSheet: React.FC<UserDetailSheetProps> = ({
  variant,
  record,
  busy = false,
  onOpenChange,
  onOpenFullPage,
  onToggleStatus,
  onDelete,
  onVerifyRescuer,
}) => {
  return (
    <Sheet open={record !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{variant === 'rescuer' ? 'Hồ sơ cứu hộ viên' : 'Người dân'}</SheetTitle>
          <SheetDescription>
            {variant === 'rescuer'
              ? 'Thông tin định danh, địa bàn, kỹ năng và trạng thái thẩm định.'
              : 'Hồ sơ tài khoản, liên hệ khẩn cấp và lịch sử yêu cầu SOS.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:thin]">
          {record && (
            <UserDetailBody
              variant={variant}
              record={record}
              busy={busy}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onVerifyRescuer={onVerifyRescuer}
            />
          )}
        </div>

        {record && onOpenFullPage && (
          <SheetFooter className="border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onOpenFullPage(record)}
            >
              Mở trang chi tiết
              <ArrowUpRight className="size-4" />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

/* ==========================================================================
   Full-Page Detail Card (exact mirror of shadcn-ref/features/users/user-page.tsx)
   ========================================================================== */

export interface UserFullPageDetailProps {
  variant: 'citizen' | 'rescuer';
  record: DetailUserRecord;
  busy?: boolean;
  backLabel: string;
  onBack: () => void;
  onToggleStatus?: (userId: string, currentStatus: string) => void;
  onDelete?: (userId: string) => void;
  onVerifyRescuer?: (userId: string, status: 'VERIFIED' | 'REJECTED') => void;
}

export const UserFullPageDetail: React.FC<UserFullPageDetailProps> = ({
  variant,
  record,
  busy = false,
  backLabel,
  onBack,
  onToggleStatus,
  onDelete,
  onVerifyRescuer,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {variant === 'rescuer' ? 'Chi tiết cứu hộ viên' : 'Chi tiết người dân'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Hồ sơ định danh, thông tin liên hệ và trạng thái hoạt động.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </Button>
      </div>

      <Card className="max-w-2xl rounded-2xl py-6">
        <CardContent className="px-6">
          <UserDetailBody
            variant={variant}
            record={record}
            busy={busy}
            onToggleStatus={onToggleStatus}
            onDelete={onDelete}
            onVerifyRescuer={onVerifyRescuer}
          />
        </CardContent>
      </Card>
    </div>
  );
};

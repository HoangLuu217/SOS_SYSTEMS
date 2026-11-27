import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileCheck,
  Hash,
  LifeBuoy,
  Loader2,
  MapPin,
  Phone,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { ChatConversationItem, CitizenProfileInfo } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/common/DetailSheet';
import { StatusBadge } from '@/kit/ui-patterns';
import { cn } from '@/lib/utils';
import { SOS_STATUS_CONFIG, SOS_TYPE_LABELS, getChatInitials } from './chatUtils';

/* ==========================================================================
   Chronicle Chat Avatar (mirroring shadcn-ref/features/chat/parts.tsx)
   ========================================================================== */

export interface ChatAvatarProps {
  src?: string | null;
  name?: string;
  role?: string;
  isChannel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showPresence?: boolean;
  online?: boolean;
  className?: string;
}

export const ChatAvatar: React.FC<ChatAvatarProps> = ({
  src,
  name,
  role,
  isChannel = false,
  size = 'md',
  showPresence = false,
  online = true,
  className,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const sizeClasses =
    size === 'sm' ? 'size-7 text-[10px]' : size === 'lg' ? 'size-12 text-sm' : 'size-9 text-xs';

  if (isChannel) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-chart-2/15 text-chart-2',
          sizeClasses,
          className
        )}
        aria-hidden
      >
        <Hash className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      </span>
    );
  }

  const toneClass =
    role === 'ADMIN'
      ? 'bg-destructive/15 text-destructive'
      : role === 'CITIZEN'
        ? 'bg-warning/20 text-warning-foreground dark:text-warning'
        : role === 'RESCUER'
          ? 'bg-success/15 text-success'
          : 'bg-primary/12 text-primary';

  return (
    <span className={cn('relative inline-flex shrink-0 select-none', sizeClasses, className)}>
      <span
        className={cn(
          'flex size-full items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-border',
          !src || imgError ? toneClass : 'bg-muted'
        )}
      >
        {src && !imgError ? (
          <img
            src={src}
            alt={name || 'Avatar'}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          getChatInitials(name)
        )}
      </span>
      {showPresence && (
        <span
          className={cn(
            'absolute end-0 bottom-0 size-2.5 rounded-full ring-2 ring-card',
            online ? 'bg-success' : 'bg-muted-foreground/50'
          )}
          aria-hidden
        />
      )}
    </span>
  );
};

/* ==========================================================================
   Chronicle Image Lightbox
   ========================================================================== */

export const ChatLightbox: React.FC<{
  src: string | null;
  onClose: () => void;
}> = ({ src, onClose }) => {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh phóng to"
    >
      <div
        className="relative flex max-h-[90vh] max-w-4xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          onClick={onClose}
          aria-label="Đóng xem ảnh"
          className="absolute -top-3 -right-3 rounded-full shadow-md"
        >
          <X className="size-4" />
        </Button>
        <img
          src={src}
          alt="Ảnh hiện trường phóng to"
          className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl ring-1 ring-white/15"
        />
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-black/50 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/75"
        >
          <ExternalLink className="size-3.5" />
          Mở trong tab mới
        </a>
      </div>
    </div>
  );
};

/* ==========================================================================
   Chronicle Slide-Over Citizen Profile Drawer (100% Dark Mode & Theme Compatible)
   ========================================================================== */

export interface CitizenProfileDrawerProps {
  citizen: CitizenProfileInfo | null;
  activeConv: ChatConversationItem | null;
  loading: boolean;
  copiedPhone: boolean;
  onCopyPhone: (phone?: string) => void;
  onClose: () => void;
  onViewOnMap: (lat: number, lng: number, senderName?: string, address?: string) => void;
  onNavigateSos: (sosCode?: string) => void;
  onOpenGeneralMap: () => void;
}

export const CitizenProfileDrawer: React.FC<CitizenProfileDrawerProps> = ({
  citizen,
  activeConv,
  loading,
  copiedPhone,
  onCopyPhone,
  onClose,
  onViewOnMap,
  onNavigateSos,
  onOpenGeneralMap,
}) => {
  const emergencyPrimary = citizen?.emergencyContact || citizen?.emergencyContacts?.[0];
  const latestStatusCfg = citizen?.latestSos
    ? SOS_STATUS_CONFIG[citizen.latestSos.status] || SOS_STATUS_CONFIG.PENDING
    : null;

  return (
    <DetailSheet
      open={Boolean(citizen)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      icon={<UserCheck className="size-4" />}
      title={citizen?.fullName || 'Hồ sơ người dân'}
      description={activeConv?.areaName ? `Hồ sơ người dân · ${activeConv.areaName}` : 'Hồ sơ người dân địa bàn'}
      badges={
        citizen && (
          <>
            <StatusBadge tone={citizen.latestSos ? 'warning' : 'neutral'}>
              {citizen.latestSos ? 'Cần hỗ trợ khẩn cấp' : 'Người dân địa bàn'}
            </StatusBadge>
            {citizen.totalSosCount !== undefined && citizen.totalSosCount > 0 && (
              <StatusBadge tone="danger" dot={false}>
                <LifeBuoy className="size-3" />
                {citizen.totalSosCount} ca SOS
              </StatusBadge>
            )}
          </>
        )
      }
      footer={
        citizen && (
          <div className="flex w-full items-center justify-end gap-2">
            {citizen.phone && (
              <a
                href={`tel:${citizen.phone}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                <Phone className="size-3.5" />
                Gọi điện
              </a>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onOpenGeneralMap}>
              <MapPin className="size-3.5" />
              Bản đồ
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        )
      }
    >
      {citizen && (
        <div className="flex flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Đang tải thông tin xác thực người dân...
            </div>
          )}

          {/* Section A: Personal */}
          <section className="flex flex-col gap-4 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <UserCheck className="size-3.5 text-primary" />
              Thông tin cá nhân
            </div>

            <div className="flex items-center gap-3">
              <ChatAvatar
                src={citizen.avatarUrl}
                name={citizen.fullName}
                role="CITIZEN"
                size="lg"
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold text-foreground">
                  {citizen.fullName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {citizen.gender === 'MALE'
                    ? 'Nam'
                    : citizen.gender === 'FEMALE'
                      ? 'Nữ'
                      : citizen.gender || 'Chưa rõ giới tính'}
                  {' · '}
                  {citizen.dateOfBirth || 'Chưa có ngày sinh'}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Số điện thoại
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {citizen.phone || 'Chưa cung cấp'}
                  </span>
                  {citizen.phone && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onCopyPhone(citizen.phone)}
                    >
                      {copiedPhone ? (
                        <Check className="size-3 text-success" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copiedPhone ? 'Đã chép' : 'Chép'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Email</span>
                <span className="truncate text-sm text-foreground">
                  {citizen.email || 'Chưa cung cấp'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Nơi cư trú
                </span>
                <span className="text-sm text-foreground">
                  {citizen.address || activeConv?.address || 'Chưa cung cấp địa chỉ chi tiết'}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2.5 text-sm text-foreground">
                <MapPin className="size-4 shrink-0 text-primary" />
                <span className="text-xs text-muted-foreground">Địa bàn:</span>
                <span className="font-medium">{activeConv?.areaName || 'TP. Đà Nẵng'}</span>
              </div>
            </div>
          </section>

          {/* Section B: Emergency Contact */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Users className="size-3.5 text-chart-2" />
              Liên hệ khẩn cấp (Người thân)
            </div>

            {emergencyPrimary?.name || emergencyPrimary?.phone ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-3">
                  <span className="text-[11px] text-muted-foreground">Họ tên &amp; quan hệ</span>
                  <span className="text-sm font-semibold text-foreground">
                    {emergencyPrimary.name || 'Người thân'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {emergencyPrimary.relation || 'Người liên hệ khẩn cấp'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                  <span className="text-[11px] text-muted-foreground">Số điện thoại</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-success">
                      {emergencyPrimary.phone || 'Chưa cung cấp'}
                    </span>
                    {emergencyPrimary.phone && (
                      <a
                        href={`tel:${emergencyPrimary.phone}`}
                        className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-success/25"
                      >
                        <Phone className="size-3" />
                        Gọi
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                Người dân chưa khai báo người liên hệ khẩn cấp.
              </div>
            )}
          </section>

          {/* Section C: SOS Status */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <AlertTriangle className="size-3.5 text-destructive" />
                Tình trạng cứu nạn SOS
              </span>
              {latestStatusCfg ? (
                <StatusBadge tone={latestStatusCfg.tone}>{latestStatusCfg.label}</StatusBadge>
              ) : (
                <StatusBadge tone="success">Chưa kích hoạt SOS</StatusBadge>
              )}
            </div>

            {citizen.latestSos && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {citizen.latestSos.sosCode}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {SOS_TYPE_LABELS[citizen.latestSos.emergencyType] ||
                      citizen.latestSos.emergencyType}{' '}
                    · {citizen.latestSos.people || 1} người
                  </span>
                </div>
                {citizen.latestSos.address && (
                  <p className="text-xs text-muted-foreground">{citizen.latestSos.address}</p>
                )}
                {citizen.latestSos.description && (
                  <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    “{citizen.latestSos.description}”
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {citizen.latestSos.location?.coordinates && (
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => {
                        const [lng, lat] = citizen.latestSos!.location!.coordinates;
                        onViewOnMap(lat, lng, citizen.fullName, citizen.latestSos!.address);
                        onClose();
                      }}
                    >
                      <MapPin className="size-3" />
                      Xem trên bản đồ
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      onNavigateSos(citizen.latestSos!.sosCode);
                      onClose();
                    }}
                  >
                    <FileCheck className="size-3" />
                    Quản lý ca SOS
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </DetailSheet>
  );
};

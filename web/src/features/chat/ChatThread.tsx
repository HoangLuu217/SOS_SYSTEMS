import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Bell,
  BellOff,
  Compass,
  ExternalLink,
  Info,
  Loader2,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Phone,
  Pin,
  PinOff,
  RefreshCw,
  SendHorizontal,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { ChatConversationItem, ChatMessageItem } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
import { StatusBadge } from '@/kit/ui-patterns';
import { cn } from '@/lib/utils';
import { ChatAvatar } from './ChatParts';
import {
  cleanChatName,
  formatClock,
  groupChatMessages,
  parseGpsContent,
  parseSosMessage,
  type ChatMessageGroup,
} from './chatUtils';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function DayMarker({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export interface ChatThreadProps {
  conversation: ChatConversationItem;
  messages: ChatMessageItem[];
  currentUserId?: string;
  loadingMessages: boolean;
  sending: boolean;
  uploadingImg: boolean;
  inputContent: string;
  pinned: boolean;
  muted: boolean;
  realtimeConnected: boolean;
  sosStatusMap: Record<string, string>;
  onBack?: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onImageFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onRefresh: () => void;
  onOpenCitizenInfo: (userId?: string, fallbackInfo?: any) => void;
  onViewOnMap: (lat: number, lng: number, senderName?: string, address?: string) => void;
  onNavigateSos: (sosCode?: string) => void;
  onOpenLightbox: (url: string) => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  messages,
  currentUserId,
  loadingMessages,
  sending,
  uploadingImg,
  inputContent,
  pinned,
  muted,
  realtimeConnected,
  sosStatusMap,
  onBack,
  onInputChange,
  onSend,
  onImageFileSelected,
  onTogglePin,
  onToggleMute,
  onRefresh,
  onOpenCitizenInfo,
  onViewOnMap,
  onNavigateSos,
  onOpenLightbox,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isChannel = conversation.type === 'CHANNEL';
  const isCitizenConv = conversation.role === 'CITIZEN';
  const title = cleanChatName(conversation.name);

  const groups = useMemo(() => groupChatMessages(messages), [messages]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  useIsomorphicLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: messages.length > 0 && node.scrollTop > 0 ? 'smooth' : 'auto',
      });
    }
  }, [conversation.channel, messages.length]);

  const subtitle = useMemo(() => {
    if (isChannel) return 'Kênh chung · Ban chỉ huy và cán bộ địa phương';
    const parts: string[] = [];
    parts.push(realtimeConnected ? 'Trực tuyến' : 'Ngoại tuyến');
    if (conversation.role === 'ADMIN') parts.push('Ban chỉ huy');
    else if (conversation.role === 'CITIZEN') parts.push('Người dân');
    else if (conversation.role === 'RESCUER') parts.push('Cứu hộ viên');
    else parts.push('Chính quyền cơ sở');
    if (conversation.areaName) parts.push(conversation.areaName);
    if (conversation.phone && !isCitizenConv) parts.push(conversation.phone);
    return parts.join(' · ');
  }, [conversation.areaName, conversation.phone, conversation.role, isChannel, isCitizenConv, realtimeConnected]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputContent.trim() || sending || uploadingImg) return;
    onSend();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const renderMessageBubble = (
    msg: ChatMessageItem,
    mine: boolean,
    isLastInGroup: boolean
  ) => {
    const sos = parseSosMessage(msg, sosStatusMap);
    if (sos) {
      return (
        <div
          key={msg._id}
          className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 text-card-foreground shadow-(--surface-shadow)"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertOctagon className="size-3.5 shrink-0" />
              Yêu cầu cứu nạn khẩn cấp
            </span>
            <StatusBadge tone={sos.statusTone}>{sos.statusLabel}</StatusBadge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'font-mono text-sm font-semibold text-foreground',
                sos.status === 'CANCELLED' && 'line-through opacity-60'
              )}
            >
              {sos.sosCode}
            </span>
            <StatusBadge tone="neutral" dot={false}>
              {sos.typeLabel}
            </StatusBadge>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl bg-muted/40 p-2.5 text-xs">
            <div className="flex items-center gap-2 text-foreground">
              <Users className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{sos.people} người gặp nạn</span>
            </div>
            {sos.address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span>{sos.address}</span>
              </div>
            )}
            {sos.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                <a
                  href={`tel:${sos.phone}`}
                  className="inline-flex items-center gap-1 font-mono font-medium text-primary hover:underline"
                >
                  {sos.phone}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
            {sos.description && (
              <p className="mt-1 border-t border-border/60 pt-1.5 text-foreground/90 italic">
                “{sos.description}”
              </p>
            )}
          </div>

          {sos.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sos.images.map((imgUrl, idx) => (
                <button
                  key={`${msg._id}_sos_img_${idx}`}
                  type="button"
                  onClick={() => onOpenLightbox(imgUrl)}
                  className="group relative size-16 overflow-hidden rounded-lg border border-border bg-muted"
                  title="Phóng to ảnh"
                >
                  <img
                    src={imgUrl}
                    alt={`Ảnh hiện trường ${idx + 1}`}
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}

          {sos.status === 'CANCELLED' ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              <X className="size-3.5 text-destructive" />
              Yêu cầu cứu nạn này đã được hủy bỏ
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {sos.coords && (
                <Button
                  type="button"
                  size="xs"
                  onClick={() =>
                    onViewOnMap(sos.coords!.lat, sos.coords!.lng, msg.senderName, sos.address)
                  }
                >
                  <MapIcon className="size-3.5" />
                  Xem bản đồ
                </Button>
              )}
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onNavigateSos(sos.sosCode)}
              >
                <Activity className="size-3.5" />
                Quản lý ca SOS
              </Button>
            </div>
          )}
        </div>
      );
    }

    const gps = parseGpsContent(msg.content);
    if (gps) {
      return (
        <div
          key={msg._id}
          className="flex w-full max-w-sm flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-card-foreground shadow-(--surface-shadow)"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <MapPin className="size-3.5" />
            Tọa độ GPS khẩn cấp
          </span>
          <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-foreground">
            <Compass className="size-3.5 text-muted-foreground" />
            {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
          </div>
          {gps.address && <p className="text-xs text-muted-foreground">{gps.address}</p>}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="xs"
              onClick={() => onViewOnMap(gps.lat, gps.lng, msg.senderName, gps.address)}
            >
              <MapIcon className="size-3.5" />
              Xem bản đồ
            </Button>
            <a
              href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Mở Google Maps"
            >
              <ExternalLink className="size-3" />
              Maps
            </a>
          </div>
        </div>
      );
    }

    const imageAttachments = Array.isArray(msg.attachments)
      ? msg.attachments.filter(
          (att) =>
            att.url &&
            (!att.fileType ||
              att.fileType.toUpperCase().includes('IMAGE') ||
              /\.(jpg|jpeg|png|webp|gif)/i.test(att.url))
        )
      : [];
    const showText = Boolean(msg.content && msg.content.trim() !== '[Hình ảnh]');

    return (
      <div key={msg._id} className={cn('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {imageAttachments.map((img, idx) => (
              <button
                key={`${msg._id}_img_${idx}`}
                type="button"
                onClick={() => onOpenLightbox(img.url)}
                className="group relative max-w-[240px] overflow-hidden rounded-xl border border-border bg-muted shadow-xs"
                title="Nhấn để phóng to"
              >
                <img
                  src={img.url}
                  alt={img.fileName || 'Ảnh đính kèm'}
                  loading="lazy"
                  className="max-h-56 w-auto object-cover transition-transform group-hover:scale-[1.02]"
                />
                <span className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 className="size-3" />
                </span>
              </button>
            ))}
          </div>
        )}

        {showText && (
          <p
            className={cn(
              'w-fit rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-pretty break-words whitespace-pre-wrap',
              mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              mine
                ? isLastInGroup && 'rounded-br-md'
                : isLastInGroup && 'rounded-bl-md'
            )}
          >
            {msg.content}
          </p>
        )}
      </div>
    );
  };

  const renderMessageGroup = (group: ChatMessageGroup) => {
    const first = group.messages[0];
    const mine = Boolean(currentUserId && group.senderId === currentUserId);
    const senderObj =
      typeof first.senderId === 'object' && first.senderId !== null ? first.senderId : null;
    const roleUpper = (first.senderRole || '').toUpperCase();
    const isSenderAdmin = roleUpper.includes('ADMIN');
    const isSenderCitizen = roleUpper.includes('CITIZEN');
    const senderRoleKey = isSenderCitizen ? 'CITIZEN' : isSenderAdmin ? 'ADMIN' : 'LOCAL_AUTHORITY';

    return (
      <div className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')}>
        {!mine && (
          <ChatAvatar
            src={
              (senderObj as any)?.avatarUrl ||
              (isSenderCitizen
                ? conversation.avatarUrl || (conversation.partnerUser as any)?.avatarUrl
                : undefined)
            }
            name={first.senderName}
            role={senderRoleKey}
            size="sm"
            className="mb-0.5"
          />
        )}

        <div
          className={cn(
            'flex max-w-[85%] min-w-0 flex-col gap-1 sm:max-w-[72%]',
            mine ? 'items-end' : 'items-start'
          )}
        >
          <div className={cn('flex items-baseline gap-2 px-1 text-xs', mine && 'flex-row-reverse')}>
            {!mine && (isChannel || isSenderCitizen) && (
              <button
                type="button"
                disabled={!isSenderCitizen}
                onClick={() => {
                  if (!isSenderCitizen) return;
                  onOpenCitizenInfo(group.senderId, {
                    fullName: first.senderName,
                    phone: senderObj?.phone || conversation.phone,
                    address: senderObj?.address || conversation.address || conversation.areaName,
                    email: senderObj?.email,
                    avatarUrl: senderObj?.avatarUrl,
                    emergencyContact: senderObj?.citizen?.emergencyContact,
                    emergencyContacts: senderObj?.citizen?.emergencyContacts,
                  });
                }}
                className={cn(
                  'inline-flex items-center gap-1 font-medium text-foreground',
                  isSenderCitizen && 'cursor-pointer hover:text-primary hover:underline'
                )}
              >
                {first.senderName}
                {isSenderCitizen && <Info className="size-3 text-primary" />}
              </button>
            )}
            <time
              dateTime={first.createdAt}
              className="font-mono text-[11px] text-muted-foreground tabular-nums"
            >
              {formatClock(first.createdAt)}
            </time>
          </div>

          {group.messages.map((msg, idx) =>
            renderMessageBubble(msg, mine, idx === group.messages.length - 1)
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label={`Cuộc trò chuyện với ${title}`}
      className="flex h-full min-h-0 flex-col bg-card"
    >
      {/* Thread Header matching shadcn-ref/features/chat/thread.tsx */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}

        <ChatAvatar
          src={conversation.avatarUrl || (conversation.partnerUser as any)?.avatarUrl}
          name={title}
          role={conversation.role}
          isChannel={isChannel}
          showPresence={!isChannel}
          online={realtimeConnected}
        />

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            isCitizenConv && 'cursor-pointer'
          )}
          onClick={() => {
            if (isCitizenConv) onOpenCitizenInfo(conversation.partnerId, conversation);
          }}
          title={isCitizenConv ? 'Nhấn để xem thông tin chi tiết người dân' : undefined}
        >
          <h2
            className={cn(
              'truncate text-sm font-semibold text-foreground',
              isCitizenConv && 'hover:text-primary hover:underline'
            )}
          >
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {/* Right Icon Actions (Pin, Mute, Citizen Info, More) */}
        <div className="flex items-center gap-0.5">
          {isCitizenConv && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Hồ sơ người dân"
              aria-label="Xem hồ sơ người dân"
              onClick={() => onOpenCitizenInfo(conversation.partnerId, conversation)}
            >
              <UserCheck className="size-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={pinned}
            aria-label={pinned ? 'Bỏ ghim cuộc trò chuyện' : 'Ghim cuộc trò chuyện'}
            title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
            onClick={onTogglePin}
            className={cn(pinned && 'text-primary')}
          >
            {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={muted}
            aria-label={muted ? 'Bật âm thông báo' : 'Tắt âm thông báo'}
            title={muted ? 'Bật âm' : 'Tắt âm'}
            onClick={onToggleMute}
            className={cn(muted && 'text-muted-foreground')}
          >
            {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
          </Button>

          <div className="relative" ref={menuRef}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Tùy chọn"
              title="Tùy chọn"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <MoreVertical className="size-4" />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-(--surface-shadow-raised)">
                {isCitizenConv && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenCitizenInfo(conversation.partnerId, conversation);
                    }}
                  >
                    <UserCheck className="size-3.5 text-muted-foreground" />
                    Xem hồ sơ người dân
                  </button>
                )}
                {conversation.phone && (
                  <a
                    href={`tel:${conversation.phone}`}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Phone className="size-3.5 text-muted-foreground" />
                    Gọi {conversation.phone}
                  </a>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onRefresh();
                  }}
                >
                  <RefreshCw className="size-3.5 text-muted-foreground" />
                  Tải lại tin nhắn
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable Message Log */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        role="log"
        aria-label="Nội dung tin nhắn"
        tabIndex={0}
      >
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center p-4">
            <SyncLogoLoader size="sm" message="Đang đồng bộ tin nhắn..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessageSquare className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">Chưa có tin nhắn</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Gửi tin nhắn đầu tiên để trao đổi và phối hợp cứu hộ tại hiện trường.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:px-5">
            {groups.map((group) => (
              <Fragment key={group.key}>
                {group.day && <DayMarker label={group.day} />}
                {renderMessageGroup(group)}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Unified Rounded-XL Composer matching shadcn-ref/features/chat/thread.tsx */}
      <form className="shrink-0 p-3 pt-1" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={onImageFileSelected}
          className="hidden"
        />

        <div className="flex items-end gap-1.5 rounded-xl border border-input bg-background px-2.5 py-1.5 shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
          <textarea
            ref={textareaRef}
            rows={1}
            aria-label={`Nhắn tin cho ${title}`}
            placeholder={`Nhắn tin cho ${title}...`}
            value={inputContent}
            disabled={sending || uploadingImg}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if ((e.nativeEvent as any).isComposing || e.keyCode === 229) return;
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="flex shrink-0 items-center gap-1 pb-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={uploadingImg || sending}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Đính kèm hình ảnh"
              title="Gửi hình ảnh"
            >
              {uploadingImg ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
            </Button>

            <Button
              type="submit"
              variant="default"
              size="icon-sm"
              disabled={!inputContent.trim() || sending || uploadingImg}
              aria-label="Gửi tin nhắn"
              title="Gửi (Enter)"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="mt-1.5 hidden px-1 text-[11px] text-muted-foreground sm:block">
          Enter để gửi, Shift + Enter để xuống dòng
        </p>
      </form>
    </section>
  );
};

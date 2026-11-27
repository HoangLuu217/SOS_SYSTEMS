import React, { useMemo } from 'react';
import {
  BellOff,
  CheckCheck,
  MessagesSquare,
  Search,
  X,
} from 'lucide-react';
import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
import type { ChatConversationItem } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatAvatar } from './ChatParts';
import { cleanChatName, formatShortTime } from './chatUtils';

export type ChatRoleFilter = 'ALL' | 'CITIZEN' | 'RESCUER' | 'LOCAL_AUTHORITY' | 'ADMIN';

interface ConversationRowProps {
  conversation: ChatConversationItem;
  active: boolean;
  muted: boolean;
  realtimeConnected: boolean;
  onSelect: () => void;
}

const ConversationRow: React.FC<ConversationRowProps> = ({
  conversation,
  active,
  muted,
  realtimeConnected,
  onSelect,
}) => {
  const isChannel = conversation.type === 'CHANNEL';
  const title = cleanChatName(conversation.name);
  const unread = conversation.unreadCount || 0;
  const last = conversation.latestMessage;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50',
        active && 'bg-accent hover:bg-accent'
      )}
    >
      <ChatAvatar
        src={conversation.avatarUrl || (conversation.partnerUser as any)?.avatarUrl}
        name={title}
        role={conversation.role}
        isChannel={isChannel}
        showPresence={!isChannel}
        online={realtimeConnected}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm text-foreground',
              unread > 0 ? 'font-semibold' : 'font-medium'
            )}
          >
            {title}
          </span>
          {muted && (
            <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="Đã tắt âm" />
          )}
          {last?.createdAt && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatShortTime(last.createdAt)}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {last ? (
              <>
                {last.senderName && (
                  <span className="text-muted-foreground">{last.senderName}: </span>
                )}
                {last.content}
              </>
            ) : isChannel ? (
              'Kênh trao đổi khẩn cấp chung'
            ) : (
              conversation.areaName ||
              (conversation.role === 'CITIZEN'
                ? 'Người dân địa bàn'
                : conversation.role === 'RESCUER'
                  ? 'Cứu hộ viên'
                  : 'Cán bộ địa phương')
            )}
          </span>

          {unread > 0 && (
            <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground tabular-nums">
              {unread > 99 ? '99+' : unread}
              <span className="sr-only"> chưa đọc</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
};

interface SectionProps {
  title: string;
  conversations: ChatConversationItem[];
  selectedChannel: string | null;
  mutedSet: Set<string>;
  realtimeConnected: boolean;
  onSelect: (conv: ChatConversationItem) => void;
}

const ConversationSection: React.FC<SectionProps> = ({
  title,
  conversations,
  selectedChannel,
  mutedSet,
  realtimeConnected,
  onSelect,
}) => {
  if (conversations.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-2.5 pt-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-0.5">
        {conversations.map((conv) => (
          <li key={conv.channel}>
            <ConversationRow
              conversation={conv}
              active={conv.channel === selectedChannel}
              muted={mutedSet.has(conv.channel)}
              realtimeConnected={realtimeConnected}
              onSelect={() => onSelect(conv)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface ConversationListProps {
  conversations: ChatConversationItem[];
  selectedChannel: string | null;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterRole: ChatRoleFilter;
  onFilterRoleChange: (role: ChatRoleFilter) => void;
  pinnedSet: Set<string>;
  mutedSet: Set<string>;
  realtimeConnected: boolean;
  onSelect: (conv: ChatConversationItem) => void;
  onMarkAllRead: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedChannel,
  loading,
  searchQuery,
  onSearchChange,
  filterRole,
  onFilterRoleChange,
  pinnedSet,
  mutedSet,
  realtimeConnected,
  onSelect,
  onMarkAllRead,
}) => {
  const citizenCount = useMemo(
    () => conversations.filter((c) => c.role === 'CITIZEN').length,
    [conversations]
  );
  const rescuerCount = useMemo(
    () => conversations.filter((c) => c.role === 'RESCUER').length,
    [conversations]
  );
  const authorityCount = useMemo(
    () => conversations.filter((c) => c.role === 'LOCAL_AUTHORITY').length,
    [conversations]
  );

  const filterChips = useMemo(() => {
    const chips: { key: ChatRoleFilter; label: string }[] = [{ key: 'ALL', label: 'Tất cả' }];
    if (citizenCount > 0) chips.push({ key: 'CITIZEN', label: 'Người dân' });
    if (rescuerCount > 0) chips.push({ key: 'RESCUER', label: 'Cứu hộ viên' });
    if (authorityCount > 0) chips.push({ key: 'LOCAL_AUTHORITY', label: 'Chính quyền' });
    chips.push({ key: 'ADMIN', label: 'Chỉ huy' });
    return chips;
  }, [authorityCount, citizenCount, rescuerCount]);

  const { pinned, recent } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = conversations
      .filter((c) => {
        if (filterRole === 'CITIZEN' && c.role !== 'CITIZEN') return false;
        if (filterRole === 'RESCUER' && c.role !== 'RESCUER') return false;
        if (filterRole === 'LOCAL_AUTHORITY' && c.role !== 'LOCAL_AUTHORITY') return false;
        if (filterRole === 'ADMIN' && c.role !== 'ADMIN' && c.channel !== 'COMMAND_GENERAL') {
          return false;
        }
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          Boolean(c.areaName && c.areaName.toLowerCase().includes(q)) ||
          Boolean(c.phone && c.phone.includes(q)) ||
          Boolean(c.latestMessage?.content?.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const ta = a.latestMessage?.createdAt || '';
        const tb = b.latestMessage?.createdAt || '';
        return tb.localeCompare(ta);
      });

    return {
      pinned: matches.filter((c) => pinnedSet.has(c.channel)),
      recent: matches.filter((c) => !pinnedSet.has(c.channel)),
    };
  }, [conversations, filterRole, searchQuery, pinnedSet]);

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, c) => sum + (mutedSet.has(c.channel) ? 0 : c.unreadCount || 0),
        0
      ),
    [conversations, mutedSet]
  );

  return (
    <nav aria-label="Danh sách cuộc trò chuyện" className="flex h-full min-h-0 flex-col bg-card">
      {/* Header matching shadcn-ref/features/chat/conversation-list.tsx */}
      <div className="flex flex-col gap-2.5 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2 ps-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              Trò chuyện
            </h2>
            {totalUnread > 0 && (
              <span className="font-mono text-xs text-primary tabular-nums">
                {totalUnread} chưa đọc
              </span>
            )}
          </div>
          {totalUnread > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onMarkAllRead}
              title="Đánh dấu đã đọc tất cả"
              className="text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Đã đọc
            </Button>
          )}
        </div>

        {/* Search InputGroup */}
        <div className="relative flex h-8 items-center rounded-lg border border-input bg-background px-2.5 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm cuộc trò chuyện..."
            aria-label="Tìm cuộc trò chuyện"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Xóa tìm kiếm"
              className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Compact role filter strip */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {filterChips.map((chip) => {
            const active = filterRole === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onFilterRoleChange(chip.key)}
                className={cn(
                  'shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Conversations List */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
        {loading && conversations.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <SyncLogoLoader size="sm" message="Đang tải danh sách liên lạc..." />
          </div>
        ) : pinned.length + recent.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessagesSquare className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">Không có kết quả</p>
            <p className="max-w-[220px] text-xs text-muted-foreground">
              {searchQuery
                ? `Không tìm thấy cuộc trò chuyện khớp với “${searchQuery}”.`
                : 'Chưa có cuộc trò chuyện nào trong mục này.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ConversationSection
              title="Đã ghim"
              conversations={pinned}
              selectedChannel={selectedChannel}
              mutedSet={mutedSet}
              realtimeConnected={realtimeConnected}
              onSelect={onSelect}
            />
            <ConversationSection
              title={pinned.length > 0 ? 'Gần đây' : 'Cuộc trò chuyện'}
              conversations={recent}
              selectedChannel={selectedChannel}
              mutedSet={mutedSet}
              realtimeConnected={realtimeConnected}
              onSelect={onSelect}
            />
          </div>
        )}
      </div>
    </nav>
  );
};

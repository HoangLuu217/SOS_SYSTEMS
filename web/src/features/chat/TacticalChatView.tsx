import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GripVertical, MessagesSquare } from 'lucide-react';
import type { User } from '@/types/auth';
import type { ChatConversationItem, ChatMessageItem, CitizenProfileInfo } from '@/types/chat';
import {
  fetchChatConversations,
  fetchChatMessages,
  fetchCitizenInfo,
  markAllChatMessagesRead,
  markChatMessagesRead,
  sendChatMessage,
  uploadChatImage,
} from '@/api';
import {
  joinChannelRoom,
  leaveChannelRoom,
  onSosUpdated,
  registerUserSocket,
  subscribeSocketChatEvents,
} from '@/services/socketService';
import { toast } from '@/components/common/toast';
import { ChatLightbox, CitizenProfileDrawer } from './ChatParts';
import { ConversationList, type ChatRoleFilter } from './ConversationList';
import { ChatThread } from './ChatThread';
import {
  SOS_STATUS_CONFIG,
  SOS_TYPE_LABELS,
  cleanChatName,
  parseGpsContent,
} from './chatUtils';

export { SOS_STATUS_CONFIG, SOS_TYPE_LABELS };

interface TacticalChatViewProps {
  currentUser?: User | null;
}

interface ChatLocalPrefs {
  pinned: string[];
  muted: string[];
}

const PREFS_STORAGE_KEY = 'sos_chat_prefs_v1';

function loadChatPrefs(): ChatLocalPrefs {
  if (typeof window === 'undefined') return { pinned: ['COMMAND_GENERAL'], muted: [] };
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { pinned: ['COMMAND_GENERAL'], muted: [] };
    const parsed = JSON.parse(raw) as Partial<ChatLocalPrefs>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
    };
  } catch {
    return { pinned: ['COMMAND_GENERAL'], muted: [] };
  }
}

function useDesktopSplit(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia('(min-width: 1024px)');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1024px)').matches : true),
    () => true
  );
}

/**
 * Chronicle Split-Pane Tactical Chat (faithful port of shadcn-ref/features/chat/chat-app.tsx)
 * Preserves 100% of real SosSystem Socket.IO messaging, SOS cards, GPS pins, Cloudinary uploads & Citizen drawer.
 */
export const TacticalChatView: React.FC<TacticalChatViewProps> = ({ currentUser }) => {
  const isSplit = useDesktopSplit();
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<ChatRoleFilter>('ALL');
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);

  // Pin & Mute preferences persisted in localStorage
  const [prefs, setPrefs] = useState<ChatLocalPrefs>(() => loadChatPrefs());
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned]);
  const mutedSet = useMemo(() => new Set(prefs.muted), [prefs.muted]);
  const mutedSetRef = useRef<Set<string>>(mutedSet);
  useEffect(() => {
    mutedSetRef.current = mutedSet;
  }, [mutedSet]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore quota errors
    }
  }, [prefs]);

  // Resizable left sidebar width (default 31%, clamped 280px..44%)
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidthPct, setSidebarWidthPct] = useState(31);
  const [draggingSplit, setDraggingSplit] = useState(false);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingSplit(true);
    const onMove = (ev: PointerEvent) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const rawPct = ((ev.clientX - box.left) / box.width) * 100;
      const minPct = Math.max(22, (280 / box.width) * 100);
      const clamped = Math.min(44, Math.max(minPct, rawPct));
      setSidebarWidthPct(clamped);
    };
    const onUp = () => {
      setDraggingSplit(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Live SOS status map for cards inside messages
  const [sosStatusMap, setSosStatusMap] = useState<Record<string, string>>({});
  const sosStatusMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    sosStatusMapRef.current = sosStatusMap;
  }, [sosStatusMap]);

  // Citizen slide-over drawer
  const [citizenModalData, setCitizenModalData] = useState<CitizenProfileInfo | null>(null);
  const [loadingCitizenModal, setLoadingCitizenModal] = useState(false);
  const [copiedPhoneText, setCopiedPhoneText] = useState(false);

  const activeConvRef = useRef<ChatConversationItem | null>(null);
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // Subtle Web Audio chime for incoming messages on non-muted conversations
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // ignore audio autoplay restrictions
    }
  }, []);

  const loadConversations = useCallback(async (selectFirst = false) => {
    setLoadingConv(true);
    try {
      const res = await fetchChatConversations();
      if (res.success && Array.isArray(res.data)) {
        setConversations(res.data);
        if (selectFirst && res.data.length > 0 && !activeConvRef.current) {
          setActiveConv(res.data[0]);
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải danh sách hội thoại:', err);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  const loadMessages = useCallback(async (conv: ChatConversationItem) => {
    setLoadingMsg(true);
    try {
      const params: { channel?: string; recipientId?: string } = {};
      if (conv.type === 'CHANNEL') {
        params.channel = conv.channel;
      } else if (conv.partnerId) {
        params.recipientId = conv.partnerId;
      }
      const res = await fetchChatMessages(params);
      if (res.success && res.data?.messages) {
        const nextMap: Record<string, string> = { ...sosStatusMapRef.current };
        res.data.messages.forEach((m: any) => {
          const sId =
            m.sosData?._id ||
            (typeof m.sosRequestId === 'object' ? m.sosRequestId?._id : m.sosRequestId);
          const sCode = m.sosData?.sosCode;
          const st =
            m.sosData?.status ||
            (typeof m.sosRequestId === 'object' ? m.sosRequestId?.status : undefined);
          if (sId && st) nextMap[String(sId)] = st;
          if (sCode && st) nextMap[String(sCode)] = st;
        });
        setSosStatusMap(nextMap);
        setMessages(res.data.messages);

        setConversations((prev) =>
          prev.map((c) =>
            c.channel === conv.channel || (conv.partnerId && c.partnerId === conv.partnerId)
              ? { ...c, unreadCount: 0 }
              : c
          )
        );
        window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));

        markChatMessagesRead({
          channel: conv.channel,
          partnerId: conv.partnerId,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Lỗi khi tải tin nhắn:', err);
    } finally {
      setLoadingMsg(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations(true);
  }, [loadConversations]);

  // Register Socket.IO user & area room
  useEffect(() => {
    if (currentUser?._id) {
      registerUserSocket(currentUser._id);
    }
    if (currentUser?.authority?.areaName) {
      const cleanSlug = currentUser.authority.areaName
        .toLowerCase()
        .replace(/\bp\.\s*/gi, 'phuong ')
        .replace(/\bx\.\s*/gi, 'xa ')
        .replace(/\btt\.\s*/gi, 'thi_tran ')
        .replace(/\bq\.\s*/gi, 'quan ')
        .replace(/\bh\.\s*/gi, 'huyen ')
        .replace(/\btp\.\s*/gi, 'thanh_pho ')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      joinChannelRoom(`area_${cleanSlug}`);
    }
  }, [currentUser?._id, currentUser?.authority?.areaName]);

  // Join room & fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConv) return;
    void loadMessages(activeConv);
    joinChannelRoom(activeConv.channel);
    return () => {
      leaveChannelRoom(activeConv.channel);
    };
  }, [activeConv, loadMessages]);

  // Subscribe realtime chat events
  useEffect(() => {
    const unsubscribe = subscribeSocketChatEvents(
      async (payload) => {
        if (payload.action !== 'NEW_MESSAGE') return;
        const newMsg = payload.data;
        const currentActive = activeConvRef.current;

        const isCurrentChannel =
          currentActive &&
          (newMsg.channel === currentActive.channel ||
            (currentActive.partnerId &&
              typeof newMsg.senderId === 'object' &&
              newMsg.senderId?._id === currentActive.partnerId));

        if (isCurrentChannel) {
          setMessages((prev) =>
            prev.some((m) => m._id === newMsg._id) ? prev : [...prev, newMsg]
          );

          const senderIdStr =
            typeof newMsg.senderId === 'object' ? newMsg.senderId?._id : newMsg.senderId;
          if (senderIdStr !== currentUser?._id) {
            if (!mutedSetRef.current.has(currentActive.channel)) {
              playChime();
            }
            markChatMessagesRead({
              channel: currentActive.channel,
              partnerId: currentActive.partnerId,
            }).catch(() => {});
          }
        } else {
          if (!mutedSetRef.current.has(newMsg.channel)) {
            playChime();
          }
          setConversations((prev) => {
            const exists = prev.some((c) => c.channel === newMsg.channel);
            if (!exists) {
              void loadConversations();
              return prev;
            }
            return prev.map((c) =>
              c.channel === newMsg.channel
                ? {
                    ...c,
                    unreadCount: (c.unreadCount || 0) + 1,
                    latestMessage: {
                      content: newMsg.content,
                      senderName: newMsg.senderName,
                      createdAt: newMsg.createdAt,
                    },
                  }
                : c
            );
          });
        }
      },
      (connected) => setRealtimeConnected(connected)
    );
    return () => unsubscribe();
  }, [currentUser?._id, loadConversations, playChime]);

  // Realtime SOS status sync for embedded SOS cards
  useEffect(() => {
    const unsubSos = onSosUpdated((updatedSos: any) => {
      if (!updatedSos) return;
      const sId = String(updatedSos._id || '');
      const sCode = String(updatedSos.sosCode || '');
      const newStatus = updatedSos.status;
      if (!newStatus) return;

      setSosStatusMap((prev) => {
        const next = { ...prev };
        if (sId) next[sId] = newStatus;
        if (sCode) next[sCode] = newStatus;
        return next;
      });

      setMessages((prevMsgs) =>
        prevMsgs.map((m) => {
          const msgSosId = String(
            m.sosData?._id ||
              (typeof m.sosRequestId === 'object'
                ? (m.sosRequestId as any)?._id
                : m.sosRequestId) ||
              ''
          );
          const msgSosCode = String(m.sosData?.sosCode || '');
          const isMatch =
            (sId && msgSosId === sId) ||
            (sCode && msgSosCode === sCode) ||
            (sCode && typeof m.content === 'string' && m.content.includes(sCode));
          if (!isMatch) return m;

          const nextSosData = m.sosData ? { ...m.sosData, status: newStatus } : undefined;
          const nextContent =
            typeof m.content === 'string' && m.content.includes('Trạng thái hiện tại:')
              ? m.content.replace(
                  /Trạng thái hiện tại:\s*[^\n]+/i,
                  `Trạng thái hiện tại: ${SOS_STATUS_CONFIG[newStatus]?.label || newStatus}`
                )
              : m.content;
          return { ...m, sosData: nextSosData, content: nextContent };
        })
      );
    });
    return () => unsubSos();
  }, []);

  // Close drawer / lightbox on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxImg) setLightboxImg(null);
      else if (citizenModalData) setCitizenModalData(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [citizenModalData, lightboxImg]);

  const handleSelectConversation = (conv: ChatConversationItem) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.channel === conv.channel || (conv.partnerId && c.partnerId === conv.partnerId)
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
    window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));
    setActiveConv(conv);
    setMobileThreadOpen(true);
  };

  const handleMarkAllRead = async () => {
    setConversations((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })));
    window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));
    try {
      await markAllChatMessagesRead();
      toast.success('Đã đánh dấu đã đọc tất cả cuộc trò chuyện.');
    } catch (err) {
      console.warn('Lỗi khi đánh dấu tất cả đã đọc:', err);
    }
  };

  const handleTogglePin = (channel: string) => {
    setPrefs((prev) => {
      const exists = prev.pinned.includes(channel);
      return {
        ...prev,
        pinned: exists ? prev.pinned.filter((id) => id !== channel) : [channel, ...prev.pinned],
      };
    });
  };

  const handleToggleMute = (conv: ChatConversationItem) => {
    const wasMuted = mutedSet.has(conv.channel);
    setPrefs((prev) => ({
      ...prev,
      muted: wasMuted
        ? prev.muted.filter((id) => id !== conv.channel)
        : [...prev.muted, conv.channel],
    }));
    toast.info(
      wasMuted
        ? `Đã bật âm thanh cho ${cleanChatName(conv.name)}`
        : `Đã tắt âm thanh cho ${cleanChatName(conv.name)}`
    );
  };

  const handleSend = async () => {
    const text = inputContent.trim();
    if (!text || !activeConv || sending) return;

    setSending(true);
    try {
      const payload: { content: string; recipientId?: string; channel?: string } = {
        content: text,
      };
      if (activeConv.type === 'CHANNEL') payload.channel = activeConv.channel;
      else if (activeConv.partnerId) payload.recipientId = activeConv.partnerId;

      const res = await sendChatMessage(payload);
      if (res.success && res.data) {
        setInputContent('');
        setMessages((prev) =>
          prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.channel === activeConv.channel
              ? {
                  ...c,
                  latestMessage: {
                    content: res.data.content,
                    senderName: res.data.senderName,
                    createdAt: res.data.createdAt,
                  },
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Lỗi khi gửi tin nhắn:', err);
      toast.error('Không thể gửi tin nhắn. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv || uploadingImg) return;

    setUploadingImg(true);
    try {
      const uploadRes = await uploadChatImage(file);
      const uploadedUrl = uploadRes.url || uploadRes.data?.url;
      if (!uploadedUrl) throw new Error('Không nhận được đường dẫn ảnh.');

      const caption = inputContent.trim();
      const payload: {
        content: string;
        recipientId?: string;
        channel?: string;
        attachments?: Array<{ url: string; fileType: string; fileName: string }>;
      } = {
        content: caption || '[Hình ảnh]',
        attachments: [
          {
            url: uploadedUrl,
            fileType: 'IMAGE',
            fileName: file.name || `photo_${Date.now()}.jpg`,
          },
        ],
      };

      if (activeConv.type === 'CHANNEL') payload.channel = activeConv.channel;
      else if (activeConv.partnerId) payload.recipientId = activeConv.partnerId;

      const res = await sendChatMessage(payload);
      if (res.success && res.data) {
        setInputContent('');
        setMessages((prev) =>
          prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]
        );
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh lên chat:', err);
      toast.error('Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setUploadingImg(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleViewOnRescueMap = (
    lat: number,
    lng: number,
    senderName?: string,
    address?: string
  ) => {
    const detail = { lat, lng, senderName: senderName || 'Người dân', address: address || '' };
    try {
      sessionStorage.setItem('sos_highlight_chat_location', JSON.stringify(detail));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('sos_navigate_tab', { detail: { key: 'map' } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sos_highlight_chat_location', { detail }));
    }, 250);
  };

  const handleNavigateToSosRequests = (sosCode?: string) => {
    window.dispatchEvent(
      new CustomEvent('sos_navigate_tab', {
        detail: { key: 'sos_requests', subPath: sosCode },
      })
    );
  };

  const handleOpenCitizenInfo = async (userId?: string, fallbackInfo?: any) => {
    const initialFallback: CitizenProfileInfo = {
      _id: userId || fallbackInfo?.partnerId || fallbackInfo?._id || '',
      fullName:
        fallbackInfo?.fullName || fallbackInfo?.name || fallbackInfo?.senderName || 'Người dân',
      phone: fallbackInfo?.phone || fallbackInfo?.senderId?.phone || activeConv?.phone || '',
      address:
        fallbackInfo?.address ||
        fallbackInfo?.senderId?.address ||
        activeConv?.address ||
        activeConv?.areaName ||
        '',
      email: fallbackInfo?.email || fallbackInfo?.senderId?.email || activeConv?.email || '',
      roles: fallbackInfo?.roles || fallbackInfo?.senderId?.roles || ['CITIZEN'],
      avatarUrl:
        fallbackInfo?.avatarUrl || fallbackInfo?.senderId?.avatarUrl || activeConv?.avatarUrl,
      emergencyContact:
        fallbackInfo?.emergencyContact ||
        fallbackInfo?.partnerUser?.emergencyContact ||
        fallbackInfo?.senderId?.citizen?.emergencyContact ||
        null,
      emergencyContacts:
        fallbackInfo?.emergencyContacts ||
        fallbackInfo?.partnerUser?.emergencyContacts ||
        fallbackInfo?.senderId?.citizen?.emergencyContacts ||
        [],
      latestSos: fallbackInfo?.latestSos || null,
    };

    setCitizenModalData(initialFallback);

    const targetUserId = userId || activeConv?.partnerId;
    if (targetUserId && typeof targetUserId === 'string' && targetUserId.length === 24) {
      setLoadingCitizenModal(true);
      try {
        const res = await fetchCitizenInfo(targetUserId);
        if (res.success && res.data) {
          setCitizenModalData((prev) => (prev ? { ...prev, ...res.data } : res.data));
        }
      } catch (err) {
        console.warn('Lỗi lấy thông tin người dân:', err);
      } finally {
        setLoadingCitizenModal(false);
      }
    }
  };

  const handleCopyPhone = (phone?: string) => {
    if (!phone) return;
    navigator.clipboard?.writeText(phone).then(() => {
      setCopiedPhoneText(true);
      window.setTimeout(() => setCopiedPhoneText(false), 2000);
    });
  };

  const renderEmptyThread = () => (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 bg-card p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <MessagesSquare className="size-6" />
      </span>
      <p className="text-sm font-medium text-foreground">Chọn một cuộc trò chuyện</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Chọn kênh hoặc cán bộ ở cột bên trái để bắt đầu trao đổi cứu hộ.
      </p>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-[520px] w-full flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-(--surface-shadow) ring-1 ring-foreground/5"
    >
      {isSplit ? (
        <>
          <div
            className="h-full min-h-0 shrink-0"
            style={{ width: `${sidebarWidthPct}%`, minWidth: 280, maxWidth: '44%' }}
          >
            <ConversationList
              conversations={conversations}
              selectedChannel={activeConv?.channel ?? null}
              loading={loadingConv}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterRole={filterRole}
              onFilterRoleChange={setFilterRole}
              pinnedSet={pinnedSet}
              mutedSet={mutedSet}
              realtimeConnected={realtimeConnected}
              onSelect={handleSelectConversation}
              onMarkAllRead={() => void handleMarkAllRead()}
            />
          </div>

          {/* ResizableHandle withHandle (exact visual match to shadcn-ref) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Điều chỉnh độ rộng danh sách trò chuyện"
            onPointerDown={handleResizePointerDown}
            className="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border select-none after:absolute after:inset-y-0 after:-left-1.5 after:w-3"
          >
            <div
              className={`z-10 flex h-6 w-3.5 items-center justify-center rounded-sm border border-border bg-background text-muted-foreground shadow-xs transition-colors group-hover:bg-muted group-hover:text-foreground ${
                draggingSplit ? 'bg-primary text-primary-foreground' : ''
              }`}
            >
              <GripVertical className="size-2.5" />
            </div>
          </div>

          <div className="h-full min-h-0 min-w-0 flex-1">
            {activeConv ? (
              <ChatThread
                conversation={activeConv}
                messages={messages}
                currentUserId={currentUser?._id}
                loadingMessages={loadingMsg}
                sending={sending}
                uploadingImg={uploadingImg}
                inputContent={inputContent}
                pinned={pinnedSet.has(activeConv.channel)}
                muted={mutedSet.has(activeConv.channel)}
                realtimeConnected={realtimeConnected}
                sosStatusMap={sosStatusMap}
                onInputChange={setInputContent}
                onSend={() => void handleSend()}
                onImageFileSelected={(e) => void handleImageFileChange(e)}
                onTogglePin={() => handleTogglePin(activeConv.channel)}
                onToggleMute={() => handleToggleMute(activeConv)}
                onRefresh={() => void loadMessages(activeConv)}
                onOpenCitizenInfo={(uId, info) => void handleOpenCitizenInfo(uId, info)}
                onViewOnMap={handleViewOnRescueMap}
                onNavigateSos={handleNavigateToSosRequests}
                onOpenLightbox={setLightboxImg}
              />
            ) : (
              renderEmptyThread()
            )}
          </div>
        </>
      ) : mobileThreadOpen && activeConv ? (
        <div className="h-full min-h-0 w-full flex-1">
          <ChatThread
            conversation={activeConv}
            messages={messages}
            currentUserId={currentUser?._id}
            loadingMessages={loadingMsg}
            sending={sending}
            uploadingImg={uploadingImg}
            inputContent={inputContent}
            pinned={pinnedSet.has(activeConv.channel)}
            muted={mutedSet.has(activeConv.channel)}
            realtimeConnected={realtimeConnected}
            sosStatusMap={sosStatusMap}
            onBack={() => setMobileThreadOpen(false)}
            onInputChange={setInputContent}
            onSend={() => void handleSend()}
            onImageFileSelected={(e) => void handleImageFileChange(e)}
            onTogglePin={() => handleTogglePin(activeConv.channel)}
            onToggleMute={() => handleToggleMute(activeConv)}
            onRefresh={() => void loadMessages(activeConv)}
            onOpenCitizenInfo={(uId, info) => void handleOpenCitizenInfo(uId, info)}
            onViewOnMap={handleViewOnRescueMap}
            onNavigateSos={handleNavigateToSosRequests}
            onOpenLightbox={setLightboxImg}
          />
        </div>
      ) : (
        <div className="h-full min-h-0 w-full flex-1">
          <ConversationList
            conversations={conversations}
            selectedChannel={null}
            loading={loadingConv}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterRole={filterRole}
            onFilterRoleChange={setFilterRole}
            pinnedSet={pinnedSet}
            mutedSet={mutedSet}
            realtimeConnected={realtimeConnected}
            onSelect={handleSelectConversation}
            onMarkAllRead={() => void handleMarkAllRead()}
          />
        </div>
      )}

      <ChatLightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />

      <CitizenProfileDrawer
        citizen={citizenModalData}
        activeConv={activeConv}
        loading={loadingCitizenModal}
        copiedPhone={copiedPhoneText}
        onCopyPhone={handleCopyPhone}
        onClose={() => setCitizenModalData(null)}
        onViewOnMap={handleViewOnRescueMap}
        onNavigateSos={handleNavigateToSosRequests}
        onOpenGeneralMap={() => {
          const gps = parseGpsContent(
            messages.find((m) => m.content.includes('[Tọa độ GPS'))?.content || ''
          );
          if (gps && citizenModalData) {
            handleViewOnRescueMap(gps.lat, gps.lng, citizenModalData.fullName, citizenModalData.address);
          } else {
            window.dispatchEvent(new CustomEvent('sos_navigate_tab', { detail: { key: 'map' } }));
          }
          setCitizenModalData(null);
        }}
      />
    </div>
  );
};

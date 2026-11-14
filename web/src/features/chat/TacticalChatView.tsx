import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  UserCheck,
  Phone,
  MapPin,
  AlertTriangle,
  FileCheck,
  Users,
  LayoutGrid,
  Building2,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCheck,
  ArrowLeft,
  Radio,
  MoreVertical,
  RefreshCw,
  MessageSquare,
  AlertOctagon,
  Compass,
  ExternalLink,
  Map,
  Activity,
  Image as ImageIcon,
  Send,
  LifeBuoy,
  Clock,
  Copy,
  Maximize2,
  Info,
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { ChatMessageItem, ChatConversationItem, CitizenProfileInfo } from '@/types/chat';
import {
  fetchChatConversations,
  fetchChatMessages,
  sendChatMessage,
  uploadChatImage,
  markChatMessagesRead,
  markAllChatMessagesRead,
  fetchCitizenInfo,
} from '@/api';
import {
  subscribeSocketChatEvents,
  joinChannelRoom,
  leaveChannelRoom,
  registerUserSocket,
  onSosUpdated,
} from '@/services/socketService';
import './TacticalChat.css';

interface TacticalChatViewProps {
  currentUser?: User | null;
}

const cleanChatName = (name: string) =>
  name.replace(/tác chiến\s*/gi, '').replace(/\s+/g, ' ').trim();

interface ChatAvatarProps {
  src?: string | null;
  alt?: string;
  role?: string;
  name?: string;
  isChannel?: boolean;
  size?: number;
  iconSize?: number;
  className?: string;
}

const ChatAvatar: React.FC<ChatAvatarProps> = ({
  src,
  alt,
  role,
  name,
  isChannel,
  size = 40,
  iconSize = 16,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const isCitizen = role === 'CITIZEN';
  const isAdmin = role === 'ADMIN';

  const avatarRoleClass = isCitizen
    ? 'citizen'
    : isChannel
    ? 'channel'
    : isAdmin
    ? 'admin'
    : 'authority';

  const initialLetter =
    (name || 'C')
      .replace(/^(phường|xã|cán bộ|quản trị|bql|bch)\s+/i, '')
      .trim()
      .charAt(0)
      .toUpperCase() || 'C';

  return (
    <div
      className={`sos-chat-avatar ${avatarRoleClass} ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          onError={() => setImgError(true)}
        />
      ) : isCitizen ? (
        <Users size={iconSize} />
      ) : isChannel ? (
        <Radio size={iconSize} />
      ) : isAdmin ? (
        <ShieldCheck size={iconSize} />
      ) : (
        initialLetter
      )}
    </div>
  );
};

export const SOS_TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Cấp cứu y tế / Bị thương',
  FIRE: 'Hỏa hoạn / Cháy nổ',
  FLOOD: 'Cứu hộ ngập lụt / Mắc kẹt',
  LANDSLIDE: 'Sạt lở đất / Đổ sập',
  STORM: 'Bão lốc / Cây đổ',
  ACCIDENT: 'Tai nạn khẩn cấp',
  MISSING_PERSON: 'Tìm kiếm người mất tích',
  RESCUE: 'Cứu hộ khẩn cấp',
  FOOD: 'Cứu trợ lương thực',
  EVACUATION: 'Sơ tán khẩn cấp',
  OTHER: 'Cứu nạn khẩn cấp khác',
};

export const SOS_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  PENDING: { label: 'Chờ tiếp nhận', color: '#D97706', bgColor: '#FEF3C7' },
  VERIFIED: { label: 'Đã xác minh', color: '#0284C7', bgColor: '#E0F2FE' },
  ASSIGNED: { label: 'Đã phân công', color: '#7C3AED', bgColor: '#EDE9FE' },
  ACCEPTED: { label: 'Đội đã nhận lệnh', color: '#7C3AED', bgColor: '#EDE9FE' },
  ON_THE_WAY: { label: 'Đang di chuyển tới', color: '#2563EB', bgColor: '#EFF6FF' },
  EN_ROUTE: { label: 'Đang di chuyển tới', color: '#2563EB', bgColor: '#EFF6FF' },
  ARRIVED: { label: 'Đã tiếp cận hiện trường', color: '#059669', bgColor: '#D1FAE5' },
  IN_PROGRESS: { label: 'Đang cứu hộ', color: '#2563EB', bgColor: '#EFF6FF' },
  RESCUING: { label: 'Đang cứu nạn', color: '#DC2626', bgColor: '#FEE2E2' },
  COMPLETED: { label: 'Hoàn thành', color: '#16A34A', bgColor: '#DCFCE7' },
  RESOLVED: { label: 'Đã giải quyết', color: '#16A34A', bgColor: '#DCFCE7' },
  CANCELLED: { label: 'Đã hủy', color: '#DC2626', bgColor: '#FEE2E2' },
  REJECTED: { label: 'Từ chối', color: '#DC2626', bgColor: '#FEE2E2' },
};

// Trích xuất thông tin SOS từ tin nhắn
const parseSosMessage = (msg: ChatMessageItem, liveStatusMap?: Record<string, string>) => {
  const isSos =
    Boolean(msg.sosRequestId) ||
    Boolean(msg.sosData) ||
    (typeof msg.content === 'string' &&
      (msg.content.includes('[YÊU CẦU CỨU NẠN KHẨN CẤP]') ||
        msg.content.includes('🆘 [YÊU CẦU CỨU NẠN') ||
        msg.content.includes('Mã cứu trợ: SOS-')));

  if (!isSos) return null;

  if (msg.sosData && typeof msg.sosData === 'object') {
    const s = msg.sosData;
    const typeLabel =
      SOS_TYPE_LABELS[s.emergencyType] ||
      (Array.isArray(s.emergencyTypes) && s.emergencyTypes.length > 0
        ? s.emergencyTypes.map((t: string) => SOS_TYPE_LABELS[t] || t).join(', ')
        : s.emergencyType || 'Cứu hộ khẩn cấp');
    const coords = s.location?.coordinates;
    const lat = typeof coords?.[1] === 'number' ? coords[1] : undefined;
    const lng = typeof coords?.[0] === 'number' ? coords[0] : undefined;

    const rawId = String(s._id || (typeof msg.sosRequestId === 'object' ? (msg.sosRequestId as any)?._id : msg.sosRequestId) || '');
    const rawCode = String(s.sosCode || '');
    const liveStatus = (liveStatusMap && ((rawId && liveStatusMap[rawId]) || (rawCode && liveStatusMap[rawCode]))) || s.status || 'PENDING';
    const statusCfg = SOS_STATUS_CONFIG[liveStatus] || SOS_STATUS_CONFIG['PENDING'];

    return {
      sosId: s._id || msg.sosRequestId,
      sosCode: s.sosCode || 'SOS',
      typeLabel,
      people: s.people || 1,
      address: s.address || '',
      phone: s.contactPhone || '',
      description: s.description || '',
      status: liveStatus,
      statusLabel: statusCfg.label,
      statusColor: statusCfg.color,
      statusBgColor: statusCfg.bgColor,
      coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
      images: Array.isArray(s.images)
        ? s.images
        : Array.isArray(msg.attachments)
          ? msg.attachments.map((a) => a.url).filter(Boolean)
          : [],
    };
  }

  const content = msg.content || '';
  const codeMatch = content.match(/Mã cứu trợ:\s*(SOS-[A-Z0-9\-]+)/i);
  const typeMatch = content.match(/Loại yêu cầu:\s*([^\n]+)/i);
  const peopleMatch = content.match(/Số người gặp nạn:\s*([0-9]+)/i);
  const addrMatch = content.match(/Địa chỉ:\s*([^\n]+)/i);
  const gpsMatch = content.match(/Tọa độ GPS:\s*([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/i);
  const phoneMatch = content.match(/Số điện thoại:\s*([0-9\+\s]+)/i);
  const descMatch = content.match(/Tình trạng:\s*([^\n]+)/i);
  const statusMatch = content.match(/Trạng thái hiện tại:\s*([^\n]+)/i);

  const rawStatus = statusMatch ? statusMatch[1].trim() : 'PENDING';
  const matchedKey =
    Object.keys(SOS_STATUS_CONFIG).find(
      (k) => SOS_STATUS_CONFIG[k].label.toLowerCase() === rawStatus.toLowerCase()
    ) || 'PENDING';

  const rawCode = codeMatch ? codeMatch[1].trim() : '';
  const rawId = String((typeof msg.sosRequestId === 'object' ? (msg.sosRequestId as any)?._id : msg.sosRequestId) || '');
  const liveStatus = (liveStatusMap && ((rawId && liveStatusMap[rawId]) || (rawCode && liveStatusMap[rawCode]))) || matchedKey;
  const statusCfg = SOS_STATUS_CONFIG[liveStatus] || SOS_STATUS_CONFIG['PENDING'];

  return {
    sosId: msg.sosRequestId || undefined,
    sosCode: rawCode || 'SOS',
    typeLabel: typeMatch ? typeMatch[1].trim() : 'Cứu hộ khẩn cấp',
    people: peopleMatch ? parseInt(peopleMatch[1], 10) : 1,
    address: addrMatch ? addrMatch[1].trim() : '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    status: liveStatus,
    statusLabel: statusCfg.label,
    statusColor: statusCfg.color,
    statusBgColor: statusCfg.bgColor,
    coords:
      gpsMatch
        ? { lat: parseFloat(gpsMatch[1]), lng: parseFloat(gpsMatch[2]) }
        : null,
    images: Array.isArray(msg.attachments) ? msg.attachments.map((a) => a.url).filter(Boolean) : [],
  };
};

// Tách tọa độ GPS và địa chỉ gần từ tin nhắn
const parseGpsContent = (content: string) => {
  if (!content) return null;
  const match = content.match(/([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;

  const addrMatch = content.match(/\(Vị trí gần:\s*([^\)]+)\)/i);
  const address = addrMatch ? addrMatch[1].trim() : '';

  return { lat, lng, address };
};

export const TacticalChatView: React.FC<TacticalChatViewProps> = ({ currentUser }) => {
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'CITIZEN' | 'LOCAL_AUTHORITY' | 'ADMIN'>('ALL');
  const [, setRealtimeConnected] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [sosStatusMap, setSosStatusMap] = useState<Record<string, string>>({});
  const sosStatusMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    sosStatusMapRef.current = sosStatusMap;
  }, [sosStatusMap]);

  // Xem chi tiết thông tin người dân (SĐT, Địa chỉ, Người thân, Ca SOS)
  const [citizenModalData, setCitizenModalData] = useState<CitizenProfileInfo | null>(null);
  const [loadingCitizenModal, setLoadingCitizenModal] = useState(false);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [copiedPhoneText, setCopiedPhoneText] = useState(false);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowDropdownMenu(false);
      }
    };
    if (showFilterDropdown || showDropdownMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown, showDropdownMenu]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeConvRef = useRef<ChatConversationItem | null>(null);
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // Phát âm thanh nhẹ khi có tin nhắn mới (Web Audio API)
  const playChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (_) { }
  }, []);

  // Tự động cuộn xuống tin nhắn mới nhất
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  // Tải danh sách hội thoại
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

  // Tải lịch sử tin nhắn của hội thoại đang mở
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
        const newMap: Record<string, string> = { ...sosStatusMapRef.current };
        res.data.messages.forEach((m: any) => {
          const sId = m.sosData?._id || (typeof m.sosRequestId === 'object' ? m.sosRequestId?._id : m.sosRequestId);
          const sCode = m.sosData?.sosCode;
          const st = m.sosData?.status || (typeof m.sosRequestId === 'object' ? m.sosRequestId?.status : undefined);
          if (sId && st) newMap[String(sId)] = st;
          if (sCode && st) newMap[String(sCode)] = st;
        });
        setSosStatusMap(newMap);
        setMessages(res.data.messages);
        setTimeout(() => scrollToBottom(false), 80);

        // Giảm unread trong danh sách hội thoại ngay lập tức
        setConversations((prev) =>
          prev.map((c) =>
            c.channel === conv.channel || (conv.partnerId && c.partnerId === conv.partnerId)
              ? { ...c, unreadCount: 0 }
              : c
          )
        );

        // Báo cho Sidebar cập nhật lại badge
        window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));

        // Đánh dấu đã đọc trên cơ sở dữ liệu
        try {
          await markChatMessagesRead({
            channel: conv.channel,
            partnerId: conv.partnerId,
          });
        } catch (readErr) {
          console.warn('Lỗi khi đánh dấu đã đọc trên server:', readErr);
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải tin nhắn:', err);
    } finally {
      setLoadingMsg(false);
    }
  }, [scrollToBottom]);

  // Khởi tạo & Tải dữ liệu ban đầu
  useEffect(() => {
    loadConversations(true);
  }, [loadConversations]);

  // Đánh dấu đã đọc toàn bộ hội thoại
  const handleMarkAllRead = async () => {
    setConversations((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })));
    window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));
    try {
      await markAllChatMessagesRead();
    } catch (err) {
      console.warn('Lỗi khi đánh dấu tất cả đã đọc:', err);
    }
  };

  // Mở tọa độ trực tiếp trên Bản đồ cứu hộ (Map)
  const handleViewOnRescueMap = (lat: number, lng: number, senderName?: string, address?: string) => {
    const detail = {
      lat,
      lng,
      senderName: senderName || 'Người dân',
      address: address || '',
    };
    try {
      sessionStorage.setItem('sos_highlight_chat_location', JSON.stringify(detail));
    } catch { }

    window.dispatchEvent(new CustomEvent('sos_navigate_tab', { detail: { key: 'map' } }));

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sos_highlight_chat_location', { detail }));
    }, 250);
  };

  // Chuyển sang Tab Quản lý ca SOS của Ban chỉ huy
  const handleNavigateToSosRequests = (sosCode?: string) => {
    window.dispatchEvent(
      new CustomEvent('sos_navigate_tab', {
        detail: { key: 'sos_requests', subPath: sosCode },
      })
    );
  };

  // Mở modal xem chi tiết thông tin người dân (Họ tên, SĐT, Địa chỉ, Người thân, Ca SOS)
  const handleOpenCitizenInfo = async (userId?: string, fallbackInfo?: any) => {
    setShowDropdownMenu(false);

    // Dùng dữ liệu fallback hiển thị ngay lập tức (không delay)
    const initialFallback: CitizenProfileInfo = {
      _id: userId || fallbackInfo?.partnerId || fallbackInfo?._id || '',
      fullName: fallbackInfo?.fullName || fallbackInfo?.name || fallbackInfo?.senderName || 'Người dân',
      phone: fallbackInfo?.phone || fallbackInfo?.senderId?.phone || activeConv?.phone || '',
      address: fallbackInfo?.address || fallbackInfo?.senderId?.address || activeConv?.address || activeConv?.areaName || '',
      email: fallbackInfo?.email || fallbackInfo?.senderId?.email || activeConv?.email || '',
      roles: fallbackInfo?.roles || fallbackInfo?.senderId?.roles || ['CITIZEN'],
      avatarUrl: fallbackInfo?.avatarUrl || fallbackInfo?.senderId?.avatarUrl || activeConv?.avatarUrl,
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
          setCitizenModalData((prev) => ({
            ...prev,
            ...res.data,
          }));
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
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedPhoneText(true);
      setTimeout(() => setCopiedPhoneText(false), 2000);
    });
  };

  const handleCloseCitizenDrawer = useCallback(() => {
    setIsDrawerClosing(true);
    setTimeout(() => {
      setCitizenModalData(null);
      setIsDrawerClosing(false);
    }, 200);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && citizenModalData) {
        handleCloseCitizenDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [citizenModalData, handleCloseCitizenDrawer]);

  const totalUnreadCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Đăng ký người dùng Socket.IO & Tham gia phòng địa bàn phụ trách
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
      const areaChannel = `area_${cleanSlug}`;
      joinChannelRoom(areaChannel);
    }
  }, [currentUser?._id, currentUser?.authority?.areaName]);

  // Khi chuyển đổi cuộc trò chuyện: tải tin nhắn và tham gia phòng socket tương ứng
  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv);
      joinChannelRoom(activeConv.channel);
      return () => {
        leaveChannelRoom(activeConv.channel);
      };
    }
  }, [activeConv, loadMessages]);

  // ĐĂNG KÝ SỰ KIỆN THỜI GIAN THỰC QUA SOCKET.IO
  useEffect(() => {
    const unsubscribe = subscribeSocketChatEvents(
      async (payload) => {
        if (payload.action === 'NEW_MESSAGE') {
          const newMsg = payload.data;
          const currentActive = activeConvRef.current;

          // Kiểm tra xem tin nhắn có thuộc kênh đang mở không
          const isCurrentChannel = currentActive && (
            newMsg.channel === currentActive.channel ||
            (currentActive.partnerId &&
              typeof newMsg.senderId === 'object' &&
              newMsg.senderId?._id === currentActive.partnerId)
          );

          if (isCurrentChannel) {
            setMessages((prev) => {
              if (prev.some((m) => m._id === newMsg._id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom(true);

            const senderIdStr = typeof newMsg.senderId === 'object' ? newMsg.senderId?._id : newMsg.senderId;
            if (senderIdStr !== currentUser?._id) {
              playChime();
              markChatMessagesRead({
                channel: currentActive.channel,
                partnerId: currentActive.partnerId,
              }).catch(() => { });
            }
          } else {
            playChime();
            setConversations((prev) => {
              const channelExists = prev.some((c) => c.channel === newMsg.channel);
              if (!channelExists) {
                loadConversations();
                return prev;
              }
              return prev.map((c) => {
                if (c.channel === newMsg.channel) {
                  return {
                    ...c,
                    unreadCount: (c.unreadCount || 0) + 1,
                    latestMessage: {
                      content: newMsg.content,
                      senderName: newMsg.senderName,
                      createdAt: newMsg.createdAt,
                    },
                  };
                }
                return c;
              });
            });
          }
        }
      },
      (connected) => {
        setRealtimeConnected(connected);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?._id, loadConversations, playChime, scrollToBottom]);

  // Lắng nghe sự kiện SOS cập nhật trạng thái realtime (đặc biệt khi người dân bấm HỦY)
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
            (typeof m.sosRequestId === 'object' ? (m.sosRequestId as any)?._id : m.sosRequestId) ||
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

          return {
            ...m,
            sosData: nextSosData,
            content: nextContent,
          };
        })
      );
    });

    return () => {
      unsubSos();
    };
  }, []);

  // Gửi tin nhắn
  const handleSend = async (contentToSend?: string) => {
    const text = (contentToSend || inputContent).trim();
    if (!text || !activeConv || sending) return;

    setSending(true);
    try {
      const payload: { content: string; recipientId?: string; channel?: string } = {
        content: text,
      };

      if (activeConv.type === 'CHANNEL') {
        payload.channel = activeConv.channel;
      } else if (activeConv.partnerId) {
        payload.recipientId = activeConv.partnerId;
      }

      const res = await sendChatMessage(payload);
      if (res.success && res.data) {
        setInputContent('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.data._id)) return prev;
          return [...prev, res.data];
        });
        scrollToBottom(true);

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
    } finally {
      setSending(false);
    }
  };

  // Chọn và gửi hình ảnh lên Cloudinary từ máy tính
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv || uploadingImg) return;

    setUploadingImg(true);
    try {
      const uploadRes = await uploadChatImage(file);
      const uploadedUrl = uploadRes.url || uploadRes.data?.url;
      if (!uploadedUrl) {
        throw new Error('Không nhận được liên kết ảnh Cloudinary từ máy chủ');
      }

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

      if (activeConv.type === 'CHANNEL') {
        payload.channel = activeConv.channel;
      } else if (activeConv.partnerId) {
        payload.recipientId = activeConv.partnerId;
      }

      const res = await sendChatMessage(payload);
      if (res.success && res.data) {
        setInputContent('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.data._id)) return prev;
          return [...prev, res.data];
        });
        scrollToBottom(true);
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh lên chat:', err);
      alert('Không thể tải ảnh lên máy chủ Cloudinary. Vui lòng thử lại.');
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Nhấn Enter để gửi, Shift + Enter để xuống dòng; không gửi khi đang nhập IME
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.nativeEvent as any).isComposing || e.keyCode === 229) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  // Tự động co giãn textarea trong giới hạn
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value);
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  // Phân loại cuộc hội thoại cho menu mục lục
  const citizenCount = conversations.filter((c) => c.role === 'CITIZEN').length;
  const authorityCount = conversations.filter((c) => c.role === 'LOCAL_AUTHORITY').length;
  const adminCount = conversations.filter((c) => c.role === 'ADMIN' || c.channel === 'COMMAND_GENERAL').length;

  const filterOptions = [
    { key: 'ALL' as const, label: 'Tất cả cuộc hội thoại', shortLabel: 'Tất cả', count: conversations.length, icon: LayoutGrid },
    ...(citizenCount > 0
      ? [{ key: 'CITIZEN' as const, label: 'Người dân địa bàn', shortLabel: 'Người dân', count: citizenCount, icon: Users }]
      : []),
    { key: 'LOCAL_AUTHORITY' as const, label: 'Cán bộ chính quyền', shortLabel: 'Chính quyền', count: authorityCount, icon: Building2 },
    { key: 'ADMIN' as const, label: 'Ban chỉ huy', shortLabel: 'Ban chỉ huy', count: adminCount, icon: ShieldCheck },
  ];

  const currentFilter = filterOptions.find((o) => o.key === filterRole) || filterOptions[0];

  // Lọc cuộc hội thoại (đảm bảo Người dân không xuất hiện trong Chính quyền hoặc Ban chỉ huy)
  const filteredConversations = conversations.filter((c) => {
    if (filterRole === 'CITIZEN') {
      if (c.role !== 'CITIZEN') return false;
    } else if (filterRole === 'LOCAL_AUTHORITY') {
      if (c.role !== 'LOCAL_AUTHORITY') return false;
    } else if (filterRole === 'ADMIN') {
      if (c.role !== 'ADMIN' && c.channel !== 'COMMAND_GENERAL') return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.areaName && c.areaName.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  return (
    <div className="sos-chat-page-wrap">
      <div className="sos-chat-container">
        {/* CỘT DANH SÁCH (320–360px) */}
        <div className={`sos-chat-sidebar ${mobileShowChat ? 'mobile-hidden' : ''}`}>
          <div className="sos-chat-sidebar-header">
            <div className="sos-chat-sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Kênh liên lạc</h3>
              {totalUnreadCount > 0 && (
                <button
                  type="button"
                  className="sos-btn sos-btn--outline sos-btn--xs"
                  onClick={handleMarkAllRead}
                  title="Đánh dấu đã đọc tất cả cuộc trò chuyện"
                >
                  <CheckCheck size={13} />
                  <span>Đã đọc tất cả</span>
                </button>
              )}
            </div>

            <div className="sos-chat-search-wrap">
              <Search size={14} className="sos-chat-search-icon" aria-hidden="true" />
              <input
                type="text"
                className="sos-chat-search-input"
                placeholder="Tìm kiếm cuộc trò chuyện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* MỤC LỤC / BỘ LỌC HỘI THOẠI (ẤN VÀO ĐỂ CHỌN) */}
          <div className="sos-chat-filter-select-container" ref={filterDropdownRef}>
            <button
              type="button"
              className="sos-chat-filter-select-trigger"
              onClick={() => setShowFilterDropdown((prev) => !prev)}
              aria-expanded={showFilterDropdown}
              title="Nhấn để chọn phân loại cuộc trò chuyện"
            >
              <div className="sos-chat-filter-trigger-content">
                <currentFilter.icon size={15} className="sos-chat-filter-trigger-icon" />
                <span className="sos-chat-filter-trigger-text">
                  Mục lục: <strong>{currentFilter.shortLabel}</strong>
                </span>
                <span className="sos-chat-filter-badge">{currentFilter.count}</span>
              </div>
              {showFilterDropdown ? (
                <ChevronUp size={14} className="sos-chat-filter-chevron" />
              ) : (
                <ChevronDown size={14} className="sos-chat-filter-chevron" />
              )}
            </button>

            {showFilterDropdown && (
              <div className="sos-chat-filter-dropdown-menu">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`sos-chat-filter-menu-item ${filterRole === opt.key ? 'active' : ''}`}
                    onClick={() => {
                      setFilterRole(opt.key);
                      setShowFilterDropdown(false);
                    }}
                  >
                    <div className="sos-chat-filter-menu-item-left">
                      <opt.icon size={14} />
                      <span>{opt.label}</span>
                    </div>
                    <div className="sos-chat-filter-menu-item-right">
                      <span className="sos-chat-filter-item-count">{opt.count}</span>
                      {filterRole === opt.key && <Check size={14} style={{ color: 'var(--sos-primary)' }} />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* DANH SÁCH HỘI THOẠI */}
          <div className="sos-chat-list">
            {loadingConv && conversations.length === 0 ? (
              <div className="sos-chat-list-empty">
                <div className="sos-btn-spinner" style={{ width: 18, height: 18, margin: '0 auto 8px', color: 'var(--sos-primary)' }} />
                <span>Đang tải danh sách liên lạc...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="sos-chat-list-empty">
                Không tìm thấy cuộc trò chuyện phù hợp
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConv?.channel === conv.channel;
                const isChannel = conv.type === 'CHANNEL';
                return (
                  <div
                    key={conv.channel}
                    className={`sos-chat-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setConversations((prev) =>
                        prev.map((c) =>
                          c.channel === conv.channel || (conv.partnerId && c.partnerId === conv.partnerId)
                            ? { ...c, unreadCount: 0 }
                            : c
                        )
                      );
                      window.dispatchEvent(new CustomEvent('sos_chat_unread_updated'));
                      setActiveConv(conv);
                      setMobileShowChat(true);
                    }}
                  >
                    <div className="sos-chat-avatar-wrap">
                      <ChatAvatar
                        src={conv.avatarUrl || (conv.partnerUser as any)?.avatarUrl}
                        alt={conv.name}
                        role={conv.role}
                        name={conv.name}
                        isChannel={isChannel}
                        size={40}
                        iconSize={16}
                      />
                    </div>

                    <div className="sos-chat-item-info">
                      <div className="sos-chat-item-top">
                        <span className="sos-chat-item-name" title={conv.name}>
                          {cleanChatName(conv.name)}
                        </span>
                        {conv.latestMessage && (
                          <span className="sos-chat-item-time">
                            {new Date(conv.latestMessage.createdAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="sos-chat-item-sub">
                        <span className="sos-chat-item-preview">
                          {conv.latestMessage
                            ? `${conv.latestMessage.senderName}: ${conv.latestMessage.content}`
                            : isChannel
                              ? 'Phòng trao đổi khẩn cấp chung'
                              : conv.areaName || 'Cán bộ địa phương'}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="sos-chat-unread-badge">{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* VÙNG HỘI THOẠI (CỘT CHIẾM PHẦN CÒN LẠI) */}
        <div className={`sos-chat-main ${mobileShowChat ? 'mobile-active' : ''}`}>
          {activeConv ? (
            <>
              {/* HEADER HỘI THOẠI */}
              <div className="sos-chat-main-header">
                <div className="sos-chat-main-partner">
                  {/* Nút quay lại trên mobile */}
                  <button
                    type="button"
                    className="sos-btn sos-btn--outline sos-btn--icon-sm sos-chat-back-btn"
                    onClick={() => setMobileShowChat(false)}
                    aria-label="Quay lại danh sách kênh"
                    title="Quay lại danh sách"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <ChatAvatar
                    src={activeConv.avatarUrl || (activeConv.partnerUser as any)?.avatarUrl}
                    alt={activeConv.name}
                    role={activeConv.role}
                    name={activeConv.name}
                    isChannel={activeConv.type === 'CHANNEL'}
                    size={40}
                    iconSize={18}
                  />

                  <div
                    className={`sos-chat-partner-text ${activeConv.role === 'CITIZEN' ? 'clickable' : ''}`}
                    onClick={() => {
                      if (activeConv.role === 'CITIZEN') {
                        handleOpenCitizenInfo(activeConv.partnerId, activeConv);
                      }
                    }}
                    title={activeConv.role === 'CITIZEN' ? 'Nhấn để xem số điện thoại và địa chỉ người dân' : undefined}
                  >
                    <div className="sos-chat-main-title">
                      <span className={activeConv.role === 'CITIZEN' ? 'sos-chat-partner-name-link' : ''}>
                        {cleanChatName(activeConv.name)}
                      </span>
                      {activeConv.role === 'CITIZEN' ? (
                        <span className="sos-badge pending">NGƯỜI DÂN • ĐỊA BÀN</span>
                      ) : activeConv.type === 'CHANNEL' ? (
                        <span className="sos-badge neutral">KÊNH CHUNG</span>
                      ) : activeConv.role === 'ADMIN' ? (
                        <span className="sos-badge high">BAN CHỈ HUY</span>
                      ) : (
                        <span className="sos-badge active">CHÍNH QUYỀN</span>
                      )}
                    </div>
                    {activeConv.role !== 'CITIZEN' && (
                      <div className="sos-chat-main-subtitle">
                        {activeConv.type === 'CHANNEL' ? (
                          <span>Tất cả ban chỉ huy và cán bộ địa phương</span>
                        ) : (
                          <>
                            {activeConv.areaName && (
                              <span>
                                <Building2 size={13} style={{ marginRight: '4px', display: 'inline' }} />
                                {activeConv.areaName}
                              </span>
                            )}
                            {activeConv.phone && <span>&bull; SĐT: {activeConv.phone}</span>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* NÚT TÙY CHỌN */}
                <div className="sos-chat-header-actions">
                  <div className="sos-chat-menu-wrap" ref={headerMenuRef}>
                    <button
                      type="button"
                      className="sos-btn sos-btn--outline sos-btn--icon-sm"
                      onClick={() => setShowDropdownMenu(!showDropdownMenu)}
                      aria-label="Tùy chọn cuộc hội thoại"
                      title="Tùy chọn"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {showDropdownMenu && (
                      <div className="sos-chat-dropdown-menu">
                        {activeConv.role === 'CITIZEN' && (
                          <button
                            type="button"
                            className="sos-chat-dropdown-item"
                            onClick={() => {
                              setShowDropdownMenu(false);
                              handleOpenCitizenInfo(activeConv.partnerId, activeConv);
                            }}
                          >
                            <UserCheck size={14} /> Xem thông tin người dân
                          </button>
                        )}
                        {activeConv.phone && (
                          <a
                            href={`tel:${activeConv.phone}`}
                            className="sos-chat-dropdown-item"
                            onClick={() => setShowDropdownMenu(false)}
                          >
                            <Phone size={14} /> Gọi điện: {activeConv.phone}
                          </a>
                        )}
                        <button
                          type="button"
                          className="sos-chat-dropdown-item"
                          onClick={() => {
                            setShowDropdownMenu(false);
                            loadMessages(activeConv);
                          }}
                        >
                          <RefreshCw size={14} /> Tải lại tin nhắn
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* NỘI DUNG TIN NHẮN (CUỘN ĐỘC LẬP) */}
              <div className="sos-chat-messages-container">
                {loadingMsg ? (
                  <div className="sos-chat-list-empty">
                    <div className="sos-btn-spinner" style={{ width: 18, height: 18, margin: '0 auto 8px', color: 'var(--sos-primary)' }} />
                    <span>Đang đồng bộ tin nhắn...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="sos-chat-empty-state">
                    <div className="sos-chat-empty-icon">
                      <MessageSquare size={24} />
                    </div>
                    <h4 className="sos-chat-empty-title">Chưa có tin nhắn</h4>
                    <p className="sos-chat-empty-desc">Bắt đầu trao đổi để phối hợp cứu hộ tại hiện trường.</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const sender = typeof msg.senderId === 'object' && msg.senderId !== null ? msg.senderId : null;
                    const senderIdStr = sender ? sender._id : msg.senderId;
                    const isOwn = senderIdStr === currentUser?._id;

                    const senderRoleUpper = (msg.senderRole || '').toUpperCase();
                    const isSenderAdmin = senderRoleUpper.includes('ADMIN');
                    const isCitizen = senderRoleUpper.includes('CITIZEN');

                    return (
                      <div key={msg._id || idx} className={`sos-chat-msg-row ${isOwn ? 'own' : ''}`}>
                        {!isOwn && (
                          <ChatAvatar
                            src={
                              (typeof msg.senderId === 'object' && msg.senderId !== null ? (msg.senderId as any).avatarUrl : undefined) ||
                              (isCitizen ? (activeConv.avatarUrl || (activeConv.partnerUser as any)?.avatarUrl) : undefined)
                            }
                            alt={msg.senderName}
                            role={isCitizen ? 'CITIZEN' : isSenderAdmin ? 'ADMIN' : 'LOCAL_AUTHORITY'}
                            name={msg.senderName}
                            size={32}
                            iconSize={14}
                            className="sos-chat-msg-avatar"
                          />
                        )}

                        <div className="sos-chat-msg-bubble">
                          {!isOwn && (
                            <div className="sos-chat-msg-meta">
                              <span
                                className={`sos-chat-msg-sender ${isCitizen ? 'clickable' : ''}`}
                                onClick={() => {
                                  if (isCitizen) {
                                    const uId =
                                      typeof msg.senderId === 'object' && msg.senderId !== null
                                        ? msg.senderId._id
                                        : (msg.senderId as string);
                                    handleOpenCitizenInfo(uId, {
                                      fullName: msg.senderName,
                                      phone: (typeof msg.senderId === 'object' && msg.senderId?.phone) || activeConv?.phone,
                                      address: (typeof msg.senderId === 'object' && msg.senderId?.address) || activeConv?.address || activeConv?.areaName,
                                      email: typeof msg.senderId === 'object' ? msg.senderId?.email : undefined,
                                      avatarUrl: typeof msg.senderId === 'object' ? msg.senderId?.avatarUrl : undefined,
                                      emergencyContact: typeof msg.senderId === 'object' ? msg.senderId?.citizen?.emergencyContact : undefined,
                                      emergencyContacts: typeof msg.senderId === 'object' ? msg.senderId?.citizen?.emergencyContacts : undefined,
                                    });
                                  }
                                }}
                                title={isCitizen ? 'Nhấn để xem số điện thoại và địa chỉ của người dân' : undefined}
                              >
                                {msg.senderName}
                                {isCitizen && (
                                  <Info size={12} style={{ marginLeft: 4, color: 'var(--sos-primary)', display: 'inline' }} />
                                )}
                              </span>
                              <span
                                className={`sos-badge ${isSenderAdmin ? 'high' : isCitizen ? 'pending' : 'active'}`}
                                style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 600 }}
                              >
                                {isSenderAdmin ? 'Ban chỉ huy' : isCitizen ? 'Người dân' : 'Chính quyền'}
                              </span>
                            </div>
                          )}

                          <div className="sos-chat-msg-card">
                            {(() => {
                              const sos = parseSosMessage(msg, sosStatusMap);
                              if (sos) {
                                return (
                                  <div className="sos-chat-sos-card">
                                    <div className="sos-chat-sos-header">
                                      <div className="sos-chat-sos-badge">
                                        <span className="sos-chat-sos-pulse-dot" />
                                        <AlertOctagon size={14} />
                                        <span>YÊU CẦU CỨU NẠN KHẨN CẤP</span>
                                      </div>
                                      <span
                                        className="sos-badge critical"
                                        style={{ backgroundColor: sos.statusBgColor, color: sos.statusColor }}
                                      >
                                        {sos.statusLabel}
                                      </span>
                                    </div>

                                    <div className="sos-chat-sos-code-row">
                                      <span className={`sos-chat-sos-code ${sos.status === 'CANCELLED' ? 'cancelled' : ''}`}>
                                        {sos.sosCode}
                                      </span>
                                      <span className="sos-badge neutral" style={{ fontSize: 11 }}>{sos.typeLabel}</span>
                                    </div>

                                    <div className="sos-chat-sos-details-grid">
                                      <div className="sos-chat-sos-detail-row">
                                        <span className="sos-sos-label"><Users size={13} style={{ display: 'inline', marginRight: 4 }} /> Số người:</span>
                                        <span className="sos-sos-val-bold">{sos.people} người gặp nạn</span>
                                      </div>
                                      {sos.address && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><MapPin size={13} style={{ display: 'inline', marginRight: 4 }} /> Địa chỉ:</span>
                                          <span className="sos-sos-val">{sos.address}</span>
                                        </div>
                                      )}
                                      {sos.coords && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><Compass size={13} style={{ display: 'inline', marginRight: 4 }} /> GPS:</span>
                                          <span className="sos-sos-val-mono">{sos.coords.lat.toFixed(6)}, {sos.coords.lng.toFixed(6)}</span>
                                        </div>
                                      )}
                                      {sos.phone && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><Phone size={13} style={{ display: 'inline', marginRight: 4 }} /> Liên hệ:</span>
                                          <a href={`tel:${sos.phone}`} className="sos-sos-phone-link">
                                            {sos.phone} <ExternalLink size={12} style={{ display: 'inline', marginLeft: 3 }} />
                                          </a>
                                        </div>
                                      )}
                                      {sos.description && (
                                        <div className="sos-chat-sos-desc-box">
                                          <em>"{sos.description}"</em>
                                        </div>
                                      )}
                                    </div>

                                    {sos.images && sos.images.length > 0 && (
                                      <div className="sos-chat-sos-gallery">
                                        {sos.images.map((imgUrl: string, imgIdx: number) => (
                                          <div
                                            key={`sos_img_${imgIdx}`}
                                            className="sos-chat-sos-img-thumb"
                                            onClick={() => setLightboxImg(imgUrl)}
                                            title="Nhấn để phóng to ảnh"
                                          >
                                            <img src={imgUrl} alt={`Ảnh hiện trường ${imgIdx + 1}`} />
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {sos.status === 'CANCELLED' ? (
                                      <div className="sos-chat-cancelled-banner">
                                        <X size={15} className="text-danger me-1" />
                                        <span>Yêu cầu cứu nạn này đã được hủy bỏ</span>
                                      </div>
                                    ) : (
                                      <div className="sos-chat-sos-actions">
                                        {sos.coords && (
                                          <button
                                            type="button"
                                            className="sos-btn sos-btn--primary sos-btn--sm"
                                            onClick={() => handleViewOnRescueMap(sos.coords!.lat, sos.coords!.lng, msg.senderName, sos.address)}
                                            title="Chuyển sang Bản đồ tác chiến và định vị ngay"
                                          >
                                            <Map size={14} /> Xem trên Bản đồ cứu hộ
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="sos-btn sos-btn--soft-danger sos-btn--sm"
                                          onClick={() => handleNavigateToSosRequests(sos.sosCode)}
                                          title="Chuyển sang Quản lý ca SOS"
                                        >
                                          <Activity size={14} /> Quản lý ca SOS
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              const gps = parseGpsContent(msg.content);
                              if (gps) {
                                return (
                                  <div className="sos-chat-gps-box">
                                    <div className="sos-chat-gps-badge">
                                      <MapPin size={13} /> Tọa độ GPS khẩn cấp
                                    </div>
                                    <div className="sos-chat-gps-coords-text">
                                      <Compass size={14} style={{ display: 'inline', marginRight: 4 }} />
                                      {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                                    </div>
                                    {gps.address && (
                                      <div className="sos-chat-gps-addr-text">
                                        {gps.address}
                                      </div>
                                    )}
                                    <div className="sos-chat-gps-btn-row">
                                      <button
                                        type="button"
                                        className="sos-btn sos-btn--primary sos-btn--sm"
                                        onClick={() => handleViewOnRescueMap(gps.lat, gps.lng, msg.senderName, gps.address)}
                                        title="Chuyển sang Bản đồ cứu hộ và định vị ngay"
                                      >
                                        <Map size={14} /> Xem trên Bản đồ cứu hộ
                                      </button>
                                      <a
                                        href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="sos-btn sos-btn--outline sos-btn--icon-sm"
                                        title="Mở trên Google Maps"
                                      >
                                        <ExternalLink size={14} />
                                      </a>
                                    </div>
                                  </div>
                                );
                              }
                              const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0;
                              const imageAttachments = hasAttachments
                                ? msg.attachments!.filter(
                                  (att) =>
                                    att.url &&
                                    (!att.fileType ||
                                      att.fileType.toUpperCase().includes('IMAGE') ||
                                      /\.(jpg|jpeg|png|webp|gif)/i.test(att.url))
                                )
                                : [];
                              const showText = msg.content && msg.content.trim() !== '[Hình ảnh]';

                              return (
                                <div className="sos-chat-msg-body">
                                  {imageAttachments.length > 0 && (
                                    <div className="sos-chat-msg-images-wrap">
                                      {imageAttachments.map((img, idx) => (
                                        <div
                                          key={`web_img_${idx}`}
                                          className="sos-chat-msg-image-item"
                                          onClick={() => setLightboxImg(img.url)}
                                          title="Nhấn để xem phóng to ảnh"
                                        >
                                          <img
                                            src={img.url}
                                            alt={img.fileName || 'Hình ảnh hiện trường'}
                                            className="sos-chat-thumb-img"
                                            loading="lazy"
                                          />
                                          <div className="sos-chat-img-zoom-hint">
                                            <Maximize2 size={13} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {showText && <div className="sos-chat-msg-text">{msg.content}</div>}
                                </div>
                              );
                            })()}
                            <div className="sos-chat-msg-time-status">
                              <Clock size={11} />
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isOwn && (
                                <CheckCheck size={13} aria-label="Đã gửi" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* PHẦN SOẠN TIN (Ô NHẬP LIỆU) */}
              <div className="sos-chat-composer">
                {/* THANH NHẬP LIỆU */}
                <div className="sos-chat-input-bar">
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageFileChange}
                  />
                  <button
                    type="button"
                    className="sos-btn sos-btn--outline sos-btn--icon-md"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImg || sending}
                    title="Gửi hình ảnh đính kèm (Lưu trữ Cloudinary)"
                    aria-label="Đính kèm hình ảnh"
                  >
                    {uploadingImg ? (
                      <div className="sos-btn-spinner" />
                    ) : (
                      <ImageIcon size={18} />
                    )}
                  </button>
                  <textarea
                    ref={textareaRef}
                    className="sos-chat-textarea"
                    placeholder="Nhập nội dung trao đổi (Enter để gửi, Shift+Enter xuống dòng)..."
                    value={inputContent}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploadingImg}
                    rows={1}
                  />
                  <button
                    type="button"
                    className="sos-btn sos-btn--primary sos-btn--md"
                    onClick={() => handleSend()}
                    disabled={!inputContent.trim() || sending || uploadingImg}
                    aria-label="Gửi tin nhắn"
                  >
                    <span>{sending ? 'Đang gửi...' : 'Gửi'}</span>
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="sos-chat-no-conv">
              <MessageSquare size={36} style={{ color: 'var(--sos-text-muted)', marginBottom: '8px' }} />
              <span>Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu</span>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal xem ảnh toàn màn hình trên Web */}
      {lightboxImg && (
        <div className="sos-chat-lightbox-backdrop" onClick={() => setLightboxImg(null)}>
          <div className="sos-chat-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sos-btn sos-btn--ghost sos-btn--icon-md sos-chat-lightbox-close"
              onClick={() => setLightboxImg(null)}
              title="Đóng xem ảnh"
            >
              <X size={20} />
            </button>
            <img src={lightboxImg} alt="Ảnh cứu nạn phóng to" className="sos-chat-lightbox-img" />
            <div className="sos-chat-lightbox-footer">
              <a
                href={lightboxImg}
                target="_blank"
                rel="noreferrer"
                className="sos-btn sos-btn--outline sos-btn--sm"
                style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <ExternalLink size={14} /> Mở trong tab mới
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SLIDE-OVER DRAWER CHI TIẾT HỒ SƠ CÔNG DÂN (740px - MATCHING RESCUER APPROVAL VIEW)
         ======================================================== */}
      {citizenModalData && (
        <div className="ra-drawer-backdrop" onClick={handleCloseCitizenDrawer}>
          <div
            className={`ra-drawer ${isDrawerClosing ? 'closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="ra-drawer-header">
              <div className="ra-drawer-title-wrap">
                <h3 className="ra-drawer-title">CHI TIẾT HỒ SƠ NGƯỜI DÂN</h3>
                <span className="sos-badge pending">
                  {citizenModalData.latestSos ? 'Cần hỗ trợ khẩn cấp' : 'Người dân • Địa bàn'}
                </span>
                {citizenModalData.totalSosCount !== undefined && citizenModalData.totalSosCount > 0 && (
                  <span className="sos-badge high">
                    <LifeBuoy size={13} /> {citizenModalData.totalSosCount} ca SOS
                  </span>
                )}
              </div>

              <button
                type="button"
                className="sos-btn sos-btn--ghost sos-btn--icon-sm"
                onClick={handleCloseCitizenDrawer}
                title="Đóng (ESC)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Drawer */}
            <div className="ra-drawer-body">
              {loadingCitizenModal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--sos-primary-soft, #e0f2fe)', borderRadius: 8, color: 'var(--sos-primary, #0284c7)', fontSize: 13, fontWeight: 600 }}>
                  <div className="sos-btn-spinner" style={{ width: 14, height: 14 }} />
                  <span>Đang tải thêm dữ liệu xác thực của người dân...</span>
                </div>
              )}

              {/* Nhóm A: Thông tin cá nhân & Nơi cư trú */}
              <div className="ra-drawer-section">
                <div className="ra-section-header">
                  <UserCheck size={16} />
                  <span>A. THÔNG TIN CÁ NHÂN</span>
                </div>
                <div className="ra-section-body">
                  {/* Thông tin đại diện & Họ tên */}
                  <div className="ra-profile-inline-bar">
                    <div className="ra-profile-avatar">
                      {citizenModalData.avatarUrl ? (
                        <img src={citizenModalData.avatarUrl} alt={citizenModalData.fullName} />
                      ) : (
                        <span>{(citizenModalData.fullName || 'CD').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="ra-profile-info">
                      <div className="ra-profile-name-row">
                        <h4 className="ra-profile-name">{citizenModalData.fullName}</h4>
                        <span className="sos-badge active">
                          {citizenModalData.latestSos ? 'Công Dân Cần Hỗ Trợ' : 'Người dân địa phương'}
                        </span>
                      </div>
                      <span className="ra-profile-sub">
                        {citizenModalData.gender === 'MALE' ? 'Nam' : citizenModalData.gender === 'FEMALE' ? 'Nữ' : (citizenModalData.gender || 'Nam')}
                        {' • '}
                        {citizenModalData.dateOfBirth || 'Chưa cung cấp ngày sinh'}
                      </span>
                    </div>
                  </div>

                  <div className="ra-kv-grid">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Số điện thoại liên lạc</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ra-kv-value phone">{citizenModalData.phone || 'Chưa cung cấp'}</span>
                        {citizenModalData.phone && (
                          <button
                            type="button"
                            className="sos-btn sos-btn--outline sos-btn--xs"
                            onClick={() => handleCopyPhone(citizenModalData.phone)}
                            title="Sao chép số"
                          >
                            {copiedPhoneText ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedPhoneText ? 'Đã sao chép' : 'Sao chép'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Địa chỉ Email</span>
                      <span className="ra-kv-value">{citizenModalData.email || 'Chưa cung cấp'}</span>
                    </div>
                  </div>

                  <div className="ra-address-box">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Nơi cư trú thường trú</span>
                      <span className="ra-kv-value" style={{ marginTop: 2, fontSize: 13.5 }}>
                        {citizenModalData.address || activeConv?.address || 'Chưa cung cấp địa chỉ chi tiết'}
                      </span>
                    </div>
                  </div>

                  <div className="ra-address-box highlight-area">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Địa bàn kết nối / Phụ trách cứu hộ</span>
                      <span className="ra-kv-value area-text" style={{ marginTop: 2, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} />
                        <span>{activeConv?.areaName || 'Phường Thanh Khê'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nhóm B: Người liên hệ khẩn cấp (Người thân) */}
              <div className="ra-drawer-section">
                <div className="ra-section-header">
                  <Users size={16} />
                  <span>B. THÔNG TIN LIÊN HỆ KHẨN CẤP (NGƯỜI THÂN)</span>
                </div>
                <div className="ra-section-body">
                  {citizenModalData.emergencyContact?.name ||
                    (citizenModalData.emergencyContacts && citizenModalData.emergencyContacts.length > 0) ? (
                    <>
                      <div className="ra-kv-grid">
                        <div className="ra-kv-item">
                          <span className="ra-kv-label">Họ và tên người thân</span>
                          <span className="ra-kv-value" style={{ fontWeight: 700, color: '#9a3412' }}>
                            {citizenModalData.emergencyContact?.name || citizenModalData.emergencyContacts?.[0]?.name}
                          </span>
                        </div>
                        <div className="ra-kv-item">
                          <span className="ra-kv-label">Mối quan hệ</span>
                          <span className="ra-kv-value">
                            {citizenModalData.emergencyContact?.relation || citizenModalData.emergencyContacts?.[0]?.relation || 'Người thân'}
                          </span>
                        </div>
                      </div>

                      <div className="ra-kv-grid">
                        <div className="ra-kv-item">
                          <span className="ra-kv-label">Số điện thoại người thân</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="ra-kv-value phone" style={{ color: '#15803d', fontWeight: 700 }}>
                              {citizenModalData.emergencyContact?.phone || citizenModalData.emergencyContacts?.[0]?.phone}
                            </span>
                            {(citizenModalData.emergencyContact?.phone || citizenModalData.emergencyContacts?.[0]?.phone) && (
                              <a
                                href={`tel:${citizenModalData.emergencyContact?.phone || citizenModalData.emergencyContacts?.[0]?.phone}`}
                                className="sos-btn sos-btn--soft-success sos-btn--xs"
                                style={{ textDecoration: 'none' }}
                                title="Gọi cho người thân"
                              >
                                <Phone size={12} /> Gọi ngay
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="ra-kv-item">
                          <span className="ra-kv-label">Địa chỉ liên lạc người thân</span>
                          <span className="ra-kv-value">
                            {citizenModalData.emergencyContact?.address || citizenModalData.address || 'Cùng địa chỉ cư trú'}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="sos-citizen-empty-hint">
                      <AlertTriangle size={15} style={{ display: 'inline', marginRight: 4 }} />
                      Người dân chưa khai báo thông tin người liên hệ khẩn cấp trong hồ sơ cá nhân.
                    </div>
                  )}
                </div>
              </div>

              {/* Nhóm C: Tình trạng & Yêu cầu cứu nạn SOS */}
              <div className="ra-drawer-section">
                <div className="ra-section-header">
                  <AlertTriangle size={16} />
                  <span>C. TÌNH TRẠNG & YÊU CẦU CỨU NẠN SOS</span>
                </div>
                <div className="ra-section-body">
                  <div className="ra-kv-grid">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Tổng số ca SOS đã tạo</span>
                      <span className="ra-kv-value highlight">
                        {citizenModalData.totalSosCount || (citizenModalData.latestSos ? 1 : 0)} ca cứu hộ
                      </span>
                    </div>
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Trạng thái hiện tại</span>
                      <span className="ra-kv-value">
                        {citizenModalData.latestSos ? (
                          <span className="sos-badge critical">
                            {SOS_STATUS_CONFIG[citizenModalData.latestSos.status]?.label || citizenModalData.latestSos.status}
                          </span>
                        ) : (
                          <span className="sos-badge verified">An toàn / Chưa kích hoạt SOS</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {citizenModalData.latestSos && (
                    <div className="sos-citizen-latest-sos-box" style={{ marginTop: 6 }}>
                      <div className="sos-citizen-latest-sos-header">
                        <span className="sos-citizen-sos-code">{citizenModalData.latestSos.sosCode}</span>
                        <span className="sos-badge pending">
                          {SOS_STATUS_CONFIG[citizenModalData.latestSos.status]?.label || citizenModalData.latestSos.status}
                        </span>
                      </div>
                      <div className="sos-citizen-sos-desc">
                        <div>
                          <strong>Loại khẩn cấp:</strong>{' '}
                          {SOS_TYPE_LABELS[citizenModalData.latestSos.emergencyType] || citizenModalData.latestSos.emergencyType} &bull;{' '}
                          <strong>Số người:</strong> {citizenModalData.latestSos.people || 1} người
                        </div>
                        <div>
                          <strong>Địa chỉ SOS:</strong> {citizenModalData.latestSos.address}
                        </div>
                        {citizenModalData.latestSos.description && (
                          <div style={{ color: 'var(--sos-emergency, #dc2626)', marginTop: 4 }}>
                            <em>"{citizenModalData.latestSos.description}"</em>
                          </div>
                        )}
                      </div>
                      <div className="sos-citizen-sos-actions">
                        {citizenModalData.latestSos.location?.coordinates && (
                          <button
                            type="button"
                            className="sos-btn sos-btn--primary sos-btn--xs"
                            onClick={() => {
                              const [lng, lat] = citizenModalData.latestSos!.location!.coordinates;
                              handleViewOnRescueMap(lat, lng, citizenModalData.fullName, citizenModalData.latestSos!.address);
                              handleCloseCitizenDrawer();
                            }}
                          >
                            <MapPin size={13} /> Xem trên Bản đồ cứu hộ
                          </button>
                        )}
                        <button
                          type="button"
                          className="sos-btn sos-btn--soft-danger sos-btn--xs"
                          onClick={() => {
                            handleNavigateToSosRequests(citizenModalData.latestSos!.sosCode);
                            handleCloseCitizenDrawer();
                          }}
                        >
                          <FileCheck size={13} /> Quản lý ca SOS
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Drawer */}
            <div className="ra-drawer-footer">
              <div className="ra-actions-row">
                {citizenModalData.phone && (
                  <a
                    href={`tel:${citizenModalData.phone}`}
                    className="sos-btn sos-btn--primary sos-btn--md"
                    style={{ textDecoration: 'none' }}
                  >
                    <Phone size={14} /> Gọi điện thoại
                  </a>
                )}
                <button
                  type="button"
                  className="sos-btn sos-btn--soft-primary sos-btn--md"
                  onClick={() => {
                    const gps = parseGpsContent(messages.find((m) => m.content.includes('[Tọa độ GPS'))?.content || '');
                    if (gps) {
                      handleViewOnRescueMap(gps.lat, gps.lng, citizenModalData.fullName, citizenModalData.address);
                    } else {
                      window.dispatchEvent(new CustomEvent('sos_navigate_tab', { detail: { key: 'map' } }));
                    }
                    handleCloseCitizenDrawer();
                  }}
                  title="Định vị địa chỉ trên bản đồ tác chiến"
                >
                  <MapPin size={14} /> Xem trên bản đồ
                </button>
                <button
                  type="button"
                  className="sos-btn sos-btn--outline sos-btn--md"
                  onClick={handleCloseCitizenDrawer}
                >
                  <X size={14} /> Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

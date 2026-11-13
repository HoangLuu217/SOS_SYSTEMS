import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  UserCheck,
  Phone,
  MapPin,
  AlertTriangle,
  FileCheck,
  Users,
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
  const [realtimeConnected, setRealtimeConnected] = useState(true);
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
    } catch (_) {}
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
    } catch {}

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
              }).catch(() => {});
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

  // Lọc cuộc hội thoại
  const filteredConversations = conversations.filter((c) => {
    if (filterRole === 'CITIZEN' && c.role !== 'CITIZEN') return false;
    if (filterRole === 'ADMIN' && c.role !== 'ADMIN' && c.type !== 'CHANNEL') return false;
    if (filterRole === 'LOCAL_AUTHORITY' && c.role !== 'LOCAL_AUTHORITY' && c.type !== 'CHANNEL') return false;
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
                  className="sos-chat-mark-all-read-btn"
                  onClick={handleMarkAllRead}
                  title="Đánh dấu đã đọc tất cả cuộc trò chuyện"
                >
                  <i className="bi bi-check2-all" style={{ marginRight: '4px' }} />
                  Đã đọc tất cả
                </button>
              )}
            </div>

            <div className="sos-chat-search-wrap">
              <i className="bi bi-search sos-chat-search-icon" aria-hidden="true" />
              <input
                type="text"
                className="sos-chat-search-input"
                placeholder="Tìm kiếm cuộc trò chuyện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* BỘ LỌC TAB */}
          <div className="sos-chat-filter-pills" role="tablist">
            <button
              type="button"
              className={`sos-chat-filter-pill ${filterRole === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterRole('ALL')}
            >
              Tất cả ({conversations.length})
            </button>
            {conversations.some((c) => c.role === 'CITIZEN') && (
              <button
                type="button"
                className={`sos-chat-filter-pill ${filterRole === 'CITIZEN' ? 'active' : ''}`}
                onClick={() => setFilterRole('CITIZEN')}
              >
                Người dân ({conversations.filter((c) => c.role === 'CITIZEN').length})
              </button>
            )}
            <button
              type="button"
              className={`sos-chat-filter-pill ${filterRole === 'LOCAL_AUTHORITY' ? 'active' : ''}`}
              onClick={() => setFilterRole('LOCAL_AUTHORITY')}
            >
              Chính quyền
            </button>
            <button
              type="button"
              className={`sos-chat-filter-pill ${filterRole === 'ADMIN' ? 'active' : ''}`}
              onClick={() => setFilterRole('ADMIN')}
            >
              Ban chỉ huy
            </button>
          </div>

          {/* DANH SÁCH HỘI THOẠI */}
          <div className="sos-chat-list">
            {loadingConv && conversations.length === 0 ? (
              <div className="sos-chat-list-empty">
                Đang tải danh sách liên lạc...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="sos-chat-list-empty">
                Không tìm thấy cuộc trò chuyện phù hợp
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConv?.channel === conv.channel;
                const isChannel = conv.type === 'CHANNEL';
                const isCitizen = conv.role === 'CITIZEN';
                const avatarClass = isCitizen
                  ? 'sos-chat-avatar citizen'
                  : isChannel
                  ? 'sos-chat-avatar channel'
                  : conv.role === 'ADMIN'
                  ? 'sos-chat-avatar admin'
                  : 'sos-chat-avatar authority';

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
                      <div className={avatarClass}>
                        {isCitizen ? (
                          <i className="bi bi-people-fill" aria-hidden="true" />
                        ) : isChannel ? (
                          <i className="bi bi-megaphone" aria-hidden="true" />
                        ) : conv.role === 'ADMIN' ? (
                          <i className="bi bi-shield-check" aria-hidden="true" />
                        ) : (
                          conv.name.charAt(0).toUpperCase()
                        )}
                      </div>
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
                    className="sos-chat-back-btn"
                    onClick={() => setMobileShowChat(false)}
                    aria-label="Quay lại danh sách kênh"
                    title="Quay lại danh sách"
                  >
                    <i className="bi bi-arrow-left" aria-hidden="true" />
                  </button>

                  <div
                    className={
                      activeConv.role === 'CITIZEN'
                        ? 'sos-chat-avatar citizen'
                        : activeConv.type === 'CHANNEL'
                        ? 'sos-chat-avatar channel'
                        : activeConv.role === 'ADMIN'
                        ? 'sos-chat-avatar admin'
                        : 'sos-chat-avatar authority'
                    }
                  >
                    {activeConv.role === 'CITIZEN' ? (
                      <i className="bi bi-people-fill" aria-hidden="true" />
                    ) : activeConv.type === 'CHANNEL' ? (
                      <i className="bi bi-megaphone" aria-hidden="true" />
                    ) : activeConv.role === 'ADMIN' ? (
                      <i className="bi bi-shield-check" aria-hidden="true" />
                    ) : (
                      activeConv.name.charAt(0).toUpperCase()
                    )}
                  </div>

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
                        <span className="sos-role-pill citizen">NGƯỜI DÂN &bull; ĐỊA BÀN</span>
                      ) : activeConv.type === 'CHANNEL' ? (
                        <span className="sos-role-pill channel">KÊNH CHUNG</span>
                      ) : activeConv.role === 'ADMIN' ? (
                        <span className="sos-role-pill admin">BAN CHỈ HUY</span>
                      ) : (
                        <span className="sos-role-pill authority">CHÍNH QUYỀN</span>
                      )}

                      {/* Nút xem nhanh thông tin người dân */}
                      {activeConv.role === 'CITIZEN' && (
                        <button
                          type="button"
                          className="sos-chat-quick-info-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCitizenInfo(activeConv.partnerId, activeConv);
                          }}
                          title="Xem hồ sơ, số điện thoại và địa chỉ người dân"
                        >
                          <i className="bi bi-person-lines-fill" /> Xem thông tin
                        </button>
                      )}
                    </div>
                    <div className="sos-chat-main-subtitle">
                      {activeConv.role === 'CITIZEN' ? (
                        <span>
                          <i className="bi bi-geo-alt" style={{ marginRight: '4px' }} />
                          {activeConv.address || activeConv.areaName || 'Cứu trợ người dân địa bàn'}
                          {activeConv.phone && (
                            <span className="sos-chat-header-phone-badge">
                              &bull; <i className="bi bi-telephone-fill" /> SĐT: {activeConv.phone}
                            </span>
                          )}
                        </span>
                      ) : activeConv.type === 'CHANNEL' ? (
                        <span>Tất cả ban chỉ huy và cán bộ địa phương</span>
                      ) : (
                        <>
                          {activeConv.areaName && (
                            <span>
                              <i className="bi bi-building" style={{ marginRight: '4px' }} />
                              {activeConv.areaName}
                            </span>
                          )}
                          {activeConv.phone && <span>&bull; SĐT: {activeConv.phone}</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* TRẠNG THÁI KẾT NỐI & NÚT TÙY CHỌN */}
                <div className="sos-chat-header-actions">
                  <div className="sos-chat-conn-status" title={realtimeConnected ? 'Đã kết nối trực tuyến' : 'Đang thử kết nối lại...'}>
                    <span className={`sos-chat-conn-dot ${realtimeConnected ? 'connected' : 'connecting'}`} />
                    <span>{realtimeConnected ? 'Đã kết nối' : 'Đang kết nối...'}</span>
                  </div>

                  {activeConv.role === 'CITIZEN' && (
                    <button
                      type="button"
                      className="sos-chat-header-citizen-btn"
                      onClick={() => handleOpenCitizenInfo(activeConv.partnerId, activeConv)}
                      title="Xem số điện thoại, địa chỉ và thông tin người dân"
                    >
                      <i className="bi bi-person-vcard" />
                      <span>Hồ sơ người dân</span>
                    </button>
                  )}

                  <div className="sos-chat-menu-wrap">
                    <button
                      type="button"
                      className="sos-chat-menu-btn"
                      onClick={() => setShowDropdownMenu(!showDropdownMenu)}
                      aria-label="Tùy chọn cuộc hội thoại"
                      title="Tùy chọn"
                    >
                      <i className="bi bi-three-dots" aria-hidden="true" />
                    </button>

                    {showDropdownMenu && (
                      <div className="sos-chat-dropdown-menu">
                        {activeConv.role === 'CITIZEN' && (
                          <button
                            type="button"
                            className="sos-chat-dropdown-item"
                            onClick={() => handleOpenCitizenInfo(activeConv.partnerId, activeConv)}
                          >
                            <i className="bi bi-person-badge" /> Xem thông tin người dân
                          </button>
                        )}
                        {activeConv.phone && (
                          <a
                            href={`tel:${activeConv.phone}`}
                            className="sos-chat-dropdown-item"
                            onClick={() => setShowDropdownMenu(false)}
                          >
                            <i className="bi bi-telephone-outbound" /> Gọi điện: {activeConv.phone}
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
                          <i className="bi bi-arrow-clockwise" /> Tải lại tin nhắn
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
                    Đang đồng bộ tin nhắn...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="sos-chat-empty-state">
                    <div className="sos-chat-empty-icon">
                      <i className="bi bi-chat-square-text" aria-hidden="true" />
                    </div>
                    <h4 className="sos-chat-empty-title">Chưa có tin nhắn</h4>
                    <p className="sos-chat-empty-desc">Bắt đầu trao đổi để phối hợp cứu hộ.</p>
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
                          <div className={`sos-chat-msg-avatar ${isSenderAdmin ? 'admin' : isCitizen ? 'citizen' : 'authority'}`}>
                            {isCitizen ? (
                              <i className="bi bi-person-fill" />
                            ) : msg.senderName ? (
                              msg.senderName.charAt(0).toUpperCase()
                            ) : (
                              'C'
                            )}
                          </div>
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
                                  <i className="bi bi-info-circle-fill" style={{ marginLeft: 4, fontSize: '11px', color: '#0284c7' }} />
                                )}
                              </span>
                              <span className={`sos-role-pill-sm ${isSenderAdmin ? 'admin' : isCitizen ? 'citizen' : 'authority'}`}>
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
                                        <i className="bi bi-exclamation-octagon-fill" />
                                        <span>YÊU CẦU CỨU NẠN KHẨN CẤP</span>
                                      </div>
                                      <span
                                        className="sos-chat-sos-status-pill"
                                        style={{ backgroundColor: sos.statusBgColor, color: sos.statusColor }}
                                      >
                                        {sos.statusLabel}
                                      </span>
                                    </div>

                                    <div className="sos-chat-sos-code-row">
                                      <span className={`sos-chat-sos-code ${sos.status === 'CANCELLED' ? 'cancelled' : ''}`}>
                                        {sos.sosCode}
                                      </span>
                                      <span className="sos-chat-sos-type-tag">{sos.typeLabel}</span>
                                    </div>

                                    <div className="sos-chat-sos-details-grid">
                                      <div className="sos-chat-sos-detail-row">
                                        <span className="sos-sos-label"><i className="bi bi-people-fill" /> Số người:</span>
                                        <span className="sos-sos-val-bold">{sos.people} người gặp nạn</span>
                                      </div>
                                      {sos.address && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><i className="bi bi-geo-alt-fill" /> Địa chỉ:</span>
                                          <span className="sos-sos-val">{sos.address}</span>
                                        </div>
                                      )}
                                      {sos.coords && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><i className="bi bi-compass-fill" /> GPS:</span>
                                          <span className="sos-sos-val-mono">{sos.coords.lat.toFixed(6)}, {sos.coords.lng.toFixed(6)}</span>
                                        </div>
                                      )}
                                      {sos.phone && (
                                        <div className="sos-chat-sos-detail-row">
                                          <span className="sos-sos-label"><i className="bi bi-telephone-fill" /> Liên hệ:</span>
                                          <a href={`tel:${sos.phone}`} className="sos-sos-phone-link">
                                            {sos.phone} <i className="bi bi-box-arrow-up-right" />
                                          </a>
                                        </div>
                                      )}
                                      {sos.description && (
                                        <div className="sos-chat-sos-desc-box">
                                          <i className="bi bi-chat-left-quote-fill" /> {sos.description}
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
                                        <i className="bi bi-x-circle-fill text-danger me-1" />
                                        <span>Yêu cầu cứu nạn này đã được hủy bỏ</span>
                                      </div>
                                    ) : (
                                      <div className="sos-chat-sos-actions">
                                        {sos.coords && (
                                          <button
                                            type="button"
                                            className="sos-chat-gps-btn-primary"
                                            onClick={() => handleViewOnRescueMap(sos.coords!.lat, sos.coords!.lng, msg.senderName, sos.address)}
                                            title="Chuyển sang Bản đồ tác chiến và định vị ngay"
                                          >
                                            <i className="bi bi-map-fill" /> Xem trên Bản đồ cứu hộ
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="sos-chat-sos-btn-view"
                                          onClick={() => handleNavigateToSosRequests(sos.sosCode)}
                                          title="Chuyển sang Quản lý ca SOS"
                                        >
                                          <i className="bi bi-clipboard2-pulse-fill" /> Quản lý ca SOS
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
                                      <i className="bi bi-geo-alt-fill" /> Tọa độ GPS khẩn cấp
                                    </div>
                                    <div className="sos-chat-gps-coords-text">
                                      📍 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                                    </div>
                                    {gps.address && (
                                      <div className="sos-chat-gps-addr-text">
                                        {gps.address}
                                      </div>
                                    )}
                                    <div className="sos-chat-gps-btn-row">
                                      <button
                                        type="button"
                                        className="sos-chat-gps-btn-primary"
                                        onClick={() => handleViewOnRescueMap(gps.lat, gps.lng, msg.senderName, gps.address)}
                                        title="Chuyển sang Bản đồ cứu hộ và định vị ngay"
                                      >
                                        <i className="bi bi-map-fill" /> Xem trên Bản đồ cứu hộ
                                      </button>
                                      <a
                                        href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="sos-chat-gps-btn-secondary"
                                        title="Mở trên Google Maps"
                                      >
                                        <i className="bi bi-compass" />
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
                                            <i className="bi bi-arrows-fullscreen" />
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
                              <i className="bi bi-clock" style={{ fontSize: '10px' }} />
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isOwn && (
                                <i className="bi bi-check-all" style={{ fontSize: '13px' }} aria-label="Đã gửi" />
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

              {/* PHẦN SOẠN TIN (THAO TÁC NHANH + Ô NHẬP) */}
              <div className="sos-chat-composer">
                {/* THAO TÁC NHANH */}
                <div className="sos-chat-quick-section">
                  <span className="sos-chat-quick-label">Thao tác nhanh:</span>
                  <div className="sos-chat-quick-buttons">
                    <button
                      type="button"
                      className="sos-chat-quick-btn emergency"
                      onClick={() => handleSend('Yêu cầu chi viện lực lượng khẩn cấp đến hiện trường!')}
                    >
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <span>Chi viện khẩn cấp</span>
                    </button>
                    <button
                      type="button"
                      className="sos-chat-quick-btn standard"
                      onClick={() => handleSend('Cần điều động thêm ca nô / xuồng máy hỗ trợ cứu hộ lũ lụt.')}
                    >
                      <i className="bi bi-life-preserver" aria-hidden="true" />
                      <span>Điều động ca nô</span>
                    </button>
                    <button
                      type="button"
                      className="sos-chat-quick-btn success"
                      onClick={() => handleSend('Báo cáo: Tình hình tại địa bàn hiện đã được kiểm soát an toàn.')}
                    >
                      <i className="bi bi-shield-check" aria-hidden="true" />
                      <span>Báo cáo an toàn</span>
                    </button>
                    <button
                      type="button"
                      className="sos-chat-quick-btn standard"
                      onClick={() => handleSend('Đã tiếp nhận chỉ đạo từ Ban chỉ huy. Đang triển khai lực lượng.')}
                    >
                      <i className="bi bi-check2-circle" aria-hidden="true" />
                      <span>Đã nhận chỉ đạo</span>
                    </button>
                  </div>
                </div>

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
                    className="sos-chat-btn-attach"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImg || sending}
                    title="Gửi hình ảnh đính kèm (Lưu trữ Cloudinary)"
                    aria-label="Đính kèm hình ảnh"
                  >
                    {uploadingImg ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    ) : (
                      <i className="bi bi-image" aria-hidden="true" />
                    )}
                  </button>
                  <textarea
                    ref={textareaRef}
                    className="sos-chat-textarea"
                    placeholder="Nhập nội dung trao đổi..."
                    value={inputContent}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploadingImg}
                    rows={1}
                  />
                  <button
                    type="button"
                    className="sos-chat-btn-send"
                    onClick={() => handleSend()}
                    disabled={!inputContent.trim() || sending || uploadingImg}
                    aria-label="Gửi tin nhắn"
                  >
                    <span>{sending ? 'Đang gửi...' : 'Gửi'}</span>
                    <i className="bi bi-send" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="sos-chat-no-conv">
              <i className="bi bi-chat-square-text" style={{ fontSize: '32px', color: '#94a3b8', marginBottom: '8px' }} />
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
              className="sos-chat-lightbox-close"
              onClick={() => setLightboxImg(null)}
              title="Đóng xem ảnh"
            >
              <i className="bi bi-x-lg" />
            </button>
            <img src={lightboxImg} alt="Ảnh cứu nạn phóng to" className="sos-chat-lightbox-img" />
            <div className="sos-chat-lightbox-footer">
              <a
                href={lightboxImg}
                target="_blank"
                rel="noreferrer"
                className="sos-chat-lightbox-download"
              >
                <i className="bi bi-box-arrow-up-right" /> Mở trong tab mới
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
                <span className="ra-status-badge pending">
                  {citizenModalData.latestSos ? 'Cần hỗ trợ khẩn cấp' : 'Người dân • Địa bàn'}
                </span>
                {citizenModalData.totalSosCount !== undefined && citizenModalData.totalSosCount > 0 && (
                  <span className="ra-status-badge in_review">
                    <i className="bi bi-life-preserver" /> {citizenModalData.totalSosCount} ca SOS
                  </span>
                )}
              </div>

              <button
                className="ra-drawer-close-btn"
                onClick={handleCloseCitizenDrawer}
                title="Đóng (ESC)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Drawer */}
            <div className="ra-drawer-body">
              {loadingCitizenModal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, color: '#0284c7', fontSize: 13, fontWeight: 600 }}>
                  <div className="spinner-border spinner-border-sm" role="status" />
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
                        <span className="ra-profile-badge">
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
                            className="sos-citizen-copy-btn"
                            onClick={() => handleCopyPhone(citizenModalData.phone)}
                            title="Sao chép số"
                          >
                            <i className={copiedPhoneText ? 'bi bi-check-lg' : 'bi bi-clipboard'} />
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
                                className="sos-citizen-call-mini-btn"
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
                      <i className="bi bi-shield-slash" /> Người dân chưa khai báo thông tin người liên hệ khẩn cấp trong hồ sơ cá nhân.
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
                          <span className="ra-status-badge requires_update">
                            {SOS_STATUS_CONFIG[citizenModalData.latestSos.status]?.label || citizenModalData.latestSos.status}
                          </span>
                        ) : (
                          <span className="ra-status-badge verified">An toàn / Chưa kích hoạt SOS</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {citizenModalData.latestSos && (
                    <div className="sos-citizen-latest-sos-box" style={{ marginTop: 6 }}>
                      <div className="sos-citizen-latest-sos-header">
                        <span className="sos-citizen-sos-code">{citizenModalData.latestSos.sosCode}</span>
                        <span className="ra-status-badge pending">
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
                          <div style={{ color: '#b91c1c', marginTop: 4 }}>
                            <em>"{citizenModalData.latestSos.description}"</em>
                          </div>
                        )}
                      </div>
                      <div className="sos-citizen-sos-actions">
                        {citizenModalData.latestSos.location?.coordinates && (
                          <button
                            type="button"
                            className="sos-chat-gps-btn-primary"
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
                          className="sos-chat-sos-btn-view"
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
                    className="ra-btn ra-btn-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    <Phone size={14} /> Gọi điện thoại
                  </a>
                )}
                <button
                  type="button"
                  className="ra-btn ra-btn-map"
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
                  className="ra-btn ra-btn-secondary"
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

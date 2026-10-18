import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from '@/types/auth';
import type { ChatMessageItem, ChatConversationItem } from '@/types/chat';
import {
  fetchChatConversations,
  fetchChatMessages,
  sendChatMessage,
  markChatMessagesRead,
} from '@/api';
import {
  subscribeSocketChatEvents,
  joinChannelRoom,
  leaveChannelRoom,
  registerUserSocket,
} from '@/services/socketService';
import './TacticalChat.css';

interface TacticalChatViewProps {
  currentUser?: User | null;
}

const cleanChatName = (name: string) =>
  name.replace(/tác chiến\s*/gi, '').replace(/\s+/g, ' ').trim();

export const TacticalChatView: React.FC<TacticalChatViewProps> = ({ currentUser }) => {
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'CITIZEN' | 'LOCAL_AUTHORITY' | 'ADMIN'>('ALL');
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
        setMessages(res.data.messages);
        setTimeout(() => scrollToBottom(false), 80);

        // Đánh dấu đã đọc
        await markChatMessagesRead({
          channel: conv.channel,
          partnerId: conv.partnerId,
        });

        // Giảm unread trong danh sách hội thoại
        setConversations((prev) =>
          prev.map((c) => (c.channel === conv.channel ? { ...c, unreadCount: 0 } : c))
        );
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
            <div className="sos-chat-sidebar-title">
              <h3>Kênh liên lạc</h3>
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
            <button
              type="button"
              className={`sos-chat-filter-pill ${filterRole === 'CITIZEN' ? 'active' : ''}`}
              onClick={() => setFilterRole('CITIZEN')}
            >
              Người dân ({conversations.filter((c) => c.role === 'CITIZEN').length})
            </button>
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

                  <div className="sos-chat-partner-text">
                    <div className="sos-chat-main-title">
                      <span>{cleanChatName(activeConv.name)}</span>
                      {activeConv.role === 'CITIZEN' ? (
                        <span className="sos-role-pill citizen">NGƯỜI DÂN &bull; ĐỊA BÀN</span>
                      ) : activeConv.type === 'CHANNEL' ? (
                        <span className="sos-role-pill channel">KÊNH CHUNG</span>
                      ) : activeConv.role === 'ADMIN' ? (
                        <span className="sos-role-pill admin">BAN CHỈ HUY</span>
                      ) : (
                        <span className="sos-role-pill authority">CHÍNH QUYỀN</span>
                      )}
                    </div>
                    <div className="sos-chat-main-subtitle">
                      {activeConv.role === 'CITIZEN' ? (
                        <span>
                          <i className="bi bi-geo-alt" style={{ marginRight: '4px' }} />
                          {activeConv.areaName || 'Cứu trợ người dân địa bàn'}
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
                  <button
                    type="button"
                    className="sos-chat-menu-btn"
                    aria-label="Tùy chọn cuộc hội thoại"
                    title="Tùy chọn"
                  >
                    <i className="bi bi-three-dots" aria-hidden="true" />
                  </button>
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
                              <span className="sos-chat-msg-sender">{msg.senderName}</span>
                              <span className={`sos-role-pill-sm ${isSenderAdmin ? 'admin' : isCitizen ? 'citizen' : 'authority'}`}>
                                {isSenderAdmin ? 'Ban chỉ huy' : isCitizen ? 'Người dân' : 'Chính quyền'}
                              </span>
                            </div>
                          )}

                          <div className="sos-chat-msg-card">
                            <div className="sos-chat-msg-text">{msg.content}</div>
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
                  <textarea
                    ref={textareaRef}
                    className="sos-chat-textarea"
                    placeholder="Nhập nội dung trao đổi..."
                    value={inputContent}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    rows={1}
                  />
                  <button
                    type="button"
                    className="sos-chat-btn-send"
                    onClick={() => handleSend()}
                    disabled={!inputContent.trim() || sending}
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
    </div>
  );
};

const mongoose = require('mongoose');
const { ChatMessage, User, SosRequest } = require('../models');
const eventBus = require('./eventBus');
const ApiError = require('../utils/apiError');

class ChatService {
  /**
   * Chuẩn hóa tên địa bàn thành slug định danh kênh chat
   */
  toAreaSlug(str) {
    if (!str) return 'local';
    return String(str)
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
  }

  /**
   * Tạo mã kênh định danh 1-on-1 giữa 2 người dùng
   */
  getDirectChannelId(id1, id2) {
    const s1 = String(id1);
    const s2 = String(id2);
    return s1 < s2 ? `direct_${s1}_${s2}` : `direct_${s2}_${s1}`;
  }

  /**
   * Trích xuất phạm vi quản lý của cán bộ (phường/xã/quận cụ thể hay tỉnh/thành phố)
   */
  extractAuthorityScope(authority) {
    if (!authority) return { specificSlug: null, broadSlug: null };
    const rawArea = [authority.areaName, authority.department, authority.organizationName].filter(Boolean).join(' ');
    const areaName = authority.areaName || '';
    const parts = areaName.split(',').map((p) => p.trim()).filter(Boolean);

    let specificPart = '';
    let broadPart = '';

    if (parts.length >= 2) {
      specificPart = parts[0];
      broadPart = parts[parts.length - 1];
    } else if (parts.length === 1) {
      const single = parts[0];
      if (/phường|xã|thị trấn|quận|huyện/i.test(single)) {
        specificPart = single;
      } else {
        broadPart = single;
      }
    }

    if (!specificPart) {
      const match = rawArea.match(/(phường|xã|thị trấn|quận|huyện)\s+([a-zA-Z0-9À-ỹ\s]+?)(?:,|\.|\b|$)/i);
      if (match) {
        specificPart = match[1] + ' ' + match[2].trim();
      }
    }

    const cleanSpecificName = specificPart
      .replace(/^(phường|xã|thị trấn|quận|huyện|p\.|x\.|tt\.|q\.|h\.)\s+/i, '')
      .trim();

    const cleanBroadName = broadPart
      .replace(/^(tỉnh|thành phố|tp\.)\s+/i, '')
      .trim();

    return {
      specificSlug: cleanSpecificName ? this.toAreaSlug(cleanSpecificName) : null,
      broadSlug: cleanBroadName ? this.toAreaSlug(cleanBroadName) : null,
    };
  }

  /**
   * Gửi tin nhắn mới
   */
  async sendMessage(senderUser, data) {
    const { recipientId, content, attachments = [], sosRequestId = null, sosData = null } = data;

    if ((!content || !content.trim()) && (!attachments || attachments.length === 0) && !sosRequestId && !sosData) {
      throw new ApiError(400, 'Nội dung tin nhắn hoặc tệp đính kèm không được để trống');
    }

    let channel = 'COMMAND_GENERAL';
    let recipientObjectId = null;

    if (recipientId && mongoose.Types.ObjectId.isValid(recipientId)) {
      recipientObjectId = new mongoose.Types.ObjectId(recipientId);
    }

    if (data.channel) {
      channel = data.channel;
    } else if (recipientObjectId) {
      channel = this.getDirectChannelId(senderUser._id, recipientObjectId);
    }

    // Nếu gửi vào kênh area_ mà chưa có recipientObjectId, tự động liên kết với cán bộ LOCAL_AUTHORITY của khu vực
    if (channel.startsWith('area_') && !recipientObjectId) {
      const parts = channel.replace(/^area_/, '').split('_');
      const cleanParts = parts.filter((p) => !/^[0-9a-fA-F]{24}$/.test(p));
      const cleanSlug = cleanParts.join('_');
      const authorities = await User.find({ roles: 'LOCAL_AUTHORITY', status: { $ne: 'SUSPENDED' } })
        .select('_id authority');

      // 1. Ưu tiên 1: Cán bộ có specificSlug (phường/xã/quận) khớp trong cleanSlug (vd: lien_chieu)
      for (const auth of authorities) {
        const { specificSlug } = this.extractAuthorityScope(auth.authority);
        if (specificSlug && cleanSlug.includes(specificSlug)) {
          recipientObjectId = auth._id;
          break;
        }
      }

      // 2. Ưu tiên 2: Cán bộ cấp tỉnh/thành phố (broadSlug) khớp trong cleanSlug (vd: da_nang)
      if (!recipientObjectId) {
        for (const auth of authorities) {
          const { broadSlug } = this.extractAuthorityScope(auth.authority);
          if (broadSlug && cleanSlug.includes(broadSlug)) {
            recipientObjectId = auth._id;
            break;
          }
        }
      }

      // 3. Fallback: Cán bộ đầu tiên
      if (!recipientObjectId && authorities.length > 0) {
        recipientObjectId = authorities[0]._id;
      }
    }

    const senderRole = senderUser.roles?.includes('ADMIN')
      ? 'ADMIN'
      : senderUser.roles?.includes('LOCAL_AUTHORITY')
      ? 'LOCAL_AUTHORITY'
      : senderUser.roles?.includes('RESCUER')
      ? 'RESCUER'
      : (senderUser.roles?.[0] || 'CITIZEN');

    let senderName = senderUser.fullName || senderUser.phone || senderUser.email || 'Người dân';
    // Trong kênh cứu hộ người dân - địa phương (area_), ưu tiên tên cán bộ thực tế (ví dụ: Lê Trọng Phúc). Chỉ fallback nếu không có tên
    if (channel.startsWith('area_') && (!senderUser.fullName || senderUser.fullName.toLowerCase() === 'admin')) {
      senderName = 'Cán bộ trực ban PCTT';
    }

    const message = await ChatMessage.create({
      senderId: senderUser._id,
      senderName,
      senderRole,
      recipientId: recipientObjectId,
      channel,
      content: (content && content.trim()) || (attachments && attachments.length > 0 ? '[Hình ảnh]' : '[Yêu cầu cứu nạn SOS]'),
      attachments,
      sosRequestId: sosRequestId && mongoose.Types.ObjectId.isValid(sosRequestId) ? sosRequestId : null,
      sosData: sosData || null,
      readBy: [senderUser._id],
    });

    const populated = await ChatMessage.findById(message._id)
      .populate('senderId', 'fullName phone email roles authority avatarUrl address citizen')
      .populate('recipientId', 'fullName phone email roles authority avatarUrl address citizen')
      .populate('sosRequestId');

    // Kích hoạt sự kiện thời gian thực qua Socket.IO & EventBus
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        // Gửi tới phòng kênh đang chat
        io.to(channel).emit('new_message', populated);

        // Gửi tới phòng riêng của người nhận (nếu có)
        if (recipientObjectId) {
          io.to(`user_${recipientObjectId}`).emit('new_message', populated);
        }

        // Nếu là kênh area_..., phát tới các cán bộ địa phương phụ trách (không phát tới Admin)
        if (channel.startsWith('area_')) {
          const staffUsers = await User.find({
            roles: { $in: ['LOCAL_AUTHORITY'] },
            status: { $ne: 'SUSPENDED' },
          }).select('_id authority roles');
          const chClean = channel.replace(/^area_/, '');

          for (const u of staffUsers) {
            const { specificSlug, broadSlug } = this.extractAuthorityScope(u.authority);
            const isMatched = specificSlug
              ? chClean.includes(specificSlug)
              : broadSlug
              ? chClean.includes(broadSlug)
              : false;

            if (isMatched) {
              io.to(`user_${u._id}`).emit('new_message', populated);
            }
          }
        }

        // Phát sự kiện toàn cục để cập nhật danh sách hội thoại / preview
        io.emit('chat_event', {
          action: 'NEW_MESSAGE',
          data: populated,
        });
      }
    } catch (socketErr) {
      console.warn('[Socket.IO] Lỗi phát tin nhắn thời gian thực:', socketErr.message);
    }

    eventBus.emit('chat_event', {
      action: 'NEW_MESSAGE',
      data: populated,
    });

    // Đẩy thông báo ra ngoài app và lưu notification vào hệ thống
    this.sendChatNotification({
      message: populated,
      senderUser,
      channel,
      recipientObjectId,
    }).catch((err) => console.warn('[Send Chat Notification Error]:', err.message));

    return populated;
  }

  /**
   * Lấy lịch sử tin nhắn
   */
  async getMessages({ channel, recipientId, currentUserId, limit = 100 }) {
    let targetChannel = 'COMMAND_GENERAL';

    if (recipientId && currentUserId) {
      targetChannel = this.getDirectChannelId(currentUserId, recipientId);
    } else if (channel) {
      targetChannel = channel;
    }

    let channelQuery = { channel: targetChannel };
    if (targetChannel.startsWith('area_')) {
      const parts = targetChannel.split('_');
      const uId = parts[parts.length - 1];
      if (mongoose.isValidObjectId(uId)) {
        const slugWithoutAreaAndUser = parts.slice(1, -1).join('_');
        const wardKw = slugWithoutAreaAndUser.split('_')[0];
        if (wardKw && wardKw.length >= 2) {
          channelQuery = {
            $or: [
              { channel: targetChannel },
              { channel: new RegExp(`area_.*${wardKw}.*_${uId}$`, 'i') },
            ],
          };
        }
      }
    }

    // Lấy tin nhắn theo đúng kênh riêng biệt của từng tài khoản
    const messages = await ChatMessage.find(channelQuery)
      .populate('senderId', 'fullName phone email roles authority avatarUrl address citizen')
      .populate('recipientId', 'fullName phone email roles authority avatarUrl address citizen')
      .populate('sosRequestId')
      .sort({ createdAt: 1 })
      .limit(Math.min(limit, 300));

    // Tự động chuẩn hóa các tin nhắn cũ về targetChannel nếu cần
    if (targetChannel.startsWith('area_') && messages.some((m) => m.channel !== targetChannel)) {
      ChatMessage.updateMany(channelQuery, { $set: { channel: targetChannel } }).catch(() => {});
    }

    // Tự động kiểm tra và đồng bộ trạng thái thực tế mới nhất của các ca SOS vào tin nhắn
    const sosIdsToFetch = [];
    const sosCodesToFetch = [];
    messages.forEach((m) => {
      const rawId = (m.sosRequestId && typeof m.sosRequestId === 'object' ? m.sosRequestId._id : m.sosRequestId) || m.sosData?._id;
      if (rawId && mongoose.isValidObjectId(rawId)) {
        sosIdsToFetch.push(rawId);
      }
      const rawCode = m.sosData?.sosCode || m.content?.match(/Mã cứu trợ:\s*(SOS-[A-Z0-9\-]+)/i)?.[1]?.trim();
      if (rawCode) {
        sosCodesToFetch.push(rawCode);
      }
    });

    const liveStatusMap = new Map();
    if (sosIdsToFetch.length > 0 || sosCodesToFetch.length > 0) {
      try {
        const liveSosList = await SosRequest.find({
          $or: [
            ...(sosIdsToFetch.length > 0 ? [{ _id: { $in: sosIdsToFetch } }] : []),
            ...(sosCodesToFetch.length > 0 ? [{ sosCode: { $in: sosCodesToFetch } }] : []),
          ],
        }).select('_id sosCode status');

        liveSosList.forEach((s) => {
          liveStatusMap.set(String(s._id), s.status);
          if (s.sosCode) liveStatusMap.set(s.sosCode, s.status);
        });
      } catch (sosLookupErr) {
        console.warn('Sync live SOS status in getMessages error:', sosLookupErr);
      }
    }

    const processedMessages = messages.map((m) => {
      const rawId = (m.sosRequestId && typeof m.sosRequestId === 'object' ? m.sosRequestId._id : m.sosRequestId) || m.sosData?._id;
      const rawCode = m.sosData?.sosCode || m.content?.match(/Mã cứu trợ:\s*(SOS-[A-Z0-9\-]+)/i)?.[1]?.trim();
      const liveStatus = (rawId && liveStatusMap.get(String(rawId))) || (rawCode && liveStatusMap.get(rawCode));

      const mObj = m.toObject ? m.toObject() : { ...m };
      if (mObj.senderId && typeof mObj.senderId === 'object' && mObj.senderId.avatarUrl) {
        mObj.senderAvatarUrl = mObj.senderId.avatarUrl;
      }

      if (liveStatus) {
        if (!mObj.sosData) mObj.sosData = {};
        mObj.sosData.status = liveStatus;
        if (mObj.sosRequestId && typeof mObj.sosRequestId === 'object') {
          mObj.sosRequestId.status = liveStatus;
        }
        if (mObj.content && mObj.content.includes('Trạng thái hiện tại:')) {
          const statusLabel =
            liveStatus === 'CANCELLED'
              ? 'Đã hủy'
              : liveStatus === 'COMPLETED'
              ? 'Hoàn thành'
              : liveStatus === 'VERIFIED'
              ? 'Đã xác minh'
              : liveStatus;
          mObj.content = mObj.content.replace(/Trạng thái hiện tại:\s*[^\n]+/i, `Trạng thái hiện tại: ${statusLabel}`);
        }
      }
      return mObj;
    });

    return {
      channel: targetChannel,
      messages: processedMessages,
    };
  }

  /**
   * Lấy danh sách cuộc hội thoại cho Admin hoặc Cán bộ Authority (Siêu tối ưu bằng Batch & Aggregation)
   */
  async getConversations(currentUser) {
    const isUserAdmin = (currentUser.roles || []).includes('ADMIN');
    const isAuthority = (currentUser.roles || []).includes('LOCAL_AUTHORITY');

    // 1. Thu thập danh sách kênh địa phương (area_) nếu là LOCAL_AUTHORITY
    const areaChannelsSet = new Set();
    const possibleUserIdsFromArea = [];

    if (isAuthority && !isUserAdmin) {
      const distinctAreaChannels = await ChatMessage.distinct('channel', {
        channel: { $regex: '^area_' },
      });

      const { specificSlug, broadSlug } = this.extractAuthorityScope(currentUser.authority);

      for (const ch of distinctAreaChannels) {
        const chClean = ch.replace(/^area_/, '');

        let isMatched = false;
        if (specificSlug) {
          isMatched = chClean.includes(specificSlug);
        } else if (broadSlug) {
          isMatched = chClean.includes(broadSlug);
        }

        if (isMatched) {
          areaChannelsSet.add(ch);
          const parts = chClean.split('_');
          const possibleUserId = parts[parts.length - 1];
          if (possibleUserId && mongoose.Types.ObjectId.isValid(possibleUserId)) {
            possibleUserIdsFromArea.push(new mongoose.Types.ObjectId(possibleUserId));
          }
        }
      }
    }

    // 2. Lấy danh sách đối tác chat trực tiếp (Admin hoặc đồng nghiệp)
    const userFilter = {
      _id: { $ne: currentUser._id },
      status: { $ne: 'SUSPENDED' },
      roles: { $in: ['ADMIN', 'LOCAL_AUTHORITY'] },
    };

    const potentialPartners = await User.find(userFilter)
      .select('fullName phone email roles authority avatarUrl status createdAt')
      .sort({ 'roles.0': 1, fullName: 1 })
      .limit(60);

    const partnerChannelMap = new Map();
    potentialPartners.forEach((p) => {
      const ch = this.getDirectChannelId(currentUser._id, p._id);
      partnerChannelMap.set(String(p._id), ch);
    });

    const allDirectChannels = Array.from(partnerChannelMap.values());
    const activeDirectChannels = await ChatMessage.distinct('channel', {
      channel: { $in: allDirectChannels },
    });
    const activeDirectSet = new Set(activeDirectChannels);

    // 3. Tập hợp TẤT CẢ các kênh cần truy vấn tin nhắn mới nhất và số chưa đọc
    const allChannelsToFetch = [
      'COMMAND_GENERAL',
      ...Array.from(areaChannelsSet),
      ...activeDirectChannels,
    ];

    // 4. Thực thi 2 truy vấn Aggregation song song cực nhanh
    const [latestAgg, unreadAgg] = await Promise.all([
      ChatMessage.aggregate([
        { $match: { channel: { $in: allChannelsToFetch } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$channel',
            content: { $first: '$content' },
            senderName: { $first: '$senderName' },
            createdAt: { $first: '$createdAt' },
            senderId: { $first: '$senderId' },
          },
        },
      ]),
      ChatMessage.aggregate([
        {
          $match: {
            channel: { $in: allChannelsToFetch },
            senderId: { $ne: currentUser._id },
            readBy: { $ne: currentUser._id },
          },
        },
        {
          $group: {
            _id: '$channel',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const latestMap = new Map();
    latestAgg.forEach((item) => {
      latestMap.set(item._id, item);
    });

    const unreadMap = new Map();
    unreadAgg.forEach((item) => {
      unreadMap.set(item._id, item.count);
    });

    // 5. Tải trước thông tin đối tác người dùng cho các kênh area_ trong 1 truy vấn duy nhất
    const userIdsToFetch = new Set(possibleUserIdsFromArea.map((id) => String(id)));
    latestAgg.forEach((item) => {
      if (item.senderId && mongoose.Types.ObjectId.isValid(item.senderId)) {
        userIdsToFetch.add(String(item.senderId));
      }
    });

    const fetchedUsers = userIdsToFetch.size > 0
      ? await User.find({ _id: { $in: Array.from(userIdsToFetch) } }).select('fullName phone email roles avatarUrl authority address citizen')
      : [];

    const userMap = new Map();
    fetchedUsers.forEach((u) => {
      userMap.set(String(u._id), u);
    });

    // 6. Xây dựng kết quả: Kênh tác chiến chung COMMAND_GENERAL
    const generalLatest = latestMap.get('COMMAND_GENERAL');
    const generalUnread = unreadMap.get('COMMAND_GENERAL') || 0;

    const conversations = [
      {
        type: 'CHANNEL',
        channel: 'COMMAND_GENERAL',
        name: 'Kênh Chỉ Huy Chung',
        description: 'Phòng ban trực ban & trao đổi khẩn cấp toàn hệ thống',
        role: 'ALL',
        unreadCount: generalUnread,
        latestMessage: generalLatest
          ? {
              content: generalLatest.content,
              senderName: generalLatest.senderName,
              createdAt: generalLatest.createdAt,
            }
          : null,
      },
    ];

    // 7. Xây dựng kết quả: Các kênh địa bàn (area_)
    for (const ch of areaChannelsSet) {
      const areaLatest = latestMap.get(ch);
      if (!areaLatest) continue;

      const areaUnread = unreadMap.get(ch) || 0;
      const cleanSlugParts = ch.replace(/^area_/, '').split('_');
      const possibleUserId = cleanSlugParts[cleanSlugParts.length - 1];

      let partnerUser = null;
      if (possibleUserId && userMap.has(possibleUserId)) {
        partnerUser = userMap.get(possibleUserId);
      } else if (areaLatest.senderId && userMap.has(String(areaLatest.senderId))) {
        const candidate = userMap.get(String(areaLatest.senderId));
        const senderRoles = candidate.roles || [];
        if (!senderRoles.includes('LOCAL_AUTHORITY') && !senderRoles.includes('ADMIN')) {
          partnerUser = candidate;
        }
      }

      // Tránh trùng lặp cuộc hội thoại của cùng 1 người dân (gộp tin nhắn từ các kênh legacy cũ)
      const partnerKey = partnerUser?._id ? String(partnerUser._id) : (possibleUserId || null);
      if (partnerKey) {
        const existingIdx = conversations.findIndex(
          (c) => c.type === 'CHANNEL' && (String(c.partnerId) === partnerKey || c.channel.endsWith(`_${partnerKey}`))
        );
        if (existingIdx !== -1) {
          const existingTime = conversations[existingIdx].latestMessage
            ? new Date(conversations[existingIdx].latestMessage.createdAt).getTime()
            : 0;
          const newTime = areaLatest ? new Date(areaLatest.createdAt).getTime() : 0;
          if (newTime > existingTime) {
            conversations[existingIdx].channel = ch;
            conversations[existingIdx].latestMessage = {
              content: areaLatest.content,
              senderName: areaLatest.senderName,
              createdAt: areaLatest.createdAt,
            };
          }
          conversations[existingIdx].unreadCount = (conversations[existingIdx].unreadCount || 0) + areaUnread;
          continue;
        }
      }

      let channelAreaName = partnerUser?.address || '';
      if (!channelAreaName) {
        const words = cleanSlugParts.filter((p) => !/^[0-9a-fA-F]{24}$/.test(p));
        channelAreaName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      let convName = `Cứu Hộ - ${channelAreaName}`;
      let convDesc = `Kênh tiếp nhận người dân phản ánh & cầu cứu tại ${channelAreaName}`;
      let convRole = 'CITIZEN';

      if (partnerUser) {
        const isRescuer = (partnerUser.roles || []).includes('RESCUER');
        const roleLabel = isRescuer ? 'Cứu hộ viên' : 'Người dân';
        convName = `${partnerUser.fullName || 'Người dùng'} (${roleLabel})`;
        convDesc = `SĐT: ${partnerUser.phone || 'Chưa cập nhật'} • Địa bàn: ${channelAreaName}`;
        convRole = isRescuer ? 'RESCUER' : 'CITIZEN';
      }

      conversations.push({
        type: 'CHANNEL',
        channel: ch,
        name: convName,
        description: convDesc,
        role: convRole,
        partnerId: partnerUser?._id,
        avatarUrl: partnerUser?.avatarUrl,
        phone: partnerUser?.phone,
        areaName: channelAreaName,
        address: partnerUser?.address || channelAreaName,
        partnerUser: partnerUser
          ? {
              _id: partnerUser._id,
              fullName: partnerUser.fullName,
              phone: partnerUser.phone,
              email: partnerUser.email,
              address: partnerUser.address,
              avatarUrl: partnerUser.avatarUrl || null,
              roles: partnerUser.roles,
              emergencyContact: partnerUser.citizen?.emergencyContact || null,
              emergencyContacts: partnerUser.citizen?.emergencyContacts || [],
            }
          : null,
        unreadCount: areaUnread,
        latestMessage: {
          content: areaLatest.content,
          senderName: areaLatest.senderName,
          createdAt: areaLatest.createdAt,
        },
      });
    }

    // 8. Xây dựng kết quả: Các kênh trò chuyện 1-1 (DIRECT)
    for (const partner of potentialPartners) {
      const channel = partnerChannelMap.get(String(partner._id));
      const hasMessages = activeDirectSet.has(channel);
      const partnerRole = partner.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY';

      const isVisible =
        hasMessages ||
        partnerRole === 'ADMIN' ||
        (isUserAdmin && partnerRole === 'LOCAL_AUTHORITY') ||
        (isAuthority && partnerRole === 'LOCAL_AUTHORITY');

      if (!isVisible) continue;

      const latestMsg = latestMap.get(channel) || null;
      const unreadCount = unreadMap.get(channel) || 0;

      conversations.push({
        type: 'DIRECT',
        channel,
        partnerId: partner._id,
        name: partner.fullName || partner.phone || partner.email,
        phone: partner.phone,
        email: partner.email,
        role: partnerRole,
        avatarUrl: partner.avatarUrl || null,
        areaName: partner.authority?.areaName || (partnerRole === 'ADMIN' ? 'Toàn quốc (Trung ương)' : 'Địa phương'),
        position: partner.authority?.position || (partnerRole === 'ADMIN' ? 'Quản trị viên hệ thống' : 'Cán bộ điều hành'),
        unreadCount,
        latestMessage: latestMsg
          ? {
              content: latestMsg.content,
              senderName: latestMsg.senderName,
              createdAt: latestMsg.createdAt,
            }
          : null,
      });
    }

    // 9. Sắp xếp: Kênh tác chiến chung và kênh địa bàn ưu tiên trước, sau đó theo thời gian tin nhắn mới nhất
    const channels = conversations.filter((c) => c.type === 'CHANNEL');
    const directs = conversations.filter((c) => c.type === 'DIRECT');

    const sortedChannels = channels.sort((a, b) => {
      if (a.channel === 'COMMAND_GENERAL') return -1;
      if (b.channel === 'COMMAND_GENERAL') return 1;
      const timeA = a.latestMessage ? new Date(a.latestMessage.createdAt).getTime() : 0;
      const timeB = b.latestMessage ? new Date(b.latestMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const sortedDirects = directs.sort((a, b) => {
      const timeA = a.latestMessage ? new Date(a.latestMessage.createdAt).getTime() : 0;
      const timeB = b.latestMessage ? new Date(b.latestMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return [...sortedChannels, ...sortedDirects];
  }

  /**
   * Đánh dấu tin nhắn đã đọc
   */
  async markAsRead(currentUser, { channel, partnerId }) {
    let targetChannel = 'COMMAND_GENERAL';

    if (partnerId) {
      targetChannel = this.getDirectChannelId(currentUser._id, partnerId);
    } else if (channel) {
      targetChannel = channel;
    }

    let channelQuery = { channel: targetChannel };
    if (targetChannel.startsWith('area_')) {
      const cleanSlug = targetChannel.replace(/^area_/, '');
      const parts = cleanSlug.split('_').filter((p) => p.length > 2);
      if (parts.length > 0) {
        channelQuery = {
          $or: [
            { channel: targetChannel },
            { channel: new RegExp(parts[0], 'i') },
          ],
        };
      }
    }

    await ChatMessage.updateMany(
      {
        ...channelQuery,
        readBy: { $ne: currentUser._id },
      },
      {
        $addToSet: { readBy: currentUser._id },
      }
    );

    eventBus.emit('chat_event', {
      action: 'MESSAGES_READ',
      data: {
        channel: targetChannel,
        readerId: currentUser._id,
      },
    });

    return { success: true, channel: targetChannel };
  }

  /**
   * Đánh dấu toàn bộ tin nhắn đã đọc cho người dùng hiện tại
   */
  async markAllAsRead(currentUser) {
    await ChatMessage.updateMany(
      {
        readBy: { $ne: currentUser._id },
      },
      {
        $addToSet: { readBy: currentUser._id },
      }
    );

    eventBus.emit('chat_event', {
      action: 'MESSAGES_READ_ALL',
      data: {
        readerId: currentUser._id,
      },
    });

    return { success: true };
  }

  /**
   * Tìm thông tin Ban chỉ huy / Cán bộ địa phương theo địa bàn (GPS hoặc địa chỉ)
   */
  async getLocalAuthorityForArea({ areaName, province, ward, lat, lng, userId, currentUser }) {
    const { User, AuthorityOrganization, AdministrativeArea } = require('../models');

    // 1. Chuẩn hoá tên địa bàn của người dân / cứu hộ viên
    let resolvedAreaName = areaName || (ward && province ? `${ward}, ${province}` : (province || 'Địa phương'));
    if (ward && province && !resolvedAreaName.includes(ward)) {
      resolvedAreaName = `${ward}, ${province}`;
    }

    let cleanWard = '';
    let cleanDistrict = '';
    let cleanProvince = '';
    let cleanArea = '';

    if (areaName) {
      const parts = areaName.split(',').map((s) => s.trim()).filter(Boolean);
      let extractedWard = '';
      let extractedDistrict = '';
      let extractedProvince = '';

      if (parts.length >= 3) {
        extractedProvince = parts[parts.length - 1];
        extractedWard = parts[parts.length - 2];
        if (parts.length >= 4) extractedDistrict = parts[parts.length - 3];
      } else if (parts.length === 2) {
        extractedProvince = parts[1];
        extractedWard = parts[0];
      } else if (parts.length === 1) {
        extractedWard = parts[0];
      }

      const wMatch = areaName.match(/(phường|xã|thị trấn|p\.|x\.|tt\.)\s+([^,]+)/i);
      if (wMatch && wMatch[2]) extractedWard = wMatch[2].trim();

      const dMatch = areaName.match(/(quận|huyện|thị xã|q\.|h\.)\s+([^,]+)/i);
      if (dMatch && dMatch[2]) extractedDistrict = dMatch[2].trim();

      const pMatch = areaName.match(/(thành phố|tỉnh|tp\.?)\s+([^,]+)/i);
      if (pMatch && pMatch[2]) extractedProvince = pMatch[2].trim();

      if (extractedWard) cleanWard = extractedWard.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
      if (extractedDistrict) cleanDistrict = extractedDistrict.replace(/^(quận|huyện|thị xã|q\.|h\.)\s+/i, '').trim();
      if (extractedProvince) cleanProvince = extractedProvince.replace(/^(tỉnh|thành phố|tp\.)\s+/i, '').trim();
    }

    if (ward) {
      cleanWard = ward.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
    }
    if (province) {
      cleanProvince = province.replace(/^(tỉnh|thành phố|tp\.)\s+/i, '').trim();
    }
    if (areaName) {
      cleanArea = areaName.replace(/^(phường|xã|quận|huyện|thị xã|thành phố|tp\.)\s+/i, '').trim();
    }

    // Địa bàn chính thức: BẮT BUỘC LUÔN LÀ ĐỊA BÀN THỰC TẾ CỦA NGƯỜI DÂN
    const officialAreaName = resolvedAreaName;

    // Định danh kênh chat chuẩn hóa theo Cấp Phường / Xã và Tỉnh / TP
    // Đảm bảo cùng 1 Phường / Xã luôn dùng chung 1 kênh duy nhất cho mỗi người dùng (tránh tạo nhiều kênh theo từng tên đường)
    const wardSlug = cleanWard ? this.toAreaSlug(cleanWard) : this.toAreaSlug(cleanArea || 'local');
    const provSlug = cleanProvince ? this.toAreaSlug(cleanProvince) : 'thanh_pho_da_nang';
    const safeSlug = `${wardSlug}_${provSlug}`;

    // Mỗi tài khoản người dùng có một kênh trao đổi riêng biệt với chính quyền địa phương
    const targetUserId = currentUser?._id || userId;
    const userSuffix = targetUserId ? `_${targetUserId}` : '';
    const channel = `area_${safeSlug}${userSuffix}`;

    // Tự động gộp / đồng bộ tất cả tin nhắn cũ của user này thuộc phường này về kênh chuẩn channel
    if (targetUserId && wardSlug && wardSlug.length >= 2) {
      try {
        const legacyPattern = new RegExp(`area_.*${wardSlug}.*_${targetUserId}$`, 'i');
        await ChatMessage.updateMany(
          {
            channel: { $regex: legacyPattern, $ne: channel },
          },
          { $set: { channel } }
        );
      } catch (err) {
        console.warn('[Sync legacy chat channel error]:', err.message);
      }
    }

    let manager = null;
    let matchedOrg = null;
    let hasMatchedWardOfficer = false;

    // 2. Tìm kiếm Cán bộ địa phương hoặc Cơ quan chức năng địa phương
    // ƯU TIÊN 1: Tìm Cán bộ hoặc UBND được phân công ĐÚNG PHƯỜNG / XÃ của người dân
    const wardKeyword = cleanWard || cleanArea;
    if (wardKeyword && wardKeyword.length >= 2) {
      const wardRegex = new RegExp(wardKeyword, 'i');

      // 1.1 Tìm trong danh sách Cán bộ LOCAL_AUTHORITY
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
        $or: [
          { 'authority.areaName': wardRegex },
          { 'authority.department': wardRegex },
          { 'authority.organizationName': wardRegex },
          { address: wardRegex },
        ],
      }).select('fullName phone email roles authority avatarUrl');

      if (manager) {
        hasMatchedWardOfficer = true;
      }

      // 1.2 Nếu chưa có cán bộ cá nhân, tìm Cơ quan / UBND trực ban cấp xã/phường
      if (!manager) {
        matchedOrg = await AuthorityOrganization.findOne({
          status: 'ACTIVE',
          $or: [
            { name: wardRegex },
            { address: wardRegex },
          ],
        }).select('name code phone email address areaId administrativeAreaId');
      }
    }

    // ƯU TIÊN 2: Nếu có tọa độ GPS [lat, lng], tìm ranh giới GeoJSON Polygon thực tế trong CSDL AdministrativeArea
    if (!manager && !matchedOrg && typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      try {
        const { findAreaByCoordinates } = require('../utils/geoUtils');
        const matchingArea = await findAreaByCoordinates([lng, lat], AdministrativeArea);

        if (matchingArea) {
          const areaKw = matchingArea.name.replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
          manager = await User.findOne({
            roles: 'LOCAL_AUTHORITY',
            status: { $ne: 'SUSPENDED' },
            $or: [
              { 'authority.areaId': matchingArea._id },
              { 'authority.areaName': new RegExp(areaKw, 'i') },
              { 'authority.department': new RegExp(areaKw, 'i') },
            ],
          }).select('fullName phone email roles authority avatarUrl');

          if (!manager) {
            matchedOrg = await AuthorityOrganization.findOne({
              status: 'ACTIVE',
              $or: [
                { areaId: matchingArea._id },
                { administrativeAreaId: matchingArea._id },
                { name: new RegExp(areaKw, 'i') },
                { address: new RegExp(areaKw, 'i') },
              ],
            }).select('name code phone email address');
          }

          // Nếu khu vực tìm được là Phường nhưng chưa có cán bộ, tìm lên cấp Quận/Tỉnh cha
          if (!manager && !matchedOrg && matchingArea.parentId) {
            manager = await User.findOne({
              roles: 'LOCAL_AUTHORITY',
              status: { $ne: 'SUSPENDED' },
              'authority.areaId': matchingArea.parentId,
            }).select('fullName phone email roles authority avatarUrl');
          }
        }
      } catch (err) {
        console.log('[ChatService GPS Match Note]:', err.message);
      }
    }

    // ƯU TIÊN 3: Nếu chưa có cấp phường, tìm Ban Chỉ Huy / Cơ quan cấp Quận / Huyện
    if (!manager && !matchedOrg && cleanDistrict && cleanDistrict.length >= 2) {
      const districtRegex = new RegExp(cleanDistrict, 'i');
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
        $or: [
          { 'authority.areaName': districtRegex },
          { 'authority.department': districtRegex },
          { 'authority.organizationName': districtRegex },
          { address: districtRegex },
        ],
      }).select('fullName phone email roles authority avatarUrl');

      if (!manager) {
        matchedOrg = await AuthorityOrganization.findOne({
          status: 'ACTIVE',
          $or: [
            { name: districtRegex },
            { address: districtRegex },
          ],
        }).select('name code phone email address');
      }
    }

    // ƯU TIÊN 4: Nếu chưa có cấp quận/huyện, tìm Ban Chỉ Huy / Cơ quan cấp Tỉnh / Thành phố
    if (!manager && !matchedOrg && cleanProvince) {
      const provinceRegex = new RegExp(cleanProvince, 'i');

      // Tìm cán bộ cấp Tỉnh/Thành phố
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
        $or: [
          {
            $and: [
              { 'authority.areaName': provinceRegex },
              { 'authority.areaName': { $not: /phường|xã|thị trấn/i } },
            ],
          },
          { 'authority.department': provinceRegex },
          { 'authority.organizationName': provinceRegex },
        ],
      }).select('fullName phone email roles authority avatarUrl');

      if (!manager) {
        matchedOrg = await AuthorityOrganization.findOne({
          status: 'ACTIVE',
          $or: [
            { name: provinceRegex },
            { address: provinceRegex },
          ],
        }).select('name code phone email address');
      }

      if (!manager && !matchedOrg) {
        manager = await User.findOne({
          roles: 'LOCAL_AUTHORITY',
          status: { $ne: 'SUSPENDED' },
          $or: [
            { 'authority.areaName': provinceRegex },
            { 'authority.department': provinceRegex },
          ],
        }).select('fullName phone email roles authority avatarUrl');
      }
    }

    // Danh bạ đường dây nóng Ban Chỉ Huy PCTT & TKCN khu vực TP. Đà Nẵng (mới)
    const PROVINCE_HOTLINES = {
      'đà nẵng': { phone: '02363822111', name: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng' },
      'quảng nam': { phone: '02353852554', name: 'Ban Chỉ Huy PCTT & TKCN Khu vực Quảng Nam (Đà Nẵng mới)' },
      'điện bàn': { phone: '02353888999', name: 'Ban Chỉ Huy PCTT & TKCN Khu vực Điện Bàn' },
    };

    const WARD_HOTLINES = [
      { ward: 'Phường Hải Châu', phone: '02363810101' },
      { ward: 'Phường Thanh Khê', phone: '02363810102' },
      { ward: 'Phường An Khê', phone: '02363810103' },
      { ward: 'Phường Hòa Cường', phone: '02363810104' },
      { ward: 'Phường Sơn Trà', phone: '02363810105' },
      { ward: 'Phường An Hải', phone: '02363810106' },
      { ward: 'Phường Ngũ Hành Sơn', phone: '02363810107' },
      { ward: 'Phường Hải Vân', phone: '02363810108' },
      { ward: 'Đặc khu Hoàng Sa', phone: '02363810109' },
      { ward: 'Xã Duy Nghĩa', phone: '02363810110' },
      { ward: 'Phường Liên Chiểu', phone: '02363810111' },
      { ward: 'Phường Hòa Khánh', phone: '02363810112' },
      { ward: 'Phường Cẩm Lệ', phone: '02363810113' },
      { ward: 'Phường Hòa Xuân', phone: '02363810114' },
      { ward: 'Phường Điện Bàn', phone: '02363810115' },
      { ward: 'Xã Hòa Vang', phone: '02363810116' },
      { ward: 'Xã Hòa Tiến', phone: '02363810117' },
      { ward: 'Xã Bà Nà', phone: '02363810118' },
      { ward: 'Phường Hội An', phone: '02363810119' },
    ];

    let wardDefaultContact = null;
    const wardTargetLower = `${cleanWard || ''} ${officialAreaName || ''}`.toLowerCase();
    for (const wh of WARD_HOTLINES) {
      const key = wh.ward.replace(/^(Phường|Xã|Đặc khu)\s+/i, '').toLowerCase();
      if (key && wardTargetLower.includes(key)) {
        wardDefaultContact = {
          phone: wh.phone,
          name: `Ban Chỉ Huy PCTT & TKCN ${wh.ward}`,
        };
        break;
      }
    }

    let provContact = wardDefaultContact;
    if (!provContact) {
      const provLower = (cleanProvince || '').toLowerCase().trim();
      for (const [key, val] of Object.entries(PROVINCE_HOTLINES)) {
        if (provLower.includes(key) || key.includes(provLower)) {
          provContact = val;
          break;
        }
      }
    }

    // ƯU TIÊN 5: Fallback cơ quan cứu nạn chỉ khi không xác định được tỉnh/thành nào
    if (!manager && !matchedOrg && !provContact) {
      matchedOrg = await AuthorityOrganization.findOne({ status: 'ACTIVE' })
        .select('name code phone email address');
    }
    if (!manager && !matchedOrg && !provContact) {
      manager = await User.findOne({ roles: 'LOCAL_AUTHORITY', status: { $ne: 'SUSPENDED' } })
        .select('fullName phone email roles authority avatarUrl');
    }

    const hasMatchedOfficer = !!manager || !!matchedOrg;

    // Chuẩn hóa tên đơn vị & tên người phụ trách
    const cleanDisplayArea = officialAreaName.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
    const isCommune = /phường|xã|thị trấn/i.test(officialAreaName);

    let departmentTitle = '';
    if (hasMatchedWardOfficer && manager?.authority?.department) {
      departmentTitle = manager.authority.department;
    } else if (matchedOrg?.name) {
      departmentTitle = matchedOrg.name;
    } else if (hasMatchedWardOfficer) {
      departmentTitle = `UBND ${ward || officialAreaName}`;
    } else if (manager?.authority?.department) {
      departmentTitle = manager.authority.department;
    } else if (isCommune && ward) {
      departmentTitle = `UBND ${ward}`;
    } else if (provContact?.name) {
      departmentTitle = provContact.name;
    } else {
      departmentTitle = `Ban Chỉ Huy PCTT & TKCN ${cleanProvince || cleanDisplayArea || 'Địa Phương'}`;
    }

    // Chuẩn hóa số điện thoại đường dây nóng (phải là số gọi được, không dùng dấu xuyệt)
    let rawPhone = manager?.phone || matchedOrg?.phone || provContact?.phone || '';
    // Nếu có dạng "0236... / 0905...", tách lấy số đầu tiên
    if (rawPhone.includes('/')) {
      rawPhone = rawPhone.split('/')[0].trim();
    }
    let cleanPhone = rawPhone.replace(/[^0-9+]/g, '');

    const authorityName = manager?.fullName || matchedOrg?.name || provContact?.name || `Trực ban PCTT ${cleanWard || cleanDisplayArea || 'Địa phương'}`;

    return {
      channel,
      areaName: officialAreaName, // Địa bàn thực tế của người dân
      authority: {
        id: manager?._id || matchedOrg?._id || null,
        name: authorityName,
        phone: cleanPhone, // Luôn luôn là số điện thoại chuẩn có thể gọi được ngay
        email: manager?.email || matchedOrg?.email || 'hotro@sos.vn',
        position: manager?.authority?.position || 'Trực ban tác chiến PCTT',
        department: departmentTitle,
        areaName: officialAreaName,
        avatarUrl: manager?.avatarUrl || null,
        status: 'ONLINE',
      },
    };
  }
  /**
   * Danh bạ đường dây nóng khẩn cấp công khai cho người dân chọn gọi khi chưa đăng nhập
   */
  async getEmergencyDirectory({ search, lat, lng } = {}) {
    const { User, AuthorityOrganization } = require('../models');

    // Chỉ giữ lại đầu mối khu vực TP. Đà Nẵng mới (Đà Nẵng & Quảng Nam sáp nhập)
    const PROVINCE_DIRECTORY = [
      {
        id: 'hotline-da-nang',
        name: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng',
        department: 'Ủy Ban Nhân Dân TP. Đà Nẵng',
        phone: '02363822111',
        areaName: 'Thành phố Đà Nẵng',
        address: 'Số 42 Bạch Đằng, Quận Hải Châu, TP. Đà Nẵng',
        type: 'PROVINCE',
        lat: 16.0544,
        lng: 108.2022,
      },
      {
        id: 'hotline-quang-nam-dn',
        name: 'Ban Chỉ Huy PCTT & TKCN Khu vực Tam Kỳ (Đà Nẵng mới)',
        department: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng',
        phone: '02353852554',
        areaName: 'Khu vực Tam Kỳ, TP. Đà Nẵng',
        address: 'Số 500 Hùng Vương, Tam Kỳ, TP. Đà Nẵng',
        type: 'PROVINCE',
        lat: 15.5647,
        lng: 108.4839,
      },
    ];

    const OUTSIDE_DANANG_KEYWORDS = [
      'cần thơ', 'ninh kiều', 'tân an', 'hà nội', 'hoàn kiếm', 'hồ chí minh',
      'tp. hcm', 'quận 1', 'hải phòng', 'huế', 'thừa thiên', 'quảng ngãi',
      'bình định', 'quy nhơn', 'khánh hòa', 'nha trang', 'bình dương',
      'đồng nai', 'an giang', 'kiên giang',
    ];
    const isInsideDanangNew = (text = '') => {
      const lower = String(text).toLowerCase();
      return !OUTSIDE_DANANG_KEYWORDS.some((kw) => lower.includes(kw));
    };

    // Lấy tất cả AuthorityOrganization đang ACTIVE
    const orgs = await AuthorityOrganization.find({ status: 'ACTIVE' })
      .select('name code phone email address administrativeAreaId areaId')
      .lean();

    // Lấy các Cán bộ địa phương có số điện thoại
    const officers = await User.find({
      roles: 'LOCAL_AUTHORITY',
      status: { $ne: 'SUSPENDED' },
      phone: { $exists: true, $ne: '' },
    })
      .select('fullName phone email authority address')
      .lean();

    const seenPhones = new Set();
    const results = [];

    // 1. Đưa các tổ chức cấp phường/xã/khu vực Đà Nẵng mới trong DB lên trước
    for (const org of orgs) {
      const combined = `${org.name || ''} ${org.address || ''}`;
      if (!isInsideDanangNew(combined)) continue;
      const cleanPhone = (org.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone && !seenPhones.has(cleanPhone)) {
        seenPhones.add(cleanPhone);
        results.push({
          id: String(org._id),
          name: org.name,
          department: org.name,
          phone: cleanPhone,
          address: org.address || 'Địa bàn TP. Đà Nẵng',
          areaName: org.address || org.name,
          type: 'ORGANIZATION',
        });
      }
    }

    // 2. Thêm cán bộ phụ trách trong khu vực Đà Nẵng mới
    for (const officer of officers) {
      const dept = officer.authority?.department || 'Cán bộ trực ban PCTT';
      const area = officer.authority?.areaName || officer.address || 'Địa bàn quản lý';
      if (!isInsideDanangNew(`${dept} ${area} ${officer.fullName || ''}`)) continue;
      const cleanPhone = (officer.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone && !seenPhones.has(cleanPhone)) {
        seenPhones.add(cleanPhone);
        results.push({
          id: String(officer._id),
          name: officer.fullName || dept,
          department: dept,
          phone: cleanPhone,
          address: area,
          areaName: area,
          type: 'OFFICER',
        });
      }
    }

    // 3. Thêm các đầu mối Tỉnh/Thành phố toàn quốc
    for (const p of PROVINCE_DIRECTORY) {
      if (!seenPhones.has(p.phone)) {
        seenPhones.add(p.phone);
        results.push(p);
      }
    }

    // 3.5. Đảm bảo mỗi phường/xã/khu vực thuộc TP. Đà Nẵng mới đều có ít nhất 1 chính quyền & 1 SĐT trực ban
    const WARD_AUTHORITY_DEFAULTS = [
      { id: 'ward-hai-chau', ward: 'Phường Hải Châu', phone: '02363810101', lat: 16.0678, lng: 108.2208 },
      { id: 'ward-thanh-khe', ward: 'Phường Thanh Khê', phone: '02363810102', lat: 16.0616, lng: 108.1872 },
      { id: 'ward-an-khe', ward: 'Phường An Khê', phone: '02363810103', lat: 16.0558, lng: 108.1726 },
      { id: 'ward-hoa-cuong', ward: 'Phường Hòa Cường', phone: '02363810104', lat: 16.0406, lng: 108.2198 },
      { id: 'ward-son-tra', ward: 'Phường Sơn Trà', phone: '02363810105', lat: 16.0908, lng: 108.2412 },
      { id: 'ward-an-hai', ward: 'Phường An Hải', phone: '02363810106', lat: 16.0672, lng: 108.2385 },
      { id: 'ward-ngu-hanh-son', ward: 'Phường Ngũ Hành Sơn', phone: '02363810107', lat: 16.0024, lng: 108.2625 },
      { id: 'ward-hai-van', ward: 'Phường Hải Vân', phone: '02363810108', lat: 16.1538, lng: 108.1286 },
      { id: 'ward-hoang-sa', ward: 'Đặc khu Hoàng Sa', phone: '02363810109', lat: 16.0985, lng: 108.2345 },
      { id: 'ward-duy-nghia', ward: 'Xã Duy Nghĩa', phone: '02363810110', lat: 15.8442, lng: 108.3746 },
      { id: 'ward-lien-chieu', ward: 'Phường Liên Chiểu', phone: '02363810111', lat: 16.0748, lng: 108.1516 },
      { id: 'ward-hoa-khanh', ward: 'Phường Hòa Khánh', phone: '02363810112', lat: 16.0665, lng: 108.1462 },
      { id: 'ward-cam-le', ward: 'Phường Cẩm Lệ', phone: '02363810113', lat: 16.0172, lng: 108.1965 },
      { id: 'ward-hoa-xuan', ward: 'Phường Hòa Xuân', phone: '02363810114', lat: 15.9985, lng: 108.2165 },
      { id: 'ward-dien-ban', ward: 'Phường Điện Bàn', phone: '02363810115', lat: 15.8914, lng: 108.2485 },
      { id: 'ward-hoa-vang', ward: 'Xã Hòa Vang', phone: '02363810116', lat: 16.0068, lng: 108.1325 },
      { id: 'ward-hoa-tien', ward: 'Xã Hòa Tiến', phone: '02363810117', lat: 15.9752, lng: 108.1654 },
      { id: 'ward-ba-na', ward: 'Xã Bà Nà', phone: '02363810118', lat: 16.0026, lng: 108.0532 },
      { id: 'ward-hoi-an', ward: 'Phường Hội An', phone: '02363810119', lat: 15.8801, lng: 108.3380 },
    ];

    for (const w of WARD_AUTHORITY_DEFAULTS) {
      const shortKey = w.ward.replace(/^(Phường|Xã|Đặc khu)\s+/i, '').toLowerCase();
      const alreadyHasWardContact = results.some((item) => {
        const text = `${item.name || ''} ${item.department || ''} ${item.address || ''} ${item.areaName || ''}`.toLowerCase();
        return text.includes(shortKey);
      });
      if (!alreadyHasWardContact && !seenPhones.has(w.phone)) {
        seenPhones.add(w.phone);
        results.push({
          id: w.id,
          name: `Ban Chỉ Huy PCTT & TKCN ${w.ward}`,
          department: `UBND ${w.ward}, TP. Đà Nẵng`,
          phone: w.phone,
          areaName: `${w.ward}, TP. Đà Nẵng`,
          address: `${w.ward}, Thành phố Đà Nẵng`,
          type: 'ORGANIZATION',
          lat: w.lat,
          lng: w.lng,
        });
      }
    }

    // 4. Nếu có từ khóa tìm kiếm (search)
    let filtered = results;
    if (search && String(search).trim()) {
      const q = String(search).toLowerCase().trim();
      filtered = results.filter((item) => {
        return (
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.department && item.department.toLowerCase().includes(q)) ||
          (item.address && item.address.toLowerCase().includes(q)) ||
          (item.areaName && item.areaName.toLowerCase().includes(q)) ||
          (item.phone && item.phone.includes(q))
        );
      });
    }

    return filtered;
  }

  /**
   * Lấy danh sách các Phường / Xã / Địa phương cứu hộ khả dụng kèm cán bộ trực ban phụ trách
   */
  async getWardOptions({ search } = {}) {
    const { User, AuthorityOrganization, AdministrativeArea } = require('../models');

    // 1. Danh sách cơ sở mặc định (mỗi phường/xã đều có sẵn 1 chính quyền & 1 SĐT trực ban)
    const defaultWards = [
      { ward: 'Phường Hải Châu', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hải Châu, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hải Châu', phone: '02363810101' },
      { ward: 'Phường Thanh Khê', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Thanh Khê, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Thanh Khê', phone: '02363810102' },
      { ward: 'Phường An Khê', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường An Khê, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường An Khê', phone: '02363810103' },
      { ward: 'Phường Hòa Cường', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Cường, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hòa Cường', phone: '02363810104' },
      { ward: 'Phường Sơn Trà', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Sơn Trà, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Sơn Trà', phone: '02363810105' },
      { ward: 'Phường An Hải', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường An Hải, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường An Hải', phone: '02363810106' },
      { ward: 'Phường Ngũ Hành Sơn', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Ngũ Hành Sơn, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Ngũ Hành Sơn', phone: '02363810107' },
      { ward: 'Phường Hải Vân', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hải Vân, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hải Vân', phone: '02363810108' },
      { ward: 'Đặc khu Hoàng Sa', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Đặc khu Hoàng Sa, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Đặc khu Hoàng Sa', phone: '02363810109' },
      { ward: 'Xã Duy Nghĩa', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Xã Duy Nghĩa, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Xã Duy Nghĩa', phone: '02363810110' },
      { ward: 'Phường Liên Chiểu', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Liên Chiểu, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Liên Chiểu', phone: '02363810111' },
      { ward: 'Phường Hòa Khánh', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Khánh, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hòa Khánh', phone: '02363810112' },
      { ward: 'Phường Cẩm Lệ', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Cẩm Lệ, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Cẩm Lệ', phone: '02363810113' },
      { ward: 'Phường Hòa Xuân', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Xuân, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hòa Xuân', phone: '02363810114' },
      { ward: 'Phường Điện Bàn', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Điện Bàn, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Điện Bàn', phone: '02363810115' },
      { ward: 'Xã Hòa Vang', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Hòa Vang, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Xã Hòa Vang', phone: '02363810116' },
      { ward: 'Xã Hòa Tiến', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Hòa Tiến, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Xã Hòa Tiến', phone: '02363810117' },
      { ward: 'Xã Bà Nà', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Bà Nà, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Xã Bà Nà', phone: '02363810118' },
      { ward: 'Phường Hội An', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hội An, Thành phố Đà Nẵng', officerName: 'Ban Chỉ Huy PCTT & TKCN Phường Hội An', phone: '02363810119' },
    ];

    const results = [];
    const seenWards = new Set();

    const normalizeKey = (str = '') => {
      return String(str)
        .toLowerCase()
        .replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|tp\.?|thành phố)\s+/i, '')
        .trim();
    };

    const addWardOption = (opt) => {
      if (!opt || !opt.ward) return;
      const cleanWardName = opt.ward.trim();
      const normKey = normalizeKey(cleanWardName);
      if (!normKey || seenWards.has(normKey)) return;
      seenWards.add(normKey);

      results.push({
        ward: cleanWardName,
        category: opt.category || 'Ngoại thành',
        province: opt.province || 'Thành phố Đà Nẵng',
        fullName: opt.fullName || `${cleanWardName}, ${opt.province || 'Thành phố Đà Nẵng'}`,
        officerName: opt.officerName || null,
        phone: opt.phone || null,
      });
    };

    // 2. Quét tất cả Cán bộ LOCAL_AUTHORITY trong CSDL (bao gồm cán bộ Xã Duy Nghĩa mới tạo)
    try {
      const officers = await User.find({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
      })
        .select('fullName phone email roles authority address')
        .lean();

      for (const officer of officers) {
        const area = officer.authority?.areaName || officer.address || '';
        if (!area) continue;

        const parts = area.split(',').map((s) => s.trim()).filter(Boolean);
        let wardName = parts[0] || area;
        let provName = parts[parts.length - 1] || 'Thành phố Đà Nẵng';
        if (
          !provName.toLowerCase().includes('tỉnh') &&
          !provName.toLowerCase().includes('thành phố') &&
          !provName.toLowerCase().includes('tp')
        ) {
          provName = 'Thành phố Đà Nẵng';
        }

        if (!/^(phường|xã|thị trấn|đặc khu|quận|huyện)/i.test(wardName)) {
          wardName = `Xã ${wardName}`;
        }

        let cat = 'Ngoại thành';
        const lower = wardName.toLowerCase();
        if (/hải châu|thanh khê|an khê|hòa cường/i.test(lower)) {
          cat = 'Trung tâm';
        } else if (/sơn trà|an hải|ngũ hành sơn|hải vân|hoàng sa|ven biển|cửa đại|duy nghĩa/i.test(lower)) {
          cat = 'Ven biển';
        } else if (/liên chiểu|hòa khánh|cẩm lệ|hòa xuân|điện bàn/i.test(lower)) {
          cat = 'Đô thị mới';
        }

        addWardOption({
          ward: wardName,
          category: cat,
          province: provName,
          fullName: area.includes(',') ? area : `${wardName}, ${provName}`,
          officerName: officer.fullName,
          phone: officer.phone,
        });
      }
    } catch (err) {
      console.warn('[Get Ward Options Officers Error]:', err.message);
    }

    // 3. Quét thêm từ AuthorityOrganization (các UBND / Ban Chỉ Huy)
    try {
      const orgs = await AuthorityOrganization.find({ status: 'ACTIVE' })
        .select('name address phone')
        .lean();

      for (const org of orgs) {
        const rawName = org.name || '';
        const match = rawName.match(/(phường|xã|thị trấn)\s+([^,]+)/i);
        if (match) {
          const wardTitle = `${match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()} ${match[2].trim()}`;
          addWardOption({
            ward: wardTitle,
            category: 'Trung tâm',
            province: 'Thành phố Đà Nẵng',
            fullName: `${wardTitle}, Thành phố Đà Nẵng`,
            officerName: org.name,
            phone: org.phone,
          });
        }
      }
    } catch (err) {
      console.warn('[Get Ward Options Orgs Error]:', err.message);
    }

    // 4. Quét thêm từ AdministrativeArea nếu có
    try {
      const adminWards = await AdministrativeArea.find({
        type: { $in: ['WARD', 'DISTRICT'] },
      })
        .select('name type')
        .limit(100)
        .lean();

      for (const aw of adminWards) {
        addWardOption({
          ward: aw.name,
          category: 'Ngoại thành',
          province: 'Thành phố Đà Nẵng',
          fullName: `${aw.name}, Thành phố Đà Nẵng`,
        });
      }
    } catch (err) {
      // Ignore
    }

    // 5. Thêm các xã/phường mặc định vào danh sách nếu chưa có
    for (const dw of defaultWards) {
      addWardOption(dw);
    }

    // 6. Lọc tìm kiếm nếu người dùng gửi query search
    if (search && String(search).trim()) {
      const q = String(search).toLowerCase().trim();
      return results.filter((item) =>
        (item.ward && item.ward.toLowerCase().includes(q)) ||
        (item.fullName && item.fullName.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.officerName && item.officerName.toLowerCase().includes(q))
      );
    }

    return results;
  }

  /**
   * Đẩy thông báo ra ngoài app (Expo Push Notification) và lưu vào bảng Notification
   * khi cán bộ địa phương gửi tin nhắn cho người dân (hoặc ngược lại)
   */
  async sendChatNotification({ message, senderUser, channel, recipientObjectId }) {
    try {
      const { User, Notification } = require('../models');
      const { sendExpoPushNotification, collectExpoPushTargets } = require('../utils/expoPush');
      const eventBus = require('./eventBus');

      const senderRole = senderUser.roles?.includes('ADMIN')
        ? 'ADMIN'
        : senderUser.roles?.includes('LOCAL_AUTHORITY')
        ? 'LOCAL_AUTHORITY'
        : senderUser.roles?.includes('RESCUER')
        ? 'RESCUER'
        : (senderUser.roles?.[0] || 'CITIZEN');

      const senderName = senderUser.fullName || senderUser.phone || 'Cán bộ trực ban';
      const isFromAuthority = senderRole === 'LOCAL_AUTHORITY' || senderRole === 'ADMIN';

      // 1. Xác định danh sách người nhận thông báo
      let recipientUserIds = [];

      if (recipientObjectId && String(recipientObjectId) !== String(senderUser._id)) {
        recipientUserIds.push(recipientObjectId);
      }

      // Nếu là kênh area_ (vd: area_phuong_hai_chau_..._6ad...)
      if (channel && channel.startsWith('area_')) {
        const parts = channel.replace(/^area_/, '').split('_');
        const lastPart = parts[parts.length - 1];

        // Nếu người gửi là Cán bộ địa phương hoặc Admin => Người nhận là Người dân (citizen) ở cuối tên kênh
        if (isFromAuthority) {
          if (mongoose.Types.ObjectId.isValid(lastPart) && String(lastPart) !== String(senderUser._id)) {
            const citizenId = new mongoose.Types.ObjectId(lastPart);
            if (!recipientUserIds.some((id) => String(id) === String(citizenId))) {
              recipientUserIds.push(citizenId);
            }
          }
        } else {
          // Nếu người gửi là Người dân => Gửi thông báo đến Cán bộ địa phương phụ trách địa bàn đó (không gửi Admin)
          const staffUsers = await User.find({
            roles: { $in: ['LOCAL_AUTHORITY'] },
            status: { $ne: 'SUSPENDED' },
          }).select('_id authority roles');

          const chClean = channel.replace(/^area_/, '');
          for (const u of staffUsers) {
            if (String(u._id) === String(senderUser._id)) continue;
            const { specificSlug, broadSlug } = this.extractAuthorityScope(u.authority);
            const isMatched = specificSlug
              ? chClean.includes(specificSlug)
              : broadSlug
              ? chClean.includes(broadSlug)
              : false;

            if (isMatched && !recipientUserIds.some((id) => String(id) === String(u._id))) {
              recipientUserIds.push(u._id);
            }
          }
        }
      }

      if (recipientUserIds.length === 0) return;

      // 2. Chuẩn bị tiêu đề & nội dung thông báo
      let notifTitle = '';
      const authorityDept = senderUser.authority?.department || senderUser.authority?.areaName || 'Ban Chỉ Huy PCTT Địa Phương';
      if (isFromAuthority) {
        notifTitle = `💬 ${authorityDept} đã nhắn lại cho bạn`;
      } else {
        notifTitle = `💬 Tin nhắn từ người dân: ${senderName}`;
      }

      let notifBody = message.content && message.content.trim() ? message.content.trim() : '';
      if (!notifBody && message.attachments && message.attachments.length > 0) {
        notifBody = '[Đã gửi một hình ảnh]';
      }
      if (!notifBody) {
        notifBody = 'Đã gửi một tin nhắn mới cho bạn';
      }

      if (notifBody.length > 150) {
        notifBody = notifBody.substring(0, 147) + '...';
      }

      // 3. Lấy thông tin các người nhận (bao gồm pushToken)
      const recipientUsers = await User.find({
        _id: { $in: recipientUserIds },
        status: { $ne: 'SUSPENDED' },
      }).select('_id fullName pushToken citizen.pushToken');

      const notifDocsToInsert = [];

      const effectiveSenderName = (senderRole === 'ADMIN' || senderName.toLowerCase().includes('admin'))
        ? authorityDept
        : senderName;

      for (const recUser of recipientUsers) {
        // Tạo bản ghi Notification trong DB để người dùng xem trong app
        // Ưu tiên mức NORMAL để tránh bị hệ thống nhầm với Cảnh báo khẩn cấp (Emergency Alert)
        notifDocsToInsert.push({
          userId: recUser._id,
          createdBy: senderUser._id,
          type: 'CHAT',
          title: notifTitle,
          content: notifBody,
          priority: 'NORMAL',
          areaName: senderUser.authority?.areaName || null,
          data: {
            type: 'CHAT',
            actionUrl: 'chat',
            isChat: true,
            channel,
            messageId: String(message._id),
            senderId: String(senderUser._id),
            senderName: effectiveSenderName,
            senderRole,
            department: authorityDept,
            areaName: senderUser.authority?.areaName || '',
            content: notifBody,
          },
          isRead: false,
          createdAt: new Date(),
        });
      }

      // 4. Lưu vào Database (Notification collection)
      if (notifDocsToInsert.length > 0) {
        const createdNotifications = await Notification.insertMany(notifDocsToInsert);

        // Bắn sự kiện realtime qua EventBus & Socket.IO
        try {
          const { getIO } = require('../socket');
          const io = getIO();

          for (const notif of createdNotifications) {
            try {
              eventBus.emit('notification_event', {
                action: 'USER',
                userId: String(notif.userId),
                data: notif,
              });
              if (io) {
                io.to(`user_${notif.userId}`).emit('new_notification', notif);
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // 5. Gửi thông báo đẩy ra ngoài ứng dụng (Expo Push Notification)
      const { uniqueTokens: uniquePushTokens } = collectExpoPushTargets(recipientUsers);
      if (uniquePushTokens.length > 0) {
        await sendExpoPushNotification({
          tokens: uniquePushTokens,
          title: notifTitle,
          body: notifBody,
          priority: 'NORMAL',
          data: {
            type: 'CHAT',
            actionUrl: 'chat',
            isChat: true,
            channel,
            messageId: String(message._id),
            senderId: String(senderUser._id),
            senderName: effectiveSenderName,
            senderRole,
            department: authorityDept,
            areaName: senderUser.authority?.areaName || '',
          },
        });
      }
    } catch (notifErr) {
      console.warn('[Chat Notification Error]:', notifErr.message);
    }
  }

  /**
   * Lấy thông tin chi tiết của người dân (SĐT, Địa chỉ, Người liên hệ khẩn cấp, Ca SOS)
   */
  async getCitizenInfo(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, 'ID người dùng không hợp lệ');
    }

    const user = await User.findById(userId)
      .select('fullName phone email address roles avatarUrl citizen gender dateOfBirth status createdAt');

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin người dùng');
    }

    // Tra cứu yêu cầu SOS gần nhất của người dùng này nếu có
    const latestSos = await SosRequest.findOne({ citizenId: userId })
      .sort({ createdAt: -1 })
      .select('sosCode status emergencyType emergencyTypes priority people address location contactPhone secondaryPhone description images createdAt');

    // Thống kê tổng số ca SOS của người dân
    const totalSosCount = await SosRequest.countDocuments({ citizenId: userId });

    return {
      _id: user._id,
      fullName: user.fullName,
      phone: user.phone || 'Chưa cập nhật',
      email: user.email || '',
      address: user.address || 'Chưa cập nhật địa chỉ',
      avatarUrl: user.avatarUrl,
      roles: user.roles,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      createdAt: user.createdAt,
      totalSosCount,
      emergencyContact: user.citizen?.emergencyContact || null,
      emergencyContacts: user.citizen?.emergencyContacts || [],
      latestSos: latestSos
        ? {
            _id: latestSos._id,
            sosCode: latestSos.sosCode,
            status: latestSos.status,
            emergencyType: latestSos.emergencyType,
            emergencyTypes: latestSos.emergencyTypes,
            priority: latestSos.priority,
            people: latestSos.people,
            address: latestSos.address,
            location: latestSos.location,
            contactPhone: latestSos.contactPhone,
            secondaryPhone: latestSos.secondaryPhone,
            description: latestSos.description,
            images: latestSos.images,
            createdAt: latestSos.createdAt,
          }
        : null,
    };
  }
}

module.exports = new ChatService();

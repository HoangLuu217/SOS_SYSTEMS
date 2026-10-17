const mongoose = require('mongoose');
const { ChatMessage, User } = require('../models');
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
   * Gửi tin nhắn mới
   */
  async sendMessage(senderUser, data) {
    const { recipientId, content, attachments = [] } = data;

    if (!content || !content.trim()) {
      throw new ApiError(400, 'Nội dung tin nhắn không được để trống');
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
      for (const auth of authorities) {
        if (auth.authority?.areaName && this.toAreaSlug(auth.authority.areaName) === cleanSlug) {
          recipientObjectId = auth._id;
          break;
        }
      }
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

    const senderName = senderUser.fullName || senderUser.phone || senderUser.email || 'Người dân';

    const message = await ChatMessage.create({
      senderId: senderUser._id,
      senderName,
      senderRole,
      recipientId: recipientObjectId,
      channel,
      content: content.trim(),
      attachments,
      readBy: [senderUser._id],
    });

    const populated = await ChatMessage.findById(message._id)
      .populate('senderId', 'fullName phone email roles authority avatarUrl')
      .populate('recipientId', 'fullName phone email roles authority avatarUrl');

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

        // Nếu là kênh area_..., phát tới các cán bộ địa phương & ban chỉ huy
        if (channel.startsWith('area_')) {
          const staffUsers = await User.find({
            roles: { $in: ['LOCAL_AUTHORITY', 'ADMIN'] },
            status: { $ne: 'SUSPENDED' },
          }).select('_id');
          for (const u of staffUsers) {
            io.to(`user_${u._id}`).emit('new_message', populated);
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

    // Lấy tin nhắn theo đúng kênh riêng biệt của từng tài khoản
    const messages = await ChatMessage.find({ channel: targetChannel })
      .populate('senderId', 'fullName phone email roles authority avatarUrl')
      .populate('recipientId', 'fullName phone email roles authority avatarUrl')
      .sort({ createdAt: 1 })
      .limit(Math.min(limit, 300));

    return {
      channel: targetChannel,
      messages,
    };
  }

  /**
   * Lấy danh sách cuộc hội thoại cho Admin hoặc Cán bộ Authority
   */
  async getConversations(currentUser) {
    const isUserAdmin = (currentUser.roles || []).includes('ADMIN');
    const isAuthority = (currentUser.roles || []).includes('LOCAL_AUTHORITY');

    // 1. Kênh tác chiến chung COMMAND_GENERAL
    const generalLatest = await ChatMessage.findOne({ channel: 'COMMAND_GENERAL' })
      .sort({ createdAt: -1 })
      .populate('senderId', 'fullName roles');

    const generalUnread = await ChatMessage.countDocuments({
      channel: 'COMMAND_GENERAL',
      senderId: { $ne: currentUser._id },
      readBy: { $ne: currentUser._id },
    });

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

    // 2. Kênh Địa Bàn Quản Lý (Người dân liên hệ cứu hộ địa phương)
    const areaChannelsMap = new Map();

    if (isAuthority) {
      const managedArea = currentUser.authority?.areaName || 'Khu vực quản lý';
      const areaSlug = this.toAreaSlug(managedArea);
      const primaryChannel = `area_${areaSlug}`;
      areaChannelsMap.set(primaryChannel, managedArea);
    }

    // Tìm tất cả các kênh area_ có tin nhắn trong database mà cán bộ/admin phụ trách
    const distinctAreaChannels = await ChatMessage.distinct('channel', {
      channel: { $regex: '^area_' },
    });

    for (const ch of distinctAreaChannels) {
      if (isUserAdmin) {
        if (!areaChannelsMap.has(ch)) {
          const sample = await ChatMessage.findOne({ channel: ch }).sort({ createdAt: -1 });
          const readable = ch.replace(/^area_/, '').replace(/_/g, ' ');
          areaChannelsMap.set(ch, sample?.senderName ? `Khu vực: ${readable}` : readable);
        }
      } else if (isAuthority) {
        const managedAreaClean = (currentUser.authority?.areaName || '').toLowerCase();
        const chClean = ch.replace(/^area_/, '');
        const slugClean = this.toAreaSlug(managedAreaClean);
        // Khớp nếu cùng slug hoặc chứa các từ khóa chính (vd: thanh_khe)
        const keywords = slugClean.split('_').filter((k) => k.length > 2);
        const isMatched =
          chClean === slugClean ||
          keywords.some((kw) => chClean.includes(kw));

        if (isMatched && !areaChannelsMap.has(ch)) {
          areaChannelsMap.set(ch, currentUser.authority?.areaName);
        }
      }
    }

    for (const [ch, areaName] of areaChannelsMap.entries()) {
      // Tìm tin nhắn mới nhất trong kênh của tài khoản này
      const areaLatest = await ChatMessage.findOne({ channel: ch })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName phone email roles avatarUrl');

      const areaUnread = await ChatMessage.countDocuments({
        channel: ch,
        senderId: { $ne: currentUser._id },
        readBy: { $ne: currentUser._id },
      });

      // Xác định đối tượng người dân / cứu hộ viên trong kênh
      const cleanSlugParts = ch.replace(/^area_/, '').split('_');
      const possibleUserId = cleanSlugParts[cleanSlugParts.length - 1];
      let partnerUser = null;

      if (possibleUserId && mongoose.Types.ObjectId.isValid(possibleUserId)) {
        partnerUser = await User.findById(possibleUserId).select('fullName phone email roles avatarUrl authority');
      }

      if (!partnerUser && areaLatest && areaLatest.senderId) {
        const senderRoles = areaLatest.senderId.roles || [];
        if (!senderRoles.includes('LOCAL_AUTHORITY') && !senderRoles.includes('ADMIN')) {
          partnerUser = areaLatest.senderId;
        }
      }

      let convName = `Cứu Hộ - ${areaName}`;
      let convDesc = `Kênh tiếp nhận người dân phản ánh & cầu cứu tại ${areaName}`;
      let convRole = 'CITIZEN';

      if (partnerUser) {
        const isRescuer = (partnerUser.roles || []).includes('RESCUER');
        const roleLabel = isRescuer ? 'Cứu hộ viên' : 'Người dân';
        convName = `${partnerUser.fullName || 'Người dùng'} (${roleLabel})`;
        convDesc = `SĐT: ${partnerUser.phone || 'Chưa cập nhật'} • Địa bàn: ${areaName}`;
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
        areaName: areaName,
        unreadCount: areaUnread,
        latestMessage: areaLatest
          ? {
              content: areaLatest.content,
              senderName: areaLatest.senderName,
              createdAt: areaLatest.createdAt,
            }
          : null,
      });
    }

    // 3. Lấy danh sách đối tác chat tiềm năng (Admin / Authority)
    let userFilter = {
      _id: { $ne: currentUser._id },
      status: { $ne: 'SUSPENDED' },
    };

    if (isUserAdmin) {
      userFilter.roles = { $in: ['LOCAL_AUTHORITY', 'ADMIN'] };
    } else {
      userFilter.roles = { $in: ['ADMIN', 'LOCAL_AUTHORITY'] };
    }

    const potentialPartners = await User.find(userFilter)
      .select('fullName phone email roles authority avatarUrl status createdAt')
      .sort({ 'roles.0': 1, fullName: 1 })
      .limit(100);

    for (const partner of potentialPartners) {
      const channel = this.getDirectChannelId(currentUser._id, partner._id);

      const latestMsg = await ChatMessage.findOne({ channel })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName roles');

      const unreadCount = await ChatMessage.countDocuments({
        channel,
        senderId: partner._id,
        readBy: { $ne: currentUser._id },
      });

      const partnerRole = partner.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY';

      conversations.push({
        type: 'DIRECT',
        channel,
        partnerId: partner._id,
        name: partner.fullName || partner.phone || partner.email,
        phone: partner.phone,
        email: partner.email,
        role: partnerRole,
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

    // 4. Sắp xếp: Kênh tác chiến chung và kênh địa bàn ưu tiên trước, sau đó theo thời gian tin nhắn mới nhất
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
   * Tìm thông tin Ban chỉ huy / Cán bộ địa phương theo địa bàn (GPS hoặc địa chỉ)
   */
  async getLocalAuthorityForArea({ areaName, province, ward, lat, lng, userId, currentUser }) {
    const { User } = require('../models');

    // Chuẩn hoá tên địa bàn
    let resolvedAreaName = areaName || (ward && province ? `${ward}, ${province}` : (province || 'Địa phương'));

    // Tìm kiếm cán bộ LOCAL_AUTHORITY phù hợp nhất
    let manager = null;
    let queryConditions = [];

    if (ward) {
      const cleanWard = ward.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
      if (cleanWard) {
        queryConditions.push({ 'authority.areaName': new RegExp(cleanWard, 'i') });
      }
    }
    if (province) {
      const cleanProvince = province.replace(/^(tỉnh|thành phố|tp\.)\s+/i, '').trim();
      if (cleanProvince) {
        queryConditions.push({ 'authority.areaName': new RegExp(cleanProvince, 'i') });
      }
    }
    if (areaName) {
      const cleanArea = areaName.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
      if (cleanArea) {
        queryConditions.push({ 'authority.areaName': new RegExp(cleanArea, 'i') });
      }
    }

    if (queryConditions.length > 0) {
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
        $or: queryConditions,
      }).select('fullName phone email roles authority avatarUrl');
    }

    // Nếu chưa có cán bộ cụ thể theo tên, lấy cán bộ LOCAL_AUTHORITY bất kỳ đầu tiên làm trực ban fallback
    if (!manager) {
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
      }).select('fullName phone email roles authority avatarUrl');
    }

    // Sử dụng tên địa bàn chính thức của manager nếu tìm thấy để đảm bảo channel đồng nhất 100%
    const officialAreaName = manager?.authority?.areaName || resolvedAreaName;
    const safeSlug = this.toAreaSlug(officialAreaName);

    // Mỗi tài khoản người dùng có một kênh trao đổi riêng biệt với chính quyền địa phương
    const targetUserId = currentUser?._id || userId;
    const userSuffix = targetUserId ? `_${targetUserId}` : '';
    const channel = `area_${safeSlug || 'local'}${userSuffix}`;

    return {
      channel,
      areaName: officialAreaName,
      authority: manager
        ? {
            id: manager._id,
            name: manager.fullName || 'Cán bộ trực ban',
            phone: manager.phone || '112',
            email: manager.email,
            position: manager.authority?.position || 'Trực ban tác chiến',
            department: manager.authority?.department || manager.authority?.organizationName || `Ban Chỉ Huy PCTT & TKCN ${officialAreaName}`,
            areaName: manager.authority?.areaName || officialAreaName,
            avatarUrl: manager.avatarUrl,
            status: 'ONLINE',
          }
        : {
            id: null,
            name: `Ban Chỉ Huy PCTT ${resolvedAreaName}`,
            phone: '112 / 114 / 115',
            email: 'hotro@sos.vn',
            position: 'Trực ban 24/7',
            department: `Ban Chỉ Huy Phòng Chống Thiên Tai & Cứu Nạn ${resolvedAreaName}`,
            areaName: resolvedAreaName,
            status: 'ONLINE',
          },
    };
  }
}

module.exports = new ChatService();

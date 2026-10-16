const mongoose = require('mongoose');
const { ChatMessage, User } = require('../models');
const eventBus = require('./eventBus');
const ApiError = require('../utils/apiError');

class ChatService {
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

    if (recipientId) {
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        throw new ApiError(400, 'ID người nhận không hợp lệ');
      }
      recipientObjectId = new mongoose.Types.ObjectId(recipientId);
      channel = this.getDirectChannelId(senderUser._id, recipientObjectId);
    } else if (data.channel) {
      channel = data.channel;
    }

    const senderRole = senderUser.roles?.includes('ADMIN')
      ? 'ADMIN'
      : senderUser.roles?.includes('LOCAL_AUTHORITY')
      ? 'LOCAL_AUTHORITY'
      : (senderUser.roles?.[0] || 'LOCAL_AUTHORITY');

    const senderName = senderUser.fullName || senderUser.phone || senderUser.email || 'Cán bộ điều hành';

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

        // Gửi tới phòng riêng của người nhận (nếu chat 1-1)
        if (recipientObjectId) {
          io.to(`user_${recipientObjectId}`).emit('new_message', populated);
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

    // Lấy danh sách đối tác chat tiềm năng
    // Nếu là Admin -> Chat với toàn bộ cán bộ LOCAL_AUTHORITY và các ADMIN khác
    // Nếu là Authority -> Chat với toàn bộ ADMIN và các cán bộ LOCAL_AUTHORITY khác
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

    // Kênh tác chiến chung
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

    // Lấy thông tin tin nhắn mới nhất và unread cho từng user
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

    // Sắp xếp: Kênh chung luôn ở đầu, sau đó theo thời gian tin nhắn mới nhất
    const head = conversations[0];
    const tail = conversations.slice(1).sort((a, b) => {
      const timeA = a.latestMessage ? new Date(a.latestMessage.createdAt).getTime() : 0;
      const timeB = b.latestMessage ? new Date(b.latestMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return [head, ...tail];
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

    await ChatMessage.updateMany(
      {
        channel: targetChannel,
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
}

module.exports = new ChatService();

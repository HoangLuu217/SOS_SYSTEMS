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

        // Nếu là kênh area_..., phát tới các cán bộ địa phương phụ trách & ban chỉ huy
        if (channel.startsWith('area_')) {
          const staffUsers = await User.find({
            roles: { $in: ['LOCAL_AUTHORITY', 'ADMIN'] },
            status: { $ne: 'SUSPENDED' },
          }).select('_id authority roles');
          const chClean = channel.replace(/^area_/, '');

          for (const u of staffUsers) {
            const isAdmin = u.roles?.includes('ADMIN');
            if (isAdmin) {
              io.to(`user_${u._id}`).emit('new_message', populated);
            } else {
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
    const areaChannelsSet = new Set();

    // Tìm tất cả các kênh area_ có tin nhắn trong database
    const distinctAreaChannels = await ChatMessage.distinct('channel', {
      channel: { $regex: '^area_' },
    });

    // Lấy phạm vi quản lý của cán bộ hiện tại
    const { specificSlug, broadSlug } = this.extractAuthorityScope(currentUser.authority);

    for (const ch of distinctAreaChannels) {
      if (isUserAdmin) {
        areaChannelsSet.add(ch);
      } else if (isAuthority) {
        const chClean = ch.replace(/^area_/, '');

        let isMatched = false;
        // Nếu cán bộ phụ trách một PHƯỜNG / XÃ / QUẬN cụ thể (vd: "lien_chieu", "thanh_khe", "hai_chau"):
        // Kênh BẮT BUỘC phải thuộc đúng PHƯỜNG / XÃ / QUẬN đó!
        if (specificSlug) {
          isMatched = chClean.includes(specificSlug);
        } else if (broadSlug) {
          // Nếu cán bộ là cấp TỈNH / THÀNH PHỐ (vd: "da_nang", "quang_nam"):
          // Kênh phải thuộc Tỉnh / Thành phố đó
          isMatched = chClean.includes(broadSlug);
        }

        if (isMatched) {
          areaChannelsSet.add(ch);
        }
      }
    }

    for (const ch of areaChannelsSet) {
      // Tìm tin nhắn mới nhất trong kênh của tài khoản này
      const areaLatest = await ChatMessage.findOne({ channel: ch })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName phone email roles avatarUrl address');

      // Nếu kênh không có bất kỳ tin nhắn nào thì bỏ qua
      if (!areaLatest) continue;

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
        partnerUser = await User.findById(possibleUserId).select('fullName phone email roles avatarUrl authority address');
      }

      if (!partnerUser && areaLatest && areaLatest.senderId) {
        const senderRoles = areaLatest.senderId.roles || [];
        if (!senderRoles.includes('LOCAL_AUTHORITY') && !senderRoles.includes('ADMIN')) {
          partnerUser = areaLatest.senderId;
        }
      }

      // Xác định tên địa bàn thực tế của người dân
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
        unreadCount: areaUnread,
        latestMessage: {
          content: areaLatest.content,
          senderName: areaLatest.senderName,
          createdAt: areaLatest.createdAt,
        },
      });
    }

    // 3. Lấy danh sách đối tác chat trực tiếp (Admin hoặc đồng nghiệp có tin nhắn)
    let userFilter = {
      _id: { $ne: currentUser._id },
      status: { $ne: 'SUSPENDED' },
      roles: { $in: ['ADMIN', 'LOCAL_AUTHORITY'] },
    };

    const potentialPartners = await User.find(userFilter)
      .select('fullName phone email roles authority avatarUrl status createdAt')
      .sort({ 'roles.0': 1, fullName: 1 })
      .limit(100);

    for (const partner of potentialPartners) {
      const channel = this.getDirectChannelId(currentUser._id, partner._id);

      const latestMsg = await ChatMessage.findOne({ channel })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName roles');

      const partnerRole = partner.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY';

      // Chỉ hiển thị trong danh sách nếu:
      // 1. Đã từng có trao đổi tin nhắn (latestMsg !== null)
      // 2. HOẶC đối tác là Quản trị viên hệ thống (ADMIN) để tiện liên hệ chỉ đạo
      if (!latestMsg && partnerRole !== 'ADMIN') {
        continue;
      }

      const unreadCount = await ChatMessage.countDocuments({
        channel,
        senderId: partner._id,
        readBy: { $ne: currentUser._id },
      });

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

    // 1. Chuẩn hoá tên địa bàn của người dân / cứu hộ viên
    let resolvedAreaName = areaName || (ward && province ? `${ward}, ${province}` : (province || 'Địa phương'));
    if (ward && province && !resolvedAreaName.includes(ward)) {
      resolvedAreaName = `${ward}, ${province}`;
    }

    // Địa bàn chính thức: BẮT BUỘC LUÔN LÀ ĐỊA BÀN THỰC TẾ CỦA NGƯỜI DÂN
    // Tuyệt đối không được thay thế bằng địa bàn của cán bộ quản lý
    const officialAreaName = resolvedAreaName;
    const safeSlug = this.toAreaSlug(officialAreaName);

    // Mỗi tài khoản người dùng có một kênh trao đổi riêng biệt với chính quyền địa phương
    const targetUserId = currentUser?._id || userId;
    const userSuffix = targetUserId ? `_${targetUserId}` : '';
    const channel = `area_${safeSlug || 'local'}${userSuffix}`;

    let cleanWard = '';
    let cleanProvince = '';
    if (ward) {
      cleanWard = ward.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
    }
    if (province) {
      cleanProvince = province.replace(/^(tỉnh|thành phố|tp\.)\s+/i, '').trim();
    }

    let manager = null;
    let hasMatchedWardOfficer = false;

    // 2. Tìm kiếm Cán bộ địa phương:
    // Ưu tiên 1: Cán bộ được phân công ĐÚNG PHƯỜNG / XÃ của người dân
    if (cleanWard) {
      const wardRegex = new RegExp(cleanWard, 'i');
      manager = await User.findOne({
        roles: 'LOCAL_AUTHORITY',
        status: { $ne: 'SUSPENDED' },
        $or: [
          { 'authority.areaName': wardRegex },
          { 'authority.department': wardRegex },
          { 'authority.organizationName': wardRegex },
        ],
      }).select('fullName phone email roles authority avatarUrl');

      if (manager) {
        hasMatchedWardOfficer = true;
      }
    }

    // Ưu tiên 2: Nếu chưa có cán bộ riêng của phường, tìm Ban Chỉ Huy / Cán bộ cấp Tỉnh / Thành phố
    if (!manager && cleanProvince) {
      const provinceRegex = new RegExp(cleanProvince, 'i');

      // Tìm cán bộ cấp Tỉnh/Thành phố (không bị giới hạn vào một phường/xã khác)
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

      // Nếu vẫn chưa có, lấy cán bộ bất kỳ thuộc tỉnh/thành phố đó
      if (!manager) {
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

    // Đánh dấu có cán bộ phù hợp hay không
    const hasMatchedOfficer = !!manager;

    // Xác định tên cơ quan / đơn vị tiếp nhận phản ánh
    const cleanDisplayArea = officialAreaName.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();
    const isCommune = /phường|xã|thị trấn/i.test(officialAreaName);

    let departmentTitle = '';
    if (hasMatchedWardOfficer && manager?.authority?.department) {
      departmentTitle = manager.authority.department;
    } else if (hasMatchedWardOfficer) {
      departmentTitle = `UBND ${ward || officialAreaName}`;
    } else if (hasMatchedOfficer && manager?.authority?.department) {
      departmentTitle = manager.authority.department;
    } else if (isCommune && ward) {
      departmentTitle = `UBND ${ward}`;
    } else {
      departmentTitle = `Ban Chỉ Huy PCTT & TKCN ${cleanProvince || cleanDisplayArea}`;
    }

    return {
      channel,
      areaName: officialAreaName, // LUÔN LUÔN là địa bàn thực tế của người dân (vd: Phường Liên Chiểu, Thành phố Đà Nẵng)
      authority: hasMatchedOfficer && manager
        ? {
            id: manager._id,
            name: manager.fullName || 'Cán bộ trực ban',
            phone: manager.phone || '112',
            email: manager.email,
            position: manager.authority?.position || 'Trực ban tác chiến',
            department: departmentTitle,
            areaName: officialAreaName,
            avatarUrl: manager.avatarUrl,
            status: 'ONLINE',
          }
        : {
            id: null,
            name: `Trực ban PCTT ${cleanDisplayArea}`,
            phone: '112 / 114 / 115',
            email: 'hotro@sos.vn',
            position: 'Trực ban điều phối tác chiến',
            department: departmentTitle,
            areaName: officialAreaName,
            status: 'ONLINE',
          },
    };
  }
}

module.exports = new ChatService();

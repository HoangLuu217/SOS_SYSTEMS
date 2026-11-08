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

    // Địa bàn chính thức: BẮT BUỘC LUÔN LÀ ĐỊA BÀN THỰC TẾ CỦA NGƯỜI DÂN
    const officialAreaName = resolvedAreaName;
    const safeSlug = this.toAreaSlug(officialAreaName);

    // Mỗi tài khoản người dùng có một kênh trao đổi riêng biệt với chính quyền địa phương
    const targetUserId = currentUser?._id || userId;
    const userSuffix = targetUserId ? `_${targetUserId}` : '';
    const channel = `area_${safeSlug || 'local'}${userSuffix}`;

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

    // ƯU TIÊN 2: Nếu có tọa độ GPS [lat, lng], tìm qua ranh giới AdministrativeArea
    if (!manager && !matchedOrg && typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      try {
        const matchingArea = await AdministrativeArea.findOne({
          status: 'ACTIVE',
          $or: [
            wardKeyword ? { name: new RegExp(wardKeyword, 'i') } : null,
            cleanProvince ? { name: new RegExp(cleanProvince, 'i') } : null,
          ].filter(Boolean),
        });

        if (matchingArea) {
          manager = await User.findOne({
            roles: 'LOCAL_AUTHORITY',
            status: { $ne: 'SUSPENDED' },
            'authority.areaId': matchingArea._id,
          }).select('fullName phone email roles authority avatarUrl');

          if (!manager) {
            matchedOrg = await AuthorityOrganization.findOne({
              status: 'ACTIVE',
              $or: [
                { areaId: matchingArea._id },
                { administrativeAreaId: matchingArea._id },
              ],
            }).select('name code phone email address');
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

    // Danh bạ đường dây nóng Ban Chỉ Huy PCTT & TKCN các Tỉnh/Thành phố Việt Nam
    const PROVINCE_HOTLINES = {
      'cần thơ': { phone: '02923822266', name: 'Ban Chỉ Huy PCTT & TKCN TP. Cần Thơ' },
      'đà nẵng': { phone: '02363822111', name: 'Ban Chỉ Huy PCTT & TKCN TP. Đà Nẵng' },
      'hà nội': { phone: '02438344059', name: 'Ban Chỉ Huy PCTT & TKCN TP. Hà Nội' },
      'hồ chí minh': { phone: '02838297598', name: 'Ban Chỉ Huy PCTT & TKCN TP. Hồ Chí Minh' },
      'quảng nam': { phone: '02353852554', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Quảng Nam' },
      'thừa thiên huế': { phone: '02343822076', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Thừa Thiên Huế' },
      'quảng ngãi': { phone: '02553822841', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Quảng Ngãi' },
      'bình định': { phone: '02563822934', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Bình Định' },
      'khánh hòa': { phone: '02583822955', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Khánh Hòa' },
      'hải phòng': { phone: '02253842322', name: 'Ban Chỉ Huy PCTT & TKCN TP. Hải Phòng' },
      'bình dương': { phone: '02743822452', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Bình Dương' },
      'đồng nai': { phone: '02513822521', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Đồng Nai' },
      'an giang': { phone: '02963953457', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh An Giang' },
      'kiên giang': { phone: '02973862043', name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Kiên Giang' },
    };

    let provContact = null;
    const provLower = (cleanProvince || '').toLowerCase().trim();
    for (const [key, val] of Object.entries(PROVINCE_HOTLINES)) {
      if (provLower.includes(key) || key.includes(provLower)) {
        provContact = val;
        break;
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

    const PROVINCE_DIRECTORY = [
      {
        id: 'hotline-can-tho',
        name: 'Ban Chỉ Huy PCTT & TKCN TP. Cần Thơ',
        department: 'Ủy Ban Nhân Dân TP. Cần Thơ',
        phone: '02923822266',
        areaName: 'Thành phố Cần Thơ',
        address: 'Số 02 Hoà Bình, Quận Ninh Kiều, TP. Cần Thơ',
        type: 'PROVINCE',
        lat: 10.0341,
        lng: 105.7876,
      },
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
        id: 'hotline-ha-noi',
        name: 'Ban Chỉ Huy PCTT & TKCN TP. Hà Nội',
        department: 'Ủy Ban Nhân Dân TP. Hà Nội',
        phone: '02438344059',
        areaName: 'Thành phố Hà Nội',
        address: 'Số 12 phố Lê Lai, Quận Hoàn Kiếm, TP. Hà Nội',
        type: 'PROVINCE',
        lat: 21.0285,
        lng: 105.8542,
      },
      {
        id: 'hotline-hcm',
        name: 'Ban Chỉ Huy PCTT & TKCN TP. Hồ Chí Minh',
        department: 'Ủy Ban Nhân Dân TP. Hồ Chí Minh',
        phone: '02838297598',
        areaName: 'Thành phố Hồ Chí Minh',
        address: 'Số 86 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        type: 'PROVINCE',
        lat: 10.7769,
        lng: 106.7009,
      },
      {
        id: 'hotline-quang-nam',
        name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Quảng Nam',
        department: 'Ủy Ban Nhân Dân Tỉnh Quảng Nam',
        phone: '02353852554',
        areaName: 'Tỉnh Quảng Nam',
        address: 'Số 500 Hùng Vương, TP. Tam Kỳ, Tỉnh Quảng Nam',
        type: 'PROVINCE',
        lat: 15.5647,
        lng: 108.4839,
      },
      {
        id: 'hotline-hue',
        name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Thừa Thiên Huế',
        department: 'Ủy Ban Nhân Dân Tỉnh Thừa Thiên Huế',
        phone: '02343822076',
        areaName: 'Thừa Thiên Huế',
        address: 'Số 14 Lê Lợi, TP. Huế, Tỉnh Thừa Thiên Huế',
        type: 'PROVINCE',
        lat: 16.4637,
        lng: 107.5909,
      },
      {
        id: 'hotline-quang-ngai',
        name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Quảng Ngãi',
        department: 'Ủy Ban Nhân Dân Tỉnh Quảng Ngãi',
        phone: '02553822841',
        areaName: 'Tỉnh Quảng Ngãi',
        address: 'Số 122 Hùng Vương, TP. Quảng Ngãi',
        type: 'PROVINCE',
        lat: 15.1205,
        lng: 108.7923,
      },
      {
        id: 'hotline-binh-dinh',
        name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Bình Định',
        department: 'Ủy Ban Nhân Dân Tỉnh Bình Định',
        phone: '02563822934',
        areaName: 'Tỉnh Bình Định',
        address: 'Số 01 Trần Phú, TP. Quy Nhơn, Tỉnh Bình Định',
        type: 'PROVINCE',
        lat: 13.783,
        lng: 109.2197,
      },
      {
        id: 'hotline-khanh-hoa',
        name: 'Ban Chỉ Huy PCTT & TKCN Tỉnh Khánh Hòa',
        department: 'Ủy Ban Nhân Dân Tỉnh Khánh Hòa',
        phone: '02583822955',
        areaName: 'Tỉnh Khánh Hòa',
        address: 'Số 01 Trần Phú, Lộc Thọ, TP. Nha Trang',
        type: 'PROVINCE',
        lat: 12.2388,
        lng: 109.1967,
      },
      {
        id: 'hotline-hai-phong',
        name: 'Ban Chỉ Huy PCTT & TKCN TP. Hải Phòng',
        department: 'Ủy Ban Nhân Dân TP. Hải Phòng',
        phone: '02253842322',
        areaName: 'Thành phố Hải Phòng',
        address: 'Số 18 Hoàng Diệu, Minh Khai, Hồng Bàng, Hải Phòng',
        type: 'PROVINCE',
        lat: 20.8449,
        lng: 106.6881,
      },
    ];

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

    // 1. Đưa các tổ chức cấp phường/xã/quận/huyện/tỉnh trong DB lên trước
    for (const org of orgs) {
      const cleanPhone = (org.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone && !seenPhones.has(cleanPhone)) {
        seenPhones.add(cleanPhone);
        results.push({
          id: String(org._id),
          name: org.name,
          department: org.name,
          phone: cleanPhone,
          address: org.address || 'Địa bàn phụ trách',
          areaName: org.address || org.name,
          type: 'ORGANIZATION',
        });
      }
    }

    // 2. Thêm cán bộ phụ trách
    for (const officer of officers) {
      const cleanPhone = (officer.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone && !seenPhones.has(cleanPhone)) {
        seenPhones.add(cleanPhone);
        const dept = officer.authority?.department || 'Cán bộ trực ban PCTT';
        const area = officer.authority?.areaName || officer.address || 'Địa bàn quản lý';
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
}

module.exports = new ChatService();

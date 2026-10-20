const mongoose = require('mongoose');
const { Notification, User, AdministrativeArea, SafeLocation, HazardReport, WeatherNotification } = require('../models');
const ApiError = require('../utils/apiError');
const { sendExpoPushNotification } = require('../utils/expoPush');
const eventBus = require('./eventBus');

class NotificationService {
  /**
   * Lấy danh sách thông báo của chính người dùng đăng nhập
   * Hỗ trợ phân trang, lọc theo isRead, type ('INSTANT', 'SYSTEM', ...)
   */
  async getNotifications(userId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const filter = {};
    if (userId) {
      filter.userId = userId;
    } else {
      filter.$or = [
        { 'data.isBroadcast': true },
        { type: { $in: ['INSTANT', 'SYSTEM', 'WEATHER', 'ALERT', 'RESCUE', 'SAFE_LOCATION', 'HAZARD', 'TIN_TUC_THOI'] } },
      ];
    }

    if (query.isRead !== undefined && query.isRead !== '') {
      filter.isRead = query.isRead === 'true' || query.isRead === true;
    }

    if (query.type) {
      const typeStr = String(query.type).toUpperCase().trim();
      if (typeStr === 'INSTANT' || typeStr === 'TIN_TUC_THOI') {
        filter.type = { $in: ['INSTANT', 'TIN_TUC_THOI', 'ALERT', 'RESCUE'] };
      } else if (typeStr === 'SYSTEM' || typeStr === 'THONG_BAO_HE_THONG') {
        filter.type = { $in: ['SYSTEM', 'THONG_BAO_HE_THONG'] };
      } else {
        filter.type = typeStr;
      }
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('createdBy', 'fullName phone roles')
        .populate('areaId', 'name code type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      userId ? Notification.countDocuments({ userId, isRead: false }) : Promise.resolve(0),
    ]);

    // Loại bỏ các bản ghi trùng lặp của cùng một đợt phát sóng (Broadcast)
    const uniqueNotifications = [];
    const seenBroadcastKeys = new Set();

    for (const item of notifications) {
      const broadcastKey =
        item.data?.broadcastId ||
        (item.data?.isBroadcast
          ? `${item.title.trim()}_${item.content.trim()}_${new Date(item.createdAt).toISOString().slice(0, 16)}`
          : null);

      if (broadcastKey) {
        if (seenBroadcastKeys.has(broadcastKey)) {
          continue; // Bỏ qua bản ghi trùng lặp
        }
        seenBroadcastKeys.add(broadcastKey);
      }
      uniqueNotifications.push(item);
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications: uniqueNotifications,
      pagination: {
        total: uniqueNotifications.length,
        page,
        limit,
        totalPages,
        unreadCount,
      },
    };
  }

  /**
   * Lấy chi tiết 1 thông báo theo ID (chỉ của người đăng nhập)
   */
  async getNotificationById(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    })
      .populate('createdBy', 'fullName phone roles')
      .populate('areaId', 'name code type');

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return notification;
  }

  /**
   * Đánh dấu 1 thông báo là đã đọc
   */
  async markAsRead(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
      { returnDocument: 'after' }
    );

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return notification;
  }

  /**
   * Đánh dấu tất cả thông báo của người dùng là đã đọc
   */
  async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return {
      modifiedCount: result.modifiedCount,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    };
  }

  /**
   * Xóa một thông báo theo ID
   */
  async deleteNotification(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const deleted = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!deleted) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return {
      message: 'Xóa thông báo thành công.',
    };
  }

  /**
   * Đăng ký mã Expo Push Token của thiết bị người dùng
   */
  async registerPushToken(userId, pushToken) {
    if (!pushToken || typeof pushToken !== 'string') {
      throw new ApiError(400, 'Mã Push Token không hợp lệ.');
    }

    const cleanToken = pushToken.trim();

    await User.findByIdAndUpdate(userId, {
      $set: {
        pushToken: cleanToken,
        'citizen.pushToken': cleanToken,
      },
    });

    return {
      message: 'Đăng ký Push Token thành công.',
      pushToken: cleanToken,
    };
  }

  async updateCurrentLocation(userId, location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, 'Tọa độ GPS không hợp lệ.');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          currentLocation: { type: 'Point', coordinates: [longitude, latitude] },
          currentLocationUpdatedAt: new Date(),
        },
      },
      { new: true, projection: '_id currentLocationUpdatedAt' }
    ).lean();
    if (!user) throw new ApiError(404, 'Không tìm thấy tài khoản.');
    return { updatedAt: user.currentLocationUpdatedAt };
  }

  /**
   * Broadcast Thông báo do ADMIN hoặc LOCAL_AUTHORITY tạo
   * - Gửi tới các tài khoản trong khu vực hành chính (hoặc toàn thành phố)
   * - Phân loại: 'INSTANT' (Tin tức thời / Cảnh báo khẩn cấp) hoặc 'SYSTEM' (Thông báo hệ thống)
   * - Đẩy Push Notification ra ngoài ứng dụng điện thoại
   */
  async broadcastNotification(senderUser, data) {
    const {
      title,
      content,
      type = 'INSTANT',
      priority,
      data: extraData = {},
      imageUrl,
      articleUrl,
      sourceName,
    } = data;

    if (!title || !title.trim()) {
      throw new ApiError(400, 'Tiêu đề thông báo là bắt buộc.');
    }
    if (!content || !content.trim()) {
      throw new ApiError(400, 'Nội dung thông báo là bắt buộc.');
    }

    // Chuẩn hóa loại thông báo: INSTANT hoặc SYSTEM
    const normalizedType = String(type).toUpperCase().trim();
    const allowedTypes = ['INSTANT', 'SYSTEM', 'WEATHER', 'RESCUE', 'ALERT', 'SAFE_LOCATION', 'HAZARD'];
    if (!allowedTypes.includes(normalizedType)) {
      throw new ApiError(400, `Loại thông báo không hợp lệ. Cho phép: ${allowedTypes.join(', ')}.`);
    }

    const isAdmin = Boolean(senderUser.roles && senderUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(senderUser.roles && senderUser.roles.includes('LOCAL_AUTHORITY'));

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(403, 'Chỉ Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) mới có quyền phát thông báo.');
    }

    // Xác định khu vực mục tiêu
    let targetAreaId = data.areaId || null;
    let targetAreaDoc = null;

    if (isLocalAuthority && !isAdmin) {
      // Cán bộ địa phương: Bắt buộc gửi tới địa bàn quản lý của mình
      const authorityAreaId = senderUser.authority?.areaId;
      if (!authorityAreaId) {
        throw new ApiError(400, 'Tài khoản cán bộ địa phương chưa được phân công khu vực quản lý.');
      }

      targetAreaId = authorityAreaId;
      targetAreaDoc = await AdministrativeArea.findById(targetAreaId);
      if (!targetAreaDoc) {
        throw new ApiError(404, 'Không tìm thấy khu vực quản lý của cán bộ.');
      }
    } else {
      // Admin: Có thể chọn khu vực cụ thể hoặc ALL (toàn thành phố)
      if (targetAreaId && targetAreaId !== 'ALL') {
        if (!mongoose.Types.ObjectId.isValid(targetAreaId)) {
          throw new ApiError(400, 'Mã khu vực không hợp lệ.');
        }
        targetAreaDoc = await AdministrativeArea.findById(targetAreaId);
        if (!targetAreaDoc) {
          throw new ApiError(404, 'Khu vực hành chính mục tiêu không tồn tại.');
        }
      } else {
        // Gửi toàn thành phố (ALL)
        targetAreaDoc = await AdministrativeArea.findOne({ type: 'PROVINCE' });
      }
    }

    const targetAreaName = targetAreaDoc ? targetAreaDoc.name : 'Toàn địa bàn quản lý';
    const effectivePriority = priority || (normalizedType === 'INSTANT' ? 'CRITICAL' : 'NORMAL');
    let pointDetails = {};

    if (normalizedType === 'SAFE_LOCATION') {
      if (!mongoose.Types.ObjectId.isValid(extraData.safeLocationId)) {
        throw new ApiError(400, 'Vui lòng chọn một điểm an toàn hợp lệ.');
      }
      const point = await SafeLocation.findOne({
        _id: extraData.safeLocationId,
        status: 'ACTIVE',
      }).lean();
      if (!point) throw new ApiError(404, 'Điểm an toàn không còn hoạt động.');
      if (targetAreaId !== 'ALL' && targetAreaDoc && point.areaId.toString() !== targetAreaDoc._id.toString()) {
        throw new ApiError(403, 'Điểm an toàn nằm ngoài địa bàn được chọn.');
      }
      pointDetails = {
        safeLocation: {
          id: point._id.toString(),
          name: point.name,
          type: point.type,
          address: point.address,
          location: point.location,
          capacity: point.capacity,
          currentOccupancy: point.currentOccupancy,
        },
      };
    }

    if (normalizedType === 'HAZARD') {
      if (!mongoose.Types.ObjectId.isValid(extraData.hazardReportId)) {
        throw new ApiError(400, 'Vui lòng chọn một điểm nguy hiểm hợp lệ.');
      }
      const point = await HazardReport.findOne({
        _id: extraData.hazardReportId,
        status: 'APPROVED',
      }).lean();
      if (!point) throw new ApiError(404, 'Điểm nguy hiểm chưa được duyệt hoặc không còn tồn tại.');
      if (targetAreaId !== 'ALL' && targetAreaDoc && point.areaId?.toString() !== targetAreaDoc._id.toString()) {
        throw new ApiError(403, 'Điểm nguy hiểm nằm ngoài địa bàn được chọn.');
      }
      pointDetails = {
        hazardPoint: {
          id: point._id.toString(),
          title: point.title,
          hazardType: point.hazardType,
          severity: point.severity,
          description: point.description,
          address: point.address,
          location: point.location,
        },
      };
    }

    // Tìm kiếm các tài khoản người dùng mục tiêu trong khu vực
    let userFilter = { status: { $ne: 'SUSPENDED' } };

    const gpsScopedLocalBroadcast = isLocalAuthority && !isAdmin &&
      ['SAFE_LOCATION', 'HAZARD'].includes(normalizedType);

    if (gpsScopedLocalBroadcast) {
      if (!targetAreaDoc?.boundary?.type || !Array.isArray(targetAreaDoc.boundary.coordinates)) {
        throw new ApiError(400, 'Địa bàn chưa có ranh giới bản đồ nên không thể lọc người nhận theo GPS.');
      }
      userFilter = {
        status: { $ne: 'SUSPENDED' },
        currentLocation: {
          $geoWithin: { $geometry: targetAreaDoc.boundary },
        },
        currentLocationUpdatedAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      };
    } else if (targetAreaDoc?.type === 'PROVINCE' && targetAreaId !== 'ALL') {
      // Province is the first recipient selector; include its child districts/wards.
      const childAreas = await AdministrativeArea.find({ status: 'ACTIVE' })
        .select('_id parentId')
        .lean();
      const selectedIds = new Set([targetAreaDoc._id.toString()]);
      let foundChild = true;
      while (foundChild) {
        foundChild = false;
        childAreas.forEach((area) => {
          const parentId = area.parentId?.toString();
          if (parentId && selectedIds.has(parentId) && !selectedIds.has(area._id.toString())) {
            selectedIds.add(area._id.toString());
            foundChild = true;
          }
        });
      }
      const areaIds = [...selectedIds];
      userFilter = {
        status: { $ne: 'SUSPENDED' },
        $or: [
          { 'authority.areaId': { $in: areaIds } },
          { 'citizen.areaId': { $in: areaIds } },
          { 'rescuer.areaId': { $in: areaIds } },
          { areaId: { $in: areaIds } },
          { address: { $regex: targetAreaDoc.name, $options: 'i' } },
        ],
      };
    } else if (targetAreaDoc && targetAreaDoc.type !== 'PROVINCE' && targetAreaId !== 'ALL') {
      userFilter = {
        status: { $ne: 'SUSPENDED' },
        $or: [
          { 'authority.areaId': targetAreaDoc._id },
          { 'citizen.areaId': targetAreaDoc._id },
          { 'rescuer.areaId': targetAreaDoc._id },
          { areaId: targetAreaDoc._id },
          // Tìm theo tên địa phương trong trường address của người dân
          { address: { $regex: targetAreaDoc.name, $options: 'i' } },
          // Người dân chưa gán khu vực cũng nhận để tránh sót cảnh báo khẩn cấp
          { roles: 'CITIZEN', 'citizen.areaId': null, areaId: null },
        ],
      };
    }

    const recipientUsers = await User.find(userFilter).select('_id fullName roles pushToken citizen.pushToken').lean();

    // Với broadcast GPS, người gửi cũng phải nằm trong ranh giới và có GPS cập nhật gần đây.
    // Các loại thông báo khác vẫn được lưu cho người gửi như hành vi hiện tại.
    const senderIncluded = recipientUsers.some((u) => u._id.toString() === senderUser._id.toString());
    if (!senderIncluded && !gpsScopedLocalBroadcast) {
      recipientUsers.push({
        _id: senderUser._id,
        fullName: senderUser.fullName,
        roles: senderUser.roles,
        pushToken: senderUser.pushToken,
      });
    }

    if (recipientUsers.length === 0) {
      throw new ApiError(
        400,
        gpsScopedLocalBroadcast
          ? 'Không có tài khoản nào có GPS cập nhật trong 2 giờ gần nhất nằm trong ranh giới địa phương.'
          : 'Không tìm thấy tài khoản người dùng nào thuộc phạm vi khu vực này.'
      );
    }

    const now = new Date();
    const broadcastId = new mongoose.Types.ObjectId().toString();
    const resolvedImageUrl = imageUrl || extraData.imageUrl || null;
    const resolvedArticleUrl = articleUrl || extraData.articleUrl || null;
    const resolvedSourceName = sourceName || extraData.sourceName || null;

    const notificationDocs = recipientUsers.map((user) => ({
      userId: user._id,
      createdBy: senderUser._id,
      areaId: targetAreaDoc ? targetAreaDoc._id : null,
      areaName: targetAreaName,
      type: normalizedType,
      title: title.trim(),
      content: content.trim(),
      priority: effectivePriority,
      imageUrl: resolvedImageUrl,
      articleUrl: resolvedArticleUrl,
      sourceName: resolvedSourceName,
      data: {
        ...extraData,
        imageUrl: resolvedImageUrl,
        articleUrl: resolvedArticleUrl,
        sourceName: resolvedSourceName,
        senderName: senderUser.fullName,
        senderRole: senderUser.roles?.[0] || 'AUTHORITY',
        areaName: targetAreaName,
        isBroadcast: true,
        broadcastId,
        ...pointDetails,
        deliveryScope: gpsScopedLocalBroadcast ? 'GPS_IN_AREA' : 'ADMINISTRATIVE_AREA',
      },
      isRead: false,
      createdAt: now,
    }));

    // Ghi toàn bộ thông báo vào MongoDB
    const savedNotifications = await Notification.insertMany(notificationDocs);

    // Phát từng thông báo đã lưu tới đúng tài khoản đang kết nối SSE.
    try {
      savedNotifications.forEach((notification) =>
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: notification.userId.toString(),
          data: {
            _id: notification._id.toString(),
            title: notification.title,
            content: notification.content,
            type: notification.type,
            priority: notification.priority,
            imageUrl: notification.imageUrl || notification.data?.imageUrl || null,
            articleUrl: notification.articleUrl || notification.data?.articleUrl || null,
            sourceName: notification.sourceName || notification.data?.sourceName || null,
            areaId: notification.areaId?.toString() || null,
            areaName: notification.areaName,
            createdBy: {
              _id: senderUser._id,
              fullName: senderUser.fullName,
              roles: senderUser.roles,
            },
            data: notification.data,
            isRead: false,
            createdAt: notification.createdAt.toISOString(),
          },
        })
      );
    } catch (sseErr) {
      console.warn('⚠️ Lỗi emit SSE notification_event:', sseErr.message);
    }

    // Gửi Push Notification ra ngoài ứng dụng điện thoại (cho các thiết bị đã đăng ký Expo Push Token)
    const notificationIdByUserId = new Map(
      savedNotifications.map((notification) => [notification.userId.toString(), notification._id.toString()])
    );
    const pushDataByToken = {};
    recipientUsers.forEach((user) => {
      const notificationId = notificationIdByUserId.get(user._id.toString());
      const tokens = [user.pushToken, user.citizen?.pushToken]
        .filter((token) => typeof token === 'string' && token.trim().length > 0);
      tokens.forEach((token) => {
        pushDataByToken[token.trim()] = {
          type: normalizedType,
          areaId: targetAreaDoc ? targetAreaDoc._id.toString() : '',
          areaName: targetAreaName,
          senderName: senderUser.fullName,
          priority: effectivePriority,
          content: content.trim(),
          imageUrl: resolvedImageUrl,
          articleUrl: resolvedArticleUrl,
          sourceName: resolvedSourceName,
          ...pointDetails,
          notificationId,
          broadcastId,
        };
      });
    });

    const uniquePushTokens = Object.keys(pushDataByToken);

    let pushResult = { success: false, reason: 'No push tokens' };
    if (uniquePushTokens.length > 0) {
      const typePrefixes = {
        INSTANT: '🚨 [TIN TỨC THỜI] ',
        SYSTEM: '📢 [HỆ THỐNG] ',
        WEATHER: '🌦️ [THỜI TIẾT] ',
        SAFE_LOCATION: '📍 [ĐIỂM AN TOÀN] ',
        HAZARD: '⚠️ [ĐIỂM NGUY HIỂM] ',
      };
      const typePrefix = typePrefixes[normalizedType] || '📢 ';
      pushResult = await sendExpoPushNotification({
        tokens: uniquePushTokens,
        title: `${typePrefix}${title.trim()}`,
        body: content.trim(),
        priority: effectivePriority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        data: {
          type: normalizedType,
          areaId: targetAreaDoc ? targetAreaDoc._id.toString() : '',
          areaName: targetAreaName,
          senderName: senderUser.fullName,
          content: content.trim(),
          imageUrl: resolvedImageUrl,
          articleUrl: resolvedArticleUrl,
          sourceName: resolvedSourceName,
          broadcastId,
          ...pointDetails,
        },
        dataByToken: pushDataByToken,
      });
    }

    // Nếu là 'WEATHER' (Thông báo thời tiết), đồng bộ vào bảng WeatherNotification riêng biệt
    if (normalizedType === 'WEATHER') {
      try {
        await WeatherNotification.create({
          title: title.trim(),
          content: content.trim(),
          summary: extraData.summary || content.trim().slice(0, 200),
          category: extraData.category || extraData.weatherType || 'khac',
          relevance_score: typeof extraData.score === 'number' ? extraData.score : (effectivePriority === 'CRITICAL' ? 95 : effectivePriority === 'HIGH' ? 80 : 50),
          score: typeof extraData.score === 'number' ? extraData.score : (effectivePriority === 'CRITICAL' ? 95 : effectivePriority === 'HIGH' ? 80 : 50),
          regions: targetAreaName ? [targetAreaName] : (extraData.regions || []),
          area: targetAreaName || extraData.area || 'Toàn thành phố',
          image_url: resolvedImageUrl,
          imageUrl: resolvedImageUrl,
          source_url: resolvedArticleUrl,
          articleUrl: resolvedArticleUrl,
          source_name: resolvedSourceName,
          articleTitle: extraData.articleTitle || resolvedSourceName || null,
          areaId: targetAreaDoc ? targetAreaDoc._id : null,
          createdBy: senderUser._id,
          broadcastId,
          status: 'approved',
        });
      } catch (weatherErr) {
        console.warn('Lưu kèm bảng WeatherNotification gặp lỗi nhỏ (không ảnh hưởng notification):', weatherErr.message);
      }
    }

    return {
      message: 'Phát thông báo thành công tới các tài khoản trong khu vực.',
      broadcast: {
        title: title.trim(),
        content: content.trim(),
        type: normalizedType,
        areaName: targetAreaName,
        areaId: targetAreaDoc?._id,
        recipientCount: recipientUsers.length,
        pushDevicesCount: uniquePushTokens.length,
        pushResult,
        createdAt: now,
      },
    };
  }

  /**
   * Lấy lịch sử các bản tin / thông báo đã phát đi (phục vụ Web Dashboard cho Admin & Cán bộ)
   */
  async getBroadcastHistory(user, query = {}) {
    const isAdmin = Boolean(user.roles && user.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(user.roles && user.roles.includes('LOCAL_AUTHORITY'));

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(403, 'Bạn không có quyền xem lịch sử phát thông báo.');
    }

    const filter = {
      'data.isBroadcast': true,
    };

    if (isLocalAuthority && !isAdmin) {
      // Cán bộ địa phương chỉ xem bản tin trong địa bàn mình hoặc do mình tạo
      const authorityAreaId = user.authority?.areaId;
      filter.$or = [
        { createdBy: user._id },
        { areaId: authorityAreaId },
      ];
    }

    if (query.type) {
      const typeStr = String(query.type).toUpperCase().trim();
      if (typeStr === 'INSTANT' || typeStr === 'TIN_TUC_THOI') {
        filter.type = { $in: ['INSTANT', 'TIN_TUC_THOI', 'ALERT', 'WEATHER', 'RESCUE'] };
      } else if (typeStr === 'SYSTEM' || typeStr === 'THONG_BAO_HE_THONG') {
        filter.type = { $in: ['SYSTEM', 'THONG_BAO_HE_THONG'] };
      } else {
        filter.type = typeStr;
      }
    }

    if (query.areaId && query.areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(query.areaId)) {
      filter.areaId = query.areaId;
    }

    // Nhóm theo tiêu đề, nội dung, khu vực và thời gian tạo để tránh trùng lặp cho từng người nhận
    const broadcasts = await Notification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            title: '$title',
            content: '$content',
            type: '$type',
            areaName: '$areaName',
            createdAt: '$createdAt',
          },
          id: { $first: '$_id' },
          title: { $first: '$title' },
          content: { $first: '$content' },
          type: { $first: '$type' },
          priority: { $first: '$priority' },
          imageUrl: { $first: { $ifNull: ['$imageUrl', '$data.imageUrl'] } },
          articleUrl: { $first: { $ifNull: ['$articleUrl', '$data.articleUrl'] } },
          sourceName: { $first: { $ifNull: ['$sourceName', '$data.sourceName'] } },
          areaName: { $first: '$areaName' },
          areaId: { $first: '$areaId' },
          createdBy: { $first: '$createdBy' },
          createdAt: { $first: '$createdAt' },
          recipientsCount: { $sum: 1 },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);

    // Populate thông tin người tạo
    await User.populate(broadcasts, {
      path: 'createdBy',
      select: 'fullName phone roles authority.areaName',
    });

    return broadcasts;
  }

  /**
   * Xóa một đợt phát thông báo theo tiêu đề và thời điểm tạo
   */
  async deleteBroadcast(user, broadcastId) {
    if (!mongoose.Types.ObjectId.isValid(broadcastId)) {
      throw new ApiError(400, 'Mã bản tin không hợp lệ.');
    }

    const sample = await Notification.findById(broadcastId);
    if (!sample) {
      throw new ApiError(404, 'Không tìm thấy thông báo cần xóa.');
    }

    const isAdmin = Boolean(user.roles && user.roles.includes('ADMIN'));
    if (!isAdmin && sample.createdBy?.toString() !== user._id.toString()) {
      throw new ApiError(403, 'Bạn chỉ có thể xóa thông báo do chính mình phát.');
    }

    // Xóa tất cả các bản ghi cùng đợt phát
    const result = await Notification.deleteMany({
      title: sample.title,
      createdAt: sample.createdAt,
    });

    try {
      eventBus.emit('notification_event', {
        action: 'DELETED',
        broadcastId,
      });
    } catch (_) {}

    return {
      message: 'Đã xóa đợt phát thông báo thành công.',
      deletedCount: result.deletedCount,
    };
  }

  /**
   * Tạo thông báo đơn lẻ trực tiếp
   */
  async createNotification(data) {
    const notification = new Notification(data);
    await notification.save();
    if (notification.userId) {
      try {
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: notification.userId.toString(),
          data: notification,
        });
      } catch (_) {}
    }
    return notification;
  }
}

module.exports = new NotificationService();

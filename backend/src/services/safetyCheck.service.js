const mongoose = require('mongoose');
const SafetyCheck = require('../models/SafetyCheck');
const SafetyCheckResponse = require('../models/SafetyCheckResponse');
const AdministrativeArea = require('../models/AdministrativeArea');
const Notification = require('../models/Notification');
const User = require('../models/User');
const SosRequest = require('../models/SosRequest');
const ApiError = require('../utils/apiError');
const { sendExpoPushNotification } = require('../utils/expoPush');
const eventBus = require('./eventBus');

class SafetyCheckService {
  /**
   * Tạo một đợt thông báo kiểm tra an toàn người dân (Safety Check)
   * - ADMIN: Có thể chọn cấp Xã (WARD), Quận/Huyện (DISTRICT) hoặc Toàn thành phố (ALL)
   * - LOCAL_AUTHORITY (Cán bộ địa phương): Đại diện cho cấp Xã/Phường (scope: 'WARD')
   *   và CHỈ có thể gửi thông báo cho người dân thuộc Xã/Phường quản lý của mình.
   * - Tự động phát sinh thông báo (Notification) và gửi Push Notification đến điện thoại người dân
   */
  async createSafetyCheck(senderUser, data) {
    const {
      title,
      description,
      disasterType = 'STORM',
      areaId,
      startTime,
      endTime,
    } = data;

    if (!title || !title.trim()) {
      throw new ApiError(400, 'Tiêu đề thông báo kiểm tra an toàn là bắt buộc.');
    }
    if (!description || !description.trim()) {
      throw new ApiError(400, 'Nội dung hướng dẫn kiểm tra an toàn là bắt buộc.');
    }

    const isAdmin = Boolean(senderUser.roles && senderUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(senderUser.roles && senderUser.roles.includes('LOCAL_AUTHORITY'));

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(
        403,
        'Chỉ Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) mới có quyền tạo đợt kiểm tra an toàn.'
      );
    }

    let targetAreaId = null;
    let targetAreaDoc = null;
    let creatorRole = 'ADMIN';
    let scope = 'WARD'; // Mặc định là cấp Xã

    if (isLocalAuthority && !isAdmin) {
      creatorRole = 'LOCAL_AUTHORITY';
      const authorityAreaId = senderUser.authority?.areaId;
      if (!authorityAreaId) {
        throw new ApiError(400, 'Tài khoản cán bộ địa phương chưa được phân công xã/phường quản lý.');
      }

      // Cán bộ địa phương CHỈ được gửi cho xã/phường của mình
      if (areaId && areaId !== 'ALL' && areaId.toString() !== authorityAreaId.toString()) {
        throw new ApiError(
          403,
          'Cán bộ địa phương chỉ có thể gửi thông báo kiểm tra an toàn cho người dân thuộc xã/phường quản lý của mình.'
        );
      }

      targetAreaId = authorityAreaId;
      targetAreaDoc = await AdministrativeArea.findById(targetAreaId);
      if (!targetAreaDoc) {
        throw new ApiError(404, 'Không tìm thấy xã/phường quản lý của cán bộ địa phương.');
      }

      // Phạm vi của cán bộ địa phương luôn là cấp Phường/Xã (WARD)
      scope = 'WARD';
    } else {
      // ADMIN: Chọn từ Tỉnh/Thành phố (PROVINCE) -> Phường/Xã (WARD) trong DB hoặc Toàn hệ thống (ALL)
      creatorRole = 'ADMIN';
      if (areaId && areaId !== 'ALL') {
        if (!mongoose.Types.ObjectId.isValid(areaId)) {
          throw new ApiError(400, 'Mã khu vực không hợp lệ.');
        }
        targetAreaDoc = await AdministrativeArea.findById(areaId);
        if (!targetAreaDoc) {
          throw new ApiError(404, 'Khu vực hành chính mục tiêu không tồn tại trong cơ sở dữ liệu.');
        }
        targetAreaId = targetAreaDoc._id;
        scope = targetAreaDoc.type === 'WARD' ? 'WARD' : 'PROVINCE';
      } else {
        // Gửi toàn hệ thống (ALL)
        targetAreaDoc = null;
        targetAreaId = null;
        scope = 'ALL';
      }
    }

    const targetAreaName = targetAreaDoc ? targetAreaDoc.name : 'Toàn hệ thống';

    // Xác định danh sách người dân trong phạm vi khu vực (Tỉnh/TP -> Phường/Xã)
    let userFilter = { status: { $ne: 'SUSPENDED' } };

    if (targetAreaDoc && targetAreaId) {
      if (scope === 'WARD') {
        // Cấp Phường/Xã: lọc người dân thuộc phường/xã đó
        const geoConditions = [];
        if (targetAreaDoc.boundary?.type && Array.isArray(targetAreaDoc.boundary.coordinates) && targetAreaDoc.boundary.coordinates.length > 0) {
          geoConditions.push({
            'citizen.currentLocation': {
              $geoWithin: { $geometry: targetAreaDoc.boundary },
            },
          });
        }
        geoConditions.push(
          { 'citizen.areaId': targetAreaDoc._id },
          { 'authority.areaId': targetAreaDoc._id },
          { 'rescuer.areaId': targetAreaDoc._id },
          { areaId: targetAreaDoc._id },
          { address: { $regex: targetAreaDoc.name, $options: 'i' } }
        );

        userFilter = {
          status: { $ne: 'SUSPENDED' },
          $or: geoConditions,
        };
      } else {
        // Cấp Tỉnh/Thành phố (PROVINCE): Gom các Phường/Xã con trực thuộc trong DB
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
      }
    }

    const recipientUsers = await User.find(userFilter)
      .select('_id fullName phone roles pushToken citizen.pushToken')
      .lean();

    // Khởi tạo bản ghi đợt kiểm tra an toàn với scope chuẩn
    const safetyCheck = await SafetyCheck.create({
      title: title.trim(),
      description: description.trim(),
      disasterType,
      scope,
      areaId: targetAreaId,
      areaName: targetAreaName,
      createdBy: senderUser._id,
      creatorRole,
      organizationId: senderUser.authority?.organizationId || null,
      status: 'ACTIVE',
      startTime: startTime || new Date(),
      endTime: endTime || null,
      stats: {
        totalTargeted: recipientUsers.length,
        totalResponses: 0,
        safeCount: 0,
        needHelpCount: 0,
      },
    });

    // Tạo thông báo in-app Notification cho toàn bộ người nhận
    const now = new Date();
    const notificationDocs = recipientUsers.map((user) => ({
      userId: user._id,
      createdBy: senderUser._id,
      areaId: targetAreaId,
      areaName: targetAreaName,
      type: 'SAFETY_CHECK',
      title: `🛡️ [Xác nhận an toàn] ${title.trim()}`,
      content: description.trim(),
      priority: 'CRITICAL',
      actionUrl: 'safety_check',
      data: {
        isSafetyCheck: true,
        safetyCheckId: safetyCheck._id.toString(),
        disasterType,
        scope,
        areaName: targetAreaName,
        senderName: senderUser.fullName,
        senderRole: creatorRole,
        actionUrl: 'safety_check',
        screen: 'safety_check',
      },
      isRead: false,
      createdAt: now,
    }));

    if (notificationDocs.length > 0) {
      const savedNotifications = await Notification.insertMany(notificationDocs);

      // Phát sự kiện SSE realtime đến từng người dùng đích (không phát BROADCAST trùng lặp)
      savedNotifications.forEach((notification) => {
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: notification.userId.toString(),
          notification,
        });
      });
    }

    // Gửi Push Notification qua Expo
    const uniquePushTokens = [];
    recipientUsers.forEach((u) => {
      const tokens = [u.pushToken, u.citizen?.pushToken].filter(Boolean);
      tokens.forEach((t) => {
        const trimmed = t.trim();
        if (trimmed && !uniquePushTokens.includes(trimmed)) {
          uniquePushTokens.push(trimmed);
        }
      });
    });

    if (uniquePushTokens.length > 0) {
      sendExpoPushNotification({
        tokens: uniquePushTokens,
        title: `🛡️ [XÁC NHẬN AN TOÀN] ${title.trim()}`,
        body: description.trim(),
        priority: 'CRITICAL',
        data: {
          type: 'SAFETY_CHECK',
          safetyCheckId: safetyCheck._id.toString(),
          scope,
          areaId: targetAreaId ? targetAreaId.toString() : '',
          areaName: targetAreaName,
          actionUrl: 'safety_check',
          screen: 'safety_check',
          isSafetyCheck: true,
        },
      }).catch((err) => {
        console.error('[SafetyCheckService] Gửi Expo Push Notification thất bại:', err.message);
      });
    }

    return safetyCheck;
  }

  /**
   * Lấy danh sách các đợt kiểm tra an toàn (có phân trang & phân quyền)
   */
  async getSafetyChecks(currentUser, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const isAdmin = Boolean(currentUser.roles && currentUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(currentUser.roles && currentUser.roles.includes('LOCAL_AUTHORITY'));

    const filter = {};

    // Lọc theo trạng thái nếu có
    if (query.status && ['ACTIVE', 'CLOSED'].includes(query.status.toUpperCase())) {
      filter.status = query.status.toUpperCase();
    }

    // Lọc theo scope nếu có
    if (query.scope && ['ALL', 'PROVINCE', 'WARD'].includes(query.scope.toUpperCase())) {
      filter.scope = query.scope.toUpperCase();
    }

    // Phân quyền hiển thị theo vai trò
    if (isLocalAuthority && !isAdmin) {
      const authorityAreaId = currentUser.authority?.areaId;
      let parentProvinceId = null;
      if (authorityAreaId && mongoose.Types.ObjectId.isValid(authorityAreaId)) {
        const authArea = await AdministrativeArea.findById(authorityAreaId).select('parentId').lean();
        parentProvinceId = authArea?.parentId || null;
      }
      const orConditions = [
        { areaId: authorityAreaId, scope: 'WARD' },
        { createdBy: currentUser._id },
        { scope: 'ALL' },
      ];
      if (parentProvinceId) {
        orConditions.push({ areaId: parentProvinceId, scope: 'PROVINCE' });
      }
      filter.$or = orConditions;
    } else if (!isAdmin) {
      // CITIZEN: Chỉ xem các đợt đang ACTIVE liên quan đến phường/xã, tỉnh/thành phố của mình hoặc ALL
      filter.status = 'ACTIVE';
      const citizenAreaId = currentUser.citizen?.areaId;
      if (citizenAreaId && mongoose.Types.ObjectId.isValid(citizenAreaId)) {
        const citizenArea = await AdministrativeArea.findById(citizenAreaId).select('parentId').lean();
        const orConditions = [
          { areaId: citizenAreaId, scope: 'WARD' },
          { areaId: null },
          { scope: 'ALL' },
        ];
        if (citizenArea?.parentId) {
          orConditions.push({ areaId: citizenArea.parentId, scope: 'PROVINCE' });
        }
        filter.$or = orConditions;
      } else {
        filter.$or = [{ areaId: null }, { scope: 'ALL' }];
      }
    } else {
      // ADMIN: Có thể lọc theo areaId (Tỉnh/TP hoặc Phường/Xã) nếu truyền vào query
      if (query.areaId && query.areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(query.areaId)) {
        const filterArea = await AdministrativeArea.findById(query.areaId).select('_id type').lean();
        if (filterArea && filterArea.type === 'PROVINCE') {
          const childWards = await AdministrativeArea.find({ parentId: filterArea._id }).select('_id').lean();
          const wardIds = childWards.map((w) => w._id);
          filter.areaId = { $in: [filterArea._id, ...wardIds] };
        } else {
          filter.areaId = query.areaId;
        }
      }
    }

    const [total, safetyChecks] = await Promise.all([
      SafetyCheck.countDocuments(filter),
      SafetyCheck.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'fullName phone roles avatarUrl')
        .populate('areaId', 'name code type')
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      safetyChecks,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Lấy chi tiết 1 đợt kiểm tra an toàn kèm theo phản hồi của chính user (nếu đã phản hồi)
   */
  async getSafetyCheckById(currentUser, id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Mã đợt kiểm tra an toàn không hợp lệ.');
    }

    const safetyCheck = await SafetyCheck.findById(id)
      .populate('createdBy', 'fullName phone roles avatarUrl')
      .populate('areaId', 'name code type')
      .lean();

    if (!safetyCheck) {
      throw new ApiError(404, 'Không tìm thấy đợt kiểm tra an toàn.');
    }

    // Lấy phản hồi của người dùng hiện tại (nếu có)
    let myResponse = null;
    if (currentUser?._id) {
      myResponse = await SafetyCheckResponse.findOne({
        safetyCheckId: id,
        userId: currentUser._id,
      }).lean();
    }

    return {
      safetyCheck,
      myResponse,
    };
  }

  /**
   * Người dân phản hồi / đánh dấu trạng thái an toàn:
   * - status: 'SAFE' (An toàn) | 'NEED_HELP' (Không an toàn / Cần cứu hộ)
   * - Có thể cập nhật lại trạng thái nếu tình hình thay đổi
   * - Nếu chọn 'NEED_HELP' và createSosRequest=true, có thể tự động tạo yêu cầu cứu hộ SOS
   */
  async respondToSafetyCheck(currentUser, safetyCheckId, responseData) {
    if (!mongoose.Types.ObjectId.isValid(safetyCheckId)) {
      throw new ApiError(400, 'Mã đợt kiểm tra an toàn không hợp lệ.');
    }

    const safetyCheck = await SafetyCheck.findById(safetyCheckId);
    if (!safetyCheck) {
      throw new ApiError(404, 'Không tìm thấy đợt kiểm tra an toàn.');
    }

    if (safetyCheck.status === 'CLOSED') {
      throw new ApiError(400, 'Đợt kiểm tra an toàn này đã đóng, không thể gửi phản hồi.');
    }

    const {
      status,
      message = '',
      peopleCount = 1,
      location,
      address = '',
      createSosRequest = false,
      sosDetails = {},
    } = responseData;

    const normalizedStatus = String(status).toUpperCase().trim();
    if (!['SAFE', 'NEED_HELP'].includes(normalizedStatus)) {
      throw new ApiError(400, 'Trạng thái phản hồi không hợp lệ. Cho phép: SAFE hoặc NEED_HELP.');
    }

    // Xử lý tọa độ nếu có truyền lên
    let pointData = undefined;
    if (location && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      const [lng, lat] = location.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
        pointData = { type: 'Point', coordinates: [lng, lat] };
      }
    }

    // Kiểm tra xem người dân đã có phản hồi trước đó cho đợt này chưa
    const existingResponse = await SafetyCheckResponse.findOne({
      safetyCheckId,
      userId: currentUser._id,
    });

    let sosRequestId = null;

    // Nếu chọn NEED_HELP và yêu cầu tạo SOS khẩn cấp
    if (normalizedStatus === 'NEED_HELP' && createSosRequest) {
      const coords = pointData?.coordinates || currentUser.citizen?.currentLocation?.coordinates;
      if (coords && coords.length === 2) {
        const newSos = await SosRequest.create({
          citizenId: currentUser._id,
          location: { type: 'Point', coordinates: coords },
          address: address || currentUser.address || 'Vị trí báo an toàn',
          urgencyLevel: 'CRITICAL',
          description: message || 'Người dân báo nguy hiểm qua đợt kiểm tra an toàn: ' + safetyCheck.title,
          status: 'PENDING',
          contactPhone: currentUser.phone,
          details: {
            peopleCount: Number(peopleCount) || 1,
            medicalEmergency: sosDetails.medicalEmergency || false,
            specialNeeds: sosDetails.specialNeeds || '',
          },
        });
        sosRequestId = newSos._id;
      }
    }

    let responseRecord;
    let safeDelta = 0;
    let needHelpDelta = 0;
    let totalDelta = 0;

    if (existingResponse) {
      const prevStatus = existingResponse.status;

      // Cập nhật bản ghi hiện tại
      existingResponse.status = normalizedStatus;
      existingResponse.message = message.trim();
      existingResponse.peopleCount = Math.max(1, Number(peopleCount) || 1);
      if (pointData) existingResponse.location = pointData;
      if (address) existingResponse.address = address.trim();
      if (sosRequestId) existingResponse.sosRequestId = sosRequestId;
      existingResponse.respondedAt = new Date();

      responseRecord = await existingResponse.save();

      // Tính biến thiên số liệu thống kê
      if (prevStatus !== normalizedStatus) {
        if (normalizedStatus === 'SAFE') {
          safeDelta = 1;
          needHelpDelta = -1;
        } else {
          safeDelta = -1;
          needHelpDelta = 1;
        }
      }
    } else {
      // Tạo mới phản hồi
      responseRecord = await SafetyCheckResponse.create({
        safetyCheckId,
        userId: currentUser._id,
        userFullName: currentUser.fullName || '',
        userPhone: currentUser.phone || '',
        status: normalizedStatus,
        message: message.trim(),
        peopleCount: Math.max(1, Number(peopleCount) || 1),
        location: pointData,
        address: address.trim(),
        areaId: safetyCheck.areaId || currentUser.citizen?.areaId || null,
        areaName: safetyCheck.areaName || currentUser.citizen?.areaName || null,
        sosRequestId,
        respondedAt: new Date(),
      });

      totalDelta = 1;
      if (normalizedStatus === 'SAFE') {
        safeDelta = 1;
      } else {
        needHelpDelta = 1;
      }
    }

    // Cập nhật thống kê trong SafetyCheck
    const updatedStats = await SafetyCheck.findByIdAndUpdate(
      safetyCheckId,
      {
        $inc: {
          'stats.totalResponses': totalDelta,
          'stats.safeCount': safeDelta,
          'stats.needHelpCount': needHelpDelta,
        },
      },
      { returnDocument: 'after' }
    ).select('stats');

    // Cập nhật vị trí gần nhất của người dùng nếu có tọa độ
    if (pointData) {
      await User.findByIdAndUpdate(currentUser._id, {
        $set: {
          'citizen.currentLocation': pointData,
          'citizen.currentLocationUpdatedAt': new Date(),
        },
      });
    }

    // Phát sự kiện realtime
    eventBus.emit('safety_check_event', {
      action: 'RESPONDED',
      safetyCheckId: safetyCheckId.toString(),
      response: responseRecord,
      stats: updatedStats?.stats,
    });

    return {
      message:
        normalizedStatus === 'SAFE'
          ? 'Đã ghi nhận trạng thái AN TOÀN của bạn. Cảm ơn bạn!'
          : 'Đã ghi nhận tình trạng CẦN CỨU HỘ của bạn. Lực lượng cứu hộ đang được thông báo!',
      response: responseRecord,
      stats: updatedStats?.stats,
      sosRequestId,
    };
  }

  /**
   * Lấy danh sách phản hồi của người dân cho 1 đợt kiểm tra an toàn
   * Dành cho ADMIN và LOCAL_AUTHORITY theo dõi
   */
  async getSafetyCheckResponses(currentUser, safetyCheckId, query = {}) {
    if (!mongoose.Types.ObjectId.isValid(safetyCheckId)) {
      throw new ApiError(400, 'Mã đợt kiểm tra an toàn không hợp lệ.');
    }

    const safetyCheck = await SafetyCheck.findById(safetyCheckId);
    if (!safetyCheck) {
      throw new ApiError(404, 'Không tìm thấy đợt kiểm tra an toàn.');
    }

    const isAdmin = Boolean(currentUser.roles && currentUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(currentUser.roles && currentUser.roles.includes('LOCAL_AUTHORITY'));

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(403, 'Bạn không có quyền xem danh sách phản hồi.');
    }

    // Kiểm tra phạm vi nếu là cán bộ địa phương
    if (isLocalAuthority && !isAdmin) {
      const authAreaId = currentUser.authority?.areaId?.toString();
      const checkAreaId = safetyCheck.areaId?.toString();
      const isCreator = safetyCheck.createdBy?.toString() === currentUser._id.toString();

      if (!isCreator && checkAreaId && authAreaId && checkAreaId !== authAreaId) {
        throw new ApiError(403, 'Bạn chỉ có quyền xem phản hồi của các đợt kiểm tra an toàn trong xã/phường quản lý của mình.');
      }
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { safetyCheckId };

    if (query.status && ['SAFE', 'NEED_HELP'].includes(query.status.toUpperCase())) {
      filter.status = query.status.toUpperCase();
    }

    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ userFullName: searchRegex }, { userPhone: searchRegex }, { address: searchRegex }];
    }

    const [total, responses] = await Promise.all([
      SafetyCheckResponse.countDocuments(filter),
      SafetyCheckResponse.find(filter)
        .sort({ respondedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName phone avatarUrl email')
        .populate('sosRequestId', 'sosCode status urgencyLevel')
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      safetyCheck: {
        _id: safetyCheck._id,
        title: safetyCheck.title,
        status: safetyCheck.status,
        scope: safetyCheck.scope,
        stats: safetyCheck.stats,
      },
      responses,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Đóng một đợt kiểm tra an toàn (khi tình hình đã ổn định)
   */
  async closeSafetyCheck(currentUser, safetyCheckId) {
    if (!mongoose.Types.ObjectId.isValid(safetyCheckId)) {
      throw new ApiError(400, 'Mã đợt kiểm tra an toàn không hợp lệ.');
    }

    const safetyCheck = await SafetyCheck.findById(safetyCheckId);
    if (!safetyCheck) {
      throw new ApiError(404, 'Không tìm thấy đợt kiểm tra an toàn.');
    }

    const isAdmin = Boolean(currentUser.roles && currentUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(currentUser.roles && currentUser.roles.includes('LOCAL_AUTHORITY'));

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(403, 'Bạn không có quyền đóng đợt kiểm tra an toàn này.');
    }

    if (isLocalAuthority && !isAdmin) {
      const isCreator = safetyCheck.createdBy?.toString() === currentUser._id.toString();
      const isMyArea = safetyCheck.areaId?.toString() === currentUser.authority?.areaId?.toString();
      if (!isCreator && !isMyArea) {
        throw new ApiError(403, 'Bạn chỉ có quyền đóng đợt kiểm tra an toàn do mình tạo hoặc thuộc xã/phường của mình.');
      }
    }

    safetyCheck.status = 'CLOSED';
    safetyCheck.endTime = new Date();
    await safetyCheck.save();

    eventBus.emit('safety_check_event', {
      action: 'CLOSED',
      safetyCheckId: safetyCheck._id.toString(),
    });

    return safetyCheck;
  }

  /**
   * Lấy đợt kiểm tra an toàn đang ACTIVE mới nhất dành cho người dân trong app
   * Hỗ trợ màn hình Home hiển thị thanh thông báo Báo An Toàn khẩn cấp
   */
    /**
   * Lấy đợt kiểm tra an toàn đang ACTIVE dành cho người dân trong app
   * Tự động nhận diện xã/phường dựa vào tài khoản hoặc tọa độ GPS thời gian thực.
   * Ưu tiên đợt chưa phản hồi, đợt cấp Xã (WARD) và trả về đầy đủ danh sách đợt đang mở.
   */
  async getActiveSafetyCheckForCitizen(currentUser, query = {}) {
    const userAreaId =
      currentUser?.citizen?.areaId ||
      currentUser?.areaId ||
      currentUser?.authority?.areaId ||
      currentUser?.rescuer?.areaId;

    const areaConditions = [{ areaId: null }, { scope: 'ALL' }];

    if (userAreaId && mongoose.Types.ObjectId.isValid(userAreaId)) {
      const citizenArea = await AdministrativeArea.findById(userAreaId)
        .select('_id parentId type name boundary')
        .lean();

      if (citizenArea) {
        if (citizenArea.type === 'WARD') {
          areaConditions.push({ areaId: citizenArea._id, scope: 'WARD' });
          if (citizenArea.parentId) {
            areaConditions.push({ areaId: citizenArea.parentId, scope: 'PROVINCE' });
          }
        } else if (citizenArea.type === 'PROVINCE') {
          areaConditions.push({ areaId: citizenArea._id, scope: 'PROVINCE' });
        } else {
          areaConditions.push({ areaId: citizenArea._id });
        }
        if (citizenArea.name) {
          areaConditions.push({ areaName: { $regex: citizenArea.name, $options: 'i' } });
        }
      }
    }

    // Tọa độ GPS hiện tại từ query hoặc từ thông tin người dân
    const lat =
      parseFloat(query.latitude) ||
      parseFloat(query.lat) ||
      currentUser?.citizen?.currentLocation?.coordinates?.[1];
    const lng =
      parseFloat(query.longitude) ||
      parseFloat(query.lng) ||
      currentUser?.citizen?.currentLocation?.coordinates?.[0];

    if (
      typeof lng === 'number' &&
      typeof lat === 'number' &&
      !isNaN(lng) &&
      !isNaN(lat) &&
      lat !== 0 &&
      lng !== 0
    ) {
      try {
        const gpsWard = await AdministrativeArea.findOne({
          type: 'WARD',
          'boundary.coordinates.0': { $exists: true },
          boundary: {
            $geoIntersects: {
              $geometry: { type: 'Point', coordinates: [lng, lat] },
            },
          },
        })
          .select('_id parentId name')
          .lean();

        if (gpsWard) {
          areaConditions.push({ areaId: gpsWard._id, scope: 'WARD' });
          if (gpsWard.parentId) {
            areaConditions.push({ areaId: gpsWard.parentId, scope: 'PROVINCE' });
          }
        }
      } catch (_) {}
    }

    // Lấy tất cả các đợt kiểm tra an toàn đang mở phù hợp với người dùng
    const activeChecks = await SafetyCheck.find({
      status: 'ACTIVE',
      $or: areaConditions,
    })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'fullName phone roles avatarUrl')
      .populate('areaId', 'name code type')
      .lean();

    if (!activeChecks || activeChecks.length === 0) {
      return { activeCheck: null, myResponse: null, activeChecks: [], myResponses: [] };
    }

    // Lấy phản hồi của user đối với các đợt kiểm tra này (nếu đã phản hồi)
    let myResponses = [];
    const responseMap = {};

    if (currentUser?._id) {
      myResponses = await SafetyCheckResponse.find({
        safetyCheckId: { $in: activeChecks.map((c) => c._id) },
        userId: currentUser._id,
      }).lean();

      myResponses.forEach((r) => {
        responseMap[r.safetyCheckId.toString()] = r;
      });
    }

    // Xác định đợt kiểm tra ưu tiên nhất (primary active check):
    // 1. Ưu tiên đợt chưa phản hồi
    // 2. Ưu tiên cấp Phường/Xã (WARD) > Tỉnh/TP (PROVINCE) > Toàn hệ thống (ALL)
    // 3. Ưu tiên ngày tạo mới nhất
    const sortedChecks = [...activeChecks].sort((a, b) => {
      const respA = Boolean(responseMap[a._id.toString()]);
      const respB = Boolean(responseMap[b._id.toString()]);

      // Chưa phản hồi lên đầu
      if (!respA && respB) return -1;
      if (respA && !respB) return 1;

      // Ưu tiên scope
      const scopeScore = (s) => (s === 'WARD' ? 3 : s === 'PROVINCE' ? 2 : 1);
      const scoreDiff = scopeScore(b.scope) - scopeScore(a.scope);
      if (scoreDiff !== 0) return scoreDiff;

      // Newest
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const primaryCheck = sortedChecks[0] || null;
    const myPrimaryResponse = primaryCheck ? responseMap[primaryCheck._id.toString()] || null : null;

    return {
      activeCheck: primaryCheck,
      myResponse: myPrimaryResponse,
      activeChecks,
      myResponses,
    };
  }
}

module.exports = new SafetyCheckService();

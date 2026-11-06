const mongoose = require('mongoose');
const BloodDonationEvent = require('../models/BloodDonationEvent');
const BloodDonationRegistration = require('../models/BloodDonationRegistration');
const AdministrativeArea = require('../models/AdministrativeArea');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { sendExpoPushNotification } = require('../utils/expoPush');
const { findAreaByCoordinates } = require('../utils/geoUtils');
const eventBus = require('./eventBus');

class BloodDonationService {
  /**
   * Helper: Tìm Tỉnh / Thành phố (PROVINCE) tương ứng từ areaId hoặc từ chuỗi địa chỉ/khu vực
   */
  async resolveProvinceFromArea(areaId, fallbackText = '') {
    if (areaId && mongoose.Types.ObjectId.isValid(areaId)) {
      let current = await AdministrativeArea.findById(areaId)
        .select('_id name code type parentId')
        .lean();
      let hops = 0;
      while (current && hops < 5) {
        if (current.type === 'PROVINCE') {
          return { provinceId: current._id, provinceName: current.name };
        }
        if (!current.parentId) break;
        current = await AdministrativeArea.findById(current.parentId)
          .select('_id name code type parentId')
          .lean();
        hops += 1;
      }
    }

    if (fallbackText && typeof fallbackText === 'string' && fallbackText.trim()) {
      const lower = fallbackText.toLowerCase();
      const provinces = await AdministrativeArea.find({ type: 'PROVINCE', status: 'ACTIVE' })
        .select('_id name code')
        .lean();
      for (const p of provinces) {
        const cleanName = p.name
          .replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '')
          .trim()
          .toLowerCase();
        if (cleanName && (lower.includes(p.name.toLowerCase()) || lower.includes(cleanName))) {
          return { provinceId: p._id, provinceName: p.name };
        }
      }
    }

    return { provinceId: null, provinceName: '' };
  }

  /**
   * 1. Người dân đăng ký nhận thông báo đợt hiến máu theo Tỉnh/Thành phố
   */
  async registerPending(user, data = {}) {
    if (!user || !user._id) {
      throw new ApiError(401, 'Vui lòng đăng nhập để đăng ký hiến máu.');
    }

    const userDoc = await User.findById(user._id).lean();
    if (!userDoc) {
      throw new ApiError(404, 'Không tìm thấy thông tin người dùng.');
    }

    const fullName = (data.fullName || userDoc.fullName || 'Người dân').trim();
    const phone = (data.phone || userDoc.phone || '').trim();
    if (!phone) {
      throw new ApiError(400, 'Vui lòng nhập số điện thoại liên hệ.');
    }

    const bloodType = data.bloodType || userDoc.citizen?.bloodType || 'UNKNOWN';
    const weightKg = data.weightKg ? Number(data.weightKg) : null;
    const lastDonationDate = (data.lastDonationDate || '').trim();
    const healthNote = (data.healthNote || 'Sức khỏe bình thường, đủ điều kiện hiến máu').trim();
    const note = (data.note || '').trim();
    const address = (data.address || userDoc.address || '').trim();

    let coordinates = [108.2022, 16.0544];
    if (
      data.location &&
      Array.isArray(data.location.coordinates) &&
      data.location.coordinates.length === 2
    ) {
      coordinates = [Number(data.location.coordinates[0]), Number(data.location.coordinates[1])];
    } else if (data.longitude !== undefined && data.latitude !== undefined) {
      coordinates = [Number(data.longitude), Number(data.latitude)];
    } else if (
      userDoc.citizen?.currentLocation?.coordinates &&
      userDoc.citizen.currentLocation.coordinates.length === 2
    ) {
      coordinates = userDoc.citizen.currentLocation.coordinates;
    }

    // Xác định khu vực hành chính & Tỉnh/Thành phố đăng ký nhận thông báo
    let areaId = data.areaId || data.provinceId || userDoc.citizen?.areaId || userDoc.areaId || null;
    let areaName = data.areaName || '';

    if (areaId && mongoose.Types.ObjectId.isValid(areaId)) {
      const areaDoc = await AdministrativeArea.findById(areaId).select('_id name type parentId').lean();
      if (areaDoc) {
        areaId = areaDoc._id;
        areaName = areaDoc.name;
      }
    } else {
      const matchedArea = await findAreaByCoordinates(coordinates, AdministrativeArea);
      if (matchedArea) {
        areaId = matchedArea._id;
        areaName = matchedArea.name;
      }
    }

    const resolvedProvince = await this.resolveProvinceFromArea(
      data.provinceId || areaId,
      `${data.provinceName || ''} ${areaName} ${address}`
    );
    const provinceId = resolvedProvince.provinceId;
    const provinceName = resolvedProvince.provinceName || data.provinceName || '';

    if (!areaId && provinceId) {
      areaId = provinceId;
      areaName = provinceName;
    }

    // Tìm hồ sơ đăng ký trước (PRE_REGISTRATION) hiện có của user
    let registration = await BloodDonationRegistration.findOne({
      userId: user._id,
      registrationType: 'PRE_REGISTRATION',
    });

    if (registration) {
      registration.fullName = fullName;
      registration.phone = phone;
      registration.bloodType = bloodType;
      registration.weightKg = weightKg;
      registration.lastDonationDate = lastDonationDate;
      registration.healthNote = healthNote;
      registration.note = note;
      registration.address = address || registration.address;
      registration.location = { type: 'Point', coordinates };
      if (areaId) registration.areaId = areaId;
      if (areaName) registration.areaName = areaName;
      if (provinceId) registration.provinceId = provinceId;
      if (provinceName) registration.provinceName = provinceName;
      registration.status = 'PENDING';
      registration.respondedAt = new Date();
      await registration.save();
    } else {
      registration = await BloodDonationRegistration.create({
        userId: user._id,
        eventId: null,
        registrationType: 'PRE_REGISTRATION',
        fullName,
        phone,
        bloodType,
        weightKg,
        lastDonationDate,
        healthNote,
        note,
        areaId,
        areaName,
        provinceId,
        provinceName,
        address,
        location: { type: 'Point', coordinates },
        status: 'PENDING',
        respondedAt: new Date(),
      });
    }

    // Đồng bộ nhóm máu vào hồ sơ User nếu có
    if (bloodType && bloodType !== 'UNKNOWN') {
      await User.findByIdAndUpdate(user._id, {
        $set: { 'citizen.bloodType': bloodType },
      }).catch(() => {});
    }

    return registration;
  }

  /**
   * 2. Hủy đăng ký hiến máu chờ trước
   */
  async cancelPreRegistration(user) {
    const registration = await BloodDonationRegistration.findOne({
      userId: user._id,
      registrationType: 'PRE_REGISTRATION',
    });

    if (!registration) {
      throw new ApiError(404, 'Bạn chưa có hồ sơ đăng ký hiến máu chờ trước.');
    }

    registration.status = 'CANCELLED';
    await registration.save();
    return registration;
  }

  /**
   * 3. Lấy trạng thái đăng ký hiến máu & danh sách sự kiện hiến máu đang mở cho App
   */
  async getMyStatus(user, query = {}) {
    const provinces = await AdministrativeArea.find({
      type: 'PROVINCE',
      status: 'ACTIVE',
    })
      .select('_id name code type')
      .sort({ name: 1 })
      .lean();

    const myPreRegistration = await BloodDonationRegistration.findOne({
      userId: user._id,
      registrationType: 'PRE_REGISTRATION',
      status: { $ne: 'CANCELLED' },
    }).lean();

    let userProvinceId = myPreRegistration?.provinceId
      ? myPreRegistration.provinceId.toString()
      : null;

    if (myPreRegistration && !userProvinceId) {
      const resolved = await this.resolveProvinceFromArea(
        myPreRegistration.areaId,
        `${myPreRegistration.areaName || ''} ${myPreRegistration.address || ''}`
      );
      if (resolved.provinceId) {
        userProvinceId = resolved.provinceId.toString();
        myPreRegistration.provinceId = resolved.provinceId;
        myPreRegistration.provinceName = resolved.provinceName;
        await BloodDonationRegistration.updateOne(
          { _id: myPreRegistration._id },
          { $set: { provinceId: resolved.provinceId, provinceName: resolved.provinceName } }
        ).catch(() => {});
      }
    }

    const allActiveEvents = await BloodDonationEvent.find({
      status: 'ACTIVE',
    })
      .populate('createdBy', 'fullName roles')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Lọc các đợt hiến máu theo đúng Tỉnh/Thành phố mà người dùng đã đăng ký (hoặc đợt Toàn hệ thống)
    const activeEvents = [];
    for (const ev of allActiveEvents) {
      if (!userProvinceId || ev.scope === 'ALL' || !ev.areaId) {
        activeEvents.push(ev);
        continue;
      }
      let evProvId = ev.provinceId ? ev.provinceId.toString() : null;
      if (!evProvId && ev.areaId) {
        const resolvedEv = await this.resolveProvinceFromArea(
          ev.areaId,
          `${ev.areaName || ''} ${ev.address || ''}`
        );
        if (resolvedEv.provinceId) {
          evProvId = resolvedEv.provinceId.toString();
          ev.provinceId = resolvedEv.provinceId;
          ev.provinceName = resolvedEv.provinceName;
        }
      }
      if (!evProvId || evProvId === userProvinceId) {
        activeEvents.push(ev);
      }
    }

    const eventIds = activeEvents.map((e) => e._id);
    const myEventRegistrations = await BloodDonationRegistration.find({
      userId: user._id,
      registrationType: 'EVENT_REGISTRATION',
      eventId: { $in: eventIds },
      status: { $ne: 'CANCELLED' },
    }).lean();

    const responseMap = new Map();
    myEventRegistrations.forEach((reg) => {
      if (reg.eventId) {
        responseMap.set(reg.eventId.toString(), reg);
      }
    });

    const enrichedEvents = activeEvents.map((ev) => ({
      ...ev,
      myResponse: responseMap.get(ev._id.toString()) || null,
    }));

    const unrespondedCount = enrichedEvents.filter((ev) => !ev.myResponse).length;

    return {
      myPreRegistration: myPreRegistration || null,
      activeEvents: enrichedEvents,
      unrespondedCount,
      provinces,
    };
  }

  /**
   * 4. Người dân xác nhận tham gia (CONFIRMED) hoặc từ chối (DECLINED) tại một sự kiện hiến máu cụ thể
   */
  async respondToEvent(user, eventId, data = {}) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new ApiError(400, 'Mã sự kiện hiến máu không hợp lệ.');
    }

    const event = await BloodDonationEvent.findById(eventId);
    if (!event) {
      throw new ApiError(404, 'Không tìm thấy sự kiện hiến máu này.');
    }
    if (event.status !== 'ACTIVE') {
      throw new ApiError(400, 'Sự kiện hiến máu này đã kết thúc hoặc tạm ngừng tiếp nhận.');
    }

    const status = ['CONFIRMED', 'DECLINED', 'CANCELLED'].includes(data.status)
      ? data.status
      : 'CONFIRMED';
    const userDoc = await User.findById(user._id).lean();
    const preReg = await BloodDonationRegistration.findOne({
      userId: user._id,
      registrationType: 'PRE_REGISTRATION',
    }).lean();

    const fullName = (data.fullName || preReg?.fullName || userDoc?.fullName || 'Người dân').trim();
    const phone = (data.phone || preReg?.phone || userDoc?.phone || '').trim();
    if (!phone) {
      throw new ApiError(400, 'Vui lòng cung cấp số điện thoại liên hệ.');
    }

    const bloodType = data.bloodType || preReg?.bloodType || userDoc?.citizen?.bloodType || 'UNKNOWN';
    const weightKg = data.weightKg ? Number(data.weightKg) : preReg?.weightKg || null;
    const preferredTimeSlot = (data.preferredTimeSlot || `${event.startTime} - ${event.endTime}`).trim();
    const healthNote = (data.healthNote || preReg?.healthNote || 'Đủ điều kiện sức khỏe').trim();
    const note = (data.note || '').trim();
    const address = (data.address || preReg?.address || userDoc?.address || event.areaName || '').trim();

    let eventReg = await BloodDonationRegistration.findOne({
      userId: user._id,
      eventId: event._id,
      registrationType: 'EVENT_REGISTRATION',
    });

    if (eventReg) {
      eventReg.status = status;
      eventReg.fullName = fullName;
      eventReg.phone = phone;
      eventReg.bloodType = bloodType;
      if (weightKg) eventReg.weightKg = weightKg;
      eventReg.preferredTimeSlot = preferredTimeSlot;
      eventReg.healthNote = healthNote;
      eventReg.note = note;
      eventReg.address = address;
      eventReg.areaId = event.areaId || preReg?.areaId || null;
      eventReg.areaName = event.areaName || preReg?.areaName || '';
      eventReg.respondedAt = new Date();
      await eventReg.save();
    } else {
      eventReg = await BloodDonationRegistration.create({
        userId: user._id,
        eventId: event._id,
        registrationType: 'EVENT_REGISTRATION',
        fullName,
        phone,
        bloodType,
        weightKg,
        preferredTimeSlot,
        healthNote,
        note,
        areaId: event.areaId || preReg?.areaId || null,
        areaName: event.areaName || preReg?.areaName || '',
        address,
        location: event.location || { type: 'Point', coordinates: [108.2022, 16.0544] },
        status,
        respondedAt: new Date(),
      });
    }

    // Nếu người dân chưa có hồ sơ đăng ký trước mà bấm Xác nhận tham gia sự kiện, tạo luôn hồ sơ chờ hoặc đồng bộ
    if (status === 'CONFIRMED' && !preReg) {
      await BloodDonationRegistration.create({
        userId: user._id,
        eventId: null,
        registrationType: 'PRE_REGISTRATION',
        fullName,
        phone,
        bloodType,
        weightKg,
        healthNote,
        note,
        areaId: event.areaId || null,
        areaName: event.areaName || '',
        address,
        status: 'PENDING',
        respondedAt: new Date(),
      }).catch(() => {});
    }

    // Cập nhật lại thống kê sự kiện
    await this.recalculateEventStats(event._id);
    const updatedEvent = await BloodDonationEvent.findById(event._id).lean();

    return {
      registration: eventReg,
      event: updatedEvent,
    };
  }

  /**
   * Tính lại số liệu thống kê cho sự kiện hiến máu
   */
  async recalculateEventStats(eventId) {
    const counts = await BloodDonationRegistration.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          registrationType: 'EVENT_REGISTRATION',
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    let confirmedCount = 0;
    let declinedCount = 0;
    let completedCount = 0;

    counts.forEach((item) => {
      if (item._id === 'CONFIRMED') confirmedCount += item.count;
      if (item._id === 'DECLINED') declinedCount += item.count;
      if (item._id === 'COMPLETED') {
        completedCount += item.count;
        confirmedCount += item.count;
      }
    });

    await BloodDonationEvent.findByIdAndUpdate(eventId, {
      $set: {
        'stats.confirmedCount': confirmedCount,
        'stats.declinedCount': declinedCount,
        'stats.completedCount': completedCount,
      },
    });
  }

  /**
   * 5. Địa phương (LOCAL_AUTHORITY) hoặc ADMIN tạo sự kiện hiến máu
   * Tự động gửi thông báo đến các user đã đăng ký hiến máu trước đó (PENDING)
   */
  async createEvent(senderUser, data = {}) {
    const {
      title,
      description = '',
      locationName,
      address,
      eventDate,
      startTime = '07:30',
      endTime = '11:30',
      neededBloodTypes = ['ALL'],
      targetDonors = 100,
      organizerName = 'Ban Chỉ Huy Cứu Nạn & Hội Chữ Thập Đỏ',
      contactPhone = '',
      requirements = 'Mang theo CCCD/Giấy tờ tùy thân, ăn sáng nhẹ, không thức khuya hoặc dùng đồ uống có cồn trước khi hiến máu.',
      urgencyLevel = 'HIGH',
      areaId,
      coordinates,
    } = data;

    if (!title || !title.trim()) {
      throw new ApiError(400, 'Vui lòng nhập tên sự kiện hiến máu.');
    }
    if (!locationName || !locationName.trim()) {
      throw new ApiError(400, 'Vui lòng nhập tên địa điểm tổ chức hiến máu.');
    }
    if (!address || !address.trim()) {
      throw new ApiError(400, 'Vui lòng nhập địa chỉ chi tiết của điểm hiến máu.');
    }
    if (!eventDate) {
      throw new ApiError(400, 'Vui lòng chọn ngày tổ chức hiến máu.');
    }

    const isAdmin = Boolean(senderUser.roles && senderUser.roles.includes('ADMIN'));
    const isLocalAuthority = Boolean(
      senderUser.roles &&
        (senderUser.roles.includes('LOCAL_AUTHORITY') || senderUser.roles.includes('AUTHORITY'))
    );

    if (!isAdmin && !isLocalAuthority) {
      throw new ApiError(
        403,
        'Chỉ Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) mới có quyền tạo sự kiện hiến máu.'
      );
    }

    let targetAreaId = null;
    let targetAreaDoc = null;
    let scope = 'ALL';
    const creatorRole = isAdmin ? 'ADMIN' : 'LOCAL_AUTHORITY';

    if (areaId && areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(areaId)) {
      targetAreaDoc = await AdministrativeArea.findById(areaId);
      if (targetAreaDoc) {
        targetAreaId = targetAreaDoc._id;
        scope = targetAreaDoc.type === 'WARD' ? 'WARD' : 'PROVINCE';
      }
    } else if (!isAdmin && senderUser.authority?.areaId) {
      targetAreaDoc = await AdministrativeArea.findById(senderUser.authority.areaId);
      if (targetAreaDoc) {
        targetAreaId = targetAreaDoc._id;
        scope = targetAreaDoc.type === 'WARD' ? 'WARD' : 'PROVINCE';
      }
    }

    const targetAreaName = targetAreaDoc ? targetAreaDoc.name : 'Toàn hệ thống';
    const eventProvince = await this.resolveProvinceFromArea(
      targetAreaId,
      `${targetAreaName} ${address}`
    );
    const eventProvinceId = eventProvince.provinceId;
    const eventProvinceName = eventProvince.provinceName || '';

    // Tìm danh sách các user đã ĐK nhận thông báo đợt hiến máu (PRE_REGISTRATION)
    const preRegFilter = {
      registrationType: 'PRE_REGISTRATION',
      status: { $in: ['PENDING', 'CONFIRMED', 'COMPLETED'] },
    };

    const allPreRegistrations = await BloodDonationRegistration.find(preRegFilter)
      .select('userId bloodType areaId areaName provinceId provinceName address fullName phone')
      .lean();

    // Chỉ gửi thông báo cho đúng những người đã đăng ký trong cùng Tỉnh/Thành phố với đợt hiến máu
    const matchedPreRegistrations = [];
    for (const reg of allPreRegistrations) {
      if (!eventProvinceId || scope === 'ALL') {
        matchedPreRegistrations.push(reg);
        continue;
      }

      let regProvId = reg.provinceId ? reg.provinceId.toString() : null;
      if (!regProvId) {
        const resolvedReg = await this.resolveProvinceFromArea(
          reg.areaId,
          `${reg.provinceName || ''} ${reg.areaName || ''} ${reg.address || ''}`
        );
        if (resolvedReg.provinceId) {
          regProvId = resolvedReg.provinceId.toString();
        }
      }

      if (regProvId && regProvId === eventProvinceId.toString()) {
        matchedPreRegistrations.push(reg);
      }
    }

    const registeredUserIds = [
      ...new Set(matchedPreRegistrations.map((r) => r.userId?.toString()).filter(Boolean)),
    ];

    const recipientUsers = registeredUserIds.length > 0
      ? await User.find({
          _id: { $in: registeredUserIds },
          status: { $ne: 'SUSPENDED' },
        })
          .select('_id fullName phone pushToken citizen.pushToken')
          .lean()
      : [];

    const parsedDate = new Date(eventDate);
    const formattedDate = parsedDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const normalizedBloodTypes =
      Array.isArray(neededBloodTypes) && neededBloodTypes.length > 0
        ? neededBloodTypes
        : ['ALL'];

    const eventDoc = await BloodDonationEvent.create({
      title: title.trim(),
      description: description.trim(),
      locationName: locationName.trim(),
      address: address.trim(),
      location: {
        type: 'Point',
        coordinates:
          Array.isArray(coordinates) && coordinates.length === 2
            ? [Number(coordinates[0]), Number(coordinates[1])]
            : [108.2022, 16.0544],
      },
      eventDate: parsedDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      neededBloodTypes: normalizedBloodTypes,
      targetDonors: Number(targetDonors) || 100,
      organizerName: organizerName.trim() || 'Ban Chỉ Huy Cứu Nạn & Hội Chữ Thập Đỏ',
      contactPhone: (contactPhone || senderUser.phone || '').trim(),
      requirements: requirements.trim(),
      urgencyLevel,
      scope,
      areaId: targetAreaId,
      areaName: targetAreaName,
      provinceId: eventProvinceId,
      provinceName: eventProvinceName,
      createdBy: senderUser._id,
      creatorRole,
      status: 'ACTIVE',
      stats: {
        totalNotified: recipientUsers.length,
        confirmedCount: 0,
        declinedCount: 0,
        completedCount: 0,
      },
    });

    // Gửi thông báo đến tất cả người dùng đã đăng ký hiến máu trước đó
    const now = new Date();
    const notifTitle = `🩸 [Đợt Hiến Máu] ${title.trim()}`;
    const notifContent = `📍 Địa điểm: ${locationName.trim()} (${address.trim()})\n🕒 Thời gian: ${startTime.trim()} - ${endTime.trim()} ngày ${formattedDate}. Nhấn vào để xác nhận đăng ký hiến máu tại điểm này!`;

    if (recipientUsers.length > 0) {
      const notificationDocs = recipientUsers.map((u) => ({
        userId: u._id,
        createdBy: senderUser._id,
        areaId: targetAreaId,
        areaName: targetAreaName,
        type: 'BLOOD_DONATION',
        title: notifTitle,
        content: notifContent,
        priority: 'CRITICAL',
        actionUrl: 'blood_donation',
        data: {
          isBloodDonation: true,
          eventId: eventDoc._id.toString(),
          title: eventDoc.title,
          locationName: eventDoc.locationName,
          address: eventDoc.address,
          eventDate: eventDoc.eventDate,
          startTime: eventDoc.startTime,
          endTime: eventDoc.endTime,
          neededBloodTypes: eventDoc.neededBloodTypes,
          areaName: targetAreaName,
          actionUrl: 'blood_donation',
          screen: 'blood_donation',
        },
        isRead: false,
        createdAt: now,
      }));

      const savedNotifications = await Notification.insertMany(notificationDocs);

      // Bắn sự kiện SSE realtime đến từng user đã đăng ký hiến máu
      savedNotifications.forEach((notification) => {
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: notification.userId.toString(),
          notification,
        });
      });

      // Gửi Expo Push Notification đến thiết bị di động
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
          title: notifTitle,
          body: notifContent,
          priority: 'CRITICAL',
          data: {
            type: 'BLOOD_DONATION',
            isBloodDonation: true,
            eventId: eventDoc._id.toString(),
            locationName: eventDoc.locationName,
            address: eventDoc.address,
            eventDate: eventDoc.eventDate.toISOString(),
            startTime: eventDoc.startTime,
            endTime: eventDoc.endTime,
            areaName: targetAreaName,
            actionUrl: 'blood_donation',
            screen: 'blood_donation',
          },
        }).catch((err) => {
          console.error('[BloodDonationService] Gửi Expo Push Notification thất bại:', err.message);
        });
      }
    }

    return eventDoc;
  }

  /**
   * 6. Danh sách các đăng ký hiến máu (Dành cho Địa phương & Admin)
   */
  async listRegistrations(requester, query = {}) {
    const {
      registrationType,
      eventId,
      status,
      bloodType,
      areaId,
      search,
      page = 1,
      limit = 100,
    } = query;

    const filter = {};
    if (registrationType && registrationType !== 'ALL') {
      filter.registrationType = registrationType;
    }
    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      filter.eventId = new mongoose.Types.ObjectId(eventId);
    }
    if (status && status !== 'ALL') {
      filter.status = status;
    } else {
      filter.status = { $ne: 'CANCELLED' };
    }
    if (bloodType && bloodType !== 'ALL') {
      filter.bloodType = bloodType;
    }
    if (areaId && areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(areaId)) {
      filter.areaId = new mongoose.Types.ObjectId(areaId);
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: regex },
        { phone: regex },
        { address: regex },
        { areaName: regex },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const [items, total] = await Promise.all([
      BloodDonationRegistration.find(filter)
        .populate('userId', 'fullName phone email avatarUrl address')
        .populate('eventId', 'title locationName eventDate startTime endTime status')
        .sort({ respondedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(Math.max(1, Number(limit)))
        .lean(),
      BloodDonationRegistration.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    };
  }

  /**
   * 7. Cập nhật trạng thái đăng ký hiến máu (Dành cho Địa phương & Admin)
   */
  async updateRegistrationStatus(requester, registrationId, data = {}) {
    if (!mongoose.Types.ObjectId.isValid(registrationId)) {
      throw new ApiError(400, 'Mã đăng ký không hợp lệ.');
    }

    const reg = await BloodDonationRegistration.findById(registrationId);
    if (!reg) {
      throw new ApiError(404, 'Không tìm thấy bản ghi đăng ký hiến máu.');
    }

    if (data.status) {
      reg.status = data.status;
    }
    if (data.bloodType) {
      reg.bloodType = data.bloodType;
    }
    if (data.note !== undefined) {
      reg.note = data.note;
    }
    await reg.save();

    if (reg.eventId) {
      await this.recalculateEventStats(reg.eventId);
    }

    return reg;
  }

  /**
   * 8. Lấy danh sách các sự kiện hiến máu (Cho Web và App)
   */
  async listEvents(requester, query = {}) {
    const { status, areaId, search, page = 1, limit = 50 } = query;
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }
    if (areaId && areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(areaId)) {
      filter.areaId = new mongoose.Types.ObjectId(areaId);
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { title: regex },
        { locationName: regex },
        { address: regex },
        { areaName: regex },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const [items, total] = await Promise.all([
      BloodDonationEvent.find(filter)
        .populate('createdBy', 'fullName phone roles')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.max(1, Number(limit)))
        .lean(),
      BloodDonationEvent.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    };
  }

  /**
   * 9. Chi tiết sự kiện hiến máu kèm danh sách người dân đã phản hồi tại sự kiện đó
   */
  async getEventDetail(requester, eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new ApiError(400, 'Mã sự kiện hiến máu không hợp lệ.');
    }

    const event = await BloodDonationEvent.findById(eventId)
      .populate('createdBy', 'fullName phone roles')
      .lean();

    if (!event) {
      throw new ApiError(404, 'Không tìm thấy sự kiện hiến máu.');
    }

    const responses = await BloodDonationRegistration.find({
      eventId: event._id,
      registrationType: 'EVENT_REGISTRATION',
      status: { $ne: 'CANCELLED' },
    })
      .populate('userId', 'fullName phone email avatarUrl address')
      .sort({ respondedAt: -1 })
      .lean();

    let myResponse = null;
    if (requester?._id) {
      myResponse =
        responses.find(
          (r) =>
            (r.userId?._id?.toString() || r.userId?.toString()) === requester._id.toString()
        ) || null;
    }

    return {
      event,
      responses,
      myResponse,
    };
  }

  /**
   * 10. Đóng / Cập nhật trạng thái sự kiện hiến máu
   */
  async updateEventStatus(requester, eventId, status = 'CLOSED') {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new ApiError(400, 'Mã sự kiện hiến máu không hợp lệ.');
    }

    const event = await BloodDonationEvent.findById(eventId);
    if (!event) {
      throw new ApiError(404, 'Không tìm thấy sự kiện hiến máu.');
    }

    event.status = status;
    await event.save();
    return event;
  }
}

module.exports = new BloodDonationService();


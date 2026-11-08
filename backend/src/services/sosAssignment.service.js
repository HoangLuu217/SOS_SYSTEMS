const mongoose = require('mongoose');
const {
  SosAssignment,
  SosRequest,
  SosStatusHistory,
  AuthorityOrganization,
  RescueTeam,
  User,
  Vehicle,
  Equipment,
  Notification,
} = require('../models');
const { emitSosUpdated } = require('../socket');
const ApiError = require('../utils/apiError');

/**
 * Hàm trừ trực tiếp số lượng vật tư / trang thiết bị trong kho (Collection Equipment)
 */
async function deductSuppliesFromEquipment(suppliesList, contextNote = '') {
  if (!Array.isArray(suppliesList) || suppliesList.length === 0) return;

  for (const item of suppliesList) {
    const rawQty = item.quantity || item.allocatedQuantity;
    const qty = parseInt(rawQty, 10);
    if (!qty || qty <= 0) continue;

    const eqId = item.equipmentId || item.supplyId || item._id;
    let eq = null;

    // 1. Tìm theo ObjectId nếu hợp lệ
    if (eqId && mongoose.Types.ObjectId.isValid(eqId)) {
      eq = await Equipment.findById(eqId);
    }

    // 2. Tìm theo tên chính xác hoặc không phân biệt hoa thường
    if (!eq && item.name) {
      const cleanName = item.name.trim();
      const escaped = cleanName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      eq = await Equipment.findOne({
        name: new RegExp('^' + escaped + '$', 'i'),
        quantity: { $gte: qty },
      });
      if (!eq) {
        eq = await Equipment.findOne({
          name: new RegExp('^' + escaped + '$', 'i'),
        });
      }
      if (!eq) {
        eq = await Equipment.findOne({
          name: new RegExp(escaped, 'i'),
        });
      }
    }

    // 3. Tìm theo serialNumber hoặc mã vật tư
    if (!eq && eqId) {
      eq = await Equipment.findOne({
        $or: [
          { serialNumber: String(eqId).trim().toUpperCase() },
          { name: new RegExp(String(eqId).trim(), 'i') },
        ],
      });
    }

    if (eq) {
      const beforeQty = eq.quantity;
      eq.quantity = Math.max(0, eq.quantity - qty);
      const log = '[Xuất cấp: -' + qty + ' ' + (eq.unit || 'món') + (contextNote ? ' (' + contextNote + ')' : '') + ']';
      eq.note = eq.note ? eq.note + ' | ' + log : log;
      if (eq.quantity === 0 && eq.supplyType === 'CONSUMABLE') {
        eq.status = 'DAMAGED'; // Hết tồn kho
      }
      await eq.save();
      console.log('📦 [Equipment] Đã trừ kho vật tư "' + eq.name + '": ' + beforeQty + ' -> ' + eq.quantity + ' (-' + qty + ')');
    } else {
      console.warn('⚠️ [Equipment] Không tìm thấy vật tư trong kho để trừ:', item);
    }
  }

  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('equipment:updated');
      io.emit('equipment:change');
    }
  } catch (e) {}
}

class SosAssignmentService {
  /**
   * POST /sos/:id/assign
   */
  async assignSos(sosId, data, currentUser = null) {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'ID yêu cầu cứu nạn (sosId) không phải là ObjectId hợp lệ');
    }

    const { authorityOrganizationId, rescueTeamId, rescuerId, vehicleId, priority, note, assignedBy, supplies } =
      data;

    // 1. Kiểm tra SOS tồn tại
    const sos = await SosRequest.findById(sosId);
    if (!sos) {
      throw new ApiError(404, 'Không tìm thấy yêu cầu cứu nạn SOS');
    }

    // 2. Kiểm tra Rescue Team tồn tại
    if (!rescueTeamId) {
      throw new ApiError(400, 'rescueTeamId là bắt buộc');
    }
    if (!mongoose.Types.ObjectId.isValid(rescueTeamId)) {
      throw new ApiError(400, 'rescueTeamId không phải là ObjectId hợp lệ');
    }
    const team = await RescueTeam.findById(rescueTeamId);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy đội cứu hộ (Rescue Team)');
    }

    // 3. Kiểm tra Authority tồn tại (tự động kế thừa từ Team nếu thiếu)
    let authOrgId = authorityOrganizationId;
    if (!authOrgId || !mongoose.Types.ObjectId.isValid(authOrgId)) {
      authOrgId = team.authorityId;
    }
    let authority = null;
    if (authOrgId && mongoose.Types.ObjectId.isValid(authOrgId)) {
      authority = await AuthorityOrganization.findById(authOrgId);
    }
    if (!authority) {
      authority = await AuthorityOrganization.findOne({});
    }
    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy cơ quan chỉ đạo (Authority Organization)');
    }

    // 4. Kiểm tra Rescuer tồn tại (mặc định Đội trưởng nếu thiếu)
    let validRescuerId = rescuerId;
    if (!validRescuerId || !mongoose.Types.ObjectId.isValid(validRescuerId)) {
      validRescuerId = team.leaderId;
    }
    const rescuer = await User.findById(validRescuerId);
    if (!rescuer) {
      throw new ApiError(404, 'Không tìm thấy cứu hộ viên (Rescuer)');
    }

    // 4.1. Quy tắc tác chiến: 1 nhóm/đội chỉ được phép làm 1 nhiệm vụ tại một thời điểm
    const activeAssignment = await SosAssignment.findOne({
      $or: [
        { rescueTeamId: team._id },
        { teamId: team._id },
        { rescuerId: rescuer._id },
      ],
      status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
    }).populate('sosRequestId');

    if (activeAssignment) {
      const activeCode =
        activeAssignment.sosRequestId?.sosCode ||
        activeAssignment.sosId?.sosCode ||
        'đang thực hiện';
      throw new ApiError(
        400,
        `Đội cứu hộ "${team.name}" đang thực hiện nhiệm vụ (${activeCode}). Mỗi đội chỉ được phép thực hiện 1 nhiệm vụ tại một thời điểm! Vui lòng hoàn thành nhiệm vụ hiện tại trước khi phân công nhiệm vụ mới.`
      );
    }

    // 5. Kiểm tra Vehicle tồn tại (nếu có truyền hoặc lấy theo Đội)
    let validVehicleId = null;
    if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
      const vehicle = await Vehicle.findById(vehicleId);
      if (vehicle) validVehicleId = vehicle._id;
    }
    if (!validVehicleId) {
      const teamVehicle = await Vehicle.findOne({ teamId: team._id });
      if (teamVehicle) validVehicleId = teamVehicle._id;
    }

    // Validate priority nếu có truyền
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const chosenPriority = priority ? String(priority).toUpperCase() : 'MEDIUM';
    if (priority && !validPriorities.includes(chosenPriority)) {
      throw new ApiError(
        400,
        `Mức độ ưu tiên '${priority}' không hợp lệ. Cho phép: ${validPriorities.join(', ')}`
      );
    }

    // Xác định assignedBy
    let assignerId = currentUser?._id || assignedBy || null;
    if (assignerId && !mongoose.Types.ObjectId.isValid(assignerId)) {
      assignerId = null;
    }

    // 6. Tạo Assignment & 7. Set status = PENDING, assignedAt = current time
    const assignment = await SosAssignment.create({
      sosRequestId: sos._id,
      sosId: sos._id,
      authorityOrganizationId: authority._id,
      rescueTeamId: team._id,
      teamId: team._id,
      rescuerId: rescuer._id,
      vehicleId: validVehicleId,
      assignedBy: assignerId,
      priority: chosenPriority,
      status: 'PENDING',
      assignedAt: new Date(),
      note: note || null,
      supplies: Array.isArray(supplies) ? supplies : [],
    });

    // Cập nhật trạng thái SOS Request sang ASSIGNED nếu SOS đang ở PENDING / VERIFIED
    if (['PENDING', 'VERIFIED'].includes(sos.status)) {
      sos.status = 'ASSIGNED';
      await sos.save();

      try {
        await SosStatusHistory.create({
          sosId: sos._id,
          oldStatus: 'VERIFIED',
          newStatus: 'ASSIGNED',
          changedBy: assignerId || rescuer._id,
          note: note || 'Điều phối phân công lực lượng cứu hộ',
        });
      } catch (err) {}

      emitSosUpdated(sos);
    }

    // Trừ kho vật tư ban đầu nếu có cấp khi giao nhiệm vụ
    if (Array.isArray(supplies) && supplies.length > 0) {
      try {
        await deductSuppliesFromEquipment(supplies, "Giao nhiệm vụ ca " + (sos.sosCode || sos._id));
      } catch (e) {
        console.warn("Lỗi trừ kho vật tư khi giao nhiệm vụ:", e);
      }
    }

    // Tìm danh sách tất cả cán bộ, chiến sĩ và đội trưởng trong đội để gửi thông báo
    const targetUserIds = new Set();
    if (rescuer._id) targetUserIds.add(rescuer._id.toString());
    try {
      const teamDoc = await RescueTeam.findById(assignment.rescueTeamId).select('leaderId members');
      if (teamDoc?.leaderId) targetUserIds.add(teamDoc.leaderId.toString());
      (teamDoc?.members || []).forEach((m) => {
        if (m.rescuerId) targetUserIds.add(m.rescuerId.toString());
      });
    } catch (_) {}

    const assignPayload = assignment.toObject ? assignment.toObject() : { ...assignment };
    assignPayload.targetUserIds = Array.from(targetUserIds);

    // Phát sự kiện Realtime Socket.IO & SSE thông báo cho Cứu Hộ Viên (Nổ nhiệm vụ GrabDriver)
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('assignment:created', assignPayload);
        io.emit('assignment:new', assignPayload);
        io.emit('sos:sync');
        for (const uid of targetUserIds) {
          io.to(`user_${uid}`).emit('assignment:assigned', assignPayload);
          io.to(`user_${uid}`).emit('sos:sync');
        }
      }

      const sosCodeStr = sos.sosCode || (sos._id ? `#SOS-${sos._id.toString().slice(-4)}` : 'mới');
      const victimsCount = sos.people || 1;
      const addrStr = sos.address || 'Khu vực ngập lụt';
      const notifTitle = `🚨 LỆNH ĐIỀU ĐỘNG CỨU HỘ: ${sosCodeStr}`;
      const notifContent = `Ban chỉ huy điều động ứng cứu khẩn cấp ca ${sosCodeStr} tại ${addrStr} (${victimsCount} người cần cứu). Khẩn trương tiếp cận!`;

      // 1. Gửi Realtime SSE & In-App Notification CHỈ cho cán bộ, đội trưởng và thành viên đội được phân công
      const eventBus = require('./eventBus');

      for (const uid of targetUserIds) {
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: uid,
          title: notifTitle,
          content: notifContent,
          data: {
            title: notifTitle,
            content: notifContent,
            type: 'ALERT',
            action: 'ASSIGNED',
            priority: 'CRITICAL',
            sosId: sos._id,
            sosCode: sos.sosCode,
            status: 'ASSIGNED',
            assignmentId: assignment._id,
            address: addrStr,
            people: victimsCount,
          },
        });

        // Lưu vào CSDL bảng Notifications để lưu vết lịch sử
        try {
          await Notification.create({
            userId: uid,
            createdBy: assignerId || null,
            areaId: sos.areaId || null,
            areaName: sos.areaName || null,
            sosId: sos._id,
            type: 'ALERT',
            title: notifTitle,
            content: notifContent,
            priority: 'CRITICAL',
            data: {
              type: 'SOS_SYNC',
              action: 'ASSIGNED',
              sosId: sos._id,
              assignmentId: assignment._id,
            },
          });
        } catch (_) {}
      }

      // 2. Gửi Push Notification ra màn hình khóa điện thoại (Expo Push Service)
      try {
        const targetUsers = await User.find({
          _id: { $in: Array.from(targetUserIds) },
          $or: [
            { pushToken: { $exists: true, $ne: null } },
            { 'citizen.pushToken': { $exists: true, $ne: null } },
          ],
        }).select('pushToken citizen.pushToken');

        const pushTokens = [];
        targetUsers.forEach((u) => {
          if (u.pushToken && typeof u.pushToken === 'string' && u.pushToken.trim()) {
            pushTokens.push(u.pushToken.trim());
          }
          if (u.citizen?.pushToken && typeof u.citizen.pushToken === 'string' && u.citizen.pushToken.trim()) {
            pushTokens.push(u.citizen.pushToken.trim());
          }
        });

        const uniqueTokens = [...new Set(pushTokens)];
        if (uniqueTokens.length > 0) {
          const { sendExpoPushNotification } = require('../utils/expoPush');
          await sendExpoPushNotification({
            tokens: uniqueTokens,
            title: notifTitle,
            body: notifContent,
            priority: 'CRITICAL',
            sound: 'default',
            channelId: 'emergency-alerts',
            data: {
              type: 'SOS_SYNC',
              action: 'ASSIGNED',
              sosId: sos._id.toString(),
              assignmentId: assignment._id.toString(),
            },
          });
        }
      } catch (pushErr) {
        console.warn('Lỗi gửi push notification cho đội cứu hộ:', pushErr);
      }
    } catch (err) {
      console.warn('Lỗi phát socket/SSE cho nhiệm vụ mới:', err);
    }

    return assignment;
  }

  /**
   * GET /assignments/my
   * Lấy danh sách nhiệm vụ phân công của Cứu hộ viên hiện tại hoặc Đội của họ
   */
  async getMyAssignments(userOrId) {
    const userId = userOrId?._id || userOrId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(401, 'Vui lòng đăng nhập để xem nhiệm vụ');
    }

    // Tìm các đội mà user là leader hoặc thành viên đã được duyệt
    const teams = await RescueTeam.find({
      $or: [
        { leaderId: userId },
        { 'members.rescuerId': userId, 'members.status': 'APPROVED' },
        { 'members.rescuerId': userId },
      ],
    }).select('_id');
    const teamIds = teams.map((t) => t._id);

    const filter = {
      $or: [
        { rescuerId: userId },
        { rescueTeamId: { $in: teamIds } },
        { teamId: { $in: teamIds } },
      ],
    };

    const assignments = await SosAssignment.find(filter)
      .populate({
        path: 'sosRequestId',
        populate: [
          { path: 'citizenId', select: '_id fullName phone email avatarUrl address' },
          { path: 'areaId', select: '_id name code' },
        ],
      })
      .populate({
        path: 'sosId',
        populate: [
          { path: 'citizenId', select: '_id fullName phone email avatarUrl address' },
          { path: 'areaId', select: '_id name code' },
        ],
      })
      .populate('authorityOrganizationId', 'name code type phone')
      .populate({
        path: 'rescueTeamId',
        select: 'name type leaderId phone',
        populate: {
          path: 'leaderId',
          select: '_id fullName phone email avatarUrl rescuer',
        },
      })
      .populate('rescuerId', '_id fullName phone email avatarUrl rescuer')
      .populate('vehicleId', 'plateNumber type capacity status')
      .populate('assignedBy', '_id fullName phone email roles')
      .sort({ createdAt: -1 });

    return assignments;
  }

  /**
   * GET /assignments/:id
   */
  async getAssignmentById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID phân công không hợp lệ');
    }

    const assignment = await SosAssignment.findById(id)
      .populate({
        path: 'sosRequestId',
        populate: { path: 'citizenId', select: '_id fullName phone avatarUrl' },
      })
      .populate({
        path: 'sosId',
        populate: { path: 'citizenId', select: '_id fullName phone avatarUrl' },
      })
      .populate('authorityOrganizationId', 'name code type phone')
      .populate({
        path: 'rescueTeamId',
        select: 'name type leaderId',
        populate: {
          path: 'leaderId',
          select: '_id fullName phone email avatarUrl rescuer',
        },
      })
      .populate('rescuerId', '_id fullName phone email avatarUrl rescuer')
      .populate('vehicleId', 'plateNumber type capacity status')
      .populate('assignedBy', '_id fullName phone email roles');

    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ');
    }

    return assignment;
  }

  /**
   * GET /sos/:id/assignments
   */
  async getAssignmentsBySosId(sosId) {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'ID yêu cầu cứu nạn (sosId) không phải là ObjectId hợp lệ');
    }

    const sos = await SosRequest.findById(sosId);
    if (!sos) {
      throw new ApiError(404, 'Không tìm thấy yêu cầu cứu nạn SOS');
    }

    const assignments = await SosAssignment.find({
      $or: [{ sosRequestId: sosId }, { sosId: sosId }],
    })
      .populate('authorityOrganizationId', 'name code type phone')
      .populate({
        path: 'rescueTeamId',
        select: 'name type leaderId',
        populate: {
          path: 'leaderId',
          select: '_id fullName phone email avatarUrl rescuer',
        },
      })
      .populate('rescuerId', '_id fullName phone email avatarUrl rescuer')
      .populate('vehicleId', 'plateNumber type capacity status')
      .populate('assignedBy', '_id fullName phone email roles')
      .sort({ createdAt: -1 });

    return assignments;
  }

  /**
   * PATCH /assignments/:id/accept
   * Cứu hộ viên chấp nhận phân công (chỉ cho phép PENDING -> ACCEPTED)
   */
  async acceptAssignment(id, currentUser = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID phân công không phải là ObjectId hợp lệ');
    }

    const assignment = await SosAssignment.findById(id);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ (Assignment)');
    }

    if (assignment.status !== 'PENDING') {
      throw new ApiError(
        400,
        `Không thể chấp nhận phân công khi đang ở trạng thái '${assignment.status}'. Yêu cầu trạng thái PENDING.`
      );
    }

    // Chỉ đội trưởng (hoặc cán bộ/admin) mới có quyền tiếp nhận lệnh điều động
    if (currentUser && assignment.rescueTeamId) {
      const team = await RescueTeam.findById(assignment.rescueTeamId).select('leaderId');
      if (team && team.leaderId) {
        const currentUserId = (currentUser._id || currentUser)?.toString();
        const isLeader = team.leaderId.toString() === currentUserId;
        const isOfficerOrAdmin = currentUser.roles?.some((r) =>
          ['ADMIN', 'SUPER_ADMIN', 'DISPATCHER', 'OFFICER', 'COORDINATOR'].includes(r)
        );
        const isDirectRescuer = assignment.rescuerId?.toString() === currentUserId;
        if (!isLeader && !isOfficerOrAdmin && !isDirectRescuer) {
          throw new ApiError(403, 'Chỉ đội trưởng mới có quyền xác nhận tiếp nhận lệnh điều động');
        }
      }
    }

    assignment.status = 'ACCEPTED';
    assignment.acceptedAt = new Date();
    await assignment.save();

    // Đồng bộ trạng thái sang SosRequest và phát realtime Socket.IO
    const sosId = assignment.sosRequestId || assignment.sosId;
    if (sosId) {
      const sos = await SosRequest.findById(sosId)
        .populate('citizenId', 'fullName phone avatarUrl email address')
        .populate('areaId', 'name code');
      if (sos) {
        if (assignment.missionType === 'SHORE_HANDOFF') {
          if (sos.shoreHandoff) {
            sos.shoreHandoff.status = 'ASSIGNED';
            await sos.save();
          }
        } else {
          const oldStatus = sos.status;
          sos.status = 'ACCEPTED';
          await sos.save();

          try {
            await SosStatusHistory.create({
              sosId: sos._id,
              oldStatus,
              newStatus: 'ACCEPTED',
              changedBy: currentUser?._id || assignment.rescuerId,
              note: 'Cứu hộ viên đã tiếp nhận nhiệm vụ',
            });
          } catch (err) {}
        }

        try {
          await assignment.populate([
            { path: 'rescueTeamId', select: 'name code phone leaderId' },
            { path: 'rescuerId', select: 'fullName phone avatarUrl' },
            { path: 'vehicleId', select: 'plateNumber type capacity' },
            { path: 'authorityOrganizationId', select: 'name code' },
          ]);
        } catch (popErr) {}

        const sosObj = sos.toObject ? sos.toObject() : { ...sos };
        sosObj.assignment = assignment.toObject ? assignment.toObject() : assignment;
        sosObj.assignmentId = assignment._id;
        emitSosUpdated(sosObj);
      }
    }

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('assignment:status_updated', assignment);
        io.emit('assignment:updated', assignment);
      }
    } catch (err) {}

    return assignment;
  }

  /**
   * PATCH /assignments/:id/status
   * Cập nhật trạng thái tiến trình cứu hộ của Rescuer
   */
  async updateStatus(id, newStatus, currentUser = null, note = '', extraData = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID phân công không phải là ObjectId hợp lệ');
    }

    if (!newStatus) {
      throw new ApiError(400, 'Trường status là bắt buộc');
    }

    const validStatuses = [
      'PENDING',
      'ACCEPTED',
      'DISPATCHED',
      'EN_ROUTE',
      'ON_THE_WAY',
      'ARRIVED',
      'IN_PROGRESS',
      'RESCUING',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
    ];

    const targetStatus = String(newStatus).trim().toUpperCase();
    if (!validStatuses.includes(targetStatus)) {
      throw new ApiError(
        400,
        `Trạng thái '${newStatus}' không hợp lệ. Cho phép: ${validStatuses.join(', ')}`
      );
    }

    const assignment = await SosAssignment.findById(id);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ (Assignment)');
    }

    const currentStatus = assignment.status;

    // Định nghĩa các luồng chuyển trạng thái hợp lệ
    const VALID_TRANSITIONS = {
      PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
      ACCEPTED: ['DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
      DISPATCHED: ['EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
      EN_ROUTE: ['ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
      ON_THE_WAY: ['ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
      ARRIVED: ['IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      RESCUING: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      ASSIGNED: ['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED', 'CANCELLED'],
    };

    if (currentStatus === targetStatus) {
      let changed = false;
      if (extraData?.proofImages && Array.isArray(extraData.proofImages) && extraData.proofImages.length > 0) {
        assignment.proofImages = [
          ...new Set([...(assignment.proofImages || []), ...extraData.proofImages]),
        ];
        changed = true;
      }
      if (extraData?.actualRecipient) {
        assignment.actualRecipient = String(extraData.actualRecipient).trim();
        changed = true;
      }
      if (note && !assignment.note?.includes(note)) {
        assignment.note = assignment.note ? `${assignment.note} | ${note}` : note;
        changed = true;
      }
      if (changed) await assignment.save();
      return assignment;
    }

    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ApiError(
        400,
        `Không thể chuyển đổi trạng thái phân công từ '${currentStatus}' sang '${targetStatus}'.`
      );
    }

    // Kiểm tra quyền hạn: Chỉ đội trưởng mới được nhận lệnh (ACCEPTED) hoặc từ chối (REJECTED)
    if (['ACCEPTED', 'REJECTED'].includes(targetStatus) && currentUser && assignment.rescueTeamId) {
      const team = await RescueTeam.findById(assignment.rescueTeamId).select('leaderId');
      if (team && team.leaderId) {
        const currentUserId = (currentUser._id || currentUser)?.toString();
        const isLeader = team.leaderId.toString() === currentUserId;
        const isOfficerOrAdmin = currentUser.roles?.some((r) =>
          ['ADMIN', 'SUPER_ADMIN', 'DISPATCHER', 'OFFICER', 'COORDINATOR'].includes(r)
        );
        const isDirectRescuer = assignment.rescuerId?.toString() === currentUserId;
        if (!isLeader && !isOfficerOrAdmin && !isDirectRescuer) {
          throw new ApiError(
            403,
            `Chỉ đội trưởng mới có quyền ${targetStatus === 'ACCEPTED' ? 'xác nhận tiếp nhận' : 'từ chối'} lệnh điều động`
          );
        }
      }
    }

    // Bắt buộc minh bạch: Nhiệm vụ xuất cấp cứu trợ phải có ít nhất 1 ảnh bằng chứng bàn giao
    if (targetStatus === 'COMPLETED') {
      const isRelief =
        assignment.missionType === 'RELIEF_DISPATCH' ||
        (Array.isArray(assignment.supplies) && assignment.supplies.length > 0) ||
        (typeof assignment.note === 'string' && assignment.note.includes('xuất cấp cứu trợ'));

      if (isRelief) {
        const hasProof =
          (Array.isArray(extraData?.proofImages) && extraData.proofImages.length > 0) ||
          (Array.isArray(assignment.proofImages) && assignment.proofImages.length > 0);

        if (!hasProof) {
          throw new ApiError(
            400,
            'Để đảm bảo tính minh bạch khi xuất cấp cứu trợ, bạn bắt buộc phải cung cấp ít nhất 1 ảnh chụp bằng chứng bàn giao thực tế (ảnh trao hàng tận tay, kiện hàng hoặc biên bản ký nhận) trước khi hoàn tất nhiệm vụ!'
          );
        }
      }
    }

    assignment.status = targetStatus;

    // Cập nhật timestamp tương ứng
    const now = new Date();
    if (targetStatus === 'ACCEPTED' && !assignment.acceptedAt) {
      assignment.acceptedAt = now;
    }
    if (['IN_PROGRESS', 'RESCUING', 'ARRIVED'].includes(targetStatus) && !assignment.startedAt) {
      assignment.startedAt = now;
    }
    if (targetStatus === 'COMPLETED' && !assignment.completedAt) {
      assignment.completedAt = now;
    }
    if (targetStatus === 'CANCELLED' && !assignment.cancelledAt) {
      assignment.cancelledAt = now;
    }

    // Lưu các thông tin minh bạch bàn giao vật tư / hiện trường nếu có
    if (extraData?.proofImages && Array.isArray(extraData.proofImages) && extraData.proofImages.length > 0) {
      assignment.proofImages = [
        ...new Set([...(assignment.proofImages || []), ...extraData.proofImages]),
      ];
    }
    if (extraData?.actualRecipient) {
      assignment.actualRecipient = String(extraData.actualRecipient).trim();
    }
    if (note) {
      assignment.note = assignment.note ? `${assignment.note} | ${note}` : note;
    }

    await assignment.save();

    // Map trạng thái phân công sang trạng thái SosRequest
    const ASSIGNMENT_TO_SOS_STATUS = {
      PENDING: 'ASSIGNED',
      ACCEPTED: 'ACCEPTED',
      DISPATCHED: 'ON_THE_WAY',
      EN_ROUTE: 'ON_THE_WAY',
      ON_THE_WAY: 'ON_THE_WAY',
      ARRIVED: 'ARRIVED',
      IN_PROGRESS: 'RESCUING',
      RESCUING: 'RESCUING',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      REJECTED: 'REJECTED',
    };

    const targetSosStatus = ASSIGNMENT_TO_SOS_STATUS[targetStatus];
    const sosId = assignment.sosRequestId || assignment.sosId;
    if (sosId && targetSosStatus) {
      const sos = await SosRequest.findById(sosId)
        .populate('citizenId', 'fullName phone avatarUrl email address')
        .populate('areaId', 'name code');
      if (sos) {
        if (assignment.missionType === 'SHORE_HANDOFF') {
          if (sos.shoreHandoff) {
            if (targetStatus === 'COMPLETED') {
              sos.shoreHandoff.status = 'COMPLETED';
              sos.shoreHandoff.completedAt = now;
              if (assignment.vehicleId) {
                await Vehicle.findByIdAndUpdate(assignment.vehicleId, { status: 'AVAILABLE' });
              }
            } else if (targetStatus === 'CANCELLED' || targetStatus === 'REJECTED') {
              sos.shoreHandoff.status = 'REQUESTED';
              if (assignment.vehicleId) {
                await Vehicle.findByIdAndUpdate(assignment.vehicleId, { status: 'AVAILABLE' });
              }
            }
            await sos.save();
          }
        } else {
          const oldStatus = sos.status;
          sos.status = targetSosStatus;
          if (targetSosStatus === 'COMPLETED' || targetSosStatus === 'RESOLVED' || targetSosStatus === 'CANCELLED') {
            sos.resolvedAt = now;
            if (sos.shoreHandoff?.assignedVehicleId && mongoose.isValidObjectId(sos.shoreHandoff.assignedVehicleId)) {
              await Vehicle.findByIdAndUpdate(sos.shoreHandoff.assignedVehicleId, { status: 'AVAILABLE' });
            }
          }
          if (extraData?.proofImages && Array.isArray(extraData.proofImages) && extraData.proofImages.length > 0) {
            sos.proofImages = [
              ...new Set([...(sos.proofImages || []), ...extraData.proofImages]),
            ];
          }
          await sos.save();

          try {
            await SosStatusHistory.create({
              sosId: sos._id,
              oldStatus,
              newStatus: targetSosStatus,
              changedBy: currentUser?._id || assignment.rescuerId,
              note: note || `Cứu hộ viên cập nhật tiến trình: ${targetStatus}`,
              images: extraData?.proofImages || [],
            });
          } catch (err) {}
        }

        try {
          await assignment.populate([
            { path: 'rescueTeamId', select: 'name code phone leaderId' },
            { path: 'rescuerId', select: 'fullName phone avatarUrl' },
            { path: 'vehicleId', select: 'plateNumber type capacity' },
            { path: 'authorityOrganizationId', select: 'name code' },
          ]);
        } catch (popErr) {}

        const sosObj = sos.toObject ? sos.toObject() : { ...sos };
        sosObj.assignment = assignment.toObject ? assignment.toObject() : assignment;
        sosObj.assignmentId = assignment._id;
        emitSosUpdated(sosObj);
      }
    }

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('assignment:status_updated', assignment);
        io.emit('assignment:updated', assignment);
      }
    } catch (err) {}

    return assignment;
  }

  /**
   * PATCH /assignments/:id/reassign
   */
  async reassignAssignment(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID phân công không phải là ObjectId hợp lệ');
    }

    const assignment = await SosAssignment.findById(id);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ (Assignment)');
    }

    if (['COMPLETED', 'CANCELLED'].includes(assignment.status)) {
      throw new ApiError(
        400,
        `Không thể điều phối lại (reassign) nhiệm vụ đã ở trạng thái '${assignment.status}'`
      );
    }

    const { rescueTeamId, rescuerId, vehicleId, note } = data;

    if (rescueTeamId) {
      if (!mongoose.Types.ObjectId.isValid(rescueTeamId)) {
        throw new ApiError(400, 'rescueTeamId không phải là ObjectId hợp lệ');
      }
      const team = await RescueTeam.findById(rescueTeamId);
      if (!team) {
        throw new ApiError(404, 'Không tìm thấy đội cứu hộ (Rescue Team)');
      }
      assignment.rescueTeamId = team._id;
      assignment.teamId = team._id;
    }

    if (rescuerId) {
      if (!mongoose.Types.ObjectId.isValid(rescuerId)) {
        throw new ApiError(400, 'rescuerId không phải là ObjectId hợp lệ');
      }
      const rescuer = await User.findById(rescuerId);
      if (!rescuer) {
        throw new ApiError(404, 'Không tìm thấy cứu hộ viên (Rescuer)');
      }
      assignment.rescuerId = rescuer._id;
    }

    if (vehicleId !== undefined) {
      if (vehicleId === null || vehicleId === '') {
        assignment.vehicleId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
          throw new ApiError(400, 'vehicleId không phải là ObjectId hợp lệ');
        }
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
          throw new ApiError(404, 'Không tìm thấy phương tiện cứu hộ (Vehicle)');
        }
        assignment.vehicleId = vehicle._id;
      }
    }

    if (note !== undefined) {
      assignment.note = note ? String(note).trim() : null;
    }

    // Kiểm tra đội hoặc nhân sự nhận bàn giao có đang bận làm nhiệm vụ khác không
    if (rescueTeamId || rescuerId) {
      const busyOrFilters = [];
      if (rescueTeamId) {
        busyOrFilters.push({ rescueTeamId: assignment.rescueTeamId }, { teamId: assignment.rescueTeamId });
      }
      if (rescuerId) {
        busyOrFilters.push({ rescuerId: assignment.rescuerId });
      }
      if (busyOrFilters.length > 0) {
        const busyAssignment = await SosAssignment.findOne({
          _id: { $ne: assignment._id },
          $or: busyOrFilters,
          status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        }).populate('sosRequestId');

        if (busyAssignment) {
          const activeCode =
            busyAssignment.sosRequestId?.sosCode ||
            busyAssignment.sosId?.sosCode ||
            'nhiệm vụ khác';
          throw new ApiError(
            400,
            `Đội cứu hộ hoặc nhân sự được bàn giao đang thực hiện nhiệm vụ (${activeCode}). Mỗi đội chỉ được phép thực hiện 1 nhiệm vụ tại một thời điểm!`
          );
        }
      }
    }

    await assignment.save();

    const sosId = assignment.sosRequestId || assignment.sosId;
    if (sosId) {
      const sos = await SosRequest.findById(sosId)
        .populate('citizenId', 'fullName phone avatarUrl email address')
        .populate('areaId', 'name code');
      if (sos) {
        emitSosUpdated(sos);
      }
    }

    return assignment;
  }

  /**
   * PATCH /assignments/:id/cancel
   */
  async cancelAssignment(id, cancelReason) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID phân công không phải là ObjectId hợp lệ');
    }

    let assignment = await SosAssignment.findById(id);
    if (!assignment) {
      assignment = await SosAssignment.findOne({
        $or: [{ sosRequestId: id }, { sosId: id }],
        status: { $nin: ['CANCELLED', 'REJECTED'] },
      });
    }
    if (!assignment) {
      // Tìm xem có assignment nào đã CANCELLED trước đó không để trả về mà không ném lỗi 404
      const existing = await SosAssignment.findOne({
        $or: [{ _id: id }, { sosRequestId: id }, { sosId: id }],
      });
      if (existing) return existing;
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ (Assignment)');
    }

    if (assignment.status === 'CANCELLED') {
      return assignment;
    }

    if (assignment.status === 'COMPLETED') {
      throw new ApiError(
        400,
        'Nhiệm vụ cứu hộ đã hoàn tất thành công, không thể hủy điều động!'
      );
    }

    const targetSosIdCheck = assignment.sosRequestId || assignment.sosId;
    if (targetSosIdCheck) {
      const sosCheck = await SosRequest.findById(targetSosIdCheck);
      if (sosCheck && sosCheck.status === 'COMPLETED') {
        throw new ApiError(
          400,
          'Sự cố cứu nạn đã hoàn tất thành công, không thể hủy điều động!'
        );
      }
    }

    assignment.status = 'CANCELLED';
    assignment.cancelledAt = new Date();
    assignment.cancelReason = cancelReason ? String(cancelReason).trim() : 'Cancelled by coordinator';

    await assignment.save();

    const sosId = assignment.sosRequestId || assignment.sosId;
    if (sosId) {
      const sos = await SosRequest.findById(sosId)
        .populate('citizenId', 'fullName phone avatarUrl email address')
        .populate('areaId', 'name code');
      if (sos) {
        const oldStatus = sos.status;
        sos.status = 'VERIFIED';
        await sos.save();

        try {
          await SosStatusHistory.create({
            sosId: sos._id,
            oldStatus,
            newStatus: 'VERIFIED',
            note: cancelReason ? `Hủy điều động: ${cancelReason}` : 'Hủy phân công điều động, chuyển ca về trạng thái Đã Xác Minh để điều phối lại',
          });
        } catch (err) {}

        emitSosUpdated(sos);
      }
    }

    // Phát sự kiện Realtime Socket.IO & notification thông báo Hủy điều động
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        const payload = {
          assignmentId: assignment._id.toString(),
          sosId: sosId ? sosId.toString() : null,
          reason: assignment.cancelReason,
          status: 'CANCELLED',
        };
        io.emit('assignment:cancelled', payload);
        io.emit('assignment:deleted', payload);
        io.emit('assignment:updated', payload);
        io.emit('sos:sync');
        if (assignment.rescuerId) {
          io.to(`user_${assignment.rescuerId}`).emit('assignment:cancelled', payload);
          io.to(`user_${assignment.rescuerId}`).emit('sos:sync');
        }
      }

      const eventBus = require('./eventBus');
      if (assignment.rescuerId) {
        const cancelTitle = `⚠️ LỆNH ĐIỀU ĐỘNG ĐÃ BỊ HỦY`;
        const cancelContent = `Ban chỉ huy đã thu hồi / hủy lệnh điều động cho ca cứu nạn.`;
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: assignment.rescuerId.toString(),
          title: cancelTitle,
          content: cancelContent,
          data: {
            title: cancelTitle,
            content: cancelContent,
            type: 'ALERT',
            action: 'CANCELLED',
            priority: 'HIGH',
            assignmentId: assignment._id.toString(),
            status: 'CANCELLED',
          },
        });
      }
    } catch (socketErr) {
      console.warn('Lỗi phát socket khi hủy phân công:', socketErr);
    }

    return assignment;
  }


  /**
   * Cập nhật tiến trình tác chiến trực tiếp thông qua mã SOS
   */
  async updateStatusBySosId(sosId, newStatus, currentUser = null, note = '', extraData = {}) {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'ID SOS không hợp lệ');
    }

    // Tìm assignment đang hoạt động của SOS này
    let assignment = await SosAssignment.findOne({
      $or: [{ sosRequestId: sosId }, { sosId: sosId }],
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    }).sort({ createdAt: -1 });

    if (assignment) {
      assignment = await this.updateStatus(assignment._id, newStatus, currentUser, note, extraData);
    } else {
      const sos = await SosRequest.findById(sosId)
        .populate('citizenId', 'fullName phone avatarUrl email address')
        .populate('areaId', 'name code');
      if (!sos) {
        throw new ApiError(404, 'Không tìm thấy yêu cầu cứu nạn SOS');
      }

      const ASSIGNMENT_TO_SOS_STATUS = {
        PENDING: 'ASSIGNED',
        ACCEPTED: 'ACCEPTED',
        DISPATCHED: 'ON_THE_WAY',
        EN_ROUTE: 'ON_THE_WAY',
        ON_THE_WAY: 'ON_THE_WAY',
        ARRIVED: 'ARRIVED',
        IN_PROGRESS: 'RESCUING',
        RESCUING: 'RESCUING',
        COMPLETED: 'COMPLETED',
        CANCELLED: 'CANCELLED',
      };

      const targetSosStatus = ASSIGNMENT_TO_SOS_STATUS[newStatus] || newStatus;
      const oldStatus = sos.status;
      sos.status = targetSosStatus;
      if (targetSosStatus === 'COMPLETED') {
        sos.resolvedAt = new Date();
      }
      if (extraData?.proofImages && Array.isArray(extraData.proofImages) && extraData.proofImages.length > 0) {
        sos.images = [
          ...new Set([...(sos.images || []), ...extraData.proofImages]),
        ];
      }
      await sos.save();

      try {
        if (currentUser?._id) {
          await SosStatusHistory.create({
            sosId: sos._id,
            oldStatus,
            newStatus: targetSosStatus,
            changedBy: currentUser._id,
            note: note || `Cập nhật tiến trình: ${newStatus}`,
            images: extraData?.proofImages || [],
          });
        }
      } catch (err) {}

      emitSosUpdated(sos);
      return { sos };
    }

    const updatedSos = await SosRequest.findById(sosId)
      .populate('citizenId', 'fullName phone avatarUrl email address')
      .populate('areaId', 'name code');

    return { assignment, sos: updatedSos };
  }

  /**
   * Đội cứu hộ gửi yêu cầu chi viện vật tư từ hiện trường
   */
  async requestSupplies(userId, { assignmentId, sosId, items, urgency, note }) {
    let assignment = null;
    if (assignmentId && mongoose.Types.ObjectId.isValid(assignmentId)) {
      assignment = await SosAssignment.findById(assignmentId);
    }
    if (!assignment && sosId && mongoose.Types.ObjectId.isValid(sosId)) {
      assignment = await SosAssignment.findOne({
        $or: [{ sosRequestId: sosId }, { sosId: sosId }],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      });
    }
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phiên phân công tác chiến hợp lệ');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'Danh sách vật tư yêu cầu không được rỗng');
    }

    const newRequests = items.map((it) => ({
      name: it.name,
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'món',
      urgency: urgency || 'HIGH',
      note: note || null,
      status: 'PENDING',
      requestedAt: new Date(),
    }));

    if (!assignment.requestedSupplies) {
      assignment.requestedSupplies = [];
    }
    assignment.requestedSupplies.push(...newRequests);
    await assignment.save();


    const populated = await SosAssignment.findById(assignment._id)
      .populate('sosRequestId', 'sosCode priority emergencyType address description')
      .populate('rescueTeamId', 'name phone')
      .populate('rescuerId', 'fullName phone');

    // Realtime notification
    try {
      const io = require('../socket').getIO();
      if (io) {
        io.emit('assignment:supply_requested', {
          assignmentId: assignment._id,
          sosId: assignment.sosRequestId,
          sosCode: populated?.sosRequestId?.sosCode,
          teamName: populated?.rescueTeamId?.name,
          requestedSupplies: assignment.requestedSupplies,
        });
        io.emit('notification:new', {
          title: `CHI VIỆN VẬT TƯ: ${populated?.rescueTeamId?.name || 'Đội Cứu Hộ'}`,
          message: `Đội cứu hộ yêu cầu cấp thêm: ${newRequests.map((r) => `${r.name} (${r.quantity} ${r.unit})`).join(', ')}`,
          type: 'WARNING',
        });
        io.emit('sos:sync');
      }
    } catch (e) {}

    return populated || assignment;
  }

  /**
   * Ban chỉ huy phê duyệt & xuất cấp vật tư chi viện cho đội
   */
  async approveSupplies(assignmentId, { note, officerId } = {}) {
    const assignment = await SosAssignment.findById(assignmentId);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ');
    }

    const pendingRequests = (assignment.requestedSupplies || []).filter((s) => s.status === 'PENDING');
    if (pendingRequests.length === 0) {
      throw new ApiError(400, 'Không có yêu cầu chi viện vật tư nào đang chờ duyệt');
    }

    const now = new Date();
    pendingRequests.forEach((req) => {
      req.status = 'APPROVED';
      req.respondedAt = now;
      req.responseNote = note || 'Ban chỉ huy đã phê duyệt xuất kho tiếp tế';

      // Hợp nhất vào danh sách supplies được giao theo xe
      const existing = (assignment.supplies || []).find((s) => s.name?.toLowerCase() === req.name?.toLowerCase());
      if (existing) {
        existing.quantity = (existing.quantity || 0) + req.quantity;
      } else {
        if (!assignment.supplies) assignment.supplies = [];
        assignment.supplies.push({
          name: req.name,
          quantity: req.quantity,
          unit: req.unit || 'món',
        });
      }
    });

    await assignment.save();

    // Trừ trực tiếp số lượng vật tư trong kho (Collection Equipment) cho các món vừa duyệt
    try {
      const approvedItemsToDeduct = pendingRequests.map((r) => ({
        name: r.name,
        quantity: r.quantity,
        unit: r.unit || "món",
      }));
      await deductSuppliesFromEquipment(
        approvedItemsToDeduct,
        "Chi viện bổ sung ca " + (assignment.sosRequestId?.sosCode || assignment.sosRequestId || assignment._id)
      );
    } catch (e) {
      console.warn("Lỗi trừ kho vật tư khi duyệt chi viện:", e);
    }

    const populated = await SosAssignment.findById(assignment._id)
      .populate('sosRequestId', 'sosCode priority emergencyType address description')
      .populate('rescueTeamId', 'name phone')
      .populate('rescuerId', 'fullName phone');

    try {
      const io = require('../socket').getIO();
      if (io) {
        io.emit('assignment:supply_approved', {
          assignmentId: assignment._id,
          sosId: assignment.sosRequestId,
          supplies: assignment.supplies,
          requestedSupplies: assignment.requestedSupplies,
        });
        io.emit('sos:sync');
      }
    } catch (e) {}

    return populated || assignment;
  }

  /**
   * Ban chỉ huy từ chối yêu cầu chi viện vật tư
   */
  async rejectSupplies(assignmentId, { note, officerId } = {}) {
    const assignment = await SosAssignment.findById(assignmentId);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ');
    }

    const pendingRequests = (assignment.requestedSupplies || []).filter((s) => s.status === 'PENDING');
    const now = new Date();
    pendingRequests.forEach((req) => {
      req.status = 'REJECTED';
      req.respondedAt = now;
      req.responseNote = note || 'Kho địa phương chưa thể đáp ứng';
    });

    await assignment.save();

    try {
      const io = require('../socket').getIO();
      if (io) {
        io.emit('assignment:supply_rejected', {
          assignmentId: assignment._id,
          sosId: assignment.sosRequestId,
          requestedSupplies: assignment.requestedSupplies,
        });
        io.emit('sos:sync');
      }
    } catch (e) {}

    return assignment;
  }
}

module.exports = new SosAssignmentService();

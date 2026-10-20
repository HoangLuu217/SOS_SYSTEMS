const mongoose = require('mongoose');
const {
  SosAssignment,
  SosRequest,
  SosStatusHistory,
  AuthorityOrganization,
  RescueTeam,
  User,
  Vehicle,
} = require('../models');
const { emitSosUpdated } = require('../socket');
const ApiError = require('../utils/apiError');

class SosAssignmentService {
  /**
   * POST /sos/:id/assign
   */
  async assignSos(sosId, data, currentUser = null) {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'ID yêu cầu cứu nạn (sosId) không phải là ObjectId hợp lệ');
    }

    const { authorityOrganizationId, rescueTeamId, rescuerId, vehicleId, priority, note, assignedBy } =
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

    // Phát sự kiện Realtime Socket.IO & SSE thông báo cho Cứu Hộ Viên (Nổ nhiệm vụ GrabDriver)
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('assignment:created', assignment);
        io.emit('assignment:new', assignment);
        io.to(`user_${rescuer._id}`).emit('assignment:assigned', assignment);
      }

      const eventBus = require('./eventBus');
      eventBus.emit('notification_event', {
        action: 'BROADCAST',
        data: {
          type: 'SOS_SYNC',
          action: 'ASSIGNED',
          sosId: sos._id,
          sosCode: sos.sosCode,
          status: 'ASSIGNED',
          assignmentId: assignment._id,
          rescuerId: rescuer._id,
        },
      });
      eventBus.emit('notification_event', {
        action: 'USER',
        userId: rescuer._id.toString(),
        title: '🚨 LỆNH ĐIỀU ĐỘNG CỨU HỘ MỚI',
        content: `Bạn vừa được Ban chỉ huy điều động ứng cứu khẩn cấp ca ${sos.sosCode || sos._id}!`,
        data: {
          type: 'SOS_SYNC',
          action: 'ASSIGNED',
          sosId: sos._id,
          sosCode: sos.sosCode,
          status: 'ASSIGNED',
          assignmentId: assignment._id,
        },
      });
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

        emitSosUpdated(sos);
      }
    }

    return assignment;
  }

  /**
   * PATCH /assignments/:id/status
   * Cập nhật trạng thái tiến trình cứu hộ của Rescuer
   */
  async updateStatus(id, newStatus, currentUser = null, note = '') {
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
      ACCEPTED: ['DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'CANCELLED'],
      DISPATCHED: ['EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'CANCELLED'],
      EN_ROUTE: ['ARRIVED', 'CANCELLED'],
      ON_THE_WAY: ['ARRIVED', 'CANCELLED'],
      ARRIVED: ['IN_PROGRESS', 'RESCUING', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      RESCUING: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      ASSIGNED: ['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'CANCELLED'],
    };

    if (currentStatus === targetStatus) {
      return assignment;
    }

    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ApiError(
        400,
        `Không thể chuyển đổi trạng thái phân công từ '${currentStatus}' sang '${targetStatus}'.`
      );
    }

    assignment.status = targetStatus;

    // Cập nhật timestamp tương ứng
    const now = new Date();
    if (targetStatus === 'ACCEPTED' && !assignment.acceptedAt) {
      assignment.acceptedAt = now;
    }
    if (['IN_PROGRESS', 'RESCUING'].includes(targetStatus) && !assignment.startedAt) {
      assignment.startedAt = now;
    }
    if (targetStatus === 'COMPLETED' && !assignment.completedAt) {
      assignment.completedAt = now;
    }
    if (targetStatus === 'CANCELLED' && !assignment.cancelledAt) {
      assignment.cancelledAt = now;
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
        const oldStatus = sos.status;
        sos.status = targetSosStatus;
        if (targetSosStatus === 'COMPLETED' || targetSosStatus === 'RESOLVED') {
          sos.resolvedAt = now;
        }
        await sos.save();

        try {
          await SosStatusHistory.create({
            sosId: sos._id,
            oldStatus,
            newStatus: targetSosStatus,
            changedBy: currentUser?._id || assignment.rescuerId,
            note: note || `Cứu hộ viên cập nhật tiến trình: ${targetStatus}`,
          });
        } catch (err) {}

        emitSosUpdated(sos);
      }
    }

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

    const assignment = await SosAssignment.findById(id);
    if (!assignment) {
      throw new ApiError(404, 'Không tìm thấy phân công cứu hộ (Assignment)');
    }

    if (['COMPLETED', 'CANCELLED'].includes(assignment.status)) {
      throw new ApiError(
        400,
        `Không thể hủy phân công đã ở trạng thái '${assignment.status}'`
      );
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

    return assignment;
  }


  /**
   * Cập nhật tiến trình tác chiến trực tiếp thông qua mã SOS
   */
  async updateStatusBySosId(sosId, newStatus, currentUser = null, note = '') {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'ID SOS không hợp lệ');
    }

    // Tìm assignment đang hoạt động của SOS này
    let assignment = await SosAssignment.findOne({
      $or: [{ sosRequestId: sosId }, { sosId: sosId }],
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    }).sort({ createdAt: -1 });

    if (assignment) {
      assignment = await this.updateStatus(assignment._id, newStatus, currentUser, note);
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
      await sos.save();

      try {
        if (currentUser?._id) {
          await SosStatusHistory.create({
            sosId: sos._id,
            oldStatus,
            newStatus: targetSosStatus,
            changedBy: currentUser._id,
            note: note || `Cập nhật tiến trình: ${newStatus}`,
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
}

module.exports = new SosAssignmentService();

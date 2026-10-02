const mongoose = require('mongoose');
const {
  SosAssignment,
  SosRequest,
  AuthorityOrganization,
  RescueTeam,
  User,
  Vehicle,
} = require('../models');
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

    // 2. Kiểm tra Authority tồn tại
    if (!authorityOrganizationId) {
      throw new ApiError(400, 'authorityOrganizationId là bắt buộc');
    }
    if (!mongoose.Types.ObjectId.isValid(authorityOrganizationId)) {
      throw new ApiError(400, 'authorityOrganizationId không phải là ObjectId hợp lệ');
    }
    const authority = await AuthorityOrganization.findById(authorityOrganizationId);
    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy cơ quan chỉ đạo (Authority Organization)');
    }

    // 3. Kiểm tra Rescue Team tồn tại
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

    // 4. Kiểm tra Rescuer tồn tại
    if (!rescuerId) {
      throw new ApiError(400, 'rescuerId là bắt buộc');
    }
    if (!mongoose.Types.ObjectId.isValid(rescuerId)) {
      throw new ApiError(400, 'rescuerId không phải là ObjectId hợp lệ');
    }
    const rescuer = await User.findById(rescuerId);
    if (!rescuer) {
      throw new ApiError(404, 'Không tìm thấy cứu hộ viên (Rescuer)');
    }

    // 5. Kiểm tra Vehicle tồn tại (nếu có truyền)
    let validVehicleId = null;
    if (vehicleId) {
      if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        throw new ApiError(400, 'vehicleId không phải là ObjectId hợp lệ');
      }
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        throw new ApiError(404, 'Không tìm thấy phương tiện cứu hộ (Vehicle)');
      }
      validVehicleId = vehicle._id;
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
      .populate('rescueTeamId', 'name type leaderId')
      .populate('rescuerId', '_id fullName phone email avatarUrl rescuer')
      .populate('vehicleId', 'plateNumber type capacity status')
      .populate('assignedBy', '_id fullName phone email roles')
      .sort({ createdAt: -1 });

    return assignments;
  }

  /**
   * PATCH /assignments/:id/accept
   * Chỉ cho phép PENDING -> ACCEPTED
   */
  async acceptAssignment(id) {
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

    return assignment;
  }

  /**
   * PATCH /assignments/:id/status
   */
  async updateStatus(id, newStatus) {
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
      'ARRIVED',
      'IN_PROGRESS',
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
      ACCEPTED: ['DISPATCHED', 'EN_ROUTE', 'CANCELLED'],
      DISPATCHED: ['EN_ROUTE', 'ARRIVED', 'CANCELLED'],
      EN_ROUTE: ['ARRIVED', 'CANCELLED'],
      ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      // Hỗ trợ status legacy nếu có
      ASSIGNED: ['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'CANCELLED'],
      ON_THE_WAY: ['ARRIVED', 'CANCELLED'],
      RESCUING: ['COMPLETED', 'CANCELLED'],
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
    if (targetStatus === 'IN_PROGRESS' && !assignment.startedAt) {
      assignment.startedAt = now;
    }
    if (targetStatus === 'COMPLETED' && !assignment.completedAt) {
      assignment.completedAt = now;
    }
    if (targetStatus === 'CANCELLED' && !assignment.cancelledAt) {
      assignment.cancelledAt = now;
    }

    await assignment.save();

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

    // Không cho reassign assignment đã COMPLETED hoặc CANCELLED
    if (['COMPLETED', 'CANCELLED'].includes(assignment.status)) {
      throw new ApiError(
        400,
        `Không thể điều phối lại (reassign) nhiệm vụ đã ở trạng thái '${assignment.status}'`
      );
    }

    const { rescueTeamId, rescuerId, vehicleId, note } = data;

    // 1. Kiểm tra Team tồn tại nếu truyền
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

    // 2. Kiểm tra Rescuer tồn tại nếu truyền
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

    // 3. Kiểm tra Vehicle tồn tại nếu truyền
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

    // Không cho cancel assignment đã COMPLETED hoặc CANCELLED
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

    return assignment;
  }
}

module.exports = new SosAssignmentService();

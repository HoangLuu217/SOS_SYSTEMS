const { RescueTeam, User, AuthorityOrganization, AdministrativeArea, Vehicle } = require('../models');
const ApiError = require('../utils/apiError');

class RescueTeamService {
  /**
   * Thu thập danh sách userId duy nhất (dạng string) liên quan tới đội (Đội trưởng + thành viên + bổ sung)
   */
  _collectTeamUserIds(team, ...extraUserIds) {
    const ids = new Set();
    const addId = (raw) => {
      if (!raw) return;
      const val = typeof raw === 'object' ? (raw._id || raw.id) : raw;
      if (val) ids.add(String(val));
    };

    if (team) {
      addId(team.leaderId);
      if (Array.isArray(team.members)) {
        team.members.forEach((m) => addId(m?.rescuerId));
      }
    }
    extraUserIds.forEach(addId);
    return Array.from(ids);
  }

  /**
   * Phát sự kiện realtime Socket.IO & SSE (eventBus) đồng bộ thay đổi Đội cứu hộ cho Web và Mobile App
   */
  _emitTeamRealtimeUpdate(
    team,
    {
      action = 'TEAM_UPDATED',
      targetUserIds = [],
      primaryUserId = null,
      membershipStatus = 'UPDATED',
      extraPayload = {},
    } = {}
  ) {
    try {
      const { getIO } = require('../socket');
      const eventBus = require('./eventBus');
      const io = getIO();

      const teamIdStr = team?._id ? String(team._id) : '';
      const teamName = team?.name || '';
      const leaderIdStr = team?.leaderId
        ? String(team.leaderId._id || team.leaderId)
        : null;
      const primaryStr = primaryUserId ? String(primaryUserId) : null;
      const uniqueUserIds = Array.from(
        new Set((targetUserIds || []).filter(Boolean).map((id) => String(id)))
      );

      if (io && teamIdStr) {
        io.emit('rescue_teams_updated', {
          teamId: teamIdStr,
          teamName,
          action,
          status: team?.status,
          leaderId: leaderIdStr,
          rescuerId: primaryStr,
          ...extraPayload,
        });

        uniqueUserIds.forEach((uid) => {
          const userStatus = primaryStr && uid === primaryStr ? membershipStatus : 'UPDATED';
          io.to(`user_${uid}`).emit('team:membership_updated', {
            teamId: teamIdStr,
            teamName,
            action,
            status: userStatus,
            teamStatus: team?.status,
            leaderId: leaderIdStr,
            ...extraPayload,
          });
        });
      }

      if (teamIdStr) {
        uniqueUserIds.forEach((uid) => {
          const userStatus = primaryStr && uid === primaryStr ? membershipStatus : 'UPDATED';
          eventBus.emit('notification_event', {
            action: 'USER',
            userId: uid,
            data: {
              type: 'TEAM_MEMBERSHIP_CHANGED',
              teamId: teamIdStr,
              teamName,
              teamAction: action,
              status: userStatus,
              teamStatus: team?.status,
              leaderId: leaderIdStr,
              ...extraPayload,
              timestamp: Date.now(),
            },
          });
        });
      }
    } catch (err) {
      console.warn('Realtime emit error in RescueTeamService:', err.message);
    }
  }

  /**
   * Kiểm tra xem một người dùng (cứu hộ viên) đã thuộc biên chế chính thức của một Đội cứu hộ nào chưa
   * (Đang là Leader hoặc là thành viên có status APPROVED)
   * @param {string|ObjectId} userId - Mã người dùng (Cứu hộ viên)
   * @param {string|ObjectId} [excludeTeamId] - Mã đội cần loại trừ (khi cập nhật trong chính đội đó)
   * @returns {Promise<RescueTeam|null>} - Trả về Đội mà người này đang trực thuộc nếu có
   */
  async findActiveTeamOfUser(userId, excludeTeamId = null) {
    if (!userId) return null;
    const mongoose = require('mongoose');
    const uid = typeof userId === 'object' && userId._id ? userId._id : userId;
    const userObjId = mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : uid;

    const filter = {
      $or: [
        { leaderId: userObjId },
        {
          members: {
            $elemMatch: {
              rescuerId: userObjId,
              status: { $in: ['APPROVED', undefined, null] },
            },
          },
        },
      ],
    };

    if (excludeTeamId) {
      const excludeObjId = mongoose.Types.ObjectId.isValid(excludeTeamId)
        ? new mongoose.Types.ObjectId(excludeTeamId)
        : excludeTeamId;
      filter._id = { $ne: excludeObjId };
    }

    return RescueTeam.findOne(filter).select('_id name leaderId members status');
  }

  /**
   * Tạo Đội Cứu Hộ mới
   */
  async createTeam(data) {
    const { name, type, leaderId, authorityId, areaId, description, members = [] } = data;

    // Kiểm tra Leader
    const leader = await User.findById(leaderId);
    if (!leader) {
      throw new ApiError(404, 'Không tìm thấy thông tin Đội trưởng (leaderId)');
    }
    if (!leader.roles.includes('RESCUER')) {
      throw new ApiError(400, 'Người được chọn làm Đội trưởng phải có vai trò RESCUER');
    }

    // Kiểm tra Đội trưởng đã thuộc đội khác hay chưa (Quy tắc: 1 User - 1 Đội)
    const existingLeaderTeam = await this.findActiveTeamOfUser(leaderId);
    if (existingLeaderTeam) {
      throw new ApiError(
        400,
        `Cứu hộ viên "${leader.fullName || leader.phone}" hiện đã thuộc biên chế của đội "${existingLeaderTeam.name}". Mỗi người chỉ được tham gia 1 đội cứu hộ duy nhất.`
      );
    }

    // Kiểm tra Cơ quan quản lý
    const authority = await AuthorityOrganization.findById(authorityId);
    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy Cơ quan quản lý (authorityId)');
    }

    // Kiểm tra Khu vực hành chính
    const area = await AdministrativeArea.findById(areaId);
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy Khu vực hoạt động (areaId)');
    }

    // Chuẩn hóa danh sách thành viên: Luôn đảm bảo leaderId có trong danh sách với role LEADER
    const memberMap = new Map();
    memberMap.set(leaderId.toString(), {
      rescuerId: leaderId,
      role: 'LEADER',
      status: 'APPROVED',
      joinedAt: new Date(),
    });

    if (Array.isArray(members)) {
      for (const m of members) {
        const rId = (m.rescuerId || m).toString();
        if (rId !== leaderId.toString() && !memberMap.has(rId)) {
          const rescuerUser = await User.findById(rId);
          if (rescuerUser && rescuerUser.roles.includes('RESCUER')) {
            const memberExistingTeam = await this.findActiveTeamOfUser(rId);
            if (memberExistingTeam) {
              throw new ApiError(
                400,
                `Thành viên "${rescuerUser.fullName || rescuerUser.phone}" hiện đã thuộc biên chế của đội "${memberExistingTeam.name}". Mỗi người chỉ được thuộc 1 đội duy nhất.`
              );
            }
            memberMap.set(rId, {
              rescuerId: rId,
              role: m.role || 'MEMBER',
              status: m.status || 'APPROVED',
              joinedAt: m.joinedAt || new Date(),
            });
          }
        }
      }
    }

    const team = await RescueTeam.create({
      name,
      type: type || 'WATER_RESCUE',
      leaderId,
      authorityId,
      areaId,
      description,
      members: Array.from(memberMap.values()),
    });

    this._emitTeamRealtimeUpdate(team, {
      action: 'TEAM_CREATED',
      targetUserIds: this._collectTeamUserIds(team),
    });

    return team.populate([
      { path: 'leaderId', select: 'fullName phone email rescuer' },
      { path: 'authorityId', select: 'name code phone type' },
      {
        path: 'areaId',
        select: 'name code type parentId',
        populate: { path: 'parentId', select: 'name code type' },
      },
    ]);
  }

  /**
   * Chuẩn hóa và đính kèm phương tiện, trang thiết bị, nhiệm vụ và nhật ký hoạt động cho danh sách đội
   */
  async _attachTeamDetails(teams = []) {
    if (!Array.isArray(teams) || teams.length === 0) return [];

    const teamIds = teams.map((t) => t._id);
    const { Equipment, SosAssignment, AuditLog } = require('../models');

    const [vehicles, equipments, teamAssignments, teamAuditLogs] = await Promise.all([
      Vehicle.find({ teamId: { $in: teamIds } }),
      Equipment.find({ teamId: { $in: teamIds } }),
      SosAssignment.find({
        $or: [
          { rescueTeamId: { $in: teamIds } },
          { teamId: { $in: teamIds } },
        ],
      })
        .populate('sosRequestId', 'sosCode emergencyType people address status description')
        .populate('rescuerId', 'fullName phone')
        .populate('vehicleId', 'plateNumber type')
        .sort({ assignedAt: -1, createdAt: -1 })
        .limit(Math.max(50, teamIds.length * 25))
        .lean(),
      AuditLog.find({
        entityType: 'RescueTeam',
        entityId: { $in: teamIds },
      })
        .populate('actorId', 'fullName roles')
        .sort({ createdAt: -1 })
        .limit(Math.max(50, teamIds.length * 25))
        .lean(),
    ]);

    const vehicleMap = {};
    vehicles.forEach((v) => {
      if (!v.teamId) return;
      const tId = v.teamId.toString();
      if (!vehicleMap[tId]) vehicleMap[tId] = [];
      vehicleMap[tId].push(v);
    });

    const equipmentMap = {};
    equipments.forEach((e) => {
      if (!e.teamId) return;
      const tId = e.teamId.toString();
      if (!equipmentMap[tId]) equipmentMap[tId] = [];
      equipmentMap[tId].push(e);
    });

    const assignmentMap = {};
    teamAssignments.forEach((a) => {
      const tId = (a.rescueTeamId || a.teamId)?.toString();
      if (!tId) return;
      if (!assignmentMap[tId]) assignmentMap[tId] = [];
      const sos = a.sosRequestId && typeof a.sosRequestId === 'object' ? a.sosRequestId : null;
      const sosCode =
        a.dispatchCode ||
        sos?.sosCode ||
        (a.missionType === 'RELIEF_DISPATCH'
          ? 'Điều phối tiếp tế'
          : a.missionType === 'SHORE_HANDOFF'
            ? 'Tiếp vận đón bờ'
            : `SOS #${String(sos?._id || a.sosRequestId || a._id).slice(-4)}`);
      assignmentMap[tId].push({
        _id: a._id,
        id: String(a._id),
        sosRequestId: sos?._id || a.sosRequestId || null,
        sosCode,
        location: a.destination || sos?.address || '',
        status: a.status || 'PENDING',
        priority: a.priority || 'MEDIUM',
        assignedAt: a.assignedAt || a.createdAt || null,
        completedAt: a.completedAt || null,
        cancelledAt: a.cancelledAt || null,
        missionType:
          a.missionType === 'RELIEF_DISPATCH'
            ? 'Xuất cấp cứu trợ'
            : a.missionType === 'SHORE_HANDOFF'
              ? 'Tiếp vận đón bờ'
              : sos?.emergencyType || 'Cứu hộ SOS',
        description: a.note || sos?.description || (a.recipientName ? `Người nhận: ${a.recipientName}` : ''),
        note: a.note || '',
        peopleCount: sos?.people ?? 0,
        rescuerName: a.rescuerId?.fullName || null,
        vehiclePlate: a.vehicleId?.plateNumber || null,
      });
    });

    const AUDIT_ACTION_LABELS = {
      CREATE_RESCUE_TEAM: 'Thành lập đội cứu hộ',
      UPDATE_RESCUE_TEAM: 'Cập nhật thông tin / trạng thái đội',
      DELETE_RESCUE_TEAM: 'Giải thể đội cứu hộ',
      TEAM_ADD_MEMBER: 'Kết nạp / Ứng tuyển thành viên',
      TEAM_UPDATE_MEMBER_STATUS: 'Phê duyệt / Từ chối thành viên',
      TEAM_REMOVE_MEMBER: 'Loại thành viên khỏi biên chế',
      TEAM_CHANGE_LEADER: 'Chuyển giao quyền Đội trưởng',
    };

    const auditMap = {};
    teamAuditLogs.forEach((log) => {
      if (!log.entityId) return;
      const tId = String(log.entityId);
      if (!auditMap[tId]) auditMap[tId] = [];
      const meta = log.metadata || {};
      let detail = '';
      if (log.action === 'UPDATE_RESCUE_TEAM' && Array.isArray(meta.updatedFields)) {
        detail = `Trường cập nhật: ${meta.updatedFields.join(', ')}`;
      } else if (log.action === 'TEAM_UPDATE_MEMBER_STATUS' && meta.status) {
        detail = meta.status === 'APPROVED' ? 'Đã phê duyệt gia nhập đội' : 'Đã từ chối đơn gia nhập đội';
      } else if (meta.teamName) {
        detail = `Đội: ${meta.teamName}`;
      }
      auditMap[tId].push({
        id: String(log._id),
        action: AUDIT_ACTION_LABELS[log.action] || log.action,
        actor: log.actorId?.fullName || log.actorRole || 'Hệ thống',
        detail,
        createdAt: log.createdAt,
        _sortTime: log.createdAt ? new Date(log.createdAt).getTime() : 0,
      });
    });

    return teams.map((team) => {
      const obj = team.toObject ? team.toObject() : { ...team };
      const tId = team._id.toString();
      const allTeamAssignments = assignmentMap[tId] || [];
      const teamActiveAssignments = allTeamAssignments.filter(
        (a) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(a.status)
      );
      const firstActive = teamActiveAssignments[0];

      const assignmentLogs = allTeamAssignments.map((a) => ({
        id: `assign-${a.id}`,
        action:
          a.status === 'COMPLETED'
            ? `Hoàn thành nhiệm vụ ${a.sosCode}`
            : a.status === 'CANCELLED' || a.status === 'REJECTED'
              ? `Hủy/Từ chối nhiệm vụ ${a.sosCode}`
              : `Tiếp nhận nhiệm vụ ${a.sosCode}`,
        actor: a.rescuerName || 'Ban chỉ huy điều phối',
        detail: [a.missionType, a.location].filter(Boolean).join(' • '),
        createdAt: a.completedAt || a.cancelledAt || a.assignedAt,
        _sortTime: (a.completedAt || a.cancelledAt || a.assignedAt)
          ? new Date(a.completedAt || a.cancelledAt || a.assignedAt).getTime()
          : 0,
      }));

      const mergedLogs = [...(auditMap[tId] || []), ...assignmentLogs]
        .sort((x, y) => y._sortTime - x._sortTime)
        .slice(0, 30)
        .map(({ _sortTime, ...rest }) => rest);

      obj.vehicles = vehicleMap[tId] || [];
      obj.equipments = equipmentMap[tId] || [];
      obj.assignments = allTeamAssignments;
      obj.activityLogs = mergedLogs;
      obj.activeMissionCount = teamActiveAssignments.length;
      obj.hasActiveMission = teamActiveAssignments.length > 0 || obj.operationalStatus === 'ON_MISSION';
      obj.activeMissionCode = firstActive?.sosCode || null;
      return obj;
    });
  }

  /**
   * Lấy danh sách Đội cứu hộ (kèm bộ lọc & phân trang)
   */
  async getTeams(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.authorityId) filter.authorityId = query.authorityId;
    if (query.search) {
      filter.name = { $regex: query.search.trim(), $options: 'i' };
    }

    if (query.areaId && query.areaId !== 'ALL') {
      const mongoose = require('mongoose');
      let targetArea = null;
      if (mongoose.Types.ObjectId.isValid(query.areaId)) {
        targetArea = await AdministrativeArea.findById(query.areaId);
      }
      if (!targetArea) {
        targetArea = await AdministrativeArea.findOne({
          $or: [{ code: query.areaId }, { name: new RegExp(query.areaId, 'i') }],
        });
      }

      if (targetArea) {
        const relevantAreaIds = [targetArea._id];
        // Nếu là Quận/Huyện: bao gồm tất cả các Phường/Xã trực thuộc
        const childWards = await AdministrativeArea.find({ parentId: targetArea._id }).select('_id');
        childWards.forEach((w) => relevantAreaIds.push(w._id));

        // Nếu là Phường/Xã: bao gồm Quận/Huyện cấp trên
        if (targetArea.parentId) {
          relevantAreaIds.push(targetArea.parentId);
        }

        const cleanName = (targetArea.name || '')
          .replace(/^(phường|xã|quận|huyện|thành phố|thị xã)\s+/i, '')
          .trim();

        const areaConditions = [{ areaId: { $in: relevantAreaIds } }];
        if (cleanName.length >= 3) {
          areaConditions.push({ name: new RegExp(cleanName, 'i') });
        }

        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: areaConditions }];
          delete filter.$or;
        } else {
          filter.$or = areaConditions;
        }
      } else {
        filter.areaId = query.areaId;
      }
    }

    const [teams, total] = await Promise.all([
      RescueTeam.find(filter)
        .populate('leaderId', 'fullName phone email rescuer status currentLocation')
        .populate('authorityId', 'name code phone type')
        .populate({
          path: 'areaId',
          select: 'name code type parentId',
          populate: { path: 'parentId', select: 'name code type' },
        })
        .populate({
          path: 'members.rescuerId',
          select: 'fullName phone email avatarUrl rescuer status isVerified currentLocation',
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      RescueTeam.countDocuments(filter),
    ]);

    const enrichedTeams = await this._attachTeamDetails(teams);

    return {
      teams: enrichedTeams,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Xem chi tiết 1 Đội Cứu Hộ (kèm danh sách thành viên, phương tiện, trang thiết bị, nhiệm vụ & nhật ký)
   */
  async getTeamById(id) {
    const team = await RescueTeam.findById(id)
      .populate('leaderId', 'fullName phone email rescuer currentLocation')
      .populate('authorityId', 'name code phone address')
      .populate({
        path: 'areaId',
        select: 'name code type level parentId',
        populate: { path: 'parentId', select: 'name code type' },
      })
      .populate({
        path: 'members.rescuerId',
        select: 'fullName phone email avatarUrl rescuer currentLocation',
      });

    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ này');
    }

    const [enrichedTeam] = await this._attachTeamDetails([team]);
    return enrichedTeam;
  }

  /**
   * Cập nhật thông tin Đội Cứu Hộ
   */
  async updateTeam(id, updateData) {
    const team = await RescueTeam.findById(id);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ cần cập nhật');
    }

    if (updateData.name !== undefined) team.name = updateData.name.trim();
    if (updateData.type !== undefined) team.type = updateData.type;
    if (updateData.description !== undefined) team.description = updateData.description;
    if (updateData.phone !== undefined) team.phone = updateData.phone;
    if (updateData.headquartersAddress !== undefined) team.headquartersAddress = updateData.headquartersAddress;
    if (updateData.status !== undefined) {
      team.status = updateData.status;
      team.autoDeactivatedByLeaderSos = false;
      team.autoDeactivatedSosIds = [];
    }
    if (updateData.operationalStatus !== undefined) {
      team.operationalStatus = updateData.operationalStatus;
      team.autoDeactivatedByLeaderSos = false;
      team.autoDeactivatedSosIds = [];
      if (updateData.operationalStatus === 'INACTIVE') {
        team.status = 'INACTIVE';
      } else {
        team.status = 'ACTIVE';
      }
    }

    if (updateData.areaId) {
      const area = await AdministrativeArea.findById(updateData.areaId);
      if (!area) throw new ApiError(404, 'Khu vực hoạt động mới (areaId) không tồn tại');
      team.areaId = updateData.areaId;
    }

    if (updateData.authorityId) {
      const authority = await AuthorityOrganization.findById(updateData.authorityId);
      if (!authority) throw new ApiError(404, 'Cơ quan quản lý mới (authorityId) không tồn tại');
      team.authorityId = updateData.authorityId;
    }

    if (updateData.leaderId && updateData.leaderId !== String(team.leaderId?._id || team.leaderId)) {
      await this.changeLeader(id, updateData.leaderId);
    } else {
      await team.save();
    }

    // Thông báo & realtime socket khi cập nhật đội
    try {
      const { Notification } = require('../models');
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('rescue_teams_updated', {
          teamId: team._id.toString(),
          action: 'TEAM_UPDATED',
          status: team.status,
        });
      }

      if (updateData.status && team.leaderId) {
        const leaderUserId = team.leaderId._id || team.leaderId;
        await Notification.create({
          userId: leaderUserId,
          type: 'SYSTEM',
          title: team.status === 'ACTIVE'
            ? '🎉 Đội cứu hộ của bạn đã được phê duyệt!'
            : team.status === 'INACTIVE' || team.status === 'SUSPENDED'
            ? `Thông báo: Đội cứu hộ đã chuyển trạng thái ${team.status}`
            : `Cập nhật trạng thái Đội cứu hộ: ${team.status}`,
          content: team.status === 'ACTIVE'
            ? `Ban chỉ huy địa phương đã phê duyệt Đội cứu hộ "${team.name}". Đội hiện đã sẵn sàng nhận lệnh điều phối.`
            : `Đội cứu hộ "${team.name}" đã được chuyển sang trạng thái ${team.status}.`,
          priority: 'HIGH',
          isRead: false,
          data: {
            type: 'TEAM_STATUS_UPDATE',
            teamId: team._id.toString(),
            status: team.status,
          },
        });
      }
    } catch (notifErr) {
      console.warn('Notification/Socket error in updateTeam:', notifErr.message);
    }

    return team.populate([
      { path: 'leaderId', select: 'fullName phone email' },
      { path: 'authorityId', select: 'name code' },
      { path: 'areaId', select: 'name code' },
    ]);
  }

  /**
   * Xóa Đội Cứu Hộ
   */
  async deleteTeam(id) {
    const team = await RescueTeam.findById(id);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ cần xóa');
    }

    const affectedUserIds = this._collectTeamUserIds(team);

    // Tự động thu hồi phương tiện của đội về kho dự trữ chung (teamId: null)
    await Vehicle.updateMany({ teamId: id }, { $set: { teamId: null } });

    await RescueTeam.findByIdAndDelete(id);

    this._emitTeamRealtimeUpdate(team, {
      action: 'TEAM_DELETED',
      targetUserIds: affectedUserIds,
      membershipStatus: 'REMOVED',
      extraPayload: { teamStatus: 'INACTIVE', isTeamDeleted: true },
    });

    return { message: 'Đã xóa đội cứu hộ thành công' };
  }

  /**
   * Thêm / Ứng tuyển thành viên cứu hộ vào Đội
   * - Nếu do Leader của đội hoặc Authority/Admin thêm: status = 'APPROVED'
   * - Nếu cứu hộ viên tự ứng tuyển: status = 'PENDING' (cần xác nhận của leader hoặc authority)
   */
  async addMember(teamId, rescuerId, role = 'MEMBER', actor = null) {
    const [team, rescuer] = await Promise.all([
      RescueTeam.findById(teamId),
      User.findById(rescuerId),
    ]);

    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ');
    }
    if (!rescuer) {
      throw new ApiError(404, 'Không tìm thấy thông tin cứu hộ viên (rescuerId)');
    }
    if (!rescuer.roles.includes('RESCUER')) {
      throw new ApiError(400, 'Tài khoản này không có vai trò RESCUER');
    }

    // Kiểm tra xem Cứu hộ viên đã thuộc biên chế chính thức của một Đội khác hay chưa (Quy tắc: 1 User - 1 Đội)
    const existingActiveTeam = await this.findActiveTeamOfUser(rescuerId, teamId);
    if (existingActiveTeam) {
      const isLeader = existingActiveTeam.leaderId && existingActiveTeam.leaderId.toString() === rescuerId.toString();
      throw new ApiError(
        400,
        `Cứu hộ viên "${rescuer.fullName || rescuer.phone}" hiện đã là ${isLeader ? 'Đội trưởng' : 'thành viên chính thức'} của "${existingActiveTeam.name}". Mỗi người chỉ được tham gia 1 đội cứu hộ duy nhất.`
      );
    }

    // Kiểm tra xem đã có đơn PENDING ở đội khác chưa (chỉ cho phép 1 đơn ứng tuyển cùng thời điểm)
    const existingPendingTeam = await RescueTeam.findOne({
      _id: { $ne: teamId },
      members: { $elemMatch: { rescuerId, status: 'PENDING' } },
    });
    if (existingPendingTeam) {
      throw new ApiError(
        400,
        `Bạn đang có một đơn ứng tuyển chờ xét duyệt tại "${existingPendingTeam.name}". Vui lòng chờ phản hồi hoặc hủy đơn cũ trước khi ứng tuyển đội mới.`
      );
    }

    // Kiểm tra xem đã có trong danh sách thành viên hay chưa
    const existingMember = team.members.find(
      m => m.rescuerId.toString() === rescuerId.toString()
    );

    if (existingMember) {
      if (existingMember.status === 'PENDING') {
        throw new ApiError(400, 'Bạn đã nộp đơn ứng tuyển vào đội này và đang chờ xét duyệt');
      }
      if (existingMember.status === 'APPROVED' || !existingMember.status) {
        throw new ApiError(409, 'Cứu hộ viên này đã có trong danh sách thành viên chính thức của đội');
      }
      // Nếu trạng thái trước đó bị REJECTED, cho phép nộp đơn lại
      existingMember.status = 'PENDING';
      existingMember.role = 'MEMBER';
      existingMember.joinedAt = new Date();
      existingMember.approvedAt = null;
      existingMember.approvedBy = null;
      await team.save();

      return team.populate({
        path: 'members.rescuerId',
        select: 'fullName phone email avatarUrl rescuer status isVerified',
      });
    }

    // Xác định quyền hạn của người gọi API:
    // Nếu là ADMIN, LOCAL_AUTHORITY hoặc chính Leader của đội đó thêm thì trực tiếp APPROVED
    const actorRoles = actor?.roles || [];
    const isAuthorityOrAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('LOCAL_AUTHORITY');
    const isTeamLeader = team.leaderId && actor && team.leaderId.toString() === actor._id.toString();

    const isDirectApproval = isAuthorityOrAdmin || isTeamLeader;
    const finalStatus = isDirectApproval ? 'APPROVED' : 'PENDING';

    // Nếu đội đã có Đội trưởng, thành viên mới kết nạp luôn mặc định là MEMBER
    const effectiveRole = team.leaderId ? 'MEMBER' : (role === 'LEADER' ? 'LEADER' : 'MEMBER');
    if (!team.leaderId && role === 'LEADER') {
      team.leaderId = rescuerId;
    }

    team.members.push({
      rescuerId,
      role: effectiveRole,
      status: finalStatus,
      joinedAt: new Date(),
      approvedAt: finalStatus === 'APPROVED' ? new Date() : null,
      approvedBy: finalStatus === 'APPROVED' && actor ? actor._id : null,
    });

    await team.save();

    // Thông báo & realtime socket
    try {
      const { Notification } = require('../models');
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.to(`user_${rescuerId}`).emit('team:membership_updated', {
          teamId: team._id.toString(),
          teamName: team.name,
          status: finalStatus,
        });
        io.emit('rescue_teams_updated', { teamId: team._id.toString(), action: 'MEMBER_STATUS_CHANGED', rescuerId, status: finalStatus });
      }

      await Notification.create({
        userId: rescuerId,
        type: 'SYSTEM',
        title: finalStatus === 'APPROVED' ? '🎉 Đơn gia nhập Đội cứu hộ đã được duyệt!' : 'Đã ghi nhận đơn ứng tuyển Đội cứu hộ ⏳',
        content: finalStatus === 'APPROVED'
          ? `Chúc mừng bạn! Bạn đã được Ban chỉ huy địa phương phê duyệt gia nhập "${team.name}".`
          : `Đơn ứng tuyển tham gia "${team.name}" của bạn đã được gửi thành công. Vui lòng chờ Ban chỉ huy địa phương xem xét phê duyệt.`,
        priority: 'HIGH',
        isRead: false,
        data: {
          type: 'TEAM_MEMBERSHIP',
          teamId: team._id.toString(),
          status: finalStatus,
        },
      });
    } catch (notifErr) {
      console.warn('Notification/Socket error in updateMemberStatus:', notifErr.message);
    }

    return team.populate({
      path: 'members.rescuerId',
      select: 'fullName phone email avatarUrl rescuer status isVerified',
    });
  }

  /**
   * Phê duyệt hoặc Từ chối đơn ứng tuyển của cứu hộ viên
   */
  async updateMemberStatus(teamId, rescuerId, status, actor) {
    const team = await RescueTeam.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ');
    }

    // Phải là Leader của đội, hoặc LOCAL_AUTHORITY, hoặc ADMIN
    const actorRoles = actor?.roles || [];
    const isAuthorityOrAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('LOCAL_AUTHORITY') || actorRoles.includes('AUTHORITY') || Boolean(actor?.authority);
    const isTeamLeader = team.leaderId && actor && team.leaderId.toString() === actor._id.toString();

    if (!isAuthorityOrAdmin && !isTeamLeader) {
      throw new ApiError(403, 'Chỉ Đội trưởng hoặc Cơ quan quản lý mới có quyền phê duyệt thành viên');
    }

    const member = team.members.find(
      m => (m.rescuerId?._id || m.rescuerId || '').toString() === rescuerId.toString() ||
           (m._id || '').toString() === rescuerId.toString()
    );

    if (!member) {
      throw new ApiError(404, 'Không tìm thấy thông tin đơn ứng tuyển của cứu hộ viên này trong đội');
    }

    if (status === 'APPROVED') {
      // Kiểm tra xem cứu hộ viên này có đang thuộc đội nào khác hay không
      const targetRescuerId = (member.rescuerId?._id || member.rescuerId).toString();
      const existingTeam = await this.findActiveTeamOfUser(targetRescuerId, teamId);
      if (existingTeam) {
        throw new ApiError(
          400,
          `Không thể phê duyệt: Cứu hộ viên này hiện đã thuộc biên chế chính thức của đội "${existingTeam.name}". Mỗi người chỉ được thuộc 1 đội duy nhất.`
        );
      }

      member.status = 'APPROVED';
      member.approvedAt = new Date();
      member.approvedBy = actor?._id || null;

      // Tự động dọn dẹp các đơn PENDING ở các đội khác nếu có
      await RescueTeam.updateMany(
        { _id: { $ne: team._id } },
        { $pull: { members: { rescuerId: targetRescuerId, status: 'PENDING' } } }
      );
    } else if (status === 'REJECTED') {
      // Xóa khỏi danh sách thành viên
      team.members = team.members.filter(
        m => (m.rescuerId?._id || m.rescuerId || '').toString() !== rescuerId.toString() &&
             (m._id || '').toString() !== rescuerId.toString()
      );
    } else {
      throw new ApiError(400, 'Trạng thái xét duyệt không hợp lệ');
    }

    await team.save();

    // Thông báo & realtime socket khi duyệt/từ chối thành viên
    try {
      const { Notification } = require('../models');
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.to(`user_${rescuerId}`).emit('team:membership_updated', {
          teamId: team._id.toString(),
          teamName: team.name,
          status,
        });
        io.emit('rescue_teams_updated', { teamId: team._id.toString(), action: 'MEMBER_STATUS_CHANGED', rescuerId, status });
      }

      await Notification.create({
        userId: rescuerId,
        type: 'SYSTEM',
        title: status === 'APPROVED' ? '🎉 Đơn gia nhập Đội cứu hộ đã được duyệt!' : 'Thông báo kết quả ứng tuyển Đội cứu hộ',
        content: status === 'APPROVED'
          ? `Chúc mừng bạn! Bạn đã được Ban chỉ huy địa phương phê duyệt gia nhập "${team.name}".`
          : `Đơn ứng tuyển tham gia "${team.name}" của bạn đã không được chấp thuận.`,
        priority: 'HIGH',
        isRead: false,
        data: {
          type: 'TEAM_MEMBERSHIP',
          teamId: team._id.toString(),
          status,
        },
      });

      try {
        const eventBus = require('./eventBus');
        eventBus.emit('notification_event', {
          action: 'USER',
          userId: rescuerId.toString(),
          data: {
            type: 'TEAM_MEMBERSHIP_CHANGED',
            teamId: team._id.toString(),
            teamName: team.name,
            status,
            timestamp: Date.now(),
          },
        });
      } catch (busErr) {
        console.warn('eventBus emit error in updateMemberStatus:', busErr.message);
      }
    } catch (notifErr) {
      console.warn('Notification/Socket error in updateMemberStatus:', notifErr.message);
    }

    return team.populate({
      path: 'members.rescuerId',
      select: 'fullName phone email avatarUrl rescuer status isVerified',
    });
  }

  /**
   * Xóa thành viên khỏi Đội
   */
  async removeMember(teamId, rescuerId) {
    const team = await RescueTeam.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ');
    }

    const currentLeaderId = team.leaderId ? (team.leaderId._id || team.leaderId).toString() : null;
    const targetRescuerId = rescuerId.toString();
    const isCurrentLeader = currentLeaderId && currentLeaderId === targetRescuerId;
    const affectedUserIds = this._collectTeamUserIds(team, targetRescuerId);

    if (isCurrentLeader) {
      // Lấy danh sách các thành viên khác ngoài Đội trưởng
      const otherMembers = team.members.filter(
        m => (m.rescuerId?._id || m.rescuerId || '').toString() !== targetRescuerId
      );

      // Trường hợp đội còn thành viên khác thì bắt buộc chuyển giao
      if (otherMembers.length > 0) {
        throw new ApiError(
          400,
          'Cán bộ này hiện đang là Đội trưởng. Để xóa khỏi đội, vui lòng bổ nhiệm một thành viên khác làm Đội trưởng trước.'
        );
      }

      // Trường hợp đội chỉ có DUY NHẤT Đội trưởng:
      // Chuyển trạng thái đội sang INACTIVE (Tạm dừng hoạt động) và cho phép rời
      team.status = 'INACTIVE';
      team.leaderId = null;
      team.members = [];
      await team.save();

      this._emitTeamRealtimeUpdate(team, {
        action: 'LEADER_LEFT_TEAM_INACTIVE',
        targetUserIds: affectedUserIds,
        primaryUserId: targetRescuerId,
        membershipStatus: 'REMOVED',
        extraPayload: { teamStatus: 'INACTIVE', isLeaderLeft: true },
      });

      return team;
    }

    const initialLength = team.members.length;
    team.members = team.members.filter(
      m => (m.rescuerId?._id || m.rescuerId || '').toString() !== targetRescuerId
    );

    if (team.members.length === initialLength) {
      throw new ApiError(404, 'Cứu hộ viên này không có trong danh sách thành viên của đội');
    }

    await team.save();

    this._emitTeamRealtimeUpdate(team, {
      action: 'MEMBER_REMOVED',
      targetUserIds: affectedUserIds,
      primaryUserId: targetRescuerId,
      membershipStatus: 'REMOVED',
      extraPayload: { teamStatus: team.status },
    });

    return team.populate({
      path: 'members.rescuerId',
      select: 'fullName phone email avatarUrl rescuer',
    });
  }

  /**
   * Đổi Đội trưởng (Leader) của Đội
   */
  async changeLeader(teamId, newLeaderId) {
    const [team, newLeader] = await Promise.all([
      RescueTeam.findById(teamId),
      User.findById(newLeaderId),
    ]);

    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ');
    }
    if (!newLeader) {
      throw new ApiError(404, 'Không tìm thấy thông tin Đội trưởng mới');
    }
    if (!newLeader.roles.includes('RESCUER')) {
      throw new ApiError(400, 'Đội trưởng mới bắt buộc phải có vai trò RESCUER');
    }

    // Kiểm tra xem Đội trưởng mới có đang thuộc đội nào khác hay không
    const existingTeam = await this.findActiveTeamOfUser(newLeaderId, teamId);
    if (existingTeam) {
      throw new ApiError(
        400,
        `Cứu hộ viên "${newLeader.fullName || newLeader.phone}" hiện đã thuộc biên chế của "${existingTeam.name}". Mỗi người chỉ được làm chỉ huy hoặc thành viên của 1 đội duy nhất.`
      );
    }

    const oldLeaderId = team.leaderId ? (team.leaderId._id || team.leaderId).toString() : null;
    const newLeaderIdStr = newLeaderId.toString();
    team.leaderId = newLeaderId;

    // Cập nhật vai trò trong danh sách members
    let newLeaderFoundInMembers = false;
    team.members.forEach(m => {
      const currentRescuerId = (m.rescuerId?._id || m.rescuerId || '').toString();
      if (oldLeaderId && currentRescuerId === oldLeaderId) {
        m.role = 'MEMBER'; // Hạ role leader cũ xuống member
      }
      if (currentRescuerId === newLeaderIdStr) {
        m.role = 'LEADER';
        m.status = 'APPROVED';
        newLeaderFoundInMembers = true;
      }
    });

    // Nếu newLeader chưa có trong members thì tự động thêm vào với role LEADER
    if (!newLeaderFoundInMembers) {
      team.members.push({
        rescuerId: newLeaderId,
        role: 'LEADER',
        status: 'APPROVED',
        joinedAt: new Date(),
      });
    }

    await team.save();

    // Đồng bộ các phân công SOS đang mở từ Đội trưởng cũ sang Đội trưởng mới
    try {
      const { SosAssignment, Notification } = require('../models');
      const { getIO } = require('../socket');
      const assignmentFilter = {
        $or: [{ rescueTeamId: team._id }, { teamId: team._id }],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      };
      if (oldLeaderId) {
        await SosAssignment.updateMany(
          {
            ...assignmentFilter,
            $or: [{ rescuerId: oldLeaderId }, { rescuerId: null }, { rescuerId: { $exists: false } }],
          },
          { $set: { rescuerId: newLeaderId } }
        );
      }

      const io = getIO();
      if (io) {
        if (oldLeaderId) io.to(`user_${oldLeaderId}`).emit('sos:sync');
        io.to(`user_${newLeaderIdStr}`).emit('sos:sync');
        io.emit('assignment:updated', {
          teamId: team._id.toString(),
          action: 'LEADER_CHANGED',
          newLeaderId: newLeaderIdStr,
        });
      }

      if (!oldLeaderId || oldLeaderId !== newLeaderIdStr) {
        await Notification.create({
          userId: newLeaderId,
          type: 'SYSTEM',
          title: '⭐ Bạn đã được bổ nhiệm làm Đội trưởng!',
          content: `Bạn hiện là Đội trưởng mới của đội "${team.name}" và có toàn quyền điều hành thành viên cũng như tiếp nhận lệnh cứu nạn.`,
          priority: 'HIGH',
          isRead: false,
          data: {
            type: 'TEAM_MEMBERSHIP',
            teamId: team._id.toString(),
            status: 'LEADER_PROMOTED',
          },
        });
      }
    } catch (syncErr) {
      console.warn('Assignment/Notification sync error in changeLeader:', syncErr.message);
    }

    const affectedUserIds = this._collectTeamUserIds(team, oldLeaderId, newLeaderIdStr);
    this._emitTeamRealtimeUpdate(team, {
      action: 'LEADER_CHANGED',
      targetUserIds: affectedUserIds,
      primaryUserId: newLeaderIdStr,
      membershipStatus: 'LEADER_PROMOTED',
      extraPayload: {
        oldLeaderId,
        newLeaderId: newLeaderIdStr,
        newLeaderName: newLeader.fullName || '',
        teamStatus: team.status,
      },
    });

    return team.populate([
      { path: 'leaderId', select: 'fullName phone email rescuer' },
      { path: 'members.rescuerId', select: 'fullName phone email rescuer' },
    ]);
  }

  /**
   * Khi Đội trưởng của một đội gửi yêu cầu SOS, tự động chuyển đội đó sang trạng thái
   * Không hoạt động (INACTIVE) để đội không hiện lên danh sách phân công và tránh điều nhầm.
   * Thành viên thường (không phải leaderId) gửi SOS sẽ KHÔNG kích hoạt hàm này để đội vẫn có thể đi cứu đồng đội.
   */
  async deactivateLeaderTeamsOnSos(citizenId, sos = null) {
    if (!citizenId) return [];
    const uid = typeof citizenId === 'object' && citizenId._id ? citizenId._id : citizenId;

    const leaderTeams = await RescueTeam.find({
      leaderId: uid,
      status: { $ne: 'SUSPENDED' },
      $or: [
        { status: 'ACTIVE' },
        { operationalStatus: { $ne: 'INACTIVE' } },
        { autoDeactivatedByLeaderSos: true },
      ],
    });

    if (!leaderTeams || leaderTeams.length === 0) return [];

    const updatedTeamIds = [];
    let io = null;
    try {
      const { getIO } = require('../socket');
      io = getIO();
    } catch (_) {}

    for (const team of leaderTeams) {
      const updateOps = {
        $set: {
          status: 'INACTIVE',
          operationalStatus: 'INACTIVE',
          autoDeactivatedByLeaderSos: true,
        },
      };
      if (sos?._id) {
        updateOps.$addToSet = { autoDeactivatedSosIds: sos._id };
      }
      await RescueTeam.updateOne({ _id: team._id }, updateOps);
      updatedTeamIds.push(team._id.toString());

      if (io) {
        io.emit('rescue_teams_updated', {
          teamId: team._id.toString(),
          action: 'LEADER_SOS_DEACTIVATED',
          status: 'INACTIVE',
          operationalStatus: 'INACTIVE',
          sosId: sos?._id ? String(sos._id) : null,
          sosCode: sos?.sosCode || null,
        });
      }
    }

    if (io && updatedTeamIds.length > 0) {
      io.emit('sos:sync');
    }

    return updatedTeamIds;
  }

  /**
   * Khi các yêu cầu SOS do Đội trưởng gửi đã đóng/hủy/xóa hết, tự động khôi phục
   * trạng thái hoạt động (ACTIVE / READY) cho đội từng bị tạm dừng do SOS của đội trưởng.
   */
  async restoreLeaderTeamsIfNoActiveSos(citizenId, closedSosId = null, options = {}) {
    if (!citizenId) return [];
    const uid = typeof citizenId === 'object' && citizenId._id ? citizenId._id : citizenId;

    const autoPausedTeams = await RescueTeam.find({
      leaderId: uid,
      autoDeactivatedByLeaderSos: true,
    });

    if (!autoPausedTeams || autoPausedTeams.length === 0) return [];

    const closedIds = (Array.isArray(closedSosId) ? closedSosId : closedSosId ? [closedSosId] : [])
      .map((v) => String(v))
      .filter(Boolean);
    const closedIdSet = new Set(closedIds);

    const { SosRequest, SosAssignment } = require('../models');
    const activeSosStatuses = ['PENDING', 'VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'];

    const restoredTeamIds = [];
    let io = null;
    try {
      const { getIO } = require('../socket');
      io = getIO();
    } catch (_) {}

    for (const team of autoPausedTeams) {
      const trackedIds = Array.isArray(team.autoDeactivatedSosIds)
        ? team.autoDeactivatedSosIds.map((v) => String(v))
        : [];
      const hadTracked = trackedIds.length > 0;
      const remainingTrackedIds = trackedIds.filter((idStr) => !closedIdSet.has(idStr));

      if (remainingTrackedIds.length > 0) {
        const stillOpenIds = await SosRequest.find({
          _id: { $in: remainingTrackedIds },
          status: { $in: activeSosStatuses },
        }).distinct('_id');

        if (stillOpenIds.length > 0) {
          await RescueTeam.updateOne(
            { _id: team._id },
            { $set: { autoDeactivatedSosIds: stillOpenIds } }
          );
          continue;
        }
      } else if (!hadTracked && !options.onlyIfNoTrackedSos && closedIdSet.size === 0) {
        const hasOpenLeaderSos = await SosRequest.exists({
          citizenId: uid,
          status: { $in: activeSosStatuses },
        });
        if (hasOpenLeaderSos) continue;
      }

      const hasOpenAssign = await SosAssignment.exists({
        $or: [{ rescueTeamId: team._id }, { teamId: team._id }],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      });
      const restoredOperationalStatus = hasOpenAssign ? 'ON_MISSION' : 'READY';
      await RescueTeam.updateOne(
        { _id: team._id },
        {
          $set: {
            status: 'ACTIVE',
            operationalStatus: restoredOperationalStatus,
            autoDeactivatedByLeaderSos: false,
            autoDeactivatedSosIds: [],
          },
        }
      );
      restoredTeamIds.push(team._id.toString());

      if (io) {
        io.emit('rescue_teams_updated', {
          teamId: team._id.toString(),
          action: 'LEADER_SOS_RESTORED',
          status: 'ACTIVE',
          operationalStatus: restoredOperationalStatus,
        });
      }
    }

    if (io && restoredTeamIds.length > 0) {
      io.emit('sos:sync');
    }

    return restoredTeamIds;
  }
}

module.exports = new RescueTeamService();

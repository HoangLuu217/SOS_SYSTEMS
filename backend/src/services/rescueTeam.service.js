const { RescueTeam, User, AuthorityOrganization, AdministrativeArea, Vehicle } = require('../models');
const ApiError = require('../utils/apiError');

class RescueTeamService {
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
      type: type || 'GENERAL_RESCUE',
      leaderId,
      authorityId,
      areaId,
      description,
      members: Array.from(memberMap.values()),
    });

    return team.populate([
      { path: 'leaderId', select: 'fullName phone email rescuer' },
      { path: 'authorityId', select: 'name code phone type' },
      { path: 'areaId', select: 'name code type' },
    ]);
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
        .populate('leaderId', 'fullName phone email rescuer status')
        .populate('authorityId', 'name code phone type')
        .populate('areaId', 'name code type')
        .populate({
          path: 'members.rescuerId',
          select: 'fullName phone email avatarUrl rescuer status isVerified',
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      RescueTeam.countDocuments(filter),
    ]);

    // Đính kèm các phương tiện & trang thiết bị do từng đội trực tiếp quản lý từ DB MongoDB
    const teamIds = teams.map((t) => t._id);
    const { Equipment } = require('../models');
    const [vehicles, equipments] = await Promise.all([
      Vehicle.find({ teamId: { $in: teamIds } }),
      Equipment.find({ teamId: { $in: teamIds } }),
    ]);

    const vehicleMap = {};
    vehicles.forEach((v) => {
      const tId = v.teamId.toString();
      if (!vehicleMap[tId]) vehicleMap[tId] = [];
      vehicleMap[tId].push(v);
    });

    const equipmentMap = {};
    equipments.forEach((e) => {
      if (e.teamId) {
        const tId = e.teamId.toString();
        if (!equipmentMap[tId]) equipmentMap[tId] = [];
        equipmentMap[tId].push(e);
      }
    });

    const enrichedTeams = teams.map((team) => {
      const obj = team.toObject ? team.toObject() : { ...team };
      obj.vehicles = vehicleMap[team._id.toString()] || [];
      obj.equipments = equipmentMap[team._id.toString()] || [];
      return obj;
    });

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
   * Xem chi tiết 1 Đội Cứu Hộ (kèm danh sách thành viên & phương tiện sở hữu)
   */
  async getTeamById(id) {
    const team = await RescueTeam.findById(id)
      .populate('leaderId', 'fullName phone email rescuer')
      .populate('authorityId', 'name code phone address')
      .populate('areaId', 'name code type level')
      .populate({
        path: 'members.rescuerId',
        select: 'fullName phone email avatarUrl rescuer',
      });

    if (!team) {
      throw new ApiError(404, 'Không tìm thấy Đội cứu hộ này');
    }

    // Lấy danh sách phương tiện & trang thiết bị trực thuộc đội từ DB MongoDB
    const { Equipment } = require('../models');
    const [vehicles, equipments] = await Promise.all([
      Vehicle.find({ teamId: id }),
      Equipment.find({ teamId: id }),
    ]);

    return {
      ...team.toObject(),
      vehicles,
      equipments,
    };
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
    if (updateData.status !== undefined) team.status = updateData.status;

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

    await team.save();

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

    // Tự động thu hồi phương tiện của đội về kho dự trữ chung (teamId: null)
    await Vehicle.updateMany({ teamId: id }, { $set: { teamId: null } });

    await RescueTeam.findByIdAndDelete(id);

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

    try {
      const { getIO } = require('../socket');
      const eventBus = require('./eventBus');
      const io = getIO();
      if (io) {
        io.to(`user_${rescuerId}`).emit('team:membership_updated', {
          teamId: team._id.toString(),
          teamName: team.name,
          status: 'REMOVED',
        });
        io.emit('rescue_teams_updated', { teamId: team._id.toString(), action: 'MEMBER_REMOVED', rescuerId });
      }
      eventBus.emit('notification_event', {
        action: 'USER',
        userId: rescuerId.toString(),
        data: {
          type: 'TEAM_MEMBERSHIP_CHANGED',
          teamId: team._id.toString(),
          teamName: team.name,
          status: 'REMOVED',
          timestamp: Date.now(),
        },
      });
    } catch (_) {}

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
    team.leaderId = newLeaderId;

    // Cập nhật vai trò trong danh sách members
    let newLeaderFoundInMembers = false;
    team.members.forEach(m => {
      const currentRescuerId = (m.rescuerId?._id || m.rescuerId || '').toString();
      if (oldLeaderId && currentRescuerId === oldLeaderId) {
        m.role = 'MEMBER'; // Hạ role leader cũ xuống member
      }
      if (currentRescuerId === newLeaderId.toString()) {
        m.role = 'LEADER';
        newLeaderFoundInMembers = true;
      }
    });

    // Nếu newLeader chưa có trong members thì tự động thêm vào với role LEADER
    if (!newLeaderFoundInMembers) {
      team.members.push({
        rescuerId: newLeaderId,
        role: 'LEADER',
        joinedAt: new Date(),
      });
    }

    await team.save();

    return team.populate([
      { path: 'leaderId', select: 'fullName phone email rescuer' },
      { path: 'members.rescuerId', select: 'fullName phone email rescuer' },
    ]);
  }
}

module.exports = new RescueTeamService();

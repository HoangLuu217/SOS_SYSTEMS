const { RescueTeam, User, AuthorityOrganization, AdministrativeArea, Vehicle } = require('../models');
const ApiError = require('../utils/apiError');

class RescueTeamService {
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
      joinedAt: new Date(),
    });

    if (Array.isArray(members)) {
      for (const m of members) {
        const rId = (m.rescuerId || m).toString();
        if (rId !== leaderId.toString() && !memberMap.has(rId)) {
          const rescuerUser = await User.findById(rId);
          if (rescuerUser && rescuerUser.roles.includes('RESCUER')) {
            memberMap.set(rId, {
              rescuerId: rId,
              role: m.role || 'MEMBER',
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

    // Đính kèm các phương tiện do từng đội trực tiếp quản lý
    const teamIds = teams.map((t) => t._id);
    const vehicles = await Vehicle.find({ teamId: { $in: teamIds } });
    const vehicleMap = {};
    vehicles.forEach((v) => {
      const tId = v.teamId.toString();
      if (!vehicleMap[tId]) vehicleMap[tId] = [];
      vehicleMap[tId].push(v);
    });

    const enrichedTeams = teams.map((team) => {
      const obj = team.toObject ? team.toObject() : { ...team };
      obj.vehicles = vehicleMap[team._id.toString()] || [];
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

    // Lấy danh sách phương tiện trực thuộc đội
    const vehicles = await Vehicle.find({ teamId: id });

    return {
      ...team.toObject(),
      vehicles,
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

    // Kiểm tra ràng buộc phương tiện
    const activeVehicles = await Vehicle.countDocuments({ teamId: id });
    if (activeVehicles > 0) {
      throw new ApiError(
        400,
        `Không thể xóa đội cứu hộ này vì đang có ${activeVehicles} phương tiện được gán trực thuộc!`
      );
    }

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

    team.members.push({
      rescuerId,
      role: role === 'LEADER' ? 'LEADER' : 'MEMBER',
      status: finalStatus,
      joinedAt: new Date(),
      approvedAt: finalStatus === 'APPROVED' ? new Date() : null,
      approvedBy: finalStatus === 'APPROVED' && actor ? actor._id : null,
    });

    await team.save();

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
    const isAuthorityOrAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('LOCAL_AUTHORITY');
    const isTeamLeader = team.leaderId && actor && team.leaderId.toString() === actor._id.toString();

    if (!isAuthorityOrAdmin && !isTeamLeader) {
      throw new ApiError(403, 'Chỉ Đội trưởng hoặc Cơ quan quản lý mới có quyền phê duyệt thành viên');
    }

    const member = team.members.find(
      m => (m.rescuerId?._id || m.rescuerId).toString() === rescuerId.toString()
    );

    if (!member) {
      throw new ApiError(404, 'Không tìm thấy thông tin đơn ứng tuyển của cứu hộ viên này trong đội');
    }

    if (status === 'APPROVED') {
      member.status = 'APPROVED';
      member.approvedAt = new Date();
      member.approvedBy = actor?._id || null;
    } else if (status === 'REJECTED') {
      // Xóa khỏi danh sách thành viên
      team.members = team.members.filter(
        m => (m.rescuerId?._id || m.rescuerId).toString() !== rescuerId.toString()
      );
    } else {
      throw new ApiError(400, 'Trạng thái xét duyệt không hợp lệ');
    }

    await team.save();

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

    const isCurrentLeader =
      team.leaderId && team.leaderId.toString() === rescuerId.toString();

    if (isCurrentLeader) {
      // Lấy danh sách các thành viên khác ngoài Đội trưởng
      const otherMembers = team.members.filter(
        m => m.rescuerId.toString() !== rescuerId.toString()
      );

      // Trường hợp đội còn thành viên khác thì bắt buộc chuyển giao
      if (otherMembers.length > 0) {
        throw new ApiError(
          400,
          'Bạn hiện đang là Đội trưởng của đội. Để rời đội, bạn cần chuyển giao chức vụ Đội trưởng cho một thành viên khác.'
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
      m => m.rescuerId.toString() !== rescuerId.toString()
    );

    if (team.members.length === initialLength) {
      throw new ApiError(404, 'Cứu hộ viên này không có trong danh sách thành viên của đội');
    }

    await team.save();

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

    const oldLeaderId = team.leaderId.toString();
    team.leaderId = newLeaderId;

    // Cập nhật vai trò trong danh sách members
    let newLeaderFoundInMembers = false;
    team.members.forEach(m => {
      const currentRescuerId = m.rescuerId.toString();
      if (currentRescuerId === oldLeaderId) {
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

const { Equipment, RescueTeam, AuthorityOrganization, AdministrativeArea, SosAssignment, SosRequest, User, Notification } = require('../models');
const ApiError = require('../utils/apiError');
const mongoose = require('mongoose');
const { sendExpoPushNotification } = require('../utils/expoPush');
const eventBus = require('./eventBus');

class EquipmentService {
  /**
   * Nhap kho vat tu moi cho doi cuu ho
   */
  async createEquipment(data) {
    const { teamId, providedBy, name, category, serialNumber, quantity, unit, note } = data;

    let validTeamId = null;
    if (teamId && teamId !== 'UNASSIGNED' && teamId !== 'null') {
      const team = await RescueTeam.findById(teamId);
      if (!team) throw new ApiError(404, 'Khong tim thay Doi cuu ho (teamId)');
      validTeamId = teamId;
    }

    if (providedBy) {
      const auth = await AuthorityOrganization.findById(providedBy);
      if (!auth) throw new ApiError(404, 'Khong tim thay Co quan cap phat (providedBy)');
    }

    // Kiem tra trung serial number neu co
    if (serialNumber) {
      const cleanSerial = String(serialNumber).trim().toUpperCase();
      const existing = await Equipment.findOne({ serialNumber: cleanSerial });
      if (existing) throw new ApiError(409, `So se-ri '${cleanSerial}' da ton tai trong he thong`);
    }

    const equipment = await Equipment.create({
      teamId: validTeamId,
      providedBy: providedBy || null,
      receivedAt: data.receivedAt || new Date(),
      name: String(name).trim(),
      category,
      supplyType: data.supplyType || 'DURABLE',
      minThreshold: data.minThreshold !== undefined ? Number(data.minThreshold) : 20,
      serialNumber: serialNumber ? String(serialNumber).trim().toUpperCase() : null,
      quantity: quantity !== undefined ? Number(quantity) : 1,
      unit: unit || 'cai',
      status: data.status || 'AVAILABLE',
      note: note || null,
    });

    return equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
  }

  /**
   * Lay danh sach vat tu (loc theo doi, khu vuc, danh muc, trang thai, supplyType)
   */
  async getEquipments(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.supplyType) {
      filter.supplyType = query.supplyType;
    }
    if (query.teamId) {
      if (query.teamId === 'UNASSIGNED' || query.teamId === 'null') {
        filter.teamId = null;
      } else {
        filter.teamId = query.teamId;
      }
    }
    if (query.providedBy) filter.providedBy = query.providedBy;
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.serialNumber) {
      filter.serialNumber = { $regex: query.serialNumber.trim(), $options: 'i' };
    }
    if (query.name) {
      filter.name = { $regex: query.name.trim(), $options: 'i' };
    }

    // Loc theo khu vuc (areaId) -> tim cac doi trong khu vuc do
    if (query.areaId && query.areaId !== 'ALL') {
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
        const childWards = await AdministrativeArea.find({ parentId: targetArea._id }).select('_id');
        childWards.forEach((w) => relevantAreaIds.push(w._id));
        if (targetArea.parentId) relevantAreaIds.push(targetArea.parentId);

        const cleanName = (targetArea.name || '')
          .replace(/^(phường|xã|quận|huyện|thành phố|thị xã)\s+/i, '')
          .trim();

        const areaConditions = [{ areaId: { $in: relevantAreaIds } }];
        if (cleanName.length >= 3) {
          areaConditions.push({ name: new RegExp(cleanName, 'i') });
        }

        const teamsInArea = await RescueTeam.find({ $or: areaConditions }).select('_id');
        const teamIds = teamsInArea.map((t) => t._id);
        if (!filter.teamId) {
          filter.$or = [
            { teamId: { $in: teamIds } },
            { teamId: null },
            { teamId: { $exists: false } },
          ];
        }
      }
    }

    const [equipments, total] = await Promise.all([
      Equipment.find(filter)
        .populate({ path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } })
        .populate({ path: 'providedBy', select: 'name shortName type' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Equipment.countDocuments(filter),
    ]);

    return {
      equipments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Lay chi tiet 1 vat tu
   */
  async getEquipmentById(id) {
    const equipment = await Equipment.findById(id)
      .populate({ path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } })
      .populate({ path: 'providedBy', select: 'name shortName type' });

    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu');
    return equipment;
  }

  /**
   * Cap nhat thong tin vat tu
   */
  async updateEquipment(id, updateData) {
    const equipment = await Equipment.findById(id);
    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu can cap nhat');

    const allowed = ['name', 'category', 'supplyType', 'quantity', 'unit', 'status', 'minThreshold', 'note', 'providedBy', 'receivedAt'];
    for (const key of allowed) {
      if (updateData[key] !== undefined) equipment[key] = updateData[key];
    }

    if (updateData.teamId !== undefined) {
      if (updateData.teamId && updateData.teamId !== 'null' && updateData.teamId !== 'UNASSIGNED') {
        const team = await RescueTeam.findById(updateData.teamId);
        if (!team) throw new ApiError(404, 'Khong tim thay Doi cuu ho can dieu chuyen');
        equipment.teamId = updateData.teamId;

        // Nếu Đội đích đã có bản ghi cùng tên & danh mục, tự động CỘNG DỒN
        const existingInTeam = await Equipment.findOne({
          teamId: team._id,
          category: equipment.category,
          name: { $regex: new RegExp(`^${equipment.name.trim()}$`, 'i') },
          _id: { $ne: equipment._id },
        });

        if (existingInTeam) {
          existingInTeam.quantity += equipment.quantity;
          const mergeLog = `[Biên chế / Bổ sung +${equipment.quantity} ${equipment.unit} vào đội ${team.name}]`;
          existingInTeam.note = existingInTeam.note ? `${existingInTeam.note} | ${mergeLog}` : mergeLog;
          await existingInTeam.save();
          await Equipment.findByIdAndDelete(equipment._id);
          return existingInTeam.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
        }
      } else {
        equipment.teamId = null;

        // Khi RÚT VỀ KHO TỔNG: Kiểm tra xem Kho Tổng đã có bản ghi cùng tên & danh mục chưa để CỘNG DỒN
        const existingInDepot = await Equipment.findOne({
          teamId: null,
          category: equipment.category,
          name: { $regex: new RegExp(`^${equipment.name.trim()}$`, 'i') },
          _id: { $ne: equipment._id },
        });

        if (existingInDepot) {
          existingInDepot.quantity += equipment.quantity;
          const mergeLog = `[Rút hồi về Kho Tổng: +${equipment.quantity} ${equipment.unit} từ ${equipment.serialNumber || 'biên chế đội'}]`;
          existingInDepot.note = existingInDepot.note ? `${existingInDepot.note} | ${mergeLog}` : mergeLog;
          await existingInDepot.save();
          await Equipment.findByIdAndDelete(equipment._id);
          return existingInDepot.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
        }
      }
    }

    if (updateData.serialNumber !== undefined) {
      const cleanSerial = updateData.serialNumber ? String(updateData.serialNumber).trim().toUpperCase() : null;
      if (cleanSerial && cleanSerial !== equipment.serialNumber) {
        const existing = await Equipment.findOne({ serialNumber: cleanSerial, _id: { $ne: id } });
        if (existing) throw new ApiError(409, `So se-ri '${cleanSerial}' da thuoc ve vat tu khac`);
      }
      equipment.serialNumber = cleanSerial;
    }

    await equipment.save();
    return equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
  }

  /**
   * Cap nhat nhanh trang thai vat tu (AVAILABLE / IN_USE / MAINTENANCE / LOST / DAMAGED / EXPIRED)
   */
  async updateStatus(id, status, note) {
    const validStatuses = ['AVAILABLE', 'IN_USE', 'BORROWED', 'MAINTENANCE', 'LOST', 'DAMAGED', 'EXPIRED'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, `Trang thai '${status}' khong hop le. Cho phep: ${validStatuses.join(', ')}`);
    }

    const equipment = await Equipment.findById(id);
    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu');

    equipment.status = status;
    if (note !== undefined) equipment.note = note;
    await equipment.save();

    return equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName' },
    ]);
  }

  /**
   * Xoa vat tu (chi xoa khi AVAILABLE hoac EXPIRED/DAMAGED)
   */
  async deleteEquipment(id) {
    const equipment = await Equipment.findById(id);
    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu can xoa');

    if (equipment.status === 'IN_USE') {
      throw new ApiError(400, 'Khong the xoa vat tu dang duoc su dung (IN_USE)');
    }

    await Equipment.findByIdAndDelete(id);
    return { message: 'Da xoa vat tu thanh cong' };
  }

  /**
   * Thong ke vat tu theo doi (summary cho dashboard)
   */
  async getEquipmentSummaryByTeam(teamId) {
    const pipeline = [
      { $match: { teamId: new mongoose.Types.ObjectId(teamId) } },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$quantity' },
          available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, '$quantity', 0] } },
          inUse: { $sum: { $cond: [{ $eq: ['$status', 'IN_USE'] }, '$quantity', 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'LOST'] }, '$quantity', 0] } },
        },
      },
    ];

    return Equipment.aggregate(pipeline);
  }

  /**
   * Dieu chuyen / Ban giao so luong khi tai giua Kho tong va cac Doi cuu ho
   */
  async transferEquipment(id, { targetTeamId, quantity, note }) {
    const sourceEquipment = await Equipment.findById(id);
    if (!sourceEquipment) throw new ApiError(404, 'Khong tim thay khi tai can ban giao');

    const transferQty = parseInt(quantity, 10);
    if (!transferQty || transferQty <= 0) {
      throw new ApiError(400, 'So luong ban giao phai lon hon 0');
    }
    if (transferQty > sourceEquipment.quantity) {
      throw new ApiError(400, `Số lượng bàn giao (${transferQty}) vượt quá cơ số hiện có (${sourceEquipment.quantity})`);
    }

    if (targetTeamId === undefined || targetTeamId === '') {
      throw new ApiError(400, 'Vui lòng chọn đơn vị tiếp nhận bàn giao');
    }

    let validTargetTeamId = null;
    let targetTeamName = 'Kho Tổng / Dự Trữ';
    if (targetTeamId && targetTeamId !== 'NONE' && targetTeamId !== 'null' && targetTeamId !== 'UNASSIGNED') {
      const team = await RescueTeam.findById(targetTeamId);
      if (!team) throw new ApiError(404, 'Không tìm thấy Đội cứu hộ tiếp nhận');
      validTargetTeamId = team._id;
      targetTeamName = team.name;
    }

    const currentTeamIdStr = sourceEquipment.teamId ? String(sourceEquipment.teamId) : null;
    const targetTeamIdStr = validTargetTeamId ? String(validTargetTeamId) : null;

    if (currentTeamIdStr === targetTeamIdStr) {
      throw new ApiError(400, validTargetTeamId ? 'Khí tài này hiện đã thuộc về đơn vị được chọn' : 'Khí tài này hiện đã nằm trong Kho Tổng / Dự Trữ');
    }

    const transferLog = `[Ban giao ${transferQty} ${sourceEquipment.unit} -> ${targetTeamName}${note ? `: ${note}` : ''}]`;

    // Case 1: Chuyen toan bo so luong
    if (transferQty === sourceEquipment.quantity) {
      const existingInTarget = await Equipment.findOne({
        teamId: validTargetTeamId,
        category: sourceEquipment.category,
        name: { $regex: new RegExp(`^${sourceEquipment.name.trim()}$`, 'i') },
        _id: { $ne: sourceEquipment._id },
      });

      if (existingInTarget) {
        existingInTarget.quantity += transferQty;
        existingInTarget.note = existingInTarget.note ? `${existingInTarget.note} | ${transferLog}` : transferLog;
        await existingInTarget.save();
        await Equipment.findByIdAndDelete(sourceEquipment._id);
        return existingInTarget.populate([
          { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
          { path: 'providedBy', select: 'name shortName type' },
        ]);
      } else {
        sourceEquipment.teamId = validTargetTeamId;
        sourceEquipment.note = sourceEquipment.note ? `${sourceEquipment.note} | ${transferLog}` : transferLog;
        await sourceEquipment.save();
        return sourceEquipment.populate([
          { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
          { path: 'providedBy', select: 'name shortName type' },
        ]);
      }
    }

    // Case 2: Chuyen mot phan so luong
    sourceEquipment.quantity -= transferQty;
    sourceEquipment.note = sourceEquipment.note ? `${sourceEquipment.note} | ${transferLog}` : transferLog;
    await sourceEquipment.save();

    let targetEquipment = await Equipment.findOne({
      teamId: validTargetTeamId,
      category: sourceEquipment.category,
      name: { $regex: new RegExp(`^${sourceEquipment.name.trim()}$`, 'i') },
      _id: { $ne: sourceEquipment._id },
    });

    if (targetEquipment) {
      targetEquipment.quantity += transferQty;
      targetEquipment.note = targetEquipment.note ? `${targetEquipment.note} | ${transferLog}` : transferLog;
      await targetEquipment.save();
    } else {
      targetEquipment = await Equipment.create({
        teamId: validTargetTeamId,
        providedBy: sourceEquipment.providedBy,
        receivedAt: sourceEquipment.receivedAt || sourceEquipment.createdAt || new Date(),
        name: sourceEquipment.name,
        category: sourceEquipment.category,
        serialNumber: sourceEquipment.serialNumber || null,
        supplyType: sourceEquipment.supplyType || 'DURABLE',
        minThreshold: sourceEquipment.minThreshold || 20,
        quantity: transferQty,
        unit: sourceEquipment.unit,
        status: 'AVAILABLE',
        note: transferLog,
      });
    }

    return targetEquipment.populate([
      { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
  }

  /**
   * Xuat cap cuu tro / Tieu hao vat tu (giam so luong kho)
   */
  async consumeEquipment(id, { quantity, destination, note }) {
    const equipment = await Equipment.findById(id);
    if (!equipment) throw new ApiError(404, 'Không tìm thấy vật tư cần xuất cấp');

    const consumeQty = parseInt(quantity, 10);
    if (!consumeQty || consumeQty <= 0) {
      throw new ApiError(400, 'Số lượng xuất phải lớn hơn 0');
    }
    if (consumeQty > equipment.quantity) {
      throw new ApiError(400, `Số lượng xuất (${consumeQty}) vượt quá cơ số tồn kho hiện có (${equipment.quantity})`);
    }

    equipment.quantity -= consumeQty;
    const destText = destination ? ` -> Điểm tiếp nhận: ${destination}` : '';
    const noteText = note ? ` (${note})` : '';
    const consumeLog = `[Xuất cứu trợ ${consumeQty} ${equipment.unit}${destText}${noteText}]`;
    equipment.note = equipment.note ? `${equipment.note} | ${consumeLog}` : consumeLog;

    if (equipment.quantity === 0) {
      equipment.status = 'DAMAGED'; // Danh dau da het ton kho
    }

    await equipment.save();
    return equipment.populate([
      { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
  }

  /**
   * Xuat cap cuu tro tong hop nhieu vat tu cung luc
   */
  async batchConsumeEquipments({ items, destination, recipientName, note, teamId, priority, coordinates, user }) {
    if (!destination || !String(destination).trim()) {
      throw new ApiError(400, 'Vui lòng nhập điểm tiếp nhận cứu trợ / khu vực ngập lụt');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'Danh sách vật tư xuất cấp không được rỗng');
    }

    const destText = String(destination).trim();
    const recipText = recipientName && String(recipientName).trim() ? ` (Người nhận: ${String(recipientName).trim()})` : '';
    const noteText = note && String(note).trim() ? ` [Ghi chú: ${String(note).trim()}]` : '';

    // Xác thực Đội cứu hộ nếu có gán
    let team = null;
    let chosenRescuerId = null;
    if (teamId && teamId !== 'DIRECT' && teamId !== 'null' && teamId !== 'UNASSIGNED') {
      team = await RescueTeam.findById(teamId).populate('leaderId members.rescuerId authorityId areaId');
      if (!team) {
        throw new ApiError(404, `Không tìm thấy Đội cứu hộ có mã: ${teamId}`);
      }
      if (team.status && team.status !== 'ACTIVE') {
        const statusMap = {
          INACTIVE: 'Tạm dừng hoạt động',
          SUSPENDED: 'Đình chỉ hoạt động',
        };
        const statusLabel = statusMap[team.status] || team.status;
        throw new ApiError(400, `Đội cứu hộ "${team.name}" hiện đang ở trạng thái "${statusLabel}", không thể tiếp nhận lệnh điều phối.`);
      }
      if (team.leaderId) {
        chosenRescuerId = team.leaderId._id || team.leaderId;
      } else if (Array.isArray(team.members) && team.members.length > 0) {
        const approvedMember = team.members.find((m) => m.status === 'APPROVED') || team.members[0];
        chosenRescuerId = approvedMember?.rescuerId?._id || approvedMember?.rescuerId;
      }

      if (!chosenRescuerId) {
        const anyRescuer = await User.findOne({ roles: 'RESCUER' });
        chosenRescuerId = anyRescuer?._id || user?._id;
      }
    }

    // 1. Validate toàn bộ danh sách trước khi trừ kho
    const equipmentDocs = [];
    for (const item of items) {
      const eqId = item.equipmentId || item._id;
      const qty = parseInt(item.quantity, 10);
      if (!eqId) {
        throw new ApiError(400, 'Thiếu thông tin vật tư cần xuất');
      }
      if (!qty || qty <= 0) {
        throw new ApiError(400, 'Số lượng xuất của mỗi mặt hàng phải lớn hơn 0');
      }

      const eq = await Equipment.findById(eqId);
      if (!eq) {
        throw new ApiError(404, `Không tìm thấy vật tư có mã: ${eqId}`);
      }
      if (qty > eq.quantity) {
        throw new ApiError(400, `Vật tư "${eq.name}" chỉ còn tồn kho ${eq.quantity} ${eq.unit}, không đủ để xuất ${qty} ${eq.unit}`);
      }
      equipmentDocs.push({ doc: eq, consumeQty: qty });
    }

    // 2. Trừ kho và ghi vết
    const updatedEquipments = [];
    const teamLog = team ? ` [Đội vận chuyển: ${team.name}]` : ' [Xuất trực tiếp tại kho]';
    for (const { doc: equipment, consumeQty } of equipmentDocs) {
      equipment.quantity -= consumeQty;
      const consumeLog = `[Phiếu xuất cứu trợ tổng hợp: ${consumeQty} ${equipment.unit} -> ${destText}${recipText}${teamLog}${noteText}]`;
      equipment.note = equipment.note ? `${equipment.note} | ${consumeLog}` : consumeLog;

      if (equipment.quantity === 0) {
        equipment.status = 'DAMAGED'; // Đánh dấu đã hết tồn kho
      }

      await equipment.save();
      await equipment.populate([
        { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
        { path: 'providedBy', select: 'name shortName type' },
      ]);
      updatedEquipments.push(equipment);
    }

    // 3. Nếu có gán cho Đội cứu hộ: Tạo nhiệm vụ điều phối (Assignment) và phiếu cứu trợ (SosRequest)
    let createdAssignment = null;
    let createdSosRequest = null;
    if (team && chosenRescuerId) {
      const suppliesList = equipmentDocs.map(({ doc, consumeQty }) => ({
        supplyId: doc._id.toString(),
        name: doc.name,
        quantity: consumeQty,
        unit: doc.unit || 'món',
      }));

      let areaId = team.areaId?._id || team.areaId;
      if (!areaId) {
        const defaultArea = await AdministrativeArea.findOne();
        areaId = defaultArea?._id;
      }

      let authorityOrgId = team.authorityId?._id || team.authorityId;
      if (!authorityOrgId) {
        const defaultAuth = await AuthorityOrganization.findOne();
        authorityOrgId = defaultAuth?._id;
      }

      let creatorId = user?._id;
      if (!creatorId) {
        const adminUser = (await User.findOne({ roles: 'LOCAL_AUTHORITY' })) || (await User.findOne());
        creatorId = adminUser?._id;
      }

      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const chosenPriority =
        priority && validPriorities.includes(String(priority).toUpperCase())
          ? String(priority).toUpperCase()
          : 'HIGH';

      try {
        let targetCoordinates = [108.152, 16.054]; // Mặc định nếu không cung cấp
        if (Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
          targetCoordinates = [Number(coordinates[0]), Number(coordinates[1])];
        } else if (team.areaId?.centerPoint?.coordinates) {
          targetCoordinates = team.areaId.centerPoint.coordinates;
        }

        // Tạo SosRequest thể hiện điểm cứu trợ
        createdSosRequest = await SosRequest.create({
          citizenId: creatorId,
          location: {
            type: 'Point',
            coordinates: targetCoordinates, // Tọa độ khu vực tác chiến chính xác
          },
          areaId,
          address: destText,
          emergencyType: 'RELIEF',
          priority: chosenPriority,
          people: 1,
          description: `[Nhiệm vụ xuất cấp cứu trợ] Tiếp tế khẩn cấp tới ${destText}.${recipText ? ` Người nhận: ${recipientName.trim()}.` : ''}${noteText ? ` Ghi chú: ${note.trim()}` : ''}`,
          status: 'ASSIGNED',
          supplies: suppliesList,
        });

        // Tạo SosAssignment cho Đội cứu hộ
        createdAssignment = await SosAssignment.create({
          sosRequestId: createdSosRequest._id,
          sosId: createdSosRequest._id,
          authorityOrganizationId: authorityOrgId,
          rescueTeamId: team._id,
          teamId: team._id,
          rescuerId: chosenRescuerId,
          assignedBy: user?._id || null,
          priority: chosenPriority,
          status: 'PENDING',
          assignedAt: new Date(),
          missionType: 'RELIEF_DISPATCH',
          destination: destText,
          location: {
            type: 'Point',
            coordinates: targetCoordinates,
          },
          recipientName: recipientName ? String(recipientName).trim() : null,
          note: `[Lệnh xuất cấp cứu trợ] ${destText}${recipText}${noteText}`,
          supplies: suppliesList,
        });

        await createdAssignment.populate([
          { path: 'sosRequestId' },
          { path: 'rescueTeamId', select: 'name type leaderId' },
          { path: 'rescuerId', select: 'name phone email role' },
        ]);

        // 4. Gửi thông báo & Phát tín hiệu Realtime cho toàn bộ thành viên trong Đội cứu hộ
        try {
          const memberUserIds = new Set();
          if (team.leaderId) {
            const leaderIdStr = (team.leaderId._id || team.leaderId).toString();
            memberUserIds.add(leaderIdStr);
          }
          if (Array.isArray(team.members)) {
            for (const m of team.members) {
              if (m && (m.status === 'APPROVED' || !m.status) && m.rescuerId) {
                const mIdStr = (m.rescuerId._id || m.rescuerId).toString();
                memberUserIds.add(mIdStr);
              }
            }
          }
          if (chosenRescuerId) {
            memberUserIds.add(chosenRescuerId.toString());
          }

          const recipientUsers = await User.find({ _id: { $in: Array.from(memberUserIds) } });

          const itemsSummary = suppliesList
            .slice(0, 3)
            .map((s) => `${s.quantity} ${s.unit} ${s.name}`)
            .join(', ') + (suppliesList.length > 3 ? ` và ${suppliesList.length - 3} mặt hàng khác` : '');

          const notificationDocs = recipientUsers.map((recUser) => ({
            userId: recUser._id,
            createdBy: user?._id || creatorId,
            areaId: areaId || null,
            areaName: team.areaId?.name || null,
            sosId: createdSosRequest._id,
            type: 'RESCUE',
            title: `📦 LỆNH TIẾP TẾ CỨU TRỢ: ${team.name}`,
            content: `Đội "${team.name}" vừa nhận lệnh xuất kho tiếp tế [${itemsSummary}] đến "${destText}". Yêu cầu các thành viên sẵn sàng cơ động thực hiện nhiệm vụ!`,
            priority: chosenPriority,
            data: {
              type: 'RELIEF_MISSION',
              assignmentId: createdAssignment._id.toString(),
              sosId: createdSosRequest._id.toString(),
              teamId: team._id.toString(),
              teamName: team.name,
              destination: destText,
              recipientName: recipientName ? String(recipientName).trim() : null,
              itemsCount: suppliesList.length,
              supplies: suppliesList,
              note: noteText,
            },
            isRead: false,
            createdAt: new Date(),
          }));

          let savedNotifications = [];
          if (notificationDocs.length > 0) {
            savedNotifications = await Notification.insertMany(notificationDocs);
          }

          // A. Phát qua SSE Stream (eventBus) tới từng thành viên
          savedNotifications.forEach((notification) => {
            try {
              eventBus.emit('notification_event', {
                action: 'USER',
                userId: notification.userId.toString(),
                data: {
                  _id: notification._id.toString(),
                  title: notification.title,
                  content: notification.content,
                  type: notification.type,
                  priority: notification.priority,
                  areaId: notification.areaId?.toString() || null,
                  areaName: notification.areaName,
                  createdBy: user
                    ? {
                        _id: user._id,
                        fullName: user.fullName,
                        roles: user.roles,
                      }
                    : null,
                  data: notification.data,
                  isRead: false,
                  createdAt: notification.createdAt.toISOString(),
                },
              });
            } catch (sseErr) {
              console.warn('[batchConsumeEquipments] Lỗi emit SSE notification_event:', sseErr.message);
            }
          });

          // B. Phát qua Socket.IO tới toàn hệ thống và các thành viên
          const { getIO } = require('../socket');
          const io = getIO();
          if (io) {
            io.emit('assignment:created', createdAssignment);
            io.emit('assignment:new', createdAssignment);
            io.emit('sos:created', createdSosRequest);

            savedNotifications.forEach((notification) => {
              const uid = notification.userId.toString();
              io.to(`user_${uid}`).emit('assignment:assigned', createdAssignment);
              io.to(`user_${uid}`).emit('notification', notification);
              io.to(`user_${uid}`).emit('sos:sync', {
                type: 'RELIEF_MISSION',
                teamId: team._id.toString(),
                assignmentId: createdAssignment._id.toString(),
              });
            });
          }

          // C. Gửi Push Notification ra ngoài ứng dụng điện thoại (Expo Push Service)
          const pushTokens = [];
          recipientUsers.forEach((u) => {
            if (u.pushToken && typeof u.pushToken === 'string' && u.pushToken.trim()) {
              pushTokens.push(u.pushToken.trim());
            }
            if (u.citizen?.pushToken && typeof u.citizen.pushToken === 'string' && u.citizen.pushToken.trim()) {
              pushTokens.push(u.citizen.pushToken.trim());
            }
          });

          const uniquePushTokens = [...new Set(pushTokens)];
          if (uniquePushTokens.length > 0) {
            sendExpoPushNotification({
              tokens: uniquePushTokens,
              title: `🚨 [ĐIỀU ĐỘNG TIẾP TẾ] ${team.name}`,
              body: `Lệnh xuất kho tiếp tế đến "${destText}". Sẵn sàng tác chiến!`,
              priority: chosenPriority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
              data: {
                type: 'RESCUE',
                assignmentId: createdAssignment._id.toString(),
                sosId: createdSosRequest._id.toString(),
                teamId: team._id.toString(),
                destination: destText,
              },
            }).catch((pushErr) => {
              console.warn('[batchConsumeEquipments] Lỗi gửi Expo push notification:', pushErr.message);
            });
          }
        } catch (notifErr) {
          console.warn('[batchConsumeEquipments] Lỗi khi gửi thông báo cho đội cứu hộ:', notifErr);
        }
      } catch (assignErr) {
        console.warn('[batchConsumeEquipments] Lỗi khi tạo nhiệm vụ Assignment:', assignErr);
      }
    }

    return {
      updatedEquipments,
      assignment: createdAssignment,
      sosRequest: createdSosRequest,
    };
  }
}

module.exports = new EquipmentService();

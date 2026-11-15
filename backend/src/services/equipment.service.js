const { Equipment, RescueTeam, AuthorityOrganization, AdministrativeArea, SosAssignment, User, Notification, AuditLog } = require('../models');
const ApiError = require('../utils/apiError');
const mongoose = require('mongoose');
const { sendExpoPushNotification, collectExpoPushTargets } = require('../utils/expoPush');
const eventBus = require('./eventBus');
const auditService = require('./audit.service');

class EquipmentService {
  /**
   * Phát sự kiện realtime khi trang thiết bị/vật tư thay đổi để Đội cứu hộ & Kho vật tư tự cập nhật
   */
  _emitEquipmentRealtime(equipment, action = 'UPDATED', previousTeamId = null) {
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (!io) return;

      const rawTeam = equipment?.teamId;
      const teamId = rawTeam ? String(rawTeam._id || rawTeam) : null;
      const prevTeamId = previousTeamId ? String(previousTeamId._id || previousTeamId) : null;

      io.emit('equipment:updated', equipment);
      io.emit('rescue_teams_updated', {
        action: `EQUIPMENT_${action}`,
        teamId,
        previousTeamId: prevTeamId,
        equipmentId: equipment?._id ? String(equipment._id) : null,
      });
    } catch (err) {
      console.warn('Realtime emit error in EquipmentService:', err.message);
    }
  }

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

    const populated = await equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
    this._emitEquipmentRealtime(populated, 'CREATED');
    return populated;
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

    // Loc theo khu vuc (areaId) -> tim tat ca cac doi va vat tu trong dia ban
    if (query.areaId && query.areaId !== 'ALL') {
      const [byId, byOther] = await Promise.all([
        mongoose.Types.ObjectId.isValid(query.areaId)
          ? AdministrativeArea.findById(query.areaId).select('_id name code parentId').lean()
          : Promise.resolve(null),
        AdministrativeArea.find({
          $or: [{ code: query.areaId }, { name: new RegExp(String(query.areaId).trim(), 'i') }],
        })
          .select('_id name code parentId')
          .lean(),
      ]);

      const areaMatches = byId ? [byId] : [];
      byOther.forEach((a) => {
        if (!areaMatches.some((m) => String(m._id) === String(a._id))) areaMatches.push(a);
      });

      if (areaMatches.length > 0) {
        const relevantAreaIds = new Set();
        const cleanNames = [];
        const matchIds = areaMatches.map((a) => a._id);
        const parentIds = areaMatches.map((a) => a.parentId).filter(Boolean);

        const [parents, allChildren] = await Promise.all([
          parentIds.length > 0
            ? AdministrativeArea.find({ _id: { $in: parentIds } }).select('_id name').lean()
            : Promise.resolve([]),
          AdministrativeArea.find({ parentId: { $in: matchIds } }).select('_id name').lean(),
        ]);

        areaMatches.forEach((a) => {
          relevantAreaIds.add(String(a._id));
          if (a.parentId) relevantAreaIds.add(String(a.parentId));
          const cName = (a.name || '').replace(/^(phường|xã|quận|huyện|thành phố|thị xã)\s+/i, '').trim();
          if (cName.length >= 3) cleanNames.push(cName);
        });
        parents.forEach((parent) => {
          if (parent?.name) {
            const pName = parent.name.replace(/^(phường|xã|quận|huyện|thành phố|thị xã)\s+/i, '').trim();
            if (pName.length >= 3) cleanNames.push(pName);
          }
        });
        allChildren.forEach((c) => relevantAreaIds.add(String(c._id)));

        const areaConditions = [
          { areaId: { $in: Array.from(relevantAreaIds).map((id) => new mongoose.Types.ObjectId(id)) } },
        ];
        cleanNames.forEach((cn) => {
          if (cn.length >= 3) areaConditions.push({ name: new RegExp(cn, 'i') });
        });

        const teamsInArea = await RescueTeam.find({ $or: areaConditions }).select('_id').lean();
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
        .limit(limit)
        .lean(),
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
      .populate({ path: 'providedBy', select: 'name shortName type' })
      .lean();

    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu');
    return equipment;
  }

  /**
   * Cap nhat thong tin vat tu
   */
  async updateEquipment(id, updateData) {
    const equipment = await Equipment.findById(id);
    if (!equipment) throw new ApiError(404, 'Khong tim thay vat tu can cap nhat');
    const previousTeamId = equipment.teamId ? String(equipment.teamId) : null;

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
          const populatedMerged = await existingInTeam.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
          this._emitEquipmentRealtime(populatedMerged, 'UPDATED', previousTeamId);
          return populatedMerged;
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
          const populatedDepot = await existingInDepot.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
          this._emitEquipmentRealtime(populatedDepot, 'UPDATED', previousTeamId);
          return populatedDepot;
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
    const populated = await equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
    this._emitEquipmentRealtime(populated, 'UPDATED', previousTeamId);
    return populated;
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

    const populated = await equipment.populate([
      { path: 'teamId', select: 'name type areaId status' },
      { path: 'providedBy', select: 'name shortName' },
    ]);
    this._emitEquipmentRealtime(populated, 'STATUS_UPDATED');
    return populated;
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
    this._emitEquipmentRealtime(equipment, 'DELETED');
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
        const populated = await existingInTarget.populate([
          { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
          { path: 'providedBy', select: 'name shortName type' },
        ]);
        this._emitEquipmentRealtime(populated, 'TRANSFERRED', currentTeamIdStr);
        return populated;
      } else {
        sourceEquipment.teamId = validTargetTeamId;
        sourceEquipment.note = sourceEquipment.note ? `${sourceEquipment.note} | ${transferLog}` : transferLog;
        await sourceEquipment.save();
        const populated = await sourceEquipment.populate([
          { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
          { path: 'providedBy', select: 'name shortName type' },
        ]);
        this._emitEquipmentRealtime(populated, 'TRANSFERRED', currentTeamIdStr);
        return populated;
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

    const populated = await targetEquipment.populate([
      { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
      { path: 'providedBy', select: 'name shortName type' },
    ]);
    this._emitEquipmentRealtime(populated, 'TRANSFERRED', currentTeamIdStr);
    return populated;
  }

  /**
   * Xuat cap cuu tro / Tieu hao vat tu (giam so luong kho)
   */
  async consumeEquipment(id, { quantity, destination, note, user = null }) {
    let equipment = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      equipment = await Equipment.findById(id);
    }
    if (!equipment && id) {
      equipment = await Equipment.findOne({
        $or: [{ serialNumber: String(id).trim().toUpperCase() }, { name: new RegExp(String(id).trim(), 'i') }],
      });
    }
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
      equipment.status = 'OUT_OF_STOCK'; // Danh dau da het ton kho
    }

    await equipment.save();

    const populated = await equipment.populate([
      { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
      { path: 'providedBy', select: 'name shortName type' },
    ]);

    try {
      await auditService.log({
        actorId: user?._id || null,
        actorRole: user?.role || 'LOCAL_AUTHORITY',
        action: 'RELIEF_BATCH_DISPATCH',
        entityType: 'Equipment',
        entityId: equipment._id,
        areaId: equipment.areaId || user?.areaId || null,
        metadata: {
          dispatchCode: `XK-${Date.now().toString().slice(-6)}`,
          mode: 'DIRECT',
          destination: destination ? String(destination).trim() : 'Xuất trực tiếp tại kho',
          recipientName: null,
          note: note ? String(note).trim() : null,
          priority: 'NORMAL',
          teamId: null,
          teamName: null,
          assignmentId: null,
          sosRequestId: null,
          sosCode: null,
          actorName: user?.fullName || null,
          items: [
            {
              supplyId: equipment._id.toString(),
              name: equipment.name,
              category: equipment.category || null,
              supplyType: equipment.supplyType || null,
              quantity: consumeQty,
              unit: equipment.unit || 'món',
            },
          ],
        },
      });
    } catch (_) {}

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('equipment:updated', populated);
        io.emit('rescue_teams_updated', {
          action: 'EQUIPMENT_CONSUMED',
          teamId: populated?.teamId ? String(populated.teamId._id || populated.teamId) : null,
          equipmentId: populated?._id ? String(populated._id) : null,
        });
      }
    } catch (_) {}

    return populated;
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
      if (team.operationalStatus === 'INACTIVE') {
        throw new ApiError(400, `Đội cứu hộ "${team.name}" hiện không sẵn sàng hoạt động, không thể tiếp nhận lệnh điều phối.`);
      }
      if (team.operationalStatus === 'ON_MISSION') {
        throw new ApiError(
          400,
          `Đội cứu hộ "${team.name}" đang thực hiện nhiệm vụ. Mỗi đội chỉ được phép thực hiện 1 nhiệm vụ tại một thời điểm! Vui lòng hoàn thành nhiệm vụ hiện tại trước khi phân công lệnh điều phối mới.`
        );
      }

      if (team.leaderId) {
        chosenRescuerId = team.leaderId._id || team.leaderId;
      } else if (Array.isArray(team.members) && team.members.length > 0) {
        const approvedMember = team.members.find((m) => m.status === 'APPROVED') || team.members[0];
        chosenRescuerId = approvedMember?.rescuerId?._id || approvedMember?.rescuerId;
      }

      // Quy tắc tác chiến: Mỗi đội chỉ được thực hiện 1 nhiệm vụ tại một thời điểm
      const leaderOrChosenIds = [];
      if (team.leaderId) leaderOrChosenIds.push(team.leaderId._id || team.leaderId);
      if (chosenRescuerId) leaderOrChosenIds.push(chosenRescuerId);

      const activeAssignment = await SosAssignment.findOne({
        $or: [
          { rescueTeamId: team._id },
          { teamId: team._id },
          ...(leaderOrChosenIds.length > 0 ? [{ rescuerId: { $in: leaderOrChosenIds } }] : []),
        ],
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      }).populate('sosRequestId', 'sosCode');

      if (activeAssignment) {
        const activeCode =
          activeAssignment.dispatchCode ||
          activeAssignment.sosRequestId?.sosCode ||
          (activeAssignment.missionType === 'RELIEF_DISPATCH' ? 'Điều phối tiếp tế' : 'đang thực hiện');
        throw new ApiError(
          400,
          `Đội cứu hộ "${team.name}" đang thực hiện nhiệm vụ (${activeCode}). Mỗi đội chỉ được phép thực hiện 1 nhiệm vụ tại một thời điểm! Vui lòng hoàn thành nhiệm vụ hiện tại trước khi phân công lệnh điều phối mới.`
        );
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
      if (!eqId && !item.name) {
        throw new ApiError(400, 'Thiếu thông tin vật tư cần xuất');
      }
      if (!qty || qty <= 0) {
        throw new ApiError(400, 'Số lượng xuất của mỗi mặt hàng phải lớn hơn 0');
      }

      let eq = null;
      if (eqId && mongoose.Types.ObjectId.isValid(eqId)) {
        eq = await Equipment.findById(eqId);
      }
      // Fallback: nếu không tìm thấy theo ID (do db vừa được re-seed và client giữ ID cũ), tìm theo tên hoặc serialNumber
      if (!eq && item.name) {
        eq = await Equipment.findOne({
          name: new RegExp(`^${item.name.trim()}$`, 'i'),
        });
      }
      if (!eq && eqId) {
        eq = await Equipment.findOne({
          $or: [
            { serialNumber: String(eqId).trim().toUpperCase() },
            { name: new RegExp(String(eqId).trim(), 'i') },
          ],
        });
      }

      if (!eq) {
        throw new ApiError(404, `Không tìm thấy vật tư có mã hoặc tên: ${eqId || item.name}`);
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
      if (equipment.supplyType === 'DURABLE' && team) {
        // Khí tài tác chiến dùng bền: Trừ ở kho xuất và tạm cấp cho Đội cứu hộ tác chiến (IN_USE)
        equipment.quantity -= consumeQty;
        const dispatchLog = `[Điều động tác chiến: ${consumeQty} ${equipment.unit} -> Đội ${team.name} đi ${destText}${noteText}]`;
        equipment.note = equipment.note ? `${equipment.note} | ${dispatchLog}` : dispatchLog;
        if (equipment.quantity === 0) {
          equipment.status = 'OUT_OF_STOCK'; // Đánh dấu đã hết tồn kho tại nguồn
        }
        await equipment.save();

        const existingInTeam = await Equipment.findOne({
          teamId: team._id,
          category: equipment.category,
          name: { $regex: new RegExp(`^${equipment.name.trim()}$`, 'i') },
        });

        if (existingInTeam) {
          existingInTeam.quantity += consumeQty;
          existingInTeam.status = 'IN_USE';
          existingInTeam.note = existingInTeam.note ? `${existingInTeam.note} | ${dispatchLog}` : dispatchLog;
          await existingInTeam.save();
          await existingInTeam.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
          updatedEquipments.push(existingInTeam);
        } else {
          const newTeamEquipment = await Equipment.create({
            teamId: team._id,
            providedBy: equipment.providedBy,
            receivedAt: new Date(),
            name: equipment.name,
            category: equipment.category,
            supplyType: 'DURABLE',
            minThreshold: equipment.minThreshold || 10,
            serialNumber: equipment.serialNumber || null,
            quantity: consumeQty,
            unit: equipment.unit || 'cái',
            status: 'IN_USE',
            note: dispatchLog,
          });
          await newTeamEquipment.populate([
            { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
            { path: 'providedBy', select: 'name shortName type' },
          ]);
          updatedEquipments.push(newTeamEquipment);
        }
      } else {
        // Hàng tiêu hao hoặc xuất trực tiếp tại kho: Trừ kho vĩnh viễn
        equipment.quantity -= consumeQty;
        const consumeLog = `[Phiếu xuất cứu trợ tổng hợp: ${consumeQty} ${equipment.unit} -> ${destText}${recipText}${teamLog}${noteText}]`;
        equipment.note = equipment.note ? `${equipment.note} | ${consumeLog}` : consumeLog;

        if (equipment.quantity === 0) {
          equipment.status = 'OUT_OF_STOCK'; // Đánh dấu đã hết tồn kho
        }

        await equipment.save();
      }

      await equipment.populate([
        { path: 'teamId', select: 'name type areaId status leaderId', populate: { path: 'areaId', select: 'name code' } },
        { path: 'providedBy', select: 'name shortName type' },
      ]);
      updatedEquipments.push(equipment);
    }

    // 3. Nếu có gán cho Đội cứu hộ: Tạo trực tiếp lệnh điều phối trong SosAssignment (không tạo bản ghi giả trong SosRequest)
    let createdAssignment = null;
    let generatedDispatchCode = null;
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

        const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        generatedDispatchCode = `LP-${randSuffix}`;

        // Tạo trực tiếp SosAssignment độc lập (sosRequestId: null)
        createdAssignment = await SosAssignment.create({
          sosRequestId: null,
          sosId: null,
          authorityOrganizationId: authorityOrgId,
          rescueTeamId: team._id,
          teamId: team._id,
          rescuerId: chosenRescuerId,
          assignedBy: user?._id || null,
          priority: chosenPriority,
          status: 'PENDING',
          assignedAt: new Date(),
          missionType: 'RELIEF_DISPATCH',
          dispatchCode: generatedDispatchCode,
          areaId: areaId || null,
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
          { path: 'authorityOrganizationId', select: 'name code type phone' },
          { path: 'rescueTeamId', select: 'name type leaderId phone areaId' },
          { path: 'rescuerId', select: '_id fullName name phone email role' },
          { path: 'assignedBy', select: '_id fullName phone email roles' },
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
            sosId: null,
            type: 'RESCUE',
            title: `📦 LỆNH TIẾP TẾ CỨU TRỢ (${generatedDispatchCode}): ${team.name}`,
            content: `Đội "${team.name}" vừa nhận lệnh xuất kho tiếp tế [${itemsSummary}] đến "${destText}". Yêu cầu các thành viên sẵn sàng cơ động thực hiện nhiệm vụ!`,
            priority: chosenPriority,
            data: {
              type: 'RELIEF_MISSION',
              dispatchCode: generatedDispatchCode,
              assignmentId: createdAssignment._id.toString(),
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

          // B. Phát qua Socket.IO tới toàn hệ thống (không phát sos:created giả vào bản đồ SOS)
          const { getIO } = require('../socket');
          const io = getIO();
          if (io) {
            io.emit('assignment:created', createdAssignment);
            io.emit('assignment:new', createdAssignment);

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
          const { uniqueTokens: uniquePushTokens } = collectExpoPushTargets(recipientUsers);
          if (uniquePushTokens.length > 0) {
            sendExpoPushNotification({
              tokens: uniquePushTokens,
              title: `🚨 [ĐIỀU ĐỘNG TIẾP TẾ ${generatedDispatchCode}] ${team.name}`,
              body: `Lệnh xuất kho tiếp tế đến "${destText}". Sẵn sàng tác chiến!`,
              priority: chosenPriority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
              data: {
                type: 'RESCUE',
                dispatchCode: generatedDispatchCode,
                assignmentId: createdAssignment._id.toString(),
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

    // 4. Ghi nhận lịch sử xuất cấp & Lệnh điều phối vào AuditLog (cả ASSIGN_TEAM lẫn DIRECT)
    try {
      const dispatchItems = equipmentDocs.map(({ doc, consumeQty }) => ({
        supplyId: doc._id.toString(),
        name: doc.name,
        category: doc.category || null,
        supplyType: doc.supplyType || null,
        quantity: consumeQty,
        unit: doc.unit || 'món',
      }));
      const dispatchAreaId =
        createdAssignment?.areaId ||
        team?.areaId?._id ||
        team?.areaId ||
        equipmentDocs[0]?.doc?.areaId ||
        user?.areaId ||
        null;
      const dispatchCode =
        createdAssignment?.dispatchCode ||
        generatedDispatchCode ||
        `XK-${Date.now().toString().slice(-6)}`;

      await auditService.log({
        actorId: user?._id || null,
        actorRole: user?.role || 'LOCAL_AUTHORITY',
        action: 'RELIEF_BATCH_DISPATCH',
        entityType: createdAssignment ? 'SosAssignment' : 'Equipment',
        entityId: createdAssignment?._id || equipmentDocs[0]?.doc?._id || null,
        areaId: dispatchAreaId,
        metadata: {
          dispatchCode,
          mode: team && createdAssignment ? 'ASSIGN_TEAM' : 'DIRECT',
          destination: destText,
          recipientName: recipientName && String(recipientName).trim() ? String(recipientName).trim() : null,
          note: note && String(note).trim() ? String(note).trim() : null,
          priority: priority ? String(priority).toUpperCase() : 'HIGH',
          teamId: team ? team._id.toString() : null,
          teamName: team ? team.name : null,
          assignmentId: createdAssignment ? createdAssignment._id.toString() : null,
          sosRequestId: null,
          sosCode: null,
          actorName: user?.fullName || null,
          items: dispatchItems,
        },
      });
    } catch (auditErr) {
      console.warn('[batchConsumeEquipments] Lỗi ghi AuditLog xuất cấp:', auditErr?.message);
    }

    // Phát sự kiện đồng bộ kho theo thời gian thực cho các client web
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        updatedEquipments.forEach((doc) => io.emit('equipment:updated', doc));
        io.emit('rescue_teams_updated', {
          action: 'EQUIPMENT_BATCH_CONSUMED',
          teamId: teamId ? String(teamId) : null,
        });
      }
    } catch (_) {}

    return {
      updatedEquipments,
      assignment: createdAssignment,
    };
  }

  /**
   * Lấy lịch sử Phiếu xuất kho & Lệnh điều phối tiếp tế (kết hợp AuditLog + trạng thái realtime của SosAssignment)
   */
  async getDispatchHistory(query = {}, currentUser = null) {
    const {
      mode = 'ALL',
      status = 'ALL',
      search = '',
      areaId: queryAreaId,
      page = 1,
      limit = 20,
    } = query;

    const isAdmin = currentUser?.role === 'ADMIN' || (Array.isArray(currentUser?.roles) && currentUser.roles.includes('ADMIN'));
    const scopedAreaId =
      queryAreaId && mongoose.Types.ObjectId.isValid(queryAreaId)
        ? String(queryAreaId)
        : !isAdmin && currentUser?.areaId
          ? String(currentUser.areaId?._id || currentUser.areaId)
          : null;

    const [dispatchLogs, restoreLogs, assignments] = await Promise.all([
      AuditLog.find({ action: 'RELIEF_BATCH_DISPATCH' })
        .populate('actorId', 'fullName phone role')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      AuditLog.find({ action: 'RELIEF_DISPATCH_INVENTORY_RESTORED' })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      SosAssignment.find({ missionType: 'RELIEF_DISPATCH' })
        .populate('rescueTeamId', 'name code phone areaId')
        .populate('assignedBy', 'fullName phone role')
        .populate('rescuerId', 'fullName phone')
        .populate('sosRequestId', 'sosCode address priority status areaId note')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    ]);

    const assignmentMap = new Map();
    assignments.forEach((a) => {
      assignmentMap.set(String(a._id), a);
    });

    const restoreLogByAssignment = new Map();
    restoreLogs.forEach((log) => {
      const aid = log.metadata?.assignmentId || (log.entityId ? String(log.entityId) : null);
      if (aid && !restoreLogByAssignment.has(String(aid))) {
        restoreLogByAssignment.set(String(aid), log);
      }
    });

    const seenAssignmentIds = new Set();
    const mergedRecords = [];

    const buildAssignmentRecord = (assignment, log = null) => {
      const aid = String(assignment._id);
      const restoreLog = restoreLogByAssignment.get(aid);
      const meta = log?.metadata || {};
      const recordAreaId =
        assignment.areaId ||
        log?.areaId ||
        assignment.sosRequestId?.areaId ||
        assignment.rescueTeamId?.areaId ||
        null;

      const items =
        Array.isArray(meta.items) && meta.items.length > 0
          ? meta.items
          : Array.isArray(assignment.supplies)
            ? assignment.supplies
            : [];

      const createdAt = log?.createdAt || assignment.assignedAt || assignment.createdAt;
      const sosCode = meta.sosCode || assignment.sosRequestId?.sosCode || null;
      const dispatchCode = assignment.dispatchCode || meta.dispatchCode || sosCode || `LP-${aid.slice(-6).toUpperCase()}`;

      let resolvedCancelReason = assignment.cancelReason || restoreLog?.metadata?.reason || null;
      if (!resolvedCancelReason && ['REJECTED', 'CANCELLED'].includes(assignment.status) && assignment.note) {
        const noteParts = String(assignment.note)
          .split(' | ')
          .map((p) => p.trim())
          .filter((p) => p && !p.startsWith('[Lệnh xuất cấp cứu trợ]'));
        if (noteParts.length > 0) {
          resolvedCancelReason = noteParts[noteParts.length - 1];
        }
      }

      return {
        id: log?._id ? String(log._id) : aid,
        assignmentId: aid,
        sosRequestId: assignment.sosRequestId?._id ? String(assignment.sosRequestId._id) : meta.sosRequestId || null,
        dispatchCode,
        sosCode,
        mode: 'ASSIGN_TEAM',
        status: assignment.status || 'PENDING',
        priority: assignment.priority || meta.priority || assignment.sosRequestId?.priority || 'HIGH',
        areaId: recordAreaId ? String(recordAreaId) : null,
        destination: assignment.destination || meta.destination || assignment.sosRequestId?.address || '',
        recipientName: assignment.recipientName || meta.recipientName || null,
        actualRecipient: assignment.actualRecipient || null,
        teamId: assignment.rescueTeamId?._id ? String(assignment.rescueTeamId._id) : meta.teamId || null,
        teamName: assignment.rescueTeamId?.name || meta.teamName || null,
        teamPhone: assignment.rescueTeamId?.phone || assignment.rescuerId?.phone || null,
        leaderName: assignment.rescuerId?.fullName || null,
        actorName: log?.actorId?.fullName || meta.actorName || assignment.assignedBy?.fullName || null,
        note: meta.note || assignment.note || null,
        cancelReason: resolvedCancelReason,
        inventoryRestored: Boolean(assignment.inventoryRestored || restoreLog),
        inventoryRestoredAt: assignment.inventoryRestoredAt || restoreLog?.createdAt || null,
        proofImages: Array.isArray(assignment.proofImages) ? assignment.proofImages : [],
        items,
        createdAt,
        acceptedAt: assignment.acceptedAt || null,
        completedAt: assignment.completedAt || null,
        cancelledAt: assignment.cancelledAt || null,
      };
    };

    for (const log of dispatchLogs) {
      const meta = log.metadata || {};
      const aid = meta.assignmentId ? String(meta.assignmentId) : null;
      if (aid && assignmentMap.has(aid)) {
        seenAssignmentIds.add(aid);
        mergedRecords.push(buildAssignmentRecord(assignmentMap.get(aid), log));
      } else {
        mergedRecords.push({
          id: String(log._id),
          assignmentId: aid,
          sosRequestId: meta.sosRequestId || null,
          dispatchCode: meta.dispatchCode || meta.sosCode || `XK-${String(log._id).slice(-6).toUpperCase()}`,
          sosCode: meta.sosCode || null,
          mode: meta.mode || (aid ? 'ASSIGN_TEAM' : 'DIRECT'),
          status: aid ? 'UNKNOWN' : 'DIRECT',
          priority: meta.priority || 'HIGH',
          areaId: log.areaId ? String(log.areaId) : null,
          destination: meta.destination || '',
          recipientName: meta.recipientName || null,
          actualRecipient: null,
          teamId: meta.teamId || null,
          teamName: meta.teamName || null,
          teamPhone: null,
          leaderName: null,
          actorName: log.actorId?.fullName || meta.actorName || null,
          note: meta.note || null,
          cancelReason: null,
          inventoryRestored: false,
          inventoryRestoredAt: null,
          proofImages: [],
          items: Array.isArray(meta.items) ? meta.items : [],
          createdAt: log.createdAt,
          acceptedAt: null,
          completedAt: log.createdAt,
          cancelledAt: null,
        });
      }
    }

    // Bổ sung các lệnh RELIEF_DISPATCH cũ chưa có AuditLog
    for (const assignment of assignments) {
      const aid = String(assignment._id);
      if (seenAssignmentIds.has(aid)) continue;
      mergedRecords.push(buildAssignmentRecord(assignment, null));
    }

    // Lọc theo khu vực
    const areaFiltered = scopedAreaId
      ? mergedRecords.filter((rec) => !rec.areaId || rec.areaId === scopedAreaId)
      : mergedRecords;

    // Sắp xếp mới nhất lên đầu
    areaFiltered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const IN_PROGRESS_STATUSES = new Set([
      'ACCEPTED',
      'DISPATCHED',
      'EN_ROUTE',
      'ON_THE_WAY',
      'ARRIVED',
      'IN_PROGRESS',
      'RESCUING',
    ]);
    const REJECTED_STATUSES = new Set(['REJECTED', 'CANCELLED']);

    // Thống kê tổng quan trước khi lọc chế độ/từ khóa
    const summary = {
      total: areaFiltered.length,
      assignTeamCount: 0,
      directCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      rejectedCount: 0,
      restoredCount: 0,
    };

    areaFiltered.forEach((rec) => {
      if (rec.mode === 'DIRECT') summary.directCount += 1;
      else summary.assignTeamCount += 1;

      if (rec.status === 'PENDING') summary.pendingCount += 1;
      else if (IN_PROGRESS_STATUSES.has(rec.status)) summary.inProgressCount += 1;
      else if (rec.status === 'COMPLETED' || rec.status === 'DIRECT') summary.completedCount += 1;
      else if (REJECTED_STATUSES.has(rec.status)) summary.rejectedCount += 1;

      if (rec.inventoryRestored) summary.restoredCount += 1;
    });

    // Áp dụng các bộ lọc giao diện
    const normalizedSearch = String(search || '').trim().toLowerCase();
    const filtered = areaFiltered.filter((rec) => {
      if (mode && mode !== 'ALL' && rec.mode !== mode) return false;
      if (status && status !== 'ALL') {
        if (status === 'IN_PROGRESS') {
          if (!IN_PROGRESS_STATUSES.has(rec.status)) return false;
        } else if (status === 'REJECTED') {
          if (!REJECTED_STATUSES.has(rec.status)) return false;
        } else if (rec.status !== status) {
          return false;
        }
      }
      if (normalizedSearch) {
        const itemNames = (rec.items || []).map((i) => i.name || '').join(' ');
        const haystack = [
          rec.dispatchCode,
          rec.sosCode,
          rec.destination,
          rec.recipientName,
          rec.actualRecipient,
          rec.teamName,
          rec.actorName,
          itemNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return {
      data: paginated,
      summary,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
    };
  }
}

module.exports = new EquipmentService();

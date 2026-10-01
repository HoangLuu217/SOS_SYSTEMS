const { Alert, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class AlertService {
  /**
   * Tạo cảnh báo mới
   */
  async createAlert(data, actorId) {
    const {
      areaId, title, content, type, severity,
      targetArea, startTime, endTime,
    } = data;

    // Kiểm tra khu vực phát cảnh báo
    const area = await AdministrativeArea.findById(areaId);
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy Khu vực hành chính (areaId)');
    }

    // Kiểm tra khu vực mục tiêu (nếu có)
    if (targetArea) {
      const target = await AdministrativeArea.findById(targetArea);
      if (!target) {
        throw new ApiError(404, 'Không tìm thấy Khu vực mục tiêu (targetArea)');
      }
    }

    const alert = await Alert.create({
      createdBy: actorId,
      areaId,
      title,
      content,
      type,
      severity: severity || 'MEDIUM',
      targetArea: targetArea || null,
      startTime: startTime || new Date(),
      endTime: endTime || null,
      isActive: true,
    });

    return alert.populate([
      { path: 'createdBy', select: 'fullName phone email' },
      { path: 'areaId', select: 'name code type' },
      { path: 'targetArea', select: 'name code type' },
    ]);
  }

  /**
   * Lấy danh sách cảnh báo (lọc & phân trang)
   */
  async getAlerts(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
    if (query.areaId) filter.areaId = query.areaId;
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }
    if (query.search) {
      filter.title = { $regex: query.search.trim(), $options: 'i' };
    }

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .populate('createdBy', 'fullName phone email')
        .populate('areaId', 'name code type')
        .populate('targetArea', 'name code type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Alert.countDocuments(filter),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy danh sách cảnh báo đang hoạt động
   */
  async getActiveAlerts(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const now = new Date();

    const filter = {
      isActive: true,
      startTime: { $lte: now },
      $or: [{ endTime: null }, { endTime: { $gte: now } }],
    };

    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
    if (query.areaId) filter.areaId = query.areaId;

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .populate('createdBy', 'fullName phone email')
        .populate('areaId', 'name code type')
        .populate('targetArea', 'name code type')
        .sort({ severity: -1, startTime: -1 })
        .skip(skip)
        .limit(limit),
      Alert.countDocuments(filter),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy chi tiết 1 cảnh báo
   */
  async getAlertById(id) {
    const alert = await Alert.findById(id)
      .populate('createdBy', 'fullName phone email avatarUrl')
      .populate('areaId', 'name code type level')
      .populate('targetArea', 'name code type level');

    if (!alert) {
      throw new ApiError(404, 'Không tìm thấy cảnh báo này');
    }

    return alert;
  }

  /**
   * Cập nhật cảnh báo
   */
  async updateAlert(id, updateData) {
    const alert = await Alert.findById(id);
    if (!alert) {
      throw new ApiError(404, 'Không tìm thấy cảnh báo cần cập nhật');
    }

    const updatableFields = [
      'title', 'content', 'type', 'severity',
      'startTime', 'endTime', 'isActive',
    ];

    for (const field of updatableFields) {
      if (updateData[field] !== undefined) {
        alert[field] = updateData[field];
      }
    }

    if (updateData.areaId) {
      const area = await AdministrativeArea.findById(updateData.areaId);
      if (!area) throw new ApiError(404, 'Khu vực hành chính (areaId) không tồn tại');
      alert.areaId = updateData.areaId;
    }

    if (updateData.targetArea !== undefined) {
      if (updateData.targetArea) {
        const target = await AdministrativeArea.findById(updateData.targetArea);
        if (!target) throw new ApiError(404, 'Khu vực mục tiêu (targetArea) không tồn tại');
      }
      alert.targetArea = updateData.targetArea || null;
    }

    await alert.save();

    return alert.populate([
      { path: 'createdBy', select: 'fullName phone email' },
      { path: 'areaId', select: 'name code type' },
      { path: 'targetArea', select: 'name code type' },
    ]);
  }

  /**
   * Xóa cảnh báo
   */
  async deleteAlert(id) {
    const alert = await Alert.findById(id);
    if (!alert) {
      throw new ApiError(404, 'Không tìm thấy cảnh báo cần xóa');
    }

    await Alert.findByIdAndDelete(id);

    return { message: 'Đã xóa cảnh báo thành công' };
  }
}

module.exports = new AlertService();

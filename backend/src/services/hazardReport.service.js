const mongoose = require('mongoose');
const { HazardReport, AdministrativeArea, Alert } = require('../models');
const ApiError = require('../utils/apiError');
const eventBus = require('./eventBus');

class HazardReportService {
  /**
   * Tạo đóng góp điểm nguy hiểm mới từ Citizen / Rescuer
   * Mặc định luôn ở trạng thái 'PENDING' chờ Local Authority duyệt
   */
  async createHazardReport(data, userId, userRoles = []) {
    const {
      title,
      description,
      hazardType,
      customHazardType,
      severity,
      location,
      address,
      areaId,
      images,
    } = data;

    if (!title || !String(title).trim()) {
      throw new ApiError(400, 'Tiêu đề điểm nguy hiểm (title) là bắt buộc');
    }

    if (!description || !String(description).trim()) {
      throw new ApiError(400, 'Mô tả chi tiết điểm nguy hiểm (description) là bắt buộc');
    }

    if (!location || !location.coordinates || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
      throw new ApiError(400, 'Tọa độ vị trí GeoJSON [lng, lat] là bắt buộc');
    }

    const [lng, lat] = location.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number' || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new ApiError(400, 'Tọa độ kinh độ (-180..180) hoặc vĩ độ (-90..90) không hợp lệ');
    }

    if (!address || !String(address).trim()) {
      throw new ApiError(400, 'Địa chỉ cụ thể (address) là bắt buộc');
    }

    // Xác định khu vực hành chính (areaId)
    let targetAreaId = areaId;
    if (!targetAreaId || !mongoose.Types.ObjectId.isValid(targetAreaId)) {
      const addressStr = String(address || '').toLowerCase();
      const allAreas = await AdministrativeArea.find({ status: 'ACTIVE' });
      const matched = allAreas.find((a) => {
        if (!a.name) return false;
        const cleanName = a.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
        return cleanName.length > 2 && addressStr.includes(cleanName);
      });
      if (matched) {
        targetAreaId = matched._id;
      } else {
        const defaultArea = await AdministrativeArea.findOne({ code: 'DANANG' });
        targetAreaId = defaultArea ? defaultArea._id : null;
      }
    }

    // Xác định vai trò người báo
    let reporterRole = 'CITIZEN';
    if (userRoles.includes('RESCUER')) {
      reporterRole = 'RESCUER';
    } else if (userRoles.includes('LOCAL_AUTHORITY')) {
      reporterRole = 'LOCAL_AUTHORITY';
    } else if (userRoles.includes('ADMIN')) {
      reporterRole = 'ADMIN';
    }

    const newReport = await HazardReport.create({
      title: String(title).trim(),
      description: String(description).trim(),
      hazardType: hazardType || 'FLOOD',
      customHazardType: customHazardType ? String(customHazardType).trim() : undefined,
      severity: severity || 'MEDIUM',
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      address: String(address).trim(),
      areaId: targetAreaId,
      reportedBy: userId,
      reporterRole,
      images: Array.isArray(images) ? images : [],
      status: 'PENDING', // Bắt buộc ở trạng thái PENDING chờ chính quyền duyệt
    });

    const populated = await newReport.populate([
      { path: 'reportedBy', select: 'fullName phone email roles avatarUrl' },
      { path: 'areaId', select: 'name code type' },
    ]);

    // Bắn sự kiện realtime cho Web và các bên liên quan
    eventBus.emit('hazard_event', { action: 'CREATED', data: populated });

    return populated;
  }

  /**
   * Lấy danh sách điểm nguy hiểm
   * - Authority / Admin / all=true: Xem được toàn bộ (kể cả PENDING, APPROVED, REJECTED)
   * - Citizen / Rescuer / Public: Xem các điểm đã APPROVED (hoặc của chính mình)
   */
  async getHazardReports(query = {}, userRoles = [], currentUserId = null) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {};

    const isAuthorityOrAdmin = userRoles.includes('LOCAL_AUTHORITY') || userRoles.includes('ADMIN');

    if (query.myReports === 'true' && currentUserId) {
      filter.reportedBy = currentUserId;
      if (query.status && query.status !== 'ALL') {
        filter.status = query.status.toUpperCase();
      }
    } else if (query.status && query.status !== 'ALL') {
      filter.status = query.status.toUpperCase();
    } else if (query.all === 'true' || query.status === 'ALL') {
      // Xem toàn bộ danh sách điểm nguy hiểm
    } else if (!isAuthorityOrAdmin) {
      filter.status = 'APPROVED';
    }

    if (query.hazardType) {
      filter.hazardType = query.hazardType;
    }

    if (query.severity) {
      filter.severity = query.severity;
    }

    if (query.areaId && mongoose.Types.ObjectId.isValid(query.areaId)) {
      filter.areaId = query.areaId;
    }

    if (query.search) {
      const term = query.search.trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { address: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }

    const [reports, total] = await Promise.all([
      HazardReport.find(filter)
        .populate('reportedBy', 'fullName phone email roles avatarUrl')
        .populate('reviewedBy', 'fullName phone email')
        .populate('areaId', 'name code type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      HazardReport.countDocuments(filter),
    ]);

    // Thống kê nhanh số lượng theo trạng thái
    const statsAgg = await HazardReport.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = {
      TOTAL: 0,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      RESOLVED: 0,
    };
    statsAgg.forEach(item => {
      if (item._id && counts[item._id] !== undefined) {
        counts[item._id] = item.count;
      }
      counts.TOTAL += item.count;
    });

    return {
      reports,
      counts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy chi tiết 1 điểm nguy hiểm
   */
  async getHazardReportById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID điểm nguy hiểm không hợp lệ');
    }

    const report = await HazardReport.findById(id)
      .populate('reportedBy', 'fullName phone email roles avatarUrl')
      .populate('reviewedBy', 'fullName phone email')
      .populate('areaId', 'name code type');

    if (!report) {
      throw new ApiError(404, 'Không tìm thấy điểm nguy hiểm này');
    }

    return report;
  }

  /**
   * Kiểm tra quyền hạn duyệt/xóa điểm nguy hiểm theo địa bàn quản lý của cán bộ (Actor LOCAL_AUTHORITY)
   */
  async checkAuthorityJurisdiction(report, authorityUser) {
    if (!authorityUser) return false;
    const userRoles = authorityUser.roles || [];

    // 1. ADMIN có toàn quyền chỉ huy & phê duyệt trên mọi địa bàn
    if (userRoles.includes('ADMIN')) return true;

    // 2. Chỉ có LOCAL_AUTHORITY mới được duyệt điểm nguy hiểm
    if (!userRoles.includes('LOCAL_AUTHORITY')) return false;

    const deptStr = String(authorityUser.authority?.department || '').toLowerCase();
    const posStr = String(authorityUser.authority?.position || '').toLowerCase();

    // 3. Nếu là cán bộ Ban chỉ huy cấp Thành phố (Toàn TP Đà Nẵng)
    if (
      deptStr.includes('tp. đà nẵng') ||
      deptStr.includes('thành phố đà nẵng') ||
      posStr.includes('điều phối tác chiến') ||
      posStr.includes('chỉ huy trưởng điều hành')
    ) {
      return true;
    }

    // 4. Tìm khu vực hành chính được phân công của cán bộ
    let authArea = null;
    if (authorityUser.authority?.areaId) {
      authArea = await AdministrativeArea.findById(authorityUser.authority.areaId);
    }

    if (!authArea && deptStr) {
      const allAreas = await AdministrativeArea.find({ status: 'ACTIVE' });
      authArea = allAreas.find((a) => {
        if (!a.name) return false;
        const clean = a.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
        return clean.length > 2 && (deptStr.includes(clean) || posStr.includes(clean));
      });
    }

    const reportAddress = String(report.address || '').toLowerCase();
    const reportDesc = String(report.description || '').toLowerCase();
    const reportAreaId = report.areaId ? String(report.areaId._id || report.areaId) : null;

    // 5. Kiểm tra trùng khớp ID khu vực trực tiếp
    if (authArea && reportAreaId && String(authArea._id) === reportAreaId) {
      return true;
    }

    // 6. Kiểm tra từ khóa địa bàn từ tên khu vực được gán
    if (authArea && authArea.name) {
      const areaKeyword = authArea.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
      if (areaKeyword.length > 2 && (reportAddress.includes(areaKeyword) || reportDesc.includes(areaKeyword))) {
        return true;
      }
    }

    // 7. Kiểm tra từ khóa địa danh từ phòng ban cán bộ
    const districtKeywords = [
      'hải châu', 'hòa cường', 'thuận phước', 'thạch thang',
      'cẩm lệ', 'hòa xuân',
      'sơn trà', 'phước mỹ', 'an hải',
      'ngũ hành sơn',
      'thanh khê', 'an khê',
      'liên chiểu', 'hòa khánh', 'hải vân',
      'hòa vang', 'bà nà', 'hòa tiến',
      'hoàng sa'
    ];

    for (const kw of districtKeywords) {
      if (deptStr.includes(kw) && (reportAddress.includes(kw) || reportDesc.includes(kw))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Phê duyệt hoặc từ chối điểm nguy hiểm (Dành riêng cho LOCAL_AUTHORITY & ADMIN trong địa bàn quản lý)
   */
  async reviewHazardReport(id, data, authorityUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID điểm nguy hiểm không hợp lệ');
    }

    const authorityId = authorityUser?._id || authorityUser;

    const {
      status,
      reviewNote,
      title,
      hazardType,
      customHazardType,
      severity,
      address,
      description,
      location,
    } = data;
    const ALLOWED = ['APPROVED', 'REJECTED', 'RESOLVED', 'PENDING'];
    if (!status || !ALLOWED.includes(status)) {
      throw new ApiError(400, `Trạng thái duyệt không hợp lệ. Cho phép: ${ALLOWED.join(', ')}`);
    }

    const report = await HazardReport.findById(id);
    if (!report) {
      throw new ApiError(404, 'Không tìm thấy điểm nguy hiểm cần duyệt');
    }

    // Kiểm tra thẩm quyền địa bàn: LOCAL_AUTHORITY chỉ được duyệt các điểm trong khu vực quản lý
    const isAllowed = await this.checkAuthorityJurisdiction(report, authorityUser);
    if (!isAllowed) {
      const areaLabel = authorityUser?.authority?.department || 'Địa bàn được phân công';
      throw new ApiError(
        403,
        `Bạn chỉ có quyền phê duyệt các điểm nguy hiểm thuộc khu vực quản lý của mình (${areaLabel}). Điểm nguy hiểm này thuộc địa bàn khác!`
      );
    }

    report.status = status;
    report.reviewedBy = authorityId;
    report.reviewedAt = new Date();
    if (reviewNote !== undefined) {
      report.reviewNote = String(reviewNote).trim();
    }

    // Chuẩn hóa các thông tin do chính quyền chỉnh sửa lại
    if (title && typeof title === 'string' && title.trim()) {
      report.title = title.trim();
    }
    if (hazardType && typeof hazardType === 'string') {
      report.hazardType = hazardType.trim();
    }
    if (customHazardType !== undefined) {
      report.customHazardType = String(customHazardType).trim();
    }
    if (severity && typeof severity === 'string') {
      report.severity = severity.trim();
    }
    if (address && typeof address === 'string' && address.trim()) {
      report.address = address.trim();
    }
    if (description !== undefined) {
      report.description = String(description).trim();
    }
    if (
      location &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2 &&
      !isNaN(location.coordinates[0]) &&
      !isNaN(location.coordinates[1])
    ) {
      report.location = {
        type: 'Point',
        coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])],
      };
    }

    await report.save();

    // Nếu điểm nguy hiểm được DUYỆT (APPROVED), tự động tạo 1 Alert tương ứng để hiển thị trên bản đồ cứu nạn
    if (status === 'APPROVED' && report.areaId) {
      try {
        await Alert.create({
          createdBy: authorityId,
          areaId: report.areaId,
          title: `[Cảnh báo nguy hiểm] ${report.title}`,
          content: `${report.description}. Địa chỉ: ${report.address}`,
          type: ['FLOOD', 'LANDSLIDE'].includes(report.hazardType) ? report.hazardType : 'DANGEROUS_AREA',
          severity: report.severity || 'HIGH',
          isActive: true,
          startTime: new Date(),
        });
      } catch (err) {
        console.warn('Không thể đồng bộ sang bảng alerts:', err.message);
      }
    }

    const populated = await report.populate([
      { path: 'reportedBy', select: 'fullName phone email roles avatarUrl' },
      { path: 'reviewedBy', select: 'fullName phone email' },
      { path: 'areaId', select: 'name code type' },
    ]);

    // Bắn sự kiện realtime cập nhật kết quả duyệt
    eventBus.emit('hazard_event', { action: 'REVIEWED', data: populated });

    return populated;
  }

  /**
   * Xóa điểm nguy hiểm (LOCAL_AUTHORITY chỉ xóa được điểm trong địa bàn quản lý, ADMIN xóa được mọi điểm)
   */
  async deleteHazardReport(id, authorityUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID điểm nguy hiểm không hợp lệ');
    }

    const report = await HazardReport.findById(id);
    if (!report) {
      throw new ApiError(404, 'Không tìm thấy điểm nguy hiểm cần xóa');
    }

    const isAllowed = await this.checkAuthorityJurisdiction(report, authorityUser);
    if (!isAllowed) {
      throw new ApiError(403, 'Bạn chỉ có quyền xóa các điểm nguy hiểm nằm trong khu vực quản lý của mình!');
    }

    await HazardReport.findByIdAndDelete(id);

    // Bắn sự kiện realtime xóa điểm
    eventBus.emit('hazard_event', { action: 'DELETED', data: { _id: id } });

    return { message: 'Đã xóa điểm nguy hiểm thành công' };
  }
}

module.exports = new HazardReportService();

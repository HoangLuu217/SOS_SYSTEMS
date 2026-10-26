const mongoose = require('mongoose');
const { HazardReport, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');
const eventBus = require('./eventBus');
const { findAreaByCoordinates, checkPointInAuthorityJurisdiction } = require('../utils/geoUtils');

class HazardReportService {
  /**
   * Tạo đóng góp điểm nguy hiểm mới từ Citizen / Rescuer / Local Authority
   * Mặc định Citizen ở trạng thái 'PENDING' chờ Local Authority duyệt
   * GPS tọa độ được dùng để tự động gán đúng khu vực hành chính quản lý
   */
  async createHazardReport(data, userId, userRoles = [], creatorUser = null) {
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

    // 1. Tự động xác định khu vực hành chính (areaId) chính xác thông qua tọa độ GPS
    let targetAreaId = null;
    const geoMatchedArea = await findAreaByCoordinates([lng, lat], AdministrativeArea);
    if (geoMatchedArea) {
      targetAreaId = geoMatchedArea._id;
    }

    // 2. Nếu GPS chưa rơi vào ranh giới cụ thể, fallback qua areaId gửi lên hoặc từ khóa địa chỉ
    if (!targetAreaId && areaId) {
      targetAreaId = areaId;
      if (targetAreaId && !mongoose.Types.ObjectId.isValid(targetAreaId)) {
        const cleanAreaId = String(targetAreaId).replace(/^PROV_/i, '').trim();
        const codeCandidate = cleanAreaId.replace(/^area-/i, '').toUpperCase();
        const matchedArea = await AdministrativeArea.findOne({
          $or: [
            { code: cleanAreaId },
            { code: codeCandidate },
            { name: new RegExp(cleanAreaId, 'i') },
          ],
        });
        if (matchedArea) {
          targetAreaId = matchedArea._id;
        } else if (!cleanAreaId.startsWith('area-')) {
          try {
            const newArea = await AdministrativeArea.create({
              name: cleanAreaId,
              code: cleanAreaId.toUpperCase().replace(/^(TỈNH|THÀNH PHỐ|TP\.?)\s+/i, '').replace(/\s+/g, '_'),
              type: 'PROVINCE',
            });
            targetAreaId = newArea._id;
          } catch (_) {
            targetAreaId = null;
          }
        } else {
          targetAreaId = null;
        }
      }
    }

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
        const defaultArea = (await AdministrativeArea.findOne({ code: 'DANANG' })) || (await AdministrativeArea.findOne());
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

    const isAuthority = userRoles.includes('LOCAL_AUTHORITY') || userRoles.includes('ADMIN');
    const isLocalAuthorityOnly = userRoles.includes('LOCAL_AUTHORITY') && !userRoles.includes('ADMIN');

    // Cán bộ chính quyền địa phương (LOCAL_AUTHORITY):
    // Bắt buộc điểm nguy hiểm tạo mới phải có GPS nằm trong khu vực quản lý!
    if (isLocalAuthorityOnly && creatorUser) {
      const jurisdictionCheck = await checkPointInAuthorityJurisdiction(
        { coordinates: [lng, lat], areaId: targetAreaId, address },
        creatorUser,
        AdministrativeArea
      );
      if (!jurisdictionCheck.allowed) {
        throw new ApiError(
          403,
          `Bạn chỉ có quyền tạo điểm nguy hiểm có GPS trong khu vực quản lý của mình (${jurisdictionCheck.authAreaName || 'Địa bàn được phân công'}). Tọa độ GPS đã chọn nằm ngoài khu vực quản lý!`
        );
      }
    }

    // Khi Cán bộ chính quyền (LOCAL_AUTHORITY) hoặc Quản trị viên (ADMIN) chủ động tạo điểm nguy hiểm:
    // Mặc định công bố trực tiếp 'APPROVED' (trừ khi chỉ định PENDING để lưu nháp)
    const finalStatus = isAuthority ? (data.status || 'APPROVED') : 'PENDING';
    const isApproved = finalStatus === 'APPROVED';

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
      status: finalStatus,
      reviewedBy: isApproved ? userId : undefined,
      reviewedAt: isApproved ? new Date() : undefined,
      reviewNote: isApproved
        ? (data.reviewNote || 'Điểm nguy hiểm được tạo trực tiếp bởi Cán bộ chính quyền địa phương')
        : undefined,
    });

    const populated = await newReport.populate([
      { path: 'reportedBy', select: 'fullName phone email roles avatarUrl' },
      { path: 'reviewedBy', select: 'fullName phone email' },
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
   * Kiểm tra quyền hạn duyệt/xóa điểm nguy hiểm theo địa bàn quản lý của cán bộ (Actor LOCAL_AUTHORITY / ADMIN)
   * Sử dụng thuật toán GIS xác thực tọa độ GPS nằm trong ranh giới đa giác quản lý
   */
  async checkAuthorityJurisdiction(report, authorityUser) {
    if (!authorityUser) return false;
    const result = await checkPointInAuthorityJurisdiction(
      {
        coordinates: report?.location?.coordinates,
        areaId: report?.areaId,
        address: report?.address,
      },
      authorityUser,
      AdministrativeArea
    );
    return result.allowed;
  }

  /**
   * Phê duyệt hoặc từ chối điểm nguy hiểm (Dành riêng cho LOCAL_AUTHORITY & ADMIN trong địa bàn quản lý)
   * Đảm bảo điểm do người dân đóng góp có GPS đúng khu vực quản lý mới được duyệt
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

    // Kiểm tra thẩm quyền địa bàn: LOCAL_AUTHORITY chỉ được duyệt các điểm có GPS trong khu vực quản lý
    const jurisdictionCheck = await checkPointInAuthorityJurisdiction(
      {
        coordinates: report.location?.coordinates,
        areaId: report.areaId,
        address: report.address,
      },
      authorityUser,
      AdministrativeArea
    );

    if (!jurisdictionCheck.allowed) {
      const areaLabel = jurisdictionCheck.authAreaName || authorityUser?.authority?.department || 'Địa bàn được phân công';
      throw new ApiError(
        403,
        `Bạn chỉ có quyền phê duyệt các đóng góp có GPS nằm trong khu vực quản lý của mình (${areaLabel}). Điểm nguy hiểm này nằm ngoài địa bàn!`
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

    // Nếu cán bộ cập nhật tọa độ GPS, kiểm tra tọa độ mới có nằm trong khu vực quản lý không
    if (
      location &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2 &&
      !isNaN(location.coordinates[0]) &&
      !isNaN(location.coordinates[1])
    ) {
      const newCoords = [Number(location.coordinates[0]), Number(location.coordinates[1])];
      const updateCheck = await checkPointInAuthorityJurisdiction(
        { coordinates: newCoords, areaId: report.areaId, address: report.address },
        authorityUser,
        AdministrativeArea
      );
      if (!updateCheck.allowed) {
        throw new ApiError(
          403,
          `Tọa độ GPS mới cập nhật nằm ngoài khu vực quản lý của bạn (${updateCheck.authAreaName || 'Địa bàn phân công'})!`
        );
      }
      report.location = {
        type: 'Point',
        coordinates: newCoords,
      };

      // Tự động đồng bộ lại areaId theo tọa độ GPS mới nếu tìm thấy
      const newMatchedArea = await findAreaByCoordinates(newCoords, AdministrativeArea);
      if (newMatchedArea) {
        report.areaId = newMatchedArea._id;
      }
    }

    await report.save();

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

  /**
   * Phân tích và trích xuất tọa độ GPS từ chuỗi / link Google Maps
   */
  parseGoogleMapsText(input) {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();

    // 1. Tọa độ DMS: 16°03'37.8"N 108°13'01.4"E
    const dmsRegex = /(\d{1,2})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([NSns])[\s,]+(\d{1,3})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([EWew])/;
    const dmsMatch = str.match(dmsRegex);
    if (dmsMatch) {
      let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
      if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
      let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
      if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'dms' };
      }
    }

    // 2. Định dạng @lat,lng e.g. /@16.0605123,108.2170456,17z
    const atMatch = str.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        let placeName = null;
        const placeMatch = str.match(/\/place\/([^/@?#]+)/);
        if (placeMatch) {
          try {
            placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
          } catch (_) {}
        }
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), placeName, source: '@' };
      }
    }

    // 3. Query params: ?q=lat,lng or ?query=lat,lng or ll=lat,lng or destination=lat,lng
    const queryMatch = str.match(/[?&](?:q|query|ll|destination|daddr|saddr)=(-?\d{1,2}\.\d+)[,%20\s]+(-?\d{1,3}\.\d+)/i);
    if (queryMatch) {
      const lat = parseFloat(queryMatch[1]);
      const lng = parseFloat(queryMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'query' };
      }
    }

    // 4. Data / embed params: !3d16.0605123!4d108.2170456 or !2d108.2170456!3d16.0605123
    const d3d4 = str.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (d3d4) {
      const lat = parseFloat(d3d4[1]);
      const lng = parseFloat(d3d4[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: '!3d!4d' };
      }
    }
    const d2d3 = str.match(/!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)/);
    if (d2d3) {
      const lng = parseFloat(d2d3[1]);
      const lat = parseFloat(d2d3[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: '!2d!3d' };
      }
    }

    // 5. Search path: /search/16.0605,+108.2170
    const searchMatch = str.match(/\/search\/(-?\d{1,2}\.\d+)[,\s+]+(-?\d{1,3}\.\d+)/);
    if (searchMatch) {
      const lat = parseFloat(searchMatch[1]);
      const lng = parseFloat(searchMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'search_path' };
      }
    }

    // 6. Directions path: /dir/.../16.0605,108.2170
    const dirMatch = str.match(/\/dir\/.*?(-?\d{1,2}\.\d+)[,\s+]+(-?\d{1,3}\.\d+)/);
    if (dirMatch) {
      const lat = parseFloat(dirMatch[1]);
      const lng = parseFloat(dirMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'dir_path' };
      }
    }

    // 7. OpenStreetMap: /#map=17/16.0605/108.2170
    const osmMatch = str.match(/#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/);
    if (osmMatch) {
      const lat = parseFloat(osmMatch[1]);
      const lng = parseFloat(osmMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'osm' };
      }
    }

    // 8. Tọa độ thô: "16.060512, 108.217045" hoặc "[16.060512, 108.217045]"
    const rawCoordRegex = /(-?\d{1,3}\.\d{3,})[,\s;]+(-?\d{1,3}\.\d{3,})/;
    const rawMatch = str.match(rawCoordRegex);
    if (rawMatch) {
      let lat = parseFloat(rawMatch[1]);
      let lng = parseFloat(rawMatch[2]);
      // Kiểm tra hoán đổi [lng, lat] nếu kinh độ đứng trước vĩ độ (ví dụ 108.2 đứng trước 16.06)
      if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
        const temp = lat;
        lat = lng;
        lng = temp;
      } else if (lat >= 100 && lat <= 115 && lng >= 8 && lng <= 25) {
        const temp = lat;
        lat = lng;
        lng = temp;
      }
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'raw' };
      }
    }

    return null;
  }

  /**
   * Giải mã liên kết Google Maps (bao gồm liên kết rút gọn maps.app.goo.gl)
   */
  async resolveMapLink(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      throw new ApiError(400, 'Vui lòng cung cấp liên kết hoặc tọa độ Google Maps');
    }

    // 1. Thử parse trực tiếp chuỗi đầu vào
    let parsed = this.parseGoogleMapsText(rawInput);
    if (parsed) {
      return parsed;
    }

    let targetUrl = rawInput.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const finalUrl = response.url || targetUrl;
      parsed = this.parseGoogleMapsText(finalUrl);
      if (parsed) {
        return { ...parsed, resolvedUrl: finalUrl };
      }

      // 2. Tìm trong nội dung HTML trả về (meta tags hoặc window.APP_INITIALIZATION_STATE)
      const html = await response.text();
      parsed = this.parseGoogleMapsText(html);

      let placeName = null;
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      if (ogTitleMatch) {
        placeName = ogTitleMatch[1].replace(/ - Google Maps$/, '').trim();
      } else {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          placeName = titleMatch[1].replace(/ - Google Maps$/, '').trim();
        }
      }

      if (parsed) {
        return {
          ...parsed,
          placeName: placeName || parsed.placeName,
          resolvedUrl: finalUrl,
        };
      }

      // 3. Quét cấu trúc dữ liệu nhúng tọa độ trong mã nguồn Google Maps
      const coordPattern = /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/;
      const coordMatch = html.match(coordPattern);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return {
            lat: Number(lat.toFixed(5)),
            lng: Number(lng.toFixed(5)),
            placeName,
            resolvedUrl: finalUrl,
            source: 'html_init_state',
          };
        }
      }

      throw new ApiError(400, 'Không tìm thấy tọa độ GPS từ liên kết Google Maps này. Vui lòng kiểm tra lại liên kết hoặc dán tọa độ trực tiếp.');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, `Không thể kết nối hoặc giải mã liên kết: ${err.message || 'Lỗi mạng'}`);
    }
  }
}

module.exports = new HazardReportService();

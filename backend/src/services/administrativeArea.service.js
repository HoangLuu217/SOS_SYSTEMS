const mongoose = require('mongoose');
const { AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class AdministrativeAreaService {
  /**
   * Kiểm tra tính hợp lệ của phân cấp hành chính (Hierarchy Validation)
   * COUNTRY: parentId = null
   * PROVINCE: parentId -> COUNTRY
   * DISTRICT: parentId -> PROVINCE
   * WARD: parentId -> DISTRICT
   */
  async validateHierarchy(type, parentId, currentId = null) {
    if (type === 'COUNTRY') {
      if (parentId) {
        throw new ApiError(400, 'Khu vực cấp COUNTRY không được có parentId (parentId phải là null)');
      }
      return;
    }

    if (!parentId) {
      throw new ApiError(400, `Khu vực cấp ${type} bắt buộc phải có parentId hợp lệ`);
    }

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw new ApiError(400, 'parentId không phải là ObjectId hợp lệ');
    }

    if (currentId && String(parentId) === String(currentId)) {
      throw new ApiError(400, 'Khu vực không thể tự nhận chính mình làm parent');
    }

    const parent = await AdministrativeArea.findById(parentId);
    if (!parent) {
      throw new ApiError(404, 'Không tìm thấy khu vực cấp cha (parent area)');
    }

    if (type === 'PROVINCE' && parent.type !== 'COUNTRY') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: PROVINCE phải trực thuộc COUNTRY, hiện tại cha là ${parent.type}`
      );
    }

    if (type === 'DISTRICT' && parent.type !== 'PROVINCE') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: DISTRICT phải trực thuộc PROVINCE, hiện tại cha là ${parent.type}`
      );
    }

    if (type === 'WARD' && parent.type !== 'DISTRICT') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: WARD phải trực thuộc DISTRICT, hiện tại cha là ${parent.type}`
      );
    }
  }

  /**
   * Kiểm tra định dạng GeoJSON Polygon của boundary
   */
  validateBoundary(boundary) {
    if (!boundary) return;

    if (boundary.type !== 'Polygon') {
      throw new ApiError(400, "GeoJSON boundary phải có type là 'Polygon'");
    }

    if (!Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
      throw new ApiError(400, 'GeoJSON Polygon coordinates phải là mảng các linear ring');
    }

    for (const ring of boundary.coordinates) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new ApiError(
          400,
          'Mỗi linear ring trong GeoJSON Polygon phải có ít nhất 4 điểm tọa độ'
        );
      }

      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new ApiError(
          400,
          'Linear ring phải khép kín (điểm đầu và điểm cuối phải trùng nhau)'
        );
      }

      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length !== 2) {
          throw new ApiError(400, 'Tọa độ điểm phải là cặp [longitude, latitude]');
        }
        const [lng, lat] = pt;
        if (
          typeof lng !== 'number' ||
          typeof lat !== 'number' ||
          lng < -180 ||
          lng > 180 ||
          lat < -90 ||
          lat > 90
        ) {
          throw new ApiError(
            400,
            `Tọa độ [${lng}, ${lat}] không hợp lệ. Longitude [-180, 180], Latitude [-90, 90]`
          );
        }
      }
    }
  }

  /**
   * POST /administrative-areas
   */
  async createArea(data) {
    const { name, code, type, parentId, boundary } = data;

    if (!name || !String(name).trim()) {
      throw new ApiError(400, 'Tên khu vực (name) là bắt buộc');
    }
    if (!code || !String(code).trim()) {
      throw new ApiError(400, 'Mã khu vực (code) là bắt buộc');
    }

    const validTypes = ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'];
    if (!type || !validTypes.includes(type)) {
      throw new ApiError(400, `Loại khu vực (type) phải là một trong: ${validTypes.join(', ')}`);
    }

    // Kiểm tra trùng code
    const existingCode = await AdministrativeArea.findOne({
      code: String(code).trim().toUpperCase(),
    });
    if (existingCode) {
      throw new ApiError(409, `Mã khu vực '${code}' đã tồn tại trong hệ thống`);
    }

    // Validate phân cấp
    await this.validateHierarchy(type, parentId || null);

    // Validate boundary nếu có
    if (boundary) {
      this.validateBoundary(boundary);
    }

    const area = await AdministrativeArea.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      type,
      parentId: type === 'COUNTRY' ? null : parentId,
      boundary: boundary || undefined,
    });

    return area;
  }

  /**
   * GET /administrative-areas
   */
  async getAreas(query = {}) {
    const filter = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.parentId !== undefined) {
      if (query.parentId === 'null' || query.parentId === null) {
        filter.parentId = null;
      } else if (mongoose.Types.ObjectId.isValid(query.parentId)) {
        filter.parentId = query.parentId;
      }
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }

    const areas = await AdministrativeArea.find(filter)
      .populate('parentId', 'name code type')
      .sort({ createdAt: -1 });

    return areas;
  }

  /**
   * GET /administrative-areas/:id
   */
  async getAreaById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID khu vực không phải là ObjectId hợp lệ');
    }

    const area = await AdministrativeArea.findById(id).populate('parentId', 'name code type');
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy khu vực hành chính');
    }

    return area;
  }

  /**
   * PATCH /administrative-areas/:id
   */
  async updateArea(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID khu vực không phải là ObjectId hợp lệ');
    }

    const area = await AdministrativeArea.findById(id);
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy khu vực hành chính để cập nhật');
    }

    const updateFields = {};

    if (data.name !== undefined) {
      if (!String(data.name).trim()) {
        throw new ApiError(400, 'Tên khu vực không được để trống');
      }
      updateFields.name = String(data.name).trim();
    }

    if (data.code !== undefined) {
      const newCode = String(data.code).trim().toUpperCase();
      if (!newCode) {
        throw new ApiError(400, 'Mã khu vực không được để trống');
      }
      if (newCode !== area.code) {
        const existingCode = await AdministrativeArea.findOne({ code: newCode, _id: { $ne: id } });
        if (existingCode) {
          throw new ApiError(409, `Mã khu vực '${newCode}' đã tồn tại trong hệ thống`);
        }
      }
      updateFields.code = newCode;
    }

    const nextType = data.type !== undefined ? data.type : area.type;
    const nextParentId = data.parentId !== undefined ? data.parentId : area.parentId;

    if (data.type !== undefined) {
      const validTypes = ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'];
      if (!validTypes.includes(data.type)) {
        throw new ApiError(400, `Loại khu vực (type) phải là một trong: ${validTypes.join(', ')}`);
      }
      updateFields.type = data.type;
    }

    if (data.parentId !== undefined) {
      updateFields.parentId = nextType === 'COUNTRY' ? null : data.parentId;
    }

    // Nếu có sự thay đổi về type hoặc parentId thì validate lại hierarchy
    if (data.type !== undefined || data.parentId !== undefined) {
      await this.validateHierarchy(nextType, nextParentId, id);
    }

    if (data.boundary !== undefined) {
      if (data.boundary === null) {
        updateFields.boundary = null;
      } else {
        this.validateBoundary(data.boundary);
        updateFields.boundary = data.boundary;
      }
    }

    const updatedArea = await AdministrativeArea.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after', runValidators: true }
    ).populate('parentId', 'name code type');

    return updatedArea;
  }
}

module.exports = new AdministrativeAreaService();

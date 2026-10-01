const mongoose = require('mongoose');
const { AuthorityOrganization, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class AuthorityOrganizationService {
  /**
   * POST /authority-organizations
   */
  async createAuthority(data) {
    const { name, code, type, phone, email, address, administrativeAreaId, areaId } = data;

    if (!name || !String(name).trim()) {
      throw new ApiError(400, 'Tên cơ quan/tổ chức (name) là bắt buộc');
    }
    if (!code || !String(code).trim()) {
      throw new ApiError(400, 'Mã cơ quan/tổ chức (code) là bắt buộc');
    }

    const validTypes = [
      'POLICE',
      'FIRE_DEPARTMENT',
      'MEDICAL',
      'DISASTER_RESPONSE',
      'MILITARY',
      'LOCAL_AUTHORITY',
      'OTHER',
      'PROVINCE',
      'DISTRICT',
      'WARD',
      'RESCUE_CENTER',
    ];

    if (!type || !validTypes.includes(type)) {
      throw new ApiError(400, `Loại cơ quan/tổ chức (type) không hợp lệ. Cho phép: ${validTypes.join(', ')}`);
    }

    // Kiểm tra unique code
    const cleanCode = String(code).trim().toUpperCase();
    const existingCode = await AuthorityOrganization.findOne({ code: cleanCode });
    if (existingCode) {
      throw new ApiError(409, `Mã cơ quan/tổ chức '${cleanCode}' đã tồn tại trong hệ thống`);
    }

    const areaRef = administrativeAreaId || areaId || null;
    if (areaRef) {
      if (!mongoose.Types.ObjectId.isValid(areaRef)) {
        throw new ApiError(400, 'administrativeAreaId không phải là ObjectId hợp lệ');
      }
      const areaExists = await AdministrativeArea.findById(areaRef);
      if (!areaExists) {
        throw new ApiError(404, 'Khu vực hành chính (administrativeAreaId) không tồn tại');
      }
    }

    const authority = await AuthorityOrganization.create({
      name: String(name).trim(),
      code: cleanCode,
      type,
      phone: phone || null,
      email: email || null,
      address: address || null,
      administrativeAreaId: areaRef,
      areaId: areaRef,
      status: data.status || 'ACTIVE',
    });

    return authority;
  }

  /**
   * GET /authority-organizations
   */
  async getAuthorities(query = {}) {
    const filter = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.status) {
      filter.status = query.status;
    }

    const areaRef = query.administrativeAreaId || query.areaId;
    if (areaRef && mongoose.Types.ObjectId.isValid(areaRef)) {
      filter.$or = [{ administrativeAreaId: areaRef }, { areaId: areaRef }];
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }

    const authorities = await AuthorityOrganization.find(filter)
      .populate('administrativeAreaId', 'name code type')
      .populate('areaId', 'name code type')
      .sort({ createdAt: -1 });

    return authorities;
  }

  /**
   * GET /authority-organizations/:id
   */
  async getAuthorityById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID cơ quan/tổ chức không phải là ObjectId hợp lệ');
    }

    const authority = await AuthorityOrganization.findById(id)
      .populate('administrativeAreaId', 'name code type')
      .populate('areaId', 'name code type');

    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy cơ quan/tổ chức');
    }

    return authority;
  }

  /**
   * PATCH /authority-organizations/:id
   */
  async updateAuthority(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID cơ quan/tổ chức không phải là ObjectId hợp lệ');
    }

    const authority = await AuthorityOrganization.findById(id);
    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy cơ quan/tổ chức để cập nhật');
    }

    const updateFields = {};

    if (data.name !== undefined) {
      if (!String(data.name).trim()) {
        throw new ApiError(400, 'Tên cơ quan/tổ chức không được để trống');
      }
      updateFields.name = String(data.name).trim();
    }

    if (data.code !== undefined) {
      const newCode = String(data.code).trim().toUpperCase();
      if (!newCode) {
        throw new ApiError(400, 'Mã cơ quan/tổ chức không được để trống');
      }
      if (newCode !== authority.code) {
        const existingCode = await AuthorityOrganization.findOne({
          code: newCode,
          _id: { $ne: id },
        });
        if (existingCode) {
          throw new ApiError(409, `Mã cơ quan/tổ chức '${newCode}' đã tồn tại trong hệ thống`);
        }
      }
      updateFields.code = newCode;
    }

    if (data.type !== undefined) {
      const validTypes = [
        'POLICE',
        'FIRE_DEPARTMENT',
        'MEDICAL',
        'DISASTER_RESPONSE',
        'MILITARY',
        'LOCAL_AUTHORITY',
        'OTHER',
        'PROVINCE',
        'DISTRICT',
        'WARD',
        'RESCUE_CENTER',
      ];
      if (!validTypes.includes(data.type)) {
        throw new ApiError(
          400,
          `Loại cơ quan/tổ chức (type) không hợp lệ. Cho phép: ${validTypes.join(', ')}`
        );
      }
      updateFields.type = data.type;
    }

    if (data.phone !== undefined) updateFields.phone = data.phone;
    if (data.email !== undefined) updateFields.email = data.email;
    if (data.address !== undefined) updateFields.address = data.address;

    const areaRef = data.administrativeAreaId !== undefined ? data.administrativeAreaId : data.areaId;
    if (areaRef !== undefined) {
      if (areaRef === null || areaRef === '') {
        updateFields.administrativeAreaId = null;
        updateFields.areaId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(areaRef)) {
          throw new ApiError(400, 'administrativeAreaId không phải là ObjectId hợp lệ');
        }
        const areaExists = await AdministrativeArea.findById(areaRef);
        if (!areaExists) {
          throw new ApiError(404, 'Khu vực hành chính (administrativeAreaId) không tồn tại');
        }
        updateFields.administrativeAreaId = areaRef;
        updateFields.areaId = areaRef;
      }
    }

    if (data.status !== undefined) {
      const validStatuses = ['ACTIVE', 'INACTIVE'];
      if (!validStatuses.includes(data.status)) {
        throw new ApiError(400, 'Trạng thái status chỉ cho phép ACTIVE hoặc INACTIVE');
      }
      updateFields.status = data.status;
    }

    const updated = await AuthorityOrganization.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after', runValidators: true }
    )
      .populate('administrativeAreaId', 'name code type')
      .populate('areaId', 'name code type');

    return updated;
  }

  /**
   * DELETE /authority-organizations/:id
   * Soft delete (status = INACTIVE) để không phá dữ liệu assignment đang reference
   */
  async deleteAuthority(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID cơ quan/tổ chức không phải là ObjectId hợp lệ');
    }

    const authority = await AuthorityOrganization.findById(id);
    if (!authority) {
      throw new ApiError(404, 'Không tìm thấy cơ quan/tổ chức');
    }

    authority.status = 'INACTIVE';
    await authority.save();

    return {
      message: 'Vô hiệu hóa cơ quan/tổ chức thành công (status = INACTIVE)',
      data: authority,
    };
  }
}

module.exports = new AuthorityOrganizationService();

const authorityOrganizationService = require('../services/authorityOrganization.service');
const { sendSuccess } = require('../utils/apiResponse');

class AuthorityOrganizationController {
  /**
   * POST /authority-organizations
   */
  async createAuthority(req, res, next) {
    try {
      const authority = await authorityOrganizationService.createAuthority(req.body);
      return sendSuccess(res, 201, 'Tạo cơ quan/tổ chức thành công', authority);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /authority-organizations
   */
  async getAuthorities(req, res, next) {
    try {
      const authorities = await authorityOrganizationService.getAuthorities(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách cơ quan/tổ chức thành công', authorities);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /authority-organizations/:id
   */
  async getAuthorityById(req, res, next) {
    try {
      const authority = await authorityOrganizationService.getAuthorityById(req.params.id);
      return sendSuccess(res, 200, 'Lấy thông tin cơ quan/tổ chức thành công', authority);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /authority-organizations/:id
   */
  async updateAuthority(req, res, next) {
    try {
      const updated = await authorityOrganizationService.updateAuthority(req.params.id, req.body);
      return sendSuccess(res, 200, 'Cập nhật cơ quan/tổ chức thành công', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /authority-organizations/:id
   */
  async deleteAuthority(req, res, next) {
    try {
      const result = await authorityOrganizationService.deleteAuthority(req.params.id);
      return sendSuccess(res, 200, result.message, result.data);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthorityOrganizationController();

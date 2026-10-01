const express = require('express');
const router = express.Router();
const authorityOrganizationController = require('../controllers/authorityOrganization.controller');

/**
 * @route   POST /authority-organizations
 * @desc    Tạo mới một cơ quan / tổ chức
 */
router.post('/', authorityOrganizationController.createAuthority);

/**
 * @route   GET /authority-organizations
 * @desc    Lấy danh sách các cơ quan / tổ chức (hỗ trợ lọc theo type, status, administrativeAreaId, search)
 */
router.get('/', authorityOrganizationController.getAuthorities);

/**
 * @route   GET /authority-organizations/:id
 * @desc    Lấy thông tin chi tiết một cơ quan / tổ chức
 */
router.get('/:id', authorityOrganizationController.getAuthorityById);

/**
 * @route   PATCH /authority-organizations/:id
 * @desc    Cập nhật thông tin cơ quan / tổ chức
 */
router.patch('/:id', authorityOrganizationController.updateAuthority);

/**
 * @route   DELETE /authority-organizations/:id
 * @desc    Xóa / vô hiệu hóa cơ quan / tổ chức (soft delete -> INACTIVE)
 */
router.delete('/:id', authorityOrganizationController.deleteAuthority);

module.exports = router;

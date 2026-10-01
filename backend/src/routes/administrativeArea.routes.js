const express = require('express');
const router = express.Router();
const administrativeAreaController = require('../controllers/administrativeArea.controller');

/**
 * @route   POST /administrative-areas
 * @desc    Tạo mới một khu vực hành chính (COUNTRY, PROVINCE, DISTRICT, WARD)
 */
router.post('/', administrativeAreaController.createArea);

/**
 * @route   GET /administrative-areas
 * @desc    Lấy danh sách các khu vực hành chính (hỗ trợ lọc theo type, parentId, search)
 */
router.get('/', administrativeAreaController.getAreas);

/**
 * @route   GET /administrative-areas/:id
 * @desc    Lấy thông tin chi tiết một khu vực hành chính
 */
router.get('/:id', administrativeAreaController.getAreaById);

/**
 * @route   PATCH /administrative-areas/:id
 * @desc    Cập nhật thông tin khu vực hành chính
 */
router.patch('/:id', administrativeAreaController.updateArea);

module.exports = router;

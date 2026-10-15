const express = require('express');
const router = express.Router();
const administrativeAreaController = require('../controllers/administrativeArea.controller');
const { optionalAuthenticate } = require('../middlewares/authMiddleware');

router.use(optionalAuthenticate);

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
 * @route   GET /administrative-areas/boundary
 * @desc    Lấy ranh giới GeoJSON polygon của khu vực hành chính (tự động truy vấn và cache CSDL)
 */
router.get('/boundary', administrativeAreaController.getAreaBoundary);

/**
 * @route   GET /administrative-areas/managers
 * @desc    Lấy danh sách cán bộ / đơn vị địa phương đang quản lý từng khu vực
 */
router.get('/managers', administrativeAreaController.getAreaManagers);

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

/**
 * @route   POST /administrative-areas/sync-api
 * @desc    Tự động đồng bộ các đơn vị hành chính lấy trực tiếp từ API vào CSDL
 */
router.post('/sync-api', administrativeAreaController.syncFromApi);

module.exports = router;

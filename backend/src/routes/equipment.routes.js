const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * @route  GET /equipments
 * @desc   Lay danh sach vat tu (filter: teamId, areaId, category, status)
 */
router.get('/', equipmentController.getEquipments);

/**
 * @route  GET /equipments/summary/:teamId
 * @desc   Thong ke vat tu theo doi cuu ho
 */
router.get('/summary/:teamId', equipmentController.getTeamSummary);

/**
 * @route  GET /equipments/:id
 * @desc   Lay chi tiet 1 vat tu
 */
router.get('/:id', equipmentController.getEquipmentById);

// Cac route thay doi du lieu yeu cau dang nhap + phan quyen
router.use(authenticate);

/**
 * @route  POST /equipments
 * @desc   Nhap kho vat tu moi cho doi cuu ho
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.post('/', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.createEquipment);

/**
 * @route  PATCH /equipments/:id
 * @desc   Cap nhat thong tin vat tu
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.patch('/:id', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.updateEquipment);

/**
 * @route  POST /equipments/batch-consume
 * @desc   Xuat cap cuu tro tong hop nhieu vat tu cung luc
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.post('/batch-consume', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.batchConsumeEquipments);

/**
 * @route  POST /equipments/:id/transfer
 * @desc   Dieu chuyen / Ban giao so luong khi tai
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.post('/:id/transfer', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.transferEquipment);

/**
 * @route  POST /equipments/:id/consume
 * @desc   Xuat cap cuu tro / Tieu hao vat tu
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.post('/:id/consume', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.consumeEquipment);

/**
 * @route  PATCH /equipments/:id/status
 * @desc   Cap nhat nhanh trang thai (AVAILABLE/IN_USE/MAINTENANCE/LOST/DAMAGED/EXPIRED)
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.patch('/:id/status', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.updateStatus);

/**
 * @route  DELETE /equipments/:id
 * @desc   Xoa vat tu
 * @access LOCAL_AUTHORITY, ADMIN
 */
router.delete('/:id', authorize('LOCAL_AUTHORITY', 'ADMIN'), equipmentController.deleteEquipment);

module.exports = router;

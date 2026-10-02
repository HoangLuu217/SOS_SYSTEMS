const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sos.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả các route liên quan đến SOS đều yêu cầu xác thực
router.use(authenticate);

// POST /api/sos - Tạo yêu cầu cứu nạn mới
router.post('/', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN'), sosController.createSos);

// GET /api/sos - Lấy danh sách yêu cầu cứu nạn
router.get('/', sosController.getSosRequests);

// GET /api/sos/:id - Xem chi tiết 1 yêu cầu cứu nạn
router.get('/:id', sosController.getSosById);

// PATCH /api/sos/:id - Cập nhật thông tin yêu cầu (chỉ khi đang ở trạng thái phù hợp, ví dụ PENDING)
router.patch('/:id', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN'), sosController.updateSos);

// POST /api/sos/:id/cancel - Hủy yêu cầu cứu nạn
router.post('/:id/cancel', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN'), sosController.cancelSos);

// POST /api/sos/:id/complete - Đánh dấu yêu cầu đã hoàn thành
router.post('/:id/complete', authorize('LOCAL_AUTHORITY', 'RESCUER', 'ADMIN', 'CITIZEN'), sosController.completeSos);

// GET /api/sos/:id/history - Lấy lịch sử trạng thái của 1 yêu cầu SOS
router.get('/:id/history', sosController.getSosHistory);

// PATCH /api/sos/:id/verify - Xác minh và phân loại mức độ SOS (Dành cho Authority)
router.patch('/:id/verify', authorize('LOCAL_AUTHORITY', 'ADMIN'), sosController.verifySos);

// GET /api/sos/:id/files - Lấy toàn bộ file đính kèm của SOS để xác minh
router.get('/:id/files', authorize('LOCAL_AUTHORITY', 'ADMIN', 'CITIZEN'), sosController.getSosFiles);

module.exports = router;

const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sos.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả các route liên quan đến SOS đều yêu cầu xác thực
router.use(authenticate);

// POST /api/sos - Tạo yêu cầu cứu nạn mới
router.post('/', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'), sosController.createSos);

// GET /api/sos - Lấy danh sách yêu cầu cứu nạn
router.get('/', sosController.getSosRequests);

// GET /api/sos/:id - Xem chi tiết 1 yêu cầu cứu nạn
router.get('/:id', sosController.getSosById);

// PATCH /api/sos/:id - Cập nhật thông tin yêu cầu (chỉ khi đang ở trạng thái phù hợp, ví dụ PENDING)
router.patch('/:id', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'), sosController.updateSos);

// POST /api/sos/:id/cancel - Hủy yêu cầu cứu nạn
router.post('/:id/cancel', authorize('CITIZEN', 'LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'), sosController.cancelSos);

// POST /api/sos/:id/complete - Đánh dấu yêu cầu đã hoàn thành
router.post('/:id/complete', authorize('LOCAL_AUTHORITY', 'RESCUER', 'ADMIN', 'CITIZEN'), sosController.completeSos);

// GET /api/sos/:id/history - Lấy lịch sử trạng thái của 1 yêu cầu SOS
router.get('/:id/history', sosController.getSosHistory);

// PATCH /api/sos/:id/verify - Xác minh và phân loại mức độ SOS (Dành cho Authority)
router.patch('/:id/verify', authorize('LOCAL_AUTHORITY', 'ADMIN'), sosController.verifySos);

// GET /api/sos/:id/files - Lấy toàn bộ file đính kèm của SOS để xác minh
router.get('/:id/files', authorize('LOCAL_AUTHORITY', 'ADMIN', 'CITIZEN', 'RESCUER'), sosController.getSosFiles);

// POST /api/sos/:id/shore-handoff/request - Cứu hộ viên yêu cầu xe đón bờ
router.post('/:id/shore-handoff/request', authorize('RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'), sosController.requestShoreHandoff);

// POST /api/sos/:id/shore-handoff/assign - Ban chỉ huy điều xe cứu thương/xe tải đón bờ
router.post('/:id/shore-handoff/assign', authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'), sosController.assignShoreHandoff);

// POST /api/sos/:id/shore-handoff/cancel - Hủy điều xe đón bờ, đưa về trạng thái chờ
router.post('/:id/shore-handoff/cancel', authorize('LOCAL_AUTHORITY', 'ADMIN', 'RESCUER'), sosController.cancelShoreHandoff);

// POST /api/sos/:id/shore-handoff/complete - Xác nhận hoàn thành tiếp vận tại bờ
router.post('/:id/shore-handoff/complete', authorize('RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'), sosController.completeShoreHandoff);

module.exports = router;

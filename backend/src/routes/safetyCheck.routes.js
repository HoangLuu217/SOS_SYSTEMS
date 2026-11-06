const express = require('express');
const router = express.Router();
const safetyCheckController = require('../controllers/safetyCheck.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả các route bên dưới yêu cầu người dùng đăng nhập
router.use(authenticate);

// 1. Lấy đợt kiểm tra an toàn đang mở (ACTIVE) cho người dân theo khu vực
router.get('/active', safetyCheckController.getActiveSafetyCheck);

// 2. Tạo đợt kiểm tra an toàn mới: ADMIN hoặc LOCAL_AUTHORITY
//    - Admin: Được chọn khu vực bất kỳ hoặc ALL
//    - Local Authority: Chỉ được gửi thông báo cho khu vực quản lý của mình
router.post('/', authorize('ADMIN', 'LOCAL_AUTHORITY'), safetyCheckController.createSafetyCheck);

// 3. Lấy danh sách các đợt kiểm tra an toàn
router.get('/', safetyCheckController.getSafetyChecks);

// 4. Xem chi tiết một đợt kiểm tra an toàn
router.get('/:id', safetyCheckController.getSafetyCheckById);

// 5. Người dân gửi phản hồi xác nhận trạng thái (SAFE hoặc NEED_HELP)
router.post('/:id/respond', safetyCheckController.respondToSafetyCheck);

// 6. Quản trị viên & Cán bộ xem danh sách người dân đã phản hồi
router.get('/:id/responses', authorize('ADMIN', 'LOCAL_AUTHORITY'), safetyCheckController.getSafetyCheckResponses);

// 7. Đóng đợt kiểm tra an toàn
router.patch('/:id/close', authorize('ADMIN', 'LOCAL_AUTHORITY'), safetyCheckController.closeSafetyCheck);

module.exports = router;


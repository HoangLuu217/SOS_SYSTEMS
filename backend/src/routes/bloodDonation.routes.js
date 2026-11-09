const express = require('express');
const router = express.Router();
const bloodDonationController = require('../controllers/bloodDonation.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Yêu cầu đăng nhập cho tất cả các API hiến máu
router.use(authenticate);

// 1. Người dân lấy trạng thái đăng ký của mình + danh sách sự kiện đang mở
router.get('/me', bloodDonationController.getMyStatus);

// 2. Người dân đăng ký hiến máu trước (PENDING) hoặc hủy đăng ký
router.post('/register', bloodDonationController.registerPending);
router.patch('/register/cancel', bloodDonationController.cancelPreRegistration);

// 3. Danh sách đăng ký hiến máu (Dành cho Địa phương & Admin)
router.get(
  '/registrations',
  authorize('ADMIN', 'LOCAL_AUTHORITY', 'AUTHORITY'),
  bloodDonationController.listRegistrations
);
router.patch(
  '/registrations/:id/status',
  authorize('ADMIN', 'LOCAL_AUTHORITY', 'AUTHORITY'),
  bloodDonationController.updateRegistrationStatus
);

// 4. Sự kiện / Đợt hiến máu
router.get('/events', bloodDonationController.listEvents);
router.post(
  '/events',
  authorize('ADMIN', 'LOCAL_AUTHORITY', 'AUTHORITY'),
  bloodDonationController.createEvent
);
router.get('/events/:id', bloodDonationController.getEventDetail);
router.post('/events/:id/respond', bloodDonationController.respondToEvent);
router.patch(
  '/events/:id/status',
  authorize('ADMIN', 'LOCAL_AUTHORITY', 'AUTHORITY'),
  bloodDonationController.updateEventStatus
);

module.exports = router;


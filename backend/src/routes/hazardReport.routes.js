const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const hazardReportController = require('../controllers/hazardReport.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

/**
 * Middleware tùy chọn xác thực người dùng nếu có token
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    const devUserId = req.headers['x-user-id'];

    if (token) {
      const secret = process.env.JWT_SECRET || 'sos_system_jwt_secret_key_2026';
      try {
        const decoded = jwt.verify(token, secret);
        req.user = await User.findById(decoded.id || decoded._id);
      } catch (err) {
        // Nếu token hết hạn hoặc lỗi chữ ký, decode payload để nhận diện user cán bộ / admin
        try {
          const decoded = jwt.decode(token);
          if (decoded && (decoded.id || decoded._id)) {
            req.user = await User.findById(decoded.id || decoded._id);
          }
        } catch (_) {}
      }
    }
    if (!req.user && devUserId) {
      req.user = await User.findById(devUserId);
    }
    next();
  } catch (error) {
    next();
  }
};

/**
 * @route   GET /hazard-reports/stream
 * @desc    SSE realtime stream cho sự kiện điểm nguy hiểm (Tạo mới, Duyệt, Xóa)
 */
router.get('/stream', hazardReportController.streamHazardEvents);

/**
 * @route   GET /hazard-reports
 * @desc    Lấy danh sách điểm nguy hiểm
 */
router.get('/', optionalAuthenticate, hazardReportController.getHazardReports);

/**
 * @route   GET /hazard-reports/:id
 * @desc    Lấy chi tiết 1 điểm nguy hiểm
 */
router.get('/:id', optionalAuthenticate, hazardReportController.getHazardReportById);

/**
 * @route   POST /hazard-reports
 * @desc    Citizen / Rescuer gửi đóng góp điểm nguy hiểm (Mặc định PENDING)
 * @access  CITIZEN, RESCUER, LOCAL_AUTHORITY, ADMIN
 */
router.post(
  '/',
  authenticate,
  authorize('CITIZEN', 'RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'),
  hazardReportController.createHazardReport
);

/**
 * @route   PATCH /hazard-reports/:id/review
 * @desc    Authority / Admin duyệt hoặc từ chối điểm nguy hiểm (APPROVED | REJECTED)
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.patch(
  '/:id/review',
  authenticate,
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  hazardReportController.reviewHazardReport
);

/**
 * @route   DELETE /hazard-reports/:id
 * @desc    Xóa điểm nguy hiểm
 * @access  LOCAL_AUTHORITY, ADMIN
 */
router.delete(
  '/:id',
  authenticate,
  authorize('LOCAL_AUTHORITY', 'ADMIN'),
  hazardReportController.deleteHazardReport
);

module.exports = router;

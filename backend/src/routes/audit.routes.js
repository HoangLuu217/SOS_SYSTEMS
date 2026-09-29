const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Tất cả audit-log routes đều yêu cầu xác thực + quyền ADMIN
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * @route   GET /audit-logs
 * @desc    Lấy danh sách audit logs
 *          Query: actorId, actorRole, action, entityType, entityId, from, to, page, limit
 * @access  ADMIN
 */
router.get('/', auditController.getAuditLogs);

/**
 * @route   GET /audit-logs/:id
 * @desc    Lấy chi tiết 1 audit log
 * @access  ADMIN
 */
router.get('/:id', auditController.getAuditLogById);

module.exports = router;

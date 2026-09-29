const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const notificationRoutes = require('./notification.routes');
const rescuerRoutes = require('./rescuer.routes');
const rescueTeamRoutes = require('./rescueTeam.routes');
const vehicleRoutes = require('./vehicle.routes');
const safeLocationRoutes = require('./safeLocation.routes');
const alertRoutes = require('./alert.routes');
const auditRoutes = require('./audit.routes');
const adminRoutes = require('./admin.routes');

// Mount routes theo đúng đặc tả API Nhóm A và các nhóm khác
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/rescuer', rescuerRoutes);
router.use('/rescue-teams', rescueTeamRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/safe-locations', safeLocationRoutes);
router.use('/alerts', alertRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/admin', adminRoutes);

module.exports = router;


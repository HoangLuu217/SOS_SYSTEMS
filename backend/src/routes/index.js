const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const notificationRoutes = require('./notification.routes');
const rescuerRoutes = require('./rescuer.routes');
const rescueTeamRoutes = require('./rescueTeam.routes');
const vehicleRoutes = require('./vehicle.routes');
const equipmentRoutes = require('./equipment.routes');

// Tuyến của Member C (SOS & Files)
const sosRoutes = require('./sos.routes');
const fileRoutes = require('./file.routes');

// Các tuyến khác từ nhánh main
const administrativeAreaRoutes = require('./administrativeArea.routes');
const authorityOrganizationRoutes = require('./authorityOrganization.routes');
const sosAssignmentRoutes = require('./sosAssignment.routes');
const safeLocationRoutes = require('./safeLocation.routes');
const auditRoutes = require('./audit.routes');
const adminRoutes = require('./admin.routes');
const configRoutes = require('./config.routes');
const hazardReportRoutes = require('./hazardReport.routes');
const chatRoutes = require('./chat.routes');
const weatherNotificationRoutes = require('./weatherNotification.routes');

// Mount routes theo đúng đặc tả API Nhóm A và các nhóm khác
router.use('/auth', authRoutes);
router.use('/config', configRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/weather-notifications', weatherNotificationRoutes);
router.use('/weather-articles', weatherNotificationRoutes);
router.use('/rescuer', rescuerRoutes);
router.use('/rescue-teams', rescueTeamRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/equipments', equipmentRoutes);

// Mount tuyến Member C
router.use('/sos', sosRoutes);
router.use('/files', fileRoutes);

// Mount tuyến từ nhánh main
router.use('/safe-locations', safeLocationRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/admin', adminRoutes);
router.use('/hazard-reports', hazardReportRoutes);
router.use('/chat', chatRoutes);

// Module D routes (Administrative Area, Authority Organization, SOS Assignment)
router.use('/administrative-areas', administrativeAreaRoutes);
router.use('/authority-organizations', authorityOrganizationRoutes);
router.use('/', sosAssignmentRoutes);

module.exports = router;

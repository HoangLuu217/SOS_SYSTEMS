const express = require('express');
const router = express.Router();

const rescuerRoutes = require('./rescuer.routes');
const rescueTeamRoutes = require('./rescueTeam.routes');
const vehicleRoutes = require('./vehicle.routes');
const administrativeAreaRoutes = require('./administrativeArea.routes');
const authorityOrganizationRoutes = require('./authorityOrganization.routes');
const sosAssignmentRoutes = require('./sosAssignment.routes');

// Module A, B, C routes
router.use('/rescuer', rescuerRoutes);
router.use('/rescue-teams', rescueTeamRoutes);
router.use('/vehicles', vehicleRoutes);

// Module D routes (Administrative Area, Authority Organization, SOS Assignment)
router.use('/administrative-areas', administrativeAreaRoutes);
router.use('/authority-organizations', authorityOrganizationRoutes);
router.use('/', sosAssignmentRoutes);

module.exports = router;

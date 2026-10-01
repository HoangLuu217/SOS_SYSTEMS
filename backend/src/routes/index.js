const express = require('express');
const router = express.Router();

const rescuerRoutes = require('./rescuer.routes');
const rescueTeamRoutes = require('./rescueTeam.routes');
const vehicleRoutes = require('./vehicle.routes');
const sosRoutes = require('./sos.routes');
const fileRoutes = require('./file.routes');

// Mount routes theo đúng đặc tả API
router.use('/rescuer', rescuerRoutes);
router.use('/rescue-teams', rescueTeamRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/sos', sosRoutes);
router.use('/files', fileRoutes);

module.exports = router;

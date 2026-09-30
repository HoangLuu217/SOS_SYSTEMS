const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/authMiddleware');

// Tất cả các route bên dưới đều yêu cầu đăng nhập
router.use(authenticate);

// 2. User Profile
router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);
router.patch('/me/avatar', userController.updateAvatar);
router.patch('/me/password', userController.changePassword);

// 3. Citizen Profile
router.get('/me/citizen', userController.getCitizen);
router.patch('/me/citizen/emergency-contact', userController.updateEmergencyContact);

module.exports = router;

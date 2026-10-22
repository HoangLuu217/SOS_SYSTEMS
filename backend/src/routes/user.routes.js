const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload.middleware');

// Middleware hỗ trợ upload avatar lên Cloudinary qua multipart FormData lẫn JSON body
const uploadAvatarMiddleware = (req, res, next) => {
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      console.warn('Multer upload warning:', err.message);
    }
    next();
  });
};

// Tất cả các route bên dưới đều yêu cầu đăng nhập
router.use(authenticate);

// 2. User Profile
router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);
router.patch('/me/avatar', uploadAvatarMiddleware, userController.updateAvatar);
router.post('/me/avatar', uploadAvatarMiddleware, userController.updateAvatar);
router.patch('/me/password', userController.changePassword);
router.post('/me/send-phone-otp', userController.sendPhoneOtp);
router.post('/me/verify-phone-otp', userController.verifyPhoneOtp);

// 3. Citizen Profile
router.get('/me/citizen', userController.getCitizen);
router.patch('/me/citizen/emergency-contact', userController.updateEmergencyContact);
router.delete('/me/citizen/emergency-contact', userController.deleteEmergencyContact);
router.delete('/me/citizen/emergency-contact/:id', userController.deleteEmergencyContact);

module.exports = router;

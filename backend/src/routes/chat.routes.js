const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

/**
 * @route   GET /chat/stream
 * @desc    SSE Realtime Stream lắng nghe tin nhắn trực tiếp không cần F5
 */
router.get('/stream', optionalAuthenticate, chatController.streamChatEvents);

/**
 * @route   GET /chat/local-authority
 * @desc    Lấy thông tin Ban chỉ huy / Cán bộ địa phương theo GPS hoặc địa chỉ
 */
router.get('/local-authority', optionalAuthenticate, chatController.getLocalAuthority);

// Các routes còn lại yêu cầu đăng nhập
router.use(authenticate);

/**
 * @route   GET /chat/conversations
 * @desc    Lấy danh sách các cuộc trò chuyện (Kênh chung + danh sách Admin/Authority)
 */
router.get('/conversations', chatController.getConversations);

/**
 * @route   GET /chat/messages
 * @desc    Lấy lịch sử tin nhắn của một kênh hoặc người nhận
 */
router.get('/messages', chatController.getMessages);

/**
 * @route   POST /chat/messages
 * @desc    Gửi tin nhắn mới
 */
router.post('/messages', chatController.sendMessage);

/**
 * @route   PATCH /chat/read
 * @desc    Đánh dấu tin nhắn đã đọc
 */
router.patch('/read', chatController.markAsRead);

module.exports = router;

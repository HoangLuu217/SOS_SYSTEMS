const mongoose = require('mongoose');
const chatService = require('../services/chat.service');
const eventBus = require('../services/eventBus');
const { sendSuccess } = require('../utils/apiResponse');

class ChatController {
  /**
   * POST /chat/messages
   */
  async sendMessage(req, res, next) {
    try {
      const message = await chatService.sendMessage(req.user, req.body);
      return sendSuccess(res, 201, 'Gửi tin nhắn thành công', message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /chat/messages
   */
  async getMessages(req, res, next) {
    try {
      const { channel, recipientId, limit } = req.query;
      const result = await chatService.getMessages({
        channel,
        recipientId,
        currentUserId: req.user?._id,
        limit: limit ? parseInt(limit, 10) : 100,
      });
      return sendSuccess(res, 200, 'Lấy lịch sử tin nhắn thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /chat/conversations
   */
  async getConversations(req, res, next) {
    try {
      const conversations = await chatService.getConversations(req.user);
      return sendSuccess(res, 200, 'Lấy danh sách cuộc trò chuyện thành công', conversations);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /chat/read
   */
  async markAsRead(req, res, next) {
    try {
      const result = await chatService.markAsRead(req.user, req.body);
      return sendSuccess(res, 200, 'Đã cập nhật trạng thái đã đọc', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /chat/read-all
   */
  async markAllAsRead(req, res, next) {
    try {
      const result = await chatService.markAllAsRead(req.user);
      return sendSuccess(res, 200, 'Đã đánh dấu đã đọc tất cả tin nhắn', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /chat/stream
   * Server-Sent Events (SSE) để nhận tin nhắn thời gian thực mà không cần reload trang F5
   */
  streamChatEvents(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Ngăn Nginx/Proxy buffer stream khi deploy
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

    const onChatEvent = (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        console.warn('[ChatSSE] Lỗi gửi gói tin SSE:', err.message);
      }
    };

    eventBus.on('chat_event', onChatEvent);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (_) {}
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      eventBus.off('chat_event', onChatEvent);
    });
  }

  /**
   * GET /chat/local-authority
   * Lấy thông tin Ban chỉ huy / Cán bộ địa phương theo GPS hoặc địa chỉ
   */
  async getLocalAuthority(req, res, next) {
    try {
      const { areaName, province, ward, lat, lng, userId } = req.query;
      const targetUserId = req.user?._id || (userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null);
      const result = await chatService.getLocalAuthorityForArea({
        areaName,
        province,
        ward,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        userId: targetUserId,
        currentUser: req.user,
      });
      return sendSuccess(res, 200, 'Lấy thông tin địa phương thành công', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ChatController();

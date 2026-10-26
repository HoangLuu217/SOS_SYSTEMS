const notificationService = require('../services/notification.service');
const { sendSuccess } = require('../utils/apiResponse');

class NotificationController {
  /**
   * GET /notifications
   */
  async getNotifications(req, res, next) {
    try {
      const userId = req.user ? req.user._id : null;
      const result = await notificationService.getNotifications(userId, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy danh sách thông báo thành công',
        result.notifications,
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /notifications/broadcast
   * Phát thông báo khẩn cấp hoặc hệ thống tới các tài khoản trong khu vực
   */
  async broadcastNotification(req, res, next) {
    try {
      const result = await notificationService.broadcastNotification(req.user, req.body);
      return sendSuccess(res, 201, result.message, result.broadcast);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications/broadcasts
   * Lấy lịch sử các đợt phát thông báo (dành cho Web Dashboard)
   */
  async getBroadcastHistory(req, res, next) {
    try {
      const broadcasts = await notificationService.getBroadcastHistory(req.user, req.query);
      return sendSuccess(res, 200, 'Lấy lịch sử phát thông báo thành công', broadcasts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /notifications/broadcasts/:id
   * Xóa một đợt phát thông báo
   */
  async deleteBroadcast(req, res, next) {
    try {
      const result = await notificationService.deleteBroadcast(req.user, req.params.id);
      return sendSuccess(res, 200, result.message, { deletedCount: result.deletedCount });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /notifications/register-push-token
   * Đăng ký mã Expo Push Token của điện thoại người dùng
   */
  async registerPushToken(req, res, next) {
    try {
      const result = await notificationService.registerPushToken(req.user._id, req.body.pushToken);
      return sendSuccess(res, 200, result.message, { pushToken: result.pushToken });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/location
   * Lưu vị trí foreground gần nhất để giới hạn broadcast điểm an toàn/nguy hiểm theo GPS.
   */
  async updateCurrentLocation(req, res, next) {
    try {
      const result = await notificationService.updateCurrentLocation(req.user._id, req.body);
      return sendSuccess(res, 200, 'Đã cập nhật vị trí GPS.', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications/:id
   */
  async getNotificationById(req, res, next) {
    try {
      const notification = await notificationService.getNotificationById(
        req.user._id,
        req.params.id
      );
      return sendSuccess(res, 200, 'Lấy chi tiết thông báo thành công', notification);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/:id/read
   */
  async markAsRead(req, res, next) {
    try {
      const notification = await notificationService.markAsRead(
        req.user._id,
        req.params.id
      );
      return sendSuccess(res, 200, 'Đánh dấu thông báo đã đọc thành công', notification);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/read-all
   */
  async markAllAsRead(req, res, next) {
    try {
      const result = await notificationService.markAllAsRead(req.user._id);
      return sendSuccess(res, 200, result.message, { modifiedCount: result.modifiedCount });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /notifications/:id
   */
  async deleteNotification(req, res, next) {
    try {
      const result = await notificationService.deleteNotification(
        req.user._id,
        req.params.id
      );
      return sendSuccess(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications/stream
   * SSE Stream cho Realtime Notification updates (Web authority & Mobile)
   */
  streamNotificationEvents(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // The authenticated identity is authoritative. Never trust a userId supplied in the URL.
    const clientUserId = req.user?._id?.toString();
    if (!clientUserId) {
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
    if (typeof res.flush === 'function') res.flush();

    const eventBus = require('../services/eventBus');
    const onNotificationEvent = (payload) => {
      if (!payload) return;
      // Nếu là thông báo riêng của 1 user cụ thể
      if (payload.action === 'USER' && payload.userId) {
        if (clientUserId && clientUserId === payload.userId.toString()) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          if (typeof res.flush === 'function') res.flush();
        }
        return;
      }

      if (payload.action === 'DELETED' || payload.action === 'BROADCAST') {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }
    };

    eventBus.on('notification_event', onNotificationEvent);

    const heartbeatTimer = setInterval(() => {
      res.write(`: heartbeat\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      eventBus.off('notification_event', onNotificationEvent);
    });
  }
}

module.exports = new NotificationController();


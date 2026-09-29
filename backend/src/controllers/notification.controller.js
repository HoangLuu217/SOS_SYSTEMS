const notificationService = require('../services/notification.service');
const { sendSuccess } = require('../utils/apiResponse');

class NotificationController {
  /**
   * GET /notifications
   */
  async getNotifications(req, res, next) {
    try {
      const result = await notificationService.getNotifications(req.user._id, req.query);
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
}

module.exports = new NotificationController();

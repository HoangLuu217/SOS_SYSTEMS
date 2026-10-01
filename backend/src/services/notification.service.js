const mongoose = require('mongoose');
const { Notification } = require('../models');
const ApiError = require('../utils/apiError');

class NotificationService {
  /**
   * Lấy danh sách thông báo của chính người dùng đăng nhập
   * Hỗ trợ phân trang, lọc theo isRead, type
   */
  async getNotifications(userId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { userId };

    if (query.isRead !== undefined && query.isRead !== '') {
      filter.isRead = query.isRead === 'true' || query.isRead === true;
    }

    if (query.type) {
      filter.type = String(query.type).toUpperCase().trim();
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId, isRead: false }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        unreadCount,
      },
    };
  }

  /**
   * Lấy chi tiết 1 thông báo theo ID (chỉ của người đăng nhập)
   */
  async getNotificationById(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return notification;
  }

  /**
   * Đánh dấu 1 thông báo là đã đọc
   */
  async markAsRead(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
      { returnDocument: 'after' }
    );

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return notification;
  }

  /**
   * Đánh dấu tất cả thông báo của người dùng là đã đọc
   */
  async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return {
      modifiedCount: result.modifiedCount,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    };
  }

  /**
   * Xóa một thông báo theo ID
   */
  async deleteNotification(userId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new ApiError(400, 'Mã thông báo không hợp lệ.');
    }

    const deleted = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!deleted) {
      throw new ApiError(404, 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
    }

    return {
      message: 'Xóa thông báo thành công.',
    };
  }

  /**
   * Tạo thông báo mới cho người dùng
   */
  async createNotification(data) {
    const notification = new Notification(data);
    await notification.save();
    return notification;
  }
}

module.exports = new NotificationService();

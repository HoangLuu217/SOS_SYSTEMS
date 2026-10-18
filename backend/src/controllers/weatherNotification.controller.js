const weatherNotificationService = require('../services/weatherNotification.service');
const { sendSuccess } = require('../utils/apiResponse');

class WeatherNotificationController {
  /**
   * GET /weather-notifications
   */
  async getWeatherNotifications(req, res, next) {
    try {
      const { items, pagination } = await weatherNotificationService.getWeatherNotifications(req.query);
      return sendSuccess(res, 200, 'Lấy danh sách thông báo thời tiết thành công', items, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /weather-notifications/:id
   */
  async getWeatherNotificationById(req, res, next) {
    try {
      const item = await weatherNotificationService.getWeatherNotificationById(req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết thông báo thời tiết thành công', item);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /weather-notifications
   * (Chỉ ADMIN và LOCAL_AUTHORITY)
   */
  async createWeatherNotification(req, res, next) {
    try {
      const item = await weatherNotificationService.createWeatherNotification(req.body, req.user);
      return sendSuccess(res, 201, 'Tạo thông báo thời tiết thành công', item);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /weather-notifications/:id
   * (Chỉ ADMIN và LOCAL_AUTHORITY)
   */
  async updateWeatherNotification(req, res, next) {
    try {
      const item = await weatherNotificationService.updateWeatherNotification(req.params.id, req.body, req.user);
      return sendSuccess(res, 200, 'Cập nhật thông báo thời tiết thành công', item);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /weather-notifications/:id
   * (Chỉ ADMIN và LOCAL_AUTHORITY)
   */
  async deleteWeatherNotification(req, res, next) {
    try {
      const item = await weatherNotificationService.deleteWeatherNotification(req.params.id);
      return sendSuccess(res, 200, 'Hủy thông báo thời tiết thành công', item);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WeatherNotificationController();

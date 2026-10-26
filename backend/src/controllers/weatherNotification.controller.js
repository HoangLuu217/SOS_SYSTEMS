const weatherNotificationService = require('../services/weatherNotification.service');
const n8nWeatherWorkflowService = require('../services/n8nWeatherWorkflow.service');
const weatherArticleRealtimeService = require('../services/weatherArticleRealtime.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { timingSafeEqual } = require('crypto');

class WeatherNotificationController {
  /**
   * POST /weather-notifications/execute-workflow
   */
  async executeWeatherWorkflow(req, res, next) {
    try {
      const result = await n8nWeatherWorkflowService.execute();
      return sendSuccess(res, 200, 'Workflow thời tiết đã hoàn tất', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /weather-notifications/workflow-callback
   * n8n calls this after a successful run to notify connected weather pages.
   */
  workflowCompletedCallback(req, res) {
    const expectedSecret = process.env.N8N_WEATHER_WEBHOOK_SECRET || '';
    const receivedSecret = req.get('x-webhook-secret') || '';
    const expected = Buffer.from(expectedSecret);
    const received = Buffer.from(receivedSecret);

    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return sendError(res, 401, 'Webhook xác thực không hợp lệ.');
    }

    const completedAt = new Date().toISOString();
    const executionId = typeof req.body?.executionId === 'string'
      ? req.body.executionId.slice(0, 120)
      : undefined;

    weatherArticleRealtimeService.publishWorkflowCompleted({
      action: 'WEATHER_ARTICLES_UPDATED',
      completedAt,
      executionId,
    });

    return sendSuccess(res, 200, 'Đã phát thông báo cập nhật bản tin thời tiết.', { completedAt });
  }

  /**
   * GET /weather-notifications/events/stream
   * SSE sends an invalidation event only; clients load article data through the authenticated API.
   */
  streamWeatherArticleEvents(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    res.write(`data: ${JSON.stringify({ action: 'CONNECTED' })}\n\n`);

    const onWorkflowCompleted = (payload) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const unsubscribe = weatherArticleRealtimeService.subscribeToWorkflowCompleted(onWorkflowCompleted);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

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

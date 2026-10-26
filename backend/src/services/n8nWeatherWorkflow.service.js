const ApiError = require('../utils/apiError');

// Load the backend-local configuration when this service is loaded, too.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

class N8nWeatherWorkflowService {
  async execute() {
    const webhookUrl = process.env.N8N_WEATHER_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEATHER_WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      throw new ApiError(503, 'Chưa cấu hình webhook n8n cho chức năng thu thập thời tiết.');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch (_) {
      throw new ApiError(500, 'URL webhook n8n không hợp lệ.');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
      throw new ApiError(500, 'Webhook n8n phải sử dụng HTTPS.');
    }

    const controller = new AbortController();
    // The Webhook is configured to respond only after the final workflow node
    // finishes, so allow enough time for scraping, AI processing and storage.
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
        },
        body: JSON.stringify({ source: 'sos-admin-weather', requestedAt: new Date().toISOString() }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        let upstreamMessage = '';
        try {
          const responseBody = JSON.parse(responseText);
          upstreamMessage = responseBody.message || responseBody.error || '';
        } catch (_) {
          // Ignore non-JSON proxy and gateway error pages.
        }
        const safeMessage = typeof upstreamMessage === 'string' ? upstreamMessage.slice(0, 200) : '';
        console.error(`n8n weather webhook returned HTTP ${response.status}${safeMessage ? `: ${safeMessage}` : ''}`);
        throw new ApiError(
          502,
          safeMessage
            ? `n8n trả HTTP ${response.status}: ${safeMessage}`
            : `n8n từ chối chạy workflow (HTTP ${response.status}).`
        );
      }

      return {
        completed: true,
        message: 'Workflow n8n đã hoàn tất.',
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === 'AbortError') {
        throw new ApiError(504, 'Workflow n8n chạy quá 5 phút. Kiểm tra mục Executions trong n8n.');
      }
      console.error('Could not reach n8n weather webhook:', error.message);
      throw new ApiError(502, 'Không thể kết nối đến webhook n8n.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new N8nWeatherWorkflowService();

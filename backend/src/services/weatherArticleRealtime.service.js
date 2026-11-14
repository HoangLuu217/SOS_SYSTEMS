const { EventEmitter } = require('events');
const appEventBus = require('./eventBus');

const weatherEventBus = new EventEmitter();
weatherEventBus.setMaxListeners(100);

class WeatherArticleRealtimeService {
  publishArticlesUpdated(payload = {}) {
    const eventPayload = {
      ...payload,
      action: 'WEATHER_ARTICLES_UPDATED',
      timestamp: payload.timestamp || Date.now(),
    };

    weatherEventBus.emit('workflow_completed', eventPayload);
    appEventBus.emit('notification_event', eventPayload);
  }

  publishWorkflowCompleted(payload = {}) {
    this.publishArticlesUpdated({
      source: 'workflow',
      ...payload,
    });
  }

  subscribeToWorkflowCompleted(listener) {
    weatherEventBus.on('workflow_completed', listener);
    return () => weatherEventBus.off('workflow_completed', listener);
  }
}

module.exports = new WeatherArticleRealtimeService();

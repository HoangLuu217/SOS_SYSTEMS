const { EventEmitter } = require('events');

const eventBus = new EventEmitter();

class WeatherArticleRealtimeService {
  publishWorkflowCompleted(payload) {
    eventBus.emit('workflow_completed', payload);
  }

  subscribeToWorkflowCompleted(listener) {
    eventBus.on('workflow_completed', listener);
    return () => eventBus.off('workflow_completed', listener);
  }
}

module.exports = new WeatherArticleRealtimeService();

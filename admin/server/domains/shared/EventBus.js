/**
 * EventBus — lightweight in-process pub/sub for domain events.
 * Supports async handlers, error isolation, and event logging.
 */
class EventBus {
  constructor() {
    this.handlers = new Map();
    this.eventLog = [];
    this.maxLogSize = 1000;
  }

  on(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push(handler);
  }

  once(eventName, handler) {
    const wrapper = async (payload) => {
      this.off(eventName, wrapper);
      await handler(payload);
    };
    this.on(eventName, wrapper);
  }

  off(eventName, handler) {
    const list = this.handlers.get(eventName);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  async emit(eventName, payload = {}) {
    const event = {
      event: eventName,
      payload,
      timestamp: new Date(),
      correlationId: payload.correlationId || null,
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    const list = this.handlers.get(eventName);
    if (!list || list.length === 0) return;

    const errors = [];
    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        errors.push({ handler: handler.name || 'anonymous', error: err.message });
        console.error(`[EventBus] Handler error for "${eventName}":`, err.message);
      }
    }

    if (errors.length > 0) {
      console.error(`[EventBus] ${errors.length} handler(s) failed for "${eventName}"`);
    }
  }

  getEventLog(limit = 100) {
    return this.eventLog.slice(-limit);
  }

  clearHandlers() {
    this.handlers.clear();
  }
}

const eventBus = new EventBus();

module.exports = eventBus;
module.exports.EventBus = EventBus;

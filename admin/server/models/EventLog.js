const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema({
  event: {
    type: String,
    required: true,
    index: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
  },
  correlationId: {
    type: String,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  handlerErrors: [{
    handler: String,
    error: String,
  }],
}, {
  timestamps: true,
});

EventLogSchema.index({ event: 1, timestamp: -1 });

module.exports = mongoose.model('EventLog', EventLogSchema);

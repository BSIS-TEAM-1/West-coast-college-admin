const mongoose = require('mongoose');

const BlockActionLogSchema = new mongoose.Schema({
  actionType: { type: String, required: true }, // e.g., 'OVERRIDE', 'TRANSFER'
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockSection', required: true },
  studentId: { type: String, required: true },
  registrarId: { type: String, required: true },
  reason: { type: String, trim: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: Object } // additional action-specific data
}, {
  timestamps: true
});

BlockActionLogSchema.index({ sectionId: 1, timestamp: -1 });
BlockActionLogSchema.index({ registrarId: 1, timestamp: -1 });

module.exports = mongoose.model('BlockActionLog', BlockActionLogSchema);

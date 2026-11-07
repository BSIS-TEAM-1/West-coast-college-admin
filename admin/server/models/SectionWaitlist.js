const mongoose = require('mongoose');

const SectionWaitlistSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockSection', required: true },
  priority: { type: Number, default: Date.now }, // timestamp or manual rank
  addedAt: { type: Date, default: Date.now },
  reason: { type: String, trim: true },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  archiveReason: { type: String, trim: true, default: null },
  // Status the waitlist entry held before it was archived (restoration hint).
  archivePreviousStatus: { type: String, trim: true, default: null }
}, {
  timestamps: true
});

SectionWaitlistSchema.index({ sectionId: 1, priority: 1 });

module.exports = mongoose.model('SectionWaitlist', SectionWaitlistSchema);

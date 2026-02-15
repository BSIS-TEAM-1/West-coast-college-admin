const mongoose = require('mongoose');

const SectionWaitlistSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockSection', required: true },
  priority: { type: Number, default: Date.now }, // timestamp or manual rank
  addedAt: { type: Date, default: Date.now },
  reason: { type: String, trim: true }
}, {
  timestamps: true
});

SectionWaitlistSchema.index({ sectionId: 1, priority: 1 });

module.exports = mongoose.model('SectionWaitlist', SectionWaitlistSchema);

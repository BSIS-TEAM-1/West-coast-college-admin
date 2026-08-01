const mongoose = require('mongoose');

const backupVerificationReportSchema = new mongoose.Schema({
  backupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Backup', required: true, index: true },
  fileName: { type: String, required: true },
  type: { type: String, enum: ['integrity', 'scheduled_restore'], required: true },
  status: { type: String, enum: ['passed', 'failed'], required: true, index: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date, required: true },
  durationMs: { type: Number, required: true },
  validationResults: { type: mongoose.Schema.Types.Mixed, default: null },
  collectionCounts: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: null }
}, { timestamps: true });

backupVerificationReportSchema.index({ createdAt: -1 });
backupVerificationReportSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('BackupVerificationReport', backupVerificationReportSchema);

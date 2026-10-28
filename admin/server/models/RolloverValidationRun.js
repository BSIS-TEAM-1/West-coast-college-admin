const mongoose = require('mongoose');

/**
 * RolloverValidationRun — one persisted pre-rollover validation execution.
 *
 * Every run is retained as a historical record. When relevant data changes
 * (e.g. the school year is unlocked) runs are marked "stale" instead of being
 * deleted, so the audit trail of validation results is never lost.
 */
const rolloverValidationRunSchema = new mongoose.Schema({
  schoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
    index: true,
  },
  toSchoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
  },
  runBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  runAt: { type: Date, default: Date.now },

  // 'passed' = no blocking errors, no warnings.
  // 'warnings' = no blocking errors but warnings requiring authorization.
  // 'failed' = at least one blocking error.
  // 'stale' = a historical run whose input data has changed.
  status: {
    type: String,
    enum: ['passed', 'warnings', 'failed', 'stale'],
    default: 'failed',
    index: true,
  },

  results: [{
    key: String,
    title: String,
    status: { type: String, enum: ['passed', 'warning', 'blocking'] },
    count: { type: Number, default: 0 },
    message: String,
    actionable: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: [] },
  }],

  summary: {
    blockingErrors: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    passedChecks: { type: Number, default: 0 },
  },

  staleAt: { type: Date, default: null },
  staleReason: { type: String, default: null },

  // Set when this run's passing results were used to execute the rollover.
  rolloverBatchId: { type: String, default: null },
}, {
  timestamps: true,
});

rolloverValidationRunSchema.index({ schoolYear: 1, runAt: -1 });

module.exports = mongoose.model('RolloverValidationRun', rolloverValidationRunSchema);

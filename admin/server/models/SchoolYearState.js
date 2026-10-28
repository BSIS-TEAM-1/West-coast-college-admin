const mongoose = require('mongoose');

/**
 * SchoolYearState — the per-school-year lock/rollover state machine.
 *
 * States:
 *   open                  ordinary academic operations are permitted
 *   locked                ordinary modifications are restricted (read-only year)
 *   rollover_ready        locked AND passed pre-rollover validation
 *   rollover_in_progress  a rollover execution is running
 *   rollover_failed       the execution failed; recovery required before retry
 *   rolled_over           the rollover completed; the year is immutable history
 *
 * One document per school year. Documents are created lazily; a missing
 * document means the year is "open".
 */
const schoolYearStateSchema = new mongoose.Schema({
  schoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: [
      'open',
      'locked',
      'rollover_ready',
      'rollover_in_progress',
      'rollover_failed',
      'rolled_over',
    ],
    default: 'open',
    index: true,
  },

  // ---- Lock bookkeeping ----
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lockedAt: { type: Date, default: null },
  lockReason: { type: String, default: null },

  unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  unlockedAt: { type: Date, default: null },
  unlockReason: { type: String, default: null },

  // ---- Pre-rollover validation ----
  validatedAt: { type: Date, default: null },
  activeValidationRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RolloverValidationRun',
    default: null,
  },
  validationSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  // ---- Rollover execution ----
  rolloverBatchId: { type: String, default: null },
  rolloverToSchoolYear: { type: String, default: null },
  rolloverSemester: { type: String, default: null },
  rolloverStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  rolloverStartedAt: { type: Date, default: null },
  rolloverCounts: { type: mongoose.Schema.Types.Mixed, default: null },
  rolloverError: { type: mongoose.Schema.Types.Mixed, default: null },
  rolloverFailedAt: { type: Date, default: null },

  // ---- Audited recovery (emergency revert via the controlled procedure) ----
  recoveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  recoveredAt: { type: Date, default: null },
  recoveryReason: { type: String, default: null },
}, {
  timestamps: true,
});

schoolYearStateSchema.index({ status: 1, schoolYear: 1 });

module.exports = mongoose.model('SchoolYearState', schoolYearStateSchema);

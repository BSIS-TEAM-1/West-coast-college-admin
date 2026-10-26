const mongoose = require('mongoose');

/**
 * RolloverBatch - reversible manifest for one academic-year rollover.
 *
 * The manifest is written inside the same transaction as the rollover. It
 * captures everything the rollover changes so the most recent rollover can be
 * reverted deterministically:
 *   - previous academic term
 *   - per-student pre/post state
 *   - locked closing enrollments and newly created enrollments
 *   - previous/new block assignments
 *   - block groups/sections created by the rollover
 *
 * Only the most recent APPLIED batch may be reverted. Once reverted, the
 * manifest remains as an audit record.
 */
const rolloverBatchSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  fromSchoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
    index: true,
  },
  toSchoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
    index: true,
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
  },
  // 'year' = school-year rollover (year levels promoted).
  // 'semester' = same-school-year semester rollover ("sem promote").
  mode: {
    type: String,
    enum: ['year', 'semester'],
    default: 'year',
  },
  status: {
    type: String,
    enum: ['applied', 'reverted'],
    default: 'applied',
    index: true,
  },
  executedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  executedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  revertedAt: {
    type: Date,
    default: null,
  },
  revertedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  previousAcademicTerm: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdBlockGroupIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockGroup',
  }],
  createdBlockSectionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockSection',
  }],
  studentChanges: {
    type: mongoose.Schema.Types.Mixed,
    default: [],
  },
  counts: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  snapshotIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchiveSnapshot',
  }],
  revertAuditLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditLog',
    default: null,
  },
  revertSnapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchiveSnapshot',
    default: null,
  },
}, {
  timestamps: true,
});

rolloverBatchSchema.index({ status: 1, executedAt: -1 });

module.exports = mongoose.model('RolloverBatch', rolloverBatchSchema);

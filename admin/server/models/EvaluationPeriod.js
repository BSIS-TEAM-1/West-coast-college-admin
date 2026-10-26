const mongoose = require('mongoose');

const EvaluationExtensionLogSchema = new mongoose.Schema({
  previousEndAt: { type: Date, required: true },
  newEndAt: { type: Date, required: true },
  reason: { type: String, trim: true, default: '' },
  extendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  extendedByName: { type: String, trim: true, default: '' },
  extendedAt: { type: Date, default: Date.now }
}, { _id: false });

const EvaluationPeriodSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
    index: true
  },
  schoolYear: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
    index: true
  },
  startDate: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: String,
    required: true,
    trim: true,
    default: '08:00'
  },
  startAt: {
    type: Date,
    required: true,
    index: true
  },
  deadlineDate: {
    type: String,
    required: true,
    trim: true
  },
  closingTime: {
    type: String,
    required: true,
    trim: true,
    default: '23:59'
  },
  endAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'open', 'extended', 'closed'],
    default: 'open',
    index: true
  },
  manualState: {
    type: String,
    enum: ['auto', 'draft', 'started', 'extended', 'reopened', 'closed'],
    default: 'auto'
  },
  applicablePrograms: {
    type: [String],
    default: ['All Programs']
  },
  applicableSubjects: {
    type: String,
    trim: true,
    default: 'All Enrolled Subjects'
  },
  applicableProfessors: {
    type: String,
    trim: true,
    default: 'All Assigned Faculty'
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  extensionHistory: {
    type: [EvaluationExtensionLogSchema],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  createdByName: {
    type: String,
    trim: true,
    default: ''
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  updatedByName: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

EvaluationPeriodSchema.index({ schoolYear: 1, semester: 1, createdAt: -1 });

EvaluationPeriodSchema.statics.computeEffectiveStatus = function computeEffectiveStatus(period, now = new Date()) {
  if (!period) return 'closed';
  const currentTime = now instanceof Date ? now : new Date(now);
  const startAt = period.startAt ? new Date(period.startAt) : null;
  const endAt = period.endAt ? new Date(period.endAt) : null;

  if (period.status === 'draft' || period.manualState === 'draft') {
    return 'draft';
  }

  if (period.status === 'closed' || period.manualState === 'closed') {
    return 'closed';
  }

  // Automatically close submissions after the deadline unless an authorized extension is active
  if (endAt && !Number.isNaN(endAt.getTime()) && currentTime > endAt) {
    return 'closed';
  }

  if (
    startAt &&
    !Number.isNaN(startAt.getTime()) &&
    currentTime < startAt &&
    !['started', 'extended', 'reopened'].includes(period.manualState)
  ) {
    return 'scheduled';
  }

  if (period.manualState === 'extended' || period.status === 'extended') {
    return 'extended';
  }

  return 'open';
};

module.exports = mongoose.model('EvaluationPeriod', EvaluationPeriodSchema);

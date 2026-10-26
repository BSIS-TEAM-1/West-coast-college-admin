const mongoose = require('mongoose');

/**
 * EvaluationCompletion tracks whether a student has evaluated a required
 * subject/professor in a given term to unlock grade access, while keeping
 * the link to EvaluationResponse hidden by default (`select: false`) and
 * accessible only via the authorized Registrar Identity Reveal workflow.
 */
const EvaluationCompletionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  studentNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    type: String,
    trim: true,
    default: ''
  },
  yearLevel: {
    type: Number,
    default: null
  },
  sectionCode: {
    type: String,
    trim: true,
    default: ''
  },
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    required: true,
    index: true
  },
  periodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationPeriod',
    default: null,
    index: true
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
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null
  },
  subjectCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  subjectTitle: {
    type: String,
    required: true,
    trim: true
  },
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  professorName: {
    type: String,
    required: true,
    trim: true
  },
  responseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationResponse',
    required: true,
    unique: true,
    select: false
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

EvaluationCompletionSchema.index(
  { studentId: 1, schoolYear: 1, semester: 1, subjectCode: 1 },
  { unique: true }
);

module.exports = mongoose.model('EvaluationCompletion', EvaluationCompletionSchema);

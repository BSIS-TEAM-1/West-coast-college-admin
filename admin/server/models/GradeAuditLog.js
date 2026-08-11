const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Grade Audit Log
 *
 * Records every grade change for compliance and traceability.
 * Each entry captures: who changed the grade, what the old/new values were,
 * and the context (enrollment, subject, student).
 */
const gradeAuditLogSchema = new Schema({
  enrollmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Enrollment',
    required: true,
    index: true
  },
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  studentNumber: {
    type: String,
    required: true,
    index: true
  },
  subjectId: {
    type: Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectCode: {
    type: String,
    required: true,
    trim: true
  },
  // Grade change
  oldGrade: { type: Number, min: 1.0, max: 5.0, default: null },
  newGrade: { type: Number, min: 1.0, max: 5.0, default: null },
  oldRawScore: { type: Number, min: 0, max: 100, default: null },
  newRawScore: { type: Number, min: 0, max: 100, default: null },
  oldRemarks: { type: String, default: '' },
  newRemarks: { type: String, default: '' },
  // Action type
  action: {
    type: String,
    enum: ['grade_entry', 'grade_update', 'grade_clear', 'raw_score_entry', 'submission', 'approval', 'rejection', 'revert'],
    required: true
  },
  // Who made the change
  changedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  changedByRole: {
    type: String,
    trim: true
  },
  // Context
  schoolYear: { type: String, trim: true },
  semester: { type: String, trim: true },
  transmutationTableId: {
    type: Schema.Types.ObjectId,
    ref: 'TransmutationTable',
    default: null
  },
  transmutationTableName: { type: String, default: '' }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false }
});

gradeAuditLogSchema.index({ enrollmentId: 1, subjectId: 1, createdAt: -1 });
gradeAuditLogSchema.index({ studentId: 1, createdAt: -1 });

const GradeAuditLog = mongoose.model('GradeAuditLog', gradeAuditLogSchema);

module.exports = GradeAuditLog;

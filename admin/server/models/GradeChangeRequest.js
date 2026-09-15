const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Grade Change Request
 *
 * When a grade is already Published and needs correction, the professor
 * submits a formal change request. The registrar reviews and approves/rejects.
 * The original grade is never silently overwritten — the change is auditable.
 */
const gradeChangeRequestSchema = new Schema({
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
    trim: true
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
  // Section/block context
  sectionId: {
    type: Schema.Types.ObjectId,
    ref: 'BlockSection',
    default: null
  },
  sectionCode: { type: String, default: '' },
  // Academic context
  schoolYear: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  // Grade values
  currentGrade: { type: Number, min: 1.0, max: 5.0, required: true },
  requestedGrade: { type: Number, min: 1.0, max: 5.0, required: true },
  // Justification
  reason: { type: String, required: true, trim: true },
  supportingInfo: { type: String, default: '', trim: true },
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  // Professor who requested
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  requestedAt: { type: Date, default: Date.now },
  // Registrar who reviewed
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  reviewedAt: { type: Date, default: null },
  reviewRemarks: { type: String, default: '', trim: true },
  // When the grade was actually updated on the enrollment (after approval)
  appliedAt: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

gradeChangeRequestSchema.index({ status: 1, requestedAt: -1 });
gradeChangeRequestSchema.index({ enrollmentId: 1, subjectId: 1, status: 1 });

module.exports = mongoose.model('GradeChangeRequest', gradeChangeRequestSchema);

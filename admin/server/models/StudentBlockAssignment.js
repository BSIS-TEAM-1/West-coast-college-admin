const mongoose = require('mongoose');

const StudentBlockAssignmentSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockSection', required: true },
  semester: { type: String, required: true, enum: ['1st', '2nd', 'Summer'] },
  year: { type: Number, required: true },
  schoolYear: { type: String, match: /^\d{4}-\d{4}$/ },
  status: { type: String, enum: ['ASSIGNED', 'WAITLISTED'], default: 'ASSIGNED' },
  assignedAt: { type: Date, default: Date.now },
  waitlistPriority: { type: Number } // for waitlist
}, {
  timestamps: true
});

StudentBlockAssignmentSchema.index({ studentId: 1, semester: 1, year: 1, schoolYear: 1 }, { unique: true });
StudentBlockAssignmentSchema.index({ sectionId: 1, status: 1 });
StudentBlockAssignmentSchema.index({ sectionId: 1, status: 1, semester: 1, year: 1, assignedAt: 1 });
StudentBlockAssignmentSchema.index({ studentId: 1, sectionId: 1, status: 1 });
StudentBlockAssignmentSchema.index({ studentId: 1, schoolYear: 1, semester: 1, status: 1 });
StudentBlockAssignmentSchema.index({ enrollmentId: 1, semester: 1, status: 1 });

module.exports = mongoose.model('StudentBlockAssignment', StudentBlockAssignmentSchema);

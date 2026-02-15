const mongoose = require('mongoose');

const StudentBlockAssignmentSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockSection', required: true },
  semester: { type: String, required: true, enum: ['1st', '2nd', 'Summer'] },
  year: { type: Number, required: true },
  status: { type: String, enum: ['ASSIGNED', 'WAITLISTED'], default: 'ASSIGNED' },
  assignedAt: { type: Date, default: Date.now },
  waitlistPriority: { type: Number } // for waitlist
}, {
  timestamps: true
});

StudentBlockAssignmentSchema.index({ studentId: 1, semester: 1, year: 1 }, { unique: true });
StudentBlockAssignmentSchema.index({ sectionId: 1, status: 1 });

module.exports = mongoose.model('StudentBlockAssignment', StudentBlockAssignmentSchema);

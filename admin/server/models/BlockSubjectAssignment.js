const mongoose = require('mongoose');

const BlockSubjectAssignmentSchema = new mongoose.Schema({
  blockSectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockSection',
    required: true,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
    index: true
  },
  academicYear: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid academic year format (YYYY-YYYY)'],
    index: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

BlockSubjectAssignmentSchema.index(
  { blockSectionId: 1, subjectId: 1, semester: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model('BlockSubjectAssignment', BlockSubjectAssignmentSchema);

const mongoose = require('mongoose');

const TeachingHoursOverrideSchema = new mongoose.Schema({
  // Professor and subject identification
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  professorName: {
    type: String,
    required: true,
    trim: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  subjectCode: {
    type: String,
    required: true,
    trim: true
  },
  subjectTitle: {
    type: String,
    required: true,
    trim: true
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockSection',
    required: true,
    index: true
  },
  sectionCode: {
    type: String,
    required: true,
    trim: true
  },

  // Academic term context
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
    index: true
  },
  schoolYear: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
    index: true
  },

  // Teaching hours details
  expectedContactHours: {
    type: Number,
    required: true,
    min: 0
  },
  assignedContactHours: {
    type: Number,
    required: true,
    min: 0
  },
  discrepancy: {
    type: Number,
    required: true
  },
  schedule: {
    type: String,
    required: true,
    trim: true
  },
  room: {
    type: String,
    trim: true
  },

  // Subject configuration at time of override (snapshot)
  units: {
    type: Number,
    required: true,
    min: 0
  },
  lecturePeriods: {
    type: Number,
    required: true,
    min: 0
  },
  labPeriods: {
    type: Number,
    required: true,
    min: 0
  },

  // Authorization details
  authorizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  authorizedByName: {
    type: String,
    required: true,
    trim: true
  },
  justification: {
    type: String,
    required: true,
    trim: true,
    minLength: 10,
    maxLength: 1000
  },

  // System metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
TeachingHoursOverrideSchema.index({ professorId: 1, schoolYear: 1, semester: 1 });
TeachingHoursOverrideSchema.index({ authorizedBy: 1, createdAt: -1 });
TeachingHoursOverrideSchema.index({ schoolYear: 1, semester: 1, createdAt: -1 });

module.exports = mongoose.model('TeachingHoursOverride', TeachingHoursOverrideSchema);

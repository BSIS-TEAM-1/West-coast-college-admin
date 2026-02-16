const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  units: {
    type: Number,
    required: true,
    min: 0.5,
    max: 6
  },
  course: {
    type: Number,
    enum: [101, 102, 103, 201]
  },
  yearLevel: {
    type: Number,
    min: 1,
    max: 5
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

SubjectSchema.index({ code: 1 }, { unique: true });
SubjectSchema.index({ course: 1, yearLevel: 1, semester: 1, isActive: 1 });

module.exports = mongoose.model('Subject', SubjectSchema);

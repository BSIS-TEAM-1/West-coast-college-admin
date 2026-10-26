const mongoose = require('mongoose');

const EvaluationIdentityRevealLogSchema = new mongoose.Schema({
  responseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationResponse',
    required: true,
    index: true
  },
  completionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationCompletion',
    required: true
  },
  periodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationPeriod',
    default: null
  },
  semester: {
    type: String,
    required: true,
    trim: true
  },
  schoolYear: {
    type: String,
    required: true,
    trim: true
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
  professorName: {
    type: String,
    required: true,
    trim: true
  },
  revealedStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  revealedStudentNumber: {
    type: String,
    required: true,
    trim: true
  },
  revealedStudentName: {
    type: String,
    required: true,
    trim: true
  },
  registrarId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  registrarUsername: {
    type: String,
    required: true,
    trim: true
  },
  registrarDisplayName: {
    type: String,
    trim: true,
    default: ''
  },
  registrarRole: {
    type: String,
    trim: true,
    default: 'registrar'
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 1000
  },
  ipAddress: {
    type: String,
    trim: true,
    default: ''
  },
  userAgent: {
    type: String,
    trim: true,
    default: ''
  },
  revealedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EvaluationIdentityRevealLog', EvaluationIdentityRevealLogSchema);

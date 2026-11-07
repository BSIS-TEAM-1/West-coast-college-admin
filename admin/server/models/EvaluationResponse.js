const mongoose = require('mongoose');

const QuestionRatingSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  questionText: {
    type: String,
    required: true,
    trim: true
  },
  score: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  emoji: {
    type: String,
    required: true,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

/**
 * EvaluationResponse stores professor evaluation records.
 * Historical records without studentId/teachingAssignmentId remain preserved.
 * Student identity is kept internal and never exposed to professors.
 */
const EvaluationResponseSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null,
    index: true
  },
  teachingAssignmentId: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
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
  academicYear: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
    index: true
  },
  subjectCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  subjectName: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  subjectTitle: {
    type: String,
    required: true,
    trim: true
  },
  // An adviser evaluation can cover every subject taught by that adviser.
  // subjectCode/subjectTitle remain the anchor used by older admin screens;
  // subjectCodes carries the complete group for reporting.
  subjectCodes: {
    type: [String],
    default: []
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockSection',
    default: null
  },
  sectionCode: {
    type: String,
    trim: true,
    default: ''
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
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  professorName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  ratings: {
    type: [QuestionRatingSchema],
    required: true,
    validate: {
      validator(arr) {
        return Array.isArray(arr) && arr.length >= 1;
      },
      message: 'Evaluation must contain question ratings.'
    }
  },
  questionScores: {
    type: [Number],
    required: true,
    validate: {
      validator(arr) {
        return Array.isArray(arr) && arr.length >= 1 && arr.every((n) => Number.isInteger(n) && n >= 1 && n <= 5);
      },
      message: 'Question scores must be integers between 1 and 5.'
    }
  },
  averageRating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

EvaluationResponseSchema.pre('validate', function(next) {
  if (!this.subjectName && this.subjectTitle) {
    this.subjectName = this.subjectTitle;
  } else if (!this.subjectTitle && this.subjectName) {
    this.subjectTitle = this.subjectName;
  }

  if (!this.academicYear && this.schoolYear) {
    this.academicYear = this.schoolYear;
  } else if (!this.schoolYear && this.academicYear) {
    this.schoolYear = this.academicYear;
  }
  next();
});

EvaluationResponseSchema.index({ professorId: 1, schoolYear: 1, semester: 1 });
EvaluationResponseSchema.index({ professorName: 1, schoolYear: 1, semester: 1 });
EvaluationResponseSchema.index({ subjectCode: 1, schoolYear: 1, semester: 1 });
EvaluationResponseSchema.index({ subjectName: 1, schoolYear: 1, semester: 1 });
EvaluationResponseSchema.index({ sectionCode: 1, schoolYear: 1, semester: 1 });
EvaluationResponseSchema.index({ studentId: 1, schoolYear: 1, semester: 1, subjectCode: 1 });

module.exports = mongoose.model('EvaluationResponse', EvaluationResponseSchema);

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const curriculumSchema = new Schema({
  programCode: {
    type: Number,
    required: true,
    enum: [101, 102, 103, 201],
    index: true,
  },
  programName: {
    type: String,
    required: true,
    trim: true,
  },
  version: {
    type: String,
    required: true,
    trim: true,
    default: function () {
      return String(new Date().getFullYear());
    },
  },
  status: {
    type: String,
    enum: ['Active', 'Legacy', 'Draft'],
    default: 'Draft',
    index: true,
  },
  // Subjects that belong to this curriculum version
  subjects: [{
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    code: { type: String, required: true },
    title: { type: String, required: true },
    units: { type: Number, required: true, min: 0.5, max: 6 },
    yearLevel: { type: Number, required: true, min: 1, max: 5 },
    semester: { type: String, enum: ['1st', '2nd', 'Summer'] },
    isRequired: { type: Boolean, default: true },
  }],
  totalUnits: {
    type: Number,
    default: 0,
  },
  effectiveSchoolYear: {
    type: String,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
  },
  supersededByVersion: {
    type: String,
    default: null,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
  },
}, {
  timestamps: true,
});

// Unique: one active curriculum per program
curriculumSchema.index(
  { programCode: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Active' },
    name: 'one_active_curriculum_per_program',
  }
);

// Unique version per program
curriculumSchema.index({ programCode: 1, version: 1 }, { unique: true });

curriculumSchema.statics.findActiveByProgram = function (programCode) {
  return this.findOne({ programCode, status: 'Active' });
};

curriculumSchema.statics.findAllVersions = function (programCode) {
  return this.find({ programCode }).sort({ version: -1 });
};

// Calculate total units from subjects
curriculumSchema.pre('save', function (next) {
  if (this.isModified('subjects')) {
    this.totalUnits = this.subjects.reduce((total, s) => total + s.units, 0);
  }
  next();
});

module.exports = mongoose.model('Curriculum', curriculumSchema);

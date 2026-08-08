const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const academicPeriodSchema = new Schema({
  schoolYear: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
    index: true,
  },
  term: {
    type: String,
    required: true,
    enum: ['1st', '2nd', 'Summer', '1st Trimester', '2nd Trimester', '3rd Trimester', '1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'],
    index: true,
  },
  termType: {
    type: String,
    enum: ['Semester', 'Trimester', 'Quarter', 'Summer'],
    default: 'Semester',
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['Active', 'Archived', 'Upcoming'],
    default: 'Upcoming',
    index: true,
  },
  archivedAt: {
    type: Date,
    default: null,
  },
  archivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
  },
}, {
  timestamps: true,
});

// Only one Active academic period at a time
academicPeriodSchema.index(
  { status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Active' },
    name: 'only_one_active_period',
  }
);

// Unique combination of schoolYear + term
academicPeriodSchema.index(
  { schoolYear: 1, term: 1 },
  { unique: true }
);

// Pre-save hook: when a period becomes Active, archive all others
academicPeriodSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'Active') {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, status: 'Active' },
      { $set: { status: 'Archived', archivedAt: new Date() } }
    );
  }
  next();
});

academicPeriodSchema.statics.findActive = function () {
  return this.findOne({ status: 'Active' });
};

academicPeriodSchema.statics.findBySchoolYear = function (schoolYear) {
  return this.find({ schoolYear }).sort({ term: 1 });
};

module.exports = mongoose.model('AcademicPeriod', academicPeriodSchema);

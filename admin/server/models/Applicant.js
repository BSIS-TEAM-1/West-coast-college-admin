const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schoolRecordSchema = new Schema({
  schoolName: { type: String, required: true, trim: true },
  schoolAddress: { type: String, trim: true },
  yearGraduated: { type: String, required: true, trim: true },
  generalAverage: { type: String, trim: true },
  gradesSummary: { type: String, trim: true },
  strandOrTrack: { type: String, trim: true }
}, { _id: false });

const applicantSchema = new Schema({
  applicantNumber: {
    type: String,
    unique: true,
    index: true
  },
  applicantType: {
    type: String,
    enum: ['New', 'Transferee', 'Returnee'],
    default: 'New',
    index: true
  },
  status: {
    type: String,
    enum: [
      'Draft',
      'Submitted',
      'Incomplete Requirements',
      'For Evaluation',
      'Approved for Enrollment',
      'Enrolled',
      'Rejected',
      'Cancelled'
    ],
    default: 'Submitted',
    index: true
  },

  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  suffix: { type: String, trim: true },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    index: true
  },
  phoneNumber: { type: String, required: true, trim: true },

  birthDate: { type: Date, required: true },
  birthPlace: { type: String, trim: true },
  gender: { type: String, trim: true },
  civilStatus: { type: String, trim: true },
  nationality: { type: String, trim: true },
  religion: { type: String, trim: true },
  currentAddress: { type: String, required: true, trim: true },
  permanentAddress: { type: String, trim: true },

  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  guardianName: { type: String, trim: true },
  guardianRelationship: { type: String, trim: true },
  guardianContactNumber: { type: String, required: true, trim: true },
  emergencyContact: {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    address: { type: String, trim: true }
  },

  academicDetails: {
    elementary: { type: schoolRecordSchema, required: true },
    highSchool: { type: schoolRecordSchema, required: true }
  },

  selectedCourse: {
    type: Number,
    required: true,
    enum: [101, 102, 103, 201],
    index: true
  },
  requestedYearLevel: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    default: '1st'
  },
  schoolYear: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)']
  },

  registrarRemarks: { type: String, trim: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  reviewedAt: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

applicantSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.middleName ? this.middleName + ' ' : ''}${this.lastName}${this.suffix ? ' ' + this.suffix : ''}`.trim();
});

applicantSchema.pre('validate', function(next) {
  if (!this.applicantNumber) {
    const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.applicantNumber = `APP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${randomPart}`;
  }
  next();
});

applicantSchema.index({ createdAt: -1 });
applicantSchema.index({ lastName: 1, firstName: 1 });
applicantSchema.index({ status: 1, createdAt: -1 });
applicantSchema.index({ selectedCourse: 1, status: 1, createdAt: -1 });
applicantSchema.index({ email: 1, createdAt: -1 });
applicantSchema.index({ applicantNumber: 1, status: 1 });

module.exports = mongoose.model('Applicant', applicantSchema);

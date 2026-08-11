const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GPA_MIN = 60;
const GPA_MAX = 100;

const schoolRecordSchema = new Schema({
  schoolName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s,.'\-()]+$/.test(v);
      },
      message: 'School name contains invalid characters.'
    }
  },
  schoolAddress: { type: String, trim: true, maxlength: 255 },
  yearGraduated: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{4}$/.test(v);
      },
      message: 'Year graduated must be a 4-digit year.'
    }
  },
  generalAverage: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        const num = parseFloat(v);
        return !isNaN(num) && num >= GPA_MIN && num <= GPA_MAX;
      },
      message: `General average must be a number between ${GPA_MIN} and ${GPA_MAX}.`
    }
  },
  gradesSummary: { type: String, trim: true, maxlength: 500 },
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
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    index: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        const digits = v.replace(/[^0-9]/g, '');
        return /^(09|\+639)\d{9}$/.test(v) || (digits.length === 11 && digits.startsWith('09')) || (digits.length === 13 && digits.startsWith('639'));
      },
      message: 'Phone number must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).'
    }
  },

  birthDate: { type: Date, required: true },
  birthPlace: { type: String, trim: true },
  gender: { type: String, trim: true },
  civilStatus: { type: String, trim: true },
  nationality: { type: String, trim: true },
  religion: { type: String, trim: true },
  currentAddress: { type: String, required: true, trim: true },
  permanentAddress: { type: String, trim: true },
  currentLocation: {
    regionCode: { type: String, trim: true },
    regionName: { type: String, trim: true },
    provinceCode: { type: String, trim: true },
    provinceName: { type: String, trim: true },
    cityCode: { type: String, trim: true },
    cityName: { type: String, trim: true },
    barangayCode: { type: String, trim: true },
    barangayName: { type: String, trim: true },
    streetAddress: { type: String, trim: true }
  },
  permanentLocation: {
    regionCode: { type: String, trim: true },
    regionName: { type: String, trim: true },
    provinceCode: { type: String, trim: true },
    provinceName: { type: String, trim: true },
    cityCode: { type: String, trim: true },
    cityName: { type: String, trim: true },
    barangayCode: { type: String, trim: true },
    barangayName: { type: String, trim: true },
    streetAddress: { type: String, trim: true }
  },

  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  guardianName: { type: String, trim: true },
  guardianRelationship: { type: String, trim: true },
  guardianContactNumber: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        const digits = v.replace(/[^0-9]/g, '');
        return /^(09|\+639)\d{9}$/.test(v) || (digits.length === 11 && digits.startsWith('09')) || (digits.length === 13 && digits.startsWith('639'));
      },
      message: 'Guardian contact number must be a valid Philippine mobile number.'
    }
  },
  emergencyContact: {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    relationship: { type: String, required: true, trim: true },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v) {
          const digits = v.replace(/[^0-9]/g, '');
          return /^(09|\+639)\d{9}$/.test(v) || (digits.length === 11 && digits.startsWith('09')) || (digits.length === 13 && digits.startsWith('639'));
        },
        message: 'Emergency contact number must be a valid Philippine mobile number.'
      }
    },
    address: { type: String, trim: true, maxlength: 255 }
  },

  academicDetails: {
    elementary: { type: schoolRecordSchema, required: true },
    highSchool: { type: schoolRecordSchema, required: true },
    seniorHighSchool: { type: schoolRecordSchema },
    college: { type: schoolRecordSchema }
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

  const seniorHighSchool = this.academicDetails?.seniorHighSchool;
  if (seniorHighSchool && String(seniorHighSchool.schoolName || '').trim() && !String(seniorHighSchool.strandOrTrack || '').trim()) {
    this.invalidate('academicDetails.seniorHighSchool.strandOrTrack', 'Strand / Track is required for senior high school.');
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

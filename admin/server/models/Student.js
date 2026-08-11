const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');

// ─── Shared sub-schemas (mirrors Applicant model) ───
const schoolRecordSchema = new Schema({
  schoolName: { type: String, trim: true, maxlength: 150 },
  schoolAddress: { type: String, trim: true, maxlength: 255 },
  yearGraduated: { type: String, trim: true },
  generalAverage: { type: String, trim: true },
  gradesSummary: { type: String, trim: true, maxlength: 500 },
  strandOrTrack: { type: String, trim: true }
}, { _id: false });

const locationSchema = new Schema({
  regionCode: { type: String, trim: true },
  regionName: { type: String, trim: true },
  provinceCode: { type: String, trim: true },
  provinceName: { type: String, trim: true },
  cityCode: { type: String, trim: true },
  cityName: { type: String, trim: true },
  barangayCode: { type: String, trim: true },
  barangayName: { type: String, trim: true },
  streetAddress: { type: String, trim: true }
}, { _id: false });

const studentSchema = new Schema({
  // Student Information
  studentNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    match: [/^\d{12}$/, 'Student number must be a 12-digit value (YYYY + course code + sequence)']
  },
  firstName: { 
    type: String, 
    required: true,
    trim: true
  },
  middleName: { 
    type: String, 
    trim: true 
  },
  lastName: { 
    type: String, 
    required: true,
    trim: true
  },
  suffix: { 
    type: String, 
    trim: true 
  },
  
  // Academic Information
  course: { 
    type: Number, 
    required: true,
    enum: [101, 102, 103, 201],
    index: true
  },
  major: {
    type: String,
    trim: true
  },
  curriculumVersion: {
    type: String,
    trim: true,
    default: null,
    description: 'Curriculum version under which the student entered. Set at enrollment, never changes.',
  },
  yearLevel: { 
    type: Number, 
    required: true,
    min: 1,
    max: 5
  },
  section: {
    type: String,
    trim: true
  },
  scholarship: {
    type: String,
    enum: [
      'N/A',
      'CHED Scholarship Programs',
      'OWWA Scholarship Programs',
      'DOST-SEI Undergraduate Scholarships',
      'Tertiary Education Subsidy',
      'GrabScholar College Scholarship',
      'SM College Scholarship (SM Foundation)',
      'Foundation Scholarships'
    ],
    default: 'N/A',
    trim: true
  },
  
  // Enrollment Information
  semester: { 
    type: String, 
    required: true,
    enum: ['1st', '2nd', 'Summer'],
    index: true
  },
  schoolYear: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
    index: true
  },
  studentStatus: { 
    type: String, 
    required: true,
    enum: ['Regular', 'Dropped', 'Returnee', 'Transferee'],
    default: 'Regular'
  },
  classification: {
    type: String,
    enum: ['Regular', 'Irregular', 'Transferee', 'Returning'],
    default: 'Regular',
    index: true
  },
  lifecycleStatus: {
    type: String,
    enum: ['Pending', 'Enrolled', 'Not Enrolled', 'Dropped', 'Inactive', 'Graduated'],
    default: 'Pending',
    index: true
  },
  enrollmentStatus: {
    type: String,
    enum: ['Enrolled', 'Not Enrolled', 'On Leave', 'Dropped'],
    default: 'Not Enrolled'
  },
  corStatus: {
    type: String,
    enum: ['Pending', 'Received', 'Verified'],
    default: 'Pending',
    index: true
  },
  
  // Contact Information
  email: { 
    type: String, 
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    sparse: true,
    unique: true
  },
  contactNumber: { 
    type: String, 
    required: true,
    trim: true
  },
  address: { 
    type: String, 
    required: true,
    trim: true
  },
  permanentAddress: {
    type: String,
    trim: true
  },
  
  // Additional Information
  birthDate: {
    type: Date
  },
  birthPlace: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    trim: true
  },
  civilStatus: {
    type: String,
    enum: ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'],
    trim: true
  },
  nationality: {
    type: String,
    trim: true,
    default: 'Filipino'
  },
  religion: {
    type: String,
    trim: true
  },
  
  // Emergency Contact
  emergencyContact: {
    name: {
      type: String,
      trim: true
    },
    relationship: {
      type: String,
      trim: true
    },
    contactNumber: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    }
  },

  // Family Information (mirrors Applicant model)
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  guardianName: { type: String, trim: true },
  guardianRelationship: { type: String, trim: true },
  guardianContactNumber: { type: String, trim: true },

  // Structured Addresses (mirrors Applicant model)
  currentLocation: { type: locationSchema, default: null },
  permanentLocation: { type: locationSchema, default: null },

  // Academic History (mirrors Applicant model)
  academicDetails: {
    elementary: { type: schoolRecordSchema },
    highSchool: { type: schoolRecordSchema },
    seniorHighSchool: { type: schoolRecordSchema },
    college: { type: schoolRecordSchema }
  },

  // Teaching Assignment
  assignedProfessor: {
    type: String,
    trim: true
  },
  schedule: {
    type: String,
    trim: true
  },

  // Grades
  latestGrade: {
    type: Number,
    min: 1.0,
    max: 5.0
  },
  gradeProfessor: {
    type: String,
    trim: true
  },
  gradeDate: {
    type: Date
  },

  registrationNumber: {
    type: String,
    trim: true,
    index: true
  },

  // Authentication
  password: {
    type: String,
    trim: true
  },
  googleId: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  googleEmail: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true
  },
  googleEmailVerified: {
    type: Boolean,
    default: false
  },
  googlePicture: {
    type: String,
    trim: true
  },
  passwordResetToken: {
    type: String,
    trim: true
  },
  passwordResetExpires: {
    type: Date
  },

  // System Information
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastLogin: {
    type: Date
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.middleName ? this.middleName + ' ' : ''}${this.lastName}${this.suffix ? ' ' + this.suffix : ''}`.trim();
});

// Virtual for current enrollment (if needed)
studentSchema.virtual('currentEnrollment', {
  ref: 'Enrollment',
  localField: '_id',
  foreignField: 'studentId',
  justOne: true,
  match: { isCurrent: true }
});

// Indexes
studentSchema.index({ lastName: 1, firstName: 1 });
studentSchema.index({ course: 1, yearLevel: 1, section: 1 });
studentSchema.index({ lifecycleStatus: 1, studentStatus: 1, enrollmentStatus: 1 });
studentSchema.index({ course: 1, yearLevel: 1, semester: 1, schoolYear: 1, lifecycleStatus: 1 });
studentSchema.index({ schoolYear: 1, semester: 1, course: 1, yearLevel: 1, section: 1 });
studentSchema.index({ schoolYear: 1, semester: 1, enrollmentStatus: 1, lifecycleStatus: 1 });
studentSchema.index({ corStatus: 1, lifecycleStatus: 1, createdAt: -1 });
studentSchema.index({ createdAt: -1 });
studentSchema.index({ classification: 1, course: 1, yearLevel: 1, schoolYear: 1 });

// Pre-save hook to ensure student number format
studentSchema.pre('validate', async function(next) {
  // Validate course field (should already be converted to number by controller)
  const VALID_COURSES = [101, 102, 103, 201];
  
  if (this.course === undefined || this.course === null || this.course === '') {
    return next(new Error('Course is required and cannot be empty'));
  }
  
  // Final validation to ensure it's a valid number
  if (!VALID_COURSES.includes(Number(this.course))) {
    return next(new Error('Invalid course value. Must be 101, 102, 103, or 201'));
  }
  
  if (this.isNew && !this.studentNumber) {
    const StudentNumber = require('../services/studentNumberService');
    try {
      this.studentNumber = await StudentNumber.generateStudentNumber(this.course, this.schoolYear);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Pre-save hook to hash password if modified
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Static method to find by student number
studentSchema.statics.findByStudentNumber = function(studentNumber) {
  return this.findOne({ studentNumber });
};

// Method to get academic standing
studentSchema.methods.getAcademicStanding = function() {
  // Implement logic to determine academic standing
  return 'Good Standing'; // Placeholder
};

// Method to compare password
studentSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

// Method to generate default password
studentSchema.methods.generateDefaultPassword = function() {
  const firstName = this.firstName || '';
  const middleName = this.middleName || '';
  const lastName = this.lastName || '';
  const studentNumber = this.studentNumber || '';
  
  // Get first letter of each name part (lowercase)
  const firstInitial = firstName.charAt(0).toLowerCase();
  const middleInitial = middleName.charAt(0).toLowerCase();
  const lastInitial = lastName.charAt(0).toLowerCase();
  
  // Get last 4 digits of student number
  const lastFourDigits = studentNumber.slice(-4);
  
  // Format: first + middle + last initials + last 4 digits
  return `${firstInitial}${middleInitial}${lastInitial}${lastFourDigits}`;
};

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const studentSchema = new Schema({
  // Student Information
  studentNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
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
studentSchema.index({ studentStatus: 1, enrollmentStatus: 1 });

// Pre-save hook to ensure student number format
studentSchema.pre('validate', async function(next) {
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

// Static method to find by student number
studentSchema.statics.findByStudentNumber = function(studentNumber) {
  return this.findOne({ studentNumber });
};

// Method to get academic standing
studentSchema.methods.getAcademicStanding = function() {
  // Implement logic to determine academic standing
  return 'Good Standing'; // Placeholder
};

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;

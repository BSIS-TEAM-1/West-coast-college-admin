const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const enrollmentSchema = new Schema({
  // Student Reference
  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Student',
    required: true,
    index: true
  },
  studentNumber: {
    type: String,
    required: true,
    index: true
  },
  
  // Academic Information
  schoolYear: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)'],
    index: true
  },
  semester: { 
    type: String, 
    required: true,
    enum: ['1st', '2nd', 'Summer'],
    index: true
  },
  yearLevel: { 
    type: Number, 
    required: true,
    min: 1,
    max: 5
  },
  course: {
    type: String,
    required: true,
    enum: ['BSIT', 'BSCS', 'BSIS', 'BSBA', 'BSA', 'BSE', 'BSED', 'BEED', 'AB', 'BSHM', 'BSTM', 'BSN', 'BSM', 'BSAIS']
  },
  
  // Subjects Information
  subjects: [{
    subjectId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Subject',
      required: true
    },
    code: {
      type: String,
      required: true,
      trim: true
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
    schedule: {
      type: String,
      trim: true
    },
    room: {
      type: String,
      trim: true
    },
    instructor: {
      type: String,
      trim: true
    },
    grade: {
      type: Number,
      min: 1.0,
      max: 5.0,
      default: null
    },
    status: {
      type: String,
      enum: ['Enrolled', 'Dropped', 'Completed', 'Incomplete', 'Removed'],
      default: 'Enrolled'
    },
    remarks: {
      type: String,
      trim: true
    },
    dateEnrolled: {
      type: Date,
      default: Date.now
    },
    dateModified: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Assessment Information
  assessment: {
    tuitionFee: { 
      type: Number, 
      required: true,
      min: 0
    },
    miscFee: { 
      type: Number, 
      required: true,
      min: 0
    },
    otherFees: { 
      type: Number, 
      default: 0,
      min: 0
    },
    totalAmount: { 
      type: Number, 
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    balance: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partially Paid', 'Fully Paid', 'Overdue'],
      default: 'Unpaid'
    },
    paymentHistory: [{
      amount: Number,
      orNumber: String,
      paymentDate: {
        type: Date,
        default: Date.now
      },
      receivedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin'
      },
      paymentMethod: {
        type: String,
        enum: ['Cash', 'Check', 'Bank Transfer', 'Online Payment', 'Installment'],
        default: 'Cash'
      },
      remarks: String
    }]
  },
  
  // Enrollment Status
  status: {
    type: String,
    enum: ['Pending', 'Enrolled', 'Dropped', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  isCurrent: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Document Tracking
  documents: [{
    name: String,
    fileUrl: String,
    status: {
      type: String,
      enum: ['Submitted', 'Verified', 'Rejected'],
      default: 'Submitted'
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin'
    },
    remarks: String,
    dateSubmitted: {
      type: Date,
      default: Date.now
    },
    dateVerified: Date
  }],
  
  // System Information
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
enrollmentSchema.index({ studentId: 1, schoolYear: 1, semester: 1, isCurrent: 1 });
enrollmentSchema.index({ 'subjects.subjectId': 1 });
enrollmentSchema.index({ 'assessment.paymentStatus': 1 });

// Virtual for total units
enrollmentSchema.virtual('totalUnits').get(function() {
  return this.subjects.reduce((total, subject) => {
    return total + (subject.status === 'Dropped' ? 0 : subject.units);
  }, 0);
});

// Virtual for total grade points
enrollmentSchema.virtual('totalGradePoints').get(function() {
  return this.subjects.reduce((total, subject) => {
    return total + (subject.grade ? subject.units * subject.grade : 0);
  }, 0);
});

// Virtual for GPA
enrollmentSchema.virtual('gpa').get(function() {
  const totalUnits = this.totalUnits;
  return totalUnits > 0 ? (this.totalGradePoints / totalUnits).toFixed(2) : 0;
});

// Pre-save hook to update total amount and balance
enrollmentSchema.pre('save', function(next) {
  // Calculate total amount if not set
  if (this.isNew || this.isModified('assessment')) {
    this.assessment.totalAmount = this.assessment.tuitionFee + 
                                this.assessment.miscFee + 
                                this.assessment.otherFees;
    
    // Calculate balance (total amount - payments)
    const totalPaid = this.assessment.paymentHistory.reduce((sum, payment) => {
      return sum + payment.amount;
    }, 0);
    
    this.assessment.balance = this.assessment.totalAmount - totalPaid - this.assessment.discount;
    
    // Update payment status
    if (this.assessment.balance <= 0) {
      this.assessment.paymentStatus = 'Fully Paid';
    } else if (totalPaid > 0) {
      this.assessment.paymentStatus = 'Partially Paid';
    } else {
      this.assessment.paymentStatus = 'Unpaid';
    }
  }
  
  // Update isCurrent flag
  if (this.isNew || this.isModified('status') || this.isModified('isCurrent')) {
    if (this.status === 'Enrolled' && this.isCurrent) {
      // Set other enrollments for this student as not current
      this.constructor.updateMany(
        { 
          studentId: this.studentId,
          _id: { $ne: this._id },
          isCurrent: true
        },
        { $set: { isCurrent: false } }
      ).exec();
    }
  }
  
  next();
});

// Static method to find current enrollment
enrollmentSchema.statics.findCurrentEnrollment = function(studentId, schoolYear, semester) {
  return this.findOne({
    studentId,
    schoolYear,
    semester,
    isCurrent: true,
    status: { $in: ['Enrolled', 'Pending'] }
  });
};

// Method to add a subject to enrollment
enrollmentSchema.methods.addSubject = function(subjectData) {
  this.subjects.push(subjectData);
  return this.save();
};

// Method to update subject grade
enrollmentSchema.methods.updateSubjectGrade = function(subjectId, grade, updatedBy) {
  const subject = this.subjects.id(subjectId);
  if (subject) {
    subject.grade = grade;
    subject.dateModified = Date.now();
    this.updatedBy = updatedBy;
    return this.save();
  }
  throw new Error('Subject not found in this enrollment');
};

// Method to record payment
enrollmentSchema.methods.recordPayment = function(paymentData) {
  this.assessment.paymentHistory.push(paymentData);
  
  // Recalculate balance
  const totalPaid = this.assessment.paymentHistory.reduce((sum, payment) => {
    return sum + payment.amount;
  }, 0);
  
  this.assessment.balance = this.assessment.totalAmount - totalPaid - this.assessment.discount;
  
  // Update payment status
  if (this.assessment.balance <= 0) {
    this.assessment.paymentStatus = 'Fully Paid';
  } else {
    this.assessment.paymentStatus = 'Partially Paid';
  }
  
  return this.save();
};

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

module.exports = Enrollment;

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
  curriculumId: {
    type: Schema.Types.ObjectId,
    ref: 'Curriculum',
    default: null,
    index: true
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
    // Non-numerical grade mark for special cases (INC, DRP, W, FA, NG).
    // When set, grade should be null. Displayed instead of the numerical grade.
    gradeMark: {
      type: String,
      enum: ['INC', 'DRP', 'W', 'FA', 'NG', null],
      default: null
    },
    status: {
      type: String,
      enum: ['Enrolled', 'Dropped', 'Completed', 'Incomplete', 'Removed'],
      default: 'Enrolled'
    },
    // Per-subject grade submission status — allows different professors
    // teaching different subjects in the same enrollment to submit independently.
    submissionStatus: {
      type: String,
      enum: ['Draft', 'Submitted', 'Verified', 'Published', 'Returned'],
      default: 'Draft'
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
    },
    // Raw score (0-100) entered by professor before transmutation
    rawScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    // Transmutation table used to convert rawScore → grade (for audit)
    transmutationTableId: {
      type: Schema.Types.ObjectId,
      ref: 'TransmutationTable',
      default: null
    },
    // ── Registrar lifecycle metadata (additive; see below) ──────────────
    // Who added this subject entry and under what override, if any.
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    overrideReason: {
      type: String,
      trim: true,
      default: null
    },
    overriddenBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    // Drop metadata. A dropped entry is NEVER removed — status, grade, and
    // these fields together are the official record of the attempt.
    droppedAt: {
      type: Date,
      default: null
    },
    droppedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    dropReason: {
      type: String,
      trim: true,
      default: null
    },
    // Section the student actually sat in when it was not their own block's
    // (block membership does not restrict individual subject enrollment).
    sectionCode: {
      type: String,
      trim: true,
      default: null
    },
    // On a retake entry, a snapshot of the attempt being retaken. The source
    // record is left untouched; this is only a pointer back to it.
    retakeOf: {
      enrollmentId: {
        type: Schema.Types.ObjectId,
        ref: 'Enrollment',
        default: null
      },
      subjectEntryId: {
        type: Schema.Types.ObjectId,
        default: null
      },
      schoolYear: { type: String, default: null },
      semester: { type: String, default: null },
      status: { type: String, default: null },
      grade: { type: Number, default: null },
      gradeMark: { type: String, default: null }
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
    enum: ['Pending', 'Enrolled', 'Dropped', 'Completed', 'Retained', 'Graduated', 'Cancelled'],
    default: 'Pending'
  },
  isCurrent: {
    type: Boolean,
    default: true,
    index: true
  },

  // Grade Submission Workflow
  // Tracks the lifecycle of grades for this enrollment:
  // Draft → Submitted → Verified → Published
  // Returned (registrar sends back to professor for correction)
  // Rejected (change request rejected)
  gradeSubmission: {
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Verified', 'Published', 'Returned', 'Rejected'],
      default: 'Draft',
      index: true
    },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewRemarks: { type: String, trim: true, default: '' }
  },

  // Immutability (Academic Year Rollover)
  // Once lockedAt is set, this record is a read-only historical snapshot and can never be modified again.
  lockedAt: {
    type: Date,
    default: null,
    index: true
  },
  lockedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  rolloverBatchId: {
    type: String,
    default: null,
    index: true
  },
  previousEnrollmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Enrollment',
    default: null
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
  
  // Program shift provenance. A program shift CLOSES the old enrollment
  // instead of deleting it, so every subject, grade and drop record stays
  // readable. This field records where the student moved to, and is what the
  // Enrollment History UI uses to label the old program's subjects.
  shiftedTo: {
    course: { type: Number, default: null },
    programLabel: { type: String, trim: true, default: null },
    shiftedAt: { type: Date, default: null },
    reason: { type: String, trim: true, default: null },
  },

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
enrollmentSchema.index({ schoolYear: 1, semester: 1, course: 1, yearLevel: 1, status: 1 });
enrollmentSchema.index({ 'subjects.subjectId': 1, schoolYear: 1, semester: 1, status: 1 });
enrollmentSchema.index({ 'subjects.instructor': 1, schoolYear: 1, semester: 1, status: 1 });
enrollmentSchema.index({ studentId: 1, status: 1, isCurrent: 1, createdAt: -1 });
enrollmentSchema.index({ 'subjects.submissionStatus': 1 });

// Compute aggregate enrollment-level grade submission status from per-subject statuses.
// Priority: Returned > Submitted > Verified > Published > Draft
// - If any subject is Returned → 'Returned'
// - If any subject is Submitted → 'Submitted'
// - If all non-draft subjects are Verified (no Submitted/Returned) → 'Verified'
// - If all non-draft subjects are Published → 'Published'
// - Otherwise → 'Draft'
enrollmentSchema.statics.computeAggregateSubmissionStatus = function(subjects) {
  const active = (subjects || []).filter(s => s.status !== 'Dropped' && s.status !== 'Removed');
  if (active.length === 0) return 'Draft';

  const statuses = active.map(s => s.submissionStatus || 'Draft');
  if (statuses.includes('Returned')) return 'Returned';
  if (statuses.includes('Submitted')) return 'Submitted';

  const nonDraft = statuses.filter(s => s !== 'Draft');
  if (nonDraft.length === 0) return 'Draft';
  if (nonDraft.every(s => s === 'Verified')) return 'Verified';
  if (nonDraft.every(s => s === 'Published')) return 'Published';

  // Mixed verified/published without submitted/returned
  return 'Verified';
};

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

// Immutability guard (Academic Year Rollover architecture):
// A locked enrollment is a permanent historical record. Any attempt to modify it is rejected.
// The locking write itself (which sets lockedAt) is allowed; everything after is read-only.
enrollmentSchema.pre('save', function(next) {
  if (!this.isNew && this.lockedAt && !this.isModified('lockedAt')) {
    return next(new Error('This enrollment is locked as an immutable historical record and cannot be modified.'));
  }
  next();
});

// Query-level guard: locked enrollments can never be matched by update/delete queries.
function excludeLockedRecords() {
  const filter = this.getFilter();
  if (!Object.prototype.hasOwnProperty.call(filter, 'lockedAt') && !this.getOptions().allowLocked) {
    this.where({ lockedAt: null });
  }
}

enrollmentSchema.pre('findOneAndUpdate', excludeLockedRecords);
enrollmentSchema.pre('updateOne', excludeLockedRecords);
enrollmentSchema.pre('updateMany', excludeLockedRecords);
enrollmentSchema.pre('findOneAndDelete', excludeLockedRecords);
enrollmentSchema.pre('deleteOne', { document: false, query: true }, excludeLockedRecords);
enrollmentSchema.pre('deleteMany', excludeLockedRecords);

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
      // Set other enrollments for this student as not current. Keep this write
      // inside the caller's transaction so a rollover cannot race its own
      // enrollment writes and fail with a transaction write conflict.
      const session = this.$session();
      this.constructor.updateMany(
        {
          studentId: this.studentId,
          _id: { $ne: this._id },
          isCurrent: true
        },
        { $set: { isCurrent: false } },
        session ? { session } : undefined
      ).exec().then(() => next()).catch(next);
      return;
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

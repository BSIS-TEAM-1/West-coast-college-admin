const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Student Schema
const studentSchema = new Schema({
  studentNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  firstName: { 
    type: String, 
    required: true 
  },
  middleName: String,
  lastName: { 
    type: String, 
    required: true 
  },
  suffix: String,
  course: { 
    type: String, 
    required: true 
  },
  yearLevel: { 
    type: Number, 
    required: true 
  },
  semester: { 
    type: String, 
    enum: ['1st', '2nd', 'Summer'],
    required: true 
  },
  schoolYear: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  contactNumber: { 
    type: String, 
    required: true 
  },
  address: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['New', 'Old', 'Transferee'],
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Counter for student number generation
const counterSchema = new Schema({
  _id: { 
    type: String, 
    required: true 
  },
  seq: { 
    type: Number, 
    default: 0 
  }
});

// Enrollment Schema
const enrollmentSchema = new Schema({
  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Student',
    required: true 
  },
  schoolYear: { 
    type: String, 
    required: true 
  },
  semester: { 
    type: String, 
    enum: ['1st', '2nd', 'Summer'],
    required: true 
  },
  subjects: [{
    subjectId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Subject',
      required: true 
    },
    code: String,
    title: String,
    units: Number,
    schedule: String,
    room: String,
    instructor: String,
    grade: {
      type: Number,
      min: 1.0,
      max: 5.0
    },
    status: {
      type: String,
      enum: ['Enrolled', 'Dropped', 'Completed'],
      default: 'Enrolled'
    }
  }],
  totalUnits: { 
    type: Number, 
    required: true 
  },
  assessment: {
    tuitionFee: { type: Number, required: true },
    miscFee: { type: Number, required: true },
    otherFees: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partially Paid', 'Fully Paid'],
      default: 'Unpaid'
    }
  },
  status: {
    type: String,
    enum: ['Pending', 'Enrolled', 'Dropped', 'Completed'],
    default: 'Pending'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create models
const Student = mongoose.model('Student', studentSchema);
const Counter = mongoose.model('Counter', counterSchema);
const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

module.exports = { Student, Counter, Enrollment };

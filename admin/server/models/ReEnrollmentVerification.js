const mongoose = require('mongoose');

/**
 * ReEnrollmentVerification — one verification challenge per student and
 * target term. The registrar asks the server to send a six-digit code to the
 * student's available email and mobile channels; the student reads it back to
 * the registrar, who enters it here.
 *
 * The code itself is never stored or returned. Only a keyed hash is kept. A
 * successful verification opens a short window during which the registrar can
 * assign the student's block for that term. The assignment path consumes the
 * record so a code cannot be replayed for a later enrollment.
 */
const reEnrollmentVerificationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  schoolYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/,
  },
  semester: {
    type: String,
    required: true,
    enum: ['1st', '2nd', 'Summer'],
  },
  codeHash: {
    type: String,
    required: true,
  },
  codeExpiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  inAppCode: {
    type: String,
    default: null,
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastSentAt: {
    type: Date,
    default: null,
  },
  sentVia: {
    type: [String],
    enum: ['email', 'sms', 'app'],
    default: [],
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
  verificationExpiresAt: {
    type: Date,
    default: null,
    index: true,
  },
  consumedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

reEnrollmentVerificationSchema.index(
  { studentId: 1, schoolYear: 1, semester: 1 },
  { unique: true }
);

module.exports = mongoose.model('ReEnrollmentVerification', reEnrollmentVerificationSchema);

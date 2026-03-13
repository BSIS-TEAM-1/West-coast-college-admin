const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const additionalInfoSchema = new mongoose.Schema({
  bio: { type: String, trim: true, default: '' },
  secondPhone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  emergencyContact: { type: String, trim: true, default: '' },
  emergencyRelationship: { type: String, trim: true, default: '' },
  emergencyPhone: { type: String, trim: true, default: '' },
  bloodType: { type: String, trim: true, default: '' },
  allergies: { type: String, trim: true, default: '' },
  medicalConditions: { type: String, trim: true, default: '' },
  skills: { type: String, trim: true, default: '' }
}, { _id: false })

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  displayName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  emailVerified: { type: Boolean, default: false },
  emailVerificationCodeHash: { type: String, default: '', select: false },
  emailVerificationExpiresAt: { type: Date, default: null, select: false },
  primaryLoginMethod: {
    type: String,
    enum: ['username', 'email'],
    default: 'username'
  },
  loginEmailVerificationEnabled: { type: Boolean, default: false },
  loginEmailVerificationCodeHash: { type: String, default: '', select: false },
  loginEmailVerificationExpiresAt: { type: Date, default: null, select: false },
  loginEmailVerificationChallengeHash: { type: String, default: '', select: false },
  loginEmailVerificationDeviceId: { type: String, default: '', select: false },
  loginEmailVerificationAuthProvider: {
    type: String,
    enum: ['', 'password', 'google'],
    default: '',
    select: false
  },
  pendingEmailChange: { type: String, trim: true, lowercase: true, default: '', select: false },
  pendingEmailChangeCodeHash: { type: String, default: '', select: false },
  pendingEmailChangeExpiresAt: { type: Date, default: null, select: false },
  phone: { type: String, trim: true, default: '' },
  phoneVerified: { type: Boolean, default: false },
  phoneVerificationCodeHash: { type: String, default: '', select: false },
  phoneVerificationExpiresAt: { type: Date, default: null, select: false },
  avatar: { 
    type: String, 
    default: '' 
  },
  avatarMimeType: { type: String, default: '' },
  additionalInfo: {
    type: additionalInfoSchema,
    default: () => ({})
  },
  accountType: {
    type: String,
    enum: ['admin', 'registrar', 'professor'],
    default: 'admin'
  },
  uid: {
    type: String,
    required: function() {
      // Only required for new documents created after this schema change
      return this.isNew;
    },
    default: function() {
      // Generate UID for new documents
      if (this.isNew) {
        const currentYear = new Date().getFullYear();
        const randomCount = Math.floor(Math.random() * 900) + 100;
        return `1${currentYear}${randomCount.toString().padStart(3, '0')}1430`;
      }
      return undefined;
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  createdBy: {
    type: String,
    default: 'Super Admin'
  }
}, {
  timestamps: true,
})

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password)
}

module.exports = mongoose.model('Admin', adminSchema)

const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

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
  avatar: { 
    type: String, 
    default: '' 
  },
  avatarMimeType: { type: String, default: '' },
  accountType: {
    type: String,
    enum: ['admin', 'registrar'],
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

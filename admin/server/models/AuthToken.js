const mongoose = require('mongoose')

const authTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  accountType: {
    type: String,
    enum: ['admin', 'registrar', 'professor'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      // Token expires in 24 hours
      return new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  deviceId: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  invalidationReason: {
    type: String,
    enum: ['manual_logout', 'new_ip_login', 'new_login', 'admin_revoke'],
    default: null
  },
  invalidatedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// Index for cleanup of expired tokens
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Index for admin lookup
authTokenSchema.index({ adminId: 1 })


module.exports = mongoose.model('AuthToken', authTokenSchema)

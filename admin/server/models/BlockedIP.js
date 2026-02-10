const mongoose = require('mongoose')

const blockedIPSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
    unique: true,
    match: /^(\d{1,3}\.){3}\d{1,3}$/
  },
  reason: {
    type: String,
    required: true,
    maxlength: 255
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  blockedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },
  isActive: {
    type: Boolean,
    default: true
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
})

// Index for active blocks that haven't expired
blockedIPSchema.index({ isActive: 1, expiresAt: 1 })
blockedIPSchema.index({ ipAddress: 1 })

// Virtual to check if IP block is expired
blockedIPSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt && this.isActive
})

module.exports = mongoose.model('BlockedIP', blockedIPSchema)

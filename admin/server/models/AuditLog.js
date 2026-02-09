const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 
      'VIEW', 'EXPORT', 'UPLOAD', 'DOWNLOAD', 'APPROVE', 
      'REJECT', 'ARCHIVE', 'RESTORE', 'BAN', 'UNBAN'
    ]
  },
  resourceType: {
    type: String,
    required: true,
    enum: [
      'ADMIN', 'STUDENT', 'FACULTY', 'COURSE', 'REGISTRATION', 
      'ANNOUNCEMENT', 'DOCUMENT', 'SYSTEM', 'PROFILE', 'ACCOUNT'
    ]
  },
  resourceId: {
    type: String,
    required: true
  },
  resourceName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  performedByRole: {
    type: String,
    enum: ['admin', 'registrar'],
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
    default: 'SUCCESS'
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW'
  }
}, {
  timestamps: true,
})

// Indexes for common queries
auditLogSchema.index({ performedBy: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ resourceType: 1, createdAt: -1 })
auditLogSchema.index({ severity: 1, createdAt: -1 })
auditLogSchema.index({ createdAt: -1 })

module.exports = mongoose.model('AuditLog', auditLogSchema)

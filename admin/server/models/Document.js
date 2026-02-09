const mongoose = require('mongoose')

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'POLICY', 'HANDBOOK', 'ACCREDITATION', 'FORM', 
      'GUIDELINE', 'PROCEDURE', 'REPORT', 'OTHER'
    ]
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: 100
  },
  fileName: {
    type: String,
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  version: {
    type: String,
    default: '1.0'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  allowedRoles: [{
    type: String,
    enum: ['admin', 'registrar', 'faculty', 'staff', 'student']
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  effectiveDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED', 'SUPERSEDED'],
    default: 'DRAFT'
  },
  supersededBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastDownloadedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true,
})

// Indexes for common queries
documentSchema.index({ category: 1, status: 1 })
documentSchema.index({ tags: 1 })
documentSchema.index({ isPublic: 1, status: 1 })
documentSchema.index({ createdBy: 1, createdAt: -1 })
documentSchema.index({ title: 'text', description: 'text' })

// Virtual to check if document is currently effective
documentSchema.virtual('isCurrentlyEffective').get(function() {
  const now = new Date()
  if (this.status !== 'ACTIVE') return false
  if (this.effectiveDate && now < this.effectiveDate) return false
  if (this.expiryDate && now > this.expiryDate) return false
  return true
})

module.exports = mongoose.model('Document', documentSchema)

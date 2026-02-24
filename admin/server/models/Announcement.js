const mongoose = require('mongoose')

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'urgent', 'maintenance'],
    default: 'info'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'students', 'faculty', 'staff', 'admin'],
    default: 'all'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  sentEmail: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },
  media: [{
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true
    },
    url: {
      type: String,
      required: true
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
    caption: {
      type: String,
      trim: true,
      maxlength: 500
    }
  }]
}, {
  timestamps: true,
})

// Index for active announcements that haven't expired
announcementSchema.index({ isActive: 1, expiresAt: 1 })

// Virtual to check if announcement is expired
announcementSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt
})

// Pre-find middleware to automatically filter expired announcements
announcementSchema.pre(/^find/, function() {
  this.find({
    $or: [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: null }
    ]
  })
})

module.exports = mongoose.model('Announcement', announcementSchema)

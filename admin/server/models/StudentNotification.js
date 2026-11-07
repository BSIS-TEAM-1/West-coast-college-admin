const mongoose = require('mongoose')

/**
 * Persistent, per-student in-app notification.
 *
 * The record is the delivery: once it is written, the student sees it in the
 * mobile app on the next fetch. `eventKey` makes creation idempotent, so a
 * retry after a transient database failure cannot produce a duplicate.
 */
const studentNotificationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  studentNumber: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: ['STATUS_UPDATE', 'ACADEMIC', 'SYSTEM'],
    default: 'STATUS_UPDATE',
    index: true
  },
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
    maxlength: 2000
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  eventKey: {
    type: String,
    required: true,
    trim: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

studentNotificationSchema.index({ studentId: 1, eventKey: 1 }, { unique: true })
studentNotificationSchema.index({ studentId: 1, isRead: 1, createdAt: -1 })
studentNotificationSchema.index({ studentId: 1, createdAt: -1 })

module.exports = mongoose.model('StudentNotification', studentNotificationSchema)

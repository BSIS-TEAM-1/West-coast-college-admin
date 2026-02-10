const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
    unique: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  compressedPath: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  compressedSize: {
    type: Number,
    required: true
  },
  documentCount: {
    type: Number,
    required: true
  },
  collections: [{
    name: String,
    count: Number
  }],
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress'
  },
  backupType: {
    type: String,
    enum: ['manual', 'scheduled', 'initial'],
    default: 'manual'
  },
  triggeredBy: {
    type: String,
    default: 'system'
  },
  error: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
backupSchema.index({ createdAt: -1 });
backupSchema.index({ status: 1 });
backupSchema.index({ backupType: 1 });

module.exports = mongoose.model('Backup', backupSchema);

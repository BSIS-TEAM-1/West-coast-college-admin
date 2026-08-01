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
    required: false
  },
  compressedSize: {
    type: Number,
    required: false
  },
  checksum: {
    type: String,
    default: null
  },
  jsonChecksum: {
    type: String,
    default: null
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'missing'],
    default: 'pending'
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  durationMs: {
    type: Number,
    default: null
  },
  isProtected: {
    type: Boolean,
    default: false
  },
  storageProvider: {
    type: String,
    default: 'local'
  },
  appVersion: { type: String, default: 'unknown' },
  schemaVersion: { type: String, default: '1' },
  backupEngineVersion: { type: String, default: '2.0.0' },
  backupFormatVersion: { type: String, default: '1.0' },
  isEncrypted: { type: Boolean, default: false },
  encryptionProvider: { type: String, default: null },
  validationResults: { type: mongoose.Schema.Types.Mixed, default: null },
  performance: {
    exportDurationMs: { type: Number, default: null },
    compressionDurationMs: { type: Number, default: null },
    encryptionDurationMs: { type: Number, default: null },
    verificationDurationMs: { type: Number, default: null },
    storageWriteBytesPerSecond: { type: Number, default: null },
    storageReadBytesPerSecond: { type: Number, default: null }
  },
  documentCount: {
    type: Number,
    required: false
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
    enum: ['manual', 'scheduled', 'initial', 'emergency', 'legacy'],
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

// Custom validation to ensure required fields are present when status is 'completed'
backupSchema.pre('save', function(next) {
  if (this.status === 'completed') {
    if (!Number.isFinite(this.size) || !Number.isFinite(this.compressedSize) || !Number.isFinite(this.documentCount)) {
      return next(new Error('Completed backup must have size, compressedSize, and documentCount'));
    }
  }
  next();
});

// Index for efficient queries
backupSchema.index({ createdAt: -1 });
backupSchema.index({ status: 1 });
backupSchema.index({ backupType: 1 });
backupSchema.index({ verificationStatus: 1 });
backupSchema.index({ isProtected: 1, createdAt: -1 });

module.exports = mongoose.model('Backup', backupSchema);

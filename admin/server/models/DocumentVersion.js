const mongoose = require('mongoose')

const documentVersionSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },
  versionNumber: {
    type: Number,
    required: true
  },
  versionLabel: {
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
  filePath: {
    type: String,
    required: true
  },
  storageProvider: {
    type: String,
    enum: ['local', 'supabase'],
    default: 'local'
  },
  storageKey: {
    type: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  changeSummary: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true, timestamps: { createdAt: true, updatedAt: false } })

documentVersionSchema.index({ documentId: 1, versionNumber: -1 })

module.exports = mongoose.model('DocumentVersion', documentVersionSchema)

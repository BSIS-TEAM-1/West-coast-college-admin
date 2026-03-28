const mongoose = require('mongoose')

const DOCUMENT_FOLDER_SEGMENT_TYPES = ['DOCUMENT_TYPE', 'DEPARTMENT', 'DATE', 'CUSTOM']

const documentFolderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  segmentType: {
    type: String,
    enum: DOCUMENT_FOLDER_SEGMENT_TYPES,
    default: 'CUSTOM'
  },
  segmentValue: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    maxlength: 300
  },
  parentFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentFolder',
    default: null
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

documentFolderSchema.index({ parentFolder: 1, name: 1 })
documentFolderSchema.index({ segmentType: 1, updatedAt: -1 })
documentFolderSchema.index({ name: 'text', description: 'text', segmentValue: 'text' })

const DocumentFolder = mongoose.model('DocumentFolder', documentFolderSchema)

module.exports = DocumentFolder
module.exports.DOCUMENT_FOLDER_SEGMENT_TYPES = DOCUMENT_FOLDER_SEGMENT_TYPES

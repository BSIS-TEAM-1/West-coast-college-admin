const mongoose = require('mongoose')

const DOCUMENT_FOLDER_SEGMENT_TYPES = ['DOCUMENT_TYPE', 'DEPARTMENT', 'DATE', 'CUSTOM']
const DOCUMENT_FOLDER_CATEGORIES = ['POLICY', 'HANDBOOK', 'ACCREDITATION', 'FORM', 'GUIDELINE', 'PROCEDURE', 'REPORT', 'OTHER']

const documentFolderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  category: {
    type: String,
    enum: DOCUMENT_FOLDER_CATEGORIES,
    default: 'OTHER'
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
  visibility: {
    type: String,
    enum: ['public', 'restricted', 'private'],
    default: 'public'
  },
  allowedRoles: [{
    type: String,
    enum: ['admin', 'registrar', 'professor', 'staff', 'faculty']
  }],
  departmentRestriction: [{
    type: String,
    enum: ['REGISTRAR', 'FINANCE', 'ACADEMIC_AFFAIRS', 'STUDENT_AFFAIRS', 'ADMISSIONS', 'IT', 'HUMAN_RESOURCES', 'LIBRARY', 'GENERAL']
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isTrashed: {
    type: Boolean,
    default: false
  },
  trashedAt: {
    type: Date
  },
  trashedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true,
})

documentFolderSchema.index({ parentFolder: 1, name: 1 })
documentFolderSchema.index({ segmentType: 1, updatedAt: -1 })
documentFolderSchema.index({ isTrashed: 1, parentFolder: 1, updatedAt: -1 })
documentFolderSchema.index({ name: 'text', description: 'text', segmentValue: 'text' })

const DocumentFolder = mongoose.model('DocumentFolder', documentFolderSchema)

module.exports = DocumentFolder
module.exports.DOCUMENT_FOLDER_SEGMENT_TYPES = DOCUMENT_FOLDER_SEGMENT_TYPES
module.exports.DOCUMENT_FOLDER_CATEGORIES = DOCUMENT_FOLDER_CATEGORIES

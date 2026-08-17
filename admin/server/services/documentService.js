const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const mongoose = require('mongoose')
const { normalizeAccountType } = require('../authorization')

const Document = require('../models/Document')
const DocumentFolder = require('../models/DocumentFolder')
const storage = require('./documentStorageService')

const ARCHIVE_ACTOR_POPULATE = 'username displayName avatar avatarMimeType'

const UPLOADS_ROOT_DIR = storage.UPLOADS_ROOT_DIR
const DOCUMENT_UPLOADS_DIR = storage.DOCUMENT_UPLOADS_DIR

const parsedArchiveBinRetentionDays = Number(process.env.ARCHIVE_BIN_RETENTION_DAYS || 30)
const ARCHIVE_BIN_RETENTION_DAYS = Number.isFinite(parsedArchiveBinRetentionDays) && parsedArchiveBinRetentionDays > 0
  ? Math.max(30, Math.floor(parsedArchiveBinRetentionDays))
  : 30
const ARCHIVE_BIN_RETENTION_MS = ARCHIVE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000

// ─── File helpers ─────────────────────────────────────────────

function sanitizeStorageFileName(fileName) {
  const trimmedFileName = String(fileName || '').trim()
  const safeFileName = trimmedFileName
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')

  return safeFileName || 'document.bin'
}

function decodeBase64FileData(fileData) {
  const rawValue = String(fileData || '').trim()
  if (!rawValue) {
    const error = new Error('Document file data is required.')
    error.statusCode = 400
    throw error
  }

  const dataUriMatch = rawValue.match(/^data:([^;,]+);base64,(.+)$/i)
  const detectedMimeType = dataUriMatch ? String(dataUriMatch[1] || '').trim().toLowerCase() : ''
  const encodedPayload = (dataUriMatch ? dataUriMatch[2] : rawValue).replace(/\s+/g, '')

  let fileBuffer
  try {
    fileBuffer = Buffer.from(encodedPayload, 'base64')
  } catch (error) {
    const decodeError = new Error('Document file data must be valid base64.')
    decodeError.statusCode = 400
    throw decodeError
  }

  const normalizedInput = encodedPayload.replace(/=+$/g, '')
  const normalizedDecoded = fileBuffer.toString('base64').replace(/=+$/g, '')
  if (!fileBuffer.length || normalizedDecoded !== normalizedInput) {
    const validationError = new Error('Document file data must be valid base64.')
    validationError.statusCode = 400
    throw validationError
  }

  return { buffer: fileBuffer, detectedMimeType }
}

async function persistDocumentUpload({ originalFileName, fileData, mimeType, fileSize, department, folderId }) {
  const { buffer, detectedMimeType } = decodeBase64FileData(fileData)
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase()
  if (detectedMimeType && normalizedMimeType && detectedMimeType !== normalizedMimeType) {
    const mimeError = new Error('Document MIME type does not match the uploaded file data.')
    mimeError.statusCode = 400
    throw mimeError
  }

  if (Number(fileSize) !== buffer.length) {
    const sizeError = new Error('Document size does not match the uploaded file data.')
    sizeError.statusCode = 400
    throw sizeError
  }

  const result = await storage.upload({
    buffer,
    originalFileName,
    mimeType,
    department: department || 'GENERAL',
    folderId: folderId || null,
  })

  const storedFileName = path.basename(result.key)

  return {
    fileName: storedFileName,
    filePath: result.key,
    storageProvider: result.provider,
  }
}

// Accepts a multer file object (req.file) directly — used by the multipart
// upload endpoints. Avoids the base64 round-trip that persistDocumentUpload
// requires, reducing memory pressure and payload size by ~33%.
async function persistDocumentFileUpload({ file, department, folderId }) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    const error = new Error('Document file is required.')
    error.statusCode = 400
    throw error
  }

  const result = await storage.upload({
    buffer: file.buffer,
    originalFileName: file.originalname || file.fieldname || 'document',
    mimeType: file.mimetype || 'application/octet-stream',
    department: department || 'GENERAL',
    folderId: folderId || null,
  })

  const storedFileName = path.basename(result.key)

  return {
    fileName: storedFileName,
    filePath: result.key,
    storageProvider: result.provider,
    originalFileName: file.originalname,
    mimeType: file.mimetype || 'application/octet-stream',
    fileSize: file.size,
  }
}

function resolveUploadPath(relativePath) {
  return path.resolve(UPLOADS_ROOT_DIR, String(relativePath || ''))
}

async function deleteStoredUpload(relativePath) {
  await storage.delete(relativePath)
}

function getArchiveDocumentAssetPath(documentId, options = {}) {
  const normalizedId = encodeURIComponent(String(documentId || '').trim())
  const params = new URLSearchParams()
  if (options.download) params.set('download', 'true')
  return `/api/admin/documents/${normalizedId}/asset${params.toString() ? `?${params.toString()}` : ''}`
}

// ─── Access control ───────────────────────────────────────────

function getDocumentAccessRoleAliases(accountType) {
  const normalizedAccountType = normalizeAccountType(accountType)
  const roleAliases = new Set([normalizedAccountType])
  if (normalizedAccountType === 'registrar') roleAliases.add('staff')
  else if (normalizedAccountType === 'professor') roleAliases.add('faculty')
  return roleAliases
}

function canAccessDocumentAsset(document, accountType) {
  if (!document || document.isTrashed) return false
  const normalizedAccountType = normalizeAccountType(accountType)
  if (!normalizedAccountType) return false
  if (normalizedAccountType === 'admin' || document.isPublic) return true

  const allowedRoles = Array.isArray(document.allowedRoles)
    ? document.allowedRoles.map((role) => normalizeAccountType(role)).filter(Boolean)
    : []

  if (allowedRoles.length === 0) return normalizedAccountType === 'registrar'

  const roleAliases = getDocumentAccessRoleAliases(accountType)
  return allowedRoles.some((role) => roleAliases.has(role))
}

function canAccessFolder(folder, accountType, department = null) {
  if (!folder || folder.isTrashed) return false
  const normalizedAccountType = normalizeAccountType(accountType)
  if (!normalizedAccountType) return false
  if (normalizedAccountType === 'admin') return true

  const visibility = folder.visibility || 'public'
  if (visibility === 'public') return true

  if (visibility === 'private') {
    return false
  }

  // restricted
  const folderAllowedRoles = Array.isArray(folder.allowedRoles) ? folder.allowedRoles : []
  if (folderAllowedRoles.length > 0) {
    const roleAliases = getDocumentAccessRoleAliases(accountType)
    if (!folderAllowedRoles.some((role) => roleAliases.has(role))) return false
  }

  const folderDeptRestriction = Array.isArray(folder.departmentRestriction) ? folder.departmentRestriction : []
  if (folderDeptRestriction.length > 0 && department) {
    if (!folderDeptRestriction.includes(department)) return false
  }

  return true
}

// ─── Folder helpers ───────────────────────────────────────────

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sanitizeFolderForAudit(folder) {
  if (!folder) return null
  const source = folder.toObject ? folder.toObject() : folder
  return {
    _id: source._id,
    name: source.name,
    category: source.category,
    segmentType: source.segmentType,
    segmentValue: source.segmentValue,
    description: source.description,
    parentFolder: source.parentFolder,
    visibility: source.visibility,
    allowedRoles: source.allowedRoles,
    departmentRestriction: source.departmentRestriction,
    createdBy: source.createdBy,
    updatedBy: source.updatedBy,
    isTrashed: source.isTrashed,
    trashedAt: source.trashedAt,
    trashedBy: source.trashedBy,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }
}

function applyTrashedFilter(target, trashed = 'exclude') {
  if (trashed === 'only') {
    target.isTrashed = true
    return target
  }
  if (trashed !== 'include') {
    target.isTrashed = { $ne: true }
  }
  return target
}

async function ensureFolderExists(folderId) {
  if (!folderId) return null
  const folder = await DocumentFolder.findOne({ _id: folderId, isTrashed: { $ne: true } })
  if (!folder) {
    const error = new Error('Selected folder was not found.')
    error.statusCode = 400
    throw error
  }
  return folder
}

async function ensureUniqueFolderName(name, parentFolderId, excludeFolderId = null) {
  const normalizedName = String(name || '').trim()
  if (!normalizedName) {
    const error = new Error('Folder name is required.')
    error.statusCode = 400
    throw error
  }

  const duplicateQuery = {
    parentFolder: parentFolderId || null,
    name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' },
    isTrashed: { $ne: true }
  }
  if (excludeFolderId) duplicateQuery._id = { $ne: excludeFolderId }

  const duplicateFolder = await DocumentFolder.findOne(duplicateQuery).select('_id')
  if (duplicateFolder) {
    const error = new Error('A folder with the same name already exists in this location.')
    error.statusCode = 409
    throw error
  }
}

async function assertFolderCanMove(folderId, nextParentFolder) {
  if (!nextParentFolder) return
  const normalizedFolderId = String(folderId)
  let cursorFolder = nextParentFolder

  while (cursorFolder) {
    if (String(cursorFolder._id) === normalizedFolderId) {
      const error = new Error('A folder cannot be moved into itself or one of its subfolders.')
      error.statusCode = 400
      throw error
    }
    const parentFolderId = cursorFolder.parentFolder?._id || cursorFolder.parentFolder || null
    if (!parentFolderId) break
    cursorFolder = await DocumentFolder.findById(parentFolderId).select('_id parentFolder').lean()
  }
}

// ─── Folder type restrictions ─────────────────────────────────

const DOCUMENT_TYPE_FOLDER_RESTRICTIONS = [
  { matchValues: ['PDF'], label: 'PDF', allowedTypes: ['PDF'] },
  { matchValues: ['DOC', 'DOCX', 'DOCS', 'WORD', 'DOCUMENT'], label: 'DOC or DOCX', allowedTypes: ['DOC', 'DOCX'] },
  { matchValues: ['XLS', 'XLSX', 'SPREADSHEET'], label: 'XLS, XLSX, or CSV', allowedTypes: ['XLS', 'XLSX', 'CSV'] },
  { matchValues: ['PPT', 'PPTX', 'PRESENTATION'], label: 'PPT or PPTX', allowedTypes: ['PPT', 'PPTX'] },
  { matchValues: ['PNG'], label: 'PNG', allowedTypes: ['PNG'] },
  { matchValues: ['JPG', 'JPEG'], label: 'JPG or JPEG', allowedTypes: ['JPG', 'JPEG'] },
  { matchValues: ['IMAGE'], label: 'image', allowedTypes: ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'] },
  { matchValues: ['TXT', 'TEXT'], label: 'TXT', allowedTypes: ['TXT'] },
  { matchValues: ['CSV'], label: 'CSV', allowedTypes: ['CSV'] },
  { matchValues: ['ZIP', 'ARCHIVE'], label: 'ZIP', allowedTypes: ['ZIP'] }
]

function normalizeDocumentFileType(value) {
  const cleanedValue = String(value || '').replace(/^\./, '').trim()
  if (!cleanedValue) return 'File'
  const normalizedValue = cleanedValue.toUpperCase()
  return normalizedValue === 'JPG' ? 'JPEG' : normalizedValue
}

function getDocumentFileTypeFromMetadata({ originalFileName, fileName, mimeType }) {
  const nameCandidates = [originalFileName, fileName]
  for (const candidateName of nameCandidates) {
    const extension = String(candidateName || '').split('.').pop()
    if (extension && extension !== candidateName) return normalizeDocumentFileType(extension)
  }
  if (String(mimeType || '').startsWith('image/')) return 'Image'
  if (String(mimeType || '').includes('pdf')) return 'PDF'
  if (String(mimeType || '').includes('spreadsheet') || String(mimeType || '').includes('excel') || String(mimeType || '').includes('csv')) return 'Spreadsheet'
  if (String(mimeType || '').includes('word') || String(mimeType || '').includes('document')) return 'Document'
  return 'File'
}

function resolveFolderDocumentTypeRestriction(segmentValue) {
  const normalizedSegmentValue = normalizeDocumentFileType(segmentValue)
  if (!normalizedSegmentValue || normalizedSegmentValue === 'File') return null
  return DOCUMENT_TYPE_FOLDER_RESTRICTIONS.find((entry) => entry.matchValues.includes(normalizedSegmentValue)) || null
}

async function getFolderDocumentTypeRestriction(folder) {
  let currentFolder = folder
  while (currentFolder) {
    if (currentFolder.segmentType === 'DOCUMENT_TYPE') {
      const restriction = resolveFolderDocumentTypeRestriction(currentFolder.segmentValue || currentFolder.name)
      if (restriction) return restriction
    }
    const parentFolderId = currentFolder.parentFolder?._id || currentFolder.parentFolder || null
    if (!parentFolderId) break
    currentFolder = await DocumentFolder.findById(parentFolderId).select('name segmentType segmentValue parentFolder').lean()
  }
  return null
}

async function assertDocumentMatchesFolderRestriction(folder, documentMetadata) {
  if (!folder) return
  const restriction = await getFolderDocumentTypeRestriction(folder)
  if (!restriction) return
  const fileType = getDocumentFileTypeFromMetadata(documentMetadata)
  if (restriction.allowedTypes.includes(fileType)) return
  const error = new Error(`Only ${restriction.label} files can be uploaded in this folder.`)
  error.statusCode = 400
  throw error
}

// ─── Folder branch helpers ────────────────────────────────────

async function collectFolderBranchIds(rootFolderId) {
  const discoveredIds = [String(rootFolderId)]
  const queue = [String(rootFolderId)]

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length)
    const childFolders = await DocumentFolder.find({ parentFolder: { $in: batch } }).select('_id').lean()
    childFolders.forEach((childFolder) => {
      const childId = String(childFolder._id)
      if (discoveredIds.includes(childId)) return
      discoveredIds.push(childId)
      queue.push(childId)
    })
  }

  return discoveredIds
}

async function getFolderBranchDetails(rootFolderId) {
  const folderIds = await collectFolderBranchIds(rootFolderId)
  const documents = await Document.find({ folderId: { $in: folderIds } }).select('_id title filePath').lean()
  return { folderIds, childFolderCount: Math.max(0, folderIds.length - 1), documents }
}

// ─── Permanent deletion ───────────────────────────────────────

async function permanentlyDeleteStoredDocuments(documents) {
  for (const document of documents) {
    await deleteStoredUpload(document.filePath)
  }
  if (documents.length > 0) {
    await Document.deleteMany({ _id: { $in: documents.map((d) => d._id) } })
  }
  return documents.length
}

async function permanentlyDeleteFolderBranch(rootFolderId) {
  const { folderIds, documents } = await getFolderBranchDetails(rootFolderId)
  await permanentlyDeleteStoredDocuments(documents)
  await DocumentFolder.deleteMany({ _id: { $in: folderIds } })
  return { deletedFolderCount: folderIds.length, deletedDocumentCount: documents.length }
}

// ─── Archive bin purge ────────────────────────────────────────

function getArchiveBinExpirationCutoff(referenceTime = Date.now()) {
  return new Date(referenceTime - ARCHIVE_BIN_RETENTION_MS)
}

async function purgeExpiredArchiveBinItems() {
  if (mongoose.connection.readyState !== 1) return

  const cutoffDate = getArchiveBinExpirationCutoff()
  let deletedFolderCount = 0
  let deletedDocumentCount = 0

  const expiredFolders = await DocumentFolder.find({
    isTrashed: true,
    trashedAt: { $lte: cutoffDate }
  }).select('_id parentFolder').lean()

  const expiredFolderIdSet = new Set(expiredFolders.map((f) => String(f._id)))
  const rootExpiredFolders = expiredFolders.filter((folder) => {
    const parentId = folder.parentFolder ? String(folder.parentFolder) : null
    return !parentId || !expiredFolderIdSet.has(parentId)
  })

  for (const folder of rootExpiredFolders) {
    const result = await permanentlyDeleteFolderBranch(folder._id)
    deletedFolderCount += result.deletedFolderCount
    deletedDocumentCount += result.deletedDocumentCount
  }

  const remainingTrashedFolderIds = await DocumentFolder.find({ isTrashed: true }).distinct('_id')
  const expiredStandaloneDocuments = await Document.find({
    isTrashed: true,
    trashedAt: { $lte: cutoffDate },
    $or: [{ folderId: null }, { folderId: { $nin: remainingTrashedFolderIds } }]
  }).select('_id title filePath').lean()

  deletedDocumentCount += await permanentlyDeleteStoredDocuments(expiredStandaloneDocuments)

  if (deletedFolderCount > 0 || deletedDocumentCount > 0) {
    console.log(
      `[archive-bin] Purged expired items older than ${ARCHIVE_BIN_RETENTION_DAYS} days: ` +
      `${deletedFolderCount} folder(s), ${deletedDocumentCount} document(s).`
    )
  }
}

// ─── Folder counts ────────────────────────────────────────────

async function withFolderCounts(folders, trashed = 'exclude') {
  if (!Array.isArray(folders) || folders.length === 0) return []

  const folderIds = folders.map((f) => f._id)
  const documentMatch = applyTrashedFilter({ folderId: { $in: folderIds } }, trashed)
  const childFolderMatch = applyTrashedFilter({ parentFolder: { $in: folderIds } }, trashed)

  const [documentCounts, childFolderCounts] = await Promise.all([
    Document.aggregate([
      { $match: documentMatch },
      { $group: { _id: '$folderId', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } }
    ]),
    DocumentFolder.aggregate([
      { $match: childFolderMatch },
      { $group: { _id: '$parentFolder', count: { $sum: 1 } } }
    ])
  ])

  const documentCountMap = new Map(
    documentCounts.map((entry) => [String(entry._id), { count: Number(entry.count) || 0, totalSize: Number(entry.totalSize) || 0 }])
  )
  const childFolderCountMap = new Map(
    childFolderCounts.map((entry) => [String(entry._id), Number(entry.count) || 0])
  )

  return folders.map((folder) => {
    const folderObject = folder.toObject ? folder.toObject() : folder
    const folderId = String(folderObject._id)
    const documentCountEntry = documentCountMap.get(folderId)
    return {
      ...folderObject,
      directDocumentCount: documentCountEntry?.count || 0,
      directChildFolderCount: childFolderCountMap.get(folderId) || 0,
      directStorageBytes: documentCountEntry?.totalSize || 0
    }
  })
}

module.exports = {
  // Constants
  ARCHIVE_ACTOR_POPULATE,
  UPLOADS_ROOT_DIR,
  DOCUMENT_UPLOADS_DIR,
  ARCHIVE_BIN_RETENTION_DAYS,
  ARCHIVE_BIN_RETENTION_MS,

  // File helpers
  sanitizeStorageFileName,
  decodeBase64FileData,
  persistDocumentUpload,
  persistDocumentFileUpload,
  resolveUploadPath,
  deleteStoredUpload,
  getArchiveDocumentAssetPath,

  // Access control
  getDocumentAccessRoleAliases,
  canAccessDocumentAsset,
  canAccessFolder,

  // Folder helpers
  escapeRegex,
  sanitizeFolderForAudit,
  applyTrashedFilter,
  ensureFolderExists,
  ensureUniqueFolderName,
  assertFolderCanMove,

  // Folder type restrictions
  assertDocumentMatchesFolderRestriction,

  // Folder branch helpers
  collectFolderBranchIds,
  getFolderBranchDetails,

  // Permanent deletion
  permanentlyDeleteStoredDocuments,
  permanentlyDeleteFolderBranch,

  // Archive bin
  getArchiveBinExpirationCutoff,
  purgeExpiredArchiveBinItems,

  // Folder counts
  withFolderCounts,
}

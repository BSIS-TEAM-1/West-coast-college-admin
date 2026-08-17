const path = require('path')
const fs = require('fs')

const Document = require('../models/Document')
const DocumentFolder = require('../models/DocumentFolder')
const DocumentVersion = require('../models/DocumentVersion')
const {
  ARCHIVE_ACTOR_POPULATE,
  UPLOADS_ROOT_DIR,
  sanitizeStorageFileName,
  persistDocumentUpload,
  persistDocumentFileUpload,
  resolveUploadPath,
  deleteStoredUpload,
  getArchiveDocumentAssetPath,
  canAccessDocumentAsset,
  canAccessFolder,
  escapeRegex,
  sanitizeFolderForAudit,
  applyTrashedFilter,
  ensureFolderExists,
  ensureUniqueFolderName,
  assertFolderCanMove,
  assertDocumentMatchesFolderRestriction,
  getFolderBranchDetails,
  permanentlyDeleteStoredDocuments,
  permanentlyDeleteFolderBranch,
  withFolderCounts,
} = require('../services/documentService')
const storage = require('../services/documentStorageService')

function auditObject(obj, resourceType) {
  if (!obj) return null
  const o = obj.toObject ? obj.toObject() : obj
  if (resourceType === 'DOCUMENT') {
    return {
      _id: o._id, title: o.title, description: o.description,
      category: o.category, subcategory: o.subcategory, department: o.department,
      folderId: o.folderId, fileName: o.fileName, originalFileName: o.originalFileName,
      mimeType: o.mimeType, fileSize: o.fileSize, version: o.version,
      isPublic: o.isPublic, allowedRoles: o.allowedRoles, tags: o.tags,
      effectiveDate: o.effectiveDate, expiryDate: o.expiryDate, status: o.status,
      supersededBy: o.supersededBy, downloadCount: o.downloadCount,
      isTrashed: o.isTrashed, trashedAt: o.trashedAt, trashedBy: o.trashedBy,
      createdBy: o.createdBy, updatedBy: o.updatedBy,
      createdAt: o.createdAt, updatedAt: o.updatedAt
    }
  }
  return o
}

function createDocumentController({ logAudit, dbReadyGuard }) {
  function checkDb(req, res) {
    if (!dbReadyGuard()) {
      res.status(503).json({ error: 'Database unavailable.' })
      return true
    }
    return false
  }

  async function listAdminDocuments(req, res) {
    if (checkDb(req, res)) return
    try {
      const {
        category, status, department, search, page, limit,
        folderId, includeUnfoldered, trashed = 'exclude', trashRootOnly,
        visibility = 'all', sortBy = 'updatedAt', sortOrder = 'desc'
      } = req.query

      const pageInt = Math.max(1, parseInt(page, 10) || 1)
      const limitInt = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))
      const filter = applyTrashedFilter({}, trashed)
      const sortField = ['updatedAt', 'createdAt', 'title', 'fileSize', 'category'].includes(String(sortBy))
        ? String(sortBy) : 'updatedAt'
      const sortDirection = sortOrder === 'asc' ? 1 : -1

      if (category) filter.category = category
      if (status) filter.status = status
      if (department) filter.department = department
      if (folderId) {
        filter.folderId = folderId
      } else if (includeUnfoldered === true) {
        filter.folderId = null
      }
      if (visibility === 'public') filter.isPublic = true
      else if (visibility === 'restricted') filter.isPublic = false
      if (search) filter.$text = { $search: search }

      if (trashed === 'only' && trashRootOnly === true && !folderId) {
        const trashedFolderIds = await DocumentFolder.find({ isTrashed: true }).distinct('_id')
        filter.$and = [
          ...(Array.isArray(filter.$and) ? filter.$and : []),
          { $or: [{ folderId: null }, { folderId: { $nin: trashedFolderIds } }] }
        ]
      }

      const projection = search ? { score: { $meta: 'textScore' } } : null
      const sort = search
        ? { score: { $meta: 'textScore' }, [sortField]: sortDirection }
        : { [sortField]: sortDirection }
      if (sortField !== 'updatedAt') sort.updatedAt = -1

      const [documents, total] = await Promise.all([
        Document.find(filter, projection || undefined)
          .populate('folderId', 'name segmentType segmentValue parentFolder')
          .populate('createdBy', ARCHIVE_ACTOR_POPULATE)
          .populate('updatedBy', ARCHIVE_ACTOR_POPULATE)
          .sort(sort)
          .limit(limitInt)
          .skip((pageInt - 1) * limitInt)
          .lean(),
        Document.countDocuments(filter)
      ])

      res.json({ documents, totalPages: Math.ceil(total / limitInt), currentPage: pageInt, total })
    } catch (err) {
      console.error('Get admin documents error:', err.message)
      res.status(500).json({ error: 'Failed to load documents.' })
    }
  }

  async function getDocument(req, res) {
    if (checkDb(req, res)) return
    try {
      const document = await Document.findById(req.params.id)
        .populate('folderId', 'name segmentType segmentValue parentFolder')
        .populate('createdBy', ARCHIVE_ACTOR_POPULATE)
        .populate('updatedBy', ARCHIVE_ACTOR_POPULATE)
        .lean()

      if (!document) return res.status(404).json({ error: 'Document not found.' })
      res.json({ document })
    } catch (err) {
      console.error('Get admin document error:', err.message)
      res.status(500).json({ error: 'Failed to load document.' })
    }
  }

  async function serveDocumentAsset(req, res) {
    if (checkDb(req, res)) return
    try {
      const document = await Document.findById(req.params.id)
        .select('title fileName originalFileName mimeType filePath storageProvider storageKey isPublic allowedRoles isTrashed')
        .lean()

      if (!document || document.isTrashed) return res.status(404).json({ error: 'Document file not found.' })
      if (!canAccessDocumentAsset(document, req.accountType)) {
        return res.status(403).json({ error: 'You do not have permission to access this document.' })
      }

      const isDownloadRequest = req.query.download === true
      const preferredFileName = sanitizeStorageFileName(document.originalFileName || document.fileName || document.title || 'document')
      const storageKey = document.storageKey || document.filePath

      if (document.storageProvider === 'supabase' && storage.isUsingSupabase) {
        // Server-mediated streaming: download via service role and stream the
        // buffer to the client so per-request role checks stay enforced. The
        // signed-URL redirect alternative would leak a shareable URL valid for
        // its expiry window. Note: loads the full object into memory —
        // acceptable for typical office documents; switch to streaming if very
        // large files become common.
        const buffer = await storage.download(storageKey)
        res.setHeader('Cache-Control', 'private, max-age=300')
        res.type(document.mimeType || 'application/octet-stream')
        res.setHeader('Content-Disposition', `${isDownloadRequest ? 'attachment' : 'inline'}; filename="${preferredFileName.replace(/"/g, '')}"`)
        return res.send(buffer)
      }

      const absoluteFilePath = resolveUploadPath(document.filePath)
      const uploadsRoot = path.resolve(UPLOADS_ROOT_DIR)
      if (!absoluteFilePath.startsWith(uploadsRoot) || !fs.existsSync(absoluteFilePath)) {
        return res.status(404).json({ error: 'Document file not found.' })
      }

      res.setHeader('Cache-Control', 'private, max-age=300')
      res.type(document.mimeType || 'application/octet-stream')
      res.setHeader('Content-Disposition', `${isDownloadRequest ? 'attachment' : 'inline'}; filename="${preferredFileName.replace(/"/g, '')}"`)
      res.sendFile(absoluteFilePath)
    } catch (err) {
      console.error('Get admin document asset error:', err.message)
      res.status(500).json({ error: 'Failed to load document file.' })
    }
  }

  async function uploadDocument(req, res) {
    if (checkDb(req, res)) return
    let storedFilePath = ''
    try {
      const {
        title, description, category, subcategory, department, folderId,
        version, isPublic, allowedRoles, tags,
        effectiveDate, expiryDate, status
      } = req.body

      if (!req.file) {
        return res.status(400).json({ error: 'Document file is required.' })
      }

      const selectedFolder = await ensureFolderExists(folderId)
      await assertDocumentMatchesFolderRestriction(selectedFolder, {
        originalFileName: req.file.originalname, fileName: req.file.originalname, mimeType: req.file.mimetype
      })
      const persistedFile = await persistDocumentFileUpload({
        file: req.file,
        department: department || 'GENERAL', folderId: selectedFolder?._id || null,
      })
      storedFilePath = persistedFile.filePath

      const document = new Document({
        title, description, category, subcategory,
        department: department || 'GENERAL',
        folderId: selectedFolder?._id || null,
        fileName: persistedFile.fileName,
        originalFileName: persistedFile.originalFileName,
        mimeType: persistedFile.mimeType,
        fileSize: persistedFile.fileSize,
        filePath: persistedFile.filePath,
        storageProvider: persistedFile.storageProvider || 'local',
        storageKey: persistedFile.filePath,
        version: version || '1.0',
        isPublic: isPublic || false,
        allowedRoles: allowedRoles || [],
        tags: tags || [],
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        status: status || 'ACTIVE',
        createdBy: req.adminId
      })

      await document.save()
      await document.populate('folderId', 'name segmentType segmentValue parentFolder')
      await document.populate('createdBy', ARCHIVE_ACTOR_POPULATE)

      await logAudit(
        'UPLOAD', 'DOCUMENT', document._id.toString(), document.title,
        `Uploaded document: ${document.title}`, req.adminId, req.accountType,
        null, auditObject(document, 'DOCUMENT'), 'SUCCESS', 'MEDIUM'
      )

      res.status(201).json({ message: 'Document uploaded successfully.', document })
    } catch (err) {
      console.error('Upload document error:', err.message)
      if (storedFilePath) {
        try { await deleteStoredUpload(storedFilePath) } catch (e) { console.error('Failed to clean up uploaded document file:', e.message) }
      }
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to upload document.' })
    }
  }

  async function updateDocument(req, res) {
    if (checkDb(req, res)) return
    try {
      const { title, description, category, subcategory, department, folderId, isPublic, allowedRoles, tags, effectiveDate, expiryDate, status } = req.body

      const document = await Document.findOne({ _id: req.params.id, isTrashed: { $ne: true } })
      if (!document) return res.status(404).json({ error: 'Document not found.' })

      const oldValue = auditObject(document, 'DOCUMENT')
      const selectedFolder = folderId === undefined ? undefined : await ensureFolderExists(folderId)
      if (folderId !== undefined) {
        await assertDocumentMatchesFolderRestriction(selectedFolder, {
          originalFileName: document.originalFileName, fileName: document.fileName, mimeType: document.mimeType
        })
      }

      if (title) document.title = title
      if (description !== undefined) document.description = description
      if (category) document.category = category
      if (subcategory !== undefined) document.subcategory = subcategory
      if (department !== undefined) document.department = department
      if (folderId !== undefined) document.folderId = selectedFolder?._id || null
      if (isPublic !== undefined) document.isPublic = isPublic
      if (allowedRoles !== undefined) document.allowedRoles = allowedRoles
      if (tags !== undefined) document.tags = tags
      if (effectiveDate !== undefined) document.effectiveDate = effectiveDate ? new Date(effectiveDate) : undefined
      if (expiryDate !== undefined) document.expiryDate = expiryDate ? new Date(expiryDate) : undefined
      if (status) document.status = status
      document.updatedBy = req.adminId

      await document.save()
      await document.populate('folderId', 'name segmentType segmentValue parentFolder')
      await document.populate('createdBy', ARCHIVE_ACTOR_POPULATE)
      await document.populate('updatedBy', ARCHIVE_ACTOR_POPULATE)

      await logAudit(
        'UPDATE', 'DOCUMENT', document._id.toString(), document.title,
        `Updated document: ${document.title}`, req.adminId, req.accountType,
        oldValue, auditObject(document, 'DOCUMENT'), 'SUCCESS', 'MEDIUM'
      )

      res.json({ message: 'Document updated successfully.', document })
    } catch (err) {
      console.error('Update document error:', err.message)
      res.status(500).json({ error: 'Failed to update document.' })
    }
  }

  async function trackDownload(req, res) {
    if (checkDb(req, res)) return
    try {
      const document = await Document.findById(req.params.id)
        .select('title fileName originalFileName filePath downloadCount lastDownloadedBy lastDownloadedAt isPublic allowedRoles isTrashed')
      if (!document || document.isTrashed) return res.status(404).json({ error: 'Document not found.' })
      if (!canAccessDocumentAsset(document, req.accountType)) {
        return res.status(403).json({ error: 'You do not have permission to access this document.' })
      }

      document.downloadCount += 1
      document.lastDownloadedBy = req.adminId
      document.lastDownloadedAt = new Date()
      await document.save()

      await logAudit(
        'DOWNLOAD', 'DOCUMENT', document._id.toString(), document.title,
        `Downloaded document: ${document.title}`, req.adminId, req.accountType,
        null, null, 'SUCCESS', 'LOW'
      )

      res.json({ message: 'Download tracked successfully.', downloadUrl: getArchiveDocumentAssetPath(document._id, { download: true }) })
    } catch (err) {
      console.error('Track download error:', err.message)
      res.status(500).json({ error: 'Failed to track download.' })
    }
  }

  async function deleteDocument(req, res) {
    if (checkDb(req, res)) return
    try {
      const document = await Document.findById(req.params.id)
      if (!document) return res.status(404).json({ error: 'Document not found.' })

      if (document.isTrashed) {
        await permanentlyDeleteStoredDocuments([{ _id: document._id, title: document.title, filePath: document.filePath }])
        await logAudit(
          'DELETE', 'DOCUMENT', document._id.toString(), document.title,
          `Permanently deleted document from archive bin: ${document.title}`, req.adminId, req.accountType,
          document.toObject(), { permanentlyDeleted: true }, 'SUCCESS', 'HIGH'
        )
        return res.json({ message: 'Document permanently deleted from Archive Bin.', permanentlyDeleted: true })
      }

      const oldValue = auditObject(document, 'DOCUMENT')
      document.isTrashed = true
      document.trashedAt = new Date()
      document.trashedBy = req.adminId
      document.updatedBy = req.adminId
      await document.save()

      await logAudit(
        'DELETE', 'DOCUMENT', document._id.toString(), document.title,
        `Moved document to archive bin: ${document.title}`, req.adminId, req.accountType,
        oldValue, auditObject(document, 'DOCUMENT'), 'SUCCESS', 'MEDIUM'
      )

      res.json({ message: 'Document moved to Archive Bin.', movedToTrash: true })
    } catch (err) {
      console.error('Delete document error:', err.message)
      res.status(500).json({ error: 'Failed to delete document.' })
    }
  }

  async function listPublicDocuments(req, res) {
    if (checkDb(req, res)) return
    try {
      const { category, search, page = 1, limit = 10 } = req.query
      const filter = { isPublic: true, status: 'ACTIVE', isTrashed: { $ne: true } }

      if (category !== undefined) {
        if (typeof category !== 'string') return res.status(400).json({ error: 'Invalid category parameter.' })
        const safeCategory = category.trim()
        if (safeCategory) filter.category = safeCategory
      }
      if (search) filter.$text = { $search: search }

      const documents = await Document.find(filter)
        .populate('createdBy', ARCHIVE_ACTOR_POPULATE)
        .sort({ updatedAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)

      const total = await Document.countDocuments(filter)

      res.json({ documents, totalPages: Math.ceil(total / limit), currentPage: page, total })
    } catch (err) {
      console.error('Get documents error:', err.message)
      res.status(500).json({ error: 'Failed to load documents.' })
    }
  }

  async function listFolders(req, res) {
    if (checkDb(req, res)) return
    try {
      const { parentId, search, trashed = 'exclude' } = req.query
      const filter = applyTrashedFilter({}, trashed)

      if (parentId) filter.parentFolder = parentId
      if (search) {
        filter.$or = [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { segmentValue: { $regex: escapeRegex(search), $options: 'i' } }
        ]
      }

      const folders = await DocumentFolder.find(filter)
        .populate('createdBy', ARCHIVE_ACTOR_POPULATE)
        .populate('updatedBy', ARCHIVE_ACTOR_POPULATE)
        .populate('parentFolder', 'name segmentType segmentValue parentFolder visibility allowedRoles departmentRestriction')
        .sort({ parentFolder: 1, name: 1 })
        .lean()

      const accessibleFolders = folders.filter((folder) => canAccessFolder(folder, req.accountType))

      res.json({ folders: await withFolderCounts(accessibleFolders, trashed), total: accessibleFolders.length })
    } catch (err) {
      console.error('Get document folders error:', err.message)
      res.status(500).json({ error: 'Failed to load document folders.' })
    }
  }

  async function createFolder(req, res) {
    if (checkDb(req, res)) return
    try {
      const { name, category = 'OTHER', segmentType = 'CUSTOM', segmentValue = '', description = '', parentFolderId = null,
              visibility = 'public', allowedRoles = [], departmentRestriction = [] } = req.body

      const parentFolder = await ensureFolderExists(parentFolderId)
      await ensureUniqueFolderName(name, parentFolder?._id || null)

      const folder = new DocumentFolder({
        name, category, segmentType, segmentValue, description,
        parentFolder: parentFolder?._id || null,
        visibility, allowedRoles, departmentRestriction,
        createdBy: req.adminId
      })

      await folder.save()
      await folder.populate('createdBy', ARCHIVE_ACTOR_POPULATE)
      await folder.populate('parentFolder', 'name segmentType segmentValue parentFolder visibility allowedRoles departmentRestriction')

      const hydratedFolder = (await withFolderCounts([folder]))[0]

      await logAudit(
        'CREATE', 'DOCUMENT', folder._id.toString(), `Folder: ${folder.name}`,
        `Created document folder: ${folder.name}`, req.adminId, req.accountType,
        null, sanitizeFolderForAudit(folder), 'SUCCESS', 'LOW'
      )

      res.status(201).json({ message: 'Folder created successfully.', folder: hydratedFolder })
    } catch (err) {
      console.error('Create document folder error:', err.message)
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create folder.' })
    }
  }

  async function updateFolder(req, res) {
    if (checkDb(req, res)) return
    try {
      const folder = await DocumentFolder.findOne({ _id: req.params.id, isTrashed: { $ne: true } })
      if (!folder) return res.status(404).json({ error: 'Folder not found.' })

      const previousValue = sanitizeFolderForAudit(folder)
      const { name, category, segmentType, segmentValue, description, parentFolderId, visibility, allowedRoles, departmentRestriction } = req.body
      const nextParentFolder = parentFolderId === undefined ? undefined : await ensureFolderExists(parentFolderId)
      const resolvedParentFolderId = nextParentFolder?._id || null
      const resolvedName = name && name.trim() ? name.trim() : folder.name
      const isMovingFolder = parentFolderId !== undefined && String(folder.parentFolder || '') !== String(resolvedParentFolderId || '')

      if (isMovingFolder) await assertFolderCanMove(folder._id, nextParentFolder || null)
      if ((name && name.trim() !== folder.name) || isMovingFolder) {
        await ensureUniqueFolderName(resolvedName, resolvedParentFolderId, folder._id)
        folder.name = resolvedName
      }

      if (category) folder.category = category
      if (segmentType) folder.segmentType = segmentType
      if (segmentValue !== undefined) folder.segmentValue = segmentValue
      if (description !== undefined) folder.description = description
      if (parentFolderId !== undefined) folder.parentFolder = resolvedParentFolderId
      if (visibility !== undefined) folder.visibility = visibility
      if (allowedRoles !== undefined) folder.allowedRoles = allowedRoles
      if (departmentRestriction !== undefined) folder.departmentRestriction = departmentRestriction
      folder.updatedBy = req.adminId

      await folder.save()
      await folder.populate('createdBy', ARCHIVE_ACTOR_POPULATE)
      await folder.populate('updatedBy', ARCHIVE_ACTOR_POPULATE)
      await folder.populate('parentFolder', 'name segmentType segmentValue parentFolder visibility allowedRoles departmentRestriction')

      const hydratedFolder = (await withFolderCounts([folder]))[0]

      await logAudit(
        'UPDATE', 'DOCUMENT', folder._id.toString(), `Folder: ${folder.name}`,
        `Updated document folder: ${folder.name}`, req.adminId, req.accountType,
        previousValue, sanitizeFolderForAudit(folder), 'SUCCESS', 'LOW'
      )

      res.json({ message: 'Folder updated successfully.', folder: hydratedFolder })
    } catch (err) {
      console.error('Update document folder error:', err.message)
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update folder.' })
    }
  }

  async function deleteFolder(req, res) {
    if (checkDb(req, res)) return
    try {
      const folder = await DocumentFolder.findById(req.params.id)
      if (!folder) return res.status(404).json({ error: 'Folder not found.' })

      const { folderIds, childFolderCount, documents } = await getFolderBranchDetails(folder._id)
      const forceDelete = req.query.force === true

      if (!folder.isTrashed && !forceDelete && (childFolderCount > 0 || documents.length > 0)) {
        return res.status(409).json({
          error: 'Folder still contains archived items.',
          details: { childFolderCount, documentCount: documents.length }
        })
      }

      if (folder.isTrashed) {
        const result = await permanentlyDeleteFolderBranch(folder._id)
        await logAudit(
          'DELETE', 'DOCUMENT', folder._id.toString(), `Folder: ${folder.name}`,
          `Permanently deleted document folder from archive bin: ${folder.name}`, req.adminId, req.accountType,
          sanitizeFolderForAudit(folder),
          { permanentlyDeleted: true, deletedFolderCount: result.deletedFolderCount, deletedDocumentCount: result.deletedDocumentCount },
          'SUCCESS', 'HIGH'
        )
        return res.json({
          message: 'Folder permanently deleted from Archive Bin.',
          deletedFolderCount: result.deletedFolderCount,
          deletedDocumentCount: result.deletedDocumentCount,
          permanentlyDeleted: true
        })
      }

      const trashedAt = new Date()
      if (documents.length > 0) {
        await Document.updateMany(
          { _id: { $in: documents.map((d) => d._id) } },
          { $set: { isTrashed: true, trashedAt, trashedBy: req.adminId, updatedBy: req.adminId } }
        )
      }
      await DocumentFolder.updateMany(
        { _id: { $in: folderIds } },
        { $set: { isTrashed: true, trashedAt, trashedBy: req.adminId, updatedBy: req.adminId } }
      )

      await logAudit(
        'DELETE', 'DOCUMENT', folder._id.toString(), `Folder: ${folder.name}`,
        `Moved document folder to archive bin: ${folder.name}`, req.adminId, req.accountType,
        sanitizeFolderForAudit(folder),
        { movedToArchiveBin: true, trashedAt, deletedFolderCount: folderIds.length, deletedDocumentCount: documents.length },
        'SUCCESS', 'MEDIUM'
      )

      res.json({
        message: 'Folder moved to Archive Bin.',
        deletedFolderCount: folderIds.length,
        deletedDocumentCount: documents.length,
        movedToTrash: true
      })
    } catch (err) {
      console.error('Delete document folder error:', err.message)
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete folder.' })
    }
  }

  // ─── Document versioning ──────────────────────────────────────

  async function listVersions(req, res) {
    if (checkDb(req, res)) return
    try {
      const document = await Document.findById(req.params.id).select('_id title version filePath fileName originalFileName mimeType fileSize storageProvider storageKey createdBy')
      if (!document) return res.status(404).json({ error: 'Document not found.' })

      const versions = await DocumentVersion.find({ documentId: document._id })
        .populate('uploadedBy', ARCHIVE_ACTOR_POPULATE)
        .sort({ versionNumber: -1 })
        .lean()

      res.json({
        currentVersion: {
          versionLabel: document.version,
          fileName: document.fileName,
          originalFileName: document.originalFileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          filePath: document.filePath,
          storageProvider: document.storageProvider,
        },
        versions,
      })
    } catch (err) {
      console.error('List document versions error:', err.message)
      res.status(500).json({ error: 'Failed to load version history.' })
    }
  }

  async function uploadNewVersion(req, res) {
    if (checkDb(req, res)) return
    let storedFilePath = ''
    try {
      const { changeSummary } = req.body

      if (!req.file) {
        return res.status(400).json({ error: 'Version file is required.' })
      }

      const document = await Document.findOne({ _id: req.params.id, isTrashed: { $ne: true } })
      if (!document) return res.status(404).json({ error: 'Document not found.' })

      const persistedFile = await persistDocumentFileUpload({
        file: req.file,
        department: document.department || 'GENERAL', folderId: document.folderId?.toString() || null,
      })
      storedFilePath = persistedFile.filePath

      const lastVersion = await DocumentVersion.findOne({ documentId: document._id })
        .sort({ versionNumber: -1 })
        .select('versionNumber')
        .lean()
      const nextVersionNumber = (lastVersion?.versionNumber || 0) + 1

      const previousFileKey = document.storageKey || document.filePath
      const previousStorageProvider = document.storageProvider || 'local'

      const versionRecord = new DocumentVersion({
        documentId: document._id,
        versionNumber: nextVersionNumber,
        versionLabel: document.version,
        fileName: document.fileName,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        filePath: document.filePath,
        storageProvider: previousStorageProvider,
        storageKey: previousFileKey,
        uploadedBy: req.adminId,
        changeSummary: changeSummary || '',
      })
      await versionRecord.save()

      document.fileName = persistedFile.fileName
      document.originalFileName = persistedFile.originalFileName
      document.mimeType = persistedFile.mimeType
      document.fileSize = persistedFile.fileSize
      document.filePath = persistedFile.filePath
      document.storageProvider = persistedFile.storageProvider || 'local'
      document.storageKey = persistedFile.filePath
      const versionParts = String(document.version || '1.0').split('.')
      const major = parseInt(versionParts[0], 10) || 1
      document.version = `${major + 1}.0`
      document.updatedBy = req.adminId
      await document.save()
      await document.populate('folderId', 'name segmentType segmentValue parentFolder')
      await document.populate('createdBy', ARCHIVE_ACTOR_POPULATE)
      await document.populate('updatedBy', ARCHIVE_ACTOR_POPULATE)

      await logAudit(
        'UPLOAD', 'DOCUMENT', document._id.toString(), document.title,
        `Uploaded new version ${document.version}: ${document.title}`, req.adminId, req.accountType,
        null, auditObject(document, 'DOCUMENT'), 'SUCCESS', 'MEDIUM'
      )

      res.status(201).json({ message: 'New version uploaded successfully.', document, version: versionRecord })
    } catch (err) {
      console.error('Upload new version error:', err.message)
      if (storedFilePath) {
        try { await deleteStoredUpload(storedFilePath) } catch (e) { console.error('Failed to clean up version file:', e.message) }
      }
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to upload new version.' })
    }
  }

  async function serveVersionAsset(req, res) {
    if (checkDb(req, res)) return
    try {
      const version = await DocumentVersion.findById(req.params.versionId)
        .select('documentId fileName originalFileName mimeType filePath storageProvider storageKey')
        .lean()

      if (!version || String(version.documentId) !== String(req.params.id)) {
        return res.status(404).json({ error: 'Version not found.' })
      }

      const document = await Document.findById(req.params.id)
        .select('isPublic allowedRoles isTrashed')
        .lean()

      if (!document || document.isTrashed) return res.status(404).json({ error: 'Document not found.' })
      if (!canAccessDocumentAsset(document, req.accountType)) {
        return res.status(403).json({ error: 'You do not have permission to access this document.' })
      }

      const isDownloadRequest = req.query.download === true
      const preferredFileName = sanitizeStorageFileName(version.originalFileName || version.fileName || 'document')
      const storageKey = version.storageKey || version.filePath

      if (version.storageProvider === 'supabase' && storage.isUsingSupabase) {
        // Server-mediated streaming (see serveDocumentAsset for rationale).
        const buffer = await storage.download(storageKey)
        res.setHeader('Cache-Control', 'private, max-age=300')
        res.type(version.mimeType || 'application/octet-stream')
        res.setHeader('Content-Disposition', `${isDownloadRequest ? 'attachment' : 'inline'}; filename="${preferredFileName.replace(/"/g, '')}"`)
        return res.send(buffer)
      }

      const absoluteFilePath = resolveUploadPath(version.filePath)
      const uploadsRoot = path.resolve(UPLOADS_ROOT_DIR)
      if (!absoluteFilePath.startsWith(uploadsRoot) || !fs.existsSync(absoluteFilePath)) {
        return res.status(404).json({ error: 'Version file not found.' })
      }

      res.setHeader('Cache-Control', 'private, max-age=300')
      res.type(version.mimeType || 'application/octet-stream')
      res.setHeader('Content-Disposition', `${isDownloadRequest ? 'attachment' : 'inline'}; filename="${preferredFileName.replace(/"/g, '')}"`)
      res.sendFile(absoluteFilePath)
    } catch (err) {
      console.error('Serve version asset error:', err.message)
      res.status(500).json({ error: 'Failed to load version file.' })
    }
  }

  // ─── Bulk operations ──────────────────────────────────────────

  async function bulkDeleteDocuments(req, res) {
    if (checkDb(req, res)) return
    try {
      const { documentIds } = req.body
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds must be a non-empty array.' })
      }

      const trashedAt = new Date()
      const result = await Document.updateMany(
        { _id: { $in: documentIds }, isTrashed: { $ne: true } },
        { $set: { isTrashed: true, trashedAt, trashedBy: req.adminId, updatedBy: req.adminId } }
      )

      await logAudit(
        'DELETE', 'DOCUMENT', null, 'Bulk delete',
        `Moved ${result.modifiedCount} document(s) to archive bin`, req.adminId, req.accountType,
        null, { documentIds, modifiedCount: result.modifiedCount }, 'SUCCESS', 'MEDIUM'
      )

      res.json({ message: `${result.modifiedCount} document(s) moved to Archive Bin.`, modifiedCount: result.modifiedCount })
    } catch (err) {
      console.error('Bulk delete documents error:', err.message)
      res.status(500).json({ error: 'Failed to bulk delete documents.' })
    }
  }

  async function bulkMoveDocuments(req, res) {
    if (checkDb(req, res)) return
    try {
      const { documentIds, folderId } = req.body
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds must be a non-empty array.' })
      }

      const targetFolder = await ensureFolderExists(folderId)

      if (targetFolder) {
        for (const docId of documentIds) {
          const doc = await Document.findById(docId).select('originalFileName fileName mimeType')
          if (doc) {
            await assertDocumentMatchesFolderRestriction(targetFolder, {
              originalFileName: doc.originalFileName, fileName: doc.fileName, mimeType: doc.mimeType
            })
          }
        }
      }

      const result = await Document.updateMany(
        { _id: { $in: documentIds }, isTrashed: { $ne: true } },
        { $set: { folderId: targetFolder?._id || null, updatedBy: req.adminId } }
      )

      await logAudit(
        'UPDATE', 'DOCUMENT', null, 'Bulk move',
        `Moved ${result.modifiedCount} document(s) to folder: ${targetFolder?.name || 'Unfiled'}`,
        req.adminId, req.accountType, null, { documentIds, folderId: targetFolder?._id || null, modifiedCount: result.modifiedCount }, 'SUCCESS', 'MEDIUM'
      )

      res.json({ message: `${result.modifiedCount} document(s) moved.`, modifiedCount: result.modifiedCount })
    } catch (err) {
      console.error('Bulk move documents error:', err.message)
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to bulk move documents.' })
    }
  }

  async function bulkUpdateDocuments(req, res) {
    if (checkDb(req, res)) return
    try {
      const { documentIds, isPublic, status, department, allowedRoles, tags } = req.body
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds must be a non-empty array.' })
      }

      const update = { updatedBy: req.adminId }
      if (isPublic !== undefined) update.isPublic = isPublic
      if (status !== undefined) update.status = status
      if (department !== undefined) update.department = department
      if (allowedRoles !== undefined) update.allowedRoles = allowedRoles
      if (tags !== undefined) update.tags = tags

      const result = await Document.updateMany(
        { _id: { $in: documentIds }, isTrashed: { $ne: true } },
        { $set: update }
      )

      await logAudit(
        'UPDATE', 'DOCUMENT', null, 'Bulk update',
        `Updated ${result.modifiedCount} document(s)`, req.adminId, req.accountType,
        null, { documentIds, update, modifiedCount: result.modifiedCount }, 'SUCCESS', 'MEDIUM'
      )

      res.json({ message: `${result.modifiedCount} document(s) updated.`, modifiedCount: result.modifiedCount })
    } catch (err) {
      console.error('Bulk update documents error:', err.message)
      res.status(500).json({ error: 'Failed to bulk update documents.' })
    }
  }

  return {
    listAdminDocuments, getDocument, serveDocumentAsset, uploadDocument,
    updateDocument, trackDownload, deleteDocument, listPublicDocuments,
    listFolders, createFolder, updateFolder, deleteFolder,
    listVersions, uploadNewVersion, serveVersionAsset,
    bulkDeleteDocuments, bulkMoveDocuments, bulkUpdateDocuments,
  }
}

module.exports = { createDocumentController, auditObject }

const Joi = require('joi')
const multer = require('multer')
const securityMiddleware = require('../securityMiddleware')
const { createDocumentController } = require('../controllers/documentController')

// Multer config for document uploads. Files are held in memory (buffer) so
// they can be streamed directly to Supabase Storage without a temp file.
// Limit matches the previous express.json 25 MB ceiling (minus base64 overhead
// the effective capacity is now higher).
const DOCUMENT_UPLOAD_MAX_BYTES = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || 25 * 1024 * 1024)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES },
})

function registerDocumentRoutes(app, authMiddleware, requireAdminOrRegistrarRole, publicReadLimiter, logAudit, dbReadyGuard) {
  const objectIdParam = Joi.object({ id: securityMiddleware.schemas.objectId })

  const controller = createDocumentController({ logAudit, dbReadyGuard })

  // ─── Public documents ──────────────────────────────────────
  app.get('/api/documents', publicReadLimiter, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documents.query), controller.listPublicDocuments)

  // ─── Admin document CRUD ───────────────────────────────────
  app.get('/api/admin/documents', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documents.query), controller.listAdminDocuments)

  app.get('/api/admin/documents/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ params: objectIdParam }), controller.getDocument)

  app.get('/api/admin/documents/:id/asset', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({
    params: objectIdParam,
    query: Joi.object({ download: Joi.boolean().optional() })
  }), controller.serveDocumentAsset)

  // Multipart file upload — multer parses the file into req.file, form fields
  // into req.body. convertBody: true lets Joi coerce string form values
  // ("true" → boolean, "123" → number) to their schema types.
  app.post('/api/admin/documents', authMiddleware, requireAdminOrRegistrarRole, documentUpload.single('file'), securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.documents.create, convertBody: true }), controller.uploadDocument)

  app.put('/api/admin/documents/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({
    body: securityMiddleware.schemas.documents.update,
    params: objectIdParam
  }), controller.updateDocument)

  app.post('/api/admin/documents/:id/download', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ params: objectIdParam }), controller.trackDownload)

  app.delete('/api/admin/documents/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ params: objectIdParam }), controller.deleteDocument)

  // ─── Bulk operations ───────────────────────────────────────
  app.post('/api/admin/documents/bulk/delete', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documents.bulkDelete), controller.bulkDeleteDocuments)

  app.post('/api/admin/documents/bulk/move', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documents.bulkMove), controller.bulkMoveDocuments)

  app.put('/api/admin/documents/bulk/update', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documents.bulkUpdate), controller.bulkUpdateDocuments)

  // ─── Document versioning ───────────────────────────────────
  app.get('/api/admin/documents/:id/versions', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ params: objectIdParam }), controller.listVersions)

  app.post('/api/admin/documents/:id/versions', authMiddleware, requireAdminOrRegistrarRole, documentUpload.single('file'), securityMiddleware.inputValidationMiddleware({
    body: securityMiddleware.schemas.documents.version,
    params: objectIdParam,
    convertBody: true
  }), controller.uploadNewVersion)

  app.get('/api/admin/documents/:id/versions/:versionId/asset', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({
    params: Joi.object({ id: securityMiddleware.schemas.objectId, versionId: securityMiddleware.schemas.objectId }),
    query: Joi.object({ download: Joi.boolean().optional() })
  }), controller.serveVersionAsset)

  // ─── Admin folder CRUD ─────────────────────────────────────
  app.get('/api/admin/document-folders', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documentFolders.query), controller.listFolders)

  app.post('/api/admin/document-folders', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.documentFolders.create), controller.createFolder)

  app.put('/api/admin/document-folders/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({
    body: securityMiddleware.schemas.documentFolders.update.body,
    params: objectIdParam
  }), controller.updateFolder)

  app.delete('/api/admin/document-folders/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({
    params: objectIdParam,
    query: Joi.object({ force: Joi.boolean().optional() })
  }), controller.deleteFolder)
}

module.exports = { registerDocumentRoutes }

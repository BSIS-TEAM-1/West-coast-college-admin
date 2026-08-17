const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const UPLOADS_ROOT_DIR = path.join(__dirname, '..', 'uploads')
const DOCUMENT_UPLOADS_DIR = path.join(UPLOADS_ROOT_DIR, 'documents')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_DOCUMENTS_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET || 'documents'

// Detect placeholder values so we fall back to local storage instead of
// hitting Supabase with a fake key and failing with cryptic auth errors.
const PLACEHOLDER_VALUES = new Set(['', 'replace-me-with-the-service-role-key', 'your-service-role-key', 'changeme'])
const isConfigured = Boolean(SUPABASE_URL) && Boolean(SUPABASE_SERVICE_ROLE_KEY) && !PLACEHOLDER_VALUES.has(SUPABASE_SERVICE_ROLE_KEY.trim().toLowerCase())
const useSupabase = isConfigured

let supabaseClient = null
if (useSupabase) {
  const { createClient } = require('@supabase/supabase-js')
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  console.log(`[document-storage] Using Supabase Storage (bucket: ${SUPABASE_DOCUMENTS_BUCKET})`)
} else {
  console.log(`[document-storage] Supabase not configured — using local filesystem at ${DOCUMENT_UPLOADS_DIR}`)
}

function sanitizeStorageFileName(fileName) {
  const trimmedFileName = String(fileName || '').trim()
  const safeFileName = trimmedFileName
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safeFileName || 'document.bin'
}

function buildStorageKey({ originalFileName, department, folderId }) {
  const safeName = sanitizeStorageFileName(originalFileName)
  const extension = path.extname(safeName)
  const baseName = path.basename(safeName, extension) || 'document'
  const uuid = crypto.randomUUID()
  const deptSegment = department && department !== 'GENERAL' ? department.toLowerCase() : 'general'
  const folderSegment = folderId || 'unfiled'
  return `${deptSegment}/${folderSegment}/${Date.now()}-${uuid}-${baseName}${extension}`
}

// ─── Supabase adapter ─────────────────────────────────────────

const supabaseAdapter = {
  async upload({ buffer, originalFileName, mimeType, department, folderId }) {
    const key = buildStorageKey({ originalFileName, department, folderId })
    const { error } = await supabaseClient.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .upload(key, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      })

    if (error) {
      const uploadError = new Error(`Supabase upload failed: ${error.message}`)
      uploadError.statusCode = 500
      throw uploadError
    }

    return { key, size: buffer.length, provider: 'supabase' }
  },

  async download(key) {
    const { data, error } = await supabaseClient.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .download(key)

    if (error) {
      const downloadError = new Error(`Supabase download failed: ${error.message}`)
      downloadError.statusCode = 500
      throw downloadError
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  },

  async getSignedUrl(key, { download = false, expiry = 3600 } = {}) {
    const { data, error } = await supabaseClient.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .createSignedUrl(key, expiry, { download })

    if (error) {
      const urlError = new Error(`Supabase signed URL failed: ${error.message}`)
      urlError.statusCode = 500
      throw urlError
    }

    return data.signedUrl
  },

  async delete(key) {
    const { error } = await supabaseClient.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .remove([key])

    if (error) {
      console.error(`Supabase delete failed for key ${key}:`, error.message)
    }
  },

  async deleteMany(keys) {
    if (!keys.length) return
    const { error } = await supabaseClient.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .remove(keys)

    if (error) {
      console.error(`Supabase batch delete failed:`, error.message)
    }
  },
}

// ─── Local filesystem adapter ─────────────────────────────────

const localAdapter = {
  async upload({ buffer, originalFileName, mimeType, department, folderId }) {
    await fs.promises.mkdir(DOCUMENT_UPLOADS_DIR, { recursive: true })

    const safeName = sanitizeStorageFileName(originalFileName)
    const extension = path.extname(safeName)
    const baseName = path.basename(safeName, extension) || 'document'
    const storedFileName = `${Date.now()}-${crypto.randomUUID()}-${baseName}${extension}`
    const absoluteFilePath = path.join(DOCUMENT_UPLOADS_DIR, storedFileName)

    await fs.promises.writeFile(absoluteFilePath, buffer)

    return {
      key: path.posix.join('documents', storedFileName),
      size: buffer.length,
      provider: 'local',
    }
  },

  async download(key) {
    const absolutePath = path.resolve(UPLOADS_ROOT_DIR, String(key || ''))
    const uploadsRoot = path.resolve(UPLOADS_ROOT_DIR)
    if (!absolutePath.startsWith(uploadsRoot)) {
      const error = new Error('Invalid upload path.')
      error.statusCode = 400
      throw error
    }
    return fs.promises.readFile(absolutePath)
  },

  async getSignedUrl(key, { download = false, expiry = 3600 } = {}) {
    return null
  },

  async delete(key) {
    const absolutePath = path.resolve(UPLOADS_ROOT_DIR, String(key || ''))
    const uploadsRoot = path.resolve(UPLOADS_ROOT_DIR)
    if (!absolutePath.startsWith(uploadsRoot)) return

    try {
      await fs.promises.unlink(absolutePath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  },

  async deleteMany(keys) {
    for (const key of keys) {
      await this.delete(key)
    }
  },
}

// ─── Unified interface ────────────────────────────────────────

const adapter = useSupabase ? supabaseAdapter : localAdapter

module.exports = {
  upload: (params) => adapter.upload(params),
  download: (key) => adapter.download(key),
  getSignedUrl: (key, options) => adapter.getSignedUrl(key, options),
  delete: (key) => adapter.delete(key),
  deleteMany: (keys) => adapter.deleteMany(keys),
  sanitizeStorageFileName,
  buildStorageKey,
  isUsingSupabase: useSupabase,
  provider: useSupabase ? 'supabase' : 'local',

  // Re-export for backward compat
  UPLOADS_ROOT_DIR,
  DOCUMENT_UPLOADS_DIR,
}

require('dotenv').config()

const path = require('path')
const fs = require('fs')
const mongoose = require('mongoose')

const Document = require('../models/Document')
const storage = require('../services/documentStorageService')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI

const args = process.argv.slice(2)
const isDryRun = !args.includes('--apply')
const isReportOnly = args.includes('--report')

async function migrateDocumentsToSupabase() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set.')
    process.exit(1)
  }

  if (!storage.isUsingSupabase) {
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  console.log(`\n=== Supabase Storage Migration ===`)
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'APPLY'}`)
  console.log(`Bucket: ${process.env.SUPABASE_DOCUMENTS_BUCKET || 'documents'}\n`)

  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB.\n')

  const query = {
    $or: [
      { storageProvider: { $exists: false } },
      { storageProvider: 'local' },
      { storageProvider: null },
    ],
    isTrashed: { $ne: true },
    filePath: { $exists: true, $ne: null },
  }

  const documents = await Document.find(query).select('_id title fileName originalFileName mimeType filePath department folderId storageProvider storageKey')
  console.log(`Found ${documents.length} document(s) to migrate.\n`)

  if (isReportOnly) {
    for (const doc of documents) {
      const localPath = path.resolve(storage.UPLOADS_ROOT_DIR, doc.filePath)
      const exists = fs.existsSync(localPath)
      console.log(`  [${exists ? 'OK' : 'MISSING'}] ${doc._id} | ${doc.title} | ${doc.filePath}`)
    }
    console.log(`\nReport complete. ${documents.length} document(s), ${documents.filter(d => !fs.existsSync(path.resolve(storage.UPLOADS_ROOT_DIR, d.filePath))).length} missing.`)
    await mongoose.disconnect()
    return
  }

  let migrated = 0
  let failed = 0
  let skipped = 0

  for (const doc of documents) {
    const localPath = path.resolve(storage.UPLOADS_ROOT_DIR, doc.filePath)

    if (!fs.existsSync(localPath)) {
      console.log(`  [SKIP] ${doc._id} | ${doc.title} | file not found at ${localPath}`)
      skipped++
      continue
    }

    try {
      const buffer = await fs.promises.readFile(localPath)
      const result = await storage.upload({
        buffer,
        originalFileName: doc.originalFileName || doc.fileName,
        mimeType: doc.mimeType,
        department: doc.department || 'GENERAL',
        folderId: doc.folderId?.toString() || 'unfiled',
      })

      if (!isDryRun) {
        doc.storageProvider = 'supabase'
        doc.storageKey = result.key
        doc.filePath = result.key
        await doc.save()

        try {
          await fs.promises.unlink(localPath)
        } catch (e) {
          if (e.code !== 'ENOENT') console.error(`  [WARN] Failed to delete local file: ${e.message}`)
        }
      }

      console.log(`  [${isDryRun ? 'DRY' : 'OK'}] ${doc._id} | ${doc.title} | ${doc.filePath} -> ${result.key}`)
      migrated++
    } catch (error) {
      console.error(`  [FAIL] ${doc._id} | ${doc.title} | ${error.message}`)
      failed++
    }
  }

  console.log(`\n=== Migration Summary ===`)
  console.log(`Migrated: ${migrated}`)
  console.log(`Skipped:  ${skipped}`)
  console.log(`Failed:   ${failed}`)
  console.log(`Total:    ${documents.length}`)

  await mongoose.disconnect()
  console.log('\nDisconnected from MongoDB.')
}

migrateDocumentsToSupabase().catch((error) => {
  console.error('Migration error:', error)
  process.exit(1)
})

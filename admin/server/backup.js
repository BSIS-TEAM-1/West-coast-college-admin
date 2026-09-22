const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { finished, pipeline } = require('stream/promises');
const mongoose = require('mongoose');
const Backup = require('./models/Backup');
const BackupVerificationReport = require('./models/BackupVerificationReport');
const { createBackupStorage } = require('./services/backupStorage');
const { createBackupEncryptionProvider } = require('./services/backupEncryption');
const { createBackupNotificationService } = require('./services/backupNotifications');

function formatBytesLocal(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

/**
 * Strip any supported backup extension chain from a file name.
 * Supported legacy + current forms: .json, .json.gz, .json.gz.enc
 */
function stripBackupExtensions(value) {
  return String(value || '').replace(/\.json(?:\.gz(?:\.enc)?)?$/i, '');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const APP_VERSION = process.env.APP_VERSION || require('../package.json').version || 'unknown';
const SCHEMA_VERSION = process.env.DB_SCHEMA_VERSION || '1';
const ENGINE_VERSION = '2.1.0';
const FORMAT_VERSION = '1.0';

const AUTOMATIC_TYPES = new Set(['scheduled', 'initial']);
const SUPPORTED_TYPES = new Set(['manual', 'scheduled', 'initial', 'emergency', 'legacy']);

/**
 * Conceptual verification states surfaced to the UI. These map onto the
 * existing `verificationStatus` enum rather than adding a parallel field.
 *
 *   verified             -> Verified            (restorable)
 *   pending              -> Verification Required
 *   failed               -> Verification Failed
 *   missing              -> Storage Missing
 */
const VERIFICATION_STATE = {
  verified: { state: 'verified', label: 'Verified', restorable: true },
  pending: { state: 'verification_required', label: 'Verification Required', restorable: false },
  failed: { state: 'verification_failed', label: 'Verification Failed', restorable: false },
  missing: { state: 'storage_missing', label: 'Storage Missing', restorable: false }
};

class BackupBusyError extends Error {
  constructor(operation) {
    super(`Backup system is busy with ${operation || 'another operation'}`);
    this.name = 'BackupBusyError';
    this.code = 'BACKUP_BUSY';
    this.statusCode = 409;
  }
}

class BackupSystem {
  constructor() {
    this.backupDir = path.join(__dirname, 'backups');
    this.storage = createBackupStorage(this.backupDir);
    this.encryption = createBackupEncryptionProvider();
    this.notifications = createBackupNotificationService();
    this.backupDir = this.storage.rootDir;
    this.retentionLimit = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10) || 10);
    this.activeOperation = null;
    this.lastRestore = null;
    this.lastStorageAlertLevel = null;
    this.reconciliationPromise = null;
    this.statsCache = null;
    this.statsPromise = null;
    this.statsCacheTtlMs = Math.max(5000, Number.parseInt(process.env.BACKUP_STATS_CACHE_MS || '30000', 10) || 30000);
    this.retentionPolicy = {
      hourly: Math.max(0, Number.parseInt(process.env.BACKUP_RETENTION_HOURLY || '48', 10) || 0),
      daily: Math.max(0, Number.parseInt(process.env.BACKUP_RETENTION_DAILY || '30', 10) || 0),
      weekly: Math.max(0, Number.parseInt(process.env.BACKUP_RETENTION_WEEKLY || '12', 10) || 0),
      monthly: Math.max(0, Number.parseInt(process.env.BACKUP_RETENTION_MONTHLY || '12', 10) || 0)
    };
  }

  ensureBackupDir() {
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  getOperationStatus() {
    return this.activeOperation ? { ...this.activeOperation } : null;
  }

  invalidateCaches() {
    this.statsCache = null;
  }

  async withLock(type, details, work) {
    if (this.activeOperation) throw new BackupBusyError(this.activeOperation.type);
    this.activeOperation = { type, startedAt: new Date(), ...details };
    try {
      return await work();
    } finally {
      this.activeOperation = null;
    }
  }

  /**
   * Start a backup without awaiting it. The withLock guard inside
   * createBackup is acquired synchronously (no await precedes it), so
   * probing activeOperation first and then calling createBackup in the same
   * tick is race-free: either this call owns the lock or it gets 409.
   * Completion (audit/logging) is the caller's onSettled callback; any
   * throw from it is contained so a logging failure can never wedge the lock
   * (withLock's finally already released it by then).
   */
  startBackupAsync(type, triggeredBy, onSettled) {
    const invokeSettled = (error, result) => {
      if (typeof onSettled !== 'function') {
        if (error) console.error('Background backup failed:', error);
        return;
      }
      // onSettled may be async: always adapt to a promise so a logging
      // failure can never surface as an unhandled rejection.
      Promise.resolve()
        .then(() => onSettled(error, result))
        .catch((callbackError) => console.error('Backup completion callback error:', callbackError));
    };
    if (this.activeOperation) {
      const busy = new BackupBusyError(this.activeOperation.type);
      invokeSettled(busy);
      return { accepted: false, status: 'running', operation: this.getOperationStatus(), error: busy.message, code: busy.code };
    }
    const promise = this.createBackup(type, triggeredBy);
    promise.then(
      (result) => invokeSettled(null, result),
      (error) => invokeSettled(error)
    );
    return { accepted: true, status: 'running', operation: this.getOperationStatus() };
  }

  normalizeType(value) {
    const type = String(value || 'manual').trim().toLowerCase();
    return SUPPORTED_TYPES.has(type) ? type : 'manual';
  }

  /* ------------------------------------------------------------------ */
  /* Record + physical file resolution                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Find a backup record tolerantly. A caller may pass the archive name,
   * the legacy .json name, or the bare base name. All resolve to the same
   * record so the UI never 404s just because the stored name uses a
   * different extension than the one the caller happens to hold.
   */
  async findBackupRecord(fileName, { lean = false } = {}) {
    if (mongoose.connection.readyState !== 1) return null;
    const safeName = path.basename(String(fileName || ''));
    if (!safeName) return null;

    const query = lean
      ? (filter) => Backup.findOne(filter).lean()
      : (filter) => Backup.findOne(filter);

    let record = await query({ fileName: safeName });
    if (record) return record;

    record = await query({ originalFileName: safeName });
    if (record) return record;

    const base = stripBackupExtensions(safeName);
    if (!base) return null;
    const pattern = new RegExp(`^${escapeRegExp(base)}\\.json(?:\\.gz(?:\\.enc)?)?$`, 'i');
    return query({ fileName: { $regex: pattern } });
  }

  /**
   * Resolve the archive that actually exists in configured storage for a
   * record, regardless of which extension the database happens to hold.
   *
   * The database value is always tried first so we never silently bind a
   * record to an unrelated file; only then do we fall back to the canonical
   * derivations for the same base name.
   *
   * Returns:
   *   base          - file name with all backup extensions stripped
   *   archiveName   - the archive that exists, or null
   *   jsonName      - the optional plaintext JSON sidecar, or null
   *   isEncrypted   - derived from the resolved archive, not from metadata
   *   exists        - whether a usable archive was found
   *   candidates    - everything that was probed (used in error messages)
   */
  resolveBackupFiles(record) {
    const declared = record?.fileName ? path.basename(String(record.fileName)) : null;
    const compressed = record?.compressedPath ? path.basename(String(record.compressedPath)) : null;
    const original = record?.originalFileName ? path.basename(String(record.originalFileName)) : null;
    const base = stripBackupExtensions(declared || compressed || original || '');

    const candidates = [];
    const push = (name) => {
      if (name && !candidates.includes(name)) candidates.push(name);
    };

    // Metadata-declared archives first.
    if (declared && /\.(gz|enc)$/i.test(declared)) push(declared);
    if (compressed && /\.(gz|enc)$/i.test(compressed)) push(compressed);
    // Canonical derivations for legacy records whose fileName is still ".json".
    if (base) {
      push(`${base}.json.gz.enc`);
      push(`${base}.json.gz`);
    }

    const archiveName = candidates.find((name) => this.storage.exists(name)) || null;

    // Trust the file on disk over the metadata flag: a record created before
    // the scheduled-backup fix may claim isEncrypted:false while the archive
    // on disk is .json.gz.enc (and vice versa).
    const isEncrypted = archiveName ? /\.enc$/i.test(archiveName) : Boolean(record?.isEncrypted);

    // The plaintext sidecar is optional. Encrypted backups never keep one.
    const jsonCandidate = base ? `${base}.json` : null;
    const jsonName = !isEncrypted && jsonCandidate && this.storage.exists(jsonCandidate) ? jsonCandidate : null;

    return { base, archiveName, jsonName, isEncrypted, exists: Boolean(archiveName), candidates };
  }

  /**
   * Translate a record into the conceptual state the UI renders.
   * Storage presence is evaluated separately from verification outcome so a
   * missing verification report can never masquerade as a missing file.
   */
  describeVerificationState(record, resolved) {
    if (!resolved || !resolved.exists) {
      return { ...VERIFICATION_STATE.missing, detail: 'The backup archive is not present in configured storage.' };
    }
    const status = record?.verificationStatus;
    if (status === 'verified') {
      return { ...VERIFICATION_STATE.verified, detail: 'Archive, checksum, and schema validated.' };
    }
    if (status === 'failed') {
      return { ...VERIFICATION_STATE.failed, detail: record?.error || 'Integrity verification failed.' };
    }
    if (status === 'missing') {
      // The file is present, so a stale "missing" flag is only a stale flag.
      return { ...VERIFICATION_STATE.pending, detail: 'Archive found in storage but not yet verified.' };
    }
    return { ...VERIFICATION_STATE.pending, detail: 'This backup has not been verified yet.' };
  }

  /* ------------------------------------------------------------------ */
  /* Primitives                                                          */
  /* ------------------------------------------------------------------ */

  async hashFile(fileName) {
    const hash = crypto.createHash('sha256');
    await pipeline(this.storage.createReadStream(fileName), hash);
    return hash.digest('hex');
  }

  async writeChunk(stream, value) {
    if (!stream.write(value)) await new Promise(resolve => stream.once('drain', resolve));
  }

  async streamDatabaseToJson(fileName) {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error('Database is not connected');
    }

    const output = this.storage.createWriteStream(fileName, { flags: 'wx' });
    const collectionStats = [];
    let documentCount = 0;
    let streamError = null;
    output.on('error', error => { streamError = error; });

    try {
      await this.writeChunk(output, `{"timestamp":${JSON.stringify(new Date().toISOString())},"version":"1.0","collections":{`);
      const collections = await mongoose.connection.db.listCollections().toArray();
      let firstCollection = true;

      for (const { name } of collections) {
        if (!firstCollection) await this.writeChunk(output, ',');
        firstCollection = false;
        await this.writeChunk(output, `${JSON.stringify(name)}:[`);

        let firstDocument = true;
        let count = 0;
        const cursor = mongoose.connection.db.collection(name).find({});
        for await (const document of cursor) {
          if (!firstDocument) await this.writeChunk(output, ',');
          firstDocument = false;
          await this.writeChunk(output, JSON.stringify(document));
          count += 1;
          documentCount += 1;
        }

        await this.writeChunk(output, ']');
        collectionStats.push({ name, count });
      }

      await this.writeChunk(output, '}}');
      output.end();
      await finished(output);
      if (streamError) throw streamError;
      return { collectionStats, documentCount };
    } catch (error) {
      output.destroy();
      throw error;
    }
  }

  async compressBackup(inputName, outputName) {
    await pipeline(
      this.storage.createReadStream(inputName),
      zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
      this.storage.createWriteStream(outputName, { flags: 'wx' })
    );
  }

  validateBackupData(backupData, expectedCollections = null) {
    const errors = [];
    const warnings = [];
    if (!backupData || typeof backupData !== 'object' || Array.isArray(backupData)) errors.push('Backup root must be an object');
    if (!backupData?.collections || typeof backupData.collections !== 'object' || Array.isArray(backupData.collections)) errors.push('Missing or invalid collections data');
    if (!backupData?.timestamp || Number.isNaN(Date.parse(backupData.timestamp))) errors.push('Missing or invalid backup timestamp');
    if (!backupData?.version) warnings.push('Missing backup version');
    else if (backupData.version !== '1.0') warnings.push(`Unexpected backup version: ${backupData.version}`);

    const counts = {};
    if (backupData?.collections && typeof backupData.collections === 'object') {
      for (const [collectionName, documents] of Object.entries(backupData.collections)) {
        if (!Array.isArray(documents)) errors.push(`Collection ${collectionName} is not an array`);
        else counts[collectionName] = documents.length;
      }
    }

    if (Array.isArray(expectedCollections)) {
      for (const expected of expectedCollections) {
        if (counts[expected.name] !== expected.count) {
          errors.push(`Collection count mismatch for ${expected.name}: expected ${expected.count}, found ${counts[expected.name] ?? 'missing'}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      counts,
      summary: `Validated ${Object.keys(counts).length} collections with ${errors.length} errors and ${warnings.length} warnings`
    };
  }

  /**
   * Validate an archive end to end.
   *
   * The archive is the source of truth. The plaintext JSON sidecar is an
   * optional convenience: when present it is cross-checked, when absent the
   * archive is still fully validated (read, decrypt, decompress, parse,
   * schema-check, checksum-check). Requiring the sidecar was wrong — it is
   * deliberately deleted for encrypted backups and may be rotated away for
   * older plaintext ones.
   */
  async verifyFiles(jsonName, archiveName, expected = {}) {
    if (!archiveName) throw Object.assign(new Error('Backup archive could not be resolved'), { code: 'STORAGE_MISSING' });
    if (!this.storage.exists(archiveName)) {
      throw Object.assign(new Error(`Backup archive is missing: ${archiveName}`), { code: 'STORAGE_MISSING' });
    }
    const hasJson = Boolean(jsonName && this.storage.exists(jsonName));

    const checksum = await this.hashFile(archiveName);
    if (expected.checksum && expected.checksum !== checksum) throw new Error('Archive checksum mismatch');

    const isEncrypted = expected.isEncrypted ?? /\.enc$/i.test(archiveName);
    if (isEncrypted && !this.encryption.enabled) {
      throw new Error('Backup is encrypted but no encryption key is configured');
    }

    const storedArchive = this.storage.readFile(archiveName);
    const compressed = isEncrypted ? this.encryption.decryptBuffer(storedArchive) : storedArchive;
    const decompressed = await new Promise((resolve, reject) => zlib.gunzip(compressed, (error, data) => error ? reject(error) : resolve(data)));
    const jsonChecksum = crypto.createHash('sha256').update(decompressed).digest('hex');
    if (hasJson) {
      const sourceChecksum = await this.hashFile(jsonName);
      if (sourceChecksum !== jsonChecksum) throw new Error('Compressed archive content does not match JSON backup');
    }
    if (expected.jsonChecksum && expected.jsonChecksum !== jsonChecksum) throw new Error('JSON checksum mismatch');

    let backupData;
    try { backupData = JSON.parse(decompressed.toString('utf8')); }
    catch (error) { throw new Error(`Backup JSON is invalid: ${error.message}`); }
    const validation = this.validateBackupData(backupData, expected.collections);
    if (!validation.isValid) throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);

    const ageMs = Date.now() - new Date(backupData.timestamp).getTime();
    const maxAgeMs = Number.parseInt(process.env.BACKUP_MAX_AGE_HOURS || '24', 10) * 60 * 60 * 1000;
    const detailedValidation = {
      fileExists: true,
      jsonSidecarPresent: hasJson,
      jsonValid: true,
      gzipIntegrity: true,
      checksumValid: true,
      collectionCountsValid: true,
      metadataConsistent: !expected.collections || validation.errors.length === 0,
      versionCompatible: backupData.version === FORMAT_VERSION,
      ageValid: Number.isFinite(ageMs) && ageMs <= maxAgeMs,
      ageMs,
      warnings: validation.warnings
    };
    return { checksum, jsonChecksum, jsonSize: decompressed.length, validation, detailedValidation, backupData };
  }

  /**
   * Same contract as verifyFiles, minus the parsed `backupData`, executed in
   * a worker thread so full-DB gunzip + JSON.parse + hashing never blocks
   * the API event loop. Falls back to in-thread verification when worker
   * threads are unavailable. A timeout terminates a hung worker and surfaces
   * as a normal verification failure (record marked failed, lock released).
   */
  async verifyFilesThreaded(jsonName, archiveName, expected = {}) {
    let WorkerCtor = null;
    try {
      ({ Worker: WorkerCtor } = require('worker_threads'));
    } catch (requireError) {
      console.error('worker_threads unavailable, verifying in-process:', requireError.message);
    }
    if (!WorkerCtor) {
      const full = await this.verifyFiles(jsonName, archiveName, expected);
      const { backupData, ...rest } = full;
      return rest;
    }

    const timeoutMs = Math.max(
      60000,
      Number.parseInt(process.env.BACKUP_VERIFY_TIMEOUT_MS || '1800000', 10) || 1800000
    );
    // Pass encryption material explicitly: ambient env is inherited by
    // workers in production, but some hosts/sandboxes do not propagate
    // parent env mutations to worker threads.
    const encryptionDescriptor = {
      enabled: Boolean(this.encryption && this.encryption.enabled)
    };
    if (encryptionDescriptor.enabled && this.encryption.key && Buffer.isBuffer(this.encryption.key)) {
      encryptionDescriptor.keyB64 = this.encryption.key.toString('base64');
    }
    const safeExpected = {
      checksum: typeof expected.checksum === 'string' ? expected.checksum : undefined,
      jsonChecksum: typeof expected.jsonChecksum === 'string' ? expected.jsonChecksum : undefined,
      collections: Array.isArray(expected.collections)
        ? expected.collections.map((entry) => ({ name: String(entry?.name || ''), count: Number(entry?.count) || 0 }))
        : undefined,
      isEncrypted: expected.isEncrypted
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      let worker = null;
      const finish = (error, message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (worker) {
          worker.removeAllListeners();
          worker.terminate().catch(() => {});
        }
        if (error) reject(error);
        else resolve(message);
      };
      const timer = setTimeout(() => {
        finish(new Error(`Backup verification timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (timer.unref) timer.unref();

      try {
        worker = new WorkerCtor(require('path').join(__dirname, 'backupVerifyWorker.js'), {
          workerData: {
            storageRoot: this.storage.rootDir,
            archiveName,
            jsonName: jsonName || null,
            expected: safeExpected,
            encryption: encryptionDescriptor
          }
        });
      } catch (spawnError) {
        finish(spawnError);
        return;
      }
      if (worker.unref) worker.unref();
      worker.on('message', (message) => {
        if (!message || typeof message !== 'object') {
          finish(new Error('Verify worker returned an invalid message'));
          return;
        }
        if (message.ok) {
          finish(null, message.result);
          return;
        }
        const failure = new Error(message.error || 'Backup verification failed in worker thread');
        if (message.code) failure.code = message.code;
        finish(failure);
      });
      worker.on('error', (workerError) => finish(workerError));
      worker.on('exit', (code) => {
        if (!settled) finish(new Error(`Verify worker exited unexpectedly with code ${code}`));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Create                                                              */
  /* ------------------------------------------------------------------ */

  async createBackup(backupType = 'manual', triggeredBy = 'system', options = {}) {
    const type = this.normalizeType(backupType);
    const actor = type === 'manual' ? String(triggeredBy || 'system').trim() || 'system' : String(triggeredBy || 'system');
    if (options.skipLock) return this.createBackupUnlocked(type, actor, options);

    try {
      return await this.withLock('backup', { backupType: type, triggeredBy: actor }, () => this.createBackupUnlocked(type, actor, options));
    } catch (error) {
      return { success: false, error: error.message, code: error.code || 'BACKUP_FAILED' };
    }
  }

  async createBackupUnlocked(type, triggeredBy, options = {}) {
    const startedAt = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isEncrypted = this.encryption.enabled;
    const token = crypto.randomUUID();
    const tempJsonName = `.pending-${token}.json`;
    const tempGzipName = `.pending-${token}.json.gz`;
    const tempArchiveName = `${tempGzipName}${isEncrypted ? '.enc' : ''}`;
    const isProtected = Boolean(options.isProtected || type === 'manual' || type === 'emergency');
    let record = null;
    let promotedJson = false;
    let promotedArchive = false;

    // Final filename is decided from the encryption state BEFORE the database
    // record is created, so metadata can never disagree with storage.
    const finalFileName = isEncrypted
      ? `backup-${timestamp}.json.gz.enc`
      : `backup-${timestamp}.json.gz`;
    const jsonFileName = `backup-${timestamp}.json`;

    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new Error('Database is not connected');
      record = await Backup.create({
        fileName: finalFileName,
        originalFileName: jsonFileName,
        filePath: isEncrypted ? this.storage.resolve(finalFileName) : this.storage.resolve(jsonFileName),
        compressedPath: this.storage.resolve(finalFileName),
        backupType: type,
        triggeredBy,
        status: 'in_progress',
        verificationStatus: 'pending',
        isProtected,
        storageProvider: this.storage.provider,
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        backupEngineVersion: ENGINE_VERSION,
        backupFormatVersion: FORMAT_VERSION,
        isEncrypted,
        encryptionProvider: isEncrypted ? this.encryption.name : null
      });

      const exportStartedAt = Date.now();
      const { collectionStats, documentCount } = await this.streamDatabaseToJson(tempJsonName);
      const exportDurationMs = Date.now() - exportStartedAt;
      const size = this.storage.stat(tempJsonName).size;
      const compressionStartedAt = Date.now();
      await this.compressBackup(tempJsonName, tempGzipName);
      const compressionDurationMs = Date.now() - compressionStartedAt;
      let encryptionDurationMs = 0;
      if (isEncrypted) {
        const encryptionStartedAt = Date.now();
        await this.encryption.encryptFile(this.storage.resolve(tempGzipName), this.storage.resolve(tempArchiveName));
        encryptionDurationMs = Date.now() - encryptionStartedAt;
        this.storage.remove(tempGzipName);
      }
      const verificationStartedAt = Date.now();
      const verification = await this.verifyFilesThreaded(tempJsonName, tempArchiveName, { collections: collectionStats, isEncrypted });
      const verificationDurationMs = Date.now() - verificationStartedAt;

      if (isEncrypted) {
        this.storage.remove(tempJsonName);
      } else {
        this.storage.rename(tempJsonName, jsonFileName);
        promotedJson = true;
      }
      this.storage.rename(tempArchiveName, finalFileName);
      promotedArchive = true;

      if (!this.storage.exists(finalFileName)) {
        throw new Error(`Final backup file was not created: ${finalFileName}`);
      }

      const compressedSize = this.storage.stat(finalFileName).size;
      const durationMs = Date.now() - startedAt;
      Object.assign(record, {
        status: 'completed',
        completedAt: new Date(),
        size,
        compressedSize,
        documentCount,
        collections: collectionStats,
        checksum: verification.checksum,
        jsonChecksum: verification.jsonChecksum,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        durationMs,
        validationResults: verification.detailedValidation,
        performance: {
          exportDurationMs,
          compressionDurationMs,
          encryptionDurationMs: isEncrypted ? encryptionDurationMs : null,
          verificationDurationMs,
          storageWriteBytesPerSecond: durationMs ? Math.round((size + compressedSize) / (durationMs / 1000)) : null
        },
        error: null
      });
      await record.save();
      this.invalidateCaches();

      await BackupVerificationReport.create({
        backupId: record._id, fileName: finalFileName, type: 'integrity', status: 'passed', startedAt: new Date(verificationStartedAt),
        completedAt: new Date(), durationMs: verificationDurationMs, validationResults: verification.detailedValidation,
        collectionCounts: verification.validation.counts
      });

      if (String(process.env.BACKUP_AUTO_RETENTION || 'false').toLowerCase() === 'true') {
        await this.cleanupOldBackups();
      }
      await this.notifications.notify('backup.completed', { backupId: String(record._id), fileName: finalFileName, backupType: type, durationMs, isEncrypted });
      return {
        success: true,
        fileName: finalFileName,
        size,
        compressedSize,
        documentCount,
        checksum: verification.checksum,
        verificationStatus: 'verified',
        durationMs,
        isProtected,
        isEncrypted,
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        backupId: record._id
      };
    } catch (error) {
      for (const name of [tempJsonName, tempGzipName, tempArchiveName]) {
        try { this.storage.remove(name); } catch (_) { /* best effort */ }
      }
      if (promotedJson) { try { this.storage.remove(jsonFileName); } catch (_) { /* best effort */ } }
      if (promotedArchive) { try { this.storage.remove(finalFileName); } catch (_) { /* best effort */ } }
      if (record) {
        record.status = 'failed';
        record.verificationStatus = 'failed';
        record.error = error.message;
        record.completedAt = new Date();
        record.durationMs = Date.now() - startedAt;
        try { await record.save(); } catch (metadataError) { console.error('Failed to record backup failure:', metadataError); }
      }
      console.error('Backup failed:', error);
      await this.notifications.notify('backup.failed', { backupId: record?._id ? String(record._id) : null, fileName: finalFileName, backupType: type, error: error.message });
      return { success: false, error: error.message, code: error.code || 'BACKUP_FAILED' };
    }
  }

  async createBackupFileOnly(backupType = 'manual', triggeredBy = 'system') {
    return this.createBackup(backupType, triggeredBy);
  }

  /* ------------------------------------------------------------------ */
  /* Retention / reconciliation                                          */
  /* ------------------------------------------------------------------ */

  async removeBackupFiles(record) {
    const failures = [];
    const resolved = this.resolveBackupFiles(record);
    const filesToRemove = new Set();

    if (resolved.archiveName) filesToRemove.add(resolved.archiveName);
    if (resolved.jsonName) filesToRemove.add(resolved.jsonName);

    // Also sweep any declared names that still exist but were not resolved.
    for (const name of [record.fileName, record.compressedPath && path.basename(record.compressedPath), record.originalFileName]) {
      const safe = name ? path.basename(String(name)) : null;
      if (safe && this.storage.exists(safe)) filesToRemove.add(safe);
    }

    for (const name of filesToRemove) {
      try { this.storage.remove(name); } catch (error) { failures.push(`${name}: ${error.message}`); }
    }
    if (failures.length) throw new Error(`Backup file deletion incomplete: ${failures.join('; ')}`);
  }

  async cleanupOldBackups() {
    if (mongoose.connection.readyState !== 1) return [];
    const candidates = await Backup.find({
      backupType: { $in: Array.from(AUTOMATIC_TYPES) },
      status: 'completed',
      verificationStatus: 'verified',
      isProtected: { $ne: true }
    }).sort({ createdAt: -1 });

    const recordsToRemove = this.selectRetentionRecords(candidates);

    const removed = [];
    for (const record of recordsToRemove) {
      try {
        await this.removeBackupFiles(record);
        removed.push(record.fileName);
        await Backup.deleteOne({ _id: record._id });
      } catch (error) {
        record.error = `Retention failed: ${error.message}`;
        await record.save();
        console.error(`Could not rotate backup ${record.fileName}:`, error);
      }
    }
    return removed;
  }

  selectRetentionRecords(candidates, currentTime = Date.now()) {
    const now = currentTime;
    const seen = { hourly: new Set(), daily: new Set(), weekly: new Set(), monthly: new Set() };
    const keep = new Set();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    for (const record of candidates) {
      const created = new Date(record.createdAt);
      const ageMs = Math.max(0, now - created.getTime());
      let tier;
      let key;
      if (ageMs < this.retentionPolicy.hourly * hourMs) {
        tier = 'hourly'; key = created.toISOString().slice(0, 13);
      } else if (ageMs < this.retentionPolicy.daily * dayMs) {
        tier = 'daily'; key = created.toISOString().slice(0, 10);
      } else if (ageMs < this.retentionPolicy.weekly * 7 * dayMs) {
        tier = 'weekly';
        const week = Math.floor(created.getTime() / (7 * dayMs));
        key = String(week);
      } else if (ageMs < this.retentionPolicy.monthly * 31 * dayMs) {
        tier = 'monthly'; key = created.toISOString().slice(0, 7);
      }
      if (tier && !seen[tier].has(key)) {
        seen[tier].add(key);
        keep.add(String(record._id));
      }
    }
    if (candidates[0]) keep.add(String(candidates[0]._id));

    return candidates.filter(item => !keep.has(String(item._id)));
  }

  async reconcileMetadata() {
    if (this.reconciliationPromise) return this.reconciliationPromise;
    this.reconciliationPromise = this.reconcileMetadataUnlocked();
    try { return await this.reconciliationPromise; }
    finally { this.reconciliationPromise = null; }
  }

  async reconcileMetadataUnlocked() {
    if (mongoose.connection.readyState !== 1) return { missing: 0, imported: 0, healed: 0 };
    const storedNames = this.storage.list().filter(name => !name.startsWith('.pending-'));
    const plainJson = storedNames.filter(name => /\.json$/i.test(name));
    const compressedArchives = storedNames.filter(name => /\.json\.gz$/i.test(name));
    const encryptedArchives = storedNames.filter(name => /\.json\.gz\.enc$/i.test(name));
    const records = await Backup.find();
    let missing = 0;
    let imported = 0;
    let healed = 0;

    for (const record of records) {
      const resolved = this.resolveBackupFiles(record);

      if (record.status === 'completed' && !resolved.exists) {
        // Genuinely absent from storage. This is Storage Missing, and it is
        // the only condition that may set verificationStatus to 'missing'.
        await Backup.updateOne(
          { _id: record._id },
          {
            $set: {
              verificationStatus: 'missing',
              error: `Backup archive missing from ${this.storage.provider} storage (looked for ${resolved.candidates.join(', ')})`
            }
          }
        ).catch(() => {});
        missing += 1;
        continue;
      }

      // Self-heal metadata that points at the wrong extension. This is the
      // "database -> .json / storage -> .json.gz.enc" drift left behind by
      // the pre-fix scheduled-backup pipeline.
      if (resolved.exists && path.basename(String(record.fileName)) !== resolved.archiveName) {
        const update = {
          fileName: resolved.archiveName,
          compressedPath: this.storage.resolve(resolved.archiveName),
          isEncrypted: resolved.isEncrypted
        };
        if (!record.originalFileName) update.originalFileName = path.basename(String(record.fileName));
        if (record.verificationStatus === 'missing') {
          // The file was there all along; downgrade to "needs verification"
          // rather than leaving a false Storage Missing.
          update.verificationStatus = 'pending';
          update.error = null;
        }
        await Backup.updateOne({ _id: record._id }, { $set: update }).catch(() => {});
        healed += 1;
      } else if (resolved.exists && record.verificationStatus === 'missing') {
        await Backup.updateOne(
          { _id: record._id },
          { $set: { verificationStatus: 'pending', error: null } }
        ).catch(() => {});
        healed += 1;
      }
    }

    // Import orphan archives that have no database record.
    const known = new Set();
    for (const record of await Backup.find().select('fileName originalFileName compressedPath').lean()) {
      if (record.fileName) known.add(path.basename(record.fileName));
      if (record.originalFileName) known.add(path.basename(record.originalFileName));
      if (record.compressedPath) known.add(path.basename(record.compressedPath));
    }

    const orphanCandidates = [
      ...encryptedArchives.map(archiveName => ({ base: stripBackupExtensions(archiveName), finalFileName: archiveName, isEncrypted: true })),
      ...compressedArchives.map(archiveName => ({ base: stripBackupExtensions(archiveName), finalFileName: archiveName, isEncrypted: false })),
      // A bare .json with no archive alongside it is a legacy, uncompressed leftover.
      ...plainJson
        .filter(name => !compressedArchives.includes(`${name}.gz`) && !encryptedArchives.includes(`${name}.gz.enc`))
        .map(name => ({ base: stripBackupExtensions(name), finalFileName: name, isEncrypted: false }))
    ].filter(candidate => !known.has(candidate.finalFileName) && !known.has(`${candidate.base}.json`));

    for (const { base, finalFileName, isEncrypted } of orphanCandidates) {
      if (known.has(finalFileName)) continue;
      const stat = this.storage.stat(finalFileName);
      const jsonSidecar = !isEncrypted && this.storage.exists(`${base}.json`) && finalFileName !== `${base}.json`
        ? `${base}.json`
        : null;

      let verificationStatus = 'pending';
      let checksum = null;
      let jsonChecksum = null;
      let documentCount = 0;
      let collections = [];
      let verifiedJsonSize = 0;
      let error = null;

      // Only .gz/.gz.enc archives can be validated by verifyFiles.
      if (/\.gz(\.enc)?$/i.test(finalFileName) && (!isEncrypted || this.encryption.enabled)) {
        try {
          const verified = await this.verifyFilesThreaded(jsonSidecar, finalFileName, { isEncrypted });
          verificationStatus = 'verified';
          checksum = verified.checksum;
          jsonChecksum = verified.jsonChecksum;
          verifiedJsonSize = verified.jsonSize;
          collections = Object.entries(verified.validation.counts).map(([name, count]) => ({ name, count }));
          documentCount = collections.reduce((sum, item) => sum + item.count, 0);
        } catch (verifyError) {
          verificationStatus = 'failed';
          error = verifyError.message;
        }
      } else if (isEncrypted && !this.encryption.enabled) {
        verificationStatus = 'pending';
        error = 'Encrypted archive cannot be verified: no encryption key configured';
      } else {
        verificationStatus = 'pending';
        error = 'Legacy uncompressed backup; verification requires a .json.gz archive';
      }

      try {
        await Backup.create({
          fileName: finalFileName,
          originalFileName: `${base}.json`,
          filePath: this.storage.resolve(jsonSidecar || finalFileName),
          compressedPath: this.storage.resolve(finalFileName),
          size: verificationStatus === 'verified' && isEncrypted ? verifiedJsonSize : stat.size,
          compressedSize: this.storage.stat(finalFileName).size,
          documentCount,
          collections,
          status: verificationStatus === 'failed' ? 'failed' : 'completed',
          backupType: 'legacy',
          triggeredBy: 'reconciliation',
          verificationStatus,
          checksum,
          jsonChecksum,
          verifiedAt: verificationStatus === 'verified' ? new Date() : null,
          completedAt: new Date(stat.mtime),
          createdAt: new Date(stat.mtime),
          isProtected: true,
          storageProvider: this.storage.provider,
          appVersion: 'unknown', schemaVersion: 'unknown', backupEngineVersion: 'legacy', backupFormatVersion: FORMAT_VERSION,
          isEncrypted, encryptionProvider: isEncrypted ? this.encryption.name : null,
          error
        });
        imported += 1;
      } catch (createErr) {
        if (createErr.code === 11000) continue;
        console.error('reconcileMetadata: failed to create backup record:', createErr.message);
      }
    }

    if (healed || missing || imported) this.invalidateCaches();
    return { missing, imported, healed };
  }

  async getBackupHistory() {
    if (mongoose.connection.readyState !== 1) return [];
    const records = await Backup.find().sort({ createdAt: -1 }).limit(100).lean();
    return records.map((record) => {
      const resolved = this.resolveBackupFiles(record);
      const state = this.describeVerificationState(record, resolved);
      return {
        ...record,
        physicalFileName: resolved.archiveName,
        storagePresent: resolved.exists,
        verificationState: state.state,
        verificationLabel: state.label,
        restorable: state.restorable
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Verify                                                              */
  /* ------------------------------------------------------------------ */

  async verifyBackup(fileName, options = {}) {
    const record = await this.findBackupRecord(fileName);
    if (!record) return { success: false, code: 'BACKUP_NOT_FOUND', error: 'Backup metadata not found' };

    const verificationStartedAt = Date.now();
    const resolved = this.resolveBackupFiles(record);

    // Storage Missing is evaluated first and reported as its own condition.
    if (!resolved.exists) {
      record.verificationStatus = 'missing';
      record.error = `Backup archive missing from ${this.storage.provider} storage (looked for ${resolved.candidates.join(', ')})`;
      await record.save();
      await BackupVerificationReport.create({
        backupId: record._id, fileName: record.fileName, type: 'integrity', status: 'failed',
        startedAt: new Date(verificationStartedAt), completedAt: new Date(), durationMs: Date.now() - verificationStartedAt,
        error: record.error
      }).catch(() => {});
      this.invalidateCaches();
      return {
        success: false,
        code: 'STORAGE_MISSING',
        error: record.error,
        verificationStatus: 'missing',
        verificationState: 'storage_missing',
        verificationLabel: 'Storage Missing'
      };
    }

    try {
      // Heal metadata drift before verifying so the checksum comparison and
      // every later operation address the file that actually exists.
      if (path.basename(String(record.fileName)) !== resolved.archiveName) {
        if (!record.originalFileName) record.originalFileName = path.basename(String(record.fileName));
        record.fileName = resolved.archiveName;
        record.compressedPath = this.storage.resolve(resolved.archiveName);
      }
      record.isEncrypted = resolved.isEncrypted;
      if (resolved.isEncrypted && !record.encryptionProvider) record.encryptionProvider = this.encryption.name;

      const result = await this.verifyFiles(resolved.jsonName, resolved.archiveName, {
        checksum: record.checksum,
        jsonChecksum: record.jsonChecksum,
        collections: record.collections,
        isEncrypted: resolved.isEncrypted
      });

      record.checksum = result.checksum;
      record.jsonChecksum = result.jsonChecksum;
      record.verificationStatus = 'verified';
      record.verifiedAt = new Date();
      record.validationResults = result.detailedValidation;
      record.performance = record.performance || {};
      record.performance.verificationDurationMs = Date.now() - verificationStartedAt;
      const archiveSize = this.storage.stat(resolved.archiveName).size;
      record.performance.storageReadBytesPerSecond = record.performance.verificationDurationMs
        ? Math.round(archiveSize / (record.performance.verificationDurationMs / 1000)) : null;
      if (!record.compressedSize) record.compressedSize = archiveSize;
      record.error = null;
      await record.save();
      this.invalidateCaches();

      await BackupVerificationReport.create({
        backupId: record._id, fileName: record.fileName, type: 'integrity', status: 'passed',
        startedAt: new Date(verificationStartedAt), completedAt: new Date(), durationMs: Date.now() - verificationStartedAt,
        validationResults: result.detailedValidation, collectionCounts: result.validation.counts
      });

      return {
        success: true,
        fileName: record.fileName,
        physicalFileName: resolved.archiveName,
        checksum: result.checksum,
        verificationStatus: 'verified',
        verificationState: 'verified',
        verificationLabel: 'Verified',
        validationResults: result.detailedValidation,
        ...(options.includeData ? { _backupData: result.backupData } : {})
      };
    } catch (error) {
      // The archive was present, so this is a genuine integrity failure and
      // must never be reported as Storage Missing.
      const stillPresent = this.storage.exists(resolved.archiveName);
      record.verificationStatus = stillPresent ? 'failed' : 'missing';
      record.error = error.message;
      await record.save();
      await BackupVerificationReport.create({
        backupId: record._id, fileName: record.fileName, type: 'integrity', status: 'failed',
        startedAt: new Date(verificationStartedAt), completedAt: new Date(), durationMs: Date.now() - verificationStartedAt,
        error: error.message
      }).catch(() => {});
      this.invalidateCaches();
      await this.notifications.notify('backup.verification_failed', { backupId: String(record._id), fileName: record.fileName, error: error.message });
      return {
        success: false,
        code: stillPresent ? 'VERIFICATION_FAILED' : 'STORAGE_MISSING',
        error: error.message,
        verificationStatus: record.verificationStatus,
        verificationState: stillPresent ? 'verification_failed' : 'storage_missing',
        verificationLabel: stillPresent ? 'Verification Failed' : 'Storage Missing'
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */

  async deleteBackup(fileName, { force = false, confirmationToken = '' } = {}) {
    const record = await this.findBackupRecord(fileName);
    if (!record) return { success: false, error: 'Backup not found' };
    if (record.status === 'in_progress') return { success: false, error: 'Running backups cannot be deleted' };
    if (record.isProtected && !force) return { success: false, error: 'Protected backup requires elevated administrator confirmation', confirmationRequired: true, protectedConfirmationRequired: true };
    await this.removeBackupFiles(record);
    await Backup.deleteOne({ _id: record._id });
    this.invalidateCaches();
    return { success: true, fileName: record.fileName };
  }

  async setProtection(fileName, isProtected) {
    const record = await this.findBackupRecord(fileName);
    if (!record) return { success: false, error: 'Backup not found' };
    record.isProtected = Boolean(isProtected);
    await record.save();
    this.invalidateCaches();
    return { success: true, backup: record.toObject() };
  }

  async renameBackup(fileName, requestedName) {
    const base = path.basename(String(requestedName || ''))
      .replace(/\.json(?:\.gz(?:\.enc)?)?$/i, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!fileName || !base) return { success: false, error: 'Current and new backup names are required' };

    const record = await this.findBackupRecord(fileName);
    if (!record) return { success: false, error: 'Backup not found' };
    if (record.status === 'in_progress') return { success: false, error: 'Running backups cannot be renamed' };

    const resolved = this.resolveBackupFiles(record);
    if (!resolved.exists) return { success: false, code: 'STORAGE_MISSING', error: 'Current backup file not found in storage' };

    const newArchiveName = resolved.isEncrypted ? `${base}.json.gz.enc` : `${base}.json.gz`;
    const newJsonName = `${base}.json`;
    if (this.storage.exists(newArchiveName)) return { success: false, error: 'A backup with that name already exists' };
    if (resolved.jsonName && this.storage.exists(newJsonName)) return { success: false, error: 'A backup with that name already exists' };

    const previousArchiveName = resolved.archiveName;
    let jsonRenamed = false;
    let archiveRenamed = false;
    try {
      if (resolved.jsonName) {
        this.storage.rename(resolved.jsonName, newJsonName);
        jsonRenamed = true;
      }
      this.storage.rename(resolved.archiveName, newArchiveName);
      archiveRenamed = true;

      record.fileName = newArchiveName;
      record.originalFileName = newJsonName;
      record.filePath = this.storage.resolve(resolved.jsonName ? newJsonName : newArchiveName);
      record.compressedPath = this.storage.resolve(newArchiveName);
      await record.save();
      this.invalidateCaches();

      return { success: true, oldFileName: previousArchiveName, fileName: newArchiveName };
    } catch (error) {
      if (archiveRenamed) { try { this.storage.rename(newArchiveName, previousArchiveName); } catch (_) { /* best effort */ } }
      if (jsonRenamed) { try { this.storage.rename(newJsonName, resolved.jsonName); } catch (_) { /* best effort */ } }
      return { success: false, error: error.message };
    }
  }

  getCompatibility(record) {
    const warnings = [];
    if (record.appVersion && record.appVersion !== 'unknown' && record.appVersion !== APP_VERSION) warnings.push(`Application version differs: backup ${record.appVersion}, current ${APP_VERSION}`);
    if (record.schemaVersion && record.schemaVersion !== 'unknown' && record.schemaVersion !== SCHEMA_VERSION) warnings.push(`Schema version differs: backup ${record.schemaVersion}, current ${SCHEMA_VERSION}`);
    const impossible = record.backupFormatVersion && !['1.0'].includes(record.backupFormatVersion);
    if (impossible) warnings.push(`Unsupported backup format ${record.backupFormatVersion}`);
    return { compatible: !impossible, requiresConfirmation: warnings.length > 0 && !impossible, warnings, current: { appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, backupEngineVersion: ENGINE_VERSION, backupFormatVersion: FORMAT_VERSION }, backup: { appVersion: record.appVersion, schemaVersion: record.schemaVersion, backupEngineVersion: record.backupEngineVersion, backupFormatVersion: record.backupFormatVersion } };
  }

  /* ------------------------------------------------------------------ */
  /* Restore preview + restore                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Restore preview no longer reports whatever stale value happens to sit in
   * `verificationStatus`. If the archive exists but has not been verified,
   * verification is performed on demand, because a missing verification
   * report is not evidence that the backup is bad.
   *
   * Pass { verify: false } to get a cheap metadata-only preview.
   */
  async getRestorePreview(backupFileName, { verify = true } = {}) {
    let record = await this.findBackupRecord(backupFileName);
    if (!record) return { success: false, code: 'BACKUP_NOT_FOUND', error: 'Backup not found' };

    let resolved = this.resolveBackupFiles(record);
    let verificationResult = null;

    if (verify && resolved.exists && record.verificationStatus !== 'verified') {
      verificationResult = await this.verifyBackup(record.fileName);
      const reloaded = await this.findBackupRecord(record.fileName);
      if (reloaded) record = reloaded;
      resolved = this.resolveBackupFiles(record);
    }

    const state = this.describeVerificationState(record, resolved);

    return {
      success: true,
      backup: {
        fileName: record.fileName,
        physicalFileName: resolved.archiveName,
        storagePresent: resolved.exists,
        createdAt: record.createdAt,
        appVersion: record.appVersion,
        schemaVersion: record.schemaVersion,
        backupEngineVersion: record.backupEngineVersion,
        backupFormatVersion: record.backupFormatVersion,
        collections: record.collections || [],
        documentCount: record.documentCount,
        size: record.size,
        compressedSize: record.compressedSize,
        verificationStatus: record.verificationStatus,
        verificationState: state.state,
        verificationLabel: state.label,
        verificationDetail: state.detail,
        verificationError: record.verificationStatus === 'verified' ? null : (record.error || null),
        verifiedAt: record.verifiedAt || null,
        restorable: state.restorable,
        checksum: record.checksum,
        triggeredBy: record.triggeredBy,
        isProtected: record.isProtected,
        isEncrypted: resolved.isEncrypted,
        storageProvider: record.storageProvider
      },
      verification: verificationResult,
      compatibility: this.getCompatibility(record)
    };
  }

  async restoreBackup(backupFileName, options = {}) {
    try {
      return await this.withLock('restore', { backupFileName: path.basename(backupFileName) }, () => this.restoreBackupUnlocked(backupFileName, options));
    } catch (error) {
      return { success: false, error: error.message, code: error.code || 'RESTORE_FAILED' };
    }
  }

  async restoreBackupUnlocked(backupFileName, options = {}) {
    const startedAt = Date.now();
    const record = await this.findBackupRecord(backupFileName);
    if (!record) return { success: false, code: 'BACKUP_NOT_FOUND', error: 'Backup metadata not found' };
    const safeName = record.fileName;

    const compatibility = this.getCompatibility(record);
    if (!compatibility.compatible) return { success: false, error: 'Backup format is incompatible', compatibility };
    if (compatibility.requiresConfirmation && options.confirmCompatibility !== true) {
      return { success: false, code: 'COMPATIBILITY_CONFIRMATION_REQUIRED', error: 'Version compatibility confirmation required', compatibility, preview: (await this.getRestorePreview(safeName, { verify: false })).backup };
    }

    // Full preflight verification still runs on every restore. Nothing here
    // is relaxed: a corrupt or absent archive is rejected exactly as before.
    const preflight = await this.verifyBackup(safeName, { includeData: true });
    if (!preflight.success) {
      return { success: false, code: preflight.code || 'RESTORE_PREFLIGHT_FAILED', error: `Restore preflight failed: ${preflight.error}` };
    }

    const emergency = await this.createBackupUnlocked('emergency', 'restore-operation', { isProtected: true, skipLock: true });
    if (!emergency.success) return { success: false, error: `Emergency backup failed; restore aborted: ${emergency.error}` };

    const backupData = preflight._backupData;
    const validation = this.validateBackupData(backupData, record.collections);
    if (!validation.isValid) return { success: false, error: `Backup validation failed: ${validation.errors.join(', ')}`, emergencyBackup: emergency.fileName };

    const operationId = Date.now();
    const tempCollections = [];
    const swapCollections = [];
    try {
      const current = await mongoose.connection.db.listCollections().toArray();
      const currentNames = new Set(current.map(item => item.name));

      for (const [collectionName, documents] of Object.entries(backupData.collections)) {
        const temporary = `temp_restore_${operationId}_${collectionName}`;
        await mongoose.connection.db.createCollection(temporary);
        if (documents.length) await mongoose.connection.db.collection(temporary).insertMany(documents, { ordered: false });
        tempCollections.push({ original: collectionName, temporary, documentCount: documents.length });
      }

      const temporaryValidation = await this.validateTemporaryCollections(tempCollections);
      if (!temporaryValidation.isValid) throw new Error(temporaryValidation.errors.join(', '));

      for (const item of tempCollections) {
        if (currentNames.has(item.original)) {
          const swap = `swap_backup_${operationId}_${item.original}`;
          await mongoose.connection.db.collection(item.original).rename(swap);
          swapCollections.push({ original: item.original, swap });
        }
        await mongoose.connection.db.collection(item.temporary).rename(item.original);
      }

      const finalValidation = await this.validateFinalRestore(backupData, tempCollections);
      if (!finalValidation.isValid) throw new Error(finalValidation.errors.join(', '));
      for (const item of swapCollections) await mongoose.connection.db.collection(item.swap).drop();

      this.lastRestore = { fileName: safeName, completedAt: new Date(), success: true, durationMs: Date.now() - startedAt };
      await this.notifications.notify('restore.completed', { backupId: String(record._id), fileName: safeName, durationMs: Date.now() - startedAt });
      return {
        success: true,
        restoredCollections: tempCollections.map(item => item.original),
        totalDocuments: this.getTotalDocumentCount(backupData),
        preRestoreBackup: emergency.fileName,
        emergencyBackup: emergency.fileName,
        durationMs: Date.now() - startedAt,
        validationResults: { backup: validation, temporary: temporaryValidation, final: finalValidation }
      };
    } catch (error) {
      for (const item of tempCollections) {
        try { await mongoose.connection.db.collection(item.temporary).drop(); } catch (_) { /* renamed or absent */ }
      }
      for (const item of swapCollections.reverse()) {
        try {
          const names = new Set((await mongoose.connection.db.listCollections().toArray()).map(entry => entry.name));
          if (names.has(item.original)) await mongoose.connection.db.collection(item.original).drop();
          if (names.has(item.swap)) await mongoose.connection.db.collection(item.swap).rename(item.original);
        } catch (rollbackError) { console.error('Restore rollback step failed:', rollbackError); }
      }
      this.lastRestore = { fileName: safeName, completedAt: new Date(), success: false, durationMs: Date.now() - startedAt, error: error.message };
      await this.notifications.notify('restore.failed', { backupId: String(record._id), fileName: safeName, durationMs: Date.now() - startedAt, error: error.message });
      return { success: false, error: error.message, emergencyBackup: emergency.fileName, rollbackAttempted: true, durationMs: Date.now() - startedAt };
    }
  }

  getTotalDocumentCount(backupData) {
    return Object.values(backupData.collections || {}).reduce((sum, documents) => sum + (Array.isArray(documents) ? documents.length : 0), 0);
  }

  async validateTemporaryCollections(tempCollections) {
    const errors = [];
    let totalDocuments = 0;
    for (const item of tempCollections) {
      try {
        const count = await mongoose.connection.db.collection(item.temporary).countDocuments();
        totalDocuments += count;
        if (count !== item.documentCount) errors.push(`Document count mismatch in ${item.original}: expected ${item.documentCount}, found ${count}`);
      } catch (error) { errors.push(`Failed to validate ${item.original}: ${error.message}`); }
    }
    return { isValid: errors.length === 0, errors, summary: `Validated ${tempCollections.length} collections and ${totalDocuments} documents` };
  }

  async validateFinalRestore(backupData, tempCollections) {
    const errors = [];
    for (const item of tempCollections) {
      try {
        const count = await mongoose.connection.db.collection(item.original).countDocuments();
        const expected = backupData.collections[item.original].length;
        if (count !== expected) errors.push(`Final count mismatch in ${item.original}: expected ${expected}, found ${count}`);
      } catch (error) { errors.push(`Failed to validate restored ${item.original}: ${error.message}`); }
    }
    return { isValid: errors.length === 0, errors, summary: `Validated ${tempCollections.length} restored collections` };
  }

  async compareBackups(firstFileName, secondFileName) {
    const first = await this.findBackupRecord(firstFileName, { lean: true });
    const second = await this.findBackupRecord(secondFileName, { lean: true });
    if (!first || !second) return { success: false, error: 'Both backups must exist' };
    const firstCounts = new Map((first.collections || []).map(item => [item.name, item.count]));
    const secondCounts = new Map((second.collections || []).map(item => [item.name, item.count]));
    const collectionNames = Array.from(new Set([...firstCounts.keys(), ...secondCounts.keys()])).sort();
    return {
      success: true,
      first: { fileName: first.fileName, createdAt: first.createdAt, documentCount: first.documentCount, size: first.size, compressedSize: first.compressedSize, durationMs: first.durationMs, appVersion: first.appVersion, schemaVersion: first.schemaVersion },
      second: { fileName: second.fileName, createdAt: second.createdAt, documentCount: second.documentCount, size: second.size, compressedSize: second.compressedSize, durationMs: second.durationMs, appVersion: second.appVersion, schemaVersion: second.schemaVersion },
      differences: collectionNames.map(name => ({ collection: name, firstCount: firstCounts.get(name) || 0, secondCount: secondCounts.get(name) || 0, difference: (secondCounts.get(name) || 0) - (firstCounts.get(name) || 0) })),
      totals: { documentDifference: (second.documentCount || 0) - (first.documentCount || 0), sizeDifference: (second.compressedSize || second.size || 0) - (first.compressedSize || first.size || 0), durationDifferenceMs: (second.durationMs || 0) - (first.durationMs || 0) }
    };
  }

  async runScheduledRestoreVerification() {
    try {
      return await this.withLock('scheduled_restore_verification', {}, async () => {
        const startedAt = Date.now();
        const record = await Backup.findOne({ status: 'completed', verificationStatus: 'verified' }).sort({ createdAt: -1 });
        if (!record) return { success: false, error: 'No verified backup is available for restore testing' };
        const verified = await this.verifyBackup(record.fileName, { includeData: true });
        if (!verified.success) throw new Error(verified.error);
        const temporaryDatabaseName = `bv_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const temporaryDatabase = mongoose.connection.client.db(temporaryDatabaseName);
        try {
          for (const [name, documents] of Object.entries(verified._backupData.collections)) {
            await temporaryDatabase.createCollection(name);
            if (documents.length) await temporaryDatabase.collection(name).insertMany(documents, { ordered: false });
          }
          const counts = {};
          const errors = [];
          for (const [name, documents] of Object.entries(verified._backupData.collections)) {
            const count = await temporaryDatabase.collection(name).countDocuments();
            counts[name] = count;
            if (count !== documents.length) errors.push(`${name}: expected ${documents.length}, found ${count}`);
          }
          const durationMs = Date.now() - startedAt;
          const report = await BackupVerificationReport.create({
            backupId: record._id, fileName: record.fileName, type: 'scheduled_restore', status: errors.length ? 'failed' : 'passed',
            startedAt: new Date(startedAt), completedAt: new Date(), durationMs,
            validationResults: { errors, temporaryDatabaseDropped: true }, collectionCounts: counts,
            error: errors.length ? errors.join('; ') : null
          });
          if (errors.length) await this.notifications.notify('backup.scheduled_verification_failed', { backupId: String(record._id), fileName: record.fileName, errors });
          return { success: errors.length === 0, report: report.toObject() };
        } finally {
          await temporaryDatabase.dropDatabase();
        }
      });
    } catch (error) {
      await this.notifications.notify('backup.scheduled_verification_failed', { error: error.message });
      return { success: false, code: error.code || 'RESTORE_TEST_FAILED', error: error.message };
    }
  }

  async getAnalytics({ from, to } = {}) {
    const query = {};
    if (from || to) query.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const records = await Backup.find(query).sort({ createdAt: 1 }).lean();
    const completed = records.filter(item => item.status === 'completed');
    const failed = records.filter(item => item.status === 'failed');
    const verified = records.filter(item => item.verificationStatus === 'verified');
    const sizes = completed.map(item => item.compressedSize || item.size || 0);
    const durations = completed.map(item => item.durationMs).filter(Number.isFinite);
    const restoreReports = await BackupVerificationReport.countDocuments({ type: 'scheduled_restore', ...(query.createdAt ? { createdAt: query.createdAt } : {}) });
    return {
      total: records.length,
      successful: completed.length,
      failed: failed.length,
      successRate: records.length ? Number((completed.length / records.length * 100).toFixed(1)) : 0,
      failureRate: records.length ? Number((failed.length / records.length * 100).toFixed(1)) : 0,
      verificationSuccessRate: records.length ? Number((verified.length / records.length * 100).toFixed(1)) : 0,
      averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
      largestBackup: sizes.length ? Math.max(...sizes) : 0,
      smallestBackup: sizes.length ? Math.min(...sizes) : 0,
      restoreFrequency: restoreReports,
      growth: completed.map(item => ({ timestamp: item.createdAt, size: item.compressedSize || item.size || 0, durationMs: item.durationMs || 0 }))
    };
  }

  calculateHealth({ latestBackup, failedCount, verificationRate, storage }) {
    const ageHours = latestBackup ? (Date.now() - new Date(latestBackup.completedAt || latestBackup.createdAt).getTime()) / 3600000 : Infinity;
    let score = 100;
    if (ageHours > 24) score -= Math.min(45, Math.round((ageHours - 24) / 2));
    if (!latestBackup || latestBackup.verificationStatus !== 'verified') score -= 35;
    score -= Math.min(25, failedCount * 5);
    if (verificationRate < 95) score -= Math.min(20, Math.round((95 - verificationRate) / 2));
    if (storage.usedPercentage >= 95) score -= 35;
    else if (storage.usedPercentage >= 85) score -= 20;
    else if (storage.usedPercentage >= 70) score -= 10;
    score = Math.max(0, score);
    const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Healthy' : score >= 50 ? 'Warning' : 'Critical';
    return { score, label, ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null };
  }

  async getBackupStats() {
    if (this.statsCache && Date.now() - this.statsCache.createdAt < this.statsCacheTtlMs) {
      return { ...this.statsCache.value, activeOperation: this.getOperationStatus(), lastRestore: this.lastRestore };
    }
    if (this.statsPromise) return this.statsPromise;
    this.statsPromise = this.computeBackupStats();
    try { return await this.statsPromise; }
    finally { this.statsPromise = null; }
  }

  async computeBackupStats() {
    try {
      const records = await Backup.find().sort({ createdAt: -1 }).lean();
      const completed = records.filter(item => item.status === 'completed' && item.verificationStatus === 'verified');
      // 'pending' is Verification Required, not a failure. Only genuine
      // failures and genuinely absent files count against reliability.
      const failed = records.filter(item => item.status === 'failed' || ['failed', 'missing'].includes(item.verificationStatus));
      const unverified = records.filter(item => item.status === 'completed' && item.verificationStatus === 'pending');
      const latestBackup = completed[0] || null;
      const scheduledMs = 6 * 60 * 60 * 1000;
      const automatic = completed.find(item => AUTOMATIC_TYPES.has(item.backupType));
      const verificationReports = await BackupVerificationReport.find().sort({ createdAt: -1 }).limit(100).lean();
      const passedReports = verificationReports.filter(item => item.status === 'passed');
      const lastRestoreVerification = verificationReports.find(item => item.type === 'scheduled_restore' && item.status === 'passed') || null;
      const durations = completed.map(item => item.durationMs).filter(Number.isFinite);
      const storage = this.storage.getCapacity();
      const verificationRate = verificationReports.length ? Number((passedReports.length / verificationReports.length * 100).toFixed(1)) : 0;
      const health = this.calculateHealth({ latestBackup, failedCount: failed.length, verificationRate, storage });
      const storageAlertLevel = storage.usedPercentage >= 95 ? 'full' : storage.usedPercentage >= 85 ? 'critical' : storage.usedPercentage >= 70 ? 'warning' : null;
      if (storageAlertLevel && storageAlertLevel !== this.lastStorageAlertLevel) {
        await this.notifications.notify(storageAlertLevel === 'full' ? 'storage.full' : 'storage.warning', { usedPercentage: storage.usedPercentage, used: storage.used, total: storage.total });
      }
      this.lastStorageAlertLevel = storageAlertLevel;
      const rpoHours = Number.parseFloat(process.env.BACKUP_RPO_HOURS || '6');
      const rtoMinutes = Number.parseFloat(process.env.BACKUP_RTO_MINUTES || '60');
      const storageRedundancy = process.env.BACKUP_STORAGE_REDUNDANCY || (this.storage.provider === 'local' ? 'single-copy' : 'provider-managed');

      const readinessCategories = [];

      let rpoScore = 0;
      if (latestBackup && health.ageHours != null) {
        if (health.ageHours <= rpoHours) rpoScore = 25;
        else if (health.ageHours <= rpoHours * 2) rpoScore = 15;
        else if (health.ageHours <= 24) rpoScore = 8;
        else rpoScore = 3;
      }
      readinessCategories.push({
        id: 'rpo', label: 'Recovery Point Objective', score: rpoScore, maxScore: 25,
        status: rpoScore === 25 ? 'pass' : rpoScore >= 8 ? 'warning' : 'critical',
        detail: latestBackup
          ? `Latest backup is ${health.ageHours}h old (RPO: ${rpoHours}h)`
          : 'No verified backup exists'
      });

      let integrityScore = 0;
      if (latestBackup?.verificationStatus === 'verified') integrityScore += 10;
      integrityScore += Math.round((verificationRate / 100) * 10);
      integrityScore = Math.min(20, integrityScore);
      readinessCategories.push({
        id: 'integrity', label: 'Backup Integrity', score: integrityScore, maxScore: 20,
        status: integrityScore >= 18 ? 'pass' : integrityScore >= 10 ? 'warning' : 'critical',
        detail: `${verificationRate}% verification rate, latest: ${latestBackup?.verificationStatus || 'none'}`
          + (unverified.length ? `, ${unverified.length} awaiting verification` : '')
      });

      let rtoScore = 0;
      if (lastRestoreVerification) {
        const restoreAgeDays = (Date.now() - new Date(lastRestoreVerification.completedAt || lastRestoreVerification.createdAt).getTime()) / 86400000;
        if (restoreAgeDays <= 7) rtoScore = 20;
        else if (restoreAgeDays <= 30) rtoScore = 15;
        else if (restoreAgeDays <= 90) rtoScore = 8;
        else rtoScore = 3;
      }
      readinessCategories.push({
        id: 'rto', label: 'Restore Testing (RTO)', score: rtoScore, maxScore: 20,
        status: rtoScore >= 15 ? 'pass' : rtoScore >= 8 ? 'warning' : 'critical',
        detail: lastRestoreVerification
          ? `Last restore test: ${Math.round((Date.now() - new Date(lastRestoreVerification.completedAt || lastRestoreVerification.createdAt).getTime()) / 86400000)}d ago (RTO: ${rtoMinutes}min)`
          : 'Restore has never been tested'
      });

      const redundancyScore = storageRedundancy !== 'single-copy' ? 15 : 0;
      readinessCategories.push({
        id: 'redundancy', label: 'Storage Redundancy', score: redundancyScore, maxScore: 15,
        status: redundancyScore === 15 ? 'pass' : 'warning',
        detail: storageRedundancy === 'single-copy'
          ? 'Only one storage copy (local). A host failure could destroy all backups.'
          : `Redundancy: ${storageRedundancy}`
      });

      let storageScore = 10;
      if (storage.usedPercentage != null) {
        if (storage.usedPercentage >= 95) storageScore = 0;
        else if (storage.usedPercentage >= 85) storageScore = 3;
        else if (storage.usedPercentage >= 70) storageScore = 6;
      }
      readinessCategories.push({
        id: 'storage', label: 'Storage Capacity', score: storageScore, maxScore: 10,
        status: storageScore >= 6 ? 'pass' : storageScore >= 3 ? 'warning' : 'critical',
        detail: storage.usedPercentage != null
          ? `${storage.usedPercentage}% used (${formatBytesLocal(storage.used || 0)} / ${formatBytesLocal(storage.total || 0)})`
          : 'Capacity monitoring unavailable'
      });

      const encryptionScore = this.encryption.enabled ? 5 : 0;
      readinessCategories.push({
        id: 'encryption', label: 'Encryption', score: encryptionScore, maxScore: 5,
        status: encryptionScore === 5 ? 'pass' : 'info',
        detail: this.encryption.enabled ? 'AES-256-GCM encryption enabled' : 'Backups are stored without application-level encryption'
      });

      const failureRatio = records.length ? failed.length / records.length : 0;
      const failureScore = failed.length === 0 ? 5 : Math.max(0, Math.round(5 * (1 - failureRatio * 2)));
      readinessCategories.push({
        id: 'failures', label: 'Backup Reliability', score: failureScore, maxScore: 5,
        status: failureScore === 5 ? 'pass' : failureScore >= 3 ? 'warning' : 'critical',
        detail: failed.length === 0
          ? 'No failed backups'
          : `${failed.length} failed out of ${records.length} total (${Math.round(failureRatio * 100)}% failure rate)`
      });

      const readinessScore = readinessCategories.reduce((sum, cat) => sum + cat.score, 0);
      const readinessLabel = readinessScore >= 90 ? 'Excellent' : readinessScore >= 75 ? 'Healthy' : readinessScore >= 50 ? 'Warning' : 'Critical';
      const stats = {
        totalBackups: records.length,
        successfulBackups: completed.length,
        failedBackups: failed.length,
        unverifiedBackups: unverified.length,
        latestBackup: latestBackup ? {
          fileName: latestBackup.fileName,
          createdAt: latestBackup.createdAt,
          size: latestBackup.size,
          checksum: latestBackup.checksum,
          verificationStatus: latestBackup.verificationStatus,
          durationMs: latestBackup.durationMs,
          isEncrypted: latestBackup.isEncrypted,
          appVersion: latestBackup.appVersion,
          schemaVersion: latestBackup.schemaVersion
        } : null,
        lastSuccessfulBackup: latestBackup?.completedAt || latestBackup?.createdAt || null,
        lastVerifiedBackup: latestBackup?.verifiedAt || null,
        nextScheduledBackup: automatic ? new Date(new Date(automatic.createdAt).getTime() + scheduledMs) : null,
        totalSize: completed.reduce((sum, item) => sum + (item.size || 0) + (item.compressedSize || 0), 0),
        storageProvider: this.storage.provider,
        retentionLimit: this.retentionLimit,
        retentionPolicy: this.retentionPolicy,
        activeOperation: this.getOperationStatus(),
        lastRestore: this.lastRestore,
        successRate: records.length ? Number(((completed.length / records.length) * 100).toFixed(1)) : 0,
        verificationSuccessRate: verificationRate,
        averageBackupDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
        storage: { ...storage, provider: this.storage.provider, warningLevel: storageAlertLevel },
        health,
        disasterRecovery: {
          score: readinessScore,
          label: readinessLabel,
          rpoHours,
          rtoMinutes,
          lastVerifiedRestore: lastRestoreVerification?.completedAt || null,
          backupAgeHours: health.ageHours,
          verificationStatus: latestBackup?.verificationStatus || 'missing',
          storageProvider: this.storage.provider,
          storageRedundancy,
          encryptionEnabled: this.encryption.enabled,
          categories: readinessCategories
        },
        backupEnabled: true
      };
      this.statsCache = { createdAt: Date.now(), value: stats };
      return stats;
    } catch (error) {
      console.error('Error getting backup stats:', error);
      return { totalBackups: 0, successfulBackups: 0, failedBackups: 0, latestBackup: null, totalSize: 0, activeOperation: this.getOperationStatus(), backupEnabled: false, error: error.message };
    }
  }
}

BackupSystem.BackupBusyError = BackupBusyError;
BackupSystem.stripBackupExtensions = stripBackupExtensions;
BackupSystem.VERIFICATION_STATE = VERIFICATION_STATE;
module.exports = BackupSystem;
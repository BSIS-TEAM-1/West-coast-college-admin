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

const APP_VERSION = process.env.APP_VERSION || require('../package.json').version || 'unknown';
const SCHEMA_VERSION = process.env.DB_SCHEMA_VERSION || '1';
const ENGINE_VERSION = '2.1.0';
const FORMAT_VERSION = '1.0';

const AUTOMATIC_TYPES = new Set(['scheduled', 'initial']);
const SUPPORTED_TYPES = new Set(['manual', 'scheduled', 'initial', 'emergency', 'legacy']);

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

  normalizeType(value) {
    const type = String(value || 'manual').trim().toLowerCase();
    return SUPPORTED_TYPES.has(type) ? type : 'manual';
  }

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

  async verifyFiles(jsonName, archiveName, expected = {}) {
    const hasJson = Boolean(jsonName && this.storage.exists(jsonName));
    if (!hasJson && !expected.isEncrypted) throw new Error('Backup JSON file is missing');
    if (!this.storage.exists(archiveName)) throw new Error('Backup archive is missing');

    const checksum = await this.hashFile(archiveName);
    if (expected.checksum && expected.checksum !== checksum) throw new Error('Archive checksum mismatch');

    const storedArchive = this.storage.readFile(archiveName);
    const compressed = expected.isEncrypted ? this.encryption.decryptBuffer(storedArchive) : storedArchive;
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
    const fileName = `backup-${timestamp}.json`;
    const isEncrypted = this.encryption.enabled;
    const archiveName = `${fileName}.gz${isEncrypted ? '.enc' : ''}`;
    const token = crypto.randomUUID();
    const tempJsonName = `.pending-${token}.json`;
    const tempGzipName = `.pending-${token}.json.gz`;
    const tempArchiveName = `${tempGzipName}${isEncrypted ? '.enc' : ''}`;
    const isProtected = Boolean(options.isProtected || type === 'manual' || type === 'emergency');
    let record = null;
    let promotedJson = false;
    let promotedArchive = false;

    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new Error('Database is not connected');
      record = await Backup.create({
        fileName,
        originalFileName: fileName,
        filePath: this.storage.resolve(fileName),
        compressedPath: this.storage.resolve(archiveName),
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
      const verification = await this.verifyFiles(tempJsonName, tempArchiveName, { collections: collectionStats, isEncrypted });
      const verificationDurationMs = Date.now() - verificationStartedAt;

      if (isEncrypted) this.storage.remove(tempJsonName);
      else {
        this.storage.rename(tempJsonName, fileName);
        promotedJson = true;
      }
      this.storage.rename(tempArchiveName, archiveName);
      promotedArchive = true;

      const compressedSize = this.storage.stat(archiveName).size;
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
        backupId: record._id, fileName, type: 'integrity', status: 'passed', startedAt: new Date(verificationStartedAt),
        completedAt: new Date(), durationMs: verificationDurationMs, validationResults: verification.detailedValidation,
        collectionCounts: verification.validation.counts
      });

      await this.cleanupOldBackups();
      await this.notifications.notify('backup.completed', { backupId: String(record._id), fileName, backupType: type, durationMs, isEncrypted });
      return {
        success: true,
        fileName,
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
      // Final names belong only to this failed operation, so removing them never affects prior backups.
      if (promotedJson) { try { this.storage.remove(fileName); } catch (_) { /* best effort */ } }
      if (promotedArchive) { try { this.storage.remove(archiveName); } catch (_) { /* best effort */ } }
      if (record) {
        record.status = 'failed';
        record.verificationStatus = 'failed';
        record.error = error.message;
        record.completedAt = new Date();
        record.durationMs = Date.now() - startedAt;
        try { await record.save(); } catch (metadataError) { console.error('Failed to record backup failure:', metadataError); }
      }
      console.error('Backup failed:', error);
      await this.notifications.notify('backup.failed', { backupId: record?._id ? String(record._id) : null, fileName, backupType: type, error: error.message });
      return { success: false, error: error.message, code: error.code || 'BACKUP_FAILED' };
    }
  }

  // Kept for backward compatibility. It is intentionally non-destructive and uses the verified path.
  async createBackupFileOnly(backupType = 'manual', triggeredBy = 'system') {
    return this.createBackup(backupType, triggeredBy);
  }

  async removeBackupFiles(record) {
    const failures = [];
    for (const name of [record.fileName, path.basename(record.compressedPath || `${record.fileName}.gz`)]) {
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
    if (mongoose.connection.readyState !== 1) return { missing: 0, imported: 0 };
    const storedNames = this.storage.list().filter(name => !name.startsWith('.pending-'));
    const files = storedNames.filter(name => name.endsWith('.json'));
    const encryptedArchives = storedNames.filter(name => name.endsWith('.json.gz.enc'));
    const records = await Backup.find();
    let missing = 0;
    let imported = 0;

    for (const record of records) {
      const archiveName = path.basename(record.compressedPath || `${record.fileName}.gz${record.isEncrypted ? '.enc' : ''}`);
      const primaryExists = record.isEncrypted ? this.storage.exists(archiveName) : this.storage.exists(record.fileName) && this.storage.exists(archiveName);
      if (record.status === 'completed' && !primaryExists) {
        record.verificationStatus = 'missing';
        record.error = 'Backup file missing from configured storage';
        await record.save();
        missing += 1;
      }
    }

    const known = new Set(records.map(record => record.fileName));
    const orphanCandidates = [
      ...files.map(fileName => ({ fileName, archiveName: `${fileName}.gz`, isEncrypted: false })),
      ...encryptedArchives.map(archiveName => ({ fileName: archiveName.replace(/\.gz\.enc$/, ''), archiveName, isEncrypted: true }))
    ].filter(candidate => !known.has(candidate.fileName));
    for (const { fileName, archiveName, isEncrypted } of orphanCandidates) {
      if (known.has(fileName)) continue;
      const stat = this.storage.stat(isEncrypted ? archiveName : fileName);
      let verificationStatus = 'failed';
      let checksum = null;
      let jsonChecksum = null;
      let documentCount = 0;
      let collections = [];
      let verifiedJsonSize = 0;
      let error = 'Compressed archive missing';
      if (this.storage.exists(archiveName) && (!isEncrypted || this.encryption.enabled)) {
        try {
          const verified = await this.verifyFiles(isEncrypted ? null : fileName, archiveName, { isEncrypted });
          verificationStatus = 'verified';
          checksum = verified.checksum;
          jsonChecksum = verified.jsonChecksum;
          verifiedJsonSize = verified.jsonSize;
          collections = Object.entries(verified.validation.counts).map(([name, count]) => ({ name, count }));
          documentCount = collections.reduce((sum, item) => sum + item.count, 0);
          error = null;
        } catch (verifyError) { error = verifyError.message; }
      }
      await Backup.create({
        fileName,
        originalFileName: fileName,
        filePath: this.storage.resolve(fileName),
        compressedPath: this.storage.resolve(archiveName),
        size: isEncrypted && verificationStatus === 'verified' ? verifiedJsonSize : stat.size,
        compressedSize: this.storage.exists(archiveName) ? this.storage.stat(archiveName).size : 0,
        documentCount,
        collections,
        status: verificationStatus === 'verified' ? 'completed' : 'failed',
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
    }
    return { missing, imported };
  }

  async getBackupHistory() {
    await this.reconcileMetadata();
    if (mongoose.connection.readyState !== 1) return [];
    return Backup.find().sort({ createdAt: -1 }).limit(100).lean();
  }

  async verifyBackup(fileName, options = {}) {
    const safeName = path.basename(fileName);
    const record = await Backup.findOne({ fileName: safeName });
    if (!record) return { success: false, error: 'Backup metadata not found' };
    try {
      const verificationStartedAt = Date.now();
      const archiveName = path.basename(record.compressedPath || `${record.fileName}.gz${record.isEncrypted ? '.enc' : ''}`);
      const result = await this.verifyFiles(record.isEncrypted ? null : record.fileName, archiveName, {
        checksum: record.checksum,
        jsonChecksum: record.jsonChecksum,
        collections: record.collections,
        isEncrypted: record.isEncrypted
      });
      record.checksum = result.checksum;
      record.jsonChecksum = result.jsonChecksum;
      record.verificationStatus = 'verified';
      record.verifiedAt = new Date();
      record.validationResults = result.detailedValidation;
      record.performance = record.performance || {};
      record.performance.verificationDurationMs = Date.now() - verificationStartedAt;
      const archiveSize = this.storage.stat(archiveName).size;
      record.performance.storageReadBytesPerSecond = record.performance.verificationDurationMs
        ? Math.round(archiveSize / (record.performance.verificationDurationMs / 1000)) : null;
      record.error = null;
      await record.save();
      this.invalidateCaches();
      await BackupVerificationReport.create({
        backupId: record._id, fileName: record.fileName, type: 'integrity', status: 'passed',
        startedAt: new Date(verificationStartedAt), completedAt: new Date(), durationMs: Date.now() - verificationStartedAt,
        validationResults: result.detailedValidation, collectionCounts: result.validation.counts
      });
      return { success: true, fileName: record.fileName, checksum: result.checksum, verificationStatus: 'verified', validationResults: result.detailedValidation, ...(options.includeData ? { _backupData: result.backupData } : {}) };
    } catch (error) {
      const archiveName = path.basename(record.compressedPath || `${record.fileName}.gz${record.isEncrypted ? '.enc' : ''}`);
      record.verificationStatus = this.storage.exists(archiveName) ? 'failed' : 'missing';
      record.error = error.message;
      await record.save();
      await BackupVerificationReport.create({ backupId: record._id, fileName: record.fileName, type: 'integrity', status: 'failed', startedAt: new Date(), completedAt: new Date(), durationMs: 0, error: error.message });
      await this.notifications.notify('backup.verification_failed', { backupId: String(record._id), fileName: record.fileName, error: error.message });
      return { success: false, error: error.message, verificationStatus: record.verificationStatus };
    }
  }

  async deleteBackup(fileName, { force = false, confirmationToken = '' } = {}) {
    const record = await Backup.findOne({ fileName: path.basename(fileName) });
    if (!record) return { success: false, error: 'Backup not found' };
    if (record.status === 'in_progress') return { success: false, error: 'Running backups cannot be deleted' };
    if (record.isProtected && !force) return { success: false, error: 'Protected backup requires elevated administrator confirmation', confirmationRequired: true, protectedConfirmationRequired: true };
    await this.removeBackupFiles(record);
    await Backup.deleteOne({ _id: record._id });
    this.invalidateCaches();
    return { success: true, fileName: record.fileName };
  }

  async setProtection(fileName, isProtected) {
    const record = await Backup.findOneAndUpdate(
      { fileName: path.basename(fileName) },
      { $set: { isProtected: Boolean(isProtected) } },
      { new: true }
    ).lean();
    if (record) this.invalidateCaches();
    return record ? { success: true, backup: record } : { success: false, error: 'Backup not found' };
  }

  async renameBackup(fileName, requestedName) {
    const currentName = path.basename(String(fileName || ''));
    const base = path.basename(String(requestedName || '')).replace(/\.json(?:\.gz)?$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!currentName || !base) return { success: false, error: 'Current and new backup names are required' };
    const newName = `${base}.json`;
    if (this.storage.exists(newName) || this.storage.exists(`${newName}.gz`) || this.storage.exists(`${newName}.gz.enc`)) return { success: false, error: 'A backup with that name already exists' };
    const record = await Backup.findOne({ fileName: currentName });
    if (!record) return { success: false, error: 'Backup not found' };
    if (record.status === 'in_progress') return { success: false, error: 'Running backups cannot be renamed' };

    const oldArchive = path.basename(record.compressedPath || `${currentName}.gz${record.isEncrypted ? '.enc' : ''}`);
    const newArchive = `${newName}.gz${record.isEncrypted ? '.enc' : ''}`;
    let jsonRenamed = false;
    let archiveRenamed = false;
    try {
      if (!record.isEncrypted) {
        this.storage.rename(currentName, newName);
        jsonRenamed = true;
      }
      this.storage.rename(oldArchive, newArchive);
      archiveRenamed = true;
      record.fileName = newName;
      record.originalFileName = record.originalFileName || currentName;
      record.filePath = this.storage.resolve(newName);
      record.compressedPath = this.storage.resolve(newArchive);
      await record.save();
      this.invalidateCaches();
      return { success: true, oldFileName: currentName, fileName: newName };
    } catch (error) {
      if (archiveRenamed) { try { this.storage.rename(newArchive, oldArchive); } catch (_) { /* best effort */ } }
      if (jsonRenamed) { try { this.storage.rename(newName, currentName); } catch (_) { /* best effort */ } }
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

  async getRestorePreview(backupFileName) {
    const record = await Backup.findOne({ fileName: path.basename(backupFileName) }).lean();
    if (!record) return { success: false, error: 'Backup not found' };
    return {
      success: true,
      backup: {
        fileName: record.fileName, createdAt: record.createdAt, appVersion: record.appVersion, schemaVersion: record.schemaVersion,
        backupEngineVersion: record.backupEngineVersion, backupFormatVersion: record.backupFormatVersion,
        collections: record.collections || [], documentCount: record.documentCount, size: record.size,
        compressedSize: record.compressedSize, verificationStatus: record.verificationStatus, checksum: record.checksum,
        triggeredBy: record.triggeredBy, isProtected: record.isProtected, isEncrypted: record.isEncrypted, storageProvider: record.storageProvider
      },
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
    const safeName = path.basename(backupFileName);
    const record = await Backup.findOne({ fileName: safeName });
    if (!record) return { success: false, error: 'Backup metadata not found' };

    const compatibility = this.getCompatibility(record);
    if (!compatibility.compatible) return { success: false, error: 'Backup format is incompatible', compatibility };
    if (compatibility.requiresConfirmation && options.confirmCompatibility !== true) {
      return { success: false, code: 'COMPATIBILITY_CONFIRMATION_REQUIRED', error: 'Version compatibility confirmation required', compatibility, preview: (await this.getRestorePreview(safeName)).backup };
    }

    const preflight = await this.verifyBackup(safeName, { includeData: true });
    if (!preflight.success) return { success: false, error: `Restore preflight failed: ${preflight.error}` };

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
    const records = await Backup.find({ fileName: { $in: [path.basename(firstFileName), path.basename(secondFileName)] } }).lean();
    if (records.length !== 2) return { success: false, error: 'Both backups must exist' };
    const byName = new Map(records.map(item => [item.fileName, item]));
    const first = byName.get(path.basename(firstFileName));
    const second = byName.get(path.basename(secondFileName));
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
        const temporaryDatabaseName = `wcc_backup_verify_${crypto.randomUUID().replace(/-/g, '')}`;
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
      await this.reconcileMetadata();
      const records = await Backup.find().sort({ createdAt: -1 }).lean();
      const completed = records.filter(item => item.status === 'completed' && item.verificationStatus === 'verified');
      const failed = records.filter(item => item.status === 'failed' || ['failed', 'missing'].includes(item.verificationStatus));
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
      // Disaster recovery readiness is intentionally category-based so an
      // administrator can see the score improve as each recovery issue is fixed.
      const recentBackupReady = Boolean(latestBackup && health.ageHours != null && health.ageHours <= Number.parseFloat(process.env.BACKUP_RPO_HOURS || '6'));
      const integrityReady = Boolean(latestBackup?.verificationStatus === 'verified' && verificationRate >= 95);
      const redundancyReady = (process.env.BACKUP_STORAGE_REDUNDANCY || (this.storage.provider === 'local' ? 'single-copy' : 'provider-managed')) !== 'single-copy';
      const storageReady = storage.usedPercentage == null || storage.usedPercentage < 70;
      const readinessScore =
        (recentBackupReady ? 20 : 0) +
        (integrityReady ? 20 : 0) +
        (lastRestoreVerification ? 20 : 0) +
        (redundancyReady ? 15 : 0) +
        (storageReady ? 10 : 0) +
        (this.encryption.enabled ? 10 : 0) +
        (failed.length === 0 ? 5 : 0);
      const stats = {
        totalBackups: records.length,
        successfulBackups: completed.length,
        failedBackups: failed.length,
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
          label: readinessScore >= 90 ? 'Excellent' : readinessScore >= 75 ? 'Healthy' : readinessScore >= 50 ? 'Warning' : 'Critical',
          rpoHours: Number.parseFloat(process.env.BACKUP_RPO_HOURS || '6'),
          rtoMinutes: Number.parseFloat(process.env.BACKUP_RTO_MINUTES || '60'),
          lastVerifiedRestore: lastRestoreVerification?.completedAt || null,
          backupAgeHours: health.ageHours,
          verificationStatus: latestBackup?.verificationStatus || 'missing',
          storageProvider: this.storage.provider,
          storageRedundancy: process.env.BACKUP_STORAGE_REDUNDANCY || (this.storage.provider === 'local' ? 'single-copy' : 'provider-managed'),
          encryptionEnabled: this.encryption.enabled
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
module.exports = BackupSystem;

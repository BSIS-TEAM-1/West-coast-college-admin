/**
 * Backup verification worker thread.
 *
 * Runs the CPU- and RAM-heavy part of backup verification
 * (read archive -> sha256 -> decrypt -> gunzip -> JSON.parse -> validate)
 * off the API server's event loop so normal requests stay responsive while
 * a backup is being verified.
 *
 * No database access happens here: the worker only reads files from the
 * shared backup storage directory and returns small scalar results.
 * The full parsed backup (`backupData`) is deliberately NOT posted back —
 * structured-cloning megabytes across threads would defeat the purpose.
 * Callers that need the parsed document (restore preflight, compare) keep
 * using the in-thread `verifyFiles`.
 *
 * Runs in the same OS process (worker_threads), so there are no deployment
 * changes: no extra Render service, no new infrastructure. Threading only
 * helps because verification is CPU-bound; gzip/deflate itself already runs
 * on libuv's threadpool via streams.
 *
 * Protocol:
 *   workerData: { storageRoot, archiveName, jsonName|null, expected }
 *   -> postMessage({ ok: true, result: { checksum, jsonChecksum, jsonSize,
 *                     validation, detailedValidation } })
 *   -> postMessage({ ok: false, error, code? }) on any failure
 */
const { parentPort, workerData } = require('worker_threads');

if (!parentPort) {
  throw new Error('backupVerifyWorker must be run as a worker thread');
}

// Point this thread's storage at the same directory as the main thread.
// Must be set before BackupSystem is constructed (it reads the env then).
if (workerData && workerData.storageRoot) {
  process.env.BACKUP_STORAGE_PATH = String(workerData.storageRoot);
}
// Encryption material is passed explicitly (workerData) rather than relying
// solely on ambient environment: test runners and sandboxed hosts may not
// propagate parent env mutations to worker threads. Falls back to env.
if (workerData && workerData.encryption && workerData.encryption.enabled) {
  process.env.BACKUP_ENCRYPTION = 'true';
  if (workerData.encryption.keyB64) {
    process.env.BACKUP_ENCRYPTION_KEY = String(workerData.encryption.keyB64);
  }
}

let BackupSystem;
try {
  BackupSystem = require('./backup');
} catch (requireError) {
  parentPort.postMessage({ ok: false, error: `verify worker init failed: ${requireError.message}` });
  process.exitCode = 1;
  return;
}

(async () => {
  try {
    const system = new BackupSystem();
    const full = await system.verifyFiles(
      (workerData && workerData.jsonName) || null,
      workerData.archiveName,
      (workerData && workerData.expected) || {}
    );
    parentPort.postMessage({
      ok: true,
      result: {
        checksum: full.checksum,
        jsonChecksum: full.jsonChecksum,
        jsonSize: full.jsonSize,
        validation: full.validation,
        detailedValidation: full.detailedValidation
      }
    });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error.message || String(error), code: error.code || null });
  }
})();

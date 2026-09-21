/**
 * Non-blocking backup tests (Step 11).
 *
 * Covers the worker-thread verification path and the fire-and-forget
 * start/lock protocol without touching a database:
 *  - threaded verify result parity with in-thread verify (plain + encrypted)
 *  - threaded result carries no parsed backupData (no cross-thread cloning)
 *  - corrupt archives fail threaded verification with lock release
 *  - startBackupAsync accepts when idle, 409s when busy, releases after done
 *  - two simultaneous starts: exactly one is accepted
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshSystem() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-backup-nb-'));
  process.env.BACKUP_STORAGE_PATH = directory;
  delete require.cache[require.resolve('./backup')];
  delete require.cache[require.resolve('./backupVerifyWorker')];
  const BackupSystem = require('./backup');
  const system = new BackupSystem();
  return { system, directory };
}

function makeBackupJson(docCount, seed) {
  const docs = [];
  for (let i = 0; i < docCount; i++) {
    docs.push({
      _id: `00000000000000000000${String(i).padStart(6, '0')}`.slice(-24),
      v: `${seed}-${i}-x`.repeat(12)
    });
  }
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    version: '1.0',
    collections: { students: docs }
  });
}

async function writeAndCompress(system, directory, name, jsonText) {
  fs.writeFileSync(path.join(directory, `${name}.json`), jsonText);
  await system.compressBackup(`${name}.json`, `${name}.json.gz`);
  return `${name}.json.gz`;
}

describe('verifyFilesThreaded', () => {
  test('matches in-thread results and omits backupData', async () => {
    const { system } = freshSystem();
    const gz = await writeAndCompress(system, process.env.BACKUP_STORAGE_PATH, 'nb-plain', makeBackupJson(4000, 'p'));
    const expected = await system.verifyFiles('nb-plain.json', gz, {});
    const actual = await system.verifyFilesThreaded('nb-plain.json', gz, {});
    expect(actual.checksum).toBe(expected.checksum);
    expect(actual.jsonChecksum).toBe(expected.jsonChecksum);
    expect(actual.validation.isValid).toBe(true);
    expect(actual).not.toHaveProperty('backupData');
    expect(actual.jsonSize).toBe(expected.jsonSize);
  }, 120000);

  test('matches in-thread results for encrypted archives', async () => {
    const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.BACKUP_ENCRYPTION = 'true';
    process.env.BACKUP_ENCRYPTION_KEY = key;
    try {
      const { system } = freshSystem();
      const gz = await writeAndCompress(system, process.env.BACKUP_STORAGE_PATH, 'nb-enc', makeBackupJson(2000, 'e'));
      await system.encryption.encryptFile(
        system.storage.resolve(gz),
        system.storage.resolve('nb-enc.json.gz.enc')
      );
      const expected = await system.verifyFiles(null, 'nb-enc.json.gz.enc', { isEncrypted: true });
      const actual = await system.verifyFilesThreaded(null, 'nb-enc.json.gz.enc', { isEncrypted: true });
      expect(actual.checksum).toBe(expected.checksum);
      expect(actual.jsonChecksum).toBe(expected.jsonChecksum);
      expect(actual.validation.isValid).toBe(true);
    } finally {
      delete process.env.BACKUP_ENCRYPTION;
      delete process.env.BACKUP_ENCRYPTION_KEY;
    }
  }, 120000);

  test('corrupt archive rejects and releases the lock', async () => {
    const { system } = freshSystem();
    const dir = process.env.BACKUP_STORAGE_PATH;
    fs.writeFileSync(path.join(dir, 'nb-bad.json.gz'), 'definitely-not-gzip-data');
    await expect(system.verifyFilesThreaded('nb-bad.json', 'nb-bad.json.gz', {}))
      .rejects.toThrow();
    expect(system.getOperationStatus()).toBeNull();
  }, 120000);
});

describe('startBackupAsync lock protocol', () => {
  test('accepts when idle and releases after completion', async () => {
    const { system } = freshSystem();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    // Mirror production: the real createBackup acquires the withLock guard
    // synchronously before its first await; the stub does the same so the
    // lock protocol itself is what is under test (no database involved).
    system.createBackup = jest.fn((type, actor) =>
      system.withLock('backup', { backupType: type, triggeredBy: actor }, () => gate.then(() => ({ success: true, fileName: 'f' })))
    );
    const settled = [];
    const first = system.startBackupAsync('manual', 'tester', (err, result) => settled.push({ err, result }));
    expect(first.accepted).toBe(true);
    expect(first.operation).toMatchObject({ type: 'backup' });
    release();
    await gate.catch(() => {});
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toHaveLength(1);
    expect(settled[0].err).toBeNull();
    expect(system.getOperationStatus()).toBeNull();
    const second = system.startBackupAsync('manual', 'tester', () => {});
    expect(second.accepted).toBe(true);
  });

  test('two simultaneous starts: exactly one accepted with BACKUP_BUSY', async () => {
    const { system } = freshSystem();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    system.createBackup = jest.fn((type, actor) =>
      system.withLock('backup', { backupType: type, triggeredBy: actor }, () => gate)
    );
    const busySettled = [];
    const first = system.startBackupAsync('manual', 'a', () => {});
    const second = system.startBackupAsync('manual', 'b', (err) => busySettled.push(err));
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.code).toBe('BACKUP_BUSY');
    release('done');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(busySettled).toHaveLength(1);
    expect(busySettled[0] && busySettled[0].code).toBe('BACKUP_BUSY');
    expect(system.getOperationStatus()).toBeNull();
  });

  test('withLock releases after work throws (no permanent lock)', async () => {
    const { system } = freshSystem();
    await expect(system.withLock('backup', {}, async () => {
      throw new Error('midway boom');
    })).rejects.toThrow('midway boom');
    expect(system.getOperationStatus()).toBeNull();
  });
});

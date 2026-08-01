const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function createSystem() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-backup-test-'));
  process.env.BACKUP_STORAGE_PROVIDER = 'local';
  process.env.BACKUP_STORAGE_PATH = directory;
  delete require.cache[require.resolve('./backup')];
  const BackupSystem = require('./backup');
  return { directory, system: new BackupSystem() };
}

function cleanup(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.BACKUP_STORAGE_PATH;
}

test('validates and verifies matching JSON and gzip files', async () => {
  const { directory, system } = createSystem();
  try {
    const data = { timestamp: new Date().toISOString(), version: '1.0', collections: { admins: [{ _id: '1' }] } };
    fs.writeFileSync(path.join(directory, 'sample.json'), JSON.stringify(data));
    await system.compressBackup('sample.json', 'sample.json.gz');
    const result = await system.verifyFiles('sample.json', 'sample.json.gz', { collections: [{ name: 'admins', count: 1 }] });
    assert.match(result.checksum, /^[a-f0-9]{64}$/);
    assert.match(result.jsonChecksum, /^[a-f0-9]{64}$/);
    assert.equal(result.validation.isValid, true);
  } finally { cleanup(directory); }
});

test('rejects an archive that does not match the JSON backup', async () => {
  const { directory, system } = createSystem();
  try {
    const original = { timestamp: new Date().toISOString(), version: '1.0', collections: { admins: [] } };
    fs.writeFileSync(path.join(directory, 'sample.json'), JSON.stringify(original));
    await system.compressBackup('sample.json', 'sample.json.gz');
    fs.writeFileSync(path.join(directory, 'sample.json'), JSON.stringify({ ...original, collections: { admins: [{ changed: true }] } }));
    await assert.rejects(system.verifyFiles('sample.json', 'sample.json.gz'), /does not match/);
  } finally { cleanup(directory); }
});

test('allows only one global operation at a time', async () => {
  const { directory, system } = createSystem();
  try {
    let release;
    const first = system.withLock('backup', {}, () => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(system.withLock('restore', {}, async () => null), error => error.code === 'BACKUP_BUSY' && error.statusCode === 409);
    release('done');
    assert.equal(await first, 'done');
    assert.equal(system.getOperationStatus(), null);
  } finally { cleanup(directory); }
});

test('rejects malformed backup structures', () => {
  const { directory, system } = createSystem();
  try {
    const result = system.validateBackupData({ timestamp: 'invalid', collections: [] });
    assert.equal(result.isValid, false);
    assert.ok(result.errors.length > 0);
  } finally { cleanup(directory); }
});

test('AES-256-GCM provider encrypts and decrypts an archive without storing the key', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-encryption-test-'));
  try {
    const { Aes256GcmEncryptionProvider } = require('./services/backupEncryption');
    const provider = new Aes256GcmEncryptionProvider(Buffer.alloc(32, 7));
    const input = path.join(directory, 'input.gz');
    const output = path.join(directory, 'output.gz.enc');
    const content = Buffer.from('verified encrypted backup content');
    fs.writeFileSync(input, content);
    await provider.encryptFile(input, output);
    const encrypted = fs.readFileSync(output);
    assert.notDeepEqual(encrypted, content);
    assert.deepEqual(provider.decryptBuffer(encrypted), content);
    assert.equal(encrypted.includes(Buffer.alloc(32, 7)), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('AES-256-GCM rejects ciphertext when the wrong key is used', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-encryption-test-'));
  try {
    const { Aes256GcmEncryptionProvider } = require('./services/backupEncryption');
    const first = new Aes256GcmEncryptionProvider(Buffer.alloc(32, 1));
    const second = new Aes256GcmEncryptionProvider(Buffer.alloc(32, 2));
    const input = path.join(directory, 'input.gz');
    const output = path.join(directory, 'output.gz.enc');
    fs.writeFileSync(input, 'secret');
    await first.encryptFile(input, output);
    assert.throws(() => second.decryptBuffer(fs.readFileSync(output)));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('local storage adapter confines filenames to its configured root', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-storage-test-'));
  try {
    const { LocalBackupStorage } = require('./services/backupStorage');
    const storage = new LocalBackupStorage(directory);
    assert.equal(storage.resolve('../../outside.json'), path.join(directory, 'outside.json'));
    const capacity = storage.getCapacity();
    assert.ok(capacity.total == null || capacity.total > 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('notification service dispatches events through provider interfaces', async () => {
  const received = [];
  const { BackupNotificationService } = require('./services/backupNotifications');
  const service = new BackupNotificationService([{ name: 'test', send: async event => received.push(event) }]);
  const event = await service.notify('backup.completed', { backupId: '123' });
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'backup.completed');
  assert.equal(event.backupId, '123');
});

test('advanced retention preserves newest hourly restore points and selects only expired entries', () => {
  const { directory, system } = createSystem();
  try {
    system.retentionPolicy = { hourly: 2, daily: 0, weekly: 0, monthly: 0 };
    const now = Date.now();
    const candidates = [0, 1, 2, 3].map(index => ({ _id: String(index), createdAt: new Date(now - (index * 60 + 5) * 60 * 1000) }));
    const removed = system.selectRetentionRecords(candidates, now);
    assert.deepEqual(removed.map(item => item._id), ['2', '3']);
    assert.equal(removed.some(item => item._id === '0'), false);
  } finally { cleanup(directory); }
});

test('version compatibility requires confirmation for app/schema differences and blocks unknown formats', () => {
  const { directory, system } = createSystem();
  try {
    const warning = system.getCompatibility({ appVersion: 'older', schemaVersion: 'older', backupFormatVersion: '1.0' });
    assert.equal(warning.compatible, true);
    assert.equal(warning.requiresConfirmation, true);
    assert.ok(warning.warnings.length >= 2);
    const blocked = system.getCompatibility({ appVersion: 'older', schemaVersion: 'older', backupFormatVersion: '99.0' });
    assert.equal(blocked.compatible, false);
  } finally { cleanup(directory); }
});

test('encrypted archives verify without retaining a plaintext JSON file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-encrypted-verify-'));
  process.env.BACKUP_STORAGE_PROVIDER = 'local';
  process.env.BACKUP_STORAGE_PATH = directory;
  process.env.BACKUP_ENCRYPTION = 'true';
  process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  delete require.cache[require.resolve('./backup')];
  const BackupSystem = require('./backup');
  const system = new BackupSystem();
  try {
    const data = { timestamp: new Date().toISOString(), version: '1.0', collections: { admins: [] } };
    fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify(data));
    await system.compressBackup('source.json', 'source.json.gz');
    await system.encryption.encryptFile(path.join(directory, 'source.json.gz'), path.join(directory, 'source.json.gz.enc'));
    fs.unlinkSync(path.join(directory, 'source.json'));
    fs.unlinkSync(path.join(directory, 'source.json.gz'));
    const result = await system.verifyFiles(null, 'source.json.gz.enc', { isEncrypted: true });
    assert.equal(result.validation.isValid, true);
    assert.equal(result.backupData.version, '1.0');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    delete process.env.BACKUP_STORAGE_PATH; delete process.env.BACKUP_ENCRYPTION; delete process.env.BACKUP_ENCRYPTION_KEY;
  }
});

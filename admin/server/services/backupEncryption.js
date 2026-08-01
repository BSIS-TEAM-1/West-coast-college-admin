const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('WCCBKUP1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH + TAG_LENGTH;

class NoEncryptionProvider {
  constructor() { this.name = 'none'; this.enabled = false; }
}

class Aes256GcmEncryptionProvider {
  constructor(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    this.name = 'aes-256-gcm';
    this.enabled = true;
    this.key = key;
  }

  async encryptFile(inputPath, outputPath) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipherPath = `${outputPath}.cipher-${crypto.randomUUID()}`;
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    try {
      await pipeline(fs.createReadStream(inputPath), cipher, fs.createWriteStream(cipherPath, { flags: 'wx' }));
      const tag = cipher.getAuthTag();
      const output = fs.createWriteStream(outputPath, { flags: 'wx' });
      output.write(Buffer.concat([MAGIC, iv, tag]));
      await pipeline(fs.createReadStream(cipherPath), output);
      return { provider: this.name };
    } finally {
      if (fs.existsSync(cipherPath)) fs.unlinkSync(cipherPath);
    }
  }

  decryptBuffer(encrypted) {
    if (encrypted.length <= HEADER_LENGTH || !encrypted.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Encrypted backup header is invalid');
    const iv = encrypted.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
    const tag = encrypted.subarray(MAGIC.length + IV_LENGTH, HEADER_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted.subarray(HEADER_LENGTH)), decipher.final()]);
  }
}

function decodeKey(value) {
  const text = String(value || '').trim();
  if (/^[a-f0-9]{64}$/i.test(text)) return Buffer.from(text, 'hex');
  return Buffer.from(text, 'base64');
}

function createBackupEncryptionProvider() {
  const enabled = String(process.env.BACKUP_ENCRYPTION || 'false').toLowerCase() === 'true';
  if (!enabled) return new NoEncryptionProvider();
  if (!process.env.BACKUP_ENCRYPTION_KEY) throw new Error('BACKUP_ENCRYPTION is enabled but BACKUP_ENCRYPTION_KEY is missing');
  return new Aes256GcmEncryptionProvider(decodeKey(process.env.BACKUP_ENCRYPTION_KEY));
}

module.exports = { Aes256GcmEncryptionProvider, NoEncryptionProvider, createBackupEncryptionProvider };

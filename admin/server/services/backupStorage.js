const fs = require('fs');
const path = require('path');

class LocalBackupStorage {
  constructor(rootDir) {
    this.provider = process.env.BACKUP_STORAGE_PROVIDER || 'local';
    this.rootDir = path.resolve(process.env.BACKUP_STORAGE_PATH || rootDir);
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  resolve(fileName) {
    const safeName = path.basename(String(fileName || ''));
    if (!safeName) throw new Error('Backup filename is required');
    return path.join(this.rootDir, safeName);
  }

  exists(fileName) { return fs.existsSync(this.resolve(fileName)); }
  stat(fileName) { return fs.statSync(this.resolve(fileName)); }
  list() { return fs.readdirSync(this.rootDir); }
  remove(fileName) {
    const target = this.resolve(fileName);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  rename(fromName, toName) { fs.renameSync(this.resolve(fromName), this.resolve(toName)); }
  createReadStream(fileName) { return fs.createReadStream(this.resolve(fileName)); }
  createWriteStream(fileName, options) { return fs.createWriteStream(this.resolve(fileName), options); }
  readFile(fileName, encoding) { return fs.readFileSync(this.resolve(fileName), encoding); }
  getCapacity() {
    if (typeof fs.statfsSync !== 'function') return { total: null, free: null, used: null, usedPercentage: null };
    const stats = fs.statfsSync(this.rootDir);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const used = Math.max(0, total - free);
    return { total, free, used, usedPercentage: total ? Number(((used / total) * 100).toFixed(1)) : null };
  }
}

function createBackupStorage(defaultRoot) {
  const provider = String(process.env.BACKUP_STORAGE_PROVIDER || 'local').toLowerCase();
  if (!['local', 'railway-volume'].includes(provider)) {
    throw new Error(`Backup storage provider "${provider}" is not configured. Use local or railway-volume, or install a provider adapter.`);
  }
  return new LocalBackupStorage(defaultRoot);
}

module.exports = { LocalBackupStorage, createBackupStorage };

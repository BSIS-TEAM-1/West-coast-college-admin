class ConsoleBackupNotificationProvider {
  constructor(logger = console) { this.name = 'console'; this.logger = logger; }
  async send(event) { this.logger.info?.(`[backup-notification] ${event.type}`, event); }
}

class WebhookBackupNotificationProvider {
  constructor(url) { this.name = 'webhook'; this.url = url; }
  async send(event) {
    const response = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
    if (!response.ok) throw new Error(`Backup notification webhook returned ${response.status}`);
  }
}

class BackupNotificationService {
  constructor(providers = []) { this.providers = providers; }
  async notify(type, details = {}) {
    const event = { type, timestamp: new Date().toISOString(), ...details };
    const results = await Promise.allSettled(this.providers.map(provider => provider.send(event)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') console.error(`Backup notification provider ${this.providers[index].name} failed:`, result.reason);
    });
    return event;
  }
}

function createBackupNotificationService() {
  const providers = [new ConsoleBackupNotificationProvider()];
  if (process.env.BACKUP_NOTIFICATION_WEBHOOK_URL) providers.push(new WebhookBackupNotificationProvider(process.env.BACKUP_NOTIFICATION_WEBHOOK_URL));
  return new BackupNotificationService(providers);
}

module.exports = { BackupNotificationService, ConsoleBackupNotificationProvider, WebhookBackupNotificationProvider, createBackupNotificationService };

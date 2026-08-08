const BaseRepository = require('../../shared/BaseRepository');
const AuditLog = require('../../../models/AuditLog');

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }

  async findByResourceType(resourceType, options = {}) {
    return this.find({ resourceType }, options);
  }

  async findByAction(action, options = {}) {
    return this.find({ action }, options);
  }

  async log(entry, options = {}) {
    return this.create({
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      userId: entry.userId,
      username: entry.username,
      userRole: entry.userRole,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      status: entry.status || 'success',
      severity: entry.severity || 'info',
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: entry.metadata,
    }, options);
  }

  async getStats(options = {}) {
    const pipeline = [
      {
        $group: {
          _id: { action: '$action', status: '$status' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ];
    return this.aggregate(pipeline, options);
  }
}

module.exports = new AuditLogRepository();

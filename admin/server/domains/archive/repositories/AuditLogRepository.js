const BaseRepository = require('../../shared/BaseRepository');
const AuditLog = require('../../../models/AuditLog');

// Valid enum values from models/AuditLog.js — kept in sync manually.
const VALID_ACTIONS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT',
  'VIEW', 'EXPORT', 'UPLOAD', 'DOWNLOAD', 'APPROVE',
  'REJECT', 'ARCHIVE', 'RESTORE', 'BAN', 'UNBAN',
  'SECURITY_SCAN', 'SECURITY_HEADERS_SCAN',
  'BLOCK_IP', 'UNBLOCK_IP', 'VERIFY',
  'DROP', 'RETAKE', 'OVERRIDE', 'SHIFT'
]);
const VALID_RESOURCE_TYPES = new Set([
  'ADMIN', 'STUDENT', 'FACULTY', 'COURSE', 'REGISTRATION',
  'ANNOUNCEMENT', 'DOCUMENT', 'SYSTEM', 'PROFILE', 'ACCOUNT',
  'SECURITY', 'ENROLLMENT', 'CURRICULUM', 'EVALUATION', 'EVALUATION_PERIOD'
]);

// Domain-event actions that are not themselves audit actions are mapped to
// the closest base action so the event log and the audit trail stay linked.
const ACTION_FALLBACKS = {
  STUDENT_PROMOTED: 'UPDATE',
  STUDENT_RETAINED: 'UPDATE',
  STUDENT_GRADUATED: 'UPDATE',
  STUDENT_ENROLLED: 'CREATE',
  ENROLLMENT_COMPLETED: 'UPDATE',
  BLOCK_CREATED: 'CREATE',
  BLOCK_ARCHIVED: 'ARCHIVE',
  SNAPSHOT_GENERATED: 'ARCHIVE',
};

// Domain names (e.g. "Student") to the audit trail's uppercase resource types.
const RESOURCE_TYPE_ALIASES = {
  Student: 'STUDENT',
  Enrollment: 'ENROLLMENT',
  BlockGroup: 'COURSE',
  BlockSection: 'COURSE',
  Document: 'DOCUMENT',
  Announcement: 'ANNOUNCEMENT',
  Curriculum: 'CURRICULUM',
  System: 'SYSTEM',
};

function normalizeAction(action) {
  const candidate = String(action || '').toUpperCase().trim();
  if (VALID_ACTIONS.has(candidate)) return candidate;
  if (ACTION_FALLBACKS[action]) return ACTION_FALLBACKS[action];
  return 'UPDATE';
}

function normalizeResourceType(resourceType) {
  const direct = RESOURCE_TYPE_ALIASES[resourceType];
  if (direct) return direct;
  const candidate = String(resourceType || '').toUpperCase().trim();
  return VALID_RESOURCE_TYPES.has(candidate) ? candidate : 'SYSTEM';
}

function normalizeStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'success': return 'SUCCESS';
    case 'failure':
    case 'failed':
    case 'error': return 'FAILED';
    case 'partial': return 'PARTIAL';
    default: return 'SUCCESS';
  }
}

function normalizeSeverity(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'info':
    case 'low': return 'LOW';
    case 'warning': return 'MEDIUM';
    case 'error':
    case 'high': return 'HIGH';
    case 'critical': return 'CRITICAL';
    default: return 'LOW';
  }
}

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

  /**
   * Log an audit entry from a domain-event-shaped payload. Domain payloads
   * (action: 'STUDENT_PROMOTED', resourceType: 'Student', status: 'success',
   * performedBy as userId, etc.) are translated into the AuditLog schema's
   * contract — enum-legal action/resourceType/status/severity and the
   * required description/resourceName/performedBy fields.
   *
   * Entries without a known actor (performedBy/userId) are skipped rather
   * than allowed to throw, because every handler call site is best-effort
   * post-commit notification work.
   */
  async log(entry, options = {}) {
    const performedBy = entry.performedBy || entry.userId;
    if (!performedBy) {
      console.warn(
        `[AuditLogRepository] Skipped audit entry (${entry.action || 'unknown action'}, `
        + `${entry.resourceType || 'unknown resource'}: ${entry.resourceId || 'no id'}) — no actor to attribute.`
      );
      return null;
    }

    const action = normalizeAction(entry.action);
    const resourceType = normalizeResourceType(entry.resourceType);
    const resourceId = entry.resourceId ? String(entry.resourceId) : 'unknown';
    const resourceName = entry.resourceName
      || entry.metadata?.studentNumber
      || resourceId;

    let description = String(entry.description || '').trim();
    if (!description) {
      const detailParts = [
        entry.metadata?.studentNumber ? `${entry.metadata.studentNumber}` : '',
        entry.newValues?.schoolYear ? entry.newValues.schoolYear : '',
      ].filter(Boolean);
      description = `${action} — ${resourceType} ${resourceName}`
        + (detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '');
    }
    description = description.slice(0, 500);

    return this.create({
      action,
      resourceType,
      resourceId,
      resourceName,
      description,
      performedBy,
      performedByRole: entry.performedByRole || entry.userRole || 'admin',
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      oldValue: entry.oldValue ?? entry.oldValues ?? null,
      newValue: entry.newValue ?? entry.newValues ?? null,
      status: normalizeStatus(entry.status),
      severity: normalizeSeverity(entry.severity),
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

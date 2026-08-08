const express = require('express');
const router = express.Router();
const AuditLog = require('../../../models/AuditLog');

// These routes are mounted with authMiddleware + requireAdminRole already applied
// from the parent router. See index.js mounting point.

// GET / - get audit logs with pagination and filtering
router.get('/', async (req, res) => {
  if (!req.app.locals.dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' });
  }
  try {
    const {
      page = 1,
      limit = 20,
      action,
      resourceType,
      severity,
      sortOrder = 'newest',
      performedBy,
      startDate,
      endDate,
    } = req.query;

    const pageNumber = Number.parseInt(page, 10) || 1;
    const limitNumber = Number.parseInt(limit, 10) || 20;

    const filter = {};

    if (action) {
      const actionFilters = String(action)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (actionFilters.length === 1) {
        filter.action = actionFilters[0];
      } else if (actionFilters.length > 1) {
        filter.action = { $in: actionFilters };
      }
    }

    if (typeof resourceType === 'string' && resourceType.trim() !== '') {
      filter.resourceType = { $eq: resourceType.trim() };
    }

    if (typeof severity === 'string' && severity.trim() !== '') {
      filter.severity = { $eq: severity.trim() };
    }

    if (typeof performedBy === 'string' && performedBy.trim() !== '') {
      filter.performedBy = { $eq: performedBy.trim() };
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const normalizedSortOrder = String(sortOrder || 'newest').toLowerCase();
    const sortDirection = normalizedSortOrder === 'oldest' ? 1 : -1;

    const logs = await AuditLog.find(filter)
      .populate('performedBy', 'username displayName')
      .sort({ createdAt: sortDirection })
      .limit(limitNumber * 1)
      .skip((pageNumber - 1) * limitNumber);

    const total = await AuditLog.countDocuments(filter);

    const normalizeAuditDescription = (value) => {
      const text = String(value || '');
      return text.replace(/^Deleted admin account:/i, 'Deleted an account:');
    };

    const redactSensitiveAuditData = req.app.locals.redactSensitiveAuditData || ((v) => v);

    const sanitizedLogs = logs.map((entry) => {
      const logEntry = entry?.toObject ? entry.toObject() : entry;
      return {
        ...logEntry,
        description: normalizeAuditDescription(logEntry.description),
        oldValue: redactSensitiveAuditData(logEntry.oldValue),
        newValue: redactSensitiveAuditData(logEntry.newValue),
      };
    });

    res.json({
      logs: sanitizedLogs,
      totalPages: Math.ceil(total / limitNumber),
      currentPage: pageNumber,
      total,
    });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// GET /stats - get audit log statistics
router.get('/stats', async (req, res) => {
  if (!req.app.locals.dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' });
  }
  try {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      totalLogs,
      recentLogs,
      criticalLogs,
      actionStats,
      resourceStats,
    ] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: last30Days } }),
      AuditLog.countDocuments({ severity: 'CRITICAL' }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        { $group: { _id: '$resourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      totalLogs,
      recentLogs,
      criticalLogs,
      actionStats,
      resourceStats,
    });
  } catch (err) {
    console.error('Get audit log stats error:', err);
    res.status(500).json({ error: 'Failed to load audit log statistics.' });
  }
});

module.exports = router;

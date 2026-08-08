/**
 * Permission Matrix Middleware
 *
 * Role-Based Access Control (RBAC) middleware that checks user permissions
 * against a configurable permission matrix.
 *
 * Usage:
 *   router.post('/rollover/execute', authMiddleware, requirePermission('close_school_year'), handler)
 */

const PERMISSION_MATRIX = {
  close_school_year: ['admin', 'registrar'],
  promote_student: ['admin', 'registrar'],
  review_promotion: ['admin', 'registrar', 'dean'],
  submit_grades: ['admin', 'faculty', 'professor'],
  view_academic_timeline: ['admin', 'registrar', 'dean', 'faculty', 'professor', 'student'],
  view_archive: ['admin', 'registrar', 'dean'],
  manage_blocks: ['admin', 'registrar'],
  manage_students: ['admin', 'registrar'],
  manage_subjects: ['admin', 'registrar'],
  manage_curriculum: ['admin', 'registrar'],
  manage_system_settings: ['admin'],
  view_audit_logs: ['admin'],
  manage_applicants: ['admin', 'registrar'],
  manage_announcements: ['admin', 'registrar'],
  manage_documents: ['admin', 'registrar'],
  manage_security: ['admin'],
  execute_rollover: ['admin', 'registrar'],
  preview_rollover: ['admin', 'registrar'],
  view_snapshots: ['admin', 'registrar'],
};

/**
 * Normalize account type to a canonical role.
 */
function normalizeRole(accountType) {
  const role = String(accountType || '').toLowerCase().trim();
  // Map common variations
  const roleMap = {
    'superadmin': 'admin',
    'administrator': 'admin',
    'teacher': 'faculty',
    'instructor': 'faculty',
    'student': 'student',
  };
  return roleMap[role] || role;
}

/**
 * Middleware factory: require a specific permission.
 * Must be used after authMiddleware (which sets req.user).
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const allowedRoles = PERMISSION_MATRIX[permission];
    if (!allowedRoles) {
      console.error(`[RBAC] Unknown permission: ${permission}`);
      return res.status(500).json({ error: 'Server authorization misconfiguration.' });
    }

    const userRole = normalizeRole(req.user.accountType || req.user.role);
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: `Insufficient permissions. Required: ${permission}.`,
        permission,
        userRole,
      });
    }

    next();
  };
}

/**
 * Check if a user has a permission without middleware (for programmatic use).
 */
function hasPermission(user, permission) {
  if (!user) return false;
  const allowedRoles = PERMISSION_MATRIX[permission];
  if (!allowedRoles) return false;
  const userRole = normalizeRole(user.accountType || user.role);
  return allowedRoles.includes(userRole);
}

/**
 * Get all permissions for a given role.
 */
function getPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);
  return Object.entries(PERMISSION_MATRIX)
    .filter(([_, roles]) => roles.includes(normalizedRole))
    .map(([permission]) => permission);
}

module.exports = {
  requirePermission,
  hasPermission,
  getPermissionsForRole,
  normalizeRole,
  PERMISSION_MATRIX,
};

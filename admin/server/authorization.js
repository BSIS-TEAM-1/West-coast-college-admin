function normalizeAccountType(value) {
  return String(value || '').trim().toLowerCase()
}

function hasAnyRole(req, allowedRoles = []) {
  const normalizedAccountType = normalizeAccountType(req?.accountType)
  if (!normalizedAccountType) return false

  return allowedRoles
    .map((role) => normalizeAccountType(role))
    .includes(normalizedAccountType)
}

function requireAnyRole(...allowedRoles) {
  const normalizedRoles = allowedRoles
    .map((role) => normalizeAccountType(role))
    .filter(Boolean)

  return (req, res, next) => {
    if (!hasAnyRole(req, normalizedRoles)) {
      return res.status(403).json({
        error: `Forbidden. Required role: ${normalizedRoles.join(' or ')}.`
      })
    }

    next()
  }
}

function requireAdminRole(req, res, next) {
  return requireAnyRole('admin')(req, res, next)
}

function isOwnerOrAdmin(req, ownerId) {
  return hasAnyRole(req, ['admin']) || String(ownerId || '') === String(req?.adminId || '')
}

module.exports = {
  normalizeAccountType,
  hasAnyRole,
  requireAnyRole,
  requireAdminRole,
  isOwnerOrAdmin
}

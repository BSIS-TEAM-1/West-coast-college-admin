const ANNOUNCEMENT_AUDIENCES = Object.freeze(['all', 'students', 'registrar', 'professor', 'admin'])
const ANNOUNCEMENT_AUDIENCE_SET = new Set(ANNOUNCEMENT_AUDIENCES)
const LEGACY_AUDIENCE_ALIASES = Object.freeze({
  faculty: 'registrar',
  staff: 'professor',
})
const LEGACY_AUDIENCE_QUERY_VALUES = Object.freeze({
  registrar: ['faculty'],
  professor: ['staff'],
})

function normalizeAudienceValue(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return LEGACY_AUDIENCE_ALIASES[normalized] || normalized
}

function getAnnouncementAudienceQueryValues(value) {
  const normalized = normalizeAudienceValue(value)
  if (!ANNOUNCEMENT_AUDIENCE_SET.has(normalized)) {
    return []
  }

  return [normalized, ...(LEGACY_AUDIENCE_QUERY_VALUES[normalized] || [])]
}

function normalizeAnnouncementAudience(value, { fallback = ['all'] } = {}) {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value]

  const normalized = values
    .map(normalizeAudienceValue)
    .filter((item) => ANNOUNCEMENT_AUDIENCE_SET.has(item))

  const unique = [...new Set(normalized)]
  if (unique.includes('all')) {
    return ['all']
  }

  if (unique.length === 0) {
    return [...fallback]
  }

  return ANNOUNCEMENT_AUDIENCES.filter((item) => unique.includes(item))
}

function validateAnnouncementAudience(value) {
  if (value === undefined) {
    return ''
  }

  if (value === null) {
    return 'Target audience must include at least one audience.'
  }

  const values = Array.isArray(value) ? value : [value]
  if (values.length === 0) {
    return 'Target audience must include at least one audience.'
  }

  const normalizedValues = values
    .map(normalizeAudienceValue)
    .filter(Boolean)

  if (normalizedValues.length === 0) {
    return 'Target audience must include at least one audience.'
  }

  const invalidValues = normalizedValues.filter((item) => !ANNOUNCEMENT_AUDIENCE_SET.has(item))
  if (invalidValues.length > 0) {
    return 'Target audience contains invalid values.'
  }

  const uniqueValues = [...new Set(normalizedValues)]
  if (uniqueValues.includes('all') && uniqueValues.length > 1) {
    return 'All users cannot be combined with specific audiences.'
  }

  return ''
}

module.exports = {
  ANNOUNCEMENT_AUDIENCES,
  getAnnouncementAudienceQueryValues,
  normalizeAnnouncementAudience,
  validateAnnouncementAudience,
}

export const audienceOptions = [
  { value: 'all', label: 'All users' },
  { value: 'students', label: 'Students' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'professor', label: 'Professor' },
  { value: 'admin', label: 'Admins' },
] as const

export type AnnouncementAudience = (typeof audienceOptions)[number]['value']
export type AnnouncementAudienceSelection = AnnouncementAudience[]

const audienceLabelMap: Record<AnnouncementAudience, string> = audienceOptions.reduce(
  (labels, option) => {
    labels[option.value] = option.label
    return labels
  },
  {} as Record<AnnouncementAudience, string>
)

const audienceOrder = audienceOptions.map((option) => option.value)
const audienceSet = new Set<AnnouncementAudience>(audienceOrder)
const legacyAudienceAliases: Record<string, AnnouncementAudience> = {
  faculty: 'registrar',
  staff: 'professor',
}

export const DEFAULT_ANNOUNCEMENT_AUDIENCE: AnnouncementAudienceSelection = audienceOrder.filter((option) => option !== 'all') as AnnouncementAudienceSelection

function normalizeAudienceValue(value: unknown): AnnouncementAudience | '' {
  const normalized = String(value || '').trim().toLowerCase()
  const aliased = legacyAudienceAliases[normalized] || normalized
  return audienceSet.has(aliased as AnnouncementAudience)
    ? (aliased as AnnouncementAudience)
    : ''
}

export function normalizeAnnouncementAudience(value: unknown): AnnouncementAudienceSelection {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value]

  const normalized = values
    .map(normalizeAudienceValue)
    .filter((item): item is AnnouncementAudience => Boolean(item))

  const unique = [...new Set(normalized)]
  
  // If "all" is selected, expand to all individual roles for display purposes
  if (unique.includes('all')) {
    return audienceOrder.filter((option): option is AnnouncementAudience => option !== 'all')
  }

  // Allow empty selection - don't default to all individual roles
  if (unique.length === 0) {
    return []
  }

  return audienceOrder.filter((option): option is AnnouncementAudience => unique.includes(option))
}

export function toggleAnnouncementAudience(
  currentValue: unknown,
  nextValue: AnnouncementAudience
): AnnouncementAudienceSelection {
  const current = normalizeAnnouncementAudience(currentValue)
  const individualRoles = audienceOrder.filter((option): option is AnnouncementAudience => option !== 'all')
  const isAllSelected = current.length === individualRoles.length && 
                       current.every(role => individualRoles.includes(role))

  // Toggle "All Users"
  if (nextValue === 'all') {
    if (isAllSelected) {
      // Deselecting "All Users" - clear all selections
      return []
    }
    // Selecting "All Users" - return all individual roles
    return [...individualRoles]
  }

  // Toggle individual role when "All Users" is currently selected
  if (isAllSelected) {
    // Deselecting a specific role from "All Users" - keep the other roles
    const remaining = individualRoles.filter((role) => role !== nextValue)
    return remaining
  }

  // Toggle individual role normally
  if (current.includes(nextValue)) {
    // Deselecting a role
    const remaining = current.filter((item) => item !== nextValue)
    // Allow empty selection - don't default to "All Users"
    return remaining
  } else {
    // Selecting a role
    const newSelection = [...current, nextValue]
    // If all individual roles are now selected, switch to "All Users"
    if (newSelection.length === individualRoles.length) {
      return [...individualRoles]
    }
    return newSelection
  }
}

export function getAnnouncementAudienceLabels(value: unknown): string[] {
  return normalizeAnnouncementAudience(value).map((item) => audienceLabelMap[item])
}

export function serializeAnnouncementAudienceForApi(
  value: unknown
): AnnouncementAudience | AnnouncementAudienceSelection {
  const normalized = normalizeAnnouncementAudience(value)
  const individualRoles = audienceOrder.filter((option): option is AnnouncementAudience => option !== 'all')
  
  // If all individual roles are selected, serialize as 'all'
  if (normalized.length === individualRoles.length && 
      normalized.every(role => individualRoles.includes(role))) {
    return 'all'
  }
  
  // Always serialize as array when multiple roles selected
  if (normalized.length > 1) {
    return normalized
  }
  
  // Single role or empty (default to 'all' if empty)
  return normalized[0] || 'all'
}

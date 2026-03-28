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

export const DEFAULT_ANNOUNCEMENT_AUDIENCE: AnnouncementAudienceSelection = ['all']

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
  if (unique.includes('all')) {
    return [...DEFAULT_ANNOUNCEMENT_AUDIENCE]
  }

  if (unique.length === 0) {
    return [...DEFAULT_ANNOUNCEMENT_AUDIENCE]
  }

  return audienceOrder.filter((option) => unique.includes(option))
}

export function toggleAnnouncementAudience(
  currentValue: unknown,
  nextValue: AnnouncementAudience
): AnnouncementAudienceSelection {
  if (nextValue === 'all') {
    return [...DEFAULT_ANNOUNCEMENT_AUDIENCE]
  }

  const current = normalizeAnnouncementAudience(currentValue).filter((item) => item !== 'all')
  if (current.includes(nextValue)) {
    const remaining = current.filter((item) => item !== nextValue)
    return remaining.length > 0 ? remaining : [...DEFAULT_ANNOUNCEMENT_AUDIENCE]
  }

  return audienceOrder.filter((option) => option !== 'all' && [...current, nextValue].includes(option))
}

export function getAnnouncementAudienceLabels(value: unknown): string[] {
  return normalizeAnnouncementAudience(value).map((item) => audienceLabelMap[item])
}

export function serializeAnnouncementAudienceForApi(
  value: unknown
): AnnouncementAudience | AnnouncementAudienceSelection {
  const normalized = normalizeAnnouncementAudience(value)
  return normalized.length === 1 ? normalized[0] : normalized
}

import { normalizeAnnouncementAudience } from '../../lib/announcementAudience'
import type { Announcement } from './professorTypes'

export const isVisibleProfessorAnnouncement = (value: any): value is Announcement => {
  if (!value || typeof value !== 'object') return false
  if (value.isActive === false) return false
  if (value.isArchived === true) return false

  const id = String(value._id || '').trim()
  const title = String(value.title || '').trim()
  if (!id || !title) return false

  const rawExpiry = String(value.expiresAt || '').trim()
  if (!rawExpiry) return true

  const expiry = new Date(rawExpiry)
  if (Number.isNaN(expiry.getTime())) return true

  if (expiry.getTime() <= Date.now()) return false

  const audiences = normalizeAnnouncementAudience(value.targetAudience)
  return audiences.includes('all') || audiences.includes('professor')
}

export const buildReconnectMessage = (resourceLabel: string) => (
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'Internet connection lost. Reconnecting and reloading ' + resourceLabel + ' automatically.'
    : 'Connection is unstable. Retrying ' + resourceLabel + '.'
)

export const normalizeSemester = (value: string | undefined | null): string => {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (['1', '1st', 'first', 'firstsemester', '1stsemester', 'firstsem', 'sem1', '1stsem'].includes(raw)) return '1st'
  if (['2', '2nd', 'second', 'secondsemester', '2ndsemester', 'secondsem', 'sem2', '2ndsem'].includes(raw)) return '2nd'
  if (['summer', 'summerterm', 'summersemester'].includes(raw)) return 'Summer'
  return String(value || '').trim() || '1st'
}

export const formatSemesterLabel = (value: string | undefined | null): string => {
  const norm = normalizeSemester(value)
  if (norm === '1st') return '1st Sem'
  if (norm === '2nd') return '2nd Sem'
  if (norm === 'Summer') return 'Summer'
  return norm ? `${norm} Sem` : '1st Sem'
}

export const formatSemesterFull = (value: string | undefined | null): string => {
  const norm = normalizeSemester(value)
  if (norm === '1st') return '1st Semester'
  if (norm === '2nd') return '2nd Semester'
  if (norm === 'Summer') return 'Summer Term'
  return norm ? `${norm} Semester` : '1st Semester'
}

export const toSchoolYear = (value: string | undefined | null): string => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{4}$/.test(text)) return text
  const startYear = Number(text)
  return Number.isFinite(startYear) && startYear > 0 ? `${startYear}-${startYear + 1}` : text
}

export const isBlockInActiveTerm = (
  block: { semester?: string; schoolYear?: string; isCurrent?: boolean },
  activeTerm?: { semester?: string; schoolYear?: string } | null
): boolean => {
  if (!activeTerm || (!activeTerm.semester && !activeTerm.schoolYear)) {
    return Boolean(block.isCurrent)
  }
  const semMatch = !activeTerm.semester || normalizeSemester(block.semester) === normalizeSemester(activeTerm.semester)
  const syMatch = !block.schoolYear || !activeTerm.schoolYear || toSchoolYear(block.schoolYear) === toSchoolYear(activeTerm.schoolYear)
  return semMatch && syMatch
}

export interface BlockMetaResult {
  metaText: string
  statusLabel: string | null
  fullText: string
}

export const deriveBlockStatusLabel = (
  block: { status?: string; semester?: string; schoolYear?: string; isCurrent?: boolean },
  activeTerm?: { semester?: string; schoolYear?: string } | null,
  termFilter: string = 'active'
): string | null => {
  const rawStatus = String(block.status || '').trim()
  const lowerStatus = rawStatus.toLowerCase()

  if (lowerStatus === 'archived') return 'Archived'
  if (lowerStatus === 'closed') return 'Closed'
  if (lowerStatus === 'inactive') return 'Inactive'
  if (lowerStatus === 'completed') return 'Completed'

  const isActive = isBlockInActiveTerm(block, activeTerm)

  // In 'all' view, distinguish active vs historical/archived blocks
  if (termFilter === 'all') {
    return isActive ? 'Active' : 'Archived'
  }

  // When filtering by specific semester ('1st' or '2nd') or school year,
  // highlight if a block is from a past/inactive term
  if (!isActive) {
    return 'Archived'
  }

  // If in 'active' filter, all visible blocks are already active; omit redundant Active
  return null
}

export const buildBlockMeta = (
  block: { status?: string; semester?: string; schoolYear?: string; yearLevel?: number | null; isCurrent?: boolean },
  options?: {
    termFilter?: string
    activeTerm?: { semester?: string; schoolYear?: string } | null
  }
): BlockMetaResult => {
  const termFilter = options?.termFilter || 'active'
  const activeTerm = options?.activeTerm

  // 1. AY
  let ayText = ''
  if (block.schoolYear) {
    const normalizedSy = toSchoolYear(block.schoolYear)
    const formattedSy = normalizedSy.replace('-', '–')
    ayText = formattedSy.toLowerCase().startsWith('ay') ? formattedSy : `AY ${formattedSy}`
  }

  // 2. Year Level
  const yearLevelText = block.yearLevel ? `Year ${block.yearLevel}` : ''

  // 3. Semester (omitted if clear from page context, e.g. termFilter is explicitly '1st' or '2nd')
  const isSemesterClear = termFilter === '1st' || termFilter === '2nd'
  const semesterText = isSemesterClear ? '' : formatSemesterFull(block.semester)

  // 4. Status
  const statusLabel = deriveBlockStatusLabel(block, activeTerm, termFilter)

  const metaParts = [ayText, yearLevelText, semesterText].filter(Boolean)
  const metaText = metaParts.join(' · ')
  const fullText = [metaText, statusLabel].filter(Boolean).join(' · ')

  return {
    metaText,
    statusLabel,
    fullText
  }
}



import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PencilLine, Plus, Trash2 } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import { formatBlockLabel, schoolYearFromStartYear } from '../lib/blockAssignmentShared'
import { getAcademicTerm, type AcademicTerm } from '../lib/settingsApi'
import { formatScheduleDisplay, timeTo24h, parseClockMinutesFlexible } from '../lib/scheduleFormatter'
import TeachingHoursWarningModal from './TeachingHoursWarningModal'
import InstructorOverrideModal from './InstructorOverrideModal'
import './ProfessorLoad.css'
import './RegistrarCourseWorkspace.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year?: number | string; schoolYear?: string; curriculumId?: string; yearLevel?: number; courseId?: number; courseCode?: string; status?: string; isArchived?: boolean }
type BlockSection = { _id: string; sectionCode: string; capacity: number; currentPopulation: number; status?: string; isArchived?: boolean }
type SubjectItem = { _id: string; code: string; title: string; units?: number; lecturePeriods?: number; labPeriods?: number }

type SectionSubjectAssignment = {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  instructor: string
  schedule: string
  room: string
  studentCount: number
}

type ProfessorCourseAssignment = {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  schedule: string
  room: string
  sectionCode: string
  sectionId: string
  sectionLabel: string
  blockGroupId: string
  blockGroupName: string
  semester: string
  schoolYear: string
  courseShortLabel: string
  courseLabel?: string
  studentCount: number
}

type ProfessorCourseSummary = {
  label: string
  fullLabel: string
  sections: number
  subjectCount: number
  studentCount: number
}

type ProfessorCourseLoad = {
  professorId: string
  username: string
  displayName: string
  label: string
  assignments: ProfessorCourseAssignment[]
  totals: {
    courses: number
    sections: number
    subjects: number
    students: number
  }
  courseSummaries: ProfessorCourseSummary[]
}

type LoadsPayload = {
  professors?: ProfessorCourseLoad[]
}

type DayScheduleFields = {
  startTime: string
  startAmPm: 'AM' | 'PM'
  endTime: string
  endAmPm: 'AM' | 'PM'
  room: string
}

const DEFAULT_DAY_SCHEDULE: DayScheduleFields = {
  startTime: '6:00',
  startAmPm: 'AM',
  endTime: '10:00',
  endAmPm: 'AM',
  room: ''
}

// Allowed class time window expressed in minutes from midnight (6:00 AM - 10:00 PM).
const CLASS_WINDOW_START_MINUTES = 6 * 60
const CLASS_WINDOW_END_MINUTES = 22 * 60

// Returns null when the day's times are acceptable, or a short reason to show
// next to the row as the user types. Times are parsed together with their
// AM/PM flag so "1:00 AM" is never misread as 1:00 PM. A missing minute is
// treated as "still typing", not an error.
const describeDayTimeProblem = (
  startTimeText: string,
  startAmPm: 'AM' | 'PM',
  endTimeText: string,
  endAmPm: 'AM' | 'PM'
): string | null => {
  const toMinutes = (text: string, ampm: 'AM' | 'PM'): number | null | 'incomplete' => {
    const parts = splitTimeParts(text)
    if (!parts.hour && !parts.minute) return null // untouched/empty: not an error
    if (!parts.minute) return 'incomplete' // hour typed, minute empty: still typing
    const normalized = normalizeTimeText(`${parts.hour}:${parts.minute}`)
    if (!normalized) return null // impossible value such as 13:00 or 8:75
    return parseClockMinutesFlexible(`${normalized} ${ampm}`)
  }

  const startMins = toMinutes(startTimeText, startAmPm)
  const endMins = toMinutes(endTimeText, endAmPm)
  const startInvalid = startMins === 'incomplete'
  const endInvalid = endMins === 'incomplete'
  const startReady = typeof startMins === 'number'
  const endReady = typeof endMins === 'number'
  if (startInvalid) return 'Invalid start time (use 1-12 and 00-59)'
  if (endInvalid) return 'Invalid end time (use 1-12 and 00-59)'
  if (startReady && (startMins as number) < CLASS_WINDOW_START_MINUTES) {
    return 'Start cannot be before 6:00 AM'
  }
  if (endReady && (endMins as number) > CLASS_WINDOW_END_MINUTES) {
    return 'End cannot be after 10:00 PM'
  }
  if (startReady && endReady && (endMins as number) <= (startMins as number)) {
    return 'End time must be later than start time'
  }
  return null
}

// Accepts "8", "8:00", "08:00", "12:30", and compact "800"/"130"/"1230" input,
// always returning a normalized "H:MM" with a visible colon.
const normalizeTimeText = (value: string): string | null => {
  const text = String(value ?? '').trim()
  if (!text) return null

  const buildTime = (hour: number, minute: number) => {
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
    return `${hour}:${String(minute).padStart(2, '0')}`
  }

  const colonMatch = text.match(/^(\d{1,2}):(\d{1,2})$/)
  if (colonMatch) return buildTime(Number(colonMatch[1]), Number(colonMatch[2]))

  if (/^\d{1,2}$/.test(text)) return buildTime(Number(text), 0)
  if (/^\d{3}$/.test(text)) return buildTime(Number(text.slice(0, 1)), Number(text.slice(1)))
  if (/^\d{4}$/.test(text)) return buildTime(Number(text.slice(0, 2)), Number(text.slice(2)))

  return null
}

const splitTimeParts = (value: string) => {
  const [rawHour = '', rawMinute = ''] = String(value ?? '').split(':')
  return {
    hour: rawHour.replace(/\D/g, '').slice(0, 2),
    minute: rawMinute.replace(/\D/g, '').slice(0, 2)
  }
}

type ProfessorLoadDraft = {
  professorId: string
  selectedGroupId: string
  selectedSectionId: string
  selectedSubjectId: string
  editingAssignmentId: string
  subjectDaySelections: string[]
  subjectDaySchedules: Record<string, DayScheduleFields[] | DayScheduleFields>
  subjectDayTouched: Record<string, boolean>
  savedAt: number
}

const DRAFT_STORAGE_PREFIX = 'wcc_prof_load_draft_'

const getDraftStorageKey = (profId: string) => `${DRAFT_STORAGE_PREFIX}${profId}`

const saveDraftToStorage = (draft: ProfessorLoadDraft) => {
  try {
    if (typeof window === 'undefined' || !draft.professorId) return
    localStorage.setItem(getDraftStorageKey(draft.professorId), JSON.stringify(draft))
  } catch (e) {
    console.error('Failed to save professor load draft', e)
  }
}

const loadDraftFromStorage = (profId: string): ProfessorLoadDraft | null => {
  try {
    if (typeof window === 'undefined' || !profId) return null
    const raw = localStorage.getItem(getDraftStorageKey(profId))
    if (!raw) return null
    return JSON.parse(raw) as ProfessorLoadDraft
  } catch {
    return null
  }
}

const clearDraftFromStorage = (profId: string) => {
  try {
    if (typeof window === 'undefined' || !profId) return
    localStorage.removeItem(getDraftStorageKey(profId))
  } catch {}
}

type Props = {
  selection: { professorId: string } | null
  onBack?: () => void
}

export default function RegistrarCourseWorkspace({ selection, onBack: _onBack }: Props) {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectDaySchedules, setSubjectDaySchedules] = useState<Record<string, DayScheduleFields[]>>({})
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [selectedProfessorId, setSelectedProfessorId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewingSubjectsProfessorId, setViewingSubjectsProfessorId] = useState('')
  const [teachingHoursWarning, setTeachingHoursWarning] = useState<any>(null)
  const [pendingAssignmentPayload, setPendingAssignmentPayload] = useState<any>(null)
  const [instructorOverrideWarning, setInstructorOverrideWarning] = useState<any>(null)
  // Marks per-day time fields the user has edited. Untouched days keep the
  // default (example) values, which are rendered dimmed to hint "fill me in".
  const [subjectDayTouched, setSubjectDayTouched] = useState<Record<string, boolean>>({})
  const isRestoringDraftRef = useRef(false)

  const dayOptions = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU']

  const restoreDraft = (draft: ProfessorLoadDraft) => {
    isRestoringDraftRef.current = true
    if (draft.selectedGroupId) setSelectedGroupId(draft.selectedGroupId)
    if (draft.selectedSectionId) setSelectedSectionId(draft.selectedSectionId)
    if (draft.selectedSubjectId) setSelectedSubjectId(draft.selectedSubjectId)
    setEditingAssignmentId(draft.editingAssignmentId || '')
    setSubjectDaySelections(draft.subjectDaySelections || [])

    const normalizedSchedules: Record<string, DayScheduleFields[]> = {}
    if (draft.subjectDaySchedules) {
      Object.entries(draft.subjectDaySchedules).forEach(([day, val]) => {
        if (Array.isArray(val)) {
          normalizedSchedules[day] = val
        } else if (val && typeof val === 'object') {
          normalizedSchedules[day] = [val as DayScheduleFields]
        }
      })
    }
    setSubjectDaySchedules(normalizedSchedules)
    setSubjectDayTouched(draft.subjectDayTouched || {})
    window.setTimeout(() => {
      isRestoringDraftRef.current = false
    }, 400)
  }

  const clearAssignmentForm = (clearStorage = true) => {
    setEditingAssignmentId('')
    setSelectedSubjectId('')
    setSubjectDaySelections([])
    setSubjectDaySchedules({})
    setSubjectDayTouched({})
    if (clearStorage && selectedProfessorId) {
      clearDraftFromStorage(selectedProfessorId)
    }
  }

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const baseMessage = (data?.error as string) || (data?.message as string) || `Request failed (${response.status})`
      const detailText = Array.isArray(data?.details) && data.details.length
        ? ` (${data.details.map((detail: unknown) => String(detail)).join('; ')})`
        : ''
      const apiError = new Error(`${baseMessage}${detailText}`) as Error & {
        status?: number
        warning?: string
        data?: Record<string, unknown>
      }
      apiError.status = response.status
      if (data?.warning) apiError.warning = data.warning
      if (data?.data) apiError.data = data.data
      throw apiError
    }
    return data
  }

  // Warnings arrive as 409 responses. Show them as confirmation popups instead
  // of red error text, and keep the payload so the user can still proceed.
  const handleAssignmentWarning = (err: unknown, payload: Record<string, unknown>) => {
    const apiError = err as Error & { warning?: string; data?: Record<string, unknown> }
    if (apiError?.warning === 'instructor_override_required' && apiError.data) {
      setTeachingHoursWarning(null)
      setInstructorOverrideWarning(apiError.data)
      setPendingAssignmentPayload(payload)
      return true
    }
    if (
      (apiError?.warning === 'teaching_hours_exceeded' ||
        apiError?.warning === 'teaching_hours_insufficient' ||
        apiError?.warning === 'teaching_hours_discrepancy' ||
        Boolean(apiError?.warning?.startsWith('teaching_hours_'))) &&
      apiError.data
    ) {
      setInstructorOverrideWarning(null)
      setTeachingHoursWarning(apiError.data)
      setPendingAssignmentPayload(payload)
      return true
    }
    return false
  }

  const formatAcademicYear = (value?: number | string) => {
    const text = String(value || '').trim()
    // If it's already a school year string (e.g., "2026-2027"), return it as-is
    if (/^\d{4}-\d{4}$/.test(text)) return text
    // If it's a numeric year, convert to school year format
    const year = Number(value)
    return Number.isFinite(year) && year > 0 ? `${year}-${year + 1}` : 'N/A'
  }

  const updateDayTimePart = (
    dayCode: string,
    slotIndex: number,
    field: 'startTime' | 'endTime',
    part: 'hour' | 'minute',
    rawValue: string,
    sourceInput?: HTMLInputElement
  ) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, 2)
    setSubjectDayTouched((curr) => ({ ...curr, [`${dayCode}_${slotIndex}`]: true, [dayCode]: true }))
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : [{ ...DEFAULT_DAY_SCHEDULE }]
      const current = daySlots[slotIndex] || { ...DEFAULT_DAY_SCHEDULE }
      const parts = splitTimeParts(current[field])
      daySlots[slotIndex] = {
        ...current,
        [field]: `${part === 'hour' ? digits : parts.hour}:${part === 'minute' ? digits : parts.minute}`
      }
      return {
        ...curr,
        [dayCode]: daySlots
      }
    })

    if (part === 'hour' && sourceInput) {
      // Let a user type a time continuously (for example 0730) without tabbing
      // between the hour and minute fields.
      const shouldAdvance = digits.length === 2 || (digits.length === 1 && Number(digits) >= 2)
      if (shouldAdvance) {
        const minuteInput = sourceInput
          .closest('.time-box-input-group')
          ?.querySelector<HTMLInputElement>('.time-box-minute')
        if (minuteInput) {
          minuteInput.focus()
          minuteInput.select()
        }
      }
    }
  }

  const normalizeDayTime = (dayCode: string, slotIndex: number, field: 'startTime' | 'endTime') => {
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : []
      const current = daySlots[slotIndex]
      if (!current) return curr
      const parts = splitTimeParts(current[field])
      if (!parts.hour && !parts.minute) {
        daySlots[slotIndex] = { ...current, [field]: ':' }
        return { ...curr, [dayCode]: daySlots }
      }
      const normalized = normalizeTimeText(`${parts.hour}:${parts.minute || '00'}`)
      if (normalized) {
        daySlots[slotIndex] = { ...current, [field]: normalized }
        return { ...curr, [dayCode]: daySlots }
      }
      return curr
    })
  }

  const updateDayAmPm = (dayCode: string, slotIndex: number, field: 'startAmPm' | 'endAmPm', value: 'AM' | 'PM') => {
    setSubjectDayTouched((curr) => ({ ...curr, [`${dayCode}_${slotIndex}`]: true, [dayCode]: true }))
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : [{ ...DEFAULT_DAY_SCHEDULE }]
      const current = daySlots[slotIndex] || { ...DEFAULT_DAY_SCHEDULE }
      daySlots[slotIndex] = { ...current, [field]: value }
      return { ...curr, [dayCode]: daySlots }
    })
  }

  const updateDayRoom = (dayCode: string, slotIndex: number, room: string) => {
    setSubjectDayTouched((curr) => ({ ...curr, [`${dayCode}_${slotIndex}`]: true, [dayCode]: true }))
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : [{ ...DEFAULT_DAY_SCHEDULE }]
      const current = daySlots[slotIndex] || { ...DEFAULT_DAY_SCHEDULE }
      daySlots[slotIndex] = { ...current, room }
      return { ...curr, [dayCode]: daySlots }
    })
  }

  const addDaySlot = (dayCode: string) => {
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : [{ ...DEFAULT_DAY_SCHEDULE }]
      const lastSlot = daySlots[daySlots.length - 1]
      const newSlot: DayScheduleFields = {
        ...DEFAULT_DAY_SCHEDULE,
        room: lastSlot ? lastSlot.room : ''
      }
      return { ...curr, [dayCode]: [...daySlots, newSlot] }
    })
    setSubjectDayTouched((curr) => {
      const currentSlots = subjectDaySchedules[dayCode] || []
      return { ...curr, [`${dayCode}_${currentSlots.length}`]: true, [dayCode]: true }
    })
  }

  const removeDaySlot = (dayCode: string, slotIndex: number) => {
    setSubjectDaySchedules((curr) => {
      const daySlots = curr[dayCode] ? [...curr[dayCode]] : []
      if (daySlots.length <= 1) return curr
      const updated = daySlots.filter((_, idx) => idx !== slotIndex)
      return { ...curr, [dayCode]: updated }
    })
    setSubjectDayTouched((curr) => {
      const next = { ...curr }
      delete next[`${dayCode}_${slotIndex}`]
      return next
    })
  }

  const parseScheduleIntoFields = (schedule: string, room?: string) => {
    const trimmed = String(schedule || '').trim()
    const fallbackRoom = String(room || '').trim() === 'TBA' ? '' : String(room || '').trim()
    if (!trimmed || /^TBA$/i.test(trimmed)) {
      return { days: [] as string[], daySchedules: {} as Record<string, DayScheduleFields[]> }
    }

    const tokenOrder = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']

    const parse24To12 = (time24: string) => {
      const match = time24.match(/^(\d{1,2}):(\d{2})$/)
      if (!match) return { time: '6:00', ampm: 'AM' as const }
      let h = Number.parseInt(match[1], 10)
      const m = match[2]
      const ampm = h >= 12 ? 'PM' as const : 'AM' as const
      if (h > 12) h -= 12
      if (h === 0) h = 12
      return { time: `${h}:${m}`, ampm }
    }

    // When loading a stored schedule into the editor, keep it inside the
    // allowed class window. Out-of-window or impossible times (legacy records
    // like "M 1:00 AM - 6:00 AM") fall back to the 6:00 AM - 10:00 AM default.
    const clampToWindow = (parts: { time: string; ampm: 'AM' | 'PM' }) => {
      const mins = parseClockMinutesFlexible(`${parts.time} ${parts.ampm}`)
      if (mins === null) return parts
      if (mins < CLASS_WINDOW_START_MINUTES) return { time: '6:00', ampm: 'AM' as const }
      if (mins > CLASS_WINDOW_END_MINUTES) return { time: '10:00', ampm: 'PM' as const }
      return parts
    }

    const buildFields = (
      start: { time: string; ampm: 'AM' | 'PM' },
      end: { time: string; ampm: 'AM' | 'PM' },
      roomValue: string
    ): DayScheduleFields => {
      const clampedStart = clampToWindow(start)
      const clampedEnd = clampToWindow(end)
      const startMins = parseClockMinutesFlexible(`${clampedStart.time} ${clampedStart.ampm}`)
      const endMins = parseClockMinutesFlexible(`${clampedEnd.time} ${clampedEnd.ampm}`)
      if (startMins === null || endMins === null || endMins <= startMins) {
        return { ...DEFAULT_DAY_SCHEDULE, room: roomValue }
      }
      return {
        startTime: clampedStart.time,
        startAmPm: clampedStart.ampm,
        endTime: clampedEnd.time,
        endAmPm: clampedEnd.ampm,
        room: roomValue
      }
    }

    // Per-day format: "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
    if (trimmed.includes('/')) {
      const segments = trimmed.split('/').map(s => s.trim()).filter(Boolean)
      const daySchedules: Record<string, DayScheduleFields[]> = {}
      const days: string[] = []

      for (const segment of segments) {
        // Extract optional @ room suffix
        const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/)
        const segmentBody = roomMatch ? roomMatch[1].trim() : segment
        const segmentRoom = roomMatch ? roomMatch[2].trim() : fallbackRoom

        const match = segmentBody.match(/^([A-Z]+)\s+(.+?)\s*-\s*(.+)$/i)
        if (!match) continue
        const daysRaw = match[1].toUpperCase()
        const start = parse24To12(timeTo24h(match[2].trim()))
        const end = parse24To12(timeTo24h(match[3].trim()))

        let cursor = daysRaw
        while (cursor.length > 0) {
          const token = tokenOrder.find((value) => cursor.startsWith(value))
          if (!token) break
          if (!days.includes(token)) {
            days.push(token)
          }
          if (!daySchedules[token]) {
            daySchedules[token] = []
          }
          daySchedules[token].push(buildFields(start, end, segmentRoom))
          cursor = cursor.slice(token.length)
        }
      }

      return { days: dayOptions.filter((day) => days.includes(day)), daySchedules }
    }

    // Classic format: "MW 07:30-09:00" or single segment "M 07:30-09:00 @ Room 205"
    const roomMatch = trimmed.match(/^(.+?)\s*@\s*(.+)$/)
    const body = roomMatch ? roomMatch[1].trim() : trimmed
    const singleRoom = roomMatch ? roomMatch[2].trim() : fallbackRoom

    const separatorIndex = body.indexOf(' ')
    if (separatorIndex < 0) {
      return { days: [] as string[], daySchedules: {} as Record<string, DayScheduleFields[]> }
    }
    const daysRaw = body.slice(0, separatorIndex).toUpperCase()
    const timeRaw = body.slice(separatorIndex + 1).trim()
    const timeMatch = timeRaw.match(/^(.+?)\s*-\s*(.+)$/)
    const days: string[] = []
    let cursor = daysRaw

    while (cursor.length > 0) {
      const token = tokenOrder.find((value) => cursor.startsWith(value))
      if (!token) break
      days.push(token)
      cursor = cursor.slice(token.length)
    }

    const start = timeMatch ? parse24To12(timeTo24h(timeMatch[1].trim())) : { time: '6:00', ampm: 'AM' as const }
    const end = timeMatch ? parse24To12(timeTo24h(timeMatch[2].trim())) : { time: '10:00', ampm: 'AM' as const }
    const daySchedules: Record<string, DayScheduleFields[]> = {}
    days.forEach((day) => { daySchedules[day] = [buildFields(start, end, singleRoom)] })

    return { days: dayOptions.filter((day) => days.includes(day)), daySchedules }
  }

  const extractGroupMeta = (groupName: string) => {
    const match = String(groupName || '').trim().toUpperCase().match(/^(\d+)-(\d)-?[A-Z]$/)
    return match
      ? { course: Number(match[1]) || undefined, yearLevel: Number(match[2]) || undefined }
      : { course: undefined as number | undefined, yearLevel: undefined as number | undefined }
  }

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data as BlockGroup[] : [])
      setError('')
    } catch (err) {
      setBlockGroups([])
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchProfessorCourseLoads = async (term?: AcademicTerm | null) => {
    try {
      const targetTerm = term !== undefined ? term : activeTerm
      const schoolYear = String(targetTerm?.schoolYear || '').trim()
      const semester = String(targetTerm?.semester || '').trim()
      const params = new URLSearchParams()
      if (schoolYear) params.set('year', schoolYear)
      if (semester) params.set('semester', semester)
      const qs = params.toString()
      const data = await authorizedFetch(`/api/registrar/professor-course-loads${qs ? `?${qs}` : ''}`)
      const payload = (data?.data || {}) as LoadsPayload
      setProfessorLoads(Array.isArray(payload.professors) ? payload.professors : [])
      setError('')
    } catch (err) {
      setProfessorLoads([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor course loads')
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      const nextSections = Array.isArray(data) ? data as BlockSection[] : []
      setSections(nextSections)
      // Keep the current section if it exists in the fetched list; otherwise select the first section
      if (nextSections.length > 0) {
        setSelectedSectionId((prev) => (prev && nextSections.some((section) => section._id === prev) ? prev : (nextSections[0]?._id || '')))
      } else {
        setSelectedSectionId('')
      }
      setError('')
    } catch (err) {
      setSections([])
      setSelectedSectionId('')
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  const fetchSubjects = async (group: BlockGroup | null) => {
    try {
      let nextSubjects: SubjectItem[] = []

      if (group?.curriculumId) {
        // Fetch subjects from the curriculum linked to this block group.
        // Prefer the group's structured yearLevel — parsing it from the
        // group name only works for numeric names (e.g. 101-1A) and silently
        // drops the filter for names like BEED-1A, returning every year
        // level's subjects (out of sync with the curriculum placement).
        const params = new URLSearchParams()
        const meta = extractGroupMeta(group.name)
        const yearLevel = Number(group.yearLevel) || meta.yearLevel
        if (yearLevel) params.set('yearLevel', String(yearLevel))
        if (group.semester) params.set('semester', group.semester)
        const query = params.toString()
        const data = await authorizedFetch(`/api/registrar/curriculums/${group.curriculumId}/subjects${query ? `?${query}` : ''}`)
        const curriculumSubjects = Array.isArray(data?.data) ? data.data as any[] : []
        nextSubjects = curriculumSubjects
          .filter((cs) => cs.subjectId && typeof cs.subjectId === 'object')
          .map((cs) => ({
            _id: String(cs.subjectId._id),
            code: String(cs.subjectId.code || ''),
            title: String(cs.subjectId.title || ''),
            units: cs.subjectId.units || cs.units || 0,
            lecturePeriods: cs.lecturePeriods ?? cs.subjectId.lecturePeriods ?? 0,
            labPeriods: cs.labPeriods ?? cs.subjectId.labPeriods ?? 0
          }))
      } else {
        // Block group must have a curriculumId to fetch subjects
        setError('This block group is not linked to a curriculum. Please link a curriculum to the block group first.')
        setSubjects([])
        setSelectedSubjectId('')
        return
      }

      setSubjects(nextSubjects)
      setSelectedSubjectId((prev) => (nextSubjects.some((subject) => subject._id === prev) ? prev : ''))
      setError('')
    } catch (err) {
      setSubjects([])
      setSelectedSubjectId('')
      setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
    }
  }

  // Only the active academic term's blocks are assignable. `/api/blocks/groups`
  // intentionally returns historical groups too, so without this filter the
  // dropdown kept offering blocks from school years/semesters that a rollover
  // had already closed.
  const visibleBlockGroups = useMemo(() => {
    const schoolYear = String(activeTerm?.schoolYear || '').trim()
    const semester = activeTerm?.semester
    if (!schoolYear) return blockGroups

    const groups = blockGroups.filter((group) => {
      if (group.status === 'Archived' || group.isArchived === true) return false
      const groupYear = String(group.schoolYear || schoolYearFromStartYear(group.year) || '').trim()
      if (groupYear && groupYear !== schoolYear) return false
      if (semester && group.semester && group.semester !== semester) return false
      return true
    })

    // Keep the currently selected group listed so editing an existing
    // assignment from another term still shows what is being edited.
    const selected = blockGroups.find((group) => group._id === selectedGroupId)
    if (selected && !groups.some((group) => group._id === selected._id)) {
      groups.push(selected)
    }
    return groups
  }, [activeTerm, blockGroups, selectedGroupId])

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const selectedSubject = subjects.find((subject) => subject._id === selectedSubjectId) || null

  const selectProfessorWorkspace = (professorId: string) => {
    setSelectedProfessorId(professorId)
    setError('')
    setSuccess('')

    const existingDraft = loadDraftFromStorage(professorId)
    if (existingDraft && (existingDraft.subjectDaySelections?.length > 0 || existingDraft.selectedSubjectId)) {
      restoreDraft(existingDraft)
    } else {
      setSelectedGroupId('')
      setSelectedSectionId('')
      setSections([])
      setSubjects([])
      clearAssignmentForm(false)
    }
  }

  const selectedProfessor = professorLoads.find((professor) => professor.professorId === selectedProfessorId) || null

  useEffect(() => {
    void fetchBlockGroups()
    void fetchProfessorCourseLoads()
  }, [])

  useEffect(() => {
    let cancelled = false
    getAcademicTerm()
      .then((term) => {
        if (!cancelled && term) {
          setActiveTerm(term)
          void fetchProfessorCourseLoads(term)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (selection?.professorId) {
      selectProfessorWorkspace(selection.professorId)
    }
  }, [selection?.professorId])

  useEffect(() => {
    if (!professorLoads.length) return
    if (!selectedProfessorId || !professorLoads.some((professor) => professor.professorId === selectedProfessorId)) {
      const fallback = professorLoads.find((professor) => professor.totals.subjects > 0) || professorLoads[0]
      if (fallback) {
        selectProfessorWorkspace(fallback.professorId)
      }
    }
  }, [professorLoads, selectedProfessorId])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      setSubjects([])
      setSelectedSubjectId('')
      return
    }
    void fetchSections(selectedGroupId)
    void fetchSubjects(blockGroups.find((group) => group._id === selectedGroupId) || null)
  }, [selectedGroupId, blockGroups])

  // Live per-day time problems, recomputed as the user edits the time fields.
  const dayTimeProblems = useMemo(() => {
    const problems: Record<string, string> = {}
    for (const day of subjectDaySelections) {
      const slots = subjectDaySchedules[day] || []
      const timeRanges: { start: number; end: number; index: number }[] = []

      slots.forEach((s, idx) => {
        const slotKey = `${day}_${idx}`
        const problem = describeDayTimeProblem(s.startTime, s.startAmPm, s.endTime, s.endAmPm)
        if (problem) {
          problems[slotKey] = problem
        }

        const startMins = parseClockMinutesFlexible(`${normalizeTimeText(s.startTime)} ${s.startAmPm}`)
        const endMins = parseClockMinutesFlexible(`${normalizeTimeText(s.endTime)} ${s.endAmPm}`)
        if (startMins !== null && endMins !== null && endMins > startMins) {
          timeRanges.push({ start: startMins, end: endMins, index: idx })
        }
      })

      // Check for overlapping slots on the same day
      if (timeRanges.length > 1) {
        for (let i = 0; i < timeRanges.length; i++) {
          for (let j = i + 1; j < timeRanges.length; j++) {
            const a = timeRanges[i]
            const b = timeRanges[j]
            if (a.start < b.end && b.start < a.end) {
              problems[`${day}_${b.index}`] = `Overlaps with Slot ${a.index + 1}`
            }
          }
        }
      }
    }
    return problems
  }, [subjectDaySchedules, subjectDaySelections])

  // Live weekly scheduled contact hours vs expected contact hours
  const liveTeachingHoursSummary = useMemo(() => {
    if (!selectedSubject) return null
    const expectedHours = (selectedSubject.lecturePeriods || 0) > 0 || (selectedSubject.labPeriods || 0) > 0
      ? ((selectedSubject.lecturePeriods || 0) + (selectedSubject.labPeriods || 0))
      : (selectedSubject.units || 0)
    if (expectedHours <= 0) return null

    let totalScheduledHours = 0
    for (const day of subjectDaySelections) {
      const slots = subjectDaySchedules[day] || []
      for (const s of slots) {
        if (s) {
          const startMins = parseClockMinutesFlexible(`${normalizeTimeText(s.startTime)} ${s.startAmPm}`)
          const endMins = parseClockMinutesFlexible(`${normalizeTimeText(s.endTime)} ${s.endAmPm}`)
          if (startMins !== null && endMins !== null && endMins > startMins) {
            totalScheduledHours += (endMins - startMins) / 60
          }
        }
      }
    }
    totalScheduledHours = Math.round(totalScheduledHours * 10) / 10
    const discrepancy = Math.round((totalScheduledHours - expectedHours) * 10) / 10

    return {
      expectedHours,
      totalScheduledHours,
      discrepancy,
      hasSchedule: totalScheduledHours > 0,
      isUnderScheduled: totalScheduledHours > 0 && totalScheduledHours < expectedHours,
      isExceeded: totalScheduledHours > expectedHours,
      isMatching: totalScheduledHours > 0 && totalScheduledHours === expectedHours,
      missingHours: Math.max(0, Math.round((expectedHours - totalScheduledHours) * 10) / 10)
    }
  }, [selectedSubject, subjectDaySelections, subjectDaySchedules])

  const canAssign = !assigning
    && Boolean(selectedProfessor)
    && Boolean(selectedGroupId)
    && Boolean(selectedSectionId)
    && Boolean(selectedSubjectId)
    && subjectDaySelections.length > 0
    && subjectDaySelections.every((day) => {
      const slots = subjectDaySchedules[day] || []
      return slots.length > 0 && slots.every((s) => Boolean(s && normalizeTimeText(s.startTime) && normalizeTimeText(s.endTime) && s.room.trim()))
    })
    && Object.keys(dayTimeProblems).length === 0

  const populateAssignmentEditor = (assignment: Pick<SectionSubjectAssignment, 'subjectId' | 'schedule' | 'room'>) => {
    const parsedSchedule = parseScheduleIntoFields(assignment.schedule, assignment.room)
    setEditingAssignmentId(assignment.subjectId)
    setSelectedSubjectId(assignment.subjectId)
    setSubjectDaySelections(parsedSchedule.days)
    setSubjectDaySchedules(parsedSchedule.daySchedules)
    // Loaded schedules carry real stored times, not the example defaults, so
    // they should not be rendered dimmed.
    const touched: Record<string, boolean> = {}
    parsedSchedule.days.forEach((day) => {
      touched[day] = true
      const slots = parsedSchedule.daySchedules[day] || []
      slots.forEach((_, idx) => {
        touched[`${day}_${idx}`] = true
      })
    })
    setSubjectDayTouched(touched)
  }

  // Auto-save draft whenever user enters or changes inputs
  useEffect(() => {
    if (!selectedProfessorId) return
    if (isRestoringDraftRef.current) return

    const hasInput =
      subjectDaySelections.length > 0 ||
      Boolean(selectedSubjectId) ||
      Object.keys(subjectDaySchedules).length > 0

    if (!hasInput) return

    const draft: ProfessorLoadDraft = {
      professorId: selectedProfessorId,
      selectedGroupId,
      selectedSectionId,
      selectedSubjectId,
      editingAssignmentId,
      subjectDaySelections,
      subjectDaySchedules,
      subjectDayTouched,
      savedAt: Date.now()
    }

    const timer = window.setTimeout(() => {
      saveDraftToStorage(draft)
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    selectedProfessorId,
    selectedGroupId,
    selectedSectionId,
    selectedSubjectId,
    editingAssignmentId,
    subjectDaySelections,
    subjectDaySchedules,
    subjectDayTouched
  ])

  const handleAssignSubjectInstructor = async () => {
    const assignmentTargetId = selectedSubjectId || editingAssignmentId
    if (!selectedProfessor) return setError('Please choose a professor workspace first.')
    if (!selectedGroupId) return setError('Please select a block group first.')
    if (!assignmentTargetId) return setError('Please select a subject.')
    const orderedDays = dayOptions.filter((day) => subjectDaySelections.includes(day))
    if (orderedDays.length === 0) return setError('Please select at least one class day.')

    // Validate each selected day and its slots have valid time ranges and rooms
    for (const day of orderedDays) {
      const slots = subjectDaySchedules[day] || []
      if (slots.length === 0) {
        return setError(`Please enter a schedule for ${day}.`)
      }
      for (let idx = 0; idx < slots.length; idx++) {
        const s = slots[idx]
        const slotLabel = slots.length > 1 ? `${day} (Slot ${idx + 1})` : day
        if (!s || !normalizeTimeText(s.startTime) || !normalizeTimeText(s.endTime)) {
          return setError(`Please enter a valid start and end time for ${slotLabel} (for example 1:30).`)
        }
        if (!s.room.trim()) {
          return setError(`Please enter a room for ${slotLabel}.`)
        }
        // Keep class times inside the allowed 6:00 AM - 10:00 PM window.
        // NOTE: the AM/PM must be included in the parsed string. Passing a bare
        // 24h value ("01:00") makes parseClockMinutesFlexible guess via its
        // school-hours heuristic, which misreads 1:00 AM as 1:00 PM.
        const startMins = parseClockMinutesFlexible(`${normalizeTimeText(s.startTime)} ${s.startAmPm}`)
        const endMins = parseClockMinutesFlexible(`${normalizeTimeText(s.endTime)} ${s.endAmPm}`)
        if (startMins !== null && startMins < CLASS_WINDOW_START_MINUTES) {
          return setError(`Classes cannot start before 6:00 AM. Please adjust the ${slotLabel} start time.`)
        }
        if (endMins !== null && endMins > CLASS_WINDOW_END_MINUTES) {
          return setError(`Classes cannot end after 10:00 PM. Please adjust the ${slotLabel} end time.`)
        }
        // The end time must come after the start time on the same day.
        if (startMins !== null && endMins !== null && endMins <= startMins) {
          return setError(`The ${slotLabel} end time must be later than the start time.`)
        }
      }
    }

    const formatClock = (timeText: string, ampm: string) => `${normalizeTimeText(timeText)} ${ampm}`

    type FlattenedSlot = { day: string; slot: DayScheduleFields; formattedStart: string; formattedEnd: string }
    const allSlots: FlattenedSlot[] = []

    for (const day of orderedDays) {
      const slots = subjectDaySchedules[day] || []
      for (const s of slots) {
        const formattedStart = formatClock(s.startTime, s.startAmPm)
        const formattedEnd = formatClock(s.endTime, s.endAmPm)
        allSlots.push({ day, slot: s, formattedStart, formattedEnd })
      }
    }

    if (allSlots.length === 0) return

    const allSame = allSlots.length === 1
    let normalizedSchedule: string
    let normalizedRoom: string
    if (allSlots.length === 1) {
      // Single slot: "M 7:30 AM - 9:00 AM" with room in the separate field
      const single = allSlots[0]
      normalizedSchedule = `${single.day} ${single.formattedStart} - ${single.formattedEnd}`.trim()
      normalizedRoom = single.slot.room.trim()
    } else {
      // Multiple slots: emit one explicit segment per slot.
      normalizedSchedule = allSlots.map(({ day, slot, formattedStart, formattedEnd }) => {
        return `${day} ${formattedStart} - ${formattedEnd} @ ${slot.room.trim()}`
      }).join(' / ')
      // Use first slot's room as the primary room field for backward compat
      normalizedRoom = allSlots[0].slot.room.trim()
    }

    const payload: Record<string, string> = {
      subjectId: assignmentTargetId,
      instructor: selectedProfessor.label,
      schedule: normalizedSchedule,
      room: normalizedRoom
    }
    if (selectedGroup?.semester) payload.semester = selectedGroup.semester

    // Automatically save draft before processing assignment
    if (selectedProfessor) {
      const draft: ProfessorLoadDraft = {
        professorId: selectedProfessor.professorId,
        selectedGroupId,
        selectedSectionId,
        selectedSubjectId,
        editingAssignmentId,
        subjectDaySelections,
        subjectDaySchedules,
        subjectDayTouched,
        savedAt: Date.now()
      }
      saveDraftToStorage(draft)
    }

    // Pre-validate teaching hours before submitting
    if (selectedSubject) {
      let totalScheduledHours = 0
      for (const { slot } of allSlots) {
        const startMins = parseClockMinutesFlexible(`${normalizeTimeText(slot.startTime)} ${slot.startAmPm}`)
        const endMins = parseClockMinutesFlexible(`${normalizeTimeText(slot.endTime)} ${slot.endAmPm}`)
        if (startMins !== null && endMins !== null && endMins > startMins) {
          totalScheduledHours += (endMins - startMins) / 60
        }
      }
      totalScheduledHours = Math.round(totalScheduledHours * 10) / 10

      const expectedHours = (selectedSubject.lecturePeriods || 0) > 0 || (selectedSubject.labPeriods || 0) > 0
        ? ((selectedSubject.lecturePeriods || 0) + (selectedSubject.labPeriods || 0))
        : (selectedSubject.units || 0)

      if (totalScheduledHours > 0 && totalScheduledHours !== expectedHours && expectedHours > 0) {
        setTeachingHoursWarning({
          subjectId: selectedSubjectId,
          subjectCode: selectedSubject.code,
          subjectTitle: selectedSubject.title,
          professorName: selectedProfessor?.label || '',
          sectionCode: selectedSection?.sectionCode || '',
          blockGroupName: selectedGroup?.name || '',
          units: selectedSubject.units || 0,
          lecturePeriods: selectedSubject.lecturePeriods || 0,
          labPeriods: selectedSubject.labPeriods || 0,
          expectedContactHours: expectedHours,
          assignedContactHours: totalScheduledHours,
          discrepancy: Math.round((totalScheduledHours - expectedHours) * 10) / 10,
          schedule: normalizedSchedule,
          room: normalizedRoom
        })
        setPendingAssignmentPayload(payload)
        return
      }
    }

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const isEditing = Boolean(editingAssignmentId)
      const response = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignment`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const subjectCode = response?.data?.subjectCode || selectedSubject?.code || 'Subject'
      const roomPhrase = allSame && normalizedRoom ? ` in ${normalizedRoom}` : ''
      setSuccess(
        isEditing
          ? `${subjectCode} updated for ${selectedProfessor.label} at ${normalizedSchedule}${roomPhrase}.`
          : `${subjectCode} assigned to ${selectedProfessor?.label || 'Professor'} at ${normalizedSchedule}${roomPhrase}.`
      )
      clearAssignmentForm()
      await fetchProfessorCourseLoads()
    } catch (err) {
      if (handleAssignmentWarning(err, payload)) return
      setError(err instanceof Error ? err.message : 'Failed to assign subject instructor')
    } finally {
      setAssigning(false)
    }
  }

  const handleProceedWithOverride = async (justification: string) => {
    if (!pendingAssignmentPayload) return

    const payloadWithOverride = {
      ...pendingAssignmentPayload,
      overrideJustification: justification
    }

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const isEditing = Boolean(editingAssignmentId)
      // The backend records the override (with the authorizing user, timestamps,
      // offering, expected/actual hours, and justification) as part of this
      // request, so no separate audit call is made here.
      const response = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignment`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithOverride)
      })

      const subjectCode = response?.data?.subjectCode || selectedSubject?.code || 'Subject'
      const hasPerDayRoom = pendingAssignmentPayload.schedule.includes('@')
      const roomPhrase = !hasPerDayRoom && pendingAssignmentPayload.room ? ` in ${pendingAssignmentPayload.room}` : ''
      setSuccess(
        `${subjectCode} assigned to ${selectedProfessor?.label || 'Professor'} at ${pendingAssignmentPayload.schedule}${roomPhrase}. (Override authorized)`
      )
      setTeachingHoursWarning(null)
      setPendingAssignmentPayload(null)
      clearAssignmentForm()
      await fetchProfessorCourseLoads()
    } catch (err) {
      if (handleAssignmentWarning(err, payloadWithOverride)) return
      setError(err instanceof Error ? err.message : 'Failed to assign subject instructor with override')
    } finally {
      setAssigning(false)
    }
  }

  const handleProceedWithInstructorOverride = async () => {
    if (!pendingAssignmentPayload) return

    const payloadWithOverride = {
      ...pendingAssignmentPayload,
      overrideExistingInstructor: true
    }

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const isEditing = Boolean(editingAssignmentId)
      const response = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignment`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithOverride)
      })

      const subjectCode = response?.data?.subjectCode || selectedSubject?.code || 'Subject'
      const hasPerDayRoom = pendingAssignmentPayload.schedule.includes('@')
      const roomPhrase = !hasPerDayRoom && pendingAssignmentPayload.room ? ` in ${pendingAssignmentPayload.room}` : ''
      setSuccess(
        `${subjectCode} reassigned from ${instructorOverrideWarning?.existingInstructor} to ${selectedProfessor?.label || 'Professor'} at ${pendingAssignmentPayload.schedule}${roomPhrase}.`
      )
      setInstructorOverrideWarning(null)
      setPendingAssignmentPayload(null)
      clearAssignmentForm()
      await fetchProfessorCourseLoads()
    } catch (err) {
      if (handleAssignmentWarning(err, payloadWithOverride)) return
      setError(err instanceof Error ? err.message : 'Failed to reassign subject instructor')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="registrar-section registrar-course-management-page registrar-course-workspace-page">
      {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}
      {success && <p className="registrar-feedback registrar-feedback-success">{success}</p>}

      <section className="registrar-course-workspace-simple">
        <aside className="registrar-professor-workspace-sidebar" aria-label="Professor assignment navigation">
          <div className="registrar-professor-workspace-sidebar-head">
            <p className="registrar-course-card-label">Professors</p>
            <span>{professorLoads.length}</span>
          </div>
          <div className="registrar-professor-workspace-sidebar-list">
            {professorLoads.map((professor) => (
              <div key={professor.professorId} className="registrar-professor-workspace-item">
                <button
                  type="button"
                  className={`registrar-professor-workspace-link${professor.professorId === selectedProfessorId ? ' is-active' : ''}`}
                  onClick={() => selectProfessorWorkspace(professor.professorId)}
                >
                  <strong>{professor.label}</strong>
                  <span>{professor.totals.subjects} courses / {professor.totals.sections} sections</span>
                </button>
                <div className="registrar-professor-workspace-actions">
                  <button
                    type="button"
                    className="registrar-btn registrar-btn-secondary registrar-professor-action-btn"
                    onClick={() => setViewingSubjectsProfessorId(viewingSubjectsProfessorId === professor.professorId ? '' : professor.professorId)}
                  >
                    {viewingSubjectsProfessorId === professor.professorId ? 'Hide Courses' : 'View Courses'}
                  </button>
                  <button
                    type="button"
                    className="registrar-btn registrar-btn-secondary registrar-professor-action-btn"
                    onClick={() => selectProfessorWorkspace(professor.professorId)}
                  >
                    Manage
                  </button>
                </div>
                {viewingSubjectsProfessorId === professor.professorId && (
                  <div className="registrar-professor-subjects-list">
                    {professor.assignments.length > 0 ? (
                      professor.assignments.map((assignment) => (
                        <div key={`${assignment.sectionId}-${assignment.subjectId}`} className="registrar-professor-subject-item">
                          <div className="registrar-professor-subject-header">
                            <strong>{assignment.subjectCode}</strong>
                            <span className="registrar-professor-subject-course">{assignment.courseShortLabel}</span>
                          </div>
                          <span className="registrar-professor-subject-title">{assignment.subjectTitle}</span>
                          <div className="registrar-professor-subject-details">
                            <span>{assignment.sectionLabel}</span>
                            <span>{formatScheduleDisplay(assignment.schedule)}</span>
                            <span>{assignment.room}</span>
                          </div>
                          <button
                            type="button"
                            className="registrar-btn registrar-btn-secondary registrar-professor-subject-edit-btn"
                            onClick={() => {
                              selectProfessorWorkspace(professor.professorId)
                              if (assignment.blockGroupId) setSelectedGroupId(assignment.blockGroupId)
                              if (assignment.sectionId) setSelectedSectionId(assignment.sectionId)
                              populateAssignmentEditor({
                                subjectId: assignment.subjectId,
                                schedule: assignment.schedule,
                                room: assignment.room
                              })
                            }}
                          >
                            <PencilLine size={12} />
                            Edit
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="registrar-professor-subjects-empty">No courses assigned yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="assignment-section registrar-course-workspace-card">
          <header className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">{editingAssignmentId ? 'Edit Professor Assignment' : 'Assign Professor'}</p>
              <h3>{editingAssignmentId ? 'Edit assigned class load' : 'Assign professor to a class'}</h3>
            </div>
            {selectedProfessor && <span className="registrar-course-card-pill">{selectedProfessor.label}</span>}
          </header>

          <p className="registrar-course-helper-copy">
            Choose the block, section, course, schedule, and room.
          </p>
          {editingAssignmentId && (
            <p className="registrar-course-autopick-note">
              Existing assignment pre-selected. Edit the details below or cancel edit to assign another class.
            </p>
          )}

          <div className="assignment-form">
            <label className="registrar-course-workspace-static-field">
              Active Professor
              <input type="text" value={selectedProfessor?.label || 'Choose a professor above'} readOnly />
            </label>

            <label>
              Block Group
              <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} disabled={!selectedProfessor}>
                <option value="">Select block group</option>
                {visibleBlockGroups.map((group) => (
                  <option key={group._id} value={group._id}>
                    {formatBlockLabel(group.name)} ({group.semester} | {group.schoolYear || formatAcademicYear(group.year)})
                    {!group.curriculumId && ' - No Curriculum'}
                  </option>
                ))}
              </select>
              {selectedGroupId && !selectedGroup?.curriculumId && (
                <p className="registrar-course-helper-copy" style={{ color: '#d32f2f', marginTop: '4px' }}>
                  This block group is not linked to a curriculum. Please link a curriculum first to assign courses.
                </p>
              )}
            </label>

            <label>
              Section
              <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} disabled={!selectedGroupId}>
                <option value="">Select section</option>
                {sections.map((section) => (
                  <option key={section._id} value={section._id}>
                    {section.sectionCode} ({section.currentPopulation}/{section.capacity})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course
              <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGroupId || !selectedGroup?.curriculumId}>
                <option value="">Select course</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.code} - {subject.title} {subject.units ? `(${subject.units} units)` : ''}
                  </option>
                ))}
              </select>
              {!selectedGroup?.curriculumId && selectedGroupId && (
                <p className="registrar-course-helper-copy" style={{ color: '#d32f2f', marginTop: '4px' }}>
                  This block group is not linked to a curriculum. Please link a curriculum first.
                </p>
              )}
            </label>

            <div className="registrar-course-days-field">
              <span>Class Days</span>
              <div className="day-checkbox-group">
                {dayOptions.map((dayCode) => (
                  <label key={dayCode} className="day-checkbox-item">
                    <input
                      type="checkbox"
                      checked={subjectDaySelections.includes(dayCode)}
                      onChange={() => setSubjectDaySelections((prev) => {
                        if (prev.includes(dayCode)) {
                          const next = prev.filter((day) => day !== dayCode)
                          setSubjectDaySchedules((curr) => {
                            const copy = { ...curr }
                            delete copy[dayCode]
                            return copy
                          })
                          setSubjectDayTouched((curr) => {
                            const copy = { ...curr }
                            delete copy[dayCode]
                            Object.keys(copy).forEach((k) => {
                              if (k.startsWith(`${dayCode}_`)) delete copy[k]
                            })
                            return copy
                          })
                          return next
                        }
                        // When adding a new day, default its time+room from the first existing day's first slot
                        const existingDays = prev.length > 0 ? prev : []
                        const refSchedule = existingDays.length > 0 && subjectDaySchedules[existingDays[0]]?.[0]
                          ? subjectDaySchedules[existingDays[0]][0]
                          : null
                        setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: [refSchedule ? { ...refSchedule } : { ...DEFAULT_DAY_SCHEDULE }]
                        }))
                        // A copied day holds real times; a fresh default day keeps
                        // its dimmed "example" look until the user edits it.
                        setSubjectDayTouched((curr) => (
                          refSchedule ? { ...curr, [`${dayCode}_0`]: true, [dayCode]: true } : curr
                        ))
                        return [...prev, dayCode]
                      })}
                      disabled={!selectedSectionId || !selectedSubjectId}
                    />
                    <span>{dayCode}</span>
                  </label>
                ))}
              </div>
            </div>

            {subjectDaySelections.length > 0 && (
              <div className="registrar-course-per-day-times">
                <span>Time & Room per Day <small style={{ fontWeight: 400, opacity: 0.7 }}>(allowed 6:00 AM – 10:00 PM)</small></span>
                {dayOptions.filter((day) => subjectDaySelections.includes(day)).map((dayCode) => {
                  const daySlots = subjectDaySchedules[dayCode] || [DEFAULT_DAY_SCHEDULE]
                  return (
                    <div key={dayCode} className="per-day-time-row">
                      <div className="per-day-header">
                        <span className="per-day-time-label">{dayCode}</span>
                        <button
                          type="button"
                          className="btn-add-day-slot"
                          onClick={() => addDaySlot(dayCode)}
                          title={`Add another time slot for ${dayCode}`}
                          disabled={!selectedSectionId || !selectedSubjectId}
                        >
                          <Plus size={13} />
                          <span>Add Slot</span>
                        </button>
                      </div>

                      <div className="per-day-slots-list">
                        {daySlots.map((daySchedule, slotIndex) => {
                          const slotKey = `${dayCode}_${slotIndex}`
                          const startParts = splitTimeParts(daySchedule.startTime)
                          const endParts = splitTimeParts(daySchedule.endTime)
                          // Untouched rows still show the defaults (6:00 AM - 10:00 AM);
                          // dim them so users read them as editable example values.
                          const dimmed = !subjectDayTouched[slotKey] && !subjectDayTouched[dayCode]

                          return (
                            <div key={slotKey} className="per-day-slot-item">
                              {daySlots.length > 1 && (
                                <div className="per-day-slot-header">
                                  <span className="per-day-slot-number">Slot {slotIndex + 1}</span>
                                  <button
                                    type="button"
                                    className="btn-remove-day-slot"
                                    onClick={() => removeDaySlot(dayCode, slotIndex)}
                                    title="Remove this time slot"
                                    aria-label={`Remove ${dayCode} slot ${slotIndex + 1}`}
                                    disabled={!selectedSectionId || !selectedSubjectId}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                              <div className="per-day-fields">
                                <div className="time-box-group">
                                  <div
                                    className={`time-box-input-group${dimmed ? ' time-box-dimmed' : ''}`}
                                    onBlur={(e) => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                        normalizeDayTime(dayCode, slotIndex, 'startTime')
                                      }
                                    }}
                                  >
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="time-box-input time-box-hour"
                                      value={startParts.hour}
                                      onChange={(e) => updateDayTimePart(dayCode, slotIndex, 'startTime', 'hour', e.target.value, e.currentTarget)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      placeholder="8"
                                      maxLength={2}
                                      aria-label={`${dayCode} slot ${slotIndex + 1} start hour`}
                                      disabled={!selectedSectionId || !selectedSubjectId}
                                    />
                                    <span className="time-box-colon" aria-hidden="true">:</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="time-box-input time-box-minute"
                                      value={startParts.minute}
                                      onChange={(e) => updateDayTimePart(dayCode, slotIndex, 'startTime', 'minute', e.target.value)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      placeholder="00"
                                      maxLength={2}
                                      aria-label={`${dayCode} slot ${slotIndex + 1} start minute`}
                                      disabled={!selectedSectionId || !selectedSubjectId}
                                    />
                                  </div>
                                  <select
                                    className={`time-box-select${dimmed ? ' time-box-dimmed' : ''}`}
                                    value={daySchedule.startAmPm}
                                    onChange={(e) => updateDayAmPm(dayCode, slotIndex, 'startAmPm', e.target.value as 'AM' | 'PM')}
                                    aria-label={`${dayCode} slot ${slotIndex + 1} start AM or PM`}
                                    disabled={!selectedSectionId || !selectedSubjectId}
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                  <span className="time-box-separator">to</span>
                                  <div
                                    className={`time-box-input-group${dimmed ? ' time-box-dimmed' : ''}`}
                                    onBlur={(e) => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                        normalizeDayTime(dayCode, slotIndex, 'endTime')
                                      }
                                    }}
                                  >
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="time-box-input time-box-hour"
                                      value={endParts.hour}
                                      onChange={(e) => updateDayTimePart(dayCode, slotIndex, 'endTime', 'hour', e.target.value, e.currentTarget)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      placeholder="9"
                                      maxLength={2}
                                      aria-label={`${dayCode} slot ${slotIndex + 1} end hour`}
                                      disabled={!selectedSectionId || !selectedSubjectId}
                                    />
                                    <span className="time-box-colon" aria-hidden="true">:</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="time-box-input time-box-minute"
                                      value={endParts.minute}
                                      onChange={(e) => updateDayTimePart(dayCode, slotIndex, 'endTime', 'minute', e.target.value)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      placeholder="00"
                                      maxLength={2}
                                      aria-label={`${dayCode} slot ${slotIndex + 1} end minute`}
                                      disabled={!selectedSectionId || !selectedSubjectId}
                                    />
                                  </div>
                                  <select
                                    className={`time-box-select${dimmed ? ' time-box-dimmed' : ''}`}
                                    value={daySchedule.endAmPm}
                                    onChange={(e) => updateDayAmPm(dayCode, slotIndex, 'endAmPm', e.target.value as 'AM' | 'PM')}
                                    aria-label={`${dayCode} slot ${slotIndex + 1} end AM or PM`}
                                    disabled={!selectedSectionId || !selectedSubjectId}
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                                <input
                                  type="text"
                                  className="per-day-room-input"
                                  value={daySchedule.room}
                                  onChange={(e) => updateDayRoom(dayCode, slotIndex, e.target.value)}
                                  placeholder="Room"
                                  disabled={!selectedSectionId || !selectedSubjectId}
                                />
                                {dayTimeProblems[slotKey] && (
                                  <span className="per-day-time-error" role="alert">{dayTimeProblems[slotKey]}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {liveTeachingHoursSummary?.hasSchedule && (
              <div
                className={`teaching-hours-live-notice ${
                  liveTeachingHoursSummary.isUnderScheduled
                    ? 'teaching-hours-live-notice--warn'
                    : liveTeachingHoursSummary.isExceeded
                    ? 'teaching-hours-live-notice--danger'
                    : 'teaching-hours-live-notice--ok'
                }`}
                role="status"
              >
                <AlertTriangle size={15} />
                <span>
                  {liveTeachingHoursSummary.isUnderScheduled && (
                    <>
                      <strong>Missing {liveTeachingHoursSummary.missingHours.toFixed(1)} hour(s):</strong> Scheduled {liveTeachingHoursSummary.totalScheduledHours.toFixed(1)} of {liveTeachingHoursSummary.expectedHours.toFixed(1)} expected weekly hours ({selectedSubject?.units || 0} unit{selectedSubject?.units === 1 ? '' : 's'}). The professor still needs to occupy {liveTeachingHoursSummary.missingHours.toFixed(1)} more hour(s).
                    </>
                  )}
                  {liveTeachingHoursSummary.isExceeded && (
                    <>
                      <strong>Exceeds by {liveTeachingHoursSummary.discrepancy.toFixed(1)} hour(s):</strong> Scheduled {liveTeachingHoursSummary.totalScheduledHours.toFixed(1)} of {liveTeachingHoursSummary.expectedHours.toFixed(1)} expected weekly hours.
                    </>
                  )}
                  {liveTeachingHoursSummary.isMatching && (
                    <>
                      <strong>Hours matched:</strong> Exactly {liveTeachingHoursSummary.totalScheduledHours.toFixed(1)} of {liveTeachingHoursSummary.expectedHours.toFixed(1)} weekly contact hours scheduled.
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="registrar-course-workspace-footer">
            <div className="registrar-course-workspace-meta">
              <article><span>Selected block group</span><strong>{selectedGroup ? formatBlockLabel(selectedGroup.name) : 'Not selected'}</strong></article>
              <article><span>Selected section</span><strong>{selectedSection ? selectedSection.sectionCode : 'Not selected'}</strong></article>
              <article><span>Term</span><strong>{selectedGroup ? `${selectedGroup.semester} Semester, SY ${selectedGroup.schoolYear || formatAcademicYear(selectedGroup.year)}` : 'Select a block group'}</strong></article>
              {selectedSubject && <article><span>Units</span><strong>{selectedSubject.units || 0}</strong></article>}
            </div>
            <div className="registrar-course-footer-actions">
              {editingAssignmentId && (
                <button
                  type="button"
                  className="registrar-btn registrar-btn-secondary"
                  onClick={() => clearAssignmentForm(true)}
                  disabled={assigning}
                >
                  Cancel edit
                </button>
              )}
              <button className="registrar-btn" onClick={() => void handleAssignSubjectInstructor()} disabled={!canAssign}>
                {assigning ? 'Saving...' : editingAssignmentId ? 'Save changes' : 'Assign professor'}
              </button>
            </div>
          </div>
        </section>


      </section>

      <TeachingHoursWarningModal
        warningData={teachingHoursWarning}
        onClose={() => {
          setTeachingHoursWarning(null)
          setPendingAssignmentPayload(null)
        }}
        onCancel={() => {
          setTeachingHoursWarning(null)
          setPendingAssignmentPayload(null)
        }}
        onProceedWithOverride={handleProceedWithOverride}
        isSubmitting={assigning}
      />

      <InstructorOverrideModal
        warningData={instructorOverrideWarning}
        onClose={() => {
          setInstructorOverrideWarning(null)
          setPendingAssignmentPayload(null)
        }}
        onProceedWithOverride={handleProceedWithInstructorOverride}
        isSubmitting={assigning}
      />
    </div>
  )
}
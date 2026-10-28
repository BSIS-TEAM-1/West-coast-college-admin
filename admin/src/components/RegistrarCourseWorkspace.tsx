import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, PencilLine } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import { formatBlockLabel } from '../lib/blockAssignmentShared'
import { formatScheduleDisplay, timeTo24h, parseClockMinutesFlexible } from '../lib/scheduleFormatter'
import TeachingHoursWarningModal from './TeachingHoursWarningModal'
import InstructorOverrideModal from './InstructorOverrideModal'
import './ProfessorLoad.css'
import './RegistrarCourseWorkspace.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year?: number | string; schoolYear?: string; curriculumId?: string; yearLevel?: number; courseId?: number; courseCode?: string }
type BlockSection = { _id: string; sectionCode: string; capacity: number; currentPopulation: number }
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
  startTime: '1:00',
  startAmPm: 'AM',
  endTime: '1:00',
  endAmPm: 'AM',
  room: ''
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

type Props = {
  selection: { professorId: string } | null
  onBack: () => void
}

export default function RegistrarCourseWorkspace({ selection, onBack }: Props) {
  const refreshSignalTimerRef = useRef<number | null>(null)
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectDaySchedules, setSubjectDaySchedules] = useState<Record<string, DayScheduleFields>>({})
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [selectedProfessorId, setSelectedProfessorId] = useState('')
  const [courseLoadLoading, setCourseLoadLoading] = useState(false)
  const [showRefreshSignal, setShowRefreshSignal] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [autoPickedAssignmentKey, setAutoPickedAssignmentKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewingSubjectsProfessorId, setViewingSubjectsProfessorId] = useState('')
  const [teachingHoursWarning, setTeachingHoursWarning] = useState<any>(null)
  const [pendingAssignmentPayload, setPendingAssignmentPayload] = useState<any>(null)
  const [instructorOverrideWarning, setInstructorOverrideWarning] = useState<any>(null)

  const dayOptions = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU']

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
    if (apiError?.warning === 'teaching_hours_exceeded' && apiError.data) {
      setInstructorOverrideWarning(null)
      setTeachingHoursWarning(apiError.data)
      setPendingAssignmentPayload(payload)
      return true
    }
    return false
  }

  const triggerRefreshSignal = () => {
    if (typeof window === 'undefined') return
    if (refreshSignalTimerRef.current) {
      window.clearTimeout(refreshSignalTimerRef.current)
    }
    setShowRefreshSignal(false)
    window.requestAnimationFrame(() => {
      setShowRefreshSignal(true)
      refreshSignalTimerRef.current = window.setTimeout(() => {
        setShowRefreshSignal(false)
        refreshSignalTimerRef.current = null
      }, 1450)
    })
  }

  const formatAcademicYear = (value?: number | string) => {
    const text = String(value || '').trim()
    // If it's already a school year string (e.g., "2026-2027"), return it as-is
    if (/^\d{4}-\d{4}$/.test(text)) return text
    // If it's a numeric year, convert to school year format
    const year = Number(value)
    return Number.isFinite(year) && year > 0 ? `${year}-${year + 1}` : 'N/A'
  }

  const clearAssignmentForm = () => {
    setEditingAssignmentId('')
    setSelectedSubjectId('')
    setSubjectDaySelections([])
    setSubjectDaySchedules({})
  }

  const convertTo24Hour = (hour: string, minute: string, ampm: string) => {
    let h = Number.parseInt(hour, 10)
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${minute}`
  }

  const to24Hour = (timeText: string, ampm: string) => {
    const normalized = normalizeTimeText(timeText)
    if (!normalized) return null
    const [hour, minute] = normalized.split(':')
    return convertTo24Hour(hour, minute, ampm)
  }

  const updateDayTimePart = (
    dayCode: string,
    field: 'startTime' | 'endTime',
    part: 'hour' | 'minute',
    rawValue: string,
    sourceInput?: HTMLInputElement
  ) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, 2)
    setSubjectDaySchedules((curr) => {
      const current = curr[dayCode] || DEFAULT_DAY_SCHEDULE
      const parts = splitTimeParts(current[field])
      return {
        ...curr,
        [dayCode]: {
          ...current,
          [field]: `${part === 'hour' ? digits : parts.hour}:${part === 'minute' ? digits : parts.minute}`
        }
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

  const normalizeDayTime = (dayCode: string, field: 'startTime' | 'endTime') => {
    setSubjectDaySchedules((curr) => {
      const current = curr[dayCode]
      if (!current) return curr
      const parts = splitTimeParts(current[field])
      if (!parts.hour && !parts.minute) {
        return { ...curr, [dayCode]: { ...current, [field]: ':' } }
      }
      const normalized = normalizeTimeText(`${parts.hour}:${parts.minute || '00'}`)
      return normalized
        ? { ...curr, [dayCode]: { ...current, [field]: normalized } }
        : curr
    })
  }

  const parseScheduleIntoFields = (schedule: string, room?: string) => {
    const trimmed = String(schedule || '').trim()
    const fallbackRoom = String(room || '').trim() === 'TBA' ? '' : String(room || '').trim()
    if (!trimmed || /^TBA$/i.test(trimmed)) {
      return { days: [] as string[], daySchedules: {} as Record<string, DayScheduleFields> }
    }

    const tokenOrder = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']

    const parse24To12 = (time24: string) => {
      const match = time24.match(/^(\d{1,2}):(\d{2})$/)
      if (!match) return { time: '1:00', ampm: 'AM' as const }
      let h = Number.parseInt(match[1], 10)
      const m = match[2]
      const ampm = h >= 12 ? 'PM' as const : 'AM' as const
      if (h > 12) h -= 12
      if (h === 0) h = 12
      return { time: `${h}:${m}`, ampm }
    }

    const buildFields = (
      start: { time: string; ampm: 'AM' | 'PM' },
      end: { time: string; ampm: 'AM' | 'PM' },
      roomValue: string
    ): DayScheduleFields => ({
      startTime: start.time,
      startAmPm: start.ampm,
      endTime: end.time,
      endAmPm: end.ampm,
      room: roomValue
    })

    // Per-day format: "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
    if (trimmed.includes('/')) {
      const segments = trimmed.split('/').map(s => s.trim()).filter(Boolean)
      const daySchedules: Record<string, DayScheduleFields> = {}
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
          days.push(token)
          daySchedules[token] = buildFields(start, end, segmentRoom)
          cursor = cursor.slice(token.length)
        }
      }

      return { days: dayOptions.filter((day) => days.includes(day)), daySchedules }
    }

    // Classic format: "MW 07:30-09:00"
    const separatorIndex = trimmed.indexOf(' ')
    if (separatorIndex < 0) {
      return { days: [] as string[], daySchedules: {} as Record<string, DayScheduleFields> }
    }
    const daysRaw = trimmed.slice(0, separatorIndex).toUpperCase()
    const timeRaw = trimmed.slice(separatorIndex + 1).trim()
    const timeMatch = timeRaw.match(/^(.+?)\s*-\s*(.+)$/)
    const days: string[] = []
    let cursor = daysRaw

    while (cursor.length > 0) {
      const token = tokenOrder.find((value) => cursor.startsWith(value))
      if (!token) break
      days.push(token)
      cursor = cursor.slice(token.length)
    }

    const start = timeMatch ? parse24To12(timeTo24h(timeMatch[1].trim())) : { time: '1:00', ampm: 'AM' as const }
    const end = timeMatch ? parse24To12(timeTo24h(timeMatch[2].trim())) : { time: '1:00', ampm: 'AM' as const }
    const daySchedules: Record<string, DayScheduleFields> = {}
    days.forEach((day) => { daySchedules[day] = buildFields(start, end, fallbackRoom) })

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

  const fetchProfessorCourseLoads = async () => {
    setCourseLoadLoading(true)
    try {
      const data = await authorizedFetch('/api/registrar/professor-course-loads')
      const payload = (data?.data || {}) as LoadsPayload
      setProfessorLoads(Array.isArray(payload.professors) ? payload.professors : [])
      setError('')
    } catch (err) {
      setProfessorLoads([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor course loads')
    } finally {
      setCourseLoadLoading(false)
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      const nextSections = Array.isArray(data) ? data as BlockSection[] : []
      setSections(nextSections)
      // Auto-select the first section
      if (nextSections.length > 0) {
        setSelectedSectionId(nextSections[0]._id)
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

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const selectedSubject = subjects.find((subject) => subject._id === selectedSubjectId) || null

  const selectProfessorWorkspace = (professorId: string) => {
    setSelectedProfessorId(professorId)
    setSelectedGroupId('')
    setSelectedSectionId('')
    setSections([])
    setSubjects([])
    clearAssignmentForm()
    setAutoPickedAssignmentKey('')
    setError('')
    setSuccess('')
  }

  const selectedProfessor = professorLoads.find((professor) => professor.professorId === selectedProfessorId) || null

  useEffect(() => {
    void fetchBlockGroups()
    void fetchProfessorCourseLoads()
  }, [])

  useEffect(() => () => {
    if (refreshSignalTimerRef.current) {
      window.clearTimeout(refreshSignalTimerRef.current)
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
        setSelectedProfessorId(fallback.professorId)
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

  const canAssign = !assigning
    && Boolean(selectedProfessor)
    && Boolean(selectedGroupId)
    && Boolean(selectedSectionId)
    && Boolean(selectedSubjectId)
    && subjectDaySelections.length > 0
    && subjectDaySelections.every((day) => {
      const s = subjectDaySchedules[day]
      return Boolean(s && normalizeTimeText(s.startTime) && normalizeTimeText(s.endTime) && s.room.trim())
    })

  const populateAssignmentEditor = (assignment: Pick<SectionSubjectAssignment, 'subjectId' | 'schedule' | 'room'>) => {
    const parsedSchedule = parseScheduleIntoFields(assignment.schedule, assignment.room)
    setEditingAssignmentId(assignment.subjectId)
    setSelectedSubjectId(assignment.subjectId)
    setSubjectDaySelections(parsedSchedule.days)
    setSubjectDaySchedules(parsedSchedule.daySchedules) 
  }

  useEffect(() => {
    if (editingAssignmentId || selectedSubjectId || selectedGroupId || selectedSectionId) return
    const assignment = selectedProfessor?.assignments[0]
    if (!assignment) return

    const assignmentKey = `${selectedProfessor?.professorId || ''}|${assignment.sectionId}|${assignment.subjectId}`
    if (autoPickedAssignmentKey === assignmentKey) return

    setAutoPickedAssignmentKey(assignmentKey)
    if (assignment.blockGroupId) {
      setSelectedGroupId(assignment.blockGroupId)
    }
    if (assignment.sectionId) {
      setSelectedSectionId(assignment.sectionId)
    }
    populateAssignmentEditor({
      subjectId: assignment.subjectId,
      schedule: assignment.schedule,
      room: assignment.room
    })
  }, [
    autoPickedAssignmentKey,
    editingAssignmentId,
    selectedGroupId,
    selectedSectionId,
    selectedProfessor?.professorId,
    selectedProfessor?.assignments,
    selectedSubjectId
  ])

  const handleAssignSubjectInstructor = async () => {
    const assignmentTargetId = selectedSubjectId || editingAssignmentId
    if (!selectedProfessor) return setError('Please choose a professor workspace first.')
    if (!selectedGroupId) return setError('Please select a block group first.')
    if (!assignmentTargetId) return setError('Please select a subject.')
    const orderedDays = dayOptions.filter((day) => subjectDaySelections.includes(day))
    if (orderedDays.length === 0) return setError('Please select at least one class day.')

    // Validate each selected day has a valid time range and room
    for (const day of orderedDays) {
      const s = subjectDaySchedules[day]
      if (!s || !normalizeTimeText(s.startTime) || !normalizeTimeText(s.endTime)) {
        return setError(`Please enter a valid start and end time for ${day} (for example 1:30).`)
      }
      if (!s.room.trim()) {
        return setError(`Please enter a room for ${day}.`)
      }
    }

    const timeKey = (s: DayScheduleFields) =>
      `${normalizeTimeText(s.startTime)} ${s.startAmPm}|${normalizeTimeText(s.endTime)} ${s.endAmPm}`
    const formatClock = (timeText: string, ampm: string) => `${normalizeTimeText(timeText)} ${ampm}`

    // Check if all days share the same time AND room
    const ref = subjectDaySchedules[orderedDays[0]]
    const allSame = orderedDays.every((day) => {
      const s = subjectDaySchedules[day]
      return s && timeKey(s) === timeKey(ref) && s.room.trim() === ref.room.trim()
    })

    let normalizedSchedule: string
    let normalizedRoom: string
    if (orderedDays.length === 1) {
      // Single day: "M 7:30 AM - 9:00 AM" with room in the separate field
      const formattedStart = formatClock(ref.startTime, ref.startAmPm)
      const formattedEnd = formatClock(ref.endTime, ref.endAmPm)
      normalizedSchedule = `${orderedDays.join('')} ${formattedStart} - ${formattedEnd}`.trim()
      normalizedRoom = ref.room.trim()
    } else {
      // Multiple days: emit one explicit segment per day. A compact day token
      // like "MTH" is easy to misread (and rendered as a single entry in some
      // screens), so every selected day is spelled out here.
      normalizedSchedule = orderedDays.map((day) => {
        const s = subjectDaySchedules[day]
        const formattedStart = formatClock(s.startTime, s.startAmPm)
        const formattedEnd = formatClock(s.endTime, s.endAmPm)
        return `${day} ${formattedStart} - ${formattedEnd} @ ${s.room.trim()}`
      }).join(' / ')
      // Use first day's room as the primary room field for backward compat
      normalizedRoom = ref.room.trim()
    }

    const payload: Record<string, string> = {
      subjectId: assignmentTargetId,
      instructor: selectedProfessor.label,
      schedule: normalizedSchedule,
      room: normalizedRoom
    }
    if (selectedGroup?.semester) payload.semester = selectedGroup.semester

    // Pre-validate teaching hours before submitting
    if (selectedSubject) {
      let totalScheduledHours = 0
      for (const day of orderedDays) {
        const s = subjectDaySchedules[day]
        if (s) {
          const start24 = to24Hour(s.startTime, s.startAmPm)
          const end24 = to24Hour(s.endTime, s.endAmPm)
          const startMins = start24 ? parseClockMinutesFlexible(start24) : null
          const endMins = end24 ? parseClockMinutesFlexible(end24) : null
          if (startMins !== null && endMins !== null && endMins > startMins) {
            totalScheduledHours += (endMins - startMins) / 60
          }
        }
      }
      totalScheduledHours = Math.round(totalScheduledHours * 10) / 10

      const expectedHours = (selectedSubject.lecturePeriods || 0) > 0 || (selectedSubject.labPeriods || 0) > 0
        ? ((selectedSubject.lecturePeriods || 0) + (selectedSubject.labPeriods || 0))
        : (selectedSubject.units || 0)

      if (totalScheduledHours > expectedHours && expectedHours > 0) {
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

  const handleRefreshWorkspace = async () => {
    triggerRefreshSignal()
    await fetchProfessorCourseLoads()
  }

  return (
    <div className="registrar-section registrar-course-management-page registrar-course-workspace-page">
      <section className="registrar-course-hero registrar-course-workspace-page-hero">
        <div className="registrar-course-hero-copy">
          <span className="registrar-course-eyebrow">Professor Loads / Workspace</span>
          <h2 className="registrar-section-title">Professor Load Workspace</h2>
          <p className="registrar-section-desc">
            Manage the selected professor's class assignments from one focused page.
          </p>
        </div>
        <div className="registrar-course-hero-actions">
          <button className="registrar-btn registrar-btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to Professor Loads
          </button>
          <button className="registrar-btn registrar-btn-secondary" onClick={() => void handleRefreshWorkspace()} disabled={courseLoadLoading}>
            {courseLoadLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

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
                {blockGroups.map((group) => (
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
                          return next
                        }
                        // When adding a new day, default its time+room from the first existing day
                        const existingDays = prev.length > 0 ? prev : []
                        const refSchedule = existingDays.length > 0 ? subjectDaySchedules[existingDays[0]] : null
                        setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: refSchedule ? { ...refSchedule } : { ...DEFAULT_DAY_SCHEDULE }
                        }))
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
                <span>Time & Room per Day</span>
                {dayOptions.filter((day) => subjectDaySelections.includes(day)).map((dayCode) => {
              const daySchedule = subjectDaySchedules[dayCode] || DEFAULT_DAY_SCHEDULE
              const startParts = splitTimeParts(daySchedule.startTime)
              const endParts = splitTimeParts(daySchedule.endTime)
              return (
                <div key={dayCode} className="per-day-time-row">
                  <span className="per-day-time-label">{dayCode}</span>
                  <div className="per-day-fields">
                    <div className="time-box-group">
                      <div
                        className="time-box-input-group"
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            normalizeDayTime(dayCode, 'startTime')
                          }
                        }}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          className="time-box-input time-box-hour"
                          value={startParts.hour}
                          onChange={(e) => updateDayTimePart(dayCode, 'startTime', 'hour', e.target.value, e.currentTarget)}
                          onFocus={(e) => e.currentTarget.select()}
                          placeholder="8"
                          maxLength={2}
                          aria-label={`${dayCode} start hour`}
                          disabled={!selectedSectionId || !selectedSubjectId}
                        />
                        <span className="time-box-colon" aria-hidden="true">:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="time-box-input time-box-minute"
                          value={startParts.minute}
                          onChange={(e) => updateDayTimePart(dayCode, 'startTime', 'minute', e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          placeholder="00"
                          maxLength={2}
                          aria-label={`${dayCode} start minute`}
                          disabled={!selectedSectionId || !selectedSubjectId}
                        />
                      </div>
                      <select
                        className="time-box-select"
                        value={daySchedule.startAmPm}
                        onChange={(e) => setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: { ...curr[dayCode], startAmPm: e.target.value as 'AM' | 'PM' }
                        }))}
                        aria-label={`${dayCode} start AM or PM`}
                        disabled={!selectedSectionId || !selectedSubjectId}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                      <span className="time-box-separator">to</span>
                      <div
                        className="time-box-input-group"
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            normalizeDayTime(dayCode, 'endTime')
                          }
                        }}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          className="time-box-input time-box-hour"
                          value={endParts.hour}
                          onChange={(e) => updateDayTimePart(dayCode, 'endTime', 'hour', e.target.value, e.currentTarget)}
                          onFocus={(e) => e.currentTarget.select()}
                          placeholder="9"
                          maxLength={2}
                          aria-label={`${dayCode} end hour`}
                          disabled={!selectedSectionId || !selectedSubjectId}
                        />
                        <span className="time-box-colon" aria-hidden="true">:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="time-box-input time-box-minute"
                          value={endParts.minute}
                          onChange={(e) => updateDayTimePart(dayCode, 'endTime', 'minute', e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          placeholder="00"
                          maxLength={2}
                          aria-label={`${dayCode} end minute`}
                          disabled={!selectedSectionId || !selectedSubjectId}
                        />
                      </div>
                      <select
                        className="time-box-select"
                        value={daySchedule.endAmPm}
                        onChange={(e) => setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: { ...curr[dayCode], endAmPm: e.target.value as 'AM' | 'PM' }
                        }))}
                        aria-label={`${dayCode} end AM or PM`}
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
                      onChange={(e) => setSubjectDaySchedules((curr) => ({
                        ...curr,
                        [dayCode]: { ...curr[dayCode], room: e.target.value }
                      }))}
                      placeholder="Room"
                      disabled={!selectedSectionId || !selectedSubjectId}
                    />
                  </div>
                </div>
              )
            })}
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
                <button className="registrar-btn registrar-btn-secondary" onClick={clearAssignmentForm} disabled={assigning}>
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

      <div
        className={`registrar-refresh-signal${showRefreshSignal ? ' is-visible' : ''}`}
        aria-hidden={!showRefreshSignal}
      >
        <span className="registrar-refresh-signal-label">Refreshing workspace</span>
      </div>

      <TeachingHoursWarningModal
        warningData={teachingHoursWarning}
        onClose={() => {
          setTeachingHoursWarning(null)
          setPendingAssignmentPayload(null)
        }}
        onCancel={() => {
          setTeachingHoursWarning(null)
          setPendingAssignmentPayload(null)
          clearAssignmentForm()
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
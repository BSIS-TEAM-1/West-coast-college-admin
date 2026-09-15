import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, PencilLine } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import { formatBlockColumnLabel, formatBlockLabel, parseBlockSlot } from '../lib/blockAssignmentShared'
import './ProfessorLoad.css'
import './RegistrarCourseWorkspace.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year: number; curriculumId?: string }
type BlockSection = { _id: string; sectionCode: string; capacity: number; currentPopulation: number }
type SectionStudent = { _id: string; studentNumber: string; firstName: string; lastName: string; studentStatus?: string }
type SubjectItem = { _id: string; code: string; title: string }

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

export type RegistrarCourseWorkspaceSelection = {
  professorId: string
  courseLabel?: string
}

type Props = {
  selection: RegistrarCourseWorkspaceSelection | null
  onBack: () => void
}

export default function RegistrarCourseWorkspace({ selection, onBack }: Props) {
  const refreshSignalTimerRef = useRef<number | null>(null)
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectDaySchedules, setSubjectDaySchedules] = useState<Record<string, { start: string; end: string; room: string }>>({})
  const [subjectRoom, setSubjectRoom] = useState('')
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [selectedProfessorId, setSelectedProfessorId] = useState('')
  const [selectedProfessorCourseLabel, setSelectedProfessorCourseLabel] = useState('')
  const [courseLoadLoading, setCourseLoadLoading] = useState(false)
  const [showRefreshSignal, setShowRefreshSignal] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [autoPickedAssignmentKey, setAutoPickedAssignmentKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
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

  const formatAcademicYear = (value: number | string) => {
    const year = Number(value)
    return Number.isFinite(year) && year > 0 ? `${year}-${year + 1}` : 'N/A'
  }

  const clearAssignmentForm = () => {
    setEditingAssignmentId('')
    setSelectedSubjectId('')
    setSubjectDaySelections([])
    setSubjectDaySchedules({})
    setSubjectRoom('')
  }

  const parseScheduleIntoFields = (schedule: string, room?: string) => {
    const trimmed = String(schedule || '').trim()
    const fallbackRoom = String(room || '').trim() === 'TBA' ? '' : String(room || '').trim()
    if (!trimmed || /^TBA$/i.test(trimmed)) {
      return { days: [] as string[], daySchedules: {} as Record<string, { start: string; end: string; room: string }> }
    }

    const tokenOrder = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']

    // Per-day format: "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
    if (trimmed.includes('/')) {
      const segments = trimmed.split('/').map(s => s.trim()).filter(Boolean)
      const daySchedules: Record<string, { start: string; end: string; room: string }> = {}
      const days: string[] = []

      for (const segment of segments) {
        // Extract optional @ room suffix
        const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/)
        const segmentBody = roomMatch ? roomMatch[1].trim() : segment
        const segmentRoom = roomMatch ? roomMatch[2].trim() : fallbackRoom

        const match = segmentBody.match(/^([A-Z]+)\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/i)
        if (!match) continue
        const daysRaw = match[1].toUpperCase()
        const start = match[2]
        const end = match[3]

        let cursor = daysRaw
        while (cursor.length > 0) {
          const token = tokenOrder.find((value) => cursor.startsWith(value))
          if (!token) break
          days.push(token)
          daySchedules[token] = { start, end, room: segmentRoom }
          cursor = cursor.slice(token.length)
        }
      }

      return { days: dayOptions.filter((day) => days.includes(day)), daySchedules }
    }

    // Classic format: "MW 07:30-09:00"
    const separatorIndex = trimmed.indexOf(' ')
    if (separatorIndex < 0) {
      return { days: [] as string[], daySchedules: {} as Record<string, { start: string; end: string; room: string }> }
    }
    const daysRaw = trimmed.slice(0, separatorIndex).toUpperCase()
    const timeRaw = trimmed.slice(separatorIndex + 1).trim()
    const timeMatch = timeRaw.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/)
    const days: string[] = []
    let cursor = daysRaw

    while (cursor.length > 0) {
      const token = tokenOrder.find((value) => cursor.startsWith(value))
      if (!token) break
      days.push(token)
      cursor = cursor.slice(token.length)
    }

    const start = timeMatch?.[1] || ''
    const end = timeMatch?.[2] || ''
    const daySchedules: Record<string, { start: string; end: string; room: string }> = {}
    days.forEach((day) => { daySchedules[day] = { start, end, room: fallbackRoom } })

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
      if (!nextSections.some((section) => section._id === selectedSectionId)) {
        setSelectedSectionId('')
        setSectionStudents([])
      }
      setError('')
    } catch (err) {
      setSections([])
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  const fetchSubjects = async (group: BlockGroup | null) => {
    try {
      let nextSubjects: SubjectItem[] = []

      if (group?.curriculumId) {
        // Fetch subjects from the curriculum linked to this block group
        const params = new URLSearchParams()
        const meta = extractGroupMeta(group.name)
        if (meta.yearLevel) params.set('yearLevel', String(meta.yearLevel))
        if (group.semester) params.set('semester', group.semester)
        const query = params.toString()
        const data = await authorizedFetch(`/api/registrar/curriculums/${group.curriculumId}/subjects${query ? `?${query}` : ''}`)
        const curriculumSubjects = Array.isArray(data?.data) ? data.data as any[] : []
        nextSubjects = curriculumSubjects
          .filter((cs) => cs.subjectId && typeof cs.subjectId === 'object')
          .map((cs) => ({
            _id: String(cs.subjectId._id),
            code: String(cs.subjectId.code || ''),
            title: String(cs.subjectId.title || '')
          }))
      } else {
        // Fallback: fetch from global subject list filtered by course/year/semester
        const params = new URLSearchParams()
        if (group) {
          const meta = extractGroupMeta(group.name)
          if (meta.course) params.set('course', String(meta.course))
          if (meta.yearLevel) params.set('yearLevel', String(meta.yearLevel))
          if (group.semester) params.set('semester', group.semester)
        }
        const query = params.toString()
        const data = await authorizedFetch(`/api/registrar/subjects${query ? `?${query}` : ''}`)
        nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
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

  const fetchSectionStudents = async (sectionId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students`)
      setSectionStudents(Array.isArray(data?.students) ? data.students as SectionStudent[] : [])
      setError('')
    } catch (err) {
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch section students')
    }
  }

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const selectedSubject = subjects.find((subject) => subject._id === selectedSubjectId) || null
  const sortedSections = [...sections].sort((a, b) => {
    const slotA = parseBlockSlot(a.sectionCode) || { yearLevel: 99, letter: 'Z' }
    const slotB = parseBlockSlot(b.sectionCode) || { yearLevel: 99, letter: 'Z' }
    return slotA.yearLevel !== slotB.yearLevel
      ? slotA.yearLevel - slotB.yearLevel
      : slotA.letter.localeCompare(slotB.letter)
  })

  const selectProfessorWorkspace = (professorId: string, nextCourseLabel = '') => {
    setSelectedProfessorId(professorId)
    setSelectedProfessorCourseLabel(nextCourseLabel)
    setSelectedGroupId('')
    setSelectedSectionId('')
    setSections([])
    setSectionStudents([])
    setSubjects([])
    clearAssignmentForm()
    setAutoPickedAssignmentKey('')
    setError('')
    setSuccess('')
  }

  const selectedProfessor = professorLoads.find((professor) => professor.professorId === selectedProfessorId) || null
  const selectedProfessorCourseLabels = selectedProfessor
    ? selectedProfessor.courseSummaries.map((course) => course.label).join('|')
    : ''

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
      selectProfessorWorkspace(selection.professorId, selection.courseLabel || '')
    }
  }, [selection?.professorId, selection?.courseLabel])

  useEffect(() => {
    if (!professorLoads.length) return
    if (!selectedProfessorId || !professorLoads.some((professor) => professor.professorId === selectedProfessorId)) {
      const fallback = professorLoads.find((professor) => professor.totals.subjects > 0) || professorLoads[0]
      if (fallback) {
        setSelectedProfessorId(fallback.professorId)
        setSelectedProfessorCourseLabel(selection?.courseLabel || fallback.courseSummaries[0]?.label || '')
      }
    }
  }, [professorLoads, selectedProfessorId, selection?.courseLabel])

  useEffect(() => {
    if (!selectedProfessor || selectedProfessor.courseSummaries.length === 0) {
      setSelectedProfessorCourseLabel('')
      return
    }
    if (!selectedProfessor.courseSummaries.some((course) => course.label === selectedProfessorCourseLabel)) {
      setSelectedProfessorCourseLabel(selectedProfessor.courseSummaries[0].label)
    }
  }, [selectedProfessor?.professorId, selectedProfessorCourseLabels, selectedProfessorCourseLabel])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      setSectionStudents([])
      setSubjects([])
      setSelectedSubjectId('')
      return
    }
    void fetchSections(selectedGroupId)
    void fetchSubjects(blockGroups.find((group) => group._id === selectedGroupId) || null)
  }, [selectedGroupId, blockGroups])

  useEffect(() => {
    if (!selectedSectionId) {
      setSectionStudents([])
      if (!editingAssignmentId) {
        setSelectedSubjectId('')
      }
      return
    }
    void fetchSectionStudents(selectedSectionId)
  }, [selectedSectionId])

  const selectedProfessorCourse = selectedProfessor?.courseSummaries.find((course) => course.label === selectedProfessorCourseLabel)
    || selectedProfessor?.courseSummaries[0]
    || null

  const selectedProfessorCourseAssignments = selectedProfessor
    ? selectedProfessor.assignments.filter((assignment) => (
      selectedProfessorCourse ? assignment.courseShortLabel === selectedProfessorCourse.label : true
    ))
    : []

  const canAssign = !assigning
    && Boolean(selectedProfessor)
    && Boolean(selectedSectionId)
    && Boolean(selectedSubjectId)
    && subjectDaySelections.length > 0
    && subjectDaySelections.every((day) => {
      const s = subjectDaySchedules[day]
      return s && s.start && s.end && s.room.trim()
    })

  const populateAssignmentEditor = (assignment: Pick<SectionSubjectAssignment, 'subjectId' | 'schedule' | 'room'>) => {
    const parsedSchedule = parseScheduleIntoFields(assignment.schedule, assignment.room)
    setEditingAssignmentId(assignment.subjectId)
    setSelectedSubjectId(assignment.subjectId)
    setSubjectDaySelections(parsedSchedule.days)
    setSubjectDaySchedules(parsedSchedule.daySchedules)
    setSubjectRoom(assignment.room === 'TBA' ? '' : assignment.room)
  }

  useEffect(() => {
    if (editingAssignmentId || selectedSubjectId || selectedGroupId || selectedSectionId) return
    const assignment = selectedProfessorCourseAssignments[0]
    if (!assignment) return

    const assignmentKey = `${selectedProfessor?.professorId || ''}|${selectedProfessorCourse?.label || ''}|${assignment.sectionId}|${assignment.subjectId}`
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
    selectedProfessor?.professorId,
    selectedProfessorCourse?.label,
    selectedProfessorCourseAssignments,
    selectedSectionId,
    selectedSubjectId
  ])

  const handleAssignSubjectInstructor = async () => {
    const assignmentTargetId = selectedSubjectId || editingAssignmentId
    if (!selectedProfessor) return setError('Please choose a professor workspace first.')
    if (!selectedSectionId) return setError('Please select a section first.')
    if (!assignmentTargetId) return setError('Please select a subject.')
    const orderedDays = dayOptions.filter((day) => subjectDaySelections.includes(day))
    if (orderedDays.length === 0) return setError('Please select at least one class day.')

    // Validate each selected day has a time range and room
    for (const day of orderedDays) {
      const s = subjectDaySchedules[day]
      if (!s || !s.start || !s.end) {
        return setError(`Please set a start and end time for ${day}.`)
      }
      if (!s.room.trim()) {
        return setError(`Please enter a room for ${day}.`)
      }
    }

    // Check if all days share the same time AND room
    const ref = subjectDaySchedules[orderedDays[0]]
    const allSame = orderedDays.every((day) => {
      const s = subjectDaySchedules[day]
      return s && s.start === ref.start && s.end === ref.end && s.room.trim() === ref.room.trim()
    })

    let normalizedSchedule: string
    let normalizedRoom: string
    if (allSame) {
      // Compact: "MW 07:30-09:00" with room in separate field
      normalizedSchedule = `${orderedDays.join('')} ${ref.start}-${ref.end}`.trim()
      normalizedRoom = ref.room.trim()
    } else {
      // Per-day: "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
      normalizedSchedule = orderedDays.map((day) => {
        const s = subjectDaySchedules[day]
        return `${day} ${s.start}-${s.end} @ ${s.room.trim()}`
      }).join(' / ')
      // Use first day's room as the primary room field for backward compat
      normalizedRoom = ref.room.trim()
    }

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const payload: Record<string, string> = {
        subjectId: assignmentTargetId,
        instructor: selectedProfessor.label,
        schedule: normalizedSchedule,
        room: normalizedRoom
      }
      if (selectedGroup?.semester) payload.semester = selectedGroup.semester
      const isEditing = Boolean(editingAssignmentId)
      const response = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignment`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const subjectCode = response?.data?.subjectCode || selectedSubject?.code || 'Subject'
      setSuccess(
        isEditing
          ? `${subjectCode} updated for ${selectedProfessor.label} at ${normalizedSchedule} in ${normalizedRoom}.`
          : `${subjectCode} assigned to ${selectedProfessor.label} at ${normalizedSchedule} in ${normalizedRoom}.`
      )
      clearAssignmentForm()
      await fetchProfessorCourseLoads()
      await fetchSectionStudents(selectedSectionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign subject instructor')
    } finally {
      setAssigning(false)
    }
  }

  const removeSectionAssignment = async ({
    sectionId,
    subjectId,
    subjectCode,
    sectionLabel,
    professorLabel
  }: {
    sectionId: string
    subjectId: string
    subjectCode: string
    sectionLabel: string
    professorLabel?: string
  }) => {
    if (!sectionId || !subjectId) return
    const subjectOwner = professorLabel || 'the assigned professor'
    const confirmed = window.confirm(`Remove ${subjectCode} from ${subjectOwner} in ${sectionLabel}?`)
    if (!confirmed) return

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/registrar/sections/${sectionId}/subject-assignment/${subjectId}`, {
        method: 'DELETE'
      })
      if (editingAssignmentId === subjectId) {
        clearAssignmentForm()
      }
      setSuccess(`${subjectCode} removed from ${subjectOwner} in ${sectionLabel}.`)
      await fetchProfessorCourseLoads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove assignment')
    } finally {
      setAssigning(false)
    }
  }

  const handleEditProfessorCourseAssignment = (assignment: ProfessorCourseAssignment) => {
    if (assignment.courseShortLabel) {
      setSelectedProfessorCourseLabel(assignment.courseShortLabel)
    }
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
  }

  const handleDeleteProfessorCourseAssignment = async (assignment: ProfessorCourseAssignment) => {
    await removeSectionAssignment({
      sectionId: assignment.sectionId,
      subjectId: assignment.subjectId,
      subjectCode: assignment.subjectCode,
      sectionLabel: assignment.sectionLabel || 'the selected block',
      professorLabel: selectedProfessor?.label
    })
  }

  const handleRefreshWorkspace = async () => {
    triggerRefreshSignal()
    await fetchProfessorCourseLoads()
  }

  const selectedCourseSectionCount = new Set(selectedProfessorCourseAssignments.map((assignment) => assignment.sectionId)).size

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
              <button
                key={professor.professorId}
                type="button"
                className={`registrar-professor-workspace-link${professor.professorId === selectedProfessorId ? ' is-active' : ''}`}
                onClick={() => selectProfessorWorkspace(professor.professorId, professor.courseSummaries[0]?.label || '')}
              >
                <strong>{professor.label}</strong>
                <span>{professor.totals.subjects} subjects / {professor.totals.sections} sections</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="registrar-course-detail-card registrar-course-workspace-controls">
          <div className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">Active Load</p>
              <h3>{selectedProfessor?.label || 'Choose a professor'}</h3>
            </div>
            <span className="registrar-course-card-pill">
              {selectedProfessor ? `${selectedProfessor.totals.subjects} subjects` : 'No load'}
            </span>
          </div>

          <p className="registrar-course-helper-copy">
            Change the professor or course when you need to work on another load.
          </p>

          <div className="registrar-course-workspace-control-grid">
            <label>
              Professor
              <select value={selectedProfessorId} onChange={(e) => selectProfessorWorkspace(e.target.value)}>
                <option value="">Select professor</option>
                {professorLoads.map((professor) => (
                  <option key={professor.professorId} value={professor.professorId}>
                    {professor.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course Focus
              <select
                value={selectedProfessorCourseLabel}
                onChange={(e) => setSelectedProfessorCourseLabel(e.target.value)}
                disabled={!selectedProfessor || selectedProfessor.courseSummaries.length === 0}
              >
                <option value="">{selectedProfessor?.courseSummaries.length ? 'Select course' : 'No course load yet'}</option>
                {selectedProfessor?.courseSummaries.map((course) => (
                  <option key={`${selectedProfessor.professorId}-${course.label}`} value={course.label}>
                    {course.fullLabel || course.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProfessor && (
            <div className="registrar-course-detail-summary">
              <div><span>Courses</span><strong>{selectedProfessor.totals.courses}</strong></div>
              <div><span>Sections</span><strong>{selectedProfessor.totals.sections}</strong></div>
              <div><span>Subjects</span><strong>{selectedProfessor.totals.subjects}</strong></div>
              <div><span>Students</span><strong>{selectedProfessor.totals.students}</strong></div>
            </div>
          )}
        </article>

        <section className="assignment-section registrar-course-workspace-card">
          <header className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">{editingAssignmentId ? 'Edit Professor Assignment' : 'Assign Professor'}</p>
              <h3>{editingAssignmentId ? 'Edit assigned class load' : 'Assign professor to a class'}</h3>
            </div>
            {selectedProfessor && <span className="registrar-course-card-pill">{selectedProfessor.label}</span>}
          </header>

          <p className="registrar-course-helper-copy">
            Choose the block, section, subject, schedule, and room.
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
                    {formatBlockLabel(group.name)} ({group.semester} | {formatAcademicYear(group.year)})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Section
              <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} disabled={!selectedGroupId}>
                <option value="">Select section</option>
                {sortedSections.map((section) => (
                  <option key={section._id} value={section._id}>
                    Block-{formatBlockColumnLabel(section.sectionCode).replace('-', '')} ({section.currentPopulation}/{section.capacity})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Subject
              <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGroupId}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.code} - {subject.title}
                  </option>
                ))}
              </select>
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
                          [dayCode]: refSchedule ? { ...refSchedule } : { start: '', end: '', room: '' }
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
              const daySchedule = subjectDaySchedules[dayCode] || { start: '', end: '', room: '' }
              return (
                <div key={dayCode} className="per-day-time-row">
                  <span className="per-day-time-label">{dayCode}</span>
                  <div className="per-day-fields">
                    <div className="time-box-group">
                      <input
                        type="time"
                        className="time-box-input"
                        value={daySchedule.start}
                        onChange={(e) => setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: { ...curr[dayCode], start: e.target.value }
                        }))}
                        disabled={!selectedSectionId || !selectedSubjectId}
                      />
                      <span className="time-box-separator">to</span>
                      <input
                        type="time"
                        className="time-box-input"
                        value={daySchedule.end}
                        onChange={(e) => setSubjectDaySchedules((curr) => ({
                          ...curr,
                          [dayCode]: { ...curr[dayCode], end: e.target.value }
                        }))}
                        disabled={!selectedSectionId || !selectedSubjectId}
                      />
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
              <article><span>Course focus</span><strong>{selectedProfessorCourse?.label || 'Any course'}</strong></article>
              <article><span>Selected section</span><strong>{selectedSection ? `Block-${formatBlockColumnLabel(selectedSection.sectionCode).replace('-', '')}` : 'Not selected'}</strong></article>
              <article><span>Students in section</span><strong>{selectedSection ? `${sectionStudents.length} students` : 'Select a section'}</strong></article>
            </div>
            <div className="registrar-course-footer-actions">
              {!editingAssignmentId && selectedProfessorCourseAssignments.length > 0 && (
                <button
                  type="button"
                  className="registrar-btn registrar-btn-secondary"
                  onClick={() => handleEditProfessorCourseAssignment(selectedProfessorCourseAssignments[0])}
                  disabled={assigning}
                >
                  <PencilLine size={15} />
                  Edit assignment
                </button>
              )}
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

          <section className="registrar-course-detail-card registrar-course-workspace-assignments">
            <header className="registrar-course-card-header">
              <div>
                <p className="registrar-course-card-label">Existing Assignments</p>
                <h3>{selectedProfessorCourse?.fullLabel || selectedProfessorCourse?.label || 'Select a course'}</h3>
              </div>
              {selectedProfessorCourse && <span className="registrar-course-card-pill">{selectedProfessorCourseAssignments.length} scheduled classes</span>}
            </header>

            {selectedProfessorCourseAssignments.length > 0 ? (
              <div className="registrar-course-subject-table" role="table" aria-label="Selected professor course assignments">
                <div className="registrar-course-subject-head">
                  <span>Subject</span>
                  <span>Block</span>
                  <span>Schedule</span>
                  <span>Room</span>
                  <span>Actions</span>
                </div>
                <div className="registrar-course-subject-body">
                  {selectedProfessorCourseAssignments.map((assignment) => {
                    return (
                    <div key={`${assignment.sectionId}-${assignment.subjectId}`} className="registrar-course-subject-row" role="row">
                      <div className="registrar-course-subject-main" data-label="Subject">
                        <strong>{assignment.subjectCode}</strong>
                        <span>{assignment.subjectTitle}</span>
                      </div>
                      <span data-label="Block">{assignment.sectionLabel}</span>
                      <span data-label="Schedule">{assignment.schedule}</span>
                      <span data-label="Room">{assignment.room}</span>
                      <div data-label="Actions" className="registrar-course-subject-actions">
                        <button className="registrar-btn registrar-btn-secondary" onClick={() => handleEditProfessorCourseAssignment(assignment)} disabled={assigning}>
                          Edit
                        </button>
                        <button className="registrar-btn registrar-course-danger-btn" onClick={() => void handleDeleteProfessorCourseAssignment(assignment)} disabled={assigning}>
                          Unassign
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="registrar-course-empty-state registrar-course-empty-state-compact">
                <div>
                  <h3>No assignments yet</h3>
                  <p>{selectedProfessor ? 'Use the form above to create the first class assignment.' : 'Choose a professor to start working.'}</p>
                </div>
              </div>
            )}

            {selectedProfessorCourse && (
              <div className="registrar-course-focus-metrics">
                <span><strong>{selectedCourseSectionCount}</strong> sections</span>
                <span><strong>{selectedProfessorCourse.studentCount}</strong> students</span>
                <span><strong>{selectedProfessorCourse.subjectCount}</strong> subjects</span>
              </div>
            )}
          </section>
      </section>

      <div
        className={`registrar-refresh-signal${showRefreshSignal ? ' is-visible' : ''}`}
        aria-hidden={!showRefreshSignal}
      >
        <span className="registrar-refresh-signal-label">Refreshing workspace</span>
      </div>
    </div>
  )
}

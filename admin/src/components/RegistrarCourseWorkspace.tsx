import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, PencilLine } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import { formatBlockLabel } from '../lib/blockAssignmentShared'
import './ProfessorLoad.css'
import './RegistrarCourseWorkspace.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year?: number | string; schoolYear?: string; curriculumId?: string; yearLevel?: number; courseId?: number; courseCode?: string }
type BlockSection = { _id: string; sectionCode: string; capacity: number; currentPopulation: number }
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
  const [subjectDaySchedules, setSubjectDaySchedules] = useState<Record<string, { start: string; end: string; room: string }>>({})
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
            title: String(cs.subjectId.title || '')
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
      return s && s.start && s.end && s.room.trim()
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign subject instructor')
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
                  <span>{professor.totals.subjects} subjects / {professor.totals.sections} sections</span>
                </button>
                <div className="registrar-professor-workspace-actions">
                  <button
                    type="button"
                    className="registrar-btn registrar-btn-secondary registrar-professor-action-btn"
                    onClick={() => setViewingSubjectsProfessorId(viewingSubjectsProfessorId === professor.professorId ? '' : professor.professorId)}
                  >
                    {viewingSubjectsProfessorId === professor.professorId ? 'Hide Subjects' : 'View Subjects'}
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
                            <span>{assignment.schedule}</span>
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
                      <p className="registrar-professor-subjects-empty">No subjects assigned yet</p>
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
                    {formatBlockLabel(group.name)} ({group.semester} | {group.schoolYear || formatAcademicYear(group.year)})
                    {!group.curriculumId && ' - No Curriculum'}
                  </option>
                ))}
              </select>
              {selectedGroupId && !selectedGroup?.curriculumId && (
                <p className="registrar-course-helper-copy" style={{ color: '#d32f2f', marginTop: '4px' }}>
                  This block group is not linked to a curriculum. Please link a curriculum first to assign subjects.
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
              Subject
              <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGroupId || !selectedGroup?.curriculumId}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.code} - {subject.title}
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
              <article><span>Selected block group</span><strong>{selectedGroup ? formatBlockLabel(selectedGroup.name) : 'Not selected'}</strong></article>
              <article><span>Selected section</span><strong>{selectedSection ? selectedSection.sectionCode : 'Not selected'}</strong></article>
              <article><span>Term</span><strong>{selectedGroup ? `${selectedGroup.semester} Semester, SY ${selectedGroup.schoolYear || formatAcademicYear(selectedGroup.year)}` : 'Select a block group'}</strong></article>
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
    </div>
  )
}
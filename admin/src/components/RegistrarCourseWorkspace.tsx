import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Users } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import './RegistrarCourseManagement.css'
import './RegistrarCourseWorkspace.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year: number }
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
  const [sectionStudentsLoading, setSectionStudentsLoading] = useState(false)
  const [sectionAssignments, setSectionAssignments] = useState<SectionSubjectAssignment[]>([])
  const [sectionAssignmentsLoading, setSectionAssignmentsLoading] = useState(false)
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectTimeStart, setSubjectTimeStart] = useState('')
  const [subjectTimeEnd, setSubjectTimeEnd] = useState('')
  const [subjectRoom, setSubjectRoom] = useState('')
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [selectedProfessorId, setSelectedProfessorId] = useState('')
  const [selectedProfessorCourseLabel, setSelectedProfessorCourseLabel] = useState('')
  const [courseLoadLoading, setCourseLoadLoading] = useState(false)
  const [showRefreshSignal, setShowRefreshSignal] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }
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

  const formatBlockGroupLabel = (value: string) => {
    const parts = String(value || '').trim().split('-')
    if (parts.length < 2) return value || 'N/A'
    return `${courseAbbreviationByCode[parts[0]] || parts[0]}-${parts.slice(1).join('-')}`
  }

  const formatAcademicYear = (value: number | string) => {
    const year = Number(value)
    return Number.isFinite(year) && year > 0 ? `${year}-${year + 1}` : 'N/A'
  }

  const parseSectionSlot = (sectionCode: string) => {
    const match = String(sectionCode || '').toUpperCase().match(/(\d+)-?([A-Z])$/)
    return match ? { yearLevel: Number(match[1]) || 99, blockLetter: match[2] } : { yearLevel: 99, blockLetter: 'Z' }
  }

  const formatSectionShortLabel = (sectionCode: string) => {
    const slot = parseSectionSlot(sectionCode)
    return slot.yearLevel === 99 ? sectionCode : `${slot.yearLevel}-${slot.blockLetter}`
  }

  const clearAssignmentForm = () => {
    setEditingAssignmentId('')
    setSelectedSubjectId('')
    setSubjectDaySelections([])
    setSubjectTimeStart('')
    setSubjectTimeEnd('')
    setSubjectRoom('')
  }

  const parseScheduleIntoFields = (schedule: string) => {
    const trimmed = String(schedule || '').trim()
    if (!trimmed || /^TBA$/i.test(trimmed)) {
      return { days: [] as string[], start: '', end: '' }
    }
    const separatorIndex = trimmed.indexOf(' ')
    if (separatorIndex < 0) {
      return { days: [] as string[], start: '', end: '' }
    }
    const daysRaw = trimmed.slice(0, separatorIndex).toUpperCase()
    const timeRaw = trimmed.slice(separatorIndex + 1).trim()
    const timeMatch = timeRaw.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/)
    const tokenOrder = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']
    const days: string[] = []
    let cursor = daysRaw

    while (cursor.length > 0) {
      const token = tokenOrder.find((value) => cursor.startsWith(value))
      if (!token) break
      days.push(token)
      cursor = cursor.slice(token.length)
    }

    return {
      days: dayOptions.filter((day) => days.includes(day)),
      start: timeMatch?.[1] || '',
      end: timeMatch?.[2] || ''
    }
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
      const params = new URLSearchParams()
      if (group) {
        const meta = extractGroupMeta(group.name)
        if (meta.course) params.set('course', String(meta.course))
        if (meta.yearLevel) params.set('yearLevel', String(meta.yearLevel))
        if (group.semester) params.set('semester', group.semester)
      }
      const query = params.toString()
      const data = await authorizedFetch(`/api/registrar/subjects${query ? `?${query}` : ''}`)
      const nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
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
    setSectionStudentsLoading(true)
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students`)
      setSectionStudents(Array.isArray(data?.students) ? data.students as SectionStudent[] : [])
      setError('')
    } catch (err) {
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch section students')
    } finally {
      setSectionStudentsLoading(false)
    }
  }

  const fetchSectionAssignments = async (sectionId: string) => {
    setSectionAssignmentsLoading(true)
    try {
      const data = await authorizedFetch(`/api/registrar/sections/${sectionId}/subject-assignments`)
      const nextAssignments = Array.isArray(data?.data?.assignments) ? data.data.assignments as SectionSubjectAssignment[] : []
      setSectionAssignments(nextAssignments)
      setError('')
    } catch (err) {
      setSectionAssignments([])
      setError(err instanceof Error ? err.message : 'Failed to fetch section assignments')
    } finally {
      setSectionAssignmentsLoading(false)
    }
  }

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const selectedSubject = subjects.find((subject) => subject._id === selectedSubjectId) || null
  const sortedSections = [...sections].sort((a, b) => {
    const slotA = parseSectionSlot(a.sectionCode)
    const slotB = parseSectionSlot(b.sectionCode)
    return slotA.yearLevel !== slotB.yearLevel
      ? slotA.yearLevel - slotB.yearLevel
      : slotA.blockLetter.localeCompare(slotB.blockLetter)
  })

  const selectProfessorWorkspace = (professorId: string, nextCourseLabel = '') => {
    setSelectedProfessorId(professorId)
    setSelectedProfessorCourseLabel(nextCourseLabel)
    setSelectedGroupId('')
    setSelectedSectionId('')
    setSections([])
    setSectionStudents([])
    setSectionAssignments([])
    setSubjects([])
    clearAssignmentForm()
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
      setSectionAssignments([])
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
      setSectionAssignments([])
      if (!editingAssignmentId) {
        setSelectedSubjectId('')
      }
      return
    }
    void fetchSectionStudents(selectedSectionId)
    void fetchSectionAssignments(selectedSectionId)
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
    && Boolean(subjectTimeStart)
    && Boolean(subjectTimeEnd)
    && Boolean(subjectRoom.trim())

  const populateAssignmentEditor = (assignment: Pick<SectionSubjectAssignment, 'subjectId' | 'schedule' | 'room'>) => {
    const parsedSchedule = parseScheduleIntoFields(assignment.schedule)
    setEditingAssignmentId(assignment.subjectId)
    setSelectedSubjectId(assignment.subjectId)
    setSubjectDaySelections(parsedSchedule.days)
    setSubjectTimeStart(parsedSchedule.start)
    setSubjectTimeEnd(parsedSchedule.end)
    setSubjectRoom(assignment.room === 'TBA' ? '' : assignment.room)
  }

  const handleAssignSubjectInstructor = async () => {
    const assignmentTargetId = editingAssignmentId || selectedSubjectId
    if (!selectedProfessor) return setError('Please choose a professor workspace first.')
    if (!selectedSectionId) return setError('Please select a section first.')
    if (!assignmentTargetId) return setError('Please select a subject.')
    const normalizedDays = dayOptions.filter((day) => subjectDaySelections.includes(day)).join('')
    const normalizedSchedule = `${normalizedDays} ${subjectTimeStart}-${subjectTimeEnd}`.trim()
    const normalizedRoom = subjectRoom.trim()
    if (!normalizedDays) return setError('Please select at least one class day.')
    if (!subjectTimeStart || !subjectTimeEnd) return setError('Please select a start and end time.')
    if (!normalizedRoom) return setError('Please enter a room.')

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
      await fetchSectionAssignments(selectedSectionId)
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
      if (selectedSectionId === sectionId) {
        await fetchSectionAssignments(sectionId)
      }
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

  const handleDeleteSectionAssignment = async (assignment: SectionSubjectAssignment) => {
    if (!selectedSectionId) return
    await removeSectionAssignment({
      sectionId: selectedSectionId,
      subjectId: assignment.subjectId,
      subjectCode: assignment.subjectCode,
      sectionLabel: selectedSection ? `Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}` : 'the selected block',
      professorLabel: assignment.instructor
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
            Use one dedicated page to create, update, and delete professor class assignments without mixing the full directory view into the form.
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

      <section className="registrar-course-workspace-overview">
        <article className="registrar-course-detail-card registrar-course-workspace-overview-card">
          <div className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">Active Professor</p>
              <h3>{selectedProfessor?.label || 'Choose a professor'}</h3>
            </div>
            <span className="registrar-course-card-pill">
              {selectedProfessor ? `${selectedProfessor.totals.subjects} subjects` : 'No load'}
            </span>
          </div>

          <p className="registrar-course-helper-copy">
            The workspace stays focused on one professor. Change the professor here if you need to continue the CRUD flow for another faculty load.
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

        <article className="registrar-course-detail-card registrar-course-workspace-overview-card">
          <div className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">Course Focus</p>
              <h3>{selectedProfessorCourse?.fullLabel || selectedProfessorCourse?.label || 'Choose a course'}</h3>
            </div>
            {selectedProfessorCourse && <span className="registrar-course-card-pill">{selectedProfessorCourse.subjectCount} subjects</span>}
          </div>

          <p className="registrar-course-helper-copy">
            Keep the CRUD view tight by selecting one course at a time before choosing the block and section you want to edit.
          </p>

          {selectedProfessor?.courseSummaries.length ? (
            <div className="registrar-course-selector" role="tablist" aria-label="Workspace course selector">
              {selectedProfessor.courseSummaries.map((course) => (
                <button
                  key={`${selectedProfessor.professorId}-${course.label}`}
                  type="button"
                  role="tab"
                  aria-selected={selectedProfessorCourse?.label === course.label}
                  className={`registrar-course-selector-card${selectedProfessorCourse?.label === course.label ? ' registrar-course-selector-card-active' : ''}`}
                  onClick={() => setSelectedProfessorCourseLabel(course.label)}
                >
                  <strong>{course.label}</strong>
                  <span>{course.fullLabel || course.label}</span>
                  <small>{course.subjectCount} subjects | {course.sections} sections | {course.studentCount} students</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="registrar-course-empty-state registrar-course-empty-state-compact">
              <BookOpen size={20} />
              <div>
                <h3>No course load yet</h3>
                <p>This professor can still receive a new assignment through the form below.</p>
              </div>
            </div>
          )}
        </article>
      </section>

      <div className="registrar-course-workspace-page-grid">
        <section className="assignment-section registrar-course-workspace-card">
          <header className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">{editingAssignmentId ? 'Update Assignment' : 'Create Assignment'}</p>
              <h3>{editingAssignmentId ? 'Update professor assignment for this block' : 'Create a new class assignment in this workspace'}</h3>
            </div>
            {selectedProfessor && <span className="registrar-course-card-pill">{selectedProfessor.label}</span>}
          </header>

          <p className="registrar-course-helper-copy">
            Select the block group, section, and subject, then save the schedule under the active professor workspace.
          </p>

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
                    {formatBlockGroupLabel(group.name)} ({group.semester} | {formatAcademicYear(group.year)})
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
                    Block-{formatSectionShortLabel(section.sectionCode).replace('-', '')} ({section.currentPopulation}/{section.capacity})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Subject
              <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGroupId || Boolean(editingAssignmentId)}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.code} - {subject.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="registrar-course-days-field">
              Class Days
              <div className="day-checkbox-group">
                {dayOptions.map((dayCode) => (
                  <label key={dayCode} className="day-checkbox-item">
                    <input
                      type="checkbox"
                      checked={subjectDaySelections.includes(dayCode)}
                      onChange={() => setSubjectDaySelections((prev) => prev.includes(dayCode) ? prev.filter((day) => day !== dayCode) : [...prev, dayCode])}
                      disabled={!selectedSectionId || !selectedSubjectId}
                    />
                    <span>{dayCode}</span>
                  </label>
                ))}
              </div>
            </label>

            <label>
              Time
              <div className="time-box-group">
                <input type="time" className="time-box-input" value={subjectTimeStart} onChange={(e) => setSubjectTimeStart(e.target.value)} disabled={!selectedSectionId || !selectedSubjectId} />
                <span className="time-box-separator">to</span>
                <input type="time" className="time-box-input" value={subjectTimeEnd} onChange={(e) => setSubjectTimeEnd(e.target.value)} disabled={!selectedSectionId || !selectedSubjectId} />
              </div>
            </label>

            <label>
              Room
              <input type="text" value={subjectRoom} onChange={(e) => setSubjectRoom(e.target.value)} placeholder="e.g. Room 204" disabled={!selectedSectionId || !selectedSubjectId} />
            </label>
          </div>

          <div className="registrar-course-workspace-footer">
            <div className="registrar-course-workspace-meta">
              <article><span>Course focus</span><strong>{selectedProfessorCourse?.label || 'Any course'}</strong></article>
              <article><span>Selected section</span><strong>{selectedSection ? `Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}` : 'Not selected'}</strong></article>
              <article><span>Students in section</span><strong>{selectedSection ? `${sectionStudents.length} students` : 'Select a section'}</strong></article>
            </div>
            <div className="registrar-course-footer-actions">
              {editingAssignmentId && (
                <button className="registrar-btn registrar-btn-secondary" onClick={clearAssignmentForm} disabled={assigning}>
                  Cancel edit
                </button>
              )}
              <button className="registrar-btn" onClick={() => void handleAssignSubjectInstructor()} disabled={!canAssign}>
                {assigning ? 'Saving assignment...' : editingAssignmentId ? 'Update assignment' : 'Create assignment'}
              </button>
            </div>
          </div>
        </section>

        <div className="registrar-course-support-stack">
          <section className="registrar-course-detail-card">
            <header className="registrar-course-card-header">
              <div>
                <p className="registrar-course-card-label">Focused Load</p>
                <h3>{selectedProfessorCourse?.fullLabel || selectedProfessorCourse?.label || 'No course selected'}</h3>
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
                        <select onChange={(e) => {
                          const value = e.target.value
                          if (value === 'edit') {
                            handleEditProfessorCourseAssignment(assignment)
                          } else if (value === 'unassign') {
                            void handleDeleteProfessorCourseAssignment(assignment)
                          }
                          e.target.value = '' // Reset to placeholder
                        }} disabled={assigning}>
                          <option value="">...</option>
                          <option value="edit">Edit</option>
                          <option value="unassign">Unassign</option>
                        </select>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="registrar-course-empty-state registrar-course-empty-state-compact">
                <Users size={20} />
                <div>
                  <h3>No classes inside this course focus</h3>
                  <p>{selectedProfessor ? 'Create a block assignment from the workspace form to start this load.' : 'Choose a professor to start working.'}</p>
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

          <section className="registrar-course-section-card">
            <header className="registrar-course-card-header">
              <div>
                <p className="registrar-course-card-label">Read / Manage Assignments</p>
                <h3>{selectedSection ? `Current assignments for Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}` : 'Select a section to manage assignments'}</h3>
              </div>
              {selectedSection && <span className="registrar-course-card-pill">{sectionAssignments.length} assignments</span>}
            </header>

            {selectedSection ? (
              sectionAssignmentsLoading ? (
                <p className="registrar-course-alert-empty">Loading current block assignments...</p>
              ) : sectionAssignments.length > 0 ? (
                <div className="registrar-course-manager-list">
                  {sectionAssignments.map((assignment) => (
                    <article key={assignment.subjectId} className="registrar-course-manager-item">
                      <div className="registrar-course-assignment-row-head">
                        <div><strong>{assignment.subjectCode}</strong><span>{assignment.subjectTitle}</span></div>
                        <span className="registrar-course-assignment-chip">{selectedSection.currentPopulation} students</span>
                      </div>
                      <div className="registrar-course-assignment-row-meta">
                        <span>{assignment.instructor}</span>
                        <span>{assignment.schedule}</span>
                        <span>{assignment.room}</span>
                      </div>
                      <div className="registrar-course-inline-actions">
                        <button className="registrar-btn registrar-btn-secondary" onClick={() => populateAssignmentEditor(assignment)} disabled={assigning}>
                          Edit
                        </button>
                        <button className="registrar-btn registrar-course-danger-btn" onClick={() => void handleDeleteSectionAssignment(assignment)} disabled={assigning}>
                          Unassign
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="registrar-course-alert-empty">No professor assignments exist for this section yet. Use the form on the left to create the first one.</p>
              )
            ) : (
              <p className="registrar-course-alert-empty">Choose a block group and section first to read, update, or delete assignments.</p>
            )}
          </section>

          <section className="registrar-course-section-card">
            <header className="registrar-course-card-header">
              <div>
                <p className="registrar-course-card-label">Block Snapshot</p>
                <h3>{selectedSection ? `Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}` : 'Select a section'}</h3>
              </div>
              {selectedSection && <span className="registrar-course-card-pill">{selectedSection.currentPopulation}/{selectedSection.capacity}</span>}
            </header>

            {selectedSection ? (
              <>
                <div className="registrar-course-section-meta">
                  <span>{selectedGroup ? formatBlockGroupLabel(selectedGroup.name) : 'Block group pending'}</span>
                  <span>{selectedSubject ? `${selectedSubject.code} | ${selectedSubject.title}` : 'Choose a subject to continue'}</span>
                </div>
                {sectionStudentsLoading ? (
                  <p className="registrar-course-alert-empty">Loading section roster...</p>
                ) : sectionStudents.length > 0 ? (
                  <div className={`registrar-course-student-list${sectionStudents.length > 8 ? ' is-scrollable' : ''}`}>
                    {sectionStudents.map((student) => (
                      <article key={student._id} className="registrar-course-student-row">
                        <div><strong>{student.lastName}, {student.firstName}</strong><span>{student.studentNumber}</span></div>
                        <small>{student.studentStatus || 'Enrolled'}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="registrar-course-alert-empty">No students are assigned to this section yet.</p>
                )}
              </>
            ) : (
              <p className="registrar-course-alert-empty">Select a block group and section to inspect the roster for this assignment target.</p>
            )}
          </section>
        </div>
      </div>

      <div
        className={`registrar-refresh-signal${showRefreshSignal ? ' is-visible' : ''}`}
        aria-hidden={!showRefreshSignal}
      >
        <span className="registrar-refresh-signal-rail" />
        <span className="registrar-refresh-signal-label">Refreshing workspace</span>
      </div>
    </div>
  )
}

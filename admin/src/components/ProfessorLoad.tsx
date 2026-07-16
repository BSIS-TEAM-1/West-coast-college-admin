import { useEffect, useRef, useState } from 'react'
import { FileText, GraduationCap, PencilLine, Search, X } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import type { RegistrarCourseWorkspaceSelection } from './RegistrarCourseWorkspace'
import './ProfessorLoad.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = { _id: string; name: string; semester: Semester; year: number }
type BlockSection = { _id: string; sectionCode: string; capacity: number; currentPopulation: number }
type SectionStudent = { _id: string; studentNumber: string; firstName: string; lastName: string; studentStatus?: string }
type ProfessorAccount = { _id: string; label: string }
type SubjectItem = { _id: string; code: string; title: string }
type ProfessorLoadSort = 'load-desc' | 'students-desc' | 'name-asc' | 'name-desc'
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
  courseCode?: number | null
  courseShortLabel: string
  courseLabel?: string
  yearLevel?: number | null
  units?: number
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

type CourseLoadStats = {
  professors: number
  assignedSubjects: number
  sectionsCovered: number
  studentsCovered: number
  unassignedSubjects: number
  unmatchedInstructors: number
  orphanedSubjects: number
}

type CourseLoadFilterOptions = {
  semesters: string[]
  years: number[]
  courses: Array<{ value: number; label: string; fullLabel: string }>
}

type UnassignedCourseLoad = {
  instructor: string
  subjectCode: string
  subjectTitle: string
  sectionLabel: string
  courseShortLabel: string
  studentCount: number
  issueType?: 'tba' | 'unmatched' | 'orphaned'
}

type LoadsPayload = {
  professors?: ProfessorCourseLoad[]
  stats?: CourseLoadStats
  filterOptions?: CourseLoadFilterOptions
  unassignedSubjects?: UnassignedCourseLoad[]
}

type Props = {
  onOpenStudents: () => void
  onOpenReports: () => void
  onOpenWorkspace: (selection: RegistrarCourseWorkspaceSelection) => void
}

const EMPTY_STATS: CourseLoadStats = {
  professors: 0,
  assignedSubjects: 0,
  sectionsCovered: 0,
  studentsCovered: 0,
  unassignedSubjects: 0,
  unmatchedInstructors: 0,
  orphanedSubjects: 0
}

const EMPTY_FILTERS: CourseLoadFilterOptions = { semesters: [], years: [], courses: [] }

export default function ProfessorLoad({ onOpenStudents, onOpenReports, onOpenWorkspace }: Props) {
  const workspaceCardRef = useRef<HTMLElement | null>(null)
  const refreshSignalTimerRef = useRef<number | null>(null)
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [sectionStudentsLoading, setSectionStudentsLoading] = useState(false)
  const [sectionAssignments, setSectionAssignments] = useState<SectionSubjectAssignment[]>([])
  const [sectionAssignmentsLoading, setSectionAssignmentsLoading] = useState(false)
  const [professors, setProfessors] = useState<ProfessorAccount[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectInstructorName, setSubjectInstructorName] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectTimeStart, setSubjectTimeStart] = useState('')
  const [subjectTimeEnd, setSubjectTimeEnd] = useState('')
  const [subjectRoom, setSubjectRoom] = useState('')
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [courseLoadStats, setCourseLoadStats] = useState<CourseLoadStats>(EMPTY_STATS)
  const [courseLoadFilterOptions, setCourseLoadFilterOptions] = useState<CourseLoadFilterOptions>(EMPTY_FILTERS)
  const [unassignedCourseLoads, setUnassignedCourseLoads] = useState<UnassignedCourseLoad[]>([])
  const [selectedProfessorId, setSelectedProfessorId] = useState('')
  const [selectedProfessorCourseLabel, setSelectedProfessorCourseLabel] = useState('')
  const [loadSearch, setLoadSearch] = useState('')
  const [selectedLoadCourse, setSelectedLoadCourse] = useState('')
  const [selectedLoadSemester, setSelectedLoadSemester] = useState('')
  const [selectedLoadYear, setSelectedLoadYear] = useState('')
  const [loadSort, setLoadSort] = useState<ProfessorLoadSort>('load-desc')
  const [courseLoadLoading, setCourseLoadLoading] = useState(false)
  const [showRefreshSignal, setShowRefreshSignal] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [error, setError] = useState('')
  const [courseLoadError, setCourseLoadError] = useState('')
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
    setSubjectInstructorName('')
    setSubjectDaySelections([])
    setSubjectTimeStart('')
    setSubjectTimeEnd('')
    setSubjectRoom('')
  }

  const focusWorkspace = () => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      workspaceCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
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

    const orderedDays = dayOptions.filter((day) => days.includes(day))
    return {
      days: orderedDays,
      start: timeMatch?.[1] || '',
      end: timeMatch?.[2] || ''
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

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data as BlockGroup[] : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchProfessors = async () => {
    try {
      const data = await authorizedFetch('/api/registrar/professors')
      setProfessors(Array.isArray(data?.data) ? data.data as ProfessorAccount[] : [])
      setError('')
    } catch (err) {
      setProfessors([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor list')
    }
  }

  const fetchProfessorCourseLoads = async () => {
    setCourseLoadLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedLoadCourse) params.set('course', selectedLoadCourse)
      if (selectedLoadSemester) params.set('semester', selectedLoadSemester)
      if (selectedLoadYear) params.set('year', selectedLoadYear)
      const query = params.toString()
      const data = await authorizedFetch(`/api/registrar/professor-course-loads${query ? `?${query}` : ''}`)
      const payload = (data?.data || {}) as LoadsPayload
      setProfessorLoads(Array.isArray(payload.professors) ? payload.professors : [])
      setCourseLoadStats(payload.stats || EMPTY_STATS)
      setCourseLoadFilterOptions(payload.filterOptions || EMPTY_FILTERS)
      setUnassignedCourseLoads(Array.isArray(payload.unassignedSubjects) ? payload.unassignedSubjects : [])
      setCourseLoadError('')
    } catch (err) {
      setProfessorLoads([])
      setCourseLoadStats(EMPTY_STATS)
      setCourseLoadFilterOptions(EMPTY_FILTERS)
      setUnassignedCourseLoads([])
      setCourseLoadError(err instanceof Error ? err.message : 'Failed to fetch professor course loads')
    } finally {
      setCourseLoadLoading(false)
    }
  }

  const extractGroupMeta = (groupName: string) => {
    const match = String(groupName || '').trim().toUpperCase().match(/^(\d+)-(\d)-?[A-Z]$/)
    return match
      ? { course: Number(match[1]) || undefined, yearLevel: Number(match[2]) || undefined }
      : { course: undefined as number | undefined, yearLevel: undefined as number | undefined }
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

  const handleAssignSubjectInstructor = async () => {
    const assignmentTargetId = editingAssignmentId || selectedSubjectId
    if (!selectedSectionId) return setError('Please select a section first.')
    if (!assignmentTargetId) return setError('Please select a subject.')
    const normalizedInstructor = subjectInstructorName.trim()
    const normalizedDays = dayOptions.filter((day) => subjectDaySelections.includes(day)).join('')
    const normalizedSchedule = `${normalizedDays} ${subjectTimeStart}-${subjectTimeEnd}`.trim()
    const normalizedRoom = subjectRoom.trim()
    if (!normalizedInstructor) return setError('Please choose a professor.')
    if (!normalizedDays) return setError('Please select at least one class day.')
    if (!subjectTimeStart || !subjectTimeEnd) return setError('Please select a start and end time.')
    if (!normalizedRoom) return setError('Please enter a room.')

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const payload: Record<string, string> = {
        subjectId: assignmentTargetId,
        instructor: normalizedInstructor,
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
          ? `${subjectCode} updated for ${normalizedInstructor} at ${normalizedSchedule} in ${normalizedRoom}.`
          : `${subjectCode} assigned to ${normalizedInstructor} at ${normalizedSchedule} in ${normalizedRoom}.`
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

  const populateAssignmentEditor = (assignment: Pick<SectionSubjectAssignment, 'subjectId' | 'schedule' | 'room' | 'instructor'>) => {
    const parsedSchedule = parseScheduleIntoFields(assignment.schedule)
    setEditingAssignmentId(assignment.subjectId)
    setSelectedSubjectId(assignment.subjectId)
    setSubjectInstructorName(assignment.instructor === 'TBA' ? '' : assignment.instructor)
    setSubjectDaySelections(parsedSchedule.days)
    setSubjectTimeStart(parsedSchedule.start)
    setSubjectTimeEnd(parsedSchedule.end)
    setSubjectRoom(assignment.room === 'TBA' ? '' : assignment.room)
  }

  const handleEditAssignment = (assignment: SectionSubjectAssignment) => {
    populateAssignmentEditor(assignment)

    const matchedProfessor = professorLoads.find((professor) => professor.label === assignment.instructor)
    if (matchedProfessor) {
      setSelectedProfessorId(matchedProfessor.professorId)
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

  const handleDeleteAssignment = async (assignment: SectionSubjectAssignment) => {
    if (!selectedSectionId) return
    await removeSectionAssignment({
      sectionId: selectedSectionId,
      subjectId: assignment.subjectId,
      subjectCode: assignment.subjectCode,
      sectionLabel: selectedSection ? `Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}` : 'the selected block',
      professorLabel: assignment.instructor
    })
  }

  const handleCreateAssignmentForProfessor = (professor: ProfessorCourseLoad | null) => {
    if (!professor) return
    onOpenWorkspace({
      professorId: professor.professorId,
      courseLabel: selectedProfessorCourse?.label || professor.courseSummaries[0]?.label || ''
    })
  }

  const handleEditProfessorCourseAssignment = (professor: ProfessorCourseLoad | null, assignment: ProfessorCourseAssignment) => {
    if (!professor) return
    setSelectedProfessorId(professor.professorId)
    setSelectedProfessorCourseLabel(assignment.courseShortLabel || selectedProfessorCourse?.label || '')
    setSubjectInstructorName(professor.label)
    if (assignment.blockGroupId) {
      setSelectedGroupId(assignment.blockGroupId)
    }
    if (assignment.sectionId) {
      setSelectedSectionId(assignment.sectionId)
    }
    populateAssignmentEditor({
      subjectId: assignment.subjectId,
      instructor: professor.label,
      schedule: assignment.schedule,
      room: assignment.room
    })
    setError('')
    setSuccess('')
    focusWorkspace()
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

  const handleRefreshLoadBoard = async () => {
    triggerRefreshSignal()
    await fetchProfessorCourseLoads()
  }

  useEffect(() => {
    void fetchBlockGroups()
    void fetchProfessors()
  }, [])

  useEffect(() => () => {
    if (refreshSignalTimerRef.current) {
      window.clearTimeout(refreshSignalTimerRef.current)
    }
  }, [])

  useEffect(() => {
    void fetchProfessorCourseLoads()
  }, [selectedLoadCourse, selectedLoadSemester, selectedLoadYear])

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
      setSectionAssignments([])
      clearAssignmentForm()
      return
    }
    void fetchSectionStudents(selectedSectionId)
    void fetchSectionAssignments(selectedSectionId)
  }, [selectedSectionId])

  const normalizedSearch = loadSearch.trim().toLowerCase()
  const visibleProfessorLoads = [...professorLoads]
    .filter((professor) => {
      if (!normalizedSearch) return true
      if ([professor.label, professor.displayName, professor.username].some((value) => String(value || '').toLowerCase().includes(normalizedSearch))) {
        return true
      }
      if (professor.courseSummaries.some((course) => [course.label, course.fullLabel].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))) {
        return true
      }
      return professor.assignments.some((assignment) =>
        [assignment.subjectCode, assignment.subjectTitle, assignment.sectionLabel, assignment.schedule, assignment.room]
          .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
      )
    })
    .sort((a, b) => {
      if (loadSort === 'students-desc') return b.totals.students - a.totals.students || a.label.localeCompare(b.label)
      if (loadSort === 'name-asc') return a.label.localeCompare(b.label)
      if (loadSort === 'name-desc') return b.label.localeCompare(a.label)
      return b.totals.subjects - a.totals.subjects || b.totals.sections - a.totals.sections || a.label.localeCompare(b.label)
    })

  const visibleProfessorIds = visibleProfessorLoads.map((professor) => professor.professorId).join('|')
  useEffect(() => {
    if (!visibleProfessorLoads.some((professor) => professor.professorId === selectedProfessorId)) {
      setSelectedProfessorId((visibleProfessorLoads.find((professor) => professor.totals.subjects > 0) || visibleProfessorLoads[0])?.professorId || '')
    }
  }, [visibleProfessorIds, selectedProfessorId])

  const selectedProfessor = visibleProfessorLoads.find((professor) => professor.professorId === selectedProfessorId)
    || professorLoads.find((professor) => professor.professorId === selectedProfessorId)
    || null
  const selectedProfessorCourseLabels = selectedProfessor
    ? selectedProfessor.courseSummaries.map((course) => course.label).join('|')
    : ''

  useEffect(() => {
    if (!selectedProfessor || selectedProfessor.courseSummaries.length === 0) {
      setSelectedProfessorCourseLabel('')
      return
    }
    if (!selectedProfessor.courseSummaries.some((course) => course.label === selectedProfessorCourseLabel)) {
      setSelectedProfessorCourseLabel(selectedProfessor.courseSummaries[0].label)
    }
  }, [selectedProfessor?.professorId, selectedProfessorCourseLabels, selectedProfessorCourseLabel])

  const selectedProfessorCourse = selectedProfessor?.courseSummaries.find((course) => course.label === selectedProfessorCourseLabel)
    || selectedProfessor?.courseSummaries[0]
    || null
  const selectedProfessorCourseAssignments = selectedProfessor
    ? selectedProfessor.assignments.filter((assignment) => (
      selectedProfessorCourse ? assignment.courseShortLabel === selectedProfessorCourse.label : true
    ))
    : []

  const visibleSectionIds = new Set<string>()
  let visibleAssignedSubjects = 0
  let visibleStudentsCovered = 0
  visibleProfessorLoads.forEach((professor) => {
    visibleAssignedSubjects += professor.totals.subjects
    visibleStudentsCovered += professor.totals.students
    professor.assignments.forEach((assignment) => visibleSectionIds.add(assignment.sectionId))
  })

  const visibleStats: CourseLoadStats = {
    professors: visibleProfessorLoads.length,
    assignedSubjects: visibleAssignedSubjects,
    sectionsCovered: visibleSectionIds.size,
    studentsCovered: visibleStudentsCovered,
    unassignedSubjects: courseLoadStats.unassignedSubjects,
    unmatchedInstructors: courseLoadStats.unmatchedInstructors,
    orphanedSubjects: courseLoadStats.orphanedSubjects
  }

  const canAssign = !assigning
    && Boolean(selectedSectionId)
    && Boolean(selectedSubjectId)
    && Boolean(subjectInstructorName.trim())
    && subjectDaySelections.length > 0
    && Boolean(subjectTimeStart)
    && Boolean(subjectTimeEnd)
    && Boolean(subjectRoom.trim())

  const useProfessorForAssignment = (professor: ProfessorCourseLoad | null) => {
    if (!professor) return
    onOpenWorkspace({
      professorId: professor.professorId,
      courseLabel: selectedProfessorCourse?.label || professor.courseSummaries[0]?.label || ''
    })
  }

  return (
    <div className="registrar-section registrar-course-management-page">
      <section className="registrar-course-hero">
        <div className="registrar-course-hero-copy">
          <span className="registrar-course-eyebrow">Registrar Workspace</span>
          <h2 className="registrar-section-title">Course & Faculty Load Management</h2>
          <p className="registrar-section-desc">
            Review teaching loads, track coverage gaps, and manage professor assignments by course, block, schedule, and room.
          </p>
        </div>
        <div className="registrar-course-hero-actions">
          <button className="registrar-btn registrar-btn-secondary" onClick={onOpenReports}>
            <FileText size={16} />
            View Reports
          </button>
          <button className="registrar-btn" onClick={onOpenStudents}>
            <GraduationCap size={16} />
            Open Student List
          </button>
        </div>
      </section>

      <section className="registrar-course-stat-bar">
        {[
          ['Faculty', visibleStats.professors || courseLoadStats.professors, 'Profiles in current view'],
          ['Subjects', visibleStats.assignedSubjects, 'Assigned teaching loads'],
          ['Sections', visibleStats.sectionsCovered, 'Blocks with coverage'],
          ['Students', visibleStats.studentsCovered, 'Covered by assignments'],
          ['Needs Attention', courseLoadStats.unassignedSubjects + courseLoadStats.unmatchedInstructors + courseLoadStats.orphanedSubjects, 'TBA, unmatched, or orphaned rows']
        ].map(([label, value, meta], index) => (
          <article key={label} className={`registrar-course-stat-card${index === 4 ? ' registrar-course-stat-card-alert' : ''}`}>
            <span className="registrar-course-stat-label">{label}</span>
            <strong>{value}</strong>
            <span className="registrar-course-stat-meta">{meta}</span>
          </article>
        ))}
      </section>

      {courseLoadError && <p className="registrar-feedback registrar-feedback-error">{courseLoadError}</p>}
      {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}
      {success && <p className="registrar-feedback registrar-feedback-success">{success}</p>}

      <section className="registrar-course-toolbar">
        <label className="registrar-course-search">
          <span>Search</span>
          <Search size={16} className="registrar-course-search-icon" />
          <input type="search" value={loadSearch} onChange={(e) => setLoadSearch(e.target.value)} placeholder="Search professor, subject, section, room, or schedule" />
        </label>
        <label>
          <span>Course</span>
          <select value={selectedLoadCourse} onChange={(e) => setSelectedLoadCourse(e.target.value)}>
            <option value="">All courses</option>
            {courseLoadFilterOptions.courses.map((course) => <option key={course.value} value={String(course.value)}>{course.label}</option>)}
          </select>
        </label>
        <label>
          <span>Semester</span>
          <select value={selectedLoadSemester} onChange={(e) => setSelectedLoadSemester(e.target.value)}>
            <option value="">All semesters</option>
            {courseLoadFilterOptions.semesters.map((semester) => <option key={semester} value={semester}>{semester}</option>)}
          </select>
        </label>
        <label>
          <span>School Year</span>
          <select value={selectedLoadYear} onChange={(e) => setSelectedLoadYear(e.target.value)}>
            <option value="">All academic years</option>
            {courseLoadFilterOptions.years.map((year) => <option key={year} value={String(year)}>{formatAcademicYear(year)}</option>)}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={loadSort} onChange={(e) => setLoadSort(e.target.value as ProfessorLoadSort)}>
            <option value="load-desc">Heaviest load</option>
            <option value="students-desc">Most students</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </label>
        <button className="registrar-btn registrar-btn-secondary" onClick={() => void handleRefreshLoadBoard()} disabled={courseLoadLoading}>
          {courseLoadLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <div className="registrar-course-layout">
        <div className="registrar-course-support-stack">
        <section className="registrar-course-directory-card">
          <header className="registrar-course-card-header">
            <div>
              <p className="registrar-course-card-label">Faculty Directory</p>
              <h3>Professor Load Overview</h3>
            </div>
            <span className="registrar-course-card-pill">{courseLoadLoading ? 'Loading...' : `${visibleProfessorLoads.length} in view`}</span>
          </header>

          {courseLoadLoading ? (
            <div className="registrar-professor-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="registrar-professor-list-row registrar-professor-load-card-skeleton" aria-hidden="true">
                  <div className="registrar-skeleton registrar-skeleton-title" />
                </div>
              ))}
            </div>
          ) : visibleProfessorLoads.length === 0 ? (
            <div className="registrar-empty-state">
              <p>No professors found matching current filters.</p>
            </div>
          ) : (
            <div className="registrar-professor-list">
              {visibleProfessorLoads.map((professor) => (
                <div
                  key={professor.professorId}
                  className={`registrar-professor-list-row ${selectedProfessorId === professor.professorId ? 'registrar-professor-list-row--active' : ''}`}
                  onClick={() => setSelectedProfessorId(professor.professorId)}
                >
                  <div className="registrar-professor-list-row-main">
                    <div className="registrar-professor-list-row-header">
                      <span className="registrar-professor-name">{professor.label}</span>
                      <span className="registrar-professor-load-badge">{professor.totals.subjects} subjects</span>
                    </div>
                    <div className="registrar-professor-list-row-meta">
                      <span>{professor.totals.sections} sections</span>
                      <span>•</span>
                      <span>{professor.totals.students} students</span>
                    </div>
                  </div>
                  <div className="registrar-professor-list-row-courses">
                    {professor.courseSummaries.slice(0, 3).map((course) => (
                      <span key={course.label} className="registrar-professor-course-pill">{course.label}</span>
                    ))}
                    {professor.courseSummaries.length > 3 && (
                      <span className="registrar-professor-course-pill">+{professor.courseSummaries.length - 3}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>

        <div className="registrar-course-main-stack">
          {selectedProfessor ? (
            <>
              <section className="registrar-course-detail-card">
                <header className="registrar-course-card-header">
                  <div>
                    <p className="registrar-course-card-label">Selected Faculty</p>
                    <h3>{selectedProfessor.label}</h3>
                  </div>
                  <div className="registrar-course-card-actions">
                    {selectedProfessor.courseSummaries.length > 1 && (
                      <select
                        value={selectedProfessorCourseLabel}
                        onChange={(e) => setSelectedProfessorCourseLabel(e.target.value)}
                        className="registrar-select-sm"
                      >
                        {selectedProfessor.courseSummaries.map((course) => (
                          <option key={course.label} value={course.label}>{course.fullLabel}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </header>

                <div className="registrar-professor-detail-stats">
                  <div className="registrar-professor-detail-stat">
                    <span>Total Subjects</span>
                    <strong>{selectedProfessor.totals.subjects}</strong>
                  </div>
                  <div className="registrar-professor-detail-stat">
                    <span>Sections</span>
                    <strong>{selectedProfessor.totals.sections}</strong>
                  </div>
                  <div className="registrar-professor-detail-stat">
                    <span>Total Students</span>
                    <strong>{selectedProfessor.totals.students}</strong>
                  </div>
                </div>

                {selectedProfessorCourseAssignments.length === 0 ? (
                  <div className="registrar-empty-state">
                    <p>No assignments found for this professor in the selected course.</p>
                  </div>
                ) : (
                  <div className="registrar-assignment-table-wrapper">
                    <table className="registrar-assignment-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Section</th>
                          <th>Schedule</th>
                          <th>Room</th>
                          <th>Students</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProfessorCourseAssignments.map((assignment) => (
                          <tr key={`${assignment.subjectId}-${assignment.sectionId}`}>
                            <td>
                              <div className="registrar-assignment-subject">
                                <span className="registrar-assignment-code">{assignment.subjectCode}</span>
                                <span className="registrar-assignment-title">{assignment.subjectTitle}</span>
                              </div>
                            </td>
                            <td>{assignment.sectionLabel}</td>
                            <td>{assignment.schedule}</td>
                            <td>{assignment.room}</td>
                            <td>{assignment.studentCount}</td>
                            <td>
                              <button
                                className="registrar-btn-icon registrar-btn-icon--edit"
                                onClick={() => handleEditProfessorCourseAssignment(selectedProfessor, assignment)}
                                title="Edit assignment"
                              >
                                <PencilLine size={14} />
                              </button>
                              <button
                                className="registrar-btn-icon registrar-btn-icon--delete"
                                onClick={() => handleDeleteProfessorCourseAssignment(assignment)}
                                title="Remove assignment"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="registrar-course-workspace-card" ref={workspaceCardRef}>
                <header className="registrar-course-card-header">
                  <div>
                    <p className="registrar-course-card-label">Assignment Workspace</p>
                    <h3>Assign Subject to Professor</h3>
                  </div>
                  {showRefreshSignal && <span className="registrar-refresh-signal">Updated</span>}
                </header>

                <div className="registrar-workspace-form">
                  <div className="registrar-form-row">
                    <label>
                      <span>Block Group</span>
                      <select
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        disabled={assigning}
                      >
                        <option value="">Select block group</option>
                        {blockGroups.map((group) => (
                          <option key={group._id} value={group._id}>
                            {formatBlockGroupLabel(group.name)} ({group.semester} {group.year})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Section</span>
                      <select
                        value={selectedSectionId}
                        onChange={(e) => setSelectedSectionId(e.target.value)}
                        disabled={assigning || !selectedGroupId}
                      >
                        <option value="">Select section</option>
                        {sortedSections.map((section) => (
                          <option key={section._id} value={section._id}>
                            {formatSectionShortLabel(section.sectionCode)} ({section.currentPopulation}/{section.capacity})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="registrar-form-row">
                    <label>
                      <span>Subject</span>
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        disabled={assigning || !selectedGroupId}
                      >
                        <option value="">Select subject</option>
                        {subjects.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.code} - {subject.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Professor</span>
                      <select
                        value={subjectInstructorName}
                        onChange={(e) => setSubjectInstructorName(e.target.value)}
                        disabled={assigning}
                      >
                        <option value="">Select professor</option>
                        {professorLoads.map((professor) => (
                          <option key={professor.professorId} value={professor.label}>
                            {professor.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="registrar-form-row">
                    <label>
                      <span>Days</span>
                      <div className="registrar-day-selector">
                        {dayOptions.map((day) => (
                          <button
                            key={day}
                            type="button"
                            className={`registrar-day-btn${subjectDaySelections.includes(day) ? ' registrar-day-btn--active' : ''}`}
                            onClick={() => {
                              setSubjectDaySelections((prev) =>
                                prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                              )
                            }}
                            disabled={assigning}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </label>
                    <div className="registrar-form-row-split">
                      <label>
                        <span>Start Time</span>
                        <input
                          type="time"
                          value={subjectTimeStart}
                          onChange={(e) => setSubjectTimeStart(e.target.value)}
                          disabled={assigning}
                        />
                      </label>
                      <label>
                        <span>End Time</span>
                        <input
                          type="time"
                          value={subjectTimeEnd}
                          onChange={(e) => setSubjectTimeEnd(e.target.value)}
                          disabled={assigning}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="registrar-form-row">
                    <label>
                      <span>Room</span>
                      <input
                        type="text"
                        value={subjectRoom}
                        onChange={(e) => setSubjectRoom(e.target.value)}
                        placeholder="e.g., RM-101"
                        disabled={assigning}
                      />
                    </label>
                  </div>

                  <div className="registrar-workspace-actions">
                    <button
                      type="button"
                      className="registrar-btn registrar-btn-secondary"
                      onClick={clearAssignmentForm}
                      disabled={assigning}
                    >
                      Clear Form
                    </button>
                    <button
                      type="button"
                      className="registrar-btn"
                      onClick={handleAssignSubjectInstructor}
                      disabled={!canAssign || assigning}
                    >
                      {assigning ? 'Assigning...' : 'Assign Subject'}
                    </button>
                  </div>
                </div>

                {selectedSectionId && (
                  <div className="registrar-section-preview">
                    <h4>Section Students Preview</h4>
                    {sectionStudentsLoading ? (
                      <p>Loading students...</p>
                    ) : sectionStudents.length === 0 ? (
                      <p>No students enrolled in this section.</p>
                    ) : (
                      <div className="registrar-student-list">
                        {sectionStudents.map((student) => (
                          <div key={student._id} className="registrar-student-item">
                            <span>{student.studentNumber}</span>
                            <span>{student.firstName} {student.lastName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedSectionId && sectionAssignments.length > 0 && (
                  <div className="registrar-section-assignments">
                    <h4>Current Section Assignments</h4>
                    <div className="registrar-assignment-list">
                      {sectionAssignments.map((assignment) => (
                        <div key={assignment.subjectId} className="registrar-assignment-item">
                          <div className="registrar-assignment-item-main">
                            <span className="registrar-assignment-code">{assignment.subjectCode}</span>
                            <span className="registrar-assignment-schedule">{assignment.schedule}</span>
                            <span className="registrar-assignment-room">{assignment.room}</span>
                          </div>
                          <div className="registrar-assignment-item-actions">
                            <button
                              className="registrar-btn-icon registrar-btn-icon--edit"
                              onClick={() => handleEditAssignment(assignment)}
                              title="Edit assignment"
                            >
                              <PencilLine size={14} />
                            </button>
                            <button
                              className="registrar-btn-icon registrar-btn-icon--delete"
                              onClick={() => handleDeleteAssignment(assignment)}
                              title="Remove assignment"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="registrar-empty-state">
              <p>Select a professor from the directory to view their load and manage assignments.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

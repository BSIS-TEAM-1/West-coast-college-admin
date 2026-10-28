import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react'
import { getStoredToken } from '../../lib/authApi'
import StudentService from '../../lib/studentApi'
import type { StudentData } from '../../lib/studentApi'
import {
  courseFullLabel,
  courseShortLabel,
  extractResponseData,
  formatBlockDisplay,
  formatYearLevel,
  getSharedAcademicContext,
  normalizeCourseCode,
  studentDisplayName,
  studentInitials,
  studentNumberDisplay,
  COURSE_OPTIONS
} from '../../lib/blockAssignmentShared'
import { getAcademicTerm, getCachedAcademicTerm, type AcademicTerm } from '../../lib/settingsApi'
import {
  fetchReEnrollmentCandidates,
  type ReEnrollmentSemester,
  type ReEnrollmentStudent,
  type ReEnrollmentVerification
} from '../../lib/reEnrollmentApi'
import BlockAssignmentModal from '../../components/BlockAssignmentModal'
import ReEnrollmentCodeModal from '../../components/ReEnrollmentCodeModal'
import StudentInfoPopup from '../../components/StudentInfoPopup'
import '../../components/StudentManagement.css'

type BlockStatusFilter = 'all' | 'assigned' | 'unassigned'
type SortOption = 'name-asc' | 'name-desc' | 'id-asc' | 'course-asc' | 'year-asc'
type BlockAssignmentMode = 'assignment' | 're-enrollment'
type RetakeFilter = 'all' | 'retakes' | 'regular'
type Semester = ReEnrollmentSemester

type BlockAssignmentPageProps = {
  mode?: BlockAssignmentMode
}

type TermReadiness = {
  ready: boolean
  message: string
}

function extractResponseList(response: unknown): StudentData[] {
  return extractResponseData<StudentData[]>(response) || []
}

function termRank(semester: string) {
  if (semester === '1st') return 0
  if (semester === '2nd') return 1
  if (semester === 'Summer') return 2
  return -1
}

function targetTermReadiness(
  activeTerm: AcademicTerm | null,
  targetSchoolYear: string,
  targetSemester: Semester
): TermReadiness {
  if (!activeTerm?.schoolYear) {
    return { ready: false, message: 'The active academic term is not configured yet.' }
  }
  const activeStart = Number(String(activeTerm.schoolYear).slice(0, 4))
  const targetStart = Number(String(targetSchoolYear || '').slice(0, 4))
  if (!Number.isFinite(activeStart) || !Number.isFinite(targetStart)) {
    return { ready: false, message: 'Choose a valid target school year.' }
  }
  if (targetStart > activeStart) {
    return {
      ready: false,
      message: `School year ${activeTerm.schoolYear} has not been rolled over yet. Complete the rollover before enrolling students for ${targetSchoolYear}.`
    }
  }
  if (targetStart < activeStart) {
    return {
      ready: false,
      message: `${targetSchoolYear} is already in the past. The active academic term is ${activeTerm.schoolYear} ${activeTerm.semester}.`
    }
  }
  if (termRank(targetSemester) < termRank(activeTerm.semester)) {
    return {
      ready: false,
      message: `${targetSchoolYear} ${targetSemester} is before the active academic term (${activeTerm.schoolYear} ${activeTerm.semester}).`
    }
  }
  return { ready: true, message: '' }
}

function isVerified(student: ReEnrollmentStudent) {
  return student.reEnrollment?.verification?.status === 'verified'
}

function statusTone(status?: string | null) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'enrolled') return 'enrolled'
  if (value === 'irregular') return 'irregular'
  if (value === 'pending') return 'pending'
  return 'neutral'
}

function nextAcademicTerm(term: AcademicTerm): { schoolYear: string; semester: Semester } {
  const start = Number(String(term.schoolYear || '').slice(0, 4))
  if (!Number.isFinite(start) || start <= 0) {
    return { schoolYear: String(term.schoolYear || ''), semester: '1st' }
  }
  if (term.semester === '1st') {
    return { schoolYear: term.schoolYear, semester: '2nd' }
  }
  return { schoolYear: `${start + 1}-${start + 2}`, semester: '1st' }
}

export default function BlockAssignmentPage({ mode = 'assignment' }: BlockAssignmentPageProps = {}) {
  const isReEnrollment = mode === 're-enrollment'
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [students, setStudents] = useState<ReEnrollmentStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [blockStatusFilter, setBlockStatusFilter] = useState<BlockStatusFilter>('unassigned')
  const [retakeFilter, setRetakeFilter] = useState<RetakeFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [infoStudent, setInfoStudent] = useState<ReEnrollmentStudent | null>(null)
  const [codeTarget, setCodeTarget] = useState<ReEnrollmentStudent | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<{ students: StudentData[]; initialStep: 1 | 2 } | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(() => getCachedAcademicTerm())
  const [targetSchoolYear, setTargetSchoolYear] = useState('')
  const [targetSemester, setTargetSemester] = useState<Semester>('1st')
  const [targetTermReady, setTargetTermReady] = useState(!isReEnrollment)
  const [serverRolloverReady, setServerRolloverReady] = useState<boolean | null>(null)
  const [serverRolloverMessage, setServerRolloverMessage] = useState('')
  const deferredSearch = useDeferredValue(searchTerm)

  const localReadiness = useMemo(
    () => targetTermReadiness(activeTerm, targetSchoolYear, targetSemester),
    [activeTerm, targetSchoolYear, targetSemester]
  )
  const rolloverReady = isReEnrollment ? (serverRolloverReady ?? localReadiness.ready) : true
  const rolloverMessage = serverRolloverMessage || localReadiness.message

  useEffect(() => {
    // The previous target's server answer must not mask the new target while
    // the candidate request is in flight.
    setServerRolloverReady(null)
    setServerRolloverMessage('')
  }, [targetSchoolYear, targetSemester])

  const loadStudents = async (loadMode: 'initial' | 'refresh' = 'initial') => {
    if (loadMode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      let records: ReEnrollmentStudent[]
      if (isReEnrollment) {
        if (!targetSchoolYear || !targetSemester) return
        const response = await fetchReEnrollmentCandidates({
          schoolYear: targetSchoolYear,
          semester: targetSemester
        })
        records = Array.isArray(response.data) ? response.data : []
        if (response.meta) {
          setServerRolloverReady(response.meta.rolloverReady)
          setServerRolloverMessage(response.meta.rolloverMessage || '')
          if (response.meta.activeTerm) setActiveTerm(response.meta.activeTerm)
        }
      } else {
        const response = await StudentService.getStudents(token)
        records = extractResponseList(response)
      }

      setStudents(records)
      setSelectedStudentIds((current) => current.filter((id) => records.some((student) => student._id === id)))
    } catch (loadError) {
      setMessage({
        tone: 'error',
        text: loadError instanceof Error ? loadError.message : 'Failed to load students'
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!isReEnrollment) {
      loadStudents()
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const term = activeTerm || await getAcademicTerm()
        if (cancelled) return
        setActiveTerm(term)
        const next = nextAcademicTerm(term)
        setTargetSchoolYear(next.schoolYear)
        setTargetSemester(next.semester)
        setTargetTermReady(true)
      } catch (loadError) {
        if (cancelled) return
        setLoading(false)
        setTargetTermReady(true)
        setMessage({
          tone: 'error',
          text: loadError instanceof Error ? loadError.message : 'Could not determine the active academic term'
        })
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReEnrollment])

  useEffect(() => {
    if (!isReEnrollment || !targetTermReady) return
    if (!targetSchoolYear || !targetSemester) return
    loadStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReEnrollment, targetSchoolYear, targetSemester, targetTermReady])

  const filteredStudents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()

    return students
      .filter((student) => {
        if (courseFilter !== 'all' && String(student.course) !== courseFilter) return false
        if (yearFilter !== 'all' && String(student.yearLevel) !== yearFilter) return false

        if (isReEnrollment) {
          const needsRetake = Boolean(student.reEnrollment?.needsRetake)
          if (retakeFilter === 'retakes' && !needsRetake) return false
          if (retakeFilter === 'regular' && needsRetake) return false
        } else {
          const blockLabel = String(student.section || '').trim()
          if (blockStatusFilter === 'assigned' && !blockLabel) return false
          if (blockStatusFilter === 'unassigned' && blockLabel) return false
        }

        if (!query) return true

        const searchableText = [
          student.studentNumber,
          studentNumberDisplay(student),
          studentDisplayName(student),
          courseShortLabel(student.course),
          student.email,
          student.contactNumber,
          student.section,
          student.schoolYear,
          student.semester,
          ...(student.reEnrollment?.retakeSubjects || []).map((subject) => `${subject.code} ${subject.title}`)
        ]
          .join(' ')
          .toLowerCase()

        return searchableText.includes(query)
      })
      .sort((left, right) => {
        if (sortBy === 'name-desc') {
          const lastNameComparison = String(right.lastName || '').localeCompare(String(left.lastName || ''))
          if (lastNameComparison !== 0) return lastNameComparison
          return String(right.firstName || '').localeCompare(String(left.firstName || ''))
        }
        if (sortBy === 'id-asc') {
          return studentNumberDisplay(left).localeCompare(studentNumberDisplay(right))
        }
        if (sortBy === 'course-asc') {
          const courseComparison = courseShortLabel(left.course).localeCompare(courseShortLabel(right.course))
          if (courseComparison !== 0) return courseComparison
          return Number(left.yearLevel || 0) - Number(right.yearLevel || 0)
        }
        if (sortBy === 'year-asc') {
          const yearComparison = Number(left.yearLevel || 0) - Number(right.yearLevel || 0)
          if (yearComparison !== 0) return yearComparison
          return courseShortLabel(left.course).localeCompare(courseShortLabel(right.course))
        }
        const lastNameComparison = String(left.lastName || '').localeCompare(String(right.lastName || ''))
        if (lastNameComparison !== 0) return lastNameComparison
        return String(left.firstName || '').localeCompare(String(right.firstName || ''))
      })
  }, [blockStatusFilter, courseFilter, deferredSearch, isReEnrollment, retakeFilter, sortBy, students, yearFilter])

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student._id)),
    [selectedStudentIds, students]
  )
  const verifiedSelectedCount = useMemo(
    () => selectedStudents.filter((student) => isVerified(student)).length,
    [selectedStudents]
  )

  const courseOptions = useMemo(() => {
    const values = Array.from(new Set(students.map((student) => normalizeCourseCode(student.course)).filter(Boolean)))
    return COURSE_OPTIONS.filter((course) => values.includes(String(course.value)))
  }, [students])

  const yearLevelOptions = useMemo(() => {
    return Array.from(
      new Set(
        students
          .map((student) => Number(student.yearLevel))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    ).sort((left, right) => left - right)
  }, [students])

  const schoolYearOptions = useMemo(() => {
    const source = String(activeTerm?.schoolYear || targetSchoolYear || '').trim()
    const start = Number(source.slice(0, 4))
    if (!Number.isFinite(start) || start <= 0) return []
    return [-1, 0, 1, 2, 3].map((offset) => `${start + offset}-${start + offset + 1}`)
  }, [activeTerm?.schoolYear, targetSchoolYear])

  useEffect(() => {
    setCurrentPage(1)
  }, [blockStatusFilter, courseFilter, deferredSearch, retakeFilter, rowsPerPage, sortBy, yearFilter])

  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / rowsPerPage))
  const normalizedPage = Math.min(currentPage, pageCount)
  const pageStart = (normalizedPage - 1) * rowsPerPage
  const paginatedStudents = filteredStudents.slice(pageStart, pageStart + rowsPerPage)
  const visibleStudentIds = paginatedStudents.map((student) => student._id)
  const allVisibleSelected = visibleStudentIds.length > 0 && visibleStudentIds.every((id) => selectedStudentIds.includes(id))
  const someVisibleSelected = visibleStudentIds.some((id) => selectedStudentIds.includes(id))

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((value) => value !== studentId) : [...current, studentId]
    )
  }

  const toggleVisibleSelection = () => {
    setSelectedStudentIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleStudentIds.includes(id))
      }
      return Array.from(new Set([...current, ...visibleStudentIds]))
    })
  }

  const openAssignmentWorkflow = (targets: StudentData[], initialStep: 1 | 2 = 1) => {
    if (!targets.length) {
      setMessage({
        tone: 'error',
        text: isReEnrollment
          ? 'Select at least one student before opening re-enrollment.'
          : 'Select at least one student before opening block assignment.'
      })
      return
    }

    if (isReEnrollment && !rolloverReady) {
      setMessage({
        tone: 'error',
        text: rolloverMessage || 'Complete the school year rollover before enrolling students.'
      })
      return
    }

    if (isReEnrollment) {
      const unverified = (targets as ReEnrollmentStudent[]).filter((student) => !isVerified(student))
      if (unverified.length) {
        setMessage({
          tone: 'error',
          text: unverified.length === 1
            ? `Verify ${studentDisplayName(unverified[0])} before enrolling.`
            : `Verify ${unverified.length} selected students before enrolling.`
        })
        return
      }
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setMessage({
        tone: 'error',
        text: `${isReEnrollment ? 'Bulk re-enrollment' : 'Bulk block assignment'} requires students from the same course and year level.`
      })
      return
    }

    setAssignmentTarget({ students: targets, initialStep })
  }

  const handleExportSelected = () => {
    const source = selectedStudents.length ? selectedStudents : filteredStudents
    if (!source.length) return

    const rows = [
      isReEnrollment
        ? [
            'Student Number',
            'Name',
            'Course',
            'Year Level',
            'Current Term',
            'Block',
            'Current Status',
            'Latest GWA',
            'Grades',
            'Verification',
            'Email',
            'Failed/Dropped Subjects'
          ]
        : ['Student Number', 'Name', 'Course', 'Year Level', 'Block'],
      ...source.map((student) => {
        const base = [
          studentNumberDisplay(student),
          studentDisplayName(student),
          courseShortLabel(student.course),
          formatYearLevel(student.yearLevel),
        ]
        if (isReEnrollment) {
          const details = (student as ReEnrollmentStudent).reEnrollment
          const gradeSummary = details?.gradeSummary
          return [
            ...base,
            `${student.schoolYear || ''} ${student.semester || ''}`.trim(),
            student.section || '',
            student.lifecycleStatus || 'Not Enrolled',
            gradeSummary?.gwa != null ? gradeSummary.gwa.toFixed(2) : '',
            (gradeSummary?.subjects || [])
              .map((subject) => `${subject.code}: ${subject.grade != null ? subject.grade.toFixed(2) : subject.gradeMark || subject.status || '—'}`)
              .join('; '),
            details?.verification?.status || 'none',
            student.email || '',
            (details?.retakeSubjects || []).map((subject) => subject.code).join(', ')
          ]
        }
        return [...base, student.section || '']
      })
    ]

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = isReEnrollment ? 're-enrollment-export.csv' : 'block-assignment-export.csv'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="student-workspace">
        <header className="student-workspace__header">
          <div className="student-workspace__heading">
            <span className="student-workspace__eyebrow">{isReEnrollment ? 'Re-enrollment' : 'Block assignment'}</span>
            <h1>{isReEnrollment ? 'Re-enrollment' : 'Assign Block'}</h1>
            <p>
              {isReEnrollment
                ? "Students due to enroll again for the selected term. Send each student a verification code by email and/or SMS, enter the code they read back, then assign a block. Enrollment stays disabled until the active year has been rolled over to the target school year. Students with an unresolved failed or dropped subject become Irregular."
                : 'Select students from the list, then assign them to a compatible block section.'}
            </p>
          </div>

          <div className="student-workspace__header-actions">
            <button type="button" className="student-workspace__secondary-button" onClick={() => loadStudents('refresh')} disabled={refreshing || (isReEnrollment && !targetTermReady)}>
              <History size={16} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        {message ? (
          <div className={`student-workspace__message student-workspace__message--${message.tone}`}>
            {message.text}
          </div>
        ) : null}

        {isReEnrollment && !rolloverReady ? (
          <div className="student-workspace__message student-workspace__message--warning">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>{rolloverMessage || 'Complete the school year rollover before enrolling students.'}</span>
          </div>
        ) : null}

        <section className="student-workspace__controls-card">
          <div className="student-workspace__filters">
            <label className="student-workspace__search">
              <Search size={18} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, student ID, or email"
              />
            </label>

            {isReEnrollment ? (
              <>
                <label>
                  <span>Target school year</span>
                  <select value={targetSchoolYear} onChange={(event) => setTargetSchoolYear(event.target.value)}>
                    {targetSchoolYear && !schoolYearOptions.includes(targetSchoolYear) ? (
                      <option value={targetSchoolYear}>{targetSchoolYear}</option>
                    ) : null}
                    {schoolYearOptions.map((schoolYear) => (
                      <option key={schoolYear} value={schoolYear}>{schoolYear}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Target semester</span>
                  <select value={targetSemester} onChange={(event) => setTargetSemester(event.target.value as Semester)}>
                    <option value="1st">1st</option>
                    <option value="2nd">2nd</option>
                    <option value="Summer">Summer</option>
                  </select>
                </label>

                <label>
                  <span>Retakes</span>
                  <select value={retakeFilter} onChange={(event) => setRetakeFilter(event.target.value as RetakeFilter)}>
                    <option value="all">All candidates</option>
                    <option value="retakes">With failed/dropped</option>
                    <option value="regular">No failed/dropped</option>
                  </select>
                </label>
              </>
            ) : null}

            <label>
              <span>Curriculum</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All curricula</option>
                {courseOptions.map((course) => (
                  <option key={course.value} value={course.value}>{course.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Year</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All year levels</option>
                {yearLevelOptions.map((yearLevel) => (
                  <option key={yearLevel} value={yearLevel}>{formatYearLevel(yearLevel)}</option>
                ))}
              </select>
            </label>

            {!isReEnrollment ? (
              <label>
                <span>Block</span>
                <select value={blockStatusFilter} onChange={(event) => setBlockStatusFilter(event.target.value as BlockStatusFilter)}>
                  <option value="all">All students</option>
                  <option value="unassigned">No block</option>
                  <option value="assigned">Assigned block</option>
                </select>
              </label>
            ) : null}

            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="id-asc">Student ID</option>
                <option value="course-asc">Curriculum</option>
                <option value="year-asc">Year level</option>
              </select>
            </label>
          </div>

          <div className="student-workspace__toolbar-actions">
            <button
              type="button"
              className="student-workspace__primary-button"
              onClick={() => openAssignmentWorkflow(selectedStudents)}
              disabled={!selectedStudents.length || (isReEnrollment && !rolloverReady)}
              title={isReEnrollment && !rolloverReady ? rolloverMessage : undefined}
            >
              <Blocks size={16} />
              {isReEnrollment ? 'Enroll Selected' : 'Assign Selected'}
            </button>
            <button type="button" className="student-workspace__secondary-button" onClick={handleExportSelected}>
              <Download size={16} />
              Export
            </button>
          </div>

          {selectedStudents.length ? (
            <div className="student-workspace__bulk-actions">
              <div>
                <span className="student-workspace__eyebrow">{isReEnrollment ? 'Ready to re-enroll' : 'Ready to assign'}</span>
                <strong>{selectedStudents.length} selected</strong>
                {isReEnrollment ? (
                  <span className="student-workspace__bulk-note">
                    {verifiedSelectedCount === selectedStudents.length ? (
                      <>
                        <CheckCircle2 size={13} aria-hidden="true" /> All students verified
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={13} aria-hidden="true" /> {verifiedSelectedCount} of {selectedStudents.length} verified
                      </>
                    )}
                  </span>
                ) : null}
              </div>
              <div className="student-workspace__bulk-buttons">
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => openAssignmentWorkflow(selectedStudents)}
                  disabled={isReEnrollment && !rolloverReady}
                  title={isReEnrollment && !rolloverReady ? rolloverMessage : undefined}
                >
                  <Blocks size={16} />
                  {isReEnrollment ? 'Enroll selected' : 'Assign selected'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="student-workspace__table-card">
          <header className="student-workspace__section-heading">
            <div>
              <h2>{isReEnrollment ? 'Students due for re-enrollment' : 'Students for block assignment'}</h2>
              <p>
                {isReEnrollment
                  ? `Candidates without a live ${targetSemester || ''} ${targetSchoolYear || ''} enrollment. Click a row to view student details and verify their contact information.`
                  : 'Select one or more students, then use Assign Selected to choose a block section. Click a row for full student info.'}
              </p>
            </div>
            <div className="student-workspace__table-count">
              <span>Showing {paginatedStudents.length} of {filteredStudents.length.toLocaleString()} Students</span>
              {filteredStudents.length !== students.length && <small>{students.length.toLocaleString()} total records</small>}
            </div>
          </header>

          {loading ? (
            <div className="student-workspace__empty-state">Loading student records...</div>
          ) : filteredStudents.length ? (
            <div className="student-workspace__table-shell">
              <table className="student-workspace__table">
                <colgroup>
                  <col className="student-workspace__col-select" />
                  <col className="student-workspace__col-student" />
                  <col className="student-workspace__col-course" />
                  <col className="student-workspace__col-year-block" />
                  {isReEnrollment ? (
                    <>
                      <col className="student-workspace__col-grades" />
                      <col className="student-workspace__col-status" />
                    </>
                  ) : null}
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        disabled={isReEnrollment && !rolloverReady}
                        aria-label="Select visible students"
                      />
                    </th>
                    <th>Student</th>
                    <th>Curriculum</th>
                    <th>{isReEnrollment ? 'Current Year & Block' : 'Year & Block'}</th>
                    {isReEnrollment ? (
                      <>
                        <th>Grades</th>
                        <th>Current Status</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student) => {
                    const blockLabel = String(student.section || '').trim()
                    const details = student.reEnrollment
                    const gradeSummary = details?.gradeSummary
                    return (
                      <tr
                        key={student._id}
                        className={selectedStudentIds.includes(student._id) ? 'student-workspace__row--selected' : ''}
                        onClick={() => setInfoStudent(student)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(student._id)}
                            onChange={() => toggleStudentSelection(student._id)}
                            disabled={isReEnrollment && !rolloverReady}
                            aria-label={`Select ${studentNumberDisplay(student)}`}
                          />
                        </td>
                        <td>
                          <div className="student-workspace__student-cell">
                            <span className="student-workspace__avatar" aria-hidden="true">{studentInitials(student)}</span>
                            <div>
                              <strong>{studentDisplayName(student)}</strong>
                              <span className="student-workspace__student-id">{studentNumberDisplay(student)}</span>
                              {isReEnrollment ? (
                                student.reEnrollment?.needsRetake ? (
                                  <span
                                    className="student-workspace__retake-flag"
                                    title={student.reEnrollment.retakeSubjects.map((subject) => subject.code).join(', ')}
                                  >
                                    {student.reEnrollment.retakeSubjects.length} failed/dropped
                                  </span>
                                ) : (
                                  <span className="student-workspace__retake-flag student-workspace__retake-flag--clear">
                                    No failed/dropped subjects
                                  </span>
                                )
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell">
                            <strong>{courseShortLabel(student.course)}</strong>
                            <span title={courseFullLabel(student.course)}>{courseFullLabel(student.course)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell student-workspace__year-block-cell">
                            <strong>{formatYearLevel(student.yearLevel)}</strong>
                            {blockLabel ? (
                              <span>{formatBlockDisplay(blockLabel)}</span>
                            ) : (
                              <span>No Block Assigned</span>
                            )}
                            {isReEnrollment ? (
                              <span>{student.schoolYear || 'No term'} · {student.semester || '—'}</span>
                            ) : null}
                          </div>
                        </td>
                        {isReEnrollment ? (
                          <>
                            <td>
                              <button
                                type="button"
                                className="student-workspace__grade-cell"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setInfoStudent(student)
                                }}
                                title="View the student's latest grades"
                              >
                                <strong>{gradeSummary?.gwa != null ? `GWA ${gradeSummary.gwa.toFixed(2)}` : 'No GWA yet'}</strong>
                                <span>
                                  {gradeSummary?.term
                                    ? `${gradeSummary.term.semester} ${gradeSummary.term.schoolYear} · ${gradeSummary.gradedCount}/${gradeSummary.subjectCount} graded`
                                    : 'No subjects on the latest term'}
                                </span>
                                <em>View grades</em>
                              </button>
                            </td>
                            <td>
                              <div className="student-workspace__status-cell">
                                <span className={`student-workspace__status-badge student-workspace__status-badge--${statusTone(student.lifecycleStatus)}`}>
                                  {student.lifecycleStatus || 'Not Enrolled'}
                                </span>
                                <span>{student.studentStatus || student.classification || 'Regular'}</span>
                                {details?.needsRetake ? (
                                  <span className="student-workspace__status-retake">Retake required</span>
                                ) : null}
                              </div>
                            </td>

                          </>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="student-workspace__empty-state">
              <Users size={24} />
              <div>
                <strong>{isReEnrollment ? 'No students are due for this term.' : 'No students match the current filters.'}</strong>
                <p>
                  {isReEnrollment
                    ? 'Check the target school year and semester, or clear the retake filter.'
                    : 'Adjust the search or filters to widen the list.'}
                </p>
              </div>
            </div>
          )}

          {!loading && filteredStudents.length ? (
            <footer className="student-workspace__pagination" aria-label={isReEnrollment ? 'Re-enrollment pagination' : 'Block assignment pagination'}>
              <label>
                Rows per page
                <select value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))}>
                  {[10, 25, 50, 100].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <span>
                Page {normalizedPage} of {pageCount}
              </span>
              <div className="student-workspace__pagination-actions">
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={normalizedPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  disabled={normalizedPage >= pageCount}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          ) : null}
        </section>
      </section>

      {infoStudent ? (
        <StudentInfoPopup
          student={infoStudent}
          reEnrollment={infoStudent.reEnrollment}
          verificationDisabled={!rolloverReady}
          verificationHint={!rolloverReady ? rolloverMessage : ''}
          onVerify={() => setCodeTarget(infoStudent)}
          assignBlockDisabled={
            isReEnrollment && (!rolloverReady || infoStudent.reEnrollment?.verification?.status !== 'verified')
          }
          assignBlockHint={
            !rolloverReady
              ? rolloverMessage
              : !isVerified(infoStudent)
                ? 'Send the student a re-enrollment code and verify it before assigning a block.'
                : ''
          }
          onClose={() => setInfoStudent(null)}
          onAssignBlock={(student) => {
            setInfoStudent(null)
            openAssignmentWorkflow([student], 2)
          }}
        />
      ) : null}

      {codeTarget ? (
        <ReEnrollmentCodeModal
          student={codeTarget}
          targetSchoolYear={targetSchoolYear}
          targetSemester={targetSemester}
          onClose={() => setCodeTarget(null)}
          onVerificationChange={(studentId: string, verification: ReEnrollmentVerification) => {
            setStudents((current) =>
              current.map((student) => {
                if (student._id !== studentId || !student.reEnrollment) return student
                return {
                  ...student,
                  reEnrollment: {
                    ...student.reEnrollment,
                    verification
                  }
                }
              })
            )
            setInfoStudent((current) =>
              current && current._id === studentId && current.reEnrollment
                ? {
                    ...current,
                    reEnrollment: {
                      ...current.reEnrollment,
                      verification
                    }
                  }
                : current
            )
            setCodeTarget((current) =>
              current && current._id === studentId && current.reEnrollment
                ? {
                    ...current,
                    reEnrollment: {
                      ...current.reEnrollment,
                      verification
                    }
                  }
                : current
            )
          }}
        />
      ) : null}

      {assignmentTarget ? (
        <BlockAssignmentModal
          students={assignmentTarget.students}
          initialStep={assignmentTarget.initialStep}
          termOverride={isReEnrollment ? { schoolYear: targetSchoolYear, semester: targetSemester } : undefined}
          requireReEnrollmentVerification={isReEnrollment}
          onClose={() => setAssignmentTarget(null)}
          onSaved={async (text) => {
            await loadStudents('refresh')
            setSelectedStudentIds([])
            setMessage({ tone: 'success', text })
          }}
        />
      ) : null}
    </>
  )
}

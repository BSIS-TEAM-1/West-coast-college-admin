import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, ChevronLeft, ChevronRight, Download, History, Search, Users } from 'lucide-react'
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
import BlockAssignmentModal from '../../components/BlockAssignmentModal'
import StudentInfoPopup from '../../components/StudentInfoPopup'
import '../../components/StudentManagement.css'

type BlockStatusFilter = 'all' | 'assigned' | 'unassigned'
type SortOption = 'name-asc' | 'name-desc' | 'id-asc' | 'course-asc' | 'year-asc'

function extractResponseList(response: unknown): StudentData[] {
  return extractResponseData<StudentData[]>(response) || []
}

export default function BlockAssignmentPage() {
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [blockStatusFilter, setBlockStatusFilter] = useState<BlockStatusFilter>('unassigned')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [infoStudent, setInfoStudent] = useState<StudentData | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<{ students: StudentData[]; initialStep: 1 | 2 } | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const deferredSearch = useDeferredValue(searchTerm)

  const loadStudents = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await StudentService.getStudents(token)
      const records = extractResponseList(response)

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
    loadStudents()
  }, [])

  const filteredStudents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()

    return students
      .filter((student) => {
        if (courseFilter !== 'all' && String(student.course) !== courseFilter) return false
        if (yearFilter !== 'all' && String(student.yearLevel) !== yearFilter) return false
        const blockLabel = String(student.section || '').trim()
        if (blockStatusFilter === 'assigned' && !blockLabel) return false
        if (blockStatusFilter === 'unassigned' && blockLabel) return false

        if (!query) return true

        const searchableText = [
          student.studentNumber,
          studentNumberDisplay(student),
          studentDisplayName(student),
          courseShortLabel(student.course),
          student.email,
          student.contactNumber,
          student.section
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
  }, [blockStatusFilter, courseFilter, deferredSearch, sortBy, students, yearFilter])

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student._id)),
    [selectedStudentIds, students]
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

  useEffect(() => {
    setCurrentPage(1)
  }, [blockStatusFilter, courseFilter, deferredSearch, rowsPerPage, sortBy, yearFilter])

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
      setMessage({ tone: 'error', text: 'Select at least one student before opening block assignment.' })
      return
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setMessage({
        tone: 'error',
        text: 'Bulk block assignment requires students from the same course and year level.'
      })
      return
    }

    setAssignmentTarget({ students: targets, initialStep })
  }

  const handleExportSelected = () => {
    const source = selectedStudents.length ? selectedStudents : filteredStudents
    if (!source.length) return

    const rows = [
      ['Student Number', 'Name', 'Course', 'Year Level', 'Block'],
      ...source.map((student) => [
        studentNumberDisplay(student),
        studentDisplayName(student),
        courseShortLabel(student.course),
        formatYearLevel(student.yearLevel),
        student.section || ''
      ])
    ]

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'block-assignment-export.csv'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="student-workspace">
        <header className="student-workspace__header">
          <div className="student-workspace__heading">
            <span className="student-workspace__eyebrow">Block assignment</span>
            <h1>Assign Block</h1>
            <p>Select students from the list, then assign them to a compatible block section.</p>
          </div>

          <div className="student-workspace__header-actions">
            <button type="button" className="student-workspace__secondary-button" onClick={() => loadStudents('refresh')} disabled={refreshing}>
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

            <label>
              <span>Course</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All courses</option>
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

            <label>
              <span>Block</span>
              <select value={blockStatusFilter} onChange={(event) => setBlockStatusFilter(event.target.value as BlockStatusFilter)}>
                <option value="all">All students</option>
                <option value="unassigned">No block</option>
                <option value="assigned">Assigned block</option>
              </select>
            </label>

            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="id-asc">Student ID</option>
                <option value="course-asc">Course</option>
                <option value="year-asc">Year level</option>
              </select>
            </label>
          </div>

          <div className="student-workspace__toolbar-actions">
            <button
              type="button"
              className="student-workspace__primary-button"
              onClick={() => openAssignmentWorkflow(selectedStudents)}
              disabled={!selectedStudents.length}
            >
              <Blocks size={16} />
              Assign Selected
            </button>
            <button type="button" className="student-workspace__secondary-button" onClick={handleExportSelected}>
              <Download size={16} />
              Export
            </button>
          </div>

          {selectedStudents.length ? (
            <div className="student-workspace__bulk-actions">
              <div>
                <span className="student-workspace__eyebrow">Ready to assign</span>
                <strong>{selectedStudents.length} selected</strong>
              </div>
              <div className="student-workspace__bulk-buttons">
                <button type="button" className="student-workspace__secondary-button" onClick={() => openAssignmentWorkflow(selectedStudents)}>
                  <Blocks size={16} />
                  Assign selected
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="student-workspace__table-card">
          <header className="student-workspace__section-heading">
            <div>
              <h2>Students for block assignment</h2>
              <p>Select one or more students, then use Assign Selected to choose a block section. Click a row for full student info.</p>
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
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select visible students"
                      />
                    </th>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Year & Block</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student) => {
                    const blockLabel = String(student.section || '').trim()
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
                            aria-label={`Select ${studentNumberDisplay(student)}`}
                          />
                        </td>
                        <td>
                          <div className="student-workspace__student-cell">
                            <span className="student-workspace__avatar" aria-hidden="true">{studentInitials(student)}</span>
                            <div>
                              <strong>{studentDisplayName(student)}</strong>
                              <span className="student-workspace__student-id">{studentNumberDisplay(student)}</span>
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
                          </div>
                        </td>
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
                <strong>No students match the current filters.</strong>
                <p>Adjust the search or filters to widen the list.</p>
              </div>
            </div>
          )}

          {!loading && filteredStudents.length ? (
            <footer className="student-workspace__pagination" aria-label="Block assignment pagination">
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
          onClose={() => setInfoStudent(null)}
          onAssignBlock={(student) => {
            setInfoStudent(null)
            openAssignmentWorkflow([student], 2)
          }}
        />
      ) : null}

      {assignmentTarget ? (
        <BlockAssignmentModal
          students={assignmentTarget.students}
          initialStep={assignmentTarget.initialStep}
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

import { useEffect, useMemo, useState } from 'react'
import { Download, Search, Send } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedCourse, ProfessorRosterClassOption, ProfessorRosterSectionOption, ProfessorRosterStudent, RosterSortBy } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'

interface StudentManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  initialClassKey?: string
  entryMode?: 'students' | 'attendance'
}

function StudentManagement({ courses, loading, error, onRefresh, initialClassKey = '', entryMode = 'students' }: StudentManagementProps) {
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [selectedSectionKey, setSelectedSectionKey] = useState('all')
  const [students, setStudents] = useState<ProfessorRosterStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all')
  const [sortBy, setSortBy] = useState<RosterSortBy>('name-asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState<ProfessorRosterStudent | null>(null)

  const formatCourseLabel = (value: string | number) => {
    const text = String(value || '').trim()
    if (!text) return ''
    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelsByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelsByCode[normalized]) return labelsByCode[normalized]
    if (normalized.includes('BEED') || normalized.includes('ELEMENTARYEDUCATION')) return 'BEED'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) {
      return 'BSED-ENGLISH'
    }
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) {
      return 'BSED-MATH'
    }
    if (
      normalized.includes('BSBA-HRM')
      || normalized === 'HRM'
      || (normalized.includes('BSBA') && normalized.includes('HRM'))
    ) {
      return 'BSBA-HRM'
    }
    return text
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    return `${formatCourseLabel(courseCode)} ${sectionCode}`.trim()
  }

  const classOptions = useMemo<ProfessorRosterClassOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .flatMap((block) => {
          return block.subjects.map((subject) => {
            const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
            return {
              key: `${course.courseCode}|${block.sectionId}|${subject.subjectId}`,
              courseCode: course.courseCode,
              blockCode,
              sectionId: block.sectionId as string,
              sectionCode: block.sectionCode,
              semester: block.semester,
              schoolYear: block.schoolYear,
              yearLevel: block.yearLevel,
              subjectId: subject.subjectId,
              subjectCode: subject.code,
              subjectTitle: subject.title,
              schedule: subject.schedule || 'TBA',
              room: subject.room || 'TBA'
            }
          })
        })
    })
  }, [courses])

  const sectionOptions = useMemo<ProfessorRosterSectionOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .map((block) => ({
          key: `${course.courseCode}|${block.sectionId}`,
          courseCode: course.courseCode,
          blockCode: formatBlockCode(course.courseCode, block.sectionCode),
          sectionId: block.sectionId as string,
          sectionCode: block.sectionCode,
          semester: block.semester,
          schoolYear: block.schoolYear,
          yearLevel: block.yearLevel,
          subjectCount: block.subjects.length,
          subjects: block.subjects.map((subject) => ({
            subjectId: subject.subjectId,
            subjectCode: subject.code,
            subjectTitle: subject.title,
            schedule: subject.schedule || 'TBA',
            room: subject.room || 'TBA'
          }))
        }))
    })
  }, [courses])

  const selectedClass = useMemo(
    () => classOptions.find((item) => item.key === selectedClassKey) || null,
    [classOptions, selectedClassKey]
  )

  const selectedSection = useMemo(
    () => sectionOptions.find((item) => item.key === selectedSectionKey) || null,
    [sectionOptions, selectedSectionKey]
  )

  useEffect(() => {
    if (!initialClassKey) return
    const matchedClass = classOptions.find((item) => item.key === initialClassKey)
    if (matchedClass) {
      setSelectedClassKey(initialClassKey)
      setSelectedSectionKey(`${matchedClass.courseCode}|${matchedClass.sectionId}`)
      setSearchQuery('')
      setStatusFilter('all')
      setSortBy('name-asc')
      setCurrentPage(1)
    }
  }, [classOptions, initialClassKey])

  useEffect(() => {
    const active = classOptions.some((item) => item.key === selectedClassKey)
    if (!active && selectedClassKey) {
      setSelectedClassKey('')
    }
  }, [classOptions, selectedClassKey])

  useEffect(() => {
    if (selectedSectionKey === 'all') return
    const active = sectionOptions.some((item) => item.key === selectedSectionKey)
    if (!active) {
      setSelectedSectionKey('all')
    }
  }, [sectionOptions, selectedSectionKey])

  const getName = (student: ProfessorRosterStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getStudentCourseDisplay = (student?: ProfessorRosterStudent | null) => {
    const rawCourse = String(student?.course || selectedSection?.courseCode || selectedClass?.courseCode || '').trim()
    return formatCourseLabel(rawCourse) || rawCourse || 'N/A'
  }

  const normalizeCourseCode = (courseCode: string) => {
    const normalized = String(courseCode || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return ''
    if (/^\d{3,5}$/.test(normalized)) return normalized
    if (normalized.includes('BEED')) return '101'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) return '102'
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM' || (normalized.includes('BSBA') && normalized.includes('HRM'))) return '201'
    return normalized.slice(0, 3) || 'COURSE'
  }

  const formatStudentNumber = (rawValue: string | number, fallbackCourseCode: string) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return ''
    const cleaned = raw.replace(/\s+/g, '')
    if (!/[A-Za-z]/.test(cleaned) && /^\d{4,}/.test(cleaned)) {
      const compact = cleaned.replace(/\D+/g, '')
      if (compact.length >= 9) {
        const year = compact.slice(0, 4)
        const seq = compact.slice(-5).padStart(5, '0')
        return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
      }
    }

    const parts = cleaned.split('-').filter(Boolean)
    if (parts.length >= 3) {
      const year = parts[0] || '0000'
      const seq = parts[parts.length - 1] || '00000'
      const sourceCode = parts.find((part) => /[A-Za-z]/.test(part)) || fallbackCourseCode
      return `${year}-${normalizeCourseCode(sourceCode)}-${String(seq).slice(-5).padStart(5, '0')}`
    }

    const firstDigits = cleaned.replace(/\D+/g, '')
    const year = firstDigits.slice(0, 4) || '0000'
    const seq = firstDigits.slice(-5).padStart(5, '0')
    return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
  }

  const rosterTargets = useMemo(() => {
    if (selectedSection) {
      return [selectedSection]
    }
    return sectionOptions
  }, [sectionOptions, selectedSection])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchStudents = async () => {
      if (rosterTargets.length === 0) {
        setStudents([])
        setStudentsError('')
        return
      }

      try {
        setStudentsLoading(true)
        setStudentsError('')

        const token = await getStoredToken()
        if (!token) {
          setStudents([])
          setStudentsError('You are not logged in.')
          return
        }

        const responses = await Promise.all(rosterTargets.flatMap((target) => {
          const matchedSubjectContext = selectedClass?.sectionId === target.sectionId ? selectedClass : null
          const subjectContexts = matchedSubjectContext
            ? [matchedSubjectContext]
            : target.subjects.map((subject) => ({
                key: `${target.courseCode}|${target.sectionId}|${subject.subjectId}`,
                courseCode: target.courseCode,
                blockCode: target.blockCode,
                sectionId: target.sectionId,
                sectionCode: target.sectionCode,
                semester: target.semester,
                schoolYear: target.schoolYear,
                yearLevel: target.yearLevel,
                subjectId: subject.subjectId,
                subjectCode: subject.subjectCode,
                subjectTitle: subject.subjectTitle,
                schedule: subject.schedule,
                room: subject.room
              }))

          return subjectContexts.map(async (subjectContext) => {
            const query = new URLSearchParams({
              semester: subjectContext.semester,
              schoolYear: subjectContext.schoolYear
            })
            const endpoint = `${API_URL}/api/professor/sections/${target.sectionId}/subjects/${subjectContext.subjectId}/students?${query.toString()}`

            const response = await fetchWithAutoReconnect(endpoint, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            })

            if (!response.ok) {
              throw new Error(`Failed to fetch students: ${response.status}`)
            }

            const payload = await response.json().catch(() => ({}))
            const rosterRows = Array.isArray(payload?.data?.students) ? payload.data.students : []
            return { target, subjectContext, rosterRows }
          })
        }))

        const normalized = responses.flatMap(({ target, subjectContext, rosterRows }) => {
          return rosterRows.map((raw: any, index: number) => {
            const yearLevel = typeof raw?.yearLevel === 'number' ? raw.yearLevel : Number(raw?.yearLevel)
            const rawId = String(raw?._id || raw?.id || raw?.studentNumber || raw?.studentId || index)
            return {
              _id: String(raw?._id || raw?.id || ''),
              rosterEntryKey: `${target.sectionId}-${subjectContext.subjectId}-${rawId}-${index}`,
              enrollmentId: raw?.enrollmentId ? String(raw.enrollmentId) : undefined,
              subjectEntryId: raw?.subjectEntryId ? String(raw.subjectEntryId) : undefined,
              studentNumber: formatStudentNumber(
                raw?.studentNumber || raw?.studentId || '',
                target.courseCode
              ),
              firstName: String(raw?.firstName || ''),
              middleName: raw?.middleName ? String(raw.middleName) : '',
              lastName: String(raw?.lastName || ''),
              suffix: raw?.suffix ? String(raw.suffix) : '',
              yearLevel: Number.isFinite(yearLevel) ? yearLevel : undefined,
              studentStatus: raw?.studentStatus || raw?.status || 'Active',
              course: target.courseCode || raw?.course || '',
              email: raw?.email || 'Not provided',
              contactNumber: raw?.contactNumber || 'Not provided',
              assignedAt: raw?.assignedAt,
              attendancePercentage: raw?.attendancePercentage,
              latestGrade: raw?.latestGrade,
              currentGrade: raw?.currentGrade ?? raw?.grade ?? '',
              remarks: raw?.remarks || '',
              attendanceRecord: Array.isArray(raw?.attendanceRecord) ? raw.attendanceRecord : undefined,
              quizScores: Array.isArray(raw?.quizScores) ? raw.quizScores : undefined,
              assignmentScores: Array.isArray(raw?.assignmentScores) ? raw.assignmentScores : undefined,
              classBlockCode: target.blockCode,
              classSectionCode: target.sectionCode,
              classSubjectCode: raw?.classSubjectCode || subjectContext.subjectCode || '',
              classSubjectTitle: raw?.classSubjectTitle || subjectContext.subjectTitle || '',
              classSemester: target.semester,
              classSchoolYear: target.schoolYear,
              subjectStatus: raw?.subjectStatus ? String(raw.subjectStatus) : undefined,
              gradeUpdatedAt: raw?.gradeUpdatedAt ? String(raw.gradeUpdatedAt) : undefined
            } as ProfessorRosterStudent
          })
        })
        const visibleRosterRows = selectedClass
          ? normalized
          : Array.from(
              normalized.reduce((rowsByStudent, row) => {
                const key = `${row.classSectionCode || ''}|${row._id || row.studentNumber}`
                if (!rowsByStudent.has(key)) {
                  rowsByStudent.set(key, row)
                }
                return rowsByStudent
              }, new Map<string, ProfessorRosterStudent>()).values()
            )

        if (!cancelled) {
          setStudents(visibleRosterRows)
          setCurrentPage(1)
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        if (!cancelled) {
          if (!isNetworkRequestError(error)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(error)
              ? buildReconnectMessage('the student roster')
              : (error instanceof Error ? error.message : 'Failed to load students for selected class.')
          )
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchStudents()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [rosterTargets, selectedClass])

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let result = [...students]

    if (query) {
      result = result.filter((student) => {
        const studentName = getName(student).toLowerCase()
        return (
          studentName.includes(query) ||
          String(student.studentNumber).toLowerCase().includes(query) ||
          String(student.course || '').toLowerCase().includes(query) ||
          getStudentCourseDisplay(student).toLowerCase().includes(query) ||
          String(student.classBlockCode || '').toLowerCase().includes(query) ||
          String(student.classSubjectCode || '').toLowerCase().includes(query) ||
          String(student.classSubjectTitle || '').toLowerCase().includes(query)
        )
      })
    }

    if (statusFilter !== 'all') {
      result = result.filter((student) => {
        const status = String(student.studentStatus || student.status || '').toLowerCase()
        if (statusFilter === 'active') {
          return status.includes('active')
        }
        return status.includes('drop') || status.includes('dropped')
      })
    }

    switch (sortBy) {
      case 'name-desc':
        result.sort((a, b) => getName(b).localeCompare(getName(a), undefined, { sensitivity: 'base' }))
        break
      case 'id-asc':
        result.sort((a, b) => String(a.studentNumber).localeCompare(String(b.studentNumber), undefined, { numeric: true }))
        break
      case 'id-desc':
        result.sort((a, b) => String(b.studentNumber).localeCompare(String(a.studentNumber), undefined, { numeric: true }))
        break
      case 'name-asc':
      default:
        result.sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }))
        break
    }
    return result
  }, [students, searchQuery, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / 10))
  const currentPageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10)
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const totalStudents = students.length
  const hasGrades = students.some((student) => student.currentGrade || student.latestGrade)
  const rosterScopeLabel = selectedSection ? selectedSection.blockCode : 'All assigned classes'
  const rosterProgramCount = new Set(rosterTargets.map((target) => String(target.courseCode || '').trim()).filter(Boolean)).size
  const rosterClassCount = rosterTargets.length

  const gradeTotals = students
    .map((student) => Number(student.currentGrade ?? student.latestGrade))
    .filter((value) => Number.isFinite(value))

  const classAverageGrade = gradeTotals.length > 0
    ? (gradeTotals.reduce((sum, value) => sum + value, 0) / gradeTotals.length).toFixed(2)
    : 'N/A'

  const exportRoster = () => {
    if (students.length === 0) {
      return
    }
    const rows = students.map((student) => [
      formatStudentNumber(student.studentNumber, String(student.course || selectedSection?.courseCode || selectedClass?.courseCode || '')),
      getName(student),
      getStudentCourseDisplay(student),
      String(student.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'),
      String(student.yearLevel ?? ''),
      student.email || '',
      String(student.currentGrade ?? student.latestGrade ?? ''),
      student.studentStatus || 'Active'
    ])
    const header = ['Student ID', 'Full Name', 'Program/Course', 'Block / Section', 'Year Level', 'Email', 'Current Grade', 'Status']
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = selectedClass
      ? `${selectedClass.subjectCode}-${selectedClass.sectionCode}-roster.csv`
      : selectedSection
        ? `${selectedSection.blockCode}-roster.csv`
        : 'assigned-students-roster.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const sendAnnouncement = () => {
    if (!selectedClass) return
    alert(`Announcement form for ${selectedClass.subjectCode} ${selectedClass.sectionCode} will be available in the class communication module.`)
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <p>Loading your assigned classes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <p className="professor-data-error">{error}</p>
        <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Retry</button>
      </div>
    )
  }

  if (classOptions.length === 0) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <div className="placeholder-card">
          <h3>No assigned class found</h3>
          <p>No classes are currently assigned to your account.</p>
          <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Refresh Assignments</button>
        </div>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Student Roster</h2>
      <p className="professor-section-desc">View enrolled students for your assigned courses.</p>

      <div className="professor-roster-controls">
        <div className="professor-roster-class-select">
          <label htmlFor="professor-class-select">Block / Section Filter</label>
          <select
            id="professor-class-select"
            value={selectedSectionKey}
            onChange={(event) => {
              const nextValue = event.target.value
              setSelectedSectionKey(nextValue)
              if (nextValue === 'all') {
                setSelectedClassKey('')
              } else if (selectedClass && `${selectedClass.courseCode}|${selectedClass.sectionId}` !== nextValue) {
                setSelectedClassKey('')
              }
              setSearchQuery('')
              setStatusFilter('all')
              setSortBy('name-asc')
              setCurrentPage(1)
            }}
          >
            <option value="all">All assigned classes</option>
            {sectionOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.blockCode} - {option.subjectCount} subject(s)
              </option>
            ))}
          </select>
        </div>

        <div className="professor-tool-actions">
          <button
            type="button"
            className="professor-btn"
            onClick={exportRoster}
            disabled={students.length === 0}
          >
            <Download size={14} />
            Export Roster
          </button>
          {selectedClass && (
            <button
              type="button"
              className="professor-btn professor-btn-secondary"
              onClick={sendAnnouncement}
            >
              <Send size={14} />
              Send Announcement to Class
            </button>
          )}
        </div>
      </div>

      {entryMode === 'attendance' && selectedClass && (
        <div className="professor-inline-note">
          Attendance quick access is open for <strong>{selectedClass.subjectCode}</strong>. Review each student profile for any attendance data currently available.
        </div>
      )}

      <>
        <div className="professor-class-overview">
          <div className="professor-overview-row"><span>Scope</span><strong>{rosterScopeLabel}</strong></div>
          <div className="professor-overview-row"><span>Subject</span><strong>{selectedClass ? `${selectedClass.subjectCode} - ${selectedClass.subjectTitle}` : 'All subjects in view'}</strong></div>
          <div className="professor-overview-row"><span>Schedule</span><strong>{selectedClass ? selectedClass.schedule : 'Mixed schedules'}</strong></div>
          <div className="professor-overview-row"><span>Semester / School Year</span><strong>{selectedSection ? `${selectedSection.semester} / ${selectedSection.schoolYear}` : 'Across assigned classes'}</strong></div>
          <div className="professor-overview-row"><span>Visible Classes</span><strong>{rosterClassCount}</strong></div>
          <div className="professor-overview-row"><span>Total Students</span><strong>{totalStudents}</strong></div>
        </div>

        <div className="professor-summary-grid">
          <div className="professor-summary-card">
            <span>Total Students</span>
            <strong>{totalStudents}</strong>
          </div>
          <div className="professor-summary-card">
            <span>Programs / Courses</span>
            <strong>{rosterProgramCount}</strong>
          </div>
          <div className="professor-summary-card">
            <span>Class Average Grade</span>
            <strong>{classAverageGrade}</strong>
            {!hasGrades && <small>not available</small>}
          </div>
        </div>

        <div className="professor-roster-toolbar">
          <div className="professor-roster-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search name, student ID, course, section, or subject"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | 'active' | 'dropped')
                setCurrentPage(1)
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="dropped">Dropped</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as RosterSortBy)
                setCurrentPage(1)
              }}
            >
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="id-asc">Student ID</option>
              <option value="id-desc">Student ID (desc)</option>
            </select>
          </label>
        </div>

        <div className="professor-table-wrap">
          <table className="professor-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Program / Course</th>
                <th>Block / Section</th>
                <th>Year Level</th>
                <th>Email</th>
                <th>Current Grade</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading ? (
                <tr>
                  <td colSpan={9}>Loading students...</td>
                </tr>
              ) : studentsError ? (
                <tr>
                  <td colSpan={9} className="professor-data-error">{studentsError}</td>
                </tr>
              ) : currentPageStudents.length === 0 ? (
                <tr>
                  <td colSpan={9}>No students matched the current filters.</td>
                </tr>
              ) : (
                currentPageStudents.map((student) => (
                  <tr key={student.rosterEntryKey}>
                    <td>{student.studentNumber}</td>
                    <td>{getName(student)}</td>
                    <td>{getStudentCourseDisplay(student)}</td>
                    <td>{student.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'}</td>
                    <td>{student.yearLevel ?? 'N/A'}</td>
                    <td>{student.email || 'Not provided'}</td>
                    <td>{student.currentGrade ?? student.latestGrade ?? 'N/A'}</td>
                    <td>{student.studentStatus || student.status || 'Active'}</td>
                    <td className="professor-table-actions">
                      <button type="button" className="professor-btn-xs" onClick={() => setSelectedStudent(student)}>
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {currentPageStudents.length > 0 && (
          <div className="professor-pagination">
            <button type="button" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={!canGoPrev}>
              Prev
            </button>
            <span>{`Page ${currentPage} of ${totalPages}`}</span>
            <button type="button" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={!canGoNext}>
              Next
            </button>
          </div>
        )}
      </>

      {selectedStudent && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedStudent(null)}>
          <div className="professor-student-modal" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>Student Profile</h3>
              <button type="button" className="professor-btn-xs" onClick={() => setSelectedStudent(null)}>
                Close
              </button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Full Name:</strong> {getName(selectedStudent)}</div>
                <div><strong>Student ID:</strong> {selectedStudent.studentNumber}</div>
                <div><strong>Program / Course:</strong> {getStudentCourseDisplay(selectedStudent)}</div>
                <div><strong>Year Level:</strong> {selectedStudent.yearLevel ?? 'N/A'}</div>
                <div><strong>Block / Section:</strong> {selectedStudent.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'}</div>
                <div><strong>Subject:</strong> {selectedStudent.classSubjectCode ? `${selectedStudent.classSubjectCode} - ${selectedStudent.classSubjectTitle || 'Untitled subject'}` : 'Multiple subjects in view'}</div>
                <div><strong>Email:</strong> {selectedStudent.email || 'Not provided'}</div>
                <div><strong>Contact Number:</strong> {selectedStudent.contactNumber || 'Not provided'}</div>
                <div><strong>Enrollment Status:</strong> {selectedStudent.studentStatus || selectedStudent.status || 'Active'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentManagement

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedCourse, ProfessorRosterClassOption, ProfessorRosterStudent } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'

interface GradesManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  initialClassKey?: string
}

function GradesManagement({ courses, loading, error, onRefresh, initialClassKey = '' }: GradesManagementProps) {
  type GradeSortBy = 'name-asc' | 'name-desc' | 'grade-asc' | 'grade-desc'

  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [students, setStudents] = useState<ProfessorRosterStudent[]>([])
  const [selectedStudent, setSelectedStudent] = useState<ProfessorRosterStudent | null>(null)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<GradeSortBy>('name-asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [savingStudentIds, setSavingStudentIds] = useState<string[]>([])
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({})
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [pendingFocusStudentId, setPendingFocusStudentId] = useState('')
  const gradeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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

    const compact = cleaned.replace(/\D+/g, '')
    const year = compact.slice(0, 4) || '0000'
    const seq = compact.slice(-5).padStart(5, '0')
    return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    return `${formatCourseLabel(courseCode)} ${sectionCode}`.trim()
  }

  const classOptions = useMemo<ProfessorRosterClassOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .flatMap((block) => {
          return block.subjects.map((subject) => ({
            key: `${course.courseCode}|${block.sectionId}|${subject.subjectId}`,
            courseCode: course.courseCode,
            blockCode: formatBlockCode(course.courseCode, block.sectionCode),
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
          }))
        })
    })
  }, [courses])

  const selectedClass = useMemo(
    () => classOptions.find((item) => item.key === selectedClassKey) || null,
    [classOptions, selectedClassKey]
  )

  useEffect(() => {
    if (!initialClassKey) return
    const matchedClass = classOptions.find((item) => item.key === initialClassKey)
    if (matchedClass) {
      setSelectedClassKey(initialClassKey)
      setSearchQuery('')
      setSortBy('name-asc')
      setCurrentPage(1)
    }
  }, [classOptions, initialClassKey])

  useEffect(() => {
    if (selectedClassKey && classOptions.some((item) => item.key === selectedClassKey)) {
      return
    }

    if (classOptions.length > 0) {
      setSelectedClassKey(classOptions[0].key)
      setCurrentPage(1)
    } else if (selectedClassKey) {
      setSelectedClassKey('')
    }
  }, [classOptions, selectedClassKey])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchStudents = async () => {
      if (!selectedClass) {
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

        const query = new URLSearchParams({
          semester: selectedClass.semester,
          schoolYear: selectedClass.schoolYear
        })

        const response = await fetchWithAutoReconnect(
          `${API_URL}/api/professor/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/students?${query.toString()}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || `Failed to fetch class grades: ${response.status}`)
        }

        const rows = Array.isArray(payload?.data?.students) ? payload.data.students : []
        const normalized = rows.map((raw: any, index: number) => {
          const yearLevel = typeof raw?.yearLevel === 'number' ? raw.yearLevel : Number(raw?.yearLevel)
          const rawId = String(raw?._id || raw?.id || raw?.studentNumber || index)
          return {
            _id: String(raw?._id || raw?.id || ''),
            rosterEntryKey: `${selectedClass.sectionId}-${selectedClass.subjectId}-${rawId}-${index}`,
            enrollmentId: raw?.enrollmentId ? String(raw.enrollmentId) : undefined,
            subjectEntryId: raw?.subjectEntryId ? String(raw.subjectEntryId) : undefined,
            studentNumber: formatStudentNumber(raw?.studentNumber || '', selectedClass.courseCode),
            firstName: String(raw?.firstName || ''),
            middleName: raw?.middleName ? String(raw.middleName) : '',
            lastName: String(raw?.lastName || ''),
            suffix: raw?.suffix ? String(raw.suffix) : '',
            yearLevel: Number.isFinite(yearLevel) ? yearLevel : undefined,
            studentStatus: raw?.studentStatus || raw?.status || 'Active',
            course: raw?.course || selectedClass.courseCode,
            corStatus: raw?.corStatus || 'Pending',
            currentGrade: raw?.currentGrade ?? '',
            remarks: raw?.remarks || '',
            classBlockCode: selectedClass.blockCode,
            classSectionCode: selectedClass.sectionCode,
            classSubjectCode: raw?.classSubjectCode || selectedClass.subjectCode,
            classSubjectTitle: raw?.classSubjectTitle || selectedClass.subjectTitle,
            classSemester: selectedClass.semester,
            classSchoolYear: selectedClass.schoolYear,
            subjectStatus: raw?.subjectStatus ? String(raw.subjectStatus) : 'Enrolled',
            gradeUpdatedAt: raw?.gradeUpdatedAt ? String(raw.gradeUpdatedAt) : undefined
          } as ProfessorRosterStudent
        })

        if (!cancelled) {
          setStudents(normalized)
          setCurrentPage(1)
        }
      } catch (loadError) {
        if (isAbortRequestError(loadError)) {
          return
        }

        if (!cancelled) {
          if (!isNetworkRequestError(loadError)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(loadError)
              ? buildReconnectMessage('class grades')
              : (loadError instanceof Error ? loadError.message : 'Failed to load class grades.')
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
  }, [selectedClass])

  useEffect(() => {
    setGradeDrafts(
      Object.fromEntries(
        students.map((student) => [
          student._id,
          student.currentGrade === undefined || student.currentGrade === null || student.currentGrade === ''
            ? ''
            : String(student.currentGrade)
        ])
      )
    )
    setRemarkDrafts(
      Object.fromEntries(
        students.map((student) => [student._id, String(student.remarks || '')])
      )
    )
  }, [students])

  const getName = (student: ProfessorRosterStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getStudentCourseDisplay = (student?: ProfessorRosterStudent | null) => {
    const rawCourse = String(student?.course || selectedClass?.courseCode || '').trim()
    return formatCourseLabel(rawCourse) || rawCourse || 'N/A'
  }

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
          String(student.subjectStatus || '').toLowerCase().includes(query)
        )
      })
    }

    switch (sortBy) {
      case 'name-desc':
        result.sort((a, b) => getName(b).localeCompare(getName(a), undefined, { sensitivity: 'base' }))
        break
      case 'grade-asc':
        result.sort((a, b) => {
          const left = Number(a.currentGrade)
          const right = Number(b.currentGrade)
          const leftValue = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY
          const rightValue = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY
          if (leftValue !== rightValue) return leftValue - rightValue
          return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' })
        })
        break
      case 'grade-desc':
        result.sort((a, b) => {
          const left = Number(a.currentGrade)
          const right = Number(b.currentGrade)
          const leftValue = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY
          const rightValue = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY
          if (leftValue !== rightValue) return rightValue - leftValue
          return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' })
        })
        break
      case 'name-asc':
      default:
        result.sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }))
        break
    }

    return result
  }, [searchQuery, sortBy, students])

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / 10))
  const currentPageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10)
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!pendingFocusStudentId) return

    const targetInput = gradeInputRefs.current[pendingFocusStudentId]
    if (!targetInput) return

    targetInput.focus()
    targetInput.select()
    setPendingFocusStudentId('')
  }, [currentPageStudents, pendingFocusStudentId])

  const gradeValues = students
    .map((student) => Number(student.currentGrade))
    .filter((value) => Number.isFinite(value))

  const gradedCount = gradeValues.length
  const pendingCount = Math.max(students.length - gradedCount, 0)
  const averageGrade = gradeValues.length > 0
    ? (gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length).toFixed(2)
    : 'N/A'

  const formatGradeUpdatedAt = (value?: string) => {
    if (!value) return 'Not graded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Not graded' : date.toLocaleString()
  }

  const hasDraftChanges = (student: ProfessorRosterStudent) => {
    const gradeDraft = String(gradeDrafts[student._id] ?? '')
    const currentGrade = student.currentGrade === undefined || student.currentGrade === null ? '' : String(student.currentGrade)
    const remarkDraft = String(remarkDrafts[student._id] ?? '')
    const currentRemark = String(student.remarks || '')
    return gradeDraft !== currentGrade || remarkDraft !== currentRemark
  }

  const saveGrade = async (student: ProfessorRosterStudent) => {
    if (!selectedClass) return

    const rawGrade = String(gradeDrafts[student._id] ?? '').trim()
    const nextGrade = rawGrade === '' ? null : Number(rawGrade)
    if (nextGrade !== null && (!Number.isFinite(nextGrade) || nextGrade < 1 || nextGrade > 5)) {
      setMessageTone('error')
      setMessage(`Invalid grade for ${getName(student)}. Use 1.0 to 5.0, or leave it blank.`)
      return
    }

    try {
      setSavingStudentIds((current) => current.includes(student._id) ? current : [...current, student._id])
      const token = await getStoredToken()
      if (!token) {
        throw new Error('You are not logged in.')
      }

      const response = await fetchWithAutoReconnect(
        `${API_URL}/api/professor/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/students/${student._id}/grade`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grade: nextGrade,
            remarks: String(remarkDrafts[student._id] ?? ''),
            semester: selectedClass.semester,
            schoolYear: selectedClass.schoolYear
          })
        }
      )

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save grade.')
      }

      const updated = payload?.data || {}
      setStudents((current) => current.map((entry) => {
        if (entry._id !== student._id) return entry
        return {
          ...entry,
          enrollmentId: updated?.enrollmentId ? String(updated.enrollmentId) : entry.enrollmentId,
          subjectEntryId: updated?.subjectEntryId ? String(updated.subjectEntryId) : entry.subjectEntryId,
          currentGrade: updated?.currentGrade ?? '',
          remarks: updated?.remarks || '',
          subjectStatus: updated?.subjectStatus || entry.subjectStatus,
          gradeUpdatedAt: updated?.gradeUpdatedAt ? String(updated.gradeUpdatedAt) : entry.gradeUpdatedAt
        }
      }))
      setGradeDrafts((current) => ({
        ...current,
        [student._id]: updated?.currentGrade === undefined || updated?.currentGrade === null ? '' : String(updated.currentGrade)
      }))
      setRemarkDrafts((current) => ({
        ...current,
        [student._id]: String(updated?.remarks || '')
      }))
      setMessageTone('info')
      setMessage(`Published grade for ${getName(student)}.`)
    } catch (saveError) {
      setMessageTone('error')
      setMessage(
        isNetworkRequestError(saveError)
          ? buildReconnectMessage('the grade update')
          : (saveError instanceof Error ? saveError.message : 'Failed to save grade.')
      )
    } finally {
      setSavingStudentIds((current) => current.filter((value) => value !== student._id))
    }
  }

  const goToNextGrade = (student: ProfessorRosterStudent) => {
    const currentIndex = filteredStudents.findIndex((entry) => entry._id === student._id)
    if (currentIndex < 0) return

    const nextStudent = filteredStudents[currentIndex + 1]
    if (!nextStudent) return

    const nextPage = Math.floor((currentIndex + 1) / 10) + 1
    setCurrentPage(nextPage)
    setPendingFocusStudentId(nextStudent._id)
  }

  const exportGrades = () => {
    if (!selectedClass || students.length === 0) return

    const rows = students.map((student) => [
      student.studentNumber,
      getName(student),
      getStudentCourseDisplay(student),
      String(student.yearLevel ?? ''),
      student.studentStatus || 'Active',
      String(student.currentGrade ?? ''),
      student.remarks || '',
      String(student.subjectStatus || ''),
      formatGradeUpdatedAt(student.gradeUpdatedAt)
    ])

    const header = ['Student ID', 'Full Name', 'Program/Course', 'Year Level', 'Status', 'Grade', 'Remarks', 'Subject Status', 'Last Updated']
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedClass.subjectCode}-${selectedClass.sectionCode}-grades.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <p>Loading your assigned classes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <p className="professor-data-error">{error}</p>
        <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Retry</button>
      </div>
    )
  }

  if (classOptions.length === 0) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <div className="placeholder-card">
          <h3>No assigned class found</h3>
          <p>No classes are currently assigned to your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Grades</h2>
      <p className="professor-section-desc">Manage subject grades directly from each student&apos;s enrolled subject entry.</p>

      <div className="professor-roster-controls">
        <div className="professor-roster-class-select">
          <label htmlFor="professor-grade-class-select">Class / Subject</label>
          <select
            id="professor-grade-class-select"
            value={selectedClassKey}
            onChange={(event) => {
              setSelectedClassKey(event.target.value)
              setSearchQuery('')
              setSortBy('name-asc')
              setCurrentPage(1)
              setMessage('')
            }}
          >
            {classOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.blockCode} • {option.subjectCode} - {option.subjectTitle}
              </option>
            ))}
          </select>
        </div>

        <div className="professor-tool-actions">
          <button
            type="button"
            className="professor-btn"
            onClick={exportGrades}
            disabled={students.length === 0}
          >
            <Download size={14} />
            Export Grades
          </button>
        </div>
      </div>

      {message ? (
        <div className={messageTone === 'error' ? 'professor-data-error' : 'professor-inline-note'}>
          {message}
        </div>
      ) : null}

      {selectedClass && (
        <>
          <div className="professor-class-overview">
            <div className="professor-overview-row"><span>Block</span><strong>{selectedClass.blockCode}</strong></div>
            <div className="professor-overview-row"><span>Subject</span><strong>{selectedClass.subjectCode} - {selectedClass.subjectTitle}</strong></div>
            <div className="professor-overview-row"><span>Schedule</span><strong>{selectedClass.schedule || 'TBA'}</strong></div>
            <div className="professor-overview-row"><span>Room</span><strong>{selectedClass.room || 'TBA'}</strong></div>
            <div className="professor-overview-row"><span>Semester / School Year</span><strong>{selectedClass.semester} / {selectedClass.schoolYear}</strong></div>
            <div className="professor-overview-row"><span>Year Level</span><strong>{selectedClass.yearLevel ?? 'N/A'}</strong></div>
          </div>

          <div className="professor-summary-grid">
            <div className="professor-summary-card">
              <span>Enrolled Students</span>
              <strong>{students.length}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Graded</span>
              <strong>{gradedCount}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Pending Grade</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Average Grade</span>
              <strong>{averageGrade}</strong>
            </div>
          </div>
        </>
      )}

      <div className="professor-roster-toolbar">
        <div className="professor-roster-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search name, student ID, course, or status"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
        <label>
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as GradeSortBy)
              setCurrentPage(1)
            }}
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="grade-asc">Lowest grade</option>
            <option value="grade-desc">Highest grade</option>
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
              <th>Year Level</th>
              <th>Status</th>
              <th>Grade</th>
              <th>Remarks</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studentsLoading ? (
              <tr>
                <td colSpan={9}>Loading grades...</td>
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
              currentPageStudents.map((student) => {
                const isSaving = savingStudentIds.includes(student._id)
                return (
                  <tr key={student.rosterEntryKey}>
                    <td>{student.studentNumber}</td>
                    <td>{getName(student)}</td>
                    <td>{getStudentCourseDisplay(student)}</td>
                    <td>{student.yearLevel ?? 'N/A'}</td>
                    <td>{student.subjectStatus || student.studentStatus || 'Enrolled'}</td>
                    <td>
                      <div className="professor-grade-cell">
                        <input
                          ref={(element) => {
                            gradeInputRefs.current[student._id] = element
                          }}
                          type="number"
                          min="1"
                          max="5"
                          step="0.25"
                          value={gradeDrafts[student._id] ?? ''}
                          onChange={(event) => {
                            setGradeDrafts((current) => ({
                              ...current,
                              [student._id]: event.target.value
                            }))
                          }}
                          placeholder="1.00"
                        />
                        <div className="professor-grade-cell-actions">
                          <button
                            type="button"
                            className="professor-btn-xs"
                            onClick={() => void saveGrade(student)}
                            disabled={isSaving || !hasDraftChanges(student)}
                          >
                            {isSaving ? 'Saving...' : 'Publish Grade'}
                          </button>
                          <button
                            type="button"
                            className="professor-btn-xs professor-btn-secondary"
                            onClick={() => goToNextGrade(student)}
                            disabled={isSaving || filteredStudents[filteredStudents.length - 1]?._id === student._id}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={remarkDrafts[student._id] ?? ''}
                        onChange={(event) => {
                          setRemarkDrafts((current) => ({
                            ...current,
                            [student._id]: event.target.value
                          }))
                        }}
                        placeholder="Optional remarks"
                      />
                    </td>
                    <td>{formatGradeUpdatedAt(student.gradeUpdatedAt)}</td>
                    <td className="professor-table-actions">
                      <button
                        type="button"
                        className="professor-btn-xs professor-btn-secondary"
                        onClick={() => setSelectedStudent(student)}
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                )
              })
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
                <div><strong>Block / Section:</strong> {selectedStudent.classBlockCode || selectedClass?.blockCode || 'N/A'}</div>
                <div><strong>Subject:</strong> {selectedStudent.classSubjectCode ? `${selectedStudent.classSubjectCode} - ${selectedStudent.classSubjectTitle || 'Untitled subject'}` : (selectedClass ? `${selectedClass.subjectCode} - ${selectedClass.subjectTitle}` : 'N/A')}</div>
                <div><strong>Enrollment Status:</strong> {selectedStudent.studentStatus || selectedStudent.status || 'Active'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GradesManagement

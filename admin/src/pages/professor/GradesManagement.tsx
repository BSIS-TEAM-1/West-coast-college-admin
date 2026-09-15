import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search, Edit3, Send, FileText, ChevronLeft, ChevronRight, X, Info, AlertCircle } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedCourse, ProfessorRosterClassOption, ProfessorRosterStudent } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'
import GradeChangeRequestModal from '../../components/GradeChangeRequestModal'
import './GradesManagement.css'

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
  const [gradeMarkDrafts, setGradeMarkDrafts] = useState<Record<string, string>>({})
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [pendingFocusStudentId, setPendingFocusStudentId] = useState('')
  const [submittingGrades, setSubmittingGrades] = useState(false)
  const [gradeSubmissionStatus, setGradeSubmissionStatus] = useState<string>('Draft')
  const [changeRequestStudent, setChangeRequestStudent] = useState<ProfessorRosterStudent | null>(null)
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
        .filter((block) => Boolean(block.sectionId) || block.needsBlockAssignment)
        .flatMap((block) => {
          const sectionId = block.sectionId || `unassigned-${block.sectionCode}-${block.semester}-${block.schoolYear}`
          return block.subjects.map((subject) => ({
            key: `${course.courseCode}|${sectionId}|${subject.subjectId}`,
            courseCode: course.courseCode,
            blockCode: formatBlockCode(course.courseCode, block.sectionCode),
            sectionId: block.sectionId || sectionId,
            sectionCode: block.sectionCode,
            semester: block.semester,
            schoolYear: block.schoolYear,
            yearLevel: block.yearLevel,
            subjectId: subject.subjectId,
            subjectCode: subject.code,
            subjectTitle: subject.title,
            schedule: subject.schedule || 'TBA',
            room: subject.room || 'TBA',
            needsBlockAssignment: block.needsBlockAssignment || false
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
            currentGradeMark: raw?.currentGradeMark ?? null,
            remarks: raw?.remarks || '',
            classBlockCode: selectedClass.blockCode,
            classSectionCode: selectedClass.sectionCode,
            classSubjectCode: raw?.classSubjectCode || selectedClass.subjectCode,
            classSubjectTitle: raw?.classSubjectTitle || selectedClass.subjectTitle,
            classSemester: selectedClass.semester,
            classSchoolYear: selectedClass.schoolYear,
            subjectStatus: raw?.subjectStatus ? String(raw.subjectStatus) : 'Enrolled',
            gradeUpdatedAt: raw?.gradeUpdatedAt ? String(raw.gradeUpdatedAt) : undefined,
            gradeSubmissionStatus: raw?.gradeSubmissionStatus ? String(raw.gradeSubmissionStatus) : 'Draft'
          } as ProfessorRosterStudent
        })

        if (!cancelled) {
          setStudents(normalized)
          setCurrentPage(1)
          // Set the grade submission status from the first student's per-subject status.
          // All students in the same subject share the same submission status.
          const firstStatus = normalized[0]?.gradeSubmissionStatus
          if (firstStatus) {
            setGradeSubmissionStatus(firstStatus)
          } else {
            setGradeSubmissionStatus('Draft')
          }
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

  const gradedCount = students.filter(s =>
    (s.currentGrade !== undefined && s.currentGrade !== null && s.currentGrade !== '') ||
    s.currentGradeMark
  ).length
  const pendingCount = Math.max(students.length - gradedCount, 0)
  const averageGrade = gradeValues.length > 0
    ? (gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length).toFixed(2)
    : 'N/A'

  const canEditGrades = gradeSubmissionStatus === 'Draft' || gradeSubmissionStatus === 'Returned'
  const isPublished = gradeSubmissionStatus === 'Published'

  const formatGradeUpdatedAt = (value?: string) => {
    if (!value) return 'Not graded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Not graded' : date.toLocaleString()
  }

  const hasDraftChanges = (student: ProfessorRosterStudent) => {
    const gradeDraft = String(gradeDrafts[student._id] ?? '')
    const currentGrade = student.currentGrade === undefined || student.currentGrade === null ? '' : String(student.currentGrade)
    const gradeMarkDraft = String(gradeMarkDrafts[student._id] ?? '')
    const currentGradeMark = String(student.currentGradeMark ?? '')
    const remarkDraft = String(remarkDrafts[student._id] ?? '')
    const currentRemark = String(student.remarks || '')
    return gradeDraft !== currentGrade || gradeMarkDraft !== currentGradeMark || remarkDraft !== currentRemark
  }

  const saveGrade = async (student: ProfessorRosterStudent) => {
    if (!selectedClass) return

    const rawGrade = String(gradeDrafts[student._id] ?? '').trim()
    const rawGradeMark = String(gradeMarkDrafts[student._id] ?? '').trim()
    const nextGrade = rawGrade === '' ? null : Number(rawGrade)

    if (nextGrade !== null && (!Number.isFinite(nextGrade) || nextGrade < 1 || nextGrade > 5)) {
      setMessageTone('error')
      setMessage(`Invalid grade for ${getName(student)}. Use 1.0 to 5.0, a grade mark, or leave both blank.`)
      return
    }

    const nextGradeMark = rawGradeMark || null
    // If a grade mark is selected, clear the numerical grade
    const finalGrade = nextGradeMark ? null : nextGrade

    try {
      setSavingStudentIds((current) => current.includes(student._id) ? current : [...current, student._id])
      const token = await getStoredToken()
      if (!token) {
        throw new Error('You are not logged in.')
      }

      const body: Record<string, any> = {
        remarks: String(remarkDrafts[student._id] ?? ''),
        semester: selectedClass.semester,
        schoolYear: selectedClass.schoolYear
      }
      body.grade = finalGrade
      if (nextGradeMark) body.gradeMark = nextGradeMark

      const response = await fetchWithAutoReconnect(
        `${API_URL}/api/professor/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/students/${student._id}/grade`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
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
          currentGradeMark: updated?.currentGradeMark ?? null,
          remarks: updated?.remarks || '',
          subjectStatus: updated?.subjectStatus || entry.subjectStatus,
          gradeUpdatedAt: updated?.gradeUpdatedAt ? String(updated.gradeUpdatedAt) : entry.gradeUpdatedAt
        }
      }))
      setGradeDrafts((current) => ({
        ...current,
        [student._id]: updated?.currentGrade === undefined || updated?.currentGrade === null ? '' : String(updated.currentGrade)
      }))
      setGradeMarkDrafts((current) => ({
        ...current,
        [student._id]: updated?.currentGradeMark ?? ''
      }))
      setRemarkDrafts((current) => ({
        ...current,
        [student._id]: String(updated?.remarks || '')
      }))
      if (updated?.gradeSubmissionStatus) {
        setGradeSubmissionStatus(updated.gradeSubmissionStatus)
      }
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

  const submitGradesForReview = async () => {
    if (!selectedClass || students.length === 0) return

    // Collect all unique enrollment IDs from students in this class
    const enrollmentIds = [...new Set(
      students.map(s => s.enrollmentId).filter((id): id is string => !!id)
    )]
    if (enrollmentIds.length === 0) {
      setMessageTone('error')
      setMessage('No enrollment found for this class.')
      return
    }
    const ungraded = students.filter(s =>
      s.subjectStatus !== 'Dropped'
      && !s.currentGrade && !gradeDrafts[s._id]
      && !s.currentGradeMark && !gradeMarkDrafts[s._id]
    )
    if (ungraded.length > 0) {
      setMessageTone('error')
      setMessage(`${ungraded.length} student(s) still need a grade or grade mark (INC, DRP, W, FA, NG). Enter grades before submitting.`)
      return
    }
    const confirmMessage = 'Submit all grades for this class for registrar review? You will not be able to edit grades after submission.'
    if (!confirm(confirmMessage)) return

    setSubmittingGrades(true)
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('You are not logged in.')

      let succeeded = 0
      let failed = 0
      const errors: string[] = []

      for (const enrollmentId of enrollmentIds) {
        const response = await fetchWithAutoReconnect(
          `${API_URL}/api/professor/grade-submissions/${enrollmentId}/submit`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        )
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          failed++
          errors.push(payload?.error || `Enrollment ${enrollmentId} failed`)
        } else {
          succeeded++
        }
      }

      if (succeeded > 0 && failed === 0) {
        setGradeSubmissionStatus('Submitted')
        setMessageTone('info')
        setMessage(`Grades submitted for registrar review (${succeeded} enrollment${succeeded !== 1 ? 's' : ''}).`)
      } else if (succeeded > 0 && failed > 0) {
        setGradeSubmissionStatus('Submitted')
        setMessageTone('error')
        setMessage(`${succeeded} submitted, ${failed} failed: ${errors[0]}`)
      } else {
        setMessageTone('error')
        setMessage(errors[0] || 'Failed to submit grades.')
      }
    } catch (e: any) {
      setMessageTone('error')
      setMessage(e.message || 'Failed to submit grades.')
    } finally {
      setSubmittingGrades(false)
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

  const statusBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      Draft: 'gm-status-badge--draft',
      Submitted: 'gm-status-badge--submitted',
      Verified: 'gm-status-badge--verified',
      Published: 'gm-status-badge--published',
      Returned: 'gm-status-badge--returned',
      Rejected: 'gm-status-badge--returned'
    }
    return `gm-status-badge ${map[status] || 'gm-status-badge--draft'}`
  }

  const alertConfig = (status: string): { cls: string; icon: typeof Info; msg: string } | null => {
    const gradedInfo = students.length > 0
      ? `${gradedCount} of ${students.length} students graded${gradeValues.length > 0 ? ` (avg ${averageGrade})` : ''}.`
      : ''
    switch (status) {
      case 'Submitted':
        return { cls: 'gm-alert--warning', icon: Info, msg: `Grades submitted for registrar review. ${gradedInfo} Editing is locked until verified or returned.` }
      case 'Verified':
        return { cls: 'gm-alert--info', icon: Info, msg: `Grades verified by registrar — awaiting publication. ${gradedInfo} Editing is locked.` }
      case 'Published':
        return { cls: 'gm-alert--success', icon: Info, msg: `Grades published and visible to students. ${gradedInfo} Use "Request Change" to submit corrections.` }
      case 'Returned':
        return { cls: 'gm-alert--error', icon: AlertCircle, msg: 'Grades were returned by the registrar. Please review and resubmit.' }
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="gm-page">
        <div className="gm-header">
          <div className="gm-header-text">
            <h2>Grades</h2>
            <p>Manage subject grades based on enrolled student subjects.</p>
          </div>
        </div>
        <div className="gm-loading">Loading your assigned classes...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="gm-page">
        <div className="gm-header">
          <div className="gm-header-text">
            <h2>Grades</h2>
            <p>Manage subject grades based on enrolled student subjects.</p>
          </div>
        </div>
        <div className="gm-error">{error}</div>
        <button className="gm-retry-btn" onClick={() => void onRefresh()}>Retry</button>
      </div>
    )
  }

  if (classOptions.length === 0) {
    return (
      <div className="gm-page">
        <div className="gm-header">
          <div className="gm-header-text">
            <h2>Grades</h2>
            <p>Manage subject grades based on enrolled student subjects.</p>
          </div>
        </div>
        <div className="gm-empty">
          <h3>No assigned class found</h3>
          <p>No classes are currently assigned to your account.</p>
        </div>
      </div>
    )
  }

  const statusAlert = selectedClass ? alertConfig(gradeSubmissionStatus) : null
  const needsBlockWarning = selectedClass?.needsBlockAssignment

  return (
    <div className="gm-page">
      {/* Header */}
      <div className="gm-header">
        <div className="gm-header-text">
          <h2>Grades</h2>
          <p>Manage subject grades directly from each student&apos;s enrolled subject entry.</p>
        </div>
        <div className="gm-header-controls">
          <div className="gm-class-select">
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
          <div className="gm-tool-actions">
            <button type="button" className="gm-btn" onClick={exportGrades} disabled={students.length === 0}>
              <Download size={16} /> Export Grades
            </button>
            <button
              type="button"
              className="gm-btn"
              onClick={async () => {
                if (!selectedClass) return
                try {
                  const token = await getStoredToken()
                  if (!token) throw new Error('You are not logged in.')
                  const params = new URLSearchParams()
                  if (selectedClass.semester) params.set('semester', selectedClass.semester)
                  if (selectedClass.schoolYear) params.set('schoolYear', selectedClass.schoolYear)
                  const response = await fetch(`${API_URL}/api/registrar/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/grade-sheet?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                  })
                  if (!response.ok) {
                    const data = await response.json().catch(() => ({}))
                    throw new Error(data?.error || 'Failed to generate grade sheet')
                  }
                  const blob = await response.blob()
                  const url = window.URL.createObjectURL(blob)
                  window.open(url, '_blank', 'noopener')
                  window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
                } catch (e: any) {
                  setMessageTone('error')
                  setMessage(e.message || 'Failed to generate grade sheet')
                }
              }}
              disabled={students.length === 0}
            >
              <FileText size={16} /> Grade Sheet
            </button>
          </div>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div className={`gm-alert ${messageTone === 'error' ? 'gm-alert--error' : 'gm-alert--info'}`}>
          {messageTone === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
          {message}
          <button className="gm-alert-dismiss" onClick={() => setMessage('')}><X size={14} /></button>
        </div>
      )}

      {/* Status alert */}
      {statusAlert && (
        <div className={`gm-alert ${statusAlert.cls}`}>
          <statusAlert.icon size={18} />
          {statusAlert.msg}
        </div>
      )}

      {/* Block assignment warning */}
      {needsBlockWarning && (
        <div className="gm-alert gm-alert--warning">
          <AlertCircle size={18} />
          Students in this class are not assigned to a block section. Please notify the registrar to assign them to a block. Grades can still be entered below.
        </div>
      )}

      {selectedClass && (
        <>
          {/* Bento Grid — Subject Info */}
          <div className="gm-bento">
            <div className="gm-bento-cell">
              <span className="gm-bento-label">Block</span>
              <span className="gm-bento-value">{selectedClass.blockCode}</span>
            </div>
            <div className="gm-bento-cell gm-bento-cell--wide">
              <span className="gm-bento-label">Subject</span>
              <span className="gm-bento-value" title={`${selectedClass.subjectCode} - ${selectedClass.subjectTitle}`}>
                {selectedClass.subjectCode} - {selectedClass.subjectTitle}
              </span>
            </div>
            <div className="gm-bento-cell">
              <span className="gm-bento-label">Schedule</span>
              <span className="gm-bento-value">{selectedClass.schedule || 'TBA'}</span>
            </div>
            <div className="gm-bento-cell">
              <span className="gm-bento-label">Room</span>
              <span className="gm-bento-value">{selectedClass.room || 'TBA'}</span>
            </div>
            <div className="gm-bento-cell">
              <span className="gm-bento-label">Term</span>
              <span className="gm-bento-value">{selectedClass.semester} / {selectedClass.schoolYear}</span>
            </div>
            <div className="gm-bento-cell">
              <span className="gm-bento-label">Year Lvl</span>
              <span className="gm-bento-value">{selectedClass.yearLevel ?? 'N/A'}</span>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="gm-metrics">
            <div className="gm-metric-card">
              <span className="gm-metric-label">Enrolled</span>
              <span className="gm-metric-value">{students.length}</span>
            </div>
            <div className="gm-metric-card">
              <span className="gm-metric-label">Graded</span>
              <span className="gm-metric-value">{gradedCount}</span>
            </div>
            <div className="gm-metric-card">
              <span className="gm-metric-label">Pending</span>
              <span className="gm-metric-value">{pendingCount}</span>
            </div>
            <div className="gm-metric-card">
              <span className="gm-metric-label">Avg Grade</span>
              <span className="gm-metric-value gm-metric-value--primary">{averageGrade}</span>
            </div>
            <div className="gm-metric-card gm-metric-card--span2">
              <span className="gm-metric-label">Status</span>
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className={statusBadgeClass(gradeSubmissionStatus)}>{gradeSubmissionStatus}</span>
                {(gradeSubmissionStatus === 'Verified' || gradeSubmissionStatus === 'Published' || gradeSubmissionStatus === 'Submitted') && students.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #6b7280)' }}>
                    {gradedCount} of {students.length} students graded
                    {gradeValues.length > 0 && ` · Avg ${averageGrade}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="gm-action-bar">
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              {(gradeSubmissionStatus === 'Draft' || gradeSubmissionStatus === 'Returned') && students.length > 0 && (
                <>
                  <button
                    type="button"
                    className="gm-submit-btn"
                    onClick={() => void submitGradesForReview()}
                    disabled={submittingGrades}
                  >
                    <Send size={18} />
                    {submittingGrades ? 'Submitting...' : 'Submit Grades for Review'}
                  </button>
                  {pendingCount > 0 && (
                    <span className="gm-submit-hint gm-submit-hint--warning">
                      {pendingCount} student(s) still need a grade or grade mark (INC, DRP, W, FA, NG). All students must have a grade before submitting.
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="gm-search-sort">
              <div className="gm-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search name, ID, course..."
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <div className="gm-sort">
                <label>Sort By</label>
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
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="gm-table-container">
            <div className="gm-table-scroll">
              <table className="gm-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Program / Course</th>
                    <th>Yr Lvl</th>
                    <th>Status</th>
                    <th className="gm-grade-header">
                      Grade
                      <span className="gm-grade-info-icon" title="Grade Scale:
1.00 - 3.00 = Passed
5.00 = Failed
INC = Incomplete
DRP = Dropped
W = Withdrawn
FA = Failure due to Absences
NG = No Grade">
                        <Info size={13} />
                      </span>
                    </th>
                    <th>Remarks</th>
                    <th>Updated</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsLoading ? (
                    <tr>
                      <td colSpan={9} className="gm-loading">Loading grades...</td>
                    </tr>
                  ) : studentsError ? (
                    <tr>
                      <td colSpan={9} className="gm-error">{studentsError}</td>
                    </tr>
                  ) : currentPageStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="gm-empty">No students matched the current filters.</td>
                    </tr>
                  ) : (
                    currentPageStudents.map((student) => {
                      const isSaving = savingStudentIds.includes(student._id)
                      return (
                        <tr key={student.rosterEntryKey}>
                          <td className="gm-student-id">{student.studentNumber}</td>
                          <td className="gm-student-name">{getName(student)}</td>
                          <td className="gm-muted">{getStudentCourseDisplay(student)}</td>
                          <td className="gm-muted">{student.yearLevel ?? 'N/A'}</td>
                          <td>
                            <span className="gm-pill">{student.subjectStatus || student.studentStatus || 'Enrolled'}</span>
                          </td>
                          <td>
                            <div className="gm-grade-cell">
                              <input
                                ref={(element) => {
                                  gradeInputRefs.current[student._id] = element
                                }}
                                type="number"
                                min="1"
                                max="5"
                                step="0.25"
                                className="gm-grade-input"
                                value={gradeDrafts[student._id] ?? ''}
                                onChange={(event) => {
                                  setGradeDrafts((current) => ({
                                    ...current,
                                    [student._id]: event.target.value
                                  }))
                                  // Clear grade mark when typing a numerical grade
                                  if (event.target.value) {
                                    setGradeMarkDrafts((current) => ({ ...current, [student._id]: '' }))
                                  }
                                }}
                                placeholder="1.00"
                                disabled={!canEditGrades || !!gradeMarkDrafts[student._id]}
                              />
                              <select
                                className="gm-grade-mark-select"
                                value={gradeMarkDrafts[student._id] ?? ''}
                                onChange={(event) => {
                                  setGradeMarkDrafts((current) => ({
                                    ...current,
                                    [student._id]: event.target.value
                                  }))
                                  // Clear numerical grade when selecting a mark
                                  if (event.target.value) {
                                    setGradeDrafts((current) => ({ ...current, [student._id]: '' }))
                                  }
                                }}
                                disabled={!canEditGrades || !!gradeDrafts[student._id]}
                              >
                                <option value="">—</option>
                                <option value="INC">INC</option>
                                <option value="DRP">DRP</option>
                                <option value="W">W</option>
                                <option value="FA">FA</option>
                                <option value="NG">NG</option>
                              </select>
                            </div>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="gm-remark-input"
                              value={remarkDrafts[student._id] ?? ''}
                              onChange={(event) => {
                                setRemarkDrafts((current) => ({
                                  ...current,
                                  [student._id]: event.target.value
                                }))
                              }}
                              placeholder="Optional"
                              disabled={!canEditGrades}
                            />
                          </td>
                          <td className="gm-muted gm-text-xs">{formatGradeUpdatedAt(student.gradeUpdatedAt)}</td>
                          <td>
                            <div className="gm-row-actions">
                              {canEditGrades ? (
                                <>
                                  <button
                                    type="button"
                                    className="gm-action-btn gm-action-btn--primary"
                                    onClick={() => void saveGrade(student)}
                                    disabled={isSaving || !hasDraftChanges(student)}
                                  >
                                    {isSaving ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    className="gm-action-btn"
                                    onClick={() => goToNextGrade(student)}
                                    disabled={isSaving || filteredStudents[filteredStudents.length - 1]?._id === student._id}
                                  >
                                    Next
                                  </button>
                                </>
                              ) : isPublished && student.currentGrade !== '' && student.currentGrade !== null && student.currentGrade !== undefined ? (
                                <button
                                  type="button"
                                  className="gm-action-btn gm-action-btn--warning"
                                  onClick={() => setChangeRequestStudent(student)}
                                >
                                  <Edit3 size={14} /> Request Change
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="gm-action-btn"
                                onClick={() => setSelectedStudent(student)}
                              >
                                Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Table Footer / Pagination */}
            {currentPageStudents.length > 0 && (
              <div className="gm-table-footer">
                <span>Showing {currentPageStudents.length} of {filteredStudents.length} students</span>
                <div className="gm-pagination">
                  <button type="button" className="gm-pagination-btn" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={!canGoPrev}>
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="gm-pagination-info">Page {currentPage} of {totalPages}</span>
                  <button type="button" className="gm-pagination-btn" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={!canGoNext}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Student Profile Modal */}
      {selectedStudent && (
        <div className="gm-modal-backdrop" onClick={() => setSelectedStudent(null)}>
          <div className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="gm-modal-header">
              <h3>Student Profile</h3>
              <button type="button" className="gm-modal-close" onClick={() => setSelectedStudent(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="gm-modal-body">
              <div className="gm-modal-grid">
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

      {/* Grade Change Request Modal */}
      {changeRequestStudent && selectedClass && (
        <GradeChangeRequestModal
          open={!!changeRequestStudent}
          onClose={() => setChangeRequestStudent(null)}
          onSuccess={() => {
            setMessageTone('info')
            setMessage(`Grade change request submitted for ${getName(changeRequestStudent)}.`)
          }}
          enrollmentId={changeRequestStudent.enrollmentId || ''}
          studentId={changeRequestStudent._id}
          studentName={getName(changeRequestStudent)}
          subjectId={selectedClass.subjectId}
          subjectCode={selectedClass.subjectCode}
          subjectTitle={selectedClass.subjectTitle}
          currentGrade={changeRequestStudent.currentGrade === '' || changeRequestStudent.currentGrade === null || changeRequestStudent.currentGrade === undefined ? null : Number(changeRequestStudent.currentGrade)}
        />
      )}
    </div>
  )
}

export default GradesManagement

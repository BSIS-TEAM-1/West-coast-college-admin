import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search, Edit3, Send, FileText, ChevronLeft, ChevronRight, X, Info, AlertCircle, MoreVertical, AlertTriangle, Eye, Loader2, Check } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedCourse, ProfessorRosterClassOption, ProfessorRosterStudent } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'
import {
  describeGradeScale,
  formatGrade,
  formatGradeInput,
  isInvalidGradeInput,
  isPassingGrade,
  listAllowedGrades,
  useGradeScale
} from '../../lib/gradingScale'
import GradeChangeRequestModal from '../../components/GradeChangeRequestModal'
import './GradesManagement.css'
import './ProfessorShared.css'

// Grade input normalisation now follows the institution's configured scale
// (0.1 steps by default: 1.0, 1.1, 1.2 … 5.0) instead of snapping every entry
// to quarter points. Exported because the grade change request modal shares it.
export const formatChedGrade = (val: string | number | null | undefined): string => formatGradeInput(val)

export const isInvalidGrade = (val: string | number | null | undefined): boolean => isInvalidGradeInput(val)

const isEditableSubmissionStatus = (status?: string) => status === 'Draft' || status === 'Returned'

// Derive the status shown for the class from each student's per-subject
// submission status. Individual submissions only lock that student's row, so
// the whole class is "Submitted" only once every student has been submitted.
const deriveClassSubmissionStatus = (entries: ProfessorRosterStudent[]): string => {
  if (entries.length === 0) return 'Draft'
  const statuses = entries.map((entry) => entry.gradeSubmissionStatus || 'Draft')
  if (statuses.every((status) => status === 'Published')) return 'Published'
  if (statuses.every((status) => status === 'Verified' || status === 'Published')) return 'Verified'
  if (statuses.every((status) => status === 'Submitted' || status === 'Verified' || status === 'Published')) return 'Submitted'
  if (statuses.some((status) => status === 'Returned')) return 'Returned'
  return 'Draft'
}

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
  const [saveStatusByStudent, setSaveStatusByStudent] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({})
  const [gradeMarkDrafts, setGradeMarkDrafts] = useState<Record<string, string>>({})
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [pendingFocusStudentId, setPendingFocusStudentId] = useState('')
  const [submittingGrades, setSubmittingGrades] = useState(false)
  const [submittingStudentIds, setSubmittingStudentIds] = useState<string[]>([])
  const [showSubmitPreview, setShowSubmitPreview] = useState(false)
  const [gradeSubmissionStatus, setGradeSubmissionStatus] = useState<string>('Draft')
  const [changeRequestStudent, setChangeRequestStudent] = useState<ProfessorRosterStudent | null>(null)
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
  const gradeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const draftsRef = useRef<{
    grades: Record<string, string>
    marks: Record<string, string>
    remarks: Record<string, string>
  }>({ grades: {}, marks: {}, remarks: {} })
  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const gradeScale = useGradeScale()
  const gradeScaleLegend = [
    `${formatGrade(gradeScale.min)} – ${formatGrade(gradeScale.passingGrade)} = Passed`,
    `${formatGrade(gradeScale.max)} = Failed`,
    describeGradeScale(gradeScale),
    'INC = Incomplete',
    'DRP = Dropped',
    'W = Withdrawn',
    'FA = Failure due to Absences',
    'NG = No Grade'
  ].join('\n')
  const allowedGradeHint = listAllowedGrades(gradeScale).join(', ')

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

  const getStudentSubmissionStatus = (student: ProfessorRosterStudent) =>
    student.gradeSubmissionStatus || gradeSubmissionStatus || 'Draft'

  const canEditStudentGrades = (student: ProfessorRosterStudent) =>
    isEditableSubmissionStatus(getStudentSubmissionStatus(student))

  const isStudentSubmitted = (student: ProfessorRosterStudent) =>
    ['Submitted', 'Verified', 'Published'].includes(getStudentSubmissionStatus(student))

  const isStudentDropped = (student: ProfessorRosterStudent) =>
    String(student.subjectStatus || '').toLowerCase() === 'dropped'

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
    return () => {
      Object.values(autoSaveTimersRef.current).forEach((timer) => clearTimeout(timer))
      autoSaveTimersRef.current = {}
    }
  }, [])

  // Keep the class-level badge/alert in sync with per-student submission
  // statuses. A partial individual submission therefore leaves the class in
  // Draft so the remaining grades can still be submitted in bulk.
  useEffect(() => {
    if (students.length === 0) return
    setGradeSubmissionStatus(deriveClassSubmissionStatus(students))
  }, [students])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    // Immediately clear stale drafts and students from the previous class
    setStudents([])
    setGradeDrafts({})
    setGradeMarkDrafts({})
    setRemarkDrafts({})
    setSavingStudentIds([])
    setSaveStatusByStudent({})
    setSubmittingStudentIds([])
    setGradeSubmissionStatus('Draft')
    setSelectedStudent(null)
    setOpenActionMenu(null)
    setMessage('')
    Object.values(autoSaveTimersRef.current).forEach((timer) => clearTimeout(timer))
    autoSaveTimersRef.current = {}
    draftsRef.current = { grades: {}, marks: {}, remarks: {} }

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
            // Stored grades are displayed as-is (legacy quarter-point values keep
            // their two decimals); only typed input is normalised to the scale.
            currentGrade: raw?.currentGrade !== undefined && raw?.currentGrade !== null && raw?.currentGrade !== '' ? formatGrade(raw.currentGrade) : '',
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
    const gradesObj = Object.fromEntries(
      students.map((student) => [
        student._id,
        student.currentGrade === undefined || student.currentGrade === null || student.currentGrade === ''
          ? ''
          : formatGrade(student.currentGrade)
      ])
    )
    const marksObj = Object.fromEntries(
      students.map((student) => [
        student._id,
        student.currentGradeMark ? String(student.currentGradeMark) : ''
      ])
    )
    const remarksObj = Object.fromEntries(
      students.map((student) => [student._id, String(student.remarks || '')])
    )

    draftsRef.current = {
      grades: gradesObj,
      marks: marksObj,
      remarks: remarksObj
    }
    setGradeDrafts(gradesObj)
    setGradeMarkDrafts(marksObj)
    setRemarkDrafts(remarksObj)
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openActionMenu && !(event.target as Element).closest('.gm-action-dropdown-container')) {
        setOpenActionMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openActionMenu])

  const gradeValues = students
    .map((student) => {
      if (student.currentGrade === '' || student.currentGrade === null || student.currentGrade === undefined) return NaN
      const num = Number(student.currentGrade)
      return Number.isFinite(num) && num > 0 ? num : NaN
    })
    .filter((value) => Number.isFinite(value))

  const gradedCount = students.filter(s =>
    (s.currentGrade !== undefined && s.currentGrade !== null && s.currentGrade !== '') ||
    s.currentGradeMark
  ).length
  const pendingCount = Math.max(students.length - gradedCount, 0)
  const averageGrade = gradeValues.length > 0
    ? (gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length).toFixed(2)
    : 'No Grade'

  const hasGradeOrMark = (student: ProfessorRosterStudent) => Boolean(
    (student.currentGrade !== undefined && student.currentGrade !== null && student.currentGrade !== '')
    || student.currentGradeMark
    || String(gradeDrafts[student._id] ?? '').trim()
    || String(gradeMarkDrafts[student._id] ?? '').trim()
  )

  const editableStudents = students.filter(
    (student) => canEditStudentGrades(student) && !isStudentDropped(student)
  )
  const hasEditableStudents = editableStudents.length > 0
  const pendingEditableCount = editableStudents.filter((student) => !hasGradeOrMark(student)).length

  const formatGradeUpdatedAt = (value?: string) => {
    if (!value) return 'Not graded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Not graded' : date.toLocaleString()
  }

  // Stored grades are shown exactly as recorded; only typed edits are snapped
  // to the configured scale. This keeps legacy quarter-point grades intact.
  const gradeDisplayValue = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? '' : formatGrade(value)

  // FA (Failure due to Absences) carries the failing 5.0 equivalent, so picking
  // the mark fills the numerical grade automatically instead of leaving it blank.
  const faEquivalentGrade = formatGrade(gradeScale.max)

  const normalizeDraftForStudent = (student: ProfessorRosterStudent, raw: string | number | null | undefined) => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    const stored = gradeDisplayValue(student.currentGrade)
    if (stored && text === stored) return stored
    return formatChedGrade(text)
  }

  const hasDraftChanges = (student: ProfessorRosterStudent) => {
    const gradeDraft = normalizeDraftForStudent(student, gradeDrafts[student._id])
    const currentGrade = gradeDisplayValue(student.currentGrade)
    const gradeMarkDraft = String(gradeMarkDrafts[student._id] ?? '').trim()
    const currentGradeMark = String(student.currentGradeMark ?? '').trim()
    const remarkDraft = String(remarkDrafts[student._id] ?? '').trim()
    const currentRemark = String(student.remarks || '').trim()
    return gradeDraft !== currentGrade || gradeMarkDraft !== currentGradeMark || remarkDraft !== currentRemark
  }

  const goToNextGrade = (student: ProfessorRosterStudent) => {
    const currentIndex = filteredStudents.findIndex((entry) => entry._id === student._id)
    if (currentIndex < 0) return

    const nextStudent = filteredStudents[currentIndex + 1]
    if (!nextStudent) return

    const nextPage = Math.floor((currentIndex + 1) / 10) + 1
    if (nextPage !== currentPage) {
      setCurrentPage(nextPage)
      setPendingFocusStudentId(nextStudent._id)
    } else {
      const target = gradeInputRefs.current[nextStudent._id]
      if (target) {
        target.focus()
        target.select()
      } else {
        setPendingFocusStudentId(nextStudent._id)
      }
    }
  }

  const goToPrevGrade = (student: ProfessorRosterStudent) => {
    const currentIndex = filteredStudents.findIndex((entry) => entry._id === student._id)
    if (currentIndex <= 0) return

    const prevStudent = filteredStudents[currentIndex - 1]
    if (!prevStudent) return

    const prevPage = Math.floor((currentIndex - 1) / 10) + 1
    if (prevPage !== currentPage) {
      setCurrentPage(prevPage)
      setPendingFocusStudentId(prevStudent._id)
    } else {
      const target = gradeInputRefs.current[prevStudent._id]
      if (target) {
        target.focus()
        target.select()
      } else {
        setPendingFocusStudentId(prevStudent._id)
      }
    }
  }

  const handleGradeChange = (studentId: string, value: string) => {
    // Only allow digits and a single optional decimal point
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return

    draftsRef.current.grades[studentId] = value
    setGradeDrafts((current) => ({
      ...current,
      [studentId]: value
    }))
    // Clear grade mark when typing a numerical grade
    if (value) {
      draftsRef.current.marks[studentId] = ''
      setGradeMarkDrafts((current) => ({ ...current, [studentId]: '' }))
    }

    setSaveStatusByStudent((current) => {
      if (current[studentId]) {
        const next = { ...current }
        delete next[studentId]
        return next
      }
      return current
    })

    if (autoSaveTimersRef.current[studentId]) {
      clearTimeout(autoSaveTimersRef.current[studentId])
      delete autoSaveTimersRef.current[studentId]
    }

    // Do not debounce-save while actively typing an incomplete decimal (e.g. "1.")
    if (value.endsWith('.')) {
      return
    }

    const student = students.find((s) => s._id === studentId)
    if (!student) return

    // Debounce auto-save after 750ms of typing inactivity
    autoSaveTimersRef.current[studentId] = setTimeout(() => {
      delete autoSaveTimersRef.current[studentId]
      const currentVal = draftsRef.current.grades[studentId] ?? value
      if (currentVal.endsWith('.')) return

      const formatted = normalizeDraftForStudent(student, currentVal)
      const num = formatted === '' ? null : Number(formatted)
      if (num !== null && (Number.isNaN(num) || num < gradeScale.min || num > gradeScale.max)) {
        return
      }

      const stored = gradeDisplayValue(student.currentGrade)
      if (formatted !== stored) {
        void saveGrade(student, { gradeOverride: formatted, silent: true })
      }
    }, 750)
  }

  const handleGradeBlur = (student: ProfessorRosterStudent) => {
    if (autoSaveTimersRef.current[student._id]) {
      clearTimeout(autoSaveTimersRef.current[student._id])
      delete autoSaveTimersRef.current[student._id]
    }

    const raw = draftsRef.current.grades[student._id] ?? gradeDrafts[student._id] ?? ''
    let formatted = ''
    if (raw !== undefined && raw !== null && raw.trim() !== '') {
      formatted = normalizeDraftForStudent(student, raw)
      if (formatted !== raw) {
        draftsRef.current.grades[student._id] = formatted
        setGradeDrafts((current) => ({
          ...current,
          [student._id]: formatted
        }))
      }
    }

    const stored = gradeDisplayValue(student.currentGrade)
    if (formatted !== stored) {
      const num = formatted === '' ? null : Number(formatted)
      if (num !== null && (Number.isNaN(num) || num < gradeScale.min || num > gradeScale.max)) {
        setMessageTone('error')
        setMessage(`Invalid grade for ${getName(student)}. Must be between ${formatGrade(gradeScale.min)} and ${formatGrade(gradeScale.max)}.`)
        setSaveStatusByStudent((prev) => ({ ...prev, [student._id]: 'error' }))
        return
      }
      void saveGrade(student, { gradeOverride: formatted, silent: true })
    }
  }

  const handleGradeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, student: ProfessorRosterStudent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (autoSaveTimersRef.current[student._id]) {
        clearTimeout(autoSaveTimersRef.current[student._id])
        delete autoSaveTimersRef.current[student._id]
      }
      const raw = draftsRef.current.grades[student._id] ?? gradeDrafts[student._id] ?? ''
      let formatted = ''
      if (raw !== undefined && raw !== null && raw.trim() !== '') {
        formatted = normalizeDraftForStudent(student, raw)
        draftsRef.current.grades[student._id] = formatted
        setGradeDrafts((current) => ({
          ...current,
          [student._id]: formatted
        }))
        if (formatted) {
          draftsRef.current.marks[student._id] = ''
          setGradeMarkDrafts((current) => ({ ...current, [student._id]: '' }))
        }
      }

      const stored = gradeDisplayValue(student.currentGrade)
      if (formatted !== stored) {
        const num = formatted === '' ? null : Number(formatted)
        if (num === null || (!Number.isNaN(num) && num >= gradeScale.min && num <= gradeScale.max)) {
          void saveGrade(student, { gradeOverride: formatted, silent: true })
        }
      }

      if (event.shiftKey) {
        goToPrevGrade(student)
      } else {
        goToNextGrade(student)
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (autoSaveTimersRef.current[student._id]) {
        clearTimeout(autoSaveTimersRef.current[student._id])
        delete autoSaveTimersRef.current[student._id]
      }
      const raw = draftsRef.current.grades[student._id] ?? gradeDrafts[student._id] ?? ''
      let formatted = ''
      if (raw !== undefined && raw !== null && raw.trim() !== '') {
        formatted = normalizeDraftForStudent(student, raw)
        draftsRef.current.grades[student._id] = formatted
        setGradeDrafts((current) => ({ ...current, [student._id]: formatted }))
      }
      const stored = gradeDisplayValue(student.currentGrade)
      if (formatted !== stored) {
        const num = formatted === '' ? null : Number(formatted)
        if (num === null || (!Number.isNaN(num) && num >= gradeScale.min && num <= gradeScale.max)) {
          void saveGrade(student, { gradeOverride: formatted, silent: true })
        }
      }
      goToNextGrade(student)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (autoSaveTimersRef.current[student._id]) {
        clearTimeout(autoSaveTimersRef.current[student._id])
        delete autoSaveTimersRef.current[student._id]
      }
      const raw = draftsRef.current.grades[student._id] ?? gradeDrafts[student._id] ?? ''
      let formatted = ''
      if (raw !== undefined && raw !== null && raw.trim() !== '') {
        formatted = normalizeDraftForStudent(student, raw)
        draftsRef.current.grades[student._id] = formatted
        setGradeDrafts((current) => ({ ...current, [student._id]: formatted }))
      }
      const stored = gradeDisplayValue(student.currentGrade)
      if (formatted !== stored) {
        const num = formatted === '' ? null : Number(formatted)
        if (num === null || (!Number.isNaN(num) && num >= gradeScale.min && num <= gradeScale.max)) {
          void saveGrade(student, { gradeOverride: formatted, silent: true })
        }
      }
      goToPrevGrade(student)
    }
  }

  const handleGradeMarkChange = (student: ProfessorRosterStudent, mark: string) => {
    if (autoSaveTimersRef.current[student._id]) {
      clearTimeout(autoSaveTimersRef.current[student._id])
      delete autoSaveTimersRef.current[student._id]
    }
    draftsRef.current.marks[student._id] = mark
    setGradeMarkDrafts((current) => ({
      ...current,
      [student._id]: mark
    }))
    // Selecting a mark clears any typed grade, except FA which maps to 5.0.
    const gradeForMark = mark === 'FA' ? faEquivalentGrade : ''
    draftsRef.current.grades[student._id] = gradeForMark
    setGradeDrafts((current) => ({ ...current, [student._id]: gradeForMark }))
    void saveGrade(student, { gradeMarkOverride: mark, gradeOverride: mark ? gradeForMark : undefined, silent: true })
  }

  const handleRemarkChange = (student: ProfessorRosterStudent, value: string) => {
    draftsRef.current.remarks[student._id] = value
    setRemarkDrafts((current) => ({
      ...current,
      [student._id]: value
    }))

    const timerKey = `remarks-${student._id}`
    if (autoSaveTimersRef.current[timerKey]) {
      clearTimeout(autoSaveTimersRef.current[timerKey])
      delete autoSaveTimersRef.current[timerKey]
    }

    autoSaveTimersRef.current[timerKey] = setTimeout(() => {
      delete autoSaveTimersRef.current[timerKey]
      const currentVal = draftsRef.current.remarks[student._id] ?? value
      if (currentVal !== (student.remarks || '')) {
        void saveGrade(student, { remarksOverride: currentVal, silent: true })
      }
    }, 800)
  }

  const handleRemarkBlur = (student: ProfessorRosterStudent) => {
    const timerKey = `remarks-${student._id}`
    if (autoSaveTimersRef.current[timerKey]) {
      clearTimeout(autoSaveTimersRef.current[timerKey])
      delete autoSaveTimersRef.current[timerKey]
    }
    const currentVal = draftsRef.current.remarks[student._id] ?? remarkDrafts[student._id] ?? ''
    if (currentVal !== (student.remarks || '')) {
      void saveGrade(student, { remarksOverride: currentVal, silent: true })
    }
  }

  interface SaveGradeOptions {
    silent?: boolean
    gradeOverride?: string
    gradeMarkOverride?: string
    remarksOverride?: string
  }

  const saveGrade = async (
    student: ProfessorRosterStudent,
    options: SaveGradeOptions = {}
  ): Promise<boolean> => {
    const targetClass = selectedClass
    if (!targetClass) return false

    const rawGrade = options.gradeOverride !== undefined
      ? options.gradeOverride
      : String(draftsRef.current.grades[student._id] ?? gradeDrafts[student._id] ?? '').trim()
    const rawGradeMark = options.gradeMarkOverride !== undefined
      ? options.gradeMarkOverride
      : String(draftsRef.current.marks[student._id] ?? gradeMarkDrafts[student._id] ?? '').trim()
    const rawRemarks = options.remarksOverride !== undefined
      ? options.remarksOverride
      : String(draftsRef.current.remarks[student._id] ?? remarkDrafts[student._id] ?? '').trim()

    const formattedGrade = normalizeDraftForStudent(student, rawGrade)
    const nextGrade = formattedGrade === '' ? null : Number(formattedGrade)

    if (nextGrade !== null && (!Number.isFinite(nextGrade) || nextGrade < gradeScale.min || nextGrade > gradeScale.max)) {
      if (!options.silent) {
        setMessageTone('error')
        setMessage(`Invalid grade for ${getName(student)}. Use ${formatGrade(gradeScale.min)} to ${formatGrade(gradeScale.max)}, a grade mark, or leave blank.`)
      }
      setSaveStatusByStudent((prev) => ({ ...prev, [student._id]: 'error' }))
      return false
    }

    const nextGradeMark = rawGradeMark || null
    // FA stores the failing 5.0 equivalent alongside the mark; every other mark
    // keeps the numerical grade empty.
    const finalGrade = nextGradeMark === 'FA'
      ? Number(faEquivalentGrade)
      : nextGradeMark
        ? null
        : nextGrade

    // If values are identical to current stored student values, no server call is needed
    const storedGrade = gradeDisplayValue(student.currentGrade)
    const storedMark = String(student.currentGradeMark ?? '')
    const storedRemarks = String(student.remarks ?? '')
    if (
      formattedGrade === storedGrade &&
      (nextGradeMark ?? '') === storedMark &&
      rawRemarks === storedRemarks
    ) {
      return true
    }

    try {
      setSavingStudentIds((current) => current.includes(student._id) ? current : [...current, student._id])
      setSaveStatusByStudent((prev) => ({ ...prev, [student._id]: 'saving' }))
      const token = await getStoredToken()
      if (!token) {
        throw new Error('You are not logged in.')
      }

      const body: Record<string, any> = {
        remarks: rawRemarks,
        semester: targetClass.semester,
        schoolYear: targetClass.schoolYear
      }
      body.grade = finalGrade
      if (nextGradeMark) body.gradeMark = nextGradeMark

      const response = await fetchWithAutoReconnect(
        `${API_URL}/api/professor/sections/${targetClass.sectionId}/subjects/${targetClass.subjectId}/students/${student._id}/grade`,
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
          currentGrade: updated?.currentGrade !== undefined && updated?.currentGrade !== null ? formatGrade(updated.currentGrade) : '',
          currentGradeMark: updated?.currentGradeMark ?? null,
          remarks: updated?.remarks || '',
          subjectStatus: updated?.subjectStatus || entry.subjectStatus,
          gradeUpdatedAt: updated?.gradeUpdatedAt ? String(updated.gradeUpdatedAt) : entry.gradeUpdatedAt,
          gradeSubmissionStatus: updated?.gradeSubmissionStatus
            ? String(updated.gradeSubmissionStatus)
            : entry.gradeSubmissionStatus
        }
      }))

      // Update draft state only if the user hasn't typed newer values during the request
      const serverGradeStr = updated?.currentGrade === undefined || updated?.currentGrade === null ? '' : formatGrade(updated.currentGrade)
      if (draftsRef.current.grades[student._id] === undefined || draftsRef.current.grades[student._id] === rawGrade) {
        draftsRef.current.grades[student._id] = serverGradeStr
        setGradeDrafts((current) => ({
          ...current,
          [student._id]: serverGradeStr
        }))
      }

      const serverMarkStr = updated?.currentGradeMark ?? ''
      if (draftsRef.current.marks[student._id] === undefined || draftsRef.current.marks[student._id] === rawGradeMark) {
        draftsRef.current.marks[student._id] = serverMarkStr
        setGradeMarkDrafts((current) => ({
          ...current,
          [student._id]: serverMarkStr
        }))
      }

      const serverRemarksStr = String(updated?.remarks || '')
      if (draftsRef.current.remarks[student._id] === undefined || draftsRef.current.remarks[student._id] === rawRemarks) {
        draftsRef.current.remarks[student._id] = serverRemarksStr
        setRemarkDrafts((current) => ({
          ...current,
          [student._id]: serverRemarksStr
        }))
      }

      setSaveStatusByStudent((prev) => ({ ...prev, [student._id]: 'saved' }))

      if (!options.silent) {
        setMessageTone('info')
        setMessage(`Saved draft grade for ${getName(student)}.`)
      }
      return true
    } catch (saveError) {
      setSaveStatusByStudent((prev) => ({ ...prev, [student._id]: 'error' }))
      setMessageTone('error')
      setMessage(
        isNetworkRequestError(saveError)
          ? buildReconnectMessage('the auto-saved grade')
          : (saveError instanceof Error ? saveError.message : `Failed to save grade for ${getName(student)}.`)
      )
      return false
    } finally {
      setSavingStudentIds((current) => current.filter((value) => value !== student._id))
    }
  }

  const previewStats = useMemo(() => {
    let passed = 0
    let failed = 0
    let marks = 0

    students.forEach((s) => {
      const mark = s.currentGradeMark || gradeMarkDrafts[s._id]
      const rawGrade = gradeDrafts[s._id] !== undefined && gradeDrafts[s._id] !== ''
        ? gradeDrafts[s._id]
        : s.currentGrade

      if (mark) {
        if (mark === 'FA') failed++
        else marks++
      } else if (rawGrade !== null && rawGrade !== undefined && String(rawGrade).trim() !== '') {
        const num = Number(rawGrade)
        if (Number.isFinite(num)) {
          if (isPassingGrade(num)) passed++
          else failed++
        }
      }
    })

    return { passed, failed, marks, total: students.length }
  }, [students, gradeDrafts, gradeMarkDrafts])

  const getGradePreviewStatus = (grade: string | number | null | undefined, gradeMark?: string | null) => {
    if (gradeMark) {
      switch (gradeMark.toUpperCase()) {
        case 'INC': return { label: 'Incomplete', variant: 'warning' }
        case 'DRP': return { label: 'Dropped', variant: 'purple' }
        case 'W': return { label: 'Withdrawn', variant: 'neutral' }
        case 'FA': return { label: 'Failed (FA)', variant: 'danger' }
        case 'NG': return { label: 'No Grade', variant: 'neutral' }
        default: return { label: gradeMark, variant: 'neutral' }
      }
    }
    if (grade === null || grade === undefined || String(grade).trim() === '') {
      return { label: 'No Grade', variant: 'missing' }
    }
    const num = Number(grade)
    if (!Number.isFinite(num)) {
      return { label: 'Invalid', variant: 'danger' }
    }
    if (isPassingGrade(num)) {
      return { label: 'Passed', variant: 'success' }
    }
    if (num === 4.0) {
      return { label: 'Conditional', variant: 'warning' }
    }
    return { label: 'Failed', variant: 'danger' }
  }

  const openSubmitPreview = async () => {
    if (!selectedClass || students.length === 0 || submittingGrades || savingStudentIds.length > 0) return

    const studentsToSubmit = students.filter(
      (student) => canEditStudentGrades(student) && !isStudentDropped(student)
    )
    if (studentsToSubmit.length === 0) {
      setMessageTone('info')
      setMessage('All grades in this class have already been submitted.')
      return
    }

    // Flush any pending auto-save timers
    Object.keys(autoSaveTimersRef.current).forEach((key) => {
      clearTimeout(autoSaveTimersRef.current[key])
      delete autoSaveTimersRef.current[key]
    })

    for (const student of studentsToSubmit) {
      const raw = gradeDrafts[student._id]
      if (raw && isInvalidGrade(raw)) {
        setMessageTone('error')
        setMessage(`Cannot preview for submission: ${getName(student)} has an invalid grade (${raw}). Grades must be between ${formatGrade(gradeScale.min)} and ${formatGrade(gradeScale.max)}.`)
        return
      }
    }

    const studentsWithPendingDrafts = studentsToSubmit.filter(s => hasDraftChanges(s))
    if (studentsWithPendingDrafts.length > 0) {
      try {
        setMessageTone('info')
        setMessage('Saving pending draft changes before preview...')
        const saveResults = await Promise.all(studentsWithPendingDrafts.map(s => saveGrade(s, { silent: true })))
        if (saveResults.some((saved) => !saved)) {
          setMessageTone('error')
          setMessage('Some pending changes could not be saved. Fix the highlighted grades before submitting.')
          return
        }
      } catch {
        setMessageTone('error')
        setMessage('Failed to save pending changes before opening preview.')
        return
      }
    }

    setShowSubmitPreview(true)
  }

  const submitGradesForReview = async () => {
    if (!selectedClass || students.length === 0) return

    const studentsToSubmit = students.filter(
      (student) => canEditStudentGrades(student) && !isStudentDropped(student)
    )
    if (studentsToSubmit.length === 0) {
      setMessageTone('info')
      setMessage('All grades in this class have already been submitted.')
      setShowSubmitPreview(false)
      return
    }

    const ungraded = studentsToSubmit.filter((student) => !hasGradeOrMark(student))
    if (ungraded.length > 0) {
      setMessageTone('error')
      setMessage(`${ungraded.length} student(s) still need a grade or grade mark (INC, DRP, W, FA, NG). Enter grades before submitting.`)
      return
    }

    // Group by enrollment so a student appearing more than once is submitted
    // only once. The backend submits every matching subject entry in it.
    const targetsByEnrollment = new Map<string, string[]>()
    for (const student of studentsToSubmit) {
      if (!student.enrollmentId) {
        setMessageTone('error')
        setMessage(`No enrollment found for ${getName(student)}.`)
        return
      }
      const ids = targetsByEnrollment.get(student.enrollmentId) || []
      ids.push(student._id)
      targetsByEnrollment.set(student.enrollmentId, ids)
    }

    if (targetsByEnrollment.size === 0) {
      setMessageTone('error')
      setMessage('No enrollment found for this class.')
      return
    }

    setSubmittingGrades(true)
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('You are not logged in.')

      let succeeded = 0
      let failed = 0
      const errors: string[] = []
      const submittedStudentIds: string[] = []

      for (const [enrollmentId, studentIds] of targetsByEnrollment) {
        try {
          const response = await fetchWithAutoReconnect(
            `${API_URL}/api/professor/grade-submissions/${enrollmentId}/submit`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subjectId: selectedClass.subjectId,
                semester: selectedClass.semester,
                schoolYear: selectedClass.schoolYear
              })
            }
          )
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            failed += studentIds.length
            errors.push(payload?.error || `Enrollment ${enrollmentId} failed`)
          } else {
            succeeded += studentIds.length
            submittedStudentIds.push(...studentIds)
          }
        } catch (submitError: unknown) {
          failed += studentIds.length
          errors.push(submitError instanceof Error ? submitError.message : `Enrollment ${enrollmentId} failed`)
        }
      }

      if (submittedStudentIds.length > 0) {
        setStudents((current) => current.map((student) => (
          submittedStudentIds.includes(student._id)
            ? { ...student, gradeSubmissionStatus: 'Submitted' }
            : student
        )))
      }

      if (succeeded > 0 && failed === 0) {
        setMessageTone('info')
        setMessage(`Grades submitted for registrar review (${succeeded} student${succeeded !== 1 ? 's' : ''}).`)
        setShowSubmitPreview(false)
      } else if (succeeded > 0 && failed > 0) {
        setMessageTone('error')
        setMessage(`${succeeded} student(s) submitted, ${failed} failed: ${errors[0]}`)
        setShowSubmitPreview(false)
      } else {
        setMessageTone('error')
        setMessage(errors[0] || 'Failed to submit grades.')
      }
    } catch (e: unknown) {
      setMessageTone('error')
      setMessage(e instanceof Error ? e.message : 'Failed to submit grades.')
    } finally {
      setSubmittingGrades(false)
    }
  }

  const submitStudentGrade = async (student: ProfessorRosterStudent) => {
    if (!selectedClass || submittingGrades || submittingStudentIds.includes(student._id)) return
    if (!canEditStudentGrades(student)) {
      setMessageTone('error')
      setMessage(`The grade for ${getName(student)} has already been submitted.`)
      return
    }
    if (isStudentDropped(student)) {
      setMessageTone('error')
      setMessage(`${getName(student)} is marked as dropped and has no grade to submit.`)
      return
    }
    if (!student.enrollmentId) {
      setMessageTone('error')
      setMessage(`No enrollment found for ${getName(student)}.`)
      return
    }
    if (!hasGradeOrMark(student)) {
      setMessageTone('error')
      setMessage(`Enter a grade or grade mark for ${getName(student)} before submitting.`)
      return
    }
    if (savingStudentIds.includes(student._id)) {
      setMessageTone('info')
      setMessage(`Wait for ${getName(student)}'s grade to finish saving before submitting.`)
      return
    }

    // Flush this student's pending auto-save timers and save any unsaved
    // draft before sending the grade to the registrar.
    for (const key of [student._id, `remarks-${student._id}`]) {
      if (autoSaveTimersRef.current[key]) {
        clearTimeout(autoSaveTimersRef.current[key])
        delete autoSaveTimersRef.current[key]
      }
    }

    if (hasDraftChanges(student)) {
      setMessageTone('info')
      setMessage(`Saving ${getName(student)}'s grade before submission...`)
      const saved = await saveGrade(student, { silent: true })
      if (!saved) {
        setMessageTone('error')
        setMessage(`Could not save ${getName(student)}'s grade. Submission cancelled.`)
        return
      }
    }

    setSubmittingStudentIds((current) => [...current, student._id])
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('You are not logged in.')

      const response = await fetchWithAutoReconnect(
        `${API_URL}/api/professor/grade-submissions/${student.enrollmentId}/submit`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId: selectedClass.subjectId,
            semester: selectedClass.semester,
            schoolYear: selectedClass.schoolYear
          })
        }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit grade.')
      }

      setStudents((current) => current.map((entry) => (
        entry._id === student._id
          ? { ...entry, gradeSubmissionStatus: 'Submitted' }
          : entry
      )))
      setOpenActionMenu(null)
      setMessageTone('info')
      setMessage(`Grade for ${getName(student)} submitted to the registrar.`)
    } catch (e: unknown) {
      setMessageTone('error')
      setMessage(e instanceof Error ? e.message : `Failed to submit ${getName(student)}'s grade.`)
    } finally {
      setSubmittingStudentIds((current) => current.filter((id) => id !== student._id))
    }
  }

  const exportGrades = () => {
    if (!selectedClass || students.length === 0) return

    const rows = students.map((student) => [
      student.studentNumber,
      getName(student),
      getStudentCourseDisplay(student),
      String(student.yearLevel ?? ''),
      student.studentStatus || 'Active',
      student.currentGradeMark || (student.currentGrade ? formatGrade(student.currentGrade) : ''),
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
          <p>Manage course grades directly from each student&apos;s enrolled course entry.</p>
        </div>
        <div className="gm-header-controls">
          <div className="gm-class-select">
            <label htmlFor="professor-grade-class-select">Class / Course</label>
            <select
              id="professor-grade-class-select"
              value={selectedClassKey}
              onChange={(event) => {
                setSelectedClassKey(event.target.value)
                setStudents([])
                setGradeDrafts({})
                setGradeMarkDrafts({})
                setRemarkDrafts({})
                setSavingStudentIds([])
                setSubmittingStudentIds([])
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
              <span className="gm-bento-label">Course</span>
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
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              {hasEditableStudents && students.length > 0 && (
                <div className="gm-autosave-badge" title="Grades and marks are automatically saved as drafts to your account until submitted for review">
                  {savingStudentIds.length > 0 ? (
                    <>
                      <Loader2 size={15} className="gm-spin" />
                      <span>Saving draft...</span>
                    </>
                  ) : (
                    <>
                    </>
                  )}
                </div>
              )}
              {hasEditableStudents && students.length > 0 && (
                <>
                  <button
                    type="button"
                    className="gm-submit-btn"
                    onClick={() => void openSubmitPreview()}
                    disabled={submittingGrades || savingStudentIds.length > 0 || submittingStudentIds.length > 0}
                    title="Review and submit all remaining student grades to the registrar"
                  >
                    <Eye size={18} />
                    {submittingGrades ? 'Submitting...' : 'Review & Submit Grades'}
                  </button>
                  {pendingEditableCount > 0 && (
                    <span className="gm-submit-hint gm-submit-hint--warning">
                      {pendingEditableCount} student(s) still need a grade or grade mark (INC, DRP, W, FA, NG). All students must have a grade before submitting.
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
                    <th>Program</th>
                    <th>Yr Lvl</th>
                    <th>Status</th>
                    <th className="gm-grade-header">
                      Grade
                      <span className="gm-grade-info-icon" title={`Grade Scale:\n${gradeScaleLegend}`}>
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
                      const isSubmitting = submittingStudentIds.includes(student._id)
                      const studentCanEdit = canEditStudentGrades(student) && !isStudentDropped(student)
                      const studentSubmitted = isStudentSubmitted(student)
                      const hasGradeToSubmit = hasGradeOrMark(student)
                      const hasSavedGrade = Boolean(
                        (student.currentGrade !== undefined && student.currentGrade !== null && student.currentGrade !== '') ||
                        student.currentGradeMark
                      )
                      const isSaved = (saveStatusByStudent[student._id] === 'saved' || (hasSavedGrade && !hasDraftChanges(student))) && !isSaving && saveStatusByStudent[student._id] !== 'error'
                      return (
                        <tr key={student.rosterEntryKey}>
                          <td className="gm-student-id">{student.studentNumber}</td>
                          <td className="gm-student-name">{getName(student)}</td>
                          <td className="gm-muted">{getStudentCourseDisplay(student)}</td>
                          <td className="gm-muted">{student.yearLevel ?? 'N/A'}</td>
                          <td>
                            <div className="gm-row-status-stack">
                              <span className="gm-pill">{student.subjectStatus || student.studentStatus || 'Enrolled'}</span>
                              {studentSubmitted && (
                                <span className="gm-row-submission-status" title="This student's grade has been submitted to the registrar">
                                  {getStudentSubmissionStatus(student)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="gm-grade-cell">
                              <input
                                ref={(element) => {
                                  gradeInputRefs.current[student._id] = element
                                }}
                                type="text"
                                inputMode="decimal"
                                className={`gm-grade-input ${isInvalidGrade(gradeDrafts[student._id]) ? 'gm-grade-input--invalid' : ''}`}
                                style={isInvalidGrade(gradeDrafts[student._id]) ? { color: '#dc2626' } : undefined}
                                value={gradeDrafts[student._id] ?? ''}
                                onChange={(event) => handleGradeChange(student._id, event.target.value)}
                                onBlur={() => handleGradeBlur(student)}
                                onKeyDown={(event) => handleGradeKeyDown(event, student)}
                                placeholder={formatGrade(gradeScale.min)}
                                title={isInvalidGrade(gradeDrafts[student._id]) ? `Invalid grade: must be between ${formatGrade(gradeScale.min)} and ${formatGrade(gradeScale.max)}` : allowedGradeHint ? `Allowed grades: ${allowedGradeHint}` : undefined}
                                disabled={!studentCanEdit || !!gradeMarkDrafts[student._id]}
                              />
                              <select
                                className="gm-grade-mark-select"
                                value={gradeMarkDrafts[student._id] ?? ''}
                                onChange={(event) => handleGradeMarkChange(student, event.target.value)}
                                disabled={!studentCanEdit || (!!gradeDrafts[student._id] && !gradeMarkDrafts[student._id])}
                              >
                                <option value="">—</option>
                                <option value="INC">INC</option>
                                <option value="DRP">DRP</option>
                                <option value="W">W</option>
                                <option value="FA">FA</option>
                                <option value="NG">NG</option>
                              </select>
                              {isSaving ? (
                                <span className="gm-row-saving" title="Saving grade...">
                                  <Loader2 size={15} className="gm-spin" />
                                </span>
                              ) : saveStatusByStudent[student._id] === 'error' ? (
                                <span className="gm-row-error" title="Failed to auto-save">
                                  <AlertCircle size={15} />
                                </span>
                              ) : isSaved ? (
                                <span className="gm-row-saved" title="Grade saved">
                                  <Check size={16} strokeWidth={2.5} />
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="gm-remark-input"
                              value={remarkDrafts[student._id] ?? ''}
                              onChange={(event) => handleRemarkChange(student, event.target.value)}
                              onBlur={() => handleRemarkBlur(student)}
                              placeholder="Optional"
                              disabled={!studentCanEdit}
                            />
                          </td>
                          <td className="gm-muted gm-text-xs">{formatGradeUpdatedAt(student.gradeUpdatedAt)}</td>
                          <td>
                            <div className="gm-row-actions">
                              {studentSubmitted ? (
                                <span
                                  className="gm-row-submitted"
                                  title={`Grade already ${getStudentSubmissionStatus(student).toLowerCase()} to the registrar`}
                                >
                                  <Check size={16} strokeWidth={2.5} />
                                </span>
                              ) : studentCanEdit ? (
                                <button
                                  type="button"
                                  className="gm-row-submit-btn"
                                  onClick={() => void submitStudentGrade(student)}
                                  disabled={submittingGrades || isSubmitting || isSaving || !hasGradeToSubmit}
                                  aria-label={`Submit ${getName(student)}'s grade to the registrar`}
                                  title={
                                    !hasGradeToSubmit
                                      ? 'Enter a grade or grade mark before submitting'
                                      : isSubmitting
                                        ? 'Submitting grade...'
                                        : `Submit ${getName(student)}'s grade to the registrar`
                                  }
                                >
                                  {isSubmitting
                                    ? <Loader2 size={16} className="gm-spin" />
                                    : <Send size={16} />}
                                </button>
                              ) : null}
                              <div className="gm-action-dropdown-container">
                                <button
                                  type="button"
                                  className="gm-action-dropdown-btn"
                                  onClick={() => setOpenActionMenu(openActionMenu === student._id ? null : student._id)}
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {openActionMenu === student._id && (
                                  <div className="gm-action-dropdown-menu">
                                    {(studentSubmitted && hasSavedGrade) ? (
                                      <button
                                        type="button"
                                        className="gm-action-dropdown-item gm-action-dropdown-item--warning"
                                        onClick={() => {
                                          setChangeRequestStudent(student)
                                          setOpenActionMenu(null)
                                        }}
                                      >
                                        <Edit3 size={14} /> Request Change
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="gm-action-dropdown-item"
                                      onClick={() => {
                                        setSelectedStudent(student)
                                        setOpenActionMenu(null)
                                      }}
                                    >
                                      Profile
                                    </button>
                                  </div>
                                )}
                              </div>
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

      {/* Grade Submission Preview Modal */}
      {showSubmitPreview && selectedClass && (
        <div className="gm-modal-backdrop" onClick={() => !submittingGrades && setShowSubmitPreview(false)}>
          <div className="gm-modal gm-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="gm-modal-header gm-preview-modal-header">
              <div>
                <h3>Grade Submission Preview</h3>
                <p className="gm-preview-subtitle">
                  {selectedClass.subjectCode} - {selectedClass.subjectTitle} &bull; {selectedClass.blockCode || selectedClass.sectionCode} &bull; {selectedClass.semester} Term {selectedClass.schoolYear}
                </p>
              </div>
              <button
                type="button"
                className="gm-modal-close"
                onClick={() => setShowSubmitPreview(false)}
                disabled={submittingGrades}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="gm-modal-body gm-preview-modal-body">
              {/* Summary stat cards */}
              <div className="gm-preview-stats">
                <div className="gm-preview-stat-card">
                  <span className="gm-preview-stat-label">Total Enrolled</span>
                  <span className="gm-preview-stat-val">{previewStats.total}</span>
                </div>
                <div className="gm-preview-stat-card">
                  <span className="gm-preview-stat-label">Passed ({formatGrade(gradeScale.min)}–{formatGrade(gradeScale.passingGrade)})</span>
                  <span className="gm-preview-stat-val gm-text-success">{previewStats.passed}</span>
                </div>
                <div className="gm-preview-stat-card">
                  <span className="gm-preview-stat-label">Failed ({formatGrade(gradeScale.max)})</span>
                  <span className="gm-preview-stat-val gm-text-danger">{previewStats.failed}</span>
                </div>
                <div className="gm-preview-stat-card">
                  <span className="gm-preview-stat-label">Marks (INC/DRP/W)</span>
                  <span className="gm-preview-stat-val gm-text-amber">{previewStats.marks}</span>
                </div>
                <div className="gm-preview-stat-card">
                  <span className="gm-preview-stat-label">Class Average</span>
                  <span className="gm-preview-stat-val">{averageGrade}</span>
                </div>
              </div>

              {/* Status Notice */}
              {pendingEditableCount > 0 ? (
                <div className="gm-preview-notice gm-preview-notice--warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Action Required: {pendingEditableCount} student(s) still need a grade.</strong>
                    <p>All active students must have a grade (1.00 to 5.00) or grade mark (INC, DRP, W, FA, NG) before submission.</p>
                  </div>
                </div>
              ) : (
                <div className="gm-preview-notice gm-preview-notice--info">
                  <Info size={18} />
                  <div>
                    <strong>Ready for Registrar Submission</strong>
                    <p>Please review each student's final grade and remarks below. Once submitted, editing will be locked and sent to the Registrar for verification.</p>
                  </div>
                </div>
              )}

              {/* Student roster review table */}
              <div className="gm-preview-table-container">
                <table className="gm-preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Student ID</th>
                      <th>Student Name</th>
                      <th>Program &amp; Year</th>
                      <th>Final Grade</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, index) => {
                      const mark = student.currentGradeMark || gradeMarkDrafts[student._id]
                      const rawGrade = gradeDrafts[student._id] !== undefined && gradeDrafts[student._id] !== ''
                        ? gradeDrafts[student._id]
                        : student.currentGrade
                      const gradeDisplay = mark || (rawGrade ? formatGrade(rawGrade) : null)
                      const status = getGradePreviewStatus(rawGrade, mark)
                      const remarks = remarkDrafts[student._id] !== undefined ? remarkDrafts[student._id] : (student.remarks || '')

                      return (
                        <tr key={student._id} className={!gradeDisplay ? 'gm-preview-row--missing' : ''}>
                          <td className="gm-muted">{index + 1}</td>
                          <td className="gm-student-id">{student.studentNumber}</td>
                          <td className="gm-student-name">{getName(student)}</td>
                          <td className="gm-muted">{getStudentCourseDisplay(student)} - Y{student.yearLevel ?? 1}</td>
                          <td className="gm-preview-grade-cell">
                            <strong>{gradeDisplay || '—'}</strong>
                          </td>
                          <td>
                            <span className={`gm-badge gm-badge--${status.variant}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="gm-muted gm-text-xs">{remarks || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gm-preview-modal-footer">
              <button
                type="button"
                className="gm-btn gm-btn--secondary"
                onClick={() => setShowSubmitPreview(false)}
                disabled={submittingGrades}
              >
                Back to Edit
              </button>
              <button
                type="button"
                className="gm-btn gm-btn--primary gm-preview-submit-btn"
                onClick={() => void submitGradesForReview()}
                disabled={submittingGrades || pendingEditableCount > 0}
                title={pendingEditableCount > 0 ? 'All students must be graded before submission' : undefined}
              >
                <Send size={16} />
                {submittingGrades ? 'Submitting to Registrar...' : 'Confirm & Submit All to Registrar'}
              </button>
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

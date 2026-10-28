import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  FileEdit,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Star,
  Trash2,
  Users,
  X
} from 'lucide-react'
import {
  createRegistrarEvaluationPeriod,
  deleteRegistrarEvaluationPeriod,
  fetchFacultyCourseLoads,
  fetchRegistrarEvaluationOverview,
  fetchRegistrarEvaluationPeriods,
  updateRegistrarEvaluationPeriodStatus,
  type EvaluationPeriodInfo,
  type FacultyCourseLoad,
  type RegistrarEvaluationOverviewData,
  type RegistrarEvaluationRecord
} from '../../lib/evaluationApi'
import { getAcademicTerm, getCachedAcademicTerm, subscribeAcademicTerm } from '../../lib/settingsApi'
import './EvaluationManagementPage.css'

const PROGRAM_OPTIONS = [
  'All Programs',
  'BS Information Technology (BSIT)',
  'BS Business Administration (BSBA)',
  'BS Hospitality Management (BSHM)',
  'BS Secondary Education (BSED)',
  'Bachelor of Elementary Education (BEED)'
]

type FacultyCourseRow = {
  key: string
  subjectCode: string
  subjectTitle: string
  courseLabel: string
  sectionLabels: string[]
  responses: RegistrarEvaluationRecord[]
  responseCount: number
  averageRating: number
  status: 'evaluated' | 'pending'
}

type FacultyEvaluationRow = {
  professorId: string
  professorName: string
  username: string
  courses: FacultyCourseRow[]
  responseCount: number
  averageRating: number
  evaluatedCourses: number
  totalCourses: number
  status: 'evaluated' | 'partial' | 'pending' | 'unassigned'
}

const FACULTY_STATUS_LABELS: Record<FacultyEvaluationRow['status'], string> = {
  evaluated: 'Evaluated',
  partial: 'Partially Evaluated',
  pending: 'Awaiting Evaluation',
  unassigned: 'No Courses'
}

export default function EvaluationManagementPage() {
  const [periods, setPeriods] = useState<EvaluationPeriodInfo[]>([])
  const [overview, setOverview] = useState<RegistrarEvaluationOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusBanner, setStatusBanner] = useState('')

  // Filters, Search, Sorting, Pagination
  const cachedTerm = getCachedAcademicTerm()
  const [selectedSemester, setSelectedSemester] = useState<'1st' | '2nd' | 'Summer'>(cachedTerm?.semester || '1st')
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(cachedTerm?.schoolYear || '')
  const [activeTab, setActiveTab] = useState<'monitoring' | 'periods'>('monitoring')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'rating_desc' | 'rating_asc' | 'responses_desc'>('name_asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [facultyLoads, setFacultyLoads] = useState<FacultyCourseLoad[]>([])

  // Period Configuration Form State
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formSemester, setFormSemester] = useState<'1st' | '2nd' | 'Summer'>(cachedTerm?.semester || '1st')
  const [formSchoolYear, setFormSchoolYear] = useState(cachedTerm?.schoolYear || '')

  useEffect(() => {
    let cancelled = false
    const applyTerm = (term: { schoolYear: string; semester: '1st' | '2nd' | 'Summer' }) => {
      if (cancelled || !term?.schoolYear) return
      setSelectedSchoolYear(term.schoolYear)
      setSelectedSemester(term.semester)
      setFormSchoolYear((prev) => prev || term.schoolYear)
      setFormSemester(term.semester)
    }
    getAcademicTerm()
      .then(applyTerm)
      .catch(() => {})
    const unsubscribe = subscribeAcademicTerm(applyTerm)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const schoolYearOptions = useMemo(() => {
    const years = new Set<string>()
    if (selectedSchoolYear) years.add(selectedSchoolYear)
    if (formSchoolYear) years.add(formSchoolYear)
    periods.forEach((p) => {
      if (p.schoolYear) years.add(p.schoolYear)
    })
    const baseMatch = String(selectedSchoolYear || '').match(/^(\d{4})-\d{4}$/)
    if (baseMatch) {
      const start = Number(baseMatch[1])
      years.add(`${start - 1}-${start}`)
      years.add(`${start}-${start + 1}`)
      years.add(`${start + 1}-${start + 2}`)
    }
    return Array.from(years).filter(Boolean).sort().reverse()
  }, [selectedSchoolYear, formSchoolYear, periods])

  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formStartTime, setFormStartTime] = useState('08:00')
  const [formDeadlineDate, setFormDeadlineDate] = useState(() => {
    const d = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
    return d.toISOString().slice(0, 10)
  })
  const [formClosingTime, setFormClosingTime] = useState('23:59')
  const [formProgramScope, setFormProgramScope] = useState('All Programs')
  const [formSubjectScope, setFormSubjectScope] = useState('All Evaluated Subjects')
  const [formProfessorScope, setFormProfessorScope] = useState('All Assigned Faculty')
  const [formDescription, setFormDescription] = useState('')

  // Confirmation Dialog for Administrative Period Actions
  const [confirmPeriodAction, setConfirmPeriodAction] = useState<{
    period: EvaluationPeriodInfo
    action: 'draft' | 'start' | 'close' | 'reopen'
    title: string
    description: string
  } | null>(null)
  const [periodActionSubmitting, setPeriodActionSubmitting] = useState(false)

  // Extend Deadline Modal State
  const [extendTarget, setExtendTarget] = useState<EvaluationPeriodInfo | null>(null)
  const [extendDate, setExtendDate] = useState('')
  const [extendTime, setExtendTime] = useState('23:59')
  const [extendReason, setExtendReason] = useState('')
  const [extending, setExtending] = useState(false)

  // Remove Evaluation Period State
  const [deleteTarget, setDeleteTarget] = useState<EvaluationPeriodInfo | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState(false)

  // Faculty roster & evaluation detail state
  const [detailProfessorId, setDetailProfessorId] = useState<string | null>(null)
  const [detailCourseCode, setDetailCourseCode] = useState<string | null>(null)

  // Administrative controls dropdown (fixed-positioned so the table wrapper cannot clip it)
  const [openPeriodMenu, setOpenPeriodMenu] = useState<{
    id: string
    left: number
    top?: number
    bottom?: number
  } | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [periodsRes, overviewRes, loadsRes] = await Promise.all([
        fetchRegistrarEvaluationPeriods(),
        fetchRegistrarEvaluationOverview({
          semester: selectedSemester,
          schoolYear: selectedSchoolYear
        }),
        fetchFacultyCourseLoads({
          semester: selectedSemester,
          schoolYear: selectedSchoolYear
        }).catch(() => [] as FacultyCourseLoad[])
      ])
      setPeriods(periodsRes)
      setOverview(overviewRes)
      setFacultyLoads(loadsRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evaluation management data.')
    } finally {
      setLoading(false)
    }
  }, [selectedSemester, selectedSchoolYear])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortBy, selectedSemester, selectedSchoolYear])

  useEffect(() => {
    if (!openPeriodMenu) return
    const closeMenu = () => setOpenPeriodMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openPeriodMenu])

  const togglePeriodMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    period: EvaluationPeriodInfo
  ) => {
    event.stopPropagation()
    if (openPeriodMenu?.id === period.id) {
      setOpenPeriodMenu(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 200
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
    const opensUpward = rect.bottom + 190 > window.innerHeight - 8
    setOpenPeriodMenu({
      id: period.id,
      left,
      ...(opensUpward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 })
    })
  }

  const handleSavePeriod = async (saveAsDraft: boolean) => {
    setCreatingPeriod(true)
    setError('')
    setStatusBanner('')
    try {
      await createRegistrarEvaluationPeriod({
        title: formTitle.trim() || `${formSemester} Semester ${formSchoolYear} Professor Evaluation`,
        semester: formSemester,
        schoolYear: formSchoolYear.trim(),
        startDate: formStartDate,
        startTime: formStartTime,
        deadlineDate: formDeadlineDate,
        closingTime: formClosingTime,
        saveAsDraft,
        applicablePrograms: [formProgramScope],
        applicableSubjects: formSubjectScope.trim() || 'All Evaluated Subjects',
        applicableProfessors: formProfessorScope.trim() || 'All Assigned Faculty',
        description: formDescription.trim()
      })
      setShowCreateForm(false)
      setFormTitle('')
      setFormDescription('')
      setStatusBanner(
        saveAsDraft
          ? `Saved draft evaluation period for ${formSemester} Semester ${formSchoolYear}.`
          : `Created and scheduled evaluation period for ${formSemester} Semester ${formSchoolYear}.`
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save evaluation period.')
    } finally {
      setCreatingPeriod(false)
    }
  }

  const executeConfirmedPeriodAction = async () => {
    if (!confirmPeriodAction) return
    setPeriodActionSubmitting(true)
    setError('')
    setStatusBanner('')
    try {
      await updateRegistrarEvaluationPeriodStatus(confirmPeriodAction.period.id, {
        action: confirmPeriodAction.action
      })
      setStatusBanner(
        `Evaluation period "${confirmPeriodAction.period.title}" updated (${confirmPeriodAction.action.toUpperCase()}).`
      )
      setConfirmPeriodAction(null)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update evaluation period.')
    } finally {
      setPeriodActionSubmitting(false)
    }
  }

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!extendTarget) return
    setExtending(true)
    setError('')
    setStatusBanner('')
    try {
      await updateRegistrarEvaluationPeriodStatus(extendTarget.id, {
        action: 'extend',
        deadlineDate: extendDate,
        closingTime: extendTime,
        reason: extendReason.trim() || 'Authorized Registrar deadline extension'
      })
      setExtendTarget(null)
      setExtendReason('')
      setStatusBanner('Evaluation period deadline extended and logged.')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend evaluation period.')
    } finally {
      setExtending(false)
    }
  }

  const handleDeletePeriod = async () => {
    if (!deleteTarget) return
    setDeletingPeriod(true)
    setError('')
    setStatusBanner('')
    try {
      const result = await deleteRegistrarEvaluationPeriod(deleteTarget.id)
      setDeleteTarget(null)
      setStatusBanner(
        result.deletedResponses > 0
          ? `Evaluation period removed along with ${result.deletedResponses} anonymous response(s).`
          : 'Evaluation period removed.'
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove evaluation period.')
    } finally {
      setDeletingPeriod(false)
    }
  }

  // Build a professor-centric roster so faculty appear even without evaluations
  const facultyRows = useMemo<FacultyEvaluationRow[]>(() => {
    const normalize = (value: unknown) => String(value || '').trim().toLowerCase()
    const rows = new Map<string, {
      professorId: string
      professorName: string
      username: string
      responseCount: number
      ratingSum: number
    }>()
    const aliasToId = new Map<string, string>()
    const courseMaps = new Map<string, Map<string, FacultyCourseRow>>()

    const ensureRow = (id: string, name: string, username = '') => {
      const cleanId = id || `response:${normalize(name) || 'unknown'}`
      if (!rows.has(cleanId)) {
        rows.set(cleanId, {
          professorId: cleanId,
          professorName: String(name || username || 'Professor').trim(),
          username,
          responseCount: 0,
          ratingSum: 0
        })
      }
      const row = rows.get(cleanId)!
      if (!row.username && username) row.username = username
      ;[name, username].forEach((value) => {
        const key = normalize(value)
        if (key) aliasToId.set(key, cleanId)
      })
      return row
    }

    const ensureCourse = (rowId: string, subjectCode: string, subjectTitle: string, courseLabel = '') => {
      const code = String(subjectCode || '').trim().toUpperCase() || 'SUBJECT'
      let courseMap = courseMaps.get(rowId)
      if (!courseMap) {
        courseMap = new Map()
        courseMaps.set(rowId, courseMap)
      }
      if (!courseMap.has(code)) {
        courseMap.set(code, {
          key: code,
          subjectCode: code,
          subjectTitle: String(subjectTitle || '').trim() || code,
          courseLabel: courseLabel || '',
          sectionLabels: [],
          responses: [],
          responseCount: 0,
          averageRating: 0,
          status: 'pending'
        })
      }
      const course = courseMap.get(code)!
      if ((!course.subjectTitle || course.subjectTitle === code) && subjectTitle) {
        course.subjectTitle = String(subjectTitle).trim()
      }
      if (!course.courseLabel && courseLabel) course.courseLabel = String(courseLabel).trim()
      return course
    }

    for (const load of facultyLoads) {
      const id = String(load.professorId || '')
      const name = String(load.label || load.displayName || load.username || 'Professor').trim()
      ensureRow(id, name, String(load.username || '').trim())
      ;[load.displayName, load.username, load.uid].forEach((value) => {
        const key = normalize(value)
        if (key) aliasToId.set(key, id)
      })
      for (const assignment of load.assignments || []) {
        if (!assignment?.subjectCode) continue
        const course = ensureCourse(
          id,
          assignment.subjectCode,
          assignment.subjectTitle,
          assignment.courseShortLabel || assignment.courseLabel || ''
        )
        const sectionLabel = String(assignment.sectionLabel || assignment.sectionCode || '').trim()
        if (sectionLabel && !course.sectionLabels.includes(sectionLabel)) {
          course.sectionLabels.push(sectionLabel)
        }
      }
    }

    for (const response of overview?.evaluations || []) {
      const byId = response.professorId && rows.has(response.professorId) ? response.professorId : ''
      const rowId = byId
        || aliasToId.get(normalize(response.professorName))
        || `response:${normalize(response.professorName) || 'unknown'}`
      const row = ensureRow(rowId, response.professorName)
      const course = ensureCourse(rowId, response.subjectCode, response.subjectTitle, response.course || '')
      const sectionCode = String(response.sectionCode || '').trim()
      if (sectionCode && !course.sectionLabels.includes(sectionCode)) {
        course.sectionLabels.push(sectionCode)
      }
      course.responses.push(response)
      course.responseCount += 1
      course.averageRating += Number(response.averageRating || 0)
      row.responseCount += 1
      row.ratingSum += Number(response.averageRating || 0)
    }

    return Array.from(rows.values()).map((row) => {
      const courses = Array.from(courseMaps.get(row.professorId)?.values() || [])
        .map((course) => ({
          ...course,
          averageRating: course.responseCount > 0
            ? Number((course.averageRating / course.responseCount).toFixed(2))
            : 0,
          status: (course.responseCount > 0 ? 'evaluated' : 'pending') as FacultyCourseRow['status']
        }))
        .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode))
      const evaluatedCourses = courses.filter((course) => course.responseCount > 0).length
      const status: FacultyEvaluationRow['status'] = courses.length === 0
        ? 'unassigned'
        : evaluatedCourses === courses.length
          ? 'evaluated'
          : evaluatedCourses === 0
            ? 'pending'
            : 'partial'

      return {
        professorId: row.professorId,
        professorName: row.professorName,
        username: row.username,
        courses,
        responseCount: row.responseCount,
        averageRating: row.responseCount > 0
          ? Number((row.ratingSum / row.responseCount).toFixed(2))
          : 0,
        evaluatedCourses,
        totalCourses: courses.length,
        status
      }
    })
  }, [facultyLoads, overview])

  // Filter, sort, and paginate the faculty roster
  const processedFaculty = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = facultyRows.filter((row) => {
      if (!query) return true
      if (row.professorName.toLowerCase().includes(query) || row.username.toLowerCase().includes(query)) {
        return true
      }
      return row.courses.some((course) => (
        course.subjectCode.toLowerCase().includes(query) ||
        course.subjectTitle.toLowerCase().includes(query) ||
        course.sectionLabels.some((label) => label.toLowerCase().includes(query)) ||
        course.responses.some((response) => (response.comment || '').toLowerCase().includes(query))
      ))
    })

    filtered.sort((a, b) => {
      if (sortBy === 'name_desc') return b.professorName.localeCompare(a.professorName)
      if (sortBy === 'rating_desc') return b.averageRating - a.averageRating || a.professorName.localeCompare(b.professorName)
      if (sortBy === 'rating_asc') return a.averageRating - b.averageRating || a.professorName.localeCompare(b.professorName)
      if (sortBy === 'responses_desc') return b.responseCount - a.responseCount || a.professorName.localeCompare(b.professorName)
      return a.professorName.localeCompare(b.professorName)
    })

    return filtered
  }, [facultyRows, searchQuery, sortBy])

  const totalPages = Math.max(1, Math.ceil(processedFaculty.length / pageSize))
  const paginatedFaculty = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return processedFaculty.slice(start, start + pageSize)
  }, [processedFaculty, currentPage, pageSize])

  const facultyWithResponses = facultyRows.filter((row) => row.responseCount > 0).length
  const totalCoursesMonitored = facultyRows.reduce((sum, row) => sum + row.totalCourses, 0)
  const totalCoursesEvaluated = facultyRows.reduce((sum, row) => sum + row.evaluatedCourses, 0)

  const detailFaculty = useMemo(
    () => facultyRows.find((row) => row.professorId === detailProfessorId) || null,
    [facultyRows, detailProfessorId]
  )
  const detailCourse = detailFaculty && detailCourseCode
    ? detailFaculty.courses.find((course) => course.key === detailCourseCode) || null
    : null
  const detailResponses = detailCourse
    ? detailCourse.responses
    : detailFaculty
      ? detailFaculty.courses.flatMap((course) => course.responses)
      : []
  const detailQuestionSummaries = (() => {
    if (!detailFaculty || detailResponses.length === 0) return []
    const questions = overview?.questions || []
    return questions.map((question) => {
      const scores = detailResponses
        .flatMap((response) =>
          (response.ratings || [])
            .filter((rating) => rating.questionNumber === question.number)
            .map((rating) => Number(rating.score) || 0)
        )
        .filter((score) => score >= 1 && score <= 5)
      const average = scores.length > 0
        ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
        : 0
      const emojiMeta = overview?.emojiScale?.find((item) => item.score === Math.round(average))
      return {
        number: question.number,
        text: question.text,
        average,
        count: scores.length,
        emoji: emojiMeta?.emoji || '—'
      }
    })
  })()
  const detailComments = detailResponses.filter((response) => Boolean(String(response.comment || '').trim()))

  const activePeriod = overview?.activePeriod
  const progress = overview?.progress
  const termLabel = `${selectedSemester} Semester • SY ${selectedSchoolYear || '—'}`

  return (
    <div className="reg-eval-page">
      {/* Page Header */}
      <header className="reg-eval-header">
        <div>
          <div className="reg-eval-eyebrow">
            <ShieldCheck size={14} />
            <span>Office of the Registrar • Governance &amp; Scheduling</span>
          </div>
          <h1 className="reg-eval-title">Professor Evaluation Management</h1>
          <p className="reg-eval-subtitle">
            Configure per-semester evaluation schedules and monitor faculty evaluation status and results by course.
          </p>
        </div>

        <div className="reg-eval-header-actions">
          <button
            type="button"
            className="reg-eval-btn reg-eval-btn-secondary"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'reg-eval-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="reg-eval-btn reg-eval-btn-primary"
            onClick={() =>
              setShowCreateForm((prev) => {
                const next = !prev
                if (next) {
                  setFormSemester(selectedSemester)
                  setFormSchoolYear(selectedSchoolYear)
                }
                return next
              })
            }
          >
            <Plus size={15} />
            <span>{showCreateForm ? 'Close Configuration Form' : 'Configure Evaluation Period'}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="reg-eval-alert is-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {statusBanner && (
        <div className="reg-eval-alert is-success" role="status">
          <CheckCircle2 size={17} />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Evaluation Period Configuration Form */}
      {showCreateForm && (
        <section className="reg-eval-config-card" aria-label="Evaluation period configuration">
          <div className="reg-eval-config-head">
            <div>
              <h2>Evaluation Period Configuration</h2>
              <p>
                Define the academic term, opening schedule, submission deadline, and applicable program/faculty scope. Submissions automatically close after the deadline unless extended.
              </p>
            </div>
            <button
              type="button"
              className="reg-eval-icon-close"
              onClick={() => setShowCreateForm(false)}
              aria-label="Close configuration form"
            >
              <X size={18} />
            </button>
          </div>

          <div className="reg-eval-config-grid">
            <label className="reg-eval-field">
              <span>Period Title</span>
              <input
                type="text"
                placeholder="e.g. 1st Semester 2026-2027 Faculty Evaluation"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Semester</span>
              <select
                value={formSemester}
                onChange={(e) => setFormSemester(e.target.value as '1st' | '2nd' | 'Summer')}
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </label>

            <label className="reg-eval-field">
              <span>School Year</span>
              <input
                type="text"
                placeholder="2026-2027"
                pattern="\d{4}-\d{4}"
                value={formSchoolYear}
                onChange={(e) => setFormSchoolYear(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Evaluation Start Date</span>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Start Time</span>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Submission Deadline</span>
              <input
                type="date"
                value={formDeadlineDate}
                onChange={(e) => setFormDeadlineDate(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Closing Time</span>
              <input
                type="time"
                value={formClosingTime}
                onChange={(e) => setFormClosingTime(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Applicable Programs</span>
              <select
                value={formProgramScope}
                onChange={(e) => setFormProgramScope(e.target.value)}
              >
                {PROGRAM_OPTIONS.map((prog) => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))}
              </select>
            </label>

            <label className="reg-eval-field">
              <span>Applicable Subjects</span>
              <input
                type="text"
                placeholder="All Evaluated Subjects or specific subject codes"
                value={formSubjectScope}
                onChange={(e) => setFormSubjectScope(e.target.value)}
              />
            </label>

            <label className="reg-eval-field">
              <span>Professor Assignments Scope</span>
              <input
                type="text"
                placeholder="All Assigned Faculty or department filter"
                value={formProfessorScope}
                onChange={(e) => setFormProfessorScope(e.target.value)}
              />
            </label>

            <label className="reg-eval-field reg-eval-field-span2">
              <span>Administrative Notes (Optional)</span>
              <input
                type="text"
                placeholder="Policy notes or instructions for faculty..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="reg-eval-config-actions">
            <button
              type="button"
              className="reg-eval-btn reg-eval-btn-secondary"
              onClick={() => setShowCreateForm(false)}
              disabled={creatingPeriod}
            >
              Cancel
            </button>
            <button
              type="button"
              className="reg-eval-btn reg-eval-btn-secondary"
              onClick={() => void handleSavePeriod(true)}
              disabled={creatingPeriod}
            >
              <FileEdit size={15} />
              <span>Save Draft</span>
            </button>
            <button
              type="button"
              className="reg-eval-btn reg-eval-btn-primary"
              onClick={() => void handleSavePeriod(false)}
              disabled={creatingPeriod}
            >
              <Play size={15} />
              <span>{creatingPeriod ? 'Saving...' : 'Publish & Start Period'}</span>
            </button>
          </div>
        </section>
      )}

      {/* Term Selector & Active Period Control Strip */}
      <section className="reg-eval-active-strip">
        <div className="reg-eval-term-picker">
          <div className="reg-eval-inline-field">
            <label htmlFor="reg-eval-sem">Semester</label>
            <select
              id="reg-eval-sem"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value as '1st' | '2nd' | 'Summer')}
            >
              <option value="1st">1st Semester</option>
              <option value="2nd">2nd Semester</option>
              <option value="Summer">Summer</option>
            </select>
          </div>

          <div className="reg-eval-inline-field">
            <label htmlFor="reg-eval-sy">School Year</label>
            <select
              id="reg-eval-sy"
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
            >
              {schoolYearOptions.map((sy) => (
                <option key={sy} value={sy}>{sy}</option>
              ))}
            </select>
          </div>
        </div>

        {activePeriod && (
          <div className="reg-eval-active-period-summary">
            <span className={`reg-eval-status-badge status-${activePeriod.status}`}>
              {activePeriod.status.toUpperCase()}
            </span>
            <span className="reg-eval-period-dates">
              <Calendar size={14} />
              <span>
                {activePeriod.startDisplay} — {activePeriod.deadlineDisplay}
              </span>
            </span>
            <div className="reg-eval-strip-btns">
              {activePeriod.status !== 'open' && (
                <button
                  type="button"
                  className="reg-eval-btn-xs is-primary"
                  onClick={() =>
                    setConfirmPeriodAction({
                      period: activePeriod,
                      action: activePeriod.status === 'closed' ? 'reopen' : 'start',
                      title:
                        activePeriod.status === 'closed'
                          ? 'Reopen Evaluation Period'
                          : 'Start Evaluation Period',
                      description: `Are you sure you want to ${
                        activePeriod.status === 'closed' ? 'reopen' : 'start'
                      } "${activePeriod.title}"? Faculty evaluations will immediately become available for this semester.`
                    })
                  }
                >
                  <Play size={13} />
                  <span>{activePeriod.status === 'closed' ? 'Reopen Period' : 'Start Evaluation'}</span>
                </button>
              )}
              <button
                type="button"
                className="reg-eval-btn-xs is-secondary"
                onClick={() => {
                  setExtendTarget(activePeriod)
                  setExtendDate(activePeriod.deadlineDate)
                  setExtendTime(activePeriod.closingTime || '23:59')
                }}
              >
                <Clock size={13} />
                <span>Extend Deadline</span>
              </button>
              {activePeriod.status !== 'closed' && (
                <button
                  type="button"
                  className="reg-eval-btn-xs is-danger"
                  onClick={() =>
                    setConfirmPeriodAction({
                      period: activePeriod,
                      action: 'close',
                      title: 'Close Evaluation Submissions',
                      description: `Are you sure you want to close submissions for "${activePeriod.title}"? Evaluations will no longer be accepted for this semester unless the period is reopened or extended.`
                    })
                  }
                >
                  <Square size={13} />
                  <span>Close Submissions</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Summary KPI Cards */}
      <section className="reg-eval-kpi-grid" aria-label="Evaluation results summary">
        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <FileCheck2 size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Total Responses</span>
            <strong className="reg-eval-kpi-value">{progress?.totalResponses ?? 0}</strong>
            <span className="reg-eval-kpi-sub">Anonymous evaluations this semester</span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <Star size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Average Rating</span>
            <strong className="reg-eval-kpi-value">
              {(progress?.averageRating ?? 0).toFixed(2)}
            </strong>
            <span className="reg-eval-kpi-sub">out of 5.00</span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <Users size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Faculty Monitored</span>
            <strong className="reg-eval-kpi-value">{facultyRows.length}</strong>
            <span className="reg-eval-kpi-sub">
              {facultyWithResponses} evaluated • {Math.max(0, facultyRows.length - facultyWithResponses)} awaiting
            </span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <BookOpen size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Courses Monitored</span>
            <strong className="reg-eval-kpi-value">{totalCoursesMonitored}</strong>
            <span className="reg-eval-kpi-sub">{totalCoursesEvaluated} evaluated • {termLabel}</span>
          </div>
        </div>
      </section>

      {/* Section Navigation Tabs */}
      <div className="reg-eval-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'monitoring'}
          className={`reg-eval-tab ${activeTab === 'monitoring' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('monitoring')}
        >
          <FileCheck2 size={16} />
          <span>Faculty Evaluation Status ({facultyRows.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'periods'}
          className={`reg-eval-tab ${activeTab === 'periods' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('periods')}
        >
          <Calendar size={16} />
          <span>Evaluation Periods ({periods.length})</span>
        </button>
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="reg-eval-skeleton-panel" aria-busy="true">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="reg-eval-skeleton-row" />
          ))}
        </div>
      ) : activeTab === 'monitoring' ? (
        <section className="reg-eval-panel" aria-label="Faculty evaluation status table">
          {/* Search, Filtering, and Sorting Toolbar */}
          <div className="reg-eval-table-toolbar">
            <div className="reg-eval-search-box">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search professor, course, section, or comment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="reg-eval-toolbar-controls">
              <div className="reg-eval-control-group">
                <SlidersHorizontal size={14} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sort faculty evaluation status"
                >
                  <option value="name_asc">Professor (A–Z)</option>
                  <option value="name_desc">Professor (Z–A)</option>
                  <option value="rating_desc">Highest Rating</option>
                  <option value="rating_asc">Lowest Rating</option>
                  <option value="responses_desc">Most Responses</option>
                </select>
              </div>

              <div className="reg-eval-control-group">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          </div>

          {paginatedFaculty.length === 0 ? (
            <div className="reg-eval-empty">
              <FileCheck2 size={30} />
              <h3>No Faculty Records Found</h3>
              <p>No faculty or course assignments match your current search for {termLabel}.</p>
            </div>
          ) : (
            <>
              <div className="reg-eval-table-wrap">
                <table className="reg-eval-table reg-eval-faculty-table">
                  <thead>
                    <tr>
                      <th>Professor</th>
                      <th>Assigned Courses &amp; Evaluation Status</th>
                      <th>Responses</th>
                      <th>Average Rating</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFaculty.map((row) => (
                      <tr key={row.professorId}>
                        <td>
                          <div className="reg-eval-prof-subj">
                            <strong>{row.professorName}</strong>
                            <span>{row.username || 'Faculty account'}</span>
                          </div>
                        </td>
                        <td>
                          {row.courses.length === 0 ? (
                            <span className="reg-eval-subtext">No assigned courses for this term</span>
                          ) : (
                            <div className="reg-eval-course-stack">
                              {row.courses.slice(0, 3).map((course) => (
                                <div key={course.key} className="reg-eval-course-line">
                                  <span className="reg-eval-course-code">{course.subjectCode}</span>
                                  <span className="reg-eval-course-title" title={course.subjectTitle}>
                                    {course.subjectTitle}
                                  </span>
                                  <span className={`reg-eval-course-chip is-${course.status}`}>
                                    {course.responseCount > 0
                                      ? `${course.responseCount} response${course.responseCount === 1 ? '' : 's'}`
                                      : 'No responses'}
                                  </span>
                                </div>
                              ))}
                              {row.courses.length > 3 && (
                                <span className="reg-eval-subtext">
                                  +{row.courses.length - 3} more course(s)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <strong>{row.responseCount}</strong>
                        </td>
                        <td>
                          {row.responseCount > 0 ? (
                            <div className="reg-eval-rating-cell">
                              <strong>{row.averageRating.toFixed(2)}</strong>
                              <span>/ 5.00</span>
                            </div>
                          ) : (
                            <span className="reg-eval-subtext">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`reg-eval-faculty-status is-${row.status}`}>
                            {FACULTY_STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="reg-eval-row-actions">
                            <button
                              type="button"
                              className="reg-eval-btn-xs is-secondary"
                              onClick={() => {
                                setDetailProfessorId(row.professorId)
                                setDetailCourseCode(row.courses.length === 1 ? row.courses[0].key : null)
                              }}
                            >
                              <span>View Details</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="reg-eval-pagination">
                <span className="reg-eval-page-info">
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, processedFaculty.length)} of{' '}
                  {processedFaculty.length} professor(s)
                </span>
                <div className="reg-eval-page-controls">
                  <button
                    type="button"
                    className="reg-eval-page-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={15} />
                    <span>Previous</span>
                  </button>
                  <span className="reg-eval-page-num">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="reg-eval-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <span>Next</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="reg-eval-panel" aria-label="Configured evaluation periods">
          <div className="reg-eval-table-wrap">
            <table className="reg-eval-table">
              <thead>
                <tr>
                  <th>Period &amp; Academic Term</th>
                  <th>Schedule Window</th>
                  <th>Applicable Scope</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th className="text-right">Administrative Controls</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="reg-eval-prof-subj">
                        <strong>{p.title}</strong>
                        <span>
                          {p.semester} Semester • SY {p.schoolYear}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="reg-eval-prof-subj">
                        <span>Opens: {p.startDisplay}</span>
                        <strong>Closes: {p.deadlineDisplay}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="reg-eval-prof-subj">
                        <span>{(p.applicablePrograms || ['All Programs']).join(', ')}</span>
                        <span>{p.applicableSubjects || 'All Evaluated Subjects'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`reg-eval-status-badge status-${p.status}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="reg-eval-prof-subj">
                        <strong>{p.totalResponses || 0} response(s)</strong>
                        <span>
                          {p.professorCount || 0} professor(s) • {p.subjectCount || 0} subject(s)
                        </span>
                        <span>Avg {(p.averageRating || 0).toFixed(2)} / 5.00</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="reg-eval-menu-wrap">
                        <button
                          type="button"
                          className="reg-eval-menu-trigger"
                          aria-haspopup="menu"
                          aria-expanded={openPeriodMenu?.id === p.id}
                          aria-label={`Administrative controls for ${p.title}`}
                          onClick={(event) => togglePeriodMenu(event, p)}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openPeriodMenu?.id === p.id && (
                          <div
                            className="reg-eval-menu"
                            role="menu"
                            style={{ top: openPeriodMenu.top, left: openPeriodMenu.left, bottom: openPeriodMenu.bottom }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {p.status !== 'open' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="reg-eval-menu-item"
                                onClick={() => {
                                  setOpenPeriodMenu(null)
                                  setConfirmPeriodAction({
                                    period: p,
                                    action: p.status === 'closed' ? 'reopen' : 'start',
                                    title:
                                      p.status === 'closed'
                                        ? 'Reopen Evaluation Period'
                                        : 'Start Evaluation Period',
                                    description: `Confirm ${
                                      p.status === 'closed' ? 'reopening' : 'starting'
                                    } "${p.title}" (${p.semester} Semester ${p.schoolYear}).`
                                  })
                                }}
                              >
                                {p.status === 'closed' ? <RotateCcw size={14} /> : <Play size={14} />}
                                <span>{p.status === 'closed' ? 'Reopen Period' : 'Start Period'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="reg-eval-menu-item"
                              onClick={() => {
                                setOpenPeriodMenu(null)
                                setExtendTarget(p)
                                setExtendDate(p.deadlineDate)
                                setExtendTime(p.closingTime || '23:59')
                              }}
                            >
                              <Clock size={14} />
                              <span>Extend Deadline</span>
                            </button>
                            {p.status !== 'closed' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="reg-eval-menu-item is-danger"
                                onClick={() => {
                                  setOpenPeriodMenu(null)
                                  setConfirmPeriodAction({
                                    period: p,
                                    action: 'close',
                                    title: 'Close Evaluation Period',
                                    description: `Confirm closing submissions for "${p.title}".`
                                  })
                                }}
                              >
                                <Square size={14} />
                                <span>Close Period</span>
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="reg-eval-menu-item is-danger"
                              onClick={() => {
                                setOpenPeriodMenu(null)
                                setDeleteTarget(p)
                              }}
                            >
                              <Trash2 size={14} />
                              <span>Remove Evaluation</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Confirmation Dialog for Administrative Period Actions */}
      {confirmPeriodAction && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal">
            <div className="reg-eval-modal-head">
              <h3>{confirmPeriodAction.title}</h3>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => setConfirmPeriodAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="reg-eval-modal-body">
              <p>{confirmPeriodAction.description}</p>
            </div>
            <div className="reg-eval-modal-foot">
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-secondary"
                onClick={() => setConfirmPeriodAction(null)}
                disabled={periodActionSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-primary"
                onClick={() => void executeConfirmedPeriodAction()}
                disabled={periodActionSubmitting}
              >
                {periodActionSubmitting ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Evaluation Period Modal */}
      {extendTarget && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal">
            <div className="reg-eval-modal-head">
              <h3>Extend Evaluation Deadline</h3>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => setExtendTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleExtendSubmit}>
              <div className="reg-eval-modal-body">
                <p>
                  Grant an authorized extension for <strong>{extendTarget.title}</strong>.
                </p>
                <div className="reg-eval-modal-grid">
                  <label className="reg-eval-field">
                    <span>New Deadline Date</span>
                    <input
                      type="date"
                      value={extendDate}
                      onChange={(e) => setExtendDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="reg-eval-field">
                    <span>New Closing Time</span>
                    <input
                      type="time"
                      value={extendTime}
                      onChange={(e) => setExtendTime(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className="reg-eval-field">
                  <span>Authorization Reason</span>
                  <input
                    type="text"
                    placeholder="e.g. Approved extension for late evaluation encoding"
                    value={extendReason}
                    onChange={(e) => setExtendReason(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="reg-eval-modal-foot">
                <button
                  type="button"
                  className="reg-eval-btn reg-eval-btn-secondary"
                  onClick={() => setExtendTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="reg-eval-btn reg-eval-btn-primary"
                  disabled={extending}
                >
                  {extending ? 'Extending...' : 'Confirm Extension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Evaluation Period Modal */}
      {deleteTarget && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal">
            <div className="reg-eval-modal-head">
              <h3>Remove Evaluation</h3>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingPeriod}
                aria-label="Close remove evaluation dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="reg-eval-modal-body">
              <p>
                Are you sure you want to permanently remove{' '}
                <strong>{deleteTarget.title}</strong>?
              </p>
              <p className="reg-eval-subtext">
                {(deleteTarget.totalResponses || 0) > 0
                  ? `${deleteTarget.totalResponses} anonymous evaluation response(s) for this semester will also be deleted. `
                  : 'No evaluation responses are currently recorded for this period. '}
                This action cannot be undone.
              </p>
            </div>
            <div className="reg-eval-modal-foot">
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingPeriod}
              >
                Cancel
              </button>
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-danger"
                onClick={() => void handleDeletePeriod()}
                disabled={deletingPeriod}
              >
                <Trash2 size={15} />
                <span>{deletingPeriod ? 'Removing...' : 'Remove Evaluation'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Evaluation Details Modal */}
      {detailFaculty && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal reg-eval-modal-lg">
            <div className="reg-eval-modal-head">
              <div>
                <span className="reg-eval-record-num">{termLabel}</span>
                <h3>{detailFaculty.professorName}</h3>
                <p className="reg-eval-subtext">
                  {detailFaculty.username ? `${detailFaculty.username} • ` : ''}
                  {detailCourse
                    ? `${detailCourse.subjectCode} — ${detailCourse.subjectTitle}`
                    : 'All assigned courses'}
                </p>
              </div>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => {
                  setDetailProfessorId(null)
                  setDetailCourseCode(null)
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="reg-eval-modal-body">
              <div className="reg-eval-faculty-summary">
                <div>
                  <span>Status</span>
                  <strong className={`reg-eval-faculty-status is-${detailFaculty.status}`}>
                    {FACULTY_STATUS_LABELS[detailFaculty.status]}
                  </strong>
                </div>
                <div>
                  <span>Responses</span>
                  <strong>{detailFaculty.responseCount}</strong>
                </div>
                <div>
                  <span>Average Rating</span>
                  <strong>
                    {detailFaculty.responseCount > 0
                      ? `${detailFaculty.averageRating.toFixed(2)} / 5.00`
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Courses Evaluated</span>
                  <strong>{detailFaculty.evaluatedCourses} / {detailFaculty.totalCourses}</strong>
                </div>
              </div>

              <h4 className="reg-eval-detail-heading">Course Evaluation Status</h4>
              {detailFaculty.courses.length === 0 ? (
                <p className="reg-eval-subtext">
                  No courses are assigned to this professor for {termLabel}.
                </p>
              ) : (
                <div className="reg-eval-course-detail-list">
                  {detailFaculty.courses.length > 1 && (
                    <button
                      type="button"
                      className={`reg-eval-course-detail ${!detailCourseCode ? 'is-active' : ''}`}
                      onClick={() => setDetailCourseCode(null)}
                    >
                      <span className="reg-eval-course-detail-main">
                        <strong>All Courses</strong>
                        <span>{detailFaculty.totalCourses} assigned course(s)</span>
                      </span>
                      <span className="reg-eval-course-chip is-evaluated">
                        {detailFaculty.responseCount} response(s)
                      </span>
                    </button>
                  )}
                  {detailFaculty.courses.map((course) => (
                    <button
                      key={course.key}
                      type="button"
                      className={`reg-eval-course-detail ${detailCourseCode === course.key ? 'is-active' : ''}`}
                      onClick={() => setDetailCourseCode(course.key)}
                    >
                      <span className="reg-eval-course-detail-main">
                        <strong>{course.subjectCode}</strong>
                        <span>{course.subjectTitle}</span>
                        {course.sectionLabels.length > 0 && (
                          <small>{course.sectionLabels.join(' • ')}</small>
                        )}
                      </span>
                      <span className={`reg-eval-course-chip is-${course.status}`}>
                        {course.responseCount > 0
                          ? `${course.responseCount} response(s) • ${course.averageRating.toFixed(2)} / 5.00`
                          : 'No responses'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <h4 className="reg-eval-detail-heading">
                {detailCourse ? `${detailCourse.subjectCode} Evaluation Details` : 'Evaluation Details'}
              </h4>
              {detailResponses.length === 0 ? (
                <div className="reg-eval-empty reg-eval-empty-compact">
                  <p>
                    No anonymous evaluations submitted{' '}
                    {detailCourse ? 'for this course' : 'for this professor'} yet for {termLabel}.
                  </p>
                </div>
              ) : (
                <>
                  <div className="reg-eval-detail-ratings">
                    {detailQuestionSummaries.map((question) => (
                      <div key={question.number} className="reg-eval-detail-row">
                        <span>
                          <strong>Q{question.number}.</strong> {question.text}
                        </span>
                        <span className="reg-eval-detail-score">
                          <span aria-hidden="true">{question.emoji}</span>
                          <strong>{question.average.toFixed(2)}</strong>
                          <span className="reg-eval-subtext">({question.count} response(s))</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <h4 className="reg-eval-detail-heading">
                    Anonymous Comments ({detailComments.length})
                  </h4>
                  {detailComments.length === 0 ? (
                    <p className="reg-eval-subtext">No anonymous comments for this selection.</p>
                  ) : (
                    <div className="reg-eval-comment-list">
                      {detailComments.map((comment) => (
                        <div key={comment.id} className="reg-eval-comment-item">
                          <div className="reg-eval-comment-meta">
                            <span>{comment.subjectCode}</span>
                            <span>
                              {comment.submittedAt
                                ? new Date(comment.submittedAt).toLocaleString()
                                : ''}
                            </span>
                          </div>
                          <p>{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="reg-eval-modal-foot">
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-primary"
                onClick={() => {
                  setDetailProfessorId(null)
                  setDetailCourseCode(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

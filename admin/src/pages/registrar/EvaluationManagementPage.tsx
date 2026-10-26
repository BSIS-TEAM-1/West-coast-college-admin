import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  FileEdit,
  History,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Users,
  X
} from 'lucide-react'
import {
  createRegistrarEvaluationPeriod,
  fetchRegistrarEvaluationOverview,
  fetchRegistrarEvaluationPeriods,
  revealEvaluationStudentIdentity,
  updateRegistrarEvaluationPeriodStatus,
  type EvaluationPeriodInfo,
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
  const [activeTab, setActiveTab] = useState<'monitoring' | 'periods' | 'incomplete' | 'audit'>('monitoring')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Completed' | 'Revealed'>('ALL')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'rating_desc' | 'rating_asc' | 'record_asc'>('date_desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

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
  const [formSubjectScope, setFormSubjectScope] = useState('All Enrolled Subjects')
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

  // View Evaluation Details Modal
  const [detailRecord, setDetailRecord] = useState<RegistrarEvaluationRecord | null>(null)

  // Controlled Identity Reveal Confirmation Modal State
  const [revealTarget, setRevealTarget] = useState<RegistrarEvaluationRecord | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [revealConfirmedCheck, setRevealConfirmedCheck] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState('')
  const [revealedMap, setRevealedMap] = useState<
    Record<string, NonNullable<RegistrarEvaluationRecord['studentIdentity']>>
  >({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [periodsRes, overviewRes] = await Promise.all([
        fetchRegistrarEvaluationPeriods(),
        fetchRegistrarEvaluationOverview({
          semester: selectedSemester,
          schoolYear: selectedSchoolYear
        })
      ])
      setPeriods(periodsRes)
      setOverview(overviewRes)
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
  }, [searchQuery, statusFilter, sortBy, selectedSemester, selectedSchoolYear])

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
        applicableSubjects: formSubjectScope.trim() || 'All Enrolled Subjects',
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

  const handleRevealSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!revealTarget) return
    if (revealReason.trim().length < 5) {
      setRevealError('Please enter a valid administrative reason (minimum 5 characters).')
      return
    }
    if (!revealConfirmedCheck) {
      setRevealError('Please confirm that this identity reveal is authorized and will be permanently audited.')
      return
    }

    setRevealing(true)
    setRevealError('')
    try {
      const result = await revealEvaluationStudentIdentity(revealTarget.id, revealReason.trim())
      setRevealedMap((prev) => ({
        ...prev,
        [revealTarget.id]: result.studentIdentity
      }))
      setRevealTarget(null)
      setRevealReason('')
      setRevealConfirmedCheck(false)
      setStatusBanner(
        `Student identity revealed for record ${
          revealTarget.recordNumber || revealTarget.id.slice(-6).toUpperCase()
        } and recorded in the permanent audit log.`
      )
      await loadAll()
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal student identity.')
    } finally {
      setRevealing(false)
    }
  }

  // Filter, sort, and paginate evaluation records
  const processedEvaluations = useMemo(() => {
    const list = (overview?.evaluations || []).map((rec, idx, arr) => ({
      ...rec,
      recordNumber:
        rec.recordNumber ||
        `EV-${String(rec.schoolYear || '2026').slice(0, 4)}-${String(arr.length - idx).padStart(4, '0')}`,
      submissionStatus: rec.submissionStatus || 'Completed'
    }))

    const q = searchQuery.trim().toLowerCase()
    const filtered = list.filter((rec) => {
      const isRevealed = Boolean(revealedMap[rec.id]?.isRevealed || rec.revealCount > 0)
      if (statusFilter === 'Revealed' && !isRevealed) return false
      if (!q) return true
      return (
        String(rec.recordNumber || '').toLowerCase().includes(q) ||
        rec.subjectCode.toLowerCase().includes(q) ||
        rec.subjectTitle.toLowerCase().includes(q) ||
        rec.professorName.toLowerCase().includes(q) ||
        (rec.comment || '').toLowerCase().includes(q)
      )
    })

    filtered.sort((a, b) => {
      if (sortBy === 'date_asc') {
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      }
      if (sortBy === 'rating_desc') {
        return b.averageRating - a.averageRating
      }
      if (sortBy === 'rating_asc') {
        return a.averageRating - b.averageRating
      }
      if (sortBy === 'record_asc') {
        return String(a.recordNumber).localeCompare(String(b.recordNumber))
      }
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    })

    return filtered
  }, [overview, searchQuery, statusFilter, sortBy, revealedMap])

  const totalPages = Math.max(1, Math.ceil(processedEvaluations.length / pageSize))
  const paginatedEvaluations = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return processedEvaluations.slice(start, start + pageSize)
  }, [processedEvaluations, currentPage, pageSize])

  const activePeriod = overview?.activePeriod
  const progress = overview?.progress

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
            Configure evaluation schedules, monitor institutional submission progress, and manage audited identity controls.
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
            onClick={() => setShowCreateForm((prev) => !prev)}
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
                placeholder="All Enrolled Subjects or specific subject codes"
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
                placeholder="Policy notes or instructions for students and faculty..."
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
                      } "${activePeriod.title}"? Students will immediately be able to submit evaluations.`
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
                      description: `Are you sure you want to close submissions for "${activePeriod.title}"? Students with incomplete evaluations will no longer be able to submit unless the period is reopened or extended.`
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
      <section className="reg-eval-kpi-grid" aria-label="Evaluation submission progress">
        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <FileCheck2 size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Submission Progress</span>
            <strong className="reg-eval-kpi-value">{progress?.completionPercentage ?? 0}%</strong>
            <span className="reg-eval-kpi-sub">
              {progress?.totalSubmittedEvaluations ?? 0} of {progress?.totalRequiredEvaluations ?? 0} subject evaluations
            </span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <Users size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Students Fully Completed</span>
            <strong className="reg-eval-kpi-value">
              {progress?.studentsFullyCompleted ?? 0} / {progress?.totalStudentsEnrolled ?? 0}
            </strong>
            <span className="reg-eval-kpi-sub">Grades unlocked upon release</span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <Clock size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Incomplete Evaluations</span>
            <strong className="reg-eval-kpi-value">{progress?.studentsIncomplete ?? 0}</strong>
            <span className="reg-eval-kpi-sub">
              {progress?.pendingEvaluations ?? 0} pending subject evaluation(s)
            </span>
          </div>
        </div>

        <div className="reg-eval-kpi-card">
          <div className="reg-eval-kpi-icon">
            <History size={20} />
          </div>
          <div className="reg-eval-kpi-body">
            <span className="reg-eval-kpi-label">Audited Identity Reveals</span>
            <strong className="reg-eval-kpi-value">{overview?.revealLogs?.length ?? 0}</strong>
            <span className="reg-eval-kpi-sub">Logged with Registrar &amp; reason</span>
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
          <span>Evaluation Monitoring ({overview?.evaluations?.length || 0})</span>
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
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'incomplete'}
          className={`reg-eval-tab ${activeTab === 'incomplete' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('incomplete')}
        >
          <Clock size={16} />
          <span>Incomplete Students ({overview?.incompleteEvaluations?.length || 0})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          className={`reg-eval-tab ${activeTab === 'audit' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <History size={16} />
          <span>Identity Reveal Audit Log ({overview?.revealLogs?.length || 0})</span>
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
        <section className="reg-eval-panel" aria-label="Evaluation monitoring table">
          {/* Search, Filtering, and Sorting Toolbar */}
          <div className="reg-eval-table-toolbar">
            <div className="reg-eval-search-box">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search record number, professor, subject code, or comment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="reg-eval-toolbar-controls">
              <div className="reg-eval-control-group">
                <SlidersHorizontal size={14} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  aria-label="Filter by identity status"
                >
                  <option value="ALL">All Records ({overview?.evaluations?.length || 0})</option>
                  <option value="Completed">Completed Submissions</option>
                  <option value="Revealed">Revealed Identities Only</option>
                </select>
              </div>

              <div className="reg-eval-control-group">
                <ArrowUpDown size={14} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort evaluation records"
                >
                  <option value="date_desc">Newest First</option>
                  <option value="date_asc">Oldest First</option>
                  <option value="rating_desc">Highest Rating</option>
                  <option value="rating_asc">Lowest Rating</option>
                  <option value="record_asc">Record Number (A–Z)</option>
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

          {paginatedEvaluations.length === 0 ? (
            <div className="reg-eval-empty">
              <FileCheck2 size={30} />
              <h3>No Evaluation Records Found</h3>
              <p>No submitted evaluation records match your current search and filter criteria.</p>
            </div>
          ) : (
            <>
              <div className="reg-eval-table-wrap">
                <table className="reg-eval-table">
                  <thead>
                    <tr>
                      <th>Record No.</th>
                      <th>Professor &amp; Subject</th>
                      <th>Submission Status</th>
                      <th>Rating</th>
                      <th>Submission Date</th>
                      <th>Student Identity (Default Masked)</th>
                      <th className="text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvaluations.map((rec) => {
                      const revealed = revealedMap[rec.id]
                      return (
                        <tr key={rec.id}>
                          <td>
                            <span className="reg-eval-record-num">{rec.recordNumber}</span>
                          </td>
                          <td>
                            <div className="reg-eval-prof-subj">
                              <strong>{rec.professorName}</strong>
                              <span>
                                {rec.subjectCode} — {rec.subjectTitle}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="reg-eval-sub-status is-completed">
                              <CheckCircle2 size={13} />
                              <span>{rec.submissionStatus || 'Completed'}</span>
                            </span>
                          </td>
                          <td>
                            <div className="reg-eval-rating-cell">
                              <strong>{rec.averageRating.toFixed(2)}</strong>
                              <span>/ 5.00 ({rec.ratingLabel})</span>
                            </div>
                          </td>
                          <td>
                            {rec.submittedAt ? new Date(rec.submittedAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            {revealed?.isRevealed ? (
                              <div className="reg-eval-identity-revealed">
                                <strong>{revealed.studentName}</strong>
                                <span>
                                  {revealed.studentNumber} • {revealed.course} Yr {revealed.yearLevel}
                                </span>
                              </div>
                            ) : (
                              <div className="reg-eval-identity-masked">
                                <Lock size={13} />
                                <span>Anonymous Student (Protected)</span>
                                {rec.revealCount > 0 && (
                                  <small className="reg-eval-audit-pill">
                                    Audited {rec.revealCount}x
                                  </small>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            <div className="reg-eval-row-actions">
                              <button
                                type="button"
                                className="reg-eval-btn-xs is-secondary"
                                onClick={() => setDetailRecord(rec)}
                              >
                                <span>View Details</span>
                              </button>
                              {!revealed?.isRevealed && (
                                <button
                                  type="button"
                                  className="reg-eval-btn-xs is-warning"
                                  onClick={() => {
                                    setRevealTarget(rec)
                                    setRevealReason('')
                                    setRevealConfirmedCheck(false)
                                    setRevealError('')
                                  }}
                                >
                                  <Eye size={13} />
                                  <span>Reveal Identity</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="reg-eval-pagination">
                <span className="reg-eval-page-info">
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, processedEvaluations.length)} of{' '}
                  {processedEvaluations.length} evaluation record(s)
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
      ) : activeTab === 'periods' ? (
        <section className="reg-eval-panel" aria-label="Configured evaluation periods">
          <div className="reg-eval-table-wrap">
            <table className="reg-eval-table">
              <thead>
                <tr>
                  <th>Period &amp; Academic Term</th>
                  <th>Schedule Window</th>
                  <th>Applicable Scope</th>
                  <th>Status</th>
                  <th>Completion Progress</th>
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
                        <span>{p.applicableSubjects || 'All Enrolled Subjects'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`reg-eval-status-badge status-${p.status}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="reg-eval-progress-cell">
                        <div className="reg-eval-progress-bar">
                          <div
                            className="reg-eval-progress-fill"
                            style={{ width: `${p.completionRate || 0}%` }}
                          />
                        </div>
                        <span>
                          {p.completedEvaluations || 0} / {p.totalRequiredEvaluations || 0} (
                          {p.completionRate || 0}%)
                        </span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="reg-eval-row-actions">
                        {p.status !== 'open' && (
                          <button
                            type="button"
                            className="reg-eval-btn-xs is-primary"
                            onClick={() =>
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
                            }
                          >
                            {p.status === 'closed' ? <RotateCcw size={13} /> : <Play size={13} />}
                            <span>{p.status === 'closed' ? 'Reopen' : 'Start'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="reg-eval-btn-xs is-secondary"
                          onClick={() => {
                            setExtendTarget(p)
                            setExtendDate(p.deadlineDate)
                            setExtendTime(p.closingTime || '23:59')
                          }}
                        >
                          <Clock size={13} />
                          <span>Extend</span>
                        </button>
                        {p.status !== 'closed' && (
                          <button
                            type="button"
                            className="reg-eval-btn-xs is-danger"
                            onClick={() =>
                              setConfirmPeriodAction({
                                period: p,
                                action: 'close',
                                title: 'Close Evaluation Period',
                                description: `Confirm closing submissions for "${p.title}".`
                              })
                            }
                          >
                            <Square size={13} />
                            <span>Close</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'incomplete' ? (
        <section className="reg-eval-panel" aria-label="Students with incomplete evaluations">
          {!overview?.incompleteEvaluations?.length ? (
            <div className="reg-eval-empty">
              <CheckCircle2 size={30} />
              <h3>All Enrolled Students Have Completed Evaluations</h3>
              <p>There are no students with incomplete professor evaluations for this term.</p>
            </div>
          ) : (
            <div className="reg-eval-table-wrap">
              <table className="reg-eval-table">
                <thead>
                  <tr>
                    <th>Student Number</th>
                    <th>Student Name</th>
                    <th>Program &amp; Year</th>
                    <th>Progress</th>
                    <th>Pending Subject Evaluations</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.incompleteEvaluations.map((stu) => (
                    <tr key={`${stu.studentId}-${stu.semester}-${stu.schoolYear}`}>
                      <td>
                        <strong>{stu.studentNumber}</strong>
                      </td>
                      <td>{stu.studentName}</td>
                      <td>
                        {stu.course} {stu.yearLevel ? `• Year ${stu.yearLevel}` : ''}
                      </td>
                      <td>
                        <span className="reg-eval-sub-status is-pending">
                          {stu.completedCount} / {stu.requiredCount} Completed
                        </span>
                      </td>
                      <td>
                        <div className="reg-eval-pending-chips">
                          {stu.pendingSubjects.map((sub) => (
                            <span key={sub.subjectCode} className="reg-eval-pending-chip">
                              <strong>{sub.subjectCode}</strong> ({sub.professorName})
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="reg-eval-panel" aria-label="Identity reveal audit log">
          {!overview?.revealLogs?.length ? (
            <div className="reg-eval-empty">
              <ShieldCheck size={30} />
              <h3>No Identity Reveals Recorded</h3>
              <p>All student evaluation identities remain masked.</p>
            </div>
          ) : (
            <div className="reg-eval-table-wrap">
              <table className="reg-eval-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Authorized Registrar</th>
                    <th>Evaluation Subject &amp; Professor</th>
                    <th>Revealed Student</th>
                    <th>Documented Reason</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.revealLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.revealedAt).toLocaleString()}</td>
                      <td>
                        <strong>{log.registrarDisplayName}</strong>
                        <div className="reg-eval-subtext">
                          @{log.registrarUsername} ({log.registrarRole})
                        </div>
                      </td>
                      <td>
                        <strong>{log.subjectCode}</strong> — {log.subjectTitle}
                        <div className="reg-eval-subtext">Prof. {log.professorName}</div>
                      </td>
                      <td>
                        <strong>{log.revealedStudentName}</strong>
                        <div className="reg-eval-subtext">{log.revealedStudentNumber}</div>
                      </td>
                      <td>{log.reason}</td>
                      <td>{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                    placeholder="e.g. Approved extension for late-enrolling blocks"
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

      {/* View Evaluation Details Modal */}
      {detailRecord && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal reg-eval-modal-lg">
            <div className="reg-eval-modal-head">
              <div>
                <span className="reg-eval-record-num">{detailRecord.recordNumber}</span>
                <h3>
                  {detailRecord.subjectCode} — {detailRecord.subjectTitle}
                </h3>
                <p className="reg-eval-subtext">
                  Professor: {detailRecord.professorName} • {detailRecord.semester} Semester SY{' '}
                  {detailRecord.schoolYear}
                </p>
              </div>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => setDetailRecord(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="reg-eval-modal-body">
              <div className="reg-eval-detail-ratings">
                {detailRecord.ratings.map((r) => (
                  <div key={r.questionNumber} className="reg-eval-detail-row">
                    <span>
                      <strong>Q{r.questionNumber}.</strong> {r.questionText}
                    </span>
                    <span className="reg-eval-detail-score">
                      <span aria-hidden="true">{r.emoji}</span>
                      <strong>{r.score}</strong> — {r.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="reg-eval-detail-comment">
                <strong>Student Comment:</strong>
                <p>{detailRecord.comment || 'No additional comment provided.'}</p>
              </div>
            </div>
            <div className="reg-eval-modal-foot">
              <button
                type="button"
                className="reg-eval-btn reg-eval-btn-primary"
                onClick={() => setDetailRecord(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Identity Reveal Confirmation Modal */}
      {revealTarget && (
        <div className="reg-eval-modal-backdrop" role="dialog" aria-modal="true">
          <div className="reg-eval-modal">
            <div className="reg-eval-modal-head">
              <div className="reg-eval-modal-title-icon">
                <ShieldAlert size={20} />
                <h3>Authorized Student Identity Reveal</h3>
              </div>
              <button
                type="button"
                className="reg-eval-icon-close"
                onClick={() => setRevealTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRevealSubmit}>
              <div className="reg-eval-modal-body">
                <div className="reg-eval-audit-warning">
                  <strong>Permanent Audit Log Notice:</strong> Revealing the student identity for record{' '}
                  <strong>{revealTarget.recordNumber || revealTarget.id.slice(-6).toUpperCase()}</strong> (
                  {revealTarget.subjectCode} — {revealTarget.professorName}) will permanently log your Registrar account, timestamp, IP address, and administrative justification.
                </div>

                {revealError && (
                  <div className="reg-eval-alert is-error" role="alert">
                    <AlertCircle size={16} />
                    <span>{revealError}</span>
                  </div>
                )}

                <label className="reg-eval-field">
                  <span>Administrative Reason for Identity Reveal (Required)</span>
                  <textarea
                    rows={3}
                    placeholder="Document the official academic or disciplinary case requiring identity verification..."
                    value={revealReason}
                    onChange={(e) => setRevealReason(e.target.value)}
                    required
                  />
                </label>

                <label className="reg-eval-checkbox-row">
                  <input
                    type="checkbox"
                    checked={revealConfirmedCheck}
                    onChange={(e) => setRevealConfirmedCheck(e.target.checked)}
                  />
                  <span>
                    I confirm that I am authorized by the Office of the Registrar to unmask this evaluation record and understand this action is audited.
                  </span>
                </label>
              </div>
              <div className="reg-eval-modal-foot">
                <button
                  type="button"
                  className="reg-eval-btn reg-eval-btn-secondary"
                  onClick={() => setRevealTarget(null)}
                  disabled={revealing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="reg-eval-btn reg-eval-btn-danger"
                  disabled={revealing}
                >
                  <Eye size={15} />
                  <span>{revealing ? 'Verifying & Logging...' : 'Confirm & Reveal Identity'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

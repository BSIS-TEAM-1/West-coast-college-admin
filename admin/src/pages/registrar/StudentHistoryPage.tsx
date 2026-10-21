import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Calendar, GraduationCap, History, Lock, BookOpen, FileText, AlertCircle, Plus, X, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react'
import StudentService from '../../lib/studentApi'
import type {
  AcademicProgressData,
  CurriculumSuggestionsData,
  SuggestedSubject,
  StudentData,
  SubjectValidationData
} from '../../lib/studentApi'
import { getStoredToken } from '../../lib/authApi'
import {
  courseShortLabel,
  extractResponseData,
  formatBlockDisplay,
  formatYearLevel,
  studentDisplayName,
  studentNumberDisplay
} from '../../lib/blockAssignmentShared'
import './StudentHistoryPage.css'

type SubjectEntry = {
  _id?: string
  subjectId?: string
  code: string
  title: string
  units?: number
  status?: string
  grade?: number | null
  gradeMark?: string | null
  dateEnrolled?: string
  droppedAt?: string | null
  droppedBy?: string | null
  dropReason?: string | null
  overrideReason?: string | null
  retakeOf?: { enrollmentId?: string; schoolYear?: string; semester?: string; status?: string; grade?: number | null } | null
}

type EnrollmentRecord = {
  _id: string
  schoolYear: string
  semester: string
  yearLevel?: number
  status: string
  isCurrent?: boolean
  lockedAt?: string | null
  lockedBy?: string | null
  rolloverBatchId?: string | null
  previousEnrollmentId?: string | null
  remarks?: string
  subjects: SubjectEntry[]
  assessment?: {
    tuitionFee?: number
    miscFee?: number
    otherFee?: number
    totalAmount?: number
    balance?: number
    paymentStatus?: string
  }
  createdAt?: string
  updatedAt?: string
}

type StudentHistoryPageProps = {
  studentId: string
  onBack: () => void
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

function formatDate(value?: string) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value?: string) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(value?: number) {
  if (value == null || Number.isNaN(value)) return '₱0.00'
  return `₱${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TERMINAL_STATUSES = ['Completed', 'Retained', 'Graduated', 'Dropped']

/** Subject-level states that an official drop may still be applied to. */
const DROPPABLE_STATUSES = ['Enrolled', 'Incomplete']
/** Subject-level states that qualify for a retake in a later term. */
const RETAKEABLE_STATUSES = ['Dropped', 'Removed', 'Failed']

function isLocked(record: EnrollmentRecord) {
  return Boolean(record.lockedAt) || TERMINAL_STATUSES.includes(record.status)
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'enrolled') return 'success'
  if (normalized === 'completed') return 'info'
  if (normalized === 'graduated') return 'accent'
  if (normalized === 'retained') return 'warning'
  if (normalized === 'dropped') return 'danger'
  if (normalized === 'failed') return 'danger'
  if (normalized === 'in progress') return 'success'
  if (normalized === 'outstanding') return 'neutral'
  return 'neutral'
}

function isGraded(entry: SubjectEntry) {
  return typeof entry.grade === 'number' || entry.status === 'Completed' || entry.status === 'Failed'
}

function canRetake(entry: SubjectEntry) {
  const status = entry.status || ''
  if (RETAKEABLE_STATUSES.includes(status)) return true
  if (entry.gradeMark === 'FA') return true
  return typeof entry.grade === 'number' && entry.grade > 3.0
}

/** First school year strictly after the term this attempt belongs to. */
function nextSchoolYear(schoolYear: string) {
  const start = Number(String(schoolYear || '').split('-')[0])
  if (!Number.isFinite(start)) return ''
  return `${start + 1}-${start + 2}`
}

const STATUS_ORDER = ['completed', 'inProgress', 'failed', 'dropped', 'outstanding'] as const
const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  inProgress: 'In Progress',
  failed: 'Failed',
  dropped: 'Dropped',
  outstanding: 'Outstanding'
}

export default function StudentHistoryPage({ studentId, onBack }: StudentHistoryPageProps) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [history, setHistory] = useState<EnrollmentRecord[]>([])
  const [progress, setProgress] = useState<AcademicProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)

  // Add-subject flow
  const [addTarget, setAddTarget] = useState<EnrollmentRecord | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedSubject[]>([])
  const [suggestionSource, setSuggestionSource] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [validation, setValidation] = useState<SubjectValidationData | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  // Drop flow
  const [dropTarget, setDropTarget] = useState<{ record: EnrollmentRecord; entry: SubjectEntry } | null>(null)
  const [dropReason, setDropReason] = useState('')
  const [dropOverride, setDropOverride] = useState('')

  // Retake flow
  const [retakeTarget, setRetakeTarget] = useState<{ record: EnrollmentRecord; entry: SubjectEntry } | null>(null)
  const [retakeYear, setRetakeYear] = useState('')
  const [retakeSemester, setRetakeSemester] = useState('1st')
  const [retakeOverride, setRetakeOverride] = useState('')

  const modalRef = useRef<HTMLDivElement | null>(null)

  const loadAll = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const studentResponse = await StudentService.getStudentById(token, studentId)
      const detailStudent = extractResponseData<StudentData>(studentResponse)

      const historyResponse = await StudentService.getEnrollmentHistory(token, studentId)
      const historyRecords = extractResponseData<EnrollmentRecord[]>(historyResponse) || []

      let progressData: AcademicProgressData | null = null
      try {
        const progressResponse = await StudentService.getAcademicProgress(token, studentId)
        progressData = extractResponseData<AcademicProgressData>(progressResponse)
      } catch {
        // Evaluation is supplementary — history still renders without it.
        progressData = null
      }

      if (signal?.cancelled) return

      setStudent(detailStudent)
      setHistory(historyRecords)
      setProgress(progressData)
    } catch (loadError) {
      if (!signal?.cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load student history')
      }
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    const signal = { cancelled: false }
    setLoading(true)
    setError('')
    void loadAll(signal)
    return () => {
      signal.cancelled = true
    }
  }, [loadAll])

  const refresh = useCallback(async () => {
    const token = await getStoredToken()
    const historyResponse = await StudentService.getEnrollmentHistory(token, studentId)
    setHistory(extractResponseData<EnrollmentRecord[]>(historyResponse) || [])
    try {
      const progressResponse = await StudentService.getAcademicProgress(token, studentId)
      setProgress(extractResponseData<AcademicProgressData>(progressResponse))
    } catch {
      // Leave the previous evaluation in place if it cannot be recomputed.
    }
  }, [studentId])

  // Escape closes whichever dialog is open.
  useEffect(() => {
    const open = addTarget || dropTarget || retakeTarget
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (modalBusy) return
      if (retakeTarget) setRetakeTarget(null)
      else if (dropTarget) setDropTarget(null)
      else closeAddModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const sortedHistory = [...history].sort((a, b) => {
    const aYear = Number(String(a.schoolYear || '').split('-')[0]) || 0
    const bYear = Number(String(b.schoolYear || '').split('-')[0]) || 0
    if (bYear !== aYear) return bYear - aYear
    const semOrder: Record<string, number> = { '1st': 1, '2nd': 2, Summer: 3 }
    return (semOrder[b.semester] || 0) - (semOrder[a.semester] || 0)
  })

  const lockedCount = sortedHistory.filter(isLocked).length
  const activeEnrollment = sortedHistory.find((r) => r.isCurrent) || null

  // ── Add subjects ──────────────────────────────────────────────────────────
  function closeAddModal() {
    setAddTarget(null)
    setSuggestions([])
    setSelectedIds([])
    setValidation(null)
    setOverrideReason('')
    setModalError('')
    setSuggestionSource('')
  }

  async function openAddModal(record: EnrollmentRecord) {
    if (!student) return
    setAddTarget(record)
    setModalError('')
    setSuggestions([])
    setSelectedIds([])
    setValidation(null)
    setOverrideReason('')
    setModalBusy(true)
    try {
      const token = await getStoredToken()
      const response = await StudentService.getCurriculumSuggestions(token, {
        programCode: student.course,
        yearLevel: record.yearLevel || student.yearLevel,
        semester: record.semester,
        curriculumVersion: student.curriculumVersion || ''
      })
      const data = extractResponseData<CurriculumSuggestionsData>(response)
      const enrolled = new Set((record.subjects || []).map((s) => String(s.subjectId || '')))
      setSuggestions((data?.subjects || []).filter((s) => !enrolled.has(String(s.subjectId))))
      setSuggestionSource(
        data?.curriculum?.name
          ? `${data.curriculum.name}${data.curriculum.version ? ` · v${data.curriculum.version}` : ''}`
          : data?.reason || 'No curriculum resolved'
      )
      setSelectedIds([])
    } catch (suggestionError) {
      setModalError(suggestionError instanceof Error ? suggestionError.message : 'Could not load curriculum suggestions')
    } finally {
      setModalBusy(false)
    }
  }

  function toggleSubject(subjectId: string) {
    setValidation(null)
    setSelectedIds((current) =>
      current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId]
    )
  }

  async function validateSelection() {
    if (!addTarget || selectedIds.length === 0) return
    setModalBusy(true)
    setModalError('')
    try {
      const token = await getStoredToken()
      const response = await StudentService.validateEnrollmentSubjects(token, addTarget._id, selectedIds)
      setValidation(extractResponseData<SubjectValidationData>(response))
    } catch (validationError) {
      setModalError(validationError instanceof Error ? validationError.message : 'Validation failed')
    } finally {
      setModalBusy(false)
    }
  }

  async function commitSelection() {
    if (!addTarget || !validation) return
    setModalBusy(true)
    setModalError('')
    try {
      const token = await getStoredToken()
      await StudentService.addEnrollmentSubjects(token, addTarget._id, validation.okIds, overrideReason.trim())
      await refresh()
      const addedCount = validation.okIds.length
      const rejectedCount = validation.failedIds.length
      setNotice({
        tone: 'ok',
        text: `${addedCount} subject(s) added to ${addTarget.semester} ${addTarget.schoolYear}`
          + (rejectedCount > 0 ? ` · ${rejectedCount} rejected` : '')
      })
      closeAddModal()
    } catch (addError) {
      setModalError(addError instanceof Error ? addError.message : 'Could not add subjects')
    } finally {
      setModalBusy(false)
    }
  }

  // ── Drop ──────────────────────────────────────────────────────────────────
  async function commitDrop() {
    if (!dropTarget) return
    setModalBusy(true)
    setModalError('')
    try {
      const token = await getStoredToken()
      await StudentService.dropEnrollmentSubject(
        token,
        dropTarget.record._id,
        String(dropTarget.entry.subjectId || ''),
        dropReason.trim(),
        dropOverride.trim()
      )
      await refresh()
      setNotice({
        tone: 'ok',
        text: `${dropTarget.entry.code} marked Dropped — the original record and its grade are preserved`
      })
      setDropTarget(null)
      setDropReason('')
      setDropOverride('')
    } catch (dropError) {
      setModalError(dropError instanceof Error ? dropError.message : 'Could not drop the subject')
    } finally {
      setModalBusy(false)
    }
  }

  // ── Retake ────────────────────────────────────────────────────────────────
  async function commitRetake() {
    if (!retakeTarget || !student) return
    setModalBusy(true)
    setModalError('')
    try {
      const token = await getStoredToken()
      await StudentService.retakeSubject(token, studentId, String(retakeTarget.entry.subjectId || ''), {
        schoolYear: retakeYear,
        semester: retakeSemester,
        overrideReason: retakeOverride.trim()
      })
      await refresh()
      setNotice({
        tone: 'ok',
        text: `Retake of ${retakeTarget.entry.code} recorded for ${retakeYear} ${retakeSemester} — year level and block unchanged`
      })
      setRetakeTarget(null)
      setRetakeOverride('')
    } catch (retakeError) {
      setModalError(retakeError instanceof Error ? retakeError.message : 'Could not record the retake')
    } finally {
      setModalBusy(false)
    }
  }

  const summary = progress?.summary || null
  const requirementTotal = summary ? Math.max(summary.totalRequirements, 1) : 1
  const blockingIds = new Set((progress?.progression.blockedBy || []).map((b) => b.code))

  return (
    <div className="student-history-page">
      <header className="student-history-page__header">
        <div className="student-history-page__header-left">
          <button type="button" className="student-history-page__back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to Students
          </button>
          <span className="student-history-page__eyebrow">Academic Timeline</span>
          <h2>{student ? studentDisplayName(student) : 'Loading…'}</h2>
          {student ? (
            <div className="student-history-page__summary">
              <span><strong>{studentNumberDisplay(student)}</strong></span>
              <span>Course: <strong>{courseShortLabel(student.course)}</strong></span>
              <span>Year: <strong>{formatYearLevel(student.yearLevel)}</strong></span>
              <span>Block: <strong>{formatBlockDisplay(student.section)}</strong></span>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="student-history-page__loading">
          <History size={32} className="student-history-page__loading-icon" />
          <p>Loading academic history…</p>
        </div>
      ) : error ? (
        <div className="student-history-page__error">
          <AlertCircle size={24} />
          <p>{error}</p>
        </div>
      ) : (
        <>
          {notice ? (
            <div className={`student-history-page__notice student-history-page__notice--${notice.tone}`} role="status">
              {notice.tone === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className="student-history-page__stats">
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--total">
                <BookOpen size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{sortedHistory.length}</span>
                <span className="student-history-page__stat-label">Total Enrollments</span>
              </div>
            </div>
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--locked">
                <Lock size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{lockedCount}</span>
                <span className="student-history-page__stat-label">Locked Records</span>
              </div>
            </div>
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--active">
                <GraduationCap size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{activeEnrollment ? '1' : '0'}</span>
                <span className="student-history-page__stat-label">Active Enrollment</span>
              </div>
            </div>
          </div>

          <section className="student-history-page__section">
            <div className="student-history-page__section-header">
              <h3>
                <GraduationCap size={18} />
                Academic Evaluation
              </h3>
              <p>
                Measured against the student&apos;s curriculum — never against the block label.
                {progress?.curriculum ? ` ${progress.curriculum.name} · v${progress.curriculum.version || '—'} · ${progress.curriculum.status}.` : ''}
              </p>
            </div>

            {!progress ? (
              <div className="student-history-page__empty student-history-page__empty--inline">
                <p>Evaluation unavailable — no curriculum could be resolved for this program.</p>
              </div>
            ) : (
              <div className="student-history-page__evaluation">
                <div className="student-history-page__eval-bar" aria-hidden="true">
                  {STATUS_ORDER.map((key) => {
                    const value = summary ? Number((summary as unknown as Record<string, number>)[key]) || 0 : 0
                    if (value === 0) return null
                    return (
                      <span
                        key={key}
                        className={`student-history-page__eval-seg student-history-page__eval-seg--${key}`}
                        style={{ width: `${(value / requirementTotal) * 100}%` }}
                        title={`${STATUS_LABEL[key]}: ${value}`}
                      />
                    )
                  })}
                </div>

                <div className="student-history-page__eval-legend">
                  {STATUS_ORDER.map((key) => {
                    const value = summary ? Number((summary as unknown as Record<string, number>)[key]) || 0 : 0
                    return (
                      <span key={key} className="student-history-page__eval-count">
                        <i className={`student-history-page__eval-dot student-history-page__eval-dot--${key}`} />
                        {STATUS_LABEL[key]} <strong>{value}</strong>
                      </span>
                    )
                  })}
                  {summary ? (
                    <span className="student-history-page__eval-total">
                      {summary.completedRequiredUnits ?? 0} of {summary.totalRequiredUnits ?? 0} required units ·{' '}
                      {Math.round(summary.completionPercentage || 0)}% complete · {summary.outsideCurriculum || 0} outside curriculum
                    </span>
                  ) : null}
                </div>

                <dl className="student-history-page__eval-facts">
                  <div>
                    <dt>Progression</dt>
                    <dd>
                      {formatYearLevel(progress.progression.currentYearLevel)}
                      {progress.progression.canAdvance ? (
                        <> → <strong>{formatYearLevel(progress.progression.recommendedYearLevel)}</strong> (recommended)</>
                      ) : (
                        <> → held at <strong>{formatYearLevel(progress.progression.recommendedYearLevel)}</strong></>
                      )}
                      <span className="student-history-page__eval-note">{progress.progression.reason}</span>
                      {!progress.progression.canAdvance && blockingIds.size > 0 ? (
                        <span className="student-history-page__eval-blockers">
                          {[...blockingIds].join(', ')}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Graduation</dt>
                    <dd className={progress.graduationEligibility.eligible ? 'is-ok' : 'is-blocked'}>
                      {progress.graduationEligibility.eligible ? 'Eligible' : 'Not eligible'}
                      <span className="student-history-page__eval-note">{progress.graduationEligibility.reason}</span>
                    </dd>
                  </div>
                </dl>

                {progress.requirements.length ? (
                  <div className="student-history-page__req-table-wrap">
                    <table className="student-history-page__req-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Year</th>
                          <th>Sem</th>
                          <th>Req</th>
                          <th>Status</th>
                          <th>Attempts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progress.requirements.map((req) => (
                          <tr key={String(req.subjectId)}>
                            <td>
                              <strong>{req.code}</strong>
                              <small>{req.title}</small>
                            </td>
                            <td>{req.yearLevel ?? '—'}</td>
                            <td>{req.semester || '—'}</td>
                            <td>{req.isRequired ? 'Required' : 'Elective'}</td>
                            <td>
                              <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(req.status)}`}>
                                {req.status}
                              </span>
                            </td>
                            <td>
                              {req.attempts.length
                                ? req.attempts.map((attempt, index) => (
                                    <span key={index} className="student-history-page__attempt">
                                      {attempt.schoolYear} {attempt.semester}: {attempt.grade ?? attempt.gradeMark ?? attempt.status}
                                    </span>
                                  ))
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="student-history-page__empty student-history-page__empty--inline">
                    <p>No curriculum requirements have been placed for this program yet.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="student-history-page__section">
            <div className="student-history-page__section-header">
              <h3>
                <FileText size={18} />
                Enrollment History
              </h3>
              <p>Chronological record of all enrollments. Locked records are immutable historical snapshots.</p>
            </div>

            {sortedHistory.length ? (
              <div className="student-history-page__timeline">
                {sortedHistory.map((record, index) => {
                  const locked = isLocked(record)
                  const isLast = index === sortedHistory.length - 1

                  return (
                    <div key={record._id} className={`student-history-page__timeline-item ${locked ? 'student-history-page__timeline-item--locked' : ''}`}>
                      <div className="student-history-page__timeline-marker">
                        <div className={`student-history-page__timeline-dot ${locked ? 'student-history-page__timeline-dot--locked' : ''}`} />
                        {!isLast ? <div className="student-history-page__timeline-line" /> : null}
                      </div>
                      <div className="student-history-page__timeline-content">
                        <div className="student-history-page__timeline-card">
                          <div className="student-history-page__timeline-card-header">
                            <div>
                              <strong>{record.semester} · {record.schoolYear}</strong>
                              {record.yearLevel ? <span className="student-history-page__year-badge">{formatYearLevel(record.yearLevel)}</span> : null}
                            </div>
                            <div className="student-history-page__timeline-badges">
                              <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(record.status)}`}>
                                {record.status}
                              </span>
                              {record.isCurrent ? (
                                <span className="student-history-page__status-badge student-history-page__status-badge--current">
                                  Active
                                </span>
                              ) : null}
                              {locked ? (
                                <span className="student-history-page__status-badge student-history-page__status-badge--locked">
                                  <Lock size={12} />
                                  Locked
                                </span>
                              ) : null}
                              {!locked ? (
                                <button
                                  type="button"
                                  className="student-history-page__action-btn"
                                  onClick={() => void openAddModal(record)}
                                  disabled={modalBusy}
                                >
                                  <Plus size={13} />
                                  Add subjects
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="student-history-page__timeline-details">
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Subjects</span>
                              <span className="student-history-page__detail-value">{record.subjects?.length || 0}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Payment Status</span>
                              <span className="student-history-page__detail-value">{record.assessment?.paymentStatus || 'N/A'}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Total Assessment</span>
                              <span className="student-history-page__detail-value">{formatCurrency(record.assessment?.totalAmount)}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Balance</span>
                              <span className="student-history-page__detail-value">{formatCurrency(record.assessment?.balance)}</span>
                            </div>
                            {locked && record.lockedAt ? (
                              <div className="student-history-page__detail-row">
                                <span className="student-history-page__detail-label">Locked On</span>
                                <span className="student-history-page__detail-value">{formatDate(record.lockedAt)}</span>
                              </div>
                            ) : null}
                            {record.rolloverBatchId ? (
                              <div className="student-history-page__detail-row">
                                <span className="student-history-page__detail-label">Rollover Batch</span>
                                <span className="student-history-page__detail-value student-history-page__detail-value--mono">{record.rolloverBatchId}</span>
                              </div>
                            ) : null}
                          </div>

                          {record.subjects?.length ? (
                            <div className="student-history-page__subjects">
                              <span className="student-history-page__subjects-label">Enrolled Subjects</span>
                              <div className="student-history-page__req-table-wrap">
                                <table className="student-history-page__req-table student-history-page__req-table--subjects">
                                  <thead>
                                    <tr>
                                      <th>Code</th>
                                      <th>Subject</th>
                                      <th>Units</th>
                                      <th>Status</th>
                                      <th>Grade</th>
                                      <th>Notes</th>
                                      <th><span className="sr-only">Actions</span></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {record.subjects.map((entry, subIndex) => {
                                      const gradeText = entry.grade != null
                                        ? String(entry.grade)
                                        : entry.gradeMark || '—'
                                      const droppable = !locked && DROPPABLE_STATUSES.includes(entry.status || '')
                                      const retakeable = canRetake(entry)
                                      return (
                                        <tr key={`${entry.subjectId || entry.code}-${subIndex}`}>
                                          <td><strong>{entry.code}</strong></td>
                                          <td>{entry.title}</td>
                                          <td>{entry.units ?? '—'}</td>
                                          <td>
                                            <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(entry.status || '')}`}>
                                              {entry.status || '—'}
                                            </span>
                                          </td>
                                          <td>{gradeText}</td>
                                          <td className="student-history-page__note-cell">
                                            {entry.retakeOf ? <span>Retake of {entry.retakeOf.schoolYear} {entry.retakeOf.semester}</span> : null}
                                            {entry.dropReason ? <span>Drop: {entry.dropReason}</span> : null}
                                            {entry.overrideReason ? <span>Override: {entry.overrideReason}</span> : null}
                                            {!entry.retakeOf && !entry.dropReason && !entry.overrideReason ? '—' : null}
                                          </td>
                                          <td>
                                            <div className="student-history-page__row-actions">
                                              {droppable ? (
                                                <button
                                                  type="button"
                                                  className="student-history-page__action-btn student-history-page__action-btn--danger"
                                                  onClick={() => {
                                                    setDropTarget({ record, entry })
                                                    setDropReason('')
                                                    setDropOverride('')
                                                    setModalError('')
                                                  }}
                                                  disabled={modalBusy}
                                                >
                                                  Drop
                                                </button>
                                              ) : null}
                                              {retakeable ? (
                                                <button
                                                  type="button"
                                                  className="student-history-page__action-btn"
                                                  onClick={() => {
                                                    setRetakeTarget({ record, entry })
                                                    setRetakeYear(nextSchoolYear(record.schoolYear))
                                                    setRetakeSemester('1st')
                                                    setRetakeOverride('')
                                                    setModalError('')
                                                  }}
                                                  disabled={modalBusy}
                                                >
                                                  <RotateCcw size={13} />
                                                  Retake
                                                </button>
                                              ) : null}
                                              {!droppable && !retakeable ? <span className="student-history-page__muted">—</span> : null}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}

                          <div className="student-history-page__timeline-footer">
                            <span><Calendar size={12} /> Created {formatDate(record.createdAt)}</span>
                            {record.updatedAt && record.updatedAt !== record.createdAt ? (
                              <span>Updated {formatDateTime(record.updatedAt)}</span>
                            ) : null}
                            {locked ? <span><Lock size={12} /> Immutable — changes require a new term record</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="student-history-page__empty">
                <History size={32} />
                <p>No enrollment history records found.</p>
              </div>
            )}
          </section>

          <section className="student-history-page__section">
            <div className="student-history-page__section-header">
              <h3>
                <History size={18} />
                Lifecycle History
              </h3>
              <p>Student record creation and enrollment status changes over time.</p>
            </div>

            <div className="student-history-page__timeline">
              {student ? (
                <div className="student-history-page__timeline-item">
                  <div className="student-history-page__timeline-marker">
                    <div className="student-history-page__timeline-dot student-history-page__timeline-dot--created" />
                    <div className="student-history-page__timeline-line" />
                  </div>
                  <div className="student-history-page__timeline-content">
                    <div className="student-history-page__timeline-card student-history-page__timeline-card--lifecycle">
                      <div className="student-history-page__timeline-card-header">
                        <div>
                          <strong>Student record created</strong>
                        </div>
                        <div className="student-history-page__timeline-badges">
                          <span className="student-history-page__status-badge student-history-page__status-badge--success">
                            Enrolled
                          </span>
                        </div>
                      </div>
                      <div className="student-history-page__timeline-footer">
                        <span><Calendar size={12} /> {formatDateTime(student.createdAt)}</span>
                        <span>{studentNumberDisplay(student)} · {courseShortLabel(student.course)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {sortedHistory.map((record) => (
                <div key={`lifecycle-${record._id}`} className="student-history-page__timeline-item">
                  <div className="student-history-page__timeline-marker">
                    <div className={`student-history-page__timeline-dot ${isLocked(record) ? 'student-history-page__timeline-dot--locked' : ''}`} />
                  </div>
                  <div className="student-history-page__timeline-content">
                    <div className="student-history-page__timeline-card student-history-page__timeline-card--lifecycle">
                      <div className="student-history-page__timeline-card-header">
                        <div>
                          <strong>{record.status}</strong>
                        </div>
                        <div className="student-history-page__timeline-badges">
                          <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(record.status)}`}>
                            {record.status}
                          </span>
                        </div>
                      </div>
                      <div className="student-history-page__timeline-footer">
                        <span><Calendar size={12} /> {record.semester} · {record.schoolYear} · {record.subjects?.length || 0} subjects</span>
                        <span>{formatDateTime(record.updatedAt || record.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Add subjects dialog ─────────────────────────────────────────── */}
      {addTarget ? (
        <div className="student-history-page__scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !modalBusy) closeAddModal() }}>
          <div
            className="student-history-page__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-subjects-title"
            ref={modalRef}
          >
            <div className="student-history-page__dialog-head">
              <div>
                <h4 id="add-subjects-title">Add subjects</h4>
                <p>
                  {addTarget.semester} {addTarget.schoolYear} · Year {addTarget.yearLevel || student?.yearLevel || '—'}
                  {suggestionSource ? ` · ${suggestionSource}` : ''}
                </p>
              </div>
              <button type="button" onClick={closeAddModal} aria-label="Close" disabled={modalBusy}>
                <X size={16} />
              </button>
            </div>

            <div className="student-history-page__dialog-body">
              {modalError ? (
                <div className="student-history-page__notice student-history-page__notice--error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{modalError}</span>
                </div>
              ) : null}

              {modalBusy && suggestions.length === 0 ? (
                <div className="student-history-page__dialog-loading">Loading curriculum suggestions…</div>
              ) : suggestions.length === 0 ? (
                <div className="student-history-page__dialog-loading">
                  Every curriculum subject for this term is already on the record. Subjects outside the curriculum can still be
                  added through the block&apos;s offerings.
                </div>
              ) : (
                <ul className="student-history-page__pick-list">
                  {suggestions.map((subject) => {
                    const selected = selectedIds.includes(String(subject.subjectId))
                    const disabled = subject.available === false
                    const result = validation?.results.find((r) => r.subjectId === subject.subjectId) || null
                    return (
                      <li key={String(subject.subjectId)} className={selected ? 'is-selected' : ''}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleSubject(String(subject.subjectId))}
                          />
                          <span className="student-history-page__pick-main">
                            <strong>{subject.code}</strong>
                            <small>{subject.title}</small>
                          </span>
                          <span className="student-history-page__pick-meta">
                            {subject.units ?? '—'} u · Y{subject.yearLevel} {subject.semester}
                            {subject.isRequired ? ' · Required' : ''}
                            {disabled ? ' · Inactive' : ''}
                          </span>
                        </label>
                        {result ? (
                          <p className={`student-history-page__pick-result ${result.ok ? 'is-ok' : 'is-blocked'}`}>
                            {result.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                            <span>
                              {result.ok
                                ? result.offeredOutsideBlock
                                  ? 'Eligible — offered by another section of this term'
                                  : 'Eligible'
                                : result.message}
                              {result.requiresOverride && !result.ok ? ' — override reason required' : ''}
                            </span>
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}

              {validation && validation.failedIds.length > 0 ? (
                <div className="student-history-page__field">
                  <label htmlFor="add-override">Registrar override reason</label>
                  <textarea
                    id="add-override"
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why these subjects are being enrolled despite the rule above"
                  />
                </div>
              ) : null}
            </div>

            <div className="student-history-page__dialog-foot">
              <button type="button" className="student-history-page__ghost-btn" onClick={closeAddModal} disabled={modalBusy}>
                Cancel
              </button>
              {!validation ? (
                <button
                  type="button"
                  className="student-history-page__primary-btn"
                  onClick={() => void validateSelection()}
                  disabled={modalBusy || selectedIds.length === 0}
                >
                  {modalBusy ? 'Checking…' : `Validate ${selectedIds.length || ''} selected`}
                </button>
              ) : (
                <button
                  type="button"
                  className="student-history-page__primary-btn"
                  onClick={() => void commitSelection()}
                  disabled={modalBusy || validation.okIds.length === 0}
                >
                  {modalBusy ? 'Saving…' : `Add ${validation.okIds.length} subject(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Drop dialog ─────────────────────────────────────────────────── */}
      {dropTarget ? (
        <div className="student-history-page__scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !modalBusy) setDropTarget(null) }}>
          <div className="student-history-page__dialog" role="dialog" aria-modal="true" aria-labelledby="drop-subject-title">
            <div className="student-history-page__dialog-head">
              <div>
                <h4 id="drop-subject-title">Drop {dropTarget.entry.code}</h4>
                <p>{dropTarget.record.semester} {dropTarget.record.schoolYear} · {dropTarget.entry.title}</p>
              </div>
              <button type="button" onClick={() => setDropTarget(null)} aria-label="Close" disabled={modalBusy}>
                <X size={16} />
              </button>
            </div>
            <div className="student-history-page__dialog-body">
              {modalError ? (
                <div className="student-history-page__notice student-history-page__notice--error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{modalError}</span>
                </div>
              ) : null}
              <p className="student-history-page__dialog-note">
                The attempt stays on this record with an official <strong>Dropped</strong> status. Its grade is preserved and it is
                never deleted — a retake is recorded as a separate enrollment in a later term.
              </p>
              <div className="student-history-page__field">
                <label htmlFor="drop-reason">Reason</label>
                <textarea
                  id="drop-reason"
                  rows={2}
                  value={dropReason}
                  onChange={(e) => setDropReason(e.target.value)}
                  placeholder="e.g. workload conflict, medical withdrawal, program consultation"
                />
              </div>
              {isGraded(dropTarget.entry) ? (
                <div className="student-history-page__field">
                  <label htmlFor="drop-override">Override reason (required — this subject carries a grade)</label>
                  <textarea
                    id="drop-override"
                    rows={2}
                    value={dropOverride}
                    onChange={(e) => setDropOverride(e.target.value)}
                    placeholder="Registrar authorization to keep the graded record and mark it dropped"
                  />
                </div>
              ) : null}
            </div>
            <div className="student-history-page__dialog-foot">
              <button type="button" className="student-history-page__ghost-btn" onClick={() => setDropTarget(null)} disabled={modalBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="student-history-page__primary-btn student-history-page__primary-btn--danger"
                onClick={() => void commitDrop()}
                disabled={modalBusy || !dropReason.trim() || (isGraded(dropTarget.entry) && !dropOverride.trim())}
              >
                {modalBusy ? 'Saving…' : 'Mark as Dropped'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Retake dialog ───────────────────────────────────────────────── */}
      {retakeTarget ? (
        <div className="student-history-page__scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !modalBusy) setRetakeTarget(null) }}>
          <div className="student-history-page__dialog" role="dialog" aria-modal="true" aria-labelledby="retake-subject-title">
            <div className="student-history-page__dialog-head">
              <div>
                <h4 id="retake-subject-title">Retake {retakeTarget.entry.code}</h4>
                <p>
                  Original: {retakeTarget.record.semester} {retakeTarget.record.schoolYear} ·{' '}
                  {retakeTarget.entry.status}{retakeTarget.entry.grade != null ? ` · grade ${retakeTarget.entry.grade}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setRetakeTarget(null)} aria-label="Close" disabled={modalBusy}>
                <X size={16} />
              </button>
            </div>
            <div className="student-history-page__dialog-body">
              {modalError ? (
                <div className="student-history-page__notice student-history-page__notice--error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{modalError}</span>
                </div>
              ) : null}
              <p className="student-history-page__dialog-note">
                The original attempt is kept exactly as it is. This creates a <strong>new</strong> enrollment in the target term and
                links back to it — the student&apos;s year level and block assignment are not changed.
              </p>
              <div className="student-history-page__field-row">
                <div className="student-history-page__field">
                  <label htmlFor="retake-year">Target school year</label>
                  <input
                    id="retake-year"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}-\d{4}"
                    value={retakeYear}
                    onChange={(e) => setRetakeYear(e.target.value)}
                    placeholder="YYYY-YYYY"
                  />
                </div>
                <div className="student-history-page__field">
                  <label htmlFor="retake-semester">Semester</label>
                  <select id="retake-semester" value={retakeSemester} onChange={(e) => setRetakeSemester(e.target.value)}>
                    <option value="1st">1st</option>
                    <option value="2nd">2nd</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>
              <div className="student-history-page__field">
                <label htmlFor="retake-override">Override note (only if a rule needs to be waived)</label>
                <textarea
                  id="retake-override"
                  rows={2}
                  value={retakeOverride}
                  onChange={(e) => setRetakeOverride(e.target.value)}
                  placeholder="e.g. subject not offered in the student's block this term"
                />
              </div>
            </div>
            <div className="student-history-page__dialog-foot">
              <button type="button" className="student-history-page__ghost-btn" onClick={() => setRetakeTarget(null)} disabled={modalBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="student-history-page__primary-btn"
                onClick={() => void commitRetake()}
                disabled={modalBusy || !/^\d{4}-\d{4}$/.test(retakeYear)}
              >
                {modalBusy ? 'Saving…' : 'Record retake'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

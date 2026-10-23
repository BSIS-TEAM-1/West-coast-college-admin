import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Archive, ArrowRight, CalendarClock, Check, CheckCircle2,
  ChevronDown, ChevronRight, GraduationCap, History, RefreshCw, RotateCcw, Search,
  Users, AlertTriangle, Filter, X,
} from 'lucide-react'
import { getAcademicTerm, type AcademicSemester } from '../../lib/settingsApi'
import {
  executeRollover,
  getLatestRollover,
  listRolloverSnapshots,
  previewRolloverSummary,
  previewRolloverExceptions,
  revertRollover,
  type ArchiveSnapshotSummary,
  type RolloverAction,
  type RolloverBatchSummary,
  type RolloverGroupSummary,
  type RolloverRevertResult,
  type RolloverSummaryPreview,
  type RolloverEvaluation,
  type RolloverResult,
  type RolloverGroupDecision,
} from '../../lib/rolloverApi'
import { courseShortLabel, formatStudentNumber } from '../../lib/blockAssignmentShared'
import './SchoolYearRollover.css'

type WizardStep = 1 | 2 | 3 | 4
type CardFilter = 'all' | 'promote' | 'retain' | 'graduate' | 'needsReview'

const ACTION_LABELS: Record<RolloverAction, string> = {
  promote: 'Promote',
  retain: 'Retain',
  graduate: 'Graduate',
  skip: 'Skip',
}

const SEMESTERS: AcademicSemester[] = ['1st', '2nd', 'Summer']

function nextSchoolYear(schoolYear: string) {
  const start = Number(String(schoolYear || '').split('-')[0])
  if (!Number.isFinite(start)) return ''
  return `${start + 1}-${start + 2}`
}

function groupKey(g: { course: number; yearLevel: number; block: string }) {
  return `${g.course}_${g.yearLevel}_${g.block}`
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export default function SchoolYearRollover({ onBack }: { onBack?: () => void }) {
  const [step, setStep] = useState<WizardStep>(1)
  const [fromSchoolYear, setFromSchoolYear] = useState('')
  const [toSchoolYear, setToSchoolYear] = useState('')
  const [semester, setSemester] = useState<AcademicSemester>('1st')
  const [summaryPreview, setSummaryPreview] = useState<RolloverSummaryPreview | null>(null)
  const [approvedGroups, setApprovedGroups] = useState<Set<string>>(new Set())
  const [groupActions, setGroupActions] = useState<Record<string, RolloverAction>>({})
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, RolloverAction>>({})
  const [decisionOverrideGroups, setDecisionOverrideGroups] = useState<Record<string, string>>({})
  const [result, setResult] = useState<RolloverResult | null>(null)
  const [snapshots, setSnapshots] = useState<ArchiveSnapshotSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')

  // ---- Rollover revert ----
  const [latestBatch, setLatestBatch] = useState<RolloverBatchSummary | null>(null)
  const [latestBatchLoading, setLatestBatchLoading] = useState(false)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState('')
  const [revertSuccess, setRevertSuccess] = useState<RolloverRevertResult | null>(null)

  // ---- Step 2: card filter + group search ----
  const [cardFilter, setCardFilter] = useState<CardFilter>('all')
  const [groupSearchText, setGroupSearchText] = useState('')

  // ---- Step 2: expanded group exception review ----
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [exceptionStudents, setExceptionStudents] = useState<RolloverEvaluation[]>([])
  const [exceptionLoading, setExceptionLoading] = useState(false)
  const [exceptionPage, setExceptionPage] = useState(1)
  const [exceptionTotal, setExceptionTotal] = useState(0)
  const [exceptionTotalPages, setExceptionTotalPages] = useState(0)
  const [exceptionSearch, setExceptionSearch] = useState('')
  const exceptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Step 2: global exceptions drawer ----
  const [showGlobalExceptions, setShowGlobalExceptions] = useState(false)
  const [globalExceptionStudents, setGlobalExceptionStudents] = useState<RolloverEvaluation[]>([])
  const [globalExceptionLoading, setGlobalExceptionLoading] = useState(false)
  const [globalExceptionPage, setGlobalExceptionPage] = useState(1)
  const [globalExceptionTotal, setGlobalExceptionTotal] = useState(0)
  const [globalExceptionTotalPages, setGlobalExceptionTotalPages] = useState(0)
  const [globalExceptionSearch, setGlobalExceptionSearch] = useState('')
  const globalExceptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const term = await getAcademicTerm()
        setFromSchoolYear(term.schoolYear)
        setToSchoolYear(nextSchoolYear(term.schoolYear))
        setSemester(term.semester)
      } catch {
        // Leave fields empty; user can type them manually.
      }
    })()
  }, [])

  const loadLatestBatch = useCallback(async () => {
    setLatestBatchLoading(true)
    try {
      const batch = await getLatestRollover()
      setLatestBatch(batch)
    } catch {
      // Keep any optimistic batch already shown; never block the rollover workflow.
    } finally {
      setLatestBatchLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLatestBatch()
  }, [loadLatestBatch])

  useEffect(() => {
    if (!showRevertConfirm) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !reverting) setShowRevertConfirm(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showRevertConfirm, reverting])

  const loadSnapshots = async () => {
    try {
      const items = await listRolloverSnapshots()
      setSnapshots(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load archive snapshots')
    }
  }

  useEffect(() => {
    if (showHistory) void loadSnapshots()
  }, [showHistory])

  // ---- Step 1 -> Step 2: load summary ----
  const handlePreview = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await previewRolloverSummary({ fromSchoolYear, toSchoolYear, semester })
      setSummaryPreview(data)
      const autoApproved = new Set<string>()
      const defaultActions: Record<string, RolloverAction> = {}
      for (const g of data.groups) {
        const key = groupKey(g)
        if (g.status === 'auto_approved') {
          autoApproved.add(key)
        }
        if (g.graduating > 0 && g.eligible === 0 && g.retained === 0) {
          defaultActions[key] = 'graduate'
        } else if (g.eligible > 0) {
          defaultActions[key] = 'promote'
        } else {
          defaultActions[key] = 'retain'
        }
      }
      setApprovedGroups(autoApproved)
      setGroupActions(defaultActions)
      setDecisionOverrides({})
      setDecisionOverrideGroups({})
      setCardFilter('all')
      setGroupSearchText('')
      setStep(2)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Failed to evaluate rollover')
    } finally {
      setLoading(false)
    }
  }

  // ---- Lazy load exception students for a specific group ----
  const loadGroupExceptions = useCallback(
    async (group: RolloverGroupSummary, page: number, search: string) => {
      setExceptionLoading(true)
      try {
        const data = await previewRolloverExceptions({
          fromSchoolYear,
          semester,
          page,
          limit: 50,
          search,
          course: group.course,
          yearLevel: group.yearLevel,
          block: group.block,
        })
        setExceptionStudents(data.students)
        setExceptionPage(data.page)
        setExceptionTotal(data.total)
        setExceptionTotalPages(data.totalPages)
      } catch {
        setExceptionStudents([])
        setExceptionTotal(0)
        setExceptionTotalPages(0)
      } finally {
        setExceptionLoading(false)
      }
    },
    [fromSchoolYear, semester]
  )

  const handleExpandGroup = (group: RolloverGroupSummary) => {
    const key = groupKey(group)
    if (expandedGroup === key) {
      setExpandedGroup(null)
      setExceptionStudents([])
      return
    }
    setExpandedGroup(key)
    setExceptionSearch('')
    void loadGroupExceptions(group, 1, '')
  }

  const handleExceptionSearchChange = (value: string, group: RolloverGroupSummary) => {
    setExceptionSearch(value)
    if (exceptionDebounceRef.current) clearTimeout(exceptionDebounceRef.current)
    exceptionDebounceRef.current = setTimeout(() => {
      void loadGroupExceptions(group, 1, value)
    }, 350)
  }

  // ---- Global exceptions drawer ----
  const loadGlobalExceptions = useCallback(
    async (page: number, search: string) => {
      setGlobalExceptionLoading(true)
      try {
        const data = await previewRolloverExceptions({
          fromSchoolYear,
          semester,
          page,
          limit: 50,
          search,
        })
        setGlobalExceptionStudents(data.students)
        setGlobalExceptionPage(data.page)
        setGlobalExceptionTotal(data.total)
        setGlobalExceptionTotalPages(data.totalPages)
      } catch {
        setGlobalExceptionStudents([])
        setGlobalExceptionTotal(0)
        setGlobalExceptionTotalPages(0)
      } finally {
        setGlobalExceptionLoading(false)
      }
    },
    [fromSchoolYear, semester]
  )

  const handleShowGlobalExceptions = () => {
    setShowGlobalExceptions((prev) => !prev)
    if (!showGlobalExceptions) {
      setGlobalExceptionSearch('')
      void loadGlobalExceptions(1, '')
    }
  }

  const handleGlobalExceptionSearchChange = (value: string) => {
    setGlobalExceptionSearch(value)
    if (globalExceptionDebounceRef.current) clearTimeout(globalExceptionDebounceRef.current)
    globalExceptionDebounceRef.current = setTimeout(() => {
      void loadGlobalExceptions(1, value)
    }, 350)
  }

  // ---- Override a single student's action ----
  const handleStudentOverride = (studentId: string, action: RolloverAction, groupKeyValue: string) => {
    setDecisionOverrides((current) => ({ ...current, [studentId]: action }))
    setDecisionOverrideGroups((current) => ({ ...current, [studentId]: groupKeyValue }))
  }

  // ---- Group approval toggle ----
  const handleGroupApprovalToggle = (group: RolloverGroupSummary) => {
    const key = groupKey(group)
    setApprovedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleGroupActionChange = (group: RolloverGroupSummary, action: RolloverAction) => {
    setGroupActions((current) => ({ ...current, [groupKey(group)]: action }))
  }

  // ---- Filtered groups based on card filter + search ----
  const filteredGroups = useMemo(() => {
    if (!summaryPreview) return []
    let groups = summaryPreview.groups
    if (cardFilter === 'needsReview') {
      groups = groups.filter((g) => g.needsReview > 0)
    } else if (cardFilter === 'promote') {
      groups = groups.filter((g) => g.eligible > 0)
    } else if (cardFilter === 'retain') {
      groups = groups.filter((g) => g.retained > 0)
    } else if (cardFilter === 'graduate') {
      groups = groups.filter((g) => g.graduating > 0)
    }
    if (groupSearchText) {
      const q = groupSearchText.toLowerCase()
      groups = groups.filter((g) =>
        courseShortLabel(g.course).toLowerCase().includes(q) ||
        String(g.yearLevel).includes(q) ||
        g.block.toLowerCase().includes(q)
      )
    }
    return groups
  }, [summaryPreview, cardFilter, groupSearchText])

  // ---- Progress tracking ----
  const progress = useMemo(() => {
    if (!summaryPreview) return { groupsReviewed: 0, totalGroups: 0, exceptionsReviewed: 0, totalExceptions: 0, readyPercent: 0 }
    const totalGroups = summaryPreview.groups.length
    const groupsReviewed = approvedGroups.size
    const totalExceptions = summaryPreview.summary.needsReview
    const exceptionsReviewed = Object.keys(decisionOverrides).filter((id) => decisionOverrides[id] !== undefined).length
    const readyPercent = totalGroups > 0 ? Math.round((groupsReviewed / totalGroups) * 100) : 0
    return { groupsReviewed, totalGroups, exceptionsReviewed, totalExceptions, readyPercent }
  }, [summaryPreview, approvedGroups, decisionOverrides])

  // ---- Compute counts for confirmation ----
  const decisionCounts = useMemo(() => {
    const counts = { promote: 0, retain: 0, graduate: 0, skip: 0 }
    if (!summaryPreview) return counts
    for (const g of summaryPreview.groups) {
      const key = groupKey(g)
      if (!approvedGroups.has(key)) continue
      const action = groupActions[key] || 'promote'
      const overrideCount = Object.entries(decisionOverrideGroups)
        .filter(([, overrideGroupKey]) => overrideGroupKey === key)
        .length
      counts[action] += Math.max(0, g.total - overrideCount)
    }
    for (const [studentId, action] of Object.entries(decisionOverrides)) {
      const overrideGroupKey = decisionOverrideGroups[studentId]
      if (overrideGroupKey && !approvedGroups.has(overrideGroupKey)) continue
      counts[action] += 1
    }
    return counts
  }, [summaryPreview, approvedGroups, groupActions, decisionOverrides, decisionOverrideGroups])

  const totalApprovedStudents = useMemo(() => {
    if (!summaryPreview) return 0
    return summaryPreview.groups
      .filter((g) => approvedGroups.has(groupKey(g)))
      .reduce((sum, g) => sum + g.total, 0)
  }, [summaryPreview, approvedGroups])

  const unapprovedGroups = useMemo(() => {
    if (!summaryPreview) return []
    return summaryPreview.groups.filter((g) => !approvedGroups.has(groupKey(g)))
  }, [summaryPreview, approvedGroups])

  // ---- Execute ----
  const handleExecute = async () => {
    if (!summaryPreview) return
    setExecuting(true)
    setError('')
    try {
      const groupDecisions: RolloverGroupDecision[] = summaryPreview.groups
        .filter((g) => approvedGroups.has(groupKey(g)))
        .map((g) => ({
          course: g.course,
          yearLevel: g.yearLevel,
          block: g.block,
          action: groupActions[groupKey(g)] || 'promote',
        }))

      const overrides = Object.entries(decisionOverrides)
        .filter(([studentId]) => {
          const overrideGroupKey = decisionOverrideGroups[studentId]
          return !overrideGroupKey || approvedGroups.has(overrideGroupKey)
        })
        .map(([studentId, action]) => ({
          studentId,
          action,
        }))

      const data = await executeRollover({
        fromSchoolYear: summaryPreview.fromSchoolYear,
        toSchoolYear: summaryPreview.toSchoolYear,
        semester: summaryPreview.semester,
        groupDecisions,
        decisionOverrides: overrides.length > 0 ? overrides : undefined,
      })
      setResult(data)
      setRevertSuccess(null)
      setRevertError('')
      setLatestBatch({
        batchId: data.rolloverBatchId,
        fromSchoolYear: data.fromSchoolYear,
        toSchoolYear: data.toSchoolYear,
        semester: data.semester,
        status: 'applied',
        executedAt: new Date().toISOString(),
        executedBy: null,
        counts: {
          total: data.promoted.length + data.retained.length + data.graduated.length + data.skipped.length,
          promoted: data.promoted.length,
          retained: data.retained.length,
          graduated: data.graduated.length,
          skipped: data.skipped.length,
        },
      })
      setStep(4)
      void loadLatestBatch()
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'Rollover failed. All changes were rolled back.')
    } finally {
      setExecuting(false)
    }
  }

  // ---- Revert the most recent rollover ----
  const handleOpenRevert = () => {
    setRevertError('')
    setRevertSuccess(null)
    setShowRevertConfirm(true)
  }

  const handleRevert = async () => {
    if (!latestBatch) return
    setReverting(true)
    setRevertError('')
    try {
      const data = await revertRollover({ batchId: latestBatch.batchId })
      setRevertSuccess(data)
      setLatestBatch((current) => current ? {
        ...current,
        status: 'reverted',
        revertedAt: data.revertedAt,
        revertedBy: null,
      } : current)
      setShowRevertConfirm(false)
      setResult(null)
      setSummaryPreview(null)
      setApprovedGroups(new Set())
      setGroupActions({})
      setDecisionOverrides({})
      setDecisionOverrideGroups({})
      setExpandedGroup(null)
      setExceptionStudents([])
      setShowGlobalExceptions(false)
      setStep(1)
      setShowHistory(false)

      try {
        const term = await getAcademicTerm()
        setFromSchoolYear(term.schoolYear)
        setToSchoolYear(nextSchoolYear(term.schoolYear))
        setSemester(term.semester)
      } catch {
        // Keep the current form values if the term cannot be reloaded.
      }

      await loadLatestBatch()
    } catch (revertFailure) {
      setRevertError(revertFailure instanceof Error ? revertFailure.message : 'Failed to revert rollover. All changes were rolled back.')
    } finally {
      setReverting(false)
    }
  }

  const steps = [
    { id: 1, label: 'Setup', icon: CalendarClock },
    { id: 2, label: 'Review Groups', icon: Users },
    { id: 3, label: 'Confirm', icon: Check },
    { id: 4, label: 'Result', icon: CheckCircle2 },
  ]

  const summaryCards = [
    { key: 'promote' as CardFilter, label: 'Eligible for Promotion', value: summaryPreview?.summary.promote ?? 0, icon: Users, variant: '' },
    { key: 'retain' as CardFilter, label: 'Retained', value: summaryPreview?.summary.retain ?? 0, icon: RefreshCw, variant: '' },
    { key: 'graduate' as CardFilter, label: 'Graduating', value: summaryPreview?.summary.graduate ?? 0, icon: GraduationCap, variant: 'graduate' },
    { key: 'needsReview' as CardFilter, label: 'Needs Review', value: summaryPreview?.summary.needsReview ?? 0, icon: AlertTriangle, variant: 'review' },
  ]

  return (
    <div className="rollover-page">
      <header className="rollover-page__header">
        <div>
          <span className="rollover-page__eyebrow">Academic Year Rollover</span>
          <h2>Close School Year</h2>
          <p>
            Historical enrollments are locked as immutable records; promoted and retained students receive new
            enrollments for the incoming school year. The entire rollover runs in a single transaction.
          </p>
        </div>
        <div className="rollover-page__header-actions">
          <button type="button" className="rollover-page__ghost-button" onClick={() => setShowHistory((value) => !value)}>
            <History size={16} /> {showHistory ? 'Hide history' : 'Archive history'}
          </button>
          {onBack ? (
            <button type="button" className="rollover-page__ghost-button" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      </header>

      {latestBatch ? (
        <section
          className={[
            'rollover-page__panel',
            'rollover-page__rollover-status',
            latestBatch.status === 'reverted' ? 'rollover-page__rollover-status--reverted' : '',
          ].filter(Boolean).join(' ')}
        >
          <div className="rollover-page__status-header">
            <div>
              <span className="rollover-page__eyebrow">Last rollover</span>
              <h3>
                SY {latestBatch.fromSchoolYear} <ArrowRight size={16} /> SY {latestBatch.toSchoolYear}
              </h3>
              <p className="rollover-page__hint">
                {latestBatch.status === 'applied'
                  ? `Executed ${formatDateTime(latestBatch.executedAt)} by ${latestBatch.executedBy?.displayName || latestBatch.executedBy?.username || 'an administrator'} · ${latestBatch.semester} semester`
                  : `Reverted ${formatDateTime(latestBatch.revertedAt)} by ${latestBatch.revertedBy?.displayName || latestBatch.revertedBy?.username || 'an administrator'} · ${latestBatch.semester} semester`}
              </p>
            </div>
            <span
              className={[
                'rollover-page__status-badge',
                latestBatch.status === 'applied' ? 'rollover-page__status-badge--ok' : 'rollover-page__status-badge--warn',
              ].join(' ')}
            >
              {latestBatch.status === 'applied' ? 'Applied' : 'Reverted'}
            </span>
          </div>

          <div className="rollover-page__status-counts">
            <span><strong>{latestBatch.counts?.promoted?.toLocaleString() ?? 0}</strong> promoted</span>
            <span><strong>{latestBatch.counts?.retained?.toLocaleString() ?? 0}</strong> retained</span>
            <span><strong>{latestBatch.counts?.graduated?.toLocaleString() ?? 0}</strong> graduated</span>
            <span><strong>{latestBatch.counts?.skipped?.toLocaleString() ?? 0}</strong> skipped</span>
          </div>

          {latestBatch.status === 'applied' ? (
            <footer className="rollover-page__status-actions">
              <button
                type="button"
                className="rollover-page__danger-button"
                onClick={handleOpenRevert}
                disabled={reverting || latestBatchLoading}
              >
                <RotateCcw size={16} /> Revert this rollover
              </button>
              <span className="rollover-page__hint">
                Restores the previous academic term, closing enrollments, student year levels, and block assignments.
              </span>
            </footer>
          ) : (
            <p className="rollover-page__hint">
              The previous academic term and student records have been restored. The rollover archive remains immutable.
            </p>
          )}

          {revertSuccess ? (
            <div className="rollover-page__success">
              <CheckCircle2 size={18} />
              <div>
                <strong>Rollover reverted.</strong>
                <span>
                  Restored {revertSuccess.restoredStudents.toLocaleString()} student
                  {revertSuccess.restoredStudents === 1 ? '' : 's'}, removed{' '}
                  {revertSuccess.deletedEnrollments.toLocaleString()} new enrollment
                  {revertSuccess.deletedEnrollments === 1 ? '' : 's'}, and reopened SY{' '}
                  {revertSuccess.restoredAcademicTerm.schoolYear} ({revertSuccess.restoredAcademicTerm.semester} semester).
                </span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {showHistory ? (
        <section className="rollover-page__panel">
          <h3><Archive size={16} /> Archive snapshots</h3>
          <p className="rollover-page__hint">Immutable reports generated by previous rollovers. These records never change.</p>
          {snapshots.length === 0 ? (
            <div className="rollover-page__empty">No archive snapshots yet.</div>
          ) : (
            <div className="rollover-page__snapshot-list">
              {snapshots.map((snapshot) => (
                <div key={snapshot._id} className="rollover-page__snapshot-row">
                  <span className="rollover-page__snapshot-type">{snapshot.type.replace(/_/g, ' ')}</span>
                  <span className="rollover-page__snapshot-title">{snapshot.title}</span>
                  <span className="rollover-page__snapshot-date">{new Date(snapshot.generatedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <ol className="rollover-page__steps">
        {steps.map((item) => {
          const Icon = item.icon
          return (
            <li
              key={item.id}
              className={[
                'rollover-page__step',
                step === item.id ? 'rollover-page__step--active' : '',
                step > item.id ? 'rollover-page__step--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="rollover-page__step-icon"><Icon size={15} /></span>
              <strong>{item.label}</strong>
            </li>
          )
        })}
      </ol>

      {error ? (
        <div className="rollover-page__error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ---- Step 1: Setup ---- */}
      {step === 1 ? (
        <section className="rollover-page__panel">
          <h3>Rollover setup</h3>
          <div className="rollover-page__form-grid">
            <label>
              <span>Closing school year</span>
              <input
                value={fromSchoolYear}
                onChange={(event) => {
                  setFromSchoolYear(event.target.value)
                  setToSchoolYear(nextSchoolYear(event.target.value))
                }}
                placeholder="2025-2026"
                pattern="\d{4}-\d{4}"
              />
            </label>
            <label>
              <span>New school year</span>
              <input
                value={toSchoolYear}
                onChange={(event) => setToSchoolYear(event.target.value)}
                placeholder="2026-2027"
                pattern="\d{4}-\d{4}"
              />
            </label>
            <label>
              <span>Opening semester</span>
              <select value={semester} onChange={(event) => setSemester(event.target.value as AcademicSemester)}>
                {SEMESTERS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <footer className="rollover-page__actions">
            <button
              type="button"
              className="rollover-page__primary-button"
              onClick={handlePreview}
              disabled={loading || !/^\d{4}-\d{4}$/.test(fromSchoolYear) || !/^\d{4}-\d{4}$/.test(toSchoolYear)}
            >
              {loading ? <RefreshCw size={16} className="rollover-page__spin" /> : <ArrowRight size={16} />}
              {loading ? 'Evaluating...' : 'Evaluate students'}
            </button>
          </footer>
        </section>
      ) : null}

      {/* ---- Step 2: Summary -> Group -> Exception hierarchy ---- */}
      {step === 2 && summaryPreview ? (
        <section className="rollover-page__panel rollover-page__panel--review">
          <div className="rollover-page__review-header">
            <h3>Review Student Evaluations</h3>
            <p className="rollover-page__hint">
              You are reviewing academic groups. Student records only appear when exceptions require manual intervention.
            </p>
          </div>

          {/* ---- Summary Cards (clickable filters) ---- */}
          <div className="rollover-page__summary-cards">
            {summaryCards.map((card) => {
              const Icon = card.icon
              const isActive = cardFilter === card.key
              return (
                <button
                  key={card.key}
                  type="button"
                  className={[
                    'rollover-page__summary-card',
                    card.variant ? `rollover-page__summary-card--${card.variant}` : '',
                    isActive ? 'rollover-page__summary-card--active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setCardFilter(isActive ? 'all' : card.key)}
                >
                  <span className="rollover-page__summary-card-label">
                    <Icon size={14} /> {card.label}
                  </span>
                  <strong>{card.value.toLocaleString()}</strong>
                </button>
              )
            })}
          </div>

          {/* ---- Contextual notification (replaces duplicate banner) ---- */}
          {summaryPreview.summary.needsReview > 0 ? (
            <div className="rollover-page__contextual-notice">
              <AlertTriangle size={15} />
              <span>
                {summaryPreview.summary.needsReview.toLocaleString()} student(s) require registrar intervention before rollover.
              </span>
              <button type="button" className="rollover-page__contextual-link" onClick={handleShowGlobalExceptions}>
                {showGlobalExceptions ? 'Hide' : 'Review Exceptions'}
              </button>
            </div>
          ) : null}

          {/* ---- Global Exceptions Drawer ---- */}
          {showGlobalExceptions ? (
            <div className="rollover-page__exceptions-drawer">
              <div className="rollover-page__exceptions-drawer-header">
                <h4>Exception Students</h4>
                <button type="button" className="rollover-page__ghost-button" onClick={() => setShowGlobalExceptions(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="rollover-page__exceptions-search">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search by student number or name..."
                  value={globalExceptionSearch}
                  onChange={(e) => handleGlobalExceptionSearchChange(e.target.value)}
                />
              </div>
              {globalExceptionLoading ? (
                <div className="rollover-page__empty"><RefreshCw size={16} className="rollover-page__spin" /> Loading exceptions...</div>
              ) : globalExceptionStudents.length === 0 ? (
                <div className="rollover-page__empty">No exception students found.</div>
              ) : (
                <>
                  <div className="rollover-page__table-wrap">
                    <table className="rollover-page__table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Course</th>
                          <th>Year</th>
                          <th>Reason</th>
                          <th>Suggested</th>
                          <th>Registrar Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {globalExceptionStudents.map((student) => (
                          <tr key={student.studentId} className="rollover-page__row--review">
                            <td>
                              <strong>{student.name}</strong>
                              <span className="rollover-page__student-number">{formatStudentNumber(student.studentNumber, student.course)}</span>
                            </td>
                            <td>{courseShortLabel(student.course)}</td>
                            <td>{student.yearLevel}</td>
                            <td><span className="rollover-page__reason">{student.reason}</span></td>
                            <td><span className="rollover-page__suggested">{ACTION_LABELS[student.recommendedAction]}</span></td>
                            <td>
                              <select
                                value={decisionOverrides[student.studentId] || student.recommendedAction}
                                onChange={(e) => handleStudentOverride(
                                  student.studentId,
                                  e.target.value as RolloverAction,
                                  groupKey({ course: student.course, yearLevel: student.yearLevel, block: student.block || 'Unassigned' })
                                )}
                                className="rollover-page__decision-select"
                              >
                                {(Object.keys(ACTION_LABELS) as RolloverAction[]).map((action) => (
                                  <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rollover-page__pagination">
                    <span>{globalExceptionTotal.toLocaleString()} exception(s) — page {globalExceptionPage} of {globalExceptionTotalPages}</span>
                    <div className="rollover-page__pagination-buttons">
                      <button
                        type="button"
                        className="rollover-page__ghost-button"
                        disabled={globalExceptionPage <= 1 || globalExceptionLoading}
                        onClick={() => void loadGlobalExceptions(globalExceptionPage - 1, globalExceptionSearch)}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="rollover-page__ghost-button"
                        disabled={globalExceptionPage >= globalExceptionTotalPages || globalExceptionLoading}
                        onClick={() => void loadGlobalExceptions(globalExceptionPage + 1, globalExceptionSearch)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* ---- Progress Tracking ---- */}
          <div className="rollover-page__progress-bar">
            <div className="rollover-page__progress-stat">
              <span>Groups Reviewed</span>
              <strong>{progress.groupsReviewed} / {progress.totalGroups}</strong>
            </div>
            <div className="rollover-page__progress-stat">
              <span>Exceptions Reviewed</span>
              <strong>{progress.exceptionsReviewed} / {progress.totalExceptions}</strong>
            </div>
            <div className="rollover-page__progress-stat">
              <span>Ready for Execution</span>
              <strong>{progress.readyPercent}%</strong>
            </div>
            <div className="rollover-page__progress-track">
              <div className="rollover-page__progress-fill" style={{ width: `${progress.readyPercent}%` }} />
            </div>
          </div>

          {/* ---- Search & Filter Bar ---- */}
          <div className="rollover-page__filter-bar">
            <div className="rollover-page__filter-bar-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search by course, year level, or section..."
                value={groupSearchText}
                onChange={(e) => setGroupSearchText(e.target.value)}
              />
              {groupSearchText ? (
                <button type="button" className="rollover-page__filter-clear" onClick={() => setGroupSearchText('')}>
                  <X size={14} />
                </button>
              ) : null}
            </div>
            {cardFilter !== 'all' ? (
              <button type="button" className="rollover-page__filter-active-tag" onClick={() => setCardFilter('all')}>
                <Filter size={12} /> {summaryCards.find((c) => c.key === cardFilter)?.label}
                <X size={12} />
              </button>
            ) : null}
          </div>

          {/* ---- Group Summary Table ---- */}
          {filteredGroups.length === 0 ? (
            <div className="rollover-page__empty">
              {summaryPreview.groups.length === 0
                ? `No active students found for SY ${summaryPreview.fromSchoolYear}.`
                : 'No groups match the current filter.'}
            </div>
          ) : (
            <div className="rollover-page__table-wrap">
              <table className="rollover-page__table rollover-page__group-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Course</th>
                    <th>Year</th>
                    <th>Block</th>
                    <th>Total</th>
                    <th>Promotion</th>
                    <th>Retained</th>
                    <th>Graduating</th>
                    <th>Exceptions</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group) => {
                    const key = groupKey(group)
                    const isExpanded = expandedGroup === key
                    const isApproved = approvedGroups.has(key)
                    return (
                      <GroupRow
                        key={key}
                        group={group}
                        isExpanded={isExpanded}
                        isApproved={isApproved}
                        action={groupActions[key] || 'promote'}
                        onToggleExpand={() => handleExpandGroup(group)}
                        onToggleApprove={() => handleGroupApprovalToggle(group)}
                        onActionChange={(action) => handleGroupActionChange(group, action)}
                      >
                        {isExpanded ? (
                          <tr className="rollover-page__group-detail-row">
                            <td colSpan={11}>
                              <div className="rollover-page__group-detail">
                                <div className="rollover-page__group-detail-header">
                                  <h4>Exception Students — {courseShortLabel(group.course)} Year {group.yearLevel} Block {group.block}</h4>
                                  <span className="rollover-page__group-detail-count">{group.needsReview} exception(s)</span>
                                </div>
                                <div className="rollover-page__exceptions-search">
                                  <Search size={15} />
                                  <input
                                    type="text"
                                    placeholder="Search exception students..."
                                    value={exceptionSearch}
                                    onChange={(e) => handleExceptionSearchChange(e.target.value, group)}
                                  />
                                </div>
                                {exceptionLoading ? (
                                  <div className="rollover-page__empty"><RefreshCw size={16} className="rollover-page__spin" /> Loading exception students...</div>
                                ) : exceptionStudents.length === 0 ? (
                                  <div className="rollover-page__empty">No exception students in this group.</div>
                                ) : (
                                  <>
                                    <table className="rollover-page__table rollover-page__student-table">
                                      <thead>
                                        <tr>
                                          <th>Student</th>
                                          <th>Student Number</th>
                                          <th>Reason</th>
                                          <th>Suggested</th>
                                          <th>Registrar Decision</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {exceptionStudents.map((student) => (
                                          <tr key={student.studentId} className="rollover-page__row--review">
                                            <td><strong>{student.name}</strong></td>
                                            <td><span className="rollover-page__student-number">{formatStudentNumber(student.studentNumber, student.course)}</span></td>
                                            <td><span className="rollover-page__reason">{student.reason}</span></td>
                                            <td><span className="rollover-page__suggested">{ACTION_LABELS[student.recommendedAction]}</span></td>
                                            <td>
                                              <select
                                                value={decisionOverrides[student.studentId] || student.recommendedAction}
                                                onChange={(e) => handleStudentOverride(
                                                  student.studentId,
                                                  e.target.value as RolloverAction,
                                                  groupKey(group)
                                                )}
                                                className="rollover-page__decision-select"
                                              >
                                                {(Object.keys(ACTION_LABELS) as RolloverAction[]).map((action) => (
                                                  <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                                                ))}
                                              </select>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    <div className="rollover-page__pagination">
                                      <span>{exceptionTotal.toLocaleString()} exception(s) — page {exceptionPage} of {exceptionTotalPages}</span>
                                      <div className="rollover-page__pagination-buttons">
                                        <button
                                          type="button"
                                          className="rollover-page__ghost-button"
                                          disabled={exceptionPage <= 1 || exceptionLoading}
                                          onClick={() => void loadGroupExceptions(group, exceptionPage - 1, exceptionSearch)}
                                        >
                                          Previous
                                        </button>
                                        <button
                                          type="button"
                                          className="rollover-page__ghost-button"
                                          disabled={exceptionPage >= exceptionTotalPages || exceptionLoading}
                                          onClick={() => void loadGroupExceptions(group, exceptionPage + 1, exceptionSearch)}
                                        >
                                          Next
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </GroupRow>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="rollover-page__actions">
            <button type="button" className="rollover-page__ghost-button" onClick={() => setStep(1)}>Back</button>
            <button
              type="button"
              className="rollover-page__primary-button"
              onClick={() => setStep(3)}
              disabled={approvedGroups.size === 0}
            >
              Continue to confirmation ({approvedGroups.size} {approvedGroups.size === 1 ? 'group' : 'groups'} approved) <ArrowRight size={16} />
            </button>
          </footer>
        </section>
      ) : null}

      {/* ---- Step 3: Confirm ---- */}
      {step === 3 && summaryPreview ? (
        <section className="rollover-page__panel">
          <h3>Confirm rollover</h3>
          <div className="rollover-page__confirm-box">
            <p>
              You are about to close <strong>SY {summaryPreview.fromSchoolYear}</strong> and open{' '}
              <strong>SY {summaryPreview.toSchoolYear} ({summaryPreview.semester} semester)</strong>.
            </p>
            <ul>
              <li><Users size={14} /> {totalApprovedStudents.toLocaleString()} student{totalApprovedStudents === 1 ? '' : 's'} across {approvedGroups.size} approved group{approvedGroups.size === 1 ? '' : 's'}.</li>
              <li><Check size={14} /> {decisionCounts.promote.toLocaleString()} will be promoted.</li>
              <li><RefreshCw size={14} /> {decisionCounts.retain.toLocaleString()} will be retained.</li>
              <li><GraduationCap size={14} /> {decisionCounts.graduate.toLocaleString()} will be graduated.</li>
              {decisionCounts.skip > 0 ? (
                <li><X size={14} /> {decisionCounts.skip.toLocaleString()} will be skipped.</li>
              ) : null}
              {Object.keys(decisionOverrides).length > 0 ? (
                <li><AlertTriangle size={14} /> {Object.keys(decisionOverrides).length} manual override{Object.keys(decisionOverrides).length === 1 ? '' : 's'} applied.</li>
              ) : null}
              {unapprovedGroups.length > 0 ? (
                <li className="rollover-page__warning"><AlertCircle size={14} /> {unapprovedGroups.length} unapproved group{unapprovedGroups.length === 1 ? '' : 's'} — students in those groups will be skipped.</li>
              ) : null}
            </ul>
            <p className="rollover-page__warning">
              Closed enrollments become permanent, read-only historical records. This operation runs in a single
              transaction — if anything fails, all changes are rolled back automatically.
            </p>
          </div>
          <footer className="rollover-page__actions">
            <button type="button" className="rollover-page__ghost-button" onClick={() => setStep(2)} disabled={executing}>Back</button>
            <button type="button" className="rollover-page__primary-button rollover-page__primary-button--danger" onClick={handleExecute} disabled={executing}>
              {executing ? <RefreshCw size={16} className="rollover-page__spin" /> : <Check size={16} />}
              {executing ? 'Executing rollover...' : `Close SY ${summaryPreview.fromSchoolYear}`}
            </button>
          </footer>
        </section>
      ) : null}

      {/* ---- Step 4: Result ---- */}
      {step === 4 && result ? (
        <section className="rollover-page__panel">
          <div className="rollover-page__result-header">
            <CheckCircle2 size={40} />
            <div>
              <h3>Rollover complete</h3>
              <p>SY {result.fromSchoolYear} is now closed. SY {result.toSchoolYear} is the active school year.</p>
            </div>
          </div>
          <div className="rollover-page__summary-cards">
            <div className="rollover-page__summary-card"><span>Promoted</span><strong>{result.promoted.length.toLocaleString()}</strong></div>
            <div className="rollover-page__summary-card"><span>Retained</span><strong>{result.retained.length.toLocaleString()}</strong></div>
            <div className="rollover-page__summary-card rollover-page__summary-card--graduate"><span>Graduated</span><strong>{result.graduated.length.toLocaleString()}</strong></div>
            <div className="rollover-page__summary-card"><span>Snapshots</span><strong>{result.snapshotIds.length}</strong></div>
          </div>
          <p className="rollover-page__hint">
            {result.snapshotIds.length} immutable archive snapshot(s) were generated. Batch ID: <code>{result.rolloverBatchId}</code>
          </p>
          <footer className="rollover-page__actions">
            {latestBatch?.batchId === result.rolloverBatchId && latestBatch.status === 'applied' ? (
              <button
                type="button"
                className="rollover-page__danger-button"
                onClick={handleOpenRevert}
                disabled={reverting}
              >
                <RotateCcw size={16} /> Revert this rollover
              </button>
            ) : null}
            <button
              type="button"
              className="rollover-page__primary-button"
              onClick={() => {
                setStep(1)
                setSummaryPreview(null)
                setResult(null)
                setShowHistory(true)
              }}
            >
              View archive history
            </button>
          </footer>
        </section>
      ) : null}

      {showRevertConfirm && latestBatch ? (
        <div
          className="rollover-page__modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !reverting) setShowRevertConfirm(false)
          }}
        >
          <div
            className="rollover-page__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revert-rollover-title"
            aria-describedby="revert-rollover-description"
          >
            <div className="rollover-page__modal-header">
              <div>
                <span className="rollover-page__eyebrow">Destructive action</span>
                <h3 id="revert-rollover-title">Revert this rollover?</h3>
              </div>
              <button
                type="button"
                className="rollover-page__ghost-button"
                onClick={() => setShowRevertConfirm(false)}
                disabled={reverting}
                aria-label="Close revert confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <p id="revert-rollover-description">
              This will undo the <strong>SY {latestBatch.fromSchoolYear} <ArrowRight size={14} /> SY {latestBatch.toSchoolYear}</strong>{' '}
              rollover and reopen <strong>SY {latestBatch.fromSchoolYear}</strong>.
            </p>

            <ul className="rollover-page__modal-list">
              <li>Delete the enrollment records created for SY {latestBatch.toSchoolYear}.</li>
              <li>Unlock and restore the closing enrollments for SY {latestBatch.fromSchoolYear}.</li>
              <li>Restore student year levels, sections, and block assignments.</li>
              <li>Restore the previous academic term.</li>
            </ul>

            <p className="rollover-page__warning">
              Revert is blocked if any new enrollment already has grades or payments, if a student was changed after
              the rollover, or if the active academic term has changed.
            </p>

            {revertError ? (
              <div className="rollover-page__error" role="alert">
                <AlertCircle size={18} />
                <span>{revertError}</span>
              </div>
            ) : null}

            <footer className="rollover-page__modal-actions">
              <button
                type="button"
                className="rollover-page__ghost-button"
                onClick={() => setShowRevertConfirm(false)}
                disabled={reverting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rollover-page__primary-button rollover-page__primary-button--danger"
                onClick={() => void handleRevert()}
                disabled={reverting}
              >
                {reverting ? <RefreshCw size={16} className="rollover-page__spin" /> : <RotateCcw size={16} />}
                {reverting ? 'Reverting...' : 'Revert rollover'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---- GroupRow: renders a group row + optional expanded exception detail ----
function GroupRow({
  group,
  isExpanded,
  isApproved,
  action,
  onToggleExpand,
  onToggleApprove,
  onActionChange,
  children,
}: {
  group: RolloverGroupSummary
  isExpanded: boolean
  isApproved: boolean
  action: RolloverAction
  onToggleExpand: () => void
  onToggleApprove: () => void
  onActionChange: (action: RolloverAction) => void
  children?: React.ReactNode
}) {
  const canExpand = group.needsReview > 0
  return (
    <>
      <tr className={isApproved ? 'rollover-page__group-row--approved' : ''}>
        <td>
          {canExpand ? (
            <button type="button" className="rollover-page__expand-button" onClick={onToggleExpand}>
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="rollover-page__expand-spacer" />
          )}
        </td>
        <td><strong>{courseShortLabel(group.course)}</strong></td>
        <td>{group.yearLevel}</td>
        <td>{group.block}</td>
        <td>{group.total.toLocaleString()}</td>
        <td>{group.eligible.toLocaleString()}</td>
        <td>{group.retained.toLocaleString()}</td>
        <td>{group.graduating.toLocaleString()}</td>
        <td>
          {group.needsReview > 0 ? (
            <span className="rollover-page__exception-badge">{group.needsReview.toLocaleString()}</span>
          ) : (
            <span className="rollover-page__reason">—</span>
          )}
        </td>
        <td>
          {isApproved ? (
            <span className="rollover-page__status-badge rollover-page__status-badge--ok">Approved</span>
          ) : group.needsReview > 0 ? (
            <span className="rollover-page__status-badge rollover-page__status-badge--warn">Needs Review</span>
          ) : (
            <span className="rollover-page__status-badge rollover-page__status-badge--ready">Ready</span>
          )}
        </td>
        <td>
          <div className="rollover-page__action-cell">
            <select
              value={action}
              onChange={(e) => onActionChange(e.target.value as RolloverAction)}
              className="rollover-page__group-action-select"
            >
              {(Object.keys(ACTION_LABELS) as RolloverAction[]).map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
            <button
              type="button"
              className={`rollover-page__approve-btn ${isApproved ? 'rollover-page__approve-btn--active' : ''}`}
              onClick={onToggleApprove}
              title={isApproved ? 'Unapprove group' : 'Approve group'}
            >
              {isApproved ? <Check size={14} /> : 'Approve'}
            </button>
          </div>
        </td>
      </tr>
      {children}
    </>
  )
}

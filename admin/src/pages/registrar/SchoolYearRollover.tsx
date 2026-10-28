import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Archive, ArrowRight, CalendarClock, Check, CheckCircle2,
  ChevronDown, ChevronRight, Download, GraduationCap, History, RefreshCw, Lock, LockOpen, Search,
  Users, AlertTriangle, Filter, ShieldCheck, X,
} from 'lucide-react'
import { getAcademicTerm, notifyAcademicTermChanged, type AcademicSemester, type AcademicTerm } from '../../lib/settingsApi'
import { formatGrade } from '../../lib/gradingScale'
import {
  executeRollover,
  getLatestRollover,
  getRolloverSnapshot,
  getSchoolYearRolloverReport,
  getSchoolYearState,
  listRolloverBatches,
  listRolloverSnapshots,
  listValidationRuns,
  lockSchoolYear,
  unlockSchoolYear,
  previewRolloverSummary,
  previewRolloverExceptions,
  retryRollover,
  runPreRolloverValidation,
  type ArchiveSnapshotSummary,
  type RolloverAction,
  type RolloverBatchListItem,
  type RolloverBatchSummary,
  type RolloverGroupSummary,
  type RolloverSummaryPreview,
  type RolloverEvaluation,
  type RolloverResult,
  type RolloverGroupDecision,
  type SchoolYearState,
  type ValidationRun,
  type ValidationRunResult,
} from '../../lib/rolloverApi'
import { courseShortLabel, formatStudentNumber } from '../../lib/blockAssignmentShared'
import { downloadCsv } from '../../lib/csv'
import './SchoolYearRollover.css'

type WizardStep = 1 | 2 | 3 | 4
type CardFilter = 'all' | 'promote' | 'retain' | 'graduate' | 'needsReview'

const ACTION_LABELS: Record<RolloverAction, string> = {
  promote: 'Promote',
  retain: 'Retain',
  graduate: 'Graduate',
  skip: 'Skip',
}

// One row per subject grade (student details repeated), so a school year's
// export is a usable student + grades report.
const ROLLOVER_EXPORT_HEADERS = [
  'Student Number',
  'Student Name',
  'First Name',
  'Middle Name',
  'Last Name',
  'Suffix',
  'Program',
  'Year Level',
  'Section',
  'Semester',
  'School Year',
  'Student Status',
  'Lifecycle',
  'Email',
  'Contact Number',
  'Address',
  'Permanent Address',
  'Gender',
  'Birth Date',
  'Latest Grade',
  'Course Code',
  'Course Title',
  'Units',
  'Grade',
  'Grade Mark',
  'Course Status',
  'Instructor',
  'Course Semester',
]

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

// ---- Graduation report snapshot payload ----

type GraduateEntry = {
  studentNumber: string
  name: string
  courseLabel: string
  block: string | null
  blockLabel: string
  label: string
  latestGrade: number | null
}

type GraduateBlockGroup = {
  label: string
  courseLabel: string
  block: string | null
  blockLabel: string
  count: number
  students: {
    studentId: string
    studentNumber: string
    name: string
    latestGrade: number | null
  }[]
}

type SnapshotDetail = ArchiveSnapshotSummary & {
  data?: {
    graduates?: GraduateEntry[]
    groupedByCourseBlock?: GraduateBlockGroup[]
  }
}

export default function SchoolYearRollover({ onBack }: { onBack?: () => void }) {
  const [step, setStep] = useState<WizardStep>(1)
  const [fromSchoolYear, setFromSchoolYear] = useState('')
  const [toSchoolYear, setToSchoolYear] = useState('')
  const [semester, setSemester] = useState<AcademicSemester>('1st')
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(null)
  const [summaryPreview, setSummaryPreview] = useState<RolloverSummaryPreview | null>(null)
  const [approvedGroups, setApprovedGroups] = useState<Set<string>>(new Set())
  const [groupActions, setGroupActions] = useState<Record<string, RolloverAction>>({})
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, RolloverAction>>({})
  const [decisionOverrideGroups, setDecisionOverrideGroups] = useState<Record<string, string>>({})
  const [result, setResult] = useState<RolloverResult | null>(null)
  const [snapshots, setSnapshots] = useState<ArchiveSnapshotSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // ---- Rollover history + detailed student exports ----
  const [rolloverBatches, setRolloverBatches] = useState<RolloverBatchListItem[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [exportingSchoolYear, setExportingSchoolYear] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState('')
  const [exportFailure, setExportFailure] = useState('')

  // ---- Archive snapshot detail (graduation report expansion) ----
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null)
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetail | null>(null)
  const [snapshotDetailLoading, setSnapshotDetailLoading] = useState(false)
  const [snapshotDetailError, setSnapshotDetailError] = useState('')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')

  // ---- Last executed rollover (summary display + export) ----
  const [latestBatch, setLatestBatch] = useState<RolloverBatchSummary | null>(null)

  // ---- School year lock / validate / rollover state machine ----
  const [yearState, setYearState] = useState<SchoolYearState | null>(null)
  const [yearStateLoading, setYearStateLoading] = useState(false)
  const [oversightBusy, setOversightBusy] = useState(false)
  const [oversightError, setOversightError] = useState('')
  const [oversightNotice, setOversightNotice] = useState('')
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [showWarningAck, setShowWarningAck] = useState(false)
  const [warningAck, setWarningAck] = useState<Record<string, string>>({})
  const [validationRunUi, setValidationRunUi] = useState<ValidationRun | null>(null)

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

  // Semester rollover ("sem promote"): the opening school year equals the
  // closing one, so the whole cohort advances to the opening semester without
  // changing year level. Year-level promotion stays reserved for a rollover
  // that moves to a different school year.
  const sameYearFields = /^\d{4}-\d{4}$/.test(fromSchoolYear) && /^\d{4}-\d{4}$/.test(toSchoolYear)
  const isSemesterRollover = sameYearFields && toSchoolYear === fromSchoolYear
  const isSemesterRolloverInvalid = isSemesterRollover && semester === '1st'
  // Where in the year is the closing school year, per the system's active
  // academic term? '1st' = we are mid-year and must only close SEMESTER.
  const closingActiveSemester = activeTerm && activeTerm.schoolYear === fromSchoolYear
    ? activeTerm.semester
    : null
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

  /**
   * Apply the term-correct defaults for a closing school year:
   *   - still in the 1st semester → close the SEMESTER (same school year,
   *     opening 2nd) — never the year;
   *   - past the 1st semester (2nd/Summer) → close the YEAR (next school
   *     year, opening 1st).
   */
  const applyDefaultsForActiveTerm = (term: AcademicTerm) => {
    setActiveTerm(term)
    notifyAcademicTermChanged(term)
    setFromSchoolYear(term.schoolYear)
    if (term.semester === '1st') {
      setToSchoolYear(term.schoolYear)
      setSemester('2nd')
    } else {
      setToSchoolYear(nextSchoolYear(term.schoolYear))
      setSemester('1st')
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        applyDefaultsForActiveTerm(await getAcademicTerm())
      } catch {
        // Leave fields empty; user can type them manually.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLatestBatch = useCallback(async () => {
    try {
      const batch = await getLatestRollover()
      setLatestBatch(batch)
    } catch {
      // Keep any optimistic batch already shown; never block the rollover workflow.
    }
  }, [])

  useEffect(() => {
    void loadLatestBatch()
  }, [loadLatestBatch])

  // Expand/collapse an archive snapshot's detail payload (graduation report).
  const toggleSnapshotDetail = useCallback(async (snapshot: ArchiveSnapshotSummary) => {
    if (expandedSnapshotId === snapshot._id) {
      setExpandedSnapshotId(null)
      setSnapshotDetail(null)
      setSnapshotDetailError('')
      return
    }
    setExpandedSnapshotId(snapshot._id)
    setSnapshotDetail(null)
    setSnapshotDetailError('')
    setSnapshotDetailLoading(true)
    try {
      const detail = await getRolloverSnapshot(snapshot._id)
      setSnapshotDetail(detail as SnapshotDetail)
    } catch (detailError) {
      setSnapshotDetailError(detailError instanceof Error ? detailError.message : 'Failed to load snapshot details')
    } finally {
      setSnapshotDetailLoading(false)
    }
  }, [expandedSnapshotId])

  // ---- School year oversight: state, lock, unlock, validation, retry ----
  const loadYearState = useCallback(async (schoolYear: string) => {
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      setYearState(null)
      return
    }
    setYearStateLoading(true)
    try {
      setYearState(await getSchoolYearState(schoolYear))
      setOversightError('')
    } catch (loadError) {
      setOversightError(loadError instanceof Error ? loadError.message : 'Failed to load school year status')
    } finally {
      setYearStateLoading(false)
    }
  }, [])

  // Reload the year's validation results whenever the state points at a run.
  const activeRunId = yearState?.activeValidationRunId
  useEffect(() => {
    if (!activeRunId || !/^\d{4}-\d{4}$/.test(fromSchoolYear)) return
    let cancelled = false
    void (async () => {
      try {
        const runs = await listValidationRuns(fromSchoolYear)
        if (!cancelled) {
          const latest = runs.find((run) => run._id === activeRunId) || null
          setValidationRunUi(latest)
          setWarningAck({})
        }
      } catch {
        // Historical list is best-effort; the state summary still shows.
      }
    })()
    return () => { cancelled = true }
  }, [activeRunId, fromSchoolYear])

  // Reload the year status whenever the closing school year input changes.
  useEffect(() => {
    const handle = setTimeout(() => { void loadYearState(fromSchoolYear) }, 450)
    return () => clearTimeout(handle)
  }, [fromSchoolYear, loadYearState])

  // ---- Lock: confirm dialog → persist locked state (never triggers rollover) ----
  const handleLock = async () => {
    if (!fromSchoolYear) return
    setOversightBusy(true)
    setOversightError('')
    try {
      setYearState(await lockSchoolYear(fromSchoolYear, { reason: lockReason || undefined }))
      setOversightNotice(`SY ${fromSchoolYear} is locked. Ordinary modifications to its records are now restricted — run pre-rollover validation to proceed.`)
      setShowLockConfirm(false)
      setLockReason('')
    } catch (lockError) {
      setOversightError(lockError instanceof Error ? lockError.message : 'Failed to lock school year')
    } finally {
      setOversightBusy(false)
    }
  }

  // ---- Unlock: reason required; never triggers rollover, never erases history ----
  const handleUnlock = async () => {
    if (!fromSchoolYear) return
    setOversightBusy(true)
    setOversightError('')
    try {
      setYearState(await unlockSchoolYear(fromSchoolYear, { reason: unlockReason }))
      setOversightNotice(`SY ${fromSchoolYear} is open for corrections. Previous validation results were retained but marked stale — lock the year again and re-run validation before rollover.`)
      setShowUnlockConfirm(false)
      setUnlockReason('')
    } catch (unlockError) {
      setOversightError(unlockError instanceof Error ? unlockError.message : 'Failed to unlock school year')
    } finally {
      setOversightBusy(false)
    }
  }

  // ---- Validate: run the mandatory pre-rollover checks ----
  const handleValidate = async () => {
    if (!fromSchoolYear || !toSchoolYear) return
    setOversightBusy(true)
    setOversightError('')
    try {
      const outcome = await runPreRolloverValidation(fromSchoolYear, { toSchoolYear, semester })
      setYearState(outcome.state)
      setValidationRunUi(outcome.run)
      setWarningAck({})
      if (outcome.run.status === 'failed') {
        setOversightNotice('')
        setOversightError(`Validation failed: ${outcome.run.summary.blockingErrors} blocking error(s) must be resolved before rollover. Unlock the year to fix the records, lock it again, and re-run validation.`)
      } else if (outcome.run.status === 'warnings') {
        setOversightNotice(`Validation passed with ${outcome.run.summary.warnings} warning(s). Each warning must be authorized with a written justification when you proceed to rollover.`)
      } else {
        setOversightNotice('Validation passed. The year is ready — proceed to rollover when the setup is confirmed.')
      }
    } catch (validateError) {
      setOversightError(validateError instanceof Error ? validateError.message : 'Failed to run pre-rollover validation')
    } finally {
      setOversightBusy(false)
    }
  }

  // ---- Retry after a failed execution (admin reconciliation verifies no partial data) ----
  const handleRetry = async () => {
    if (!fromSchoolYear) return
    setOversightBusy(true)
    setOversightError('')
    try {
      setYearState(await retryRollover(fromSchoolYear, { toSchoolYear, semester }))
      setOversightNotice('Recovery verified: no partial rollover data exists. The year is ready again — proceed to rollover unless records must be corrected first.')
    } catch (retryError) {
      setOversightError(retryError instanceof Error ? retryError.message : 'Failed to retry rollover')
    } finally {
      setOversightBusy(false)
    }
  }

  const acknowledgedWarningsReady = useMemo(() => {
    const warnings = validationRunUi?.results?.filter((r) => r.status === 'warning') ?? []
    return warnings.length === 0 || warnings.every((w) => (warningAck[w.key] || '').trim().length >= 10)
  }, [validationRunUi, warningAck])
  const loadSnapshots = async () => {
    try {
      const items = await listRolloverSnapshots()
      setSnapshots(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load archive snapshots')
    }
  }

  const loadBatches = async () => {
    setBatchesLoading(true)
    try {
      setRolloverBatches(await listRolloverBatches())
    } catch (loadError) {
      setExportFailure(loadError instanceof Error ? loadError.message : 'Failed to load rollover history')
    } finally {
      setBatchesLoading(false)
    }
  }

  useEffect(() => {
    if (showHistory) {
      void loadSnapshots()
      void loadBatches()
    }
  }, [showHistory])

  const handleExportSchoolYear = async (schoolYear: string) => {
    setExportingSchoolYear(schoolYear)
    setExportNotice('')
    setExportFailure('')
    try {
      const report = await getSchoolYearRolloverReport(schoolYear)
      if (report.students.length === 0) {
        setExportFailure(`No students were found for SY ${schoolYear}.`)
        return
      }

      const rows: (string | number)[][] = [ROLLOVER_EXPORT_HEADERS]
      let gradeCount = 0

      for (const student of report.students) {
        const base = [
          student.studentNumber,
          student.name,
          student.firstName,
          student.middleName,
          student.lastName,
          student.suffix,
          student.course ? courseShortLabel(student.course) : '',
          student.yearLevel ?? '',
          student.section,
          student.semester,
          student.schoolYear,
          student.studentStatus,
          student.lifecycleBefore,
          student.email,
          student.contactNumber,
          student.address,
          student.permanentAddress,
          student.gender,
          student.birthDate ? String(student.birthDate).slice(0, 10) : '',
          typeof student.latestGrade === 'number' ? formatGrade(student.latestGrade) : '',
        ]

        if (student.grades.length === 0) {
          rows.push([...base, '', '', '', '', '', '', '', ''])
          continue
        }

        for (const grade of student.grades) {
          gradeCount += 1
          rows.push([
            ...base,
            grade.subjectCode,
            grade.subjectTitle,
            grade.units ?? '',
            typeof grade.grade === 'number' ? formatGrade(grade.grade) : '',
            grade.gradeMark,
            grade.subjectStatus,
            grade.instructor,
            grade.semester,
          ])
        }
      }

      downloadCsv(`rollover-students-grades-${schoolYear}.csv`, rows)
      setExportNotice(
        `Exported ${report.students.length.toLocaleString()} student(s) and ${gradeCount.toLocaleString()} course grade(s) for SY ${schoolYear}.`
      )
    } catch (exportError) {
      setExportFailure(exportError instanceof Error ? exportError.message : 'Failed to export school year students')
    } finally {
      setExportingSchoolYear(null)
    }
  }

  const groupedBatches = useMemo(() => {
    const groups = new Map<string, RolloverBatchListItem[]>()
    for (const batch of rolloverBatches) {
      const key = batch.fromSchoolYear
      const list = groups.get(key) || []
      list.push(batch)
      groups.set(key, list)
    }
    return [...groups.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([schoolYear, batches]) => ({ schoolYear, batches }))
  }, [rolloverBatches])

  // ---- Step 1 -> Step 2: load summary ----
  const handlePreview = async () => {
    if (isSemesterRolloverInvalid) {
      setError('A semester rollover (same school year) must open 2nd or Summer. Set a different school year to promote year levels.')
      return
    }
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
          toSchoolYear,
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
    [fromSchoolYear, toSchoolYear, semester]
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
          toSchoolYear,
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
    [fromSchoolYear, toSchoolYear, semester]
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

  // ---- Execute (gated on the school year lock state machine) ----
  const executeDisabledReason = useMemo(() => {
    if (!yearState) return ''
    if (yearState.status === 'rollover_in_progress') return 'A rollover is already in progress for this school year.'
    if (yearState.status === 'rolled_over') return 'This school year has already been rolled over and cannot run a rollover again.'
    if (yearState.status === 'rollover_failed') return 'The previous rollover attempt failed. Use the recovery action before proceeding.'
    if (yearState.status === 'open') return 'Lock the school year and run pre-rollover validation before executing the rollover.'
    if (yearState.status === 'locked') return 'Run pre-rollover validation on the locked year before executing the rollover.'
    if (!acknowledgedWarningsReady) return 'Authorize every validation warning with a written justification before executing.'
    return ''
  }, [yearState, acknowledgedWarningsReady])

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

      const acknowledged = Object.entries(warningAck)
        .filter(([key, justification]) => (justification || '').trim().length >= 10 && key)
        .map(([key, justification]) => ({ key, justification }))

      const data = await executeRollover({
        fromSchoolYear: summaryPreview.fromSchoolYear,
        toSchoolYear: summaryPreview.toSchoolYear,
        semester: summaryPreview.semester,
        groupDecisions,
        decisionOverrides: overrides.length > 0 ? overrides : undefined,
        acknowledgedWarnings: acknowledged.length > 0 ? acknowledged : undefined,
      })
      setResult(data)
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
      void loadYearState(data.fromSchoolYear)
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'Rollover failed. All changes were rolled back.')
      // Refresh the state machine — the year is now likely "rollover_failed".
      if (summaryPreview) void loadYearState(summaryPreview.fromSchoolYear)
    } finally {
      setExecuting(false)
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
          {closingActiveSemester === '1st' ? (
            <>
              <h2>Close Semester</h2>
              <p>
                The school year is still in its 1st semester, so only the semester is advanced — students move to
                the 2nd semester without changing year level. Year levels move when the school year itself is
                closed after the 2nd semester. The entire rollover runs in a single transaction.
              </p>
            </>
          ) : (
            <>
              <h2>Close School Year</h2>
              <p>
                Historical enrollments are locked as immutable records; promoted and retained students receive new
                enrollments for the incoming school year. The entire rollover runs in a single transaction.
              </p>
            </>
          )}
        </div>
        <div className="rollover-page__header-actions">
          {fromSchoolYear ? (
            <button
              type="button"
              className="rollover-page__primary-button"
              onClick={() => setShowLockConfirm(true)}
              disabled={oversightBusy || yearStateLoading || (!!yearState && yearState.status !== 'open')}
            >
              <Lock size={16} /> Lock School Year
            </button>
          ) : null}
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

      {fromSchoolYear ? (
        <SchoolYearOversight
          yearState={yearState}
          oversightBusy={oversightBusy}
          oversightError={oversightError}
          oversightNotice={oversightNotice}
          validationRun={validationRunUi}
          warningAck={warningAck}
          setWarningAck={setWarningAck}
          acknowledgedWarningsReady={acknowledgedWarningsReady}

          onOpenUnlock={() => setShowUnlockConfirm(true)}
          oversightSchoolYear={fromSchoolYear || activeTerm?.schoolYear || ''}
          onValidate={() => void handleValidate()}
          onRetry={() => void handleRetry()}
        />
      ) : null}

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
              {latestBatch.fromSchoolYear === latestBatch.toSchoolYear ? (
                <h3>Semester rollover — SY {latestBatch.fromSchoolYear} ({latestBatch.semester} semester)</h3>
              ) : (
                <h3>
                  SY {latestBatch.fromSchoolYear} <ArrowRight size={16} /> SY {latestBatch.toSchoolYear}
                </h3>
              )}
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

          <footer className="rollover-page__status-actions">
            <button
              type="button"
              className="rollover-page__ghost-button"
              onClick={() => void handleExportSchoolYear(latestBatch.fromSchoolYear)}
              disabled={exportingSchoolYear !== null}
            >
              {exportingSchoolYear === latestBatch.fromSchoolYear
                ? <RefreshCw size={16} className="rollover-page__spin" />
                : <Download size={16} />}
              Export SY {latestBatch.fromSchoolYear} students &amp; grades
            </button>
            <span className="rollover-page__hint">
              {latestBatch.status === 'applied'
                ? 'This rollover is complete and its source year is immutable historical data. A genuine error is corrected through the audited admin recovery procedure, not through an ordinary revert.'
                : 'This rollover was reversed through the audited admin recovery procedure. The rollover archive remains immutable.'}
            </span>
          </footer>
        </section>
      ) : null}

      {exportNotice ? (
        <div className="rollover-page__success" role="status">
          <CheckCircle2 size={18} />
          <div><span>{exportNotice}</span></div>
        </div>
      ) : null}

      {exportFailure ? (
        <div className="rollover-page__error" role="alert">
          <AlertCircle size={20} />
          <span>{exportFailure}</span>
        </div>
      ) : null}

      {showHistory ? (
        <section className="rollover-page__panel">
          <h3><History size={16} /> Rollover history</h3>
          <p className="rollover-page__hint">
            Every executed rollover, grouped by school year. Export downloads that school year's students with
            their course grades (one row per course), ready for reporting and verification.
          </p>
          {batchesLoading ? (
            <div className="rollover-page__empty">
              <RefreshCw size={16} className="rollover-page__spin" /> Loading rollover history...
            </div>
          ) : rolloverBatches.length === 0 ? (
            <div className="rollover-page__empty">No rollovers have been executed yet.</div>
          ) : (
            <div className="rollover-page__school-years">
              {groupedBatches.map((group) => (
                <div key={group.schoolYear} className="rollover-page__school-year">
                  <header className="rollover-page__school-year-header">
                    <div>
                      <strong>School Year {group.schoolYear}</strong>
                      <span className="rollover-page__batch-meta">
                        {group.batches.length} rollover{group.batches.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rollover-page__snapshot-toggle"
                      onClick={() => void handleExportSchoolYear(group.schoolYear)}
                      disabled={exportingSchoolYear !== null}
                    >
                      {exportingSchoolYear === group.schoolYear
                        ? <RefreshCw size={14} className="rollover-page__spin" />
                        : <Download size={14} />}
                      {exportingSchoolYear === group.schoolYear
                        ? 'Exporting...'
                        : 'Export students & grades'}
                    </button>
                  </header>
                  <div className="rollover-page__snapshot-list">
                    {group.batches.map((batch) => (
                      <div key={batch.batchId} className="rollover-page__snapshot-row rollover-page__batch-row">
                        <span
                          className={[
                            'rollover-page__status-badge',
                            batch.status === 'applied'
                              ? 'rollover-page__status-badge--ok'
                              : 'rollover-page__status-badge--warn',
                          ].join(' ')}
                        >
                          {batch.status === 'applied' ? 'Applied' : 'Reverted'}
                        </span>
                        <span className="rollover-page__snapshot-title">
                          {batch.fromSchoolYear === batch.toSchoolYear
                            ? `SY ${batch.fromSchoolYear} · ${batch.semester} semester`
                            : `SY ${batch.fromSchoolYear} to SY ${batch.toSchoolYear}`}
                          <span className="rollover-page__batch-meta">
                            {' '}· {batch.counts?.promoted ?? 0} promoted · {batch.counts?.retained ?? 0} retained ·{' '}
                            {batch.counts?.graduated ?? 0} graduated · {batch.counts?.skipped ?? 0} skipped
                          </span>
                        </span>
                        <span className="rollover-page__snapshot-date">
                          {formatDateTime(batch.executedAt)}
                          {batch.executedBy?.displayName || batch.executedBy?.username
                            ? ` · ${batch.executedBy.displayName || batch.executedBy.username}`
                            : ''}
                        </span>
                        <span className="rollover-page__batch-term">{batch.semester} semester</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
              {snapshots.map((snapshot) => {
                const isGraduationReport = snapshot.type === 'GRADUATION_REPORT'
                const isExpanded = expandedSnapshotId === snapshot._id
                const graduates = snapshotDetail?._id === snapshot._id ? snapshotDetail?.data?.graduates ?? [] : []
                const graduateGroups = snapshotDetail?._id === snapshot._id ? snapshotDetail?.data?.groupedByCourseBlock ?? [] : []
                return (
                  <div key={snapshot._id} className="rollover-page__snapshot-row">
                    <span className="rollover-page__snapshot-type">{snapshot.type.replace(/_/g, ' ')}</span>
                    <span className="rollover-page__snapshot-title">{snapshot.title}</span>
                    <span className="rollover-page__snapshot-date">{new Date(snapshot.generatedAt).toLocaleString()}</span>
                    {isGraduationReport ? (
                      <button
                        type="button"
                        className="rollover-page__snapshot-toggle"
                        onClick={() => void toggleSnapshotDetail(snapshot)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isExpanded ? 'Hide graduates' : 'View graduates'}
                      </button>
                    ) : null}
                    {isExpanded && isGraduationReport ? (
                      <div className="rollover-page__snapshot-detail">
                        {snapshotDetailLoading ? (
                          <div className="rollover-page__empty">Loading graduates…</div>
                        ) : snapshotDetailError ? (
                          <div className="rollover-page__hint">{snapshotDetailError}</div>
                        ) : graduateGroups.length === 0 ? (
                          <div className="rollover-page__empty">No graduates in this rollover.</div>
                        ) : (
                          <>
                            <header className="rollover-page__graduates-header">
                              <span className="rollover-page__eyebrow">Graduate roster</span>
                              <span className="rollover-page__hint">
                                {graduates.length} graduate{graduates.length === 1 ? '' : 's'} · the list is immutable and was generated during the rollover
                              </span>
                            </header>
                            <div className="rollover-page__graduate-groups">
                              {graduateGroups.map((group) => (
                                <section key={group.label} className="rollover-page__graduate-group">
                                  <header className="rollover-page__graduate-group-header">
                                    <h4 className="rollover-page__graduate-group-label">
                                      <GraduationCap size={14} />
                                      {group.label}
                                    </h4>
                                    <span className="rollover-page__graduate-group-count">{group.count}</span>
                                  </header>
                                  <ul className="rollover-page__graduate-list">
                                    {group.students.map((student) => (
                                      <li key={student.studentId} className="rollover-page__graduate-item">
                                        <span className="rollover-page__graduate-number">{student.studentNumber}</span>
                                        <span className="rollover-page__graduate-name">{student.name}</span>
                                        <span className="rollover-page__graduate-grade">
                                          Grade: {typeof student.latestGrade === 'number' ? formatGrade(student.latestGrade) : '—'}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
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
                  const closing = event.target.value
                  setFromSchoolYear(closing)
                  // Derive the correct close type from the active term when
                  // the typed closing year is the one we're actually in.
                  if (activeTerm && activeTerm.schoolYear === closing) {
                    if (activeTerm.semester === '1st') {
                      setToSchoolYear(closing) // close the semester, not the year
                      setSemester('2nd')
                    } else {
                      setToSchoolYear(nextSchoolYear(closing)) // close the year
                      setSemester('1st')
                    }
                  } else {
                    setToSchoolYear(nextSchoolYear(closing))
                    setSemester('1st')
                  }
                }}
                placeholder="2025-2026"
                pattern="\d{4}-\d{4}"
              />
            </label>
            <label>
              <span>{isSemesterRollover ? 'Opening school year (same as closing)' : 'New school year'}</span>
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
          {isSemesterRollover ? (
            semester === '1st' ? (
              <p className="rollover-page__warning" role="note">
                Semester rollover (same school year) must open 2nd or Summer. Set a different school year to
                promote year levels instead.
              </p>
            ) : (
              <p className="rollover-page__hint" role="note">
                Semester rollover — students advance to the {semester} semester of SY {fromSchoolYear} without
                changing year level. Year levels only move when the school year itself changes.
              </p>
            )
          ) : null}
          <footer className="rollover-page__actions">
            <button
              type="button"
              className="rollover-page__primary-button"
              onClick={handlePreview}
              disabled={loading || isSemesterRolloverInvalid || !/^\d{4}-\d{4}$/.test(fromSchoolYear) || !/^\d{4}-\d{4}$/.test(toSchoolYear)}
              title={isSemesterRolloverInvalid ? 'A semester rollover must open 2nd or Summer' : undefined}
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
                          <th>Program</th>
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
                placeholder="Search by program, year level, or section..."
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
                    <th>Program</th>
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
            {isSemesterRollover ? (
              <p>
                You are about to run a <strong>semester rollover</strong>: all students advance to the{' '}
                <strong>{summaryPreview.semester} semester of SY {summaryPreview.toSchoolYear}</strong> without
                changing year level.
              </p>
            ) : (
              <p>
                You are about to close <strong>SY {summaryPreview.fromSchoolYear}</strong> and open{' '}
                <strong>SY {summaryPreview.toSchoolYear} ({summaryPreview.semester} semester)</strong>.
              </p>
            )}
            <ul>
              <li><Users size={14} /> {totalApprovedStudents.toLocaleString()} student{totalApprovedStudents === 1 ? '' : 's'} across {approvedGroups.size} approved group{approvedGroups.size === 1 ? '' : 's'}.</li>
              <li><Check size={14} /> {decisionCounts.promote.toLocaleString()} will {isSemesterRollover ? 'advance to the opening semester (year level unchanged)' : 'be promoted'}.</li>
              <li><RefreshCw size={14} /> {decisionCounts.retain.toLocaleString()} will {isSemesterRollover ? 'stay in the current semester' : 'be retained'}.</li>
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
              <li>
                <ShieldCheck size={14} /> Validation outcome:{' '}
                {yearState?.status === 'rollover_ready' ? (
                  <strong className="rollover-page__status-badge rollover-page__status-badge--ok">
                    Passed ({yearState.validationSummary?.warnings ?? 0} authorized warning(s))
                  </strong>
                ) : (
                  <strong style={{ color: 'var(--danger, #b91c1c)' }}>{executeDisabledReason || 'Pre-rollover validation has not passed yet.'}</strong>
                )}
              </li>
            </ul>
            <p className="rollover-page__warning">
              Closed enrollments become permanent, read-only historical records. This operation runs in a single
              transaction — if anything fails, all changes are rolled back automatically.
            </p>
          </div>
          <footer className="rollover-page__actions">
            <button type="button" className="rollover-page__ghost-button" onClick={() => setStep(2)} disabled={executing}>Back</button>
            {!acknowledgedWarningsReady && yearState?.status === 'rollover_ready' ? (
              <button type="button" className="rollover-page__ghost-button" onClick={() => setShowWarningAck(true)}>
                <AlertTriangle size={16} /> Authorize warnings
              </button>
            ) : null}
            <button
              type="button"
              className="rollover-page__primary-button rollover-page__primary-button--danger"
              onClick={handleExecute}
              disabled={executing || Boolean(executeDisabledReason)}
              title={executeDisabledReason || undefined}
            >
              {executing ? <RefreshCw size={16} className="rollover-page__spin" /> : <Check size={16} />}
              {executing ? 'Executing rollover...' : isSemesterRollover
                ? `Advance to the ${summaryPreview.semester} semester`
                : `Close SY ${summaryPreview.fromSchoolYear}`}
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
              {result.fromSchoolYear === result.toSchoolYear ? (
                <p>The {result.semester} semester of SY {result.toSchoolYear} is now open. Students advanced to the new semester without changing year level.</p>
              ) : (
                <p>SY {result.fromSchoolYear} is now closed. SY {result.toSchoolYear} is the active school year.</p>
              )}
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
            <button
              type="button"
              className="rollover-page__ghost-button"
              onClick={() => void handleExportSchoolYear(result.fromSchoolYear)}
              disabled={exportingSchoolYear !== null}
            >
              {exportingSchoolYear === result.fromSchoolYear
                ? <RefreshCw size={16} className="rollover-page__spin" />
                : <Download size={16} />}
              Export SY {result.fromSchoolYear} students &amp; grades
            </button>
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

      {showLockConfirm ? (
        <div
          className="rollover-page__modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !oversightBusy) setShowLockConfirm(false)
          }}
        >
          <div className="rollover-page__modal" role="dialog" aria-modal="true" aria-labelledby="lock-year-title">
            <div className="rollover-page__modal-header">
              <div>
                <span className="rollover-page__eyebrow">Confirm action</span>
                <h3 id="lock-year-title">Lock school year {fromSchoolYear}?</h3>
              </div>
              <button
                type="button"
                className="rollover-page__ghost-button"
                onClick={() => setShowLockConfirm(false)}
                disabled={oversightBusy}
                aria-label="Close lock confirmation"
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Locking <strong>SY {fromSchoolYear}</strong> restricts ordinary modifications to its records — grades,
              enrollments, subject assignments, block assignments, and professor loads become read-only.
            </p>
            <p className="rollover-page__hint">
              Locking never runs the rollover. After locking you can run pre-rollover validation; if corrections are
              needed later you can unlock the year (with a reason) and lock it again.
            </p>
            <label>
              <span>Reason (optional, recorded in the audit log)</span>
              <input
                value={lockReason}
                onChange={(event) => setLockReason(event.target.value)}
                placeholder="e.g. Closed 2nd semester, preparing rollover"
              />
            </label>
            {oversightError ? (
              <div className="rollover-page__error" role="alert"><AlertCircle size={18} /><span>{oversightError}</span></div>
            ) : null}
            <footer className="rollover-page__modal-actions">
              <button type="button" className="rollover-page__ghost-button" onClick={() => setShowLockConfirm(false)} disabled={oversightBusy}>
                Cancel
              </button>
              <button type="button" className="rollover-page__primary-button" onClick={() => void handleLock()} disabled={oversightBusy}>
                {oversightBusy ? <RefreshCw size={16} className="rollover-page__spin" /> : <Lock size={16} />}
                {oversightBusy ? 'Locking...' : 'Lock school year'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {showUnlockConfirm ? (
        <div
          className="rollover-page__modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !oversightBusy) setShowUnlockConfirm(false)
          }}
        >
          <div className="rollover-page__modal" role="dialog" aria-modal="true" aria-labelledby="unlock-year-title">
            <div className="rollover-page__modal-header">
              <div>
                <span className="rollover-page__eyebrow">Confirm action</span>
                <h3 id="unlock-year-title">Unlock school year {fromSchoolYear}?</h3>
              </div>
              <button
                type="button"
                className="rollover-page__ghost-button"
                onClick={() => setShowUnlockConfirm(false)}
                disabled={oversightBusy}
                aria-label="Close unlock confirmation"
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Unlocking returns <strong>SY {fromSchoolYear}</strong> to open so authorized corrections can be made.
            </p>
            <ul className="rollover-page__modal-list">
              <li>Grades, enrollments, and audit history are preserved — nothing is deleted.</li>
              <li>This does NOT trigger the rollover.</li>
              <li>Previous validation results are kept but marked stale — you must lock again and re-run validation before the rollover.</li>
            </ul>
            <label>
              <span>Reason (required, recorded in the audit log)</span>
              <input
                value={unlockReason}
                onChange={(event) => setUnlockReason(event.target.value)}
                placeholder="e.g. Correcting a trailing grade before rollover"
              />
            </label>
            {oversightError ? (
              <div className="rollover-page__error" role="alert"><AlertCircle size={18} /><span>{oversightError}</span></div>
            ) : null}
            <footer className="rollover-page__modal-actions">
              <button type="button" className="rollover-page__ghost-button" onClick={() => setShowUnlockConfirm(false)} disabled={oversightBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="rollover-page__primary-button"
                onClick={() => void handleUnlock()}
                disabled={oversightBusy || unlockReason.trim().length < 5}
                title={unlockReason.trim().length < 5 ? 'A reason of at least 5 characters is required' : undefined}
              >
                {oversightBusy ? <RefreshCw size={16} className="rollover-page__spin" /> : <LockOpen size={16} />}
                {oversightBusy ? 'Unlocking...' : 'Unlock school year'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {showWarningAck && validationRunUi ? (
        <div
          className="rollover-page__modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowWarningAck(false)
          }}
        >
          <div className="rollover-page__modal" role="dialog" aria-modal="true" aria-labelledby="warn-ack-title">
            <div className="rollover-page__modal-header">
              <div>
                <span className="rollover-page__eyebrow">Authorized exceptions</span>
                <h3 id="warn-ack-title">Authorize validation warnings</h3>
              </div>
              <button
                type="button"
                className="rollover-page__ghost-button"
                onClick={() => setShowWarningAck(false)}
                aria-label="Close warning authorization"
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Each warning below requires a written justification (at least 10 characters) from a registrar authorized
              to accept the risk. Justifications are recorded in the audit log alongside the rollover execution.
            </p>
            <ul className="rollover-page__modal-list">
              {validationRunUi.results.filter((r) => r.status === 'warning').map((warning) => (
                <li key={warning.key} style={{ listStyle: 'none', marginBottom: '0.75rem' }}>
                  <strong><AlertTriangle size={13} /> {warning.title}</strong>
                  <p className="rollover-page__hint">{warning.message}</p>
                  <label>
                    <span>Justification</span>
                    <input
                      value={warningAck[warning.key] || ''}
                      onChange={(event) => setWarningAck((current) => ({ ...current, [warning.key]: event.target.value }))}
                      placeholder="Why is it acceptable to proceed with this warning?"
                    />
                  </label>
                </li>
              ))}
            </ul>
            <footer className="rollover-page__modal-actions">
              <button type="button" className="rollover-page__ghost-button" onClick={() => setShowWarningAck(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rollover-page__primary-button"
                onClick={() => setShowWarningAck(false)}
                disabled={!acknowledgedWarningsReady}
                title={acknowledgedWarningsReady ? undefined : 'Every warning needs a justification of at least 10 characters'}
              >
                <ShieldCheck size={16} /> Save justifications
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---- SchoolYearOversight: the Lock → Validate → Confirm workflow panel ----
function SchoolYearOversight({
  yearState,
  oversightBusy,
  oversightError,
  oversightNotice,
  validationRun,
  warningAck,
  setWarningAck,
  acknowledgedWarningsReady,
          oversightSchoolYear,
  onOpenUnlock,
  onValidate,
  onRetry,
}: {
  yearState: SchoolYearState | null
  oversightBusy: boolean
  oversightError: string
  oversightNotice: string
  validationRun: ValidationRun | null
  warningAck: Record<string, string>
  setWarningAck: (update: Record<string, string>) => void
  acknowledgedWarningsReady: boolean
  oversightSchoolYear: string
  onOpenUnlock: () => void
  onValidate: () => void
  onRetry: () => void
}) {
  const status = yearState?.status || 'open'
  const STATUS_LABEL: Record<string, string> = {
    open: 'Open — ordinary operations permitted',
    locked: 'Locked — read-only, ordinary modifications restricted',
    rollover_ready: 'Rollover ready — locked and validated',
    rollover_in_progress: 'Rollover in progress',
    rollover_failed: 'Rollover failed — recovery required',
    rolled_over: 'Rolled over — immutable historical data',
  }
  const blocking = validationRun?.results?.filter((result) => result.status === 'blocking') ?? []
  const warnings = validationRun?.results?.filter((result) => result.status === 'warning') ?? []
  const passedCount = validationRun?.results?.filter((result) => result.status === 'passed').length ?? 0

  return (
    <section className="rollover-page__panel rollover-page__lock-panel">
      <div className="rollover-page__status-header">
        <div>
          <span className="rollover-page__eyebrow">School year status</span>
          <h3>
            <Lock size={16} /> SY {yearState?.schoolYear || oversightSchoolYear || '—'}
          </h3>
          <p className="rollover-page__hint">{STATUS_LABEL[status] || status}</p>
          {yearState?.lockedAt && status !== 'open' ? (
            <p className="rollover-page__hint">
              Locked {new Date(yearState.lockedAt).toLocaleString()}
              {yearState.lockReason ? ` · ${yearState.lockReason}` : ''}
            </p>
          ) : null}
          {yearState?.rolloverStartedAt && status === 'rollover_in_progress' ? (
            <p className="rollover-page__hint">
              Started {new Date(yearState.rolloverStartedAt).toLocaleString()} → SY {yearState.rolloverToSchoolYear} ({yearState.rolloverSemester} semester). Ordinary unlock is disabled while the rollover executes.
            </p>
          ) : null}
          {yearState?.rolloverError && status === 'rollover_failed' ? (
            <div className="rollover-page__error" role="alert">
              <AlertCircle size={18} />
              <span>
                <strong>Failure ({yearState.rolloverError.stage || 'unknown stage'}):</strong> {yearState.rolloverError.message}
              </span>
            </div>
          ) : null}
        </div>
        <span
          className={[
            'rollover-page__status-badge',
            status === 'open' ? '' : '',
            status === 'rollover_ready' || status === 'rolled_over' ? 'rollover-page__status-badge--ok' : '',
            status === 'locked' ? 'rollover-page__status-badge--warn' : '',
            status === 'rollover_failed' ? 'rollover-page__status-badge--fail' : '',
          ].filter(Boolean).join(' ')}
        >
          {status.replace(/_/g, ' ')}
        </span>
      </div>

      {oversightNotice ? (
        <div className="rollover-page__success" role="status">
          <CheckCircle2 size={18} />
          <div><span>{oversightNotice}</span></div>
        </div>
      ) : null}
      {oversightError ? (
        <div className="rollover-page__error" role="alert">
          <AlertCircle size={20} />
          <span>{oversightError}</span>
        </div>
      ) : null}

      {/* Validation summary (blocking / warnings / passed) */}
      {validationRun ? (
        <div className="rollover-page__validation-summary">
          <header>
            <ShieldCheck size={14} />
            <strong>Pre-rollover validation</strong>
            <span className="rollover-page__batch-meta">
              run {new Date(validationRun.runAt || Date.now()).toLocaleString()} · {validationRun.summary.blockingErrors} blocking ·{' '}
              {validationRun.summary.warnings} warning(s) · {validationRun.summary.passedChecks} passed
            </span>
          </header>
          <ul>
            {blocking.map((result) => <ValidationResultRow key={result.key} result={result} />)}
            {warnings.map((result) => (
              <ValidationResultRow key={result.key} result={result} justification={warningAck[result.key] || ''} onJustify={(value) => setWarningAck({ ...warningAck, [result.key]: value })} />
            ))}
          </ul>
          {passedCount > 0 || blocking.length === 0 ? (
            <p className="rollover-page__hint">{passedCount} check(s) passed with no action required.</p>
          ) : null}
        </div>
      ) : null}

      {/* Context-sensitive actions per state */}
      <footer className="rollover-page__status-actions">
        {status === 'open' ? (
          <span className="rollover-page__hint">
            <Lock size={14} /> Use “Lock School Year” beside the Back button above to start the workflow — ordinary modifications remain permitted until then.
          </span>
        ) : null
        }

        {status === 'locked' || status === 'rollover_ready' ? (
          <>
            <button type="button" className="rollover-page__primary-button" onClick={onValidate} disabled={oversightBusy}>
              {oversightBusy ? <RefreshCw size={16} className="rollover-page__spin" /> : <ShieldCheck size={16} />}
              Run Pre-Rollover Validation
            </button>
            <button type="button" className="rollover-page__ghost-button" onClick={onOpenUnlock} disabled={oversightBusy}>
              <LockOpen size={16} /> Unlock School Year
            </button>
          </>
        ) : null}

        {status === 'rollover_failed' ? (
          <>
            <button type="button" className="rollover-page__primary-button" onClick={onRetry} disabled={oversightBusy}>
              {oversightBusy ? <RefreshCw size={16} className="rollover-page__spin" /> : <RefreshCw size={16} />}
              Retry Rollover (verify recovery first)
            </button>
            <button type="button" className="rollover-page__ghost-button" onClick={onOpenUnlock} disabled={oversightBusy}>
              <LockOpen size={16} /> Unlock for Corrections (admin)
            </button>
          </>
        ) : null}

        {status === 'rollover_in_progress' ? (
          <span className="rollover-page__hint">
            <RefreshCw size={14} className="rollover-page__spin" /> The rollover is executing inside a single transaction. Unlock and re-execution are blocked until it completes.
          </span>
        ) : null}

        {status === 'rolled_over' ? (
          <span className="rollover-page__hint">
            <CheckCircle2 size={14} /> Rollover batch {yearState?.rolloverBatchId || ''} completed and verified. Ordinary unlock is not available; a genuine error is corrected through the audited admin recovery procedure.
          </span>
        ) : null}

        {(status === 'locked' || status === 'rollover_ready') && !acknowledgedWarningsReady ? (
          <span className="rollover-page__hint">{warnings.length} warning(s) awaiting a written justification.</span>
        ) : null}
      </footer>
    </section>
  )
}

function ValidationResultRow({
  result,
  justification,
  onJustify,
}: {
  result: ValidationRunResult
  justification?: string
  onJustify?: (value: string) => void
}) {
  const isBlocking = result.status === 'blocking'
  const isWarning = result.status === 'warning'
  return (
    <li className={isBlocking ? 'rollover-page__validation-block' : isWarning ? 'rollover-page__validation-warn' : ''}>
      <div>
        <strong>
          {isBlocking ? <AlertCircle size={13} /> : isWarning ? <AlertTriangle size={13} /> : <Check size={13} />}
          {' '}{result.title}
        </strong>
        <span className="rollover-page__hint"> {result.message}</span>
      </div>
      {result.actionable ? <p className="rollover-page__hint">→ {result.actionable}</p> : null}
      {result.details.length > 0 ? (
        <details className="rollover-page__validation-details">
          <summary>{result.details.length} detail(s)</summary>
          <ul>{result.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
        </details>
      ) : null}
      {isWarning && onJustify ? (
        <label>
          <span>Justification (required to proceed)</span>
          <input
            value={justification || ''}
            onChange={(event) => onJustify(event.target.value)}
            placeholder="Written justification recorded in the audit log"
          />
        </label>
      ) : null}
    </li>
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

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Calendar,
  ShieldCheck,
  BookOpen,
  UserCheck,
  AlertCircle,
  LogOut,
  ArrowLeft,
  ChevronRight,
  RefreshCw,
  ClipboardCheck,
  GraduationCap,
  FileText,
  Menu,
  X,
  Check,
  Info,
  SlidersHorizontal
} from 'lucide-react'
import {
  EVALUATION_QUESTIONS,
  EMOJI_RATING_SCALE,
  getStoredStudentToken,
  getStoredStudentInfo,
  clearStoredStudentToken,
  studentPortalLogin,
  fetchStudentEvaluations,
  fetchStudentGradesWithLocks,
  submitStudentProfessorEvaluation,
  type StudentEvaluationsResponse,
  type StudentSubjectEvaluationItem
} from '../../lib/evaluationApi'
import './StudentEvaluationPortal.css'

type StudentEvaluationPortalProps = {
  onBackToLogin?: () => void
}

type GradeSubjectRow = {
  subjectId?: string | null
  subjectCode?: string
  code?: string
  subjectTitle?: string
  title?: string
  units: number
  grade: number | null
  gradeMark?: string | null
  status: string
  remarks: string
  instructor: string
  professorName: string
  sectionCode?: string
  gradePublished?: boolean
  submissionStatus?: string
  evaluationRequired: boolean
  evaluationCompleted: boolean
  completedAt?: string | null
  canEvaluate?: boolean
  gradeLocked: boolean
  lockReason: string | null
}

type GradeTermRecord = {
  isCurrent?: boolean
  schoolYear: string
  semester: string
  yearLevel?: number
  termGpa: number | null
  gradesLocked: boolean
  subjects: GradeSubjectRow[]
}

type PortalNavTab = 'grades' | 'evaluations' | 'policy'

export default function StudentEvaluationPortal({ onBackToLogin }: StudentEvaluationPortalProps) {
  const [studentToken, setStudentToken] = useState<string | null>(() => getStoredStudentToken())
  const [studentInfo, setStudentInfo] = useState<{
    id?: string
    studentNumber: string
    fullName: string
    course?: string
    yearLevel?: number
    semester?: string
    schoolYear?: string
  } | null>(() => getStoredStudentInfo())

  // Navigation & mobile sidebar
  const [activeNav, setActiveNav] = useState<PortalNavTab>('grades')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Login form state
  const [studentNumberInput, setStudentNumberInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Data state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [evalPayload, setEvalPayload] = useState<StudentEvaluationsResponse | null>(null)
  const [gradeRecords, setGradeRecords] = useState<GradeTermRecord[]>([])
  const [selectedTermKey, setSelectedTermKey] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'In Progress' | 'Completed' | 'Closed'>('ALL')

  // Dedicated Evaluation Page / Status Modal State
  const [activeSubject, setActiveSubject] = useState<StudentSubjectEvaluationItem | null>(null)
  const [viewingStatusSubject, setViewingStatusSubject] = useState<StudentSubjectEvaluationItem | null>(null)
  const [draftRatingsBySubject, setDraftRatingsBySubject] = useState<Record<string, Record<number, number>>>({})
  const [ratings, setRatings] = useState<Record<number, number>>({})
  const [comment, setComment] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    subjectCode: string
    subjectTitle: string
    professorName: string
    averageRating: number
    allCompleted: boolean
    remainingCount: number
    submittedAt: string
  } | null>(null)

  const loadStudentPortalData = useCallback(
    async (termFilter?: { schoolYear?: string; semester?: string }) => {
      const token = studentToken || getStoredStudentToken()
      if (!token) return
      setLoading(true)
      setError('')
      try {
        const [evaluationsRes, gradesRes] = await Promise.all([
          fetchStudentEvaluations(token, termFilter),
          fetchStudentGradesWithLocks(token)
        ])
        setEvalPayload(evaluationsRes)
        const resolvedPeriods: GradeTermRecord[] = Array.isArray(gradesRes?.periods)
          ? gradesRes.periods
          : Array.isArray(gradesRes?.records)
            ? gradesRes.records
            : []
        setGradeRecords(resolvedPeriods)

        if (!termFilter && evaluationsRes?.schoolYear && evaluationsRes?.semester) {
          setSelectedTermKey(`${evaluationsRes.schoolYear}::${evaluationsRes.semester}`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load academic records.'
        if (
          message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('authentication') ||
          message.toLowerCase().includes('unauthorized')
        ) {
          clearStoredStudentToken()
          setStudentToken(null)
          setStudentInfo(null)
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
      }
    },
    [studentToken]
  )

  useEffect(() => {
    if (studentToken) {
      void loadStudentPortalData()
    }
  }, [studentToken, loadStudentPortalData])

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentNumberInput.trim() || !passwordInput) {
      setLoginError('Please enter your Student Number and Password.')
      return
    }
    setLoginLoading(true)
    setLoginError('')
    try {
      const data = await studentPortalLogin(studentNumberInput.trim(), passwordInput)
      setStudentToken(data.token)
      setStudentInfo({
        ...data.student,
        course: data.student?.course != null ? String(data.student.course) : undefined
      })
      setPasswordInput('')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid student credentials.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleStudentLogout = () => {
    clearStoredStudentToken()
    setStudentToken(null)
    setStudentInfo(null)
    setEvalPayload(null)
    setGradeRecords([])
    setActiveSubject(null)
    setViewingStatusSubject(null)
    setSubmissionSuccess(null)
  }

  const handleTermChange = (termKey: string) => {
    setSelectedTermKey(termKey)
    const [schoolYear, semester] = termKey.split('::')
    if (schoolYear && semester) {
      void loadStudentPortalData({ schoolYear, semester })
    }
  }

  const currentGradeRecord = useMemo(() => {
    if (!evalPayload?.schoolYear || !evalPayload?.semester) return gradeRecords[0] || null
    return (
      gradeRecords.find(
        (r) => r.schoolYear === evalPayload.schoolYear && r.semester === evalPayload.semester
      ) || null
    )
  }, [gradeRecords, evalPayload])

  const availableTerms = useMemo(() => {
    return gradeRecords.map((r) => ({
      schoolYear: r.schoolYear,
      semester: r.semester,
      yearLevel: r.yearLevel || 1
    }))
  }, [gradeRecords])

  const mergedSubjects = useMemo(() => {
    const evalSubjects = evalPayload?.subjects || []
    const gradeSubjects = currentGradeRecord?.subjects || []

    return evalSubjects.map((evalSub: StudentSubjectEvaluationItem) => {
      const matchingGrade = gradeSubjects.find(
        (g: GradeSubjectRow) =>
          String(g.subjectCode || g.code || '').toUpperCase() === evalSub.subjectCode.toUpperCase()
      )
      return {
        ...evalSub,
        grade: matchingGrade && matchingGrade.grade !== 0 ? matchingGrade.grade : evalSub.grade,
        gradeMark: matchingGrade ? matchingGrade.gradeMark ?? null : evalSub.gradeMark,
        remarks: matchingGrade ? matchingGrade.remarks : evalSub.remarks,
        gradeLocked: matchingGrade ? matchingGrade.gradeLocked : evalSub.gradeLocked,
        lockReason: matchingGrade ? matchingGrade.lockReason : evalSub.lockReason
      }
    })
  }, [evalPayload, currentGradeRecord])

  const getSubjectEvaluationBadgeStatus = useCallback(
    (subject: StudentSubjectEvaluationItem): 'Completed' | 'Closed' | 'In Progress' | 'Pending' => {
      if (subject.evaluationCompleted) return 'Completed'
      if (evalPayload?.period && !evalPayload.period.isOpen) return 'Closed'
      const savedDraft = draftRatingsBySubject[subject.subjectCode]
      if (savedDraft && Object.keys(savedDraft).length > 0) return 'In Progress'
      return 'Pending'
    },
    [evalPayload?.period, draftRatingsBySubject]
  )

  const filteredSubjects = useMemo(() => {
    if (statusFilter === 'ALL') return mergedSubjects
    return mergedSubjects.filter((s) => getSubjectEvaluationBadgeStatus(s) === statusFilter)
  }, [mergedSubjects, statusFilter, getSubjectEvaluationBadgeStatus])

  const openEvaluationForm = (subject: StudentSubjectEvaluationItem) => {
    const existingDraft = draftRatingsBySubject[subject.subjectCode] || {}
    setActiveSubject(subject)
    setViewingStatusSubject(null)
    setRatings(existingDraft)
    setComment('')
    setAttemptedSubmit(false)
    setSubmitError('')
    setSubmissionSuccess(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeEvaluationForm = () => {
    if (submitting) return
    if (activeSubject && !submissionSuccess && Object.keys(ratings).length > 0) {
      setDraftRatingsBySubject((prev) => ({
        ...prev,
        [activeSubject.subjectCode]: ratings
      }))
    }
    setActiveSubject(null)
    setSubmissionSuccess(null)
    setAttemptedSubmit(false)
    setSubmitError('')
  }

  const handleSelectRating = (questionNumber: number, ratingValue: number) => {
    setRatings((prev) => {
      const next = { ...prev, [questionNumber]: ratingValue }
      if (activeSubject) {
        setDraftRatingsBySubject((drafts) => ({
          ...drafts,
          [activeSubject.subjectCode]: next
        }))
      }
      return next
    })
    setSubmitError('')
  }

  const handleRatingKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    questionNumber: number,
    currentRatingValue: number
  ) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      handleSelectRating(questionNumber, Math.min(5, currentRatingValue + 1))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      handleSelectRating(questionNumber, Math.max(1, currentRatingValue - 1))
    } else if (/^[1-5]$/.test(event.key)) {
      event.preventDefault()
      handleSelectRating(questionNumber, Number(event.key))
    }
  }

  const answeredCount = Object.keys(ratings).length
  const totalQuestions = EVALUATION_QUESTIONS.length
  const formCompletionPercent = Math.round((answeredCount / totalQuestions) * 100)
  const allQuestionsAnswered = answeredCount === totalQuestions

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSubject || !evalPayload || !studentToken) return

    setAttemptedSubmit(true)
    if (!allQuestionsAnswered) {
      const missingCount = totalQuestions - answeredCount
      setSubmitError(
        `Please complete all required rating questions (${missingCount} question${missingCount === 1 ? '' : 's'} remaining).`
      )
      return
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      const orderedRatings = EVALUATION_QUESTIONS.map((q) => ratings[q.number])

      const response = await submitStudentProfessorEvaluation(studentToken, {
        schoolYear: evalPayload.schoolYear,
        semester: evalPayload.semester,
        subjectId: activeSubject.subjectId || undefined,
        subjectCode: activeSubject.subjectCode,
        ratings: orderedRatings,
        comment: comment.trim()
      })

      setDraftRatingsBySubject((prev) => {
        const next = { ...prev }
        delete next[activeSubject.subjectCode]
        return next
      })

      setSubmissionSuccess({
        subjectCode: activeSubject.subjectCode,
        subjectTitle: activeSubject.subjectTitle,
        professorName: activeSubject.professorName,
        averageRating: response.data.averageRating,
        allCompleted: response.data.summary.allCompleted,
        remainingCount: response.data.summary.pendingCount,
        submittedAt: response.data.submittedAt
      })

      await loadStudentPortalData({
        schoolYear: evalPayload.schoolYear,
        semester: evalPayload.semester
      })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit evaluation.')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDeadlineDate = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return 'No deadline configured'
    try {
      const parsed = new Date(`${dateStr}T${timeStr || '23:59'}:00`)
      if (Number.isNaN(parsed.getTime())) return `${dateStr} ${timeStr || ''}`
      return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return `${dateStr} ${timeStr || ''}`
    }
  }

  // Unauthenticated Student Sign-In Screen
  if (!studentToken) {
    return (
      <div className="sep-login-page">
        <div className="sep-login-card">
          {onBackToLogin && (
            <button type="button" className="sep-back-btn" onClick={onBackToLogin}>
              <ArrowLeft size={15} />
              <span>Return to Main Portal</span>
            </button>
          )}

          <div className="sep-login-header">
            <div className="sep-login-badge">
              <GraduationCap size={24} />
            </div>
            <h1>Academic Grades &amp; Faculty Evaluation</h1>
            <p>
              Sign in with your West Coast College Student Number to complete required faculty evaluations and view official semester grades.
            </p>
          </div>

          <form className="sep-login-form" onSubmit={handleStudentLogin}>
            {loginError && (
              <div className="sep-alert sep-alert-error" role="alert">
                <AlertCircle size={17} />
                <span>{loginError}</span>
              </div>
            )}

            <label className="sep-field">
              <span>Student Number</span>
              <input
                type="text"
                value={studentNumberInput}
                onChange={(e) => setStudentNumberInput(e.target.value)}
                placeholder="Enter your student number"
                autoComplete="username"
                required
              />
            </label>

            <label className="sep-field">
              <span>Password</span>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" className="sep-primary-btn sep-full-btn" disabled={loginLoading}>
              {loginLoading ? 'Authenticating...' : 'Sign In to Student Portal'}
            </button>
          </form>

          <div className="sep-anonymity-callout">
            <ShieldCheck size={18} className="sep-shield-icon" />
            <div>
              <strong>Institutional Confidentiality Notice</strong>
              <p>
                Student names and student numbers are never disclosed to professors. Completion records are separated from evaluation responses, and any authorized Registrar review is recorded in a permanent audit log.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const summary = evalPayload?.summary || {
    requiredCount: 0,
    completedCount: 0,
    pendingCount: 0,
    allCompleted: false,
    gradesLocked: true
  }
  const period = evalPayload?.period
  const overallProgressPercent =
    summary.requiredCount > 0
      ? Math.round((summary.completedCount / summary.requiredCount) * 100)
      : 100

  return (
    <div className="sep-layout">
      {/* Desktop & Mobile Sidebar Navigation */}
      <aside className={`sep-sidebar ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Student portal navigation">
        <div className="sep-sidebar-brand">
          <div className="sep-brand-icon">
            <GraduationCap size={20} />
          </div>
          <div className="sep-brand-text">
            <span className="sep-brand-title">West Coast College</span>
            <span className="sep-brand-subtitle">Student Information System</span>
          </div>
          <button
            type="button"
            className="sep-mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sep-sidebar-student">
          <div className="sep-student-avatar">
            {(studentInfo?.fullName || 'S').charAt(0).toUpperCase()}
          </div>
          <div className="sep-student-details">
            <strong>{studentInfo?.fullName || 'Enrolled Student'}</strong>
            <span>{studentInfo?.studentNumber}</span>
          </div>
        </div>

        <nav className="sep-sidebar-nav">
          <div className="sep-nav-section-label">Academic Portal</div>
          <button
            type="button"
            className={`sep-nav-item ${activeNav === 'grades' && !activeSubject ? 'is-active' : ''}`}
            onClick={() => {
              setActiveSubject(null)
              setActiveNav('grades')
              setMobileMenuOpen(false)
            }}
          >
            <FileText size={17} />
            <span>Grades &amp; Evaluation</span>
          </button>

          <button
            type="button"
            className={`sep-nav-item ${activeNav === 'evaluations' || Boolean(activeSubject) ? 'is-active' : ''}`}
            onClick={() => {
              setActiveNav('evaluations')
              setMobileMenuOpen(false)
            }}
          >
            <ClipboardCheck size={17} />
            <span>Evaluation Checklist</span>
            {summary.pendingCount > 0 && (
              <span className="sep-nav-counter">{summary.pendingCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`sep-nav-item ${activeNav === 'policy' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveSubject(null)
              setActiveNav('policy')
              setMobileMenuOpen(false)
            }}
          >
            <ShieldCheck size={17} />
            <span>Anonymity &amp; Policy</span>
          </button>
        </nav>

        <div className="sep-sidebar-footer">
          {onBackToLogin && (
            <button type="button" className="sep-sidebar-util-btn" onClick={onBackToLogin}>
              <ArrowLeft size={15} />
              <span>Main Login Portal</span>
            </button>
          )}
          <button type="button" className="sep-sidebar-logout-btn" onClick={handleStudentLogout}>
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="sep-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <div className="sep-content-area">
        {/* Top Utility Bar */}
        <header className="sep-topbar">
          <div className="sep-topbar-left">
            <button
              type="button"
              className="sep-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="sep-page-heading">
                {activeSubject
                  ? 'Faculty Teaching Evaluation Form'
                  : activeNav === 'policy'
                    ? 'Evaluation Anonymity & Institutional Policy'
                    : 'Student Grades & Professor Evaluation'}
              </h1>
              <p className="sep-page-subheading">
                {evalPayload?.semester && evalPayload?.schoolYear
                  ? `${evalPayload.semester} Semester • Academic Year ${evalPayload.schoolYear}`
                  : 'Official Academic Record'}
              </p>
            </div>
          </div>

          <div className="sep-topbar-actions">
            {availableTerms.length > 0 && !activeSubject && (
              <div className="sep-term-control">
                <label htmlFor="sep-term-select" className="sr-only">Academic Term</label>
                <select
                  id="sep-term-select"
                  value={selectedTermKey}
                  onChange={(e) => handleTermChange(e.target.value)}
                >
                  {availableTerms.map((t) => {
                    const key = `${t.schoolYear}::${t.semester}`
                    return (
                      <option key={key} value={key}>
                        {t.semester} Sem • SY {t.schoolYear}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            <button
              type="button"
              className="sep-secondary-btn"
              onClick={() => {
                const [schoolYear, semester] = selectedTermKey.split('::')
                void loadStudentPortalData(schoolYear && semester ? { schoolYear, semester } : undefined)
              }}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'sep-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <main className="sep-main">
          {error && (
            <div className="sep-alert sep-alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Dedicated Professional Evaluation Form Page */}
          {activeSubject ? (
            <section className="sep-evaluation-page" aria-label="Professor evaluation form">
              <div className="sep-eval-page-bar">
                <button
                  type="button"
                  className="sep-back-link"
                  onClick={closeEvaluationForm}
                  disabled={submitting}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Enrolled Subjects &amp; Grades</span>
                </button>
                <span className="sep-eval-term-tag">
                  {evalPayload?.semester} Semester • SY {evalPayload?.schoolYear}
                </span>
              </div>

              {submissionSuccess ? (
                /* Professional Submission Confirmation View */
                <div className="sep-confirmation-card">
                  <div className="sep-confirmation-icon" aria-hidden="true">
                    <Check size={30} strokeWidth={2.5} />
                  </div>
                  <h2>Evaluation Submitted Successfully</h2>
                  <p className="sep-confirmation-lead">
                    Your evaluation for <strong>{submissionSuccess.professorName}</strong> in{' '}
                    <strong>
                      {submissionSuccess.subjectCode} — {submissionSuccess.subjectTitle}
                    </strong>{' '}
                    has been recorded.
                  </p>

                  <div className="sep-confirmation-grid">
                    <div className="sep-confirmation-metric">
                      <span>Submitted Rating Average</span>
                      <strong>{submissionSuccess.averageRating.toFixed(2)} / 5.00</strong>
                    </div>
                    <div className="sep-confirmation-metric">
                      <span>Evaluation Requirement Status</span>
                      <strong>
                        {submissionSuccess.allCompleted
                          ? 'All Required Evaluations Completed'
                          : `${submissionSuccess.remainingCount} Required Evaluation${
                              submissionSuccess.remainingCount === 1 ? '' : 's'
                            } Remaining`}
                      </strong>
                    </div>
                  </div>

                  <div className="sep-confirmation-notice">
                    <ShieldCheck size={17} />
                    <span>
                      Your evaluation response has been stored anonymously. Grade visibility follows official Registrar grade-release rules once all evaluations are complete.
                    </span>
                  </div>

                  <div className="sep-confirmation-actions">
                    <button
                      type="button"
                      className="sep-primary-btn"
                      onClick={closeEvaluationForm}
                    >
                      Return to Grades Page
                    </button>
                  </div>
                </div>
              ) : (
                <form className="sep-eval-form-container" onSubmit={handleSubmitEvaluation} noValidate>
                  {/* Subject & Professor Context Card */}
                  <div className="sep-eval-subject-banner">
                    <div className="sep-eval-subject-info">
                      <span className="sep-code-pill">{activeSubject.subjectCode}</span>
                      <h2>{activeSubject.subjectTitle}</h2>
                      <div className="sep-eval-prof-meta">
                        <span>
                          <UserCheck size={15} />
                          Professor: <strong>{activeSubject.professorName}</strong>
                        </span>
                        <span>
                          <BookOpen size={15} />
                          Units: <strong>{activeSubject.units}</strong>
                        </span>
                        {period?.deadlineDate && (
                          <span>
                            <Calendar size={15} />
                            Deadline: <strong>{formatDeadlineDate(period.deadlineDate, period.closingTime)}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="sep-eval-progress-box">
                      <div className="sep-eval-progress-header">
                        <span className="sep-eval-progress-text">
                          {answeredCount} of {totalQuestions} questions completed
                        </span>
                        <span className="sep-eval-progress-pct">{formCompletionPercent}%</span>
                      </div>
                      <div
                        className="sep-progress-track"
                        role="progressbar"
                        aria-valuenow={formCompletionPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`sep-progress-fill ${allQuestionsAnswered ? 'is-complete' : ''}`}
                          style={{ width: `${formCompletionPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rating Scale Reference Bar */}
                  <div className="sep-scale-reference" aria-label="Five-point rating scale reference">
                    <span className="sep-scale-reference-title">Rating Scale:</span>
                    <div className="sep-scale-reference-items">
                      {EMOJI_RATING_SCALE.map((item) => (
                        <div key={item.score} className="sep-scale-ref-chip">
                          <span className="sep-scale-ref-emoji" aria-hidden="true">{item.emoji}</span>
                          <span>
                            <strong>{item.score}</strong> — {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {submitError && (
                    <div className="sep-alert sep-alert-error" role="alert">
                      <AlertCircle size={17} />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* 10 Required Evaluation Questions */}
                  <div className="sep-questions-stack">
                    {EVALUATION_QUESTIONS.map((q) => {
                      const selectedRating = ratings[q.number]
                      const hasValidationError = attemptedSubmit && !selectedRating

                      return (
                        <div
                          key={q.number}
                          className={`sep-question-item ${selectedRating ? 'is-completed' : ''} ${
                            hasValidationError ? 'has-error' : ''
                          }`}
                        >
                          <div className="sep-question-top">
                            <div className="sep-question-title-group">
                              <span className="sep-question-index">Question {q.number}</span>
                              <p className="sep-question-statement">
                                {q.text} <span className="sep-required-mark" aria-hidden="true">*</span>
                              </p>
                            </div>
                            {selectedRating && (
                              <span className="sep-question-recorded-badge">
                                <CheckCircle2 size={14} />
                                <span>
                                  {selectedRating} —{' '}
                                  {EMOJI_RATING_SCALE.find((s) => s.score === selectedRating)?.label}
                                </span>
                              </span>
                            )}
                          </div>

                          <div
                            className="sep-rating-options"
                            role="radiogroup"
                            aria-label={`Question ${q.number}: ${q.text}`}
                          >
                            {EMOJI_RATING_SCALE.map((option) => {
                              const isSelected = selectedRating === option.score
                              return (
                                <button
                                  key={option.score}
                                  type="button"
                                  role="radio"
                                  aria-checked={isSelected}
                                  aria-label={`${option.score} - ${option.label}`}
                                  className={`sep-rating-control ${isSelected ? 'is-selected' : ''}`}
                                  onClick={() => handleSelectRating(q.number, option.score)}
                                  onKeyDown={(e) => handleRatingKeyDown(e, q.number, option.score)}
                                >
                                  <span className="sep-rating-emoji" aria-hidden="true">
                                    {option.emoji}
                                  </span>
                                  <span className="sep-rating-num">{option.score}</span>
                                  <span className="sep-rating-label">{option.label}</span>
                                </button>
                              )
                            })}
                          </div>

                          {hasValidationError && (
                            <p className="sep-field-error" role="alert">
                              <AlertCircle size={14} />
                              <span>Please select a rating for Question {q.number}.</span>
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Optional Comments Field */}
                  <div className="sep-comments-card">
                    <div className="sep-comments-header">
                      <label htmlFor="sep-eval-comment">
                        Additional Comments &amp; Suggestions <span>(Optional)</span>
                      </label>
                      <span className="sep-char-count">{comment.length} / 1500</span>
                    </div>
                    <textarea
                      id="sep-eval-comment"
                      rows={4}
                      maxLength={1500}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Provide constructive feedback regarding course delivery, instructional materials, or classroom management..."
                    />
                  </div>

                  {/* Confidentiality Notice & Form Actions */}
                  <div className="sep-form-footer-bar">
                    <div className="sep-form-confidentiality">
                      <ShieldCheck size={17} />
                      <span>
                        Responses are submitted anonymously. Professors cannot view student names or student numbers.
                      </span>
                    </div>

                    <div className="sep-form-buttons">
                      <button
                        type="button"
                        className="sep-secondary-btn"
                        onClick={closeEvaluationForm}
                        disabled={submitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="sep-primary-btn"
                        disabled={submitting}
                      >
                        {submitting
                          ? 'Submitting Evaluation...'
                          : `Submit Evaluation (${answeredCount}/${totalQuestions})`}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </section>
          ) : activeNav === 'policy' ? (
            /* Institutional Policy & Anonymity View */
            <section className="sep-policy-card">
              <div className="sep-policy-header">
                <ShieldCheck size={24} className="sep-policy-icon" />
                <div>
                  <h2>Faculty Evaluation Anonymity &amp; Grade Access Policy</h2>
                  <p>Institutional standards governing student feedback and academic grade visibility.</p>
                </div>
              </div>
              <div className="sep-policy-grid">
                <div className="sep-policy-block">
                  <h3>1. Separation of Completion and Rating Data</h3>
                  <p>
                    When you submit an evaluation, your 10-question ratings and written comments are stored in an anonymized evaluation response record that contains no student name, student number, or account identifier. A separate completion record marks that you fulfilled the requirement for your enrolled subject.
                  </p>
                </div>
                <div className="sep-policy-block">
                  <h3>2. Professor Dashboard Restrictions</h3>
                  <p>
                    Professors only have access to aggregated rating averages, rating distributions across the 10 questions, and anonymized comments for their assigned classes. Professors have no interface or permission to reveal student identities.
                  </p>
                </div>
                <div className="sep-policy-block">
                  <h3>3. Controlled Registrar Audit Trail</h3>
                  <p>
                    Student identities remain masked by default in the Registrar dashboard. If an authorized Registrar must verify a record for an official administrative investigation, the system requires a documented reason and logs the Registrar's identity, timestamp, and reason in an immutable audit log.
                  </p>
                </div>
                <div className="sep-policy-block">
                  <h3>4. Grade Visibility Requirements</h3>
                  <p>
                    Official semester grades unlock automatically once all required professor evaluations for the term are completed and the Registrar has officially published the term grades.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            /* Student Grades & Evaluation Overview */
            <>
              {/* Summary KPI Strip */}
              <section className="sep-kpi-grid" aria-label="Academic and evaluation summary">
                <div className="sep-kpi-card">
                  <div className="sep-kpi-icon-wrap">
                    <ClipboardCheck size={20} />
                  </div>
                  <div className="sep-kpi-body">
                    <span className="sep-kpi-label">Evaluation Progress</span>
                    <strong className="sep-kpi-value">
                      {summary.completedCount} of {summary.requiredCount} Completed
                    </strong>
                    <div className="sep-progress-track sep-progress-track-sm">
                      <div
                        className={`sep-progress-fill ${summary.allCompleted ? 'is-complete' : ''}`}
                        style={{ width: `${overallProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="sep-kpi-card">
                  <div className="sep-kpi-icon-wrap">
                    <Calendar size={20} />
                  </div>
                  <div className="sep-kpi-body">
                    <span className="sep-kpi-label">Registrar Deadline</span>
                    <strong className="sep-kpi-value">
                      {formatDeadlineDate(period?.deadlineDate, period?.closingTime)}
                    </strong>
                    <span className="sep-kpi-sub">
                      Period Status:{' '}
                      <strong className={`sep-inline-status status-${period?.status || 'open'}`}>
                        {period?.status ? period.status.toUpperCase() : 'OPEN'}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="sep-kpi-card">
                  <div className="sep-kpi-icon-wrap">
                    {summary.allCompleted ? <Unlock size={20} /> : <Lock size={20} />}
                  </div>
                  <div className="sep-kpi-body">
                    <span className="sep-kpi-label">Grade Visibility Status</span>
                    <strong className="sep-kpi-value">
                      {summary.allCompleted ? 'Grades Unlocked' : 'Grades Locked'}
                    </strong>
                    <span className="sep-kpi-sub">
                      {summary.allCompleted
                        ? currentGradeRecord?.termGpa != null
                          ? `Term GPA: ${currentGradeRecord.termGpa.toFixed(2)}`
                          : 'Subject to official Registrar release'
                        : `${summary.pendingCount} required evaluation${summary.pendingCount === 1 ? '' : 's'} pending`}
                    </span>
                  </div>
                </div>
              </section>

              {/* Required Lock Notice Banner when evaluations are incomplete */}
              {!summary.allCompleted && (
                <div className="sep-lock-banner" role="status">
                  <div className="sep-lock-banner-icon">
                    <Lock size={18} />
                  </div>
                  <div className="sep-lock-banner-content">
                    <strong>Complete the required professor evaluations to access your grades.</strong>
                    <span>
                      You have completed {summary.completedCount} of {summary.requiredCount} required evaluations for this term. Grade access unlocks automatically once all evaluations are submitted and grades are officially released.
                    </span>
                  </div>
                </div>
              )}

              {/* Enrolled Subjects & Grades Table / Responsive Cards */}
              <section className="sep-table-card" aria-label="Enrolled subjects and grades">
                <div className="sep-table-card-header">
                  <div>
                    <h2>Enrolled Subjects &amp; Faculty Evaluations</h2>
                    <p>Select &ldquo;Evaluate Professor&rdquo; beside each subject to complete your required term evaluations.</p>
                  </div>

                  <div className="sep-filter-row">
                    <SlidersHorizontal size={15} className="sep-filter-icon" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      aria-label="Filter subjects by evaluation status"
                    >
                      <option value="ALL">All Statuses ({mergedSubjects.length})</option>
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div className="sep-skeleton-list" aria-busy="true" aria-label="Loading subjects">
                    {[1, 2, 3, 4].map((row) => (
                      <div key={row} className="sep-skeleton-row" />
                    ))}
                  </div>
                ) : filteredSubjects.length === 0 ? (
                  <div className="sep-empty-box">
                    <BookOpen size={30} />
                    <h3>No Enrolled Subjects Found</h3>
                    <p>No subjects match the selected academic term or status filter.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Structured Table */}
                    <div className="sep-table-wrapper">
                      <table className="sep-table">
                        <thead>
                          <tr>
                            <th>Subject Code &amp; Name</th>
                            <th>Professor</th>
                            <th>Units</th>
                            <th>Evaluation Status</th>
                            <th>Grade Visibility</th>
                            <th>Final Grade</th>
                            <th className="text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSubjects.map((subject) => {
                            const evalStatus = getSubjectEvaluationBadgeStatus(subject)
                            const isGradeLocked = subject.gradeLocked || !summary.allCompleted
                            const hasOfficialGrade =
                              !isGradeLocked &&
                              subject.gradePublished &&
                              ((subject.grade !== null && subject.grade !== undefined && subject.grade > 0) ||
                                Boolean(subject.gradeMark))

                            return (
                              <tr key={subject.subjectCode}>
                                <td>
                                  <div className="sep-cell-subject">
                                    <span className="sep-code-badge">{subject.subjectCode}</span>
                                    <div>
                                      <strong className="sep-subject-name">{subject.subjectTitle}</strong>
                                      <span className="sep-subject-sched">{subject.schedule}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="sep-cell-prof">
                                    <UserCheck size={15} />
                                    <span>{subject.professorName || 'Assigned Faculty'}</span>
                                  </div>
                                </td>
                                <td>{subject.units}</td>
                                <td>
                                  <span
                                    className={`sep-status-badge badge-${evalStatus
                                      .toLowerCase()
                                      .replace(/\s+/g, '-')}`}
                                  >
                                    {evalStatus === 'Completed' && <CheckCircle2 size={13} />}
                                    {evalStatus === 'In Progress' && <Clock size={13} />}
                                    {evalStatus === 'Pending' && <Clock size={13} />}
                                    {evalStatus === 'Closed' && <Lock size={13} />}
                                    <span>{evalStatus}</span>
                                  </span>
                                </td>
                                <td>
                                  {isGradeLocked ? (
                                    <span className="sep-visibility-locked">
                                      <Lock size={14} />
                                      <span>Complete the required professor evaluations to access your grades.</span>
                                    </span>
                                  ) : subject.gradePublished ? (
                                    <span className="sep-visibility-unlocked">
                                      <Unlock size={14} />
                                      <span>Released ({subject.remarks || 'Official'})</span>
                                    </span>
                                  ) : (
                                    <span className="sep-visibility-pending">
                                      <Info size={14} />
                                      <span>Awaiting Official Grade Release</span>
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {isGradeLocked ? (
                                    <span className="sep-grade-cell-locked">
                                      <Lock size={14} />
                                      <span>Locked</span>
                                    </span>
                                  ) : hasOfficialGrade ? (
                                    <strong className="sep-grade-cell-value">
                                      {subject.grade !== null && subject.grade !== undefined && subject.grade > 0
                                        ? Number(subject.grade).toFixed(2)
                                        : subject.gradeMark}
                                    </strong>
                                  ) : (
                                    <span className="sep-grade-cell-na">—</span>
                                  )}
                                </td>
                                <td className="text-right">
                                  {evalStatus === 'Pending' || evalStatus === 'In Progress' ? (
                                    <button
                                      type="button"
                                      className="sep-action-btn is-primary"
                                      onClick={() => openEvaluationForm(subject)}
                                    >
                                      <span>Evaluate Professor</span>
                                      <ChevronRight size={15} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="sep-action-btn is-secondary"
                                      onClick={() => setViewingStatusSubject(subject)}
                                    >
                                      <span>View Evaluation Status</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Responsive Cards */}
                    <div className="sep-mobile-cards">
                      {filteredSubjects.map((subject) => {
                        const evalStatus = getSubjectEvaluationBadgeStatus(subject)
                        const isGradeLocked = subject.gradeLocked || !summary.allCompleted
                        const hasOfficialGrade =
                          !isGradeLocked &&
                          subject.gradePublished &&
                          ((subject.grade !== null && subject.grade !== undefined && subject.grade > 0) ||
                            Boolean(subject.gradeMark))

                        return (
                          <article key={subject.subjectCode} className="sep-mcard">
                            <div className="sep-mcard-top">
                              <span className="sep-code-badge">{subject.subjectCode}</span>
                              <span
                                className={`sep-status-badge badge-${evalStatus
                                  .toLowerCase()
                                  .replace(/\s+/g, '-')}`}
                              >
                                {evalStatus === 'Completed' && <CheckCircle2 size={13} />}
                                {(evalStatus === 'Pending' || evalStatus === 'In Progress') && <Clock size={13} />}
                                {evalStatus === 'Closed' && <Lock size={13} />}
                                <span>{evalStatus}</span>
                              </span>
                            </div>

                            <h3 className="sep-mcard-title">{subject.subjectTitle}</h3>
                            <p className="sep-mcard-prof">
                              <UserCheck size={14} />
                              <span>{subject.professorName || 'Assigned Faculty'}</span>
                            </p>

                            <div className="sep-mcard-grade-box">
                              <div>
                                <span className="sep-mcard-label">Final Grade</span>
                                {isGradeLocked ? (
                                  <strong className="sep-grade-cell-locked">
                                    <Lock size={14} /> Locked
                                  </strong>
                                ) : hasOfficialGrade ? (
                                  <strong className="sep-grade-cell-value">
                                    {subject.grade !== null && subject.grade !== undefined && subject.grade > 0
                                      ? Number(subject.grade).toFixed(2)
                                      : subject.gradeMark}
                                  </strong>
                                ) : (
                                  <span>Pending Release</span>
                                )}
                              </div>
                              <div>
                                <span className="sep-mcard-label">Grade Visibility</span>
                                <span className="sep-mcard-vis">
                                  {isGradeLocked
                                    ? 'Complete required evaluations to access grades'
                                    : subject.gradePublished
                                      ? `Released (${subject.remarks || 'Official'})`
                                      : 'Awaiting Registrar release'}
                                </span>
                              </div>
                            </div>

                            {evalStatus === 'Pending' || evalStatus === 'In Progress' ? (
                              <button
                                type="button"
                                className="sep-action-btn is-primary sep-full-btn"
                                onClick={() => openEvaluationForm(subject)}
                              >
                                <span>Evaluate Professor</span>
                                <ChevronRight size={15} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="sep-action-btn is-secondary sep-full-btn"
                                onClick={() => setViewingStatusSubject(subject)}
                              >
                                <span>View Evaluation Status</span>
                              </button>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {/* View Evaluation Status Modal */}
      {viewingStatusSubject && (
        <div
          className="sep-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sep-status-modal-title"
        >
          <div className="sep-status-modal">
            <div className="sep-status-modal-header">
              <div>
                <span className="sep-code-badge">{viewingStatusSubject.subjectCode}</span>
                <h3 id="sep-status-modal-title">{viewingStatusSubject.subjectTitle}</h3>
              </div>
              <button
                type="button"
                className="sep-modal-close-btn"
                onClick={() => setViewingStatusSubject(null)}
                aria-label="Close evaluation status dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sep-status-modal-body">
              <div className="sep-status-detail-row">
                <span>Assigned Professor</span>
                <strong>{viewingStatusSubject.professorName}</strong>
              </div>
              <div className="sep-status-detail-row">
                <span>Academic Term</span>
                <strong>
                  {evalPayload?.semester} Semester, SY {evalPayload?.schoolYear}
                </strong>
              </div>
              <div className="sep-status-detail-row">
                <span>Evaluation Status</span>
                <span
                  className={`sep-status-badge badge-${getSubjectEvaluationBadgeStatus(viewingStatusSubject)
                    .toLowerCase()
                    .replace(/\s+/g, '-')}`}
                >
                  {viewingStatusSubject.evaluationCompleted ? (
                    <>
                      <CheckCircle2 size={13} />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} />
                      <span>Closed</span>
                    </>
                  )}
                </span>
              </div>
              {viewingStatusSubject.completedAt && (
                <div className="sep-status-detail-row">
                  <span>Date Submitted</span>
                  <strong>{new Date(viewingStatusSubject.completedAt).toLocaleString()}</strong>
                </div>
              )}
              <div className="sep-status-detail-row">
                <span>Grade Visibility</span>
                <strong>
                  {!summary.allCompleted
                    ? 'Locked — Complete remaining professor evaluations'
                    : viewingStatusSubject.gradePublished
                      ? 'Unlocked & Officially Released'
                      : 'Evaluations Complete — Awaiting Official Registrar Grade Release'}
                </strong>
              </div>

              <div className="sep-status-modal-note">
                <ShieldCheck size={16} />
                <span>
                  Your individual rating responses are stored anonymously and separated from this completion record.
                </span>
              </div>
            </div>

            <div className="sep-status-modal-footer">
              <button
                type="button"
                className="sep-primary-btn"
                onClick={() => setViewingStatusSubject(null)}
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

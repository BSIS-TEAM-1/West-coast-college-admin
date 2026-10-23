import { useState, useEffect, useCallback } from 'react'
import { Check, X, RotateCcw, AlertCircle, FileText, Clock, ChevronDown, ChevronLeft } from 'lucide-react'
import {
  listGradeSubmissions,
  verifyGradeSubmission,
  publishGradeSubmission,
  returnGradeSubmission,
  revertGradeSubmissionToDraft,
  listGradeChangeRequests,
  reviewGradeChangeRequest,
  getClassGradeSubmissions,
  type GradeSubmissionSummary,
  type GradeSubmissionStatus,
  type GradeChangeRequest,
  type GradeChangeRequestStatus
} from '../../lib/gradingApi'
import { COURSE_OPTIONS } from '../../lib/blockAssignmentShared'
import { getAcademicTerm } from '../../lib/settingsApi'
import './GradeSubmissionReviewPage.css'

interface GradeSubmissionReviewPageProps {
  onBack?: () => void
}

type TabKey = 'pending' | 'verified' | 'published' | 'returned' | 'change-requests'

const STATUS_LABELS: Record<GradeSubmissionStatus, { label: string; color: string; bg: string }> = {
  Draft: { label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
  Submitted: { label: 'Submitted', color: '#b45309', bg: '#fef3c7' },
  Verified: { label: 'Verified', color: '#1d4ed8', bg: '#dbeafe' },
  Published: { label: 'Published', color: '#15803d', bg: '#dcfce7' },
  Returned: { label: 'Returned', color: '#b91c1c', bg: '#fee2e2' },
  Rejected: { label: 'Rejected', color: '#b91c1c', bg: '#fee2e2' }
}

const TABS: { key: TabKey; label: string; status?: GradeSubmissionStatus }[] = [
  { key: 'pending', label: 'Pending Verification', status: 'Submitted' },
  { key: 'verified', label: 'Verified', status: 'Verified' },
  { key: 'published', label: 'Published', status: 'Published' },
  { key: 'returned', label: 'Returned', status: 'Returned' },
  { key: 'change-requests', label: 'Change Requests' }
]

export default function GradeSubmissionReviewPage({ onBack }: GradeSubmissionReviewPageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [submissions, setSubmissions] = useState<GradeSubmissionSummary[]>([])
  const [changeRequests, setChangeRequests] = useState<GradeChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [schoolYearFilter, setSchoolYearFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [selected, setSelected] = useState<GradeSubmissionSummary | null>(null)
  const [classSubmissions, setClassSubmissions] = useState<GradeSubmissionSummary[]>([])
  const [loadingClass, setLoadingClass] = useState(false)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<null | 'approve'>(null)
  const [changeRequestFilter, setChangeRequestFilter] = useState<GradeChangeRequestStatus | ''>('Pending')
  const [reviewingChangeRequest, setReviewingChangeRequest] = useState<GradeChangeRequest | null>(null)
  const [changeRequestRemarks, setChangeRequestRemarks] = useState('')
  const [classViewContext, setClassViewContext] = useState<{ schoolYear: string; semester: string; course: string; yearLevel: number } | null>(null)

  // Default filters to the current academic term so legacy enrollments don't appear
  useEffect(() => {
    getAcademicTerm()
      .then((term) => {
        setSchoolYearFilter(term.schoolYear)
        setSemesterFilter(term.semester)
      })
      .catch(() => { /* leave filters empty = show all */ })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (activeTab === 'change-requests') {
        const result = await listGradeChangeRequests({
          status: changeRequestFilter || undefined,
          limit: 100
        })
        setChangeRequests(result.data)
      } else {
        const tab = TABS.find((t) => t.key === activeTab)
        const result = await listGradeSubmissions({
          status: tab?.status,
          schoolYear: schoolYearFilter || undefined,
          semester: semesterFilter || undefined,
          course: courseFilter || undefined,
          limit: 100
        })
        setSubmissions(result.data)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [activeTab, schoolYearFilter, semesterFilter, courseFilter, changeRequestFilter])

  useEffect(() => { load() }, [load])

  const handleView = async (submission: GradeSubmissionSummary) => {
    // Rows in the main table use a compound ID (enrollment + instructor). Resolve
    // the matching class row first so every review action receives the real
    // enrollment ID, then open the dialog with that row selected.
    setSelected(null)
    setReviewRemarks('')
    setConfirmAction(null)
    setLoadingClass(true)
    setError('')
    try {
      // Store class context for refreshing after actions
      setClassViewContext({
        schoolYear: submission.schoolYear,
        semester: submission.semester,
        course: String(submission.studentId?.course || submission.course),
        yearLevel: submission.studentId?.yearLevel || submission.yearLevel
      })
      // Fetch all students in the same class/section
      const classData = await getClassGradeSubmissions({
        schoolYear: submission.schoolYear,
        semester: submission.semester,
        course: String(submission.studentId?.course || submission.course),
        yearLevel: submission.studentId?.yearLevel || submission.yearLevel,
        status: undefined // Show all students regardless of status
      })
      setClassSubmissions(classData)
      setSelected(
        classData.find(
          (classSubmission) =>
            classSubmission.enrollmentId === submission.enrollmentId &&
            classSubmission.instructor === submission.instructor
        ) ?? null
      )
    } catch (e: any) {
      console.error('Error loading class submissions:', e)
      setError(e.message || 'Failed to load class submissions')
      setClassSubmissions([])
    } finally {
      setLoadingClass(false)
    }
  }

  const handleVerify = async () => {
    if (!selected) {
      setError('No student selected')
      return
    }
    if (!selected.enrollmentId) {
      setError('Missing enrollment ID for selected student')
      return
    }
    setActionLoading(true)
    setError('')
    try {
      await verifyGradeSubmission(selected.enrollmentId, reviewRemarks, selected.instructor)
      await load()
      // Refresh class submissions to show updated status
      if (classViewContext) {
        const classData = await getClassGradeSubmissions({
          schoolYear: classViewContext.schoolYear,
          semester: classViewContext.semester,
          course: classViewContext.course,
          yearLevel: classViewContext.yearLevel,
          status: undefined
        })
        setClassSubmissions(classData)
      }
      setSelected(null)
      setConfirmAction(null)
    } catch (e: any) {
      console.error('Verify error:', e)
      setError(e.message || 'Failed to verify grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!selected || !selected.enrollmentId) return
    setActionLoading(true)
    try {
      await publishGradeSubmission(selected.enrollmentId, reviewRemarks, selected.instructor)
      await load()
      // Refresh class submissions to show updated status
      if (classViewContext) {
        const classData = await getClassGradeSubmissions({
          schoolYear: classViewContext.schoolYear,
          semester: classViewContext.semester,
          course: classViewContext.course,
          yearLevel: classViewContext.yearLevel,
          status: undefined
        })
        setClassSubmissions(classData)
      }
      setSelected(null)
      setConfirmAction(null)
    } catch (e: any) {
      setError(e.message || 'Failed to publish grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!selected || !selected.enrollmentId) return
    if (!reviewRemarks.trim()) {
      setError('A reason is required when returning grades.')
      return
    }
    setActionLoading(true)
    try {
      await returnGradeSubmission(selected.enrollmentId, reviewRemarks, selected.instructor)
      await load()
      // Refresh class submissions to show updated status
      if (classViewContext) {
        const classData = await getClassGradeSubmissions({
          schoolYear: classViewContext.schoolYear,
          semester: classViewContext.semester,
          course: classViewContext.course,
          yearLevel: classViewContext.yearLevel,
          status: undefined
        })
        setClassSubmissions(classData)
      }
      setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to return grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handleTableReview = async (submission: GradeSubmissionSummary, action: 'approve' | 'reject') => {
    const status = submission.professorSubmissionStatus || submission.gradeSubmission?.status || 'Draft'
    if (!submission.enrollmentId || (status !== 'Submitted' && status !== 'Verified')) {
      setError('This grade submission is not available for review.')
      return
    }

    const isPublishing = status === 'Verified'
    let remarks = ''
    if (action === 'reject') {
      const reason = window.prompt('Reason for rejecting these grades:')
      if (reason === null) return
      remarks = reason.trim()
      if (!remarks) {
        setError('A reason is required when rejecting grades.')
        return
      }
    } else if (!window.confirm(`${isPublishing ? 'Publish' : 'Verify'} this grade submission?`)) {
      return
    }

    setActionLoading(true)
    setOpenActionMenuId(null)
    setError('')
    try {
      if (action === 'reject') {
        await returnGradeSubmission(submission.enrollmentId, remarks, submission.instructor)
      } else if (isPublishing) {
        await publishGradeSubmission(submission.enrollmentId, '', submission.instructor)
      } else {
        await verifyGradeSubmission(submission.enrollmentId, '', submission.instructor)
      }
      await load()
    } catch (e: any) {
      setError(e.message || `Failed to ${action === 'approve' ? 'approve' : 'reject'} grades`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReviewChangeRequest = async (action: 'approve' | 'reject') => {
    if (!reviewingChangeRequest) return
    if (action === 'reject' && !changeRequestRemarks.trim()) {
      setError('Remarks are required when rejecting a grade change request.')
      return
    }
    setActionLoading(true)
    try {
      await reviewGradeChangeRequest(reviewingChangeRequest._id, action, changeRequestRemarks)
      await load()
      setSuccess(action === 'approve' ? 'Grade change approved and applied.' : 'Grade change request rejected.')
      setReviewingChangeRequest(null)
      setChangeRequestRemarks('')
    } catch (e: any) {
      setError(e.message || 'Failed to review change request')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReopenReturned = async (submission: GradeSubmissionSummary) => {
    if (!submission.enrollmentId) return
    if (!window.confirm('Reopen this returned grade submission as a draft? The professor can then correct and resubmit it.')) return

    setActionLoading(true)
    setError('')
    try {
      await revertGradeSubmissionToDraft(submission.enrollmentId, submission.instructor)
      await load()
      setSelected(null)
      setSuccess('Returned grades reopened as a draft for the professor.')
    } catch (e: any) {
      setError(e.message || 'Failed to reopen returned grades')
    } finally {
      setActionLoading(false)
    }
  }

  const courseLabel = (course: string | number | undefined) => {
    const found = COURSE_OPTIONS.find(c => String(c.value) === String(course))
    return found?.label || String(course || 'N/A')
  }

  const formatDate = (d?: string | null) => {
    if (!d) return 'N/A'
    return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  }

  // Verification checklist for the detail view
  return (
    <div className="grade-submission-page">
      <header className="grade-submission-header">
        <h1>Grade Verification</h1>
        <p>Verify, return, and publish grade submissions from professors.</p>
        {onBack && (
          <button type="button" className="grade-submission-back-btn" onClick={onBack}>
            <ChevronLeft size={16} /> Back
          </button>
        )}
      </header>

      {error && <div className="grade-submission-error"><AlertCircle size={16} /> {error} <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button></div>}
      {success && <div className="grade-submission-info-box" style={{ background: '#dcfce7', color: '#15803d', marginBottom: '1rem' }}><Check size={16} /> {success} <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={14} /></button></div>}

      {/* Tab Navigation */}
      <div className="gs-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`gs-tab ${activeTab === tab.key ? 'gs-tab--active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setSelected(null) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters (hidden for change-requests tab which has its own filter) */}
      {activeTab !== 'change-requests' && (
        <div className="grade-submission-filters">
          <div className="form-group">
            <label>School Year</label>
            <input type="text" value={schoolYearFilter} onChange={e => setSchoolYearFilter(e.target.value)} placeholder="e.g. 2026-2027" />
          </div>
          <div className="form-group">
            <label>Semester</label>
            <select value={semesterFilter} onChange={e => setSemesterFilter(e.target.value)}>
              <option value="">All</option>
              <option value="1st">1st</option>
              <option value="2nd">2nd</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
          <div className="form-group">
            <label>Course</label>
            <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
              <option value="">All</option>
              {COURSE_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Change Requests filter */}
      {activeTab === 'change-requests' && (
        <div className="grade-submission-filters">
          <div className="form-group">
            <label>Status</label>
            <select value={changeRequestFilter} onChange={e => setChangeRequestFilter(e.target.value as GradeChangeRequestStatus | '')}>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grade-submission-loading">Loading...</div>
      ) : activeTab === 'change-requests' ? (
        changeRequests.length === 0 ? (
          <div className="grade-submission-empty">No grade change requests found.</div>
        ) : (
          <div className="grade-submission-list">
            <table className="grade-submission-table">
              <thead>
                <tr>
                  <th>Student No.</th>
                  <th>Subject</th>
                  <th>Current</th>
                  <th>Requested</th>
                  <th>Reason</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {changeRequests.map((cr) => (
                  <tr key={cr._id}>
                    <td><strong>{cr.studentNumber}</strong></td>
                    <td>{cr.subjectCode}</td>
                    <td style={{ fontWeight: 600 }}>{cr.currentGrade.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>{cr.requestedGrade.toFixed(2)}</td>
                    <td style={{ fontSize: '0.8125rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.reason}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{typeof cr.requestedBy === 'object' ? cr.requestedBy.displayName || cr.requestedBy.username : '—'}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{formatDate(cr.requestedAt)}</td>
                    <td>
                      <span className="status-badge" style={{
                        color: cr.status === 'Approved' ? '#15803d' : cr.status === 'Rejected' ? '#b91c1c' : '#b45309',
                        background: cr.status === 'Approved' ? '#dcfce7' : cr.status === 'Rejected' ? '#fee2e2' : '#fef3c7'
                      }}>{cr.status}</span>
                    </td>
                    <td>
                      {cr.status === 'Pending' && (
                        <button type="button" className="gs-action-btn" title="Review request" onClick={() => { setReviewingChangeRequest(cr); setChangeRequestRemarks('') }}>
                          <FileText size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : submissions.length === 0 ? (
        <div className="grade-submission-empty">No grade submissions found matching the filters.</div>
      ) : (
        <>
          {/* Batch Action Bar */}
          {(activeTab === 'pending' || activeTab === 'verified') && submissions.length > 1 && (
            <div className="gs-batch-bar">
              <span className="gs-batch-info">
                {submissions.length} submission{submissions.length !== 1 ? 's' : ''} ready for {activeTab === 'pending' ? 'verification' : 'publication'}
              </span>
              <div className="gs-batch-actions">
                <button
                  type="button"
                  className="btn-primary"
                  style={activeTab === 'pending' ? { background: '#1d4ed8' } : { background: '#15803d' }}
                  onClick={async () => {
                    if (!confirm(`${activeTab === 'pending' ? 'Verify' : 'Publish'} all ${submissions.length} submissions?`)) return
                    setActionLoading(true)
                    let ok = 0
                    let fail = 0
                    for (const s of submissions) {
                      try {
                        if (activeTab === 'pending') {
                          await verifyGradeSubmission(s.enrollmentId || s._id, '', s.instructor)
                        } else {
                          await publishGradeSubmission(s.enrollmentId || s._id, '', s.instructor)
                        }
                        ok++
                      } catch {
                        fail++
                      }
                    }
                    setActionLoading(false)
                    await load()
                    if (fail > 0) {
                      setError(`${ok} succeeded, ${fail} failed. Check individual submissions for errors.`)
                    }
                  }}
                  disabled={actionLoading}
                >
                  <Check size={16} /> {actionLoading ? 'Processing...' : activeTab === 'pending' ? 'Verify All' : 'Publish All'}
                </button>
              </div>
            </div>
          )}
          <div className="grade-submission-list">
          <table className="grade-submission-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Professor</th>
                <th>Course</th>
                <th>Year</th>
                <th>Semester</th>
                <th>School Year</th>
                <th>Subjects with Grades</th>
                <th>Graded</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const profStatus = s.professorSubmissionStatus || s.gradeSubmission?.status || 'Draft'
                const status = STATUS_LABELS[profStatus]
                const activeSubjects = s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed') || []
                const subjectGrades = activeSubjects.map(sub => {
                  const grade = sub.grade !== null && sub.grade !== undefined ? sub.grade.toFixed(2) : sub.gradeMark || '—'
                  return `${sub.code}: ${grade}`
                }).join(', ') || '—'
                const graded = s.gradedCount ?? activeSubjects.filter(sub => sub.grade !== null && sub.grade !== undefined || sub.gradeMark).length ?? 0
                const total = s.totalCount ?? activeSubjects.length ?? 0
                return (
                  <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => void handleView(s)}>
                    <td>
                      <div className="gs-student-name">{s.studentId?.lastName}, {s.studentId?.firstName}</div>
                      <div className="gs-student-number">{s.studentId?.studentNumber}</div>
                    </td>
                    <td style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{s.instructor || 'Unassigned'}</td>
                    <td>{courseLabel(s.studentId?.course || s.course)}</td>
                    <td>{s.studentId?.yearLevel || s.yearLevel}</td>
                    <td>{s.semester}</td>
                    <td>{s.schoolYear}</td>
                    <td style={{ fontSize: '0.8125rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={subjectGrades}>{subjectGrades}</td>
                    <td>{graded}/{total}</td>
                    <td>
                      <span className="status-badge" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>{formatDate(s.submittedAt || s.gradeSubmission?.submittedAt)}</td>
                    <td>
                      <div className="gs-table-actions" onClick={(event) => event.stopPropagation()}>
                        {(profStatus === 'Submitted' || profStatus === 'Verified') && (
                          <div className="gs-action-dropdown">
                            <button
                              type="button"
                              className="btn-secondary gs-action-dropdown-trigger"
                              onClick={() => setOpenActionMenuId((current) => current === s._id ? null : s._id)}
                              disabled={actionLoading}
                              aria-expanded={openActionMenuId === s._id}
                            >
                              Actions <ChevronDown size={14} />
                            </button>
                            {openActionMenuId === s._id && (
                              <div className="gs-action-dropdown-menu" role="menu">
                                <button type="button" role="menuitem" className="gs-action-dropdown-item gs-action-dropdown-item--approve" onClick={() => void handleTableReview(s, 'approve')}>
                                  <Check size={14} /> Approve
                                </button>
                                <button type="button" role="menuitem" className="gs-action-dropdown-item gs-action-dropdown-item--reject" onClick={() => void handleTableReview(s, 'reject')}>
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {profStatus === 'Returned' && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => void handleReopenReturned(s)}
                            disabled={actionLoading}
                          >
                            <RotateCcw size={14} /> Reopen draft
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
        </>
      )}

      {/* Detail Modal */}
      {selected && (() => {
        const status = selected.professorSubmissionStatus || selected.gradeSubmission?.status || 'Draft'
        return (
          <div className="transmutation-modal-overlay" onClick={() => setSelected(null)}>
            <div className="transmutation-modal" style={{ maxWidth: '60rem' }} onClick={e => e.stopPropagation()}>
              <div className="transmutation-modal-header">
                <div>
                  <h2>Grade Submission Review</h2>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted, #6b7280)' }}>
                    {selected.studentId?.lastName}, {selected.studentId?.firstName} ({selected.studentId?.studentNumber})
                    {' · '}{selected.semester} · {selected.schoolYear}
                    {selected.instructor && (
                      <span style={{ display: 'block', marginTop: '0.25rem' }}>
                        Professor: <strong>{selected.instructor}</strong>
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setSelected(null)}><X size={20} /></button>
              </div>

              <div className="transmutation-modal-body">
                {/* Workflow Stepper */}
                <div className="gs-stepper">
                  {(['Draft', 'Submitted', 'Verified', 'Published'] as const).map((stage, i) => {
                    const order = { Draft: 0, Submitted: 1, Verified: 2, Published: 3, Returned: 1 }
                    const currentOrder = order[status as keyof typeof order] ?? 0
                    const isReturned = status === 'Returned'
                    const isDone = !isReturned && i < currentOrder
                    const isCurrent = !isReturned && i === currentOrder
                    const isFuture = !isReturned && i > currentOrder
                    const isReturnedStage = isReturned && stage === 'Submitted'
                    const desc = {
                      Draft: 'Professor entering grades',
                      Submitted: 'Awaiting review',
                      Verified: 'Ready to approve',
                      Published: 'Visible to student'
                    }[stage]
                    return (
                      <div key={stage} className={`gs-step ${isDone ? 'gs-step--done' : ''} ${isCurrent ? 'gs-step--current' : ''} ${isFuture ? 'gs-step--future' : ''} ${isReturnedStage ? 'gs-step--returned' : ''}`}>
                        {i < 3 && <div className="gs-step-connector" />}
                        <div className="gs-step-circle">
                          {isDone ? <Check size={14} /> : isReturnedStage ? <RotateCcw size={14} /> : i + 1}
                        </div>
                        <div className="gs-step-label">{isReturnedStage ? 'Returned' : stage}</div>
                        <div className="gs-step-desc">{isReturnedStage ? 'Sent back to professor' : desc}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Status Banner */}
                {status === 'Submitted' && (
                  <div className="gs-status-banner gs-status-banner--submitted">
                    <AlertCircle size={16} />
                    <span>This professor's grades are awaiting your review. Review the grades below, then click <strong>Approve</strong> to accept or <strong>Reject</strong> to send back for correction.</span>
                  </div>
                )}
                {status === 'Verified' && (
                  <div className="gs-status-banner gs-status-banner--verified">
                    <Check size={16} />
                    <span>Grades are verified. Click <strong>Approve</strong> to make them official and visible to the student.</span>
                  </div>
                )}
                {status === 'Published' && (
                  <div className="gs-status-banner gs-status-banner--published">
                    <Check size={16} />
                    <span>Grades are published and visible to the student. Use a <strong>grade change request</strong> to make corrections.</span>
                  </div>
                )}
                {status === 'Returned' && (
                  <div className="gs-status-banner gs-status-banner--returned">
                    <RotateCcw size={16} />
                    <span>Grades were returned to the professor. They will need to resubmit after making corrections.</span>
                  </div>
                )}

                {/* Students in Class Table */}
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                  Students in Class
                  <span style={{ fontWeight: 400, fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)', marginLeft: '0.5rem' }}>
                    {classSubmissions.length} student(s)
                  </span>
                </h3>
                {loadingClass ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #6b7280)' }}>Loading class submissions...</div>
                ) : classSubmissions.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #6b7280)' }}>No submitted grades found for this class.</div>
                ) : (
                  <table className="grade-submission-table" style={{ marginBottom: '1rem' }}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Student No.</th>
                        <th>Submitted Subjects with Grades</th>
                        <th>Graded</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classSubmissions.map((s) => {
                        const profStatus = s.professorSubmissionStatus || s.gradeSubmission?.status || 'Draft'
                        const status = STATUS_LABELS[profStatus]
                        const submittedSubjects = s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed' && sub.submissionStatus === 'Submitted') || []
                        const subjectGrades = submittedSubjects.map(sub => {
                          const grade = sub.grade !== null && sub.grade !== undefined ? sub.grade.toFixed(2) : sub.gradeMark || '—'
                          return `${sub.code}: ${grade}`
                        }).join(', ') || '—'
                        const graded = submittedSubjects.filter(s => (s.grade !== null && s.grade !== undefined) || s.gradeMark).length
                        return (
                          <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => setSelected(s)}>
                            <td>
                              <div className="gs-student-name">{s.studentId?.lastName}, {s.studentId?.firstName}</div>
                            </td>
                            <td className="gs-student-number">{s.studentId?.studentNumber}</td>
                            <td style={{ fontSize: '0.8125rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={subjectGrades}>{subjectGrades}</td>
                            <td>{graded}/{submittedSubjects.length}</td>
                            <td>
                              <span className="status-badge" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                            </td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>{formatDate(s.submittedAt || s.gradeSubmission?.submittedAt)}</td>
                            <td>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                onClick={(e) => { e.stopPropagation(); setSelected(s) }}
                              >
                                Select
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}

                {/* Review Actions — Submitted: Approve or Reject */}
                {status === 'Submitted' && (
                  <>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label>Review Remarks (required for reject, optional for approve)</label>
                      <textarea
                        value={reviewRemarks}
                        onChange={e => setReviewRemarks(e.target.value)}
                        placeholder="Enter reason if rejecting, or optional notes for approval..."
                        rows={3}
                      />
                    </div>
                    {confirmAction === 'approve' ? (
                      <div className="gs-confirm-dialog">
                        <AlertCircle size={18} />
                        <span>Confirm: Approve this grade submission? This will verify and publish the grades.</span>
                        <div className="gs-confirm-actions">
                          <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={handleVerify} disabled={actionLoading}>
                            <Check size={16} /> {actionLoading ? 'Approving...' : 'Confirm Approve'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="transmutation-modal-footer">
                        <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={() => setConfirmAction('approve')} disabled={actionLoading}>
                          <Check size={16} /> Approve
                        </button>
                        <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={handleReturn} disabled={actionLoading}>
                          <X size={16} /> {actionLoading ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Review Actions — Verified: Approve or Return */}
                {status === 'Verified' && (
                  <>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label>Review Remarks (required for reject, optional for approve)</label>
                      <textarea
                        value={reviewRemarks}
                        onChange={e => setReviewRemarks(e.target.value)}
                        placeholder="Enter reason if rejecting, or optional notes for approval..."
                        rows={3}
                      />
                    </div>
                    {confirmAction === 'approve' ? (
                      <div className="gs-confirm-dialog">
                        <AlertCircle size={18} />
                        <span>Confirm: Approve these grades? Approved grades become official and visible to students.</span>
                        <div className="gs-confirm-actions">
                          <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={handlePublish} disabled={actionLoading}>
                            <Check size={16} /> {actionLoading ? 'Approving...' : 'Confirm Approve'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="transmutation-modal-footer">
                        <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={() => setConfirmAction('approve')} disabled={actionLoading}>
                          <Check size={16} /> Approve
                        </button>
                        <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={handleReturn} disabled={actionLoading}>
                          <X size={16} /> Reject
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Status Info Boxes */}
                {status === 'Published' && (
                  <div className="grade-submission-info-box" style={{ background: '#dcfce7', color: '#15803d' }}>
                    <Check size={16} /> Grades published on {formatDate(selected.gradeSubmission?.publishedAt)}.
                    Published grades are visible to students.
                    {selected.gradeSubmission?.reviewRemarks && ` — ${selected.gradeSubmission.reviewRemarks}`}
                  </div>
                )}

                {status === 'Returned' && (
                  <div className="grade-submission-info-box" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                    <RotateCcw size={16} /> Grades returned to professor on {formatDate(selected.gradeSubmission?.reviewedAt)}.
                    {selected.gradeSubmission?.reviewRemarks && ` Reason: ${selected.gradeSubmission.reviewRemarks}`}
                    <button type="button" className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => void handleReopenReturned(selected)} disabled={actionLoading}>
                      <RotateCcw size={14} /> Reopen draft
                    </button>
                  </div>
                )}

                {status === 'Draft' && (
                  <div className="grade-submission-info-box" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                    <Clock size={16} /> Grades are still in draft. Professor has not submitted them yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Grade Change Request Review Modal */}
      {reviewingChangeRequest && (
        <div className="transmutation-modal-overlay" onClick={() => setReviewingChangeRequest(null)}>
          <div className="transmutation-modal" style={{ maxWidth: '40rem' }} onClick={e => e.stopPropagation()}>
            <div className="transmutation-modal-header">
              <div>
                <h2>Grade Change Request</h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted, #6b7280)' }}>
                  {reviewingChangeRequest.studentNumber} · {reviewingChangeRequest.subjectCode} · {reviewingChangeRequest.schoolYear} {reviewingChangeRequest.semester}
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setReviewingChangeRequest(null)}><X size={20} /></button>
            </div>
            <div className="transmutation-modal-body">
              <div className="gs-change-request-details">
                <div className="gs-change-request-row">
                  <span>Current Grade:</span>
                  <strong>{reviewingChangeRequest.currentGrade.toFixed(2)}</strong>
                </div>
                <div className="gs-change-request-row">
                  <span>Requested Grade:</span>
                  <strong>{reviewingChangeRequest.requestedGrade.toFixed(2)}</strong>
                </div>
                <div className="gs-change-request-row">
                  <span>Requested By:</span>
                  <span>{typeof reviewingChangeRequest.requestedBy === 'object' ? reviewingChangeRequest.requestedBy.displayName || reviewingChangeRequest.requestedBy.username : '—'}</span>
                </div>
                <div className="gs-change-request-row">
                  <span>Requested At:</span>
                  <span>{formatDate(reviewingChangeRequest.requestedAt)}</span>
                </div>
                <div className="gs-change-request-reason">
                  <span>Reason:</span>
                  <p>{reviewingChangeRequest.reason}</p>
                </div>
                {reviewingChangeRequest.supportingInfo && (
                  <div className="gs-change-request-reason">
                    <span>Supporting Info:</span>
                    <p>{reviewingChangeRequest.supportingInfo}</p>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Review Remarks (required for rejection)</label>
                <textarea
                  value={changeRequestRemarks}
                  onChange={e => setChangeRequestRemarks(e.target.value)}
                  placeholder="Enter remarks for this review..."
                  rows={3}
                />
              </div>
              <div className="transmutation-modal-footer">
                <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={() => handleReviewChangeRequest('approve')} disabled={actionLoading}>
                  <Check size={16} /> {actionLoading ? 'Approving...' : 'Approve & Apply'}
                </button>
                <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={() => handleReviewChangeRequest('reject')} disabled={actionLoading}>
                  <X size={16} /> {actionLoading ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

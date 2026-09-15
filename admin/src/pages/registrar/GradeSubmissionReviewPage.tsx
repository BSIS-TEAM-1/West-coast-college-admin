import { useState, useEffect, useCallback } from 'react'
import { Check, X, RotateCcw, AlertCircle, FileText, Clock, ChevronLeft, Send } from 'lucide-react'
import {
  listGradeSubmissions,
  verifyGradeSubmission,
  publishGradeSubmission,
  returnGradeSubmission,
  revertGradeSubmissionToDraft,
  listGradeChangeRequests,
  reviewGradeChangeRequest,
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
  const [schoolYearFilter, setSchoolYearFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [selected, setSelected] = useState<GradeSubmissionSummary | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | 'verify' | 'publish'>(null)
  const [changeRequestFilter, setChangeRequestFilter] = useState<GradeChangeRequestStatus | ''>('Pending')
  const [reviewingChangeRequest, setReviewingChangeRequest] = useState<GradeChangeRequest | null>(null)
  const [changeRequestRemarks, setChangeRequestRemarks] = useState('')

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
    setSelected(submission)
    setReviewRemarks('')
    setConfirmAction(null)
  }

  const handleVerify = async () => {
    if (!selected) return
    setActionLoading(true)
    try {
      await verifyGradeSubmission(selected.enrollmentId || selected._id, reviewRemarks, selected.instructor)
      await load()
      setSelected(null)
      setConfirmAction(null)
    } catch (e: any) {
      setError(e.message || 'Failed to verify grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!selected) return
    setActionLoading(true)
    try {
      await publishGradeSubmission(selected.enrollmentId || selected._id, reviewRemarks, selected.instructor)
      await load()
      setSelected(null)
      setConfirmAction(null)
    } catch (e: any) {
      setError(e.message || 'Failed to publish grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!selected) return
    if (!reviewRemarks.trim()) {
      setError('A reason is required when returning grades.')
      return
    }
    setActionLoading(true)
    try {
      await returnGradeSubmission(selected.enrollmentId || selected._id, reviewRemarks, selected.instructor)
      await load()
      setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to return grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRevert = async (enrollmentId: string) => {
    if (!confirm('Revert this submission to draft? The professor will be able to edit grades again.')) return
    setActionLoading(true)
    try {
      await revertGradeSubmissionToDraft(enrollmentId)
      await load()
      if (selected?.enrollmentId === enrollmentId || selected?._id === enrollmentId) setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to revert submission')
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
      setReviewingChangeRequest(null)
      setChangeRequestRemarks('')
    } catch (e: any) {
      setError(e.message || 'Failed to review change request')
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
                <th>Subjects</th>
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
                const subjectCodes = s.subjectCodes || s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed').map(sub => sub.code).join(', ') || ''
                const graded = s.gradedCount ?? s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed' && sub.grade !== null && sub.grade !== undefined).length ?? 0
                const total = s.totalCount ?? s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed').length ?? 0
                return (
                  <tr key={s._id}>
                    <td>
                      <div className="gs-student-name">{s.studentId?.lastName}, {s.studentId?.firstName}</div>
                      <div className="gs-student-number">{s.studentId?.studentNumber}</div>
                    </td>
                    <td style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{s.instructor || 'Unassigned'}</td>
                    <td>{courseLabel(s.studentId?.course || s.course)}</td>
                    <td>{s.studentId?.yearLevel || s.yearLevel}</td>
                    <td>{s.semester}</td>
                    <td>{s.schoolYear}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{subjectCodes || '—'}</td>
                    <td>{graded}/{total}</td>
                    <td>
                      <span className="status-badge" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>{formatDate(s.submittedAt || s.gradeSubmission?.submittedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button type="button" className="gs-action-btn" title="View details" onClick={() => handleView(s)} aria-label="View Details">
                          <FileText size={18} />
                        </button>
                        {(profStatus === 'Returned' || profStatus === 'Rejected') && (
                          <button type="button" className="gs-action-btn gs-action-btn--revert" title="Revert to draft" onClick={() => handleRevert(s.enrollmentId || s._id)} aria-label="Revert to Draft">
                            <RotateCcw size={16} />
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
                      Submitted: 'Awaiting verification',
                      Verified: 'Ready to publish',
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
                    <span>This professor's grades are awaiting your verification. Review the grades below, then click <strong>Verify</strong> to approve or <strong>Return</strong> to send back for correction.</span>
                  </div>
                )}
                {status === 'Verified' && (
                  <div className="gs-status-banner gs-status-banner--verified">
                    <Check size={16} />
                    <span>Grades are verified. Click <strong>Publish</strong> to make them official and visible to the student.</span>
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

                {/* Subject Grades Table — only this professor's subjects */}
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                  Subject Grades
                  <span style={{ fontWeight: 400, fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)', marginLeft: '0.5rem' }}>
                    {selected.subjects?.filter(s => s.status !== 'Dropped' && s.status !== 'Removed').length || 0} subject(s)
                  </span>
                </h3>
                {(() => {
                  const activeSubjects = selected.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed') || []
                  const droppedSubjects = selected.subjects?.filter(sub => sub.status === 'Dropped' || sub.status === 'Removed') || []
                  const gradedCount = activeSubjects.filter(s => (s.grade !== null && s.grade !== undefined) || s.gradeMark).length
                  return (
                    <>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)', marginBottom: '0.5rem' }}>
                        {gradedCount}/{activeSubjects.length} graded
                      </div>
                      <table className="grade-submission-table" style={{ marginBottom: '1rem' }}>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Title</th>
                            <th>Units</th>
                            <th>Final Grade</th>
                            <th>Submission</th>
                            <th>Status</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSubjects.map((sub, i) => (
                            <tr key={i}>
                              <td><strong>{sub.code}</strong></td>
                              <td>{sub.title}</td>
                              <td>{sub.units}</td>
                              <td style={{ fontWeight: 600 }}>{sub.grade !== null && sub.grade !== undefined ? sub.grade.toFixed(2) : sub.gradeMark || '—'}</td>
                              <td>
                                <span className="status-badge" style={{
                                  fontSize: '0.6875rem',
                                  padding: '0.125rem 0.5rem',
                                  color: sub.submissionStatus === 'Published' ? '#15803d' : sub.submissionStatus === 'Verified' ? '#1d4ed8' : sub.submissionStatus === 'Submitted' ? '#b45309' : sub.submissionStatus === 'Returned' ? '#b91c1c' : '#6b7280',
                                  background: sub.submissionStatus === 'Published' ? '#dcfce7' : sub.submissionStatus === 'Verified' ? '#dbeafe' : sub.submissionStatus === 'Submitted' ? '#fef3c7' : sub.submissionStatus === 'Returned' ? '#fee2e2' : '#f3f4f6',
                                }}>{sub.submissionStatus || 'Draft'}</span>
                              </td>
                              <td>{sub.status}</td>
                              <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>{sub.remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {droppedSubjects.length > 0 && (
                        <>
                          <div style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: 'var(--color-text-muted, #6b7280)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            margin: '0.5rem 0 0.25rem 0',
                            padding: '0.375rem 0.625rem',
                            background: 'var(--color-surface-alt, #f3f4f6)',
                            borderRadius: '0.375rem',
                          }}>
                            Dropped / Removed ({droppedSubjects.length})
                          </div>
                          <table className="grade-submission-table" style={{ marginBottom: 0 }}>
                            <thead>
                              <tr>
                                <th>Code</th>
                                <th>Title</th>
                                <th>Units</th>
                                <th>Final Grade</th>
                                <th>Submission</th>
                                <th>Status</th>
                                <th>Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {droppedSubjects.map((sub, i) => (
                                <tr key={i} style={{ opacity: 0.6 }}>
                                  <td><strong>{sub.code}</strong></td>
                                  <td>{sub.title}</td>
                                  <td>{sub.units}</td>
                                  <td>{sub.gradeMark || '—'}</td>
                                  <td><span style={{ fontSize: '0.6875rem' }}>{sub.submissionStatus || 'Draft'}</span></td>
                                  <td>{sub.status}</td>
                                  <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>{sub.remarks || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </>
                  )
                })()}

                {/* Review Actions — Submitted: Verify or Return */}
                {status === 'Submitted' && (
                  <>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label>Review Remarks (required for return, optional for verify)</label>
                      <textarea
                        value={reviewRemarks}
                        onChange={e => setReviewRemarks(e.target.value)}
                        placeholder="Enter reason if returning, or optional notes for verification..."
                        rows={3}
                      />
                    </div>
                    {confirmAction === 'verify' ? (
                      <div className="gs-confirm-dialog">
                        <AlertCircle size={18} />
                        <span>Confirm: Verify this grade submission? This marks it as procedurally verified.</span>
                        <div className="gs-confirm-actions">
                          <button type="button" className="btn-primary" style={{ background: '#1d4ed8' }} onClick={handleVerify} disabled={actionLoading}>
                            <Check size={16} /> {actionLoading ? 'Verifying...' : 'Confirm Verify'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="transmutation-modal-footer">
                        <button type="button" className="btn-primary" style={{ background: '#1d4ed8' }} onClick={() => setConfirmAction('verify')} disabled={actionLoading}>
                          <Check size={16} /> Verify Grades
                        </button>
                        <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={handleReturn} disabled={actionLoading}>
                          <RotateCcw size={16} /> {actionLoading ? 'Returning...' : 'Return to Professor'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Review Actions — Verified: Publish or Return */}
                {status === 'Verified' && (
                  <>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label>Review Remarks (required for return, optional for publish)</label>
                      <textarea
                        value={reviewRemarks}
                        onChange={e => setReviewRemarks(e.target.value)}
                        placeholder="Enter reason if returning, or optional notes for publication..."
                        rows={3}
                      />
                    </div>
                    {confirmAction === 'publish' ? (
                      <div className="gs-confirm-dialog">
                        <AlertCircle size={18} />
                        <span>Confirm: Publish these grades? Published grades become official and visible to students.</span>
                        <div className="gs-confirm-actions">
                          <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={handlePublish} disabled={actionLoading}>
                            <Check size={16} /> {actionLoading ? 'Publishing...' : 'Confirm Publish'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="transmutation-modal-footer">
                        <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={() => setConfirmAction('publish')} disabled={actionLoading}>
                          <Send size={16} /> Publish Grades
                        </button>
                        <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={handleReturn} disabled={actionLoading}>
                          <RotateCcw size={16} /> Return to Professor
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

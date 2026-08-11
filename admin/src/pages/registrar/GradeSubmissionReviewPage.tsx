import { useState, useEffect, useCallback } from 'react'
import { Check, X, RotateCcw, AlertCircle, FileText, Clock } from 'lucide-react'
import {
  listGradeSubmissions,
  approveGradeSubmission,
  rejectGradeSubmission,
  revertGradeSubmissionToDraft,
  getGradeAuditTrail,
  type GradeSubmissionSummary,
  type GradeSubmissionStatus,
  type GradeAuditEntry
} from '../../lib/gradingApi'
import { COURSE_OPTIONS } from '../../lib/blockAssignmentShared'

interface GradeSubmissionReviewPageProps {
  onBack?: () => void
}

const STATUS_LABELS: Record<GradeSubmissionStatus, { label: string; color: string; bg: string }> = {
  Draft: { label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
  Submitted: { label: 'Submitted', color: '#b45309', bg: '#fef3c7' },
  Approved: { label: 'Approved', color: '#15803d', bg: '#dcfce7' },
  Rejected: { label: 'Rejected', color: '#b91c1c', bg: '#fee2e2' }
}

export default function GradeSubmissionReviewPage({ onBack }: GradeSubmissionReviewPageProps) {
  const [submissions, setSubmissions] = useState<GradeSubmissionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<GradeSubmissionStatus | ''>('Submitted')
  const [schoolYearFilter, setSchoolYearFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [selected, setSelected] = useState<GradeSubmissionSummary | null>(null)
  const [auditTrail, setAuditTrail] = useState<GradeAuditEntry[]>([])
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listGradeSubmissions({
        status: statusFilter || undefined,
        schoolYear: schoolYearFilter || undefined,
        semester: semesterFilter || undefined,
        course: courseFilter || undefined,
        limit: 100
      })
      setSubmissions(result.data)
    } catch (e: any) {
      setError(e.message || 'Failed to load grade submissions')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, schoolYearFilter, semesterFilter, courseFilter])

  useEffect(() => { load() }, [load])

  const handleView = async (submission: GradeSubmissionSummary) => {
    setSelected(submission)
    setReviewRemarks('')
    try {
      const audit = await getGradeAuditTrail(submission._id)
      setAuditTrail(audit)
    } catch {
      setAuditTrail([])
    }
  }

  const handleApprove = async () => {
    if (!selected) return
    setActionLoading(true)
    try {
      await approveGradeSubmission(selected._id, reviewRemarks)
      await load()
      setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to approve grades')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selected) return
    if (!reviewRemarks.trim()) {
      setError('Remarks are required when rejecting grades.')
      return
    }
    setActionLoading(true)
    try {
      await rejectGradeSubmission(selected._id, reviewRemarks)
      await load()
      setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to reject grades')
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
      if (selected?._id === enrollmentId) setSelected(null)
    } catch (e: any) {
      setError(e.message || 'Failed to revert submission')
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

  return (
    <div className="grade-submission-page">
      <div className="grade-submission-header">
        <div>
          <h1>Grade Submissions</h1>
          <p>Review and approve grade submissions from professors.</p>
        </div>
        {onBack && <button type="button" className="btn-secondary" onClick={onBack}>Back</button>}
      </div>

      {error && <div className="grade-submission-error"><AlertCircle size={16} /> {error}</div>}

      {/* Filters */}
      <div className="grade-submission-filters">
        <div className="form-group">
          <label>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as GradeSubmissionStatus | '')}>
            <option value="">All</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
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

      {loading ? (
        <div className="grade-submission-loading">Loading...</div>
      ) : submissions.length === 0 ? (
        <div className="grade-submission-empty">No grade submissions found matching the filters.</div>
      ) : (
        <div className="grade-submission-list">
          <table className="grade-submission-table">
            <thead>
              <tr>
                <th>Student</th>
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
                const status = STATUS_LABELS[s.gradeSubmission?.status || 'Draft']
                const total = s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed').length || 0
                const graded = s.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed' && sub.grade !== null && sub.grade !== undefined).length || 0
                return (
                  <tr key={s._id}>
                    <td>
                      <strong>{s.studentId?.lastName}, {s.studentId?.firstName}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s.studentId?.studentNumber}</div>
                    </td>
                    <td>{courseLabel(s.studentId?.course || s.course)}</td>
                    <td>{s.studentId?.yearLevel || s.yearLevel}</td>
                    <td>{s.semester}</td>
                    <td>{s.schoolYear}</td>
                    <td>{total}</td>
                    <td>{graded}/{total}</td>
                    <td>
                      <span className="status-badge" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{formatDate(s.gradeSubmission?.submittedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button type="button" className="btn-icon" title="View details" onClick={() => handleView(s)}>
                          <FileText size={16} />
                        </button>
                        {(s.gradeSubmission?.status === 'Approved' || s.gradeSubmission?.status === 'Rejected') && (
                          <button type="button" className="btn-icon" title="Revert to draft" onClick={() => handleRevert(s._id)}>
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
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="transmutation-modal-overlay" onClick={() => setSelected(null)}>
          <div className="transmutation-modal" style={{ maxWidth: '60rem' }} onClick={e => e.stopPropagation()}>
            <div className="transmutation-modal-header">
              <div>
                <h2>Grade Submission Review</h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  {selected.studentId?.lastName}, {selected.studentId?.firstName} ({selected.studentId?.studentNumber})
                  {' · '}{selected.semester} · {selected.schoolYear}
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setSelected(null)}><X size={20} /></button>
            </div>

            <div className="transmutation-modal-body">
              {/* Subjects with grades */}
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Subject Grades</h3>
              <table className="grade-submission-table" style={{ marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Units</th>
                    <th>Final Grade</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.subjects?.filter(sub => sub.status !== 'Dropped' && sub.status !== 'Removed').map((sub, i) => (
                    <tr key={i}>
                      <td><strong>{sub.code}</strong></td>
                      <td>{sub.title}</td>
                      <td>{sub.units}</td>
                      <td style={{ fontWeight: 600 }}>{sub.grade !== null && sub.grade !== undefined ? sub.grade.toFixed(2) : '—'}</td>
                      <td>{sub.status}</td>
                      <td style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{sub.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Audit Trail */}
              {auditTrail.length > 0 && (
                <>
                  <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.95rem' }}>Audit Trail</h3>
                  <div className="audit-trail-list">
                    {auditTrail.map((log) => (
                      <div key={log._id} className="audit-trail-entry">
                        <div className="audit-trail-header">
                          <span className="audit-action-badge">{log.action.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatDate(log.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: '0.8125rem' }}>
                          {log.subjectCode !== 'ALL' && <span><strong>{log.subjectCode}</strong>: </span>}
                          {log.oldGrade !== null && log.newGrade !== null && `Grade ${log.oldGrade?.toFixed(2)} → ${log.newGrade.toFixed(2)}`}
                          {log.oldGrade === null && log.newGrade !== null && `Grade set to ${log.newGrade.toFixed(2)}`}
                          {log.newGrade === null && log.oldGrade !== null && `Grade cleared (was ${log.oldGrade.toFixed(2)})`}
                          {log.newRemarks && ` · ${log.newRemarks}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Review Actions */}
              {selected.gradeSubmission?.status === 'Submitted' && (
                <>
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Review Remarks</label>
                    <textarea
                      value={reviewRemarks}
                      onChange={e => setReviewRemarks(e.target.value)}
                      placeholder="Optional for approval, required for rejection..."
                      rows={3}
                    />
                  </div>
                  <div className="transmutation-modal-footer">
                    <button type="button" className="btn-primary" style={{ background: '#15803d' }} onClick={handleApprove} disabled={actionLoading}>
                      <Check size={16} /> {actionLoading ? 'Approving...' : 'Approve Grades'}
                    </button>
                    <button type="button" className="btn-primary" style={{ background: '#b91c1c' }} onClick={handleReject} disabled={actionLoading}>
                      <X size={16} /> {actionLoading ? 'Rejecting...' : 'Reject Grades'}
                    </button>
                  </div>
                </>
              )}

              {selected.gradeSubmission?.status === 'Approved' && (
                <div className="grade-submission-info-box" style={{ background: '#dcfce7', color: '#15803d' }}>
                  <Check size={16} /> Grades approved on {formatDate(selected.gradeSubmission?.reviewedAt)}
                  {selected.gradeSubmission?.reviewRemarks && ` — ${selected.gradeSubmission.reviewRemarks}`}
                </div>
              )}

              {selected.gradeSubmission?.status === 'Rejected' && (
                <div className="grade-submission-info-box" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                  <X size={16} /> Grades rejected on {formatDate(selected.gradeSubmission?.reviewedAt)}
                  {selected.gradeSubmission?.reviewRemarks && ` — ${selected.gradeSubmission.reviewRemarks}`}
                </div>
              )}

              {selected.gradeSubmission?.status === 'Draft' && (
                <div className="grade-submission-info-box" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                  <Clock size={16} /> Grades are still in draft. Professor has not submitted them yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

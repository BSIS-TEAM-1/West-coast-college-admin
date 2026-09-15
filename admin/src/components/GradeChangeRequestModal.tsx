import { useState } from 'react'
import { X, Send, AlertCircle } from 'lucide-react'
import { createGradeChangeRequest } from '../lib/gradingApi'

interface GradeChangeRequestModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  enrollmentId: string
  studentId: string
  studentName: string
  subjectId: string
  subjectCode: string
  subjectTitle: string
  currentGrade: number | null
}

export default function GradeChangeRequestModal({
  open,
  onClose,
  onSuccess,
  enrollmentId,
  studentId,
  studentName,
  subjectId,
  subjectCode,
  subjectTitle,
  currentGrade
}: GradeChangeRequestModalProps) {
  const [requestedGrade, setRequestedGrade] = useState('')
  const [reason, setReason] = useState('')
  const [supportingInfo, setSupportingInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!open) return null

  const handleSubmit = async () => {
    setError('')
    const grade = Number(requestedGrade)
    if (!Number.isFinite(grade) || grade < 1.0 || grade > 5.0) {
      setError('Requested grade must be a number from 1.0 to 5.0.')
      return
    }
    if (!reason.trim()) {
      setError('A reason for the grade change is required.')
      return
    }
    if (currentGrade !== null && Math.abs(grade - currentGrade) < 0.001) {
      setError('The requested grade is the same as the current grade.')
      return
    }

    setLoading(true)
    try {
      await createGradeChangeRequest({
        enrollmentId,
        studentId,
        subjectId,
        requestedGrade: grade,
        reason: reason.trim(),
        supportingInfo: supportingInfo.trim() || undefined
      })
      setSuccess(true)
      onSuccess?.()
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (e: any) {
      setError(e.message || 'Failed to submit grade change request.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setRequestedGrade('')
    setReason('')
    setSupportingInfo('')
    setError('')
    setSuccess(false)
    onClose()
  }

  return (
    <div className="transmutation-modal-overlay" onClick={handleClose}>
      <div className="transmutation-modal" style={{ maxWidth: '40rem' }} onClick={e => e.stopPropagation()}>
        <div className="transmutation-modal-header">
          <div>
            <h2>Grade Change Request</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted, #6b7280)' }}>
              {studentName} · {subjectCode} — {subjectTitle}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={handleClose}><X size={20} /></button>
        </div>

        <div className="transmutation-modal-body">
          {success ? (
            <div className="grade-submission-info-box" style={{ background: '#dcfce7', color: '#15803d' }}>
              <Send size={16} /> Grade change request submitted successfully. The registrar will review it.
            </div>
          ) : (
            <>
              <div className="gs-change-request-details">
                <div className="gs-change-request-row">
                  <span>Current Grade:</span>
                  <strong>{currentGrade !== null ? currentGrade.toFixed(2) : '—'}</strong>
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label>Requested New Grade (1.0–5.0)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="5"
                    value={requestedGrade}
                    onChange={e => setRequestedGrade(e.target.value)}
                    placeholder="e.g. 1.75"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border, #d1d5db)', borderRadius: '0.375rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label>Reason for Change <span style={{ color: '#b91c1c' }}>*</span></label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Explain why this grade needs to be changed..."
                    rows={3}
                  />
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label>Supporting Information (optional)</label>
                  <textarea
                    value={supportingInfo}
                    onChange={e => setSupportingInfo(e.target.value)}
                    placeholder="Any additional context, evidence, or documentation..."
                    rows={2}
                  />
                </div>
              </div>

              {error && (
                <div className="grade-submission-error" style={{ marginTop: '1rem' }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <div className="transmutation-modal-footer" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSubmit} disabled={loading}>
                  <Send size={16} /> {loading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

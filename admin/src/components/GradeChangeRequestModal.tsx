import { useState } from 'react'
import { X, Send, AlertCircle, CheckCircle2, Edit3, ArrowRight, Info } from 'lucide-react'
import { createGradeChangeRequest } from '../lib/gradingApi'
import { formatChedGrade, isInvalidGrade } from '../pages/professor/GradesManagement'
import { describeGradeScale, formatGrade, useGradeScale } from '../lib/gradingScale'
import './GradeChangeRequestModal.css'

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
  const gradeScale = useGradeScale()

  if (!open) return null

  const handleClose = () => {
    setRequestedGrade('')
    setReason('')
    setSupportingInfo('')
    setError('')
    setSuccess(false)
    onClose()
  }

  const handleSubmit = async () => {
    setError('')
    const normalizedStr = formatChedGrade(requestedGrade)
    const grade = Number(normalizedStr)
    if (!Number.isFinite(grade) || grade < gradeScale.min || grade > gradeScale.max) {
      setError(`Requested grade must be a number from ${formatGrade(gradeScale.min)} to ${formatGrade(gradeScale.max)}.`)
      return
    }
    setRequestedGrade(normalizedStr)
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

  const showGradeError = Boolean(requestedGrade.trim()) && isInvalidGrade(requestedGrade)

  return (
    <div className="gcr-backdrop" onClick={handleClose}>
      <div
        className="gcr-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gcr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gcr-header">
          <div className="gcr-header-main">
            <span className="gcr-icon-badge">
              <Edit3 size={20} />
            </span>
            <div className="gcr-title-group">
              <h2 className="gcr-title" id="gcr-title">Grade Change Request</h2>
              <p className="gcr-subtitle" title={`${studentName} · ${subjectCode} — ${subjectTitle}`}>
                {studentName} · {subjectCode} — {subjectTitle}
              </p>
            </div>
          </div>
          <button type="button" className="gcr-close-btn" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="gcr-body">
          {success ? (
            <div className="gcr-success-card">
              <span className="gcr-success-icon-badge">
                <CheckCircle2 size={28} />
              </span>
              <h3 className="gcr-success-title">Request submitted</h3>
              <p className="gcr-success-desc">
                The grade change for {studentName} has been sent to the registrar for review.
                You will be notified once it is approved or rejected.
              </p>
            </div>
          ) : (
            <>
              <div className="gcr-context-card">
                <div className="gcr-context-row">
                  <span className="gcr-context-label">Student</span>
                  <span className="gcr-context-val">{studentName}</span>
                </div>
                <div className="gcr-context-row">
                  <span className="gcr-context-label">Course</span>
                  <span className="gcr-context-val" title={`${subjectCode} — ${subjectTitle}`}>
                    {subjectCode} — {subjectTitle}
                  </span>
                </div>
              </div>

              <div className="gcr-grade-comparison">
                <div className="gcr-grade-box">
                  <span className="gcr-grade-label">Current</span>
                  <span className="gcr-grade-current-val">
                    {currentGrade !== null ? formatGrade(currentGrade) : '—'}
                  </span>
                </div>
                <div className="gcr-arrow-divider">
                  <ArrowRight size={16} />
                </div>
                <div className="gcr-grade-box">
                  <span className="gcr-grade-label">Requested</span>
                  <div className="gcr-grade-input-wrapper">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`gcr-grade-input ${showGradeError ? 'is-invalid' : ''}`}
                      value={requestedGrade}
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setRequestedGrade(val)
                        }
                      }}
                      onBlur={() => {
                        if (requestedGrade.trim()) {
                          setRequestedGrade(formatChedGrade(requestedGrade))
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          if (requestedGrade.trim()) {
                            setRequestedGrade(formatChedGrade(requestedGrade))
                          }
                        }
                      }}
                      placeholder={formatGrade(gradeScale.min + gradeScale.step)}
                      aria-label="Requested new grade"
                    />
                  </div>
                  <span className={`gcr-grade-hint ${showGradeError ? 'is-invalid' : ''}`}>
                    {showGradeError ? `Must be ${formatGrade(gradeScale.min)}–${formatGrade(gradeScale.max)}` : describeGradeScale(gradeScale)}
                  </span>
                </div>
              </div>

              <div className="gcr-field-group">
                <label className="gcr-field-label" htmlFor="gcr-reason">
                  <span>
                    Reason for change
                    <span className="gcr-field-label-required">*</span>
                  </span>
                </label>
                <textarea
                  id="gcr-reason"
                  className="gcr-textarea"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why this grade needs to be changed..."
                  rows={3}
                />
              </div>

              <div className="gcr-field-group">
                <label className="gcr-field-label" htmlFor="gcr-supporting">
                  <span>
                    Supporting information
                    <span className="gcr-field-label-sub"> (optional)</span>
                  </span>
                </label>
                <textarea
                  id="gcr-supporting"
                  className="gcr-textarea"
                  value={supportingInfo}
                  onChange={(event) => setSupportingInfo(event.target.value)}
                  placeholder="Any additional context, evidence, or documentation..."
                  rows={2}
                />
              </div>

              <div className="gcr-notice-banner">
                <Info size={14} />
                <span>
                  Submitted grades can no longer be edited directly. The registrar reviews every
                  change request before it is applied.
                </span>
              </div>

              {error && (
                <div className="gcr-alert-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="gcr-footer">
            <button type="button" className="gcr-btn-cancel" onClick={handleClose}>
              Cancel
            </button>
            <button type="button" className="gcr-btn-submit" onClick={handleSubmit} disabled={loading}>
              <Send size={16} />
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

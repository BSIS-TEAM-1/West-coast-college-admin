import { useState } from 'react'
import { Clock, X, Loader2 } from 'lucide-react'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'
import './TeachingHoursWarningModal.css'

type TeachingHoursWarningData = {
  subjectId?: string
  subjectCode: string
  subjectTitle: string
  professorName?: string
  sectionCode?: string
  blockGroupName?: string
  units: number
  lecturePeriods: number
  labPeriods: number
  expectedContactHours: number
  assignedContactHours: number
  discrepancy: number
  schedule: string
  room: string
}

type Props = {
  warningData: TeachingHoursWarningData | null
  onClose: () => void
  onCancel: () => void
  onProceedWithOverride: (justification: string) => Promise<void>
  isSubmitting: boolean
}

export default function TeachingHoursWarningModal({
  warningData,
  onClose,
  onCancel,
  onProceedWithOverride,
  isSubmitting
}: Props) {
  const [justification, setJustification] = useState('')
  const [showOverrideForm, setShowOverrideForm] = useState(false)

  if (!warningData) return null

  const handleReviewSchedule = () => {
    onClose()
  }

  const handleCancel = () => {
    // Dismisses the modal and keeps the schedule inputs intact for editing.
    onCancel()
  }

  const handleProceed = async () => {
    if (!showOverrideForm) {
      setShowOverrideForm(true)
      return
    }

    if (justification.trim().length < 10) {
      return // Minimum 10 characters required
    }

    await onProceedWithOverride(justification.trim())
  }

  const isUnderScheduled = warningData.discrepancy < 0
  const missingHours = Math.abs(warningData.discrepancy).toFixed(1)
  const expectedLabel = `${warningData.expectedContactHours.toFixed(1)} hours/week`
  const assignedLabel = `${warningData.assignedContactHours.toFixed(1)} hours/week`

  return (
    <StudentWorkspaceOverlay>
      <div
        className="teaching-hours-warning-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teaching-hours-warning-title"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
        <div className="teaching-hours-warning-modal-overlay" aria-hidden="true" />
        <div className="teaching-hours-warning-modal">
          <header className="teaching-hours-warning-modal-header">
            <div>
              <h2 id="teaching-hours-warning-title">
                {isUnderScheduled
                  ? 'Schedule Has Missing Teaching Hours'
                  : 'Schedule Exceeds Expected Lecture Hours'}
              </h2>
            </div>
            <button
              type="button"
              className="teaching-hours-warning-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>

          <div className="teaching-hours-warning-modal-body">
            <div className="teaching-hours-warning-details">
              <div className="teaching-hours-warning-detail-row">
                <span className="teaching-hours-warning-detail-label">Subject</span>
                <span className="teaching-hours-warning-detail-value">
                  <strong>{warningData.subjectCode}</strong> {warningData.subjectTitle}
                </span>
              </div>

              {warningData.professorName ? (
                <div className="teaching-hours-warning-detail-row">
                  <span className="teaching-hours-warning-detail-label">Professor</span>
                  <span className="teaching-hours-warning-detail-value">{warningData.professorName}</span>
                </div>
              ) : null}

              {(warningData.sectionCode || warningData.blockGroupName) ? (
                <div className="teaching-hours-warning-detail-row">
                  <span className="teaching-hours-warning-detail-label">Block / Section</span>
                  <span className="teaching-hours-warning-detail-value">
                    {[warningData.sectionCode, warningData.blockGroupName].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ) : null}

              <div className="teaching-hours-warning-detail-row">
                <span className="teaching-hours-warning-detail-label">Academic Units</span>
                <span className="teaching-hours-warning-detail-value">{warningData.units}</span>
              </div>

              <div className="teaching-hours-warning-detail-row">
                <span className="teaching-hours-warning-detail-label">Classification</span>
                <span className="teaching-hours-warning-detail-value">
                  {warningData.lecturePeriods > 0 && `Lecture: ${warningData.lecturePeriods} hrs`}
                  {warningData.lecturePeriods > 0 && warningData.labPeriods > 0 && ' · '}
                  {warningData.labPeriods > 0 && `Laboratory: ${warningData.labPeriods} hrs`}
                  {warningData.lecturePeriods === 0 && warningData.labPeriods === 0 && 'Not configured'}
                </span>
              </div>

              <div className="teaching-hours-warning-detail-row teaching-hours-warning-detail-row--highlight">
                <span className="teaching-hours-warning-detail-label">Expected Weekly Contact Hours</span>
                <span className="teaching-hours-warning-detail-value teaching-hours-warning-detail-value--expected">
                  {expectedLabel}
                </span>
              </div>

              <div className="teaching-hours-warning-detail-row teaching-hours-warning-detail-row--highlight">
                <span className="teaching-hours-warning-detail-label">Scheduled Weekly Contact Hours</span>
                <span className={`teaching-hours-warning-detail-value ${isUnderScheduled ? 'teaching-hours-warning-detail-value--missing' : 'teaching-hours-warning-detail-value--assigned'}`}>
                  {assignedLabel}
                </span>
              </div>

              <div className={`teaching-hours-warning-detail-row ${isUnderScheduled ? 'teaching-hours-warning-detail-row--missing' : 'teaching-hours-warning-detail-row--discrepancy'}`}>
                <span className="teaching-hours-warning-detail-label">
                  {isUnderScheduled ? 'Missing Hours to Occupy' : 'Difference'}
                </span>
                <span className={`teaching-hours-warning-detail-value ${isUnderScheduled ? 'teaching-hours-warning-detail-value--missing' : 'teaching-hours-warning-detail-value--discrepancy'}`}>
                  {isUnderScheduled ? `-${missingHours} hours (missing)` : `+${warningData.discrepancy.toFixed(1)} hours`}
                </span>
              </div>

              <div className="teaching-hours-warning-detail-row">
                <span className="teaching-hours-warning-detail-label">Schedule</span>
                <span className="teaching-hours-warning-detail-value">
                  <Clock size={14} /> {warningData.schedule || 'TBA'}
                </span>
              </div>

              <div className="teaching-hours-warning-detail-row">
                <span className="teaching-hours-warning-detail-label">Room</span>
                <span className="teaching-hours-warning-detail-value">{warningData.room || 'TBA'}</span>
              </div>
            </div>

            <p className="teaching-hours-warning-message">
              {isUnderScheduled
                ? `The assigned schedule only covers ${warningData.assignedContactHours.toFixed(1)} of ${warningData.expectedContactHours.toFixed(1)} expected weekly contact hours for this subject (${warningData.units} unit${warningData.units === 1 ? '' : 's'}). There are still ${missingHours} missing hour(s) that need to be occupied by the professor. Review the schedule to add the missing hours or provide an authorized justification to proceed.`
                : 'The scheduled weekly contact hours exceed the expected hours configured for this lecture subject. Review the schedule or verify whether an approved exception applies.'}
            </p>

            {showOverrideForm && (
              <div className="teaching-hours-override-form">
                <label htmlFor="override-justification" className="teaching-hours-override-label">
                  Justification for Override
                  <span className="teaching-hours-override-required">*</span>
                </label>
                <textarea
                  id="override-justification"
                  className="teaching-hours-override-textarea"
                  placeholder={
                    isUnderScheduled
                      ? 'Explain why this subject has fewer scheduled hours than expected (e.g., modular/blended arrangement, asynchronous hours, practicum/fieldwork distribution)'
                      : 'Explain why this teaching hours exception is necessary (e.g., laboratory constraints, split section requirements, special circumstances)'
                  }
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  disabled={isSubmitting}
                />
                <p className="teaching-hours-override-hint">
                  Minimum 10 characters. This justification will be recorded in the audit trail.
                </p>
              </div>
            )}
          </div>

          <footer className="teaching-hours-warning-modal-footer">
            <button
              type="button"
              className="teaching-hours-warning-btn teaching-hours-warning-btn--secondary"
              onClick={handleReviewSchedule}
              disabled={isSubmitting}
            >
              Review Schedule
            </button>
            <button
              type="button"
              className="teaching-hours-warning-btn teaching-hours-warning-btn--secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="teaching-hours-warning-btn teaching-hours-warning-btn--primary"
              onClick={handleProceed}
              disabled={isSubmitting || (showOverrideForm && justification.trim().length < 10)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Processing...
                </>
              ) : showOverrideForm ? (
                'Proceed with Authorization'
              ) : (
                'Proceed with Authorization'
              )}
            </button>
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

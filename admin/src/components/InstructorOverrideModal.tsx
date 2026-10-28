import { AlertTriangle, X } from 'lucide-react'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'
import './InstructorOverrideModal.css'

type InstructorOverrideData = {
  existingInstructor: string
  newInstructor: string
  subjectId: string
}

type Props = {
  warningData: InstructorOverrideData | null
  onClose: () => void
  onProceedWithOverride: () => Promise<void>
  isSubmitting: boolean
}

export default function InstructorOverrideModal({
  warningData,
  onClose,
  onProceedWithOverride,
  isSubmitting
}: Props) {
  if (!warningData) return null

  const handleCancel = () => {
    onClose()
  }

  const handleProceed = async () => {
    await onProceedWithOverride()
  }

  return (
    <StudentWorkspaceOverlay>
      <div
        className="instructor-override-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instructor-override-title"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
        <div className="instructor-override-modal-overlay" aria-hidden="true" />
        <div className="instructor-override-modal">
          <header className="instructor-override-modal-header">
            <div className="instructor-override-modal-icon">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 id="instructor-override-title">Instructor Override Required</h2>
              <p className="instructor-override-modal-subcopy">
                This subject is already assigned to <strong>{warningData.existingInstructor}</strong>.
                Assigning it to <strong>{warningData.newInstructor}</strong> will replace the existing instructor assignment.
              </p>
            </div>
            <button
              type="button"
              className="instructor-override-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>

          <footer className="instructor-override-modal-footer">
            <button
              type="button"
              className="instructor-override-btn instructor-override-btn--secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="instructor-override-btn instructor-override-btn--primary"
              onClick={handleProceed}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Proceed with Reassignment'}
            </button>
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

import { useState, useEffect } from 'react'
import type { WizardFormData } from './types'

interface SuccessStepProps {
  data: Partial<WizardFormData>
  studentNumber: string
  onReturnToDirectory: () => void
}

const COURSE_LABELS: Record<string, string> = {
  '101': 'BEED',
  '102': 'BSEd-English',
  '103': 'BSEd-Math',
  '201': 'BSBA-HRM'
}

const REDIRECT_SECONDS = 5

export default function SuccessStep({
  data,
  studentNumber,
  onReturnToDirectory
}: SuccessStepProps) {
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS)
  const [autoRedirect, setAutoRedirect] = useState(true)

  useEffect(() => {
    if (!autoRedirect) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onReturnToDirectory()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [autoRedirect, onReturnToDirectory])

  const handleManualRedirect = () => {
    setAutoRedirect(false)
    onReturnToDirectory()
  }

  const fullName = [data.firstName, data.middleName, data.lastName, data.suffix]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="wizard-step wizard-step--success">
      <div className="success-header">
        <div className="success-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2>Student Created Successfully!</h2>
        <p>The student record has been added to the system.</p>
      </div>

      <div className="success-summary">
        <div className="summary-card">
          <h3>Student Information</h3>
          <div className="summary-field">
            <span className="summary-label">Student Number:</span>
            <span className="summary-value summary-value--highlight">{studentNumber}</span>
          </div>
          <div className="summary-field">
            <span className="summary-label">Name:</span>
            <span className="summary-value">{fullName}</span>
          </div>
          <div className="summary-field">
            <span className="summary-label">Course:</span>
            <span className="summary-value">{COURSE_LABELS[data.course || ''] || data.course || 'N/A'}</span>
          </div>
          <div className="summary-field">
            <span className="summary-label">Year Level:</span>
            <span className="summary-value">{data.yearLevel || 'N/A'}</span>
          </div>
          <div className="summary-field">
            <span className="summary-label">Email:</span>
            <span className="summary-value">{data.email || 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="success-actions">
        <div className="redirect-timer">
          <p>Redirecting to Student Management in {countdown} seconds...</p>
          <button
            type="button"
            onClick={handleManualRedirect}
            className="btn-primary"
          >
            Redirect Now
          </button>
        </div>
      </div>
    </div>
  )
}

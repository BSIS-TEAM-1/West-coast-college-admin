import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Mail, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react'
import {
  sendReEnrollmentCode,
  verifyReEnrollmentCode,
  type ReEnrollmentSemester,
  type ReEnrollmentStudent,
  type ReEnrollmentVerification,
} from '../lib/reEnrollmentApi'
import { studentDisplayName, studentNumberDisplay } from '../lib/blockAssignmentShared'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The verification request could not be completed.'
}

function emptyVerification(email: string): ReEnrollmentVerification {
  return {
    status: 'none',
    maskedEmail: email || '',
    maskedPhone: '',
    sentVia: [],
    sentAt: null,
    codeExpiresAt: null,
    verifiedAt: null,
    verificationExpiresAt: null,
  }
}

// Older records or partial API responses may be missing fields (e.g. sentVia).
// Normalize once at the boundary so the rest of the component can trust the shape.
function normalizeVerification(
  value: Partial<ReEnrollmentVerification> | null | undefined,
  email: string,
): ReEnrollmentVerification {
  const base = emptyVerification(email)
  return {
    ...base,
    ...(value || {}),
    sentVia: Array.isArray(value?.sentVia) ? value.sentVia : [],
  }
}

export default function ReEnrollmentCodeModal({
  student,
  targetSchoolYear,
  targetSemester,
  onClose,
  onVerificationChange,
}: {
  student: ReEnrollmentStudent
  targetSchoolYear: string
  targetSemester: ReEnrollmentSemester
  onClose: () => void
  onVerificationChange: (studentId: string, verification: ReEnrollmentVerification) => void
}) {
  const [verification, setVerification] = useState<ReEnrollmentVerification>(() =>
    normalizeVerification(student.reEnrollment?.verification, student.email || ''),
  )
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const autoSendStarted = useRef(false)

  const applyVerification = (next: Partial<ReEnrollmentVerification> | null | undefined) => {
    const normalized = normalizeVerification(next, student.email || '')
    setVerification(normalized)
    onVerificationChange(student._id, normalized)
  }

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    setError('')
    try {
      const response = await sendReEnrollmentCode({
        studentId: student._id,
        schoolYear: targetSchoolYear,
        semester: targetSemester,
      })
      applyVerification(response.data.verification)
      setCode('')
    } catch (sendError) {
      setError(errorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async () => {
    if (verifying) return
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit verification code sent to the student.')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const response = await verifyReEnrollmentCode({
        studentId: student._id,
        schoolYear: targetSchoolYear,
        semester: targetSemester,
        code: code.trim(),
      })
      applyVerification(response.data.verification)
      setCode('')
    } catch (verifyError) {
      setError(errorMessage(verifyError))
    } finally {
      setVerifying(false)
    }
  }

  // Opening verification from student details sends the code immediately when
  // there is no live code yet.
  useEffect(() => {
    if (autoSendStarted.current) return
    if (verification.status === 'none' || verification.status === 'expired') {
      autoSendStarted.current = true
      void handleSend()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verified = verification.status === 'verified'
  const availableChannels: Array<'email' | 'sms' | 'app'> = [
    ...(student.email ? ['email' as const] : []),
    'app' as const,
  ]
  const sentChannels = Array.isArray(verification.sentVia) ? verification.sentVia.filter((ch) => ch === 'email' || ch === 'sms' || ch === 'app') : []
  const deliveryChannels: Array<'email' | 'sms' | 'app'> = sentChannels.length
    ? [
        ...sentChannels,
        ...availableChannels.filter((ch) => !sentChannels.includes(ch)),
      ].filter((ch, idx, arr) => arr.indexOf(ch) === idx)
    : availableChannels
  const deliveryChannelLabel = deliveryChannels
    .map((channel) => channel === 'sms' ? 'SMS' : channel === 'app' ? 'the mobile app (in-app OTP)' : 'email')
    .join(' and ')
  const maskedDestinationLabel = deliveryChannels
    .map((channel) => {
      if (channel === 'sms') return verification.maskedPhone || student.contactNumber
      if (channel === 'app') return 'student\u2019s mobile app'
      return verification.maskedEmail || student.email
    })
    .filter(Boolean)
    .join(' and ')
  const destinationIcon = deliveryChannels.includes('app') && !deliveryChannels.includes('email') && !deliveryChannels.includes('sms')
    ? <Smartphone size={22} />
    : deliveryChannels.includes('sms') && !deliveryChannels.includes('email') && !deliveryChannels.includes('app')
      ? <Smartphone size={22} />
      : <Mail size={22} />
  const expiresLabel = verification.codeExpiresAt
    ? new Date(verification.codeExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Re-enrollment verification"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
        <div className="student-workspace__modal-overlay" aria-hidden="true" />
        <div className="student-workspace__modal student-workspace__modal--verification">
          <header className="student-workspace__modal-header">
            <div>
              <span className="student-workspace__eyebrow">Re-enrollment verification</span>
              <h2>Verification code</h2>
            </div>
            <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="student-workspace__modal-body">
            <div className="student-workspace__verification-intro">
              <span className="student-workspace__verification-icon" aria-hidden="true">
                {verified ? <ShieldCheck size={22} /> : destinationIcon}
              </span>
              <div>
                <strong>{studentDisplayName(student)}</strong>
                <span>{studentNumberDisplay(student)}</span>
              </div>
            </div>

            {verified ? (
              <div className="student-workspace__verification-success">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Student verified</strong>
                  <p>
                    The code sent to {maskedDestinationLabel || 'the student'} was confirmed. The student can now be enrolled
                    for {targetSemester} {targetSchoolYear}.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="student-workspace__verification-panel">
                  <div className="student-workspace__verification-panel-head">
                    <div>
                      <span className="label">Code destination</span>
                      <strong>{maskedDestinationLabel || 'No verified contact on file'}</strong>
                    </div>
                    <button
                      type="button"
                      className="student-workspace__ghost-button"
                      onClick={handleSend}
                      disabled={sending}
                    >
                      {sending ? <Loader2 size={15} className="student-workspace__spin" /> : <RefreshCw size={15} />}
                      {sending ? 'Sending' : verification.sentAt ? 'Resend' : 'Send code'}
                    </button>
                  </div>
                  <p className="student-workspace__verification-meta">
                    {sending
                      ? 'Sending the code to the student…'
                      : expiresLabel
                        ? `The code was sent via ${deliveryChannelLabel || 'the available contact method'} and expires at ${expiresLabel}. Ask the student to read it to you.`
                        : 'Send a verification code, then ask the student to read it to you.'}
                  </p>
                </div>

                <label className="student-workspace__code-label" htmlFor="re-enrollment-code">
                  Verification code
                </label>
                <div className="student-workspace__code-row">
                  <input
                    id="re-enrollment-code"
                    className="student-workspace__code-input"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleVerify()
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    disabled={sending || verifying}
                  />
                  <button
                    type="button"
                    className="student-workspace__primary-button"
                    onClick={handleVerify}
                    disabled={verifying || sending || code.trim().length !== 6}
                  >
                    {verifying ? <Loader2 size={16} className="student-workspace__spin" /> : null}
                    {verifying ? 'Verifying' : 'Verify'}
                  </button>
                </div>
              </>
            )}

            {error ? <div className="student-workspace__verification-error">{error}</div> : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose}>
              {verified ? 'Close' : 'Cancel'}
            </button>
            {verified ? (
              <button type="button" className="student-workspace__primary-button" onClick={onClose}>
                Done
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

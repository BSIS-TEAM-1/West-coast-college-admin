import { AlertTriangle, Blocks, BookOpen, Mail, Phone, ShieldCheck, X } from 'lucide-react'
import type { StudentData } from '../lib/studentApi'
import {
  courseFullLabel,
  courseShortLabel,
  formatBlockDisplay,
  formatYearLevel,
  studentDisplayName,
  studentInitials,
  studentNumberDisplay
} from '../lib/blockAssignmentShared'
import type { ReEnrollmentInfo } from '../lib/reEnrollmentApi'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'

function gradeLabel(grade: number | null, gradeMark: string | null, status: string | null) {
  if (grade != null) return grade.toFixed(2)
  if (gradeMark) return gradeMark
  if (status) return status
  return '—'
}

export default function StudentInfoPopup({
  student,
  reEnrollment,
  onClose,
  onAssignBlock,
  onVerify,
  verificationDisabled = false,
  verificationHint = '',
  assignBlockDisabled = false,
  assignBlockHint = ''
}: {
  student: StudentData
  reEnrollment?: ReEnrollmentInfo
  onClose: () => void
  onAssignBlock: (student: StudentData) => void
  onVerify?: () => void
  verificationDisabled?: boolean
  verificationHint?: string
  assignBlockDisabled?: boolean
  assignBlockHint?: string
}) {
  const blockLabel = String(student.section || '').trim()
  const gradeSummary = reEnrollment?.gradeSummary
  const retakeSubjects = reEnrollment?.retakeSubjects || []
  const verification = reEnrollment?.verification

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
        <div className="student-workspace__modal-overlay" aria-hidden="true" />
        <div className="student-workspace__modal">
          <header className="student-workspace__modal-header">
            <div className="student-workspace__student-cell">
              <span className="student-workspace__avatar" aria-hidden="true">{studentInitials(student)}</span>
              <div>
                <span className="student-workspace__eyebrow">Student info</span>
                <h2>{studentDisplayName(student)}</h2>
              </div>
            </div>
            <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="student-workspace__modal-body">
            <div className="student-workspace__detail-list">
              <div className="student-workspace__detail-item-new">
                <span className="label">Student Number</span>
                <span className="value">{studentNumberDisplay(student)}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Program</span>
                <span className="value" title={courseFullLabel(student.course)}>{courseShortLabel(student.course)}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Year Level</span>
                <span className="value">{formatYearLevel(student.yearLevel)}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Current Block</span>
                <span className="value">{blockLabel ? formatBlockDisplay(blockLabel) : 'Unassigned'}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Semester</span>
                <span className="value">{student.semester || 'N/A'} · {student.schoolYear || 'N/A'}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Contact</span>
                <span className="value">
                  <Phone size={13} aria-hidden="true" /> {student.contactNumber || 'N/A'}
                </span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Email</span>
                <span className="value">
                  <Mail size={13} aria-hidden="true" /> {student.email || 'N/A'}
                </span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Current Status</span>
                <span className="value">{student.lifecycleStatus || 'Not Enrolled'}</span>
              </div>
              <div className="student-workspace__detail-item-new">
                <span className="label">Academic Status</span>
                <span className="value">{student.studentStatus || student.classification || 'Regular'}</span>
              </div>
              {reEnrollment ? (
                <div className="student-workspace__detail-item-new">
                  <span className="label">Verification</span>
                  <div className="student-workspace__verification-detail">
                    <span className={`value student-workspace__verification-state student-workspace__verification-state--${verification?.status || 'none'}`}>
                      <ShieldCheck size={13} aria-hidden="true" />
                      {verification?.status === 'verified'
                        ? 'Verified'
                        : verification?.status === 'sent'
                          ? `Code sent${verification.sentVia.length ? ` via ${verification.sentVia.join(' and ')}` : ''}`
                          : verification?.status === 'expired'
                            ? 'Code expired'
                            : 'Not verified'}
                    </span>
                    {onVerify ? (
                      <button
                        type="button"
                        className="student-workspace__verification-button"
                        onClick={onVerify}
                        disabled={verificationDisabled || verification?.status === 'verified'}
                        title={verificationHint || (verification?.status === 'verified' ? 'This student is already verified.' : undefined)}
                      >
                        {verification?.status === 'sent' ? 'Enter verification code' : 'Send verification'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {gradeSummary ? (
              <section className="student-workspace__popup-section">
                <div className="student-workspace__popup-section-head">
                  <div>
                    <span className="student-workspace__eyebrow">
                      <BookOpen size={14} aria-hidden="true" /> Latest grades
                    </span>
                    <h3>
                      {gradeSummary.term
                        ? `${gradeSummary.term.schoolYear} · ${gradeSummary.term.semester}`
                        : 'No enrollment on record'}
                    </h3>
                  </div>
                  <span className="student-workspace__gwa-badge">
                    {gradeSummary.gwa != null ? `GWA ${gradeSummary.gwa.toFixed(2)}` : 'No GWA'}
                  </span>
                </div>

                {gradeSummary.subjects.length ? (
                  <div className="student-workspace__grade-table-wrap">
                    <table className="student-workspace__grade-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Units</th>
                          <th>Grade</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeSummary.subjects.map((subject, index) => (
                          <tr key={`${subject.subjectId || subject.code || 'subject'}-${index}`}>
                            <td>
                              <strong>{subject.code || '—'}</strong>
                              <span>{subject.title || ''}</span>
                            </td>
                            <td>{subject.units ?? '—'}</td>
                            <td>{gradeLabel(subject.grade, subject.gradeMark, subject.status)}</td>
                            <td>{subject.status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="student-workspace__popup-empty">No subjects are recorded for the latest enrollment.</p>
                )}
              </section>
            ) : null}

            {retakeSubjects.length ? (
              <section className="student-workspace__popup-section student-workspace__popup-section--warning">
                <div className="student-workspace__popup-section-head">
                  <div>
                    <span className="student-workspace__eyebrow">
                      <AlertTriangle size={14} aria-hidden="true" /> Retake required
                    </span>
                    <h3>{retakeSubjects.length} subject{retakeSubjects.length === 1 ? '' : 's'} need another attempt</h3>
                  </div>
                </div>
                <ul className="student-workspace__retake-list">
                  {retakeSubjects.map((subject, index) => (
                    <li key={`${subject.subjectId || subject.code || 'retake'}-${index}`}>
                      <strong>{subject.code || '—'}</strong>
                      <span>{subject.title || ''}</span>
                      <em>{subject.outcome}{subject.gradeMark ? ` · ${subject.gradeMark}` : ''}</em>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="student-workspace__primary-button"
              onClick={() => onAssignBlock(student)}
              disabled={assignBlockDisabled}
              title={assignBlockDisabled ? assignBlockHint : undefined}
            >
              <Blocks size={16} />
              {assignBlockDisabled ? 'Cannot Enroll Yet' : 'Assign Block'}
            </button>
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

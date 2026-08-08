import { Blocks, Mail, Phone, X } from 'lucide-react'
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
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'

export default function StudentInfoPopup({
  student,
  onClose,
  onAssignBlock
}: {
  student: StudentData
  onClose: () => void
  onAssignBlock: (student: StudentData) => void
}) {
  const blockLabel = String(student.section || '').trim()

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
                <span className="label">Course</span>
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
            </div>
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose}>
              Close
            </button>
            <button type="button" className="student-workspace__primary-button" onClick={() => onAssignBlock(student)}>
              <Blocks size={16} />
              Assign Block
            </button>
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

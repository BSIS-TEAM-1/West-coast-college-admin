import { useEffect, useState } from 'react'
import { ArrowLeft, Calendar, GraduationCap, History, Lock, BookOpen, FileText, AlertCircle } from 'lucide-react'
import StudentService from '../../lib/studentApi'
import type { StudentData } from '../../lib/studentApi'
import { getStoredToken } from '../../lib/authApi'
import {
  courseShortLabel,
  extractResponseData,
  formatBlockDisplay,
  formatYearLevel,
  studentDisplayName,
  studentNumberDisplay
} from '../../lib/blockAssignmentShared'
import './StudentHistoryPage.css'

type EnrollmentRecord = {
  _id: string
  schoolYear: string
  semester: string
  yearLevel?: number
  status: string
  isCurrent?: boolean
  lockedAt?: string | null
  lockedBy?: string | null
  rolloverBatchId?: string | null
  previousEnrollmentId?: string | null
  remarks?: string
  subjects: { subjectId?: string; code: string; title: string; units?: number; schedule?: string; room?: string; instructor?: string; status?: string }[]
  assessment?: {
    tuitionFee?: number
    miscFee?: number
    otherFees?: number
    totalAmount?: number
    balance?: number
    paymentStatus?: string
  }
  createdAt: string
  updatedAt?: string
}

type StudentHistoryPageProps = {
  studentId: string
  onBack: () => void
}

function formatDate(value?: string) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value?: string) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(value?: number) {
  if (value == null || Number.isNaN(value)) return '₱0.00'
  return `₱${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TERMINAL_STATUSES = ['Completed', 'Retained', 'Graduated', 'Dropped']

function isLocked(record: EnrollmentRecord) {
  return Boolean(record.lockedAt) || TERMINAL_STATUSES.includes(record.status)
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'enrolled') return 'success'
  if (normalized === 'completed') return 'info'
  if (normalized === 'graduated') return 'accent'
  if (normalized === 'retained') return 'warning'
  if (normalized === 'dropped') return 'danger'
  return 'neutral'
}

export default function StudentHistoryPage({ studentId, onBack }: StudentHistoryPageProps) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [history, setHistory] = useState<EnrollmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setLoading(true)
      setError('')

      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')

        const studentResponse = await StudentService.getStudentById(token, studentId)
        const detailStudent = extractResponseData<StudentData>(studentResponse)

        const historyResponse = await StudentService.getEnrollmentHistory(token, studentId)
        const historyRecords = extractResponseData<EnrollmentRecord[]>(historyResponse) || []

        if (cancelled) return

        setStudent(detailStudent)
        setHistory(historyRecords)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load student history')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [studentId])

  const sortedHistory = [...history].sort((a, b) => {
    const aYear = Number(String(a.schoolYear || '').split('-')[0]) || 0
    const bYear = Number(String(b.schoolYear || '').split('-')[0]) || 0
    if (bYear !== aYear) return bYear - aYear
    const semOrder: Record<string, number> = { '1st': 1, '2nd': 2, Summer: 3 }
    return (semOrder[b.semester] || 0) - (semOrder[a.semester] || 0)
  })

  const lockedCount = sortedHistory.filter(isLocked).length
  const activeEnrollment = sortedHistory.find((r) => r.isCurrent) || null

  return (
    <div className="student-history-page">
      <header className="student-history-page__header">
        <div className="student-history-page__header-left">
          <button type="button" className="student-history-page__back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to Students
          </button>
          <span className="student-history-page__eyebrow">Academic Timeline</span>
          <h2>{student ? studentDisplayName(student) : 'Loading…'}</h2>
          {student ? (
            <div className="student-history-page__summary">
              <span><strong>{studentNumberDisplay(student)}</strong></span>
              <span>Course: <strong>{courseShortLabel(student.course)}</strong></span>
              <span>Year: <strong>{formatYearLevel(student.yearLevel)}</strong></span>
              <span>Block: <strong>{formatBlockDisplay(student.section)}</strong></span>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="student-history-page__loading">
          <History size={32} className="student-history-page__loading-icon" />
          <p>Loading academic history…</p>
        </div>
      ) : error ? (
        <div className="student-history-page__error">
          <AlertCircle size={24} />
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="student-history-page__stats">
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--total">
                <BookOpen size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{sortedHistory.length}</span>
                <span className="student-history-page__stat-label">Total Enrollments</span>
              </div>
            </div>
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--locked">
                <Lock size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{lockedCount}</span>
                <span className="student-history-page__stat-label">Locked Records</span>
              </div>
            </div>
            <div className="student-history-page__stat-card">
              <div className="student-history-page__stat-icon student-history-page__stat-icon--active">
                <GraduationCap size={20} />
              </div>
              <div>
                <span className="student-history-page__stat-value">{activeEnrollment ? '1' : '0'}</span>
                <span className="student-history-page__stat-label">Active Enrollment</span>
              </div>
            </div>
          </div>

          <section className="student-history-page__section">
            <div className="student-history-page__section-header">
              <h3>
                <FileText size={18} />
                Enrollment History
              </h3>
              <p>Chronological record of all enrollments. Locked records are immutable historical snapshots.</p>
            </div>

            {sortedHistory.length ? (
              <div className="student-history-page__timeline">
                {sortedHistory.map((record, index) => {
                  const locked = isLocked(record)
                  const isLast = index === sortedHistory.length - 1

                  return (
                    <div key={record._id} className={`student-history-page__timeline-item ${locked ? 'student-history-page__timeline-item--locked' : ''}`}>
                      <div className="student-history-page__timeline-marker">
                        <div className={`student-history-page__timeline-dot ${locked ? 'student-history-page__timeline-dot--locked' : ''}`} />
                        {!isLast ? <div className="student-history-page__timeline-line" /> : null}
                      </div>
                      <div className="student-history-page__timeline-content">
                        <div className="student-history-page__timeline-card">
                          <div className="student-history-page__timeline-card-header">
                            <div>
                              <strong>{record.semester} · {record.schoolYear}</strong>
                              {record.yearLevel ? <span className="student-history-page__year-badge">{formatYearLevel(record.yearLevel)}</span> : null}
                            </div>
                            <div className="student-history-page__timeline-badges">
                              <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(record.status)}`}>
                                {record.status}
                              </span>
                              {record.isCurrent ? (
                                <span className="student-history-page__status-badge student-history-page__status-badge--current">
                                  Active
                                </span>
                              ) : null}
                              {locked ? (
                                <span className="student-history-page__status-badge student-history-page__status-badge--locked">
                                  <Lock size={12} />
                                  Locked
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="student-history-page__timeline-details">
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Subjects</span>
                              <span className="student-history-page__detail-value">{record.subjects?.length || 0}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Payment Status</span>
                              <span className="student-history-page__detail-value">{record.assessment?.paymentStatus || 'N/A'}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Total Assessment</span>
                              <span className="student-history-page__detail-value">{formatCurrency(record.assessment?.totalAmount)}</span>
                            </div>
                            <div className="student-history-page__detail-row">
                              <span className="student-history-page__detail-label">Balance</span>
                              <span className="student-history-page__detail-value">{formatCurrency(record.assessment?.balance)}</span>
                            </div>
                            {locked && record.lockedAt ? (
                              <div className="student-history-page__detail-row">
                                <span className="student-history-page__detail-label">Locked On</span>
                                <span className="student-history-page__detail-value">{formatDate(record.lockedAt)}</span>
                              </div>
                            ) : null}
                            {record.rolloverBatchId ? (
                              <div className="student-history-page__detail-row">
                                <span className="student-history-page__detail-label">Rollover Batch</span>
                                <span className="student-history-page__detail-value student-history-page__detail-value--mono">{record.rolloverBatchId}</span>
                              </div>
                            ) : null}
                          </div>

                          {record.subjects?.length ? (
                            <div className="student-history-page__subjects">
                              <span className="student-history-page__subjects-label">Enrolled Subjects</span>
                              <div className="student-history-page__subject-chips">
                                {record.subjects.map((subject, subIndex) => (
                                  <span key={`${subject.code}-${subIndex}`} className="student-history-page__subject-chip">
                                    <strong>{subject.code}</strong>
                                    <small>{subject.title}</small>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="student-history-page__timeline-footer">
                            <span><Calendar size={12} /> Created {formatDate(record.createdAt)}</span>
                            {record.updatedAt && record.updatedAt !== record.createdAt ? (
                              <span>Updated {formatDateTime(record.updatedAt)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="student-history-page__empty">
                <History size={32} />
                <p>No enrollment history records found.</p>
              </div>
            )}
          </section>

          <section className="student-history-page__section">
            <div className="student-history-page__section-header">
              <h3>
                <History size={18} />
                Lifecycle History
              </h3>
              <p>Student record creation and enrollment status changes over time.</p>
            </div>

            <div className="student-history-page__timeline">
              {student ? (
                <div className="student-history-page__timeline-item">
                  <div className="student-history-page__timeline-marker">
                    <div className="student-history-page__timeline-dot student-history-page__timeline-dot--created" />
                    <div className="student-history-page__timeline-line" />
                  </div>
                  <div className="student-history-page__timeline-content">
                    <div className="student-history-page__timeline-card student-history-page__timeline-card--lifecycle">
                      <div className="student-history-page__timeline-card-header">
                        <div>
                          <strong>Student record created</strong>
                        </div>
                      </div>
                      <div className="student-history-page__timeline-footer">
                        <span><Calendar size={12} /> {formatDateTime(student.createdAt)}</span>
                        <span>{studentNumberDisplay(student)} · {courseShortLabel(student.course)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {sortedHistory.map((record) => (
                <div key={`lifecycle-${record._id}`} className="student-history-page__timeline-item">
                  <div className="student-history-page__timeline-marker">
                    <div className={`student-history-page__timeline-dot ${isLocked(record) ? 'student-history-page__timeline-dot--locked' : ''}`} />
                  </div>
                  <div className="student-history-page__timeline-content">
                    <div className="student-history-page__timeline-card student-history-page__timeline-card--lifecycle">
                      <div className="student-history-page__timeline-card-header">
                        <div>
                          <strong>{record.status}</strong>
                        </div>
                        <div className="student-history-page__timeline-badges">
                          <span className={`student-history-page__status-badge student-history-page__status-badge--${statusTone(record.status)}`}>
                            {record.status}
                          </span>
                        </div>
                      </div>
                      <div className="student-history-page__timeline-footer">
                        <span><Calendar size={12} /> {record.semester} · {record.schoolYear} · {record.subjects?.length || 0} subjects</span>
                        <span>{formatDateTime(record.updatedAt || record.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

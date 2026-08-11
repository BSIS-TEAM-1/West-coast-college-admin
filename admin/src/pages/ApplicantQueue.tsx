import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getRegistrarApplicants,
  updateApplicantStatus,
  type ApplicantRecord,
  type ApplicantStatus
} from '../lib/applicantApi'
import './ApplicantQueue.css'

const MENU_WIDTH = 170
const MENU_HEIGHT_ESTIMATE = 130
const MENU_MARGIN = 8

const statuses: Array<ApplicantStatus | 'all'> = [
  'Submitted',
  'Incomplete Requirements',
  'For Evaluation',
  'Approved for Enrollment',
  'Enrolled',
  'Rejected',
  'Cancelled'
]

const reviewStatuses = statuses.filter((status): status is ApplicantStatus => status !== 'all')

const formatDate = (date: string) => {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'N/A'

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(parsed)
}

const getApplicantName = (applicant: ApplicantRecord) =>
  applicant.fullName || [applicant.firstName, applicant.middleName, applicant.lastName, applicant.suffix]
    .filter(Boolean)
    .join(' ')

const getCourseLabel = (applicant: ApplicantRecord) =>
  applicant.course
    ? `${applicant.course.code} - ${applicant.course.name}`
    : String(applicant.selectedCourse)

const getCourseCode = (applicant: ApplicantRecord) =>
  applicant.course?.code || String(applicant.selectedCourse)

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

const getStatusClass = (status: ApplicantStatus) => {
  if (status === 'Submitted') return 'applicant-status-pending'
  if (status === 'For Evaluation' || status === 'Incomplete Requirements') return 'applicant-status-review'
  if (status === 'Approved for Enrollment' || status === 'Enrolled') return 'applicant-status-approved'
  if (status === 'Rejected' || status === 'Cancelled') return 'applicant-status-rejected'
  return 'applicant-status-neutral'
}

export default function ApplicantQueue() {
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [statusFilter, setStatusFilter] = useState<ApplicantStatus | 'all'>('Submitted')
  const [programFilter, setProgramFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [remarks, setRemarks] = useState('')
  const [nextStatus, setNextStatus] = useState<ApplicantStatus>('For Evaluation')
  const [openMenuId, setOpenMenuId] = useState('')
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null)
  const [menuMounted, setMenuMounted] = useState(false)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; isError?: boolean }>>([])

  const addToast = useCallback((message: string, isError = false) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, message, isError }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const computeMenuPosition = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const fitsDown = rect.bottom + MENU_HEIGHT_ESTIMATE + MENU_MARGIN <= viewportHeight
    const placement: 'top' | 'bottom' = fitsDown ? 'bottom' : 'top'

    let top = placement === 'bottom'
      ? rect.bottom + MENU_MARGIN
      : rect.top - MENU_HEIGHT_ESTIMATE - MENU_MARGIN

    let left = Math.max(MENU_MARGIN, rect.right - MENU_WIDTH)
    if (left + MENU_WIDTH + MENU_MARGIN > viewportWidth) {
      left = Math.max(MENU_MARGIN, viewportWidth - MENU_WIDTH - MENU_MARGIN)
    }

    top = Math.max(MENU_MARGIN, Math.min(top, viewportHeight - MENU_HEIGHT_ESTIMATE - MENU_MARGIN))

    return { top, left, placement }
  }

  const openMenu = (applicantId: string) => {
    const button = buttonRefs.current[applicantId]
    if (!button) return
    const position = computeMenuPosition(button)
    setMenuPosition(position)
    setOpenMenuId(applicantId)
    setMenuMounted(true)
  }

  const closeMenu = () => {
    setOpenMenuId('')
    setMenuMounted(false)
    setMenuPosition(null)
  }

  useEffect(() => {
    if (!openMenuId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target) && !buttonRefs.current[openMenuId]?.contains(target)) {
        closeMenu()
      }
    }
    const handleReposition = () => {
      const button = buttonRefs.current[openMenuId]
      if (button) setMenuPosition(computeMenuPosition(button))
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [openMenuId])

  const programs = useMemo(() => {
    const uniquePrograms = new Map<string, string>()
    applicants.forEach((applicant) => {
      const code = getCourseCode(applicant)
      uniquePrograms.set(code, getCourseLabel(applicant))
    })
    return Array.from(uniquePrograms.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [applicants])

  const visibleApplicants = useMemo(() => {
    if (programFilter === 'all') return applicants
    return applicants.filter((applicant) => getCourseCode(applicant) === programFilter)
  }, [applicants, programFilter])

  const selected = useMemo(
    () => applicants.find((applicant) => applicant._id === selectedId) || visibleApplicants[0],
    [applicants, selectedId, visibleApplicants]
  )

  const statusSummary = useMemo(() => {
    return applicants.reduce<Record<string, number>>((summary, applicant) => {
      summary[applicant.status] = (summary[applicant.status] || 0) + 1
      return summary
    }, {})
  }, [applicants])

  const loadApplicants = async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getRegistrarApplicants({
        status: statusFilter,
        q: query.trim()
      })
      setApplicants(data)
      setProgramFilter((current) => {
        if (current === 'all') return current
        return data.some((applicant) => getCourseCode(applicant) === current) ? current : 'all'
      })
      setSelectedId((current) => {
        if (data.some((applicant) => applicant._id === current)) return current
        return data[0]?._id || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applicants.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApplicants()
  }, [statusFilter])

  useEffect(() => {
    if (!selected) return
    setRemarks(selected.registrarRemarks || '')
    setNextStatus(selected.status === 'Draft' ? 'Submitted' : selected.status)
  }, [selected?._id])

  const handleStatusUpdate = async () => {
    if (!selected) return
    setSaving(true)
    setError('')

    try {
      const { data: updated, emailNotification, studentNotification } = await updateApplicantStatus(selected._id, {
        status: nextStatus,
        registrarRemarks: remarks
      })
      setApplicants((current) => current.map((item) => item._id === updated._id ? updated : item))
      setOpenMenuId('')

      if (emailNotification) {
        if (emailNotification.sent) {
          addToast(`Notification email sent to ${emailNotification.recipient || selected.email} via ${emailNotification.provider}.`)
        } else {
          addToast(`Failed to send email notification: ${emailNotification.error || 'unknown error'}`, true)
        }
      }

      if (studentNotification) {
        if (studentNotification.upserted) {
          const verb = studentNotification.alreadyEnrolled
            ? 'already enrolled'
            : studentNotification.updated
              ? 'updated'
              : studentNotification.created
                ? 'created'
                : 'processed'
          const { studentNumber, fullName, lifecycleStatus } = studentNotification
          const identifier = studentNumber ? ` (${studentNumber})` : ''
          const namePart = fullName ? ` for ${fullName}` : ''
          addToast(`Student record ${verb}${identifier}${namePart}${lifecycleStatus ? ` - lifecycle: ${lifecycleStatus}` : ''}.`)
        } else {
          addToast(`Failed to update student record: ${studentNotification.error || 'unknown error'}`, true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update applicant.')
    } finally {
      setSaving(false)
    }
  }

  const handleSelectForReview = (applicantId: string) => {
    setSelectedId(applicantId)
    setOpenMenuId('')
    window.requestAnimationFrame(() => {
      document.getElementById('applicant-review-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    })
  }

  const handleExportCsv = () => {
    const headers = ['Applicant', 'Applicant Number', 'Email', 'Phone', 'Program', 'Date', 'Status']
    const rows = visibleApplicants.map((applicant) => [
      getApplicantName(applicant),
      applicant.applicantNumber,
      applicant.email,
      applicant.phoneNumber,
      getCourseLabel(applicant),
      formatDate(applicant.createdAt),
      applicant.status
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `applicant-queue-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="applicant-queue-page">
      <header className="applicant-queue-hero">
        <div>
          <span className="applicant-queue-kicker">Registrar Review</span>
          <h1>Applicant Queue</h1>
          <p>
            Managing {visibleApplicants.length.toLocaleString()} visible applications
            {statusFilter === 'all' ? ' across all statuses.' : ` marked ${statusFilter}.`}
          </p>
        </div>

        <div className="applicant-queue-header-actions">
          <button type="button" className="applicant-queue-outline-btn" onClick={handleExportCsv} disabled={loading || visibleApplicants.length === 0}>
            Export CSV
          </button>
          <button type="button" className="applicant-queue-primary-btn" onClick={() => void loadApplicants()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Queue'}
          </button>
        </div>
      </header>

      <section className="applicant-queue-stats" aria-label="Applicant status summary">
        <article>
          <span>Total</span>
          <strong>{applicants.length.toLocaleString()}</strong>
        </article>
        <article>
          <span>Submitted</span>
          <strong>{(statusSummary.Submitted || 0).toLocaleString()}</strong>
        </article>
        <article>
          <span>For Evaluation</span>
          <strong>{(statusSummary['For Evaluation'] || 0).toLocaleString()}</strong>
        </article>
        <article>
          <span>Approved</span>
          <strong>{((statusSummary['Approved for Enrollment'] || 0) + (statusSummary.Enrolled || 0)).toLocaleString()}</strong>
        </article>
      </section>

      <section className="applicant-queue-filters" aria-label="Applicant filters">
        <label>
          <span>Search Applicant</span>
          <div className="applicant-input-icon">
            <span className="material-symbols-outlined" aria-hidden="true">person_search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadApplicants()
              }}
              placeholder="Name, email, phone, or ID"
            />
          </div>
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApplicantStatus | 'all')}>
            {statuses.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Program</span>
          <select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)}>
            <option value="all">All programs</option>
            {programs.map((program) => (
              <option key={program.value} value={program.value}>{program.label}</option>
            ))}
          </select>
        </label>

        <button type="button" onClick={() => void loadApplicants()} disabled={loading}>
          Apply Filters
        </button>
      </section>

      {error ? <div className="applicant-queue-error">{error}</div> : null}

      <section className="applicant-queue-table-card">
        <div className="applicant-queue-table-scroll">
          <table className="applicant-queue-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>ID</th>
                <th>Program</th>
                <th>Date</th>
                <th>Status</th>
                <th className="applicant-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <p className="applicant-queue-empty">Loading applicants...</p>
                  </td>
                </tr>
              ) : visibleApplicants.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="applicant-queue-empty">No applicants found.</p>
                  </td>
                </tr>
              ) : visibleApplicants.map((applicant) => {
                const applicantName = getApplicantName(applicant)
                const isSelected = selected?._id === applicant._id

                return (
                  <tr key={applicant._id} className={isSelected ? 'is-selected' : undefined}>
                    <td>
                      <div className="applicant-person-cell">
                        <span className="applicant-avatar" aria-hidden="true">{getInitials(applicantName)}</span>
                        <div>
                          <strong>{applicantName}</strong>
                          <span>{applicant.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="applicant-muted-cell">{applicant.applicantNumber}</td>
                    <td>
                      <strong className="applicant-program-name">{getCourseLabel(applicant)}</strong>
                      <span className="applicant-program-meta">Year {applicant.requestedYearLevel} - {applicant.semester}</span>
                    </td>
                    <td className="applicant-muted-cell">{formatDate(applicant.createdAt)}</td>
                    <td>
                      <span className={`applicant-status-badge ${getStatusClass(applicant.status)}`}>
                        {applicant.status}
                      </span>
                    </td>
                    <td>
                      <div className="applicant-row-actions">
                        <button
                          type="button"
                          className="applicant-review-btn"
                          onClick={() => handleSelectForReview(applicant._id)}
                        >
                          {applicant.status === 'Approved for Enrollment' || applicant.status === 'Enrolled' ? 'View' : 'Review'}
                        </button>
                        <div className="applicant-more-wrap">
                          <button
                            type="button"
                            className="applicant-more-btn"
                            aria-label={`More actions for ${applicantName}`}
                            aria-expanded={openMenuId === applicant._id}
                            ref={(element) => { buttonRefs.current[applicant._id] = element }}
                            onClick={() => openMenu(applicant._id)}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="applicant-queue-pagination">
          <p>
            Showing {visibleApplicants.length === 0 ? 0 : 1} to {visibleApplicants.length.toLocaleString()} of {visibleApplicants.length.toLocaleString()} entries
          </p>
          <div>
            <button type="button" disabled aria-label="Previous page">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <button type="button" className="is-active">1</button>
            <button type="button" disabled aria-label="Next page">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>
      </section>

      <section className="applicant-review-panel" id="applicant-review-panel">
        {!selected ? (
          <p className="applicant-queue-empty">Select an applicant to review.</p>
        ) : (
          <>
            <div className="applicant-review-heading">
              <div>
                <span>{selected.applicantNumber}</span>
                <h2>{getApplicantName(selected)}</h2>
              </div>
              <span className={`applicant-status-badge ${getStatusClass(selected.status)}`}>{selected.status}</span>
            </div>

            <div className="applicant-detail-grid">
              <Detail label="Email" value={selected.email} />
              <Detail label="Phone" value={selected.phoneNumber} />
              <Detail label="Applicant Type" value={selected.applicantType} />
              <Detail label="Course" value={getCourseLabel(selected)} />
              <Detail label="Requested Year" value={`Year ${selected.requestedYearLevel}`} />
              <Detail label="School Year" value={selected.schoolYear || 'N/A'} />
              <Detail label="Address" value={selected.currentAddress} />
              <Detail label="Guardian" value={selected.guardianName || 'N/A'} />
              <Detail label="Guardian Contact" value={selected.guardianContactNumber} />
              <Detail label="Emergency Contact" value={`${selected.emergencyContact.name} (${selected.emergencyContact.relationship})`} />
              <Detail label="Elementary" value={selected.academicDetails.elementary.schoolName} />
              <Detail label="Elementary GPA" value={selected.academicDetails.elementary.generalAverage || 'N/A'} />
              <Detail label="High School" value={selected.academicDetails.highSchool.schoolName} />
              <Detail label="High School GPA" value={selected.academicDetails.highSchool.generalAverage || 'N/A'} />
              <Detail label="Senior High School" value={selected.academicDetails.seniorHighSchool?.schoolName || 'N/A'} />
              <Detail label="Strand / Track" value={selected.academicDetails.seniorHighSchool?.strandOrTrack || 'N/A'} />
            </div>

            <div className="applicant-review-actions">
              <h3>Registrar Action</h3>
              <label>
                <span>Status</span>
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ApplicantStatus)}>
                  {reviewStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Remarks</span>
                <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Notes for registrar processing" />
              </label>
              <button type="button" onClick={handleStatusUpdate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Review'}
              </button>
            </div>
          </>
        )}
      </section>
      {menuMounted && menuPosition && (
        <>
          {createPortal(
            <div
              ref={menuRef}
              className="applicant-more-menu applicant-more-menu-portal"
              data-placement={menuPosition.placement}
              style={{ top: menuPosition.top, left: menuPosition.left }}
              role="menu"
              aria-label="Applicant actions"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handleSelectForReview(openMenuId)
                  closeMenu()
                }}
              >
                Open Review
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelectedId(openMenuId)
                  setNextStatus('Incomplete Requirements')
                  closeMenu()
                }}
              >
                Request Info
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelectedId(openMenuId)
                  setNextStatus('Rejected')
                  closeMenu()
                }}
              >
                Prepare Reject
              </button>
            </div>,
            document.body
          )}
        </>
      )}
      {toasts.length > 0 && createPortal(
        <div className="applicant-toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`applicant-toast${t.isError ? ' applicant-toast--error' : ''}`}>
              <span>{t.message}</span>
              <button type="button" className="applicant-toast__close" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Close notification">×</button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="applicant-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

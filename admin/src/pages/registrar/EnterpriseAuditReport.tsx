import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Download, CheckCircle, XCircle,
  Activity, Archive, RefreshCw, ChevronDown, ChevronRight,
  AlertOctagon, AlertTriangle, XCircle as XIcon,
  Users, ClipboardList, Layers, Calendar, Clock,
} from 'lucide-react'
import { fetchAuditReport } from '../../lib/rolloverApi'
import type { AuditReportData, AuditLogEntry, BlockActionLogEntry } from '../../lib/rolloverApi'
import './EnterpriseAuditReport.css'

type TabId = 'activity' | 'block-actions' | 'rollover-history'

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  APPROVE: 'Approve',
  REJECT: 'Reject',
  ARCHIVE: 'Archive',
  RESTORE: 'Restore',
  EXPORT: 'Export',
}

const RESOURCE_LABELS: Record<string, string> = {
  STUDENT: 'Student',
  FACULTY: 'Faculty',
  COURSE: 'Course',
  REGISTRATION: 'Registration',
  SYSTEM: 'Rollover',
}

const SNAPSHOT_TYPE_LABELS: Record<string, string> = {
  ENROLLMENT_SNAPSHOT: 'Enrollment Snapshot',
  PROMOTION_REPORT: 'Promotion Report',
  RETENTION_REPORT: 'Retention Report',
  GRADUATION_REPORT: 'Graduation Report',
  BLOCK_SNAPSHOT: 'Block Snapshot',
  ROLLOVER_AUDIT: 'Rollover Audit',
  STUDENT_ARCHIVE: 'Student Archive',
  GRADES_ARCHIVE: 'Grades Archive',
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString()
}

function formatRelative(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'SUCCESS': return <CheckCircle size={14} className="audit-status-icon audit-status-icon--success" />
    case 'FAILED': return <XCircle size={14} className="audit-status-icon audit-status-icon--failed" />
    case 'PARTIAL': return <AlertTriangle size={14} className="audit-status-icon audit-status-icon--partial" />
    default: return <Activity size={14} />
  }
}

function EmptyState({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="audit-empty-state">
      <div className="audit-empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  )
}

export default function EnterpriseAuditReport() {
  const [data, setData] = useState<AuditReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('activity')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    sortOrder: 'newest',
    performedBy: '',
    startDate: '',
    endDate: '',
  })
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set())

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await fetchAuditReport({
        ...filters,
        sortOrder: filters.sortOrder as 'newest' | 'oldest',
        page,
        limit: 25,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit report')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({
      action: '', resourceType: '',
      sortOrder: 'newest', performedBy: '', startDate: '', endDate: '',
    })
    setSearchInput('')
    setSearchTerm('')
    setPage(1)
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSnapshot = (id: string) => {
    setExpandedSnapshots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportCSV = () => {
    if (!data?.activity.logs.length) return
    const lines = [
      ['Date', 'Action', 'Resource', 'Description', 'User', 'Role', 'IP'].join(','),
      ...data.activity.logs.map((log) =>
        [
          new Date(log.createdAt).toISOString(),
          log.action,
          log.resourceType,
          `"${log.description.replace(/"/g, '""')}"`,
          log.performedBy?.displayName || log.performedBy?.username || 'System',
          log.performedByRole,
          log.ipAddress || '',
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([lines], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = useMemo(() => {
    if (!data?.activity.logs) return []
    const query = searchTerm.trim().toLowerCase()
    if (!query) return data.activity.logs
    return data.activity.logs.filter((log) =>
      [
        log.action, log.resourceType, log.resourceName,
        log.description, log.status,
        log.performedBy?.displayName, log.performedBy?.username,
        log.ipAddress,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(query))
    )
  }, [data?.activity.logs, searchTerm])

  const stats = data?.stats
  const hasActiveFilters = Object.values(filters).some((v) => v !== '' && v !== 'newest')

  if (loading && !data) {
    return (
      <div className="audit-report">
        <div className="audit-report__loading">
          <RefreshCw size={24} className="audit-report__spin" />
          <p>Loading audit report...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="audit-report">
        <div className="audit-report__error">
          <AlertOctagon size={24} />
          <p>{error}</p>
          <button className="audit-report__retry" onClick={fetchReport}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-report">
      {/* Header with context */}
      <div className="audit-report__header">
        <div className="audit-report__header-left">
          <span className="audit-report__eyebrow">Academic Compliance</span>
          <h1>Academic Audit Dashboard</h1>
          <div className="audit-report__context-bar">
            <span className="audit-report__context-item">
              <Calendar size={13} />
              {filters.startDate || filters.endDate
                ? `${filters.startDate || '…'} → ${filters.endDate || '…'}`
                : 'Last 30 days (default)'}
            </span>
            <span className="audit-report__context-item">
              <Clock size={13} />
              {data ? `Updated ${formatRelative(new Date().toISOString())}` : 'Loading…'}
            </span>
          </div>
        </div>
        <div className="audit-report__header-actions">
          <button
            className="audit-report__btn audit-report__btn--ghost"
            onClick={fetchReport}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'audit-report__spin' : ''} />
            Refresh
          </button>
          <button
            className="audit-report__btn audit-report__btn--primary"
            onClick={exportCSV}
            disabled={!data?.activity?.logs?.length}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="audit-report__kpi-grid">
          <div className="audit-report__kpi-card">
            <div className="audit-report__kpi-top">
              <div className="audit-report__kpi-icon">
                <Users size={18} />
              </div>
              <div className="audit-report__kpi-body">
                <span>Student Record Changes</span>
                <strong>{(stats.resourceStats.find((s) => s._id === 'STUDENT')?.count || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <div className="audit-report__kpi-card">
            <div className="audit-report__kpi-top">
              <div className="audit-report__kpi-icon">
                <ClipboardList size={18} />
              </div>
              <div className="audit-report__kpi-body">
                <span>Enrollment Events</span>
                <strong>{(stats.resourceStats.find((s) => s._id === 'REGISTRATION')?.count || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <div className="audit-report__kpi-card">
            <div className="audit-report__kpi-top">
              <div className="audit-report__kpi-icon">
                <Archive size={18} />
              </div>
              <div className="audit-report__kpi-body">
                <span>Rollover Events</span>
                <strong>{(stats.actionStats.find((s) => s._id === 'ARCHIVE')?.count || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <div className="audit-report__kpi-card">
            <div className="audit-report__kpi-top">
              <div className="audit-report__kpi-icon">
                <Layers size={18} />
              </div>
              <div className="audit-report__kpi-body">
                <span>Block Actions</span>
                <strong>{(data?.blockActions?.length || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs with badges */}
      <div className="audit-report__tabs">
        <button
          className={`audit-report__tab ${activeTab === 'activity' ? 'audit-report__tab--active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <Activity size={16} />
          Activity Log
          {data?.activity?.total != null && data.activity.total > 0 && (
            <span className="audit-report__tab-badge">{data.activity.total.toLocaleString()}</span>
          )}
        </button>
        <button
          className={`audit-report__tab ${activeTab === 'block-actions' ? 'audit-report__tab--active' : ''}`}
          onClick={() => setActiveTab('block-actions')}
        >
          <Layers size={16} />
          Block Actions
          {data?.blockActions?.length != null && data.blockActions.length > 0 && (
            <span className="audit-report__tab-badge">{data.blockActions.length}</span>
          )}
        </button>
        <button
          className={`audit-report__tab ${activeTab === 'rollover-history' ? 'audit-report__tab--active' : ''}`}
          onClick={() => setActiveTab('rollover-history')}
        >
          <Archive size={16} />
          Rollover History
          {data?.rolloverHistory?.length != null && data.rolloverHistory.length > 0 && (
            <span className="audit-report__tab-badge">{data.rolloverHistory.length}</span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="audit-report__content">
        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="audit-report__activity">
            {/* Filter Bar */}
            <div className="audit-report__filter-bar">
              <div className="audit-report__search-box">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Search academic events..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchTerm(searchInput.trim())
                      setPage(1)
                    }
                  }}
                  onBlur={() => {
                    if (searchInput.trim() !== searchTerm) {
                      setSearchTerm(searchInput.trim())
                      setPage(1)
                    }
                  }}
                />
                {searchInput && (
                  <button
                    className="audit-report__search-clear"
                    onClick={() => { setSearchInput(''); setSearchTerm(''); setPage(1) }}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>

              <select
                className="audit-report__select"
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
              >
                <option value="">All Actions</option>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <select
                className="audit-report__select"
                value={filters.resourceType}
                onChange={(e) => handleFilterChange('resourceType', e.target.value)}
              >
                <option value="">All Resources</option>
                {Object.entries(RESOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <select
                className="audit-report__select audit-report__select--compact"
                value={filters.sortOrder}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>

              <div className="audit-report__date-range">
                <input
                  type="date"
                  className="audit-report__date-input"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  title="From date"
                />
                <input
                  type="date"
                  className="audit-report__date-input"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  title="To date"
                />
              </div>

              {hasActiveFilters && (
                <button className="audit-report__btn audit-report__btn--ghost audit-report__btn--sm" onClick={clearFilters}>
                  Clear Filters
                </button>
              )}
            </div>

            {/* Activity Table */}
            <div className="audit-report__table-wrapper">
              <table className="audit-report__table">
                <thead>
                  <tr>
                    <th className="audit-report__th-expand"></th>
                    <th>Date / Time</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Description</th>
                    <th>User</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="audit-report__empty-row">
                        <EmptyState
                          icon={<Search size={32} />}
                          title="No audit entries found"
                          message="Try adjusting your filters or date range to find academic audit events."
                        />
                      </td>
                    </tr>
                  )}
                  {filteredLogs.map((log: AuditLogEntry) => {
                    const isExpanded = expandedRows.has(log._id)
                    const hasDetails = log.oldValue || log.newValue
                    return (
                      <AuditRow
                        key={log._id}
                        log={log}
                        isExpanded={isExpanded}
                        hasDetails={!!hasDetails}
                        onToggle={() => toggleRow(log._id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.activity.totalPages > 1 && (
              <div className="audit-report__pagination">
                <span>
                  Page {data.activity.page} of {data.activity.totalPages}
                  {' '}({data.activity.total.toLocaleString()} total)
                </span>
                <div className="audit-report__pagination-buttons">
                  <button
                    className="audit-report__btn audit-report__btn--ghost audit-report__btn--sm"
                    disabled={data.activity.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="audit-report__btn audit-report__btn--ghost audit-report__btn--sm"
                    disabled={data.activity.page >= data.activity.totalPages}
                    onClick={() => setPage((p) => Math.min(data.activity.totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Block Actions Tab */}
        {activeTab === 'block-actions' && (
          <div className="audit-report__block-actions">
            {(!data?.blockActions || data.blockActions.length === 0) && !loading && (
              <EmptyState
                icon={<Layers size={40} />}
                title="No block action logs"
                message="Block assignment changes, overrides, and transfers will appear here once block operations are performed."
              />
            )}
            {data?.blockActions && data.blockActions.length > 0 && (
              <div className="audit-report__table-wrapper">
                <table className="audit-report__table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Action Type</th>
                      <th>Section</th>
                      <th>Student ID</th>
                      <th>Registrar ID</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.blockActions.map((log: BlockActionLogEntry) => (
                      <tr key={log._id} className="audit-report__row">
                        <td className="audit-report__td-date">
                          <span className="audit-report__date-full">{formatDate(log.timestamp)}</span>
                          <span className="audit-report__date-relative">{formatRelative(log.timestamp)}</span>
                        </td>
                        <td>
                          <span className="audit-report__action-tag">{log.actionType}</span>
                        </td>
                        <td>{log.sectionCode || log.sectionId || '—'}</td>
                        <td>{log.studentId}</td>
                        <td>{log.registrarId}</td>
                        <td className="audit-report__td-description" title={log.reason || ''}>
                          {log.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Rollover History Tab */}
        {activeTab === 'rollover-history' && (
          <div className="audit-report__history">
            {(!data?.rolloverHistory || data.rolloverHistory.length === 0) && !loading && (
              <EmptyState
                icon={<Archive size={40} />}
                title="No rollover snapshots"
                message="Rollover history will appear here after the first academic year rollover is executed. Once a rollover is performed, immutable snapshots will be archived for audit purposes."
              />
            )}
            {data?.rolloverHistory && data.rolloverHistory.length > 0 && (
              <div className="audit-report__snapshot-list">
                {data.rolloverHistory.map((snapshot) => {
                  const isExpanded = expandedSnapshots.has(snapshot._id)
                  const counts = snapshot.counts
                  return (
                    <div key={snapshot._id} className="audit-report__snapshot-card">
                      <div
                        className="audit-report__snapshot-header"
                        onClick={() => toggleSnapshot(snapshot._id)}
                      >
                        <button className="audit-report__expand-btn">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <div className="audit-report__snapshot-info">
                          <span className="audit-report__snapshot-type">
                            {SNAPSHOT_TYPE_LABELS[snapshot.type] || snapshot.type}
                          </span>
                          <span className="audit-report__snapshot-title">{snapshot.title}</span>
                        </div>
                        <div className="audit-report__snapshot-meta">
                          <span className="audit-report__snapshot-year">{snapshot.schoolYear}</span>
                          {snapshot.semester && (
                            <span className="audit-report__snapshot-sem">{snapshot.semester} Sem</span>
                          )}
                          <span className="audit-report__snapshot-date">
                            {formatRelative(snapshot.generatedAt)}
                          </span>
                        </div>
                        {counts && (
                          <div className="audit-report__snapshot-counts">
                            <span className="audit-report__count-chip">{counts.total} total</span>
                            {counts.promoted > 0 && <span className="audit-report__count-chip audit-report__count-chip--success">{counts.promoted} promoted</span>}
                            {counts.retained > 0 && <span className="audit-report__count-chip audit-report__count-chip--warn">{counts.retained} retained</span>}
                            {counts.graduated > 0 && <span className="audit-report__count-chip audit-report__count-chip--info">{counts.graduated} graduated</span>}
                          </div>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="audit-report__snapshot-detail">
                          <div className="audit-report__detail-grid">
                            <div className="audit-report__detail-item">
                              <span>Batch ID</span>
                              <strong>{snapshot.rolloverBatchId}</strong>
                            </div>
                            <div className="audit-report__detail-item">
                              <span>School Year</span>
                              <strong>{snapshot.schoolYear}</strong>
                            </div>
                            {snapshot.newSchoolYear && (
                              <div className="audit-report__detail-item">
                                <span>New School Year</span>
                                <strong>{snapshot.newSchoolYear}</strong>
                              </div>
                            )}
                            {snapshot.semester && (
                              <div className="audit-report__detail-item">
                                <span>Semester</span>
                                <strong>{snapshot.semester}</strong>
                              </div>
                            )}
                            <div className="audit-report__detail-item">
                              <span>Generated By</span>
                              <strong>{snapshot.generatedBy?.displayName || snapshot.generatedBy?.username || 'System'}</strong>
                            </div>
                            <div className="audit-report__detail-item">
                              <span>Generated At</span>
                              <strong>{formatDate(snapshot.generatedAt)}</strong>
                            </div>
                          </div>
                          {counts && (
                            <div className="audit-report__detail-counts">
                              <div className="audit-report__detail-count">
                                <span>Total</span>
                                <strong>{counts.total}</strong>
                              </div>
                              <div className="audit-report__detail-count audit-report__detail-count--success">
                                <span>Promoted</span>
                                <strong>{counts.promoted}</strong>
                              </div>
                              <div className="audit-report__detail-count audit-report__detail-count--warn">
                                <span>Retained</span>
                                <strong>{counts.retained}</strong>
                              </div>
                              <div className="audit-report__detail-count audit-report__detail-count--info">
                                <span>Graduated</span>
                                <strong>{counts.graduated}</strong>
                              </div>
                              <div className="audit-report__detail-count">
                                <span>Skipped</span>
                                <strong>{counts.skipped}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Audit Row Component ----

function AuditRow({
  log,
  isExpanded,
  hasDetails,
  onToggle,
}: {
  log: AuditLogEntry
  isExpanded: boolean
  hasDetails: boolean
  onToggle: () => void
}) {
  const userDisplay = log.performedBy?.displayName || log.performedBy?.username || 'System'

  return (
    <>
      <tr
        className={`audit-report__row ${isExpanded ? 'audit-report__row--expanded' : ''}`}
        onClick={hasDetails ? onToggle : undefined}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        <td className="audit-report__td-expand">
          {hasDetails && (
            <button className="audit-report__expand-btn">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </td>
        <td className="audit-report__td-date">
          <span className="audit-report__date-full">{formatDate(log.createdAt)}</span>
          <span className="audit-report__date-relative">{formatRelative(log.createdAt)}</span>
        </td>
        <td>
          <span className="audit-report__action-tag">{ACTION_LABELS[log.action] || log.action}</span>
        </td>
        <td>
          <div className="audit-report__resource">
            <span className="audit-report__resource-type">{RESOURCE_LABELS[log.resourceType] || log.resourceType}</span>
            <span className="audit-report__resource-name">{log.resourceName}</span>
          </div>
        </td>
        <td className="audit-report__td-description" title={log.description}>
          {log.description}
        </td>
        <td>
          <div className="audit-report__user">
            <span>{userDisplay}</span>
            <span className="audit-report__user-role">({log.performedByRole})</span>
          </div>
        </td>
        <td>
          <div className="audit-report__status">
            {getStatusIcon(log.status)}
            <span>{log.status}</span>
          </div>
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="audit-report__detail-row">
          <td colSpan={7}>
            <div className="audit-report__detail-content">
              <div className="audit-report__detail-section">
                <h4>Old Value</h4>
                <pre className="audit-report__json-block">
                  {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '—'}
                </pre>
              </div>
              <div className="audit-report__detail-section">
                <h4>New Value</h4>
                <pre className="audit-report__json-block">
                  {log.newValue ? JSON.stringify(log.newValue, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

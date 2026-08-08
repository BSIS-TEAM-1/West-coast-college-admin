import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Archive,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { listRolloverSnapshots, getRolloverSnapshot } from '../../lib/rolloverApi'
import type { ArchiveSnapshotSummary } from '../../lib/rolloverApi'
import './AcademicArchivePage.css'

type View = 'grid' | 'year'

const SNAPSHOT_TYPE_ICONS: Record<string, React.ReactNode> = {
  ENROLLMENT_SNAPSHOT: <Users size={16} />,
  PROMOTION_REPORT: <GraduationCap size={16} />,
  RETENTION_REPORT: <Users size={16} />,
  GRADUATION_REPORT: <GraduationCap size={16} />,
  BLOCK_SNAPSHOT: <Archive size={16} />,
  ROLLOVER_AUDIT: <FileText size={16} />,
  STUDENT_ARCHIVE: <Users size={16} />,
  GRADES_ARCHIVE: <FileText size={16} />,
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

export default function AcademicArchivePage() {
  const [snapshots, setSnapshots] = useState<ArchiveSnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<{ _id: string; data: unknown } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [view, setView] = useState<View>('year')
  const [search, setSearch] = useState('')

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await listRolloverSnapshots()
      setSnapshots(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archives')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSnapshots()
  }, [fetchSnapshots])

  const years = useMemo(() => {
    const map = new Map<string, ArchiveSnapshotSummary[]>()
    for (const s of snapshots) {
      if (!map.has(s.schoolYear)) map.set(s.schoolYear, [])
      map.get(s.schoolYear)!.push(s)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [snapshots])

  const filteredSnapshots = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return snapshots
    return snapshots.filter((s) =>
      (SNAPSHOT_TYPE_LABELS[s.type] || s.type).toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.schoolYear.toLowerCase().includes(q)
    )
  }, [snapshots, search])

  const toggleYear = (year: string) => {
    setSelectedYear((prev) => (prev === year ? null : year))
  }

  const toggleSnapshot = async (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) {
      next.delete(id)
      setExpanded(next)
      if (detail?._id === id) setDetail(null)
      return
    }
    next.add(id)
    setExpanded(next)
    try {
      setDetailLoading(true)
      const result = await getRolloverSnapshot(id)
      setDetail({ _id: id, data: result.data })
    } catch (err) {
      setDetail({ _id: id, data: { error: err instanceof Error ? err.message : 'Failed to load details' } })
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="academic-archive-page">
        <div className="academic-archive-loading">
          <RefreshCw size={24} className="academic-archive-spin" />
          <p>Loading academic archives...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="academic-archive-page">
        <div className="academic-archive-error">
          <p>{error}</p>
          <button onClick={fetchSnapshots}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="academic-archive-page">
      <header className="academic-archive-header">
        <div>
          <span className="academic-archive-eyebrow">Academic Compliance</span>
          <h1>Academic Archive</h1>
        </div>
        <div className="academic-archive-header-actions">
          <div className="academic-archive-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search archives..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`academic-archive-view-btn ${view === 'year' ? 'academic-archive-view-btn--active' : ''}`}
            onClick={() => setView('year')}
          >
            <Calendar size={15} />
            By Year
          </button>
          <button
            className={`academic-archive-view-btn ${view === 'grid' ? 'academic-archive-view-btn--active' : ''}`}
            onClick={() => setView('grid')}
          >
            <Archive size={15} />
            All
          </button>
          <button className="academic-archive-refresh" onClick={fetchSnapshots}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      {snapshots.length === 0 ? (
        <div className="academic-archive-empty">
          <Archive size={40} />
          <h3>No archives yet</h3>
          <p>Academic archives will appear here after the first school year rollover is executed.</p>
        </div>
      ) : view === 'year' ? (
        <div className="academic-archive-year-list">
          {years
            .filter(([year]) => selectedYear == null || year === selectedYear || search.trim() === '')
            .map(([year, yearSnapshots]) => (
              <div key={year} className="academic-archive-year-card academic-archive-folder">
                <button
                  className={`academic-archive-year-header academic-archive-folder__header ${selectedYear === year ? 'academic-archive-folder__header--open' : ''}`}
                  onClick={() => toggleYear(year)}
                >
                  <span className="academic-archive-folder__icon">
                    {selectedYear === year ? <FolderOpen size={22} /> : <Folder size={22} />}
                  </span>
                  <ChevronRight
                    size={16}
                    className={`academic-archive-folder__chevron ${selectedYear === year ? 'academic-archive-folder__chevron--open' : ''}`}
                  />
                  <span className="academic-archive-year-title">School Year {year}</span>
                  <span className="academic-archive-year-count">{yearSnapshots.length} snapshots</span>
                </button>
                {(selectedYear === year || (selectedYear == null && search.trim() === '')) && (
                  <div className="academic-archive-year-body academic-archive-folder__contents">
                    {yearSnapshots.map((snapshot) => (
                      <div key={snapshot._id} className="academic-archive-file">
                        <SnapshotCard
                          snapshot={snapshot}
                          isExpanded={expanded.has(snapshot._id)}
                          detail={detail?._id === snapshot._id ? detail : null}
                          detailLoading={detailLoading}
                          onToggle={() => toggleSnapshot(snapshot._id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="academic-archive-grid">
          {filteredSnapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot._id}
              snapshot={snapshot}
              isExpanded={expanded.has(snapshot._id)}
              detail={detail?._id === snapshot._id ? detail : null}
              detailLoading={detailLoading}
              onToggle={() => toggleSnapshot(snapshot._id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SnapshotCard({
  snapshot,
  isExpanded,
  detail,
  detailLoading,
  onToggle,
}: {
  snapshot: ArchiveSnapshotSummary
  isExpanded: boolean
  detail: { _id: string; data: unknown } | null
  detailLoading: boolean
  onToggle: () => void
}) {
  const counts = snapshot.counts
  const label = SNAPSHOT_TYPE_LABELS[snapshot.type] || snapshot.type
  const icon = SNAPSHOT_TYPE_ICONS[snapshot.type] || <FileText size={16} />

  return (
    <div className={`academic-archive-card ${isExpanded ? 'academic-archive-card--expanded' : ''}`}>
      <button className="academic-archive-card-header" onClick={onToggle}>
        <span className="academic-archive-card-icon">{icon}</span>
        <div className="academic-archive-card-info">
          <span className="academic-archive-card-type">{label}</span>
          <span className="academic-archive-card-title">{snapshot.title}</span>
        </div>
        <div className="academic-archive-card-meta">
          <span className="academic-archive-card-year">{snapshot.schoolYear}</span>
          <span className="academic-archive-card-date">{formatRelative(snapshot.generatedAt)}</span>
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isExpanded && (
        <div className="academic-archive-card-body">
          {counts && (
            <div className="academic-archive-card-counts">
              <span className="academic-archive-count-pill">{counts.total} total</span>
              {counts.promoted > 0 && <span className="academic-archive-count-pill academic-archive-count-pill--success">{counts.promoted} promoted</span>}
              {counts.retained > 0 && <span className="academic-archive-count-pill academic-archive-count-pill--warn">{counts.retained} retained</span>}
              {counts.graduated > 0 && <span className="academic-archive-count-pill academic-archive-count-pill--info">{counts.graduated} graduated</span>}
            </div>
          )}
          <div className="academic-archive-card-detail">
            <span className="academic-archive-card-detail-label">
              <Eye size={14} /> Snapshot payload
            </span>
            {detailLoading ? (
              <p className="academic-archive-detail-loading">Loading details...</p>
            ) : detail ? (
              <pre className="academic-archive-json-block">
                {JSON.stringify(detail.data, null, 2)}
              </pre>
            ) : (
              <p className="academic-archive-detail-placeholder">Snapshot details could not be loaded.</p>
            )}
          </div>
          <div className="academic-archive-card-footer">
            <span>Generated {formatDate(snapshot.generatedAt)}</span>
            <span>Batch {snapshot.rolloverBatchId}</span>
          </div>
        </div>
      )}
    </div>
  )
}

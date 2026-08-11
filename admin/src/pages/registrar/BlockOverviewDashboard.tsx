import { useEffect, useMemo, useState } from 'react'
import { Blocks, Users, CheckCircle, XCircle, AlertTriangle, ShieldAlert, RefreshCw, ListChecks } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection } from './registrarBlockTypes'
import './BlockManagement.css'

type BlockOverviewDashboardProps = {
  onManageAssignments: () => void
  onViewBlocks: () => void
}

type BlockMetrics = {
  totalBlocks: number
  totalSections: number
  totalCapacity: number
  totalPopulation: number
  openSections: number
  closedSections: number
  nearCapacitySections: number
  overCapacitySections: number
}

type CapacityUpdate = {
  _id: string
  actionType: string
  sectionCode: string
  blockGroupName: string
  studentName: string
  studentId: string
  registrarId: string
  timestamp: string
  schoolYear?: string
  semester?: string
}

export default function BlockOverviewDashboard({
  onManageAssignments,
  onViewBlocks
}: BlockOverviewDashboardProps) {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [allSections, setAllSections] = useState<BlockSection[]>([])
  // @ts-ignore - Variables used in component logic but not directly in render
  blockGroups
  allSections

  const [metrics, setMetrics] = useState<BlockMetrics>({
    totalBlocks: 0,
    totalSections: 0,
    totalCapacity: 0,
    totalPopulation: 0,
    openSections: 0,
    closedSections: 0,
    nearCapacitySections: 0,
    overCapacitySections: 0
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [capacityUpdates, setCapacityUpdates] = useState<CapacityUpdate[]>([])

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`
      }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
  }

  const fetchBlockData = async () => {
    setLoading(true)
    setError('')
    try {
      const groups = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(groups) ? groups : [])

      // Fetch all sections from all groups
      const sectionsPromises = (Array.isArray(groups) ? groups : []).map((group: BlockGroup) =>
        authorizedFetch(`/api/blocks/groups/${group._id}/sections`)
      )
      const sectionsArrays = await Promise.all(sectionsPromises)
      const allSectionsData = sectionsArrays.flat()
      setAllSections(Array.isArray(allSectionsData) ? allSectionsData : [])

      // Calculate metrics
      const sections = Array.isArray(allSectionsData) ? allSectionsData : []
      const totalCapacity = sections.reduce((sum, section) => sum + (Number(section.capacity) || 0), 0)
      const totalPopulation = sections.reduce((sum, section) => sum + (Number(section.currentPopulation) || 0), 0)
      const openSections = sections.filter((section) => (section.status || 'OPEN').toUpperCase() === 'OPEN').length
      const closedSections = sections.filter((section) => (section.status || 'OPEN').toUpperCase() === 'CLOSED').length
      const nearCapacitySections = sections.filter(
        (section) => {
          const percentage = (Number(section.currentPopulation) || 0) / (Number(section.capacity) || 1)
          return percentage >= 0.85 && percentage < 1
        }
      ).length
      const overCapacitySections = sections.filter(
        (section) => (Number(section.currentPopulation) || 0) > (Number(section.capacity) || 0)
      ).length

      setMetrics({
        totalBlocks: Array.isArray(groups) ? groups.length : 0,
        totalSections: sections.length,
        totalCapacity,
        totalPopulation,
        openSections,
        closedSections,
        nearCapacitySections,
        overCapacitySections
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block data')
    } finally {
      setLoading(false)
    }
  }

  const fetchCapacityUpdates = async () => {
    try {
      const result = await authorizedFetch('/api/blocks/capacity-updates')
      setCapacityUpdates(Array.isArray(result?.data) ? result.data : [])
    } catch (err) {
      setCapacityUpdates([])
    }
  }

  useEffect(() => {
    void fetchBlockData()
    void fetchCapacityUpdates()
  }, [])

  const overallCapacityPercentage = metrics.totalCapacity > 0
    ? (metrics.totalPopulation / metrics.totalCapacity) * 100
    : 0


  const largestBlocks = useMemo(() => {
    return [...allSections]
      .sort((a, b) => (Number(b.currentPopulation) || 0) - (Number(a.currentPopulation) || 0))
      .slice(0, 5)
  }, [allSections])

  return (
    <div className="registrar-section block-overview block-management-system w-full">
      <div className="block-overview__header">
        <div>
          <h2 className="registrar-section-title">Block Management Overview</h2>
          <p className="registrar-section-desc">Monitor and manage all academic blocks and sections</p>
        </div>
        <button
          type="button"
          className="registrar-btn registrar-btn-secondary block-overview__refresh-btn"
          onClick={() => void fetchBlockData()}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="block-management-notice block-management-notice-error">
          <strong>Error loading data</strong>
          <p>{error}</p>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="block-overview__metrics">
        <div className="block-metric-card block-card">
          <div className="block-metric-icon">
            <Blocks size={22} />
          </div>
          <div className="block-metric-content">
            <span className="block-metric-label">Total Blocks</span>
            <strong className="block-metric-value">{metrics.totalBlocks}</strong>
          </div>
        </div>

        <div className="block-metric-card block-card">
          <div className="block-metric-icon">
            <Users size={22} />
          </div>
          <div className="block-metric-content">
            <span className="block-metric-label">Total Students</span>
            <strong className="block-metric-value">{metrics.totalPopulation}</strong>
          </div>
        </div>

        <div className="block-metric-card block-card">
          <div className="block-metric-icon">
            <CheckCircle size={22} />
          </div>
          <div className="block-metric-content">
            <span className="block-metric-label">Open Sections</span>
            <strong className="block-metric-value">{metrics.openSections}</strong>
          </div>
        </div>

        <div className="block-metric-card block-card">
          <div className="block-metric-icon">
            <ShieldAlert size={22} />
          </div>
          <div className="block-metric-content">
            <span className="block-metric-label">Capacity Issues</span>
            <strong className="block-metric-value">{metrics.nearCapacitySections + metrics.overCapacitySections}</strong>
          </div>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="block-overview__bento">
        {/* Left Column — Overall Capacity + Alerts */}
        <div className="block-overview__col block-overview__col--left">
          <div className="block-overview__card block-card">
            <h3 className="block-overview__card-title">Overall Capacity</h3>
            <div className="block-capacity-hero">
              <div className="block-capacity-bar-track">
                <div
                  className="block-capacity-bar-fill"
                  style={{ width: `${Math.min(overallCapacityPercentage, 100)}%` }}
                />
              </div>
              <strong className="block-capacity-percentage">{overallCapacityPercentage.toFixed(1)}%</strong>
            </div>
            <div className="block-capacity-stats">
              <div>
                <span>Total Capacity</span>
                <strong>{metrics.totalCapacity}</strong>
              </div>
              <div>
                <span>Assigned</span>
                <strong>{metrics.totalPopulation}</strong>
              </div>
              <div>
                <span>Available</span>
                <strong>{metrics.totalCapacity - metrics.totalPopulation}</strong>
              </div>
            </div>
            <div className="block-capacity-alerts-section">
              <h4 className="block-capacity-alerts-title">Capacity Updates</h4>
              {capacityUpdates.length === 0 ? (
                <p className="block-overview__empty">No capacity updates</p>
              ) : (
                <ul className="block-overview__list">
                  {capacityUpdates.map((update) => {
                    const verb = update.actionType === 'UNASSIGN' ? 'removed from' : update.actionType === 'TRANSFER' ? 'transferred to' : 'added to'
                    const when = new Date(update.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
                    // Build the block label from the section code + course label.
                    // Block group names like "101-1-A" start with a course code prefix;
                    // extract it to show a readable label (e.g. "BEED 1-A").
                    const COURSE_LABELS: Record<string, string> = { '101': 'BEED', '102': 'BSEd-English', '103': 'BSEd-Math', '201': 'BSBA-HRM' }
                    const sectionCode = update.sectionCode && update.sectionCode !== 'Unknown' ? update.sectionCode : ''
                    const coursePrefix = sectionCode.split('-')[0]
                    const courseLabel = COURSE_LABELS[coursePrefix]
                    const sectionSuffix = sectionCode.includes('-') ? sectionCode.split('-').slice(1).join('-') : ''
                    const blockLabel = sectionCode
                      ? courseLabel
                        ? `${courseLabel} ${sectionSuffix}`.trim()
                        : update.blockGroupName && update.blockGroupName !== sectionCode
                          ? `${sectionCode} (${update.blockGroupName})`
                          : sectionCode
                      : 'Unknown'
                    return (
                      <li key={update._id} className="block-overview__list-item">
                        <div className="block-overview__list-row">
                          <span className="block-overview__list-title">{update.studentName}</span>
                          <span className="block-overview__list-badge">{verb}</span>
                          <span className="block-overview__list-detail">{blockLabel} — {when}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right Column — Status + Largest Blocks + Quick Actions */}
        <div className="block-overview__col block-overview__col--right">
          <div className="block-overview__card block-card">
            <h3 className="block-overview__card-title">Section Status</h3>
            <div className="block-status-breakdown">
              <div className="block-status-card block-card">
                <CheckCircle size={20} className="block-status-card-icon block-status-card-icon--open" />
                <span className="block-status-card-label">Open</span>
                <strong className="block-status-card-value">{metrics.openSections}</strong>
              </div>
              <div className="block-status-card block-card">
                <XCircle size={20} className="block-status-card-icon block-status-card-icon--closed" />
                <span className="block-status-card-label">Closed</span>
                <strong className="block-status-card-value">{metrics.closedSections}</strong>
              </div>
              <div className="block-status-card block-card">
                <AlertTriangle size={20} className="block-status-card-icon block-status-card-icon--warning" />
                <span className="block-status-card-label">Near 85%</span>
                <strong className="block-status-card-value">{metrics.nearCapacitySections}</strong>
              </div>
              <div className="block-status-card block-card">
                <ShieldAlert size={20} className="block-status-card-icon block-status-card-icon--error" />
                <span className="block-status-card-label">Over</span>
                <strong className="block-status-card-value">{metrics.overCapacitySections}</strong>
              </div>
            </div>
          </div>

          <div className="block-overview__card block-card">
            <h3 className="block-overview__card-title">Largest Blocks</h3>
            {largestBlocks.length === 0 ? (
              <p className="block-overview__empty">No sections found</p>
            ) : (
              <ul className="block-overview__list">
                {largestBlocks.map((section) => (
                  <li key={section._id} className="block-overview__list-item">
                    <div className="block-overview__list-meta">
                      <span className="block-overview__list-title">{section.sectionCode}</span>
                      <span className="block-overview__list-value">{section.currentPopulation} students</span>
                    </div>
                    <div className="block-overview__progress">
                      <div
                        className="block-overview__progress-bar"
                        style={{ width: `${Math.min((section.currentPopulation / (section.capacity || 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <small>Capacity: {section.capacity}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="block-overview__card block-card">
            <h3 className="block-overview__card-title">Quick Actions</h3>
            <div className="block-overview__quick-actions">
              <button type="button" className="registrar-btn block-overview__action-btn block-overview__action-btn--primary" onClick={onManageAssignments}>
                <Users size={16} />
                Manage Assignments
              </button>
              <button type="button" className="registrar-btn block-overview__action-btn" onClick={onViewBlocks}>
                <ListChecks size={16} />
                View All Blocks
              </button>
              <button type="button" className="registrar-btn block-overview__action-btn" onClick={() => void fetchBlockData()} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
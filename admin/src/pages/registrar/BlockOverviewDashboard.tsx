import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, RefreshCw, Search, Users } from 'lucide-react'
import {
  authorizedFetch,
  compareBlockOrder,
  formatBlockDisplay,
  getBlockGroupCompatibilityMeta,
  getCourseAbbreviation,
  parseBlockSlot
} from '../../lib/blockAssignmentShared'
import type { BlockGroup, BlockSection, BlockWorkspaceSelection } from './registrarBlockTypes'
import '../BlockManagement.css'

type BlockOverviewDashboardProps = {
  onManageAssignments: () => void
  onViewBlocks: () => void
  onOpenBlock?: (selection: BlockWorkspaceSelection) => void
}

type CapacityState = 'over' | 'full' | 'near' | 'normal'

type OverviewRow = {
  section: BlockSection
  group: BlockGroup
  schoolYear: string
  course: string
  yearLevel: number
  sectionLetter: string
  status: 'OPEN' | 'CLOSED'
  utilization: number
  capacityState: CapacityState
}

type TermOption = {
  key: string
  schoolYear: string
  semester: BlockGroup['semester']
  count: number
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

const SEMESTER_RANK: Record<string, number> = { '1st': 0, '2nd': 1, Summer: 2 }
const COURSE_RANK = ['BEED', 'BSEd-English', 'BSEd-Math', 'BSBA-HRM']
const CAPACITY_RANK: Record<CapacityState, number> = { over: 0, full: 1, near: 2, normal: 3 }
const CAPACITY_LABEL: Record<CapacityState, string> = {
  over: 'Over capacity',
  full: 'Full',
  near: 'Near capacity',
  normal: 'Within capacity'
}
const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function semesterLabel(value: string) {
  if (value === '1st') return '1st semester'
  if (value === '2nd') return '2nd semester'
  if (value === 'Summer') return 'Summer term'
  return value || 'Term'
}

function resolveSchoolYear(group: BlockGroup) {
  const explicit = String(group.schoolYear || '').trim()
  if (/^\d{4}-\d{4}$/.test(explicit)) return explicit

  const rawYear = String(group.year ?? '').trim()
  if (/^\d{4}-\d{4}$/.test(rawYear)) return rawYear

  const startYear = Number(rawYear)
  return Number.isFinite(startYear) && startYear > 0 ? `${startYear}-${startYear + 1}` : 'School year not set'
}

function termKey(schoolYear: string, semester: string) {
  return `${schoolYear}|${semester}`
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

function getCapacityState(current: number, capacity: number): CapacityState {
  if (capacity <= 0) return 'normal'
  if (current > capacity) return 'over'
  if (current === capacity) return 'full'
  if (current / capacity >= 0.85) return 'near'
  return 'normal'
}

function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const absolute = Math.abs(diffSeconds)
  if (absolute < 60) return RELATIVE_TIME.format(diffSeconds, 'second')
  if (absolute < 3600) return RELATIVE_TIME.format(Math.round(diffSeconds / 60), 'minute')
  if (absolute < 86400) return RELATIVE_TIME.format(Math.round(diffSeconds / 3600), 'hour')
  if (absolute < 604800) return RELATIVE_TIME.format(Math.round(diffSeconds / 86400), 'day')
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAbsoluteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function OverviewSkeleton() {
  return (
    <div className="bo-skeleton" aria-hidden="true">
      <div className="bo-skeleton-stats">
        {[0, 1, 2, 3].map((item) => (
          <span key={item} className="bo-skeleton-cell" />
        ))}
      </div>
      <div className="bo-skeleton-grid">
        <div className="bo-skeleton-panel">
          {[0, 1, 2, 3, 4, 5, 6].map((item) => (
            <span key={item} className="bo-skeleton-row" />
          ))}
        </div>
        <div className="bo-skeleton-side">
          <div className="bo-skeleton-panel">
            <span className="bo-skeleton-row" />
            <span className="bo-skeleton-row" />
            <span className="bo-skeleton-row" />
          </div>
          <div className="bo-skeleton-panel">
            <span className="bo-skeleton-row" />
            <span className="bo-skeleton-row" />
            <span className="bo-skeleton-row" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BlockOverviewDashboard({
  onManageAssignments,
  onViewBlocks,
  onOpenBlock
}: BlockOverviewDashboardProps) {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [allSections, setAllSections] = useState<BlockSection[]>([])
  const [capacityUpdates, setCapacityUpdates] = useState<CapacityUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [search, setSearch] = useState('')

  const fetchBlockData = useCallback(async () => {
    setLoading(true)
    setError('')
    setWarning('')
    try {
      const groupResponse = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
      const groups = Array.isArray(groupResponse) ? groupResponse : []

      if (groups.length === 0) {
        setBlockGroups([])
        setAllSections([])
        setLastUpdated(new Date())
        return
      }

      const results = await Promise.allSettled(
        groups.map((group) =>
          authorizedFetch<BlockSection[]>(`/api/blocks/groups/${group._id}/sections`)
        )
      )
      const failedCount = results.filter((result) => result.status === 'rejected').length

      if (failedCount === groups.length) {
        const failure = results.find((result) => result.status === 'rejected')
        throw failure && failure.status === 'rejected' && failure.reason instanceof Error
          ? failure.reason
          : new Error('Section data could not be loaded for any block group. Please try again.')
      }

      const sections = results.flatMap((result) =>
        result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []
      )

      setBlockGroups(groups)
      setAllSections(sections)
      setLastUpdated(new Date())

      if (failedCount > 0) {
        setWarning(
          `${failedCount} of ${groups.length} block groups could not be loaded. Totals may be incomplete.`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load block data.')
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [])

  const fetchCapacityUpdates = useCallback(async () => {
    try {
      const result = await authorizedFetch<{ data?: CapacityUpdate[] }>('/api/blocks/capacity-updates')
      setCapacityUpdates(Array.isArray(result?.data) ? result.data : [])
    } catch {
      setCapacityUpdates([])
    }
  }, [])

  useEffect(() => {
    void fetchBlockData()
    void fetchCapacityUpdates()
  }, [fetchBlockData, fetchCapacityUpdates])

  const rows = useMemo<OverviewRow[]>(() => {
    const groupsById = new Map(blockGroups.map((group) => [String(group._id), group]))
    const groupsByName = new Map(blockGroups.map((group) => [group.name, group]))

    return allSections.reduce<OverviewRow[]>((collected, section) => {
      const group = groupsById.get(String(section.blockGroupId || '')) || groupsByName.get(section.sectionCode)
      if (!group) return collected

      const meta = getBlockGroupCompatibilityMeta(group)
      const slot = parseBlockSlot(group.name)
      const capacity = Number(section.capacity) || 0
      const population = Number(section.currentPopulation) || 0

      collected.push({
        section,
        group,
        schoolYear: resolveSchoolYear(group),
        course: getCourseAbbreviation(group.name),
        yearLevel: Number(meta.yearLevel) || slot?.yearLevel || 0,
        sectionLetter: String(group.section || slot?.letter || ''),
        status: String(section.status || 'OPEN').toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
        utilization: capacity > 0 ? (population / capacity) * 100 : 0,
        capacityState: getCapacityState(population, capacity)
      })
      return collected
    }, [])
  }, [allSections, blockGroups])

  const termOptions = useMemo<TermOption[]>(() => {
    const byTerm = new Map<string, TermOption>()

    blockGroups.forEach((group) => {
      const schoolYear = resolveSchoolYear(group)
      const key = termKey(schoolYear, group.semester)
      const existing = byTerm.get(key)
      if (existing) {
        existing.count += 1
      } else {
        byTerm.set(key, { key, schoolYear, semester: group.semester, count: 1 })
      }
    })

    return [...byTerm.values()].sort((a, b) => {
      const aKnown = /^\d{4}-\d{4}$/.test(a.schoolYear)
      const bKnown = /^\d{4}-\d{4}$/.test(b.schoolYear)
      if (aKnown !== bKnown) return aKnown ? -1 : 1
      if (a.schoolYear !== b.schoolYear) return b.schoolYear.localeCompare(a.schoolYear)
      return (SEMESTER_RANK[a.semester] ?? 99) - (SEMESTER_RANK[b.semester] ?? 99)
    })
  }, [blockGroups])

  const selectedTermOption = termOptions.find((term) => term.key === selectedTerm) || termOptions[0] || null
  const activeTerm = selectedTermOption?.key || ''
  const termLabel = selectedTermOption
    ? `SY ${selectedTermOption.schoolYear} \u00b7 ${semesterLabel(selectedTermOption.semester)}`
    : 'the current term'

  const termRows = useMemo(
    () => rows.filter((row) => termKey(row.schoolYear, row.group.semester) === activeTerm),
    [activeTerm, rows]
  )

  const programOptions = useMemo(() => {
    const programs = new Set(termRows.map((row) => row.course))
    return [...programs].sort((a, b) => {
      const aIndex = COURSE_RANK.indexOf(a)
      const bIndex = COURSE_RANK.indexOf(b)
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
      if (aIndex >= 0) return -1
      if (bIndex >= 0) return 1
      return a.localeCompare(b)
    })
  }, [termRows])

  const activeProgram =
    selectedProgram !== 'all' && programOptions.includes(selectedProgram) ? selectedProgram : 'all'

  const summary = useMemo(() => {
    const totalCapacity = termRows.reduce((sum, row) => sum + (Number(row.section.capacity) || 0), 0)
    const totalPopulation = termRows.reduce(
      (sum, row) => sum + (Number(row.section.currentPopulation) || 0),
      0
    )
    const openSections = termRows.filter((row) => row.status === 'OPEN').length
    const closedSections = termRows.filter((row) => row.status === 'CLOSED').length
    const nearCapacity = termRows.filter((row) => row.capacityState === 'near').length
    const fullSections = termRows.filter((row) => row.capacityState === 'full').length
    const overCapacity = termRows.filter((row) => row.capacityState === 'over').length
    const utilization = totalCapacity > 0 ? (totalPopulation / totalCapacity) * 100 : 0

    return {
      totalBlocks: selectedTermOption?.count || 0,
      totalSections: termRows.length,
      totalCapacity,
      totalPopulation,
      openSections,
      closedSections,
      nearCapacity,
      fullSections,
      overCapacity,
      attentionCount: nearCapacity + fullSections + overCapacity,
      availableSeats: Math.max(totalCapacity - totalPopulation, 0),
      utilization,
      capacityTone: utilization >= 100 ? 'danger' : utilization >= 85 ? 'warning' : 'normal'
    }
  }, [selectedTermOption, termRows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return termRows
      .filter((row) => {
        if (activeProgram !== 'all' && row.course !== activeProgram) return false
        if (selectedStatus === 'OPEN' && row.status !== 'OPEN') return false
        if (selectedStatus === 'CLOSED' && row.status !== 'CLOSED') return false
        if (selectedStatus === 'risk' && row.capacityState === 'normal') return false
        if (!query) return true

        const haystack = [
          row.section.sectionCode,
          row.group.name,
          row.course,
          row.section.classAdviser,
          row.yearLevel ? `year ${row.yearLevel}` : '',
          row.sectionLetter ? `section ${row.sectionLetter}` : ''
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(query)
      })
      .sort(
        (a, b) =>
          b.utilization - a.utilization ||
          compareBlockOrder(a.section.sectionCode, b.section.sectionCode)
      )
  }, [activeProgram, search, selectedStatus, termRows])

  const attentionRows = useMemo(
    () =>
      [...termRows]
        .filter((row) => row.capacityState !== 'normal')
        .sort(
          (a, b) =>
            CAPACITY_RANK[a.capacityState] - CAPACITY_RANK[b.capacityState] ||
            b.utilization - a.utilization
        ),
    [termRows]
  )

  const filtersActive = activeProgram !== 'all' || selectedStatus !== 'all' || search.trim() !== ''

  const clearFilters = () => {
    setSelectedProgram('all')
    setSelectedStatus('all')
    setSearch('')
  }

  const handleRefresh = () => {
    void fetchBlockData()
    void fetchCapacityUpdates()
  }

  const handleOpenBlock = (row: OverviewRow) => {
    if (!onOpenBlock) return
    onOpenBlock({
      groupId: row.group._id,
      groupName: row.group.name,
      semester: row.group.semester,
      year: Number(row.schoolYear.slice(0, 4)) || new Date().getFullYear(),
      initialSectionId: row.section._id
    })
  }

  const showSkeleton = loading && blockGroups.length === 0
  const showDashboard = hasLoadedOnce && !(error && blockGroups.length === 0)

  return (
    <div className="registrar-section block-overview">
      <header className="bo-header">
        <div className="bo-heading">
          <h2 className="registrar-section-title">Block Overview</h2>
          <p className="bo-subtitle">
            Monitor section capacity and placement health for <strong>{termLabel}</strong>.
          </p>
        </div>
        <div className="bo-header-actions">
          {lastUpdated && (
            <span className="bo-updated">
              Updated{' '}
              {lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            className="bo-icon-btn"
            onClick={handleRefresh}
            disabled={loading}
            aria-label={loading ? 'Refreshing block data' : 'Refresh block data'}
            title="Refresh block data"
          >
            <RefreshCw size={16} className={loading ? 'bo-spin' : ''} aria-hidden="true" />
          </button>
          <button type="button" className="registrar-btn bo-primary-btn" onClick={onManageAssignments}>
            <Users size={16} aria-hidden="true" />
            Assign students
          </button>
        </div>
      </header>

      {error && (
        <div className="bo-notice bo-notice--error" role="alert">
          <div>
            <strong>Block data could not be loaded</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="bo-link-btn" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Retrying\u2026' : 'Try again'}
          </button>
        </div>
      )}

      {warning && !error && (
        <div className="bo-notice bo-notice--warning" role="status">
          <div>
            <strong>Some section data is missing</strong>
            <p>{warning}</p>
          </div>
          <button type="button" className="bo-link-btn" onClick={handleRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      )}

      {showSkeleton && (
        <>
          <p className="bo-visually-hidden" role="status">
            Loading block overview
          </p>
          <OverviewSkeleton />
        </>
      )}

      {showDashboard && (
        <>
          <dl className="bo-stats" aria-label="Section summary">
            <div className="bo-stat">
              <dt>Sections</dt>
              <dd>
                <strong>{summary.totalSections}</strong>
                <span>
                  {summary.totalBlocks} blocks {'\u00b7'} {summary.openSections} open
                </span>
              </dd>
            </div>
            <div className="bo-stat">
              <dt>Students placed</dt>
              <dd>
                <strong>{summary.totalPopulation.toLocaleString()}</strong>
                <span>of {summary.totalCapacity.toLocaleString()} seats</span>
              </dd>
            </div>
            <div className="bo-stat">
              <dt>Capacity used</dt>
              <dd>
                <strong>{formatPercent(summary.utilization)}</strong>
                <span>{summary.availableSeats.toLocaleString()} seats available</span>
                <span
                  className={`bo-meter bo-meter--${summary.capacityTone}`}
                  aria-hidden="true"
                >
                  <span
                    className="bo-meter-fill"
                    style={{ width: `${Math.min(summary.utilization, 100)}%` }}
                  />
                </span>
              </dd>
            </div>
            <div className={`bo-stat${summary.attentionCount > 0 ? ' bo-stat--attention' : ''}`}>
              <dt>Needs attention</dt>
              <dd>
                <strong>{summary.attentionCount}</strong>
                <span>
                  {summary.overCapacity} over {'\u00b7'} {summary.fullSections} full {'\u00b7'}{' '}
                  {summary.nearCapacity} near 85%
                </span>
              </dd>
            </div>
          </dl>

          <div className="bo-controls">
            <label className="bo-field bo-field--term">
              <span className="bo-field-label">Term</span>
              {termOptions.length > 0 ? (
                <select
                  value={activeTerm}
                  onChange={(event) => setSelectedTerm(event.target.value)}
                >
                  {termOptions.map((term) => (
                    <option key={term.key} value={term.key}>
                      {`SY ${term.schoolYear} \u00b7 ${semesterLabel(term.semester)}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="bo-term-empty">No blocks scheduled</span>
              )}
            </label>

            <div className="bo-controls-filters">
              <label className="bo-search">
                <Search size={16} aria-hidden="true" />
                <span className="bo-visually-hidden">Search sections</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search section or adviser"
                />
              </label>

              <label className="bo-field">
                <span className="bo-field-label">Program</span>
                <select
                  value={activeProgram}
                  onChange={(event) => setSelectedProgram(event.target.value)}
                >
                  <option value="all">All programs</option>
                  {programOptions.map((program) => (
                    <option key={program} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
              </label>

              <label className="bo-field">
                <span className="bo-field-label">Status</span>
                <select
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                  <option value="risk">At risk</option>
                </select>
              </label>
            </div>
          </div>

          <div className="bo-grid">
            <section className="bo-panel bo-panel--sections" aria-labelledby="bo-sections-heading">
              <header className="bo-panel-head">
                <div>
                  <h3 id="bo-sections-heading">Section occupancy</h3>
                  <p>
                    {filteredRows.length} of {summary.totalSections} sections {'\u00b7'} highest
                    utilization first
                  </p>
                </div>
                <button type="button" className="bo-link-btn" onClick={onViewBlocks}>
                  View all blocks
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </header>

              {filteredRows.length === 0 ? (
                <div className="bo-empty bo-empty--table">
                  <p>
                    {summary.totalSections === 0
                      ? 'No sections in this term.'
                      : 'No sections match these filters.'}
                  </p>
                  <span>
                    {summary.totalSections === 0
                      ? 'Create a block to start placing students.'
                      : 'Try a different program, status, or search term.'}
                  </span>
                  {summary.totalSections === 0 ? (
                    <button type="button" className="bo-link-btn" onClick={onViewBlocks}>
                      Go to blocks
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    filtersActive && (
                      <button type="button" className="bo-link-btn" onClick={clearFilters}>
                        Clear filters
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div className="bo-table-wrap">
                  <table className="bo-table">
                    <caption className="bo-visually-hidden">
                      Sections for {termLabel}: status, students placed and capacity utilization
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Block</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="bo-num">
                          Students
                        </th>
                        <th scope="col">Utilization</th>
                        <th scope="col" className="bo-row-action">
                          <span className="bo-visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const population = Number(row.section.currentPopulation) || 0
                        const capacity = Number(row.section.capacity) || 0
                        const blockLabel = formatBlockDisplay(row.section.sectionCode)
                        const meterTone =
                          row.capacityState === 'normal'
                            ? 'normal'
                            : row.capacityState === 'near'
                              ? 'warning'
                              : 'danger'

                        return (
                          <tr key={row.section._id}>
                            <td>
                              <span className="bo-block-label">{blockLabel}</span>
                              <span className="bo-block-meta">
                                {row.course}
                                {row.yearLevel ? ` \u00b7 Year ${row.yearLevel}` : ''}
                                {row.sectionLetter ? ` \u00b7 Section ${row.sectionLetter}` : ''}
                                {row.section.classAdviser ? ` \u00b7 ${row.section.classAdviser}` : ''}
                              </span>
                            </td>
                            <td>
                              <span className={`bo-status bo-status--${row.status.toLowerCase()}`}>
                                <span className="bo-status-dot" aria-hidden="true" />
                                {row.status === 'OPEN' ? 'Open' : 'Closed'}
                              </span>
                            </td>
                            <td className="bo-num">
                              <strong>{population}</strong>
                              <span className="bo-muted"> / {capacity}</span>
                            </td>
                            <td>
                              <div className="bo-utilization">
                                <span
                                  className={`bo-meter bo-meter--${meterTone}`}
                                  role="progressbar"
                                  aria-valuenow={population}
                                  aria-valuemin={0}
                                  aria-valuemax={capacity}
                                  aria-label={`${blockLabel}: ${population} of ${capacity} students placed`}
                                >
                                  <span
                                    className="bo-meter-fill"
                                    style={{ width: `${Math.min(row.utilization, 100)}%` }}
                                  />
                                </span>
                                <span className="bo-utilization-value">
                                  {formatPercent(row.utilization)}
                                </span>
                              </div>
                            </td>
                            <td className="bo-row-action">
                              {onOpenBlock && (
                                <button
                                  type="button"
                                  className="bo-row-btn"
                                  onClick={() => handleOpenBlock(row)}
                                  aria-label={`Open ${blockLabel}`}
                                >
                                  Open
                                  <ArrowRight size={14} aria-hidden="true" />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="bo-side" aria-label="Block insights">
              <section className="bo-panel" aria-labelledby="bo-attention-heading">
                <header className="bo-panel-head">
                  <div>
                    <h3 id="bo-attention-heading">Needs attention</h3>
                    <p>
                      {attentionRows.length > 0
                        ? `${attentionRows.length} section${attentionRows.length === 1 ? '' : 's'} at or near capacity`
                        : 'Capacity and section health'}
                    </p>
                  </div>
                </header>

                {summary.totalSections === 0 ? (
                  <div className="bo-empty bo-empty--compact">
                    <div>
                      <p>No sections to review.</p>
                      <span>Add a block for this term to see capacity health.</span>
                    </div>
                  </div>
                ) : attentionRows.length === 0 ? (
                  <div className="bo-empty bo-empty--compact bo-empty--success">
                    <CheckCircle2 size={20} aria-hidden="true" />
                    <div>
                      <p>All sections are within capacity.</p>
                      <span>
                        No section is above 85% utilization
                        {summary.closedSections > 0
                          ? `; ${summary.closedSections} section${summary.closedSections === 1 ? ' is' : 's are'} closed.`
                          : '.'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <ul className="bo-attention-list">
                      {attentionRows.slice(0, 5).map((row) => (
                        <li key={row.section._id}>
                          <div>
                            <span className="bo-attention-block">
                              {formatBlockDisplay(row.section.sectionCode)}
                            </span>
                            <span className="bo-attention-meta">
                              {row.section.currentPopulation} of {row.section.capacity} seats {'\u00b7'}{' '}
                              {formatPercent(row.utilization)}
                            </span>
                          </div>
                          <span className={`bo-attention-state bo-attention-state--${row.capacityState}`}>
                            {CAPACITY_LABEL[row.capacityState]}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {attentionRows.length > 5 && (
                      <p className="bo-panel-note">
                        +{attentionRows.length - 5} more section
                        {attentionRows.length - 5 === 1 ? '' : 's'} need review.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="bo-panel" aria-labelledby="bo-activity-heading">
                <header className="bo-panel-head">
                  <div>
                    <h3 id="bo-activity-heading">Recent activity</h3>
                    <p>Placements and transfers</p>
                  </div>
                </header>

                {capacityUpdates.length === 0 ? (
                  <div className="bo-empty bo-empty--compact">
                    <div>
                      <p>No placement activity yet.</p>
                      <span>Assignments made by registrars will appear here.</span>
                    </div>
                  </div>
                ) : (
                  <ul className="bo-activity-list">
                    {capacityUpdates.slice(0, 6).map((update) => {
                      const action =
                        update.actionType === 'UNASSIGN'
                          ? 'was removed from'
                          : update.actionType === 'TRANSFER'
                            ? 'was transferred to'
                            : 'was assigned to'
                      const tone =
                        update.actionType === 'UNASSIGN'
                          ? 'remove'
                          : update.actionType === 'TRANSFER'
                            ? 'transfer'
                            : 'assign'

                      return (
                        <li key={update._id} className={`bo-activity-item bo-activity-item--${tone}`}>
                          <span className="bo-activity-mark" aria-hidden="true" />
                          <div className="bo-activity-body">
                            <p>
                              <strong>{update.studentName}</strong> {action}{' '}
                              <span>{formatBlockDisplay(update.sectionCode)}</span>
                            </p>
                            <time
                              dateTime={update.timestamp}
                              title={formatAbsoluteTime(update.timestamp) || undefined}
                            >
                              {formatRelativeTime(update.timestamp)}
                            </time>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

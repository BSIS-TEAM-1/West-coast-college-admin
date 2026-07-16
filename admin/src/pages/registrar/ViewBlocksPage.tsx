import { useEffect, useState } from 'react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection, BlockWorkspaceSelection } from './registrarBlockTypes'

type ViewBlocksPageProps = {
  onBack: () => void
  onOpenWorkspace: (selection: BlockWorkspaceSelection) => void
}

function ViewBlocksPage({ onBack, onOpenWorkspace }: ViewBlocksPageProps) {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<BlockGroup | null>(null)
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('')
  const [selectedYearFilter, setSelectedYearFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }

  const formatBlockLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return value
    const parts = text.split('-')
    if (parts.length === 0) return text
    const first = parts[0]
    const mapped = courseAbbreviationByCode[first] || first
    return [mapped, ...parts.slice(1)].join('-')
  }

  const parseBlockSlot = (value: string) => {
    const text = String(value || '').trim().toUpperCase()
    if (!text) return null

    const directMatch = text.match(/(?:^|-)(\d+)([A-Z])$/)
    if (directMatch) {
      return {
        yearLevel: Number(directMatch[1]) || 99,
        letter: directMatch[2]
      }
    }

    const dashedMatch = text.match(/(?:^|-)(\d+)-([A-Z])$/)
    if (dashedMatch) {
      return {
        yearLevel: Number(dashedMatch[1]) || 99,
        letter: dashedMatch[2]
      }
    }

    return null
  }

  const formatBlockColumnLabel = (value: string) => {
    const slot = parseBlockSlot(value)
    if (!slot) return formatBlockLabel(value)
    return `${slot.yearLevel}-${slot.letter}`
  }

  const getCourseAbbreviation = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return 'N/A'
    const first = text.split('-')[0]
    const mapped = courseAbbreviationByCode[first]
    if (mapped) return mapped

    const normalized = first.toUpperCase().replace(/\s+/g, '')
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED') && normalized.includes('ENGLISH')) return 'BSEd-English'
    if (normalized.includes('BSED') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS'))) return 'BSEd-Math'
    if (normalized.includes('BSBA') && normalized.includes('HRM')) return 'BSBA-HRM'
    return first
  }

  const compareBlockOrder = (a: string, b: string) => {
    const slotA = parseBlockSlot(a)
    const slotB = parseBlockSlot(b)

    if (slotA && slotB) {
      if (slotA.yearLevel !== slotB.yearLevel) {
        return slotA.yearLevel - slotB.yearLevel
      }
      return slotA.letter.localeCompare(slotB.letter)
    }

    if (slotA) return -1
    if (slotB) return 1
    return String(a || '').localeCompare(String(b || ''))
  }

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

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      setSections(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setSections([])
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  useEffect(() => {
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroup) {
      setSections([])
      return
    }
    void fetchSections(selectedGroup._id)
  }, [selectedGroup])

  useEffect(() => {
    if (!selectedGroup) return
    const stillExists = blockGroups.some((group) => group._id === selectedGroup._id)
    if (!stillExists) {
      setSelectedGroup(null)
      setSections([])
    }
  }, [blockGroups, selectedGroup])

  const courseRowOrder = ['BEED', 'BSEd-English', 'BSEd-Math', 'BSBA-HRM']
  const courseOptions = Array.from(
    new Set(blockGroups.map((group) => getCourseAbbreviation(group.name)))
  ).sort((a, b) => {
    const indexA = courseRowOrder.indexOf(a)
    const indexB = courseRowOrder.indexOf(b)
    if (indexA >= 0 && indexB >= 0) return indexA - indexB
    if (indexA >= 0) return -1
    if (indexB >= 0) return 1
    return a.localeCompare(b)
  })

  const yearOptions = Array.from(
    new Set(
      blockGroups
        .filter((group) => !selectedCourseFilter || getCourseAbbreviation(group.name) === selectedCourseFilter)
        .map((group) => parseBlockSlot(group.name)?.yearLevel)
        .filter((year): year is number => typeof year === 'number' && Number.isFinite(year))
    )
  ).sort((a, b) => a - b)

  const filteredBlockGroups = blockGroups
    .filter((group) => !selectedCourseFilter || getCourseAbbreviation(group.name) === selectedCourseFilter)
    .filter((group) => {
      if (!selectedYearFilter) return true
      const year = parseBlockSlot(group.name)?.yearLevel
      return String(year || '') === selectedYearFilter
    })
    .sort((a, b) => {
      const byName = compareBlockOrder(a.name, b.name)
      if (byName !== 0) return byName
      if (Number(a.year) !== Number(b.year)) return Number(b.year) - Number(a.year)
      return String(a.semester).localeCompare(String(b.semester))
    })

  const openSections = sections.filter((section) => (section.status || 'OPEN').toUpperCase() === 'OPEN')
  const selectedTargetSection = openSections[0] || sections[0] || null
  const totalSectionCapacity = sections.reduce((sum, section) => sum + (Number(section.capacity) || 0), 0)
  const totalSectionPopulation = sections.reduce((sum, section) => sum + (Number(section.currentPopulation) || 0), 0)
  const selectedYearLevel = selectedGroup ? parseBlockSlot(selectedGroup.name)?.yearLevel : null

  const handleRefresh = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await fetchBlockGroups()
      if (selectedGroup) {
        await fetchSections(selectedGroup._id)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return
    const confirmed = window.confirm(`Delete block "${selectedGroup.name}"? This cannot be undone.`)
    if (!confirmed) return

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${selectedGroup._id}`, {
        method: 'DELETE'
      })
      setSuccess((data?.message as string) || 'Block deleted successfully')
      setSelectedGroup(null)
      setSections([])
      await fetchBlockGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenWorkspace = () => {
    if (!selectedGroup) return
    onOpenWorkspace({
      groupId: selectedGroup._id,
      groupName: selectedGroup.name,
      semester: selectedGroup.semester,
      year: Number(selectedGroup.year),
      initialSectionId: selectedTargetSection?._id || null
    })
  }

  return (
    <div className="registrar-section view-blocks-page">
      <div className="block-view-shell">
        <div className="block-view-header">
          <button type="button" className="registrar-btn registrar-btn-secondary" onClick={onBack}>
            Back to Block Management
          </button>
          <button type="button" className="registrar-btn registrar-btn-secondary" onClick={() => void handleRefresh()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Blocks'}
          </button>
        </div>

        <div>
          <h2 className="registrar-section-title">View Blocks</h2>
          <p className="registrar-section-desc">Browse every created block group on a dedicated page, then inspect sections or open the assignment workspace.</p>
        </div>

        {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}
        {success && <p className="registrar-feedback registrar-feedback-success">{success}</p>}

        <div className="block-summary-grid">
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Created Blocks</span>
            <strong className="block-summary-value">{blockGroups.length}</strong>
            <small>All registrar block groups</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Filtered Results</span>
            <strong className="block-summary-value">{filteredBlockGroups.length}</strong>
            <small>{selectedCourseFilter || selectedYearFilter ? 'Matching current filters' : 'Showing all blocks'}</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Sections</span>
            <strong className="block-summary-value">{sections.length}</strong>
            <small>{selectedGroup ? 'Inside selected block' : 'Select a block to inspect'}</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Open Sections</span>
            <strong className="block-summary-value">{openSections.length}</strong>
            <small>{selectedGroup ? 'Ready for assignment' : 'No block selected'}</small>
          </div>
        </div>

        <div className="block-view-grid">
          <section className="assignment-section block-view-panel">
            <div className="block-panel-head">
              <div>
                <span className="block-step-badge">Directory</span>
                <h3>Created Block Groups</h3>
              </div>
              <p>Filter by course or year level, then pick a block to inspect.</p>
            </div>

            <div className="block-view-filter-row">
              <label className="block-picker-field">
                <span>Course</span>
                <select value={selectedCourseFilter} onChange={(event) => setSelectedCourseFilter(event.target.value)}>
                  <option value="">All courses</option>
                  {courseOptions.map((course) => (
                    <option key={course} value={course}>{course}</option>
                  ))}
                </select>
              </label>
              <label className="block-picker-field">
                <span>Year Level</span>
                <select value={selectedYearFilter} onChange={(event) => setSelectedYearFilter(event.target.value)} disabled={yearOptions.length === 0}>
                  <option value="">{selectedCourseFilter ? 'All year levels' : 'Select course or show all'}</option>
                  {yearOptions.map((yearLevel) => (
                    <option key={yearLevel} value={yearLevel}>{`Year ${yearLevel}`}</option>
                  ))}
                </select>
              </label>
              <div className="block-view-filter-actions">
                <button
                  type="button"
                  className="registrar-btn registrar-btn-secondary"
                  onClick={() => {
                    setSelectedCourseFilter('')
                    setSelectedYearFilter('')
                  }}
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {filteredBlockGroups.length === 0 ? (
              <p className="block-view-empty">No block groups match the current filters.</p>
            ) : (
              <div className="created-block-grid">
                {filteredBlockGroups.map((group) => {
                  const isActive = selectedGroup?._id === group._id
                  const groupYearLevel = parseBlockSlot(group.name)?.yearLevel
                  return (
                    <button
                      key={group._id}
                      type="button"
                      className={`created-block-card ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <span className="created-block-card-label">{getCourseAbbreviation(group.name)}</span>
                      <strong>{formatBlockColumnLabel(group.name)}</strong>
                      <p>{formatBlockLabel(group.name)}</p>
                      <div className="created-block-card-meta">
                        <span>{group.semester}</span>
                        <span>{group.year}</span>
                        <span>{groupYearLevel ? `Year ${groupYearLevel}` : 'No year'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="assignment-section block-view-detail">
            <div className="block-panel-head">
              <div>
                <span className="block-step-badge">Details</span>
                <h3>{selectedGroup ? formatBlockLabel(selectedGroup.name) : 'Select a block'}</h3>
              </div>
              <p>{selectedGroup ? 'Review sections or move straight into the block workspace.' : 'Choose a block card from the directory first.'}</p>
            </div>

            {selectedGroup ? (
              <>
                <div className="block-current-card">
                  <span className="block-current-label">Selected Block Snapshot</span>
                  <strong>{`Block-${formatBlockColumnLabel(selectedGroup.name).replace('-', '')}`}</strong>
                  <div className="block-current-meta">
                    <span>{`${selectedGroup.semester} ${selectedGroup.year}`}</span>
                    <span>{selectedYearLevel ? `Year ${selectedYearLevel}` : 'No year selected'}</span>
                    <span>{`${totalSectionPopulation}/${totalSectionCapacity || 0} seats used`}</span>
                  </div>
                </div>

                <div className="block-view-actions">
                  <button type="button" className="registrar-btn" onClick={handleOpenWorkspace}>
                    Open Workspace
                  </button>
                  <button type="button" className="section-delete-btn" onClick={() => void handleDeleteGroup()} disabled={loading}>
                    Delete Block
                  </button>
                </div>

                {sections.length === 0 ? (
                  <p className="block-view-empty">No sections found for this block yet.</p>
                ) : (
                  <div className="created-block-section-list">
                    {sections
                      .slice()
                      .sort((a, b) => compareBlockOrder(a.sectionCode, b.sectionCode))
                      .map((section) => (
                        <article key={section._id} className="created-block-section-card">
                          <div>
                            <strong>{formatBlockColumnLabel(section.sectionCode)}</strong>
                            <p>{(section.status || 'OPEN').toUpperCase()} section</p>
                          </div>
                          <div className="created-block-section-meta">
                            <span>{`${section.currentPopulation}/${section.capacity} seats`}</span>
                            <span>{(section.status || 'OPEN').toUpperCase()}</span>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="block-view-empty block-view-empty-state">
                <strong>Choose a block group</strong>
                <span>Select a block from the directory to inspect its sections, capacity, and workspace actions.</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default ViewBlocksPage

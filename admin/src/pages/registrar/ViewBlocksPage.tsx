import { useEffect, useState } from 'react'
import { Pencil, Save, Trash2, X } from 'lucide-react'
import type { BlockGroup, BlockSection, BlockWorkspaceSelection } from './registrarBlockTypes'
import BlockStatusBadge from '../../components/BlockStatusBadge'
import CapacityIndicator from '../../components/CapacityIndicator'
import {
  authorizedFetch,
  compareBlockOrder,
  COURSE_OPTIONS,
  formatBlockColumnLabel,
  formatBlockLabel,
  getBlockGroupCompatibilityMeta,
  getCourseAbbreviation,
  parseBlockSlot,
  type Semester
} from '../../lib/blockAssignmentShared'
import './BlockManagement.css'

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
  const [groupEditForm, setGroupEditForm] = useState<{
    courseId: string
    yearLevel: string
    section: string
    semester: Semester
    year: string
  } | null>(null)
  const [savingGroupEdit, setSavingGroupEdit] = useState(false)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [sectionCapacityDraft, setSectionCapacityDraft] = useState('')
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null)

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch<BlockSection[]>(`/api/blocks/groups/${groupId}/sections`)
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
    const confirmed = window.confirm(`Delete block "${formatBlockLabel(selectedGroup.name)}"? This cannot be undone.`)
    if (!confirmed) return

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch<{ message?: string }>(`/api/blocks/groups/${selectedGroup._id}`, {
        method: 'DELETE'
      })
      setSuccess(data?.message || 'Block deleted successfully')
      setSelectedGroup(null)
      setSections([])
      await fetchBlockGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block')
    } finally {
      setLoading(false)
    }
  }

  const handleStartEditGroup = () => {
    if (!selectedGroup) return
    const meta = getBlockGroupCompatibilityMeta(selectedGroup)
    const slot = parseBlockSlot(selectedGroup.name)
    setGroupEditForm({
      courseId: meta.course || '',
      yearLevel: String(meta.yearLevel || slot?.yearLevel || ''),
      section: selectedGroup.section || slot?.letter || '',
      semester: selectedGroup.semester,
      year: String(selectedGroup.year)
    })
    setError('')
    setSuccess('')
  }

  const handleCancelEditGroup = () => {
    setGroupEditForm(null)
  }

  const handleSaveGroupEdit = async () => {
    if (!selectedGroup || !groupEditForm) return

    setSavingGroupEdit(true)
    setError('')
    setSuccess('')
    try {
      const courseOption = COURSE_OPTIONS.find((course) => String(course.value) === groupEditForm.courseId)
      const yearLevelNum = Number(groupEditForm.yearLevel)
      const yearNum = Number(groupEditForm.year)
      const sectionLetter = groupEditForm.section.trim().toUpperCase()
      const name = courseOption && yearLevelNum && sectionLetter
        ? `${courseOption.value}-${yearLevelNum}-${sectionLetter}`
        : selectedGroup.name

      const updated = await authorizedFetch<BlockGroup>(`/api/blocks/groups/${selectedGroup._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          courseId: courseOption?.value,
          courseCode: courseOption?.label,
          yearLevel: yearLevelNum || undefined,
          section: sectionLetter || undefined,
          semester: groupEditForm.semester,
          year: yearNum
        })
      })
      setSuccess('Block group updated successfully')
      setGroupEditForm(null)
      setSelectedGroup(updated)
      await fetchBlockGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update block group')
    } finally {
      setSavingGroupEdit(false)
    }
  }

  const handleStartEditSection = (section: BlockSection) => {
    setEditingSectionId(section._id)
    setSectionCapacityDraft(String(section.capacity))
    setError('')
    setSuccess('')
  }

  const handleCancelEditSection = () => {
    setEditingSectionId(null)
    setSectionCapacityDraft('')
  }

  const handleSaveSectionEdit = async (section: BlockSection) => {
    const nextCapacity = Number(sectionCapacityDraft)
    if (!Number.isFinite(nextCapacity) || nextCapacity < 1) {
      setError('Capacity must be a positive number')
      return
    }

    setSavingSectionId(section._id)
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/blocks/sections/${section._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: nextCapacity })
      })
      setSuccess('Section updated successfully')
      setEditingSectionId(null)
      if (selectedGroup) await fetchSections(selectedGroup._id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update section')
    } finally {
      setSavingSectionId(null)
    }
  }

  const handleDeleteSection = async (section: BlockSection) => {
    const confirmed = window.confirm(`Delete section "${formatBlockColumnLabel(section.sectionCode)}"? This cannot be undone.`)
    if (!confirmed) return

    setSavingSectionId(section._id)
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/blocks/sections/${section._id}`, { method: 'DELETE' })
      setSuccess('Section deleted successfully')
      if (selectedGroup) await fetchSections(selectedGroup._id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete section')
    } finally {
      setSavingSectionId(null)
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
          <div className="assignment-section block-summary-card block-card">
            <span className="block-summary-label">Created Blocks</span>
            <strong className="block-summary-value">{blockGroups.length}</strong>
            <small>All registrar block groups</small>
          </div>
          <div className="assignment-section block-summary-card block-card">
            <span className="block-summary-label">Filtered Results</span>
            <strong className="block-summary-value">{filteredBlockGroups.length}</strong>
            <small>{selectedCourseFilter || selectedYearFilter ? 'Matching current filters' : 'Showing all blocks'}</small>
          </div>
          <div className="assignment-section block-summary-card block-card">
            <span className="block-summary-label">Sections</span>
            <strong className="block-summary-value">{sections.length}</strong>
            <small>{selectedGroup ? 'Inside selected block' : 'Select a block to inspect'}</small>
          </div>
          <div className="assignment-section block-summary-card block-card">
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
                {groupEditForm ? (
                  <div className="block-current-card">
                    <span className="block-current-label">Edit Block Group</span>
                    <div className="block-view-filter-row">
                      <label className="block-picker-field">
                        <span>Course</span>
                        <select
                          value={groupEditForm.courseId}
                          onChange={(event) => setGroupEditForm((current) => current && { ...current, courseId: event.target.value })}
                        >
                          <option value="">Select course</option>
                          {COURSE_OPTIONS.map((course) => (
                            <option key={course.value} value={course.value}>{course.fullLabel}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block-picker-field">
                        <span>Year Level</span>
                        <select
                          value={groupEditForm.yearLevel}
                          onChange={(event) => setGroupEditForm((current) => current && { ...current, yearLevel: event.target.value })}
                        >
                          <option value="">Select year</option>
                          {[1, 2, 3, 4, 5].map((level) => (
                            <option key={level} value={level}>{`Year ${level}`}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block-picker-field">
                        <span>Section</span>
                        <select
                          value={groupEditForm.section}
                          onChange={(event) => setGroupEditForm((current) => current && { ...current, section: event.target.value })}
                        >
                          <option value="">Select section</option>
                          {['A', 'B', 'C', 'D'].map((letter) => (
                            <option key={letter} value={letter}>{letter}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block-picker-field">
                        <span>Semester</span>
                        <select
                          value={groupEditForm.semester}
                          onChange={(event) => setGroupEditForm((current) => current && { ...current, semester: event.target.value as Semester })}
                        >
                          <option value="1st">1st Semester</option>
                          <option value="2nd">2nd Semester</option>
                          <option value="Summer">Summer Semester</option>
                        </select>
                      </label>
                      <label className="block-picker-field">
                        <span>Academic Year</span>
                        <input
                          type="number"
                          value={groupEditForm.year}
                          onChange={(event) => setGroupEditForm((current) => current && { ...current, year: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="block-view-actions">
                      <button type="button" className="registrar-btn" onClick={() => void handleSaveGroupEdit()} disabled={savingGroupEdit}>
                        <Save size={16} />
                        {savingGroupEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button type="button" className="registrar-btn registrar-btn-secondary" onClick={handleCancelEditGroup} disabled={savingGroupEdit}>
                        <X size={16} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="block-current-card">
                    <span className="block-current-label">Selected Block Snapshot</span>
                    <strong>{`Block-${formatBlockColumnLabel(selectedGroup.name).replace('-', '')}`}</strong>
                    <div className="block-current-meta">
                      <span>{`${selectedGroup.semester} ${selectedGroup.year}`}</span>
                      <span>{selectedYearLevel ? `Year ${selectedYearLevel}` : 'No year selected'}</span>
                      <span>{`${totalSectionPopulation}/${totalSectionCapacity || 0} seats used`}</span>
                    </div>
                  </div>
                )}

                {!groupEditForm && (
                  <div className="block-view-actions">
                    <button type="button" className="registrar-btn" onClick={handleOpenWorkspace}>
                      Open Workspace
                    </button>
                    <button type="button" className="registrar-btn registrar-btn-secondary" onClick={handleStartEditGroup}>
                      <Pencil size={16} />
                      Edit Block
                    </button>
                    <button type="button" className="section-delete-btn" onClick={() => void handleDeleteGroup()} disabled={loading}>
                      Delete Block
                    </button>
                  </div>
                )}

                {sections.length === 0 ? (
                  <p className="block-view-empty">No sections found for this block yet.</p>
                ) : (
                  <div className="created-block-section-list">
                    {sections
                      .slice()
                      .sort((a, b) => compareBlockOrder(a.sectionCode, b.sectionCode))
                      .map((section) => (
                        <article key={section._id} className="created-block-section-card block-card">
                          <div>
                            <strong>{formatBlockColumnLabel(section.sectionCode)}</strong>
                            <BlockStatusBadge status={(section.status || 'OPEN') as 'OPEN' | 'CLOSED'} size="sm" />
                          </div>
                          {editingSectionId === section._id ? (
                            <div className="created-block-section-meta">
                              <input
                                type="number"
                                min={1}
                                value={sectionCapacityDraft}
                                onChange={(event) => setSectionCapacityDraft(event.target.value)}
                                aria-label="New capacity"
                              />
                              <button
                                type="button"
                                className="registrar-btn registrar-btn-secondary"
                                onClick={() => void handleSaveSectionEdit(section)}
                                disabled={savingSectionId === section._id}
                                aria-label="Save section capacity"
                              >
                                <Save size={14} />
                              </button>
                              <button
                                type="button"
                                className="registrar-btn registrar-btn-secondary"
                                onClick={handleCancelEditSection}
                                disabled={savingSectionId === section._id}
                                aria-label="Cancel editing section"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="created-block-section-meta">
                              <CapacityIndicator
                                current={section.currentPopulation}
                                capacity={section.capacity}
                                showLabel={false}
                                showText={true}
                                size="sm"
                              />
                              <button
                                type="button"
                                className="registrar-btn registrar-btn-secondary"
                                onClick={() => handleStartEditSection(section)}
                                aria-label={`Edit ${formatBlockColumnLabel(section.sectionCode)}`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="section-delete-btn"
                                onClick={() => void handleDeleteSection(section)}
                                disabled={savingSectionId === section._id}
                                aria-label={`Delete ${formatBlockColumnLabel(section.sectionCode)}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
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

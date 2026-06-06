import { useEffect, useRef, useState } from 'react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection, Semester } from './registrarBlockTypes'

type BlockManagementProps = {
  onOpenBlocksPage: () => void
}

function BlockManagement({ onOpenBlocksPage }: BlockManagementProps) {
  const blockCourseOptions: Array<{ value: number; label: string; fullLabel: string }> = [
    { value: 101, label: 'BEED', fullLabel: 'Bachelor of Elementary Education (BEED)' },
    { value: 102, label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
    { value: 103, label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
    { value: 201, label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' }
  ]
  const blockNumberOptions = [
    '1-A',
    '1-B',
    '1-C',
    '1-D',
    '2-A',
    '2-B',
    '2-C',
    '2-D',
    '3-A',
    '3-B',
    '3-C',
    '3-D',
    '4-A',
    '4-B',
    '4-C',
    '4-D',
    '5-A',
    '5-B',
    '5-C',
    '5-D'
  ]
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<BlockGroup | null>(null)
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newGroupCourse, setNewGroupCourse] = useState<number>(103)
  const [newGroupBlockNumber, setNewGroupBlockNumber] = useState('1-A')
  const [isBlockNumberOpen, setIsBlockNumberOpen] = useState(false)
  const blockNumberDropdownRef = useRef<HTMLDivElement>(null)
  const [newGroupSemester, setNewGroupSemester] = useState<Semester>('1st')
  const [newGroupYear, setNewGroupYear] = useState<number>(new Date().getFullYear())
  const openBlocks = sections.filter((s) => (s.status || 'OPEN').toUpperCase() === 'OPEN')
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

  useEffect(() => {
    if (!selectedGroup) return
    const stillExists = blockGroups.some((group) => group._id === selectedGroup._id)
    if (!stillExists) {
      setSelectedGroup(null)
    }
  }, [blockGroups, selectedGroup])

  useEffect(() => {
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroup) {
      setSections([])
      setSelectedSection('')
      return
    }
    void fetchSections(selectedGroup._id)
  }, [selectedGroup])

  useEffect(() => {
    if (!selectedGroup) return
    if (openBlocks.length === 0) {
      if (selectedSection) setSelectedSection('')
      return
    }
    if (!openBlocks.some((block) => block._id === selectedSection)) {
      setSelectedSection(openBlocks[0]._id)
    }
  }, [selectedGroup, openBlocks, selectedSection])
  
  useEffect(() => {
    if (!isBlockNumberOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!blockNumberDropdownRef.current) return
      if (!blockNumberDropdownRef.current.contains(event.target as Node)) {
        setIsBlockNumberOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isBlockNumberOpen])

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
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  const handleCreateGroup = async () => {
    const selectedCourse = blockCourseOptions.find((course) => course.value === Number(newGroupCourse))
    const normalizedBlockNumber = String(newGroupBlockNumber || '').trim().toUpperCase()
    const blockMatch = normalizedBlockNumber.match(/^([1-5])-([A-D])$/)

    if (!selectedCourse) {
      setError('Course is required')
      return
    }
    if (!blockMatch) {
      setError('Block number must be in format 1-A to 5-D')
      return
    }
    const generatedGroupName = `${selectedCourse.value}-${normalizedBlockNumber}`
    const [blockYearLevel, blockLetter] = [Number(blockMatch[1]), blockMatch[2]]
    const hasExistingInTerm = blockGroups.some((group) => {
      if (group.semester !== newGroupSemester || Number(group.year) !== Number(newGroupYear)) return false
      const normalizedExisting = String(group.name || '').trim().toUpperCase()
      const existingCourse = Number(normalizedExisting.split('-')[0]) || null
      const existingMatch = normalizedExisting.match(/(?:^|-)(\d+)-?([A-D])$/)
      if (!existingMatch) return false
      return (
        existingCourse === Number(selectedCourse.value) &&
        Number(existingMatch[1]) === blockYearLevel &&
        existingMatch[2] === blockLetter
      )
    })
    if (hasExistingInTerm) {
      setError('Block group already exists for this semester/year')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const created = await authorizedFetch('/api/blocks/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedGroupName,
          semester: newGroupSemester,
          year: Number(newGroupYear)
        })
      })
      await authorizedFetch(`/api/blocks/groups/${(created as BlockGroup)._id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionCode: generatedGroupName,
          capacity: 30,
          schedule: ''
        })
      })
      await fetchBlockGroups()
      setSelectedGroup(created as BlockGroup)
      await fetchSections((created as BlockGroup)._id)
      setNewGroupBlockNumber('1-A')
      setSuccess('Block created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create block')
    } finally {
      setLoading(false)
    }
  }

  const selectedGroupLabel = selectedGroup
    ? `${formatBlockLabel(selectedGroup.name)} (${selectedGroup.semester} ${selectedGroup.year})`
    : 'No block selected yet'
  const selectedTargetSection = sections.find((section) => section._id === selectedSection) || null
  const selectedCourseOption = blockCourseOptions.find((course) => course.value === Number(newGroupCourse)) || null
  const newGroupPreviewCode = `${selectedCourseOption?.fullLabel || 'Course'}`
  const newGroupPreviewInlineCode = `${selectedCourseOption?.label || 'Course'} - ${newGroupBlockNumber}`
  const newGroupPreviewCourseCode = `${selectedCourseOption?.value || '000'}`
  const newGroupPreviewLabel = `${selectedCourseOption?.fullLabel || 'Course'}`
  const totalSectionCapacity = sections.reduce((sum, section) => sum + (Number(section.capacity) || 0), 0)
  const totalSectionPopulation = sections.reduce((sum, section) => sum + (Number(section.currentPopulation) || 0), 0)
  const utilizationPercent = totalSectionCapacity > 0
    ? Math.min(100, Math.round((totalSectionPopulation / totalSectionCapacity) * 100))
    : 0
  const selectedYearLevel = selectedGroup ? parseBlockSlot(selectedGroup.name)?.yearLevel : null
  const selectedBlockBadge = selectedGroup
    ? `Block-${formatBlockColumnLabel(selectedGroup.name).replace('-', '')}`
    : 'No block selected'
  const tutorialTarget = !blockGroups.length ? 'create-action' : 'view-blocks'
  const guidePanelTitle = tutorialTarget === 'create-action' ? 'Press Create Block' : 'Press View Blocks'
  const guidePanelText = tutorialTarget === 'create-action'
    ? `The form is prefilled. Change anything you want, then press Create Block for ${newGroupPreviewCode}.`
    : 'Created block groups now live on a separate page. Press View Blocks to browse them, review sections, and open the workspace.'
  const tutorialFocus = {
    createAction: tutorialTarget === 'create-action',
    viewBlocks: tutorialTarget === 'view-blocks'
  }

  return (
    <div className="registrar-section block-management-page">
      {(error || success) && (
        <div
          className={`block-management-notice ${error ? 'block-management-notice-error' : 'block-management-notice-success'}`}
          role="alert"
          aria-live="assertive"
        >
          <div>
            <strong>{error ? 'Block creation failed' : 'Block updated'}</strong>
            <p>{error || success}</p>
          </div>
          <button
            type="button"
            aria-label="Close notification"
            onClick={() => {
              setError('')
              setSuccess('')
            }}
          >
            x
          </button>
        </div>
      )}

      <h2 className="registrar-section-title">Block Management</h2>
      <p className="registrar-section-desc">Create blocks, assign students, and monitor block capacity with a guided flow.</p>

      <div className="block-management-content">
        <div className="block-summary-grid">
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Block Groups</span>
            <strong className="block-summary-value">{blockGroups.length}</strong>
            <small>Available this registrar view</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Open Sections</span>
            <strong className="block-summary-value">{openBlocks.length}</strong>
            <small>{selectedGroup ? 'Inside selected block group' : 'Select a block group to view'}</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Sections</span>
            <strong className="block-summary-value">{sections.length}</strong>
            <small>{selectedGroup ? 'Inside selected block group' : 'Select a block group to view'}</small>
          </div>
          <div className="assignment-section block-summary-card">
            <span className="block-summary-label">Selected Section</span>
            <strong className="block-summary-value">{selectedTargetSection ? formatBlockColumnLabel(selectedTargetSection.sectionCode) : 'N/A'}</strong>
            <small>{selectedTargetSection ? `Target: ${formatBlockColumnLabel(selectedTargetSection.sectionCode)}` : 'No target section selected'}</small>
          </div>
        </div>

        <div className="block-management-header-row">
          <div className="block-management-banner">
            <span className="block-hero-kicker">Registrar Workflow</span>
            <div className="block-management-banner-copy">
              <h3>Build blocks faster</h3>
              <p>Start with a clean block preview, confirm the term and slot, then move straight into the workspace once the block is created.</p>
            </div>
          </div>
          <div className="block-management-inline-summary">
            <div className="block-management-inline-summary-copy">
              <span className="block-hero-status-label">Setup Summary</span>
              <strong>{guidePanelTitle}</strong>
              <p>{guidePanelText}</p>
            </div>
            <div className="block-management-inline-summary-meta">
              <span>{selectedGroup ? `${openBlocks.length} open section(s)` : `${blockGroups.length} total block group(s)`}</span>
              <span>{selectedGroup ? `${totalSectionPopulation}/${totalSectionCapacity || 0} seats used` : 'Guided setup mode'}</span>
            </div>
          </div>
        </div>

        <div className="block-management-workspace-grid">
          <div className="assignment-section block-create-card">
          <div className="block-panel-head">
            <div>
              <span className="block-step-badge">Step 1</span>
              <h3>Create Block</h3>
            </div>
            <p>Choose the course, slot, and term before you create the block group.</p>
          </div>
          <div className="block-selection-helper-list">
            <span className="block-selection-pill">Default capacity: 30 seats</span>
            <span className="block-selection-pill">{newGroupSemester} {newGroupYear}</span>
            <span className="block-selection-pill">{selectedCourseOption?.label || 'Course not set'}</span>
          </div>
          <div className="block-preview-card">
            <span className="block-preview-label">Preview</span>
            <strong>{newGroupPreviewLabel}</strong>
            <p>Code: {newGroupPreviewCourseCode}</p>
            <div className="block-preview-meta">
              <span>Block-{newGroupBlockNumber.replace('-', '')}</span>
              <span>{newGroupSemester}</span>
              <span>{newGroupYear}</span>
            </div>
          </div>
          <p className="assignment-help-text">This creates the block group first, then auto-generates its initial section.</p>
          <div className="assignment-form">
            <label>
              <span className="block-field-head">
                <span>Course</span>
              </span>
              <select value={newGroupCourse} onChange={(e) => setNewGroupCourse(parseInt(e.target.value, 10))}>
                {blockCourseOptions.map((course) => (
                  <option key={course.value} value={course.value}>
                    {course.value} - {course.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block-field-head">
                <span>Block Number</span>
              </span>
              <div className="block-number-select-wrapper" ref={blockNumberDropdownRef}>
                <button
                  type="button"
                  className={`block-number-select-trigger ${tutorialFocus.createAction ? 'tutorial-focus' : ''}`}
                  onClick={() => setIsBlockNumberOpen((prev) => !prev)}
                  aria-expanded={isBlockNumberOpen}
                  aria-haspopup="listbox"
                >
                  <span>{newGroupBlockNumber}</span>
                  <span aria-hidden="true" className="block-number-select-caret">▾</span>
                </button>
                {isBlockNumberOpen && (
                  <div className="block-number-select-list" role="listbox" aria-label="Block number options">
                    {blockNumberOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="block-number-select-option"
                        role="option"
                        aria-selected={newGroupBlockNumber === value}
                        onClick={() => {
                          setNewGroupBlockNumber(value)
                          setIsBlockNumberOpen(false)
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label>
              <span className="block-field-head">
                <span>Semester</span>
              </span>
              <select value={newGroupSemester} onChange={(e) => setNewGroupSemester(e.target.value as Semester)}>
                <option value="1st">1st</option>
                <option value="2nd">2nd</option>
                <option value="Summer">Summer</option>
              </select>
            </label>
            <label>
              <span className="block-field-head">
                <span>Year</span>
              </span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={newGroupYear}
                onChange={(e) => setNewGroupYear(parseInt(e.target.value || `${new Date().getFullYear()}`, 10))} />
            </label>
            <p className="assignment-inline-note">Block name preview: <strong>{newGroupPreviewInlineCode}</strong></p>
            <p className="assignment-inline-note assignment-inline-note-small">
              Preview uses the abbreviated course label, for example <strong>{`${selectedCourseOption?.label || 'BSEd-Math'} - 1-A`}</strong>.
            </p>
            <div className="block-action-stack">
              {tutorialFocus.createAction && (
                <span className="block-control-callout">Press this button to create your first block.</span>
              )}
              <button
                type="button"
                className={`registrar-btn ${tutorialFocus.createAction ? 'tutorial-focus' : ''}`}
                onClick={handleCreateGroup}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Create Block'}
              </button>
            </div>
          </div>
          </div>

          <div className="block-selection block-selection-card">
        <div className="block-selection-head">
          <div>
            <span className="block-step-badge">Step 2</span>
            <p className="block-selection-title">View Blocks</p>
          </div>
          <p className="block-selection-subtitle">{blockGroups.length} created</p>
        </div>
        <p className="block-selection-helper">Open a dedicated page to browse created blocks, inspect sections, delete a block, and launch the assignment workspace.</p>
        <div className="block-selection-helper-list">
          <span className="block-selection-pill">
            {blockGroups.length ? `${blockGroups.length} block group(s)` : 'No blocks yet'}
          </span>
          <span className="block-selection-pill">
            {selectedGroup ? `Latest: ${selectedGroupLabel}` : 'Create one, then review it here'}
          </span>
          <span className="block-selection-pill">
            {selectedGroup && selectedTargetSection ? `Target: ${formatBlockColumnLabel(selectedTargetSection.sectionCode)}` : 'Sections shown on View Blocks'}
          </span>
        </div>
        <div className="block-current-card">
          <span className="block-current-label">Blocks Page Preview</span>
          <strong>{selectedGroup ? selectedBlockBadge : `${blockGroups.length} block group(s)`}</strong>
          <p>{selectedGroup ? `${formatBlockLabel(selectedGroup.name)} is ready for section review and student assignment on the View Blocks page.` : 'Keep block creation here, then use the separate View Blocks page for browsing and workspace entry.'}</p>
          <div className="block-current-meta">
            <span>{selectedGroup ? `${selectedGroup.semester} ${selectedGroup.year}` : 'Ready for review'}</span>
            <span>{selectedGroup && selectedYearLevel ? `Year ${selectedYearLevel}` : 'Dedicated block directory'}</span>
            <span>{selectedGroup ? `${utilizationPercent}% utilized` : 'Cleaner block workflow'}</span>
          </div>
        </div>
        <div className="block-selection-actions">
          <div className="block-action-stack">
            {tutorialFocus.viewBlocks && (
              <span className="block-control-callout">Press this to open the dedicated block directory.</span>
            )}
            <button
              type="button"
              className={`registrar-btn ${tutorialFocus.viewBlocks ? 'tutorial-focus' : ''}`}
              onClick={onOpenBlocksPage}
            >
              View Blocks
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BlockManagement

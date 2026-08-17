import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, LayoutList, Pencil, Plus, RotateCcw, AlertCircle, Save, Clock, X } from 'lucide-react'
import type { BlockGroup, Semester, BlockDraft } from './registrarBlockTypes'
import {
  authorizedFetch,
  COURSE_OPTIONS as blockCourseOptions,
  formatBlockLabel,
  getBlockGroupCompatibilityMeta,
  parseBlockSlot
} from '../../lib/blockAssignmentShared'
import { getAcademicTerm } from '../../lib/settingsApi'
import './BlockManagement.css'

type BlockManagementProps = {
  onOpenBlocksPage: () => void
  onGoDashboard?: () => void
}

type WizardStep = 1 | 2 | 3

const yearLevelOptions = ['1st', '2nd', '3rd', '4th', '5th']
const sectionOptions = ['A', 'B', 'C', 'D']
const blockNumberOptions = yearLevelOptions.flatMap((yearLabel, yearIndex) =>
  sectionOptions.map((section) => ({
    value: `${yearIndex + 1}-${section}`,
    label: `${yearLabel} Year — Section ${section}`
  }))
)

const currentYear = new Date().getFullYear()
const DRAFT_STORAGE_KEY = 'block-management-drafts'
const AUTO_SAVE_INTERVAL = 30000 // 30 seconds

function BlockManagement({ onOpenBlocksPage, onGoDashboard }: BlockManagementProps) {
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newGroupCourse, setNewGroupCourse] = useState('')
  const [newGroupBlockNumber, setNewGroupBlockNumber] = useState('')
  const [newGroupSemester, setNewGroupSemester] = useState<Semester>('1st')
  const [newGroupYear, setNewGroupYear] = useState<number>(currentYear)
  const [newGroupCapacity, setNewGroupCapacity] = useState<number>(30)
  const [newGroupClassification, setNewGroupClassification] = useState<string>('All')
  const [newGroupCurriculumId, setNewGroupCurriculumId] = useState<string>('')
  const [availableCurriculums, setAvailableCurriculums] = useState<Array<{
    _id: string
    name: string
    code: string
    version: string
    status: string
    programCode: number
    subjectCount?: number
  }>>([])
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [editGroupForm, setEditGroupForm] = useState<{
    courseId: string
    yearLevel: string
    section: string
    semester: Semester
    year: string
    studentClassification: string
  } | null>(null)
  const [savingEditGroup, setSavingEditGroup] = useState(false)

  // Estimated completion time based on wizard step
  const getEstimatedTime = useCallback(() => {
    switch (wizardStep) {
      case 1:
        return '2-3 minutes remaining'
      case 2:
        return '1-2 minutes remaining'
      case 3:
        return 'Completed'
      default:
        return 'Unknown'
    }
  }, [wizardStep])



  const selectedCourse = useMemo(
    () => blockCourseOptions.find((course) => course.value === Number(newGroupCourse)) || null,
    [newGroupCourse]
  )
  const normalizedBlockNumber = String(newGroupBlockNumber || '').trim().toUpperCase()
  const selectedBlockOption = useMemo(() => blockNumberOptions.find((o) => o.value === normalizedBlockNumber), [normalizedBlockNumber])
  const generatedStorageName = selectedCourse && normalizedBlockNumber ? `${selectedCourse.value}-${normalizedBlockNumber}` : ''
  const generatedDisplayName = selectedCourse && normalizedBlockNumber ? `${selectedCourse.label} - ${selectedBlockOption?.label || normalizedBlockNumber}` : 'No block selected'
  const [newGroupYearLevel, newGroupSection] = normalizedBlockNumber.split('-')
  const yearLevelDisplay = useMemo(() => {
    const labels = ['1st', '2nd', '3rd', '4th', '5th']
    const num = Number(newGroupYearLevel)
    return Number.isInteger(num) && num >= 1 && num <= 5 ? `${labels[num - 1]} Year` : '—'
  }, [newGroupYearLevel])
  const courseIsSelected = Boolean(selectedCourse)
  const blockNumberIsSelected = Boolean(normalizedBlockNumber)
  const blockNumberIsValid = /^([1-5])-([A-D])$/.test(normalizedBlockNumber)
  const yearIsValid = Number.isInteger(Number(newGroupYear)) && Number(newGroupYear) >= 2000 && Number(newGroupYear) <= 2100
  const capacityIsValid = Number.isInteger(Number(newGroupCapacity)) && Number(newGroupCapacity) >= 1 && Number(newGroupCapacity) <= 50
  const hasDuplicate = blockGroups.some((group) => {
    if (group.semester !== newGroupSemester || Number(group.year) !== Number(newGroupYear)) return false
    if (!generatedStorageName) return false
    if (group.courseId && group.yearLevel && group.section) {
      return (
        Number(group.courseId) === Number(newGroupCourse) &&
        Number(group.yearLevel) === Number(newGroupYearLevel) &&
        String(group.section).toUpperCase() === String(newGroupSection).toUpperCase()
      )
    }
    return String(group.name || '').trim().toUpperCase() === generatedStorageName.toUpperCase()
  })

  useEffect(() => {
    void fetchBlockGroups()
    // Check for existing drafts on component mount
    loadExistingDraft()

    // Default the wizard's term to the configured "Current School Year" setting.
    getAcademicTerm()
      .then((term) => {
        const startYear = Number(term.schoolYear.split('-')[0])
        if (Number.isFinite(startYear) && startYear > 0) setNewGroupYear(startYear)
        setNewGroupSemester(term.semester)
      })
      .catch(() => {
        // Silently fall back to the calendar-year default if the setting can't be loaded.
      })
  }, [])

  // Fetch curriculums for the selected program so the registrar can link
  // a specific curriculum version to the block group. When a curriculum is
  // linked, subjects are auto-assigned from it when sections are created.
  useEffect(() => {
    if (!newGroupCourse) {
      setAvailableCurriculums([])
      setNewGroupCurriculumId('')
      return
    }
    const fetchCurriculums = async () => {
      try {
        const data = await authorizedFetch<{ data: Array<{
          _id: string
          name: string
          code: string
          version: string
          status: string
          programCode: number
          programName: string
          subjectCount?: number
        }> }>(`/api/registrar/curriculums?programCode=${newGroupCourse}`)
        const curriculums = Array.isArray(data?.data) ? data.data : []
        // Exclude Archived curriculums from the selector
        const usable = curriculums.filter((c) => c.status !== 'Archived')
        setAvailableCurriculums(usable)
        // Auto-select the Active curriculum if there is exactly one
        const active = usable.filter((c) => c.status === 'Active')
        if (active.length === 1) {
          setNewGroupCurriculumId(active[0]._id)
        } else {
          setNewGroupCurriculumId('')
        }
      } catch {
        setAvailableCurriculums([])
        setNewGroupCurriculumId('')
      }
    }
    void fetchCurriculums()
  }, [newGroupCourse])
  useEffect(() => {
    if (wizardStep === 1 && (newGroupCourse || newGroupBlockNumber || newGroupSemester || newGroupYear || newGroupCapacity)) {
      // Start auto-save timer
      autoSaveTimerRef.current = setTimeout(() => {
        void handleAutoSave()
      }, AUTO_SAVE_INTERVAL)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [wizardStep, newGroupCourse, newGroupBlockNumber, newGroupSemester, newGroupYear, newGroupCapacity])

  // Clear draft after successful creation
  useEffect(() => {
    if (wizardStep === 3) {
      clearDraft()
    }
  }, [wizardStep])

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const handleStartEditExistingGroup = (group: BlockGroup) => {
    const meta = getBlockGroupCompatibilityMeta(group)
    const slot = parseBlockSlot(group.name)
    setEditGroupId(group._id)
    setEditGroupForm({
      courseId: meta.course || '',
      yearLevel: String(meta.yearLevel || slot?.yearLevel || ''),
      section: group.section || slot?.letter || '',
      semester: group.semester,
      year: String(group.year),
      studentClassification: group.studentClassification || 'All'
    })
    setError('')
    setSuccess('')
  }

  const handleCancelEditExistingGroup = () => {
    setEditGroupId(null)
    setEditGroupForm(null)
  }

  const handleSaveEditExistingGroup = async () => {
    if (!editGroupId || !editGroupForm) return

    setSavingEditGroup(true)
    setError('')
    setSuccess('')
    try {
      const courseOption = blockCourseOptions.find((course) => String(course.value) === editGroupForm.courseId)
      const yearLevelNum = Number(editGroupForm.yearLevel)
      const yearNum = Number(editGroupForm.year)
      const sectionLetter = editGroupForm.section.trim().toUpperCase()
      const name = courseOption && yearLevelNum && sectionLetter
        ? `${courseOption.value}-${yearLevelNum}-${sectionLetter}`
        : undefined

      await authorizedFetch(`/api/blocks/groups/${editGroupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(name ? { name } : {}),
          courseId: courseOption?.value,
          courseCode: courseOption?.label,
          yearLevel: yearLevelNum || undefined,
          section: sectionLetter || undefined,
          semester: editGroupForm.semester,
          year: yearNum,
          studentClassification: editGroupForm.studentClassification || 'All'
        })
      })
      setSuccess('Block group updated successfully')
      setEditGroupId(null)
      setEditGroupForm(null)
      await fetchBlockGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update block group')
    } finally {
      setSavingEditGroup(false)
    }
  }

  const handleNext = () => {
    const validationMessage = validateForm()
    setError(validationMessage)
    setSuccess('')
    if (validationMessage) return
    setWizardStep(2)
  }

  // Draft storage utilities
  const getDrafts = useCallback((): BlockDraft[] => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }, [])

  const saveDraft = useCallback((draftData: Omit<BlockDraft, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const drafts = getDrafts()
      const existingDraftIndex = drafts.findIndex(
        (d) => d.course === draftData.course && d.blockNumber === draftData.blockNumber
      )

      const now = new Date().toISOString()
      let updatedDrafts: BlockDraft[]

      if (existingDraftIndex >= 0) {
        // Update existing draft
        updatedDrafts = drafts.map((d, index) =>
          index === existingDraftIndex
            ? { ...d, ...draftData, updatedAt: now }
            : d
        )
      } else {
        // Create new draft
        const newDraft: BlockDraft = {
          ...draftData,
          id: `${draftData.course}-${draftData.blockNumber}-${Date.now()}`,
          createdAt: now,
          updatedAt: now
        }
        updatedDrafts = [...drafts, newDraft]
      }

      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts))
      setDraft(updatedDrafts.find((d) => d.course === draftData.course && d.blockNumber === draftData.blockNumber) || null)
      return true
    } catch {
      return false
    }
  }, [getDrafts])

  const loadExistingDraft = useCallback(() => {
    try {
      const drafts = getDrafts()
      if (drafts.length > 0) {
        // Load the most recent draft
        const mostRecent = drafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
        setDraft(mostRecent)
        // Optionally auto-fill the form with the draft data
        // setNewGroupCourse(mostRecent.course)
        // setNewGroupBlockNumber(mostRecent.blockNumber)
        // setNewGroupSemester(mostRecent.semester)
        // setNewGroupYear(mostRecent.year)
        // setNewGroupCapacity(mostRecent.capacity)
      }
    } catch {
      // Silently fail if draft loading fails
    }
  }, [getDrafts])

  const restoreDraft = useCallback((draftToRestore: BlockDraft) => {
    setNewGroupCourse(draftToRestore.course)
    setNewGroupBlockNumber(draftToRestore.blockNumber)
    setNewGroupSemester(draftToRestore.semester)
    setNewGroupYear(draftToRestore.year)
    setNewGroupCapacity(draftToRestore.capacity)
    setDraft(draftToRestore)
    setError('')
    setSuccess('')
  }, [])

  const clearDraft = useCallback(() => {
    try {
      const drafts = getDrafts()
      const updatedDrafts = drafts.filter((d) => d.id !== draft?.id)
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts))
      setDraft(null)
    } catch {
      // Silently fail if draft clearing fails
    }
  }, [draft, getDrafts])

  const handleAutoSave = useCallback(async () => {
    if (wizardStep !== 1) return

    setAutoSaveStatus('saving')
    const success = saveDraft({
      course: newGroupCourse,
      blockNumber: newGroupBlockNumber,
      semester: newGroupSemester,
      year: newGroupYear,
      capacity: newGroupCapacity
    })

    if (success) {
      setAutoSaveStatus('saved')
      setLastAutoSaveTime(new Date())
      setTimeout(() => setAutoSaveStatus('idle'), 3000)
    } else {
      setAutoSaveStatus('error')
      setTimeout(() => setAutoSaveStatus('idle'), 3000)
    }
  }, [wizardStep, newGroupCourse, newGroupBlockNumber, newGroupSemester, newGroupYear, newGroupCapacity, saveDraft])

  const handleSaveDraft = useCallback(() => {
    const success = saveDraft({
      course: newGroupCourse,
      blockNumber: newGroupBlockNumber,
      semester: newGroupSemester,
      year: newGroupYear,
      capacity: newGroupCapacity
    })

    if (success) {
      setSuccess('Draft saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } else {
      setError('Failed to save draft')
      setTimeout(() => setError(''), 3000)
    }
  }, [newGroupCourse, newGroupBlockNumber, newGroupSemester, newGroupYear, newGroupCapacity, saveDraft])

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+S to save draft
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (courseIsSelected && blockNumberIsSelected) {
        handleSaveDraft()
      }
      return
    }

    if (e.key === 'Enter' && wizardStep === 1) {
      e.preventDefault()
      handleNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onOpenBlocksPage()
    }
  }, [wizardStep, handleNext, onOpenBlocksPage, handleSaveDraft, courseIsSelected, blockNumberIsSelected])

  const validateForm = () => {
    if (!courseIsSelected) return 'Please select a course'
    if (!blockNumberIsSelected) return 'Please select a block number'
    if (!blockNumberIsValid) return 'Block number must be in format 1-A to 5-D'
    if (!yearIsValid) return 'Academic year must be between 2000 and 2100'
    if (!capacityIsValid) return 'Default capacity must be between 1 and 50 students'
    if (hasDuplicate) return 'Block group already exists for this semester and academic year'
    return ''
  }

  const getCapacityRecommendation = () => {
    const courseCapacityMap: Record<string, number> = {
      '101': 35, // BEED typically has smaller classes
      '102': 30, // BSEd-English - smaller for discussion-heavy classes
      '103': 30, // BSEd-Math - smaller for problem-solving focus
      '201': 40  // BSBA-HRM - can accommodate larger classes
    }
    return courseCapacityMap[newGroupCourse] || 30
  }

  const handleCapacityRecommendation = () => {
    setNewGroupCapacity(getCapacityRecommendation())
  }

  const handleCreateGroup = async () => {
    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const created = await authorizedFetch<BlockGroup>('/api/blocks/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedStorageName,
          courseId: selectedCourse?.value,
          courseCode: selectedCourse?.label,
          yearLevel: Number(newGroupYearLevel),
          semester: newGroupSemester,
          schoolYear: `${newGroupYear}-${Number(newGroupYear) + 1}`,
          year: Number(newGroupYear),
          section: newGroupSection,
          studentClassification: newGroupClassification,
          curriculumId: newGroupCurriculumId || undefined
        })
      })
      const sectionResponse = await authorizedFetch<{ autoAssign?: { created?: number; curriculumSubjectsFound?: number; warnings?: string[] } }>(`/api/blocks/groups/${created._id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionCode: generatedStorageName,
          capacity: Number(newGroupCapacity),
          schedule: ''
        })
      })
      await fetchBlockGroups()
      const autoAssign = sectionResponse?.autoAssign
      if (autoAssign && autoAssign.created > 0) {
        setSuccess(`Block created. ${autoAssign.created} subjects auto-assigned from curriculum.`)
      } else if (newGroupCurriculumId && autoAssign && autoAssign.curriculumSubjectsFound === 0) {
        setSuccess('The block group has been created and its initial section was generated automatically. No required subjects found in the curriculum for this year level and semester.')
      } else {
        setSuccess('The block group has been created and its initial section was generated automatically.')
      }
      setWizardStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create block')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAnother = () => {
    setWizardStep(1)
    setError('')
    setSuccess('')
    setNewGroupCourse('')
    setNewGroupBlockNumber('')
    setNewGroupCapacity(30)
    setNewGroupClassification('All')
  }

  return (
    <div className="registrar-section block-management-page block-management-system" onKeyDown={handleKeyDown} role="main" aria-label="Block Management Wizard">
      {(error || success) && (
        <div
          className={`block-management-notice ${error ? 'block-management-notice-error' : 'block-management-notice-success'}`}
          role="alert"
          aria-live="assertive"
        >
          <div>
            <strong>{error ? 'Action needed' : 'Block created'}</strong>
            <p>{error || success}</p>
          </div>
          <button
            type="button"
            className="block-management-notice-close"
            aria-label="Close notification"
            onClick={() => {
              setError('')
              setSuccess('')
            }}
          >
            ×
          </button>
        </div>
      )}

      <h2 className="registrar-section-title">Block Management</h2>
      <p className="registrar-section-desc">Create one block group at a time with a guided review before saving.</p>

      <div className="block-wizard-shell">
        <div className="block-wizard-card">
          <div className="block-stepper" role="navigation" aria-label="Block creation progress">
            <div className="block-stepper-line" aria-hidden="true" />
            {[
              { step: 1, title: 'Create Block', description: 'Enter block details' },
              { step: 2, title: 'Review', description: 'Review and confirm' },
              { step: 3, title: 'Finish', description: 'Block created' }
            ].map((item) => (
              <div
                key={item.step}
                className={`block-stepper-item ${wizardStep === item.step ? 'is-active' : ''} ${wizardStep > item.step ? 'is-complete' : ''}`}
              >
                <span className="block-stepper-dot">
                  {wizardStep > item.step ? <CheckCircle size={18} /> : item.step}
                </span>
                <span className="block-stepper-label">
                  <span className="block-stepper-step-label">Step {item.step}</span>
                  <strong>{item.title}</strong>
                  <span className="block-stepper-desc">{item.description}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="block-stepper-estimated-time" aria-live="polite">
            Estimated time: {getEstimatedTime()}
          </div>

          {wizardStep === 1 && (
            <div className="block-wizard-panel">
              <div className="block-wizard-panel-head">
                <div className="block-wizard-panel-header">
                  {draft && (
                    <div className="block-draft-banner">
                      <Save size={18} className="block-draft-banner-icon" />
                      <span className="block-draft-banner-text">Draft available</span>
                      <button
                        type="button"
                        className="block-draft-restore-btn"
                        onClick={() => restoreDraft(draft)}
                        title="Restore draft"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="block-draft-delete-btn"
                        onClick={clearDraft}
                        title="Delete draft"
                        aria-label="Delete draft"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
                {autoSaveStatus !== 'idle' && (
                  <div className={`block-autosave-status block-autosave-status--${autoSaveStatus}`}>
                    <Clock size={14} />
                    {autoSaveStatus === 'saving' && <span>Saving...</span>}
                    {autoSaveStatus === 'saved' && <span>Saved {lastAutoSaveTime && `(${Math.floor((Date.now() - lastAutoSaveTime.getTime()) / 1000)}s ago)`}</span>}
                    {autoSaveStatus === 'error' && <span>Save failed</span>}
                  </div>
                )}
              </div>

              <div className="block-wizard-form-grid">
                <div className="block-wizard-fields">
                  <label className="block-form-group">
                    <span className="block-form-label">Program</span>
                    <select
                      id="curriculum-select"
                      className="block-form-select"
                      value={newGroupCourse}
                      onChange={(e) => setNewGroupCourse(e.target.value)}
                      aria-describedby="curriculum-help"
                      aria-required="true"
                    >
                      <option value="">Select program</option>
                      {blockCourseOptions.map((course) => (
                        <option key={course.value} value={course.value}>
                          {course.fullLabel}
                        </option>
                      ))}
                    </select>
                    <span id="curriculum-help" className="block-form-help">
                      e.g., BEED, BSEd-English
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Linked Curriculum Version</span>
                    <select
                      id="linked-curriculum-select"
                      className="block-form-select"
                      value={newGroupCurriculumId}
                      onChange={(e) => setNewGroupCurriculumId(e.target.value)}
                      aria-describedby="linked-curriculum-help"
                    >
                      <option value="">No curriculum linked</option>
                      {availableCurriculums.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name || `${c.programName} ${c.version}`} ({c.status})
                        </option>
                      ))}
                    </select>
                    <span id="linked-curriculum-help" className="block-form-help">
                      Subjects auto-assigned from curriculum
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Block Number</span>
                    <select
                      id="block-number-select"
                      className="block-form-select"
                      value={newGroupBlockNumber}
                      onChange={(e) => setNewGroupBlockNumber(e.target.value)}
                      aria-describedby="block-number-help"
                      aria-required="true"
                    >
                      <option value="">Select block</option>
                      {blockNumberOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span id="block-number-help" className="block-form-help">
                      Year and section, e.g., 1-A
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Semester</span>
                    <select
                      id="semester-select"
                      className="block-form-select"
                      value={newGroupSemester}
                      onChange={(e) => setNewGroupSemester(e.target.value as Semester)}
                      aria-describedby="semester-help"
                      aria-required="true"
                    >
                      <option value="1st">1st Semester</option>
                      <option value="2nd">2nd Semester</option>
                      <option value="Summer">Summer Semester</option>
                    </select>
                    <span id="semester-help" className="block-form-help">
                      Academic semester
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Academic Year</span>
                    <input
                      id="academic-year-input"
                      className="block-form-input"
                      type="number"
                      min={2000}
                      max={2100}
                      value={newGroupYear}
                      onChange={(e) => setNewGroupYear(parseInt(e.target.value || `${currentYear}`, 10))}
                      aria-describedby="academic-year-help"
                      aria-required="true"
                    />
                    <span id="academic-year-help" className="block-form-help">
                      Starting year, e.g., 2024 for 2024-2025
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Default Capacity</span>
                    <div className="block-form-input-with-action">
                      <input
                        id="capacity-input"
                        className="block-form-input"
                        type="number"
                        min={1}
                        max={50}
                        value={newGroupCapacity === 0 ? '' : newGroupCapacity}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '') {
                            setNewGroupCapacity(0)
                          } else {
                            const parsed = parseInt(value, 10)
                            setNewGroupCapacity(isNaN(parsed) ? 30 : parsed)
                          }
                        }}
                        aria-describedby="capacity-help"
                        aria-required="true"
                      />
                      <button
                        type="button"
                        className="block-form-action-btn"
                        onClick={handleCapacityRecommendation}
                        title="Get recommended capacity based on curriculum"
                        aria-label="Use recommended capacity"
                      >
                        Auto
                      </button>
                    </div>
                    <span id="capacity-help" className="block-form-help">
                      1-50 students (recommended: {getCapacityRecommendation()})
                    </span>
                  </label>

                  <label className="block-form-group">
                    <span className="block-form-label">Student Classification</span>
                    <select
                      id="classification-select"
                      className="block-form-select"
                      value={newGroupClassification}
                      onChange={(e) => setNewGroupClassification(e.target.value)}
                      aria-describedby="classification-help"
                    >
                      <option value="All">All Classifications</option>
                      <option value="Regular">Regular only</option>
                      <option value="Irregular">Irregular only</option>
                      <option value="Transferee">Transferee only</option>
                      <option value="Returning">Returning only</option>
                    </select>
                    <span id="classification-help" className="block-form-help">
                      Optional restriction by classification
                    </span>
                  </label>
                </div>

                <div className="block-wizard-preview" aria-label="Live block preview">
                  <span className="block-wizard-preview-label">Live Preview</span>
                  <strong>{generatedDisplayName}</strong>
                  <dl>
                    <div>
                      <dt>Program Code</dt>
                      <dd>{selectedCourse?.value || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt>Year Level</dt>
                      <dd>{yearLevelDisplay}</dd>
                    </div>
                    <div>
                      <dt>Semester</dt>
                      <dd>{newGroupSemester}</dd>
                    </div>
                    <div>
                      <dt>Academic Year</dt>
                      <dd>{newGroupYear}</dd>
                    </div>
                    <div>
                      <dt>Capacity</dt>
                      <dd>{newGroupCapacity || 0} Students</dd>
                    </div>
                    <div>
                      <dt>Classification</dt>
                      <dd>{newGroupClassification}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="block-wizard-validation" aria-live="polite">
                {!courseIsSelected && (
                  <div className="block-validation-item block-validation-item--error">
                    <AlertCircle size={16} />
                    <span>Select a curriculum first.</span>
                  </div>
                )}
                {!blockNumberIsSelected && (
                  <div className="block-validation-item block-validation-item--error">
                    <AlertCircle size={16} />
                    <span>Select a block number first.</span>
                  </div>
                )}
                {blockNumberIsSelected && !blockNumberIsValid && (
                  <div className="block-validation-item block-validation-item--error">
                    <AlertCircle size={16} />
                    <span>Block number must use the format 1-A.</span>
                  </div>
                )}
                {!yearIsValid && (
                  <div className="block-validation-item block-validation-item--error">
                    <AlertCircle size={16} />
                    <span>Academic year must be between 2000 and 2100.</span>
                  </div>
                )}
                {!capacityIsValid && (
                  <div className="block-validation-item block-validation-item--error">
                    <AlertCircle size={16} />
                    <span>Capacity must be 1 to 50 students.</span>
                  </div>
                )}
                {hasDuplicate && (
                  <div className="block-validation-item block-validation-item--warning">
                    <AlertCircle size={16} />
                    <span>This block already exists for the selected term.</span>
                  </div>
                )}
                {courseIsSelected && blockNumberIsSelected && blockNumberIsValid && yearIsValid && capacityIsValid && !hasDuplicate && (
                  <div className="block-validation-item block-validation-item--success">
                    <CheckCircle size={16} />
                    <span>All fields are valid. Ready to create block.</span>
                  </div>
                )}
              </div>

              <div className="block-wizard-actions">
                <button
                  type="button"
                  className="registrar-btn registrar-btn-secondary"
                  onClick={onOpenBlocksPage}
                  aria-label="Cancel and go back to blocks page"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button
                  type="button"
                  className="registrar-btn registrar-btn-secondary"
                  onClick={handleSaveDraft}
                  disabled={!courseIsSelected || !blockNumberIsSelected}
                  title="Save current form as draft (Ctrl+S)"
                  aria-label="Save draft"
                >
                  <Save size={16} />
                  Save Draft
                </button>
                <button
                  type="button"
                  className="registrar-btn"
                  onClick={handleNext}
                  aria-label="Proceed to review step (Enter)"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="block-wizard-keyboard-hint">
                <small>Enter = continue · Esc = cancel · Ctrl+S = save draft</small>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="block-wizard-panel">
              <div className="block-wizard-panel-head">
                <h3>Review Block</h3>
              </div>

              <div className="block-wizard-review">
                <div>
                  <span>Program</span>
                  <strong>{selectedCourse?.fullLabel || 'No program selected'}</strong>
                </div>
                <div>
                  <span>Linked Curriculum</span>
                  <strong>
                    {newGroupCurriculumId
                      ? (availableCurriculums.find((c) => c._id === newGroupCurriculumId)?.name ||
                         availableCurriculums.find((c) => c._id === newGroupCurriculumId)?.code ||
                         'Selected curriculum')
                      : 'None — subjects will be assigned manually'}
                  </strong>
                </div>
                <div>
                  <span>Block</span>
                  <strong>{normalizedBlockNumber}</strong>
                </div>
                <div>
                  <span>Semester</span>
                  <strong>{newGroupSemester}</strong>
                </div>
                <div>
                  <span>Academic Year</span>
                  <strong>{newGroupYear}</strong>
                </div>
                <div>
                  <span>Capacity</span>
                  <strong>{newGroupCapacity}</strong>
                </div>
                <div>
                  <span>Classification</span>
                  <strong>{newGroupClassification}</strong>
                </div>
                <div>
                  <span>Generated Name</span>
                  <strong>{generatedDisplayName}</strong>
                </div>
              </div>

              <div className="block-wizard-actions">
                <button type="button" className="registrar-btn registrar-btn-secondary" onClick={() => setWizardStep(1)}>
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button type="button" className="registrar-btn" onClick={handleCreateGroup} disabled={loading}>
                  <Plus size={16} />
                  {loading ? 'Creating...' : 'Create Block'}
                </button>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="block-wizard-panel block-wizard-success">
              <CheckCircle size={52} />
              <h3>Block Created Successfully</h3>
              <p>The block group has been created.</p>
              <p>Initial section generated automatically.</p>

              <div className="block-wizard-success-actions">
                <button type="button" className="registrar-btn" onClick={onOpenBlocksPage}>
                  <LayoutList size={16} />
                  View Blocks
                </button>
                <button type="button" className="registrar-btn registrar-btn-secondary" onClick={handleCreateAnother}>
                  <RotateCcw size={16} />
                  Create Another Block
                </button>
                <button type="button" className="registrar-btn registrar-btn-secondary" onClick={onGoDashboard || onOpenBlocksPage}>
                  Go to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BlockManagement

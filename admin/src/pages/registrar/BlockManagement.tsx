import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, LayoutList, Plus, RotateCcw } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, Semester } from './registrarBlockTypes'

type BlockManagementProps = {
  onOpenBlocksPage: () => void
  onGoDashboard?: () => void
}

type CourseOption = {
  value: number
  label: string
  fullLabel: string
}

type WizardStep = 1 | 2 | 3

const blockCourseOptions: CourseOption[] = [
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

const currentYear = new Date().getFullYear()

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

  const selectedCourse = useMemo(
    () => blockCourseOptions.find((course) => course.value === Number(newGroupCourse)) || null,
    [newGroupCourse]
  )
  const normalizedBlockNumber = String(newGroupBlockNumber || '').trim().toUpperCase()
  const generatedStorageName = selectedCourse && normalizedBlockNumber ? `${selectedCourse.value}-${normalizedBlockNumber}` : ''
  const generatedDisplayName = selectedCourse && normalizedBlockNumber ? `${selectedCourse.label} - ${normalizedBlockNumber}` : 'No block selected'
  const courseIsSelected = Boolean(selectedCourse)
  const blockNumberIsSelected = Boolean(normalizedBlockNumber)
  const blockNumberIsValid = /^([1-5])-([A-D])$/.test(normalizedBlockNumber)
  const yearIsValid = Number.isInteger(Number(newGroupYear)) && Number(newGroupYear) >= 2000 && Number(newGroupYear) <= 2100
  const capacityIsValid = Number.isInteger(Number(newGroupCapacity)) && Number(newGroupCapacity) >= 1 && Number(newGroupCapacity) <= 50
  const hasDuplicate = blockGroups.some((group) => {
    if (group.semester !== newGroupSemester || Number(group.year) !== Number(newGroupYear)) return false
    if (!generatedStorageName) return false
    return String(group.name || '').trim().toUpperCase() === generatedStorageName.toUpperCase()
  })

  useEffect(() => {
    void fetchBlockGroups()
  }, [])

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

  const validateForm = () => {
    if (!courseIsSelected) return 'Please select a course'
    if (!blockNumberIsSelected) return 'Please select a block number'
    if (!blockNumberIsValid) return 'Block number must be in format 1-A to 5-D'
    if (!yearIsValid) return 'Academic year must be between 2000 and 2100'
    if (!capacityIsValid) return 'Default capacity must be between 1 and 50 students'
    if (hasDuplicate) return 'Block group already exists for this semester and academic year'
    return ''
  }

  const handleNext = () => {
    const validationMessage = validateForm()
    setError(validationMessage)
    setSuccess('')
    if (validationMessage) return
    setWizardStep(2)
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
      const created = await authorizedFetch('/api/blocks/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedStorageName,
          semester: newGroupSemester,
          year: Number(newGroupYear)
        })
      })
      await authorizedFetch(`/api/blocks/groups/${(created as BlockGroup)._id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionCode: generatedStorageName,
          capacity: Number(newGroupCapacity),
          schedule: ''
        })
      })
      await fetchBlockGroups()
      setSuccess('The block group has been created and its initial section was generated automatically.')
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
            <strong>{error ? 'Action needed' : 'Block created'}</strong>
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
      <p className="registrar-section-desc">Create one block group at a time with a guided review before saving.</p>

      <div className="block-wizard-shell">
        <div className="block-wizard-card">
          <div className="block-wizard-stepper" aria-label="Block creation progress">
            {[
              { step: 1, title: 'Create Block' },
              { step: 2, title: 'Review' },
              { step: 3, title: 'Finish' }
            ].map((item) => (
              <div
                key={item.step}
                className={`block-wizard-step ${wizardStep === item.step ? 'is-active' : ''} ${wizardStep > item.step ? 'is-complete' : ''}`}
              >
                <span className="block-wizard-step-number">{wizardStep > item.step ? <CheckCircle size={16} /> : item.step}</span>
                <span>
                  <small>Step {item.step}</small>
                  <strong>{item.title}</strong>
                </span>
              </div>
            ))}
          </div>

          {wizardStep === 1 && (
            <div className="block-wizard-panel">
              <div className="block-wizard-panel-head">
                <h3>Create Block</h3>
              </div>

              <div className="block-wizard-form-grid">
                <div className="block-wizard-fields">
                  <label>
                    <span>Course</span>
                    <select value={newGroupCourse} onChange={(e) => setNewGroupCourse(e.target.value)}>
                      <option value="">Select course</option>
                      {blockCourseOptions.map((course) => (
                        <option key={course.value} value={course.value}>
                          {course.fullLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Block Number</span>
                    <select value={newGroupBlockNumber} onChange={(e) => setNewGroupBlockNumber(e.target.value)}>
                      <option value="">Select block</option>
                      {blockNumberOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Semester</span>
                    <select value={newGroupSemester} onChange={(e) => setNewGroupSemester(e.target.value as Semester)}>
                      <option value="1st">1st</option>
                      <option value="2nd">2nd</option>
                      <option value="Summer">Summer</option>
                    </select>
                  </label>

                  <label>
                    <span>Academic Year</span>
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      value={newGroupYear}
                      onChange={(e) => setNewGroupYear(parseInt(e.target.value || `${currentYear}`, 10))}
                    />
                  </label>

                  <label>
                    <span>Default Capacity</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newGroupCapacity}
                      onChange={(e) => setNewGroupCapacity(parseInt(e.target.value || '30', 10))}
                    />
                  </label>
                </div>

                <div className="block-wizard-preview" aria-label="Live block preview">
                  <span className="block-wizard-preview-label">Live Preview</span>
                  <strong>{generatedDisplayName}</strong>
                  <dl>
                    <div>
                      <dt>Course Code</dt>
                      <dd>{selectedCourse?.value || 'N/A'}</dd>
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
                  </dl>
                </div>
              </div>

              <div className="block-wizard-validation" aria-live="polite">
                {!courseIsSelected && <span>Select a course before creating a block.</span>}
                {!blockNumberIsSelected && <span>Select a block number before creating a block.</span>}
                {blockNumberIsSelected && !blockNumberIsValid && <span>Block number must use the format 1-A.</span>}
                {!yearIsValid && <span>Academic year must be between 2000 and 2100.</span>}
                {!capacityIsValid && <span>Capacity must be 1 to 50 students.</span>}
                {hasDuplicate && <span>This block already exists for the selected term.</span>}
              </div>

              <div className="block-wizard-actions">
                <button type="button" className="registrar-btn registrar-btn-secondary" onClick={onOpenBlocksPage}>
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button type="button" className="registrar-btn" onClick={handleNext}>
                  Next
                  <ChevronRight size={16} />
                </button>
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
                  <span>Course</span>
                  <strong>{selectedCourse?.fullLabel || 'No course selected'}</strong>
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

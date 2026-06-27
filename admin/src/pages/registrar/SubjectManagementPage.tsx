import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { Semester, SubjectItem } from './registrarBlockTypes'

type SubjectForm = {
  code: string
  title: string
  units: string
  course: string
  yearLevel: string
  semester: Semester
}

type SubjectStatusFilter = 'active' | 'archived' | 'all'
type WizardStep = 1 | 2 | 3
type SubjectManagementMode = 'catalog' | 'add'

type SubjectManagementPageProps = {
  mode?: SubjectManagementMode
}

const emptyForm: SubjectForm = {
  code: '',
  title: '',
  units: '3',
  course: '',
  yearLevel: '',
  semester: '1st'
}

const courseOptions = [
  { value: '101', label: 'BEED', fullLabel: 'Bachelor of Elementary Education' },
  { value: '102', label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
  { value: '103', label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
  { value: '201', label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' }
]

const courseLabel = (value?: number | string) => {
  const normalized = value ? Number(value) : null
  return courseOptions.find((option) => Number(option.value) === normalized)?.label || 'Any program'
}

function SubjectManagementPage({ mode = 'catalog' }: SubjectManagementPageProps) {
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubjectStatusFilter>('active')
  const [courseFilter, setCourseFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [form, setForm] = useState<SubjectForm>(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const filteredSubjects = useMemo(() => {
    if (statusFilter === 'active') return subjects.filter((subject) => subject.isActive !== false)
    if (statusFilter === 'archived') return subjects.filter((subject) => subject.isActive === false)
    return subjects
  }, [subjects, statusFilter])
  const selectedProgram = courseOptions.find((option) => option.value === form.course)
  const normalizedCode = form.code.trim().toUpperCase()
  const normalizedTitle = form.title.trim()
  const normalizedUnits = Number(form.units)
  const isEditing = Boolean(editingId)
  const showSubjectWizard = mode === 'add' || isEditing

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
      const details = Array.isArray(data?.details) ? ` ${data.details.join(' ')}` : ''
      throw new Error(`${(data?.error as string) || (data?.message as string) || `Request failed (${response.status})`}${details}`)
    }
    return data
  }

  const fetchSubjects = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (courseFilter) params.set('course', courseFilter)
      if (yearFilter) params.set('yearLevel', yearFilter)
      if (semesterFilter) params.set('semester', semesterFilter)

      const data = await authorizedFetch(`/api/registrar/subjects${params.toString() ? `?${params.toString()}` : ''}`)
      setSubjects(Array.isArray(data?.data) ? data.data as SubjectItem[] : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchSubjects()
    }, 180)
    return () => window.clearTimeout(timeoutId)
  }, [query, statusFilter, courseFilter, yearFilter, semesterFilter])

  const updateForm = (field: keyof SubjectForm, value: string) => {
    setError('')
    setForm((prev) => ({ ...prev, [field]: field === 'code' ? value.toUpperCase() : value }))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId('')
    setWizardStep(1)
    setError('')
  }

  const beginEdit = (subject: SubjectItem) => {
    setEditingId(subject._id)
    setForm({
      code: subject.code,
      title: subject.title,
      units: String(subject.units),
      course: subject.course ? String(subject.course) : '',
      yearLevel: subject.yearLevel ? String(subject.yearLevel) : '',
      semester: subject.semester || '1st'
    })
    setWizardStep(1)
    setError('')
    setSuccess('')
  }

  const validateSubject = () => {
    if (!normalizedCode) return 'Subject code is required'
    if (!normalizedTitle) return 'Subject title is required'
    if (!Number.isFinite(normalizedUnits) || normalizedUnits <= 0 || normalizedUnits > 6) {
      return 'Units must be greater than 0 and not more than 6'
    }
    return ''
  }

  const handleReview = () => {
    const validationMessage = validateSubject()
    setError(validationMessage)
    setSuccess('')
    if (validationMessage) return
    setWizardStep(2)
  }

  const handleSubmit = async () => {
    const validationMessage = validateSubject()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = {
        code: normalizedCode,
        title: normalizedTitle,
        units: normalizedUnits,
        course: form.course ? Number(form.course) : undefined,
        yearLevel: form.yearLevel ? Number(form.yearLevel) : undefined,
        semester: form.semester
      }
      const path = editingId ? `/api/registrar/subjects/${editingId}` : '/api/registrar/subjects'
      const method = editingId ? 'PUT' : 'POST'
      const data = await authorizedFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      setSuccess((data?.message as string) || (editingId ? 'Subject updated successfully' : 'Subject created successfully'))
      setWizardStep(3)
      await fetchSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subject')
    } finally {
      setSaving(false)
    }
  }

  const archiveSubject = async (subject: SubjectItem) => {
    const nextActive = !subject.isActive
    const action = nextActive ? 'restore' : 'archive'
    if (!window.confirm(`Are you sure you want to ${action} ${subject.code}?`)) return

    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${subject._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive })
      })
      setSuccess((data?.message as string) || `Subject ${nextActive ? 'restored' : 'archived'} successfully`)
      await fetchSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subject status')
    }
  }

  const deleteSubject = async (subject: SubjectItem) => {
    if (!window.confirm(`Permanently delete ${subject.code}? Archive it instead if it has existing records.`)) return

    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${subject._id}`, { method: 'DELETE' })
      setSuccess((data?.message as string) || 'Subject deleted successfully')
      await fetchSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject')
    }
  }

  return (
    <div className="registrar-section subject-management-page">
      <h2 className="registrar-section-title">Subject Management</h2>
      <p className="registrar-section-desc">Maintain the master list of subjects used across block assignments and student records.</p>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
      {success && <p className="registrar-alert registrar-alert-success">{success}</p>}

      {showSubjectWizard && (
        <div className="sis-wizard-shell">
          <section className="sis-wizard-card">
            <div className="block-wizard-stepper" aria-label="Subject management progress">
              {[
                { step: 1, title: isEditing ? 'Edit Subject' : 'Create Subject' },
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
              <div className="sis-wizard-panel">
                <div className="block-wizard-panel-head">
                  <h3>{isEditing ? 'Edit Subject' : 'Create Subject'}</h3>
                </div>
                <div className="sis-wizard-grid">
                  <div className="block-wizard-fields subject-wizard-fields">
                    <label>
                      <span>Subject Code</span>
                      <input value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="ENG101" />
                    </label>
                    <label>
                      <span>Subject Title</span>
                      <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="English Communication" />
                    </label>
                    <label>
                      <span>Units</span>
                      <input type="number" min={0.5} max={6} step={0.5} value={form.units} onChange={(event) => updateForm('units', event.target.value)} />
                    </label>
                    <label>
                      <span>Program/Course</span>
                      <select value={form.course} onChange={(event) => updateForm('course', event.target.value)}>
                        <option value="">Any program</option>
                        {courseOptions.map((option) => <option key={option.value} value={option.value}>{option.fullLabel}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Year Level</span>
                      <select value={form.yearLevel} onChange={(event) => updateForm('yearLevel', event.target.value)}>
                        <option value="">Any year</option>
                        {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Semester</span>
                      <select value={form.semester} onChange={(event) => updateForm('semester', event.target.value as Semester)}>
                        <option value="1st">1st</option>
                        <option value="2nd">2nd</option>
                        <option value="Summer">Summer</option>
                      </select>
                    </label>
                  </div>

                  <div className="block-wizard-preview">
                    <span className="block-wizard-preview-label">Live Preview</span>
                    <strong>{normalizedCode || 'Subject Code'}</strong>
                    <dl>
                      <div>
                        <dt>Title</dt>
                        <dd>{normalizedTitle || 'Subject title'}</dd>
                      </div>
                      <div>
                        <dt>Units</dt>
                        <dd>{form.units || '0'}</dd>
                      </div>
                      <div>
                        <dt>Program</dt>
                        <dd>{selectedProgram?.label || 'Any program'}</dd>
                      </div>
                      <div>
                        <dt>Year/Semester</dt>
                        <dd>{form.yearLevel || 'Any'} / {form.semester}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="block-wizard-actions">
                  {isEditing ? (
                    <button className="registrar-btn registrar-btn-secondary" type="button" onClick={resetForm}>
                      Cancel
                    </button>
                  ) : <span />}
                  <button className="registrar-btn" type="button" onClick={handleReview}>
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="sis-wizard-panel">
                <div className="block-wizard-panel-head">
                  <h3>Review Subject</h3>
                </div>
                <div className="block-wizard-review">
                  <div><span>Code</span><strong>{normalizedCode}</strong></div>
                  <div><span>Title</span><strong>{normalizedTitle}</strong></div>
                  <div><span>Units</span><strong>{normalizedUnits}</strong></div>
                  <div><span>Program</span><strong>{selectedProgram?.fullLabel || 'Any program'}</strong></div>
                  <div><span>Year Level</span><strong>{form.yearLevel || 'Any year'}</strong></div>
                  <div><span>Semester</span><strong>{form.semester}</strong></div>
                </div>
                <div className="block-wizard-actions">
                  <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => setWizardStep(1)}>
                    <ChevronLeft size={16} />
                    Back
                  </button>
                  <button className="registrar-btn" type="button" onClick={handleSubmit} disabled={saving}>
                    <Plus size={16} />
                    {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Subject'}
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="block-wizard-panel block-wizard-success">
                <CheckCircle size={52} />
                <h3>{isEditing ? 'Subject Updated Successfully' : 'Subject Created Successfully'}</h3>
                <p>{normalizedCode} is now available in the subject catalog.</p>
                <div className="block-wizard-success-actions">
                  <button className="registrar-btn" type="button" onClick={resetForm}>
                    <RotateCcw size={16} />
                    Create Another Subject
                  </button>
                  <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => setWizardStep(1)}>
                    Edit Again
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="assignment-section subject-catalog-section">
        <div className="assignment-panel-head">
          <div>
            <h3>Subject Catalog</h3>
            <p>{loading ? 'Loading subjects...' : `${filteredSubjects.length} subjects found`}</p>
          </div>
        </div>

        <div className="subject-toolbar">
          <label className="subject-search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or title" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SubjectStatusFilter)}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="">All programs</option>
            {courseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="">All years</option>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
            <option value="">All semesters</option>
            <option value="1st">1st</option>
            <option value="2nd">2nd</option>
            <option value="Summer">Summer</option>
          </select>
        </div>

        <div className="subject-table">
          <div className="subject-table-header subject-management-table-row">
            <span>Code</span>
            <span>Title</span>
            <span>Program</span>
            <span>Year</span>
            <span>Units</span>
            <span>Actions</span>
          </div>
          <div className="subject-table-body">
            {filteredSubjects.map((subject) => (
              <div key={subject._id} className="subject-table-row subject-management-table-row">
                <span>{subject.code}</span>
                <span>{subject.title}</span>
                <span>{courseLabel(subject.course)}</span>
                <span>{subject.yearLevel || 'Any'}</span>
                <span>{subject.units}</span>
                <span className="subject-cell-actions">
                  <button type="button" className="subject-action-btn edit" onClick={() => beginEdit(subject)}>
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button type="button" className="subject-action-btn cancel" onClick={() => void archiveSubject(subject)}>
                    <Archive size={14} />
                    {subject.isActive ? 'Archive' : 'Restore'}
                  </button>
                  <button type="button" className="subject-action-btn delete" onClick={() => void deleteSubject(subject)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
        {filteredSubjects.length === 0 && <p className="assignment-empty-copy">No subjects match the current filters.</p>}
      </section>
    </div>
  )
}

export default SubjectManagementPage

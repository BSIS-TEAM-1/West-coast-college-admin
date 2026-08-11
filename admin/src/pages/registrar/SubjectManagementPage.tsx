import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { SubjectItem, SubjectStatus, SubjectType } from './registrarBlockTypes'

type SubjectForm = {
  code: string
  title: string
  units: string
  subjectType: SubjectType
  lecturePeriods: string
  labPeriods: string
  status: SubjectStatus
  prerequisiteSubjectIds: string[]
}

type SubjectStatusFilter = 'active' | 'archived' | 'all'
type WizardStep = 1 | 2 | 3
type SubjectManagementMode = 'catalog' | 'add'
type SortColumn = 'code' | 'title' | 'units' | 'lecturePeriods' | 'labPeriods' | 'status'
type SortDirection = 'asc' | 'desc'

type SubjectManagementPageProps = {
  mode?: SubjectManagementMode
}

const PAGE_SIZE = 15

const emptyForm: SubjectForm = {
  code: '',
  title: '',
  units: '3',
  subjectType: 'General Education',
  lecturePeriods: '0',
  labPeriods: '0',
  status: 'Active',
  prerequisiteSubjectIds: []
}

const subjectTypeOptions: SubjectType[] = ['General Education', 'Professional Education', 'Major', 'Elective', 'Core']

function SubjectManagementPage({ mode = 'catalog' }: SubjectManagementPageProps) {
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubjectStatusFilter>('active')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('code')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [prereqSearch, setPrereqSearch] = useState('')
  const [form, setForm] = useState<SubjectForm>(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const filteredSubjects = useMemo(() => {
    let result = subjects
    if (statusFilter === 'active') result = result.filter((subject) => subject.isActive !== false)
    if (statusFilter === 'archived') result = result.filter((subject) => subject.isActive === false)
    if (typeFilter) result = result.filter((subject) => subject.subjectType === typeFilter)

    const sorted = [...result].sort((a, b) => {
      let aVal: string | number = a[sortColumn] ?? ''
      let bVal: string | number = b[sortColumn] ?? ''
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [subjects, statusFilter, typeFilter, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / PAGE_SIZE))
  const pagedSubjects = useMemo(
    () => filteredSubjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredSubjects, page]
  )

  const prerequisiteCandidates = useMemo(() => {
    const term = prereqSearch.trim().toLowerCase()
    return subjects
      .filter((s) => s._id !== editingId && s.isActive !== false)
      .filter((s) => !form.prerequisiteSubjectIds.includes(s._id))
      .filter((s) => !term || s.code.toLowerCase().includes(term) || s.title.toLowerCase().includes(term))
      .slice(0, 8)
  }, [subjects, editingId, form.prerequisiteSubjectIds, prereqSearch])

  const selectedPrerequisites = useMemo(
    () => form.prerequisiteSubjectIds.map((id) => subjects.find((s) => s._id === id)).filter(Boolean) as SubjectItem[],
    [form.prerequisiteSubjectIds, subjects]
  )

  const normalizedCode = form.code.trim().toUpperCase()
  const normalizedTitle = form.title.trim()
  const normalizedUnits = Number(form.units)
  const normalizedLecturePeriods = Number(form.lecturePeriods)
  const normalizedLabPeriods = Number(form.labPeriods)
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
      if (typeFilter) params.set('subjectType', typeFilter)

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
  }, [query, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, typeFilter])

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
    const prereqIds = Array.isArray(subject.prerequisiteSubjectIds)
      ? subject.prerequisiteSubjectIds.map((p) => (typeof p === 'string' ? p : p._id))
      : []
    setForm({
      code: subject.code,
      title: subject.title,
      units: String(subject.units),
      subjectType: subject.subjectType || 'General Education',
      lecturePeriods: String(subject.lecturePeriods ?? 0),
      labPeriods: String(subject.labPeriods ?? 0),
      status: subject.status || (subject.isActive === false ? 'Inactive' : 'Active'),
      prerequisiteSubjectIds: prereqIds
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
    if (!Number.isFinite(normalizedLecturePeriods) || normalizedLecturePeriods < 0) {
      return 'Lecture periods must be 0 or greater'
    }
    if (!Number.isFinite(normalizedLabPeriods) || normalizedLabPeriods < 0) {
      return 'Lab/Field periods must be 0 or greater'
    }
    return ''
  }

  const togglePrerequisite = (id: string) => {
    setForm((prev) => ({ ...prev, prerequisiteSubjectIds: [...prev.prerequisiteSubjectIds, id] }))
    setPrereqSearch('')
  }

  const removePrerequisite = (id: string) => {
    setForm((prev) => ({ ...prev, prerequisiteSubjectIds: prev.prerequisiteSubjectIds.filter((p) => p !== id) }))
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
        subjectType: form.subjectType,
        lecturePeriods: normalizedLecturePeriods,
        labPeriods: normalizedLabPeriods,
        status: form.status,
        prerequisiteSubjectIds: form.prerequisiteSubjectIds
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

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  return (
    <div className="registrar-section subject-management-page">
      <h2 className="registrar-section-title">Subject Catalog</h2>
      <p className="registrar-section-desc">Maintain the master list of subjects. Curriculum placement (year level, semester, sequence) is managed via <strong>Curriculums</strong>.</p>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
      {success && <p className="registrar-alert registrar-alert-success">{success}</p>}

      {showSubjectWizard && (
        <div className="sis-wizard-shell">
          <section className="sis-wizard-card">
            <div className="block-stepper" role="navigation" aria-label="Subject management progress">
              <div className="block-stepper-line" aria-hidden="true" />
              {[
                { step: 1, title: isEditing ? 'Edit Subject' : 'Create Subject', description: isEditing ? 'Edit details' : 'Enter details' },
                { step: 2, title: 'Review', description: 'Confirm details' },
                { step: 3, title: 'Finish', description: 'Subject saved' }
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

            {wizardStep === 1 && (
              <div className="sis-wizard-panel">
                <div className="block-wizard-panel-head">
                  <h3>{isEditing ? 'Edit Subject' : 'Create Subject'}</h3>
                </div>
                <div className="sis-wizard-grid">
                  <div className="block-wizard-fields subject-wizard-fields">
                    <label>
                      <span>Course No. / Code</span>
                      <input value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="ENG101" />
                    </label>
                    <label>
                      <span>Descriptive Title</span>
                      <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="English Communication" />
                    </label>
                    <label>
                      <span>Units</span>
                      <input type="number" min={0.5} max={6} step={0.5} value={form.units} onChange={(event) => updateForm('units', event.target.value)} />
                    </label>
                    <label>
                      <span>Subject Type / Category</span>
                      <select value={form.subjectType} onChange={(event) => updateForm('subjectType', event.target.value)}>
                        {subjectTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Lecture Periods</span>
                      <input type="number" min={0} step={1} value={form.lecturePeriods} onChange={(event) => updateForm('lecturePeriods', event.target.value)} />
                    </label>
                    <label>
                      <span>Lab / Field Periods</span>
                      <input type="number" min={0} step={1} value={form.labPeriods} onChange={(event) => updateForm('labPeriods', event.target.value)} />
                    </label>
                    <label>
                      <span>Status</span>
                      <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
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
                        <dt>Type</dt>
                        <dd>{form.subjectType}</dd>
                      </div>
                      <div>
                        <dt>Lecture / Lab</dt>
                        <dd>{form.lecturePeriods || '0'} / {form.labPeriods || '0'}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{form.status}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="subject-prereq-field">
                  <span className="subject-prereq-label">Prerequisites</span>
                  <div className="subject-prereq-chips">
                    {selectedPrerequisites.length === 0 && <span className="subject-prereq-empty">None</span>}
                    {selectedPrerequisites.map((prereq) => (
                      <span key={prereq._id} className="subject-prereq-chip">
                        {prereq.code}
                        <button type="button" onClick={() => removePrerequisite(prereq._id)} aria-label={`Remove ${prereq.code}`}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <label className="subject-search-field subject-prereq-search">
                    <Search size={14} />
                    <input
                      value={prereqSearch}
                      onChange={(event) => setPrereqSearch(event.target.value)}
                      placeholder="Search subject code or title to add as prerequisite"
                    />
                  </label>
                  {prereqSearch.trim() && prerequisiteCandidates.length > 0 && (
                    <ul className="subject-prereq-suggestions">
                      {prerequisiteCandidates.map((candidate) => (
                        <li key={candidate._id}>
                          <button type="button" onClick={() => togglePrerequisite(candidate._id)}>
                            <strong>{candidate.code}</strong> {candidate.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  <div><span>Course No.</span><strong>{normalizedCode}</strong></div>
                  <div><span>Descriptive Title</span><strong>{normalizedTitle}</strong></div>
                  <div><span>Units</span><strong>{normalizedUnits}</strong></div>
                  <div><span>Subject Type</span><strong>{form.subjectType}</strong></div>
                  <div><span>Lecture Periods</span><strong>{normalizedLecturePeriods}</strong></div>
                  <div><span>Lab / Field Periods</span><strong>{normalizedLabPeriods}</strong></div>
                  <div><span>Status</span><strong>{form.status}</strong></div>
                  <div><span>Prerequisites</span><strong>{selectedPrerequisites.length ? selectedPrerequisites.map((p) => p.code).join(', ') : 'None'}</strong></div>
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
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {subjectTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <div className="subject-table subject-management-table">
          <div className="subject-table-header subject-management-table-row" role="row">
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('code')}>Course No.{sortIndicator('code')}</button>
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('title')}>Descriptive Title{sortIndicator('title')}</button>
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('units')}>Units{sortIndicator('units')}</button>
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('lecturePeriods')}>Lecture{sortIndicator('lecturePeriods')}</button>
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('labPeriods')}>Lab / Field{sortIndicator('labPeriods')}</button>
            <button type="button" className="subject-sort-btn" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</button>
            <span>Actions</span>
          </div>
          <div className="subject-table-body">
            {pagedSubjects.map((subject) => (
              <div key={subject._id} className="subject-table-row subject-management-table-row">
                <span className="subject-cell-code" title={subject.code}>{subject.code}</span>
                <span className="subject-cell-title" title={subject.title}>{subject.title}</span>
                <span>{subject.units}</span>
                <span>{subject.lecturePeriods ?? 0}</span>
                <span>{subject.labPeriods ?? 0}</span>
                <span>
                  <span className={`subject-status-badge ${subject.isActive === false ? 'inactive' : 'active'}`}>
                    {subject.isActive === false ? 'Inactive' : (subject.status || 'Active')}
                  </span>
                </span>
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
        {totalPages > 1 && (
          <div className="subject-pagination">
            <button type="button" className="registrar-btn registrar-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="registrar-btn registrar-btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default SubjectManagementPage

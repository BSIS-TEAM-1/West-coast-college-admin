import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle, ChevronRight, Copy, Plus, Search } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { Curriculum, CurriculumStatus } from './registrarBlockTypes'

type CurriculumManagementPageProps = {
  onOpenCurriculum: (id: string) => void
  onCreate: () => void
  onArchived: () => void
  initialStatusFilter?: CurriculumStatus | ''
  showCreateButton?: boolean
  title?: string
}

const programOptions = [
  { value: 101, label: 'BEED', fullLabel: 'Bachelor of Elementary Education' },
  { value: 102, label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - English' },
  { value: 103, label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Math' },
  { value: 201, label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - HRM' },
]

const statusOptions: CurriculumStatus[] = ['Draft', 'Active', 'Legacy', 'Archived']

const statusColors: Record<CurriculumStatus, string> = {
  Draft: 'curriculum-status-draft',
  Active: 'curriculum-status-active',
  Legacy: 'curriculum-status-legacy',
  Archived: 'curriculum-status-archived',
}

function CurriculumManagementPage({
  onOpenCurriculum,
  onCreate,
  onArchived,
  initialStatusFilter = '',
  showCreateButton = true,
  title,
}: CurriculumManagementPageProps) {
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [query, setQuery] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.message || `Request failed (${response.status})`)
    }
    return data
  }

  const fetchCurriculums = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (programFilter) params.set('programCode', programFilter)
      if (statusFilter) params.set('status', statusFilter)
      const data = await authorizedFetch(`/api/registrar/curriculums${params.toString() ? `?${params.toString()}` : ''}`)
      setCurriculums(Array.isArray(data?.data) ? data.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch curriculums')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchCurriculums(), 200)
    return () => window.clearTimeout(timeoutId)
  }, [query, programFilter, statusFilter])

  const handleDuplicate = async (curriculum: Curriculum) => {
    const newVersion = window.prompt('Enter version for the new curriculum:', String(Number(curriculum.version) + 1))
    if (!newVersion) return
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculum._id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: newVersion }),
      })
      setSuccess(data?.message || 'Curriculum duplicated successfully')
      await fetchCurriculums()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate curriculum')
    }
  }

  const handleArchive = async (curriculum: Curriculum) => {
    if (!window.confirm(`Archive "${curriculum.name || curriculum.programName + ' ' + curriculum.version}"? This will make it read-only.`)) return
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculum._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Archived' }),
      })
      setSuccess(data?.message || 'Curriculum archived')
      await fetchCurriculums()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive curriculum')
    }
  }

  const handleActivate = async (curriculum: Curriculum) => {
    if (!window.confirm(`Activate "${curriculum.name || curriculum.programName + ' ' + curriculum.version}"? This will set any other active curriculum for this program to Legacy.`)) return
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculum._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Active' }),
      })
      setSuccess(data?.message || 'Curriculum activated')
      await fetchCurriculums()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate curriculum')
    }
  }

  const filteredCurriculums = useMemo(() => curriculums, [curriculums])

  const pageTitle = title || (statusFilter === 'Archived' ? 'Archived Curriculums' : 'Curriculums')

  return (
    <div className="registrar-section curriculum-management-page">
      <h2 className="registrar-section-title">{pageTitle}</h2>
      <p className="registrar-section-desc">Manage academic blueprints that define which subjects a program takes per year and semester.</p>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
      {success && <p className="registrar-alert registrar-alert-success">{success}</p>}

      <div className="curriculum-page-toolbar">
        <span className="curriculum-page-count">{loading ? 'Loading...' : `${filteredCurriculums.length} curriculums`}</span>
        {showCreateButton ? (
          <button className="registrar-btn" type="button" onClick={onCreate}>
            <Plus size={16} />
            Create Curriculum
          </button>
        ) : (
          <button className="registrar-btn" type="button" onClick={onArchived}>
            View Archived
          </button>
        )}
      </div>

      <section className="assignment-section curriculum-list-section">
        <div className="subject-toolbar">
          <label className="subject-search-field">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, code, or version" />
          </label>
          <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
            <option value="">All programs</option>
            {programOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {statusFilter !== 'Archived' && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CurriculumStatus | '')}>
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>

        <div className="curriculum-card-grid">
          {!loading && filteredCurriculums.length === 0 && (
            <p className="assignment-empty-copy">No curriculums found. Create one to get started.</p>
          )}
          {filteredCurriculums.map((c) => {
            const programLabel = programOptions.find((p) => p.value === c.programCode)?.label || c.programName
            return (
              <div key={c._id} className="curriculum-card">
                <span className={`curriculum-status-badge ${statusColors[c.status]}`}>{c.status}</span>
                <div className="curriculum-card-header">
                  <div>
                    <h3>{c.name || `${programLabel} Curriculum ${c.version}`}</h3>
                    <p className="curriculum-card-meta">
                      <span>{programLabel}</span>
                      <span className="curriculum-card-meta-dot" />
                      <span>Version {c.version}</span>
                      {c.effectiveSchoolYear && (
                        <>
                          <span className="curriculum-card-meta-dot" />
                          <span>{c.effectiveSchoolYear}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {c.description && <p className="curriculum-card-desc">{c.description}</p>}
                <div className="curriculum-card-actions">
                  <button className="subject-action-btn edit" type="button" onClick={() => onOpenCurriculum(c._id)}>
                    <ChevronRight size={16} />
                    View
                  </button>
                  {c.status !== 'Archived' && (
                    <button className="subject-action-btn" type="button" onClick={() => handleDuplicate(c)}>
                      <Copy size={16} />
                      Duplicate
                    </button>
                  )}
                  {c.status === 'Draft' && (
                    <button className="subject-action-btn save" type="button" onClick={() => handleActivate(c)}>
                      <CheckCircle size={16} />
                      Activate
                    </button>
                  )}
                  {c.status !== 'Archived' && (
                    <button className="subject-action-btn cancel" type="button" onClick={() => handleArchive(c)}>
                      <Archive size={16} />
                      Archive
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default CurriculumManagementPage

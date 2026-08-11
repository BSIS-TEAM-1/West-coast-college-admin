import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle, FileText, Layers, Plus, Archive as ArchiveIcon, AlertCircle } from 'lucide-react'
import CurriculumManagementPage from './CurriculumManagementPage'
import CreateCurriculumPage from './CreateCurriculumPage'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { Curriculum, CurriculumStatus } from './registrarBlockTypes'

type CurriculumManagementView = 'overview' | 'curriculums' | 'create' | 'archived'

type CurriculumManagementLayoutProps = {
  activeView: CurriculumManagementView
  onNavigate: (view: CurriculumManagementView) => void
  onOpenCurriculum?: (id: string) => void
}

const programLabels: Record<number, string> = {
  101: 'BEED',
  102: 'BSEd-English',
  103: 'BSEd-Math',
  201: 'BSBA-HRM',
}

const statusColors: Record<CurriculumStatus, string> = {
  Draft: 'curriculum-overview-status-draft',
  Active: 'curriculum-overview-status-active',
  Legacy: 'curriculum-overview-status-legacy',
  Archived: 'curriculum-overview-status-archived',
}

export default function CurriculumManagementLayout({ activeView, onNavigate, onOpenCurriculum }: CurriculumManagementLayoutProps) {
  const handleOpenCurriculum = (id: string) => {
    if (onOpenCurriculum) {
      onOpenCurriculum(id)
    } else {
      onNavigate('curriculums')
    }
  }

  if (activeView === 'overview') {
    return <CurriculumOverview onNavigate={onNavigate} onOpenCurriculum={handleOpenCurriculum} />
  }

  return (
    <div className="curriculum-management-content">
      {activeView === 'curriculums' && (
        <CurriculumManagementPage
          onOpenCurriculum={handleOpenCurriculum}
          onCreate={() => onNavigate('create')}
          onArchived={() => onNavigate('archived')}
        />
      )}
      {activeView === 'create' && (
        <CreateCurriculumPage
          onBack={() => onNavigate('curriculums')}
          onCreated={() => onNavigate('curriculums')}
        />
      )}
      {activeView === 'archived' && (
        <CurriculumManagementPage
          onOpenCurriculum={handleOpenCurriculum}
          onCreate={() => onNavigate('create')}
          onArchived={() => onNavigate('archived')}
          initialStatusFilter="Archived"
          showCreateButton={false}
          title="Archived Curriculums"
        />
      )}
    </div>
  )
}

// ─── Curriculum Overview ───

function CurriculumOverview({ onNavigate, onOpenCurriculum }: { onNavigate: (v: CurriculumManagementView) => void; onOpenCurriculum: (id: string) => void }) {
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')
        const res = await fetch(`${API_URL}/api/registrar/curriculums`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`)
        if (!cancelled) setCurriculums(Array.isArray(data?.data) ? data.data : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch curriculums')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchAll()
    return () => { cancelled = true }
  }, [])

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = { Draft: 0, Active: 0, Legacy: 0, Archived: 0 }
    const byProgram: Record<number, number> = {}
    let totalSubjects = 0
    let totalUnits = 0
    curriculums.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1
      byProgram[c.programCode] = (byProgram[c.programCode] || 0) + 1
      totalSubjects += c.subjectCount || 0
      totalUnits += c.totalUnits || 0
    })
    return { byStatus, byProgram, totalSubjects, totalUnits, total: curriculums.length }
  }, [curriculums])

  // Programs that have no active curriculum
  const programsNeedingAttention = useMemo(() => {
    const allPrograms = [101, 102, 103, 201]
    return allPrograms.filter((code) => !curriculums.some((c) => c.programCode === code && c.status === 'Active'))
  }, [curriculums])

  // Active curriculums per program
  const activeCurriculums = useMemo(() => curriculums.filter((c) => c.status === 'Active'), [curriculums])

  // Draft curriculums
  const draftCurriculums = useMemo(() => curriculums.filter((c) => c.status === 'Draft'), [curriculums])

  if (loading) {
    return (
      <div className="curriculum-overview-page">
        <h2 className="registrar-section-title">Curriculum Overview</h2>
        <p className="registrar-section-desc">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="curriculum-overview-page">
        <h2 className="registrar-section-title">Curriculum Overview</h2>
        <p className="registrar-alert registrar-alert-error">{error}</p>
      </div>
    )
  }

  return (
    <div className="curriculum-overview-page">
      {/* Header */}
      <div className="curriculum-overview-header">
        <div>
          <h2 className="registrar-section-title">Curriculum Overview</h2>
          <p className="registrar-section-desc">High-level summary of curriculum status and coverage across all programs.</p>
        </div>
        <button className="registrar-btn" type="button" onClick={() => onNavigate('create')}>
          <Plus size={16} />
          Create Curriculum
        </button>
      </div>

      {/* Stats row */}
      <div className="curriculum-overview-stats">
        <div className="curriculum-overview-stat-card">
          <div className="curriculum-overview-stat-icon"><FileText size={20} /></div>
          <div>
            <strong>{stats.total}</strong>
            <span>Total Curriculums</span>
          </div>
        </div>
        <div className="curriculum-overview-stat-card curriculum-overview-stat-card--active">
          <div className="curriculum-overview-stat-icon curriculum-overview-stat-icon--active"><CheckCircle size={20} /></div>
          <div>
            <strong>{stats.byStatus.Active}</strong>
            <span>Active</span>
          </div>
        </div>
        <div className="curriculum-overview-stat-card">
          <div className="curriculum-overview-stat-icon"><Layers size={20} /></div>
          <div>
            <strong>{stats.totalSubjects}</strong>
            <span>Total Subjects</span>
          </div>
        </div>
        <div className="curriculum-overview-stat-card">
          <div className="curriculum-overview-stat-icon"><BookOpen size={20} /></div>
          <div>
            <strong>{stats.totalUnits || '—'}</strong>
            <span>Total Units</span>
          </div>
        </div>
        {programsNeedingAttention.length > 0 && (
          <div className="curriculum-overview-stat-card curriculum-overview-stat-card--alert">
            <div className="curriculum-overview-stat-icon curriculum-overview-stat-icon--alert"><AlertCircle size={20} /></div>
            <div>
              <strong>{programsNeedingAttention.length}</strong>
              <span>Need Active Curriculum</span>
            </div>
          </div>
        )}
      </div>

      {/* Programs needing attention */}
      {programsNeedingAttention.length > 0 && (
        <section className="curriculum-overview-attention">
          <div className="curriculum-overview-attention-header">
            <AlertCircle size={18} />
            <h3>Programs Without an Active Curriculum</h3>
          </div>
          <div className="curriculum-overview-attention-programs">
            {programsNeedingAttention.map((code) => (
              <div key={code} className="curriculum-overview-attention-program">
                <span className="curriculum-overview-program-label">{programLabels[code] || `Code ${code}`}</span>
                <button className="registrar-btn registrar-btn-sm" type="button" onClick={() => onNavigate('create')}>
                  <Plus size={14} /> Create
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active curriculums by program */}
      {activeCurriculums.length > 0 && (
        <section className="curriculum-overview-section">
          <div className="curriculum-overview-section-header">
            <CheckCircle size={18} />
            <h3>Active Curriculums</h3>
          </div>
          <div className="curriculum-overview-card-grid">
            {activeCurriculums.map((c) => (
              <div key={c._id} className="curriculum-overview-card" onClick={() => onOpenCurriculum(c._id)}>
                <span className={`curriculum-overview-status-badge ${statusColors[c.status]}`}>{c.status}</span>
                <h4>{c.name || `${programLabels[c.programCode] || c.programName} ${c.version}`}</h4>
                <p className="curriculum-overview-card-meta">
                  <span>{programLabels[c.programCode] || c.programName}</span>
                  <span> · </span>
                  <span>v{c.version}</span>
                  {c.effectiveSchoolYear && (<><span> · </span><span>{c.effectiveSchoolYear}</span></>)}
                </p>
                <div className="curriculum-overview-card-stats">
                  <span><Layers size={13} /> {c.subjectCount || 0} subjects</span>
                  {c.totalUnits ? <span><BookOpen size={13} /> {c.totalUnits} units</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Draft curriculums */}
      {draftCurriculums.length > 0 && (
        <section className="curriculum-overview-section">
          <div className="curriculum-overview-section-header">
            <FileText size={18} />
            <h3>Draft Curriculums</h3>
          </div>
          <div className="curriculum-overview-card-grid">
            {draftCurriculums.map((c) => (
              <div key={c._id} className="curriculum-overview-card" onClick={() => onOpenCurriculum(c._id)}>
                <span className={`curriculum-overview-status-badge ${statusColors[c.status]}`}>{c.status}</span>
                <h4>{c.name || `${programLabels[c.programCode] || c.programName} ${c.version}`}</h4>
                <p className="curriculum-overview-card-meta">
                  <span>{programLabels[c.programCode] || c.programName}</span>
                  <span> · </span>
                  <span>v{c.version}</span>
                </p>
                <div className="curriculum-overview-card-stats">
                  <span><Layers size={13} /> {c.subjectCount || 0} subjects</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick links */}
      <div className="curriculum-overview-quicklinks">
        <button className="curriculum-overview-quicklink" type="button" onClick={() => onNavigate('curriculums')}>
          <FileText size={18} />
          <span>View All Curriculums</span>
        </button>
        <button className="curriculum-overview-quicklink" type="button" onClick={() => onNavigate('archived')}>
          <ArchiveIcon size={18} />
          <span>View Archived</span>
        </button>
      </div>
    </div>
  )
}

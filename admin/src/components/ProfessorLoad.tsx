import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import type { RegistrarCourseWorkspaceSelection } from './RegistrarCourseWorkspace'
import './ProfessorLoad.css'

type ProfessorCourseSummary = {
  label: string
  fullLabel: string
  sections: number
  subjectCount: number
  studentCount: number
}

type ProfessorCourseLoad = {
  professorId: string
  username: string
  displayName: string
  label: string
  totals: {
    courses: number
    sections: number
    subjects: number
    students: number
  }
  courseSummaries: ProfessorCourseSummary[]
}

type LoadsPayload = {
  professors?: ProfessorCourseLoad[]
}

type Props = {
  onOpenStudents: () => void
  onOpenReports: () => void
  onOpenWorkspace: (selection: RegistrarCourseWorkspaceSelection) => void
}

export default function ProfessorLoad({ onOpenWorkspace }: Props) {
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const authorizedFetch = async (path: string) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const response = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
  }

  const fetchProfessorLoads = async () => {
    setLoading(true)
    try {
      const data = await authorizedFetch('/api/registrar/professor-course-loads')
      const payload = (data?.data || {}) as LoadsPayload
      setProfessorLoads(Array.isArray(payload.professors) ? payload.professors : [])
      setError('')
    } catch (err) {
      setProfessorLoads([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor loads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchProfessorLoads()
  }, [])

  const visibleProfessors = useMemo(() => {
    const query = search.trim().toLowerCase()
    const professors = [...professorLoads].sort((a, b) => a.label.localeCompare(b.label))
    if (!query) return professors

    return professors.filter((professor) => {
      const courseText = professor.courseSummaries
        .map((course) => `${course.label} ${course.fullLabel}`)
        .join(' ')
      return `${professor.label} ${professor.displayName} ${professor.username} ${courseText}`
        .toLowerCase()
        .includes(query)
    })
  }, [professorLoads, search])

  const openWorkspace = (professor: ProfessorCourseLoad) => {
    onOpenWorkspace({
      professorId: professor.professorId,
      courseLabel: professor.courseSummaries[0]?.label || ''
    })
  }

  return (
    <div className="registrar-section registrar-course-management-page registrar-professor-simple-page">
      <section className="registrar-course-hero registrar-professor-simple-hero">
        <div className="registrar-course-hero-copy">
          <span className="registrar-course-eyebrow">Professor Loads</span>
          <h2 className="registrar-section-title">Professor Directory</h2>
          <p className="registrar-section-desc">
            Select a professor and open their workspace to manage subject assignments.
          </p>
        </div>
        <button
          type="button"
          className="registrar-btn registrar-btn-secondary"
          onClick={() => void fetchProfessorLoads()}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}

      <section className="registrar-course-toolbar registrar-professor-simple-toolbar">
        <label className="registrar-course-search">
          <span>Search Professor</span>
          <Search size={16} className="registrar-course-search-icon" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, username, or course"
          />
        </label>
        <span className="registrar-course-card-pill">
          {loading ? 'Loading...' : `${visibleProfessors.length} professors`}
        </span>
      </section>

      <section className="registrar-course-directory-card registrar-professor-simple-card">
        {loading ? (
          <div className="registrar-professor-list registrar-professor-simple-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="registrar-professor-list-row registrar-professor-load-card-skeleton" aria-hidden="true">
                <div className="registrar-skeleton registrar-skeleton-title" />
              </div>
            ))}
          </div>
        ) : visibleProfessors.length === 0 ? (
          <div className="registrar-empty-state">
            <p>No professors found.</p>
          </div>
        ) : (
          <div className="registrar-professor-list registrar-professor-simple-list">
            {visibleProfessors.map((professor) => (
              <article key={professor.professorId} className="registrar-professor-list-row registrar-professor-simple-row">
                <div className="registrar-professor-list-row-main">
                  <div className="registrar-professor-list-row-header">
                    <span className="registrar-professor-name">{professor.label}</span>
                    <span className="registrar-professor-load-badge">{professor.totals.subjects} subjects</span>
                  </div>
                  <div className="registrar-professor-list-row-meta">
                    <span>{professor.totals.sections} sections</span>
                    <span>/</span>
                    <span>{professor.totals.students} students</span>
                  </div>
                  <div className="registrar-professor-list-row-courses">
                    {professor.courseSummaries.length === 0 ? (
                      <span className="registrar-professor-course-pill">No course yet</span>
                    ) : (
                      professor.courseSummaries.slice(0, 4).map((course) => (
                        <span key={course.label} className="registrar-professor-course-pill">{course.label}</span>
                      ))
                    )}
                    {professor.courseSummaries.length > 4 && (
                      <span className="registrar-professor-course-pill">+{professor.courseSummaries.length - 4}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="registrar-btn registrar-professor-workspace-btn"
                  onClick={() => openWorkspace(professor)}
                >
                  Open Workspace
                  <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

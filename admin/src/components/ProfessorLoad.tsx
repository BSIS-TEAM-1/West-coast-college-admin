import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Users,
  AlertTriangle,
  BookOpen,
  GraduationCap
} from 'lucide-react'
import { authorizedFetch } from '../lib/blockAssignmentShared'
import type { RegistrarCourseWorkspaceSelection } from './RegistrarCourseWorkspace'
import './ProfessorLoad.css'

// ─── Types ───

type ProfessorCourseSummary = {
  courseCode?: number | string
  label: string
  fullLabel: string
  sections: number
  subjectCount: number
  studentCount: number
}

type ProfessorAssignment = {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  schedule: string
  room: string
  sectionId: string
  sectionCode: string
  sectionLabel: string
  blockGroupId: string
  blockGroupName: string
  semester: string
  schoolYear: string
  courseCode?: number | string | null
  courseShortLabel: string
  courseLabel?: string
  yearLevel?: number | null
  units?: number
  studentCount: number
}

type ProfessorCourseLoad = {
  professorId: string
  username: string
  displayName: string
  label: string
  uid?: string
  status?: string
  assignments: ProfessorAssignment[]
  totals: {
    courses: number
    sections: number
    subjects: number
    students: number
  }
  courseSummaries: ProfessorCourseSummary[]
}

type UnassignedSubject = {
  instructor: string
  subjectCode: string
  subjectTitle: string
  sectionLabel: string
  courseShortLabel: string
  studentCount: number
  issueType: 'tba' | 'unmatched' | 'orphaned'
}

type LoadStats = {
  professors: number
  assignedSubjects: number
  sectionsCovered: number
  studentsCovered: number
  unassignedSubjects: number
  unmatchedInstructors: number
  orphanedSubjects: number
}

type FilterOption = {
  value: number
  label: string
  fullLabel: string
}

type LoadsPayload = {
  professors?: ProfessorCourseLoad[]
  stats?: LoadStats
  unassignedSubjects?: UnassignedSubject[]
  filterOptions?: {
    semesters: string[]
    years: number[]
    courses: FilterOption[]
  }
}

type SortOption = 'name-asc' | 'name-desc' | 'subjects-desc' | 'students-desc' | 'sections-desc'

// ─── Component ───

type Props = {
  onOpenStudents?: () => void
  onOpenReports?: () => void
  onOpenWorkspace: (selection: RegistrarCourseWorkspaceSelection) => void
}

export default function ProfessorLoad({ onOpenWorkspace }: Props) {
  const [professorLoads, setProfessorLoads] = useState<ProfessorCourseLoad[]>([])
  const [stats, setStats] = useState<LoadStats | null>(null)
  const [unassignedSubjects, setUnassignedSubjects] = useState<UnassignedSubject[]>([])
  const [filterOptions, setFilterOptions] = useState<{ semesters: string[]; years: number[]; courses: FilterOption[] }>({ semesters: [], years: [], courses: [] })

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('subjects-desc')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)
  const [showAttentionPanel, setShowAttentionPanel] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedProfessorId, setExpandedProfessorId] = useState<string | null>(null)

  // ─── Data fetching ───

  const fetchProfessorLoads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (semesterFilter) params.set('semester', semesterFilter)
      if (yearFilter) params.set('year', yearFilter)
      if (courseFilter) params.set('course', courseFilter)

      const data = await authorizedFetch<LoadsPayload>(`/api/registrar/professor-course-loads?${params.toString()}`)
      const payload = data?.data || (data as any)
      setProfessorLoads(Array.isArray(payload.professors) ? payload.professors : [])
      setStats(payload.stats || null)
      setUnassignedSubjects(Array.isArray(payload.unassignedSubjects) ? payload.unassignedSubjects : [])
      setFilterOptions(payload.filterOptions || { semesters: [], years: [], courses: [] })
    } catch (err) {
      setProfessorLoads([])
      setStats(null)
      setUnassignedSubjects([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor loads')
    } finally {
      setLoading(false)
    }
  }, [semesterFilter, yearFilter, courseFilter])

  useEffect(() => {
    void fetchProfessorLoads()
  }, [fetchProfessorLoads])

  // ─── Derived data ───

  const visibleProfessors = useMemo(() => {
    const query = search.trim().toLowerCase()
    let professors = [...professorLoads]

    // Filter by search query
    if (query) {
      professors = professors.filter((professor) => {
        const courseText = professor.courseSummaries
          .map((course) => `${course.label} ${course.fullLabel}`)
          .join(' ')
        const assignmentText = professor.assignments
          .map((a) => `${a.subjectCode} ${a.subjectTitle} ${a.sectionCode} ${a.sectionLabel}`)
          .join(' ')
        return `${professor.label} ${professor.displayName} ${professor.username} ${courseText} ${assignmentText}`
          .toLowerCase()
          .includes(query)
      })
    }

    // Filter: only professors with zero assignments (needs attention)
    if (showUnassignedOnly) {
      professors = professors.filter((p) => p.totals.subjects === 0)
    }

    // Sort
    professors.sort((a, b) => {
      switch (sort) {
        case 'name-asc': return a.label.localeCompare(b.label)
        case 'name-desc': return b.label.localeCompare(a.label)
        case 'subjects-desc': return b.totals.subjects - a.totals.subjects
        case 'students-desc': return b.totals.students - a.totals.students
        case 'sections-desc': return b.totals.sections - a.totals.sections
        default: return 0
      }
    })

    return professors
  }, [professorLoads, search, sort, showUnassignedOnly])

  const hasActiveFilters = !!(semesterFilter || yearFilter || courseFilter || search || showUnassignedOnly)

  // ─── Actions ───

  const openWorkspace = (professor: ProfessorCourseLoad) => {
    const courseLabel = professor.courseSummaries[0]?.label || ''
    onOpenWorkspace({
      professorId: professor.professorId,
      courseLabel
    })
  }

  const toggleExpand = (professorId: string) => {
    setExpandedProfessorId((current) => (current === professorId ? null : professorId))
  }

  const clearFilters = () => {
    setSearch('')
    setSemesterFilter('')
    setYearFilter('')
    setCourseFilter('')
    setShowUnassignedOnly(false)
  }

  // ─── Render helpers ───

  const formatStat = (value: number | undefined) => (value === undefined ? '—' : String(value))

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className="registrar-section registrar-course-management-page registrar-professor-simple-page">
      {/* Hero */}
      <section className="registrar-course-hero registrar-professor-simple-hero">
        <div className="registrar-course-hero-copy">
          <span className="registrar-course-eyebrow">Professor Loads</span>
          <h2 className="registrar-section-title">Professor Directory</h2>
          <p className="registrar-section-desc">
            View teaching assignments, filter by term or course, and open a professor's workspace to manage subjects.
          </p>
        </div>
        <button
          type="button"
          className="registrar-btn registrar-btn-secondary"
          onClick={() => void fetchProfessorLoads()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}

      {/* Stats summary */}
      {stats && !loading && (
        <section className="professor-load-stats-bar">
          <div className="professor-load-stat-card">
            <div className="professor-load-stat-icon-circle">
              <GraduationCap size={20} />
            </div>
            <div>
              <strong>{formatStat(stats.professors)}</strong>
              <span>Professors</span>
            </div>
          </div>
          <div className="professor-load-stat-card">
            <div className="professor-load-stat-icon-circle">
              <BookOpen size={20} />
            </div>
            <div>
              <strong>{formatStat(stats.assignedSubjects)}</strong>
              <span>Assigned Subjects</span>
            </div>
          </div>
          <div className="professor-load-stat-card">
            <div className="professor-load-stat-icon-circle">
              <Layers size={20} />
            </div>
            <div>
              <strong>{formatStat(stats.sectionsCovered)}</strong>
              <span>Sections Covered</span>
            </div>
          </div>
          <div className="professor-load-stat-card">
            <div className="professor-load-stat-icon-circle">
              <Users size={20} />
            </div>
            <div>
              <strong>{formatStat(stats.studentsCovered)}</strong>
              <span>Students Reached</span>
            </div>
          </div>
          {(stats.unassignedSubjects > 0 || stats.unmatchedInstructors > 0 || stats.orphanedSubjects > 0) && (
            <div className="professor-load-stat-card professor-load-stat-card--alert" onClick={() => setShowAttentionPanel(true)}>
              <div className="professor-load-stat-icon-circle professor-load-stat-icon-circle--alert">
                <AlertTriangle size={20} />
              </div>
              <div>
                <strong>{stats.unassignedSubjects + stats.unmatchedInstructors + stats.orphanedSubjects}</strong>
                <span>Need Attention</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Attention panel: unassigned / orphaned subjects */}
      {showAttentionPanel && !loading && unassignedSubjects.length > 0 && (
        <section className="professor-load-attention-panel">
          <div className="professor-load-attention-header">
            <div className="professor-load-attention-title">
              <AlertTriangle size={18} />
              <h3>Subjects Needing Attention</h3>
              <span className="professor-load-attention-count">{unassignedSubjects.length}</span>
            </div>
            <button type="button" className="professor-load-attention-close" onClick={() => setShowAttentionPanel(false)}>
              Dismiss
            </button>
          </div>
          <div className="professor-load-attention-scroll">
            {unassignedSubjects.map((subject, i) => (
              <div key={i} className={`professor-load-attention-card professor-load-attention-card--${subject.issueType}`}>
                <div className="professor-load-attention-card-top">
                  <div className="professor-load-attention-card-id">
                    <strong>{subject.subjectCode}</strong>
                    <span className="professor-load-attention-card-title">{subject.subjectTitle}</span>
                  </div>
                  <span className="professor-load-attention-badge">
                    {subject.issueType === 'tba' ? 'No Instructor' : subject.issueType === 'unmatched' ? 'Unmatched' : 'Orphaned'}
                  </span>
                </div>
                <p className="professor-load-attention-card-meta">
                  {subject.courseShortLabel} · {subject.sectionLabel} · {subject.studentCount} students
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters toolbar */}
      <section className="registrar-course-toolbar registrar-professor-simple-toolbar professor-load-toolbar">
        <label className="registrar-course-search">
          <span>Search</span>
          <Search size={16} className="registrar-course-search-icon" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, username, course, subject, or section"
          />
        </label>

        {filterOptions.semesters.length > 0 && (
          <label>
            <span>Semester</span>
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.semesters.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        {filterOptions.years.length > 0 && (
          <label>
            <span>Year</span>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.years.map((y) => <option key={y} value={y}>{y}-{y + 1}</option>)}
            </select>
          </label>
        )}

        {filterOptions.courses.length > 0 && (
          <label>
            <span>Course</span>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.courses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        )}

        <label>
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            <option value="subjects-desc">Most subjects</option>
            <option value="students-desc">Most students</option>
            <option value="sections-desc">Most sections</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </label>

        <label className="professor-load-checkbox">
          <input
            type="checkbox"
            checked={showUnassignedOnly}
            onChange={(e) => setShowUnassignedOnly(e.target.checked)}
          />
          <span>No assignments only</span>
        </label>
      </section>

      {/* Active filter chips + result count */}
      <section className="professor-load-filter-summary">
        <span className="registrar-course-card-pill">
          {loading ? 'Loading...' : `${visibleProfessors.length} professor${visibleProfessors.length !== 1 ? 's' : ''}`}
        </span>
        {hasActiveFilters && (
          <button type="button" className="professor-load-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </section>

      {/* Professor list */}
      <section className="registrar-course-directory-card registrar-professor-simple-card">
        {loading ? (
          <div className="registrar-professor-simple-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="registrar-professor-simple-row registrar-professor-load-card-skeleton" aria-hidden="true">
                <div className="registrar-skeleton registrar-skeleton-title" />
              </div>
            ))}
          </div>
        ) : visibleProfessors.length === 0 ? (
          <div className="registrar-empty-state professor-load-empty-state">
            <Users size={32} />
            <p>{hasActiveFilters ? 'No professors match the current filters.' : 'No professors found.'}</p>
            {hasActiveFilters && (
              <button type="button" className="registrar-btn registrar-btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="registrar-professor-simple-list">
            {visibleProfessors.map((professor) => {
              const isExpanded = expandedProfessorId === professor.professorId
              const hasNoAssignments = professor.totals.subjects === 0
              return (
                <article
                  key={professor.professorId}
                  className={`registrar-professor-simple-row professor-load-card ${isExpanded ? 'professor-load-card--expanded' : ''} ${hasNoAssignments ? 'professor-load-card--empty' : ''}`}
                >
                  {/* Main row */}
                  <div className="professor-load-card-main">
                    <button
                      type="button"
                      className="professor-load-card-toggle"
                      onClick={() => toggleExpand(professor.professorId)}
                      disabled={hasNoAssignments}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {hasNoAssignments ? (
                        <ChevronRight size={16} className="professor-load-chevron professor-load-chevron--disabled" />
                      ) : (
                        <ChevronDown size={16} className={`professor-load-chevron ${isExpanded ? 'professor-load-chevron--open' : ''}`} />
                      )}
                    </button>

                    <div className="professor-load-avatar" aria-hidden="true">
                      {getInitials(professor.label)}
                    </div>

                    <div className="professor-load-card-info">
                      <div className="professor-load-card-header">
                        <span className="registrar-professor-name">{professor.label}</span>
                        {hasNoAssignments ? (
                          <span className="professor-load-badge professor-load-badge--empty">No assignments</span>
                        ) : (
                          <span className="registrar-professor-load-badge">{professor.totals.subjects} subjects</span>
                        )}
                      </div>

                      <div className="professor-load-card-metrics">
                        <span className="professor-load-metric"><Layers size={14} /> {professor.totals.sections} sections</span>
                        <span className="professor-load-metric"><Users size={14} /> {professor.totals.students} students</span>
                        <span className="professor-load-metric"><BookOpen size={14} /> {professor.totals.courses} course{professor.totals.courses !== 1 ? 's' : ''}</span>
                      </div>

                      <div className="registrar-professor-list-row-courses">
                        {professor.courseSummaries.length === 0 ? (
                          <span className="registrar-professor-course-pill">No course yet</span>
                        ) : (
                          professor.courseSummaries.slice(0, 5).map((course) => (
                            <span key={course.label} className="registrar-professor-course-pill" title={course.fullLabel}>
                              {course.label}
                            </span>
                          ))
                        )}
                        {professor.courseSummaries.length > 5 && (
                          <span className="registrar-professor-course-pill">+{professor.courseSummaries.length - 5}</span>
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
                  </div>

                  {/* Expanded detail: assignment list */}
                  {isExpanded && !hasNoAssignments && professor.assignments.length > 0 && (
                    <div className="professor-load-card-detail">
                      <table className="professor-load-assignment-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Title</th>
                            <th>Section</th>
                            <th>Schedule</th>
                            <th>Room</th>
                            <th>Units</th>
                            <th>Students</th>
                          </tr>
                        </thead>
                        <tbody>
                          {professor.assignments.map((assignment, i) => (
                            <tr key={`${assignment.subjectId}-${assignment.sectionId}-${i}`}>
                              <td><strong>{assignment.subjectCode}</strong></td>
                              <td className="professor-load-assignment-title">{assignment.subjectTitle}</td>
                              <td>{assignment.sectionLabel || assignment.sectionCode}</td>
                              <td>
                                <span className="professor-load-assignment-schedule">
                                  <Clock size={12} /> {assignment.schedule || 'TBA'}
                                </span>
                              </td>
                              <td>
                                <span className="professor-load-assignment-room">
                                  <MapPin size={12} /> {assignment.room || 'TBA'}
                                </span>
                              </td>
                              <td>{assignment.units || '—'}</td>
                              <td>
                                <span className="professor-load-assignment-students">
                                  <Users size={12} /> {assignment.studentCount}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="professor-load-card-detail-footer">
                        <span className="professor-load-detail-meta">
                          <Hash size={13} /> {professor.assignments.length} assignments across {professor.totals.sections} section{professor.totals.sections !== 1 ? 's' : ''}
                        </span>
                        <span className="professor-load-detail-meta">
                          {professor.courseSummaries.map((c) => c.label).join(' · ') || 'No course labels'}
                        </span>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Copy, Plus, Search, Trash2, GraduationCap, BookPlus, Info, X } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { CurriculumStructure, Semester, SubjectItem } from './registrarBlockTypes'

type CurriculumDetailsPageProps = {
  curriculumId: string
  onBack: () => void
}

const programLabels: Record<number, string> = {
  101: 'BEED',
  102: 'BSEd-English',
  103: 'BSEd-Math',
  201: 'BSBA-HRM',
}

const subjectTypeLabels: Record<string, string> = {
  General: 'General',
  Major: 'Major',
  Professional: 'Professional',
  Elective: 'Elective',
}

const semesterOrder: Semester[] = ['1st', '2nd', 'Summer']

function getSubject(cs: { subjectId: string | SubjectItem }): SubjectItem | null {
  return typeof cs.subjectId === 'object' && cs.subjectId !== null ? cs.subjectId : null
}

const statusColors: Record<string, string> = {
  Draft: 'curriculum-status-draft',
  Active: 'curriculum-status-active',
  Legacy: 'curriculum-status-legacy',
  Archived: 'curriculum-status-archived',
}

function CurriculumDetailsPage({ curriculumId, onBack }: CurriculumDetailsPageProps) {
  const [structure, setStructure] = useState<CurriculumStructure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [addYearLevel, setAddYearLevel] = useState(1)
  const [addSemester, setAddSemester] = useState<Semester>('1st')
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [subjectSearch, setSubjectSearch] = useState('')
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set())
  const [addSubjectConfigs, setAddSubjectConfigs] = useState<Record<string, { type: string; isRequired: boolean; displayOrder: string }>>({})
  const [saving, setSaving] = useState(false)
  const [prereqPicker, setPrereqPicker] = useState<{
    curriculumSubjectId: string
    subjectId: string
    currentPrereqIds: string[]
    selectedIds: Set<string>
    search: string
    yearFilter: string
    semesterFilter: string
    typeFilter: string
  } | null>(null)

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

  const fetchStructure = async () => {
    setLoading(true)
    try {
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/structure`)
      setStructure(data?.data || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch curriculum structure')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubjects = async () => {
    try {
      const params = new URLSearchParams()
      if (subjectSearch.trim()) params.set('q', subjectSearch.trim())
      params.set('isActive', 'true')
      const data = await authorizedFetch(`/api/registrar/subjects${params.toString() ? `?${params.toString()}` : ''}`)
      setSubjects(Array.isArray(data?.data) ? data.data : [])
    } catch {
      setSubjects([])
    }
  }

  useEffect(() => {
    void fetchStructure()
  }, [curriculumId])

  useEffect(() => {
    if (showAddModal) {
      void fetchSubjects()
    }
  }, [showAddModal])

  useEffect(() => {
    if (showAddModal) {
      const timeoutId = window.setTimeout(() => void fetchSubjects(), 200)
      return () => window.clearTimeout(timeoutId)
    }
  }, [subjectSearch, showAddModal])

  const toggleYear = (year: number) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  const handleAddSubjects = async () => {
    if (addSelectedIds.size === 0) {
      setError('Please select at least one subject')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = Array.from(addSelectedIds).map((subjectId) => {
        const cfg = addSubjectConfigs[subjectId] || { type: 'General', isRequired: true, displayOrder: '0' }
        return {
          subjectId,
          yearLevel: addYearLevel,
          semester: addSemester,
          type: cfg.type,
          isRequired: cfg.isRequired,
          displayOrder: Number(cfg.displayOrder) || 0,
        }
      })
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/subjects/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjects: payload }),
      })
      setSuccess(data?.message || 'Subjects added to curriculum')
      setShowAddModal(false)
      setAddSelectedIds(new Set())
      setAddSubjectConfigs({})
      await fetchStructure()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add subjects')
    } finally {
      setSaving(false)
    }
  }

  const toggleAddSubjectSelection = (subjectId: string) => {
    setAddSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(subjectId)) {
        next.delete(subjectId)
        setAddSubjectConfigs((cfg) => {
          const c = { ...cfg }
          delete c[subjectId]
          return c
        })
      } else {
        next.add(subjectId)
        setAddSubjectConfigs((cfg) => ({
          ...cfg,
          [subjectId]: { type: 'General', isRequired: true, displayOrder: '0' },
        }))
      }
      return next
    })
  }

  const updateAddSubjectConfig = (subjectId: string, field: 'type' | 'isRequired' | 'displayOrder', value: string) => {
    setAddSubjectConfigs((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: field === 'isRequired' ? value === 'true' : value,
      },
    }))
  }

  const handleRemoveSubject = async (curriculumSubjectId: string, code: string) => {
    if (!window.confirm(`Remove ${code} from this curriculum?`)) return
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/subjects/${curriculumSubjectId}`, {
        method: 'DELETE',
      })
      setSuccess('Subject removed from curriculum')
      await fetchStructure()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove subject')
    }
  }

  const handleSavePrerequisites = async () => {
    if (!prereqPicker || !prereqPicker.selectedIds) return
    const selectedArr = Array.from(prereqPicker.selectedIds)
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/subjects/${prereqPicker.curriculumSubjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteSubjectIds: selectedArr }),
      })
      setSuccess(selectedArr.length > 0
        ? `${selectedArr.length} prerequisite${selectedArr.length !== 1 ? 's' : ''} saved`
        : 'Prerequisites cleared')
      setPrereqPicker(null)
      await fetchStructure()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prerequisites')
    } finally {
      setSaving(false)
    }
  }

  const togglePrereqSelection = (subjectId: string) => {
    setPrereqPicker((prev) => {
      if (!prev) return prev
      const next = new Set(prev.selectedIds)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return { ...prev, selectedIds: next }
    })
  }

  const handleRemovePrerequisite = async (curriculumSubjectId: string, prereqIdToRemove: string) => {
    if (!structure) return
    let currentPrereqIds: string[] = []
    for (const year of structure.years) {
      for (const sem of year.semesters) {
        for (const cs of sem.subjects) {
          if (cs._id === curriculumSubjectId) {
            currentPrereqIds = (cs.prerequisiteSubjectIds as SubjectItem[])
              .filter((p): p is SubjectItem => typeof p === 'object' && p !== null)
              .map((p) => String(p._id))
            break
          }
        }
      }
    }

    const updatedPrereqs = currentPrereqIds.filter((id) => id !== prereqIdToRemove)
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/subjects/${curriculumSubjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteSubjectIds: updatedPrereqs }),
      })
      setSuccess('Prerequisite removed')
      await fetchStructure()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove prerequisite')
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async () => {
    if (!structure?.curriculum) return
    const newVersion = window.prompt('Enter version for the new curriculum:', String(Number(structure.curriculum.version) + 1))
    if (!newVersion) return
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/registrar/curriculums/${curriculumId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: newVersion }),
      })
      setSuccess(data?.message || 'Curriculum duplicated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate curriculum')
    }
  }

  const openAddModal = (yearLevel: number, semester: Semester) => {
    setAddYearLevel(yearLevel)
    setAddSemester(semester)
    setAddSelectedIds(new Set())
    setAddSubjectConfigs({})
    setShowAddModal(true)
    setError('')
    setSuccess('')
  }

  if (loading) {
    return (
      <div className="registrar-section curriculum-details-page">
        <p className="assignment-empty-copy">Loading curriculum...</p>
      </div>
    )
  }

  if (!structure) {
    return (
      <div className="registrar-section curriculum-details-page">
        {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
        <button className="registrar-btn registrar-btn-secondary" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Curriculums
        </button>
      </div>
    )
  }

  const { curriculum, years, summary } = structure
  const programLabel = programLabels[curriculum.programCode] || curriculum.programName
  const isArchived = curriculum.status === 'Archived'
  const isActive = curriculum.status === 'Active'

  return (
    <div className="registrar-section curriculum-details-page">
      <button className="registrar-btn registrar-btn-secondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to Curriculums
      </button>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
      {success && <p className="registrar-alert registrar-alert-success">{success}</p>}

      <div className="curriculum-details-header">
        <div>
          <h2>{curriculum.name || `${programLabel} Curriculum ${curriculum.version}`}</h2>
          <div className="curriculum-details-meta">
            <span>{programLabel}</span>
            <span>·</span>
            <span>Version {curriculum.version}</span>
            {curriculum.effectiveSchoolYear && <><span>·</span><span>{curriculum.effectiveSchoolYear}</span></>}
            <span className={`curriculum-status-badge ${statusColors[curriculum.status]}`}>{curriculum.status}</span>
          </div>
        </div>
        {!isArchived && (
          <div className="curriculum-details-actions">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={handleDuplicate}>
              <Copy size={16} />
              Duplicate
            </button>
          </div>
        )}
      </div>

      {curriculum.description && (
        <p className="curriculum-description">{curriculum.description}</p>
      )}

      <div className="curriculum-overview-stats">
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            <BookOpen size={18} />
            Total Subjects
          </div>
          <strong>{summary.totalSubjects}</strong>
        </div>
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            <GraduationCap size={18} />
            Total Units
          </div>
          <strong>{summary.totalUnits}</strong>
        </div>
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            Lecture / Lab Periods
          </div>
          <strong>{summary.totalLecturePeriods} / {summary.totalLabPeriods}</strong>
        </div>
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            Total Required
          </div>
          <strong>{summary.requiredCount}</strong>
        </div>
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            Electives
          </div>
          <strong>{summary.electiveCount}</strong>
        </div>
        <div className="curriculum-stat-card">
          <div className="curriculum-stat-card-label">
            Years Covered
          </div>
          <strong>{summary.yearsCovered}</strong>
        </div>
      </div>

      {isActive && (
        <div className="curriculum-info-banner">
          <Info size={18} style={{ color: '#b45309', flexShrink: 0, marginTop: '1px' }} />
          <p>This curriculum is Active. Changes will affect future enrollment configuration but will NOT modify existing historical enrollments.</p>
        </div>
      )}

      <div className="curriculum-structure">
        {years.length === 0 && (
          <div className="curriculum-empty-state">
            <div className="curriculum-empty-state-icon">
              <BookPlus size={40} />
            </div>
            <h3>No subjects added yet</h3>
            <p>{!isArchived ? 'Click \u201C+ Add Subject\u201D to start building the curriculum structure.' : 'This archived curriculum has no subjects.'}</p>
            {!isArchived && (
              <button className="registrar-btn" type="button" onClick={() => openAddModal(1, '1st')}>
                <Plus size={16} />
                Add Subject
              </button>
            )}
          </div>
        )}
        {years.map((year) => {
          const isCollapsed = collapsedYears.has(year.yearLevel)
          return (
            <div key={year.yearLevel} className="curriculum-year-section">
              <button
                type="button"
                className="curriculum-year-header"
                onClick={() => toggleYear(year.yearLevel)}
              >
                {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                <h3>Year {year.yearLevel}</h3>
              </button>
              {!isCollapsed && (
                <div className="curriculum-year-body">
                  {semesterOrder.map((sem) => {
                    const semData = year.semesters.find((s) => s.semester === sem)
                    const semSubjects = semData?.subjects || []
                    return (
                      <div key={sem} className="curriculum-semester-block">
                        <div className="curriculum-semester-header">
                          <h4>{sem === '1st' ? '1st Semester' : sem === '2nd' ? '2nd Semester' : 'Summer'}</h4>
                          <span className="curriculum-semester-units">
                            {semData?.totalUnits || 0} units · {semData?.totalLecturePeriods || 0} lec / {semData?.totalLabPeriods || 0} lab
                          </span>
                          {!isArchived && (
                            <button
                              className="subject-action-btn edit"
                              type="button"
                              onClick={() => openAddModal(year.yearLevel, sem)}
                            >
                              <Plus size={14} />
                              Add Subject
                            </button>
                          )}
                        </div>
                        {semSubjects.length > 0 ? (
                          <div className="subject-table">
                            <div className="subject-table-header curriculum-subject-table-header">
                              <span>Code</span>
                              <span>Title</span>
                              <span>Units</span>
                              <span>Lecture</span>
                              <span>Lab / Field</span>
                              <span>Type</span>
                              <span>Prerequisites</span>
                              <span>Required</span>
                              {!isArchived && <span>Actions</span>}
                            </div>
                            <div className="subject-table-body">
                              {semSubjects.map((cs) => {
                                // Render the CurriculumSubject SNAPSHOT (courseNo/descriptiveTitle/
                                // units/lecturePeriods/labPeriods), not the live populated Subject —
                                // this is what keeps an approved curriculum stable when the master
                                // Subject catalog entry is edited later. Fall back to the populated
                                // Subject only for pre-snapshot legacy records that predate this field.
                                const subj = getSubject(cs)
                                const prereqs = Array.isArray(cs.prerequisiteSubjectIds)
                                  ? (cs.prerequisiteSubjectIds as SubjectItem[]).filter((p) => typeof p === 'object' && p !== null)
                                  : []
                                return (
                                <div key={cs._id} className="subject-table-row curriculum-subject-table-row">
                                  <span>{cs.courseNo || subj?.code || 'N/A'}</span>
                                  <span title={cs.descriptiveTitle || subj?.title}>{cs.descriptiveTitle || subj?.title || 'Subject unavailable'}</span>
                                  <span>{cs.units ?? subj?.units ?? 0}</span>
                                  <span>{cs.lecturePeriods ?? subj?.lecturePeriods ?? 0}</span>
                                  <span>{cs.labPeriods ?? subj?.labPeriods ?? 0}</span>
                                  <span>{subjectTypeLabels[cs.type] || cs.type}</span>
                                  <span className="curriculum-prereq-cell">
                                    {prereqs.length > 0
                                      ? prereqs.map((p) => (
                                        <span key={p._id} className="subject-prereq-chip-removable">
                                          {p.code}
                                          {!isArchived && (
                                            <button
                                              type="button"
                                              className="subject-prereq-chip-x"
                                              onClick={() => void handleRemovePrerequisite(cs._id, String(p._id))}
                                              disabled={saving}
                                              aria-label={`Remove ${p.code} as prerequisite`}
                                            >
                                              <X size={12} />
                                            </button>
                                          )}
                                        </span>
                                      ))
                                      : <span className="subject-prereq-empty">None</span>}
                                    {!isArchived && (
                                      <button
                                        className="subject-action-btn edit curriculum-prereq-add-btn"
                                        type="button"
                                        onClick={() => {
                                          const currentIds = prereqs.map((p) => String(p._id))
                                          setPrereqPicker({
                                            curriculumSubjectId: cs._id,
                                            subjectId: String(subj?._id || ''),
                                            currentPrereqIds: currentIds,
                                            selectedIds: new Set(currentIds),
                                            search: '',
                                            yearFilter: '',
                                            semesterFilter: '',
                                            typeFilter: '',
                                          })
                                        }}
                                        disabled={saving}
                                      >
                                        <Plus size={12} />
                                        Add
                                      </button>
                                    )}
                                  </span>
                                  <span>{cs.isRequired ? 'Yes' : 'No'}</span>
                                  {!isArchived && (
                                    <span className="subject-cell-actions">
                                      <button
                                        className="subject-action-btn delete"
                                        type="button"
                                        onClick={() => handleRemoveSubject(cs._id, cs.courseNo || subj?.code || 'this subject')}
                                      >
                                        <Trash2 size={14} />
                                        Remove
                                      </button>
                                    </span>
                                  )}
                                </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="assignment-empty-copy" style={{ padding: '8px 0' }}>No subjects for this semester.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <div className="block-assignment-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="block-assignment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="block-assignment-modal-header">
              <h3>Add Subject to Curriculum</h3>
              <p>Year {addYearLevel} \u00B7 {addSemester === '1st' ? '1st Semester' : addSemester === '2nd' ? '2nd Semester' : 'Summer'}</p>
            </div>

            <div className="block-assignment-modal-body">
              <label className="subject-search-field" style={{ marginBottom: '12px' }}>
                <Search size={16} />
                <input
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  placeholder="Search by code or title"
                  autoFocus
                />
              </label>

              <div className="prereq-picker-counter" style={{ marginBottom: '8px' }}>
                Selected: <strong>{addSelectedIds.size}</strong>
              </div>

              <div className="curriculum-subject-picker">
                {subjects.length === 0 && <p className="assignment-empty-copy">No active subjects found.</p>}
                {subjects.slice(0, 50).map((subject) => {
                  const checked = addSelectedIds.has(subject._id)
                  return (
                    <label
                      key={subject._id}
                      className={`prereq-picker-row ${checked ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddSubjectSelection(subject._id)}
                        disabled={saving}
                      />
                      <div className="prereq-picker-row-info">
                        <strong>{subject.code}</strong>
                        <span>{subject.title}</span>
                        <small>{subject.units} units · {subject.lecturePeriods ?? 0} lec / {subject.labPeriods ?? 0} lab</small>
                      </div>
                    </label>
                  )
                })}
              </div>

              {addSelectedIds.size > 0 && (
                <div className="add-subject-config-section">
                  <div className="add-subject-config-header">
                    <span>Configure Selected Subjects</span>
                    <small>Type · Required · Order — per subject</small>
                  </div>
                  <div className="add-subject-config-list">
                    {Array.from(addSelectedIds).map((subjectId) => {
                      const subject = subjects.find((s) => s._id === subjectId)
                      const cfg = addSubjectConfigs[subjectId] || { type: 'General', isRequired: true, displayOrder: '0' }
                      return (
                        <div key={subjectId} className="add-subject-config-row">
                          <div className="add-subject-config-name">
                            <strong>{subject?.code || 'N/A'}</strong>
                            <span>{subject?.title || ''}</span>
                          </div>
                          <select
                            value={cfg.type}
                            onChange={(e) => updateAddSubjectConfig(subjectId, 'type', e.target.value)}
                            disabled={saving}
                            aria-label={`Subject type for ${subject?.code}`}
                          >
                            <option value="General">General</option>
                            <option value="Major">Major</option>
                            <option value="Professional">Professional</option>
                            <option value="Elective">Elective</option>
                          </select>
                          <select
                            value={String(cfg.isRequired)}
                            onChange={(e) => updateAddSubjectConfig(subjectId, 'isRequired', e.target.value)}
                            disabled={saving}
                            aria-label={`Required status for ${subject?.code}`}
                          >
                            <option value="true">Required</option>
                            <option value="false">Elective</option>
                          </select>
                          <input
                            type="number"
                            min={0}
                            value={cfg.displayOrder}
                            onChange={(e) => updateAddSubjectConfig(subjectId, 'displayOrder', e.target.value)}
                            disabled={saving}
                            aria-label={`Display order for ${subject?.code}`}
                            style={{ width: '60px' }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="block-assignment-modal-footer">
              <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => { setShowAddModal(false); setAddSelectedIds(new Set()); setAddSubjectConfigs({}) }}>
                Cancel
              </button>
              <button className="registrar-btn" type="button" onClick={handleAddSubjects} disabled={saving || addSelectedIds.size === 0}>
                {saving ? 'Adding...' : `Add Subjects (${addSelectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {prereqPicker && structure && prereqPicker.selectedIds && (() => {
        // Build the flat list of eligible curriculum subjects (exclude self).
        // Already-selected prerequisites ARE included so they can be unchecked.
        const currentSubjectId = prereqPicker.subjectId
        type PickItem = {
          csId: string
          subjectId: string
          code: string
          title: string
          yearLevel: number
          semester: string
          type: string
          units: number
          lecturePeriods: number
          labPeriods: number
          isActive: boolean
        }
        const allItems: PickItem[] = []
        for (const year of structure.years) {
          for (const sem of year.semesters) {
            for (const cs of sem.subjects) {
              const s = getSubject(cs)
              if (!s) continue
              if (String(s._id) === currentSubjectId) continue // prevent self-prereq
              allItems.push({
                csId: cs._id,
                subjectId: String(s._id),
                code: cs.courseNo || s.code || 'N/A',
                title: cs.descriptiveTitle || s.title || '',
                yearLevel: cs.yearLevel,
                semester: cs.semester,
                type: cs.type,
                units: cs.units ?? s.units ?? 0,
                lecturePeriods: cs.lecturePeriods ?? s.lecturePeriods ?? 0,
                labPeriods: cs.labPeriods ?? s.labPeriods ?? 0,
                isActive: s.isActive !== false,
              })
            }
          }
        }

        // Apply filters
        const searchLower = prereqPicker.search.trim().toLowerCase()
        const filtered = allItems.filter((item) => {
          if (searchLower) {
            const matches =
              item.code.toLowerCase().includes(searchLower) ||
              item.title.toLowerCase().includes(searchLower)
            if (!matches) return false
          }
          if (prereqPicker.yearFilter && String(item.yearLevel) !== prereqPicker.yearFilter) return false
          if (prereqPicker.semesterFilter && item.semester !== prereqPicker.semesterFilter) return false
          if (prereqPicker.typeFilter && item.type !== prereqPicker.typeFilter) return false
          return true
        })

        // Group by Year → Semester (preserve structure order)
        const groups: { yearLevel: number; semester: string; items: PickItem[] }[] = []
        for (const item of filtered) {
          let group = groups.find((g) => g.yearLevel === item.yearLevel && g.semester === item.semester)
          if (!group) {
            group = { yearLevel: item.yearLevel, semester: item.semester, items: [] }
            groups.push(group)
          }
          group.items.push(item)
        }

        // Available filter options (derived from full list, not filtered)
        const yearOptions = Array.from(new Set(allItems.map((i) => i.yearLevel))).sort((a, b) => a - b)
        const semesterOptions = Array.from(new Set(allItems.map((i) => i.semester)))
        const typeOptions = Array.from(new Set(allItems.map((i) => i.type)))
        const selectedCount = prereqPicker.selectedIds.size

        return (
          <div className="block-assignment-modal-overlay" onClick={() => setPrereqPicker(null)}>
            <div className="block-assignment-modal prereq-picker-modal" onClick={(e) => e.stopPropagation()}>
              <div className="block-assignment-modal-header prereq-picker-header">
                <div>
                  <h3>Select Prerequisites</h3>
                  <p>Select subjects from this curriculum that must be completed before this subject.</p>
                </div>
                <button
                  type="button"
                  className="prereq-picker-close"
                  onClick={() => setPrereqPicker(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="block-assignment-modal-body prereq-picker-body">
                <div className="prereq-picker-controls">
                  <label className="subject-search-field prereq-picker-search">
                    <Search size={16} />
                    <input
                      value={prereqPicker.search}
                      onChange={(e) => setPrereqPicker((prev) => prev ? { ...prev, search: e.target.value } : null)}
                      placeholder="Search by course code or title"
                      autoFocus
                    />
                  </label>
                  <div className="prereq-picker-filters">
                    <select
                      value={prereqPicker.yearFilter}
                      onChange={(e) => setPrereqPicker((prev) => prev ? { ...prev, yearFilter: e.target.value } : null)}
                      aria-label="Filter by year level"
                    >
                      <option value="">Year Level: All</option>
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>Year {y}</option>
                      ))}
                    </select>
                    <select
                      value={prereqPicker.semesterFilter}
                      onChange={(e) => setPrereqPicker((prev) => prev ? { ...prev, semesterFilter: e.target.value } : null)}
                      aria-label="Filter by semester"
                    >
                      <option value="">Semester: All</option>
                      {semesterOptions.map((s) => (
                        <option key={s} value={s}>{s === '1st' ? '1st Semester' : s === '2nd' ? '2nd Semester' : 'Summer'}</option>
                      ))}
                    </select>
                    <select
                      value={prereqPicker.typeFilter}
                      onChange={(e) => setPrereqPicker((prev) => prev ? { ...prev, typeFilter: e.target.value } : null)}
                      aria-label="Filter by subject type"
                    >
                      <option value="">Type: All</option>
                      {typeOptions.map((t) => (
                        <option key={t} value={t}>{subjectTypeLabels[t] || t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="prereq-picker-counter">
                    Selected: <strong>{selectedCount}</strong>
                  </div>
                </div>

                <div className="prereq-picker-results">
                  {allItems.length === 0 && (
                    <p className="assignment-empty-copy">No eligible subjects found.</p>
                  )}
                  {allItems.length > 0 && filtered.length === 0 && (
                    <p className="assignment-empty-copy">No subjects match your search.</p>
                  )}
                  {groups.map((group) => (
                    <div key={`${group.yearLevel}-${group.semester}`} className="prereq-picker-group">
                      <div className="prereq-picker-group-label">
                        YEAR {group.yearLevel} · {group.semester === '1st' ? '1ST SEMESTER' : group.semester === '2nd' ? '2ND SEMESTER' : 'SUMMER'}
                      </div>
                      {group.items.map((item) => {
                        const checked = prereqPicker.selectedIds.has(item.subjectId)
                        return (
                          <label
                            key={item.subjectId}
                            className={`prereq-picker-row ${checked ? 'selected' : ''} ${!item.isActive ? 'inactive' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePrereqSelection(item.subjectId)}
                              disabled={saving}
                            />
                            <div className="prereq-picker-row-info">
                              <strong>{item.code}</strong>
                              <span>{item.title}{!item.isActive && ' (inactive)'}</span>
                              <small>{item.units} units · {item.lecturePeriods} lec / {item.labPeriods} lab</small>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="block-assignment-modal-footer prereq-picker-footer">
                <button
                  className="registrar-btn registrar-btn-secondary"
                  type="button"
                  onClick={() => setPrereqPicker(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="registrar-btn"
                  type="button"
                  onClick={() => void handleSavePrerequisites()}
                  disabled={saving || selectedCount === 0}
                >
                  {saving ? 'Saving...' : `Add Prerequisites (${selectedCount})`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default CurriculumDetailsPage

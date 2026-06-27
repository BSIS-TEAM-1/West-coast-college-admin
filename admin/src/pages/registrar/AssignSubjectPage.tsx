import { useEffect, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection, SectionStudent, SubjectDraft, SubjectItem, Semester } from './registrarBlockTypes'

function AssignSubjectPage() {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [sections, setSections] = useState<BlockSection[]>([])
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [semester, setSemester] = useState<Semester>('1st')
  const [schoolYear, setSchoolYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`)
  const [subjectDrafts, setSubjectDrafts] = useState<SubjectDraft[]>([{ code: '', title: '', units: '3' }])
  const [loading, setLoading] = useState(false)
  const [creatingSubject, setCreatingSubject] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingSubjectId, setEditingSubjectId] = useState('')
  const [editingSubjectCode, setEditingSubjectCode] = useState('')
  const [editingSubjectTitle, setEditingSubjectTitle] = useState('')
  const [editingSubjectUnits, setEditingSubjectUnits] = useState('3')
  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null

  const formatBlockLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return value
    const parts = text.split('-')
    const first = parts[0]
    const mapped = courseAbbreviationByCode[first] || first
    return [mapped, ...parts.slice(1)].join('-')
  }

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

  const extractCourseFromGroupName = (groupName: string) => {
    const text = String(groupName || '').toUpperCase()
    if (text.includes('101') || text.includes('BEED')) return 101
    if (text.includes('102') || text.includes('ENGLISH')) return 102
    if (text.includes('103') || text.includes('MATH') || text.includes('MATHEMATICS')) return 103
    if (text.includes('201') || text.includes('BSBA') || text.includes('HRM')) return 201
    return undefined
  }

  const extractYearLevelFromGroupName = (groupName: string) => {
    const match = String(groupName || '').match(/(\d+)(?!.*\d)/)
    if (!match) return undefined
    const level = Number(match[1])
    return Number.isFinite(level) ? level : undefined
  }

  useEffect(() => {
    const fetchBlockGroups = async () => {
      try {
        const data = await authorizedFetch('/api/blocks/groups')
        setBlockGroups(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
      }
    }
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      setSectionStudents([])
      setSelectedSubjectIds([])
      setSubjects([])
      return
    }

    const fetchSections = async () => {
      try {
        const data = await authorizedFetch(`/api/blocks/groups/${selectedGroupId}/sections`)
        const nextSections = Array.isArray(data) ? data as BlockSection[] : []
        setSections(nextSections)
        if (selectedGroup) {
          setSemester(selectedGroup.semester)
          setSchoolYear(`${selectedGroup.year}-${selectedGroup.year + 1}`)
        }
        if (!nextSections.some((section) => section._id === selectedSectionId)) {
          setSelectedSectionId('')
          setSectionStudents([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sections')
      }
    }

    void fetchSections()
  }, [selectedGroupId, selectedSectionId, selectedGroup])

  useEffect(() => {
    if (!selectedSectionId) {
      setSectionStudents([])
      return
    }

    const fetchSectionStudents = async () => {
      try {
        const data = await authorizedFetch(`/api/blocks/sections/${selectedSectionId}/students`)
        setSectionStudents(Array.isArray(data?.students) ? data.students as SectionStudent[] : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch section students')
      }
    }

    void fetchSectionStudents()
  }, [selectedSectionId])

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const query = new URLSearchParams()
        if (selectedGroup) {
          const groupCourse = extractCourseFromGroupName(selectedGroup.name)
          const groupYearLevel = extractYearLevelFromGroupName(selectedGroup.name)
          if (groupCourse) query.set('course', String(groupCourse))
          if (groupYearLevel) query.set('yearLevel', String(groupYearLevel))
        }
        if (semester) query.set('semester', semester)
        const queryString = query.toString()
        const data = await authorizedFetch(`/api/registrar/subjects${queryString ? `?${queryString}` : ''}`)
        const nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
        setSubjects(nextSubjects)
        setSelectedSubjectIds((prev) => prev.filter((id) => nextSubjects.some((subject) => subject._id === id)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
      }
    }

    void fetchSubjects()
  }, [selectedGroup, semester])

  const handleCreateSubject = async () => {
    setError('')
    setSuccess('')

    if (!selectedGroupId || !selectedGroup) {
      setError('You cannot create a subject without selecting a block group.')
      return
    }

    const cleanedDrafts = subjectDrafts
      .map((draft) => ({
        code: String(draft.code || '').trim().toUpperCase(),
        title: String(draft.title || '').trim(),
        units: Number(draft.units)
      }))
      .filter((draft) => draft.code || draft.title || Number.isFinite(draft.units))

    if (cleanedDrafts.length === 0) {
      setError('Please add at least one subject')
      return
    }

    if (cleanedDrafts.some((draft) => !draft.code || !draft.title || !Number.isFinite(draft.units))) {
      setError('Each subject row must have code, title, and valid units')
      return
    }

    setCreatingSubject(true)
    try {
      const course = selectedGroup ? extractCourseFromGroupName(selectedGroup.name) : undefined
      const yearLevel = selectedGroup ? extractYearLevelFromGroupName(selectedGroup.name) : undefined
      const createdSubjects: SubjectItem[] = []
      const failedCodes: string[] = []

      for (const draft of cleanedDrafts) {
        try {
          const data = await authorizedFetch('/api/registrar/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: draft.code,
              title: draft.title,
              units: draft.units,
              course,
              yearLevel,
              semester
            })
          })
          const createdSubject = data?.data as SubjectItem | undefined
          if (createdSubject?._id) {
            createdSubjects.push(createdSubject)
          }
        } catch {
          failedCodes.push(draft.code)
        }
      }

      if (createdSubjects.length > 0) {
        setSubjects((prev) => {
          const next = [...prev, ...createdSubjects]
          const seen = new Set<string>()
          return next
            .filter((subject) => {
              if (seen.has(subject._id)) return false
              seen.add(subject._id)
              return true
            })
            .sort((a, b) => a.code.localeCompare(b.code))
        })
        setSelectedSubjectIds((prev) => {
          const next = new Set(prev)
          createdSubjects.forEach((subject) => next.add(subject._id))
          return Array.from(next)
        })
      }

      setSubjectDrafts([{ code: '', title: '', units: '3' }])

      if (createdSubjects.length > 0) {
        setSuccess(
          `Created ${createdSubjects.length} subject(s).${failedCodes.length > 0 ? ` Failed: ${failedCodes.join(', ')}` : ''}`
        )
      } else {
        setError(`No subjects were created.${failedCodes.length > 0 ? ` Failed: ${failedCodes.join(', ')}` : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject')
    } finally {
      setCreatingSubject(false)
    }
  }

  const updateSubjectDraft = (index: number, field: keyof SubjectDraft, value: string) => {
    setSubjectDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft))
    )
  }

  const addSubjectDraftRow = () => {
    setSubjectDrafts((prev) => [...prev, { code: '', title: '', units: '3' }])
  }

  const removeSubjectDraftRow = (index: number) => {
    setSubjectDrafts((prev) => {
      if (prev.length === 1) return [{ code: '', title: '', units: '3' }]
      return prev.filter((_, i) => i !== index)
    })
  }

  const toggleSubjectSelection = (subjectId: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    )
  }

  const beginEditSubject = (subject: SubjectItem) => {
    setEditingSubjectId(subject._id)
    setEditingSubjectCode(subject.code)
    setEditingSubjectTitle(subject.title)
    setEditingSubjectUnits(String(subject.units))
    setError('')
    setSuccess('')
  }

  const cancelEditSubject = () => {
    setEditingSubjectId('')
    setEditingSubjectCode('')
    setEditingSubjectTitle('')
    setEditingSubjectUnits('3')
  }

  const saveEditSubject = async () => {
    if (!editingSubjectId) return
    const code = editingSubjectCode.trim().toUpperCase()
    const title = editingSubjectTitle.trim()
    const units = Number(editingSubjectUnits)

    if (!code || !title || !Number.isFinite(units)) {
      setError('Code, title, and units are required for subject update')
      return
    }

    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${editingSubjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, title, units })
      })
      const updated = data?.data as SubjectItem | undefined
      if (updated?._id) {
        setSubjects((prev) => prev.map((subject) => (subject._id === updated._id ? updated : subject)))
      }
      setSuccess((data?.message as string) || 'Subject updated successfully')
      cancelEditSubject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subject')
    }
  }

  const handleDeleteSubject = async (subject: SubjectItem) => {
    const confirmed = window.confirm(`Delete subject "${subject.code} - ${subject.title}"?`)
    if (!confirmed) return

    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${subject._id}`, {
        method: 'DELETE'
      })
      setSubjects((prev) => prev.filter((item) => item._id !== subject._id))
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subject._id))
      if (editingSubjectId === subject._id) {
        cancelEditSubject()
      }
      setSuccess((data?.message as string) || 'Subject deleted successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject')
    }
  }

  const handleAssignSubjects = async () => {
    setError('')
    setSuccess('')

    if (!selectedGroupId) {
      setError('Please select a block group')
      return
    }
    if (!selectedSectionId) {
      setError('Please select a section')
      return
    }
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      setError('School year must follow YYYY-YYYY format')
      return
    }

    if (selectedSubjectIds.length === 0) {
      setError('Please select at least one subject')
      return
    }
    if (sectionStudents.length === 0) {
      setError('No students found in selected section')
      return
    }

    setLoading(true)
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      let assignedCount = 0
      const failedStudents: string[] = []

      for (const student of sectionStudents) {
        try {
          await fetch(`${API_URL}/registrar/students/${student._id}/enroll`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              schoolYear,
              semester,
              subjectIds: selectedSubjectIds
            })
          }).then(async (response) => {
            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error((data?.message as string) || `Request failed (${response.status})`)
            }
            return response.json()
          })
          assignedCount += 1
        } catch {
          const name = `${student.firstName} ${student.lastName}`.trim()
          failedStudents.push(name || student._id)
        }
      }

      if (assignedCount > 0) {
        setSuccess(`Subjects assigned to ${assignedCount} student(s).${failedStudents.length > 0 ? ` Failed: ${failedStudents.join(', ')}` : ''}`)
      } else {
        setError(`No students were assigned. Failed: ${failedStudents.join(', ')}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign subjects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="registrar-section assign-subject-page">
      <h2 className="registrar-section-title">Assign Subject</h2>
      <p className="registrar-section-desc">Assign subjects to students by block and semester.</p>

      {error && <p style={{ color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p style={{ color: '#16a34a', marginBottom: '0.75rem' }}>{success}</p>}

      <div className="assignment-section">
        <h3>Assign Subjects By Block</h3>
        <div className="assignment-form">
          <label>
            Block Group:
            <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
              <option value="">-- Select Block Group --</option>
              {blockGroups.map((group) => (
                <option key={group._id} value={group._id}>
                  {formatBlockLabel(group.name)} ({group.semester} {group.year})
                </option>
              ))}
            </select>
          </label>
          <label>
            Section:
            <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)}>
              <option value="">-- Select Section --</option>
              {sections.map((section) => (
                <option key={section._id} value={section._id}>
                  {section.sectionCode} ({section.currentPopulation}/{section.capacity})
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester:
            <select value={semester} onChange={(e) => setSemester(e.target.value as Semester)}>
              <option value="1st">1st</option>
              <option value="2nd">2nd</option>
              <option value="Summer">Summer</option>
            </select>
          </label>
          <label>
            School Year:
            <input
              type="text"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="YYYY-YYYY"
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Available Subjects:
            <div className="subject-table">
              <div className="subject-table-header">
                <span>Select</span>
                <span>Code</span>
                <span>Title</span>
                <span>Units</span>
                <span>Actions</span>
              </div>
              <div className="subject-table-body">
                {subjects.map((subject) => (
                  <div key={subject._id} className="subject-table-row">
                    <span className="subject-cell-select">
                      <input
                        type="checkbox"
                        checked={selectedSubjectIds.includes(subject._id)}
                        onChange={() => toggleSubjectSelection(subject._id)}
                      />
                    </span>
                    {editingSubjectId === subject._id ? (
                      <>
                        <span>
                          <input
                            type="text"
                            value={editingSubjectCode}
                            onChange={(e) => setEditingSubjectCode(e.target.value.toUpperCase())}
                            className="subject-inline-input"
                          />
                        </span>
                        <span>
                          <input
                            type="text"
                            value={editingSubjectTitle}
                            onChange={(e) => setEditingSubjectTitle(e.target.value)}
                            className="subject-inline-input"
                          />
                        </span>
                        <span>
                          <input
                            type="number"
                            min={0.5}
                            max={6}
                            step={0.5}
                            value={editingSubjectUnits}
                            onChange={(e) => setEditingSubjectUnits(e.target.value)}
                            className="subject-inline-input"
                          />
                        </span>
                        <span className="subject-cell-actions">
                          <button type="button" className="subject-action-btn save" onClick={saveEditSubject} title="Save">
                            <Check size={14} />
                            <span>Save</span>
                          </button>
                          <button type="button" className="subject-action-btn cancel" onClick={cancelEditSubject} title="Cancel">
                            <X size={14} />
                            <span>Cancel</span>
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span>{subject.code}</span>
                        <span>{subject.title}</span>
                        <span>{subject.units}</span>
                        <span className="subject-cell-actions">
                          <button type="button" className="subject-action-btn edit" onClick={() => beginEditSubject(subject)} title="Edit Subject">
                            <Pencil size={14} />
                            <span>Edit</span>
                          </button>
                          <button type="button" className="subject-action-btn delete" onClick={() => handleDeleteSubject(subject)} title="Delete Subject">
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {subjects.length === 0 && (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-muted)' }}>
                No subjects found for this block/semester yet. Create one below.
              </p>
            )}
          </label>
          <button className="registrar-btn" onClick={handleAssignSubjects} disabled={loading || !selectedSectionId}>
            {loading ? 'Assigning...' : 'Assign Subjects To Section'}
          </button>
        </div>

        <div className="sections-list" style={{ marginTop: '1rem' }}>
          <h3>Create Subject</h3>
          <div className="subject-create-list">
            <div className="subject-create-actions">
              <button className="registrar-btn" onClick={addSubjectDraftRow} disabled={!selectedGroupId} type="button">
                Add Another Subject
              </button>
              <button className="registrar-btn" onClick={handleCreateSubject} disabled={creatingSubject || !selectedGroupId} type="button">
                {creatingSubject ? 'Creating...' : `Create ${subjectDrafts.length} Subject${subjectDrafts.length > 1 ? 's' : ''}`}
              </button>
            </div>
            {subjectDrafts.map((draft, index) => (
              <div key={`subject-draft-${index}`} className="subject-create-row">
                <label>
                  Subject Code:
                  <input
                    type="text"
                    value={draft.code}
                    onChange={(e) => updateSubjectDraft(index, 'code', e.target.value.toUpperCase())}
                    placeholder="ENG101"
                    disabled={!selectedGroupId}
                  />
                </label>
                <label>
                  Subject Title:
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateSubjectDraft(index, 'title', e.target.value)}
                    placeholder="English Communication"
                    disabled={!selectedGroupId}
                  />
                </label>
                <label>
                  Units:
                  <input
                    type="number"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={draft.units}
                    onChange={(e) => updateSubjectDraft(index, 'units', e.target.value)}
                    disabled={!selectedGroupId}
                  />
                </label>
                <button
                  className="section-delete-btn"
                  onClick={() => removeSubjectDraftRow(index)}
                  disabled={!selectedGroupId}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {!selectedGroupId && (
            <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-muted)' }}>
              Select a block group first before creating a subject.
            </p>
          )}
        </div>

        <div className="sections-list" style={{ marginTop: '1rem' }}>
          <h3>Students In Selected Section</h3>
          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text-muted)' }}>
            Total Students: {sectionStudents.length}
          </p>
          <div className="student-list">
            <div className="student-list-header" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr' }}>
              <span>Name</span>
              <span>Student No.</span>
              <span>Year Level</span>
              <span>Status</span>
            </div>
            <div className="student-list-body">
              {sectionStudents.map((student) => (
                <div key={student._id} className="student-list-row" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr' }}>
                  <span className="student-list-name">
                    {`${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.suffix || ''}`.replace(/\s+/g, ' ').trim()}
                  </span>
                  <span className="student-list-meta">{student.studentNumber}</span>
                  <span className="student-list-meta">YL {student.yearLevel || 'N/A'}</span>
                  <span className="student-list-meta">{student.studentStatus || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>
          {selectedSectionId && sectionStudents.length === 0 && (
            <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)' }}>
              No students assigned to this section.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AssignSubjectPage

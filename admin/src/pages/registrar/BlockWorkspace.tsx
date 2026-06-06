import { useEffect, useState } from 'react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection, BlockStudent, SectionStudent, BlockWorkspaceSelection } from './registrarBlockTypes'

type BlockWorkspaceProps = {
  selection: BlockWorkspaceSelection | null
  onBack: () => void
}

function BlockWorkspace({ selection, onBack }: BlockWorkspaceProps) {
  const [group, setGroup] = useState<BlockGroup | null>(null)
  const [sections, setSections] = useState<BlockSection[]>([])
  const [students, setStudents] = useState<BlockStudent[]>([])
  const [sectionStudentsById, setSectionStudentsById] = useState<Record<string, SectionStudent[]>>({})
  const [sectionLoadingById, setSectionLoadingById] = useState<Record<string, boolean>>({})
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [targetSectionId, setTargetSectionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [unassigningStudentKey, setUnassigningStudentKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }

  const formatBlockLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return value
    const parts = text.split('-')
    if (parts.length === 0) return text
    const first = parts[0]
    const mapped = courseAbbreviationByCode[first] || first
    return [mapped, ...parts.slice(1)].join('-')
  }

  const parseBlockSlot = (value: string) => {
    const text = String(value || '').trim().toUpperCase()
    if (!text) return null

    const directMatch = text.match(/(?:^|-)(\d+)([A-Z])$/)
    if (directMatch) {
      return {
        yearLevel: Number(directMatch[1]) || 99,
        letter: directMatch[2]
      }
    }

    const dashedMatch = text.match(/(?:^|-)(\d+)-([A-Z])$/)
    if (dashedMatch) {
      return {
        yearLevel: Number(dashedMatch[1]) || 99,
        letter: dashedMatch[2]
      }
    }

    return null
  }

  const formatBlockColumnLabel = (value: string) => {
    const slot = parseBlockSlot(value)
    if (!slot) return formatBlockLabel(value)
    return `${slot.yearLevel}-${slot.letter}`
  }

  const compareBlockOrder = (a: string, b: string) => {
    const slotA = parseBlockSlot(a)
    const slotB = parseBlockSlot(b)

    if (slotA && slotB) {
      if (slotA.yearLevel !== slotB.yearLevel) {
        return slotA.yearLevel - slotB.yearLevel
      }
      return slotA.letter.localeCompare(slotB.letter)
    }

    if (slotA) return -1
    if (slotB) return 1
    return String(a || '').localeCompare(String(b || ''))
  }

  const courseCodeFromValue = (course?: number | string) => {
    if (course === null || course === undefined) return '000'

    const text = String(course).trim()
    if (!text) return '000'

    const numeric = Number(text)
    if (Number.isFinite(numeric)) return String(Math.trunc(numeric))

    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    if (normalized.includes('BEED')) return '101'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'

    return '000'
  }

  const formatCourseLabel = (course?: number | string) => {
    const code = courseCodeFromValue(course)
    return courseAbbreviationByCode[code] || String(course || 'N/A')
  }

  const formatStudentName = (student: BlockStudent) =>
    `${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.suffix || ''}`.replace(/\s+/g, ' ').trim()

  const formatStudentNumber = (student: BlockStudent) => {
    const raw = String(student.studentNumber || '').trim()
    const fallbackCourseCode = courseCodeFromValue(student.course)

    if (!raw) return `0000-${fallbackCourseCode}-00000`

    const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)
    const year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
    const seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'
    const seq = seqPart.slice(-5).padStart(5, '0')
    const courseCode = fallbackCourseCode !== '000'
      ? fallbackCourseCode
      : courseCodeFromValue(parts.find((part) => /[A-Za-z]/.test(part)))

    return `${year}-${courseCode}-${seq}`
  }

  const formatAssignedAt = (value?: string | null) => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString()
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

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      const nextSections = Array.isArray(data) ? data as BlockSection[] : []
      setSections(nextSections)
      setError('')
      return nextSections
    } catch (err) {
      setSections([])
      setError(err instanceof Error ? err.message : 'Failed to fetch block sections')
      return [] as BlockSection[]
    }
  }

  const fetchAssignableStudents = async (workspaceGroup: BlockGroup, q = '') => {
    try {
      const encodedQ = encodeURIComponent(q)
      const encodedGroupId = encodeURIComponent(workspaceGroup._id)
      const data = await authorizedFetch(`/api/blocks/assignable-students?semester=${workspaceGroup.semester}&year=${workspaceGroup.year}&q=${encodedQ}&groupId=${encodedGroupId}`)
      const nextStudents = Array.isArray(data) ? data as BlockStudent[] : []
      setStudents(nextStudents)
      setSelectedStudents((prev) => prev.filter((id) => nextStudents.some((student) => student._id === id)))
      setError('')
      return nextStudents
    } catch (err) {
      setStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch assignable students')
      return [] as BlockStudent[]
    }
  }

  const fetchSectionStudents = async (sectionId: string) => {
    setSectionLoadingById((prev) => ({ ...prev, [sectionId]: true }))
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students`)
      const nextStudents = Array.isArray(data?.students) ? data.students as SectionStudent[] : []
      setSectionStudentsById((prev) => ({ ...prev, [sectionId]: nextStudents }))
      if (data?.section?._id) {
        const sectionData = data.section as { _id: string; currentPopulation?: number }
        setSections((prev) =>
          prev.map((section) =>
            section._id === sectionData._id
              ? { ...section, currentPopulation: Number(sectionData.currentPopulation) || 0 }
              : section
          )
        )
      }
      setError('')
    } catch (err) {
      setSectionStudentsById((prev) => ({ ...prev, [sectionId]: [] }))
      setError(err instanceof Error ? err.message : 'Failed to fetch section students')
    } finally {
      setSectionLoadingById((prev) => ({ ...prev, [sectionId]: false }))
    }
  }

  const refreshSectionStudents = async (nextSections: BlockSection[]) => {
    await Promise.all(nextSections.map((section) => fetchSectionStudents(section._id)))
  }

  useEffect(() => {
    if (!selection) {
      setGroup(null)
      setSections([])
      setStudents([])
      setSectionStudentsById({})
      setSectionLoadingById({})
      setTargetSectionId('')
      setSelectedStudents([])
      return
    }

    const workspaceGroup: BlockGroup = {
      _id: selection.groupId,
      name: selection.groupName,
      semester: selection.semester,
      year: Number(selection.year)
    }

    setGroup(workspaceGroup)
    setStudentSearch('')
    setSelectedStudents([])
    setError('')
    setSuccess('')

    const loadWorkspace = async () => {
      setLoading(true)
      const nextSections = await fetchSections(workspaceGroup._id)
      await fetchAssignableStudents(workspaceGroup, '')
      await refreshSectionStudents(nextSections)

      const nextOpenSections = nextSections.filter((section) => (section.status || 'OPEN').toUpperCase() === 'OPEN')
      const preferredSectionId = nextOpenSections.find((section) => section._id === selection.initialSectionId)?._id
        || nextOpenSections[0]?._id
        || nextSections[0]?._id
        || ''
      setTargetSectionId(preferredSectionId)
      setLoading(false)
    }

    void loadWorkspace()
  }, [selection?.groupId, selection?.groupName, selection?.semester, selection?.year, selection?.initialSectionId])

  const sortedSections = [...sections].sort((a, b) => compareBlockOrder(a.sectionCode, b.sectionCode))
  const openSections = sortedSections.filter((section) => (section.status || 'OPEN').toUpperCase() === 'OPEN')
  const targetSections = openSections.length > 0 ? openSections : sortedSections
  const selectedTargetSection = sortedSections.find((section) => section._id === targetSectionId) || null
  const isTargetSectionOpen = (selectedTargetSection?.status || 'OPEN').toUpperCase() === 'OPEN'

  useEffect(() => {
    if (targetSections.length === 0) {
      if (targetSectionId) setTargetSectionId('')
      return
    }

    const stillExists = targetSections.some((section) => section._id === targetSectionId)
    if (!stillExists) {
      setTargetSectionId(targetSections[0]._id)
    }
  }, [targetSectionId, targetSections])

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    )
  }

  const handleSearchStudents = async () => {
    if (!group) return
    setLoading(true)
    await fetchAssignableStudents(group, studentSearch)
    setLoading(false)
  }

  const handleRefreshWorkspace = async () => {
    if (!group) return
    setLoading(true)
    const nextSections = await fetchSections(group._id)
    await fetchAssignableStudents(group, studentSearch)
    await refreshSectionStudents(nextSections)
    setLoading(false)
  }

  const handleAssignStudents = async () => {
    if (!group || selectedStudents.length === 0 || !targetSectionId) {
      setError('Select students and target section before assigning.')
      return
    }
    if (!isTargetSectionOpen) {
      setError('Assignments are allowed only for OPEN sections.')
      return
    }

    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const overcapacityStudents: string[] = []
      let assignedCount = 0

      for (const studentId of selectedStudents) {
        const data = await authorizedFetch('/api/blocks/assign-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            sectionId: targetSectionId,
            semester: group.semester,
            year: group.year
          })
        })

        if (data?.status === 'OVER_CAPACITY') {
          const student = students.find((item) => item._id === studentId)
          overcapacityStudents.push(student ? formatStudentName(student) : studentId)
          continue
        }

        assignedCount += 1
      }

      const notices: string[] = []
      if (assignedCount > 0) notices.push(`${assignedCount} student(s) assigned successfully`)
      if (overcapacityStudents.length > 0) notices.push(`Overcapacity: ${overcapacityStudents.join(', ')}`)

      if (assignedCount > 0) {
        setSuccess(notices.join('. '))
      } else {
        setError(notices.join('. ') || 'No students were assigned.')
      }

      setSelectedStudents([])

      const nextSections = await fetchSections(group._id)
      await fetchAssignableStudents(group, studentSearch)
      await refreshSectionStudents(nextSections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign students')
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassignStudent = async (sectionId: string, student: SectionStudent) => {
    if (!group) return
    const sectionCode = sections.find((section) => section._id === sectionId)?.sectionCode || 'this section'
    const confirmed = window.confirm(`Unassign ${formatStudentName(student)} from ${sectionCode}?`)
    if (!confirmed) return

    setUnassigningStudentKey(`${sectionId}:${student._id}`)
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students/${student._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semester: group.semester,
          year: group.year
        })
      })

      setSuccess((data?.message as string) || 'Student unassigned from section successfully')

      const nextSections = await fetchSections(group._id)
      await fetchAssignableStudents(group, studentSearch)
      await refreshSectionStudents(nextSections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign student')
    } finally {
      setUnassigningStudentKey('')
    }
  }

  if (!group) {
    return (
      <div className="registrar-section">
        <div className="block-workspace-shell">
          <button type="button" className="registrar-btn registrar-btn-secondary" onClick={onBack}>
            Back to View Blocks
          </button>
          <h2 className="registrar-section-title">Block Assignment Workspace</h2>
          <p className="registrar-section-desc">Select a block from View Blocks first, then open the workspace.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="registrar-section">
      <div className="block-workspace-shell">
        <div className="block-workspace-header">
          <button type="button" className="registrar-btn registrar-btn-secondary" onClick={onBack}>
            Back to View Blocks
          </button>
          <button type="button" className="registrar-btn registrar-btn-secondary" onClick={() => void handleRefreshWorkspace()} disabled={loading || assigning}>
            {loading ? 'Refreshing...' : 'Refresh Workspace'}
          </button>
        </div>

        <div className="block-workspace-hero">
          <div className="block-workspace-hero-badge">Active Block Workspace</div>
          <h2>{formatBlockLabel(group.name)}</h2>
          <p>{group.semester} {group.year}</p>
          <div className="block-workspace-meta">
            <span>{sortedSections.length} section(s)</span>
            <span>{openSections.length} open</span>
            <span>{students.length} assignable student(s)</span>
          </div>
        </div>

        {error && <p className="registrar-feedback registrar-feedback-error">{error}</p>}
        {success && <p className="registrar-feedback registrar-feedback-success">{success}</p>}

        <div className="assignment-section">
          <h3>Step 3: Assign Students</h3>
          <p className="assignment-help-text">Search and select students, then assign them to the target section.</p>
          <div className="assignment-form">
            <label>
              Search Student
              <input
                type="text"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearchStudents()
                  }
                }}
                placeholder="Name or student number"
              />
            </label>

            <label>
              Target Section
              <select value={targetSectionId} onChange={(event) => setTargetSectionId(event.target.value)} disabled={targetSections.length === 0}>
                <option value="">{targetSections.length > 0 ? 'Choose section' : 'No sections available'}</option>
                {targetSections.map((section) => (
                  <option key={section._id} value={section._id}>
                    {`${formatBlockColumnLabel(section.sectionCode)} (${section.currentPopulation}/${section.capacity})`}
                  </option>
                ))}
              </select>
            </label>

            <button type="button" className="registrar-btn" onClick={() => void handleSearchStudents()} disabled={loading || assigning}>
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              className="registrar-btn"
              onClick={() => void handleAssignStudents()}
              disabled={assigning || selectedStudents.length === 0 || !targetSectionId || !isTargetSectionOpen}
            >
              {assigning ? 'Assigning...' : `Assign Selected (${selectedStudents.length})`}
            </button>
          </div>

          {!isTargetSectionOpen && selectedTargetSection && (
            <p className="assignment-inline-note">Target section is CLOSED. Select an OPEN section to assign students.</p>
          )}

          <p className="assignment-inline-note">Selected students: {selectedStudents.length}</p>
          <div className="block-student-detail-table">
            <div className="block-student-detail-header">
              <span>Name</span>
              <span>Student No.</span>
              <span>Course</span>
              <span>Year</span>
              <span>Status</span>
              <span>Adviser</span>
              <span className="block-student-detail-action-head">Action</span>
            </div>
            <div className="block-student-detail-body">
              {students.map((student) => {
                const selected = selectedStudents.includes(student._id)
                return (
                  <div key={student._id} className="block-student-detail-row">
                    <span className="block-student-detail-name">{formatStudentName(student)}</span>
                    <span>{formatStudentNumber(student)}</span>
                    <span>{formatCourseLabel(student.course)}</span>
                    <span>{student.yearLevel || 'N/A'}</span>
                    <span>{student.studentStatus || 'N/A'}</span>
                    <span>{(student as SectionStudent).assignedProfessor || 'Unassigned'}</span>
                    <span className="block-student-detail-action-cell">
                      <button
                        type="button"
                        className={`student-add-btn ${selected ? 'selected' : ''}`}
                        onClick={() => toggleStudentSelection(student._id)}
                        aria-label={selected ? `Remove ${formatStudentName(student)}` : `Add ${formatStudentName(student)}`}
                      >
                        {selected ? '-' : '+'}
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          {students.length === 0 && (
            <p className="block-student-empty">No assignable students found for this block.</p>
          )}
        </div>

        <div className="assignment-section">
          <h3>Step 4: Block Details</h3>
          <p className="assignment-help-text">Assigned students are shown directly below each section.</p>
          {sortedSections.length === 0 ? (
            <p className="block-student-empty">No sections found for this block yet.</p>
          ) : (
            <div className="block-workspace-sections">
              {sortedSections.map((section) => {
                const studentsInSection = sectionStudentsById[section._id] || []
                const sectionLoading = Boolean(sectionLoadingById[section._id])
                return (
                  <div key={section._id} className="section-students-panel">
                    <h4>{formatBlockColumnLabel(section.sectionCode)}</h4>
                    <p className="section-students-summary">
                      Capacity: {section.currentPopulation}/{section.capacity} | Status: {section.status}
                    </p>

                    {sectionLoading ? (
                      <p className="section-students-empty">Loading students...</p>
                    ) : studentsInSection.length === 0 ? (
                      <p className="section-students-empty">No assigned students in this section yet.</p>
                    ) : (
                      <div className="block-student-detail-table">
                        <div className="block-student-detail-header">
                          <span>Name</span>
                          <span>Student No.</span>
                          <span>Course</span>
                          <span>Year</span>
                          <span>Status</span>
                          <span>Assigned At</span>
                          <span className="block-student-detail-action-head">Action</span>
                        </div>
                        <div className="block-student-detail-body">
                          {studentsInSection.map((student) => {
                            const unassignKey = `${section._id}:${student._id}`
                            const isUnassigning = unassigningStudentKey === unassignKey
                            return (
                              <div key={student._id} className="block-student-detail-row">
                                <span className="block-student-detail-name">{formatStudentName(student)}</span>
                                <span>{formatStudentNumber(student)}</span>
                                <span>{formatCourseLabel(student.course)}</span>
                                <span>{student.yearLevel || 'N/A'}</span>
                                <span>{student.studentStatus || 'N/A'}</span>
                                <span>{formatAssignedAt(student.assignedAt)}</span>
                                <span className="block-student-detail-action-cell">
                                  <button
                                    type="button"
                                    className="section-unassign-btn"
                                    onClick={() => void handleUnassignStudent(section._id, student)}
                                    disabled={Boolean(unassigningStudentKey)}
                                  >
                                    {isUnassigning ? 'Unassigning...' : 'Unassign'}
                                  </button>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BlockWorkspace

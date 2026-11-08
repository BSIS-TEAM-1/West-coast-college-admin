import { useEffect, useMemo, useState } from 'react'
import { Archive, Check, CheckCheck, Eye, Filter, Layers, RefreshCw, Users } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import { formatBlockDisplay, formatStudentNumber as formatStudentNumberShared, schoolYearStartYear } from '../lib/blockAssignmentShared'
import './CorGeneration.css'

type CourseCode = '101' | '102' | '103' | '201'

type BlockGroupResponse = {
  _id: string
  name: string
  semester?: string
  /** The API returns the school-year string ("2026-2027"), not a number. */
  year?: number | string
  schoolYear?: string
  status?: string
  isArchived?: boolean
}

type BlockSectionResponse = {
  _id: string
  blockGroupId: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status?: string
  isArchived?: boolean
}

type CorSection = BlockSectionResponse & {
  groupName: string
  semester: string
  year: number
  courseCode: string
  schoolYear?: string
  isArchived: boolean
}

type SectionStudent = {
  _id: string
  studentNumber: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  course?: string | number
  corStatus?: 'Pending' | 'Received' | 'Verified'
}

const COURSE_LABELS: Record<CourseCode, string> = {
  '101': 'BEED',
  '102': 'BSEd-English',
  '103': 'BSEd-Math',
  '201': 'BSBA-HRM'
}

function extractCourseCode(value: string): string {
  const text = String(value || '').toUpperCase().trim()
  const codeMatch = text.match(/(?:^|[^0-9])(101|102|103|201)(?:[^0-9]|$)/)
  if (codeMatch) return codeMatch[1]
  if (text.includes('BEED')) return '101'
  if (text.includes('BSED') && text.includes('ENGLISH')) return '102'
  if (text.includes('BSED') && (text.includes('MATH') || text.includes('MATHEMATICS'))) return '103'
  if (text.includes('BSBA') && text.includes('HRM')) return '201'
  return ''
}

function getCourseLabel(code: string | number): string {
  const text = String(code || '').trim()
  if (!text) return 'N/A'
  const normalized = extractCourseCode(text) || text
  return (COURSE_LABELS as Record<string, string>)[normalized] || normalized
}

function formatStudentNumber(student: SectionStudent): string {
  return formatStudentNumberShared(student.studentNumber, student.course)
}

function formatStudentName(student: SectionStudent): string {
  return [
    student.lastName,
    student.firstName,
    student.middleName,
    student.suffix
  ]
    .filter(Boolean)
    .join(', ')
    .replace(', ,', ',')
    .trim()
}

export default function CorGeneration() {
  const [sections, setSections] = useState<CorSection[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('all')
  const [blockStatusFilter, setBlockStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [students, setStudents] = useState<SectionStudent[]>([])
  const [viewedStudentIds, setViewedStudentIds] = useState<Set<string>>(new Set())
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<string>('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const pendingStudents = useMemo(
    () => students.filter((s) => s.corStatus !== 'Verified'),
    [students]
  )
  const verifiedCount = students.length - pendingStudents.length

  const courseOptions = useMemo(() => {
    const unique = Array.from(new Set(sections.map((section) => section.courseCode).filter(Boolean)))
    unique.sort((a, b) => a.localeCompare(b))
    return unique.map((code) => ({
      code,
      label: getCourseLabel(code)
    }))
  }, [sections])

  const courseFilteredSections = useMemo(() => {
    return selectedCourse === 'all'
      ? sections
      : sections.filter((section) => section.courseCode === selectedCourse)
  }, [sections, selectedCourse])

  const blockCounts = useMemo(() => {
    const active = courseFilteredSections.filter((section) => !section.isArchived).length
    const archived = courseFilteredSections.filter((section) => section.isArchived).length
    return {
      active,
      archived,
      total: courseFilteredSections.length
    }
  }, [courseFilteredSections])

  const filteredSections = useMemo(() => {
    let list = courseFilteredSections
    if (blockStatusFilter === 'active') {
      list = list.filter((section) => !section.isArchived)
    } else if (blockStatusFilter === 'archived') {
      list = list.filter((section) => section.isArchived)
    }
    return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
  }, [courseFilteredSections, blockStatusFilter])

  const activeFilteredSections = useMemo(
    () => filteredSections.filter((section) => !section.isArchived),
    [filteredSections]
  )

  const archivedFilteredSections = useMemo(
    () => filteredSections.filter((section) => section.isArchived),
    [filteredSections]
  )

  const selectedSection = useMemo(
    () => sections.find((section) => section._id === selectedSectionId) || null,
    [sections, selectedSectionId]
  )

  useEffect(() => {
    void fetchBlocks()
  }, [])

  useEffect(() => {
    if (!selectedSectionId) return
    const stillVisible = filteredSections.some((section) => section._id === selectedSectionId)
    if (!stillVisible) {
      setSelectedSectionId('')
      setStudents([])
      setViewedStudentIds(new Set())
    setSelectedStudentIds(new Set())
    }
  }, [filteredSections, selectedSectionId])

  const fetchBlocks = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }

      const groupsResponse = await fetch(`${API_URL}/api/blocks/groups`, { headers })
      if (!groupsResponse.ok) {
        throw new Error(`Failed to load block groups (${groupsResponse.status})`)
      }

      const groupsPayload = await groupsResponse.json()
      const groups: BlockGroupResponse[] = Array.isArray(groupsPayload) ? groupsPayload : []

      const sectionsPerGroup = await Promise.all(
        groups.map(async (group) => {
          try {
            const sectionsResponse = await fetch(`${API_URL}/api/blocks/groups/${group._id}/sections`, { headers })
            if (!sectionsResponse.ok) return [] as CorSection[]
            const sectionsPayload = await sectionsResponse.json()
            const rawSections: BlockSectionResponse[] = Array.isArray(sectionsPayload) ? sectionsPayload : []
            const schoolYearStr = String(group.schoolYear || group.year || '').trim()
            const isGroupArchived =
              String(group.status || '').toLowerCase() === 'archived' ||
              Boolean(group.isArchived)

            return rawSections.map((section) => {
              const isArchived =
                isGroupArchived ||
                String(section.status || '').toUpperCase() === 'ARCHIVED' ||
                Boolean(section.isArchived)

              return {
                ...section,
                groupName: String(group.name || ''),
                semester: String(group.semester || ''),
                schoolYear: schoolYearStr,
                // `group.year` is the school-year string ("2026-2027"); Number()
                // was NaN and silently fell back to the current year.
                year: schoolYearStartYear(schoolYearStr) || new Date().getFullYear(),
                courseCode: extractCourseCode(`${group.name} ${section.sectionCode}`),
                isArchived
              }
            })
          } catch {
            return [] as CorSection[]
          }
        })
      )

      const mergedSections = sectionsPerGroup
        .flat()
        .sort((a, b) => `${a.courseCode}-${a.sectionCode}`.localeCompare(`${b.courseCode}-${b.sectionCode}`))

      const activeCount = mergedSections.filter((section) => !section.isArchived).length
      const archivedCount = mergedSections.filter((section) => section.isArchived).length

      setSections(mergedSections)
      setNotice(
        `Loaded ${activeCount} active block(s)${archivedCount > 0 ? ` and ${archivedCount} archived block(s)` : ''} for COR review.`
      )

      if (selectedSectionId && !mergedSections.some((section) => section._id === selectedSectionId)) {
        setSelectedSectionId('')
        setStudents([])
        setViewedStudentIds(new Set())
    setSelectedStudentIds(new Set())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocks')
      setSections([])
      setStudents([])
      setSelectedSectionId('')
      setViewedStudentIds(new Set())
    setSelectedStudentIds(new Set())
    } finally {
      setLoading(false)
    }
  }

  const loadStudentsForSection = async (sectionId: string) => {
    setSelectedSectionId(sectionId)
    setStudentsLoading(true)
    setError('')
    setNotice('')
    setViewedStudentIds(new Set())
    setSelectedStudentIds(new Set())
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await fetch(`${API_URL}/api/blocks/sections/${sectionId}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error(`Failed to load students (${response.status})`)
      }

      const data = await response.json()
      const nextStudents: SectionStudent[] = Array.isArray(data?.students) ? data.students : []
      setStudents(nextStudents)
      setNotice(`Loaded ${nextStudents.length} student(s) in selected block.`)
    } catch (err) {
      setStudents([])
      setError(err instanceof Error ? err.message : 'Failed to load students')
    } finally {
      setStudentsLoading(false)
    }
  }

  const handleViewCor = async (student: SectionStudent) => {
    setActiveAction(`view-${student._id}`)
    setError('')
    setNotice('')
    let targetWindow: Window | null = null
    try {
      targetWindow = window.open('about:blank', '_blank')
      if (targetWindow) {
        targetWindow.document.write('<html><head><title>Certificate of Registration</title></head><body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #334155;"><div style="text-align: center;"><div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">Generating Certificate of Registration...</div><div style="font-size: 0.875rem; color: #64748b;">Loading COR for review.</div></div></body></html>')
      }
    } catch {}

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const queryParams = new URLSearchParams()
      if (selectedSection?.schoolYear) queryParams.set('schoolYear', selectedSection.schoolYear)
      if (selectedSection?.semester) queryParams.set('semester', selectedSection.semester)
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

      const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/cor${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        let message = 'Failed to generate COR'
        try {
          const data = await response.json()
          if (data?.message) message = data.message
        } catch {
          // No JSON payload
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      if (targetWindow && !targetWindow.closed) {
        targetWindow.location.href = url
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `COR-${formatStudentNumber(student)}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }

      setViewedStudentIds((prev) => {
        const next = new Set(prev)
        next.add(student._id)
        return next
      })

      setNotice(`COR opened for ${formatStudentNumber(student)}. Review it, then approve if correct.`)
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (err) {
      if (targetWindow && !targetWindow.closed) targetWindow.close()
      setError(err instanceof Error ? err.message : 'Failed to view COR')
    } finally {
      setActiveAction('')
    }
  }

  const handleApproveCor = async (student: SectionStudent) => {
    if (student.corStatus === 'Verified') {
      setNotice('COR is already approved.')
      setError('')
      return
    }

    setActiveAction(`approve-${student._id}`)
    setError('')
    setNotice('')
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await fetch(`${API_URL}/api/registrar/students/${student._id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ corStatus: 'Verified' })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((data?.message as string) || 'Failed to approve COR')
      }

      setStudents((prev) =>
        prev.map((item) => (item._id === student._id ? { ...item, corStatus: 'Verified' } : item))
      )
      setSelectedStudentIds((prev) => {
        const next = new Set(prev)
        next.delete(student._id)
        return next
      })
      setNotice(`COR approved for ${formatStudentNumber(student)}. Status is now returned to registrar as Verified.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve COR')
    } finally {
      setActiveAction('')
    }
  }

  const handleBulkVerify = async (targetStudentIds?: string[]) => {
    const idsToVerify = targetStudentIds || (
      selectedStudentIds.size > 0
        ? Array.from(selectedStudentIds)
        : pendingStudents.map((s) => s._id)
    )

    if (idsToVerify.length === 0) {
      setError('No pending students to verify.')
      return
    }

    setActiveAction('bulk-verify')
    setError('')
    setNotice('')
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await fetch(`${API_URL}/api/registrar/students/bulk-verify-cor`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ studentIds: idsToVerify })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to bulk verify CORs')
      }

      const verifiedSet = new Set(data?.verifiedIds || idsToVerify)
      setStudents((prev) =>
        prev.map((item) => (verifiedSet.has(item._id) ? { ...item, corStatus: 'Verified' } : item))
      )
      setSelectedStudentIds(new Set())
      setNotice(data?.message || `Successfully verified ${verifiedSet.size} COR(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk verify CORs')
    } finally {
      setActiveAction('')
    }
  }

  const renderBlockCard = (section: CorSection) => (
    <button
      key={section._id}
      type="button"
      className={`cor-block-card ${selectedSectionId === section._id ? 'active' : ''} ${section.isArchived ? 'cor-block-card--archived' : ''}`}
      onClick={() => void loadStudentsForSection(section._id)}
    >
      <div className="cor-block-card-head">
        <span className="block-code">{formatBlockDisplay(section.sectionCode)}</span>
        <div className="block-status-cluster">
          {section.isArchived && (
            <span className="block-status archived" title="Archived / Historical Block">
              <Archive size={11} /> Archived
            </span>
          )}
          <span className={`block-status ${String(section.status || 'OPEN').toLowerCase()}`}>
            {section.status || 'OPEN'}
          </span>
        </div>
      </div>
      <div className="cor-block-course">{getCourseLabel(section.courseCode)}</div>
      <div className="cor-block-group">{section.groupName || 'Block Group'}</div>
      <div className="cor-block-meta">
        <span><Users size={12} /> {section.currentPopulation}/{section.capacity}</span>
        <span>{section.semester} {section.year}</span>
      </div>
    </button>
  )

  return (
    <div className="cor-generation-page">
      <div className="cor-generation-header">
        <button className="cor-refresh-btn" style={{ marginLeft: 'auto' }} onClick={() => void fetchBlocks()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="cor-filter-bar">
        <div className="cor-filter-group">
          <div className="cor-filter-title">
            <Layers size={14} />
            <span>Block Status</span>
          </div>
          <div className="cor-status-tabs">
            <button
              type="button"
              className={`cor-status-tab ${blockStatusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setBlockStatusFilter('active')}
            >
              <span>Active Blocks</span>
              <span className="cor-status-tab-badge">{blockCounts.active}</span>
            </button>
            <button
              type="button"
              className={`cor-status-tab ${blockStatusFilter === 'archived' ? 'active' : ''}`}
              onClick={() => setBlockStatusFilter('archived')}
            >
              <Archive size={13} />
              <span>Archived Blocks</span>
              <span className="cor-status-tab-badge">{blockCounts.archived}</span>
            </button>
            <button
              type="button"
              className={`cor-status-tab ${blockStatusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setBlockStatusFilter('all')}
            >
              <span>All Blocks</span>
              <span className="cor-status-tab-badge">{blockCounts.total}</span>
            </button>
          </div>
        </div>

        <div className="cor-filter-group">
          <div className="cor-filter-title">
            <Filter size={14} />
            <span>Programs</span>
          </div>
          <div className="cor-course-chips">
            <button
              type="button"
              className={`cor-chip ${selectedCourse === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCourse('all')}
            >
              All Programs
            </button>
            {courseOptions.map((course) => (
              <button
                key={course.code}
                type="button"
                className={`cor-chip ${selectedCourse === course.code ? 'active' : ''}`}
                onClick={() => setSelectedCourse(course.code)}
              >
                {course.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="cor-status error">{error}</p>}
      {!error && notice && <p className="cor-status info">{notice}</p>}

      <div className="cor-layout">
        <section className="cor-blocks-panel">
          <div className="cor-panel-title">
            <Layers size={16} />
            <h3>
              {blockStatusFilter === 'active'
                ? 'Active Blocks'
                : blockStatusFilter === 'archived'
                ? 'Archived Blocks'
                : 'All Blocks'}
            </h3>
            <span className="cor-panel-count">({filteredSections.length})</span>
          </div>

          {filteredSections.length === 0 ? (
            <div className="cor-empty-state">
              {blockStatusFilter === 'active'
                ? 'No active blocks found for this program.'
                : blockStatusFilter === 'archived'
                ? 'No archived blocks found for this program.'
                : 'No blocks found for this program.'}
            </div>
          ) : blockStatusFilter === 'all' ? (
            <div className="cor-blocks-grouped">
              <div className="cor-blocks-subgroup">
                <div className="cor-subgroup-header">
                  <span className="cor-subgroup-title">Active Blocks ({activeFilteredSections.length})</span>
                </div>
                {activeFilteredSections.length === 0 ? (
                  <div className="cor-empty-state-sub">No active blocks</div>
                ) : (
                  <div className="cor-block-grid">
                    {activeFilteredSections.map(renderBlockCard)}
                  </div>
                )}
              </div>

              <div className="cor-blocks-subgroup archived">
                <div className="cor-subgroup-header">
                  <Archive size={14} />
                  <span className="cor-subgroup-title">Archived Blocks ({archivedFilteredSections.length})</span>
                </div>
                {archivedFilteredSections.length === 0 ? (
                  <div className="cor-empty-state-sub">No archived blocks</div>
                ) : (
                  <div className="cor-block-grid">
                    {archivedFilteredSections.map(renderBlockCard)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="cor-block-grid">
                {filteredSections.map(renderBlockCard)}
              </div>
              {blockStatusFilter === 'active' && blockCounts.archived > 0 && (
                <div className="cor-block-archive-hint">
                  <Archive size={13} />
                  <span>{blockCounts.archived} archived (old) block(s) separated.</span>
                  <button type="button" className="cor-link-btn" onClick={() => setBlockStatusFilter('archived')}>
                    View archived
                  </button>
                </div>
              )}
              {blockStatusFilter === 'archived' && blockCounts.active > 0 && (
                <div className="cor-block-archive-hint">
                  <span>Viewing historical archived blocks.</span>
                  <button type="button" className="cor-link-btn" onClick={() => setBlockStatusFilter('active')}>
                    Back to active blocks
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="cor-students-panel">
          <div className="cor-panel-title cor-panel-title--with-actions">
            <div className="cor-panel-title-left">
              <Users size={16} />
              <h3>Students {selectedSection ? `- ${formatBlockDisplay(selectedSection.sectionCode)}` : ''}</h3>
              {students.length > 0 && (
                <div className="cor-status-breakdown">
                  <span className="cor-status-tag total">{students.length} Total</span>
                  <span className="cor-status-tag pending">{pendingStudents.length} Pending</span>
                  <span className="cor-status-tag verified">{verifiedCount} Verified</span>
                </div>
              )}
            </div>

            {selectedSection && students.length > 0 && pendingStudents.length > 0 && (
              <div className="cor-panel-title-actions">
                {selectedStudentIds.size > 0 && (
                  <button
                    type="button"
                    className="cor-bulk-verify-btn selected"
                    onClick={() => void handleBulkVerify()}
                    disabled={Boolean(activeAction)}
                  >
                    <CheckCheck size={14} />
                    {activeAction === 'bulk-verify' ? 'Verifying...' : `Verify Selected (${selectedStudentIds.size})`}
                  </button>
                )}
                <button
                  type="button"
                  className="cor-bulk-verify-btn all"
                  onClick={() => void handleBulkVerify(pendingStudents.map((s) => s._id))}
                  disabled={Boolean(activeAction)}
                  title="Verify all pending students in this section at once"
                >
                  <CheckCheck size={14} />
                  {activeAction === 'bulk-verify' ? 'Verifying...' : `Verify All in Section (${pendingStudents.length})`}
                </button>
              </div>
            )}
          </div>

          {selectedSection?.isArchived && (
            <div className="cor-archived-banner">
              <Archive size={16} />
              <div>
                <strong>Archived Block ({selectedSection.sectionCode})</strong>
                <p>This block is archived and belongs to historical academic records. COR documents can still be viewed.</p>
              </div>
            </div>
          )}

          {!selectedSectionId ? (
            <div className="cor-empty-state">Select a block card to load students.</div>
          ) : studentsLoading ? (
            <div className="cor-empty-state">Loading students...</div>
          ) : students.length === 0 ? (
            <div className="cor-empty-state">No students in this block yet.</div>
          ) : (
            <div className="cor-students-table-wrap">
              <table className="cor-students-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={pendingStudents.length > 0 && pendingStudents.every((s) => selectedStudentIds.has(s._id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIds(new Set(pendingStudents.map((s) => s._id)))
                          } else {
                            setSelectedStudentIds(new Set())
                          }
                        }}
                        disabled={pendingStudents.length === 0 || Boolean(activeAction)}
                        title="Select all pending students"
                      />
                    </th>
                    <th>Student</th>
                    <th>Program</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const viewAction = `view-${student._id}`
                    const approveAction = `approve-${student._id}`
                    const isViewing = activeAction === viewAction
                    const isApproving = activeAction === approveAction
                    const alreadyApproved = student.corStatus === 'Verified'
                    const canApprove = !alreadyApproved && !activeAction

                    return (
                      <tr key={student._id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student._id)}
                            onChange={() => {
                              setSelectedStudentIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(student._id)) {
                                  next.delete(student._id)
                                } else {
                                  next.add(student._id)
                                }
                                return next
                              })
                            }}
                            disabled={alreadyApproved || Boolean(activeAction)}
                          />
                        </td>
                        <td>
                          <div className="cor-student-name">{formatStudentName(student)}</div>
                          <div className="cor-student-number">{formatStudentNumber(student)}</div>
                        </td>
                        <td>{getCourseLabel(student.course || '')}</td>
                        <td>
                          <div className="cor-actions">
                            <button
                              type="button"
                              className="cor-action-btn view"
                              onClick={() => void handleViewCor(student)}
                              disabled={Boolean(activeAction) && !isViewing}
                            >
                              <Eye size={14} />
                              {isViewing ? 'Opening...' : 'View COR'}
                            </button>
                            <button
                              type="button"
                              className="cor-action-btn approve"
                              onClick={() => void handleApproveCor(student)}
                              disabled={!canApprove && !isApproving}
                            >
                              <Check size={14} />
                              {alreadyApproved ? 'Approved' : isApproving ? 'Approving...' : 'Approve'}
                            </button>
                          </div>
                          <div className="cor-row-status">
                            <span className={`cor-pill ${String(student.corStatus || 'Pending').toLowerCase()}`}>
                              {student.corStatus || 'Pending'}
                            </span>
                            {viewedStudentIds.has(student._id) && (
                              <span className="cor-pill" style={{ borderColor: 'rgba(100, 116, 139, 0.4)', color: 'var(--text-secondary)' }} title="COR previewed in this session">
                                Previewed
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

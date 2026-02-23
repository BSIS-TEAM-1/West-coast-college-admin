import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, Filter, Layers, RefreshCw, Users } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import './CorGeneration.css'

type CourseCode = '101' | '102' | '103' | '201'

type BlockGroupResponse = {
  _id: string
  name: string
  semester?: string
  year?: number
}

type BlockSectionResponse = {
  _id: string
  blockGroupId: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status?: string
}

type CorSection = BlockSectionResponse & {
  groupName: string
  semester: string
  year: number
  courseCode: string
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

function getCourseCode(value: string | number): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d+$/.test(text)) return text

  const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
  if (normalized.includes('BEED')) return '101'
  if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
  if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
  if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'
  return ''
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
  const raw = String(student.studentNumber || '').trim()
  const fallbackCourseCode = getCourseCode(student.course ?? '')

  if (!raw) return fallbackCourseCode ? `0000-${fallbackCourseCode}-00000` : 'N/A'

  const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)
  const year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
  const seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'
  const seq = seqPart.slice(-5).padStart(5, '0')
  const codeFromRaw = getCourseCode(parts.find((part) => /[A-Za-z]/.test(part)) || parts[1] || '')
  const courseCode = fallbackCourseCode || codeFromRaw || '000'

  return `${year}-${courseCode}-${seq}`
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
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [students, setStudents] = useState<SectionStudent[]>([])
  const [viewedStudentIds, setViewedStudentIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<string>('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const courseOptions = useMemo(() => {
    const unique = Array.from(new Set(sections.map((section) => section.courseCode).filter(Boolean)))
    unique.sort((a, b) => a.localeCompare(b))
    return unique.map((code) => ({
      code,
      label: getCourseLabel(code)
    }))
  }, [sections])

  const filteredSections = useMemo(() => {
    const next = selectedCourse === 'all'
      ? sections
      : sections.filter((section) => section.courseCode === selectedCourse)
    return [...next].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
  }, [sections, selectedCourse])

  const selectedSection = useMemo(
    () => filteredSections.find((section) => section._id === selectedSectionId) || null,
    [filteredSections, selectedSectionId]
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
            return rawSections.map((section) => ({
              ...section,
              groupName: String(group.name || ''),
              semester: String(group.semester || ''),
              year: Number(group.year) || new Date().getFullYear(),
              courseCode: extractCourseCode(`${group.name} ${section.sectionCode}`)
            }))
          } catch {
            return [] as CorSection[]
          }
        })
      )

      const mergedSections = sectionsPerGroup
        .flat()
        .sort((a, b) => `${a.courseCode}-${a.sectionCode}`.localeCompare(`${b.courseCode}-${b.sectionCode}`))

      setSections(mergedSections)
      setNotice(`Loaded ${mergedSections.length} block(s) for COR review.`)

      if (selectedSectionId && !mergedSections.some((section) => section._id === selectedSectionId)) {
        setSelectedSectionId('')
        setStudents([])
        setViewedStudentIds(new Set())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocks')
      setSections([])
      setStudents([])
      setSelectedSectionId('')
      setViewedStudentIds(new Set())
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
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/cor`, {
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
      window.open(url, '_blank', 'noopener')

      setViewedStudentIds((prev) => {
        const next = new Set(prev)
        next.add(student._id)
        return next
      })

      setNotice(`COR opened for ${formatStudentNumber(student)}. Review it, then approve if correct.`)
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to view COR')
    } finally {
      setActiveAction('')
    }
  }

  const handleApproveCor = async (student: SectionStudent) => {
    if (!viewedStudentIds.has(student._id)) {
      setError('Please view the COR first before approving.')
      setNotice('')
      return
    }

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
      setNotice(`COR approved for ${formatStudentNumber(student)}. Status is now returned to registrar as Verified.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve COR')
    } finally {
      setActiveAction('')
    }
  }

  return (
    <div className="cor-generation-page">
      <div className="cor-generation-header">
        <div>
          <h2>COR Generation</h2>
          <p>Filter by course, choose a block card, view each COR, then approve it for registrar workflow.</p>
        </div>
        <button className="cor-refresh-btn" onClick={() => void fetchBlocks()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="cor-filter-bar">
        <div className="cor-filter-title">
          <Filter size={14} />
          <span>Courses</span>
        </div>
        <div className="cor-course-chips">
          <button
            type="button"
            className={`cor-chip ${selectedCourse === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCourse('all')}
          >
            All Courses
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

      {error && <p className="cor-status error">{error}</p>}
      {!error && notice && <p className="cor-status info">{notice}</p>}

      <div className="cor-layout">
        <section className="cor-blocks-panel">
          <div className="cor-panel-title">
            <Layers size={16} />
            <h3>Blocks</h3>
          </div>

          {filteredSections.length === 0 ? (
            <div className="cor-empty-state">No blocks found for this course.</div>
          ) : (
            <div className="cor-block-grid">
              {filteredSections.map((section) => (
                <button
                  key={section._id}
                  type="button"
                  className={`cor-block-card ${selectedSectionId === section._id ? 'active' : ''}`}
                  onClick={() => void loadStudentsForSection(section._id)}
                >
                  <div className="cor-block-card-head">
                    <span className="block-code">{section.sectionCode}</span>
                    <span className={`block-status ${String(section.status || 'OPEN').toLowerCase()}`}>
                      {section.status || 'OPEN'}
                    </span>
                  </div>
                  <div className="cor-block-course">{getCourseLabel(section.courseCode)}</div>
                  <div className="cor-block-group">{section.groupName || 'Block Group'}</div>
                  <div className="cor-block-meta">
                    <span><Users size={12} /> {section.currentPopulation}/{section.capacity}</span>
                    <span>{section.semester} {section.year}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="cor-students-panel">
          <div className="cor-panel-title">
            <Users size={16} />
            <h3>Students {selectedSection ? `- ${selectedSection.sectionCode}` : ''}</h3>
          </div>

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
                    <th>Student</th>
                    <th>Course</th>
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
                    const canApprove = viewedStudentIds.has(student._id) && !alreadyApproved && !activeAction

                    return (
                      <tr key={student._id}>
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
                          </div>
                          {!alreadyApproved && !viewedStudentIds.has(student._id) && (
                            <div className="cor-approve-hint">View first before approving</div>
                          )}
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

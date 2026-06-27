import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import type { BlockGroup, BlockSection, Semester, SubjectItem } from './registrarBlockTypes'

type BlockSubjectAssignment = {
  _id?: string
  subject: SubjectItem
  blockSection: BlockSection
  semester: Semester
  academicYear: string
  assignedAt: string
  canRemove?: boolean
}

type SectionSubjectAssignmentSummary = {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  studentCount?: number
}

type WizardStep = 1 | 2 | 3

const courseOptions = [
  { value: '101', label: 'BEED' },
  { value: '102', label: 'BSEd-English' },
  { value: '103', label: 'BSEd-Math' },
  { value: '201', label: 'BSBA-HRM' }
]

const courseLabel = (value: string) => courseOptions.find((option) => option.value === value)?.label || 'Select program'

const parseAcademicYearStart = (value: string) => {
  const match = String(value || '').trim().match(/^(\d{4})-\d{4}$/)
  return match ? Number(match[1]) : null
}

const getBlockGroupCourse = (groupName: string) => {
  const normalized = String(groupName || '').trim().toUpperCase()
  const firstPart = normalized.split('-')[0]
  const matchedCourse = courseOptions.find((option) => (
    option.value === firstPart
    || option.label.toUpperCase() === firstPart
    || normalized.startsWith(`${option.label.toUpperCase()}-`)
  ))
  return matchedCourse?.value || ''
}

const getBlockGroupYearLevel = (groupName: string) => {
  const normalized = String(groupName || '').trim().toUpperCase()
  const numericPrefixMatch = normalized.match(/^\d{3}-(\d+)/)
  if (numericPrefixMatch) return numericPrefixMatch[1]

  const labeledPrefixMatch = normalized.match(/^[A-Z]+(?:-[A-Z]+)?\s*-\s*(\d+)/)
  if (labeledPrefixMatch) return labeledPrefixMatch[1]

  return ''
}

const describeHttpError = (status: number, path: string, data: any) => {
  const serverMessage = String(data?.error || data?.message || '').trim()
  if (serverMessage) return serverMessage

  const isSubjectAssignmentPath = path.includes('/block-subject-assignments')
  const isSectionAssignmentsPath = path.includes('/subject-assignments')
  const isBlocksPath = path.includes('/api/blocks/')
  const isSubjectsPath = path.includes('/api/registrar/subjects')

  if (status === 400) return 'The assignment request has invalid or incomplete details. Please review the selected block, section, term, and subjects.'
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'Your account does not have permission to assign subjects.'
  if (status === 404) {
    if (isSubjectAssignmentPath) return 'The subject-assignment endpoint was not found on the running server. Please restart the backend or update the server routes.'
    if (isSectionAssignmentsPath) return 'The selected section or its subject-assignment record was not found.'
    if (isBlocksPath) return 'The selected block group or block section was not found.'
    if (isSubjectsPath) return 'The subject catalog endpoint was not found.'
    return 'The requested registrar resource was not found.'
  }
  if (status === 409) return 'One or more selected subjects are already assigned to this block section.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'The server hit an error while assigning subjects. Please check the server logs and try again.'

  return `Request failed (${status})`
}

function AssignSubjectPage() {
  const currentYear = new Date().getFullYear()
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [academicYear, setAcademicYear] = useState(`${currentYear}-${currentYear + 1}`)
  const [semester, setSemester] = useState<Semester>('1st')
  const [course, setCourse] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [sections, setSections] = useState<BlockSection[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [assignments, setAssignments] = useState<BlockSubjectAssignment[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const academicYearStart = parseAcademicYearStart(academicYear)
  const filteredBlockGroups = useMemo(() => (
    blockGroups.filter((group) => {
      if (course && getBlockGroupCourse(group.name) !== course) return false
      if (yearLevel && getBlockGroupYearLevel(group.name) !== yearLevel) return false
      if (semester && group.semester !== semester) return false
      if (academicYearStart && Number(group.year) !== academicYearStart) return false
      return true
    })
  ), [blockGroups, course, yearLevel, semester, academicYearStart])
  const selectedSubjects = subjects.filter((subject) => selectedSubjectIds.includes(subject._id))
  const assignedSubjectIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.subject?._id).filter(Boolean)),
    [assignments]
  )
  const availableSubjects = subjects.filter((subject) => !assignedSubjectIds.has(subject._id))

  const authorizedFetch = async (path: string | string[], init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const paths = Array.isArray(path) ? path : [path]
    let lastResponseStatus = 0
    let lastData: any = {}

    for (const currentPath of paths) {
      const response = await fetch(`${API_URL}${currentPath}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${token}`
        }
      })
      const responseText = await response.text().catch(() => '')
      const data = responseText ? (() => {
        try {
          return JSON.parse(responseText)
        } catch {
          return { message: responseText }
        }
      })() : {}
      if (response.ok) return data

      lastResponseStatus = response.status
      lastData = { ...data, path: currentPath }
      const hasServerMessage = Boolean(data?.error || data?.message)
      if (response.status !== 404 || hasServerMessage) break
    }

    const details = Array.isArray(lastData?.details) ? ` ${lastData.details.join(' ')}` : ''
    throw new Error(`${describeHttpError(lastResponseStatus, String(lastData?.path || paths[paths.length - 1] || ''), lastData)}${details}`)
  }

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const data = await authorizedFetch('/api/blocks/groups')
        setBlockGroups(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
      }
    }
    void fetchGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      return
    }

    const fetchSections = async () => {
      try {
        const data = await authorizedFetch(`/api/blocks/groups/${selectedGroupId}/sections`)
        const nextSections = Array.isArray(data) ? data as BlockSection[] : []
        setSections(nextSections)
        if (!nextSections.some((section) => section._id === selectedSectionId)) {
          setSelectedSectionId('')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sections')
      }
    }
    void fetchSections()
  }, [selectedGroupId])

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!course || !yearLevel || !semester) {
        setSubjects([])
        setSelectedSubjectIds([])
        return
      }

      try {
        const query = new URLSearchParams({
          course,
          yearLevel,
          semester
        })
        const data = await authorizedFetch(`/api/registrar/subjects?${query.toString()}`)
        const nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
        setSubjects(nextSubjects.filter((subject) => subject.isActive !== false))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
      }
    }
    void fetchSubjects()
  }, [course, yearLevel, semester])

  useEffect(() => {
    if (!selectedGroupId) return
    if (filteredBlockGroups.some((group) => group._id === selectedGroupId)) return

    setSelectedGroupId('')
    setSections([])
    setSelectedSectionId('')
    setAssignments([])
    setSelectedSubjectIds([])
  }, [filteredBlockGroups, selectedGroupId])

  const fetchAssignments = async () => {
    if (!selectedSectionId || !academicYear || !semester) {
      setAssignments([])
      return
    }

    setLoading(true)
    try {
      const query = new URLSearchParams({
        schoolYear: academicYear,
        semester
      })
      const data = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignments?${query.toString()}`)
      const summaries = Array.isArray(data?.data?.assignments) ? data.data.assignments as SectionSubjectAssignmentSummary[] : []
      const nextAssignments = summaries.map((assignment) => ({
        _id: `section-${assignment.subjectId || assignment.subjectCode}`,
        subject: {
          _id: assignment.subjectId,
          code: assignment.subjectCode,
          title: assignment.subjectTitle,
          units: 0
        },
        blockSection: selectedSection as BlockSection,
        semester,
        academicYear,
        assignedAt: '',
        canRemove: false
      }))
      const nextAssignedIds = new Set(nextAssignments.map((assignment) => assignment.subject?._id).filter(Boolean))
      setAssignments(nextAssignments)
      setSelectedSubjectIds((prev) => prev.filter((id) => !nextAssignedIds.has(id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch assigned subjects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAssignments()
  }, [selectedSectionId, academicYear, semester])

  const validateTarget = () => {
    if (!academicYear.match(/^\d{4}-\d{4}$/)) return 'Academic year must follow YYYY-YYYY format'
    if (!course) return 'Please select a program'
    if (!yearLevel) return 'Please select a year level'
    if (!selectedGroupId) return 'Please select a block group'
    if (!selectedSectionId) return 'Please select a block section'
    return ''
  }

  const handleNext = () => {
    const validationMessage = validateTarget()
    setError(validationMessage)
    setSuccess('')
    if (validationMessage) return
    setWizardStep(2)
  }

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    )
  }

  const handleAssignSelected = async () => {
    setError('')
    setSuccess('')

    const validationMessage = validateTarget()
    if (validationMessage) {
      setError(validationMessage)
      setWizardStep(1)
      return
    }
    if (selectedSubjectIds.length === 0) {
      setError('Please select at least one subject')
      return
    }

    setSaving(true)
    try {
      const data = await authorizedFetch(['/api/registrar/block-subject-assignments', '/registrar/block-subject-assignments'], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockSectionId: selectedSectionId,
          subjectIds: selectedSubjectIds,
          semester,
          academicYear
        })
      })
      const nextAssignments = Array.isArray(data?.data) ? data.data as BlockSubjectAssignment[] : []
      setAssignments(nextAssignments.map((assignment) => ({ ...assignment, canRemove: true })))
      setSelectedSubjectIds([])
      setSuccess((data?.message as string) || 'Selected subjects assigned successfully')
      setWizardStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign selected subjects')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveAssignment = async (assignment: BlockSubjectAssignment) => {
    if (!assignment._id || assignment.canRemove === false) {
      setError('This subject is already reflected in section enrollments and cannot be removed from this list.')
      return
    }

    const subjectLabel = assignment.subject ? `${assignment.subject.code} - ${assignment.subject.title}` : 'this subject'
    const confirmed = window.confirm(`Remove ${subjectLabel} from ${selectedSection?.sectionCode || 'this block section'}?`)
    if (!confirmed) return

    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch([
        `/api/registrar/block-subject-assignments/${assignment._id}`,
        `/registrar/block-subject-assignments/${assignment._id}`
      ], {
        method: 'DELETE'
      })
      setAssignments((prev) => prev.filter((item) => item._id !== assignment._id))
      setSuccess((data?.message as string) || 'Subject assignment removed successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove subject assignment')
    }
  }

  const resetTarget = () => {
    setWizardStep(1)
    setSelectedSubjectIds([])
    setSuccess('')
    setError('')
  }

  return (
    <div className="registrar-section assign-subject-page">
      <h2 className="registrar-section-title">Subject Assignment</h2>
      <p className="registrar-section-desc">Link existing subjects to one block section for the selected academic term.</p>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}
      {success && <p className="registrar-alert registrar-alert-success">{success}</p>}

      <div className="sis-wizard-shell">
        <section className="sis-wizard-card">
          <div className="block-wizard-stepper" aria-label="Subject assignment progress">
            {[
              { step: 1, title: 'Select Block' },
              { step: 2, title: 'Choose Subjects' },
              { step: 3, title: 'Finish' }
            ].map((item) => (
              <div
                key={item.step}
                className={`block-wizard-step ${wizardStep === item.step ? 'is-active' : ''} ${wizardStep > item.step ? 'is-complete' : ''}`}
              >
                <span className="block-wizard-step-number">{wizardStep > item.step ? <CheckCircle size={16} /> : item.step}</span>
                <span>
                  <small>Step {item.step}</small>
                  <strong>{item.title}</strong>
                </span>
              </div>
            ))}
          </div>

          {wizardStep === 1 && (
            <div className="sis-wizard-panel">
              <div className="block-wizard-panel-head">
                <h3>Select Block Section</h3>
              </div>
              <div className="sis-wizard-grid">
                <div className="block-wizard-fields subject-wizard-fields">
                  <label>
                    <span>Academic Year</span>
                    <input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="YYYY-YYYY" />
                  </label>
                  <label>
                    <span>Semester</span>
                    <select value={semester} onChange={(event) => setSemester(event.target.value as Semester)}>
                      <option value="1st">1st</option>
                      <option value="2nd">2nd</option>
                      <option value="Summer">Summer</option>
                    </select>
                  </label>
                  <label>
                    <span>Program/Course</span>
                    <select value={course} onChange={(event) => setCourse(event.target.value)}>
                      <option value="">Select program</option>
                      {courseOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Year Level</span>
                    <select value={yearLevel} onChange={(event) => setYearLevel(event.target.value)}>
                      <option value="">Select year level</option>
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Block Group</span>
                    <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={!course || !yearLevel || !academicYearStart}>
                      <option value="">{course && yearLevel ? 'Select matching block group' : 'Select program and year first'}</option>
                      {filteredBlockGroups.map((group) => (
                        <option key={group._id} value={group._id}>{group.name} ({group.semester} {group.year})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Block Section</span>
                    <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={!selectedGroupId}>
                      <option value="">Select section</option>
                      {sections.map((section) => (
                        <option key={section._id} value={section._id}>
                          {section.sectionCode} ({section.currentPopulation}/{section.capacity})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="block-wizard-preview">
                  <span className="block-wizard-preview-label">Selection Preview</span>
                  <strong>{selectedSection?.sectionCode || 'No section selected'}</strong>
                  <dl>
                    <div><dt>Program</dt><dd>{courseLabel(course)}</dd></div>
                    <div><dt>Year Level</dt><dd>{yearLevel || 'Select year'}</dd></div>
                    <div><dt>Term</dt><dd>{semester} / {academicYear}</dd></div>
                    <div><dt>Block Group</dt><dd>{selectedGroup?.name || 'Select group'}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="block-wizard-actions">
                <span />
                <button className="registrar-btn" type="button" onClick={handleNext}>
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="sis-wizard-panel">
              <div className="block-wizard-panel-head">
                <h3>Choose Subjects</h3>
              </div>

              <div className="assignment-wizard-grid">
                <section className="assignment-section assignment-wizard-list">
                  <div className="assignment-panel-head">
                    <div>
                      <h3>Available Subjects</h3>
                      <p>{selectedSubjectIds.length} selected for {selectedSection?.sectionCode}</p>
                    </div>
                    <span className="assignment-count-pill">{availableSubjects.length} available</span>
                  </div>

                  <div className="subject-table">
                    <div className="subject-table-header subject-table-header-assign">
                      <span>Select</span>
                      <span>Code</span>
                      <span>Title</span>
                      <span>Units</span>
                    </div>
                    <div className="subject-table-body">
                      {availableSubjects.map((subject) => (
                        <label key={subject._id} className="subject-table-row subject-table-row-assign">
                          <span className="subject-cell-select">
                            <input
                              type="checkbox"
                              checked={selectedSubjectIds.includes(subject._id)}
                              onChange={() => toggleSubject(subject._id)}
                            />
                          </span>
                          <span>{subject.code}</span>
                          <span>{subject.title}</span>
                          <span>{subject.units}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {availableSubjects.length === 0 && (
                    <p className="assignment-empty-copy">
                      {course && yearLevel ? 'No unassigned subjects match this term and program.' : 'Select program and year level to show available subjects.'}
                    </p>
                  )}
                </section>

                <section className="assignment-section assignment-wizard-summary">
                  <div className="assignment-panel-head">
                    <div>
                      <h3>Assignment Summary</h3>
                      <p>{loading ? 'Loading assigned subjects...' : `${assignments.length} already assigned`}</p>
                    </div>
                  </div>

                  <div className="block-wizard-review assignment-review-card">
                    <div><span>Block Section</span><strong>{selectedSection?.sectionCode || 'N/A'}</strong></div>
                    <div><span>Term</span><strong>{semester} / {academicYear}</strong></div>
                    <div><span>New Subjects</span><strong>{selectedSubjects.length}</strong></div>
                  </div>

                  <div className="assigned-subject-list">
                    {assignments.map((assignment) => (
                      <article key={assignment._id || assignment.subject?._id} className="assigned-subject-item">
                        <div>
                          <strong>{assignment.subject?.code || 'N/A'}</strong>
                          <span>{assignment.subject?.title || 'Subject unavailable'}</span>
                          <small>{assignment.subject?.units ? `${assignment.subject.units} units` : 'Already assigned'}</small>
                        </div>
                        {assignment.canRemove !== false && (
                          <button className="section-delete-btn" type="button" onClick={() => void handleRemoveAssignment(assignment)}>
                            <Trash2 size={14} />
                            Remove
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  {assignments.length === 0 && (
                    <p className="assignment-empty-copy">No subjects assigned to this block section for the selected term.</p>
                  )}
                </section>
              </div>

              <div className="block-wizard-actions">
                <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => setWizardStep(1)}>
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button className="registrar-btn" onClick={handleAssignSelected} disabled={saving || selectedSubjectIds.length === 0 || !selectedSectionId}>
                  {saving ? 'Assigning...' : 'Assign Selected Subjects'}
                </button>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="block-wizard-panel block-wizard-success">
              <CheckCircle size={52} />
              <h3>Subjects Assigned Successfully</h3>
              <p>The selected subjects have been linked to {selectedSection?.sectionCode || 'the block section'}.</p>
              <div className="block-wizard-success-actions">
                <button className="registrar-btn" type="button" onClick={() => setWizardStep(2)}>
                  Assign More Subjects
                </button>
                <button className="registrar-btn registrar-btn-secondary" type="button" onClick={resetTarget}>
                  <RotateCcw size={16} />
                  Choose Another Block
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AssignSubjectPage

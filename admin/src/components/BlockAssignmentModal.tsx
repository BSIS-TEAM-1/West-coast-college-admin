import { useEffect, useMemo, useState } from 'react'
import { X, Users, Blocks, Check, AlertCircle, ArrowRight } from 'lucide-react'
import { getStoredToken } from '../lib/authApi'
import StudentService from '../lib/studentApi'
import type { StudentData } from '../lib/studentApi'
import {
  authorizedFetch,
  blockCourseMatchesStudent,
  formatBlockColumnLabel,
  formatBlockLabel,
  getBlockGroupCompatibilityMeta,
  getSharedAcademicContext,
  schoolYearFromStartYear,
  schoolYearStart,
  studentDisplayName,
  studentNumberDisplay,
  type BlockGroup,
  type BlockSection
} from '../lib/blockAssignmentShared'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'

export default function BlockAssignmentModal({
  students,
  onClose,
  onSaved,
  initialStep = 1
}: {
  students: StudentData[]
  onClose: () => void
  onSaved: (message: string) => Promise<void> | void
  initialStep?: 1 | 2
}) {
  const academicContext = useMemo(() => getSharedAcademicContext(students), [students])
  const [groups, setGroups] = useState<BlockGroup[]>([])
  const [sectionsByGroupId, setSectionsByGroupId] = useState<Record<string, BlockSection[]>>({})
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(initialStep)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError('')

      try {
        const fetchedGroups = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
        // eslint-disable-next-line no-console
        console.log('[BlockAssignmentModal] fetchedGroups.length =', fetchedGroups.length, 'academicContext =', JSON.stringify(academicContext))
        const compatibleGroups = fetchedGroups.filter((group) => {
          const meta = getBlockGroupCompatibilityMeta(group)
          const matchesCourse = blockCourseMatchesStudent(meta.course, academicContext.sharedCourse)
          const matchesYear = !academicContext.sharedYearLevel || !meta.yearLevel || meta.yearLevel === academicContext.sharedYearLevel
          const matchesSemester = !academicContext.sharedSemester || !meta.semester || meta.semester === academicContext.sharedSemester
          const matchesSchoolYear = !academicContext.sharedSchoolYear || !meta.schoolYear || meta.schoolYear === academicContext.sharedSchoolYear
          // eslint-disable-next-line no-console
          console.log('[BlockAssignmentModal] group check', JSON.stringify({
            groupId: group._id,
            groupName: group.name,
            groupRaw: { courseId: group.courseId, courseCode: group.courseCode, yearLevel: group.yearLevel, semester: group.semester, schoolYear: group.schoolYear, year: group.year },
            meta,
            matchesCourse,
            matchesYear,
            matchesSemester,
            matchesSchoolYear
          }, null, 2))
          return matchesCourse && matchesYear && matchesSemester && matchesSchoolYear
        })

        const sectionResponses = await Promise.all(
          compatibleGroups.map(async (group) => {
            try {
              const sections = await authorizedFetch<BlockSection[]>(`/api/blocks/groups/${group._id}/sections`)
              return [group._id, sections] as const
            } catch {
              return [group._id, []] as const
            }
          })
        )

        if (cancelled) return

        const sectionLookup = Object.fromEntries(sectionResponses)
        setGroups(compatibleGroups)
        setSectionsByGroupId(sectionLookup)

        const firstGroupId = compatibleGroups[0]?._id || ''
        setSelectedGroupId(firstGroupId)
        setSelectedSectionId(sectionLookup[firstGroupId]?.[0]?._id || '')
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load block groups')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [academicContext.sharedCourse, academicContext.sharedYearLevel])

  useEffect(() => {
    if (!selectedGroupId) return
    const sections = sectionsByGroupId[selectedGroupId] || []
    if (!sections.some((section) => section._id === selectedSectionId)) {
      setSelectedSectionId(sections[0]?._id || '')
    }
  }, [sectionsByGroupId, selectedGroupId, selectedSectionId])

  const availableSections = sectionsByGroupId[selectedGroupId] || []
  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = availableSections.find((section) => section._id === selectedSectionId) || null
  const currentSections = new Map(
    Object.values(sectionsByGroupId)
      .flat()
      .map((section) => [String(section.sectionCode || '').trim().toUpperCase(), section])
  )
  const blockWizardSteps = [
    { step: 1, label: 'Students', icon: Users, description: 'Review selected batch' },
    { step: 2, label: 'Block', icon: Blocks, description: 'Choose group & section' },
    { step: 3, label: 'Review', icon: Check, description: 'Confirm assignment' }
  ]
  const canContinueFromBlock = Boolean(selectedGroupId && selectedSectionId)
  const primaryActionLabel =
    currentStep === 1
      ? 'Continue'
      : currentStep === 2
        ? 'Review assignment'
        : submitting
          ? 'Assigning...'
          : 'Assign block'

  const handlePrimaryAction = () => {
    if (currentStep === 1) {
      setCurrentStep(2)
      return
    }

    if (currentStep === 2 && canContinueFromBlock) {
      setCurrentStep(3)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGroup || !selectedSectionId) return

    setSubmitting(true)
    setError('')

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const targetSchoolYear = selectedGroup.schoolYear || schoolYearFromStartYear(selectedGroup.year)
      const targetSection = availableSections.find((section) => section._id === selectedSectionId)
      if (!targetSection) throw new Error('Select a valid section before assigning students.')

      let assignedCount = 0
      const failures: string[] = []

      for (const student of students) {
        try {
          const currentSectionCode = String(student.section || '').trim().toUpperCase()
          const currentSection = currentSections.get(currentSectionCode)

          if (currentSection && currentSection._id !== targetSection._id) {
            try {
              await authorizedFetch(`/api/blocks/sections/${currentSection._id}/students/${student._id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  semester: student.semester,
                  year: schoolYearStart(student.schoolYear)
                })
              })
            } catch (unassignError) {
              const message = unassignError instanceof Error ? unassignError.message : 'Failed to remove current block'
              if (!message.toLowerCase().includes('not assigned')) {
                throw unassignError
              }
            }
          }

          if (!currentSection || currentSection._id !== targetSection._id) {
            const assignmentResponse = await authorizedFetch<{ status?: string }>(
              '/api/blocks/assign-student',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: student._id,
                  sectionId: targetSection._id,
                  semester: selectedGroup.semester,
                  year: selectedGroup.year
                })
              }
            )

            if (assignmentResponse.status === 'OVER_CAPACITY') {
              throw new Error(`${targetSection.sectionCode} is already at capacity.`)
            }
          }

          await StudentService.updateStudent(token, student._id, {
            semester: selectedGroup.semester,
            schoolYear: targetSchoolYear
          })
          assignedCount += 1
        } catch (studentError) {
          failures.push(`${studentNumberDisplay(student)}: ${studentError instanceof Error ? studentError.message : 'Failed'}`)
        }
      }

      await onSaved(
        failures.length
          ? `Block assignment finished for ${assignedCount} student(s). ${failures.length} record(s) need attention.`
          : `Assigned ${assignedCount} student(s) to ${targetSection.sectionCode}.`
      )
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to assign block')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
      <div className="student-workspace__modal-overlay" aria-hidden="true" />
      <div className="student-workspace__modal student-workspace__modal--wide">
        <header className="student-workspace__modal-header">
          <div>
            <span className="student-workspace__eyebrow">Block assignment</span>
            <h2>Assign {students.length === 1 ? studentDisplayName(students[0]) : `${students.length} selected students`}</h2>
            <p className="student-workspace__modal-subcopy">
              Pick a compatible block group and section. Changing an existing block will clear the current linked block load before the new assignment is applied.
            </p>
          </div>
          <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="student-workspace__form" onSubmit={handleSubmit}>
          <div className="student-workspace__modal-body">
          <ol className="student-workspace__block-wizard-steps" aria-label="Block assignment steps">
            {blockWizardSteps.map((item) => {
              const StepIcon = item.icon
              const isActive = item.step === currentStep
              const isDone = item.step < currentStep
              const isPending = !isActive && !isDone
              return (
                <li
                  key={item.step}
                  className={[
                    'student-workspace__block-wizard-step',
                    isActive ? 'student-workspace__block-wizard-step--active' : '',
                    isDone ? 'student-workspace__block-wizard-step--done' : '',
                    isPending ? 'student-workspace__block-wizard-step--pending' : ''
                  ].filter(Boolean).join(' ')}
                >
                  <div className="student-workspace__block-wizard-step-icon">
                    <StepIcon size={16} aria-hidden="true" />
                  </div>
                  <div className="student-workspace__block-wizard-step-text">
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </div>
                </li>
              )
            })}
          </ol>

          {currentStep === 1 ? (
            <section className="student-workspace__form-section student-workspace__block-wizard-panel">
              <div className="student-workspace__section-heading">
                <div>
                  <h3>Selected students</h3>
                  <p>Review the student batch before choosing a block section.</p>
                </div>
                <span className="student-workspace__batch-count">{students.length} student{students.length === 1 ? '' : 's'}</span>
              </div>
              <div className="student-workspace__student-list">
                {students.map((student) => (
                  <div key={student._id} className="student-workspace__student-list-row">
                    <span className="student-workspace__student-list-number">{studentNumberDisplay(student)}</span>
                    <span className="student-workspace__student-list-name">{studentDisplayName(student)}</span>
                    <span className="student-workspace__student-list-block">{student.section || 'No block'}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {currentStep === 2 ? (
            <>
              <div className="student-workspace__form-grid student-workspace__form-grid--two student-workspace__form-grid--selects">
                <label className="student-workspace__field-card">
                  <span className="student-workspace__field-card-label">Block Group</span>
                  <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={loading || !groups.length}>
                    {groups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {formatBlockLabel(group.name)} · {group.semester} · {group.schoolYear || schoolYearFromStartYear(group.year)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="student-workspace__field-card">
                  <span className="student-workspace__field-card-label">Section</span>
                  <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={loading || !availableSections.length}>
                    {availableSections.map((section) => (
                      <option key={section._id} value={section._id}>
                        {formatBlockColumnLabel(section.sectionCode)} · {section.currentPopulation}/{section.capacity}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {loading ? (
                <div className="student-workspace__empty-state student-workspace__empty-state--inline">Loading block groups...</div>
              ) : null}

              {!loading && !groups.length ? (
                <div className="student-workspace__state-card student-workspace__state-card--error">
                  <AlertCircle size={28} aria-hidden="true" />
                  <div>
                    <strong>No compatible block groups</strong>
                    <p>No block groups match the selected students' course, year level, semester, and school year.</p>
                  </div>
                </div>
              ) : null}

              {!loading && availableSections.length ? (
                <section className="student-workspace__form-section">
                  <div className="student-workspace__section-heading">
                    <div>
                      <h3>Available sections</h3>
                      <p>Choose the section that should own the selected students.</p>
                    </div>
                  </div>
                  <div className="student-workspace__section-cards">
                    {availableSections.map((section) => {
                      const selected = section._id === selectedSectionId
                      const fillPercent = Math.round((section.currentPopulation / section.capacity) * 100)
                      return (
                        <button
                          key={section._id}
                          type="button"
                          className={`student-workspace__section-card ${selected ? 'student-workspace__section-card--selected' : ''}`}
                          onClick={() => setSelectedSectionId(section._id)}
                        >
                          <div className="student-workspace__section-card-main">
                            <div className="student-workspace__section-card-code">{formatBlockColumnLabel(section.sectionCode)}</div>
                            <div className="student-workspace__section-card-group">{selectedGroup ? formatBlockLabel(selectedGroup.name) : 'Selected block group'}</div>
                          </div>
                          <div className="student-workspace__section-card-meta">
                            <span className="student-workspace__section-card-count">{section.currentPopulation}/{section.capacity}</span>
                            <div className="student-workspace__section-card-bar" aria-hidden="true">
                              <div className="student-workspace__section-card-bar-fill" style={{ width: `${fillPercent}%` }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {currentStep === 3 ? (
            <section className="student-workspace__form-section student-workspace__block-wizard-panel">
              <div className="student-workspace__section-heading">
                <div>
                  <h3>Review assignment</h3>
                  <p>Confirm the target block before applying the assignment.</p>
                </div>
              </div>
              <div className="student-workspace__review-cards">
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Students</span>
                  <strong className="student-workspace__review-card-value">{students.length}</strong>
                  <span className="student-workspace__review-card-hint">selected</span>
                </div>
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Block Group</span>
                  <strong className="student-workspace__review-card-value">{selectedGroup ? formatBlockLabel(selectedGroup.name) : '—'}</strong>
                  <span className="student-workspace__review-card-hint">{selectedGroup ? selectedGroup.semester : ''}</span>
                </div>
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Section</span>
                  <strong className="student-workspace__review-card-value">{selectedSection ? formatBlockColumnLabel(selectedSection.sectionCode) : '—'}</strong>
                  <span className="student-workspace__review-card-hint">{selectedSection ? `${selectedSection.currentPopulation}/${selectedSection.capacity} enrolled` : ''}</span>
                </div>
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Capacity</span>
                  <strong className="student-workspace__review-card-value">{selectedSection ? `${Math.round((selectedSection.currentPopulation / selectedSection.capacity) * 100)}%` : '—'}</strong>
                  <span className="student-workspace__review-card-hint">{selectedSection ? `${selectedSection.currentPopulation}/${selectedSection.capacity}` : ''}</span>
                </div>
              </div>

              <div className="student-workspace__section-heading student-workspace__section-heading--compact">
                <div>
                  <h4>Students to assign</h4>
                </div>
              </div>
              <div className="student-workspace__student-list student-workspace__student-list--compact">
                {students.map((student) => (
                  <div key={student._id} className="student-workspace__student-list-row">
                    <span className="student-workspace__student-list-number">{studentNumberDisplay(student)}</span>
                    <span className="student-workspace__student-list-name">{studentDisplayName(student)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="student-workspace__state-card student-workspace__state-card--error">
              <AlertCircle size={24} aria-hidden="true" />
              <div>
                <strong>Assignment failed</strong>
                <p>{error}</p>
              </div>
            </div>
          ) : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button
              type="button"
              className="student-workspace__ghost-button"
              onClick={currentStep === 1 ? onClose : () => setCurrentStep((step) => (step === 3 ? 2 : 1))}
              disabled={submitting}
            >
              {currentStep === 1 ? 'Cancel' : 'Back'}
            </button>
            {currentStep < 3 ? (
              <button
                type="button"
                className="student-workspace__primary-button student-workspace__primary-button--with-icon"
                onClick={handlePrimaryAction}
                disabled={loading || (currentStep === 2 && !canContinueFromBlock)}
              >
                {primaryActionLabel}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" className="student-workspace__primary-button student-workspace__primary-button--with-icon" disabled={submitting || !selectedGroupId || !selectedSectionId}>
                {primaryActionLabel}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </footer>
        </form>
      </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

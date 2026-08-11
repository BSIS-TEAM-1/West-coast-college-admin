import { useEffect, useMemo, useState } from 'react'
import { X, Users, Blocks, Check, AlertCircle, ArrowRight, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { StudentData } from '../lib/studentApi'
import {
  authorizedFetch,
  formatBlockColumnLabel,
  formatBlockLabel,
  schoolYearFromStartYear,
  studentDisplayName,
  studentNumberDisplay,
  type BlockGroup,
  type BlockSection
} from '../lib/blockAssignmentShared'
import {
  fetchEligibleBlocks,
  fetchBulkEligibility,
  type EligibilityResult,
  type EligibleBlock,
  type IneligibleBlock,
  type BulkEligibilityResult
} from '../lib/blockEligibilityApi'
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
  const isSingleStudent = students.length === 1
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(initialStep)
  // Single-student flow loads eligibility on step 2, so step 1 has nothing to load.
  // Bulk flow loads groups immediately on mount.
  const [loading, setLoading] = useState(!isSingleStudent)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [showIneligible, setShowIneligible] = useState(false)

  // For bulk assignment (multiple students) — display filtering only, not authoritative
  const [groups, setGroups] = useState<BlockGroup[]>([])
  const [sectionsByGroupId, setSectionsByGroupId] = useState<Record<string, BlockSection[]>>({})
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [bulkEligibility, setBulkEligibility] = useState<BulkEligibilityResult | null>(null)
  const [bulkChecking, setBulkChecking] = useState(false)

  const loadEligibility = async () => {
    if (!isSingleStudent) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchEligibleBlocks(students[0]._id)
      setEligibilityResult(result)
      setSelectedSectionId(result.recommended?.section._id || result.eligible[0]?.section._id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to check block eligibility')
      setEligibilityResult(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSingleStudent && currentStep >= 2) {
      loadEligibility()
    } else if (!isSingleStudent) {
      ;(async () => {
        setLoading(true)
        setError('')
        try {
          const fetchedGroups = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
          const firstStudent = students[0]
          const compatibleGroups = fetchedGroups.filter((group) => {
            const groupSchoolYear = group.schoolYear || schoolYearFromStartYear(group.year)
            return (
              (!firstStudent.course || !group.courseId || String(group.courseId) === String(firstStudent.course)) &&
              (!firstStudent.yearLevel || !group.yearLevel || Number(group.yearLevel) === Number(firstStudent.yearLevel)) &&
              (!firstStudent.semester || !group.semester || group.semester === firstStudent.semester) &&
              (!firstStudent.schoolYear || !groupSchoolYear || groupSchoolYear === firstStudent.schoolYear)
            )
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

          const sectionLookup = Object.fromEntries(sectionResponses)
          setGroups(compatibleGroups)
          setSectionsByGroupId(sectionLookup)
          const firstGroupId = compatibleGroups[0]?._id || ''
          setSelectedGroupId(firstGroupId)
          setSelectedSectionId(sectionLookup[firstGroupId]?.[0]?._id || '')
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load block groups')
        } finally {
          setLoading(false)
        }
      })()
    }
  }, [currentStep, isSingleStudent])

  const selectedEligibleBlock = useMemo(() => {
    if (!eligibilityResult) return null
    return (
      eligibilityResult.recommended?.section._id === selectedSectionId
        ? eligibilityResult.recommended
        : eligibilityResult.eligible.find((e) => e.section._id === selectedSectionId)
    ) || null
  }, [eligibilityResult, selectedSectionId])

  const availableSections = sectionsByGroupId[selectedGroupId] || []
  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = availableSections.find((section) => section._id === selectedSectionId) || null

  const blockWizardSteps = [
    { step: 1, label: 'Students', icon: Users, description: 'Review selected batch' },
    { step: 2, label: 'Block', icon: Blocks, description: 'Choose group & section' },
    { step: 3, label: 'Review', icon: Check, description: 'Confirm assignment' }
  ]

  const canContinueFromBlock = Boolean(selectedSectionId)
  const primaryActionLabel =
    currentStep === 1
      ? 'Continue'
      : currentStep === 2
        ? 'Review assignment'
        : submitting
          ? 'Assigning...'
          : 'Assign block'

  const loadBulkEligibility = async (sectionId: string) => {
    if (isSingleStudent || !sectionId) return
    setBulkChecking(true)
    setError('')
    try {
      const result = await fetchBulkEligibility(
        students.map((s) => s._id),
        sectionId
      )
      setBulkEligibility(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to check bulk eligibility')
      setBulkEligibility(null)
    } finally {
      setBulkChecking(false)
    }
  }

  const handlePrimaryAction = () => {
    if (currentStep === 1) {
      setCurrentStep(2)
      return
    }
    if (currentStep === 2 && canContinueFromBlock) {
      if (!isSingleStudent && selectedSectionId) {
        loadBulkEligibility(selectedSectionId)
      }
      setCurrentStep(3)
    }
  }

  const handleRetry = () => {
    if (isSingleStudent) {
      loadEligibility()
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSingleStudent && !selectedEligibleBlock) return
    if (!isSingleStudent && !selectedSectionId) return

    setSubmitting(true)
    setError('')

    try {
      let assignedCount = 0
      const failures: string[] = []

      if (isSingleStudent) {
        const target = selectedEligibleBlock
        if (!target) throw new Error('Select a valid section before assigning.')

        const student = students[0]
        try {
          const assignmentResponse = await authorizedFetch<{ status?: string }>(
            '/api/blocks/assign-student',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentId: student._id,
                sectionId: target.section._id,
                semester: target.blockGroup.semester,
                year: target.blockGroup.year
              })
            }
          )

          if (assignmentResponse.status === 'OVER_CAPACITY') {
            throw new Error(`${target.section.sectionCode} is already at capacity.`)
          }

          assignedCount += 1
        } catch (studentError) {
          const reasons = (studentError as any)?.reasons as string[] | undefined
          const message = reasons && reasons.length > 0
            ? reasons.join(' ')
            : (studentError instanceof Error ? studentError.message : 'Failed')
          if (message.includes('not eligible') || message.includes('full') || message.includes('mismatch')) {
            await loadEligibility()
          }
          failures.push(`${studentNumberDisplay(student)}: ${message}`)
        }

        await onSaved(
          failures.length
            ? `Block assignment finished for ${assignedCount} student(s). ${failures.length} record(s) need attention.`
            : `Assigned ${assignedCount} student(s) to ${selectedEligibleBlock?.section.sectionCode}.`
        )
      } else {
        const targetSection = availableSections.find((section) => section._id === selectedSectionId)
        if (!targetSection) throw new Error('Select a valid section before assigning students.')

        // Use bulk eligibility results to determine which students to assign
        // Backend will revalidate each assignment — frontend eligibility is not authoritative
        const eligibleStudentIds = bulkEligibility
          ? new Set(bulkEligibility.eligible.map((e) => e.studentId))
          : null

        // If bulk eligibility was checked, only assign eligible students
        // If not checked (shouldn't happen), fall back to all students — backend will reject ineligible
        // Preserve the registrar's selected student order (filter preserves array order)
        const studentsToAssign = eligibleStudentIds
          ? students.filter((s) => eligibleStudentIds.has(s._id))
          : students

        // Respect capacity: only assign up to available slots, in selected order
        // The backend will revalidate each assignment — slotsAvailable from preview is not authoritative
        const slotsAvailable = bulkEligibility?.summary.slotsAvailable ?? targetSection.capacity - targetSection.currentPopulation
        const studentsToActuallyAssign = studentsToAssign.slice(0, Math.max(0, slotsAvailable))
        const capacityExhaustedStudents = studentsToAssign.slice(Math.max(0, slotsAvailable))

        for (const student of studentsToActuallyAssign) {
          try {
            const assignmentResponse = await authorizedFetch<{ status?: string }>(
              '/api/blocks/assign-student',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: student._id,
                  sectionId: targetSection._id,
                  semester: selectedGroup?.semester,
                  year: selectedGroup?.year
                })
              }
            )

            if (assignmentResponse.status === 'OVER_CAPACITY') {
              throw new Error(`${targetSection.sectionCode} is already at capacity.`)
            }

            assignedCount += 1
          } catch (studentError) {
            const reasons = (studentError as any)?.reasons as string[] | undefined
            const message = reasons && reasons.length > 0
              ? reasons.join(' ')
              : (studentError instanceof Error ? studentError.message : 'Failed')
            failures.push(`${studentNumberDisplay(student)}: ${message}`)
          }
        }

        // Report capacity-exhausted students (eligible but no slots remained)
        const capacityExhaustedNames: string[] = []
        for (const student of capacityExhaustedStudents) {
          capacityExhaustedNames.push(`${studentDisplayName(student)} — eligible, but block capacity was exhausted`)
        }

        // Report ineligible students (failed eligibility checks — different from capacity)
        const ineligibleNames: string[] = []
        if (bulkEligibility) {
          for (const ineligible of bulkEligibility.ineligible) {
            ineligibleNames.push(`${ineligible.studentName}: ${ineligible.reasons?.join(', ') || 'Not eligible'}`)
          }
        }

        // Build structured summary message
        const parts: string[] = [`Assigned ${assignedCount} student(s) to ${targetSection.sectionCode}.`]
        if (capacityExhaustedNames.length > 0) {
          parts.push(`${capacityExhaustedNames.length} eligible student(s) not assigned due to capacity: ${capacityExhaustedNames.join('; ')}.`)
        }
        if (ineligibleNames.length > 0) {
          parts.push(`${ineligibleNames.length} student(s) cannot be assigned: ${ineligibleNames.join('; ')}.`)
        }
        if (failures.length > 0) {
          parts.push(`${failures.length} assignment error(s): ${failures.join('; ')}.`)
        }

        const summaryMessage = assignedCount > 0
          ? parts.join(' ')
          : `No students assigned. ${parts.slice(1).join(' ')}`

        await onSaved(summaryMessage)
      }

      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to assign block')
    } finally {
      setSubmitting(false)
    }
  }

  const renderRecommendedCard = (block: EligibleBlock) => {
    const fillPercent = Math.round((block.section.currentPopulation / block.section.capacity) * 100)
    const selected = block.section._id === selectedSectionId
    return (
      <button
        key={`rec-${block.section._id}`}
        type="button"
        className={`student-workspace__section-card student-workspace__section-card--recommended ${selected ? 'student-workspace__section-card--selected' : ''}`}
        onClick={() => setSelectedSectionId(block.section._id)}
      >
        <div className="student-workspace__section-card-main">
          <div className="student-workspace__section-card-code">
            {formatBlockColumnLabel(block.section.sectionCode)}
            <span className="student-workspace__recommended-badge">Recommended</span>
          </div>
          <div className="student-workspace__section-card-group">
            {formatBlockLabel(block.blockGroup.name)}
            {block.blockGroup.studentClassification && block.blockGroup.studentClassification !== 'All' && (
              <span className="student-workspace__classification-tag">{block.blockGroup.studentClassification}</span>
            )}
          </div>
        </div>
        <div className="student-workspace__section-card-meta">
          <span className="student-workspace__section-card-count">{block.section.currentPopulation}/{block.section.capacity}</span>
          <span className="student-workspace__slots-available">{block.slotsAvailable} slots available</span>
          <div className="student-workspace__section-card-bar" aria-hidden="true">
            <div className="student-workspace__section-card-bar-fill" style={{ width: `${fillPercent}%` }} />
          </div>
        </div>
      </button>
    )
  }

  const renderEligibleCard = (block: EligibleBlock) => {
    const fillPercent = Math.round((block.section.currentPopulation / block.section.capacity) * 100)
    const selected = block.section._id === selectedSectionId
    return (
      <button
        key={`elig-${block.section._id}`}
        type="button"
        className={`student-workspace__section-card ${selected ? 'student-workspace__section-card--selected' : ''}`}
        onClick={() => setSelectedSectionId(block.section._id)}
      >
        <div className="student-workspace__section-card-main">
          <div className="student-workspace__section-card-code">{formatBlockColumnLabel(block.section.sectionCode)}</div>
          <div className="student-workspace__section-card-group">
            {formatBlockLabel(block.blockGroup.name)}
            {block.blockGroup.studentClassification && block.blockGroup.studentClassification !== 'All' && (
              <span className="student-workspace__classification-tag">{block.blockGroup.studentClassification}</span>
            )}
          </div>
        </div>
        <div className="student-workspace__section-card-meta">
          <span className="student-workspace__section-card-count">{block.section.currentPopulation}/{block.section.capacity}</span>
          <span className="student-workspace__slots-available">{block.slotsAvailable} slots</span>
          <div className="student-workspace__section-card-bar" aria-hidden="true">
            <div className="student-workspace__section-card-bar-fill" style={{ width: `${fillPercent}%` }} />
          </div>
        </div>
      </button>
    )
  }

  const renderIneligibleCard = (block: IneligibleBlock) => (
    <div key={`inel-${block.section._id}`} className="student-workspace__ineligible-card">
      <div className="student-workspace__ineligible-card-header">
        <div className="student-workspace__section-card-code">{formatBlockColumnLabel(block.section.sectionCode)}</div>
        <div className="student-workspace__section-card-group">{formatBlockLabel(block.blockGroup.name)}</div>
      </div>
      <div className="student-workspace__ineligible-reasons">
        {block.reasons.map((reason, idx) => (
          <div key={idx} className="student-workspace__ineligible-reason">
            <AlertCircle size={14} aria-hidden="true" />
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  )

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
              {isSingleStudent
                ? 'Eligible blocks are determined by the student\u2019s enrollment, program, year level, curriculum, and classification.'
                : 'Pick a compatible block group and section. Changing an existing block will clear the current linked block load before the new assignment is applied.'}
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
              {loading ? (
                <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                  <Loader2 size={24} className="student-workspace__spinner" />
                  <span>Checking available blocks...</span>
                </div>
              ) : error ? (
                <div className="student-workspace__state-card student-workspace__state-card--error">
                  <AlertCircle size={28} aria-hidden="true" />
                  <div>
                    <strong>Unable to check block eligibility</strong>
                    <p>{error}</p>
                  </div>
                  <button type="button" className="student-workspace__secondary-button" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              ) : isSingleStudent && eligibilityResult ? (
                <>
                  <div className="student-workspace__eligibility-context">
                    <div className="student-workspace__eligibility-context-item">
                      <span>Program</span>
                      <strong>{eligibilityResult.student.course}</strong>
                    </div>
                    <div className="student-workspace__eligibility-context-item">
                      <span>Year Level</span>
                      <strong>Year {eligibilityResult.student.yearLevel}</strong>
                    </div>
                    <div className="student-workspace__eligibility-context-item">
                      <span>Classification</span>
                      <strong>{eligibilityResult.student.classification}</strong>
                    </div>
                    <div className="student-workspace__eligibility-context-item">
                      <span>School Year</span>
                      <strong>{eligibilityResult.student.schoolYear}</strong>
                    </div>
                    <div className="student-workspace__eligibility-context-item">
                      <span>Semester</span>
                      <strong>{eligibilityResult.student.semester}</strong>
                    </div>
                    {eligibilityResult.enrollment ? (
                      <div className="student-workspace__eligibility-context-item">
                        <span>Enrollment</span>
                        <strong>{eligibilityResult.enrollment.status}</strong>
                      </div>
                    ) : (
                      <div className="student-workspace__eligibility-context-item student-workspace__eligibility-context-item--warning">
                        <span>Enrollment</span>
                        <strong>No active enrollment</strong>
                      </div>
                    )}
                  </div>

                  {eligibilityResult.recommended ? (
                    <section className="student-workspace__form-section">
                      <div className="student-workspace__section-heading">
                        <div>
                          <h3>Recommended block</h3>
                          <p>Best balance based on current enrollment.</p>
                        </div>
                      </div>
                      <div className="student-workspace__section-cards">
                        {renderRecommendedCard(eligibilityResult.recommended)}
                      </div>
                    </section>
                  ) : null}

                  {eligibilityResult.eligible.filter((e) => e.section._id !== eligibilityResult.recommended?.section._id).length ? (
                    <section className="student-workspace__form-section">
                      <div className="student-workspace__section-heading">
                        <div>
                          <h3>Other eligible blocks</h3>
                          <p>Choose the section that should own the selected student.</p>
                        </div>
                      </div>
                      <div className="student-workspace__section-cards">
                        {eligibilityResult.eligible
                          .filter((e) => e.section._id !== eligibilityResult.recommended?.section._id)
                          .map(renderEligibleCard)}
                      </div>
                    </section>
                  ) : null}

                  {!eligibilityResult.eligible.length ? (
                    <div className="student-workspace__state-card student-workspace__state-card--warning">
                      <AlertCircle size={28} aria-hidden="true" />
                      <div>
                        <strong>No eligible blocks found</strong>
                        <p>This student currently does not meet the requirements for any available block.</p>
                      </div>
                    </div>
                  ) : null}

                  {eligibilityResult.ineligible.length ? (
                    <section className="student-workspace__form-section student-workspace__ineligible-section">
                      <button
                        type="button"
                        className="student-workspace__ineligible-toggle"
                        onClick={() => setShowIneligible((prev) => !prev)}
                      >
                        {showIneligible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        <AlertCircle size={16} aria-hidden="true" />
                        <span>Other blocks not available ({eligibilityResult.ineligible.length})</span>
                      </button>
                      {showIneligible ? (
                        <div className="student-workspace__ineligible-list">
                          {eligibilityResult.ineligible.map(renderIneligibleCard)}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </>
              ) : !isSingleStudent ? (
                <>
                  <div className="student-workspace__form-grid student-workspace__form-grid--two student-workspace__form-grid--selects">
                    <label className="student-workspace__field-card">
                      <span className="student-workspace__field-card-label">Block Group</span>
                      <select value={selectedGroupId} onChange={(event) => {
                        setSelectedGroupId(event.target.value)
                        const sections = sectionsByGroupId[event.target.value] || []
                        setSelectedSectionId(sections[0]?._id || '')
                      }} disabled={loading || !groups.length}>
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

                  {!loading && !groups.length ? (
                    <div className="student-workspace__state-card student-workspace__state-card--error">
                      <AlertCircle size={28} aria-hidden="true" />
                      <div>
                        <strong>No compatible block groups</strong>
                        <p>No block groups match the selected students' curriculum, year level, semester, and school year.</p>
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
                  <strong className="student-workspace__review-card-value">
                    {isSingleStudent && selectedEligibleBlock
                      ? formatBlockLabel(selectedEligibleBlock.blockGroup.name)
                      : selectedGroup ? formatBlockLabel(selectedGroup.name) : '\u2014'}
                  </strong>
                  <span className="student-workspace__review-card-hint">
                    {isSingleStudent && selectedEligibleBlock
                      ? selectedEligibleBlock.blockGroup.semester
                      : selectedGroup ? selectedGroup.semester : ''}
                  </span>
                </div>
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Section</span>
                  <strong className="student-workspace__review-card-value">
                    {isSingleStudent && selectedEligibleBlock
                      ? formatBlockColumnLabel(selectedEligibleBlock.section.sectionCode)
                      : selectedSection ? formatBlockColumnLabel(selectedSection.sectionCode) : '\u2014'}
                  </strong>
                  <span className="student-workspace__review-card-hint">
                    {isSingleStudent && selectedEligibleBlock
                      ? `${selectedEligibleBlock.section.currentPopulation}/${selectedEligibleBlock.section.capacity} enrolled`
                      : selectedSection ? `${selectedSection.currentPopulation}/${selectedSection.capacity} enrolled` : ''}
                  </span>
                </div>
                <div className="student-workspace__review-card">
                  <span className="student-workspace__review-card-label">Capacity</span>
                  <strong className="student-workspace__review-card-value">
                    {isSingleStudent && selectedEligibleBlock
                      ? `${Math.round((selectedEligibleBlock.section.currentPopulation / selectedEligibleBlock.section.capacity) * 100)}%`
                      : selectedSection ? `${Math.round((selectedSection.currentPopulation / selectedSection.capacity) * 100)}%` : '\u2014'}
                  </strong>
                  <span className="student-workspace__review-card-hint">
                    {isSingleStudent && selectedEligibleBlock
                      ? `${selectedEligibleBlock.section.currentPopulation}/${selectedEligibleBlock.section.capacity}`
                      : selectedSection ? `${selectedSection.currentPopulation}/${selectedSection.capacity}` : ''}
                  </span>
                </div>
              </div>

              {/* Bulk eligibility results */}
              {!isSingleStudent && bulkChecking ? (
                <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                  <Loader2 size={24} className="student-workspace__spinner" />
                  <span>Checking eligibility for {students.length} students...</span>
                </div>
              ) : null}

              {!isSingleStudent && bulkEligibility ? (
                <>
                  <div className="student-workspace__bulk-eligibility-summary">
                    <div className="student-workspace__bulk-eligibility-stat student-workspace__bulk-eligibility-stat--eligible">
                      <strong>{bulkEligibility.summary.eligibleCount}</strong>
                      <span>Eligible</span>
                    </div>
                    <div className="student-workspace__bulk-eligibility-stat student-workspace__bulk-eligibility-stat--ineligible">
                      <strong>{bulkEligibility.summary.ineligibleCount}</strong>
                      <span>Cannot assign</span>
                    </div>
                    <div className="student-workspace__bulk-eligibility-stat">
                      <strong>{bulkEligibility.summary.slotsAvailable}</strong>
                      <span>Slots available</span>
                    </div>
                  </div>

                  {bulkEligibility.summary.ineligibleCount > 0 ? (
                    <>
                      <div className="student-workspace__section-heading student-workspace__section-heading--compact">
                        <div>
                          <h4>Students that cannot be assigned</h4>
                        </div>
                      </div>
                      <div className="student-workspace__ineligible-list">
                        {bulkEligibility.ineligible.map((item) => (
                          <div key={item.studentId} className="student-workspace__ineligible-card">
                            <div className="student-workspace__ineligible-card-header">
                              <div className="student-workspace__section-card-code">{item.studentName}</div>
                              <div className="student-workspace__section-card-group">{item.studentNumber}</div>
                            </div>
                            <div className="student-workspace__ineligible-reasons">
                              {item.reasons?.map((reason, idx) => (
                                <div key={idx} className="student-workspace__ineligible-reason">
                                  <AlertCircle size={14} aria-hidden="true" />
                                  <span>{reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {bulkEligibility.summary.eligibleCount > bulkEligibility.summary.slotsAvailable ? (
                    <div className="student-workspace__state-card student-workspace__state-card--warning">
                      <AlertCircle size={24} aria-hidden="true" />
                      <div>
                        <strong>Capacity warning</strong>
                        <p>
                          {bulkEligibility.summary.eligibleCount} students are eligible but only {bulkEligibility.summary.slotsAvailable} slots are available.
                          Only the first {bulkEligibility.summary.slotsAvailable} eligible students will be assigned.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="student-workspace__section-heading student-workspace__section-heading--compact">
                <div>
                  <h4>Students to assign</h4>
                </div>
              </div>
              <div className="student-workspace__student-list student-workspace__student-list--compact">
                {students.map((student, index) => {
                  const bulkItem = bulkEligibility?.eligible.find((e) => e.studentId === student._id)
                  const isIneligible = bulkEligibility?.ineligible.find((e) => e.studentId === student._id)
                  const slotsAvailable = bulkEligibility?.summary.slotsAvailable ?? 0
                  const eligibleIndex = bulkItem
                    ? bulkEligibility!.eligible.findIndex((e) => e.studentId === student._id)
                    : -1
                  const isCapacityExhausted = bulkItem && eligibleIndex >= slotsAvailable
                  return (
                    <div key={student._id} className="student-workspace__student-list-row">
                      <span className="student-workspace__student-list-number">{studentNumberDisplay(student)}</span>
                      <span className="student-workspace__student-list-name">{studentDisplayName(student)}</span>
                      {bulkEligibility && isCapacityExhausted ? (
                        <span className="student-workspace__student-list-status student-workspace__student-list-status--capacity">⚠ Capacity exhausted</span>
                      ) : bulkEligibility && bulkItem ? (
                        <span className="student-workspace__student-list-status student-workspace__student-list-status--eligible">Eligible</span>
                      ) : bulkEligibility && isIneligible ? (
                        <span className="student-workspace__student-list-status student-workspace__student-list-status--ineligible">❌ Cannot assign</span>
                      ) : null}
                    </div>
                  )
                })}
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
              <button type="submit" className="student-workspace__primary-button student-workspace__primary-button--with-icon" disabled={submitting || !canContinueFromBlock}>
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

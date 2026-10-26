import { useState, useEffect } from 'react'
import { ArrowLeft, Layers3, AlertTriangle, Info } from 'lucide-react'
import { getStoredToken } from '../../lib/authApi'
import StudentService from '../../lib/studentApi'
import { authorizedFetch, extractResponseData } from '../../lib/blockAssignmentShared'
import { COURSE_OPTIONS } from '../../lib/blockAssignmentShared'
import type { StudentData } from '../../lib/studentApi'
import './StudentHistoryPage.css'

type ShiftStudentPageProps = {
  studentId: string
  onBack: () => void
}

type ShiftResult = {
  student: StudentData
  previousCourse: number
  newCourse: number
  previousSection: string | null
  newSection: string | null
  semester: string | null
  previousCurriculumVersion: string | null
  newCurriculumVersion: string
  clearedBlockAssignment: boolean
}

type ShiftSectionOption = {
  sectionId: string
  sectionCode: string
  groupName: string
  schoolYear?: string | null
  yearLevel: number | null
  capacity: number
  currentPopulation: number
  freeSlots: number
}

export default function ShiftStudentPage({ studentId, onBack }: ShiftStudentPageProps) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState('')
  const [section, setSection] = useState('')
  const [semester, setSemester] = useState('')
  const [effectiveTerm, setEffectiveTerm] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [shiftResult, setShiftResult] = useState<ShiftResult | null>(null)
  const [sectionOptions, setSectionOptions] = useState<ShiftSectionOption[]>([])
  const [optionsHint, setOptionsHint] = useState('')
  const [loadingBlocks, setLoadingBlocks] = useState(false)

  useEffect(() => {
    loadStudent()
  }, [studentId])

  useEffect(() => {
    if (course && semester) {
      // Reset any stale selection from the previously chosen course/semester.
      setSection('')
      loadSectionOptions()
    } else {
      setSectionOptions([])
      setOptionsHint('')
    }
  }, [course, semester])

  const loadStudent = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await StudentService.getStudentById(token, studentId)
      const studentData = extractResponseData<StudentData>(response)
      setStudent(studentData)
      setCourse(String(studentData.course || ''))
      setSection(studentData.section || '')
    } catch (e: any) {
      setError(e.message || 'Failed to load student')
    } finally {
      setLoading(false)
    }
  }

  const loadSectionOptions = async () => {
    setLoadingBlocks(true)
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      // Registra shift targets the student's current school year; the shift
      // backend resolves blocks for the same term.
      const schoolYear = student?.schoolYear
        ? `&schoolYear=${encodeURIComponent(student.schoolYear)}`
        : ''
      const response = await authorizedFetch<{
        success: boolean
        reason?: string
        data: ShiftSectionOption[]
      }>(
        `/api/blocks/shift-options?course=${encodeURIComponent(course)}&semester=${encodeURIComponent(semester)}${schoolYear}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      )

      // The dropdown submits real section codes (e.g. "102-1-A"), never
      // labels guessed from block-group display names — resolveShiftSection
      // matches those exactly. The endpoint also reports WHY the list is
      // empty (no blocks / none open / all full) so a real gap surfaces as
      // an explanation, not as a silent fallback-only dropdown.
      setSectionOptions(extractResponseData<ShiftSectionOption[]>(response) ?? [])
      setOptionsHint(
        (response as { reason?: string }).reason?.trim() || ''
      )
    } catch (e: any) {
      console.error('Failed to load shift section options:', e)
      setSectionOptions([])
      setOptionsHint('Could not load the available blocks. Please try again.')
    } finally {
      setLoadingBlocks(false)
    }
  }

  const handleShift = async () => {
    setSaving(true)
    setError('')
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await authorizedFetch<{ success: boolean; message: string; data: ShiftResult }>(
        `/api/registrar/students/${studentId}/shift`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course: Number(course),
            section,
            semester,
            effectiveTerm,
            overrideReason
          })
        }
      )

      if (response.success) {
        setShiftResult(response.data)
      } else {
        setError(response.message || 'Failed to shift student')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to shift student')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="student-history-page">
        <div className="student-history-page__loading">
          <p>Loading student…</p>
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="student-history-page">
        <div className="student-history-page__error">
          <p>Student not found</p>
        </div>
      </div>
    )
  }

  if (student.yearLevel && student.yearLevel > 1) {
    return (
      <div className="student-history-page">
        <header className="student-history-page__header">
          <button type="button" className="student-history-page__back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to Students
          </button>
        </header>
        <div className="student-history-page__error">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} />
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Year Level Restriction</p>
              <p style={{ margin: '4px 0 0 0', opacity: 0.9 }}>Course shift is only allowed for 1st year students. This student is currently in {student.yearLevel}{student.yearLevel === 2 ? 'nd' : student.yearLevel === 3 ? 'rd' : 'th'} year.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const currentCourseLabel = COURSE_OPTIONS.find(c => c.value === Number(student.course))?.label || student.course

  if (shiftResult) {
    return (
      <div className="student-history-page">
        <header className="student-history-page__header">
          <button type="button" className="student-history-page__back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to Students
          </button>
          <span className="student-history-page__eyebrow">Shift Complete</span>
          <h2>{student.firstName} {student.lastName}</h2>
        </header>

        <section className="student-history-page__section">
          <div style={{ 
            maxWidth: '600px', 
            margin: '0 auto',
            padding: '32px',
            background: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: '#dcfce7', 
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Layers3 size={32} />
              </div>
              <h3 style={{ margin: '0 0 8px 0' }}>Student Shifted Successfully</h3>
              <p style={{ margin: 0, opacity: 0.7 }}>
                {student.firstName} {student.lastName} has been moved to a new program.
              </p>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '16px',
              marginBottom: '24px' 
            }}>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Previous Course</div>
                <div style={{ fontWeight: 600 }}>{COURSE_OPTIONS.find(c => c.value === shiftResult.previousCourse)?.label || shiftResult.previousCourse}</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>New Course</div>
                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{COURSE_OPTIONS.find(c => c.value === shiftResult.newCourse)?.label || shiftResult.newCourse}</div>
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '16px',
              marginBottom: '24px' 
            }}>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Previous Section</div>
                <div style={{ fontWeight: 600 }}>{shiftResult.previousSection || 'None'}</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>New Section</div>
                <div style={{ fontWeight:600 }}>{shiftResult.newSection || 'None'}</div>
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '16px',
              marginBottom: '24px' 
            }}>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Previous Curriculum</div>
                <div style={{ fontWeight: 600 }}>{shiftResult.previousCurriculumVersion || 'None'}</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>New Curriculum</div>
                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{shiftResult.newCurriculumVersion}</div>
              </div>
            </div>

            {shiftResult.clearedBlockAssignment ? (
              <div style={{ 
                padding: '16px', 
                background: '#fef3c7', 
                color: '#92400e', 
                borderRadius: '8px', 
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <Info size={20} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Block Assignment Cleared</div>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>The student's previous block assignment was cleared. Please assign them to a new block in the new program.</div>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onBack}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Return to Students
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="student-history-page">
      <header className="student-history-page__header">
        <button type="button" className="student-history-page__back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to Students
        </button>
        <span className="student-history-page__eyebrow">Shift Student</span>
        <h2>{student.firstName} {student.lastName}</h2>
        <div className="student-history-page__summary">
          <span><strong>{student.studentNumber}</strong></span>
          <span>Current Course: <strong>{currentCourseLabel}</strong></span>
          <span>Current Block: <strong>{student.section || 'Not assigned'}</strong></span>
          <span>Current Curriculum: <strong>{student.curriculumVersion || 'Not assigned'}</strong></span>
        </div>
      </header>

      <section className="student-history-page__section">
        <div className="student-history-page__section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Layers3 size={20} />
            <div>
              <h3>Change Course and/or Block</h3>
              <p>Select the new course and block assignment for this student. This action will be logged in the audit trail. Previous academic history will be preserved.</p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '600px', margin: '0 auto', marginTop: '24px' }}>
          <div style={{ 
            background: 'var(--color-surface)', 
            borderRadius: '12px', 
            padding: '32px',
            border: '1px solid var(--color-border)'
          }}>
            <form onSubmit={(e) => { e.preventDefault(); handleShift() }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    New Course <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '14px',
                      background: 'var(--color-background)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <option value="">Select a course...</option>
                    {COURSE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    Semester <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '14px',
                      background: 'var(--color-background)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <option value="">Select a semester...</option>
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    New Block/Section (Optional)
                  </label>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    disabled={!course || !semester || loadingBlocks}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '14px',
                      background: 'var(--color-background)',
                      color: 'var(--color-text)',
                      opacity: (!course || !semester || loadingBlocks) ? 0.6 : 1
                    }}
                  >
                    <option value="">
                      {loadingBlocks ? 'Loading blocks...' : (course && semester) ? 'No block (assign later)' : 'Select course and semester first'}
                    </option>
                    {sectionOptions.map((opt) => {
                      // Label the actual term the block lives in when the
                      // student's own stamp differs from it (legacy-term
                      // groups are still assignable — assignment keys on the
                      // block's term).
                      const termNote =
                        opt.schoolYear && student?.schoolYear && opt.schoolYear !== student.schoolYear
                          ? ` · ${opt.schoolYear}`
                          : ''
                      return (
                        <option key={opt.sectionId} value={opt.sectionCode}>
                          {`${opt.sectionCode}${opt.groupName ? ` — ${opt.groupName}` : ''}${termNote} (${opt.freeSlots > 0 ? `${opt.freeSlots} seat${opt.freeSlots === 1 ? '' : 's'} open` : 'Full'})`}
                        </option>
                      )
                    })}
                  </select>
                  {course && semester && sectionOptions.length === 0 && !loadingBlocks ? (
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        color: optionsHint ? '#b45309' : undefined,
                        opacity: optionsHint ? 1 : 0.7,
                      }}
                      role="note"
                    >
                      {optionsHint ||
                        `No eligible open blocks for this course and semester${student?.schoolYear ? ` in ${student.schoolYear}` : ''}`}
                    </div>
                  ) : null}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    Effective Term (Optional)
                  </label>
                  <input
                    type="text"
                    value={effectiveTerm}
                    onChange={(e) => setEffectiveTerm(e.target.value)}
                    placeholder="e.g., 2024-2025 1st"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '14px',
                      background: 'var(--color-background)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    Override Reason (Required if effective term is not current)
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Explain why this shift should take effect in a different term..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '14px',
                      background: 'var(--color-background)',
                      color: 'var(--color-text)',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {error ? (
                  <div style={{ 
                    padding: '12px 16px', 
                    borderRadius: '8px', 
                    background: '#fee2e2', 
                    color: '#dc2626',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} />
                    {error}
                  </div>
                ) : null}

                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--color-border)'
                }}>
                  <button
                    type="button"
                    onClick={onBack}
                    disabled={saving}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text)',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Processing...' : 'Shift Student'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}

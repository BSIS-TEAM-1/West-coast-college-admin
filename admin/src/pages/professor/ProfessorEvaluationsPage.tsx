import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  MessageSquare,
  User,
  UserCheck
} from 'lucide-react'
import {
  EVALUATION_QUESTIONS,
  fetchProfessorEvaluations,
  type ProfessorAnonymousFeedback,
  type ProfessorEvaluationsData
} from '../../lib/evaluationApi'
import type { ProfessorAssignedCourse } from './professorTypes'
import { normalizeSemester } from './professorUtils'
import './ProfessorEvaluationsPage.css'

interface ProfessorEvaluationsPageProps {
  professorName?: string
  courses?: ProfessorAssignedCourse[]
}

interface EvaluationBlockGroup {
  key: string
  blockTitle: string
  courseLabel: string
  sectionCode: string
  semester: string
  schoolYear: string
  subjects: Array<{ code: string; title: string }>
  responses: ProfessorAnonymousFeedback[]
}

const formatCourseShortLabel = (value: string | number | undefined) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
  const map: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSED-ENGLISH',
    '103': 'BSED-MATH',
    '201': 'BSBA-HRM'
  }
  if (map[normalized]) return map[normalized]
  if (normalized.includes('BEED')) return 'BEED'
  if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return 'BSED-ENGLISH'
  if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return 'BSED-MATH'
  if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return 'BSBA-HRM'
  return raw
}

const formatBlockTitle = (courseCode: string | number | undefined, sectionCode: string | undefined) => {
  const courseLabel = formatCourseShortLabel(courseCode)
  const cleanSection = String(sectionCode || '').trim()
  if (!cleanSection) return courseLabel || 'Assigned Block'
  if (!courseLabel) return cleanSection
  if (cleanSection.toUpperCase().startsWith(courseLabel.toUpperCase())) {
    return cleanSection
  }
  return `${courseLabel} ${cleanSection}`.trim()
}

export default function ProfessorEvaluationsPage({
  professorName = '',
  courses = []
}: ProfessorEvaluationsPageProps) {
  const [data, setData] = useState<ProfessorEvaluationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [semesterFilter, setSemesterFilter] = useState('ALL')
  const [schoolYearFilter, setSchoolYearFilter] = useState('ALL')

  // Progressive disclosure states: Professor -> Blocks -> Anon Students -> Rates/Comments
  const [isProfessorOpen, setIsProfessorOpen] = useState(false)
  const [openBlockKeys, setOpenBlockKeys] = useState<Record<string, boolean>>({})
  const [openStudentIds, setOpenStudentIds] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchProfessorEvaluations({
        subjectCode: subjectFilter,
        semester: semesterFilter,
        schoolYear: schoolYearFilter
      })
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evaluation results.')
    } finally {
      setLoading(false)
    }
  }, [subjectFilter, semesterFilter, schoolYearFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const allAvailableSubjects = useMemo(() => {
    const map = new Map<string, { subjectCode: string; subjectTitle: string }>()
    for (const item of data?.filters?.subjects || []) {
      const code = String(item.subjectCode || '').trim().toUpperCase()
      if (code) map.set(code, { subjectCode: code, subjectTitle: item.subjectTitle || code })
    }
    for (const course of courses) {
      for (const block of course.blocks || []) {
        for (const subject of block.subjects || []) {
          const code = String(subject.code || '').trim().toUpperCase()
          if (code && !map.has(code)) {
            map.set(code, { subjectCode: code, subjectTitle: subject.title || code })
          }
        }
      }
    }
    return Array.from(map.values())
  }, [data?.filters?.subjects, courses])

  const termsWithFeedback = useMemo(
    () => new Set((data?.subjectSummaries || []).map((item) => `${item.semester}|${item.schoolYear}`)).size,
    [data]
  )

  const subjectsWithFeedback =
    data?.subjectsWithFeedbackCount !== undefined
      ? data.subjectsWithFeedbackCount
      : data?.subjectSummaries?.length || 0

  // Group into Professor -> Blocks -> Anonymous Students
  const blockGroups = useMemo<EvaluationBlockGroup[]>(() => {
    const groupsMap = new Map<string, EvaluationBlockGroup>()

    // 1. Seed blocks from professor's assigned courses/blocks
    for (const course of courses) {
      const courseLabel = formatCourseShortLabel(course.courseCode)
      for (const block of course.blocks || []) {
        const sem = normalizeSemester(block.semester) || block.semester || '1st'
        const sy = String(block.schoolYear || '').trim()
        if (semesterFilter !== 'ALL' && sem !== semesterFilter) continue
        if (schoolYearFilter !== 'ALL' && sy && sy !== schoolYearFilter) continue

        const blockSubjects = (block.subjects || [])
          .map((s) => ({
            code: String(s.code || '').trim().toUpperCase(),
            title: String(s.title || s.code || '').trim()
          }))
          .filter((s) => Boolean(s.code))

        if (
          subjectFilter !== 'ALL' &&
          !blockSubjects.some((s) => s.code === subjectFilter.toUpperCase())
        ) {
          continue
        }

        const sectionCode = String(block.sectionCode || '').trim()
        const key = `${courseLabel}|${sectionCode.toUpperCase()}|${sem}|${sy}`
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            key,
            blockTitle: formatBlockTitle(course.courseCode, sectionCode),
            courseLabel,
            sectionCode,
            semester: sem,
            schoolYear: sy,
            subjects: blockSubjects,
            responses: []
          })
        } else {
          const existing = groupsMap.get(key)!
          for (const subj of blockSubjects) {
            if (!existing.subjects.some((s) => s.code === subj.code)) {
              existing.subjects.push(subj)
            }
          }
        }
      }
    }

    // 2. Attach anonymous student responses to their matching block (or create a fallback block)
    const responses = data?.responses || []
    for (const resp of responses) {
      const respSec = String(resp.sectionCode || '').trim().toUpperCase()
      const respSem = normalizeSemester(resp.semester) || resp.semester || ''
      const respSy = String(resp.schoolYear || '').trim()
      const respSubjCode = String(resp.subjectCode || '').trim().toUpperCase()
      const respSubjCodes = Array.isArray(resp.subjectCodes) && resp.subjectCodes.length > 0
        ? resp.subjectCodes.map((c) => String(c || '').trim().toUpperCase())
        : [respSubjCode]

      let matchedGroup: EvaluationBlockGroup | undefined

      // Match by sectionCode + term first
      if (respSec) {
        for (const group of groupsMap.values()) {
          const groupSec = group.sectionCode.toUpperCase()
          const groupTitle = group.blockTitle.toUpperCase()
          const sameTerm =
            (!group.semester || !respSem || group.semester === respSem) &&
            (!group.schoolYear || !respSy || group.schoolYear === respSy)
          if (
            sameTerm &&
            (groupSec === respSec ||
              groupTitle === respSec ||
              groupTitle.endsWith(` ${respSec}`) ||
              groupTitle.endsWith(`-${respSec}`))
          ) {
            matchedGroup = group
            break
          }
        }
      }

      // Otherwise match by subjectCode + term
      if (!matchedGroup) {
        for (const group of groupsMap.values()) {
          const sameTerm =
            (!group.semester || !respSem || group.semester === respSem) &&
            (!group.schoolYear || !respSy || group.schoolYear === respSy)
          if (
            sameTerm &&
            group.subjects.some((s) => respSubjCodes.includes(s.code))
          ) {
            matchedGroup = group
            break
          }
        }
      }

      // Fallback block if response isn't in any pre-seeded block
      if (!matchedGroup) {
        const fallbackSection = String(resp.sectionCode || '').trim() || respSubjCode || 'General Block'
        const fallbackCourse = formatCourseShortLabel(resp.course)
        const fallbackKey = `resp|${fallbackCourse}|${fallbackSection.toUpperCase()}|${respSem}|${respSy}`
        if (!groupsMap.has(fallbackKey)) {
          groupsMap.set(fallbackKey, {
            key: fallbackKey,
            blockTitle: resp.sectionCode
              ? formatBlockTitle(resp.course, resp.sectionCode)
              : `${respSubjCode} — ${resp.subjectTitle || 'Course Block'}`,
            courseLabel: fallbackCourse,
            sectionCode: fallbackSection,
            semester: respSem,
            schoolYear: respSy,
            subjects: respSubjCode
              ? [{ code: respSubjCode, title: resp.subjectTitle || respSubjCode }]
              : [],
            responses: []
          })
        }
        matchedGroup = groupsMap.get(fallbackKey)!
      }

      if (
        respSubjCode &&
        !matchedGroup.subjects.some((s) => s.code === respSubjCode)
      ) {
        matchedGroup.subjects.push({
          code: respSubjCode,
          title: resp.subjectTitle || respSubjCode
        })
      }

      matchedGroup.responses.push(resp)
    }

    return Array.from(groupsMap.values())
  }, [courses, data?.responses, subjectFilter, semesterFilter, schoolYearFilter])

  const resolvedProfessorName =
    data?.professorName || professorName || 'Professor'

  const toggleBlock = (blockKey: string) => {
    setOpenBlockKeys((prev) => ({ ...prev, [blockKey]: !prev[blockKey] }))
  }

  const toggleStudent = (studentId: string) => {
    setOpenStudentIds((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  const questionLookup = useMemo(() => {
    const map = new Map<number, string>()
    for (const q of data?.questions || EVALUATION_QUESTIONS) {
      map.set(q.number, q.text)
    }
    return map
  }, [data?.questions])

  const evaluationNotStarted =
    !loading && !error && Boolean(data) && !data?.evaluationPeriod && (data?.responses?.length ?? 0) === 0

  if (evaluationNotStarted) {
    return (
      <div className="prof-eval-page">
        <section className="prof-eval-filters-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>Evaluation not started</strong>
          <span>No evaluation period is active yet. Results will appear here once the registrar starts one.</span>
        </section>
      </div>
    )
  }

  return (
    <div className="prof-eval-page">
      {/* Filter Controls */}
      <section className="prof-eval-filters-card" aria-label="Filter evaluations">
        <div className="prof-eval-filter-title">
          <Filter size={15} />
          <span>Filter Evaluation Results</span>
        </div>

        <div className="prof-eval-filter-controls">
          <div className="prof-eval-filter-field">
            <label htmlFor="prof-eval-subject">Course</label>
            <select
              id="prof-eval-subject"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="ALL">All Assigned Courses</option>
              {allAvailableSubjects.map((subj) => (
                <option key={subj.subjectCode} value={subj.subjectCode}>
                  {subj.subjectCode} — {subj.subjectTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="prof-eval-filter-field">
            <label htmlFor="prof-eval-semester">Semester</label>
            <select
              id="prof-eval-semester"
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
            >
              <option value="ALL">All Semesters</option>
              {(data?.filters?.semesters || ['1st', '2nd', 'Summer']).map((sem) => (
                <option key={sem} value={sem}>
                  {sem} Semester
                </option>
              ))}
            </select>
          </div>

          <div className="prof-eval-filter-field">
            <label htmlFor="prof-eval-sy">School Year</label>
            <select
              id="prof-eval-sy"
              value={schoolYearFilter}
              onChange={(e) => setSchoolYearFilter(e.target.value)}
            >
              <option value="ALL">All School Years</option>
              {(data?.filters?.schoolYears || ['2026-2027']).map((sy) => (
                <option key={sy} value={sy}>
                  {sy}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="prof-eval-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* 4 Summary Cards */}
      {loading && !data ? (
        <div className="prof-eval-skeleton-grid" aria-busy="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="prof-eval-skeleton-card" />
          ))}
        </div>
      ) : (
        <section className="prof-eval-kpi-grid" aria-label="Evaluation summary metrics">
          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Total Evaluation Responses</span>
              <strong className="prof-eval-kpi-value">{data?.totalResponses || 0}</strong>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Average Teaching Rating</span>
              <div className="prof-eval-kpi-rating-row">
                <strong className="prof-eval-kpi-value">
                  {data && data.totalResponses > 0 ? data.overallAverage.toFixed(2) : '0.00'}
                </strong>
                <span className="prof-eval-kpi-scale">/ 5.00</span>
              </div>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Terms with Feedback</span>
              <strong className="prof-eval-kpi-value">{termsWithFeedback}</strong>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Subjects with Feedback</span>
              <strong className="prof-eval-kpi-value">{subjectsWithFeedback}</strong>
            </div>
          </div>
        </section>
      )}

      {/* Hierarchy: Professor -> Blocks -> Anonymous Students & their Rates/Comments */}
      {loading && !data ? (
        <div className="prof-eval-skeleton-table" aria-busy="true">
          {[1, 2, 3].map((r) => (
            <div key={r} className="prof-eval-skeleton-row" />
          ))}
        </div>
      ) : (
        <section
          className="prof-eval-hierarchy"
          aria-label="Professor blocks and anonymous student evaluations"
        >
          {/* Level 1: Professor */}
          <div className={`prof-eval-prof-card ${isProfessorOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="prof-eval-prof-trigger"
              onClick={() => setIsProfessorOpen((prev) => !prev)}
              aria-expanded={isProfessorOpen}
            >
              <div className="prof-eval-prof-left">
                <div className="prof-eval-prof-avatar">
                  <User size={18} />
                </div>
                <div className="prof-eval-prof-info">
                  <span className="prof-eval-step-tag">Professor</span>
                  <strong className="prof-eval-prof-name">{resolvedProfessorName}</strong>
                </div>
              </div>

              <div className="prof-eval-prof-right">
                <span className="prof-eval-meta-pill">
                  <Layers size={14} />
                  <span>{blockGroups.length} Block(s)</span>
                </span>
                <span className="prof-eval-meta-pill">
                  <UserCheck size={14} />
                  <span>{data?.totalResponses || 0} Anonymous Student(s)</span>
                </span>
                <span className="prof-eval-expand-label">
                  <span>{isProfessorOpen ? 'Hide Blocks' : 'View Blocks'}</span>
                  {isProfessorOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </div>
            </button>

            {/* Level 2: Blocks */}
            {isProfessorOpen && (
              <div className="prof-eval-blocks-container">
                {blockGroups.length === 0 ? (
                  <div className="prof-eval-empty">
                    <BookOpen size={28} />
                    <h3>No Blocks Found</h3>
                    <p>No assigned blocks or evaluation responses match the current filters.</p>
                  </div>
                ) : (
                  <div className="prof-eval-blocks-list">
                    {blockGroups.map((block) => {
                      const isBlockOpen = Boolean(openBlockKeys[block.key])
                      return (
                        <div
                          key={block.key}
                          className={`prof-eval-block-card ${isBlockOpen ? 'is-open' : ''}`}
                        >
                          <button
                            type="button"
                            className="prof-eval-block-trigger"
                            onClick={() => toggleBlock(block.key)}
                            aria-expanded={isBlockOpen}
                          >
                            <div className="prof-eval-block-left">
                              <div className="prof-eval-block-title-row">
                                <span className="prof-eval-step-tag is-block">Block</span>
                                <strong className="prof-eval-block-name">{block.blockTitle}</strong>
                                {(block.semester || block.schoolYear) && (
                                  <span className="prof-eval-block-term">
                                    {block.semester ? `${block.semester} Semester` : ''}
                                    {block.semester && block.schoolYear ? ' • ' : ''}
                                    {block.schoolYear ? `SY ${block.schoolYear}` : ''}
                                  </span>
                                )}
                              </div>

                              {block.subjects.length > 0 && (
                                <div className="prof-eval-block-subjects">
                                  {block.subjects.map((subj) => (
                                    <span key={subj.code} className="prof-eval-subj-chip">
                                      <strong>{subj.code}</strong>
                                      <span>{subj.title}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="prof-eval-block-right">
                              <span className="prof-eval-meta-pill">
                                <MessageSquare size={14} />
                                <span>{block.responses.length} Anonymous Student(s)</span>
                              </span>
                              <span className="prof-eval-expand-label">
                                <span>{isBlockOpen ? 'Hide Students' : 'View Students'}</span>
                                {isBlockOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </span>
                            </div>
                          </button>

                          {/* Level 3: Anonymous Students in this Block */}
                          {isBlockOpen && (
                            <div className="prof-eval-students-container">
                              {block.responses.length === 0 ? (
                                <div className="prof-eval-empty is-compact">
                                  <p>No anonymous student evaluations submitted for this block yet.</p>
                                </div>
                              ) : (
                                <div className="prof-eval-students-list">
                                  {block.responses.map((studentResp, idx) => {
                                    const isStudentOpen = Boolean(openStudentIds[studentResp.id])
                                    const studentLabel =
                                      studentResp.anonymousLabel ||
                                      `Anonymous Student #${idx + 1}`

                                    return (
                                      <div
                                        key={studentResp.id}
                                        className={`prof-eval-student-card ${isStudentOpen ? 'is-open' : ''}`}
                                      >
                                        <button
                                          type="button"
                                          className="prof-eval-student-trigger"
                                          onClick={() => toggleStudent(studentResp.id)}
                                          aria-expanded={isStudentOpen}
                                        >
                                          <div className="prof-eval-student-left">
                                            <span className="prof-eval-anon-badge">
                                              {studentLabel}
                                            </span>
                                            {studentResp.subjectCode && (
                                              <span className="prof-eval-code-badge">
                                                {studentResp.subjectCode}
                                              </span>
                                            )}
                                            {studentResp.subjectTitle && (
                                              <span className="prof-eval-student-subj">
                                                {studentResp.subjectTitle}
                                              </span>
                                            )}
                                          </div>

                                          <div className="prof-eval-student-right">
                                            {studentResp.submittedAt && (
                                              <time className="prof-eval-comment-date">
                                                {new Date(studentResp.submittedAt).toLocaleDateString()}
                                              </time>
                                            )}
                                            <span className="prof-eval-expand-label">
                                              <span>
                                                {isStudentOpen
                                                  ? 'Hide Rates & Comment'
                                                  : 'View Rates & Comment'}
                                              </span>
                                              {isStudentOpen ? (
                                                <ChevronDown size={14} />
                                              ) : (
                                                <ChevronRight size={14} />
                                              )}
                                            </span>
                                          </div>
                                        </button>

                                        {/* Revealed on click: Student's Rates & Comment */}
                                        {isStudentOpen && (
                                          <div className="prof-eval-student-details">
                                            <div className="prof-eval-student-summary-bar">
                                              <div className="prof-eval-student-overall">
                                                <span className="prof-eval-student-detail-label">
                                                  Overall Rating
                                                </span>
                                                <div className="prof-eval-student-score-badge">
                                                  {studentResp.emoji && (
                                                    <span aria-hidden="true">{studentResp.emoji}</span>
                                                  )}
                                                  <strong>
                                                    {Number(studentResp.averageRating || 0).toFixed(2)} / 5.00
                                                  </strong>
                                                  <span>({studentResp.ratingLabel})</span>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="prof-eval-student-comment-box">
                                              <span className="prof-eval-student-detail-label">
                                                Anonymous Comment
                                              </span>
                                              <p className="prof-eval-comment-body">
                                                {studentResp.comment
                                                  ? studentResp.comment
                                                  : 'No additional written comment provided.'}
                                              </p>
                                            </div>

                                            {Array.isArray(studentResp.ratings) &&
                                              studentResp.ratings.length > 0 && (
                                                <div className="prof-eval-student-ratings-wrap">
                                                  <span className="prof-eval-student-detail-label">
                                                    Submitted Question Ratings
                                                  </span>
                                                  <div className="prof-eval-student-ratings-grid">
                                                    {studentResp.ratings.map((rt) => (
                                                      <div
                                                        key={rt.questionNumber}
                                                        className="prof-eval-student-rating-item"
                                                      >
                                                        <div className="prof-eval-student-rating-q">
                                                          <span className="prof-eval-qnum">
                                                            Q{rt.questionNumber}
                                                          </span>
                                                          <span>
                                                            {rt.questionText ||
                                                              questionLookup.get(rt.questionNumber) ||
                                                              `Question ${rt.questionNumber}`}
                                                          </span>
                                                        </div>
                                                        <div className="prof-eval-student-rating-val">
                                                          {rt.emoji && (
                                                            <span aria-hidden="true">{rt.emoji}</span>
                                                          )}
                                                          <strong>{rt.score} / 5</strong>
                                                          {rt.label && (
                                                            <span className="prof-eval-label-badge">
                                                              {rt.label}
                                                            </span>
                                                          )}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

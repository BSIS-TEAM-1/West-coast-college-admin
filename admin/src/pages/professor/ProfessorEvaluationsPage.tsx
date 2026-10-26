import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users
} from 'lucide-react'
import {
  EMOJI_RATING_SCALE,
  EVALUATION_QUESTIONS,
  fetchProfessorEvaluations,
  type ProfessorEvaluationsData
} from '../../lib/evaluationApi'
import './ProfessorEvaluationsPage.css'

export default function ProfessorEvaluationsPage() {
  const [data, setData] = useState<ProfessorEvaluationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [semesterFilter, setSemesterFilter] = useState('ALL')
  const [schoolYearFilter, setSchoolYearFilter] = useState('ALL')
  const [activeTab, setActiveTab] = useState<'questions' | 'subjects' | 'comments'>('questions')

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

  const questionList = data?.questionSummaries?.length
    ? data.questionSummaries
    : EVALUATION_QUESTIONS.map((q) => ({
        questionNumber: q.number,
        questionText: q.text,
        averageScore: 0,
        responseCount: 0,
        emoji: '',
        label: 'No Data',
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>
      }))

  const overallDistribution = useMemo(() => {
    const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const q of questionList) {
      for (const score of [1, 2, 3, 4, 5]) {
        totals[score] += Number(q.distribution?.[score] || 0)
      }
    }
    const sumAll = Object.values(totals).reduce((a, b) => a + b, 0)
    return { totals, sumAll }
  }, [questionList])

  const completionPct =
    data?.completionPercentage !== undefined
      ? data.completionPercentage
      : data?.totalResponses
        ? 100
        : 0

  const subjectsWithFeedback =
    data?.subjectsWithFeedbackCount !== undefined
      ? data.subjectsWithFeedbackCount
      : data?.subjectSummaries?.length || 0

  return (
    <div className="prof-eval-page">
      {/* Page Header */}
      <header className="prof-eval-header">
        <div className="prof-eval-header-left">
          <div className="prof-eval-eyebrow">
            <ShieldCheck size={14} />
            <span>Anonymous Faculty Feedback Portal</span>
          </div>
          <h1 className="prof-eval-title">Teaching Effectiveness Evaluations</h1>
          <p className="prof-eval-subtitle">
            Aggregated student ratings, 10-question diagnostic summaries, and anonymized feedback for your assigned classes.
          </p>
        </div>

        <button
          type="button"
          className="prof-eval-refresh-btn"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'prof-eval-spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh Results'}</span>
        </button>
      </header>

      {/* Evaluation-Period & Anonymity Information Banner */}
      <section className="prof-eval-period-bar" aria-label="Evaluation period and confidentiality details">
        <div className="prof-eval-period-item">
          <Calendar size={16} className="prof-eval-bar-icon" />
          <div>
            <span className="prof-eval-bar-label">Evaluation Period</span>
            <strong>
              {data?.evaluationPeriod
                ? `${data.evaluationPeriod.semester} Semester • SY ${data.evaluationPeriod.schoolYear}`
                : 'Current Academic Term'}
            </strong>
          </div>
        </div>

        <div className="prof-eval-period-item">
          <Clock size={16} className="prof-eval-bar-icon" />
          <div>
            <span className="prof-eval-bar-label">Schedule &amp; Deadline</span>
            <strong>
              {data?.evaluationPeriod?.deadlineDisplay
                ? `Closes ${data.evaluationPeriod.deadlineDisplay}`
                : 'Managed by Office of the Registrar'}
            </strong>
          </div>
        </div>

        <div className="prof-eval-period-item prof-eval-period-privacy">
          <ShieldCheck size={16} className="prof-eval-bar-icon" />
          <span>
            Student identities, student numbers, and account IDs are strictly omitted from faculty evaluation reports.
          </span>
        </div>
      </section>

      {/* Filter Controls */}
      <section className="prof-eval-filters-card" aria-label="Filter evaluations">
        <div className="prof-eval-filter-title">
          <Filter size={15} />
          <span>Filter Evaluation Results</span>
        </div>

        <div className="prof-eval-filter-controls">
          <div className="prof-eval-filter-field">
            <label htmlFor="prof-eval-subject">Subject</label>
            <select
              id="prof-eval-subject"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="ALL">All Assigned Subjects</option>
              {(data?.filters?.subjects || []).map((subj) => (
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

      {/* 4 Professional Summary Cards */}
      {loading && !data ? (
        <div className="prof-eval-skeleton-grid" aria-busy="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="prof-eval-skeleton-card" />
          ))}
        </div>
      ) : (
        <section className="prof-eval-kpi-grid" aria-label="Evaluation summary metrics">
          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-icon">
              <Users size={20} />
            </div>
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Total Evaluation Responses</span>
              <strong className="prof-eval-kpi-value">{data?.totalResponses || 0}</strong>
              <span className="prof-eval-kpi-sub">Verified anonymous submissions</span>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-icon">
              <Award size={20} />
            </div>
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Average Teaching Rating</span>
              <div className="prof-eval-kpi-rating-row">
                <strong className="prof-eval-kpi-value">
                  {data && data.totalResponses > 0 ? data.overallAverage.toFixed(2) : '0.00'}
                </strong>
                <span className="prof-eval-kpi-scale">/ 5.00</span>
              </div>
              <span className="prof-eval-kpi-sub">
                {data && data.totalResponses > 0 ? data.overallLabel : 'No ratings recorded yet'}
              </span>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-icon">
              <CheckCircle2 size={20} />
            </div>
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Evaluation Completion</span>
              <strong className="prof-eval-kpi-value">{completionPct}%</strong>
              <div className="prof-eval-mini-progress">
                <div
                  className="prof-eval-mini-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, completionPct))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="prof-eval-kpi-card">
            <div className="prof-eval-kpi-icon">
              <BookOpen size={20} />
            </div>
            <div className="prof-eval-kpi-content">
              <span className="prof-eval-kpi-label">Subjects with Feedback</span>
              <strong className="prof-eval-kpi-value">{subjectsWithFeedback}</strong>
              <span className="prof-eval-kpi-sub">
                Out of {data?.filters?.subjects?.length || 0} assigned subject(s)
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Overall Rating Distribution & Scale Reference */}
      <section className="prof-eval-distribution-card" aria-label="Overall rating distribution">
        <div className="prof-eval-card-head">
          <div>
            <h2>Rating Scale Distribution</h2>
            <p>Aggregate distribution of student ratings across all 10 evaluation criteria.</p>
          </div>
          <div className="prof-eval-scale-chips">
            {EMOJI_RATING_SCALE.map((item) => (
              <span key={item.score} className="prof-eval-scale-chip">
                <span aria-hidden="true">{item.emoji}</span>
                <strong>{item.score}</strong>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="prof-eval-dist-bars">
          {[5, 4, 3, 2, 1].map((score) => {
            const scaleItem = EMOJI_RATING_SCALE.find((s) => s.score === score)
            const count = overallDistribution.totals[score] || 0
            const pct =
              overallDistribution.sumAll > 0
                ? Math.round((count / overallDistribution.sumAll) * 100)
                : 0
            return (
              <div key={score} className="prof-eval-dist-row">
                <div className="prof-eval-dist-label">
                  <span className="prof-eval-dist-emoji" aria-hidden="true">
                    {scaleItem?.emoji}
                  </span>
                  <strong>{score}</strong>
                  <span>{scaleItem?.label}</span>
                </div>
                <div className="prof-eval-dist-track">
                  <div
                    className={`prof-eval-dist-fill score-${score}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="prof-eval-dist-meta">
                  <strong>{pct}%</strong>
                  <span>({count})</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section Navigation Tabs */}
      <div className="prof-eval-tabs" role="tablist" aria-label="Evaluation detail views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'questions'}
          className={`prof-eval-tab ${activeTab === 'questions' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('questions')}
        >
          <BarChart3 size={16} />
          <span>10-Question Breakdown</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subjects'}
          className={`prof-eval-tab ${activeTab === 'subjects' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('subjects')}
        >
          <BookOpen size={16} />
          <span>Subject Summaries ({data?.subjectSummaries?.length || 0})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'comments'}
          className={`prof-eval-tab ${activeTab === 'comments' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          <MessageSquare size={16} />
          <span>Anonymous Comments ({data?.comments?.length || 0})</span>
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="prof-eval-skeleton-table" aria-busy="true">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="prof-eval-skeleton-row" />
          ))}
        </div>
      ) : activeTab === 'questions' ? (
        <section className="prof-eval-panel" aria-label="Ten question diagnostic breakdown">
          <div className="prof-eval-table-wrap">
            <table className="prof-eval-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>No.</th>
                  <th>Evaluation Criterion</th>
                  <th style={{ width: '130px' }}>Average Score</th>
                  <th style={{ width: '140px' }}>Qualitative Rating</th>
                  <th style={{ width: '320px' }}>Rating Distribution (1–5)</th>
                  <th style={{ width: '100px' }} className="text-right">Responses</th>
                </tr>
              </thead>
              <tbody>
                {questionList.map((q) => {
                  const pct = Math.min(100, Math.max(0, (q.averageScore / 5) * 100))
                  return (
                    <tr key={q.questionNumber}>
                      <td>
                        <span className="prof-eval-qnum">Q{q.questionNumber}</span>
                      </td>
                      <td>
                        <strong className="prof-eval-qtext">{q.questionText}</strong>
                      </td>
                      <td>
                        <div className="prof-eval-score-cell">
                          <strong>{q.responseCount > 0 ? q.averageScore.toFixed(2) : '—'}</strong>
                          <span>/ 5.00</span>
                        </div>
                      </td>
                      <td>
                        <span className="prof-eval-label-badge">
                          {q.responseCount > 0 ? q.label : 'No Ratings'}
                        </span>
                      </td>
                      <td>
                        <div className="prof-eval-qbar-wrap">
                          <div className="prof-eval-qbar-track">
                            <div className="prof-eval-qbar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="prof-eval-qdist-mini">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <span key={score}>
                                {score}: <strong>{q.distribution?.[score] || 0}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="text-right">{q.responseCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'subjects' ? (
        <section className="prof-eval-panel" aria-label="Subject evaluation summaries">
          {!data?.subjectSummaries?.length ? (
            <div className="prof-eval-empty">
              <BookOpen size={30} />
              <h3>No Subject Evaluations Recorded</h3>
              <p>Aggregated subject feedback will appear here once students submit their evaluations.</p>
            </div>
          ) : (
            <div className="prof-eval-table-wrap">
              <table className="prof-eval-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Academic Term</th>
                    <th>Responses</th>
                    <th>Average Rating</th>
                    <th>Qualitative Descriptor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjectSummaries.map((item) => (
                    <tr key={`${item.subjectCode}-${item.semester}-${item.schoolYear}`}>
                      <td>
                        <span className="prof-eval-code-badge">{item.subjectCode}</span>
                      </td>
                      <td>
                        <strong>{item.subjectTitle}</strong>
                      </td>
                      <td>
                        {item.semester} Semester • SY {item.schoolYear}
                      </td>
                      <td>{item.responseCount}</td>
                      <td>
                        <strong>{item.averageRating.toFixed(2)}</strong> / 5.00
                      </td>
                      <td>
                        <span className="prof-eval-label-badge">{item.label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="prof-eval-panel" aria-label="Anonymous student comments">
          {!data?.responses?.length ? (
            <div className="prof-eval-empty">
              <MessageSquare size={30} />
              <h3>No Anonymous Feedback Submitted Yet</h3>
              <p>Anonymous student comments for your assigned classes will be listed here.</p>
            </div>
          ) : (
            <div className="prof-eval-comments-list">
              {data.responses.map((item) => (
                <article key={item.id} className="prof-eval-comment-item">
                  <div className="prof-eval-comment-top">
                    <div className="prof-eval-comment-meta">
                      <span className="prof-eval-anon-tag">{item.anonymousLabel}</span>
                      <span className="prof-eval-code-badge">{item.subjectCode}</span>
                      <span className="prof-eval-comment-subj">{item.subjectTitle}</span>
                      <span className="prof-eval-comment-term">
                        {item.semester} Sem • SY {item.schoolYear}
                      </span>
                    </div>
                    <div className="prof-eval-comment-right">
                      <span className="prof-eval-score-pill">
                        Rating: <strong>{item.averageRating.toFixed(2)} / 5.00</strong> ({item.ratingLabel})
                      </span>
                      <time className="prof-eval-comment-date">
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : ''}
                      </time>
                    </div>
                  </div>
                  <p className="prof-eval-comment-body">
                    {item.comment
                      ? item.comment
                      : 'No additional written comment provided (10-question rating completed).'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

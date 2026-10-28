import { API_URL, getStoredToken } from './authApi'

export interface EvaluationQuestion {
  number: number
  text: string
}

export interface EmojiScaleItem {
  score: 1 | 2 | 3 | 4 | 5
  value: 1 | 2 | 3 | 4 | 5
  emoji: string
  label: string
  color: string
}

export const EVALUATION_QUESTIONS: EvaluationQuestion[] = [
  { number: 1, text: 'The professor explains lessons clearly.' },
  { number: 2, text: 'The professor demonstrates knowledge of the subject.' },
  { number: 3, text: 'The professor comes to class prepared and on time.' },
  { number: 4, text: 'The professor treats students fairly and respectfully.' },
  { number: 5, text: 'The professor communicates effectively.' },
  { number: 6, text: 'The professor encourages student participation.' },
  { number: 7, text: 'The professor manages class time effectively.' },
  { number: 8, text: 'The professor provides helpful feedback.' },
  { number: 9, text: 'The professor uses effective teaching methods.' },
  { number: 10, text: 'Overall, the professor demonstrates teaching effectiveness.' }
]

export const EMOJI_RATING_SCALE: EmojiScaleItem[] = [
  { score: 1, value: 1, emoji: '😡', label: 'Very Poor', color: '#ef4444' },
  { score: 2, value: 2, emoji: '😕', label: 'Poor', color: '#f97316' },
  { score: 3, value: 3, emoji: '😐', label: 'Average', color: '#eab308' },
  { score: 4, value: 4, emoji: '😊', label: 'Good', color: '#22c55e' },
  { score: 5, value: 5, emoji: '🤩', label: 'Excellent', color: '#10b981' }
]

export interface EvaluationPeriodInfo {
  id: string
  _id: string
  title: string
  semester: '1st' | '2nd' | 'Summer'
  schoolYear: string
  startDate: string
  startTime: string
  startAt: string | null
  startDisplay: string
  deadlineDate: string
  closingTime: string
  endAt: string | null
  deadlineDisplay: string
  status: 'draft' | 'scheduled' | 'open' | 'extended' | 'closed'
  isOpen: boolean
  isExpired: boolean
  applicablePrograms?: string[]
  applicableSubjects?: string
  applicableProfessors?: string
  description?: string
  totalResponses?: number
  averageRating?: number
  professorCount?: number
  subjectCount?: number
}

export interface QuestionRatingDetail {
  questionNumber: number
  questionText: string
  score: number
  emoji: string
  label: string
}

export interface ProfessorQuestionSummary {
  questionNumber: number
  questionText: string
  averageScore: number
  responseCount: number
  emoji: string
  label: string
  distribution: Record<number, number>
}

export interface ProfessorAnonymousFeedback {
  id: string
  anonymousLabel: string
  subjectCode: string
  subjectTitle: string
  semester: string
  schoolYear: string
  averageRating: number
  emoji: string
  ratingLabel: string
  comment: string
  ratings: QuestionRatingDetail[]
  submittedAt: string
}

export interface ProfessorEvaluationsData {
  professorName: string
  totalResponses: number
  subjectsWithFeedbackCount?: number
  overallAverage: number
  overallEmoji: string
  overallLabel: string
  evaluationPeriod?: EvaluationPeriodInfo | null
  emojiScale: EmojiScaleItem[]
  questions: EvaluationQuestion[]
  questionSummaries: ProfessorQuestionSummary[]
  subjectSummaries: Array<{
    subjectCode: string
    subjectTitle: string
    semester: string
    schoolYear: string
    responseCount: number
    averageRating: number
    emoji: string
    label: string
  }>
  comments: ProfessorAnonymousFeedback[]
  responses: ProfessorAnonymousFeedback[]
  filters: {
    subjects: Array<{ subjectCode: string; subjectTitle: string }>
    semesters: string[]
    schoolYears: string[]
  }
}

export interface RegistrarEvaluationRecord {
  id: string
  _id: string
  recordNumber?: string
  semester: string
  schoolYear: string
  subjectCode: string
  subjectTitle: string
  sectionCode?: string
  course?: string
  professorId: string | null
  professorName: string
  averageRating: number
  emoji: string
  ratingLabel: string
  ratings: QuestionRatingDetail[]
  comment: string
  submittedAt: string
}

export interface FacultyCourseAssignment {
  subjectId: string
  subjectCode: string
  subjectTitle: string
  sectionId: string
  sectionCode: string
  sectionLabel: string
  semester: string
  schoolYear: string
  courseCode?: number | string | null
  courseShortLabel?: string
  courseLabel?: string
  studentCount?: number
}

export interface FacultyCourseLoad {
  professorId: string
  username?: string
  displayName?: string
  label: string
  uid?: string
  status?: string
  assignments: FacultyCourseAssignment[]
}

export interface RegistrarEvaluationOverviewData {
  activePeriod: EvaluationPeriodInfo | null
  questions: EvaluationQuestion[]
  emojiScale: EmojiScaleItem[]
  progress: {
    totalResponses: number
    averageRating: number
    professorCount: number
    subjectCount: number
    semester: string
    schoolYear: string
  }
  evaluations: RegistrarEvaluationRecord[]
  professorSummaries: Array<{
    professorName: string
    responseCount: number
    subjectCount: number
    subjects: string[]
    averageRating: number
    emoji: string
    label: string
  }>
  subjectSummaries: Array<{
    subjectCode: string
    subjectTitle: string
    semester: string
    schoolYear: string
    responseCount: number
    professorCount: number
    averageRating: number
    emoji: string
    label: string
  }>
}

async function getStaffHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  if (!token) throw new Error('Authentication required.')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

export async function fetchProfessorEvaluations(filters?: {
  subjectCode?: string
  semester?: string
  schoolYear?: string
}): Promise<ProfessorEvaluationsData> {
  const headers = await getStaffHeaders()
  const query = new URLSearchParams()
  if (filters?.subjectCode && filters.subjectCode !== 'ALL') query.set('subjectCode', filters.subjectCode)
  if (filters?.semester && filters.semester !== 'ALL') query.set('semester', filters.semester)
  if (filters?.schoolYear && filters.schoolYear !== 'ALL') query.set('schoolYear', filters.schoolYear)
  const qs = query.toString()

  const response = await fetch(`${API_URL}/api/professor/evaluations${qs ? `?${qs}` : ''}`, {
    headers
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load professor evaluations.')
  }
  return payload.data
}

export async function fetchRegistrarEvaluationPeriods(): Promise<EvaluationPeriodInfo[]> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluation-periods`, { headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load evaluation periods.')
  }
  return payload.data || []
}

export async function createRegistrarEvaluationPeriod(input: {
  title?: string
  semester: '1st' | '2nd' | 'Summer'
  schoolYear: string
  startDate: string
  startTime: string
  deadlineDate: string
  closingTime: string
  description?: string
  saveAsDraft?: boolean
  applicablePrograms?: string[]
  applicableSubjects?: string
  applicableProfessors?: string
}): Promise<EvaluationPeriodInfo> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluation-periods`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to create evaluation period.')
  }
  return payload.data
}

export async function updateRegistrarEvaluationPeriodStatus(
  periodId: string,
  input: {
    action: 'draft' | 'start' | 'close' | 'extend' | 'reopen'
    deadlineDate?: string
    closingTime?: string
    startDate?: string
    startTime?: string
    reason?: string
  }
): Promise<EvaluationPeriodInfo> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluation-periods/${periodId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(input)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to update evaluation period.')
  }
  return payload.data
}

export async function deleteRegistrarEvaluationPeriod(
  periodId: string
): Promise<{ id: string; deletedResponses: number }> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluation-periods/${periodId}`, {
    method: 'DELETE',
    headers
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to remove evaluation period.')
  }
  return payload.data
}

export async function fetchFacultyCourseLoads(filters?: {
  semester?: string
  schoolYear?: string
}): Promise<FacultyCourseLoad[]> {
  const headers = await getStaffHeaders()
  const query = new URLSearchParams()
  if (filters?.semester && filters.semester !== 'ALL') query.set('semester', filters.semester)
  if (filters?.schoolYear && filters.schoolYear !== 'ALL') query.set('year', filters.schoolYear)
  const qs = query.toString()

  const response = await fetch(`${API_URL}/api/registrar/professor-course-loads${qs ? `?${qs}` : ''}`, {
    headers
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load faculty course assignments.')
  }
  const data = payload?.data || payload
  return Array.isArray(data?.professors) ? data.professors : []
}

export async function fetchRegistrarEvaluationOverview(filters?: {
  semester?: string
  schoolYear?: string
  subjectCode?: string
  professorName?: string
}): Promise<RegistrarEvaluationOverviewData> {
  const headers = await getStaffHeaders()
  const query = new URLSearchParams()
  if (filters?.semester) query.set('semester', filters.semester)
  if (filters?.schoolYear) query.set('schoolYear', filters.schoolYear)
  if (filters?.subjectCode) query.set('subjectCode', filters.subjectCode)
  if (filters?.professorName) query.set('professorName', filters.professorName)
  const qs = query.toString()

  const response = await fetch(`${API_URL}/api/registrar/evaluations/overview${qs ? `?${qs}` : ''}`, {
    headers
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load evaluation overview.')
  }
  return payload.data
}

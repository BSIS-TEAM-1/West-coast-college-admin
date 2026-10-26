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
  totalEnrolledStudents?: number
  totalRequiredEvaluations?: number
  completedEvaluations?: number
  incompleteEvaluations?: number
  completionRate?: number
}

export interface StudentSubjectEvaluationItem {
  enrollmentId: string
  subjectId: string | null
  subjectCode: string
  subjectTitle: string
  units: number
  schedule: string
  room: string
  instructor: string
  professorName: string
  professorId: string | null
  status: string
  evaluationRequired: boolean
  evaluationCompleted: boolean
  completedAt: string | null
  canEvaluate: boolean
  gradePublished: boolean
  gradeLocked: boolean
  lockReason: string | null
  grade: number | null
  gradeMark: string | null
  remarks: string
}

export interface StudentEvaluationsResponse {
  questions: EvaluationQuestion[]
  emojiScale: EmojiScaleItem[]
  anonymityNotice: string
  period: EvaluationPeriodInfo | null
  semester: string
  schoolYear: string
  summary: {
    requiredCount: number
    completedCount: number
    pendingCount: number
    allCompleted: boolean
    gradesLocked: boolean
  }
  subjects: StudentSubjectEvaluationItem[]
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
  sectionCode: string
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
  totalExpectedResponses?: number
  completionPercentage?: number
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
  submissionStatus?: string
  semester: string
  schoolYear: string
  subjectCode: string
  subjectTitle: string
  sectionCode: string
  course: string
  yearLevel: number | null
  professorId: string | null
  professorName: string
  averageRating: number
  emoji: string
  ratingLabel: string
  ratings: QuestionRatingDetail[]
  comment: string
  submittedAt: string
  revealCount: number
  studentIdentity: {
    isRevealed: boolean
    maskedLabel?: string
    studentId?: string
    studentNumber?: string
    studentName?: string
    course?: string
    yearLevel?: number | null
    sectionCode?: string
    completedAt?: string
  }
}

export interface IdentityRevealAuditEntry {
  id: string
  responseId: string
  semester: string
  schoolYear: string
  subjectCode: string
  subjectTitle: string
  professorName: string
  revealedStudentNumber: string
  revealedStudentName: string
  registrarUsername: string
  registrarDisplayName: string
  registrarRole: string
  reason: string
  ipAddress: string
  revealedAt: string
}

export interface RegistrarEvaluationOverviewData {
  activePeriod: EvaluationPeriodInfo | null
  questions: EvaluationQuestion[]
  emojiScale: EmojiScaleItem[]
  progress: {
    totalStudentsEnrolled: number
    studentsFullyCompleted: number
    studentsIncomplete: number
    totalRequiredEvaluations: number
    totalSubmittedEvaluations: number
    pendingEvaluations: number
    completionPercentage: number
  }
  incompleteEvaluations: Array<{
    studentId: string
    studentNumber: string
    studentName: string
    course: string
    yearLevel: number | null
    semester: string
    schoolYear: string
    requiredCount: number
    completedCount: number
    pendingCount: number
    pendingSubjects: Array<{
      subjectCode: string
      subjectTitle: string
      professorName: string
    }>
  }>
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
  revealLogs: IdentityRevealAuditEntry[]
}

const STUDENT_TOKEN_KEY = 'wcc_student_token'
const STUDENT_INFO_KEY = 'wcc_student_info'

export function getStoredStudentToken(): string | null {
  try {
    return localStorage.getItem(STUDENT_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredStudentToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(STUDENT_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(STUDENT_TOKEN_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredStudentInfo(): {
  id?: string
  studentNumber: string
  fullName: string
  course?: string
  yearLevel?: number
  semester?: string
  schoolYear?: string
} | null {
  try {
    const raw = localStorage.getItem(STUDENT_INFO_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearStoredStudentToken(): void {
  try {
    localStorage.removeItem(STUDENT_TOKEN_KEY)
    localStorage.removeItem(STUDENT_INFO_KEY)
  } catch {
    // ignore storage errors
  }
}

async function getStaffHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  if (!token) throw new Error('Authentication required.')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

export async function loginStudentForPortal(studentNumber: string, password: string): Promise<{
  token: string
  student: {
    id: string
    studentNumber: string
    firstName: string
    lastName: string
    fullName: string
    course: string | number
    yearLevel: number
    semester: string
    schoolYear: string
  }
}> {
  const response = await fetch(`${API_URL}/api/student/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentNumber: studentNumber.trim(), password })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Invalid student credentials.')
  }
  const token = payload?.data?.accessToken || payload?.accessToken || payload?.token
  if (!token) {
    throw new Error('Login succeeded but no student access token was returned.')
  }
  setStoredStudentToken(token)
  const studentObj = payload?.data?.student || payload?.student
  if (studentObj) {
    try {
      localStorage.setItem(
        STUDENT_INFO_KEY,
        JSON.stringify({
          ...studentObj,
          course: studentObj.course != null ? String(studentObj.course) : undefined
        })
      )
    } catch {
      // ignore storage errors
    }
  }
  return {
    token,
    student: studentObj
  }
}

export const studentPortalLogin = loginStudentForPortal

export async function fetchStudentGradesWithLocks(studentToken?: string | null): Promise<any> {
  const token = studentToken || getStoredStudentToken()
  if (!token) throw new Error('Student authentication required.')
  const response = await fetch(`${API_URL}/api/student/grades`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load student grades.')
  }
  return payload.data || payload
}

export async function fetchStudentEvaluations(
  studentToken: string,
  params?: { semester?: string; schoolYear?: string }
): Promise<StudentEvaluationsResponse> {
  const query = new URLSearchParams()
  if (params?.semester) query.set('semester', params.semester)
  if (params?.schoolYear) query.set('schoolYear', params.schoolYear)
  const qs = query.toString()

  const response = await fetch(`${API_URL}/api/student/evaluations${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json'
    }
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load student evaluations.')
  }
  return payload.data
}

export async function submitStudentProfessorEvaluation(
  studentToken: string,
  input: {
    subjectCode: string
    subjectId?: string | null
    semester?: string
    schoolYear?: string
    ratings: number[]
    comment?: string
  }
): Promise<{
  message: string
  data: {
    subjectCode: string
    subjectTitle: string
    professorName: string
    averageRating: number
    submittedAt: string
    summary: {
      requiredCount: number
      completedCount: number
      pendingCount: number
      allCompleted: boolean
      gradesLocked: boolean
    }
  }
}> {
  const response = await fetch(`${API_URL}/api/student/evaluations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to submit professor evaluation.')
  }
  return payload
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

export async function revealEvaluationStudentIdentity(
  responseId: string,
  reason: string
): Promise<{
  responseId: string
  studentIdentity: Required<RegistrarEvaluationRecord['studentIdentity']>
  auditRecord: {
    id: string
    registrarUsername: string
    registrarDisplayName: string
    reason: string
    revealedAt: string
  }
}> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluations/${responseId}/reveal-identity`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to reveal student identity.')
  }
  return payload.data
}

export async function fetchIdentityRevealAuditLogs(): Promise<IdentityRevealAuditEntry[]> {
  const headers = await getStaffHeaders()
  const response = await fetch(`${API_URL}/api/registrar/evaluations/reveal-logs`, { headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load identity reveal audit logs.')
  }
  return payload.data || []
}

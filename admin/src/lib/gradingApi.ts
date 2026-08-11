import { authorizedFetch } from './blockAssignmentShared'

// ─── Types ───
export type GradeSubmissionStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected'

export interface GradeSubmissionSummary {
  _id: string
  studentId: { _id: string; studentNumber: string; firstName: string; lastName: string; suffix?: string; course?: number; yearLevel?: number }
  studentNumber: string
  schoolYear: string
  semester: string
  yearLevel: number
  course: string
  gradeSubmission: {
    status: GradeSubmissionStatus
    submittedAt?: string | null
    submittedBy?: string | null
    reviewedAt?: string | null
    reviewedBy?: string | null
    reviewRemarks?: string
  }
  subjects: Array<{
    subjectId: string
    code: string
    title: string
    units: number
    grade: number | null
    status: string
    remarks?: string
  }>
}

export interface GradeAuditEntry {
  _id: string
  enrollmentId: string
  studentId: string
  studentNumber: string
  subjectId: string | null
  subjectCode: string
  oldGrade: number | null
  newGrade: number | null
  oldRemarks: string
  newRemarks: string
  action: string
  changedBy: string
  changedByRole?: string
  schoolYear?: string
  semester?: string
  createdAt: string
}

// ─── Grade Submission API ───
export async function listGradeSubmissions(filters: { status?: GradeSubmissionStatus; schoolYear?: string; semester?: string; course?: string; yearLevel?: number; page?: number; limit?: number } = {}): Promise<{ data: GradeSubmissionSummary[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.schoolYear) params.set('schoolYear', filters.schoolYear)
  if (filters.semester) params.set('semester', filters.semester)
  if (filters.course) params.set('course', filters.course)
  if (filters.yearLevel) params.set('yearLevel', String(filters.yearLevel))
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary[]; pagination: any }>(`/api/registrar/grade-submissions?${params.toString()}`)
  return { data: res.data, pagination: res.pagination }
}

export async function getGradeSubmission(enrollmentId: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}`)
  return res.data
}

export async function approveGradeSubmission(enrollmentId: string, remarks?: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remarks })
  })
  return res.data
}

export async function rejectGradeSubmission(enrollmentId: string, remarks?: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remarks })
  })
  return res.data
}

export async function revertGradeSubmissionToDraft(enrollmentId: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/revert-to-draft`, {
    method: 'POST'
  })
  return res.data
}

export async function submitGrades(enrollmentId: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/professor/grade-submissions/${enrollmentId}/submit`, {
    method: 'POST'
  })
  return res.data
}

export async function getGradeAuditTrail(enrollmentId: string): Promise<GradeAuditEntry[]> {
  const res = await authorizedFetch<{ success: boolean; data: GradeAuditEntry[] }>(`/api/registrar/grade-submissions/${enrollmentId}/audit`)
  return res.data
}

export async function getStudentGradeAudit(studentId: string): Promise<GradeAuditEntry[]> {
  const res = await authorizedFetch<{ success: boolean; data: GradeAuditEntry[] }>(`/api/registrar/students/${studentId}/grade-audit`)
  return res.data
}

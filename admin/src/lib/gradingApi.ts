import { authorizedFetch } from './blockAssignmentShared'

// ─── Types ───
export type GradeSubmissionStatus = 'Draft' | 'Submitted' | 'Verified' | 'Published' | 'Returned' | 'Rejected'

export interface GradeSubmissionSummary {
  _id: string
  enrollmentId?: string
  instructor?: string
  studentId: { _id: string; studentNumber: string; firstName: string; lastName: string; suffix?: string; course?: number; yearLevel?: number }
  studentNumber: string
  schoolYear: string
  semester: string
  yearLevel: number
  course: string
  subjectCodes?: string
  gradedCount?: number
  totalCount?: number
  professorSubmissionStatus?: GradeSubmissionStatus
  submittedAt?: string | null
  gradeSubmission: {
    status: GradeSubmissionStatus
    submittedAt?: string | null
    submittedBy?: string | null
    verifiedAt?: string | null
    verifiedBy?: string | null
    publishedAt?: string | null
    publishedBy?: string | null
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
    gradeMark?: string | null
    status: string
    remarks?: string
    instructor?: string
    submissionStatus?: string
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
  reason?: string
  gradeChangeRequestId?: string | null
  createdAt: string
}

export type GradeChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected'

export interface GradeChangeRequest {
  _id: string
  enrollmentId: string
  studentId: string
  studentNumber: string
  subjectId: string
  subjectCode: string
  sectionId: string | null
  sectionCode: string
  schoolYear: string
  semester: string
  currentGrade: number
  requestedGrade: number
  reason: string
  supportingInfo: string
  status: GradeChangeRequestStatus
  requestedBy: { _id: string; username: string; displayName?: string; accountType?: string } | string
  requestedAt: string
  reviewedBy: { _id: string; username: string; displayName?: string; accountType?: string } | string | null
  reviewedAt: string | null
  reviewRemarks: string
  appliedAt: string | null
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

export async function verifyGradeSubmission(enrollmentId: string, remarks?: string, instructor?: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remarks, instructor })
  })
  return res.data
}

export async function publishGradeSubmission(enrollmentId: string, remarks?: string, instructor?: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remarks, instructor })
  })
  return res.data
}

export async function returnGradeSubmission(enrollmentId: string, remarks: string, instructor?: string): Promise<GradeSubmissionSummary> {
  const res = await authorizedFetch<{ success: boolean; data: GradeSubmissionSummary }>(`/api/registrar/grade-submissions/${enrollmentId}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remarks, instructor })
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

export async function getGradeAuditTrail(enrollmentId: string, instructor?: string): Promise<GradeAuditEntry[]> {
  const query = instructor ? `?instructor=${encodeURIComponent(instructor)}` : ''
  const res = await authorizedFetch<{ success: boolean; data: GradeAuditEntry[] }>(`/api/registrar/grade-submissions/${enrollmentId}/audit${query}`)
  return res.data
}

export async function getStudentGradeAudit(studentId: string): Promise<GradeAuditEntry[]> {
  const res = await authorizedFetch<{ success: boolean; data: GradeAuditEntry[] }>(`/api/registrar/students/${studentId}/grade-audit`)
  return res.data
}

// ─── Subjects Needing Attention ───

export type AttentionIssueType = 'no-block' | 'tba' | 'missing-grade'

export interface AttentionSubject {
  issueType: AttentionIssueType
  subjectCode: string
  subjectTitle: string
  instructor: string
  sectionLabel: string
  courseShortLabel: string
  schoolYear: string
  semester: string
  gradeStatus: string
  studentCount: number
}

export async function getSubjectsNeedingAttention(filters: { schoolYear?: string; semester?: string } = {}): Promise<AttentionSubject[]> {
  const params = new URLSearchParams()
  if (filters.schoolYear) params.set('schoolYear', filters.schoolYear)
  if (filters.semester) params.set('semester', filters.semester)
  const res = await authorizedFetch<{ success: boolean; data: AttentionSubject[] }>(`/api/registrar/grade-submissions/attention?${params.toString()}`)
  return res.data
}

// ─── Grade Change Request API ───

export async function createGradeChangeRequest(params: {
  enrollmentId: string
  studentId: string
  subjectId: string
  requestedGrade: number
  reason: string
  supportingInfo?: string
}): Promise<GradeChangeRequest> {
  const res = await authorizedFetch<{ success: boolean; data: GradeChangeRequest }>(`/api/professor/grade-change-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  return res.data
}

export async function listGradeChangeRequests(filters: { status?: GradeChangeRequestStatus; page?: number; limit?: number } = {}): Promise<{ data: GradeChangeRequest[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  const res = await authorizedFetch<{ success: boolean; data: GradeChangeRequest[]; pagination: any }>(`/api/registrar/grade-submissions/change-requests/list?${params.toString()}`)
  return { data: res.data, pagination: res.pagination }
}

export async function getGradeChangeRequest(requestId: string): Promise<GradeChangeRequest> {
  const res = await authorizedFetch<{ success: boolean; data: GradeChangeRequest }>(`/api/registrar/grade-submissions/change-requests/${requestId}`)
  return res.data
}

export async function reviewGradeChangeRequest(requestId: string, action: 'approve' | 'reject', remarks?: string): Promise<GradeChangeRequest> {
  const res = await authorizedFetch<{ success: boolean; data: GradeChangeRequest }>(`/api/registrar/grade-submissions/change-requests/${requestId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, remarks })
  })
  return res.data
}

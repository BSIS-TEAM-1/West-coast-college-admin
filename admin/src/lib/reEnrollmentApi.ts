import { authorizedFetch } from './blockAssignmentShared'
import type { StudentData } from './studentApi'

export type ReEnrollmentSemester = '1st' | '2nd' | 'Summer'

export type ReEnrollmentVerificationStatus = 'none' | 'sent' | 'verified' | 'expired'

export type RetakeSubject = {
  subjectId: string
  code: string
  title: string
  units: number | null
  schoolYear?: string
  semester?: string
  status?: string
  grade: number | null
  gradeMark: string | null
  outcome: 'Failed' | 'Dropped'
}

export type ReEnrollmentSubjectGrade = {
  subjectId: string
  code: string
  title: string
  units: number | null
  grade: number | null
  gradeMark: string | null
  status: string | null
}

export type ReEnrollmentGradeSummary = {
  term: {
    schoolYear: string
    semester: ReEnrollmentSemester
  } | null
  enrollmentStatus: string | null
  subjects: ReEnrollmentSubjectGrade[]
  gwa: number | null
  gradedCount: number
  subjectCount: number
}

export type ReEnrollmentVerification = {
  status: ReEnrollmentVerificationStatus
  maskedEmail: string
  maskedPhone: string
  sentVia: Array<'email' | 'sms' | 'app'>
  sentAt: string | null
  codeExpiresAt: string | null
  verifiedAt: string | null
  verificationExpiresAt: string | null
}

export type ReEnrollmentInfo = {
  targetSchoolYear: string
  targetSemester: ReEnrollmentSemester
  needsRetake: boolean
  retakeSubjects: RetakeSubject[]
  gradeSummary: ReEnrollmentGradeSummary
  verification: ReEnrollmentVerification
  rolloverReady?: boolean
  rolloverMessage?: string
}

export type ReEnrollmentStudent = StudentData & {
  reEnrollment?: ReEnrollmentInfo
}

export type ReEnrollmentCandidatesMeta = {
  targetTerm: {
    schoolYear: string
    semester: ReEnrollmentSemester
  }
  activeTerm: {
    schoolYear: string
    semester: ReEnrollmentSemester
  } | null
  rolloverReady: boolean
  rolloverMessage: string
  rolloverReasonCode: string | null
}

export type ReEnrollmentCandidatesResponse = {
  success: boolean
  data: ReEnrollmentStudent[]
  meta?: ReEnrollmentCandidatesMeta
}

export type ReEnrollmentCodeResponse = {
  success: boolean
  data: {
    maskedEmail: string
    maskedPhone: string
    expiresAt: string
    verification: ReEnrollmentVerification
  }
}

export type ReEnrollmentVerifyResponse = {
  success: boolean
  data: {
    maskedEmail: string
    verification: ReEnrollmentVerification
    verificationExpiresAt: string | null
  }
}

type ReEnrollmentTermRequest = {
  studentId: string
  schoolYear: string
  semester: ReEnrollmentSemester
}

export async function fetchReEnrollmentCandidates({
  schoolYear,
  semester,
}: {
  schoolYear: string
  semester: ReEnrollmentSemester
}): Promise<ReEnrollmentCandidatesResponse> {
  const params = new URLSearchParams({ schoolYear, semester })
  return authorizedFetch<ReEnrollmentCandidatesResponse>(
    `/api/registrar/re-enrollment/candidates?${params.toString()}`
  )
}

export async function sendReEnrollmentCode(
  request: ReEnrollmentTermRequest
): Promise<ReEnrollmentCodeResponse> {
  return authorizedFetch<ReEnrollmentCodeResponse>('/api/registrar/re-enrollment/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export async function verifyReEnrollmentCode(
  request: ReEnrollmentTermRequest & { code: string }
): Promise<ReEnrollmentVerifyResponse> {
  return authorizedFetch<ReEnrollmentVerifyResponse>('/api/registrar/re-enrollment/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

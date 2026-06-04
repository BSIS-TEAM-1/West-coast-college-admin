import { API_URL, getStoredToken } from './authApi'

export type CourseOption = {
  id: number
  code: string
  name: string
}

export type ApplicantStatus =
  | 'Draft'
  | 'Submitted'
  | 'Incomplete Requirements'
  | 'For Evaluation'
  | 'Approved for Enrollment'
  | 'Enrolled'
  | 'Rejected'
  | 'Cancelled'

export type ApplicantPayload = {
  applicantType: 'New' | 'Transferee' | 'Returnee'
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  email: string
  phoneNumber: string
  birthDate: string
  birthPlace?: string
  gender?: string
  civilStatus?: string
  nationality?: string
  religion?: string
  currentAddress: string
  permanentAddress?: string
  fatherName?: string
  motherName?: string
  guardianName?: string
  guardianRelationship?: string
  guardianContactNumber: string
  emergencyContact: {
    name: string
    relationship: string
    contactNumber: string
    address?: string
  }
  academicDetails: {
    elementary: {
      schoolName: string
      schoolAddress?: string
      yearGraduated: string
      generalAverage?: string
      gradesSummary?: string
    }
    highSchool: {
      schoolName: string
      schoolAddress?: string
      yearGraduated: string
      generalAverage?: string
      gradesSummary?: string
      strandOrTrack?: string
    }
  }
  selectedCourse: number
  requestedYearLevel: number
  semester: '1st' | '2nd' | 'Summer'
  schoolYear: string
}

export type ApplicantRecord = ApplicantPayload & {
  _id: string
  applicantNumber: string
  status: ApplicantStatus
  registrarRemarks?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
  fullName?: string
  course?: CourseOption
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.message === 'string'
      ? payload.message
      : typeof payload?.error === 'string'
        ? payload.error
        : 'Request failed'
    throw new Error(message)
  }

  return payload as T
}

async function authHeaders() {
  const token = await getStoredToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

export async function getApplicantCourses(): Promise<CourseOption[]> {
  const response = await fetch(`${API_URL}/api/applicants/courses`)
  const payload = await readJson<{ success: boolean; data: CourseOption[] }>(response)
  return payload.data
}

export async function submitApplicant(payload: ApplicantPayload): Promise<ApplicantRecord> {
  const response = await fetch(`${API_URL}/api/applicants/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await readJson<{ success: boolean; data: ApplicantRecord }>(response)
  return data.data
}

export async function getRegistrarApplicants(params: { status?: string; q?: string } = {}): Promise<ApplicantRecord[]> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.q) query.set('q', params.q)

  const response = await fetch(`${API_URL}/api/registrar/applicants${query.size ? `?${query}` : ''}`, {
    headers: await authHeaders()
  })
  const payload = await readJson<{ success: boolean; data: ApplicantRecord[] }>(response)
  return payload.data
}

export async function updateApplicantStatus(
  applicantId: string,
  payload: { status: ApplicantStatus; registrarRemarks?: string }
): Promise<ApplicantRecord> {
  const response = await fetch(`${API_URL}/api/registrar/applicants/${applicantId}/status`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(payload)
  })
  const data = await readJson<{ success: boolean; data: ApplicantRecord }>(response)
  return data.data
}

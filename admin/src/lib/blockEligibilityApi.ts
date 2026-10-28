import { authorizedFetch, type BlockGroup, type BlockSection } from './blockAssignmentShared'

export type EligibilityChecks = {
  program: boolean
  yearLevel: boolean
  capacity: boolean
}

export type EligibleBlock = {
  blockGroup: BlockGroup
  section: BlockSection
  slotsAvailable: number
}

export type IneligibleBlock = {
  blockGroup: BlockGroup
  section: BlockSection
  reasons: string[]
  checks?: EligibilityChecks
}

export type EligibilityStudent = {
  _id: string
  studentNumber: string
  name: string
  course: number | string
  yearLevel: number
  classification: string
  curriculumVersion: string | null
  schoolYear: string
  semester: string
  studentStatus: string
}

export type EligibilityEnrollment = {
  _id: string
  schoolYear: string
  semester: string
  yearLevel: number
  course: string
  curriculumId: string | null
  status: string
} | null

export type EligibilityResult = {
  student: EligibilityStudent
  enrollment: EligibilityEnrollment
  eligible: EligibleBlock[]
  ineligible: IneligibleBlock[]
  recommended: EligibleBlock | null
}

export type EligibilityTermOverride = {
  schoolYear: string
  semester: string
}

export async function fetchEligibleBlocks(
  studentId: string,
  termOverride?: EligibilityTermOverride
): Promise<EligibilityResult> {
  const params = new URLSearchParams({ studentId })
  if (termOverride?.schoolYear) params.set('schoolYear', termOverride.schoolYear)
  if (termOverride?.semester) params.set('semester', termOverride.semester)

  const data = await authorizedFetch<{ success: boolean; data: EligibilityResult }>(
    `/api/blocks/eligible?${params.toString()}`
  )
  return data.data
}

export type BulkEligibilityStudent = {
  studentId: string
  studentName: string
  studentNumber: string
  eligible: boolean
  reasons?: string[]
  checks?: EligibilityChecks
}

export type BulkEligibilityResult = {
  section: BlockSection
  blockGroup: {
    _id: string
    name: string
    curriculumId: string | null
    studentClassification: string
  }
  eligible: BulkEligibilityStudent[]
  ineligible: BulkEligibilityStudent[]
  summary: {
    total: number
    eligibleCount: number
    ineligibleCount: number
    slotsAvailable: number
  }
}

export async function fetchBulkEligibility(studentIds: string[], sectionId: string): Promise<BulkEligibilityResult> {
  const data = await authorizedFetch<{ success: boolean; data: BulkEligibilityResult }>(
    '/api/blocks/eligible/bulk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds, sectionId })
    }
  )
  return data.data
}

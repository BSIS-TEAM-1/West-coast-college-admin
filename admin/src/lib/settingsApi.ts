import { authorizedFetch } from './blockAssignmentShared'

export type AcademicSemester = '1st' | '2nd' | 'Summer'

export type AcademicTerm = {
  schoolYear: string
  semester: AcademicSemester
}

export async function getAcademicTerm(): Promise<AcademicTerm> {
  return authorizedFetch<AcademicTerm>('/api/settings/academic-term')
}

export async function updateAcademicTerm(term: AcademicTerm): Promise<AcademicTerm> {
  return authorizedFetch<AcademicTerm>('/api/settings/academic-term', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(term)
  })
}

export type GradeScaleSetting = {
  min: number
  max: number
  step: number
  passingGrade: number
  allowedGrades?: number[]
  description?: string
}

export async function getGradeScaleSetting(): Promise<GradeScaleSetting> {
  return authorizedFetch<GradeScaleSetting>('/api/settings/grade-scale')
}

export async function updateGradeScaleSetting(scale: {
  min: number
  max: number
  step: number
  passingGrade: number
}): Promise<GradeScaleSetting> {
  return authorizedFetch<GradeScaleSetting>('/api/settings/grade-scale', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scale)
  })
}

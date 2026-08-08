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

import { authorizedFetch } from './blockAssignmentShared'

export type AcademicSemester = '1st' | '2nd' | 'Summer'

export type AcademicTerm = {
  schoolYear: string
  semester: AcademicSemester
}

const ACADEMIC_TERM_EVENT = 'wcc:academic-term-changed'
let cachedAcademicTerm: AcademicTerm | null = null

export function getCachedAcademicTerm(): AcademicTerm | null {
  return cachedAcademicTerm
}

export function notifyAcademicTermChanged(term: AcademicTerm): void {
  cachedAcademicTerm = term
  if (typeof window !== 'undefined') {
    ;(window as any).__wccAcademicTerm = term
    window.dispatchEvent(new CustomEvent<AcademicTerm>(ACADEMIC_TERM_EVENT, { detail: term }))
  }
}

export function subscribeAcademicTerm(listener: (term: AcademicTerm) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AcademicTerm>
    if (customEvent.detail) {
      listener(customEvent.detail)
    }
  }
  window.addEventListener(ACADEMIC_TERM_EVENT, handler)
  return () => window.removeEventListener(ACADEMIC_TERM_EVENT, handler)
}

export async function getAcademicTerm(): Promise<AcademicTerm> {
  const term = await authorizedFetch<AcademicTerm>('/api/settings/academic-term')
  if (term && term.schoolYear) {
    const prev = cachedAcademicTerm
    cachedAcademicTerm = term
    if (typeof window !== 'undefined') {
      ;(window as any).__wccAcademicTerm = term
    }
    if (!prev || prev.schoolYear !== term.schoolYear || prev.semester !== term.semester) {
      notifyAcademicTermChanged(term)
    }
  }
  return term
}

export async function updateAcademicTerm(term: AcademicTerm): Promise<AcademicTerm> {
  const updated = await authorizedFetch<AcademicTerm>('/api/settings/academic-term', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(term)
  })
  if (updated && updated.schoolYear) {
    notifyAcademicTermChanged(updated)
  }
  return updated
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

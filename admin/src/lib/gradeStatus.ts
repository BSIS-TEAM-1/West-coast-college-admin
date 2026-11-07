import { getGradeScale, type GradeScale } from './gradingScale'

const EPSILON = 1e-9

export type GradeStatusSubject = {
  grade: number | null
  gradeMark?: string | null
  status?: string | null
}

/**
 * Human-readable status of a subject's grade — not the student's enrollment
 * status. A professor may record FA/DRP without changing the subject's
 * lifecycle status, so the grade/mark is the source of truth.
 */
export function gradeStatusLabel(
  subject: GradeStatusSubject,
  scale: GradeScale = getGradeScale()
): string {
  const mark = String(subject.gradeMark || '').trim().toUpperCase()

  if (mark === 'DRP') return 'Dropped'
  if (mark === 'W') return 'Withdrawn'
  if (mark === 'FA') return 'Failed'
  if (mark === 'INC') return 'Incomplete'
  if (mark === 'NG') return 'No Grade'
  if (mark) return mark

  const grade = subject.grade
  if (typeof grade === 'number' && Number.isFinite(grade)) {
    if (grade >= scale.min - EPSILON && grade <= scale.passingGrade + EPSILON) {
      return 'Passed'
    }
    // WCC treats a flat 4.0 as a conditional pass; higher grades are failing.
    if (grade === 4) return 'Conditional'
    return 'Failed'
  }

  const status = String(subject.status || '').trim()
  switch (status.toLowerCase()) {
    case 'dropped':
      return 'Dropped'
    case 'removed':
      return 'Removed'
    case 'failed':
      return 'Failed'
    case 'completed':
      return 'Completed'
    case 'incomplete':
      return 'Incomplete'
    case 'enrolled':
      return 'In Progress'
    default:
      return status || '—'
  }
}

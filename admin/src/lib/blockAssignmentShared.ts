import { API_URL, getStoredToken } from './authApi'
import type { StudentData } from './studentApi'

export type Semester = '1st' | '2nd' | 'Summer'

export type SharedAcademicContext = {
  sharedCourse: number | null
  sharedYearLevel: number | null
  sharedSemester: string
  sharedSchoolYear: string
  isSingleCourse: boolean
  isSingleYearLevel: boolean
}

export type BlockGroup = {
  _id: string
  name: string
  courseId?: number | string
  courseCode?: string
  yearLevel?: number | string
  semester: Semester
  schoolYear?: string
  year: number
  section?: string
  curriculumId?: string | null
  studentClassification?: string
}

export type BlockSection = {
  _id: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status?: string
  blockGroupId?: string
}

export const COURSE_OPTIONS = [
  { value: 101, label: 'BEED', fullLabel: 'Bachelor of Elementary Education (BEED)' },
  { value: 102, label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
  { value: 103, label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
  { value: 201, label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' }
] as const

export function extractResponseData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export async function authorizedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getStoredToken()
  if (!token) throw new Error('No authentication token found')

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data?.error as string) || (data?.message as string) || `Request failed (${response.status})`
    const err = new Error(message) as Error & { reasons?: string[]; checks?: Record<string, boolean>; status?: number }
    if (Array.isArray(data?.reasons)) err.reasons = data.reasons
    if (data?.checks && typeof data.checks === 'object') err.checks = data.checks
    err.status = response.status
    throw err
  }

  return data as T
}

export function schoolYearFromStartYear(value: number | string) {
  const startYear = Number(value)
  return Number.isFinite(startYear) && startYear > 0 ? `${startYear}-${startYear + 1}` : ''
}

export function schoolYearStart(schoolYear: string) {
  const match = String(schoolYear || '').trim().match(/^(\d{4})-\d{4}$/)
  return match ? Number(match[1]) : 0
}

export function getDefaultSchoolYear() {
  const currentYear = new Date().getFullYear()
  return `${currentYear}-${currentYear + 1}`
}

export function normalizeCourseCode(value: unknown) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw
  if (raw.includes('BEED')) return '101'
  if ((raw.includes('BSED') && raw.includes('ENGLISH')) || raw === 'ENGLISH') return '102'
  if ((raw.includes('BSED') && raw.includes('MATH')) || raw.includes('MATHEMATICS') || raw === 'MATH') return '103'
  if ((raw.includes('BSBA') && raw.includes('HRM')) || raw === 'HRM') return '201'
  return raw
}

export function courseShortLabel(value: unknown) {
  const normalized = normalizeCourseCode(value)
  return COURSE_OPTIONS.find((course) => String(course.value) === normalized)?.label || String(value || 'N/A')
}

export function courseFullLabel(value: unknown) {
  const normalized = normalizeCourseCode(value)
  return COURSE_OPTIONS.find((course) => String(course.value) === normalized)?.fullLabel || String(value || 'N/A')
}

export function formatStudentNumber(value: unknown, course?: unknown) {
  const raw = String(value ?? '').trim()
  const fallbackCourseCode = normalizeCourseCode(course)

  if (!raw) {
    return fallbackCourseCode ? `0000-${fallbackCourseCode}-00000` : 'N/A'
  }

  const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)
  let year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
  let seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'

  const compactDigits = raw.replace(/\D+/g, '')
  if (parts.length === 1 && /^\d{8,}$/.test(compactDigits)) {
    year = compactDigits.slice(0, 4)
    seqPart = compactDigits.slice(-5)
  }

  const rawCoursePart = parts.find((part) => /^\d{3}$/.test(part))
    || parts[1]
    || parts.find((part) => /[A-Za-z]/.test(part))
    || ''
  const courseCode = fallbackCourseCode || normalizeCourseCode(rawCoursePart) || '000'
  const sequence = seqPart.slice(-5).padStart(5, '0')

  return `${year}-${courseCode}-${sequence}`
}

export function studentDisplayName(student: Partial<StudentData>) {
  return [student.firstName, student.middleName, student.lastName, student.suffix]
    .filter((value) => String(value || '').trim())
    .join(' ')
}

export function studentInitials(student: Partial<StudentData>) {
  const first = String(student.firstName || '').trim().charAt(0)
  const last = String(student.lastName || '').trim().charAt(0)
  return `${first}${last}`.toUpperCase() || 'ST'
}

export function studentNumberDisplay(student: Partial<StudentData>) {
  return formatStudentNumber(student.studentNumber, student.course)
}

export function formatYearLevel(value: number | string | undefined) {
  const yearLevel = Number(value)
  if (!Number.isFinite(yearLevel) || yearLevel <= 0) return 'N/A'
  if (yearLevel === 1) return '1st Year'
  if (yearLevel === 2) return '2nd Year'
  if (yearLevel === 3) return '3rd Year'
  return `${yearLevel}th Year`
}

export function formatBlockDisplay(section: string | undefined): string {
  if (!section) return 'Unassigned'
  // Convert "101-1-A" to "BEED-1A" format
  let formatted = String(section).trim().replace(/-(\d+)-([A-Z])$/i, '-$1$2')

  // Convert numeric course codes back to string labels
  const parts = formatted.split('-')
  if (parts.length >= 2 && /^\d{3}$/.test(parts[0])) {
    const courseLabel = courseShortLabel(parts[0])
    // Only replace if it's not just the number itself
    if (courseLabel !== parts[0] && courseLabel !== 'N/A') {
      parts[0] = courseLabel
      formatted = parts.join('-')
    }
  }

  return formatted
}

export function getSharedAcademicContext(students: Partial<StudentData>[]): SharedAcademicContext {
  const courseSet = new Set(students.map((student) => Number(student.course || 0)).filter((value) => Number.isFinite(value) && value > 0))
  const yearSet = new Set(students.map((student) => Number(student.yearLevel || 0)).filter((value) => Number.isFinite(value) && value > 0))
  const semesterSet = new Set(students.map((student) => String(student.semester || '').trim()).filter(Boolean))
  const schoolYearSet = new Set(students.map((student) => String(student.schoolYear || '').trim()).filter(Boolean))

  return {
    sharedCourse: courseSet.size === 1 ? Array.from(courseSet)[0] : null,
    sharedYearLevel: yearSet.size === 1 ? Array.from(yearSet)[0] : null,
    sharedSemester: semesterSet.size === 1 ? Array.from(semesterSet)[0] : '',
    sharedSchoolYear: schoolYearSet.size === 1 ? Array.from(schoolYearSet)[0] : '',
    isSingleCourse: courseSet.size <= 1,
    isSingleYearLevel: yearSet.size <= 1
  }
}

export function parseBlockGroupMeta(name: string) {
  const normalized = String(name || '').trim().toUpperCase()
  const coursePart = normalized.replace(/[-\s]*(\d+)-?[A-Z]?$/, '').replace(/[-\s]+$/, '')
  const course = normalizeCourseCode(coursePart || normalized)
  const yearMatch = normalized.match(/(?:^|-)(\d+)-?[A-Z]?$/)
  return {
    course,
    yearLevel: yearMatch ? Number(yearMatch[1]) : null
  }
}

export function blockCourseMatchesStudent(blockCourse: string, studentCourse: number | null) {
  if (!blockCourse || !studentCourse) return true
  if (blockCourse === String(studentCourse)) return true
  return blockCourse === 'BSED' && [102, 103].includes(studentCourse)
}

export function getBlockGroupCompatibilityMeta(group: BlockGroup) {
  const legacy = parseBlockGroupMeta(group.name)
  const courseId = normalizeCourseCode(group.courseId ?? group.courseCode)
  const yearLevel = Number(group.yearLevel)
  return {
    course: courseId || legacy.course,
    yearLevel: Number.isFinite(yearLevel) && yearLevel > 0 ? yearLevel : legacy.yearLevel,
    semester: group.semester,
    schoolYear: group.schoolYear || schoolYearFromStartYear(group.year)
  }
}

export function parseBlockSlot(value: string) {
  const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!text) return null

  const directMatch = text.match(/(?:^|-)(\d+)([A-Z])$/)
  if (directMatch) {
    return {
      yearLevel: Number(directMatch[1]) || 99,
      letter: directMatch[2]
    }
  }

  const dashedMatch = text.match(/(?:^|-)(\d+)-([A-Z])$/)
  if (dashedMatch) {
    return {
      yearLevel: Number(dashedMatch[1]) || 99,
      letter: dashedMatch[2]
    }
  }

  return null
}

export function getCourseAbbreviation(value: string) {
  const text = String(value || '').trim()
  if (!text) return 'N/A'
  const first = text.split('-')[0]
  const normalized = normalizeCourseCode(first)
  const label = courseShortLabel(normalized)
  return label !== 'N/A' ? label : first
}

export function formatBlockLabel(value: string) {
  const text = String(value || '').trim()
  if (!text) return value
  const parts = text.split('-')
  if (parts.length === 0) return text
  const first = parts[0]
  const mapped = getCourseAbbreviation(first)
  return [mapped, ...parts.slice(1)].join('-')
}

export function formatBlockColumnLabel(value: string) {
  const slot = parseBlockSlot(value)
  if (!slot) return formatBlockLabel(value)
  return `${slot.yearLevel}-${slot.letter}`
}

export function compareBlockOrder(a: string, b: string) {
  const slotA = parseBlockSlot(a)
  const slotB = parseBlockSlot(b)

  if (slotA && slotB) {
    if (slotA.yearLevel !== slotB.yearLevel) {
      return slotA.yearLevel - slotB.yearLevel
    }
    return slotA.letter.localeCompare(slotB.letter)
  }

  if (slotA) return -1
  if (slotB) return 1
  return String(a || '').localeCompare(String(b || ''))
}

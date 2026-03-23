import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive,
  Blocks,
  BookOpenCheck,
  Download,
  Eye,
  FileText,
  History,
  Layers3,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Users,
  X
} from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import StudentService from '../lib/studentApi'
import type { StudentData } from '../lib/studentApi'
import './StudentManagement.css'

type LifecycleStatus = 'Pending' | 'Enrolled' | 'Not Enrolled' | 'Dropped' | 'Inactive' | 'Graduated'
type ProfileTab = 'profile' | 'enrollment' | 'subjects' | 'documents' | 'history'
type Semester = '1st' | '2nd' | 'Summer'

type ManagedStudent = StudentData & {
  corStatus?: 'Pending' | 'Received' | 'Verified' | string
  scholarship?: string
  major?: string
  birthPlace?: string
  assignedProfessor?: string
  latestGrade?: number
  gradeProfessor?: string
  gradeDate?: string
  registrationNumber?: string
  emergencyContact?: {
    name?: string
    relationship?: string
    contactNumber?: string
    address?: string
  }
}

type EnrollmentSubject = {
  subjectId?: string
  code: string
  title: string
  units: number
  schedule?: string
  room?: string
  instructor?: string
  grade?: number | null
  status?: string
  remarks?: string
  dateEnrolled?: string
  dateModified?: string
}

type EnrollmentRecord = {
  _id: string
  schoolYear: string
  semester: string
  yearLevel?: number
  course?: string
  status: string
  isCurrent?: boolean
  remarks?: string
  subjects: EnrollmentSubject[]
  assessment?: {
    tuitionFee?: number
    miscFee?: number
    otherFees?: number
    totalAmount?: number
    balance?: number
    paymentStatus?: string
  }
  documents?: Array<{
    name?: string
    fileUrl?: string
    status?: string
    remarks?: string
    dateSubmitted?: string
    dateVerified?: string
  }>
  createdAt?: string
  updatedAt?: string
}

type SubjectCatalogItem = {
  _id: string
  code: string
  title: string
  units: number
  course?: number
  yearLevel?: number
  semester?: string
}

type BlockGroup = {
  _id: string
  name: string
  semester: Semester
  year: number
}

type BlockSection = {
  _id: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status?: string
  blockGroupId?: string
}

type StudentFormState = {
  studentNumber: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  course: string
  yearLevel: string
  semester: Semester
  schoolYear: string
  lifecycleStatus: LifecycleStatus
  studentStatus: string
  scholarship: string
  email: string
  contactNumber: string
  address: string
  permanentAddress: string
  birthDate: string
  birthPlace: string
  gender: string
  civilStatus: string
  nationality: string
  religion: string
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactNumber: string
  emergencyContactAddress: string
}

type SharedAcademicContext = {
  sharedCourse: number | null
  sharedYearLevel: number | null
  sharedSemester: string
  sharedSchoolYear: string
  isSingleCourse: boolean
  isSingleYearLevel: boolean
}

const COURSE_OPTIONS = [
  { value: 101, label: 'BEED', fullLabel: 'Bachelor of Elementary Education (BEED)' },
  { value: 102, label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
  { value: 103, label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
  { value: 201, label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' }
] as const

const YEAR_LEVEL_OPTIONS = [1, 2, 3, 4, 5]
const LIFECYCLE_OPTIONS: LifecycleStatus[] = ['Pending', 'Enrolled', 'Not Enrolled', 'Dropped', 'Inactive', 'Graduated']
const SEMESTER_OPTIONS: Semester[] = ['1st', '2nd', 'Summer']

let studentWorkspaceOverlayDepth = 0
let studentWorkspaceBodyOverflow = ''
let studentWorkspaceHtmlOverflow = ''
let studentWorkspaceBodyPaddingRight = ''
let studentWorkspaceRootHadInert = false
let studentWorkspaceRootAriaHidden: string | null = null
let studentWorkspaceRootPointerEvents = ''
let studentWorkspaceRootUserSelect = ''

function useStudentWorkspaceOverlayLock() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined

    const { body, documentElement } = document
    const appRoot = document.getElementById('root')

    if (studentWorkspaceOverlayDepth === 0) {
      studentWorkspaceBodyOverflow = body.style.overflow
      studentWorkspaceHtmlOverflow = documentElement.style.overflow
      studentWorkspaceBodyPaddingRight = body.style.paddingRight

      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth)
      body.style.overflow = 'hidden'
      documentElement.style.overflow = 'hidden'
      body.classList.add('student-workspace-overlay-open')
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`
      }

      if (appRoot) {
        studentWorkspaceRootHadInert = appRoot.hasAttribute('inert')
        studentWorkspaceRootAriaHidden = appRoot.getAttribute('aria-hidden')
        studentWorkspaceRootPointerEvents = appRoot.style.pointerEvents
        studentWorkspaceRootUserSelect = appRoot.style.userSelect
        appRoot.setAttribute('inert', '')
        appRoot.setAttribute('aria-hidden', 'true')
        appRoot.style.pointerEvents = 'none'
        appRoot.style.userSelect = 'none'
      }
    }

    studentWorkspaceOverlayDepth += 1

    return () => {
      studentWorkspaceOverlayDepth = Math.max(0, studentWorkspaceOverlayDepth - 1)
      if (studentWorkspaceOverlayDepth === 0) {
        body.style.overflow = studentWorkspaceBodyOverflow
        documentElement.style.overflow = studentWorkspaceHtmlOverflow
        body.style.paddingRight = studentWorkspaceBodyPaddingRight
        body.classList.remove('student-workspace-overlay-open')

        if (appRoot) {
          if (studentWorkspaceRootHadInert) {
            appRoot.setAttribute('inert', '')
          } else {
            appRoot.removeAttribute('inert')
          }

          if (studentWorkspaceRootAriaHidden === null) {
            appRoot.removeAttribute('aria-hidden')
          } else {
            appRoot.setAttribute('aria-hidden', studentWorkspaceRootAriaHidden)
          }

          appRoot.style.pointerEvents = studentWorkspaceRootPointerEvents
          appRoot.style.userSelect = studentWorkspaceRootUserSelect
        }
      }
    }
  }, [])
}

function StudentWorkspaceOverlay({ children }: { children: ReactNode }) {
  useStudentWorkspaceOverlayLock()

  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

function isStudentWorkspaceBackdropTarget(event: { target: EventTarget | null; currentTarget: EventTarget | null }) {
  return event.target === event.currentTarget
}

function extractResponseData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

async function authorizedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
  }

  return data as T
}

function schoolYearFromStartYear(value: number | string) {
  const startYear = Number(value)
  return Number.isFinite(startYear) && startYear > 0 ? `${startYear}-${startYear + 1}` : ''
}

function schoolYearStart(schoolYear: string) {
  const match = String(schoolYear || '').trim().match(/^(\d{4})-\d{4}$/)
  return match ? Number(match[1]) : 0
}

function getDefaultSchoolYear() {
  const currentYear = new Date().getFullYear()
  return `${currentYear}-${currentYear + 1}`
}

function normalizeCourseCode(value: unknown) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw
  if (raw.includes('BEED')) return '101'
  if ((raw.includes('BSED') && raw.includes('ENGLISH')) || raw === 'ENGLISH') return '102'
  if ((raw.includes('BSED') && raw.includes('MATH')) || raw.includes('MATHEMATICS') || raw === 'MATH') return '103'
  if ((raw.includes('BSBA') && raw.includes('HRM')) || raw === 'HRM') return '201'
  return raw
}

function courseShortLabel(value: unknown) {
  const normalized = normalizeCourseCode(value)
  return COURSE_OPTIONS.find((course) => String(course.value) === normalized)?.label || String(value || 'N/A')
}

function courseFullLabel(value: unknown) {
  const normalized = normalizeCourseCode(value)
  return COURSE_OPTIONS.find((course) => String(course.value) === normalized)?.fullLabel || String(value || 'N/A')
}

function formatStudentNumber(value: unknown, course?: unknown) {
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

function studentNumberDisplay(student: Partial<ManagedStudent>) {
  return formatStudentNumber(student.studentNumber, student.course)
}

function formatYearLevel(value: number | string | undefined) {
  const yearLevel = Number(value)
  if (!Number.isFinite(yearLevel) || yearLevel <= 0) return 'N/A'
  if (yearLevel === 1) return '1st Year'
  if (yearLevel === 2) return '2nd Year'
  if (yearLevel === 3) return '3rd Year'
  return `${yearLevel}th Year`
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString()
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString()
}

function formatCurrency(value?: number) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
  }).format(amount)
}

function studentDisplayName(student: Partial<ManagedStudent>) {
  return [student.firstName, student.middleName, student.lastName, student.suffix]
    .filter((value) => String(value || '').trim())
    .join(' ')
}

function normalizeLifecycleStatus(student: Partial<ManagedStudent>): LifecycleStatus {
  const explicit = String(student.lifecycleStatus || '').trim()
  if (LIFECYCLE_OPTIONS.includes(explicit as LifecycleStatus)) {
    return explicit as LifecycleStatus
  }

  if (student.isActive === false) return 'Inactive'
  if (String(student.studentStatus || '').trim().toLowerCase() === 'dropped') return 'Dropped'
  if (String(student.enrollmentStatus || '').trim().toLowerCase() === 'enrolled') return 'Enrolled'
  if (String(student.corStatus || '').trim().toLowerCase() === 'verified') return 'Enrolled'
  return 'Pending'
}

function getSharedAcademicContext(students: ManagedStudent[]): SharedAcademicContext {
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

function parseBlockGroupMeta(name: string) {
  const normalized = String(name || '').trim().toUpperCase()
  const course = normalizeCourseCode(normalized)
  const yearMatch = normalized.match(/(?:^|-)(\d+)-?[A-Z]?$/)
  return {
    course,
    yearLevel: yearMatch ? Number(yearMatch[1]) : null
  }
}

function formatBlockDisplay(section: string | undefined): string {
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

function buildStudentFormState(student?: ManagedStudent): StudentFormState {
  return {
    studentNumber: student?.studentNumber || '',
    firstName: student?.firstName || '',
    middleName: student?.middleName || '',
    lastName: student?.lastName || '',
    suffix: student?.suffix || '',
    course: String(student?.course || 101),
    yearLevel: String(student?.yearLevel || 1),
    semester: (student?.semester as Semester) || '1st',
    schoolYear: student?.schoolYear || getDefaultSchoolYear(),
    lifecycleStatus: normalizeLifecycleStatus(student || {}),
    studentStatus: student?.studentStatus || 'Regular',
    scholarship: student?.scholarship || 'N/A',
    email: student?.email || '',
    contactNumber: student?.contactNumber || '',
    address: student?.address || '',
    permanentAddress: student?.permanentAddress || '',
    birthDate: student?.birthDate ? String(student.birthDate).slice(0, 10) : '',
    birthPlace: student?.birthPlace || '',
    gender: student?.gender || '',
    civilStatus: student?.civilStatus || '',
    nationality: student?.nationality || 'Filipino',
    religion: student?.religion || '',
    emergencyContactName: student?.emergencyContact?.name || '',
    emergencyContactRelationship: student?.emergencyContact?.relationship || '',
    emergencyContactNumber: student?.emergencyContact?.contactNumber || '',
    emergencyContactAddress: student?.emergencyContact?.address || ''
  }
}

function buildStudentPayload(formState: StudentFormState) {
  const payload: Record<string, unknown> = {
    firstName: formState.firstName.trim(),
    middleName: formState.middleName.trim(),
    lastName: formState.lastName.trim(),
    suffix: formState.suffix.trim(),
    course: Number(formState.course),
    yearLevel: Number(formState.yearLevel),
    semester: formState.semester,
    schoolYear: formState.schoolYear.trim(),
    lifecycleStatus: formState.lifecycleStatus,
    studentStatus: formState.studentStatus.trim() || 'Regular',
    scholarship: formState.scholarship.trim() || 'N/A',
    email: formState.email.trim(),
    contactNumber: formState.contactNumber.trim(),
    address: formState.address.trim(),
    permanentAddress: formState.permanentAddress.trim(),
    birthDate: formState.birthDate || undefined,
    birthPlace: formState.birthPlace.trim(),
    gender: formState.gender.trim(),
    civilStatus: formState.civilStatus.trim(),
    nationality: formState.nationality.trim(),
    religion: formState.religion.trim()
  }

  const emergencyContact = {
    name: formState.emergencyContactName.trim(),
    relationship: formState.emergencyContactRelationship.trim(),
    contactNumber: formState.emergencyContactNumber.trim(),
    address: formState.emergencyContactAddress.trim()
  }

  if (Object.values(emergencyContact).some(Boolean)) {
    payload.emergencyContact = emergencyContact
  }

  return payload
}

async function fetchStudentNumberPreview(course: string, schoolYear: string) {
  const token = await getStoredToken()
  if (!token) throw new Error('No authentication token found')

  const query = new URLSearchParams({
    course: String(Number(course) || ''),
    schoolYear: String(schoolYear || '').trim()
  })

  const response = await fetch(`${API_URL}/registrar/students/next-number?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((payload?.message as string) || 'Failed to generate student number preview')
  }

  return String(payload?.data?.studentNumber || '').trim()
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function ToneBadge({
  label,
  tone
}: {
  label: string
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'
}) {
  return <span className={`student-workspace__badge student-workspace__badge--${tone}`}>{label}</span>
}


function StudentRowMenu({
  student,
  isOpen,
  onToggle,
  onClose,
  onViewProfile,
  onEnroll,
  onAssignBlock,
  onEdit,
  onViewAcademicRecord,
  onViewEnrolledSubjects,
  onViewEnrollmentHistory,
  onArchive,
  onDelete
}: {
  student: ManagedStudent
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onViewProfile: () => void
  onEnroll: () => void
  onAssignBlock: () => void
  onEdit: () => void
  onViewAcademicRecord: () => void
  onViewEnrolledSubjects: () => void
  onViewEnrollmentHistory: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [openUpward, setOpenUpward] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{
    left: number
    top?: number
    bottom?: number
    maxHeight: number
  }>({
    left: 16,
    top: 16,
    maxHeight: 320
  })

  useLayoutEffect(() => {
    if (!isOpen || !shellRef.current) return

    const viewportPadding = 16
    const verticalGap = 10
    const preferredMenuHeight = 320
    const minimumMenuHeight = 140
    const minimumMenuWidth = 200

    const updateMenuPosition = () => {
      if (!shellRef.current) return

      const rect = shellRef.current.getBoundingClientRect()
      const measuredMenuWidth = Math.max(menuRef.current?.offsetWidth ?? 0, minimumMenuWidth)
      const maxLeft = Math.max(viewportPadding, window.innerWidth - measuredMenuWidth - viewportPadding)
      const left = Math.min(Math.max(rect.right - measuredMenuWidth, viewportPadding), maxLeft)
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const shouldOpenUpward = spaceBelow < preferredMenuHeight && spaceAbove > spaceBelow
      const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow
      const maxHeight = Math.max(minimumMenuHeight, Math.min(preferredMenuHeight, availableHeight - verticalGap))

      setOpenUpward(shouldOpenUpward)
      setMenuPosition(
        shouldOpenUpward
          ? {
              left,
              bottom: Math.max(viewportPadding, window.innerHeight - rect.top + verticalGap),
              maxHeight
            }
          : {
              left,
              top: Math.max(viewportPadding, rect.bottom + verticalGap),
              maxHeight
            }
      )
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.student-workspace__menu-shell') && !target?.closest('.student-workspace__menu--portal')) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  return (
    <div ref={shellRef} className="student-workspace__menu-shell">
      <button
        type="button"
        className="student-workspace__menu-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`Open actions for ${studentNumberDisplay(student)}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={menuRef}
          className={`student-workspace__menu student-workspace__menu--compact student-workspace__menu--portal${openUpward ? ' student-workspace__menu--upward' : ''}`}
          style={{
            left: `${menuPosition.left}px`,
            top: menuPosition.top === undefined ? undefined : `${menuPosition.top}px`,
            bottom: menuPosition.bottom === undefined ? undefined : `${menuPosition.bottom}px`,
            maxHeight: `${menuPosition.maxHeight}px`
          }}
        >
          <div className="student-workspace__menu-section">
            <span className="student-workspace__menu-label">Quick actions</span>
            <button type="button" onClick={onViewProfile}>
              <Eye size={14} />
              View profile
            </button>
            <button type="button" onClick={onEnroll}>
              <BookOpenCheck size={14} />
              Enroll student
            </button>
            <button type="button" onClick={onAssignBlock}>
              <Blocks size={14} />
              Assign block
            </button>
            <button type="button" onClick={onEdit}>
              <PencilLine size={14} />
              Edit student
            </button>
          </div>
          <div className="student-workspace__menu-divider" />
          <div className="student-workspace__menu-section">
            <span className="student-workspace__menu-label">More</span>
            <button type="button" onClick={onViewAcademicRecord}>
              <FileText size={14} />
              Academic record
            </button>
            <button type="button" onClick={onViewEnrolledSubjects}>
              <Layers3 size={14} />
              Enrolled subjects
            </button>
            <button type="button" onClick={onViewEnrollmentHistory}>
              <History size={14} />
              Enrollment history
            </button>
            <button type="button" onClick={onArchive}>
              <Archive size={14} />
              Archive student
            </button>
            <button type="button" className="student-workspace__menu-item--danger" onClick={onDelete}>
              <X size={14} />
              Delete student
            </button>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}

function StudentProfileDrawer({
  profileState,
  onClose,
  onEdit,
  onEnroll,
  onAssignBlock
}: {
  profileState: { student: ManagedStudent; tab: ProfileTab } | null
  onClose: () => void
  onEdit: (student: ManagedStudent) => void
  onEnroll: (student: ManagedStudent) => void
  onAssignBlock: (student: ManagedStudent) => void
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(profileState?.tab || 'profile')
  const [student, setStudent] = useState<ManagedStudent | null>(profileState?.student || null)
  const [currentEnrollment, setCurrentEnrollment] = useState<EnrollmentRecord | null>(null)
  const [history, setHistory] = useState<EnrollmentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profileState) return

    let cancelled = false
    setActiveTab(profileState.tab)
    setStudent(profileState.student)
    setLoading(true)
    setError('')

    ;(async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')

        const studentResponse = await StudentService.getStudentById(token, profileState.student._id)
        const detailStudent = extractResponseData<ManagedStudent>(studentResponse)

        const historyResponse = await StudentService.getEnrollmentHistory(token, profileState.student._id)
        const historyRecords = extractResponseData<EnrollmentRecord[]>(historyResponse) || []

        const currentResponse = await StudentService.getCurrentEnrollment(
          token,
          profileState.student._id,
          detailStudent.schoolYear,
          detailStudent.semester
        ).catch(() => null)

        if (cancelled) return

        setStudent(detailStudent)
        setHistory(historyRecords)
        setCurrentEnrollment(currentResponse ? extractResponseData<EnrollmentRecord>(currentResponse) : null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load student profile')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profileState])

  const documentEntries = useMemo(() => {
    return history.flatMap((record) =>
      (record.documents || []).map((document, index) => ({
        id: `${record._id}-document-${index}`,
        semester: record.semester,
        schoolYear: record.schoolYear,
        ...document
      }))
    )
  }, [history])

  if (!profileState) return null

  const activeStudent = student || profileState.student
  const lifecycleStatus = normalizeLifecycleStatus(activeStudent)
  const lifecycleTone =
    lifecycleStatus === 'Enrolled'
      ? 'accent'
      : lifecycleStatus === 'Pending'
        ? 'accent'
        : lifecycleStatus === 'Inactive' || lifecycleStatus === 'Dropped'
          ? 'danger'
          : 'info'
  const corTone = String(activeStudent.corStatus || '').toLowerCase() === 'verified' ? 'success' : 'accent'

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
        <div className="student-workspace__modal-overlay" aria-hidden="true" />
        <div className="student-workspace__profile-modal">
          {/* Header Section */}
          <header className="student-workspace__profile-header">
            <div className="student-workspace__profile-header-top">
              <div className="student-workspace__profile-title">
                <h2>{studentDisplayName(activeStudent)}</h2>
                <div className="student-workspace__profile-summary">
                  <span>Course: <strong>{courseShortLabel(activeStudent.course)}</strong></span>
                  <span>Year: <strong>{formatYearLevel(activeStudent.yearLevel)}</strong></span>
                  <span>Block: <strong>{formatBlockDisplay(activeStudent.section)}</strong></span>
                </div>
              </div>
              <button type="button" className="student-workspace__profile-close" onClick={onClose} aria-label="Close profile">
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Status and Action Row */}
          <div className="student-workspace__profile-status-row">
            <div className="student-workspace__profile-badges">
              <ToneBadge label={lifecycleStatus} tone={lifecycleTone} />
              <ToneBadge label={`COR ${activeStudent.corStatus || 'Pending'}`} tone={corTone} />
            </div>
            <div className="student-workspace__profile-actions">
              <button type="button" className="student-workspace__ghost-button" onClick={() => onEdit(activeStudent)}>
                <PencilLine size={16} />
                Edit
              </button>
              <button type="button" className="student-workspace__primary-button" onClick={() => onEnroll(activeStudent)}>
                <BookOpenCheck size={16} />
                Enroll
              </button>
              <button type="button" className="student-workspace__secondary-button" onClick={() => onAssignBlock(activeStudent)}>
                <Blocks size={16} />
                Assign Block
              </button>
            </div>
          </div>

          {/* Tabs Navigation */}
          <nav className="student-workspace__profile-tabs" aria-label="Student profile tabs">
            {([
              ['profile', 'Profile'],
              ['enrollment', 'Enrollment'],
              ['subjects', 'Subjects'],
              ['documents', 'Documents'],
              ['history', 'History']
            ] as Array<[ProfileTab, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={activeTab === value ? 'student-workspace__tab--active' : ''}
                onClick={() => setActiveTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Content Area */}
          <div className="student-workspace__profile-content">
            {loading ? <div className="student-workspace__empty-state">Loading student record...</div> : null}
            {!loading && error ? <div className="student-workspace__empty-state">{error}</div> : null}

            {!loading && !error && activeTab === 'profile' ? (
              <div className="student-workspace__profile-grid-two-col">
                {/* Left Column - Personal Information */}
                <section className="student-workspace__profile-section">
                  <h3>Personal Information</h3>
                  <p>Identity and contact details</p>
                  <div className="student-workspace__detail-list">
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Student Number</span>
                      <span className="value">{studentNumberDisplay(activeStudent)}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Email</span>
                      <span className="value">{activeStudent.email || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Contact Number</span>
                      <span className="value">{activeStudent.contactNumber || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Address</span>
                      <span className="value">{activeStudent.address || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Birth Date</span>
                      <span className="value">{formatDate(activeStudent.birthDate)}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Gender</span>
                      <span className="value">{activeStudent.gender || 'N/A'}</span>
                    </div>
                  </div>
                </section>

                {/* Right Column - Academic Snapshot */}
                <section className="student-workspace__profile-section">
                  <h3>Academic Snapshot</h3>
                  <p>Current academic placement</p>
                  <div className="student-workspace__detail-list">
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Course</span>
                      <span className="value">{courseFullLabel(activeStudent.course)}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Year Level</span>
                      <span className="value">{formatYearLevel(activeStudent.yearLevel)}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Block</span>
                      <span className="value">{formatBlockDisplay(activeStudent.section)}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Semester</span>
                      <span className="value">{activeStudent.semester || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">School Year</span>
                      <span className="value">{activeStudent.schoolYear || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Lifecycle Status</span>
                      <span className="value student-workspace__detail-value--lifecycle">{lifecycleStatus}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Enrollment Status</span>
                      <span className="value">{activeStudent.enrollmentStatus || 'N/A'}</span>
                    </div>
                    <div className="student-workspace__detail-item-new">
                      <span className="label">Scholarship</span>
                      <span className="value">{activeStudent.scholarship || 'N/A'}</span>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'enrollment' ? (
              <div className="student-workspace__profile-stack">
                <section className="student-workspace__profile-section">
                  <h3>Current Enrollment</h3>
                  {currentEnrollment ? (
                    <div className="student-workspace__detail-list">
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Term</span>
                        <span className="value">{currentEnrollment.semester} · {currentEnrollment.schoolYear}</span>
                      </div>
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Status</span>
                        <span className="value">{currentEnrollment.status}</span>
                      </div>
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Total Subjects</span>
                        <span className="value">{currentEnrollment.subjects?.length || 0}</span>
                      </div>
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Payment Status</span>
                        <span className="value">{currentEnrollment.assessment?.paymentStatus || 'N/A'}</span>
                      </div>
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Total Assessment</span>
                        <span className="value">{formatCurrency(currentEnrollment.assessment?.totalAmount)}</span>
                      </div>
                      <div className="student-workspace__detail-item-new">
                        <span className="label">Balance</span>
                        <span className="value">{formatCurrency(currentEnrollment.assessment?.balance)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                      No active enrollment record for the current term.
                    </div>
                  )}
                </section>

                <section className="student-workspace__profile-section">
                  <h3>Enrollment History</h3>
                  {history.length ? (
                    <div className="student-workspace__history-list">
                      {history.map((record) => (
                        <article key={record._id} className="student-workspace__history-item">
                          <div>
                            <strong>{record.semester} · {record.schoolYear}</strong>
                            <p>{record.status} · {record.subjects?.length || 0} subjects</p>
                          </div>
                          <span>{formatDate(record.createdAt)}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                      No enrollment history yet.
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'subjects' ? (
              <section className="student-workspace__profile-section">
                <h3>Enrolled Subjects</h3>
                {currentEnrollment?.subjects?.length ? (
                  <div className="student-workspace__subject-list">
                    {currentEnrollment.subjects.map((subject) => (
                      <article key={`${subject.code}-${subject.title}`} className="student-workspace__subject-row">
                        <div>
                          <strong>{subject.code}</strong>
                          <p>{subject.title}</p>
                        </div>
                        <div>
                          <span>{subject.schedule || 'TBA'}</span>
                          <small>{subject.room || 'TBA'} · {subject.instructor || 'TBA'}</small>
                        </div>
                        <ToneBadge label={subject.status || 'Enrolled'} tone="info" />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                    No enrolled subjects for the active term.
                  </div>
                )}
              </section>
            ) : null}

            {!loading && !error && activeTab === 'documents' ? (
              <section className="student-workspace__profile-section">
                <h3>Documents</h3>
                {documentEntries.length ? (
                  <div className="student-workspace__document-list">
                    {documentEntries.map((document) => (
                      <article key={document.id} className="student-workspace__document-row">
                        <div>
                          <strong>{document.name || 'Enrollment document'}</strong>
                          <p>{document.semester} · {document.schoolYear}</p>
                        </div>
                        <div>
                          <span>{document.status || 'Submitted'}</span>
                          <small>{formatDate(document.dateSubmitted)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                    No document tracking entries recorded yet.
                  </div>
                )}
              </section>
            ) : null}

            {!loading && !error && activeTab === 'history' ? (
              <section className="student-workspace__profile-section">
                <h3>Lifecycle History</h3>
                <div className="student-workspace__history-list">
                  <article className="student-workspace__history-item">
                    <div>
                      <strong>Student record created</strong>
                      <p>{studentNumberDisplay(activeStudent)} · {courseShortLabel(activeStudent.course)}</p>
                    </div>
                    <span>{formatDateTime(activeStudent.createdAt)}</span>
                  </article>
                  {history.map((record) => (
                    <article key={record._id} className="student-workspace__history-item">
                      <div>
                        <strong>{record.status}</strong>
                        <p>{record.semester} · {record.schoolYear} · {record.subjects?.length || 0} subjects</p>
                      </div>
                      <span>{formatDateTime(record.updatedAt || record.createdAt)}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

function StudentFormModal({
  mode,
  student,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  student?: ManagedStudent
  onClose: () => void
  onSaved: (message: string) => Promise<void> | void
}) {
  const [formState, setFormState] = useState<StudentFormState>(() => buildStudentFormState(student))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [studentNumberPreview, setStudentNumberPreview] = useState(
    mode === 'edit' ? buildStudentFormState(student).studentNumber : ''
  )
  const [studentNumberPreviewLoading, setStudentNumberPreviewLoading] = useState(mode === 'create')

  useEffect(() => {
    setFormState(buildStudentFormState(student))
    setError('')
  }, [student])

  useEffect(() => {
    let cancelled = false

    if (mode === 'edit') {
      setStudentNumberPreview(formState.studentNumber)
      setStudentNumberPreviewLoading(false)
      return () => {
        cancelled = true
      }
    }

    const course = String(formState.course || '').trim()
    const schoolYear = String(formState.schoolYear || '').trim()
    if (!course || !/^\d{4}-\d{4}$/.test(schoolYear)) {
      setStudentNumberPreview('')
      setStudentNumberPreviewLoading(false)
      return () => {
        cancelled = true
      }
    }

    setStudentNumberPreviewLoading(true)

    ;(async () => {
      try {
        const nextStudentNumber = await fetchStudentNumberPreview(course, schoolYear)
        if (!cancelled) {
          setStudentNumberPreview(nextStudentNumber)
        }
      } catch {
        if (!cancelled) {
          setStudentNumberPreview('')
        }
      } finally {
        if (!cancelled) {
          setStudentNumberPreviewLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, formState.course, formState.schoolYear, formState.studentNumber])

  const handleChange = (field: keyof StudentFormState, value: string) => {
    setFormState((current) => ({
      ...current,
      [field]: value
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const payload = buildStudentPayload(formState)
      if (mode === 'create') {
        const response = await StudentService.createStudent(token, payload)
        const createdStudent = extractResponseData<ManagedStudent>(response)
        const createdMessage = createdStudent?.studentNumber
          ? `Student record created successfully. Student No: ${formatStudentNumber(createdStudent.studentNumber, createdStudent.course)}.`
          : 'Student record created successfully.'
        await onSaved(createdMessage)
      } else if (student?._id) {
        await StudentService.updateStudent(token, student._id, payload)
        await onSaved('Student record updated successfully.')
      }
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save student record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
      <div className="student-workspace__modal-overlay" aria-hidden="true" />
      <div className="student-workspace__modal">
        <header className="student-workspace__modal-header">
          <div>
            <span className="student-workspace__eyebrow">{mode === 'create' ? 'Create student' : 'Edit student'}</span>
            <h2>{mode === 'create' ? 'Add Student Record' : `Update ${studentDisplayName(student || {})}`}</h2>
          </div>
          <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="student-workspace__form" onSubmit={handleSubmit}>
          <div className="student-workspace__modal-body">
          <section className="student-workspace__form-section">
            <h3>Identity</h3>
            <div className="student-workspace__form-grid student-workspace__form-grid--four">
              <label>
                <span>Student Number</span>
                <input
                  value={
                    mode === 'create'
                      ? studentNumberPreviewLoading
                        ? 'Generating student number...'
                        : studentNumberPreview || 'Student number unavailable'
                      : formatStudentNumber(formState.studentNumber, formState.course)
                  }
                  readOnly
                  aria-readonly="true"
                />
              </label>
              <label>
                <span>First Name</span>
                <input value={formState.firstName} onChange={(event) => handleChange('firstName', event.target.value)} required />
              </label>
              <label>
                <span>Middle Name</span>
                <input value={formState.middleName} onChange={(event) => handleChange('middleName', event.target.value)} />
              </label>
              <label>
                <span>Last Name</span>
                <input value={formState.lastName} onChange={(event) => handleChange('lastName', event.target.value)} required />
              </label>
            </div>
          </section>

          <section className="student-workspace__form-section">
            <h3>Academic setup</h3>
            <div className="student-workspace__form-grid student-workspace__form-grid--four">
              <label>
                <span>Course</span>
                <select value={formState.course} onChange={(event) => handleChange('course', event.target.value)}>
                  {COURSE_OPTIONS.map((course) => (
                    <option key={course.value} value={course.value}>{course.fullLabel}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Year Level</span>
                <select value={formState.yearLevel} onChange={(event) => handleChange('yearLevel', event.target.value)}>
                  {YEAR_LEVEL_OPTIONS.map((yearLevel) => (
                    <option key={yearLevel} value={yearLevel}>{formatYearLevel(yearLevel)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Semester</span>
                <select value={formState.semester} onChange={(event) => handleChange('semester', event.target.value)}>
                  {SEMESTER_OPTIONS.map((semester) => (
                    <option key={semester} value={semester}>{semester}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>School Year</span>
                <input value={formState.schoolYear} onChange={(event) => handleChange('schoolYear', event.target.value)} required pattern="\d{4}-\d{4}" />
              </label>
              <label>
                <span>Lifecycle Status</span>
                <select value={formState.lifecycleStatus} onChange={(event) => handleChange('lifecycleStatus', event.target.value)}>
                  {LIFECYCLE_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Student Status</span>
                <select value={formState.studentStatus} onChange={(event) => handleChange('studentStatus', event.target.value)}>
                  {['Regular', 'Dropped', 'Returnee', 'Transferee'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Scholarship</span>
                <input value={formState.scholarship} onChange={(event) => handleChange('scholarship', event.target.value)} />
              </label>
              <label>
                <span>Suffix</span>
                <input value={formState.suffix} onChange={(event) => handleChange('suffix', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="student-workspace__form-section">
            <h3>Contact</h3>
            <div className="student-workspace__form-grid student-workspace__form-grid--four">
              <label>
                <span>Email</span>
                <input type="email" value={formState.email} onChange={(event) => handleChange('email', event.target.value)} />
              </label>
              <label>
                <span>Contact Number</span>
                <input value={formState.contactNumber} onChange={(event) => handleChange('contactNumber', event.target.value)} required />
              </label>
              <label className="student-workspace__field-span-2">
                <span>Address</span>
                <input value={formState.address} onChange={(event) => handleChange('address', event.target.value)} required />
              </label>
              <label className="student-workspace__field-span-2">
                <span>Permanent Address</span>
                <input value={formState.permanentAddress} onChange={(event) => handleChange('permanentAddress', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="student-workspace__form-section">
            <h3>Background</h3>
            <div className="student-workspace__form-grid student-workspace__form-grid--four">
              <label>
                <span>Birth Date</span>
                <input type="date" value={formState.birthDate} onChange={(event) => handleChange('birthDate', event.target.value)} />
              </label>
              <label>
                <span>Birth Place</span>
                <input value={formState.birthPlace} onChange={(event) => handleChange('birthPlace', event.target.value)} />
              </label>
              <label>
                <span>Gender</span>
                <select value={formState.gender} onChange={(event) => handleChange('gender', event.target.value)}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>
              <label>
                <span>Civil Status</span>
                <select value={formState.civilStatus} onChange={(event) => handleChange('civilStatus', event.target.value)}>
                  <option value="">Select</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                  <option value="Divorced">Divorced</option>
                </select>
              </label>
              <label>
                <span>Nationality</span>
                <input value={formState.nationality} onChange={(event) => handleChange('nationality', event.target.value)} />
              </label>
              <label>
                <span>Religion</span>
                <input value={formState.religion} onChange={(event) => handleChange('religion', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="student-workspace__form-section">
            <h3>Emergency contact</h3>
            <div className="student-workspace__form-grid student-workspace__form-grid--four">
              <label>
                <span>Name</span>
                <input value={formState.emergencyContactName} onChange={(event) => handleChange('emergencyContactName', event.target.value)} />
              </label>
              <label>
                <span>Relationship</span>
                <input value={formState.emergencyContactRelationship} onChange={(event) => handleChange('emergencyContactRelationship', event.target.value)} />
              </label>
              <label>
                <span>Contact Number</span>
                <input value={formState.emergencyContactNumber} onChange={(event) => handleChange('emergencyContactNumber', event.target.value)} />
              </label>
              <label>
                <span>Address</span>
                <input value={formState.emergencyContactAddress} onChange={(event) => handleChange('emergencyContactAddress', event.target.value)} />
              </label>
            </div>
          </section>

          {error ? <div className="student-workspace__message student-workspace__message--error">{error}</div> : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="student-workspace__primary-button" disabled={submitting}>
              {submitting ? 'Saving...' : mode === 'create' ? 'Create student' : 'Save changes'}
            </button>
          </footer>
        </form>
      </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

function EnrollmentModal({
  students,
  onClose,
  onSaved
}: {
  students: ManagedStudent[]
  onClose: () => void
  onSaved: (message: string) => Promise<void> | void
}) {
  const academicContext = useMemo(() => getSharedAcademicContext(students), [students])
  const [schoolYear, setSchoolYear] = useState(academicContext.sharedSchoolYear || getDefaultSchoolYear())
  const [semester, setSemester] = useState<Semester>((academicContext.sharedSemester as Semester) || '1st')
  const [subjects, setSubjects] = useState<SubjectCatalogItem[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    if (!academicContext.sharedCourse || !academicContext.sharedYearLevel) {
      setSubjects([])
      return
    }

    setLoadingSubjects(true)
    setError('')

    ;(async () => {
      try {
        const query = new URLSearchParams({
          course: String(academicContext.sharedCourse),
          yearLevel: String(academicContext.sharedYearLevel),
          semester
        })
        const response = await authorizedFetch<{ success: boolean; data: SubjectCatalogItem[] }>(`/registrar/subjects?${query.toString()}`)
        if (!cancelled) {
          setSubjects(response.data || [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load subjects')
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [academicContext.sharedCourse, academicContext.sharedYearLevel, semester])

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds((current) =>
      current.includes(subjectId) ? current.filter((value) => value !== subjectId) : [...current, subjectId]
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      let successCount = 0
      const failures: string[] = []

      for (const student of students) {
        try {
          await StudentService.enrollStudent(token, student._id, {
            schoolYear,
            semester,
            subjectIds: selectedSubjectIds
          })
          const currentLifecycle = normalizeLifecycleStatus(student)
          await StudentService.updateStudent(token, student._id, {
            schoolYear,
            semester,
            lifecycleStatus: ['Dropped', 'Inactive', 'Graduated'].includes(currentLifecycle) ? currentLifecycle : 'Enrolled'
          })
          successCount += 1
        } catch (studentError) {
          failures.push(`${studentNumberDisplay(student)}: ${studentError instanceof Error ? studentError.message : 'Failed'}`)
        }
      }

      await onSaved(
        failures.length
          ? `Enrollment completed for ${successCount} student(s). ${failures.length} record(s) need attention.`
          : `Enrollment completed for ${successCount} student(s).`
      )
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to process enrollment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
      <div className="student-workspace__modal-overlay" aria-hidden="true" />
      <div className="student-workspace__modal student-workspace__modal--wide">
        <header className="student-workspace__modal-header">
          <div>
            <span className="student-workspace__eyebrow">Enrollment control</span>
            <h2>Enroll {students.length === 1 ? studentDisplayName(students[0]) : `${students.length} selected students`}</h2>
            <p className="student-workspace__modal-subcopy">
              Select the term and subject set to create enrollment records for the current batch.
            </p>
          </div>
          <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="student-workspace__form" onSubmit={handleSubmit}>
          <div className="student-workspace__modal-body">
          <div className="student-workspace__selection-summary">
            {students.map((student) => (
              <span key={student._id} className="student-workspace__selection-chip">
                {studentNumberDisplay(student)} · {studentDisplayName(student)}
              </span>
            ))}
          </div>

          <div className="student-workspace__form-grid student-workspace__form-grid--three">
            <label>
              <span>School Year</span>
              <input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} required pattern="\d{4}-\d{4}" />
            </label>
            <label>
              <span>Semester</span>
              <select value={semester} onChange={(event) => setSemester(event.target.value as Semester)}>
                {SEMESTER_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Academic context</span>
              <input
                value={
                  academicContext.sharedCourse && academicContext.sharedYearLevel
                    ? `${courseShortLabel(academicContext.sharedCourse)} · ${formatYearLevel(academicContext.sharedYearLevel)}`
                    : 'Mixed academic contexts'
                }
                readOnly
              />
            </label>
          </div>

          {!academicContext.sharedCourse || !academicContext.sharedYearLevel ? (
            <div className="student-workspace__message student-workspace__message--error">
              Bulk enrollment only works when the selected students share the same course and year level.
            </div>
          ) : null}

          <section className="student-workspace__form-section">
            <div className="student-workspace__section-heading">
              <div>
                <h3>Subjects</h3>
                <p>Pick the subjects that should appear on the enrollment record.</p>
              </div>
              <span>{selectedSubjectIds.length} selected</span>
            </div>

            {loadingSubjects ? <div className="student-workspace__empty-state student-workspace__empty-state--inline">Loading subjects...</div> : null}

            {!loadingSubjects && subjects.length ? (
              <div className="student-workspace__subject-picker">
                {subjects.map((subject) => {
                  const selected = selectedSubjectIds.includes(subject._id)
                  return (
                    <button
                      key={subject._id}
                      type="button"
                      className={`student-workspace__subject-option ${selected ? 'student-workspace__subject-option--selected' : ''}`}
                      onClick={() => toggleSubject(subject._id)}
                    >
                      <div>
                        <strong>{subject.code}</strong>
                        <p>{subject.title}</p>
                      </div>
                      <span>{subject.units} units</span>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {!loadingSubjects && !subjects.length ? (
              <div className="student-workspace__empty-state student-workspace__empty-state--inline">
                No active subjects match the selected course, year level, and semester.
              </div>
            ) : null}
          </section>

          {error ? <div className="student-workspace__message student-workspace__message--error">{error}</div> : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="student-workspace__primary-button"
              disabled={submitting || !selectedSubjectIds.length || !academicContext.sharedCourse || !academicContext.sharedYearLevel}
            >
              {submitting ? 'Processing...' : 'Create enrollment'}
            </button>
          </footer>
        </form>
      </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

function BlockAssignmentModal({
  students,
  onClose,
  onSaved
}: {
  students: ManagedStudent[]
  onClose: () => void
  onSaved: (message: string) => Promise<void> | void
}) {
  const academicContext = useMemo(() => getSharedAcademicContext(students), [students])
  const [groups, setGroups] = useState<BlockGroup[]>([])
  const [sectionsByGroupId, setSectionsByGroupId] = useState<Record<string, BlockSection[]>>({})
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError('')

      try {
        const fetchedGroups = await authorizedFetch<BlockGroup[]>('/api/blocks/groups')
        const compatibleGroups = fetchedGroups.filter((group) => {
          const parsed = parseBlockGroupMeta(group.name)
          const matchesCourse = !academicContext.sharedCourse || !parsed.course || parsed.course === String(academicContext.sharedCourse)
          const matchesYear = !academicContext.sharedYearLevel || !parsed.yearLevel || parsed.yearLevel === academicContext.sharedYearLevel
          return matchesCourse && matchesYear
        })

        const sectionResponses = await Promise.all(
          compatibleGroups.map(async (group) => {
            try {
              const sections = await authorizedFetch<BlockSection[]>(`/api/blocks/groups/${group._id}/sections`)
              return [group._id, sections] as const
            } catch {
              return [group._id, []] as const
            }
          })
        )

        if (cancelled) return

        const sectionLookup = Object.fromEntries(sectionResponses)
        setGroups(compatibleGroups)
        setSectionsByGroupId(sectionLookup)

        const firstGroupId = compatibleGroups[0]?._id || ''
        setSelectedGroupId(firstGroupId)
        setSelectedSectionId(sectionLookup[firstGroupId]?.[0]?._id || '')
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load block groups')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [academicContext.sharedCourse, academicContext.sharedYearLevel])

  useEffect(() => {
    if (!selectedGroupId) return
    const sections = sectionsByGroupId[selectedGroupId] || []
    if (!sections.some((section) => section._id === selectedSectionId)) {
      setSelectedSectionId(sections[0]?._id || '')
    }
  }, [sectionsByGroupId, selectedGroupId, selectedSectionId])

  const availableSections = sectionsByGroupId[selectedGroupId] || []
  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null
  const currentSections = new Map(
    Object.values(sectionsByGroupId)
      .flat()
      .map((section) => [String(section.sectionCode || '').trim().toUpperCase(), section])
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGroup || !selectedSectionId) return

    setSubmitting(true)
    setError('')

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const targetSchoolYear = schoolYearFromStartYear(selectedGroup.year)
      const targetSection = availableSections.find((section) => section._id === selectedSectionId)
      if (!targetSection) throw new Error('Select a valid section before assigning students.')

      let assignedCount = 0
      const failures: string[] = []

      for (const student of students) {
        try {
          const currentSectionCode = String(student.section || '').trim().toUpperCase()
          const currentSection = currentSections.get(currentSectionCode)

          if (currentSection && currentSection._id !== targetSection._id) {
            try {
              await authorizedFetch(`/api/blocks/sections/${currentSection._id}/students/${student._id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  semester: student.semester,
                  year: schoolYearStart(student.schoolYear)
                })
              })
            } catch (unassignError) {
              const message = unassignError instanceof Error ? unassignError.message : 'Failed to remove current block'
              if (!message.toLowerCase().includes('not assigned')) {
                throw unassignError
              }
            }
          }

          if (!currentSection || currentSection._id !== targetSection._id) {
            const assignmentResponse = await authorizedFetch<{ status?: string }>(
              '/api/blocks/assign-student',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: student._id,
                  sectionId: targetSection._id,
                  semester: selectedGroup.semester,
                  year: selectedGroup.year
                })
              }
            )

            if (assignmentResponse.status === 'OVER_CAPACITY') {
              throw new Error(`${targetSection.sectionCode} is already at capacity.`)
            }
          }

          await StudentService.updateStudent(token, student._id, {
            semester: selectedGroup.semester,
            schoolYear: targetSchoolYear
          })
          assignedCount += 1
        } catch (studentError) {
          failures.push(`${studentNumberDisplay(student)}: ${studentError instanceof Error ? studentError.message : 'Failed'}`)
        }
      }

      await onSaved(
        failures.length
          ? `Block assignment finished for ${assignedCount} student(s). ${failures.length} record(s) need attention.`
          : `Assigned ${assignedCount} student(s) to ${targetSection.sectionCode}.`
      )
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to assign block')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => {
          if (isStudentWorkspaceBackdropTarget(event)) {
            onClose()
          }
        }}
      >
      <div className="student-workspace__modal-overlay" aria-hidden="true" />
      <div className="student-workspace__modal student-workspace__modal--wide">
        <header className="student-workspace__modal-header">
          <div>
            <span className="student-workspace__eyebrow">Block assignment</span>
            <h2>Assign {students.length === 1 ? studentDisplayName(students[0]) : `${students.length} selected students`}</h2>
            <p className="student-workspace__modal-subcopy">
              Pick a compatible block group and section. Changing an existing block will clear the current linked block load before the new assignment is applied.
            </p>
          </div>
          <button type="button" className="student-workspace__ghost-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="student-workspace__form" onSubmit={handleSubmit}>
          <div className="student-workspace__modal-body">
          <div className="student-workspace__selection-summary">
            {students.map((student) => (
              <span key={student._id} className="student-workspace__selection-chip">
                {studentNumberDisplay(student)} · {studentDisplayName(student)} · {student.section || 'No block'}
              </span>
            ))}
          </div>

          <div className="student-workspace__form-grid student-workspace__form-grid--two">
            <label>
              <span>Block Group</span>
              <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={loading || !groups.length}>
                {groups.map((group) => (
                  <option key={group._id} value={group._id}>
                    {group.name} · {group.semester} · {schoolYearFromStartYear(group.year)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Section</span>
              <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={loading || !availableSections.length}>
                {availableSections.map((section) => (
                  <option key={section._id} value={section._id}>
                    {section.sectionCode} · {section.currentPopulation}/{section.capacity}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? <div className="student-workspace__empty-state student-workspace__empty-state--inline">Loading block groups...</div> : null}

          {!loading && !groups.length ? (
            <div className="student-workspace__message student-workspace__message--error">
              No compatible block groups were found for the selected student batch.
            </div>
          ) : null}

          {!loading && availableSections.length ? (
            <section className="student-workspace__form-section">
              <div className="student-workspace__section-heading">
                <div>
                  <h3>Available sections</h3>
                  <p>Choose the section that should own the selected students.</p>
                </div>
              </div>
              <div className="student-workspace__subject-picker">
                {availableSections.map((section) => {
                  const selected = section._id === selectedSectionId
                  return (
                    <button
                      key={section._id}
                      type="button"
                      className={`student-workspace__subject-option ${selected ? 'student-workspace__subject-option--selected' : ''}`}
                      onClick={() => setSelectedSectionId(section._id)}
                    >
                      <div>
                        <strong>{section.sectionCode}</strong>
                        <p>{selectedGroup?.name || 'Selected block group'}</p>
                      </div>
                      <span>{section.currentPopulation}/{section.capacity}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {error ? <div className="student-workspace__message student-workspace__message--error">{error}</div> : null}
          </div>

          <footer className="student-workspace__modal-actions">
            <button type="button" className="student-workspace__ghost-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="student-workspace__primary-button" disabled={submitting || !selectedGroupId || !selectedSectionId}>
              {submitting ? 'Assigning...' : 'Assign block'}
            </button>
          </footer>
        </form>
      </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

export default function StudentManagement() {
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [students, setStudents] = useState<ManagedStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | LifecycleStatus>('all')
  const [blockFilter, setBlockFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [actionMenuStudentId, setActionMenuStudentId] = useState<string | null>(null)
  const [profileState, setProfileState] = useState<{ student: ManagedStudent; tab: ProfileTab } | null>(null)
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; student?: ManagedStudent } | null>(null)
  const [enrollmentStudents, setEnrollmentStudents] = useState<ManagedStudent[] | null>(null)
  const [blockAssignmentStudents, setBlockAssignmentStudents] = useState<ManagedStudent[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busyStudentIds, setBusyStudentIds] = useState<string[]>([])
  const deferredSearch = useDeferredValue(searchTerm)

  const loadStudents = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const response = await StudentService.getStudents(token)
      const records = (extractResponseData<ManagedStudent[]>(response) || []).map((student) => ({
        ...student,
        lifecycleStatus: normalizeLifecycleStatus(student)
      }))

      setStudents(records)
      setSelectedStudentIds((current) => current.filter((id) => records.some((student) => student._id === id)))
    } catch (loadError) {
      setMessage({
        tone: 'error',
        text: loadError instanceof Error ? loadError.message : 'Failed to load students'
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [])

  const filteredStudents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()

    return students
      .filter((student) => {
        const lifecycleStatus = normalizeLifecycleStatus(student)
        if (courseFilter !== 'all' && String(student.course) !== courseFilter) return false
        if (yearFilter !== 'all' && String(student.yearLevel) !== yearFilter) return false
        if (lifecycleFilter !== 'all' && lifecycleStatus !== lifecycleFilter) return false
        if (blockFilter === 'assigned' && !String(student.section || '').trim()) return false
        if (blockFilter === 'unassigned' && String(student.section || '').trim()) return false

        if (!query) return true

        const searchableText = [
          student.studentNumber,
          studentNumberDisplay(student),
          studentDisplayName(student),
          courseShortLabel(student.course),
          student.email,
          student.contactNumber,
          student.section,
          lifecycleStatus
        ]
          .join(' ')
          .toLowerCase()

        return searchableText.includes(query)
      })
      .sort((left, right) => {
        const lastNameComparison = String(left.lastName || '').localeCompare(String(right.lastName || ''))
        if (lastNameComparison !== 0) return lastNameComparison
        return String(left.firstName || '').localeCompare(String(right.firstName || ''))
      })
  }, [blockFilter, courseFilter, deferredSearch, lifecycleFilter, students, yearFilter])

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student._id)),
    [selectedStudentIds, students]
  )

  const stats = useMemo(() => {
    const totalStudents = students.length
    const pendingEnrollment = students.filter((student) => normalizeLifecycleStatus(student) === 'Pending').length
    const activeStudents = students.filter((student) => student.isActive !== false && !['Inactive', 'Dropped', 'Graduated'].includes(normalizeLifecycleStatus(student))).length
    const inactiveStudents = students.filter((student) => normalizeLifecycleStatus(student) === 'Inactive' || student.isActive === false).length
    const graduatingStudents = students.filter((student) => Number(student.yearLevel) >= 4 && normalizeLifecycleStatus(student) !== 'Graduated').length
    return { totalStudents, pendingEnrollment, activeStudents, inactiveStudents, graduatingStudents }
  }, [students])

  const courseOptions = useMemo(() => {
    const values = Array.from(new Set(students.map((student) => normalizeCourseCode(student.course)).filter(Boolean)))
    return COURSE_OPTIONS.filter((course) => values.includes(String(course.value)))
  }, [students])

  const yearLevelOptions = useMemo(() => {
    return Array.from(
      new Set(
        students
          .map((student) => Number(student.yearLevel))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    ).sort((left, right) => left - right)
  }, [students])

  const visibleStudentIds = filteredStudents.map((student) => student._id)
  const allVisibleSelected = visibleStudentIds.length > 0 && visibleStudentIds.every((id) => selectedStudentIds.includes(id))
  const someVisibleSelected = visibleStudentIds.some((id) => selectedStudentIds.includes(id))

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((value) => value !== studentId) : [...current, studentId]
    )
  }

  const toggleVisibleSelection = () => {
    setSelectedStudentIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleStudentIds.includes(id))
      }

      return Array.from(new Set([...current, ...visibleStudentIds]))
    })
  }

  const withBusyStudent = async (studentId: string, action: () => Promise<void>) => {
    setBusyStudentIds((current) => (current.includes(studentId) ? current : [...current, studentId]))
    try {
      await action()
    } finally {
      setBusyStudentIds((current) => current.filter((value) => value !== studentId))
    }
  }

  const openProfile = (student: ManagedStudent, tab: ProfileTab = 'profile') => {
    setProfileState({ student, tab })
  }

  const openEnrollmentWorkflow = (targets: ManagedStudent[]) => {
    if (!targets.length) {
      setMessage({ tone: 'error', text: 'Select at least one student before opening enrollment controls.' })
      return
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setMessage({
        tone: 'error',
        text: 'Bulk enrollment requires students from the same course and year level.'
      })
      return
    }

    setEnrollmentStudents(targets)
  }

  const openBlockAssignmentWorkflow = (targets: ManagedStudent[]) => {
    if (!targets.length) {
      setMessage({ tone: 'error', text: 'Select at least one student before opening block assignment.' })
      return
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setMessage({
        tone: 'error',
        text: 'Bulk block assignment requires students from the same course and year level.'
      })
      return
    }

    setBlockAssignmentStudents(targets)
  }

  const handleLifecycleChange = async (student: ManagedStudent, lifecycleStatus: LifecycleStatus) => {
    setActionMenuStudentId(null)
    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')
        await StudentService.updateStudent(token, student._id, { lifecycleStatus })
        await loadStudents('refresh')
        setMessage({ tone: 'success', text: `${studentNumberDisplay(student)} moved to ${lifecycleStatus}.` })
      } catch (updateError) {
        setMessage({
          tone: 'error',
          text: updateError instanceof Error ? updateError.message : 'Failed to update lifecycle status'
        })
      }
    })
  }

  const handleArchiveStudent = async (student: ManagedStudent) => {
    if (!window.confirm(`Archive ${studentDisplayName(student)}?`)) return

    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')
        await StudentService.updateStudent(token, student._id, { lifecycleStatus: 'Inactive' })
        await loadStudents('refresh')
        setMessage({ tone: 'success', text: `${studentNumberDisplay(student)} archived successfully.` })
      } catch (archiveError) {
        setMessage({
          tone: 'error',
          text: archiveError instanceof Error ? archiveError.message : 'Failed to archive student'
        })
      }
    })
  }

  const handleDeleteStudent = async (student: ManagedStudent) => {
    if (!window.confirm(`Delete ${studentDisplayName(student)} from the student registry?`)) return

    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')
        await StudentService.deleteStudent(token, student._id)
        await loadStudents('refresh')
        setMessage({ tone: 'success', text: `${studentNumberDisplay(student)} removed from the registry.` })
      } catch (deleteError) {
        setMessage({
          tone: 'error',
          text: deleteError instanceof Error ? deleteError.message : 'Failed to delete student'
        })
      }
    })
  }


  const handleExportSelected = () => {
    if (!selectedStudents.length) {
      setMessage({ tone: 'error', text: 'Select students before exporting.' })
      return
    }

    const rows = [
      ['Student Number', 'Name', 'Course', 'Year Level', 'Block', 'Lifecycle', 'COR Status', 'Email', 'Contact'],
      ...selectedStudents.map((student) => [
        studentNumberDisplay(student),
        studentDisplayName(student),
        courseShortLabel(student.course),
        formatYearLevel(student.yearLevel),
        student.section || '',
        normalizeLifecycleStatus(student),
        student.corStatus || 'Pending',
        student.email || '',
        student.contactNumber || ''
      ])
    ]

    downloadCsv(`student-management-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    setMessage({ tone: 'success', text: `Exported ${selectedStudents.length} selected student(s).` })
  }

  return (
    <>
      <section className="student-workspace">
        <header className="student-workspace__header">
          <div className="student-workspace__heading">
            <span className="student-workspace__eyebrow">Registrar workspace</span>
            <h1>Student Management</h1>
            <p>Manage lifecycle status, enrollment control, block assignment, and student records from one registrar workspace.</p>
          </div>

          <div className="student-workspace__header-actions">
            <button type="button" className="student-workspace__secondary-button" onClick={() => loadStudents('refresh')} disabled={refreshing}>
              <History size={16} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="student-workspace__primary-button" onClick={() => setFormModal({ mode: 'create' })}>
              <Plus size={16} />
              Add Student
            </button>
          </div>
        </header>

        <div className="student-workspace__stats">
          <article className="student-workspace__stat-card">
            <span>Total students</span>
            <strong>{stats.totalStudents}</strong>
            <small>Registrar roster</small>
          </article>
          <article className="student-workspace__stat-card student-workspace__stat-card--pending">
            <span>Pending enrollment</span>
            <strong>{stats.pendingEnrollment}</strong>
            <small>Needs registrar action</small>
          </article>
          <article className="student-workspace__stat-card">
            <span>Active students</span>
            <strong>{stats.activeStudents}</strong>
            <small>Operational records</small>
          </article>
          <article className="student-workspace__stat-card">
            <span>Inactive students</span>
            <strong>{stats.inactiveStudents}</strong>
            <small>Archived or paused</small>
          </article>
          <article className="student-workspace__stat-card">
            <span>Graduating students</span>
            <strong>{stats.graduatingStudents}</strong>
            <small>Final year focus</small>
          </article>
        </div>

        {message ? (
          <div className={`student-workspace__message student-workspace__message--${message.tone}`}>
            {message.text}
          </div>
        ) : null}

        <section className="student-workspace__controls-card">
          <div className="student-workspace__filters">
            <label className="student-workspace__search">
              <Search size={16} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search student number, name, course, block, or email"
              />
            </label>

            <label>
              <span>Course</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course.value} value={course.value}>{course.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Year Level</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All year levels</option>
                {yearLevelOptions.map((yearLevel) => (
                  <option key={yearLevel} value={yearLevel}>{formatYearLevel(yearLevel)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Lifecycle</span>
              <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value as 'all' | LifecycleStatus)}>
                <option value="all">All lifecycle states</option>
                {LIFECYCLE_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Block</span>
              <select value={blockFilter} onChange={(event) => setBlockFilter(event.target.value as 'all' | 'assigned' | 'unassigned')}>
                <option value="all">All students</option>
                <option value="assigned">Assigned block</option>
                <option value="unassigned">No block</option>
              </select>
            </label>
          </div>

          {selectedStudents.length ? (
            <div className="student-workspace__bulk-actions">
              <div>
                <span className="student-workspace__eyebrow">Bulk actions</span>
                <strong>{selectedStudents.length} selected</strong>
              </div>

              <div className="student-workspace__bulk-buttons">
                <button type="button" className="student-workspace__secondary-button" onClick={() => openEnrollmentWorkflow(selectedStudents)}>
                  <BookOpenCheck size={16} />
                  Bulk enroll
                </button>
                <button type="button" className="student-workspace__secondary-button" onClick={() => openBlockAssignmentWorkflow(selectedStudents)}>
                  <Blocks size={16} />
                  Bulk assign block
                </button>
                <button type="button" className="student-workspace__secondary-button" onClick={handleExportSelected}>
                  <Download size={16} />
                  Export selected
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="student-workspace__table-card">
          <header className="student-workspace__section-heading">
            <div>
              <h2>Student registry</h2>
              <p>Click a row to open the student profile drawer. Use the lifecycle selector and actions menu for registrar operations.</p>
            </div>
            <span>{filteredStudents.length} visible</span>
          </header>

          {loading ? (
            <div className="student-workspace__empty-state">Loading student records...</div>
          ) : filteredStudents.length ? (
            <div className="student-workspace__table-shell">
              <table className="student-workspace__table">
                <thead>
                  <tr>
                    <th>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select visible students"
                      />
                    </th>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Year</th>
                    <th>Block</th>
                    <th>Lifecycle</th>
                    <th>COR</th>
                    <th>Contact</th>
                    <th className="student-workspace__actions-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const lifecycleStatus = normalizeLifecycleStatus(student)
                    const isBusy = busyStudentIds.includes(student._id)
                    return (
                      <tr key={student._id} className={selectedStudentIds.includes(student._id) ? 'student-workspace__row--selected' : ''} onClick={() => openProfile(student)}>
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(student._id)}
                            onChange={() => toggleStudentSelection(student._id)}
                            aria-label={`Select ${studentNumberDisplay(student)}`}
                          />
                        </td>
                        <td>
                          <div className="student-workspace__student-cell">
                            <strong>{studentDisplayName(student)}</strong>
                            <span>{studentNumberDisplay(student)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell">
                            <strong>{courseShortLabel(student.course)}</strong>
                            <span>{courseFullLabel(student.course)}</span>
                          </div>
                        </td>
                        <td>{formatYearLevel(student.yearLevel)}</td>
                        <td>
                          {student.section ? (
                            <div className="student-workspace__meta-cell">
                              <strong>{formatBlockDisplay(student.section)}</strong>
                            </div>
                          ) : (
                            <span className="student-workspace__muted">No block</span>
                          )}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <label className="student-workspace__status-control">
                            <select
                              value={lifecycleStatus}
                              onChange={(event) => handleLifecycleChange(student, event.target.value as LifecycleStatus)}
                              disabled={isBusy}
                            >
                              {LIFECYCLE_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </label>
                        </td>
                        <td>
                          <ToneBadge
                            label={student.corStatus || 'Pending'}
                            tone={String(student.corStatus || '').toLowerCase() === 'verified' ? 'success' : 'accent'}
                          />
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell">
                            <strong>{student.contactNumber || 'N/A'}</strong>
                            <span>{student.email || 'No email'}</span>
                          </div>
                        </td>
                        <td className="student-workspace__actions-column" onClick={(event) => event.stopPropagation()}>
                          <StudentRowMenu
                            student={student}
                            isOpen={actionMenuStudentId === student._id}
                            onToggle={() => setActionMenuStudentId((current) => (current === student._id ? null : student._id))}
                            onClose={() => setActionMenuStudentId(null)}
                            onViewProfile={() => openProfile(student, 'profile')}
                            onEnroll={() => openEnrollmentWorkflow([student])}
                            onAssignBlock={() => openBlockAssignmentWorkflow([student])}
                            onEdit={() => setFormModal({ mode: 'edit', student })}
                            onViewAcademicRecord={() => openProfile(student, 'enrollment')}
                            onViewEnrolledSubjects={() => openProfile(student, 'subjects')}
                            onViewEnrollmentHistory={() => openProfile(student, 'history')}
                            onArchive={() => handleArchiveStudent(student)}
                            onDelete={() => handleDeleteStudent(student)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="student-workspace__empty-state">
              <Users size={24} />
              <div>
                <strong>No students match the current filters.</strong>
                <p>Adjust the search or lifecycle filters to widen the roster.</p>
              </div>
            </div>
          )}
        </section>
      </section>

      <StudentProfileDrawer
        profileState={profileState}
        onClose={() => setProfileState(null)}
        onEdit={(student) => setFormModal({ mode: 'edit', student })}
        onEnroll={(student) => openEnrollmentWorkflow([student])}
        onAssignBlock={(student) => openBlockAssignmentWorkflow([student])}
      />

      {formModal ? (
        <StudentFormModal
          mode={formModal.mode}
          student={formModal.student}
          onClose={() => setFormModal(null)}
          onSaved={async (text) => {
            await loadStudents('refresh')
            setMessage({ tone: 'success', text })
          }}
        />
      ) : null}

      {enrollmentStudents ? (
        <EnrollmentModal
          students={enrollmentStudents}
          onClose={() => setEnrollmentStudents(null)}
          onSaved={async (text) => {
            await loadStudents('refresh')
            setSelectedStudentIds([])
            setMessage({ tone: 'success', text })
          }}
        />
      ) : null}

      {blockAssignmentStudents ? (
        <BlockAssignmentModal
          students={blockAssignmentStudents}
          onClose={() => setBlockAssignmentStudents(null)}
          onSaved={async (text) => {
            await loadStudents('refresh')
            setSelectedStudentIds([])
            setMessage({ tone: 'success', text })
          }}
        />
      ) : null}
    </>
  )
}

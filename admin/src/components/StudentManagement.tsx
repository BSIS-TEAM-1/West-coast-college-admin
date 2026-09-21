import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Blocks,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  GraduationCap,
  History,
  IdCard,
  Layers3,
  Mail,
  MapPin,
  MoreHorizontal,
  PencilLine,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  X
} from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import StudentService from '../lib/studentApi'
import type { StudentData } from '../lib/studentApi'
import type { WizardFormData } from './AddStudent/types'
import { validateStep } from './AddStudent/validation'
import { buildStudentPayloadFromWizardForm, buildWizardFormData } from './AddStudent/formLogic'
import StudentWizard from './AddStudent/StudentWizard'
import BlockAssignmentModal from './BlockAssignmentModal'
import NotificationToast from './NotificationToast'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'
import {
  COURSE_OPTIONS,
  authorizedFetch,
  courseFullLabel,
  courseShortLabel,
  extractResponseData,
  formatBlockDisplay,
  formatStudentNumber,
  formatYearLevel,
  getDefaultSchoolYear,
  getSharedAcademicContext,
  normalizeCourseCode,
  studentDisplayName,
  studentInitials,
  studentNumberDisplay,
  type Semester
} from '../lib/blockAssignmentShared'
import './StudentManagement.css'

type LifecycleStatus = 'Pending' | 'Enrolled' | 'Not Enrolled' | 'Dropped' | 'Inactive' | 'Graduated' | 'Leave of Absence'
type StudentRegistrySort = 'name-asc' | 'name-desc' | 'id-asc' | 'course-asc' | 'year-asc' | 'updated-desc'
type ProfileTab = 'profile' | 'enrollment' | 'subjects' | 'documents'
type StudentManagementMode = 'management' | 'assign-block'

type StudentManagementProps = {
  mode?: StudentManagementMode
  onViewHistory?: (studentId: string) => void
}

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

const YEAR_LEVEL_OPTIONS = [1, 2, 3, 4, 5]
const LIFECYCLE_OPTIONS: LifecycleStatus[] = ['Pending', 'Enrolled', 'Not Enrolled', 'Dropped', 'Inactive', 'Graduated', 'Leave of Absence']
const SEMESTER_OPTIONS: Semester[] = ['1st', '2nd', 'Summer']

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString()
}

function formatPhoneNumber(value?: string | null) {
  const raw = String(value || '').trim()
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return 'N/A'
  if (digits.length === 11 && digits.startsWith('09')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return raw
}

function formatCurrency(value?: number) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
  }).format(amount)
}

function lifecycleTone(status: LifecycleStatus): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' {
  if (status === 'Pending') return 'warning'
  if (status === 'Enrolled') return 'success'
  if (status === 'Graduated') return 'info'
  if (status === 'Dropped') return 'danger'
  if (status === 'Leave of Absence') return 'accent'
  return 'neutral'
}

function normalizeCorStatus(value?: string) {
  const status = String(value || 'Pending').trim().toLowerCase()
  if (status === 'verified' || status === 'released') return 'Released'
  if (status === 'received' || status === 'processing') return 'Processing'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function corTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' {
  const normalized = normalizeCorStatus(status)
  if (normalized === 'Released') return 'success'
  if (normalized === 'Processing') return 'info'
  if (normalized === 'Rejected') return 'danger'
  return 'warning'
}

function normalizeLifecycleStatus(student: Partial<ManagedStudent>): LifecycleStatus {
  const explicit = String(student.lifecycleStatus || '').trim()
  if (LIFECYCLE_OPTIONS.includes(explicit as LifecycleStatus)) {
    return explicit as LifecycleStatus
  }

  if (student.isActive === false) return 'Inactive'
  if (String(student.studentStatus || '').trim().toLowerCase() === 'dropped') return 'Dropped'
  // enrollmentStatus now comes from Enrollment.status (single source of truth)
  if (String(student.enrollmentStatus || '').trim().toLowerCase() === 'enrolled') return 'Enrolled'
  if (String(student.corStatus || '').trim().toLowerCase() === 'verified') return 'Enrolled'
  return 'Pending'
}

function buildStudentFormState(student?: ManagedStudent): StudentFormState {
  const wizardData = buildWizardFormData(student)

  return {
    studentNumber: wizardData.studentNumber || '',
    firstName: wizardData.firstName || '',
    middleName: wizardData.middleName || '',
    lastName: wizardData.lastName || '',
    suffix: wizardData.suffix || '',
    course: wizardData.course || (student ? '' : '101'),
    yearLevel: wizardData.yearLevel || (student ? '' : '1'),
    semester: (wizardData.semester as Semester) || '1st',
    schoolYear: wizardData.schoolYear || getDefaultSchoolYear(),
    lifecycleStatus: normalizeLifecycleStatus(student || {}),
    studentStatus: wizardData.studentStatus || 'Regular',
    scholarship: wizardData.scholarship || 'N/A',
    email: wizardData.email || '',
    contactNumber: wizardData.contactNumber || '',
    address: wizardData.currentAddress || '',
    permanentAddress: wizardData.permanentAddress || '',
    birthDate: wizardData.birthDate || '',
    birthPlace: wizardData.birthPlace || '',
    gender: wizardData.gender || '',
    civilStatus: wizardData.civilStatus || '',
    nationality: wizardData.nationality || 'Filipino',
    religion: wizardData.religion || '',
    emergencyContactName: wizardData.emergencyContactName || '',
    emergencyContactRelationship: wizardData.emergencyContactRelationship || '',
    emergencyContactNumber: wizardData.emergencyContactNumber || '',
    emergencyContactAddress: student?.emergencyContact?.address || ''
  }
}

function buildWizardFormDataFromStudentForm(formState: StudentFormState): Partial<WizardFormData> {
  return {
    studentNumber: formState.studentNumber,
    firstName: formState.firstName,
    middleName: formState.middleName,
    lastName: formState.lastName,
    suffix: formState.suffix,
    birthDate: formState.birthDate,
    birthPlace: formState.birthPlace,
    gender: formState.gender,
    civilStatus: formState.civilStatus,
    nationality: formState.nationality,
    religion: formState.religion,
    email: formState.email,
    contactNumber: formState.contactNumber,
    currentAddress: formState.address,
    permanentAddress: formState.permanentAddress,
    emergencyContactName: formState.emergencyContactName,
    emergencyContactRelationship: formState.emergencyContactRelationship,
    emergencyContactNumber: formState.emergencyContactNumber,
    course: formState.course,
    schoolYear: formState.schoolYear,
    semester: formState.semester,
    yearLevel: formState.yearLevel,
    studentStatus: formState.studentStatus as WizardFormData['studentStatus'],
    scholarship: formState.scholarship,
    lifecycleStatus: formState.lifecycleStatus as WizardFormData['lifecycleStatus']
  }
}

function buildStudentPayload(formState: StudentFormState) {
  const payload = buildStudentPayloadFromWizardForm(buildWizardFormDataFromStudentForm(formState))
  return {
    ...payload,
    emergencyContact: {
      ...payload.emergencyContact,
      address: formState.emergencyContactAddress.trim()
    }
  }
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


function StudentProfileDrawer({
  profileState,
  onClose,
  onEdit,
  onEnroll,
  onAssignBlock,
  onGenerateCor,
  onGenerateReportCard,
  onGenerateTranscript,
  onArchive,
  onDelete,
  onViewHistory,
  showBlockAssignmentAction = false
}: {
  profileState: { student: ManagedStudent; tab: ProfileTab } | null
  onClose: () => void
  onEdit: (student: ManagedStudent) => void
  onEnroll: (student: ManagedStudent) => void
  onAssignBlock: (student: ManagedStudent) => void
  onGenerateCor: (student: ManagedStudent) => void
  onGenerateReportCard?: (student: ManagedStudent) => void
  onGenerateTranscript?: (student: ManagedStudent) => void
  onArchive: (student: ManagedStudent) => void
  onDelete: (student: ManagedStudent) => void
  onViewHistory?: (studentId: string) => void
  showBlockAssignmentAction?: boolean
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(profileState?.tab || 'profile')
  const [student, setStudent] = useState<ManagedStudent | null>(profileState?.student || null)
  const [currentEnrollment, setCurrentEnrollment] = useState<EnrollmentRecord | null>(null)
  const [history, setHistory] = useState<EnrollmentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    if (!moreOpen) return
    const handlePointer = (event: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [moreOpen])

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

  const totalUnits = useMemo(
    () => (currentEnrollment?.subjects || []).reduce((sum, subject) => sum + (Number(subject.units) || 0), 0),
    [currentEnrollment]
  )

  if (!profileState) return null

  const activeStudent = student || profileState.student
  const lifecycleStatus = normalizeLifecycleStatus(activeStudent)
  const lifecycleToneValue = lifecycleTone(lifecycleStatus)
  const corStatusLabel = normalizeCorStatus(activeStudent.corStatus)
  const corToneValue = corTone(corStatusLabel)
  const fullName = studentDisplayName(activeStudent)
  const studentId = studentNumberDisplay(activeStudent)
  const termLabel = [activeStudent.semester, activeStudent.schoolYear].filter(Boolean).join(' · ') || 'No active term'
  const subjectCount = currentEnrollment?.subjects?.length || 0

  const tabs = [
    { value: 'profile' as ProfileTab, label: 'Profile', icon: <UserRound size={15} /> },
    { value: 'enrollment' as ProfileTab, label: 'Enrollment', icon: <GraduationCap size={15} /> },
    {
      value: 'subjects' as ProfileTab,
      label: `Subjects${subjectCount ? ` (${subjectCount})` : ''}`,
      icon: <Layers3 size={15} />
    },
    {
      value: 'documents' as ProfileTab,
      label: `Documents${documentEntries.length ? ` (${documentEntries.length})` : ''}`,
      icon: <FileText size={15} />
    }
  ]

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
        <div className="student-workspace__profile-modal sd-redesign">
          <header className="sd-hero">
            <span className="sd-avatar" aria-hidden="true">{studentInitials(activeStudent)}</span>
            <div className="sd-hero-main">
              <p className="sd-eyebrow">Student record · <span className="sd-id">{studentId}</span></p>
              <h2 className="sd-name">{fullName}</h2>
              <p className="sd-meta">
                <span>{courseFullLabel(activeStudent.course)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatYearLevel(activeStudent.yearLevel)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBlockDisplay(activeStudent.section) || 'No block assigned'}</span>
                <span aria-hidden="true">·</span>
                <span>{termLabel}</span>
              </p>
              <div className="sd-badges">
                <ToneBadge label={lifecycleStatus} tone={lifecycleToneValue} />
                <ToneBadge label={`COR ${corStatusLabel}`} tone={corToneValue} />
                {activeStudent.scholarship && activeStudent.scholarship !== 'N/A' ? (
                  <ToneBadge label={activeStudent.scholarship} tone="accent" />
                ) : null}
              </div>
            </div>
            <button type="button" className="sd-close" onClick={onClose} aria-label="Close student details">
              <X size={18} />
            </button>
          </header>

          <div className="sd-toolbar">
            <nav className="sd-tabs" aria-label="Student details sections">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`sd-tab${activeTab === tab.value ? ' sd-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.value)}
                  aria-current={activeTab === tab.value ? 'page' : undefined}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="sd-actions">
              <button type="button" className="sd-btn sd-btn--primary" onClick={() => onEnroll(activeStudent)}>
                <BookOpenCheck size={15} />
                Enroll
              </button>
              <button type="button" className="sd-btn" onClick={() => onGenerateCor(activeStudent)} title="Generate Certificate of Registration">
                <FileText size={15} />
                COR
              </button>
              <button type="button" className="sd-btn" onClick={() => onEdit(activeStudent)}>
                <PencilLine size={15} />
                Edit
              </button>
              {showBlockAssignmentAction ? (
                <button type="button" className="sd-btn" onClick={() => onAssignBlock(activeStudent)}>
                  <Blocks size={15} />
                  Block
                </button>
              ) : null}
              <div className="sd-more" ref={moreMenuRef}>
                <button
                  type="button"
                  className="sd-btn sd-btn--icon"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label="More student actions"
                >
                  <MoreHorizontal size={17} />
                </button>
                {moreOpen ? (
                  <div className="sd-menu" role="menu">
                    <p className="sd-menu-label">Records</p>
                    {onViewHistory ? (
                      <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onViewHistory(String(activeStudent._id)) }}>
                        <History size={15} />
                        Enrollment history
                      </button>
                    ) : null}
                    {onGenerateReportCard ? (
                      <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onGenerateReportCard(activeStudent) }}>
                        <FileText size={15} />
                        Report card
                      </button>
                    ) : null}
                    {onGenerateTranscript ? (
                      <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onGenerateTranscript(activeStudent) }}>
                        <FileText size={15} />
                        Transcript of records
                      </button>
                    ) : null}
                    <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setActiveTab('enrollment') }}>
                      <Eye size={15} />
                      Academic record
                    </button>
                    <div className="sd-menu-divider" aria-hidden="true" />
                    <p className="sd-menu-label">Manage</p>
                    <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onArchive(activeStudent) }}>
                      <Archive size={15} />
                      Archive student
                    </button>
                    <button type="button" role="menuitem" className="sd-menu-danger" onClick={() => { setMoreOpen(false); onDelete(activeStudent) }}>
                      <Trash2 size={15} />
                      Delete record
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="sd-content">
            {loading ? <div className="sd-state">Loading student record…</div> : null}
            {!loading && error ? <div className="sd-state sd-state--error">{error}</div> : null}

            {!loading && !error && activeTab === 'profile' ? (
              <div className="sd-grid">
                <section className="sd-card">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><UserRound size={16} /></span>
                    <div>
                      <h3>Personal information</h3>
                      <p>Identity and background</p>
                    </div>
                  </header>
                  <dl className="sd-dl">
                    <div><dt>Student no.</dt><dd className="sd-mono">{studentId}</dd></div>
                    <div><dt>Birth date</dt><dd>{formatDate(activeStudent.birthDate)}</dd></div>
                    <div><dt>Birth place</dt><dd>{activeStudent.birthPlace || 'N/A'}</dd></div>
                    <div><dt>Gender</dt><dd>{activeStudent.gender || 'N/A'}</dd></div>
                    <div><dt>Civil status</dt><dd>{activeStudent.civilStatus || 'N/A'}</dd></div>
                    <div><dt>Nationality</dt><dd>{activeStudent.nationality || 'N/A'}</dd></div>
                    <div><dt>Religion</dt><dd>{activeStudent.religion || 'N/A'}</dd></div>
                  </dl>
                </section>

                <section className="sd-card">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><MapPin size={16} /></span>
                    <div>
                      <h3>Contact and address</h3>
                      <p>How to reach the student</p>
                    </div>
                  </header>
                  <dl className="sd-dl">
                    <div><dt>Email</dt><dd className="sd-break">{activeStudent.email || 'N/A'}</dd></div>
                    <div><dt>Contact</dt><dd>{formatPhoneNumber(activeStudent.contactNumber)}</dd></div>
                    <div><dt>Present</dt><dd>{activeStudent.address || 'N/A'}</dd></div>
                    <div><dt>Permanent</dt><dd>{activeStudent.permanentAddress || 'N/A'}</dd></div>
                  </dl>
                  <div className="sd-subhead">
                    <ShieldCheck size={14} />
                    Emergency contact
                  </div>
                  <dl className="sd-dl">
                    <div><dt>Name</dt><dd>{activeStudent.emergencyContact?.name || 'N/A'}</dd></div>
                    <div><dt>Relation</dt><dd>{activeStudent.emergencyContact?.relationship || 'N/A'}</dd></div>
                    <div><dt>Number</dt><dd>{formatPhoneNumber(activeStudent.emergencyContact?.contactNumber)}</dd></div>
                    <div><dt>Address</dt><dd>{activeStudent.emergencyContact?.address || 'N/A'}</dd></div>
                  </dl>
                </section>

                <section className="sd-card sd-card--wide">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><GraduationCap size={16} /></span>
                    <div>
                      <h3>Academic placement</h3>
                      <p>Current registrar assignment</p>
                    </div>
                    <span className="sd-card-count">{termLabel}</span>
                  </header>
                  <dl className="sd-dl sd-dl--3">
                    <div><dt>Course</dt><dd>{courseFullLabel(activeStudent.course)}</dd></div>
                    <div><dt>Year</dt><dd>{formatYearLevel(activeStudent.yearLevel)}</dd></div>
                    <div><dt>Block</dt><dd>{formatBlockDisplay(activeStudent.section) || 'Unassigned'}</dd></div>
                    <div><dt>Lifecycle</dt><dd><ToneBadge label={lifecycleStatus} tone={lifecycleToneValue} /></dd></div>
                    <div><dt>Enrollment</dt><dd>{activeStudent.enrollmentStatus || 'N/A'}</dd></div>
                    <div><dt>Student type</dt><dd>{activeStudent.studentStatus || 'N/A'}</dd></div>
                    <div><dt>Scholarship</dt><dd>{activeStudent.scholarship || 'N/A'}</dd></div>
                    <div><dt>COR</dt><dd><ToneBadge label={corStatusLabel} tone={corToneValue} /></dd></div>
                    <div><dt>Record</dt><dd>{activeStudent.isActive === false ? 'Archived' : 'Active'}</dd></div>
                  </dl>
                </section>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'enrollment' ? (
              <div className="sd-grid">
                <section className="sd-card">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><CalendarDays size={16} /></span>
                    <div>
                      <h3>Current enrollment</h3>
                      <p>{currentEnrollment ? `${currentEnrollment.semester} · ${currentEnrollment.schoolYear}` : 'Active term record'}</p>
                    </div>
                  </header>
                  {currentEnrollment ? (
                    <dl className="sd-dl">
                      <div><dt>Status</dt><dd>{currentEnrollment.status}</dd></div>
                      <div><dt>Year level</dt><dd>{currentEnrollment.yearLevel ? formatYearLevel(currentEnrollment.yearLevel) : formatYearLevel(activeStudent.yearLevel)}</dd></div>
                      <div><dt>Subjects</dt><dd>{subjectCount} subjects · {totalUnits} units</dd></div>
                      <div><dt>Remarks</dt><dd>{currentEnrollment.remarks || 'No remarks'}</dd></div>
                      <div><dt>Updated</dt><dd>{formatDate(currentEnrollment.updatedAt)}</dd></div>
                    </dl>
                  ) : (
                    <div className="sd-state sd-state--inline">No active enrollment record for the current term.</div>
                  )}
                </section>

                <section className="sd-card">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><Wallet size={16} /></span>
                    <div>
                      <h3>Assessment</h3>
                      <p>Tuition, fees, and balance</p>
                    </div>
                    {currentEnrollment?.assessment?.paymentStatus ? (
                      <ToneBadge label={currentEnrollment.assessment.paymentStatus} tone="info" />
                    ) : null}
                  </header>
                  {currentEnrollment?.assessment ? (
                    <dl className="sd-dl">
                      <div><dt>Tuition</dt><dd>{formatCurrency(currentEnrollment.assessment.tuitionFee)}</dd></div>
                      <div><dt>Misc.</dt><dd>{formatCurrency(currentEnrollment.assessment.miscFee)}</dd></div>
                      <div><dt>Other fees</dt><dd>{formatCurrency(currentEnrollment.assessment.otherFees)}</dd></div>
                      <div className="sd-total"><dt>Total</dt><dd>{formatCurrency(currentEnrollment.assessment.totalAmount)}</dd></div>
                      <div className="sd-total"><dt>Balance</dt><dd>{formatCurrency(currentEnrollment.assessment.balance)}</dd></div>
                    </dl>
                  ) : (
                    <div className="sd-state sd-state--inline">No assessment has been posted for this term.</div>
                  )}
                </section>

                <section className="sd-card sd-card--wide">
                  <header className="sd-card-head">
                    <span className="sd-card-icon"><IdCard size={16} /></span>
                    <div>
                      <h3>Registrar identifiers</h3>
                      <p>System and audit references</p>
                    </div>
                  </header>
                  <dl className="sd-dl sd-dl--3">
                    <div><dt>Student no.</dt><dd className="sd-mono">{studentId}</dd></div>
                    <div><dt>Course code</dt><dd>{courseShortLabel(activeStudent.course)}</dd></div>
                    <div><dt>Created</dt><dd>{formatDate(activeStudent.createdAt)}</dd></div>
                  </dl>
                </section>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'subjects' ? (
              <section className="sd-card">
                <header className="sd-card-head">
                  <span className="sd-card-icon"><Layers3 size={16} /></span>
                  <div>
                    <h3>Enrolled subjects</h3>
                    <p>{currentEnrollment ? `${currentEnrollment.semester} · ${currentEnrollment.schoolYear}` : 'Active term load'}</p>
                  </div>
                  <span className="sd-card-count">{subjectCount} subjects · {totalUnits} units</span>
                </header>
                {currentEnrollment?.subjects?.length ? (
                  <ul className="sd-list">
                    {currentEnrollment.subjects.map((subject) => (
                      <li key={`${subject.code}-${subject.title}`} className="sd-row">
                        <div className="sd-row-main">
                          <strong>{subject.code} <span className="sd-units">· {subject.units} units</span></strong>
                          <p>{subject.title}</p>
                          <small>{subject.schedule || 'TBA'} · {subject.room || 'TBA'} · {subject.instructor || 'TBA'}</small>
                        </div>
                        <ToneBadge label={subject.status || 'Enrolled'} tone="info" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="sd-state sd-state--inline">No enrolled subjects for the active term.</div>
                )}
              </section>
            ) : null}

            {!loading && !error && activeTab === 'documents' ? (
              <section className="sd-card">
                <header className="sd-card-head">
                  <span className="sd-card-icon"><FileText size={16} /></span>
                  <div>
                    <h3>Documents</h3>
                    <p>Submissions tracked across enrollment history</p>
                  </div>
                  <span className="sd-card-count">{documentEntries.length} files</span>
                </header>
                {documentEntries.length ? (
                  <ul className="sd-list">
                    {documentEntries.map((document) => (
                      <li key={document.id} className="sd-row">
                        <div className="sd-row-main">
                          <strong>{document.name || 'Enrollment document'}</strong>
                          <p>{document.semester} · {document.schoolYear}</p>
                          <small>Submitted {formatDate(document.dateSubmitted)}{document.dateVerified ? ` · Verified ${formatDate(document.dateVerified)}` : ''}</small>
                        </div>
                        <ToneBadge label={document.status || 'Submitted'} tone="neutral" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="sd-state sd-state--inline">No document tracking entries recorded yet.</div>
                )}
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
      const nextFormState = {
        ...formState,
        studentNumber: formState.studentNumber || studentNumberPreview
      }
      const wizardFormData = buildWizardFormDataFromStudentForm(nextFormState)
      const validationErrors = validateStep('review', wizardFormData)
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.map((validationError) => validationError.message).join(', '))
      }

      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      const payload = buildStudentPayload(nextFormState)
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
                  {['Regular', 'Irregular'].map((status) => (
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

  // Students already enrolled for the term chosen in this modal cannot be
  // enrolled again (the backend rejects duplicates with 400). They are
  // listed and skipped instead of failing the whole batch. Enrolling an
  // already-enrolled student for a *different* term remains allowed.
  const alreadyEnrolledForTerm = useMemo(
    () =>
      students.filter(
        (student) =>
          normalizeLifecycleStatus(student) === 'Enrolled' &&
          String(student.schoolYear || '') === schoolYear &&
          String(student.semester || '') === semester
      ),
    [students, schoolYear, semester]
  )
  const enrollableStudents = useMemo(
    () => students.filter((student) => !alreadyEnrolledForTerm.includes(student)),
    [students, alreadyEnrolledForTerm]
  )
  const allAlreadyEnrolled = students.length > 0 && enrollableStudents.length === 0

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      let successCount = 0
      const failures: string[] = []

      for (const student of enrollableStudents) {
        try {
          await StudentService.enrollStudent(token, student._id, {
            schoolYear,
            semester,
            subjectIds: selectedSubjectIds
          })
          const currentLifecycle = normalizeLifecycleStatus(student)
          // The enrollment record starts as Pending. The backend grants the
          // official ENROLLED status only when a block is assigned
          // (block-assignment finalization) — the frontend must never set it.
          await StudentService.updateStudent(token, student._id, {
            schoolYear,
            semester,
            lifecycleStatus: ['Dropped', 'Inactive', 'Graduated'].includes(currentLifecycle) ? currentLifecycle : 'Pending'
          })
          successCount += 1
        } catch (studentError) {
          failures.push(`${studentNumberDisplay(student)}: ${studentError instanceof Error ? studentError.message : 'Failed'}`)
        }
      }

      await onSaved(
        failures.length
          ? `Enrollment records created (pending) for ${successCount} student(s). ${failures.length} record(s) need attention.${alreadyEnrolledForTerm.length ? ` ${alreadyEnrolledForTerm.length} skipped (already enrolled for ${semester} ${schoolYear}).` : ''} Assign a block to finalize enrollment.`
          : `Enrollment records created (pending) for ${successCount} student(s).${alreadyEnrolledForTerm.length ? ` ${alreadyEnrolledForTerm.length} skipped (already enrolled for ${semester} ${schoolYear}).` : ''} Assign a block to finalize enrollment.`
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
      <div className="student-workspace__modal student-workspace__modal--wide student-workspace__modal--enroll">
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

          {alreadyEnrolledForTerm.length > 0 ? (
            <div className="student-workspace__message student-workspace__message--warning">
              {alreadyEnrolledForTerm.length === students.length
                ? `Everyone selected is already enrolled for ${semester} ${schoolYear}. Change the term above to enroll for a different term.`
                : `${alreadyEnrolledForTerm.length} selected student(s) already enrolled for ${semester} ${schoolYear} will be skipped: ${alreadyEnrolledForTerm.map((student) => studentNumberDisplay(student)).join(', ')}.`}
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
              disabled={submitting || allAlreadyEnrolled || !selectedSubjectIds.length || !academicContext.sharedCourse || !academicContext.sharedYearLevel}
              title={allAlreadyEnrolled ? `Already enrolled for ${semester} ${schoolYear} — change the term to enroll for a different term` : undefined}
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


export default function StudentManagement({ mode = 'management', onViewHistory }: StudentManagementProps = {}) {
  const isAssignBlockMode = mode === 'assign-block'
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [students, setStudents] = useState<ManagedStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | LifecycleStatus>('all')
  const [blockFilter, setBlockFilter] = useState(isAssignBlockMode ? 'unassigned' : 'all')
  const [corFilter, setCorFilter] = useState('all')
  const [sortBy, setSortBy] = useState<StudentRegistrySort>('name-asc')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [profileState, setProfileState] = useState<{ student: ManagedStudent; tab: ProfileTab } | null>(null)
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; student?: ManagedStudent } | null>(null)
  const [enrollmentStudents, setEnrollmentStudents] = useState<ManagedStudent[] | null>(null)
  const [blockAssignmentStudents, setBlockAssignmentStudents] = useState<ManagedStudent[] | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null)
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
      setNotification({
        type: 'error',
        title: 'Error',
        message: loadError instanceof Error ? loadError.message : 'Failed to load students'
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
        const blockLabel = String(student.section || '').trim()
        if (blockFilter === 'assigned' && !blockLabel) return false
        if (blockFilter === 'unassigned' && blockLabel) return false
        if (blockFilter.startsWith('block:') && formatBlockDisplay(blockLabel) !== blockFilter.slice(6)) return false
        if (corFilter !== 'all' && normalizeCorStatus(student.corStatus) !== corFilter) return false

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
        if (sortBy === 'name-desc') {
          const lastNameComparison = String(right.lastName || '').localeCompare(String(left.lastName || ''))
          if (lastNameComparison !== 0) return lastNameComparison
          return String(right.firstName || '').localeCompare(String(left.firstName || ''))
        }
        if (sortBy === 'id-asc') {
          return studentNumberDisplay(left).localeCompare(studentNumberDisplay(right))
        }
        if (sortBy === 'course-asc') {
          const courseComparison = courseShortLabel(left.course).localeCompare(courseShortLabel(right.course))
          if (courseComparison !== 0) return courseComparison
          return Number(left.yearLevel || 0) - Number(right.yearLevel || 0)
        }
        if (sortBy === 'year-asc') {
          const yearComparison = Number(left.yearLevel || 0) - Number(right.yearLevel || 0)
          if (yearComparison !== 0) return yearComparison
          return courseShortLabel(left.course).localeCompare(courseShortLabel(right.course))
        }
        if (sortBy === 'updated-desc') {
          return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime()
        }
        const lastNameComparison = String(left.lastName || '').localeCompare(String(right.lastName || ''))
        if (lastNameComparison !== 0) return lastNameComparison
        return String(left.firstName || '').localeCompare(String(right.firstName || ''))
      })
  }, [blockFilter, corFilter, courseFilter, deferredSearch, lifecycleFilter, sortBy, students, yearFilter])

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

  const blockOptions = useMemo(() => {
    return Array.from(
      new Set(
        students
          .map((student) => String(student.section || '').trim())
          .filter(Boolean)
          .map(formatBlockDisplay)
      )
    ).sort((left, right) => left.localeCompare(right))
  }, [students])

  useEffect(() => {
    setCurrentPage(1)
  }, [blockFilter, corFilter, courseFilter, deferredSearch, lifecycleFilter, rowsPerPage, sortBy, yearFilter])

  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / rowsPerPage))
  const normalizedPage = Math.min(currentPage, pageCount)
  const pageStart = (normalizedPage - 1) * rowsPerPage
  const paginatedStudents = filteredStudents.slice(pageStart, pageStart + rowsPerPage)
  const visibleStudentIds = paginatedStudents.map((student) => student._id)
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
      setNotification({ type: 'error', title: 'Selection Required', message: 'Select at least one student before opening enrollment controls.' })
      return
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setNotification({ type: 'error', title: 'Bulk Enrollment Error', message: 'Bulk enrollment requires students from the same course and year level.' })
      return
    }

    setEnrollmentStudents(targets)
  }

  const openBlockAssignmentWorkflow = (targets: ManagedStudent[]) => {
    if (!targets.length) {
      setNotification({ type: 'error', title: 'Selection Required', message: 'Select at least one student before opening block assignment.' })
      return
    }

    const context = getSharedAcademicContext(targets)
    if (targets.length > 1 && (!context.isSingleCourse || !context.isSingleYearLevel)) {
      setNotification({ type: 'error', title: 'Bulk Assignment Error', message: 'Bulk block assignment requires students from the same course and year level.' })
      return
    }

    setBlockAssignmentStudents(targets)
  }

  const handleLifecycleChange = async (student: ManagedStudent, lifecycleStatus: LifecycleStatus) => {
    // Client-side lock (the backend re-validates authoritatively and returns
    // 409 for the same case): Enrolled requires a block assignment, so the
    // manual control refuses it up front instead of sending a doomed request.
    if (lifecycleStatus === 'Enrolled' && !String(student.section || '').trim()) {
      setNotification({
        type: 'error',
        title: 'Block Required',
        message: `${studentNumberDisplay(student)} has no block assignment. Assign a block first — enrollment finalizes to Enrolled automatically.`
      })
      return
    }
    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')
        await StudentService.updateStudent(token, student._id, { lifecycleStatus })
        await loadStudents('refresh')
        setNotification({ type: 'success', title: 'Status Updated', message: `${studentNumberDisplay(student)} moved to ${lifecycleStatus}.` })
      } catch (updateError) {
        setNotification({
          type: 'error',
          title: 'Update Failed',
          message: updateError instanceof Error ? updateError.message : 'Failed to update lifecycle status'
        })
      }
    })
  }

  const handleGenerateCor = async (student: ManagedStudent) => {
    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')

        const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/cor`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error((data?.error as string) || (data?.message as string) || 'Failed to generate COR')
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
        setNotification({ type: 'success', title: 'COR Generated', message: `COR generated for ${studentNumberDisplay(student)}.` })
      } catch (viewError) {
        setNotification({
          type: 'error',
          title: 'COR Generation Failed',
          message: viewError instanceof Error ? viewError.message : 'Failed to generate COR'
        })
      }
    })
  }

  const handleGenerateReportCard = async (student: ManagedStudent) => {
    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')

        const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/report-card`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error((data?.error as string) || 'Failed to generate report card')
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
        setNotification({ type: 'success', title: 'Report Card Generated', message: `Report card generated for ${studentNumberDisplay(student)}.` })
      } catch (viewError) {
        setNotification({
          type: 'error',
          title: 'Report Card Failed',
          message: viewError instanceof Error ? viewError.message : 'Failed to generate report card'
        })
      }
    })
  }

  const handleGenerateTranscript = async (student: ManagedStudent) => {
    await withBusyStudent(student._id, async () => {
      try {
        const token = await getStoredToken()
        if (!token) throw new Error('No authentication token found')

        const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/transcript`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error((data?.error as string) || 'Failed to generate transcript')
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
        setNotification({ type: 'success', title: 'Transcript Generated', message: `Transcript generated for ${studentNumberDisplay(student)}.` })
      } catch (viewError) {
        setNotification({
          type: 'error',
          title: 'Transcript Failed',
          message: viewError instanceof Error ? viewError.message : 'Failed to generate transcript'
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
        setProfileState(null)
        setNotification({ type: 'success', title: 'Student Archived', message: `${studentNumberDisplay(student)} archived successfully.` })
      } catch (archiveError) {
        setNotification({
          type: 'error',
          title: 'Archive Failed',
          message: archiveError instanceof Error ? archiveError.message : 'Failed to archive student'
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
        setProfileState(null)
        setNotification({ type: 'success', title: 'Student Deleted', message: `${studentNumberDisplay(student)} removed from the registry.` })
      } catch (deleteError) {
        setNotification({
          type: 'error',
          title: 'Delete Failed',
          message: deleteError instanceof Error ? deleteError.message : 'Failed to delete student'
        })
      }
    })
  }

  const handleExportSelected = () => {
    if (!selectedStudents.length) {
      setNotification({ type: 'error', title: 'Selection Required', message: 'Select students before exporting.' })
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
    setNotification({ type: 'success', title: 'Export Complete', message: `Exported ${selectedStudents.length} selected student(s).` })
  }

  const handleExportRoster = () => {
    const source = selectedStudents.length ? selectedStudents : filteredStudents
    if (!source.length) {
      setNotification({ type: 'error', title: 'Export Failed', message: 'No student records available to export.' })
      return
    }

    const rows = [
      ['Student Number', 'Name', 'Course', 'Year Level', 'Block', 'Lifecycle', 'COR Status', 'Email', 'Contact'],
      ...source.map((student) => [
        studentNumberDisplay(student),
        studentDisplayName(student),
        courseShortLabel(student.course),
        formatYearLevel(student.yearLevel),
        student.section || '',
        normalizeLifecycleStatus(student),
        normalizeCorStatus(student.corStatus),
        student.email || '',
        student.contactNumber || ''
      ])
    ]

    downloadCsv(`student-registry-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    setNotification({ type: 'success', title: 'Export Complete', message: `Exported ${source.length} student record(s).` })
  }

  return (
    <>
      <section className="student-workspace">
        <header className="student-workspace__header">
          <div className="student-workspace__heading">
            <span className="student-workspace__eyebrow">{isAssignBlockMode ? 'Block assignment' : 'Registrar workspace'}</span>
            <h1>{isAssignBlockMode ? 'Assign Block' : 'Student Management'}</h1>
            <p>
              {isAssignBlockMode
                ? 'Select students from the list, then assign them to a compatible block section.'
                : 'Manage lifecycle status, enrollment control, block assignment, and student records from one registrar workspace.'}
            </p>
          </div>

          <div className="student-workspace__header-actions">
            <button type="button" className="student-workspace__secondary-button" onClick={() => loadStudents('refresh')} disabled={refreshing}>
              <History size={16} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        {!isAssignBlockMode ? (
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
        ) : null}

        {notification && (
          <NotificationToast
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        <section className="student-workspace__controls-card">
          <div className="student-workspace__filters">
            <label className="student-workspace__search">
              <Search size={18} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, student ID, email, or phone"
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
              <span>Year</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All year levels</option>
                {yearLevelOptions.map((yearLevel) => (
                  <option key={yearLevel} value={yearLevel}>{formatYearLevel(yearLevel)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Block</span>
              <select value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)}>
                <option value="all">All blocks</option>
                <option value="assigned">Assigned block</option>
                <option value="unassigned">No block</option>
                {blockOptions.map((block) => (
                  <option key={block} value={`block:${block}`}>{block}</option>
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
              <span>COR Status</span>
              <select value={corFilter} onChange={(event) => setCorFilter(event.target.value)}>
                <option value="all">All COR statuses</option>
                {['Pending', 'Processing', 'Released', 'Rejected'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as StudentRegistrySort)}>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="id-asc">Student ID</option>
                <option value="course-asc">Course</option>
                <option value="year-asc">Year level</option>
                <option value="updated-desc">Recently updated</option>
              </select>
            </label>
          </div>

          <div className="student-workspace__toolbar-actions">
            {isAssignBlockMode ? (
              <button
                type="button"
                className="student-workspace__primary-button"
                onClick={() => openBlockAssignmentWorkflow(selectedStudents)}
                disabled={!selectedStudents.length}
              >
                <Blocks size={16} />
                Assign Selected
              </button>
            ) : (
              <button
                type="button"
                className="student-workspace__secondary-button"
                onClick={() => openEnrollmentWorkflow(selectedStudents)}
                disabled={!selectedStudents.length}
              >
                <Layers3 size={16} />
                Bulk Actions
              </button>
            )}
            <button type="button" className="student-workspace__secondary-button" onClick={handleExportRoster}>
              <Download size={16} />
              Export
            </button>
            {!isAssignBlockMode ? (
              <>
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => setNotification({ type: 'error', title: 'Not Available', message: 'Import workflow is not connected yet.' })}
                >
                  <Upload size={16} />
                  Import
                </button>
                <button type="button" className="student-workspace__primary-button" onClick={() => setFormModal({ mode: 'create' })}>
                  <UserPlus size={16} />
                  Add Student
                </button>
              </>
            ) : null}
          </div>

          {selectedStudents.length ? (
            <div className="student-workspace__bulk-actions">
              <div>
                <span className="student-workspace__eyebrow">{isAssignBlockMode ? 'Ready to assign' : 'Bulk actions'}</span>
                <strong>{selectedStudents.length} selected</strong>
              </div>

              <div className="student-workspace__bulk-buttons">
                {!isAssignBlockMode ? (
                  <button type="button" className="student-workspace__secondary-button" onClick={() => openEnrollmentWorkflow(selectedStudents)}>
                    <BookOpenCheck size={16} />
                    Bulk enroll
                  </button>
                ) : null}
                {isAssignBlockMode ? (
                  <button type="button" className="student-workspace__secondary-button" onClick={() => openBlockAssignmentWorkflow(selectedStudents)}>
                    <Blocks size={16} />
                    Assign selected
                  </button>
                ) : null}
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
              <h2>{isAssignBlockMode ? 'Students for block assignment' : 'Student registry'}</h2>
              <p>
                {isAssignBlockMode
                  ? 'Select one or more students, then use Assign Selected to choose a block section.'
                  : 'Click a row to open the student profile drawer. Use the lifecycle selector for quick registrar updates.'}
              </p>
            </div>
            <div className="student-workspace__table-count">
              <span>Showing {paginatedStudents.length} of {filteredStudents.length.toLocaleString()} Students</span>
              {filteredStudents.length !== students.length && <small>{students.length.toLocaleString()} total records</small>}
            </div>
          </header>

          {loading ? (
            <div className="student-workspace__empty-state">Loading student records...</div>
          ) : filteredStudents.length ? (
            <div className="student-workspace__table-shell">
              <table className="student-workspace__table">
                <colgroup>
                  <col className="student-workspace__col-select" />
                  <col className="student-workspace__col-student" />
                  <col className="student-workspace__col-course" />
                  <col className="student-workspace__col-year-block" />
                  <col className="student-workspace__col-lifecycle" />
                  <col className="student-workspace__col-cor" />
                  <col className="student-workspace__col-contact" />
                </colgroup>
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
                    <th>Year & Block</th>
                    <th>Lifecycle</th>
                    <th>COR</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student) => {
                    const lifecycleStatus = normalizeLifecycleStatus(student)
                    const isBusy = busyStudentIds.includes(student._id)
                    const blockLabel = String(student.section || '').trim()
                    const corStatus = normalizeCorStatus(student.corStatus)
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
                            <span className="student-workspace__avatar" aria-hidden="true">{studentInitials(student)}</span>
                            <div>
                              <strong>{studentDisplayName(student)}</strong>
                              <span className="student-workspace__student-id">{studentNumberDisplay(student)}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell">
                            <strong>{courseShortLabel(student.course)}</strong>
                            <span title={courseFullLabel(student.course)}>{courseFullLabel(student.course)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="student-workspace__meta-cell student-workspace__year-block-cell">
                            <strong>{formatYearLevel(student.yearLevel)}</strong>
                            {blockLabel ? (
                              <span>{formatBlockDisplay(blockLabel)}</span>
                            ) : (
                              <span>No Block Assigned</span>
                            )}
                          </div>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <label className={`student-workspace__status-control student-workspace__status-control--${lifecycleTone(lifecycleStatus)}`}>
                            <select
                              value={lifecycleStatus}
                              onChange={(event) => handleLifecycleChange(student, event.target.value as LifecycleStatus)}
                              disabled={isBusy}
                              aria-label={`Lifecycle status for ${studentDisplayName(student)}`}
                              title={blockLabel ? undefined : 'Enrolled requires a block assignment'}
                            >
                              {LIFECYCLE_OPTIONS.map((status) => {
                                const requiresMissingBlock = status === 'Enrolled' && !blockLabel
                                return (
                                  <option key={status} value={status} disabled={requiresMissingBlock}>
                                    {status}{requiresMissingBlock ? ' (requires block)' : ''}
                                  </option>
                                )
                              })}
                            </select>
                          </label>
                        </td>
                        <td>
                          <ToneBadge
                            label={corStatus}
                            tone={corTone(corStatus)}
                          />
                        </td>
                        <td>
                          <div className="student-workspace__contact-cell">
                            <span>
                              <Phone size={13} aria-hidden="true" />
                              <strong>{formatPhoneNumber(student.contactNumber)}</strong>
                            </span>
                            {student.email ? (
                              <span title={student.email}>
                                <Mail size={13} aria-hidden="true" />
                                <span className="student-workspace__contact-value">{student.email}</span>
                              </span>
                            ) : (
                              <span className="student-workspace__contact-warning">
                                <Mail size={13} aria-hidden="true" />
                                No Email
                              </span>
                            )}
                          </div>
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

          {!loading && filteredStudents.length ? (
            <footer className="student-workspace__pagination" aria-label="Student registry pagination">
              <label>
                Rows per page
                <select value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))}>
                  {[10, 25, 50, 100].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <span>
                Page {normalizedPage} of {pageCount}
              </span>
              <div className="student-workspace__pagination-actions">
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={normalizedPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="student-workspace__secondary-button"
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  disabled={normalizedPage >= pageCount}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          ) : null}
        </section>
      </section>

      <StudentProfileDrawer
        profileState={profileState}
        onClose={() => setProfileState(null)}
        onEdit={(student) => setFormModal({ mode: 'edit', student })}
        onEnroll={(student) => openEnrollmentWorkflow([student])}
        onAssignBlock={(student) => openBlockAssignmentWorkflow([student])}
        onGenerateCor={handleGenerateCor}
        onGenerateReportCard={handleGenerateReportCard}
        onGenerateTranscript={handleGenerateTranscript}
        onArchive={handleArchiveStudent}
        onDelete={handleDeleteStudent}
        onViewHistory={onViewHistory}
        showBlockAssignmentAction={isAssignBlockMode}
      />

      {formModal?.mode === 'edit' && formModal.student ? (
        <StudentWorkspaceOverlay>
          <div
            className="student-workspace__modal-shell"
            role="dialog"
            aria-modal="true"
            onPointerDown={(event) => {
              if (isStudentWorkspaceBackdropTarget(event)) {
                setFormModal(null)
              }
            }}
          >
            <div className="student-workspace__modal-overlay" aria-hidden="true" />
            <div className="student-workspace__wizard-modal" onPointerDown={(event) => event.stopPropagation()}>
              <StudentWizard
                mode="edit"
                studentId={formModal.student._id}
                initialData={{
                  ...buildWizardFormData({
                    ...formModal.student,
                    lifecycleStatus: normalizeLifecycleStatus(formModal.student)
                  }),
                  studentNumber: studentNumberDisplay(formModal.student)
                }}
                onClose={() => setFormModal(null)}
                onSuccess={async () => {
                  await loadStudents('refresh')
                  setNotification({ type: 'success', title: 'Success', message: 'Student record updated successfully.' })
                  setFormModal(null)
                }}
              />
            </div>
          </div>
        </StudentWorkspaceOverlay>
      ) : formModal ? (
        <StudentFormModal
          mode={formModal.mode}
          student={formModal.student}
          onClose={() => setFormModal(null)}
          onSaved={async (text) => {
            await loadStudents('refresh')
            setNotification({ type: 'success', title: 'Success', message: text || 'Operation completed successfully.' })
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
            setNotification({ type: 'success', title: 'Success', message: text || 'Enrollment completed successfully.' })
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
            setNotification({ type: 'success', title: 'Success', message: text || 'Block assignment completed successfully.' })
          }}
        />
      ) : null}
    </>
  )
}

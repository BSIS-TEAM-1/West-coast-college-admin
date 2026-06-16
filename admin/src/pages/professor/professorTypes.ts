export interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string | string[]
  isActive: boolean
  isArchived?: boolean
  isPinned: boolean
  expiresAt: string
  createdAt: string
  updatedAt?: string
  tags?: string[]
  media?: Array<{
    type: 'image' | 'video'
    url: string
    fileName: string
    originalFileName: string
    mimeType: string
    caption?: string
  }>
  createdBy: {
    username: string
    displayName: string
    avatar?: string
  }
  views?: number
  engagement?: {
    likes: number
    comments: number
    shares: number
  }
  priority?: 'low' | 'medium' | 'high'
  scheduledFor?: string
}

export interface ProfessorAssignedSubject {
  subjectId: string
  code: string
  title: string
  schedule: string
  room: string
  enrolledStudents: number
}

export interface ProfessorAssignedBlock {
  sectionId: string | null
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjects: ProfessorAssignedSubject[]
}

export interface ProfessorAssignedCourse {
  courseCode: string
  courseName?: string
  blocks: ProfessorAssignedBlock[]
}

export interface ProfessorSubjectDetailState {
  courseCode: string
  blockCode: string
  sectionId: string | null
  sectionCode: string
  semester: string
  schoolYear: string
  subject: ProfessorAssignedSubject
}

export interface ProfessorAssignedStudent {
  _id: string
  studentNumber: string | number
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  yearLevel?: number
  studentStatus?: string
  course?: string | number
  corStatus?: string
  assignedAt?: string | null
}

export interface ProfessorRosterClassOption {
  key: string
  courseCode: string
  blockCode: string
  sectionId: string
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjectId: string
  subjectCode: string
  subjectTitle: string
  schedule: string
  room: string
}

export interface ProfessorRosterSectionOption {
  key: string
  courseCode: string
  blockCode: string
  sectionId: string
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjectCount: number
  subjects: Array<{
    subjectId: string
    subjectCode: string
    subjectTitle: string
    schedule: string
    room: string
  }>
}

export interface ProfessorRosterStudent extends Omit<ProfessorAssignedStudent, 'studentNumber'> {
  rosterEntryKey: string
  studentNumber: string
  enrollmentId?: string
  subjectEntryId?: string
  email?: string
  contactNumber?: string
  program?: string
  status?: string
  attendancePercentage?: number
  currentGrade?: number | string
  latestGrade?: number | string
  quizScores?: Array<{ name: string; score: number | string }>
  assignmentScores?: Array<{ name: string; score: number | string }>
  attendanceRecord?: Array<{ date: string; status: string }>
  remarks?: string
  classBlockCode?: string
  classSectionCode?: string
  classSubjectCode?: string
  classSubjectTitle?: string
  classSemester?: string
  classSchoolYear?: string
  subjectStatus?: string
  gradeUpdatedAt?: string
}

export type RosterSortBy = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc'

export type ProfessorView = 'courses' | 'students' | 'grades' | 'schedule' | 'profile' | 'settings' | 'personal-details' | 'subject-detail'

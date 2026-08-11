export type Semester = '1st' | '2nd' | 'Summer'

export type BlockWorkspaceSelection = {
  groupId: string
  groupName: string
  semester: Semester
  year: number
  initialSectionId?: string | null
}

export type BlockGroup = {
  _id: string
  name: string
  courseId?: number
  courseCode?: string
  yearLevel?: number
  semester: Semester
  schoolYear?: string
  year: number
  section?: string
  curriculumId?: string | null
  studentClassification?: string
  policies?: {
    maxOvercap?: number
  }
}

export type BlockSection = {
  _id: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status: 'OPEN' | 'CLOSED'
}

export type BlockStudent = {
  _id: string
  studentNumber: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  yearLevel?: number
  studentStatus?: string
  course?: number | string
}

export type SectionStudent = BlockStudent & {
  assignedAt?: string | null
  assignedProfessor?: string
}

export type ProfessorAccount = {
  _id: string
  username: string
  displayName: string
  uid: string
  status: string
  label: string
}

export type SubjectType = 'General Education' | 'Professional Education' | 'Major' | 'Elective' | 'Core'
export type SubjectStatus = 'Active' | 'Inactive'

export type SubjectItem = {
  _id: string
  code: string
  title: string
  units: number
  subjectType: SubjectType
  lecturePeriods: number
  labPeriods: number
  status: SubjectStatus
  isActive?: boolean
  prerequisiteSubjectIds?: string[] | SubjectItem[]
}

export type SubjectDraft = {
  code: string
  title: string
  units: string
}

export type BlockDraft = {
  id: string
  course: string
  blockNumber: string
  semester: Semester
  year: number
  capacity: number
  createdAt: string
  updatedAt: string
}

export type CurriculumStatus = 'Draft' | 'Active' | 'Legacy' | 'Archived'

export type Curriculum = {
  _id: string
  name?: string
  code?: string
  programCode: number
  programName: string
  version: string
  status: CurriculumStatus
  effectiveSchoolYear?: string
  description?: string
  totalUnits?: number
  subjectCount?: number
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

export type CurriculumSubjectType = 'General' | 'Major' | 'Professional' | 'Elective'

export type CurriculumSubject = {
  _id: string
  curriculumId: string
  subjectId: string | SubjectItem
  yearLevel: number
  semester: Semester
  type: CurriculumSubjectType
  isRequired: boolean
  // Curriculum snapshot fields — the approved-at-placement academic record
  // for this subject WITHIN this curriculum. These are immutable with
  // respect to later edits on the global Subject; display/total
  // calculations must always read these, never subjectId.units etc.
  courseNo?: string
  descriptiveTitle?: string
  units?: number
  lecturePeriods?: number
  labPeriods?: number
  prerequisiteSubjectIds?: string[] | SubjectItem[]
  displayOrder: number
}

export type CurriculumStructure = {
  curriculum: Curriculum
  years: Array<{
    yearLevel: number
    totalUnits: number
    totalLecturePeriods: number
    totalLabPeriods: number
    semesters: Array<{
      semester: Semester
      subjects: CurriculumSubject[]
      totalUnits: number
      totalLecturePeriods: number
      totalLabPeriods: number
    }>
  }>
  summary: {
    totalSubjects: number
    totalUnits: number
    totalLecturePeriods: number
    totalLabPeriods: number
    requiredCount: number
    electiveCount: number
    yearsCovered: number
  }
}

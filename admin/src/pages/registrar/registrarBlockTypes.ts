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

export type SubjectItem = {
  _id: string
  code: string
  title: string
  units: number
  course?: number
  yearLevel?: number
  semester?: Semester
  isActive?: boolean
}

export type SubjectDraft = {
  code: string
  title: string
  units: string
}

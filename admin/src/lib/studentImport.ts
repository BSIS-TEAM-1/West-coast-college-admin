import { COURSE_OPTIONS, normalizeCourseCode } from './blockAssignmentShared'
import { parseCsv } from './csv'

/**
 * CSV contract for Student Management → Import.
 *
 * The template is the authoritative format: the parser maps headers by name
 * (case/punctuation-insensitive) so a file exported from the roster, or a
 * hand-built spreadsheet that uses the same labels, imports without shuffling
 * columns around. Every row is validated before a student is created, and a
 * row is only sent to the API when it has no errors.
 */

export type StudentImportFieldKey =
  | 'studentNumber'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'suffix'
  | 'name'
  | 'course'
  | 'yearLevel'
  | 'semester'
  | 'schoolYear'
  | 'studentStatus'
  | 'lifecycleStatus'
  | 'scholarship'
  | 'email'
  | 'contactNumber'
  | 'address'
  | 'permanentAddress'
  | 'gender'
  | 'birthDate'
  | 'nationality'

type ImportColumn = {
  key: StudentImportFieldKey
  header: string
  aliases: string[]
}

const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'studentNumber', header: 'Student Number', aliases: ['studentno', 'studentid', 'idnumber', 'studentnum'] },
  { key: 'firstName', header: 'First Name', aliases: ['firstname', 'givenname', 'first'] },
  { key: 'middleName', header: 'Middle Name', aliases: ['middlename', 'middle', 'middlenameinitial', 'mi'] },
  { key: 'lastName', header: 'Last Name', aliases: ['lastname', 'surname', 'familyname', 'last'] },
  { key: 'suffix', header: 'Suffix', aliases: ['suffix', 'nameextension', 'ext'] },
  { key: 'name', header: 'Name', aliases: ['fullname', 'studentname', 'name'] },
  { key: 'course', header: 'Course', aliases: ['course', 'program', 'degree'] },
  { key: 'yearLevel', header: 'Year Level', aliases: ['yearlevel', 'year', 'yr', 'level'] },
  { key: 'semester', header: 'Semester', aliases: ['semester', 'sem', 'term'] },
  { key: 'schoolYear', header: 'School Year', aliases: ['schoolyear', 'sy', 'academicyear'] },
  { key: 'studentStatus', header: 'Student Status', aliases: ['studentstatus', 'status'] },
  { key: 'lifecycleStatus', header: 'Lifecycle Status', aliases: ['lifecyclestatus', 'lifecycle'] },
  { key: 'scholarship', header: 'Scholarship', aliases: ['scholarship'] },
  { key: 'email', header: 'Email', aliases: ['email', 'emailaddress'] },
  {
    key: 'contactNumber',
    header: 'Contact Number',
    aliases: ['contactnumber', 'contactno', 'contact', 'mobile', 'mobilenumber', 'phone', 'phonenumber']
  },
  { key: 'address', header: 'Address', aliases: ['address', 'currentaddress', 'homeaddress'] },
  { key: 'permanentAddress', header: 'Permanent Address', aliases: ['permanentaddress'] },
  { key: 'gender', header: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'birthDate', header: 'Birth Date', aliases: ['birthdate', 'dateofbirth', 'dob'] },
  { key: 'nationality', header: 'Nationality', aliases: ['nationality', 'citizenship'] }
]

export const STUDENT_IMPORT_TEMPLATE_HEADERS = IMPORT_COLUMNS
  .filter((column) => column.key !== 'name')
  .map((column) => column.header)

export const STUDENT_IMPORT_REQUIRED_FIELDS = [
  'First Name and Last Name (or a Name column)',
  'Course',
  'Year Level',
  'Semester',
  'School Year',
  'Contact Number',
  'Address'
]

const COURSE_VALUES = COURSE_OPTIONS.map((option) => String(option.value))
const STUDENT_STATUSES = ['Regular', 'Irregular', 'Returnee', 'Transferee'] as const
const LIFECYCLE_STATUSES = ['Pending', 'Not Enrolled', 'Irregular', 'Inactive', 'Graduated', 'Leave of Absence'] as const
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const
const SCHOLARSHIPS = [
  'N/A',
  'CHED Scholarship Programs',
  'OWWA Scholarship Programs',
  'DOST-SEI Undergraduate Scholarships',
  'Tertiary Education Subsidy',
  'GrabScholar College Scholarship',
  'SM College Scholarship (SM Foundation)',
  'Foundation Scholarships'
] as const

export type StudentImportPayload = {
  studentNumber?: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  course: number
  yearLevel: number
  semester: string
  schoolYear: string
  studentStatus: string
  lifecycleStatus: string
  scholarship: string
  email?: string
  contactNumber: string
  address: string
  permanentAddress?: string
  gender?: string
  birthDate?: string
  nationality: string
}

export type StudentImportRow = {
  /** 1-based spreadsheet row, counting the header row as 1. */
  rowNumber: number
  values: Record<string, string>
  displayName: string
  errors: string[]
  payload: StudentImportPayload | null
}

export type StudentImportParseResult = {
  rows: StudentImportRow[]
  fatalError?: string
}

function normalizeHeader(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const HEADER_ALIASES = new Map<string, StudentImportFieldKey>()
for (const column of IMPORT_COLUMNS) {
  HEADER_ALIASES.set(normalizeHeader(column.header), column.key)
  for (const alias of column.aliases) {
    HEADER_ALIASES.set(normalizeHeader(alias), column.key)
  }
}

function clean(value: string | undefined) {
  return String(value ?? '').trim()
}

function normalizeCourse(value: string): number | null {
  const raw = clean(value)
  if (!raw) return null

  const upper = raw.toUpperCase()
  if (upper.includes('ELEMENTARY') || upper.includes('BEED')) return 101
  if (upper.includes('MATH')) return 103
  if (upper.includes('ENGLISH')) return 102
  if (upper.includes('BUSINESS ADMINISTRATION') || upper.includes('HRM')) return 201
  if (upper.includes('SECONDARY') || upper.includes('BSED')) return 102

  const normalized = normalizeCourseCode(raw)
  if (normalized === 'BSBA') return 201
  if (normalized === 'BSED') return 102

  const code = Number(normalized)
  return COURSE_VALUES.includes(String(code)) ? code : null
}

function normalizeYearLevel(value: string): number | null {
  const match = clean(value).match(/\d+/)
  if (!match) return null
  const level = Number(match[0])
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : null
}

function normalizeSemester(value: string): string | null {
  const raw = clean(value).toLowerCase().replace(/\s+/g, '')
  if (!raw) return null
  if (['1', '1st', 'first', 'firstsemester', '1stsemester', 'firstsem', 'sem1', '1stsem'].includes(raw)) return '1st'
  if (['2', '2nd', 'second', 'secondsemester', '2ndsemester', 'secondsem', 'sem2', '2ndsem'].includes(raw)) return '2nd'
  if (['summer', 'summerterm', 'summersemester'].includes(raw)) return 'Summer'
  return null
}

function normalizeSchoolYear(value: string): string | null {
  const raw = clean(value)
  if (!raw) return null
  const match = raw.match(/(\d{4})\s*[-–—/]\s*(\d{4})/)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  if (end !== start + 1) return null
  return `${match[1]}-${match[2]}`
}

function normalizeEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  const raw = clean(value)
  if (!raw) return null
  return allowed.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? null
}

function normalizeGender(value: string): string | null {
  const raw = clean(value).toLowerCase()
  if (!raw) return null
  if (raw === 'm' || raw === 'male') return 'Male'
  if (raw === 'f' || raw === 'female') return 'Female'
  return normalizeEnum(value, GENDERS)
}

function normalizeScholarship(value: string): string | null {
  const raw = clean(value)
  if (!raw) return 'N/A'
  if (['n/a', 'na', 'none', 'no scholarship'].includes(raw.toLowerCase())) return 'N/A'
  return normalizeEnum(raw, SCHOLARSHIPS)
}

function normalizeBirthDate(value: string): string | null {
  const raw = clean(value)
  if (!raw) return null

  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const isoCandidate = usMatch
    ? `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
    : raw
  const parsed = new Date(isoCandidate)
  if (Number.isNaN(parsed.getTime())) return null
  const normalized = parsed.toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoCandidate) && normalized !== isoCandidate) return null
  return normalized
}

function normalizeStudentNumber(value: string): string | null {
  const digits = clean(value).replace(/\D+/g, '')
  if (!digits) return null
  return /^\d{12}$/.test(digits) ? digits : null
}

const SUFFIX_TOKENS = new Set(['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV', 'V'])

function splitFullName(rawName: string) {
  const raw = clean(rawName)
  if (!raw) return null

  let last = ''
  let rest = ''
  if (raw.includes(',')) {
    const [lastPart, ...restParts] = raw.split(',')
    last = clean(lastPart)
    rest = clean(restParts.join(' '))
  } else {
    const tokens = raw.split(/\s+/).filter(Boolean)
    last = tokens.length > 1 ? tokens[tokens.length - 1] : ''
    rest = tokens.slice(0, Math.max(0, tokens.length - 1)).join(' ')
  }

  const tokens = rest.split(/\s+/).filter(Boolean)
  let suffix = ''
  if (tokens.length > 1 && SUFFIX_TOKENS.has(tokens[tokens.length - 1].toUpperCase())) {
    suffix = tokens.pop() || ''
  }

  const firstName = tokens.shift() || ''
  const middleName = tokens.join(' ')
  return { firstName, middleName, lastName: last, suffix }
}

export function parseStudentImportCsv(text: string): StudentImportParseResult {
  const matrix = parseCsv(text)
  if (matrix.length === 0) {
    return { rows: [], fatalError: 'The file is empty.' }
  }

  const headerRow = matrix[0]
  const headerMap = new Map<number, StudentImportFieldKey>()
  headerRow.forEach((header, index) => {
    const key = HEADER_ALIASES.get(normalizeHeader(header))
    if (key && ![...headerMap.values()].includes(key)) headerMap.set(index, key)
  })

  if (headerMap.size === 0) {
    return {
      rows: [],
      fatalError: 'No recognized columns found. Download the import template and keep its column headers intact.'
    }
  }

  const rows: StudentImportRow[] = []

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const cells = matrix[rowIndex]
    if (cells.every((cell) => clean(cell) === '')) continue

    const values: Record<string, string> = {}
    for (const [columnIndex, key] of headerMap.entries()) {
      values[key] = clean(cells[columnIndex])
    }

    const errors: string[] = []

    // Names: explicit First/Last columns win; a single "Name" column is split.
    let firstName = clean(values.firstName)
    let middleName = clean(values.middleName)
    let lastName = clean(values.lastName)
    let suffix = clean(values.suffix)

    if ((!firstName || !lastName) && values.name) {
      const split = splitFullName(values.name)
      if (split) {
        firstName = firstName || split.firstName
        lastName = lastName || split.lastName
        middleName = middleName || split.middleName
        suffix = suffix || split.suffix
      }
    }

    if (!firstName) errors.push('First name is required.')
    if (!lastName) errors.push('Last name is required.')

    const course = normalizeCourse(values.course)
    if (!course) {
      errors.push('Course must be BEED, BSEd-English, BSEd-Math, BSBA-HRM, or 101/102/103/201.')
    }

    const yearLevel = normalizeYearLevel(values.yearLevel)
    if (!yearLevel) errors.push('Year level must be a number from 1 to 5.')

    const semester = normalizeSemester(values.semester)
    if (!semester) errors.push('Semester must be 1st, 2nd, or Summer.')

    const schoolYear = normalizeSchoolYear(values.schoolYear)
    if (!schoolYear) errors.push('School year must look like 2026-2027 (start year + next year).')

    const studentStatus = normalizeEnum(values.studentStatus, STUDENT_STATUSES) || 'Regular'
    if (values.studentStatus && !normalizeEnum(values.studentStatus, STUDENT_STATUSES)) {
      errors.push(`Student status must be one of: ${STUDENT_STATUSES.join(', ')}.`)
    }

    let lifecycleStatus = normalizeEnum(values.lifecycleStatus, LIFECYCLE_STATUSES) || 'Pending'
    const lifecycleInput = clean(values.lifecycleStatus).toLowerCase()
    if (lifecycleInput === 'enrolled') {
      // A new student record cannot start as Enrolled (enrollment + block
      // assignment are separate steps), so keep the row importable and start
      // it at Pending instead of failing an otherwise valid file.
      lifecycleStatus = 'Pending'
    } else if (values.lifecycleStatus && !normalizeEnum(values.lifecycleStatus, LIFECYCLE_STATUSES)) {
      errors.push(`Lifecycle status must be one of: ${LIFECYCLE_STATUSES.join(', ')}.`)
    }

    const scholarship = normalizeScholarship(values.scholarship)
    if (!scholarship) {
      errors.push(`Scholarship must be one of: ${SCHOLARSHIPS.join(', ')}.`)
    }

    const email = clean(values.email)
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      errors.push('Email is not a valid email address.')
    }

    const contactNumber = clean(values.contactNumber)
    if (!contactNumber) errors.push('Contact number is required.')

    const address = clean(values.address)
    if (!address) errors.push('Address is required.')

    const gender = normalizeGender(values.gender)
    if (values.gender && !gender) {
      errors.push(`Gender must be one of: ${GENDERS.join(', ')}.`)
    }

    const birthDate = normalizeBirthDate(values.birthDate)
    if (values.birthDate && !birthDate) {
      errors.push('Birth date must be a valid date (YYYY-MM-DD or MM/DD/YYYY).')
    }

    let studentNumber: string | undefined
    if (clean(values.studentNumber)) {
      const normalized = normalizeStudentNumber(values.studentNumber)
      if (!normalized) {
        errors.push('Student number must contain exactly 12 digits (e.g. 202610100001 or 2026-101-00001).')
      } else {
        studentNumber = normalized
      }
    }

    const displayName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ') || values.name || `Row ${rowIndex + 1}`

    const payload: StudentImportPayload | null = errors.length
      ? null
      : {
          ...(studentNumber ? { studentNumber } : {}),
          firstName,
          lastName,
          ...(middleName ? { middleName } : {}),
          ...(suffix ? { suffix } : {}),
          course: course as number,
          yearLevel: yearLevel as number,
          semester: semester as string,
          schoolYear: schoolYear as string,
          studentStatus,
          lifecycleStatus,
          scholarship: scholarship as string,
          ...(email ? { email: email.toLowerCase() } : {}),
          contactNumber,
          address,
          ...(clean(values.permanentAddress) ? { permanentAddress: clean(values.permanentAddress) } : {}),
          ...(gender ? { gender } : {}),
          ...(birthDate ? { birthDate } : {}),
          nationality: clean(values.nationality) || 'Filipino'
        }

    rows.push({
      rowNumber: rowIndex + 1,
      values,
      displayName,
      errors,
      payload
    })
  }

  // Duplicate student numbers / emails inside one file would fail halfway
  // through the import and leave the roster partially created, so reject the
  // later duplicates up front.
  const seenNumbers = new Map<string, number>()
  const seenEmails = new Map<string, number>()
  for (const row of rows) {
    const payload = row.payload
    if (!payload) continue
    const number = payload.studentNumber
    if (number) {
      const firstRow = seenNumbers.get(number)
      if (firstRow) {
        row.errors.push(`Duplicate student number ${number} (already used on row ${firstRow}).`)
        row.payload = null
      } else {
        seenNumbers.set(number, row.rowNumber)
      }
    }
    const email = payload.email?.toLowerCase()
    if (email) {
      const firstRow = seenEmails.get(email)
      if (firstRow) {
        row.errors.push(`Duplicate email ${payload.email} (already used on row ${firstRow}).`)
        row.payload = null
      } else {
        seenEmails.set(email, row.rowNumber)
      }
    }
  }

  return { rows }
}

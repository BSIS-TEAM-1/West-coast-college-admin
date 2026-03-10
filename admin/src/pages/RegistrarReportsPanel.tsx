import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Download, Printer, RefreshCw, FileDown, ChevronRight, ChevronDown } from 'lucide-react'
import { getStoredToken } from '../lib/authApi'
import StudentService from '../lib/studentApi'
import './RegistrarDashboard.css'

type Semester = '1st' | '2nd' | 'Summer'

interface ReportStudent {
  _id: string
  studentNumber: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  course: string
  courseKey: string
  courseLabel: string
  courseShortLabel: string
  yearLevel: number
  section: string
  semester: string
  schoolYear: string
  studentStatus?: string
  enrollmentStatus: string
  createdAt?: string
}

const REPORT_SEMESTERS: Semester[] = ['1st', '2nd', 'Summer']

const COURSES = [
  { value: '301', label: 'Bachelor of Science in Information Systems', short: 'BSIS' },
  { value: '101', label: 'Bachelor of Elementary Education', short: 'BEED' },
  { value: '102', label: 'Bachelor of Secondary Education - English', short: 'BSEd-English' },
  { value: '103', label: 'Bachelor of Secondary Education - Mathematics', short: 'BSEd-Math' },
  { value: '201', label: 'Bachelor of Science in Business Administration - HRM', short: 'BSBA-HRM' },
  { value: 'other', label: 'Other Program', short: 'Other' }
]

const COURSE_SHORT_BY_CODE: Record<string, string> = COURSES.reduce((acc, course) => {
  acc[course.value] = course.short
  return acc
}, {} as Record<string, string>)

const COURSE_CODE_BY_SHORT: Record<string, string> = Object.entries(COURSE_SHORT_BY_CODE).reduce((acc, [code, short]) => {
  acc[short.toLowerCase().replace(/[^a-z0-9]/g, '')] = code
  return acc
}, {} as Record<string, string>)

const COURSE_PRIORITY: Record<string, number> = {
  '301': 1,
  '101': 2,
  '102': 3,
  '103': 4,
  '201': 5,
  other: 99
}

const normalizeCourse = (raw: unknown): string => {
  const source = String(raw || '').trim()
  if (!source) return 'other'
  if (/^\d+$/.test(source)) return source

  const upper = source.toUpperCase()
  if (upper === 'BEED' || upper.includes('ELEMENTARY EDUCATION')) return '101'
  if (upper === 'BSED-ENGLISH' || (upper.includes('SECONDARY EDUCATION') && upper.includes('ENGLISH'))) return '102'
  if (upper === 'BSED-MATH' || upper.includes('SECONDARY EDUCATION') && upper.includes('MATH')) return '103'
  if (upper === 'BSBA-HRM' || upper.includes('BSBA') || upper.includes('HRM')) return '201'
  if (upper.includes('INFORMATION SYSTEMS') || upper.includes('BSIS')) return '301'

  return `custom:${source
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')}`
}

const getCourseFullLabel = (courseKey: string, fallback: string) =>
  COURSES.find((item) => item.value === courseKey)?.label ?? (fallback || 'Other Program')

const getCourseShortLabel = (courseKey: string, fallback: string) =>
  COURSES.find((item) => item.value === courseKey)?.short ?? (fallback || 'Other')

const formatName = (student: Pick<ReportStudent, 'firstName' | 'middleName' | 'lastName' | 'suffix'>) =>
  `${student.firstName} ${student.middleName ?? ''} ${student.lastName} ${student.suffix ?? ''}`.replace(/\s+/g, ' ').trim()

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const parseYearFromSchoolYear = (schoolYear: string) => Number(String(schoolYear || '').split('-')[0]) || 0

const compareSchoolYear = (left: string, right: string) => {
  const leftValue = parseYearFromSchoolYear(left)
  const rightValue = parseYearFromSchoolYear(right)
  if (leftValue === rightValue) return String(left).localeCompare(String(right))
  return leftValue - rightValue
}

const resolveStatus = (raw: string) => {
  const status = String(raw || '').toLowerCase()
  if (status === 'enrolled') return 'Enrolled'
  if (status === 'dropped') return 'Dropped'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'pending') return 'Pending'
  return 'Pending'
}

const toYearLevelDisplay = (level: number) => {
  if (!level) return 'N/A'
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'
  return `${level}${suffix} Year`
}

const formatYearLevels = (levels: number[]) => {
  const unique = Array.from(new Set(levels.filter(Boolean))).sort((a, b) => a - b)
  if (!unique.length) return 'N/A'
  return unique.map(toYearLevelDisplay).join(', ')
}

const formatSection = (value: unknown) => {
  const section = String(value || '').trim()
  return section || 'Unassigned'
}

const isUnassignedSection = (value: unknown) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return !normalized || normalized === 'unassigned' || normalized === 'na' || normalized === 'none'
}

const formatStudentId = (value: string, courseCode = '') => {
  const trimmed = String(value || '').trim().replace(/\s+/g, '')
  const parts = trimmed.split('-')
  if (parts.length >= 3) {
    const year = parts[0]?.trim()
    const rawCourse = parts[1]?.trim() ?? ''
    const suffix = parts.slice(2).join('-')
    const normalizedCourse = rawCourse.toLowerCase().replace(/[^a-z0-9]/g, '')
    const fallbackNormalized = String(courseCode || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const mappedCourse =
      COURSE_CODE_BY_SHORT[normalizedCourse] ||
      (/^\d+$/.test(fallbackNormalized) ? fallbackNormalized : COURSE_CODE_BY_SHORT[fallbackNormalized])

    if (mappedCourse) {
      return `${year}-${mappedCourse}-${suffix}`.toUpperCase()
    }

    return `${year}-${rawCourse}-${suffix}`.toUpperCase()
  }

  return trimmed.toUpperCase()
}

const formatSectionCode = (value: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Unassigned'

  const compact = normalized.replace(/\s+/g, '').toUpperCase()
  const parts = compact.split('-').filter(Boolean)

  if (parts.length >= 3) {
    const [courseCode, level, block] = parts
    if (/^\d+$/.test(courseCode) && /^\d+$/.test(level) && block) {
      return `${COURSE_SHORT_BY_CODE[courseCode] || courseCode}-${level}${block}`
    }
  }

  const firstCode = parts[0] ?? ''
  if (/^\d+$/.test(firstCode) && parts.length > 1) {
    return `${COURSE_SHORT_BY_CODE[firstCode] || firstCode}-${parts.slice(1).join('').replace(/-/g, '')}`
  }

  return compact
}

type ReportHierarchyBlock = {
  key: string
  name: string
  students: ReportStudent[]
  yearLevels: number[]
}

type ReportHierarchyCourse = {
  key: string
  label: string
  shortLabel: string
  totalStudents: number
  totalBlocks: number
  yearLevels: number[]
  blocks: ReportHierarchyBlock[]
}

type BuildBlock = {
  key: string
  name: string
  students: ReportStudent[]
  yearLevels: Set<number>
}

type BuildCourse = {
  key: string
  label: string
  shortLabel: string
  totalStudents: number
  yearLevels: Set<number>
  blocks: Map<string, BuildBlock>
}

const normalizeSectionKey = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')

export default function RegistrarReportsPanel() {
  const [students, setStudents] = useState<ReportStudent[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [schoolYearFilter, setSchoolYearFilter] = useState<'all' | string>('all')
  const [semesterFilter, setSemesterFilter] = useState<'all' | Semester>('all')
  const [yearLevelFilter, setYearLevelFilter] = useState<'all' | string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCourses, setExpandedCourses] = useState<string[]>([])
  const [expandedBlocks, setExpandedBlocks] = useState<string[]>([])

  const reportRef = useRef<HTMLDivElement>(null)

  const normalizeStudent = (entry: unknown): ReportStudent | null => {
    if (!entry || typeof entry !== 'object') return null
    const source = entry as Record<string, unknown>
    const studentNumber = String(source.studentNumber || '').trim()
    const firstName = String(source.firstName || '').trim()
    const lastName = String(source.lastName || '').trim()
    if (!studentNumber || !firstName || !lastName) return null
    if (isUnassignedSection(source.section)) return null

    const rawCourse = String(source.course || '').trim()
    const courseKey = normalizeCourse(rawCourse)
    const courseLabel = getCourseFullLabel(courseKey, rawCourse)
    const courseShortLabel = getCourseShortLabel(courseKey, courseLabel)

    return {
      _id: String(source._id || ''),
      studentNumber,
      firstName,
      middleName: String(source.middleName || '').trim() || undefined,
      lastName,
      suffix: String(source.suffix || '').trim() || undefined,
      course: rawCourse || courseLabel,
      courseKey,
      courseLabel,
      courseShortLabel,
      yearLevel: toNumber(source.yearLevel),
      section: formatSection(source.section),
      semester: String(source.semester || '').trim(),
      schoolYear: String(source.schoolYear || '').trim(),
      studentStatus: String(source.studentStatus || 'Regular').trim(),
      enrollmentStatus: String(source.enrollmentStatus || 'Pending').trim(),
      createdAt: String(source.createdAt || '')
    }
  }

  const loadStudents = async () => {
    try {
      setLoadingStudents(true)
      setStudentsError('')
      const token = await getStoredToken()
      if (!token) {
        setStudentsError('No authentication token found')
        setStudents([])
        return
      }
      const response = await StudentService.getStudents(token)
      const rows = Array.isArray(response?.data) ? response.data : []
      const assignedRows = rows
        .map(normalizeStudent)
        .filter((student): student is ReportStudent => Boolean(student))
        .filter((student) => !isUnassignedSection(student.section))
      setStudents(assignedRows)
    } catch (error) {
      setStudentsError(error instanceof Error ? error.message : 'Failed to load students')
      setStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [])

  const filterOptions = useMemo(() => {
    const schoolYears = Array.from(new Set(students.map((student) => student.schoolYear).filter(Boolean))).sort(compareSchoolYear)
    const levels = Array.from(new Set(students.map((student) => student.yearLevel))).filter(Boolean).sort((a, b) => a - b)
    return { schoolYears, levels }
  }, [students])

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return students
      .filter((student) => {
        if (schoolYearFilter !== 'all' && student.schoolYear !== schoolYearFilter) return false
        if (semesterFilter !== 'all' && student.semester !== semesterFilter) return false
        if (yearLevelFilter !== 'all' && String(student.yearLevel) !== yearLevelFilter) return false

        if (!query) return true
        return (
          student.courseLabel.toLowerCase().includes(query) ||
          student.section.toLowerCase().includes(query) ||
          formatSectionCode(student.section).toLowerCase().includes(query)
        )
      })
      .sort((left, right) => {
        if (left.courseLabel === right.courseLabel) {
          if (left.section === right.section) return left.studentNumber.localeCompare(right.studentNumber)
          return left.section.localeCompare(right.section)
        }
        return left.courseLabel.localeCompare(right.courseLabel)
      })
  }, [students, schoolYearFilter, semesterFilter, yearLevelFilter, searchTerm])

  const courseHierarchy = useMemo<ReportHierarchyCourse[]>(() => {
    const courseMap = new Map<string, BuildCourse>()

    filteredStudents.forEach((student) => {
      const courseEntry =
        courseMap.get(student.courseKey) ??
        {
          key: student.courseKey,
          label: student.courseLabel,
          shortLabel: student.courseShortLabel,
          totalStudents: 0,
          yearLevels: new Set<number>(),
          blocks: new Map<string, BuildBlock>()
        }

      courseEntry.totalStudents += 1
      if (student.yearLevel) courseEntry.yearLevels.add(student.yearLevel)

      const blockKey = normalizeSectionKey(student.section)
      const blockEntry = courseEntry.blocks.get(blockKey) ?? {
        key: blockKey,
        name: formatSectionCode(student.section),
        students: [],
        yearLevels: new Set<number>()
      }

      blockEntry.students.push(student)
      if (student.yearLevel) blockEntry.yearLevels.add(student.yearLevel)
      courseEntry.blocks.set(blockKey, blockEntry)
      courseMap.set(student.courseKey, courseEntry)
    })

    const rankedCourses = Array.from(courseMap.values()).map((course) => ({
      key: course.key,
      label: course.label,
      shortLabel: course.shortLabel,
      totalStudents: course.totalStudents,
      totalBlocks: course.blocks.size,
      yearLevels: Array.from(course.yearLevels),
      blocks: Array.from(course.blocks.values())
        .map((block) => ({
          key: block.key,
          name: block.name,
          students: [...block.students].sort((left, right) => left.studentNumber.localeCompare(right.studentNumber)),
          yearLevels: Array.from(block.yearLevels)
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    }))

    rankedCourses.sort((left, right) => {
      const leftRank = COURSE_PRIORITY[left.key] ?? 99
      const rightRank = COURSE_PRIORITY[right.key] ?? 99
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.label.localeCompare(right.label)
    })

    return rankedCourses
  }, [filteredStudents])

  const visibleCourses = courseHierarchy.length

  const toggleCourse = (courseKey: string) => {
    setExpandedCourses((previous) => {
      if (previous.includes(courseKey)) return previous.filter((key) => key !== courseKey)
      return [...previous, courseKey]
    })
  }

  const toggleBlock = (blockKey: string) => {
    setExpandedBlocks((previous) => {
      if (previous.includes(blockKey)) return previous.filter((key) => key !== blockKey)
      return [...previous, blockKey]
    })
  }

  const exportCSV = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [
      'Academic Reports',
      `Generated,${new Date().toLocaleString()}`,
      `Academic Year,${schoolYearFilter}`,
      `Semester,${semesterFilter}`,
      `Year Level,${yearLevelFilter}`,
      '',
      'Course,Block,Student ID,Full Name,Year Level,Section or Block,Enrollment Status'
    ]

    courseHierarchy.forEach((course) => {
      course.blocks.forEach((block) => {
        if (!block.students.length) return
          block.students.forEach((student) => {
            lines.push([
              escape(course.label),
              escape(block.name),
              escape(formatStudentId(student.studentNumber, student.courseKey)),
              escape(formatName(student)),
              escape(toYearLevelDisplay(student.yearLevel)),
              escape(formatSectionCode(student.section)),
              escape(resolveStatus(student.enrollmentStatus))
            ].join(','))
          })
        })
      })

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `academic-reports-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(href)
  }

  const exportPDF = () => {
    const windowRef = window.open('', '_blank')
    if (!windowRef) return
    const styles = `<style>
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
      h1,h2,h3,h4 { margin-bottom: 0.4rem; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
      th,td { border: 1px solid #cbd5e1; padding: 0.35rem; font-size: 12px; text-align: left; }
      th { background: #f1f5f9; }
      .small { font-size: 11px; color: #334155; }
    </style>`

    const content = reportRef.current?.innerHTML || ''
    windowRef.document.write(`<html><head><title>Academic Reports</title>${styles}</head><body>${content}</body></html>`)
    windowRef.document.close()
    windowRef.print()
  }

  return (
    <div className="registrar-section registrar-section-report" ref={reportRef}>
      <div className="report-toolbar">
        <div>
          <h2 className="registrar-section-title">Academic Reports</h2>
          <p className="registrar-section-desc">
            Browse program data with Course {'->'} Block {'->'} Students drill down.
          </p>
        </div>
        <div className="report-actions">
          <button className="registrar-btn report-action-btn" type="button" onClick={exportPDF}>
            <FileDown size={15} /> Export as PDF
          </button>
          <button className="registrar-btn report-action-btn" type="button" onClick={exportCSV}>
            <Download size={15} /> Export as Excel
          </button>
          <button className="registrar-btn report-action-btn report-action-secondary" type="button" onClick={() => window.print()}>
            <Printer size={15} /> Print Report
          </button>
          <button className="registrar-btn report-action-btn report-action-secondary" type="button" onClick={loadStudents}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {studentsError && <p className="registrar-feedback registrar-feedback-error">{studentsError}</p>}
      {loadingStudents && <p className="registrar-feedback registrar-feedback-success">Loading report data...</p>}

      <section className="report-section">
        <div className="report-section-head">
          <h3>Academic Report Explorer</h3>
          <p>Default view shows courses. Expand a course for blocks, then expand a block for students.</p>
        </div>

        <div className="report-filters">
          <label className="report-filter">
            <span>Academic Year</span>
            <select value={schoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
              <option value="all">All School Years</option>
              {filterOptions.schoolYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter">
            <span>Semester</span>
            <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value as 'all' | Semester)}>
              <option value="all">All Semesters</option>
              {REPORT_SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter">
            <span>Year Level</span>
            <select value={yearLevelFilter} onChange={(event) => setYearLevelFilter(event.target.value)}>
              <option value="all">All Year Levels</option>
              {(filterOptions.levels.length > 0 ? filterOptions.levels : [1, 2, 3, 4]).map((level) => (
                <option key={level} value={level}>
                  {toYearLevelDisplay(level)}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter report-filter-search">
            <span>Search course or block</span>
            <div className="report-search-field">
              <Search size={15} />
              <input
                type="text"
                value={searchTerm}
                placeholder="Search course name or block"
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </label>
        </div>

        <p className="report-small">
          Showing <strong>{filteredStudents.length}</strong> students across <strong>{visibleCourses}</strong> course
          {visibleCourses === 1 ? '' : 's'}.
        </p>

        <div className="report-course-list">
          {courseHierarchy.map((course) => {
            const expandedCourse = expandedCourses.includes(course.key)
            return (
              <article key={course.key} className="report-course-card">
                <button
                  type="button"
                  className="report-course-toggle"
                  onClick={() => toggleCourse(course.key)}
                  aria-expanded={expandedCourse}
                  aria-controls={`course-${course.key}-blocks`}
                >
                  <div className="report-course-toggle-head">
                    <p className="report-course-title">{course.label}</p>
                    <p className="report-course-meta">
                      {course.shortLabel} | {course.totalBlocks} block{course.totalBlocks === 1 ? '' : 's'} |{' '}
                      {course.totalStudents} student{course.totalStudents === 1 ? '' : 's'} | {formatYearLevels(course.yearLevels)}
                    </p>
                  </div>
                  {expandedCourse ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>

                {expandedCourse && (
                  <div className="report-course-content" id={`course-${course.key}-blocks`}>
                    <div className="report-block-header">
                      <span>Block / Section</span>
                      <span>Year Level</span>
                      <span>Students</span>
                    </div>
                    {course.blocks.map((block) => {
                      const blockControlKey = `${course.key}::${block.key}`
                      const expandedBlock = expandedBlocks.includes(blockControlKey)

                      return (
                        <div key={blockControlKey} className="report-block-item">
                          <button
                            type="button"
                            className="report-block-row"
                            onClick={() => toggleBlock(blockControlKey)}
                            aria-expanded={expandedBlock}
                          >
                            <span className="report-block-name">{block.name}</span>
                            <span className="report-block-year">{formatYearLevels(block.yearLevels)}</span>
                            <span className="report-block-count">{block.students.length} student{block.students.length === 1 ? '' : 's'}</span>
                            {expandedBlock ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>

                          {expandedBlock && (
                            <div className="report-student-table-wrap">
                              <div className="report-table-wrap">
                                <div className="report-table">
                                  <div className="report-table-head report-table-cols-hierarchy">
                                    <span>Student ID</span>
                                    <span>Full Name</span>
                                    <span>Year Level</span>
                                    <span>Section / Block</span>
                                    <span>Enrollment Status</span>
                                  </div>
                                  <div className="report-table-body">
                                    {!block.students.length && <p className="report-empty">No students in this block.</p>}
                                    {block.students.map((student) => (
                                      <div
                                        key={`${student._id}-${student.section}`}
                                        className="report-table-row report-table-cols-hierarchy"
                                      >
                                        <span className="report-student-id">
                                          <code>{formatStudentId(student.studentNumber, student.courseKey)}</code>
                                        </span>
                                        <span>{formatName(student)}</span>
                                        <span>{toYearLevelDisplay(student.yearLevel)}</span>
                                        <span>{formatSectionCode(student.section)}</span>
                                        <span>
                                          <em className={`report-status-pill report-status-pill-${resolveStatus(student.enrollmentStatus).toLowerCase()}`}>
                                            {resolveStatus(student.enrollmentStatus)}
                                          </em>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
          {!courseHierarchy.length && !loadingStudents && (
            <p className="report-empty">No records found. Refine filters or search by a different course/block.</p>
          )}
        </div>
      </section>
    </div>
  )
}





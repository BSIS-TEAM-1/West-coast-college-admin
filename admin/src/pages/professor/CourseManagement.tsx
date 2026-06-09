import { useEffect, useMemo, useState } from 'react'
import { Award, BookOpen, CalendarDays, ChevronRight, Clock, Eye, GraduationCap, Grid3X3, Info, List, MapPin, MoreHorizontal, Search } from 'lucide-react'
import type { ProfessorAssignedBlock, ProfessorAssignedCourse, ProfessorAssignedSubject, ProfessorSubjectDetailState } from './professorTypes'
import './CourseManagement.css'

interface CourseManagementProps {
  professorName: string
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onOpenSubjectDetail: (detail: ProfessorSubjectDetailState) => void
  onOpenRosterClass: (classKey: string, mode?: 'students' | 'attendance') => void
  onOpenGradesView: (classKey?: string) => void
}

function CourseManagement({
  professorName,
  courses,
  loading,
  error,
  onRefresh,
  onOpenSubjectDetail,
  onOpenRosterClass,
  onOpenGradesView
}: CourseManagementProps) {
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [schoolYearFilter, setSchoolYearFilter] = useState('all')
  const [subjectSort, setSubjectSort] = useState<'default' | 'code' | 'students'>('default')
  const [showEnrolledOnly, setShowEnrolledOnly] = useState(false)
  const [showUsageTips, setShowUsageTips] = useState(false)
  const [expandedBlockKeys, setExpandedBlockKeys] = useState<string[]>([])
  const [openListActionMenuId, setOpenListActionMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedLayout = window.localStorage.getItem('professor-course-layout')
    if (storedLayout === 'grid' || storedLayout === 'list') {
      setLayoutMode(storedLayout)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('professor-course-layout', layoutMode)
  }, [layoutMode])

  useEffect(() => {
    if (!showUsageTips || typeof window === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUsageTips(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showUsageTips])

  useEffect(() => {
    if (!openListActionMenuId) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.professor-subject-action-menu')) return
      setOpenListActionMenuId(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenListActionMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openListActionMenuId])

  useEffect(() => {
    if (layoutMode !== 'list') {
      setOpenListActionMenuId(null)
    }
  }, [layoutMode])

  const toCourseDisplayLabel = (value: string | number) => {
    const raw = String(value ?? '').trim()
    if (!raw) return 'N/A'

    const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelByCode[normalized]) return labelByCode[normalized]
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return 'BSED-ENGLISH'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return 'BSED-MATH'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return 'BSBA-HRM'
    return raw
  }

  const getSectionSuffix = (sectionCode: string) => {
    const text = String(sectionCode || '').trim()
    if (!text) return 'TBA'
    const parts = text.split('-').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (/^\d+$/.test(prev) && /^[A-Za-z]+$/.test(last)) {
        return `${prev}${last.toUpperCase()}`
      }

      return last.toUpperCase()
    }

    return text.toUpperCase()
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayLabel(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  const getBlockKey = (courseCode: string, block: ProfessorAssignedBlock) => {
    return [courseCode, block.sectionId || block.sectionCode, block.semester, block.schoolYear].join('|')
  }

  const getRosterClassKey = (courseCode: string, block: ProfessorAssignedBlock, subject: ProfessorAssignedSubject) => {
    if (!block.sectionId) return ''
    return `${courseCode}|${block.sectionId}|${subject.subjectId}`
  }

  const getBlockRosterCount = (block: ProfessorAssignedBlock) => {
    const counts = block.subjects
      .map((subject) => Number(subject.enrolledStudents ?? 0))
      .filter((count) => Number.isFinite(count) && count >= 0)

    if (counts.length === 0) return 0

    const frequency = new Map<number, number>()
    counts.forEach((count) => {
      frequency.set(count, (frequency.get(count) || 0) + 1)
    })

    let bestCount = counts[0]
    let bestFrequency = frequency.get(bestCount) || 0

    frequency.forEach((countFrequency, countValue) => {
      if (countFrequency > bestFrequency || (countFrequency === bestFrequency && countValue > bestCount)) {
        bestCount = countValue
        bestFrequency = countFrequency
      }
    })

    return bestCount
  }

  const formatStudentCountLabel = (count: number) => `${count} student${count === 1 ? '' : 's'}`

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const professorFirstName = useMemo(() => {
    const trimmed = String(professorName || '').trim()
    if (!trimmed) return 'Professor'
    return trimmed.split(/\s+/)[0]
  }, [professorName])

  const semesterOptions = useMemo(() => {
    const semesters = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.semester) {
          semesters.add(block.semester)
        }
      })
    })
    return Array.from(semesters).sort((a, b) => a.localeCompare(b))
  }, [courses])

  const schoolYearOptions = useMemo(() => {
    const years = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.schoolYear) {
          years.add(block.schoolYear)
        }
      })
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [courses])

  const courseOptions = useMemo(() => {
    const uniqueCodes = Array.from(
      new Set(courses.map((course) => String(course.courseCode || '').trim()).filter(Boolean))
    )
    return uniqueCodes
      .map((courseCode) => ({
        value: courseCode,
        label: toCourseDisplayLabel(courseCode)
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [courses])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredCourses = useMemo(() => {
    return courses
      .filter((course) => courseFilter === 'all' || course.courseCode === courseFilter)
      .map((course) => {
        const displayCourseCode = toCourseDisplayLabel(course.courseCode)
        const courseMatch = normalizedQuery
          ? `${course.courseCode} ${displayCourseCode}`.toLowerCase().includes(normalizedQuery)
          : false

        const blocks = course.blocks
          .filter((block) => semesterFilter === 'all' || block.semester === semesterFilter)
          .filter((block) => schoolYearFilter === 'all' || block.schoolYear === schoolYearFilter)
          .map((block) => {
            const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
            const blockMatch = normalizedQuery
              ? [
                  block.sectionCode,
                  blockCode,
                  block.semester,
                  block.schoolYear,
                  block.yearLevel ? `Year ${block.yearLevel}` : ''
                ].join(' ').toLowerCase().includes(normalizedQuery)
              : false

            let subjects = normalizedQuery && !courseMatch && !blockMatch
              ? block.subjects.filter((subject) => {
                return [
                  subject.code,
                  subject.title,
                  subject.schedule,
                  subject.room
                ].join(' ').toLowerCase().includes(normalizedQuery)
              })
              : block.subjects

            if (showEnrolledOnly) {
              subjects = subjects.filter((subject) => (subject.enrolledStudents ?? 0) > 0)
            }

            if (subjectSort === 'code') {
              subjects = [...subjects].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
            } else if (subjectSort === 'students') {
              subjects = [...subjects].sort((a, b) => (b.enrolledStudents ?? 0) - (a.enrolledStudents ?? 0))
            }

            return { ...block, subjects }
          })
          .filter((block) => block.subjects.length > 0)

        return {
          ...course,
          blocks
        }
      })
      .filter((course) => course.blocks.length > 0)
  }, [courses, courseFilter, semesterFilter, schoolYearFilter, normalizedQuery, showEnrolledOnly, subjectSort])

  const totalStats = useMemo(() => {
    const blocks = courses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => {
        return blockSum + block.subjects.reduce((subjectSum, subject) => subjectSum + (subject.enrolledStudents ?? 0), 0)
      }, 0)
    }, 0)

    return {
      courses: courses.length,
      blocks,
      subjects,
      students
    }
  }, [courses])

  const visibleStats = useMemo(() => {
    const blocks = filteredCourses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => {
        return blockSum + block.subjects.reduce((subjectSum, subject) => subjectSum + (subject.enrolledStudents ?? 0), 0)
      }, 0)
    }, 0)

    return {
      courses: filteredCourses.length,
      blocks,
      subjects,
      students
    }
  }, [filteredCourses])

  const hasActiveFilters = Boolean(normalizedQuery)
    || courseFilter !== 'all'
    || semesterFilter !== 'all'
    || schoolYearFilter !== 'all'
    || subjectSort !== 'default'
    || showEnrolledOnly

  useEffect(() => {
    const allKeys = filteredCourses.flatMap((course) => course.blocks.map((block) => getBlockKey(course.courseCode, block)))
    const defaultKeys = filteredCourses.flatMap((course) => course.blocks.slice(0, 1).map((block) => getBlockKey(course.courseCode, block)))

    setExpandedBlockKeys((current) => {
      const validKeys = new Set(allKeys)
      const kept = current.filter((key) => validKeys.has(key))

      if (allKeys.length === 0) {
        return []
      }

      if (hasActiveFilters) {
        return allKeys
      }

      if (kept.length > 0) {
        return kept
      }

      return defaultKeys
    })
  }, [filteredCourses, hasActiveFilters])

  const clearFilters = () => {
    setSearchQuery('')
    setCourseFilter('all')
    setSemesterFilter('all')
    setSchoolYearFilter('all')
    setSubjectSort('default')
    setShowEnrolledOnly(false)
  }

  const toggleBlock = (blockKey: string) => {
    setExpandedBlockKeys((current) => {
      if (current.includes(blockKey)) {
        return current.filter((key) => key !== blockKey)
      }
      return [...current, blockKey]
    })
  }

  const subjectRows = useMemo(() => {
    return filteredCourses.flatMap((course) => {
      const courseLabel = toCourseDisplayLabel(course.courseCode)

      return course.blocks.flatMap((block) => {
        const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
        const blockMeta = [
          block.semester,
          block.schoolYear,
          block.yearLevel ? `Year ${block.yearLevel}` : ''
        ].filter(Boolean).join(' • ')

        return block.subjects.map((subject) => {
          const scheduleText = subject.schedule?.trim() ? subject.schedule : 'TBA'
          const roomText = subject.room?.trim() ? subject.room : 'TBA'
          const classKey = getRosterClassKey(course.courseCode, block, subject)

          return {
            key: [course.courseCode, block.sectionId || block.sectionCode, subject.subjectId].join('|'),
            courseCode: course.courseCode,
            courseLabel,
            block,
            blockCode,
            blockMeta,
            subject,
            scheduleText,
            roomText,
            classKey,
            canOpenRoster: Boolean(classKey)
          }
        })
      })
    })
  }, [filteredCourses])

  useEffect(() => {
    if (!openListActionMenuId) return
    if (!subjectRows.some((row) => row.key === openListActionMenuId)) {
      setOpenListActionMenuId(null)
    }
  }, [subjectRows, openListActionMenuId])

  const getSubjectActionItems = (
    params: {
      courseCode: string
      blockCode: string
      block: ProfessorAssignedBlock
      subject: ProfessorAssignedSubject
      classKey: string
      canOpenRoster: boolean
    }
  ) => {
    return [
      {
        key: 'open',
        label: 'Open Class',
        icon: Eye,
        isPrimary: true,
        onSelect: () => onOpenSubjectDetail({
          courseCode: params.courseCode,
          blockCode: params.blockCode,
          sectionId: params.block.sectionId,
          sectionCode: params.block.sectionCode,
          semester: params.block.semester,
          schoolYear: params.block.schoolYear,
          subject: params.subject
        })
      },
      {
        key: 'students',
        label: 'Students',
        icon: GraduationCap,
        disabled: !params.canOpenRoster,
        onSelect: () => {
          if (params.canOpenRoster) {
            onOpenRosterClass(params.classKey, 'students')
          }
        }
      },
      {
        key: 'attendance',
        label: 'Attendance',
        icon: CalendarDays,
        disabled: !params.canOpenRoster,
        onSelect: () => {
          if (params.canOpenRoster) {
            onOpenRosterClass(params.classKey, 'attendance')
          }
        }
      },
      {
        key: 'grades',
        label: 'Grades',
        icon: Award,
        onSelect: () => onOpenGradesView(params.classKey)
      }
    ]
  }

  const renderSubjectActionMenu = (
    menuId: string,
    params: {
      courseCode: string
      blockCode: string
      block: ProfessorAssignedBlock
      subject: ProfessorAssignedSubject
      classKey: string
      canOpenRoster: boolean
    },
    options?: {
      menuClassName?: string
      align?: 'start' | 'end'
    }
  ) => {
    const isOpen = openListActionMenuId === menuId
    const actionItems = getSubjectActionItems(params)
    const menuClassName = ['professor-subject-action-menu', options?.menuClassName].filter(Boolean).join(' ')
    const dropdownClassName = [
      'professor-subject-action-dropdown',
      options?.align === 'start' ? 'align-start' : ''
    ].filter(Boolean).join(' ')

    return (
      <div className={menuClassName}>
        <button
          type="button"
          className={`professor-subject-action-menu-toggle ${isOpen ? 'open' : ''}`}
          onClick={() => setOpenListActionMenuId((current) => current === menuId ? null : menuId)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <span>Actions</span>
          <MoreHorizontal size={16} />
        </button>

        {isOpen && (
          <div className={dropdownClassName} role="menu" aria-label={`Actions for ${params.subject.title || params.subject.code || 'subject'}`}>
            {actionItems.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`professor-subject-action-dropdown-item ${item.isPrimary ? 'is-primary' : ''}`}
                  onClick={() => {
                    setOpenListActionMenuId(null)
                    item.onSelect()
                  }}
                  disabled={item.disabled}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="professor-section professor-course-management">
      <div className="placeholder-card professor-course-hero">
        <div className="professor-course-hero-copy">
          <span className="professor-course-hero-eyebrow">{greeting}, {professorFirstName}</span>
          <h2 className="professor-section-title">My Teaching Load</h2>
          <p className="professor-section-desc">
            Review assigned courses, block sections, class schedules, rooms, rosters, attendance, and grading tools from one workspace.
          </p>
        </div>
        <div className="professor-course-hero-actions">
          <button type="button" className="professor-course-help-trigger" onClick={() => setShowUsageTips(true)}>
            <Info size={16} />
            <span>Guide</span>
          </button>
          <button className="professor-btn" onClick={() => void onRefresh()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Assignments'}
          </button>
        </div>
      </div>

      <div className="placeholder-card professor-course-stats professor-course-statbar">
        {[
          { label: 'Courses', value: visibleStats.courses, total: totalStats.courses },
          { label: 'Blocks', value: visibleStats.blocks, total: totalStats.blocks },
          { label: 'Subjects', value: visibleStats.subjects, total: totalStats.subjects },
          { label: 'Students', value: visibleStats.students, total: totalStats.students }
        ].map((stat) => (
          <div key={stat.label} className="professor-course-stat professor-course-statbar-item">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.value === stat.total ? `${stat.total} total` : `${stat.total} total assigned`}</small>
          </div>
        ))}
      </div>

      <div className="placeholder-card professor-course-filter-shell">
        <div className="professor-course-controls professor-course-filter-row">
          <label className="professor-course-search">
            <Search size={16} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search subject code, title, schedule, room, or block..."
              aria-label="Search assigned subjects"
            />
          </label>
          <div className="professor-course-filter-group">
            <label className="professor-course-select">
              <span>Course</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course.value} value={course.value}>{course.label}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select">
              <span>Semester</span>
              <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
                <option value="all">All semesters</option>
                {semesterOptions.map((semester) => (
                  <option key={semester} value={semester}>{semester}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select">
              <span>School year</span>
              <select value={schoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
                <option value="all">All school years</option>
                {schoolYearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select professor-course-sort">
              <span>Sort</span>
              <select
                value={subjectSort}
                onChange={(event) => setSubjectSort(event.target.value as 'default' | 'code' | 'students')}
              >
                <option value="default">Default</option>
                <option value="code">Subject code</option>
                <option value="students">Student count</option>
              </select>
            </label>
            <label className="professor-course-toggle">
              <input
                type="checkbox"
                checked={showEnrolledOnly}
                onChange={(event) => setShowEnrolledOnly(event.target.checked)}
              />
              <span>Only show classes with enrolled students</span>
            </label>
            {hasActiveFilters && (
              <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="professor-active-filters" aria-label="Active filters">
          {normalizedQuery && (
            <button type="button" className="professor-filter-chip" onClick={() => setSearchQuery('')}>
              Search: "{searchQuery.trim()}" x
            </button>
          )}
          {courseFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setCourseFilter('all')}>
              Course: {toCourseDisplayLabel(courseFilter)} x
            </button>
          )}
          {semesterFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSemesterFilter('all')}>
              Semester: {semesterFilter} x
            </button>
          )}
          {schoolYearFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSchoolYearFilter('all')}>
              School Year: {schoolYearFilter} x
            </button>
          )}
          {subjectSort !== 'default' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSubjectSort('default')}>
              Sort: {subjectSort === 'code' ? 'Subject code' : 'Student count'} x
            </button>
          )}
          {showEnrolledOnly && (
            <button type="button" className="professor-filter-chip" onClick={() => setShowEnrolledOnly(false)}>
              Enrolled only x
            </button>
          )}
        </div>
      )}

      <div className="professor-course-toolbar">
        <div className="professor-course-results">
          <strong>{visibleStats.subjects} subject(s)</strong>
          <span>Across {visibleStats.blocks} block(s) in {visibleStats.courses} course(s)</span>
        </div>
        <div className="professor-course-toolbar-start">
          <div className="professor-layout-toggle" role="group" aria-label="Subject card layout mode">
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'grid' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('grid')}
            >
              <Grid3X3 size={14} />
              Grid
            </button>
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('list')}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="professor-data-error">{error}</p>
      )}

      {loading && courses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>Loading your teaching load</h3>
          <p>Please wait while your assigned courses and blocks are being prepared.</p>
        </div>
      ) : !loading && courses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>No assigned blocks yet</h3>
          <p>The registrar has not assigned subjects or block sections to your account yet.</p>
        </div>
      ) : !loading && filteredCourses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>No matching subjects found</h3>
          <p>Try another keyword, change the sort, or clear the current filters.</p>
          {hasActiveFilters && (
            <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
              Reset filters
            </button>
          )}
        </div>
      ) : layoutMode === 'list' ? (
        <section className="professor-course-list" aria-label="Assigned subjects list">
          <div className="professor-course-list-header" aria-hidden="true">
            <span className="professor-course-list-heading professor-course-list-heading-code">Subject Code</span>
            <span className="professor-course-list-heading professor-course-list-heading-title">Subject Title</span>
            <span className="professor-course-list-heading professor-course-list-heading-course">Course</span>
            <span className="professor-course-list-heading professor-course-list-heading-block">Block</span>
            <span className="professor-course-list-heading professor-course-list-heading-schedule">Schedule</span>
            <span className="professor-course-list-heading professor-course-list-heading-room">Room</span>
            <span className="professor-course-list-heading professor-course-list-heading-actions">Actions</span>
          </div>
          <div className="professor-course-list-body">
            {subjectRows.map((row) => (
              <article key={row.key} className="professor-course-list-row">
                <div className="professor-course-list-cell professor-course-list-cell-code" data-label="Subject Code">
                  <span className="professor-course-list-code">{row.subject.code || 'N/A'}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-title" data-label="Subject Title">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-title">{row.subject.title || 'Untitled subject'}</strong>
                    <span className="professor-course-list-inline-meta">
                      {row.courseLabel} • {row.blockCode}
                    </span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-course" data-label="Course">
                  <span className="professor-course-list-text">{row.courseLabel}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-block" data-label="Block">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-block">{row.blockCode}</strong>
                    <span className="professor-course-list-note">{row.blockMeta}</span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-schedule" data-label="Schedule">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-text">{row.scheduleText}</strong>
                    <span className="professor-course-list-mobile-note">Room {row.roomText}</span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-room" data-label="Room">
                  <span className="professor-course-list-text">Room {row.roomText}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-actions" data-label="Actions">
                  {renderSubjectActionMenu(row.key, {
                    courseCode: row.courseCode,
                    blockCode: row.blockCode,
                    block: row.block,
                    subject: row.subject,
                    classKey: row.classKey,
                    canOpenRoster: row.canOpenRoster
                  }, {
                    menuClassName: 'professor-subject-action-menu-list',
                    align: 'end'
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="professor-course-grid professor-course-layout-grid">
          {filteredCourses.map((course) => {
            const courseSubjectCount = course.blocks.reduce((sum, block) => sum + block.subjects.length, 0)
            const courseLabel = toCourseDisplayLabel(course.courseCode)
            const courseTitle = course.courseName?.trim() || courseLabel

            return (
              <article key={course.courseCode} className="placeholder-card professor-course-card">
                <div className="professor-course-header">
                  <div className="professor-course-header-main">
                    <span className="professor-course-label">{courseLabel}</span>
                    <h3>{courseTitle}</h3>
                  </div>
                  <div className="professor-course-summary">
                    <span>{course.blocks.length} block(s)</span>
                    <span>{courseSubjectCount} subject(s)</span>
                  </div>
                </div>

                <div className="professor-block-list">
                  {course.blocks.map((block) => {
                    const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
                    const blockKey = getBlockKey(course.courseCode, block)
                    const isExpanded = expandedBlockKeys.includes(blockKey)
                    const blockStudentCount = getBlockRosterCount(block)
                    const blockStudentLabel = formatStudentCountLabel(blockStudentCount)

                    return (
                      <section
                        key={`${course.courseCode}-${block.sectionCode}-${block.semester}-${block.schoolYear}`}
                        className={`professor-block-item ${isExpanded ? 'is-expanded' : ''}`}
                      >
                        <button
                          type="button"
                          className="professor-block-toggle"
                          onClick={() => toggleBlock(blockKey)}
                          aria-expanded={isExpanded}
                        >
                          <div className="professor-block-toggle-main">
                            <span className="professor-block-label">Block</span>
                            <strong>{blockCode}</strong>
                            <span className="professor-block-meta">
                              {block.semester} • {block.schoolYear}
                              {block.yearLevel ? ` • Year ${block.yearLevel}` : ''}
                            </span>
                          </div>
                          <div className="professor-block-toggle-side">
                            <div className="professor-block-metrics">
                              <span>{blockStudentLabel}</span>
                              <span>{block.subjects.length} subjects</span>
                            </div>
                            <ChevronRight size={16} className={`professor-block-chevron ${isExpanded ? 'is-expanded' : ''}`} />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="professor-subject-list">
                            {block.subjects.map((subject) => {
                              const scheduleText = subject.schedule?.trim() ? subject.schedule : 'TBA'
                              const roomText = subject.room?.trim() ? subject.room : 'TBA'
                              const classKey = getRosterClassKey(course.courseCode, block, subject)
                              const canOpenRoster = Boolean(classKey)
                              const subjectMenuId = [course.courseCode, block.sectionId || block.sectionCode, subject.subjectId].join('|')

                              return (
                                <article key={`${block.sectionCode}-${subject.subjectId}`} className="professor-subject-item">
                                  <div className="professor-subject-card-head">
                                    <div className="professor-subject-code-row">
                                      <span className="professor-subject-code">
                                        <BookOpen size={15} />
                                        {subject.code || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="professor-subject-title">{subject.title}</div>
                                  </div>

                                  <div className="professor-subject-facts">
                                    <span className="professor-subject-fact">
                                      <Clock size={14} />
                                      {scheduleText}
                                    </span>
                                    <span className="professor-subject-fact">
                                      <MapPin size={14} />
                                      Room {roomText}
                                    </span>
                                  </div>

                                  <div className="professor-subject-actions">
                                    {renderSubjectActionMenu(subjectMenuId, {
                                      courseCode: course.courseCode,
                                      blockCode,
                                      block,
                                      subject,
                                      classKey,
                                      canOpenRoster
                                    }, {
                                      menuClassName: 'professor-subject-action-menu-grid',
                                      align: 'end'
                                    })}
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showUsageTips && (
        <div className="professor-help-modal-backdrop" onClick={() => setShowUsageTips(false)}>
          <div className="professor-help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="professor-help-modal-header">
              <div>
                <span className="professor-course-hero-eyebrow">Quick help</span>
                <h3>Using My Teaching Load</h3>
              </div>
              <button type="button" className="professor-btn-xs professor-btn-secondary" onClick={() => setShowUsageTips(false)}>
                Close
              </button>
            </div>
            <div className="professor-help-modal-content">
              <p>
                Expand a block only when you need its subjects, then use the action buttons on each card to jump into the right class workflow.
              </p>
              <ul>
                <li>Use the filter row to narrow by course, semester, school year, or student enrollment.</li>
                <li>Switch between grid and list if you want either compact scanning or a roomier subject view.</li>
                <li>Use Open Class for a subject overview, Students for the roster, Attendance for attendance-focused roster access, and Grades for grade tools.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CourseManagement

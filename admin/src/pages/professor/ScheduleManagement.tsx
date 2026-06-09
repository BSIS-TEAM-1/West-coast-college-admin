import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock, Grid3X3, List, MapPin, Search } from 'lucide-react'
import { API_URL } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError } from '../../lib/network'
import type { ProfessorAssignedCourse } from './professorTypes'
import { isVisibleProfessorAnnouncement } from './professorUtils'

interface ScheduleManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
}

function ScheduleManagement({ courses, loading, error, onRefresh }: ScheduleManagementProps) {
  type ScheduleMode = 'list' | 'timetable'
  type SchoolDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  type ScopeFilter = 'classes' | 'events' | 'both'
  type ItemDay = SchoolDay | 'Unscheduled'

  interface ScheduleItem {
    id: string
    courseCode: string
    courseDisplayCode: string
    sectionCode: string
    blockCode: string
    subjectCode: string
    subjectTitle: string
    scheduleText: string
    days: SchoolDay[]
    startMinutes: number | null
    endMinutes: number | null
    startTime: string
    endTime: string
    room: string
    building: string
    classType: 'Lecture' | 'Laboratory' | 'Other'
    semester: string
    schoolYear: string
    yearLevel: number | null
    enrolledStudents: number
  }

  interface TimetableOccurrence extends ScheduleItem {
    day: SchoolDay
    lane: number
    laneCount: number
  }

  interface SchoolEvent {
    id: string
    title: string
    date: string
    time: string
    category: 'Academic' | 'Exam' | 'Holiday' | 'Meeting' | 'Deadline' | 'General'
    statusTag: string
    statusTagClass: 'academic' | 'exam' | 'holiday' | 'meeting' | 'deadline' | 'general'
    description: string
    location?: string
  }

  interface CalendarEventPreview {
    id: string
    title: string
    label: string
    widthPercent: number
    offsetPercent: number
    tagClass: SchoolEvent['statusTagClass']
  }

  const SCHOOL_DAYS: SchoolDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const DAY_SHORT: Record<SchoolDay, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun'
  }
  const SCHOOL_DAYS_BY_JS: SchoolDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const TIMETABLE_START = 7 * 60
  const TIMETABLE_END = 21 * 60
  const SLOT_MINUTES = 30
  const SLOT_HEIGHT = 38

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const parseDateKey = (value: string) => {
    const [y, m, d] = String(value).split('-').map((part) => Number(part))
    if (!y || !m || !d) return null
    const parsed = new Date(y, m - 1, d)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const getSchoolDayFromJs = (value: Date) => SCHOOL_DAYS_BY_JS[value.getDay()]

  const formatClock = (minutes: number) => {
    const normalized = ((minutes % 1440) + 1440) % 1440
    const h24 = Math.floor(normalized / 60)
    const minute = String(normalized % 60).padStart(2, '0')
    const amPm = h24 >= 12 ? 'PM' : 'AM'
    const hour = ((h24 + 11) % 12) + 1
    return `${hour}:${minute} ${amPm}`
  }

  const getTimelinePreview = (event: SchoolEvent): CalendarEventPreview => {
    const range = parseTimeRange(event.time)
    const timelineStart = TIMETABLE_START
    const timelineSpan = TIMETABLE_END - TIMETABLE_START

    if (range.startMinutes !== null && range.endMinutes !== null) {
      const start = Math.max(range.startMinutes, timelineStart)
      const end = Math.min(range.endMinutes, TIMETABLE_END)
      const safeEnd = Math.max(end, start + 30)
      const offsetPercent = Math.max(0, Math.min(84, ((start - timelineStart) / timelineSpan) * 100))
      const widthPercent = Math.max(14, Math.min(100 - offsetPercent, ((safeEnd - start) / timelineSpan) * 100))

      return {
        id: event.id,
        title: event.title,
        label: `${range.startTime} - ${range.endTime}`,
        widthPercent,
        offsetPercent,
        tagClass: event.statusTagClass
      }
    }

    const firstMatch = String(event.time || '').toUpperCase().match(/(\d{1,2}(?::\d{2})?\s*(AM|PM)?)/)
    const firstTime = firstMatch ? parseTime(firstMatch[1]) : null

    if (firstTime) {
      const offsetPercent = Math.max(0, Math.min(84, ((firstTime.minutes - timelineStart) / timelineSpan) * 100))
      return {
        id: event.id,
        title: event.title,
        label: firstTime.label,
        widthPercent: 18,
        offsetPercent,
        tagClass: event.statusTagClass
      }
    }

    return {
      id: event.id,
      title: event.title,
      label: event.time || 'See details',
      widthPercent: 42,
      offsetPercent: 0,
      tagClass: event.statusTagClass
    }
  }

  const parseTime = (value: string, fallback?: string) => {
    const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2] || '0')
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null
    }

    const period = (match[3] || fallback || (hour <= 6 ? 'PM' : 'AM')).toUpperCase()
    const h24 = period === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12)
    return {
      minutes: h24 * 60 + minute,
      label: `${hour}:${String(minute).padStart(2, '0')} ${period}`
    }
  }

  const parseTimeRange = (value: string) => {
    const matches = [...String(value || '').toUpperCase().matchAll(/(\d{1,2}(?::\d{2})?\s*(AM|PM)?)/g)]
    if (matches.length < 2) {
      return { startMinutes: null, endMinutes: null, startTime: 'TBA', endTime: 'TBA' }
    }

    const first = parseTime(matches[0][1])
    const second = parseTime(matches[1][1], first?.label.includes('AM') ? 'AM' : 'PM')
    if (!first || !second) {
      return { startMinutes: null, endMinutes: null, startTime: 'TBA', endTime: 'TBA' }
    }

    let start = first.minutes
    let end = second.minutes
    if (end <= start) end += 720

    return {
      startMinutes: start,
      endMinutes: end,
      startTime: first.label,
      endTime: second.label
    }
  }

  const parseDays = (value: string) => {
    const heading = String(value || '').toUpperCase().split(/\d{1,2}:\d{2}/)[0]
    const normalized = heading
      .replace(/TTH/g, 'TUE THU')
      .replace(/MWF/g, 'MON WED FRI')
      .replace(/,/g, ' ')
      .replace(/;/g, ' ')
      .replace(/\//g, ' ')
      .replace(/\b-\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const list: SchoolDay[] = []
    const token = new Set(normalized.split(' ').filter(Boolean))

    const hasMonday = /\bMONDAY\b/.test(normalized) || token.has('MON') || token.has('M')
    const hasTuesday = /\bTUESDAY\b/.test(normalized) || token.has('TUE') || token.has('TU') || token.has('T')
    const hasWednesday = /\bWEDNESDAY\b/.test(normalized) || token.has('WED') || token.has('W')
    const hasThursday = /\bTHURSDAY\b/.test(normalized) || token.has('THU') || token.has('TH') || token.has('R')
    const hasFriday = /\bFRIDAY\b/.test(normalized) || token.has('FRI') || token.has('F')
    const hasSaturday = /\bSATURDAY\b/.test(normalized) || token.has('SAT') || token.has('SA')
    const hasSunday = /\bSUNDAY\b/.test(normalized) || token.has('SUN') || token.has('SU')

    if (hasMonday) list.push('Monday')
    if (hasTuesday) list.push('Tuesday')
    if (hasWednesday) list.push('Wednesday')
    if (hasThursday) list.push('Thursday')
    if (hasFriday) list.push('Friday')
    if (hasSaturday) list.push('Saturday')
    if (hasSunday) list.push('Sunday')

    return list.filter((day, index, arr) => arr.indexOf(day) === index)
  }

  const normalizeCourseCode = (courseCode: string) => {
    const normalized = String(courseCode || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return ''
    if (/^\d{3,5}$/.test(normalized)) return normalized
    if (normalized.includes('BEED')) return '101'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) return '102'
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM' || (normalized.includes('BSBA') && normalized.includes('HRM'))) return '201'
    return normalized.slice(0, 3) || 'COURSE'
  }

  const toCourseDisplayLabel = (course: ProfessorAssignedCourse | string | number) => {
    // If it's a course object with a name, use that
    if (typeof course === 'object' && course !== null) {
      if (course.courseName) return course.courseName
      // Fall back to courseCode mapping
      return toCourseDisplayLabel(course.courseCode)
    }
    
    const raw = String(course ?? '').trim()
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

      // Convert patterns like "101-1-A" or "1-A" into "1A"
      if (/^\d+$/.test(prev) && /^[A-Za-z]+$/.test(last)) {
        return `${prev}${last.toUpperCase()}`
      }

      return last.toUpperCase()
    }

    return text.toUpperCase()
  }

  const formatSectionCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayLabel(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  const getRoomParts = (value: string) => {
    const parts = String(value || 'TBA').split(',').map((part) => part.trim()).filter(Boolean)
    return {
      room: parts[0] || 'TBA',
      building: parts.length > 1 ? parts.slice(1).join(', ') : 'Main Building'
    }
  }

  const classItems = useMemo<ScheduleItem[]>(() =>
    courses.flatMap((course) =>
      course.blocks
        .flatMap((block) =>
          block.subjects.map((subject) => {
            const days = parseDays(subject.schedule || '')
            const parsedTime = parseTimeRange(subject.schedule || '')
            const courseCode = normalizeCourseCode(course.courseCode)
            const room = getRoomParts(subject.room || 'TBA')
            const sectionCode = String(block.sectionCode || 'UNASSIGNED')
            const sectionId = block.sectionId || `unassigned-${sectionCode}`

            return {
              id: `${course.courseCode}-${sectionId}-${subject.subjectId}`,
              courseCode: String(course.courseCode || ''),
              courseDisplayCode: courseCode,
              sectionCode,
              blockCode: formatSectionCode(course.courseCode, sectionCode),
              subjectCode: String(subject.code || 'N/A'),
              subjectTitle: String(subject.title || 'N/A'),
              scheduleText: String(subject.schedule || ''),
              days,
              startMinutes: parsedTime.startMinutes,
              endMinutes: parsedTime.endMinutes,
              startTime: parsedTime.startTime,
              endTime: parsedTime.endTime,
              room: room.room,
              building: room.building,
              classType: /lab|laboratory/i.test(`${subject.code} ${subject.title}`) ? 'Laboratory' : 'Lecture',
              semester: String(block.semester || 'N/A'),
              schoolYear: String(block.schoolYear || 'N/A'),
              yearLevel: block.yearLevel ?? null,
              enrolledStudents: Number.isFinite(subject.enrolledStudents) ? subject.enrolledStudents : 0
            }
          })
        )
    )
  , [courses])

  const philippineHolidayEvents = useMemo<SchoolEvent[]>(() => [
    {
      id: 'ph-holiday-2026-01-01',
      title: "New Year's Day",
      date: '2026-01-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday. No regular classes or office transactions.'
    },
    {
      id: 'ph-holiday-2026-02-17',
      title: 'Chinese New Year',
      date: '2026-02-17',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-02-25',
      title: 'EDSA People Power Revolution Anniversary',
      date: '2026-02-25',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Working Day',
      statusTagClass: 'holiday',
      description: 'Philippine special working day. Regular classes and office operations continue unless the school announces otherwise.'
    },
    {
      id: 'ph-holiday-2026-04-02',
      title: 'Maundy Thursday',
      date: '2026-04-02',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-04-03',
      title: 'Good Friday',
      date: '2026-04-03',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-04-09',
      title: 'Araw ng Kagitingan',
      date: '2026-04-09',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring valor.'
    },
    {
      id: 'ph-holiday-2026-04-04',
      title: 'Black Saturday',
      date: '2026-04-04',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-05-01',
      title: 'Labor Day',
      date: '2026-05-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday celebrating workers.'
    },
    {
      id: 'ph-holiday-2026-06-12',
      title: 'Independence Day',
      date: '2026-06-12',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday celebrating independence.'
    },
    {
      id: 'ph-holiday-2026-08-21',
      title: 'Ninoy Aquino Day',
      date: '2026-08-21',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-08-31',
      title: "National Heroes' Day",
      date: '2026-08-31',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring national heroes.'
    },
    {
      id: 'ph-holiday-2026-11-01',
      title: "All Saints' Day",
      date: '2026-11-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-11-02',
      title: "All Souls' Day",
      date: '2026-11-02',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine additional special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-11-30',
      title: 'Bonifacio Day',
      date: '2026-11-30',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring Andres Bonifacio.'
    },
    {
      id: 'ph-holiday-2026-12-08',
      title: 'Feast of the Immaculate Conception of Mary',
      date: '2026-12-08',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-12-24',
      title: 'Christmas Eve',
      date: '2026-12-24',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-12-25',
      title: 'Christmas Day',
      date: '2026-12-25',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday.'
    },
    {
      id: 'ph-holiday-2026-12-30',
      title: 'Rizal Day',
      date: '2026-12-30',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring Jose Rizal.'
    },
    {
      id: 'ph-holiday-2026-12-31',
      title: 'Last Day of the Year',
      date: '2026-12-31',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    }
  ], [])
  const getEventCategory = (announcement: any): SchoolEvent['category'] => {
    const type = String(announcement?.type || 'info').toLowerCase()
    const title = String(announcement?.title || '').toLowerCase()
    if (/holiday/.test(title)) return 'Holiday'
    if (/midterm|final|exam/.test(title)) return 'Exam'
    if (/grading|grade/.test(title)) return 'Deadline'
    if (type === 'urgent') return 'Deadline'
    if (type === 'warning') return 'Academic'
    return 'Meeting'
  }

  const getEventTag = (announcement: any) => {
    if (announcement?.isPinned) return 'Pinned'
    const type = String(announcement?.type || 'info').toLowerCase()
    if (type === 'maintenance') return 'Maintenance'
    if (type === 'warning') return 'Academic Alert'
    return 'Announcement'
  }

  const getEventTagClass = (statusTag: string, category: SchoolEvent['category']) => {
    const normalized = String(statusTag || '').toLowerCase()
    if (normalized.includes('exam')) return 'exam'
    if (normalized.includes('holiday')) return 'holiday'
    if (normalized.includes('meeting')) return 'meeting'
    if (normalized.includes('pinned') || normalized.includes('maintenance') || normalized.includes('academic')) return 'academic'
    if (normalized.includes('grade') || normalized.includes('due') || category === 'Deadline') return 'deadline'
    if (normalized.includes('announcement')) return 'general'
    return category.toLowerCase() as SchoolEvent['statusTagClass']
  }

  const mergeEventSources = (items: SchoolEvent[]) => {
    const seen = new Set<string>()
    return items.filter((event) => {
      const key = `${event.date}|${event.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const [events, setEvents] = useState<SchoolEvent[]>([])
  const [eventLoading, setEventLoading] = useState(false)
  const [scope, setScope] = useState<ScopeFilter>('both')
  const [mode, setMode] = useState<ScheduleMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState<'all' | SchoolDay>('all')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [calendarDate, setCalendarDate] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null)
  const [timetableContainerWidth, setTimetableContainerWidth] = useState<number>(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1280
  ))
  const [timetableDayOffset, setTimetableDayOffset] = useState(0)
  const timetableWrapRef = useRef<HTMLDivElement | null>(null)

  const semesterOptions = useMemo(() => {
    const list = new Set<string>()
    classItems.forEach((item) => list.add(item.semester))
    return ['all', ...Array.from(list).sort()]
  }, [classItems])

  const yearOptions = useMemo(() => {
    const list = new Set<string>()
    classItems.forEach((item) => list.add(item.schoolYear))
    return ['all', ...Array.from(list).sort().reverse()]
  }, [classItems])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const loadEvents = async () => {
      try {
        setEventLoading(true)
        const response = await fetchWithAutoReconnect(`${API_URL}/api/announcements?targetAudience=professor`, {
          signal: controller.signal
        })

        if (!response.ok) {
          setEvents(mergeEventSources([...philippineHolidayEvents]))
          return
        }

        const payload = await response.json().catch(() => [])
        const records = Array.isArray(payload) ? payload : []

        const mapped = records
          .filter(isVisibleProfessorAnnouncement)
          .map((announcement: any): SchoolEvent | null => {
            const sourceDate = announcement.scheduledFor || announcement.expiresAt || announcement.createdAt
            const date = new Date(sourceDate)
            if (Number.isNaN(date.getTime())) {
              return null
            }
            const statusTag = getEventTag(announcement)
            const category = getEventCategory(announcement)

            return {
              id: announcement._id || `${announcement.title}-${sourceDate}`,
              title: announcement.title || 'School Event',
              date: toDateKey(date),
              time: announcement.scheduledFor ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'See details',
              category,
              statusTag,
              statusTagClass: getEventTagClass(statusTag, category),
              description: announcement.message || 'No details yet.',
              location: announcement.type === 'maintenance' ? 'System Notification' : ''
            }
          })
          .filter((entry: SchoolEvent | null): entry is SchoolEvent => Boolean(entry))

        if (!cancelled) {
          setEvents(mergeEventSources([...philippineHolidayEvents, ...mapped]))
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        if (!cancelled) {
          setEvents((current) => (
            current.length > 0
              ? current
              : mergeEventSources([...philippineHolidayEvents])
          ))
        }
      } finally {
        if (!cancelled) {
          setEventLoading(false)
        }
      }
    }

    void loadEvents()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [philippineHolidayEvents])

  const filteredClasses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return classItems.filter((entry) => {
      if (scope === 'events') return false
      if (semesterFilter !== 'all' && entry.semester !== semesterFilter) return false
      if (yearFilter !== 'all' && entry.schoolYear !== yearFilter) return false
      if (dayFilter !== 'all' && !entry.days.includes(dayFilter)) return false
      if (!query) return true
      return `${entry.subjectCode} ${entry.subjectTitle} ${entry.blockCode} ${entry.scheduleText}`.toLowerCase().includes(query)
    })
  }, [classItems, dayFilter, semesterFilter, scope, yearFilter, searchQuery])

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return events
      .filter((event) => {
        if (scope === 'classes') return false
        const eventDay = getSchoolDayFromJs(new Date(`${event.date}T00:00:00`))
        if (dayFilter !== 'all' && eventDay !== dayFilter) return false
        if (!query) return true
        return `${event.title} ${event.description} ${event.statusTag} ${event.category}`.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        const left = parseDateKey(a.date)?.getTime() ?? 0
        const right = parseDateKey(b.date)?.getTime() ?? 0
        if (left === right) {
          if (a.time === 'See details' && b.time !== 'See details') return 1
          if (b.time === 'See details' && a.time !== 'See details') return -1
          return a.time.localeCompare(b.time)
        }
        return left - right
      })
  }, [events, scope, dayFilter, searchQuery])

  const upcomingFilteredEvents = useMemo(() => {
    const today = toDateKey(new Date())
    return filteredEvents.filter((event) => event.date >= today)
  }, [filteredEvents])

  const upcomingCalendarMonthEvents = useMemo(() => {
    const activeYear = calendarMonth.getFullYear()
    const activeMonth = calendarMonth.getMonth()

    return upcomingFilteredEvents.filter((event) => {
      const eventDate = parseDateKey(event.date)
      return Boolean(
        eventDate &&
        eventDate.getFullYear() === activeYear &&
        eventDate.getMonth() === activeMonth
      )
    })
  }, [calendarMonth, upcomingFilteredEvents])

  const groupedClassDays = useMemo(() => {
    const grouped: Record<ItemDay, ScheduleItem[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
      Unscheduled: []
    }

    filteredClasses.forEach((entry) => {
      if (entry.days.length === 0) {
        grouped.Unscheduled.push(entry)
      } else {
        entry.days.forEach((day) => {
          grouped[day].push(entry)
        })
      }
    })

    ;(Object.keys(grouped) as ItemDay[]).forEach((day) => {
      grouped[day].sort((a, b) => {
        const aStart = a.startMinutes ?? Number.MAX_SAFE_INTEGER
        const bStart = b.startMinutes ?? Number.MAX_SAFE_INTEGER
        return aStart - bStart
      })
    })

    return grouped
  }, [filteredClasses])

  const nextClass = useMemo(() => {
    const now = new Date()
    const nowDay = now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    const candidates = filteredClasses
      .flatMap((entry) => {
        if (!entry.days.length || entry.startMinutes === null) return []
        return entry.days.map((day) => {
          const dayIndex = SCHOOL_DAYS_BY_JS.indexOf(day)
          const delta = (dayIndex - nowDay + 7) % 7
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
          date.setDate(date.getDate() + delta)
          date.setMinutes(entry.startMinutes as number)
          if (delta === 0 && (entry.startMinutes as number) <= nowMinutes) {
            date.setDate(date.getDate() + 7)
          }
          return { item: entry, time: date.getTime() }
        })
      })
      .sort((a, b) => a.time - b.time)

    return candidates[0]?.item ?? null
  }, [filteredClasses])

  const nowForSchedule = new Date()
  const todayName = getSchoolDayFromJs(nowForSchedule)
  const classesTodayCount = filteredClasses.filter((entry) => entry.days.includes(todayName)).length
  const currentTimeMinute = nowForSchedule.getHours() * 60 + nowForSchedule.getMinutes()
  const currentTimeTop = currentTimeMinute >= TIMETABLE_START && currentTimeMinute <= TIMETABLE_END
    ? ((currentTimeMinute - TIMETABLE_START) / SLOT_MINUTES) * SLOT_HEIGHT
    : null

  const timeSlots = useMemo(() => {
    const list: string[] = []
    for (let minute = TIMETABLE_START; minute <= TIMETABLE_END; minute += SLOT_MINUTES) {
      list.push(formatClock(minute))
    }
    return list
  }, [])

  const timetableIntervals = useMemo(() => timeSlots.slice(0, -1), [timeSlots])
  const timetableBodyHeight = timetableIntervals.length * SLOT_HEIGHT

  const timetableOccurrences = useMemo<Record<SchoolDay, TimetableOccurrence[]>>(() => {
    const buckets: Record<SchoolDay, TimetableOccurrence[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    }

    filteredClasses
      .filter((entry) => entry.startMinutes !== null && entry.endMinutes !== null && entry.days.length > 0)
      .forEach((entry) => {
        entry.days.forEach((day) => {
          buckets[day].push({ ...entry, day, lane: 0, laneCount: 1 })
        })
      })

    Object.keys(buckets).forEach((key) => {
      const day = key as SchoolDay
      const items = buckets[day]
      items.sort((a, b) => {
        return (a.startMinutes ?? 0) - (b.startMinutes ?? 0)
      })

      const lanes: number[] = []
      buckets[day] = items.map((item) => {
        const start = item.startMinutes ?? TIMETABLE_START
        const end = item.endMinutes ?? start + 60
        let lane = 0

        while (lane < lanes.length && start < lanes[lane]) {
          lane += 1
        }

        if (lane === lanes.length) lanes.push(end)
        else lanes[lane] = end

        return {
          ...item,
          lane,
          laneCount: Math.max(lanes.length, 1)
        }
      })
    })

    return buckets
  }, [filteredClasses])

  const hasTimetableClasses = Object.values(timetableOccurrences).some((items) => items.length > 0)
  const timetableDays = useMemo<SchoolDay[]>(() => (
    dayFilter === 'all' ? SCHOOL_DAYS : [dayFilter]
  ), [dayFilter])
  const timetableTimeColumnWidth = timetableContainerWidth < 540 ? 68 : 78
  const timetableDayColumnMinWidth = timetableContainerWidth < 720 ? 148 : 160
  const visibleTimetableDayCount = useMemo(() => {
    const maxColumns =
      timetableContainerWidth < 560 ? 1 :
      timetableContainerWidth < 900 ? 2 :
      timetableContainerWidth < 1180 ? 4 :
      timetableDays.length

    return Math.max(1, Math.min(timetableDays.length, maxColumns))
  }, [timetableContainerWidth, timetableDays.length])
  const maxTimetableDayOffset = Math.max(timetableDays.length - visibleTimetableDayCount, 0)
  const visibleTimetableDays = useMemo(() => (
    timetableDays.slice(timetableDayOffset, timetableDayOffset + visibleTimetableDayCount)
  ), [timetableDayOffset, timetableDays, visibleTimetableDayCount])
  const timetableGridStyle = useMemo(() => {
    if (visibleTimetableDays.length <= 1) {
      return {
        gridTemplateColumns: `${timetableTimeColumnWidth}px minmax(0, 1fr)`,
        minWidth: '100%'
      }
    }

    const minWidth = timetableTimeColumnWidth + (visibleTimetableDays.length * timetableDayColumnMinWidth)
    return {
      gridTemplateColumns: `${timetableTimeColumnWidth}px repeat(${visibleTimetableDays.length}, minmax(${timetableDayColumnMinWidth}px, 1fr))`,
      minWidth: `${minWidth}px`
    }
  }, [timetableDayColumnMinWidth, timetableTimeColumnWidth, visibleTimetableDays.length])

  useEffect(() => {
    setTimetableDayOffset((previous) => Math.min(previous, maxTimetableDayOffset))
  }, [maxTimetableDayOffset])

  useEffect(() => {
    if (dayFilter !== 'all' || visibleTimetableDayCount !== 1 || maxTimetableDayOffset <= 0 || timetableDayOffset !== 0) {
      return
    }

    setTimetableDayOffset(Math.min(SCHOOL_DAYS.indexOf(todayName), maxTimetableDayOffset))
  }, [dayFilter, maxTimetableDayOffset, timetableDayOffset, todayName, visibleTimetableDayCount])

  const shiftTimetableDays = (direction: -1 | 1) => {
    setTimetableDayOffset((previous) => {
      if (direction < 0) {
        return Math.max(previous - 1, 0)
      }
      return Math.min(previous + 1, maxTimetableDayOffset)
    })
  }

  const jumpToTimetableDay = (index: number) => {
    setTimetableDayOffset(Math.min(Math.max(index, 0), maxTimetableDayOffset))
  }

  useEffect(() => {
    if (mode !== 'timetable' || !hasTimetableClasses || !timetableWrapRef.current) {
      return
    }

    const node = timetableWrapRef.current
    const updateWidth = () => {
      setTimetableContainerWidth(node.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280))
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width || node.clientWidth
      setTimetableContainerWidth(nextWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasTimetableClasses, mode])

  const monthGrid = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDate = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const offset = (firstDate.getDay() + 6) % 7

    const eventMap = filteredEvents.reduce<Record<string, CalendarEventPreview[]>>((acc, event) => {
      if (!acc[event.date]) acc[event.date] = []
      acc[event.date].push(getTimelinePreview(event))
      return acc
    }, {})

    const cells: Array<{
      key: string
      day: number
      date: string
      isToday: boolean
      hasEvent: boolean
      previews: CalendarEventPreview[]
      extraCount: number
    } | null> = []

    for (let i = 0; i < offset; i += 1) cells.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day)
      const key = toDateKey(date)
      const previews = eventMap[key] || []
      cells.push({
        key: `calendar-${key}`,
        day,
        date: key,
        isToday: key === toDateKey(new Date()),
        hasEvent: previews.length > 0,
        previews: previews.slice(0, 2),
        extraCount: Math.max(previews.length - 2, 0)
      })
    }

    return cells
  }, [calendarMonth, filteredEvents])

  const eventsForActiveDate = useMemo(() => {
    return calendarDate
      ? filteredEvents.filter((event) => event.date === calendarDate)
      : upcomingCalendarMonthEvents
  }, [calendarDate, filteredEvents, upcomingCalendarMonthEvents])

  const eventListTitle = calendarDate
    ? `Events on ${calendarDate}`
    : `Upcoming events in ${calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`

  const emptyEventListText = calendarDate
    ? 'No school events scheduled for this date.'
    : `No upcoming school events in ${calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}.`

  const upcomingEvent = upcomingFilteredEvents[0] ?? null
  const eventModeEnabled = scope === 'events' || scope === 'both'
  const classModeEnabled = scope === 'classes' || scope === 'both'
  const noAssignedSchedules = classModeEnabled && classItems.length === 0
  const noClassMatches = filteredClasses.length === 0
  const noFilterMatches =
    (scope === 'classes' && filteredClasses.length === 0) ||
    (scope === 'events' && filteredEvents.length === 0) ||
    (scope === 'both' && filteredClasses.length === 0 && filteredEvents.length === 0)

  const selectedEventDay = useMemo(() => {
    const sourceDate = selectedEvent?.date || calendarDate
    if (!sourceDate) return null
    const date = parseDateKey(sourceDate)
    if (!date) return null
    return getSchoolDayFromJs(date)
  }, [calendarDate, selectedEvent?.date])

  const handlePrevMonth = () => {
    setCalendarDate(null)
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCalendarDate(null)
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
  }

  const formatDaysLabel = (days: SchoolDay[]) => {
    if (!days.length) return 'Unscheduled'
    return days.join(', ')
  }

  const formatDuration = (entry: ScheduleItem) => {
    if (entry.startTime === 'TBA' || entry.endTime === 'TBA') return 'Time not set'
    return `${entry.startTime} - ${entry.endTime}`
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Schedule</h2>
        <p className="professor-section-desc">Loading assigned teaching schedules...</p>
      </div>
    )
  }

  return (
    <div className="professor-section professor-schedule-page">
      <div className="professor-schedule-head">
        <div>
          <h2 className="professor-section-title">Schedule</h2>
          <p className="professor-section-desc">View your teaching schedule and upcoming academic events.</p>
        </div>
        <button className="professor-btn" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <p className="professor-data-error">{error}</p>
      )}

      <div className="professor-summary-grid">
        <div className="professor-summary-card">
          <span>Total Assigned Classes</span>
          <strong>{classItems.length}</strong>
          <small>Across your assigned blocks</small>
        </div>
        <div className="professor-summary-card">
          <span>Classes Today</span>
          <strong>{classesTodayCount}</strong>
          <small>{todayName} schedule</small>
        </div>
        <div className="professor-summary-card">
          <span>Next Class</span>
          <strong>{nextClass ? nextClass.subjectCode : 'N/A'}</strong>
          <small>{nextClass ? `${nextClass.blockCode} • ${formatDuration(nextClass)}` : 'No upcoming class'}</small>
        </div>
        <div className="professor-summary-card">
          <span>Upcoming School Event</span>
          <strong>{upcomingEvent ? upcomingEvent.title : 'N/A'}</strong>
          <small>{upcomingEvent ? `${upcomingEvent.date} • ${upcomingEvent.time}` : 'No upcoming school event'}</small>
        </div>
      </div>

      <div className="professor-schedule-toolbar">
        <div className="professor-course-toolbar-start">
          <div className="professor-roster-search">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              placeholder="Search subject code, title, section"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <label>
            <span>Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}>
              <option value="both">Classes and events</option>
              <option value="classes">Classes only</option>
              <option value="events">School events only</option>
            </select>
          </label>

          <label>
            <span>Semester</span>
            <select
              value={semesterFilter}
              onChange={(event) => setSemesterFilter(event.target.value)}
            >
              {semesterOptions.map((semester) => (
                <option key={semester} value={semester}>
                  {semester === 'all' ? 'All semesters' : semester}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>School Year</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year === 'all' ? 'All years' : year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={dayFilter}
              onChange={(event) => {
                const value = event.target.value
                setDayFilter(value === 'all' ? 'all' : (value as SchoolDay))
              }}
            >
              <option value="all">All days</option>
              {SCHOOL_DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="professor-schedule-view-toggle">
          <button
            type="button"
            className={`professor-layout-btn ${mode === 'list' ? 'is-active' : ''}`}
            onClick={() => setMode('list')}
          >
            <List size={14} />
            <span>List View</span>
          </button>
          <button
            type="button"
            className={`professor-layout-btn ${mode === 'timetable' ? 'is-active' : ''}`}
            onClick={() => setMode('timetable')}
          >
            <Grid3X3 size={14} />
            <span>Timetable View</span>
          </button>
        </div>
      </div>

      <div className="professor-schedule-layout">
        <div className="professor-schedule-main">
          {(() => {
            if (!classModeEnabled) {
              return (
                <div className="professor-empty-state">
                  <h3>Class schedules hidden</h3>
                  <p>Switch scope to both / classes to view class schedules.</p>
                </div>
              )
            }

            if (noAssignedSchedules) {
              return (
                <div className="professor-empty-state">
                  <h3>No assigned schedules found.</h3>
                  <p>Make sure your assigned subjects are updated by the registrar.</p>
                </div>
              )
            }

            if (mode === 'list') {
              return (
                <>
                  {nextClass ? (
                    <div className="professor-schedule-next">
                      <strong>Next upcoming class</strong>
                      <div>{nextClass.subjectCode}</div>
                      <span>{String(nextClass.blockCode)} • {formatDuration(nextClass)}</span>
                    </div>
                  ) : (
                    <div className="professor-schedule-empty">No upcoming class found.</div>
                  )}

                  <div className="professor-schedule-card-list">
                    {SCHOOL_DAYS.map((day) => {
                      const items = groupedClassDays[day]
                      if (items.length === 0) return null

                      return items.map((entry) => (
                        <button
                          key={`${entry.id}-${day}`}
                          type="button"
                          className="professor-schedule-item professor-schedule-card"
                          onClick={() => setSelectedClass(entry)}
                        >
                          <div className="professor-schedule-card-head">
                            <span className="professor-schedule-card-day">{day}</span>
                            <span className="professor-schedule-card-badge">{entry.classType}</span>
                          </div>
                          <div className="professor-schedule-item-title">
                            <strong>{entry.subjectCode}</strong>
                            <span>{entry.subjectTitle}</span>
                          </div>
                          <div className="professor-schedule-item-meta">
                            <span><CalendarDays size={13} /> Section: {entry.blockCode}</span>
                            <span><Clock size={13} /> {formatDuration(entry)}</span>
                            <span><MapPin size={13} /> {entry.room}, {entry.building}</span>
                            <span>{entry.enrolledStudents} students</span>
                          </div>
                          <div className="professor-schedule-item-meta">
                            <span>Semester: {entry.semester}</span>
                            <span>School Year: {entry.schoolYear}</span>
                          </div>
                        </button>
                      ))
                    })}

                    {groupedClassDays.Unscheduled.map((entry) => (
                      <button
                        key={`${entry.id}-unscheduled`}
                        type="button"
                        className="professor-schedule-item professor-schedule-card"
                        onClick={() => setSelectedClass(entry)}
                      >
                        <div className="professor-schedule-card-head">
                          <span className="professor-schedule-card-day">Unscheduled</span>
                          <span className="professor-schedule-card-badge">{entry.classType}</span>
                        </div>
                        <div className="professor-schedule-item-title">
                          <strong>{entry.subjectCode}</strong>
                          <span>{entry.subjectTitle}</span>
                        </div>
                        <div className="professor-schedule-item-meta">
                          <span><CalendarDays size={13} /> Section: {entry.blockCode}</span>
                          <span><Clock size={13} /> {entry.scheduleText}</span>
                        </div>
                      </button>
                    ))}

                    {noClassMatches ? (
                      <div className="professor-empty-state">
                        <h3>No classes match your selected filters.</h3>
                        <p>Try adjusting the filters or choose a different search query.</p>
                      </div>
                    ) : null}
                  </div>
                </>
              )
            }

            if (hasTimetableClasses) {
              return (
                <div className="professor-schedule-timetable-wrap" ref={timetableWrapRef}>
                  {timetableDays.length > visibleTimetableDayCount && (
                    <div className="professor-timetable-window-controls">
                      <button
                        type="button"
                        className="professor-timetable-window-btn"
                        onClick={() => shiftTimetableDays(-1)}
                        disabled={timetableDayOffset === 0}
                        aria-label="Show earlier timetable days"
                      >
                        ◀
                      </button>
                      <div className="professor-timetable-day-pills" aria-label="Visible timetable days">
                        {timetableDays.map((day, index) => (
                          <button
                            key={`timetable-day-pill-${day}`}
                            type="button"
                            className={`professor-timetable-day-pill ${visibleTimetableDays.includes(day) ? 'is-active' : ''}`}
                            onClick={() => jumpToTimetableDay(index)}
                            aria-pressed={visibleTimetableDays.includes(day)}
                            title={day}
                          >
                            {DAY_SHORT[day]}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="professor-timetable-window-btn"
                        onClick={() => shiftTimetableDays(1)}
                        disabled={timetableDayOffset >= maxTimetableDayOffset}
                        aria-label="Show later timetable days"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                  <div className="professor-timetable-scroll">
                    <div
                      className={`professor-timetable-grid ${visibleTimetableDays.length === 1 ? 'is-single-day' : ''}`}
                      style={timetableGridStyle}
                    >
                      <div className="professor-timetable-time-col">
                        <div className="professor-timetable-day-header">Time</div>
                        <div className="professor-timetable-time-body" style={{ height: `${timetableBodyHeight}px` }}>
                          {timetableIntervals.map((slot) => (
                            <div key={`time-${slot}`} className="professor-timetable-time-row">{slot}</div>
                          ))}
                          <div className="professor-timetable-time-end">{timeSlots[timeSlots.length - 1]}</div>
                        </div>
                      </div>

                      {visibleTimetableDays.map((day) => {
                        const occurrences = timetableOccurrences[day]
                        return (
                          <div key={`timetable-${day}`} className={`professor-timetable-day-col ${day === todayName ? 'is-today' : ''}`}>
                            <div className="professor-timetable-day-header">{day}</div>
                            <div className="professor-timetable-day-body" style={{ height: `${timetableBodyHeight}px` }}>
                              {timetableIntervals.map((_, idx) => (
                                <div key={`${day}-line-${idx}`} className={`professor-timetable-line ${idx % 2 === 0 ? 'is-strong' : ''}`} />
                              ))}

                              {day === todayName && currentTimeTop !== null && (
                                <div className="professor-timetable-now-line" style={{ top: `${currentTimeTop}px` }} />
                              )}

                              {occurrences.map((occurrence) => {
                                const start = occurrence.startMinutes ?? TIMETABLE_START
                                const end = occurrence.endMinutes ?? (start + 60)
                                const top = ((start - TIMETABLE_START) / SLOT_MINUTES) * SLOT_HEIGHT
                                const height = Math.max(((end - start) / SLOT_MINUTES) * SLOT_HEIGHT, 32)
                                const width = 100 / occurrence.laneCount
                                const left = occurrence.lane * width

                                return (
                                  <button
                                    key={`${occurrence.id}-${occurrence.day}`}
                                    type="button"
                                    className="professor-timetable-item"
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      left: `${left}%`,
                                      width: `calc(${width}% - 6px)`
                                    }}
                                    onClick={() => setSelectedClass(occurrence)}
                                  >
                                    <strong>{occurrence.subjectCode}</strong>
                                    <span>{occurrence.blockCode}</span>
                                    <small>{occurrence.startTime} - {occurrence.endTime}</small>
                                    <small>{occurrence.room}</small>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            }

            if (noFilterMatches) {
              return (
                <div className="professor-empty-state">
                  <h3>No schedule or event matches your selected filters.</h3>
                  <p>Try adjusting the filters or a different search query.</p>
                </div>
              )
            }

            return (
              <div className="professor-empty-state">
                <h3>No timetable entries</h3>
                <p>Assign meeting times are not available in your current schedule list.</p>
              </div>
            )
          })()}
        </div>

        <section className="professor-schedule-event-panel professor-schedule-event-panel-horizontal">
          <div className="professor-schedule-event-head">
            <h3>School Calendar of Events</h3>
            <p>Academic notices affecting teaching schedules.</p>
          </div>

          {eventModeEnabled ? (
            <div className="professor-schedule-event-body">
              <div className="professor-mini-calendar">
                <div className="professor-mini-calendar-head">
                  <button type="button" onClick={handlePrevMonth} aria-label="Previous month">◀</button>
                  <strong>
                    {calendarMonth.toLocaleString(undefined, { month: 'long' })} {calendarMonth.getFullYear()}
                  </strong>
                  <button type="button" onClick={handleNextMonth} aria-label="Next month">▶</button>
                </div>

                <div className="professor-mini-calendar-row">
                  {SCHOOL_DAYS.map((day) => (
                    <span key={`cal-head-${day}`}>{DAY_SHORT[day]}</span>
                  ))}
                </div>

                <div className="professor-mini-calendar-grid">
                  {monthGrid.map((cell, index) => {
                    if (!cell) {
                      return <span key={`empty-${index}`} className="professor-mini-calendar-empty" />
                    }

                    const isActive = calendarDate === cell.date
                    const classes = [
                      'professor-mini-calendar-day',
                      cell.isToday ? 'is-today' : '',
                      cell.hasEvent ? 'has-event' : '',
                      isActive ? 'is-active' : ''
                    ].filter(Boolean).join(' ')

                    return (
                      <button
                        type="button"
                        key={cell.key}
                        className={classes}
                        onClick={() => setCalendarDate((prev) => (prev === cell.date ? null : cell.date))}
                      >
                        <span className="professor-mini-calendar-date">{cell.day}</span>
                        {cell.previews.length > 0 && (
                          <span className="professor-mini-calendar-timeline">
                            {cell.previews.map((preview) => (
                              <span
                                key={preview.id}
                                className={`professor-mini-calendar-event-line tag-${preview.tagClass}`}
                                title={`${preview.title} • ${preview.label}`}
                              >
                                <span className="professor-mini-calendar-event-label">
                                  {preview.title}
                                </span>
                                <span
                                  className="professor-mini-calendar-event-fill"
                                  style={{
                                    left: `${preview.offsetPercent}%`,
                                    width: `${preview.widthPercent}%`
                                  }}
                                />
                              </span>
                            ))}
                            {cell.extraCount > 0 && (
                              <span className="professor-mini-calendar-more">+{cell.extraCount}</span>
                            )}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="professor-schedule-event-list">
                <h4>{eventListTitle}</h4>

                {eventLoading ? (
                  <p>Loading school events...</p>
                ) : eventsForActiveDate.length === 0 ? (
                  <p>{emptyEventListText}</p>
                ) : (
                  eventsForActiveDate
                    .slice(0, 8)
                    .map((event) => {
                      const eventTag = event.statusTagClass || 'general'
                      return (
                        <button
                          type="button"
                          key={event.id}
                          className="professor-schedule-event-item"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="professor-schedule-event-header">
                            <strong>{event.title}</strong>
                            <span className={`professor-schedule-event-tag tag-${eventTag}`}>{event.statusTag}</span>
                          </div>
                          <div className="professor-schedule-event-meta">
                            {event.date} • {event.time} • {event.category}
                          </div>
                        </button>
                      )
                    })
                )}
              </div>
            </div>
          ) : (
            <div className="professor-empty-state">
              <h3>School events hidden</h3>
              <p>Switch scope to both / events to view calendar events.</p>
            </div>
          )}
        </section>
      </div>

      {selectedClass && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedClass(null)}>
          <div className="professor-student-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>Class Details</h3>
              <button className="professor-btn professor-btn-secondary" type="button" onClick={() => setSelectedClass(null)}>Close</button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Subject Code:</strong> {selectedClass.subjectCode}</div>
                <div><strong>Subject Title:</strong> {selectedClass.subjectTitle}</div>
                <div><strong>Section / Block:</strong> {selectedClass.blockCode}</div>
                <div><strong>Schedule:</strong> {formatDaysLabel(selectedClass.days)} • {formatDuration(selectedClass)}</div>
                <div><strong>Room:</strong> {selectedClass.room}</div>
                <div><strong>Building / Location:</strong> {selectedClass.building}</div>
                <div><strong>Class Type:</strong> {selectedClass.classType}</div>
                <div><strong>Semester:</strong> {selectedClass.semester}</div>
                <div><strong>School Year:</strong> {selectedClass.schoolYear}</div>
                <div><strong>Enrolled Students:</strong> {selectedClass.enrolledStudents}</div>
              </div>

              <div className="professor-schedule-modal-actions">
                <button className="professor-btn" type="button">View Student Roster</button>
                <button className="professor-btn professor-btn-secondary" type="button">View Attendance</button>
                <button className="professor-btn professor-btn-secondary" type="button">View Grades</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="professor-student-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>School Event</h3>
              <button className="professor-btn professor-btn-secondary" type="button" onClick={() => setSelectedEvent(null)}>Close</button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Title:</strong> {selectedEvent.title}</div>
                <div><strong>Date:</strong> {selectedEvent.date}</div>
                <div><strong>Time:</strong> {selectedEvent.time}</div>
                <div><strong>Type:</strong> {selectedEvent.category}</div>
                <div><strong>Status:</strong> {selectedEvent.statusTag}</div>
                <div><strong>Day:</strong> {selectedEventDay || 'N/A'}</div>
              </div>
              <p><strong>Description:</strong> {selectedEvent.description}</p>

              <div className="professor-student-academic">
                <h4>Affected classes</h4>
                <ul>
                  {(filteredClasses.filter((entry) => {
                    if (!selectedEventDay) return false
                    if (entry.days.length === 0) return false
                    return entry.days.includes(selectedEventDay)
                  })).length === 0 ? (
                    <li>No directly affected classes identified.</li>
                  ) : (
                    filteredClasses
                      .filter((entry) => {
                        if (!selectedEventDay) return false
                        if (entry.days.length === 0) return false
                        return entry.days.includes(selectedEventDay)
                      })
                      .map((entry) => (
                        <li key={`${entry.id}-${selectedEventDay}`}>{entry.subjectCode} • {entry.blockCode}</li>
                      ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleManagement

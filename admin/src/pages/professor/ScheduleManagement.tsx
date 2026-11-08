import { Fragment, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, MapPin, X } from 'lucide-react'
import type { ProfessorAssignedCourse } from './professorTypes'
import { parseClockMinutesFlexible } from '../../lib/scheduleFormatter'
import { getAcademicTerm, getCachedAcademicTerm, subscribeAcademicTerm, type AcademicTerm } from '../../lib/settingsApi'
import { DEFAULT_SCHOOL_YEAR, DEFAULT_ACADEMIC_SEMESTER } from '../../lib/academicDefaults'
import './ScheduleManagement.css'

export interface CalendarEvent {
  id: string
  title: string
  date: string // YYYY-MM-DD
  time: string
  category: string
  statusTag: string
  statusTagClass: string
  description: string
  location?: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 2
const MAX_POPOVER_ITEMS = 4

const pad = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDateKey = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
const formatLongDate = (key: string) =>
  parseDateKey(key)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) ?? key

/* ─── Normalization helpers ─── */
export const normalizeSemester = (value: string): string => {
  const raw = String(value || '').toLowerCase().replace(/\s+/g, '')
  if (!raw) return ''
  if (['1', '1st', 'first', 'firstsemester', '1stsemester', 'firstsem', 'sem1', '1stsem'].includes(raw)) return '1st'
  if (['2', '2nd', 'second', 'secondsemester', '2ndsemester', 'secondsem', 'sem2', '2ndsem'].includes(raw)) return '2nd'
  if (['summer', 'summerterm', 'summersemester'].includes(raw)) return 'Summer'
  return String(value || '').trim()
}

export const normalizeSchoolYear = (value: string): string => {
  const match = String(value || '').trim().match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/)
  return match ? `${match[1]}-${match[2]}` : String(value || '').trim()
}

/* ─── Weekly timeline helpers ─── */

const TIMELINE_DAYS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'] as const
type TimelineDay = (typeof TIMELINE_DAYS)[number]

const DAY_LABELS: Record<TimelineDay, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  TH: 'Thu',
  F: 'Fri',
  S: 'Sat',
  SU: 'Sun'
}

// Date#getDay(): 0 = Sunday … 6 = Saturday
const TODAY_DAY_CODE: Record<number, TimelineDay> = { 0: 'SU', 1: 'M', 2: 'T', 3: 'W', 4: 'TH', 5: 'F', 6: 'S' }

const TIMELINE_ACCENTS = ['#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b', '#ec4899', '#6366f1']

interface TimelineEntry {
  day: TimelineDay
  start: number // minutes from midnight
  end: number
  room: string
}

export interface TimelineClass {
  id: string
  code: string
  title: string
  section: string
  courseCode: string
  room: string
  semester?: string
  schoolYear?: string
  enrolledStudents?: number
  entries: TimelineEntry[]
}

const parseDayCodes = (raw: string): TimelineDay[] => {
  const codes: TimelineDay[] = []
  let cursor = String(raw || '').toUpperCase()
  while (cursor.length > 0) {
    // Two-letter tokens first, otherwise "TH" would read as Tuesday + a stray H.
    const twoChar = cursor.slice(0, 2)
    if (twoChar === 'TH' || twoChar === 'SU') {
      codes.push(twoChar)
      cursor = cursor.slice(2)
      continue
    }
    const oneChar = cursor[0]
    if (['M', 'T', 'W', 'F', 'S'].includes(oneChar)) {
      codes.push(oneChar as TimelineDay)
    }
    cursor = cursor.slice(1)
  }
  return codes
}

const parseClockMinutes = (value: string): number | null => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

// Handles both formats:
//   classic   "MW 07:30-09:00"        (room in a separate field)
//   per-day   "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
const parseScheduleSegments = (schedule: string): TimelineEntry[] => {
  const trimmed = String(schedule || '').trim()
  if (!trimmed || /^tba$/i.test(trimmed)) return []

  const segments = trimmed.includes('/') ? trimmed.split('/') : [trimmed]
  const entries: TimelineEntry[] = []

  for (const rawSegment of segments) {
    const segment = rawSegment.trim()
    if (!segment) continue

    const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/)
    const body = (roomMatch ? roomMatch[1] : segment).trim()
    const room = roomMatch ? roomMatch[2].trim() : ''

    const spaceIndex = body.indexOf(' ')
    if (spaceIndex < 0) continue

    const days = parseDayCodes(body.slice(0, spaceIndex))
    const timeMatch = body.slice(spaceIndex + 1).trim().match(/^(.+?)\s*-\s*(.+)$/)
    if (days.length === 0 || !timeMatch) continue

    const start = parseClockMinutesFlexible(timeMatch[1]) ?? parseClockMinutes(timeMatch[1])
    const end = parseClockMinutesFlexible(timeMatch[2]) ?? parseClockMinutes(timeMatch[2])
    if (start === null || end === null || end <= start) continue

    days.forEach((day) => entries.push({ day, start, end, room }))
  }

  return entries
}

const buildTimelineClasses = (courses: ProfessorAssignedCourse[]): TimelineClass[] => {
  const hasCurrentBlocks = (courses || []).some((c) => (c.blocks || []).some((b) => b.isCurrent))
  return (courses || []).flatMap((course) =>
    (course.blocks || [])
      .filter((block) => !hasCurrentBlocks || block.isCurrent)
      .flatMap((block) =>
        (block.subjects || []).map((subject) => {
          const entries = parseScheduleSegments(subject.schedule)
          const fallbackRoom = subject.room && !/^tba$/i.test(subject.room.trim()) ? subject.room.trim() : ''
          return {
            id: `${course.courseCode}|${block.sectionCode}|${subject.subjectId}`,
            code: subject.code || 'Subject',
            title: subject.title || '',
            section: block.sectionCode || '',
            courseCode: course.courseCode,
            room: entries.find((entry) => entry.room)?.room || fallbackRoom,
            semester: block.semester,
            schoolYear: block.schoolYear,
            enrolledStudents: subject.enrolledStudents,
            entries
          }
        })
      )
  )
}

const formatClock = (minutes: number) => {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours > 12 ? hours - 12 : hours === 0 ? 12 : hours}:${pad(mins)} ${hours >= 12 ? 'PM' : 'AM'}`
}

const formatHourLabel = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' })

// Get last Monday of August for National Heroes Day
const getNationalHeroesDay = (year: number): string => {
  const lastDayOfAugust = new Date(year, 7, 31)
  const dayOfWeek = lastDayOfAugust.getDay()
  const daysToSubtract = (dayOfWeek + 6) % 7
  const heroesDay = new Date(year, 7, 31 - daysToSubtract)
  return toDateKey(heroesDay)
}

// Generate Philippine holidays for a year
const getPhilippineHolidays = (year: number): CalendarEvent[] => {
  const nationalHeroesDay = getNationalHeroesDay(year)
  return [
    {
      id: `holiday-new-year-${year}`,
      title: "New Year's Day",
      date: `${year}-01-01`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-araw-ng-kagitingan-${year}`,
      title: 'Araw ng Kagitingan',
      date: `${year}-04-09`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-labor-day-${year}`,
      title: 'Labor Day',
      date: `${year}-05-01`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-independence-day-${year}`,
      title: 'Independence Day',
      date: `${year}-06-12`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-national-heroes-${year}`,
      title: 'National Heroes Day',
      date: nationalHeroesDay,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-bonifacio-day-${year}`,
      title: 'Bonifacio Day',
      date: `${year}-11-30`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-christmas-${year}`,
      title: 'Christmas Day',
      date: `${year}-12-25`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    },
    {
      id: `holiday-rizal-day-${year}`,
      title: 'Rizal Day',
      date: `${year}-12-30`,
      time: 'All Day',
      category: 'holiday',
      statusTag: 'Holiday',
      statusTagClass: 'holiday',
      description: 'Regular Holiday'
    }
  ]
}

interface ScheduleTimelineProps {
  courses: ProfessorAssignedCourse[]
  selectedTermLabel: string
  isCurrentTerm: boolean
  allCoursesCount: number
  onResetToActiveTerm?: () => void
  onSelectClass?: (item: TimelineClass, entry: TimelineEntry) => void
}

function ScheduleTimeline({
  courses,
  selectedTermLabel,
  isCurrentTerm,
  allCoursesCount,
  onResetToActiveTerm,
  onSelectClass
}: ScheduleTimelineProps) {
  const allClasses = useMemo(() => buildTimelineClasses(courses), [courses])
  const scheduledClasses = useMemo(() => allClasses.filter((item) => item.entries.length > 0), [allClasses])
  const unscheduledClasses = useMemo(() => allClasses.filter((item) => item.entries.length === 0), [allClasses])

  const totalStudents = useMemo(() => {
    const ids = new Set<string>()
    courses.forEach((c) => {
      c.blocks.forEach((b) => {
        b.subjects.forEach((s) => {
          if (Array.isArray(s.studentIds)) {
            s.studentIds.forEach((id) => ids.add(id))
          }
        })
      })
    })
    if (ids.size > 0) return ids.size
    return courses.reduce(
      (sum, c) =>
        sum +
        c.blocks.reduce(
          (bSum, b) => bSum + b.subjects.reduce((sSum, s) => sSum + (s.enrolledStudents || 0), 0),
          0
        ),
      0
    )
  }, [courses])

  const accentById = useMemo(() => {
    const map: Record<string, string> = {}
    allClasses.forEach((item, index) => {
      map[item.id] = TIMELINE_ACCENTS[index % TIMELINE_ACCENTS.length]
    })
    return map
  }, [allClasses])

  const days = useMemo(() => TIMELINE_DAYS, [])

  const bounds = useMemo(() => {
    let startHour = 6
    let endHour = 20
    if (scheduledClasses.length > 0) {
      const ends = scheduledClasses.flatMap((item) => item.entries.map((entry) => entry.end))
      if (ends.length > 0) {
        endHour = Math.max(20, Math.min(24, Math.floor(Math.max(...ends) / 60) + 1))
      }
    }
    return { startHour, endHour }
  }, [scheduledClasses])

  const dayColumns = useMemo(() => {
    return days.map((day) => {
      const items = scheduledClasses
        .flatMap((item) => item.entries.filter((entry) => entry.day === day).map((entry) => ({ entry, item })))
        .sort((a, b) => a.entry.start - b.entry.start || b.entry.end - a.entry.end)

      const laneEnds: number[] = []
      const placed = items.map(({ entry, item }) => {
        let lane = laneEnds.findIndex((end) => end <= entry.start)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(entry.end)
        } else {
          laneEnds[lane] = entry.end
        }
        return { entry, item, lane }
      })

      return { day, placed, lanes: Math.max(laneEnds.length, 1) }
    })
  }, [days, scheduledClasses])

  const hours = useMemo(
    () => Array.from({ length: bounds.endHour - bounds.startHour }, (_, index) => bounds.startHour + index),
    [bounds]
  )

  const weeklyMinutes = scheduledClasses.reduce(
    (sum, item) => sum + item.entries.reduce((entrySum, entry) => entrySum + (entry.end - entry.start), 0),
    0
  )
  const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10
  const todayCode = TODAY_DAY_CODE[new Date().getDay()]

  return (
    <div className="professor-tl">
      <div className="professor-tl-head">
        <div>
          <div className="professor-tl-title-row">
            <h4>Weekly class timeline</h4>
            {!isCurrentTerm && (
              <span className="professor-tl-term-badge">
                {selectedTermLabel}
              </span>
            )}
          </div>
          <p>
            {scheduledClasses.length} scheduled subject{scheduledClasses.length === 1 ? '' : 's'}
            {weeklyHours > 0 ? ` · ${weeklyHours} class hour${weeklyHours === 1 ? '' : 's'} per week` : ''}
            {totalStudents > 0 ? ` · ${totalStudents} enrolled student${totalStudents === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="professor-tl-head-actions">
          {!isCurrentTerm && onResetToActiveTerm && (
            <button
              type="button"
              className="professor-tl-switch-btn"
              onClick={onResetToActiveTerm}
            >
              Switch to Active Term
            </button>
          )}
          <span className="professor-tl-today-pill">
            <Clock size={13} /> Today is {DAY_LABELS[todayCode]}
          </span>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="professor-tl-empty-state">
          <CalendarDays size={32} className="professor-tl-empty-icon" />
          <h5>No schedule records for {selectedTermLabel}</h5>
          <p>
            {isCurrentTerm
              ? 'No classes are currently assigned to you for the active term. Once the registrar assigns blocks and subjects for this semester, they will appear here automatically.'
              : 'There are no classes assigned to you for this selected semester.'}
          </p>
          {!isCurrentTerm && onResetToActiveTerm && (
            <button type="button" className="professor-tl-reset-btn" onClick={onResetToActiveTerm}>
              View Current Active Term
            </button>
          )}
          {isCurrentTerm && allCoursesCount > 0 && (
            <p className="professor-tl-empty-hint">
              You have class assignments in other terms. Use the term selector above to view them.
            </p>
          )}
        </div>
      ) : scheduledClasses.length === 0 ? (
        <div className="professor-tl-empty-state">
          <Clock size={32} className="professor-tl-empty-icon" />
          <h5>No class times assigned yet</h5>
          <p>
            You have {allClasses.length} assigned subject{allClasses.length === 1 ? '' : 's'} in {selectedTermLabel}, but their day and time schedules have not been finalized by the registrar yet.
          </p>
        </div>
      ) : (
        <div className="professor-tl-scroll">
          <div
            className="professor-tl-grid"
            style={{ gridTemplateColumns: `3.1rem repeat(7, 1fr)` }}
          >
            <div className="professor-tl-corner" style={{ gridColumn: 1, gridRow: 1 }}>Time</div>
            {days.map((day, index) => (
              <div
                key={day}
                className={`professor-tl-day${day === todayCode ? ' is-today' : ''}`}
                style={{ gridColumn: index + 2, gridRow: 1 }}
              >
                {DAY_LABELS[day]}
              </div>
            ))}

            {hours.map((hour, index) => (
              <Fragment key={hour}>
                <div
                  className="professor-tl-hourline"
                  style={{ gridColumn: '1 / -1', gridRow: 2 + index * 2 }}
                  aria-hidden="true"
                />
                <div className="professor-tl-hour" style={{ gridColumn: 1, gridRow: 2 + index * 2 }}>
                  {formatHourLabel(hour)}
                </div>
              </Fragment>
            ))}

            {dayColumns.flatMap(({ placed, lanes }, dayIndex) =>
              placed.map(({ entry, item, lane }) => {
                const startSlot = Math.floor((entry.start - bounds.startHour * 60) / 30)
                const endSlot = Math.ceil((entry.end - bounds.startHour * 60) / 30)
                const slotSpan = Math.max(1, endSlot - startSlot)
                const sizeClass = slotSpan === 1 ? ' is-tiny' : slotSpan <= 2 ? ' is-short' : ''
                const room = entry.room || item.room
                return (
                  <div
                    key={`${item.id}-${entry.day}-${entry.start}`}
                    className={
                      `professor-tl-block${sizeClass}${accentById[item.id] ? ` professor-tl-color-${accentById[item.id].replace('#', '')}` : ''}`
                    }
                    style={{
                      gridColumn: dayIndex + 2,
                      gridRow: `${2 + startSlot} / span ${slotSpan}`,
                      marginLeft: `calc(${(lane * 100) / lanes}% + 0.1rem)`,
                      width: `calc(${100 / lanes}% - 0.25rem)`,
                      ['--tl-accent' as string]: accentById[item.id] || TIMELINE_ACCENTS[0]
                    }}
                    title={`${item.code} — ${item.title}\n${item.section ? `Section: ${item.section}\n` : ''}${
                      item.semester ? `Term: ${item.semester} Sem · S.Y. ${item.schoolYear || ''}\n` : ''
                    }${formatClock(entry.start)} – ${formatClock(entry.end)}${
                      room ? `\nRoom: ${room}` : ''
                    }${item.enrolledStudents ? `\n${item.enrolledStudents} students enrolled` : ''}`}
                    onClick={() => onSelectClass?.(item, entry)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectClass?.(item, entry)
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                      <span className="professor-tl-block-code">{item.code}</span>
                      {item.semester && (
                        <span className="professor-tl-sem-tag" style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.85 }}>
                          {item.semester === '1st' ? '1st Sem' : item.semester === '2nd' ? '2nd Sem' : `${item.semester} Sem`}
                        </span>
                      )}
                    </div>
                    <span className="professor-tl-block-time">
                      {formatClock(entry.start)} – {formatClock(entry.end)}
                    </span>
                    {item.title && <span className="professor-tl-block-title">{item.title}</span>}
                    <span className="professor-tl-block-meta">
                      {[item.section, room].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {unscheduledClasses.length > 0 && (
        <div className="professor-tl-unscheduled">
          <strong>Pending class schedule assignment ({unscheduledClasses.length})</strong>
          <div className="professor-tl-unscheduled-list">
            {unscheduledClasses.map((item) => (
              <span key={item.id} className="professor-tl-unscheduled-item">
                {item.code}
                {item.title ? ` — ${item.title}` : ''}
                {item.section ? ` · ${item.section}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ScheduleCalendarProps {
  timelineClasses: TimelineClass[]
  onSelectEvent: (event: CalendarEvent) => void
  selectedTermLabel: string
  isCurrentTerm: boolean
}

function ScheduleCalendar({
  timelineClasses,
  onSelectEvent,
  selectedTermLabel,
  isCurrentTerm
}: ScheduleCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const holidays = useMemo(() => {
    return getPhilippineHolidays(month.getFullYear())
  }, [month])

  // Build events for each day of the active calendar grid
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}

    holidays.forEach((event) => {
      ;(map[event.date] ||= []).push(event)
    })

    const year = month.getFullYear()
    const m = month.getMonth()
    const offset = (new Date(year, m, 1).getDay() + 6) % 7 // Monday-first

    for (let index = 0; index < 42; index++) {
      const date = new Date(year, m, 1 - offset + index)
      const dateKey = toDateKey(date)
      const dayCode = TODAY_DAY_CODE[date.getDay()]
      if (!dayCode) continue

      timelineClasses.forEach((item) => {
        item.entries.forEach((entry) => {
          if (entry.day === dayCode) {
            const event: CalendarEvent = {
              id: `class-${item.id}-${dateKey}-${entry.start}`,
              title: `${item.code} (${item.section})`,
              date: dateKey,
              time: `${formatClock(entry.start)} – ${formatClock(entry.end)}`,
              category: 'academic',
              statusTag: item.section ? `Sec ${item.section}` : 'Class',
              statusTagClass: 'academic',
              description: `${item.title || item.code}${
                entry.room || item.room ? ` • Room ${entry.room || item.room}` : ''
              }${item.semester ? ` • ${item.semester} Sem` : ''}`,
              location: entry.room || item.room
            }
            ;(map[dateKey] ||= []).push(event)
          }
        })
      })
    }

    Object.keys(map).forEach((dateKey) => {
      map[dateKey].sort((a, b) => {
        if (a.category === 'holiday' && b.category !== 'holiday') return -1
        if (b.category === 'holiday' && a.category !== 'holiday') return 1
        return a.time.localeCompare(b.time)
      })
    })

    return map
  }, [month, holidays, timelineClasses])

  const cells = useMemo(() => {
    const year = month.getFullYear()
    const m = month.getMonth()
    const offset = (new Date(year, m, 1).getDay() + 6) % 7
    const todayKey = toDateKey(new Date())

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, m, 1 - offset + index)
      const key = toDateKey(date)
      return {
        key,
        day: date.getDate(),
        inMonth: date.getMonth() === m,
        isToday: key === todayKey,
        column: index % 7,
        row: Math.floor(index / 7),
        events: eventsByDate[key] || []
      }
    })
  }, [month, eventsByDate])

  const monthPrefix = `${month.getFullYear()}-${pad(month.getMonth() + 1)}-`
  const agendaEvents = useMemo(() => {
    if (selectedDate) {
      return eventsByDate[selectedDate] || []
    }
    const list: CalendarEvent[] = []
    Object.keys(eventsByDate)
      .filter((dateKey) => dateKey.startsWith(monthPrefix))
      .forEach((dateKey) => {
        list.push(...eventsByDate[dateKey])
      })
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  }, [selectedDate, eventsByDate, monthPrefix])

  const shiftMonth = (delta: number) => {
    setSelectedDate(null)
    setMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + delta, 1))
  }

  const goToday = () => {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(toDateKey(now))
  }

  return (
    <div className="professor-cal-layout">
      <div className="professor-cal">
        <div className="professor-cal-head">
          <div className="professor-cal-nav">
            <button
              type="button"
              className="professor-cal-nav-btn"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              ◀
            </button>
            <button
              type="button"
              className="professor-cal-nav-btn"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              ▶
            </button>
          </div>
          <strong className="professor-cal-title">
            {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </strong>
          <button type="button" className="professor-cal-today-btn" onClick={goToday}>
            Today
          </button>
        </div>

        <div className="professor-cal-weekdays">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="professor-cal-grid">
          {cells.map((cell) => {
            const active = selectedDate === cell.key
            const cellClass = [
              'professor-cal-cell',
              cell.inMonth ? '' : 'is-outside',
              cell.isToday ? 'is-today' : '',
              active ? 'is-active' : ''
            ]
              .filter(Boolean)
              .join(' ')
            const popClass = [
              'professor-cal-popover',
              cell.column >= 5 ? 'align-right' : cell.column >= 3 ? 'align-center' : '',
              cell.row >= 3 ? 'is-above' : ''
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={cell.key}
                className={cellClass}
                onClick={() => setSelectedDate((prev) => (prev === cell.key ? null : cell.key))}
              >
                <button type="button" className="professor-cal-date" aria-pressed={active}>
                  {cell.day}
                </button>

                <div className="professor-cal-chips">
                  {cell.events.slice(0, MAX_CHIPS).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`professor-cal-chip tag-${event.statusTagClass}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectEvent(event)
                      }}
                    >
                      <span className="professor-cal-chip-text">{event.title}</span>
                    </button>
                  ))}
                  {cell.events.length > MAX_CHIPS && (
                    <span className="professor-cal-more">+{cell.events.length - MAX_CHIPS} more</span>
                  )}
                </div>

                {cell.events.length > 0 && (
                  <div className={popClass} role="tooltip">
                    <div className="professor-cal-popover-title">{formatLongDate(cell.key)}</div>
                    {cell.events.slice(0, MAX_POPOVER_ITEMS).map((event) => (
                      <div key={event.id} className={`professor-cal-popover-item tag-${event.statusTagClass}`}>
                        <span className="professor-cal-popover-tag">{event.statusTag}</span>
                        <strong>{event.title}</strong>
                        <small>{event.time}{event.location ? ` • ${event.location}` : ''}</small>
                        {event.description && <p>{event.description}</p>}
                      </div>
                    ))}
                    {cell.events.length > MAX_POPOVER_ITEMS && (
                      <div className="professor-cal-popover-more">
                        +{cell.events.length - MAX_POPOVER_ITEMS} more events
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="professor-cal-legend" aria-hidden="true">
          <span className="tag-academic">Class / Academic</span>
          <span className="tag-exam">Exam</span>
          <span className="tag-holiday">Holiday</span>
          <span className="tag-meeting">Meeting</span>
          <span className="tag-deadline">Deadline</span>
          <span className="tag-general">General</span>
        </div>
      </div>

      <aside className="professor-cal-agenda">
        <div className="professor-cal-agenda-inner">
          <h4>
            {selectedDate
              ? formatLongDate(selectedDate)
              : month.toLocaleString(undefined, { month: 'long' }) + ' events'}
          </h4>
          {agendaEvents.length === 0 ? (
            <p className="professor-cal-agenda-empty">
              No classes or events {selectedDate ? 'on this day' : 'this month'} for {selectedTermLabel}.
            </p>
          ) : (
            <ul>
              {agendaEvents.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className={`professor-cal-agenda-item tag-${event.statusTagClass}`}
                    onClick={() => onSelectEvent(event)}
                  >
                    <span className="professor-cal-agenda-date">
                      {formatLongDate(event.date)} • {event.time}
                    </span>
                    <strong>{event.title}</strong>
                    <small>{event.statusTag}</small>
                    {event.description && <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{event.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

interface ScheduleManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  activeTerm?: AcademicTerm | null
}

function ScheduleManagement({ courses, loading, error, onRefresh, activeTerm: propActiveTerm }: ScheduleManagementProps) {
  // Default view is 'timeline' to immediately show the teaching schedule
  const [view, setView] = useState<'timeline' | 'month'>('timeline')
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(() => propActiveTerm || getCachedAcademicTerm())
  const [selectedTermKey, setSelectedTermKey] = useState<string>('active')
  const [selectedModalEvent, setSelectedModalEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    if (propActiveTerm) {
      setActiveTerm(propActiveTerm)
    }
  }, [propActiveTerm])

  // Fetch and subscribe to active academic term
  useEffect(() => {
    let cancelled = false
    getAcademicTerm()
      .then((term) => {
        if (!cancelled && term) {
          setActiveTerm(term)
        }
      })
      .catch(() => {})

    const unsubscribe = subscribeAcademicTerm((term) => {
      if (!cancelled && term) {
        setActiveTerm(term)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedModalEvent) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedModalEvent(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedModalEvent])

  const activeSemester = normalizeSemester(activeTerm?.semester || DEFAULT_ACADEMIC_SEMESTER)
  const activeSchoolYear = normalizeSchoolYear(activeTerm?.schoolYear || DEFAULT_SCHOOL_YEAR)
  const activeTermKey = `${activeSemester}|${activeSchoolYear}`
  const activeTermDisplay = `${activeSemester} Sem · S.Y. ${activeSchoolYear}`

  // Collect available terms from courses
  const availableTerms = useMemo(() => {
    const termMap = new Map<string, { key: string; semester: string; schoolYear: string; label: string }>()

    // Always include the current active term
    termMap.set(activeTermKey, {
      key: activeTermKey,
      semester: activeSemester,
      schoolYear: activeSchoolYear,
      label: `${activeSemester} Sem · S.Y. ${activeSchoolYear} (Active)`
    })

    ;(courses || []).forEach((course) => {
      ;(course.blocks || []).forEach((block) => {
        const sem = normalizeSemester(block.semester) || String(block.semester || '').trim()
        const sy = block.schoolYear ? normalizeSchoolYear(block.schoolYear) : ''
        if (!sem && !sy) return
        const key = `${sem}|${sy}`
        if (!termMap.has(key)) {
          termMap.set(key, {
            key,
            semester: sem,
            schoolYear: sy,
            label: `${sem || 'N/A'} Sem${sy ? ` · S.Y. ${sy}` : ''}`
          })
        }
      })
    })

    return Array.from(termMap.values())
  }, [courses, activeTermKey, activeSemester, activeSchoolYear])

  const otherTerms = useMemo(() => {
    return availableTerms.filter((term) => term.key !== activeTermKey)
  }, [availableTerms, activeTermKey])

  const isCurrentTermActive = selectedTermKey === 'active' || selectedTermKey === activeTermKey

  const selectedTermLabel = useMemo(() => {
    if (selectedTermKey === 'active') return `${activeSemester} Semester (S.Y. ${activeSchoolYear})`
    if (selectedTermKey === 'all') return 'All Semesters'
    const found = availableTerms.find((t) => t.key === selectedTermKey)
    return found ? `${found.semester} Semester · S.Y. ${found.schoolYear}` : selectedTermKey
  }, [selectedTermKey, activeSemester, activeSchoolYear, availableTerms])

  // Filter courses based on active/selected term
  const filteredCourses = useMemo(() => {
    if (!courses || courses.length === 0) return []
    if (selectedTermKey === 'all') return courses

    const targetSem = selectedTermKey === 'active'
      ? activeSemester
      : selectedTermKey.split('|')[0]
    const targetSY = selectedTermKey === 'active'
      ? activeSchoolYear
      : (selectedTermKey.split('|')[1] || '')

    return courses
      .map((course) => ({
        ...course,
        blocks: (course.blocks || []).filter((block) => {
          const bSem = normalizeSemester(block.semester)
          const bSY = block.schoolYear ? normalizeSchoolYear(block.schoolYear) : ''
          const semMatches = !targetSem || bSem === targetSem
          const syMatches = !targetSY || !bSY || bSY === targetSY
          return semMatches && syMatches
        })
      }))
      .filter((course) => course.blocks.length > 0)
  }, [courses, selectedTermKey, activeSemester, activeSchoolYear])

  const timelineClasses = useMemo(() => buildTimelineClasses(filteredCourses), [filteredCourses])

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedModalEvent(event)
  }

  const handleSelectTimelineClass = (item: TimelineClass, entry: TimelineEntry) => {
    const room = entry.room || item.room
    setSelectedModalEvent({
      id: `${item.id}-${entry.day}-${entry.start}`,
      title: `${item.code} — ${item.title || item.code}`,
      date: `Every ${DAY_LABELS[entry.day]}`,
      time: `${formatClock(entry.start)} – ${formatClock(entry.end)}`,
      category: 'academic',
      statusTag: item.section ? `Section ${item.section}` : 'Class',
      statusTagClass: 'academic',
      description: `${item.courseCode ? `Course: ${item.courseCode}` : ''}${
        item.semester ? ` • Term: ${item.semester} Sem · S.Y. ${item.schoolYear || ''}` : ''
      }${item.enrolledStudents ? ` • ${item.enrolledStudents} students enrolled` : ''}`,
      location: room || 'TBA'
    })
  }

  if (loading) {
    return <div className="professor-cal-loading">Loading schedule...</div>
  }

  if (error) {
    return (
      <div className="professor-cal-error">
        <p>Error loading schedule: {error}</p>
        <button type="button" onClick={onRefresh}>Retry</button>
      </div>
    )
  }

  return (
    <div className="professor-schedule-shell">
      <div className="professor-schedule-toolbar">
        <div className="professor-toolbar-left">
          <div className="professor-view-switch" role="group" aria-label="Schedule view">
            <button
              type="button"
              aria-pressed={view === 'timeline'}
              className={view === 'timeline' ? 'is-active' : ''}
              onClick={() => setView('timeline')}
            >
              <Clock size={14} /> Timeline
            </button>
            <button
              type="button"
              aria-pressed={view === 'month'}
              className={view === 'month' ? 'is-active' : ''}
              onClick={() => setView('month')}
            >
              <CalendarDays size={14} /> Month
            </button>
          </div>

          <div className="professor-term-filter-group">
            <label htmlFor="professor-term-select" className="professor-term-label">
              Term:
            </label>
            <div className="professor-term-select-wrapper">
              <select
                id="professor-term-select"
                className="professor-term-select"
                value={selectedTermKey}
                onChange={(e) => setSelectedTermKey(e.target.value)}
              >
                <option value="active">
                  Active: {activeTermDisplay}
                </option>
                {otherTerms.length > 0 && (
                  <optgroup label="Other Semesters">
                    {otherTerms.map((term) => (
                      <option key={term.key} value={term.key}>
                        {term.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="all">All Semesters</option>
              </select>
            </div>
          </div>
        </div>

        <p className="professor-schedule-hint">
          {view === 'timeline'
            ? `Weekly teaching schedule for ${selectedTermLabel}.`
            : `Monthly academic calendar view for ${selectedTermLabel}.`}
        </p>
      </div>

      {view === 'timeline' ? (
        <ScheduleTimeline
          courses={filteredCourses}
          selectedTermLabel={selectedTermLabel}
          isCurrentTerm={isCurrentTermActive}
          allCoursesCount={courses.length}
          onResetToActiveTerm={() => setSelectedTermKey('active')}
          onSelectClass={handleSelectTimelineClass}
        />
      ) : (
        <ScheduleCalendar
          timelineClasses={timelineClasses}
          onSelectEvent={handleSelectEvent}
          selectedTermLabel={selectedTermLabel}
          isCurrentTerm={isCurrentTermActive}
        />
      )}

      {selectedModalEvent && (
        <div
          className="professor-event-modal-backdrop"
          onClick={() => setSelectedModalEvent(null)}
        >
          <div
            className="professor-event-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="professor-event-modal-header">
              <div>
                <span
                  className={`professor-cal-chip tag-${selectedModalEvent.statusTagClass}`}
                  style={{ marginBottom: '0.4rem', display: 'inline-block' }}
                >
                  {selectedModalEvent.statusTag}
                </span>
                <h3>{selectedModalEvent.title}</h3>
              </div>
              <button
                type="button"
                className="professor-event-modal-close"
                onClick={() => setSelectedModalEvent(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="professor-event-modal-body">
              <div className="professor-event-modal-row">
                <CalendarDays size={16} />
                <span>{selectedModalEvent.date}</span>
              </div>
              <div className="professor-event-modal-row">
                <Clock size={16} />
                <span>{selectedModalEvent.time}</span>
              </div>
              {selectedModalEvent.location && (
                <div className="professor-event-modal-row">
                  <MapPin size={16} />
                  <span>Room: {selectedModalEvent.location}</span>
                </div>
              )}
              {selectedModalEvent.description && (
                <div className="professor-event-modal-desc">
                  {selectedModalEvent.description}
                </div>
              )}
            </div>

            <div className="professor-event-modal-footer">
              <button
                type="button"
                onClick={() => setSelectedModalEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleManagement

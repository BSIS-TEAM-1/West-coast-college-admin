import { Fragment, useMemo, useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import type { ProfessorAssignedCourse } from './professorTypes'
import { parseClockMinutesFlexible } from '../../lib/scheduleFormatter'
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

interface ScheduleCalendarProps {
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
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

interface TimelineClass {
  id: string
  code: string
  title: string
  section: string
  courseCode: string
  room: string
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

// Handles both formats the registrar workspace writes:
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

const buildTimelineClasses = (courses: ProfessorAssignedCourse[]): TimelineClass[] =>
  (courses || []).flatMap((course) =>
    (course.blocks || []).flatMap((block) =>
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
          entries
        }
      })
    )
  )

const formatClock = (minutes: number) => {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours > 12 ? hours - 12 : hours === 0 ? 12 : hours}:${pad(mins)} ${hours >= 12 ? 'PM' : 'AM'}`
}

const formatHourLabel = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' })

function ScheduleTimeline({ courses }: { courses: ProfessorAssignedCourse[] }) {
  const allClasses = useMemo(() => buildTimelineClasses(courses), [courses])
  const scheduledClasses = useMemo(() => allClasses.filter((item) => item.entries.length > 0), [allClasses])
  const unscheduledClasses = useMemo(() => allClasses.filter((item) => item.entries.length === 0), [allClasses])

  const accentById = useMemo(() => {
    const map: Record<string, string> = {}
    allClasses.forEach((item, index) => {
      map[item.id] = TIMELINE_ACCENTS[index % TIMELINE_ACCENTS.length]
    })
    return map
  }, [allClasses])

  const days = useMemo(() => TIMELINE_DAYS, [scheduledClasses])

  const bounds = useMemo(() => {
    // Always start at 6 AM, end time adjusts based on latest class
    let startHour = 6
    let endHour = 20
    if (scheduledClasses.length > 0) {
      const ends = scheduledClasses.flatMap((item) => item.entries.map((entry) => entry.end))
      if (ends.length > 0) {
        endHour = Math.max(24, Math.max(...ends) / 60 | 0 + 1)
      }
      // Ensure end time doesn't exceed midnight
      if (endHour > 24) endHour = 24
    }
    return { startHour, endHour }
  }, [scheduledClasses])

  // Each day column gets lane numbers so overlapping classes sit side by side.
  // All 7 days are always present in the grid; days without classes have empty lanes.
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
          <h4>Weekly class timeline</h4>
          <p>
            {scheduledClasses.length} subject{scheduledClasses.length === 1 ? '' : 's'}
            {weeklyHours > 0 ? ` · ${weeklyHours} class hour${weeklyHours === 1 ? '' : 's'} per week` : ''}
          </p>
        </div>
        <span className="professor-tl-today-pill">
          <Clock size={13} /> Today is {DAY_LABELS[todayCode]}
        </span>
      </div>

      {scheduledClasses.length === 0 ? (
        <p className="professor-tl-empty">
          No class schedules assigned yet. Subjects appear here once the registrar sets their day and time.
        </p>
      ) : (
        <div className="professor-tl-scroll"><div
            className="professor-tl-grid"
            style={{ gridTemplateColumns: `3.1rem repeat(7, 1fr)` }}>
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
                <div className="professor-tl-hour" style={{ gridColumn: 1, gridRow: 2 + index * 2 + 1 }}>
                  {formatHourLabel(hour)}
                </div>
              </Fragment>
            ))}

            {dayColumns.flatMap(({ placed, lanes }, dayIndex) =>
              placed.map(({ entry, item, lane }) => {
                const startSlot = Math.floor((entry.start - bounds.startHour * 60) / 30)
                const endSlot = Math.ceil((entry.end - bounds.startHour * 60) / 30)
                const room = entry.room || item.room
                return (
                  <div
                    key={`${item.id}-${entry.day}-${entry.start}`}
                    className={
                      `professor-tl-block${accentById[item.id] && ` professor-tl-color-${accentById[item.id].replace('#', '')}`}`
                    }
                    style={{
                      gridColumn: dayIndex + 2,
                      gridRow: `${2 + startSlot} / span ${Math.max(1, endSlot - startSlot)}`,
                      marginLeft: `calc(${(lane * 100) / lanes}% + 0.1rem)`,
                      width: `calc(${100 / lanes}% - 0.25rem)`,
                      ['--tl-accent' as string]: accentById[item.id] || TIMELINE_ACCENTS[0]
                    }}
                    title={`${item.code} — ${item.title}\n${formatClock(entry.start)} – ${formatClock(entry.end)}${
                      room ? `\n${room}` : ''
                    }`}
                  >
                    <span className="professor-tl-block-code professor-tl-block-code">{item.code}</span>
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
          <strong>No time set yet</strong>
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

function ScheduleCalendar({ events, onSelectEvent }: ScheduleCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach((event) => {
      ;(map[event.date] ||= []).push(event)
    })
    return map
  }, [events])

  // Always 42 cells (6 weeks) so the calendar height is identical every month.
  const cells = useMemo(() => {
    const year = month.getFullYear()
    const m = month.getMonth()
    const offset = (new Date(year, m, 1).getDay() + 6) % 7 // Monday-first
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
    const list = selectedDate
      ? eventsByDate[selectedDate] || []
      : events.filter((e) => e.date.startsWith(monthPrefix))
    return [...list].sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedDate, events, eventsByDate, monthPrefix])

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
            <button type="button" className="professor-cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">◀</button>
            <button type="button" className="professor-cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">▶</button>
          </div>
          <strong className="professor-cal-title">
            {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </strong>
          <button type="button" className="professor-cal-today-btn" onClick={goToday}>Today</button>
        </div>

        <div className="professor-cal-weekdays">
          {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
        </div>

        <div className="professor-cal-grid">
          {cells.map((cell) => {
            const active = selectedDate === cell.key
            const cellClass = [
              'professor-cal-cell',
              cell.inMonth ? '' : 'is-outside',
              cell.isToday ? 'is-today' : '',
              active ? 'is-active' : ''
            ].filter(Boolean).join(' ')
            const popClass = [
              'professor-cal-popover',
              cell.column >= 5 ? 'align-right' : cell.column >= 3 ? 'align-center' : '',
              cell.row >= 3 ? 'is-above' : ''
            ].filter(Boolean).join(' ')

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
          <span className="tag-academic">Academic</span>
          <span className="tag-exam">Exam</span>
          <span className="tag-holiday">Holiday</span>
          <span className="tag-meeting">Meeting</span>
          <span className="tag-deadline">Deadline</span>
          <span className="tag-general">General</span>
        </div>
      </div>

      <aside className="professor-cal-agenda">
        <div className="professor-cal-agenda-inner">
          <h4>{selectedDate ? formatLongDate(selectedDate) : month.toLocaleString(undefined, { month: 'long' }) + ' events'}</h4>
          {agendaEvents.length === 0 ? (
            <p className="professor-cal-agenda-empty">No events {selectedDate ? 'on this day' : 'this month'}.</p>
          ) : (
            <ul>
              {agendaEvents.map((event) => (
                <li key={event.id}>
                  <button type="button" className={`professor-cal-agenda-item tag-${event.statusTagClass}`} onClick={() => onSelectEvent(event)}>
                    <span className="professor-cal-agenda-date">{formatLongDate(event.date)} • {event.time}</span>
                    <strong>{event.title}</strong>
                    <small>{event.statusTag}</small>
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
  courses: any[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function ScheduleManagement({ courses, loading, error, onRefresh }: ScheduleManagementProps) {
  const [view, setView] = useState<'month' | 'timeline'>('month')

  // Get last Monday of August for National Heroes Day
  const getNationalHeroesDay = (year: number): string => {
    const lastDayOfAugust = new Date(year, 7, 31) // August 31 (month is 0-indexed)
    const dayOfWeek = lastDayOfAugust.getDay() // 0 = Sunday, 1 = Monday, etc.
    const daysToSubtract = (dayOfWeek + 6) % 7 // Get to previous Monday
    const heroesDay = new Date(year, 7, 31 - daysToSubtract)
    return toDateKey(heroesDay)
  }

  // Generate Philippine holidays for the current year
  const getPhilippineHolidays = (year: number): CalendarEvent[] => {
    const nationalHeroesDay = getNationalHeroesDay(year)
    
    const holidays: CalendarEvent[] = [
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
        title: "Araw ng Kagitingan",
        date: `${year}-04-09`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-labor-day-${year}`,
        title: "Labor Day",
        date: `${year}-05-01`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-independence-day-${year}`,
        title: "Independence Day",
        date: `${year}-06-12`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-national-heroes-${year}`,
        title: "National Heroes Day",
        date: nationalHeroesDay,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-bonifacio-day-${year}`,
        title: "Bonifacio Day",
        date: `${year}-11-30`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-christmas-${year}`,
        title: "Christmas Day",
        date: `${year}-12-25`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      },
      {
        id: `holiday-rizal-day-${year}`,
        title: "Rizal Day",
        date: `${year}-12-30`,
        time: 'All Day',
        category: 'holiday',
        statusTag: 'Holiday',
        statusTagClass: 'holiday',
        description: 'Regular Holiday'
      }
    ]
    return holidays
  }

  // Convert courses to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const holidays = getPhilippineHolidays(currentYear)
    
    const courseEvents = courses.flatMap((course) => {
      // Extract schedule from course data
      const schedule = course.schedule || course.schedules || []
      return schedule.map((sched: any, idx: number) => ({
        id: `${course.id}-${idx}`,
        title: course.name || course.courseName || 'Course',
        date: sched.date || sched.day || '',
        time: sched.time || sched.startTime || '',
        category: course.category || 'academic',
        statusTag: course.status || 'Scheduled',
        statusTagClass: 'academic',
        description: course.description || '',
        location: sched.location || course.location || ''
      }))
    })
    
    // End of school year 2027
    const endOfSchool2027: CalendarEvent = {
      id: 'end-of-school-2027',
      title: 'End of School Year',
      date: '2027-04-08',
      time: 'All Day',
      category: 'deadline',
      statusTag: 'Deadline',
      statusTagClass: 'deadline',
      description: 'Last day of classes for SY 2026-2027'
    }
    
    const today = toDateKey(new Date())
    
    // Combine holidays and course events, filter out expired
    // Include the end-of-school event for 2027 even though it's in the future
    const allEvents = [...holidays, ...courseEvents, endOfSchool2027]
    return allEvents.filter((event) => event.date >= today || event.date === '2027-04-08')
  }, [courses])

  const handleSelectEvent = (event: CalendarEvent) => {
    // TODO: Show event details modal or navigate to event details
    console.log('Selected event:', event)
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
        <div className="professor-view-switch" role="group" aria-label="Schedule view">
          <button
            type="button"
            aria-pressed={view === 'month'}
            className={view === 'month' ? 'is-active' : ''}
            onClick={() => setView('month')}
          >
            <CalendarDays size={14} /> Month
          </button>
          <button
            type="button"
            aria-pressed={view === 'timeline'}
            className={view === 'timeline' ? 'is-active' : ''}
            onClick={() => setView('timeline')}
          >
            <Clock size={14} /> Timeline
          </button>
        </div>
        <p className="professor-schedule-hint">
          {view === 'month'
            ? 'Dates, deadlines and Philippine holidays.'
            : 'Your weekly teaching schedule by day and time.'}
        </p>
      </div>

      {view === 'month'
        ? <ScheduleCalendar events={events} onSelectEvent={handleSelectEvent} />
        : <ScheduleTimeline courses={courses} />}
    </div>
  )
}

export default ScheduleManagement
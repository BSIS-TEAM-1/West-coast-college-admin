import { useMemo, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Edit3, Plus, Save, Trash2, X } from 'lucide-react'
import './CalendarPage.css'

type EventType = 'academic' | 'meeting' | 'holiday' | 'deadline' | 'other'

interface CalendarEvent {
  id: string
  title: string
  date: string
  time: string
  type: EventType
  location: string
  description: string
}

interface CalendarPageProps {
  onBack: () => void
}

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'academic', label: 'Academic' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'other', label: 'Other' }
]

const seedEvents: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Faculty Meeting',
    date: '2026-02-15',
    time: '14:00',
    type: 'meeting',
    location: 'Conference Room A',
    description: 'Monthly faculty coordination meeting'
  },
  {
    id: 'evt-2',
    title: 'Midterm Exams Start',
    date: '2026-02-18',
    time: '08:00',
    type: 'academic',
    location: 'Main Campus',
    description: 'Midterm examination period begins.'
  },
  {
    id: 'evt-3',
    title: 'President\'s Day',
    date: '2026-02-17',
    time: '09:00',
    type: 'holiday',
    location: 'College closed',
    description: 'College holiday'
  },
  {
    id: 'evt-4',
    title: 'Project Submission Deadline',
    date: '2026-02-20',
    time: '23:59',
    type: 'deadline',
    location: 'Student Portal',
    description: 'Final project submissions due'
  }
]

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseEventDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const getEventTypeColor = (type: EventType) => {
  switch (type) {
    case 'academic':
      return 'var(--calendar-primary)'
    case 'meeting':
      return 'var(--color-success)'
    case 'holiday':
      return 'var(--color-warning)'
    case 'deadline':
      return 'var(--color-error)'
    default:
      return 'var(--calendar-text-muted)'
  }
}

const formatDisplayTime = (time: string) => {
  const value = time || '00:00'
  const normalized = value.includes(':') ? `${value}:00` : value
  const parsed = new Date(`2000-01-01T${normalized}`)
  if (Number.isNaN(parsed.getTime())) {
    return time
  }
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function CalendarPage({ onBack }: CalendarPageProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(seedEvents)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    date: toDateInputValue(new Date()),
    time: '09:00',
    type: 'academic' as EventType,
    location: '',
    description: ''
  })

  const selectedDateString = toDateInputValue(selectedDate)
  const selectedDateLabel = parseEventDate(selectedDateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay()

  const getEventsForDate = (date: Date) => {
    const dateKey = toDateInputValue(date)
    return events.filter((event) => event.date === dateKey)
  }

  const getDaysForMonth = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDay = getFirstDayOfMonth(currentDate)
    const dayCells: ReactElement[] = []

    for (let i = 0; i < firstDay; i += 1) {
      dayCells.push(<div key={`empty-${i}`} className="calendar-page-day empty" />)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      const dateKey = toDateInputValue(date)
      const isToday = dateKey === toDateInputValue(new Date())
      const isSelected = dateKey === selectedDateString
      const dayEvents = getEventsForDate(date)
      const activeEventType = dayEvents[0]?.type

      dayCells.push(
        <button
          key={day}
          type="button"
          className={`calendar-page-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => {
            setSelectedDate(date)
            setFormData((prev) => ({ ...prev, date: dateKey }))
          }}
        >
          <div className="calendar-page-day-number">{day}</div>
          {dayEvents.length > 0 && (
            <div className="calendar-page-indicators">
              {dayEvents.map((event) => (
                <span
                  key={event.id}
                  className="calendar-page-indicator"
                  style={{ backgroundColor: getEventTypeColor(event.type) }}
                />
              ))}
            </div>
          )}
          {activeEventType && dayEvents.length > 3 && (
            <span
              className="calendar-page-more-indicator"
              style={{ backgroundColor: getEventTypeColor(activeEventType) }}
            />
          )}
        </button>
      )
    }

    return dayCells
  }

  const selectedEvents = getEventsForDate(selectedDate)
  const orderedEvents = useMemo(() => {
    const today = toDateInputValue(new Date())
    return [...events]
      .filter((event) => event.date >= today)
      .sort((a, b) => {
        const dateDiff = parseEventDate(a.date).getTime() - parseEventDate(b.date).getTime()
        if (dateDiff !== 0) {
          return dateDiff
        }
        return a.time.localeCompare(b.time)
      })
  }, [events])

  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((previous) => {
      const copy = new Date(previous)
      if (direction === 'prev') {
        copy.setMonth(copy.getMonth() - 1)
      } else {
        copy.setMonth(copy.getMonth() + 1)
      }
      return copy
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData({
      title: '',
      date: selectedDateString,
      time: '09:00',
      type: 'academic',
      location: '',
      description: ''
    })
    setFormError('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formData.title.trim()) {
      setFormError('Event title is required')
      return
    }
    if (!formData.date) {
      setFormError('Date is required')
      return
    }

    if (editingId) {
      setEvents((previous) =>
        previous.map((existingEvent) =>
          existingEvent.id === editingId
            ? {
                ...existingEvent,
                ...formData
              }
            : existingEvent
        )
      )
      setEditingId(null)
    } else {
      setEvents((previous) => [
        ...previous,
        {
          id: `${Date.now()}`,
          ...formData
        }
      ])
    }

    resetForm()
  }

  const handleEdit = (event: CalendarEvent) => {
    setEditingId(event.id)
    setFormData({
      title: event.title,
      date: event.date,
      time: event.time,
      type: event.type,
      location: event.location,
      description: event.description
    })
    setSelectedDate(parseEventDate(event.date))
    setFormError('')
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this event?')) {
      return
    }

    setEvents((previous) => previous.filter((event) => event.id !== id))
    if (editingId === id) {
      resetForm()
    }
  }

  return (
    <section className="calendar-page">
      <div className="calendar-page-header">
        <div>
          <h1 className="calendar-page-title">Calendar</h1>
          <p className="calendar-page-subtitle">Create and manage activities for admin schedules.</p>
        </div>
        <button type="button" className="calendar-page-back-btn" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>
      </div>

      <div className="calendar-page-grid">
        <article className="calendar-page-card calendar-page-calendar">
          <div className="calendar-page-card-header">
            <div className="calendar-page-month-nav">
              <button type="button" className="calendar-page-nav-btn" onClick={() => changeMonth('prev')} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <h2>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <button type="button" className="calendar-page-nav-btn" onClick={() => changeMonth('next')} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="calendar-page-legend">
              {EVENT_TYPES.map((eventType) => (
                <div key={eventType.value} className="calendar-page-legend-item">
                  <span className="calendar-page-legend-dot" style={{ backgroundColor: getEventTypeColor(eventType.value) }} />
                  <span>{eventType.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="calendar-page-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="calendar-page-weekday">{day}</div>
            ))}
          </div>
          <div className="calendar-page-days">{getDaysForMonth()}</div>
        </article>

        <article className="calendar-page-card calendar-page-activity-editor">
          <div className="calendar-page-card-header">
            <h2>Activity editor</h2>
            <span className="calendar-page-selected-date">{selectedDateLabel}</span>
          </div>
          <form onSubmit={handleSubmit} className="calendar-page-form">
            {formError && <div className="calendar-page-form-error">{formError}</div>}

            <label className="calendar-page-field">
              <span>Title</span>
              <input
                value={formData.title}
                onChange={(event) => setFormData((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="Event title"
                required
              />
            </label>

            <div className="calendar-page-field-row">
              <label className="calendar-page-field">
                <span>Date</span>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(event) => setFormData((previous) => ({ ...previous, date: event.target.value }))}
                  required
                />
              </label>
              <label className="calendar-page-field">
                <span>Time</span>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(event) => setFormData((previous) => ({ ...previous, time: event.target.value }))}
                  required
                />
              </label>
            </div>

            <label className="calendar-page-field">
              <span>Type</span>
              <select
                value={formData.type}
                onChange={(event) => setFormData((previous) => ({ ...previous, type: event.target.value as EventType }))}
              >
                {EVENT_TYPES.map((eventType) => (
                  <option key={eventType.value} value={eventType.value}>
                    {eventType.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="calendar-page-field">
              <span>Location</span>
              <input
                value={formData.location}
                onChange={(event) => setFormData((previous) => ({ ...previous, location: event.target.value }))}
                placeholder="Optional"
              />
            </label>

            <label className="calendar-page-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="Optional notes"
              />
            </label>

            <div className="calendar-page-actions">
              {editingId ? (
                <>
                  <button type="button" className="calendar-page-btn secondary" onClick={resetForm}>
                    <X size={14} />
                    Cancel
                  </button>
                  <button type="submit" className="calendar-page-btn primary">
                    <Save size={14} />
                    Update event
                  </button>
                </>
              ) : (
                <button type="submit" className="calendar-page-btn primary">
                  <Plus size={14} />
                  Add event
                </button>
              )}
            </div>
          </form>
        </article>
      </div>

      <article className="calendar-page-card calendar-page-daily-list">
        <div className="calendar-page-card-header">
          <h2>
            <CalendarDays size={18} />
            Events on {selectedDateLabel}
          </h2>
        </div>

        {selectedEvents.length === 0 ? (
          <p className="calendar-page-empty">No events for this date.</p>
        ) : (
          <div className="calendar-page-events">
            {selectedEvents
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((event) => (
                <div key={event.id} className="calendar-page-event-item">
                  <div className="calendar-page-event-type" style={{ backgroundColor: getEventTypeColor(event.type) }} />
                  <div className="calendar-page-event-content">
                    <h3>{event.title}</h3>
                    <p className="calendar-page-event-meta">
                      <Clock size={14} />
                      <span>{formatDisplayTime(event.time)}</span>
                      {event.location && (
                        <>
                          <span>•</span>
                          <span>{event.location}</span>
                        </>
                      )}
                    </p>
                    {event.description && <p>{event.description}</p>}
                  </div>
                  <div className="calendar-page-event-actions">
                    <button type="button" className="calendar-page-icon-btn" onClick={() => handleEdit(event)} aria-label={`Edit ${event.title}`}>
                      <Edit3 size={14} />
                    </button>
                    <button type="button" className="calendar-page-icon-btn" onClick={() => handleDelete(event.id)} aria-label={`Delete ${event.title}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </article>

      <article className="calendar-page-card calendar-page-upcoming">
        <div className="calendar-page-card-header">
          <h2>Upcoming activities</h2>
        </div>
        {orderedEvents.length === 0 ? (
          <p className="calendar-page-empty">No upcoming activities.</p>
        ) : (
          <div className="calendar-page-events">
            {orderedEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="calendar-page-event-item">
                <div className="calendar-page-event-type" style={{ backgroundColor: getEventTypeColor(event.type) }} />
                <div className="calendar-page-event-content">
                  <h3>{event.title}</h3>
                  <p className="calendar-page-event-meta">
                    <span>{parseEventDate(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span>•</span>
                    <span>{formatDisplayTime(event.time)}</span>
                  </p>
                  {event.location && <p>{event.location}</p>}
                </div>
                <button type="button" className="calendar-page-icon-btn" onClick={() => handleEdit(event)}>
                  <Edit3 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}







import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import './EventCalendar.css'

interface Event {
  id: string
  title: string
  date: string
  time: string
  location?: string
  type: 'academic' | 'meeting' | 'holiday' | 'deadline' | 'other'
  description?: string
}

const EventCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Sample events data - in production this would come from API
  const events: Event[] = [
    {
      id: '1',
      title: 'Faculty Meeting',
      date: '2026-02-15',
      time: '2:00 PM',
      location: 'Conference Room A',
      type: 'meeting',
      description: 'Monthly faculty coordination meeting'
    },
    {
      id: '2',
      title: 'Midterm Exams Start',
      date: '2026-02-18',
      time: '8:00 AM',
      location: 'Various',
      type: 'academic',
      description: 'Midterm examination period begins'
    },
    {
      id: '3',
      title: 'President\'s Day Holiday',
      date: '2026-02-17',
      time: 'All Day',
      type: 'holiday',
      description: 'College closed for President\'s Day'
    },
    {
      id: '4',
      title: 'Project Submission Deadline',
      date: '2026-02-20',
      time: '11:59 PM',
      type: 'deadline',
      description: 'Final project submissions due'
    },
    {
      id: '5',
      title: 'Student Council Meeting',
      date: '2026-02-22',
      time: '3:30 PM',
      location: 'Student Union',
      type: 'meeting',
      description: 'Weekly student council meeting'
    }
  ]

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  const getEventsForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return events.filter(event => event.date === dateStr)
  }

  const getEventTypeColor = (type: Event['type']) => {
    switch (type) {
      case 'academic': return '#3b82f6'
      case 'meeting': return '#10b981'
      case 'holiday': return '#f59e0b'
      case 'deadline': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDay = getFirstDayOfMonth(currentDate)
    const days = []

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>)
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      const dayEvents = getEventsForDate(date)
      const isToday = formatDate(date) === formatDate(new Date())
      const isSelected = selectedDate && formatDate(date) === formatDate(selectedDate)

      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => setSelectedDate(date)}
        >
          <div className="day-number">{day}</div>
          {dayEvents.length > 0 && (
            <div className="event-indicators">
              {dayEvents.slice(0, 3).map((event, index) => (
                <div
                  key={index}
                  className="event-dot"
                  style={{ backgroundColor: getEventTypeColor(event.type) }}
                />
              ))}
            </div>
          )}
        </div>
      )
    }

    return days
  }

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : []

  return (
    <div className="event-calendar">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button onClick={() => navigateMonth('prev')} className="nav-button">
            <ChevronLeft size={16} />
          </button>
          <h3 className="calendar-title">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={() => navigateMonth('next')} className="nav-button">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendar-legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#3b82f6' }} />
            <span>Academic</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#10b981' }} />
            <span>Meeting</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#f59e0b' }} />
            <span>Holiday</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#ef4444' }} />
            <span>Deadline</span>
          </div>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>
        <div className="days-grid">
          {renderCalendarDays()}
        </div>
      </div>

      {selectedDateEvents.length > 0 && (
        <div className="selected-date-events">
          <h4 className="events-title">
            {selectedDate?.toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric',
              year: 'numeric'
            })}
          </h4>
          <div className="events-list">
            {selectedDateEvents.map(event => (
              <div key={event.id} className="event-item">
                <div className="event-header">
                  <div className="event-type-indicator" style={{ backgroundColor: getEventTypeColor(event.type) }} />
                  <h5 className="event-title">{event.title}</h5>
                </div>
                <div className="event-details">
                  <div className="event-detail">
                    <Clock size={14} />
                    <span>{event.time}</span>
                  </div>
                  {event.location && (
                    <div className="event-detail">
                      <MapPin size={14} />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>
                {event.description && (
                  <p className="event-description">{event.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="upcoming-events">
        <h4 className="upcoming-title">Upcoming Events</h4>
        <div className="upcoming-list">
          {events
            .filter(event => new Date(event.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 3)
            .map(event => (
              <div key={event.id} className="upcoming-event">
                <div className="upcoming-date">
                  <div className="date-day">
                    {new Date(event.date).getDate()}
                  </div>
                  <div className="date-month">
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </div>
                <div className="upcoming-info">
                  <div className="upcoming-title">{event.title}</div>
                  <div className="upcoming-time">{event.time}</div>
                </div>
                <div className="upcoming-type" style={{ backgroundColor: getEventTypeColor(event.type) }} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export default EventCalendar

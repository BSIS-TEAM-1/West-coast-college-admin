import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import './MiniEventCalendar.css'

interface Event {
  id: string
  title: string
  date: string
  time: string
  type: 'academic' | 'meeting' | 'holiday' | 'deadline' | 'other'
}

const MiniEventCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())

  // Sample events data - in production this would come from API
  const events: Event[] = [
    {
      id: '1',
      title: 'Faculty Meeting',
      date: '2026-02-15',
      time: '2:00 PM',
      type: 'meeting'
    },
    {
      id: '2',
      title: 'Midterm Exams Start',
      date: '2026-02-18',
      time: '8:00 AM',
      type: 'academic'
    },
    {
      id: '3',
      title: 'President\'s Day',
      date: '2026-02-17',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: '4',
      title: 'Project Deadline',
      date: '2026-02-20',
      time: '11:59 PM',
      type: 'deadline'
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
      days.push(<div key={`empty-${i}`} className="mini-calendar-day empty"></div>)
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      const dayEvents = getEventsForDate(date)
      const isToday = formatDate(date) === formatDate(new Date())

      days.push(
        <div
          key={day}
          className={`mini-calendar-day ${isToday ? 'today' : ''}`}
        >
          <div className="mini-day-number">{day}</div>
          {dayEvents.length > 0 && (
            <div className="mini-event-indicator" style={{ backgroundColor: getEventTypeColor(dayEvents[0].type) }} />
          )}
        </div>
      )
    }

    return days
  }

  const upcomingEvents = events
    .filter(event => new Date(event.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 1)

  return (
    <div className="mini-event-calendar">
      <div className="mini-calendar-header">
        <div className="mini-calendar-nav">
          <button onClick={() => navigateMonth('prev')} className="mini-nav-button">
            <ChevronLeft size={14} />
          </button>
          <h4 className="mini-calendar-title">
            {currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </h4>
          <button onClick={() => navigateMonth('next')} className="mini-nav-button">
            <ChevronRight size={14} />
          </button>
        </div>
        <Calendar size={16} className="mini-calendar-icon" />
      </div>

      <div className="mini-calendar-grid">
        <div className="mini-weekdays">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
            <div key={day} className="mini-weekday">{day}</div>
          ))}
        </div>
        <div className="mini-days-grid">
          {renderCalendarDays()}
        </div>
      </div>

      <div className="mini-upcoming-events">
        <div className="mini-events-header">
          <span className="mini-events-title">Upcoming</span>
          <span className="mini-events-count">{upcomingEvents.length}</span>
        </div>
        <div className="mini-events-list">
          {upcomingEvents.map(event => (
            <div key={event.id} className="mini-event-item">
              <div className="mini-event-type" style={{ backgroundColor: getEventTypeColor(event.type) }} />
              <div className="mini-event-info">
                <div className="mini-event-title">{event.title}</div>
                <div className="mini-event-date">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MiniEventCalendar

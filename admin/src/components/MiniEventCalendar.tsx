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

interface MiniEventCalendarProps {
  onOpenCalendar?: () => void
}

const MiniEventCalendar = ({ onOpenCalendar }: MiniEventCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date())

  // Sample events data - in production this would come from API
  const events: Event[] = [
    // Philippine National Holidays 2026
    {
      id: 'holiday-1',
      title: 'New Year\'s Day',
      date: '2026-01-01',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-2',
      title: 'Maundy Thursday',
      date: '2026-03-26',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-3',
      title: 'Good Friday',
      date: '2026-03-27',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-4',
      title: 'Araw ng Kagitingan',
      date: '2026-04-09',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-5',
      title: 'Labor Day',
      date: '2026-05-01',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-6',
      title: 'Independence Day',
      date: '2026-06-12',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-7',
      title: 'National Heroes Day',
      date: '2026-08-31',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-8',
      title: 'Bonifacio Day',
      date: '2026-11-30',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-9',
      title: 'Christmas Day',
      date: '2026-12-25',
      time: 'All Day',
      type: 'holiday'
    },
    {
      id: 'holiday-10',
      title: 'Rizal Day',
      date: '2026-12-30',
      time: 'All Day',
      type: 'holiday'
    },
    // Academic events
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
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getEventsForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return events.filter(event => event.date === dateStr)
  }

  const getEventTypeColor = (type: Event['type']) => {
    switch (type) {
      case 'academic': return 'var(--color-primary)'
      case 'meeting': return 'var(--color-success)'
      case 'holiday': return 'var(--color-warning)'
      case 'deadline': return 'var(--color-error)'
      default: return 'var(--color-text-muted)'
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
          title={dayEvents.length > 0 ? dayEvents.map(e => `${e.title} (${e.time})`).join('\n') : ''}
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
        <button
          type="button"
          className="mini-calendar-open-btn"
          onClick={onOpenCalendar}
          aria-label="Open full calendar"
          title="Open full calendar"
        >
          <Calendar size={16} className="mini-calendar-icon" />
        </button>
      </div>

      <div className="mini-calendar-grid">
        <div className="mini-weekdays">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <div key={`${day}-${index}`} className="mini-weekday">{day}</div>
          ))}
        </div>
        <div className="mini-days-grid">
          {renderCalendarDays()}
        </div>
      </div>
    </div>
  )
}

export default MiniEventCalendar

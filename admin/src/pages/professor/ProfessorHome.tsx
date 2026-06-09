import type React from 'react'
import { AlertCircle, AlertTriangle, Award, Bell, BookOpen, Calendar, Clock, GraduationCap, Info, Pin, Video, Wrench } from 'lucide-react'
import type { Announcement } from './professorTypes'
import { isVisibleProfessorAnnouncement } from './professorUtils'

interface ProfessorHomeProps {
  announcements: Announcement[]
  announcementsLoading: boolean
  onAnnouncementClick: (announcement: Announcement) => void
  quickActionsRef: React.RefObject<HTMLDivElement | null>
  newsSectionRef: React.RefObject<HTMLDivElement | null>
}

function ProfessorHome({ announcements, announcementsLoading, onAnnouncementClick, quickActionsRef, newsSectionRef }: ProfessorHomeProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={12} />
      case 'warning': return <AlertCircle size={12} />
      case 'maintenance': return <Wrench size={12} />
      default: return <Info size={12} />
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const sortedAnnouncements = [...announcements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const activeAnnouncements = sortedAnnouncements.filter(isVisibleProfessorAnnouncement).slice(0, 3)

  return (
    <div className="professor-home">
      <h2 className="professor-welcome-title">Welcome to the Professor Portal</h2>
      <p className="professor-welcome-desc">Manage your courses, students, and academic activities from your dashboard.</p>
      
      <div className="professor-dashboard-content" ref={quickActionsRef}>
        <div className="professor-quick-actions">
          <div className="quick-action-card">
            <BookOpen size={32} className="quick-action-icon" />
            <h3>My Courses</h3>
            <p>Manage course materials and assignments</p>
          </div>
          <div className="quick-action-card">
            <GraduationCap size={32} className="quick-action-icon" />
            <h3>Students</h3>
            <p>View student lists and academic progress</p>
          </div>
          <div className="quick-action-card">
            <Award size={32} className="quick-action-icon" />
            <h3>Grades</h3>
            <p>Submit grades and manage assessments</p>
          </div>
          <div className="quick-action-card">
            <Calendar size={32} className="quick-action-icon" />
            <h3>Schedule</h3>
            <p>View class schedules and office hours</p>
          </div>
        </div>

        <div className="professor-news-section" ref={newsSectionRef}>
          <div className="news-header">
            <Bell size={20} className="news-icon" />
            <h3>Latest Announcements</h3>
          </div>
          
          {announcementsLoading && activeAnnouncements.length === 0 ? (
            <div className="professor-news-loading" role="status" aria-live="polite">
              <div className="professor-news-loading-spinner" />
              <p>Loading announcements and reconnecting if needed...</p>
            </div>
          ) : activeAnnouncements.length > 0 ? (
            <div className="dashboard-announcements-container">
              {activeAnnouncements.map((announcement) => {
                const media = announcement.media?.[0]
                const hasMedia = Boolean(media)
                return (
                <div 
                  key={announcement._id} 
                  className={`dashboard-announcement-card clickable ${hasMedia ? 'has-media' : 'no-media'}`}
                  onClick={() => onAnnouncementClick(announcement)}
                >
                  {/* Media Section */}
                  {hasMedia && (
                    <div className="dashboard-media-section">
                      {media?.type === 'image' ? (
                        <img 
                          src={media.url} 
                          alt={announcement.title}
                          className="dashboard-cover-image"
                        />
                      ) : (
                        <div className="dashboard-cover-video">
                          <Video size={24} color="white" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Section */}
                  <div className="dashboard-content-section">
                    <div className="dashboard-card-header">
                      <div className="dashboard-badges">
                        <span className={`dashboard-type-badge type-${announcement.type}`}>
                          {getTypeIcon(announcement.type)}
                          {announcement.type}
                        </span>
                        {announcement.isPinned && (
                          <span className="dashboard-type-badge" style={{ background: '#f1f5f9', color: '#92400e' }}>
                            <Pin size={10} />
                            Pinned
                          </span>
                        )}
                      </div>
                      <div className="dashboard-meta-item">
                        <Clock size={12} />
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDate(announcement.createdAt)}</span>
                      </div>
                    </div>

                    <h3 className="dashboard-card-title">{announcement.title}</h3>
                  </div>
                </div>
                )
              })}
            </div>
          ) : (
            <div className="no-news">
              <Bell size={48} className="no-news-icon" />
              <p>No active announcements at this time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfessorHome

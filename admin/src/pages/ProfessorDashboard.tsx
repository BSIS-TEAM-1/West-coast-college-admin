import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, User, Settings as SettingsIcon, BookOpen, GraduationCap, Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Video, Calendar, Award } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile, getStoredToken } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import { API_URL } from '../lib/authApi'
import Announcements from './Announcements'
import AnnouncementDetail from './AnnouncementDetail'
import PersonalDetails from './PersonalDetails'
import './ProfessorDashboard.css'

interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string
  isActive: boolean
  isPinned: boolean
  expiresAt: string
  createdAt: string
  updatedAt?: string
  tags?: string[]
  media?: Array<{
    type: 'image' | 'video'
    url: string
    fileName: string
    originalFileName: string
    mimeType: string
    caption?: string
  }>
  createdBy: {
    username: string
    displayName: string
    avatar?: string
  }
  views?: number
  engagement?: {
    likes: number
    comments: number
    shares: number
  }
  priority?: 'low' | 'medium' | 'high'
  scheduledFor?: string
}

type ProfessorView = 'dashboard' | 'courses' | 'students' | 'grades' | 'schedule' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details'

type ProfessorDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const PROFESSOR_NAV_ITEMS: { id: ProfessorView; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'courses', label: 'My Courses', icon: BookOpen },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'grades', label: 'Grades', icon: Award },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function ProfessorDashboard({ username, onLogout, onProfileUpdated }: ProfessorDashboardProps) {
  const [view, setView] = useState<ProfessorView>('dashboard')
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  
  // Animation refs
  const dashboardRef = useRef<HTMLDivElement>(null)
  const quickActionsRef = useRef<HTMLDivElement>(null)
  const newsSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    
    getProfile()
      .then(setProfile)
      .catch(() => {
        // Fallback handled in JSX
      })

    return () => controller.abort()
  }, [])

  // Animation effects
  useEffect(() => {
    // Animate dashboard content on mount
    if (dashboardRef.current) {
      dashboardRef.current.style.opacity = '0'
      dashboardRef.current.style.transform = 'translateY(20px)'
      setTimeout(() => {
        if (dashboardRef.current) {
          dashboardRef.current.style.opacity = '1'
          dashboardRef.current.style.transform = 'translateY(0)'
        }
      }, 100)
    }

    // Animate quick action cards with stagger
    if (quickActionsRef.current) {
      const cards = quickActionsRef.current.querySelectorAll('.quick-action-card')
      cards.forEach((card, index) => {
        const htmlCard = card as HTMLElement
        htmlCard.style.opacity = '0'
        htmlCard.style.transform = 'translateY(30px)'
        setTimeout(() => {
          htmlCard.style.opacity = '1'
          htmlCard.style.transform = 'translateY(0)'
        }, 100 + index * 100)
      })
    }

    // Animate news section
    if (newsSectionRef.current) {
      newsSectionRef.current.style.opacity = '0'
      newsSectionRef.current.style.transform = 'translateX(-30px)'
      setTimeout(() => {
        if (newsSectionRef.current) {
          newsSectionRef.current.style.opacity = '1'
          newsSectionRef.current.style.transform = 'translateX(0)'
        }
      }, 300)
    }
  }, [])

  useEffect(() => {
    if (view === 'dashboard') {
      fetchAnnouncements()
    }
  }, [view])

  const handleProfileUpdated = (profile: ProfileResponse) => {
    setProfile(profile)
    onProfileUpdated?.(profile)
  }

  const fetchAnnouncements = async () => {
    try {
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, will be handled by auth context
          return
        }
        throw new Error(`Failed to fetch announcements: ${response.status}`)
      }
      
      const data = await response.json()
      setAnnouncements(data.announcements || [])
    } catch (error) {
      console.error('Failed to fetch announcements:', error)
    }
  }

  const handleAnnouncementClick = (announcement: Announcement) => {
    setSelectedAnnouncementId(announcement._id)
    setView('announcement-detail')
  }

  const handleBackFromDetail = () => {
    setSelectedAnnouncementId(null)
    setView('dashboard')
  }

  const renderContent = () => {
    switch (view) {
      case 'courses':
        return <CourseManagement />
      case 'students':
        return <StudentManagement />
      case 'grades':
        return <GradesManagement />
      case 'schedule':
        return <ScheduleManagement />
      case 'profile':
        return <Profile onProfileUpdated={handleProfileUpdated} onNavigate={(viewName) => {
          if (viewName === 'personal-details') {
            setView('personal-details')
          }
        }} />
      case 'settings':
        return <SettingsPage onProfileUpdated={handleProfileUpdated} onLogout={onLogout} />
      case 'announcements':
        return <Announcements onNavigate={(viewName, announcementId) => {
          if (viewName === 'announcement-detail' && announcementId) {
            setSelectedAnnouncementId(announcementId)
            setView('announcement-detail')
          }
        }} />
      case 'announcement-detail':
        return <AnnouncementDetail 
          announcementId={selectedAnnouncementId!} 
          onBack={handleBackFromDetail}
        />
      case 'personal-details':
        return <PersonalDetails onBack={() => setView('profile')} />
      default:
        return <ProfessorHome announcements={announcements} onAnnouncementClick={handleAnnouncementClick} quickActionsRef={quickActionsRef} newsSectionRef={newsSectionRef} />
    }
  }

  return (
    <div className="professor-dashboard">
      <aside className="professor-sidebar">
        <div className="professor-sidebar-brand">
          <div className="brand-content">
            <div className="logo-container">
              <img 
                src="/Logo.jpg" 
                alt="West Coast College Logo" 
                className="sidebar-logo"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const fallback = target.nextElementSibling as HTMLElement
                  if (fallback) fallback.style.display = 'block'
                }}
              />
              <div className="logo-fallback-text" style={{ display: 'none' }}>
                WCC
              </div>
            </div>
            <div className="brand-text">
              <span className="sidebar-title">West Coast College</span>
              <span className="sidebar-tagline">Professor Portal</span>
            </div>
          </div>
        </div>

        <nav className="professor-sidebar-nav" aria-label="Professor navigation">
          {PROFESSOR_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`professor-sidebar-link ${view === id ? 'professor-sidebar-link-active' : ''}`}
              onClick={() => setView(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={18} className="professor-sidebar-icon" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="professor-sidebar-footer">
          <div className="profile-section">
            <div className="profile-avatar">
              {profile?.avatar ? (
                <img 
                  src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`} 
                  alt="Profile" 
                  className="profile-avatar-img"
                  onError={(e) => {
                    // Fallback if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : (
                <div className="profile-avatar-placeholder">
                  <User size={16} />
                </div>
              )}
            </div>
            <div className="profile-info">
              <div className="profile-name">
                {profile?.displayName || profile?.username || 'Professor User'}
              </div>
              <div className="profile-role">Professor</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="professor-dashboard-body" ref={dashboardRef}>
        <Navbar username={username} onLogout={onLogout} />
        <main className="professor-dashboard-main">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

// Placeholder Components
interface ProfessorHomeProps {
  announcements: Announcement[]
  onAnnouncementClick: (announcement: Announcement) => void
  quickActionsRef: React.RefObject<HTMLDivElement | null>
  newsSectionRef: React.RefObject<HTMLDivElement | null>
}

function ProfessorHome({ announcements, onAnnouncementClick, quickActionsRef, newsSectionRef }: ProfessorHomeProps) {
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
  const activeAnnouncements = sortedAnnouncements.filter(a => a.isActive).slice(0, 3)

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
          
          {activeAnnouncements.length > 0 ? (
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

function CourseManagement() {
  return (
    <div className="professor-section">
      <h2 className="professor-section-title">My Courses</h2>
      <p className="professor-section-desc">Manage your course materials, assignments, and class resources.</p>
      
      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Course Materials</h3>
          <p>Upload and organize lecture materials and resources</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Assignments</h3>
          <p>Create and manage course assignments and deadlines</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Class Resources</h3>
          <p>Manage syllabus, textbooks, and additional resources</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  )
}

function StudentManagement() {
  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Students</h2>
      <p className="professor-section-desc">View student lists, track progress, and manage academic records.</p>
      
      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Student Roster</h3>
          <p>View enrolled students for your courses</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Academic Progress</h3>
          <p>Track student performance and engagement</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Communication</h3>
          <p>Send announcements and messages to students</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  )
}

function GradesManagement() {
  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Grades</h2>
      <p className="professor-section-desc">Submit grades, manage assessments, and track academic performance.</p>
      
      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Grade Submission</h3>
          <p>Submit midterm and final grades</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Assessments</h3>
          <p>Manage quizzes, exams, and assignments</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Grade Analytics</h3>
          <p>View grade distributions and class performance</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  )
}

function ScheduleManagement() {
  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Schedule</h2>
      <p className="professor-section-desc">View your teaching schedule, office hours, and academic calendar.</p>
      
      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Class Schedule</h3>
          <p>View your weekly teaching schedule</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Office Hours</h3>
          <p>Manage student consultation hours</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Academic Calendar</h3>
          <p>View important dates and deadlines</p>
          <button className="professor-btn" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  )
}

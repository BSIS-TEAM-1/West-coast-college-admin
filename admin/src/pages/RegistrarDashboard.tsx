import { useState, useEffect } from 'react'
import { LayoutDashboard, User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Video, Users, Blocks, FolderOpen, UserPlus } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile, getStoredToken } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import { API_URL } from '../lib/authApi'
import Announcements from './Announcements'
import AnnouncementDetail from './AnnouncementDetail'
import PersonalDetails from './PersonalDetails'
import CorGeneration from './CorGeneration'
import DocumentManagement from './DocumentManagement'
import StudentManagement from '../components/StudentManagement'
import RegistrarCourseManagement from '../components/RegistrarCourseManagement'
import RegistrarCourseWorkspace, { type RegistrarCourseWorkspaceSelection } from '../components/RegistrarCourseWorkspace'
import RegistrarReportsPanel from './RegistrarReportsPanel'
import ApplicantQueue from './ApplicantQueue'
import BlockManagement from './registrar/BlockManagement'
import ViewBlocksPage from './registrar/ViewBlocksPage'
import BlockWorkspace from './registrar/BlockWorkspace'
import AssignSubjectPage from './registrar/AssignSubjectPage'
import './RegistrarDashboard.css'

interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string | string[]
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

type Semester = '1st' | '2nd' | 'Summer'

type BlockWorkspaceSelection = {
  groupId: string
  groupName: string
  semester: Semester
  year: number
  initialSectionId?: string | null
}

type RegistrarView = 'dashboard' | 'applicants' | 'students' | 'courses' | 'course-workspace' | 'block-management' | 'view-blocks' | 'block-workspace' | 'assign-subject' | 'documents' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details' | 'cor-docs'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'applicants', label: 'Applicants', icon: UserPlus },
  { id: 'students', label: 'Student Management', icon: GraduationCap },
  { id: 'block-management', label: 'Block Management', icon: Blocks },
  { id: 'assign-subject', label: 'Assign Subject', icon: Users },
  { id: 'courses', label: 'Professor Loads', icon: BookOpen },
  { id: 'documents', label: 'Document Archive', icon: FolderOpen },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function RegistrarDashboard({ username, onLogout, onProfileUpdated }: RegistrarDashboardProps) {
  const [view, setView] = useState<RegistrarView>('dashboard')
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [blockWorkspaceSelection, setBlockWorkspaceSelection] = useState<BlockWorkspaceSelection | null>(null)
  const [courseWorkspaceSelection, setCourseWorkspaceSelection] = useState<RegistrarCourseWorkspaceSelection | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    
    getProfile()
      .then(setProfile)
      .catch(() => {
        // Fallback handled in JSX
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (view === 'dashboard') {
      fetchAnnouncements()
    }
  }, [view])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

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
      case 'students':
        return <StudentManagement />
      case 'applicants':
        return <ApplicantQueue />
      case 'courses':
        return (
          <RegistrarCourseManagement
            onOpenStudents={() => setView('students')}
            onOpenReports={() => setView('reports')}
            onOpenWorkspace={(selection) => {
              setCourseWorkspaceSelection(selection)
              setView('course-workspace')
            }}
          />
        )
      case 'course-workspace':
        return <RegistrarCourseWorkspace selection={courseWorkspaceSelection} onBack={() => setView('courses')} />
      case 'block-management':
        return <BlockManagement onOpenBlocksPage={() => setView('view-blocks')} />
      case 'view-blocks':
        return <ViewBlocksPage onBack={() => setView('block-management')} onOpenWorkspace={(selection) => {
          setBlockWorkspaceSelection(selection)
          setView('block-workspace')
        }} />
      case 'block-workspace':
        return <BlockWorkspace selection={blockWorkspaceSelection} onBack={() => setView('view-blocks')} />
      case 'assign-subject':
        return <AssignSubjectPage />
      case 'documents':
        return <DocumentManagement onNavigate={(viewName) => setView(viewName)} />
      case 'reports':
        return <ReportsDashboard />
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
      case 'cor-docs':
        return <CorGeneration />
      default:
        return <RegistrarHome announcements={announcements} onAnnouncementClick={handleAnnouncementClick} setView={setView} />
    }
  }

  return (
    <div className="registrar-dashboard">
      <aside className="registrar-sidebar">
        <div className="registrar-sidebar-brand">
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
              <span className="sidebar-tagline">Registrar Portal</span>
            </div>
          </div>
        </div>

        <nav className="registrar-sidebar-nav" aria-label="Registrar navigation">
          {REGISTRAR_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`registrar-sidebar-link ${(
                view === id
                || (id === 'courses' && view === 'course-workspace')
                || (id === 'block-management' && (view === 'view-blocks' || view === 'block-workspace'))
              ) ? 'registrar-sidebar-link-active' : ''}`}
              onClick={() => setView(id)}
              aria-current={(
                view === id
                || (id === 'courses' && view === 'course-workspace')
                || (id === 'block-management' && (view === 'view-blocks' || view === 'block-workspace'))
              ) ? 'page' : undefined}
            >
              <Icon size={18} className="registrar-sidebar-icon" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="registrar-sidebar-time">
          <div className="registrar-sidebar-time-label">Current Time</div>
          <div className="registrar-sidebar-time-value">{currentTime.toLocaleTimeString()}</div>
          <div className="registrar-sidebar-date-value">{currentTime.toLocaleDateString()}</div>
        </div>

        <div className="registrar-sidebar-footer">
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
                {profile?.displayName || profile?.username || 'Registrar User'}
              </div>
              <div className="profile-role">Registrar</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="registrar-dashboard-body">
        <Navbar username={username} onLogout={onLogout} />
        <main className="registrar-dashboard-main">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

// Placeholder Components
interface RegistrarHomeProps {
  announcements: Announcement[]
  onAnnouncementClick: (announcement: Announcement) => void
  setView: (view: RegistrarView) => void
}

function RegistrarHome({ announcements, onAnnouncementClick, setView }: RegistrarHomeProps) {

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
    <div className="registrar-home">
      <h2 className="registrar-welcome-title">Welcome to the Registrar Portal</h2>
      <p className="registrar-welcome-desc">Manage student records, courses, and generate reports from your dashboard.</p>
      
      <div className="registrar-dashboard-content">
        <div className="registrar-quick-actions">
          <div className="quick-action-card" onClick={() => setView('students')} style={{ cursor: 'pointer' }}>
            <GraduationCap size={32} className="quick-action-icon" />
            <h3>Student Management</h3>
            <p>Enroll new students and manage existing records</p>
          </div>
          <div className="quick-action-card" onClick={() => setView('courses')} style={{ cursor: 'pointer' }}>
            <BookOpen size={32} className="quick-action-icon" />
            <h3>Assign Instructor</h3>
            <p>Assign instructors to student blocks and sections</p>
          </div>
          <div className="quick-action-card" onClick={() => setView('reports')} style={{ cursor: 'pointer' }}>
            <FileText size={32} className="quick-action-icon" />
            <h3>Reports</h3>
            <p>Generate enrollment and academic reports</p>
          </div>
          <div className="quick-action-card" onClick={() => setView('documents')} style={{ cursor: 'pointer' }}>
            <FolderOpen size={32} className="quick-action-icon" />
            <h3>Document Archive</h3>
            <p>Browse folders, upload files, and manage registrar documents</p>
          </div>
        </div>

        <div className="registrar-news-section">
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



function ReportsDashboard() {
  return <RegistrarReportsPanel />
}

import { useState, useEffect } from 'react'
import { User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Users, Blocks, FolderOpen, UserPlus } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
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

type Semester = '1st' | '2nd' | 'Summer'

type BlockWorkspaceSelection = {
  groupId: string
  groupName: string
  semester: Semester
  year: number
  initialSectionId?: string | null
}

type RegistrarView = 'applicants' | 'students' | 'courses' | 'course-workspace' | 'block-management' | 'view-blocks' | 'block-workspace' | 'assign-subject' | 'documents' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details' | 'cor-docs'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
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
  const [view, setView] = useState<RegistrarView>('applicants')
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
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
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleProfileUpdated = (profile: ProfileResponse) => {
    setProfile(profile)
    onProfileUpdated?.(profile)
  }

  const handleBackFromDetail = () => {
    setSelectedAnnouncementId(null)
    setView('announcements')
  }

  const profileName = profile?.displayName || profile?.username || 'Registrar User'
  const profileAvatar = profile?.avatar
    ? (profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`)
    : null

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
        return <ApplicantQueue />
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

      </aside>

      <div className="registrar-dashboard-body">
        <Navbar
          username={username}
          onLogout={onLogout}
          profileName={profileName}
          profileRole="Registrar"
          profileAvatar={profileAvatar}
        />
        <main className="registrar-dashboard-main">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

function ReportsDashboard() {
  return <RegistrarReportsPanel />
}

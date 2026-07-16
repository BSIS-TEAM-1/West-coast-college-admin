import { useState, useEffect } from 'react'
import { User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Users, Blocks, FolderOpen, UserPlus, Plus } from 'lucide-react'
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
import ProfessorLoad from '../components/ProfessorLoad'
import RegistrarCourseWorkspace, { type RegistrarCourseWorkspaceSelection } from '../components/RegistrarCourseWorkspace'
import RegistrarReportsPanel from './RegistrarReportsPanel'
import ApplicantQueue from './ApplicantQueue'
import BlockManagement from './registrar/BlockManagement'
import ViewBlocksPage from './registrar/ViewBlocksPage'
import BlockWorkspace from './registrar/BlockWorkspace'
import AssignSubjectPage from './registrar/AssignSubjectPage'
import SubjectManagementPage from './registrar/SubjectManagementPage'
import StudentWizard from '../components/AddStudent/StudentWizard'
import './RegistrarDashboard.css'

type Semester = '1st' | '2nd' | 'Summer'

type BlockWorkspaceSelection = {
  groupId: string
  groupName: string
  semester: Semester
  year: number
  initialSectionId?: string | null
}

type RegistrarView = 'applicants' | 'students' | 'add-student' | 'courses' | 'course-workspace' | 'block-management' | 'view-blocks' | 'block-workspace' | 'subject-management' | 'add-subject' | 'assign-subject' | 'documents' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details' | 'cor-docs'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
  { id: 'applicants', label: 'Applicants', icon: UserPlus },
  { id: 'students', label: 'Student Management', icon: GraduationCap },
  { id: 'block-management', label: 'Block Management', icon: Blocks },
  { id: 'subject-management', label: 'Subject Management', icon: BookOpen },
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
      case 'add-student':
        return (
          <StudentWizard
            onClose={() => setView('students')}
            onSuccess={() => setView('students')}
          />
        )
      case 'applicants':
        return <ApplicantQueue />
      case 'courses':
        return (
          <ProfessorLoad
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
        return <BlockManagement onOpenBlocksPage={() => setView('view-blocks')} onGoDashboard={() => setView('applicants')} />
      case 'view-blocks':
        return <ViewBlocksPage onBack={() => setView('block-management')} onOpenWorkspace={(selection) => {
          setBlockWorkspaceSelection(selection)
          setView('block-workspace')
        }} />
      case 'block-workspace':
        return <BlockWorkspace selection={blockWorkspaceSelection} onBack={() => setView('view-blocks')} />
      case 'subject-management':
        return <SubjectManagementPage mode="catalog" />
      case 'add-subject':
        return <SubjectManagementPage mode="add" />
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
          {REGISTRAR_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = (
              view === id
              || (id === 'courses' && view === 'course-workspace')
              || (id === 'block-management' && (view === 'view-blocks' || view === 'block-workspace'))
              || (id === 'subject-management' && (view === 'add-subject' || view === 'assign-subject'))
              || (id === 'students' && view === 'add-student')
            )
            const isBlockManagement = id === 'block-management'
            const isSubjectManagement = id === 'subject-management'
            const isStudentManagement = id === 'students'
            const showBlockSubnav = isBlockManagement && isActive
            const showSubjectSubnav = isSubjectManagement && isActive
            const showStudentSubnav = isStudentManagement && isActive
            const isAddBlockActive = view === 'block-management'
            const isAddSubjectActive = view === 'add-subject'
            const isSubjectAssignmentActive = view === 'assign-subject'
            const isAddStudentActive = view === 'add-student'

            return (
              <div key={id} className={isBlockManagement || isSubjectManagement || isStudentManagement ? 'registrar-sidebar-group' : undefined}>
                <button
                  type="button"
                  className={`registrar-sidebar-link ${isActive ? 'registrar-sidebar-link-active' : ''}`}
                  onClick={() => setView(isBlockManagement ? 'view-blocks' : id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={18} className="registrar-sidebar-icon" />
                  <span>{label}</span>
                </button>

                {showStudentSubnav && (
                  <div className="registrar-sidebar-subnav" aria-label="Student management navigation">
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isAddStudentActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('add-student')}
                      aria-current={isAddStudentActive ? 'page' : undefined}
                    >
                      <Plus size={15} className="registrar-sidebar-icon" />
                      <span>Add Student</span>
                    </button>
                  </div>
                )}

                {showBlockSubnav && (
                  <div className="registrar-sidebar-subnav" aria-label="Block management navigation">
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isAddBlockActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('block-management')}
                      aria-current={isAddBlockActive ? 'page' : undefined}
                    >
                      <Plus size={15} className="registrar-sidebar-icon" />
                      <span>Add Block</span>
                    </button>
                  </div>
                )}

                {showSubjectSubnav && (
                  <div className="registrar-sidebar-subnav" aria-label="Subject management navigation">
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isAddSubjectActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('add-subject')}
                      aria-current={isAddSubjectActive ? 'page' : undefined}
                    >
                      <Plus size={15} className="registrar-sidebar-icon" />
                      <span>Add Subject</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isSubjectAssignmentActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('assign-subject')}
                      aria-current={isSubjectAssignmentActive ? 'page' : undefined}
                    >
                      <Users size={15} className="registrar-sidebar-icon" />
                      <span>Subject Assignment</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
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

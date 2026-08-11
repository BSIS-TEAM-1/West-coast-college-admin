import { useState, useEffect } from 'react'
import { User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Users, Blocks, FolderOpen, UserPlus, Plus, TrendingUp, LayoutGrid, List, Archive, ClipboardCheck } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import Announcements from './Announcements'
import AnnouncementDetail from './AnnouncementDetail'
import PersonalDetails from './PersonalDetails'
import CorGeneration from './CorGeneration'
import AcademicArchivePage from './registrar/AcademicArchivePage'
import StudentManagement from '../components/StudentManagement'
import ProfessorLoad from '../components/ProfessorLoad'
import RegistrarCourseWorkspace, { type RegistrarCourseWorkspaceSelection } from '../components/RegistrarCourseWorkspace'
import EnterpriseAuditReport from './registrar/EnterpriseAuditReport'
import ApplicantQueue from './ApplicantQueue'
import BlockManagement from './registrar/BlockManagement'
import ViewBlocksPage from './registrar/ViewBlocksPage'
import BlockWorkspace from './registrar/BlockWorkspace'
import BlockOverviewDashboard from './registrar/BlockOverviewDashboard'
import BlockAssignmentPage from './registrar/BlockAssignmentPage'
import SchoolYearRollover from './registrar/SchoolYearRollover'
import StudentHistoryPage from './registrar/StudentHistoryPage'
import AssignSubjectPage from './registrar/AssignSubjectPage'
import SubjectManagementPage from './registrar/SubjectManagementPage'
import CurriculumManagementLayout from './registrar/CurriculumManagementLayout'
import CurriculumDetailsPage from './registrar/CurriculumDetailsPage'
import GradeSubmissionReviewPage from './registrar/GradeSubmissionReviewPage'
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

type RegistrarView = 'applicants' | 'students' | 'add-student' | 'courses' | 'course-workspace' | 'block-overview' | 'block-management' | 'assign-block' | 'view-blocks' | 'block-workspace' | 'school-year-rollover' | 'student-history' | 'subject-management' | 'add-subject' | 'assign-subject' | 'curriculum-management' | 'curriculum-overview' | 'curriculum-create' | 'curriculum-archived' | 'curriculum-details' | 'grade-submissions' | 'documents' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details' | 'cor-docs'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
  initialProfile?: ProfileResponse | null
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
  { id: 'applicants', label: 'Applicants', icon: UserPlus },
  { id: 'students', label: 'Student Management', icon: GraduationCap },
  { id: 'block-overview', label: 'Block Overview', icon: Blocks },
  { id: 'curriculum-management', label: 'Curriculums', icon: BookOpen },
  { id: 'subject-management', label: 'Subject Catalog', icon: BookOpen },
  { id: 'courses', label: 'Professor Loads', icon: BookOpen },
  { id: 'grade-submissions', label: 'Grade Submissions', icon: ClipboardCheck },
  { id: 'documents', label: 'Academic Archive', icon: FolderOpen },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function RegistrarDashboard({ username, onLogout, onProfileUpdated, initialProfile = null }: RegistrarDashboardProps) {
  const [view, setView] = useState<RegistrarView>('applicants')
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [blockWorkspaceSelection, setBlockWorkspaceSelection] = useState<BlockWorkspaceSelection | null>(null)
  const [courseWorkspaceSelection, setCourseWorkspaceSelection] = useState<RegistrarCourseWorkspaceSelection | null>(null)
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null)
  const [curriculumDetailId, setCurriculumDetailId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    
    if (initialProfile) {
      setProfile(initialProfile)
      return () => controller.abort()
    }

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
        return <StudentManagement onViewHistory={(studentId) => { setHistoryStudentId(studentId); setView('student-history') }} />
      case 'assign-block':
        return <BlockAssignmentPage />
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
      case 'block-overview':
        return <BlockOverviewDashboard
          onManageAssignments={() => setView('assign-block')}
          onViewBlocks={() => setView('view-blocks')}
        />
      case 'block-management':
        return <BlockManagement onOpenBlocksPage={() => setView('view-blocks')} onGoDashboard={() => setView('block-overview')} />
      case 'view-blocks':
        return <ViewBlocksPage onBack={() => setView('block-overview')} onOpenWorkspace={(selection) => {
          setBlockWorkspaceSelection(selection)
          setView('block-workspace')
        }} />
      case 'block-workspace':
        return <BlockWorkspace selection={blockWorkspaceSelection} onBack={() => setView('view-blocks')} />
      case 'school-year-rollover':
        return <SchoolYearRollover onBack={() => setView('block-overview')} />
      case 'student-history':
        return <StudentHistoryPage studentId={historyStudentId || ''} onBack={() => setView('students')} />
      case 'subject-management':
        return <SubjectManagementPage mode="catalog" />
      case 'add-subject':
        return <SubjectManagementPage mode="add" />
      case 'assign-subject':
        return <AssignSubjectPage />
      case 'curriculum-overview':
        return (
          <CurriculumManagementLayout
            activeView="overview"
            onNavigate={(viewName) => {
              if (viewName === 'create') setView('curriculum-create')
              else if (viewName === 'archived') setView('curriculum-archived')
              else if (viewName === 'overview') setView('curriculum-overview')
              else setView('curriculum-management')
            }}
          />
        )
      case 'curriculum-management':
        return (
          <CurriculumManagementLayout
            activeView="curriculums"
            onNavigate={(viewName) => {
              if (viewName === 'create') setView('curriculum-create')
              else if (viewName === 'archived') setView('curriculum-archived')
              else if (viewName === 'overview') setView('curriculum-overview')
              else setView('curriculum-management')
            }}
            onOpenCurriculum={(id) => { setCurriculumDetailId(id); setView('curriculum-details') }}
          />
        )
      case 'curriculum-create':
        return (
          <CurriculumManagementLayout
            activeView="create"
            onNavigate={(viewName) => {
              if (viewName === 'create') setView('curriculum-create')
              else if (viewName === 'archived') setView('curriculum-archived')
              else if (viewName === 'overview') setView('curriculum-overview')
              else setView('curriculum-management')
            }}
          />
        )
      case 'curriculum-archived':
        return (
          <CurriculumManagementLayout
            activeView="archived"
            onNavigate={(viewName) => {
              if (viewName === 'create') setView('curriculum-create')
              else if (viewName === 'archived') setView('curriculum-archived')
              else if (viewName === 'overview') setView('curriculum-overview')
              else setView('curriculum-management')
            }}
          />
        )
      case 'curriculum-details':
        return curriculumDetailId ? <CurriculumDetailsPage curriculumId={curriculumDetailId} onBack={() => setView('curriculum-management')} /> : null
      case 'grade-submissions':
        return <GradeSubmissionReviewPage onBack={() => setView('applicants')} />
      case 'documents':
        return <AcademicArchivePage />
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
              || (id === 'block-overview' && (view === 'block-management' || view === 'assign-block' || view === 'view-blocks' || view === 'block-workspace' || view === 'school-year-rollover'))
              || (id === 'subject-management' && (view === 'add-subject' || view === 'assign-subject'))
              || (id === 'curriculum-management' && (view === 'curriculum-details' || view === 'curriculum-overview' || view === 'curriculum-create' || view === 'curriculum-archived'))
              || (id === 'students' && view === 'add-student')
            )
            const isBlockOverview = id === 'block-overview'
            const isSubjectManagement = id === 'subject-management'
            const isStudentManagement = id === 'students'
            const isCurriculumManagement = id === 'curriculum-management'
            const showBlockSubnav = isBlockOverview && isActive
            const showSubjectSubnav = isSubjectManagement && isActive
            const showStudentSubnav = isStudentManagement && isActive
            const showCurriculumSubnav = isCurriculumManagement && isActive
            const isBlockOverviewActive = view === 'block-overview'
            const isAddBlockActive = view === 'block-management'
            const isAssignBlockActive = view === 'assign-block'
            const isRolloverActive = view === 'school-year-rollover'
            const isAddSubjectActive = view === 'add-subject'
            const isSubjectAssignmentActive = view === 'assign-subject'
            const isAddStudentActive = view === 'add-student'
            const isCurriculumOverviewActive = view === 'curriculum-overview'
            const isCurriculumListActive = view === 'curriculum-management'
            const isCurriculumCreateActive = view === 'curriculum-create'
            const isCurriculumArchivedActive = view === 'curriculum-archived'

            return (
              <div key={id} className={isBlockOverview || isSubjectManagement || isStudentManagement || isCurriculumManagement ? 'registrar-sidebar-group' : undefined}>
                <button
                  type="button"
                  className={`registrar-sidebar-link ${isActive ? 'registrar-sidebar-link-active' : ''}`}
                  onClick={() => setView(isBlockOverview ? 'block-overview' : id)}
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
                      className={`registrar-sidebar-sublink ${isBlockOverviewActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('block-overview')}
                      aria-current={isBlockOverviewActive ? 'page' : undefined}
                    >
                      <TrendingUp size={15} className="registrar-sidebar-icon" />
                      <span>Overview</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isAddBlockActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('block-management')}
                      aria-current={isAddBlockActive ? 'page' : undefined}
                    >
                      <Plus size={15} className="registrar-sidebar-icon" />
                      <span>Add Block</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isAssignBlockActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('assign-block')}
                      aria-current={isAssignBlockActive ? 'page' : undefined}
                    >
                      <Users size={15} className="registrar-sidebar-icon" />
                      <span>Assign Block</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isRolloverActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('school-year-rollover')}
                      aria-current={isRolloverActive ? 'page' : undefined}
                    >
                      <TrendingUp size={15} className="registrar-sidebar-icon" />
                      <span>Close School Year</span>
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

                {showCurriculumSubnav && (
                  <div className="registrar-sidebar-subnav" aria-label="Curriculum management navigation">
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isCurriculumOverviewActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('curriculum-overview')}
                      aria-current={isCurriculumOverviewActive ? 'page' : undefined}
                    >
                      <LayoutGrid size={15} className="registrar-sidebar-icon" />
                      <span>Overview</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isCurriculumListActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('curriculum-management')}
                      aria-current={isCurriculumListActive ? 'page' : undefined}
                    >
                      <List size={15} className="registrar-sidebar-icon" />
                      <span>Curriculums</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isCurriculumCreateActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('curriculum-create')}
                      aria-current={isCurriculumCreateActive ? 'page' : undefined}
                    >
                      <Plus size={15} className="registrar-sidebar-icon" />
                      <span>Create Curriculum</span>
                    </button>
                    <button
                      type="button"
                      className={`registrar-sidebar-sublink ${isCurriculumArchivedActive ? 'registrar-sidebar-sublink-active' : ''}`}
                      onClick={() => setView('curriculum-archived')}
                      aria-current={isCurriculumArchivedActive ? 'page' : undefined}
                    >
                      <Archive size={15} className="registrar-sidebar-icon" />
                      <span>Archived</span>
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
          onProfileClick={() => setView('profile')}
          onSettingsClick={() => setView('settings')}
        />
        <main className="registrar-dashboard-main">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

function ReportsDashboard() {
  return <EnterpriseAuditReport />
}

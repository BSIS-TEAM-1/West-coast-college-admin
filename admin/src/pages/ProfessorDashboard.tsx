import { useState, useEffect, useRef } from 'react'
import { User, Settings as SettingsIcon, BookOpen, GraduationCap, AlertCircle, Calendar, Award } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { API_URL, getProfile, getStoredToken } from '../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../lib/network'
import type { ProfileResponse } from '../lib/authApi'
import PersonalDetails from './PersonalDetails'
import CourseManagement from './professor/CourseManagement'
import GradesManagement from './professor/GradesManagement'
import ProfessorSubjectDetail from './professor/ProfessorSubjectDetail'
import ScheduleManagement from './professor/ScheduleManagement'
import StudentManagement from './professor/StudentManagement'
import type { ProfessorAssignedBlock, ProfessorAssignedCourse, ProfessorSubjectDetailState, ProfessorView } from './professor/professorTypes'
import { buildReconnectMessage } from './professor/professorUtils'
import './ProfessorDashboard.css'

type ProfessorDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
  initialProfile?: ProfileResponse | null
}

const PROFESSOR_NAV_ITEMS: { id: ProfessorView; label: string; icon: any }[] = [
  { id: 'courses', label: 'My Courses', icon: BookOpen },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'grades', label: 'Grades', icon: Award },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function ProfessorDashboard({ username, onLogout, onProfileUpdated, initialProfile = null }: ProfessorDashboardProps) {
  const [view, setView] = useState<ProfessorView>('courses')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile)
  const [assignedCourses, setAssignedCourses] = useState<ProfessorAssignedCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [coursesError, setCoursesError] = useState('')
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<ProfessorSubjectDetailState | null>(null)
  const [selectedRosterClassKey, setSelectedRosterClassKey] = useState('')
  const [selectedRosterFocus, setSelectedRosterFocus] = useState<'students' | 'attendance'>('students')
  const [selectedGradeClassKey, setSelectedGradeClassKey] = useState('')
  const [isOffline, setIsOffline] = useState(() => (
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  ))
  
  // Animation refs
  const dashboardRef = useRef<HTMLDivElement>(null)

  const loadProfile = async () => {
    if (initialProfile) {
      setProfile(initialProfile)
      return
    }

    try {
      const nextProfile = await getProfile()
      setProfile(nextProfile)
    } catch (error) {
      if (!isNetworkRequestError(error)) {
        console.error('Failed to load professor profile:', error)
      }
    }
  }

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile)
      return
    }
    void loadProfile()
  }, [initialProfile])

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

  }, [])

  useEffect(() => {
    if (view === 'courses' || view === 'students' || view === 'grades' || view === 'schedule') {
      void fetchAssignedCourses()
    }
  }, [view])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1025px)')
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsSidebarOpen(false)
      }
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (!isSidebarOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isSidebarOpen])

  useEffect(() => {
    if (!isSidebarOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSidebarOpen])

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      if (!initialProfile) {
        void loadProfile()
      }

      if (view === 'courses' || view === 'students' || view === 'grades' || view === 'schedule' || view === 'subject-detail') {
        void fetchAssignedCourses()
      }
    }

    const handleOffline = () => {
      setIsOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [view])

  const handleProfileUpdated = (profile: ProfileResponse) => {
    setProfile(profile)
    onProfileUpdated?.(profile)
  }

  const fetchAssignedCourses = async () => {
    try {
      setCoursesLoading(true)
      setCoursesError('')

      const token = await getStoredToken()
      if (!token) {
        setAssignedCourses([])
        setCoursesError('You are not logged in.')
        return
      }

      const response = await fetchWithAutoReconnect(`${API_URL}/api/professor/assigned-blocks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Only professor accounts can view assigned blocks.')
        }
        throw new Error(`Failed to fetch assigned blocks: ${response.status}`)
      }

      const payload = await response.json().catch(() => ({}))
      const courses = Array.isArray(payload?.data?.courses) ? payload.data.courses : []
      const isVisibleProfessorBlock = (block: ProfessorAssignedBlock) => {
        const normalizedSectionCode = String(block?.sectionCode || '').trim().toLowerCase()
        return Boolean(block?.sectionId)
          && !normalizedSectionCode.includes('unassigned')
          && !normalizedSectionCode.includes('unknown')
      }
      const visibleCourses = courses
        .map((course: ProfessorAssignedCourse) => ({
          ...course,
          blocks: (Array.isArray(course.blocks) ? course.blocks : []).filter((block) => isVisibleProfessorBlock(block))
        }))
        .filter((course: ProfessorAssignedCourse) => course.blocks.length > 0)
      setAssignedCourses(visibleCourses)
    } catch (error) {
      if (isAbortRequestError(error)) {
        return
      }

      console.error('Failed to fetch professor assigned blocks:', error)
      const fallbackMessage = error instanceof Error ? error.message : 'Failed to load assigned blocks.'
      if (isNetworkRequestError(error)) {
        setCoursesError(buildReconnectMessage('your teaching assignments'))
        return
      }

      setAssignedCourses([])
      setCoursesError(fallbackMessage)
    } finally {
      setCoursesLoading(false)
    }
  }

  const renderContent = () => {
    switch (view) {
      case 'courses':
        return (
          <CourseManagement
            professorName={profile?.displayName || profile?.username || username}
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onOpenSubjectDetail={(detail) => {
              setSelectedSubjectDetail(detail)
              setView('subject-detail')
            }}
            onOpenRosterClass={(classKey, mode = 'students') => {
              setSelectedRosterClassKey(classKey)
              setSelectedRosterFocus(mode)
              setView('students')
            }}
            onOpenGradesView={(classKey) => {
              setSelectedGradeClassKey(classKey || '')
              setView('grades')
            }}
          />
        )
      case 'students':
        return (
          <StudentManagement
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onRefresh={fetchAssignedCourses}
            initialClassKey={selectedRosterClassKey}
            entryMode={selectedRosterFocus}
          />
        )
      case 'grades':
        return (
          <GradesManagement
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onRefresh={fetchAssignedCourses}
            initialClassKey={selectedGradeClassKey}
          />
        )
      case 'schedule':
        return (
          <ScheduleManagement
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onRefresh={fetchAssignedCourses}
          />
        )
      case 'profile':
        return <Profile onProfileUpdated={handleProfileUpdated} onNavigate={(viewName) => {
          if (viewName === 'personal-details') {
            setView('personal-details')
          }
        }} />
      case 'settings':
        return <SettingsPage onProfileUpdated={handleProfileUpdated} onLogout={onLogout} />
      case 'personal-details':
        return <PersonalDetails onBack={() => setView('profile')} />
      case 'subject-detail':
        return (
          <ProfessorSubjectDetail
            detail={selectedSubjectDetail}
            onBack={() => setView('courses')}
            onOpenRosterClass={(classKey, mode = 'students') => {
              setSelectedRosterClassKey(classKey)
              setSelectedRosterFocus(mode)
              setView('students')
            }}
            onOpenGradesView={(classKey) => {
              setSelectedGradeClassKey(classKey || '')
              setView('grades')
            }}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="professor-dashboard">
      <aside
        id="professor-sidebar-navigation"
        className={`professor-sidebar ${isSidebarOpen ? 'professor-sidebar-open' : ''}`}
        aria-label="Professor navigation menu"
      >
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
              className={`professor-sidebar-link ${(view === id || (view === 'subject-detail' && id === 'courses')) ? 'professor-sidebar-link-active' : ''}`}
              onClick={() => {
                setView(id)
                setIsSidebarOpen(false)
              }}
              aria-current={(view === id || (view === 'subject-detail' && id === 'courses')) ? 'page' : undefined}
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
      <button
        type="button"
        className={`professor-sidebar-backdrop ${isSidebarOpen ? 'visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Close professor navigation menu"
      />

      <div className="professor-dashboard-body" ref={dashboardRef}>
        <Navbar
          username={username}
          onLogout={onLogout}
          isMenuOpen={isSidebarOpen}
          menuId="professor-sidebar-navigation"
          onMenuToggle={() => setIsSidebarOpen((prev) => !prev)}
          onProfileClick={() => setView('profile')}
          onSettingsClick={() => setView('settings')}
        />
        <main className="professor-dashboard-main">
          {isOffline ? (
            <div className="professor-network-banner" role="status" aria-live="polite">
              <AlertCircle size={16} />
              <span>Internet connection lost. Reconnecting automatically while keeping your current screen active.</span>
            </div>
          ) : null}
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

// Placeholder Components

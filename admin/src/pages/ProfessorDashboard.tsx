import { useState, useEffect, useRef, useMemo } from 'react'
import { LayoutDashboard, User, Settings as SettingsIcon, BookOpen, GraduationCap, Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Video, Calendar, Award, Search, ChevronRight, Download, Send, Eye, CalendarDays, List, Grid3X3, MapPin, MoreHorizontal } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile, getStoredToken } from '../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../lib/network'
import type { ProfileResponse } from '../lib/authApi'
import { API_URL } from '../lib/authApi'
import { normalizeAnnouncementAudience } from '../lib/announcementAudience'
import AnnouncementDetail from './AnnouncementDetail'
import PersonalDetails from './PersonalDetails'
import './ProfessorDashboard.css'

interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string | string[]
  isActive: boolean
  isArchived?: boolean
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

const isVisibleProfessorAnnouncement = (value: any): value is Announcement => {
  if (!value || typeof value !== 'object') return false
  if (value.isActive === false) return false
  if (value.isArchived === true) return false

  const id = String(value._id || '').trim()
  const title = String(value.title || '').trim()
  if (!id || !title) return false

  const rawExpiry = String(value.expiresAt || '').trim()
  if (!rawExpiry) return true

  const expiry = new Date(rawExpiry)
  if (Number.isNaN(expiry.getTime())) return true

  if (expiry.getTime() <= Date.now()) return false

  const audiences = normalizeAnnouncementAudience(value.targetAudience)
  return audiences.includes('all') || audiences.includes('professor')
}

interface ProfessorAssignedSubject {
  subjectId: string
  code: string
  title: string
  schedule: string
  room: string
  enrolledStudents: number
}

interface ProfessorAssignedBlock {
  sectionId: string | null
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjects: ProfessorAssignedSubject[]
}

interface ProfessorAssignedCourse {
  courseCode: string
  courseName?: string
  blocks: ProfessorAssignedBlock[]
}

interface ProfessorSubjectDetailState {
  courseCode: string
  blockCode: string
  sectionId: string | null
  sectionCode: string
  semester: string
  schoolYear: string
  subject: ProfessorAssignedSubject
}

interface ProfessorAssignedStudent {
  _id: string
  studentNumber: string | number
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  yearLevel?: number
  studentStatus?: string
  course?: string | number
  corStatus?: string
  assignedAt?: string | null
}

interface ProfessorRosterClassOption {
  key: string
  courseCode: string
  blockCode: string
  sectionId: string
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjectId: string
  subjectCode: string
  subjectTitle: string
  schedule: string
  room: string
}

interface ProfessorRosterSectionOption {
  key: string
  courseCode: string
  blockCode: string
  sectionId: string
  sectionCode: string
  semester: string
  schoolYear: string
  yearLevel: number | null
  subjectCount: number
}

interface ProfessorRosterStudent extends Omit<ProfessorAssignedStudent, 'studentNumber'> {
  rosterEntryKey: string
  studentNumber: string
  enrollmentId?: string
  subjectEntryId?: string
  email?: string
  contactNumber?: string
  program?: string
  status?: string
  attendancePercentage?: number
  currentGrade?: number | string
  latestGrade?: number | string
  quizScores?: Array<{ name: string; score: number | string }>
  assignmentScores?: Array<{ name: string; score: number | string }>
  attendanceRecord?: Array<{ date: string; status: string }>
  remarks?: string
  classBlockCode?: string
  classSectionCode?: string
  classSubjectCode?: string
  classSubjectTitle?: string
  classSemester?: string
  classSchoolYear?: string
  subjectStatus?: string
  gradeUpdatedAt?: string
}

type RosterSortBy = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc'

type ProfessorView = 'dashboard' | 'courses' | 'students' | 'grades' | 'schedule' | 'profile' | 'settings' | 'announcement-detail' | 'personal-details' | 'subject-detail'

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
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

const buildReconnectMessage = (resourceLabel: string) => (
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? `Internet connection lost. Reconnecting and reloading ${resourceLabel} automatically.`
    : `Connection is unstable. Retrying ${resourceLabel}.`
)

export default function ProfessorDashboard({ username, onLogout, onProfileUpdated }: ProfessorDashboardProps) {
  const [view, setView] = useState<ProfessorView>('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
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
  const quickActionsRef = useRef<HTMLDivElement>(null)
  const newsSectionRef = useRef<HTMLDivElement>(null)

  const loadProfile = async () => {
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
    void loadProfile()
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
    if (view !== 'dashboard') return

    const refreshAnnouncements = () => {
      if (document.visibilityState === 'hidden') return
      void fetchAnnouncements()
    }

    refreshAnnouncements()

    const intervalId = window.setInterval(refreshAnnouncements, 60_000)
    window.addEventListener('focus', refreshAnnouncements)
    document.addEventListener('visibilitychange', refreshAnnouncements)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshAnnouncements)
      document.removeEventListener('visibilitychange', refreshAnnouncements)
    }
  }, [view])

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
      void loadProfile()

      if (view === 'dashboard') {
        void fetchAnnouncements()
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

  const fetchAnnouncements = async () => {
    try {
      setAnnouncementsLoading(true)

      const response = await fetchWithAutoReconnect(`${API_URL}/api/announcements?targetAudience=professor`)

      if (!response.ok) {
        throw new Error(`Failed to fetch announcements: ${response.status}`)
      }

      const data = await response.json().catch(() => [])
      setAnnouncements(Array.isArray(data) ? data.filter(isVisibleProfessorAnnouncement) : [])
    } catch (error) {
      if (isAbortRequestError(error)) {
        return
      }

      console.error('Failed to fetch announcements:', error)
    } finally {
      setAnnouncementsLoading(false)
    }
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
        return (
          <CourseManagement
            professorName={profile?.displayName || profile?.username || username}
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onRefresh={fetchAssignedCourses}
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
      case 'announcement-detail':
        return <AnnouncementDetail 
          announcementId={selectedAnnouncementId!} 
          onBack={handleBackFromDetail}
          viewerAudience="professor"
        />
      case 'personal-details':
        return <PersonalDetails onBack={() => setView('profile')} />
      case 'subject-detail':
        return (
          <ProfessorSubjectDetail
            detail={selectedSubjectDetail}
            onBack={() => setView('courses')}
          />
        )
      default:
        return (
          <ProfessorHome
            announcements={announcements}
            announcementsLoading={announcementsLoading}
            onAnnouncementClick={handleAnnouncementClick}
            quickActionsRef={quickActionsRef}
            newsSectionRef={newsSectionRef}
          />
        )
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

interface CourseManagementProps {
  professorName: string
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onOpenSubjectDetail: (detail: ProfessorSubjectDetailState) => void
  onOpenRosterClass: (classKey: string, mode?: 'students' | 'attendance') => void
  onOpenGradesView: (classKey?: string) => void
}

function CourseManagementLegacy({ courses, loading, error, onRefresh, onOpenSubjectDetail }: CourseManagementProps) {
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [schoolYearFilter, setSchoolYearFilter] = useState('all')
  const [subjectSort, setSubjectSort] = useState<'default' | 'code' | 'students'>('default')
  const [showEnrolledOnly, setShowEnrolledOnly] = useState(false)
  const [showUsageTips, setShowUsageTips] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedLayout = window.localStorage.getItem('professor-course-layout')
    if (storedLayout === 'grid' || storedLayout === 'list') {
      setLayoutMode(storedLayout)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('professor-course-layout', layoutMode)
  }, [layoutMode])

  const toCourseDisplayLabel = (value: string | number) => {
    const raw = String(value ?? '').trim()
    if (!raw) return 'N/A'

    const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelByCode[normalized]) return labelByCode[normalized]
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return 'BSED-ENGLISH'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return 'BSED-MATH'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return 'BSBA-HRM'
    return raw
  }

  const getSectionSuffix = (sectionCode: string) => {
    const text = String(sectionCode || '').trim()
    if (!text) return 'TBA'
    const parts = text.split('-').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      // Convert patterns like "101-1-A" or "1-A" into "1A"
      if (/^\d+$/.test(prev) && /^[A-Za-z]+$/.test(last)) {
        return `${prev}${last.toUpperCase()}`
      }

      return last.toUpperCase()
    }

    return text.toUpperCase()
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayLabel(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  const getBlockRosterCount = (block: ProfessorAssignedBlock) => {
    const counts = block.subjects
      .map((subject) => Number(subject.enrolledStudents ?? 0))
      .filter((count) => Number.isFinite(count) && count >= 0)

    if (counts.length === 0) return 0

    const frequency = new Map<number, number>()
    counts.forEach((count) => {
      frequency.set(count, (frequency.get(count) || 0) + 1)
    })

    let bestCount = counts[0]
    let bestFrequency = frequency.get(bestCount) || 0

    frequency.forEach((countFrequency, countValue) => {
      if (countFrequency > bestFrequency || (countFrequency === bestFrequency && countValue > bestCount)) {
        bestCount = countValue
        bestFrequency = countFrequency
      }
    })

    return bestCount
  }

  const semesterOptions = useMemo(() => {
    const semesters = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.semester) {
          semesters.add(block.semester)
        }
      })
    })
    return Array.from(semesters).sort((a, b) => a.localeCompare(b))
  }, [courses])

  const schoolYearOptions = useMemo(() => {
    const years = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.schoolYear) {
          years.add(block.schoolYear)
        }
      })
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [courses])

  const courseOptions = useMemo(() => {
    const uniqueCodes = Array.from(
      new Set(courses.map((course) => String(course.courseCode || '').trim()).filter(Boolean))
    )
    return uniqueCodes
      .map((courseCode) => ({
        value: courseCode,
        label: toCourseDisplayLabel(courseCode)
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [courses])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredCourses = useMemo(() => {
    return courses
      .filter((course) => courseFilter === 'all' || course.courseCode === courseFilter)
      .map((course) => {
        const displayCourseCode = toCourseDisplayLabel(course.courseCode)
        const courseMatch = normalizedQuery
          ? `${course.courseCode} ${displayCourseCode}`.toLowerCase().includes(normalizedQuery)
          : false

        const blocks = course.blocks
          .filter((block) => semesterFilter === 'all' || block.semester === semesterFilter)
          .filter((block) => schoolYearFilter === 'all' || block.schoolYear === schoolYearFilter)
          .map((block) => {
            const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
            const blockMatch = normalizedQuery
              ? [
                  block.sectionCode,
                  blockCode,
                  block.semester,
                  block.schoolYear,
                  block.yearLevel ? `Year ${block.yearLevel}` : ''
                ].join(' ').toLowerCase().includes(normalizedQuery)
              : false

            let subjects = normalizedQuery && !courseMatch && !blockMatch
              ? block.subjects.filter((subject) => {
                return [
                  subject.code,
                  subject.title,
                  subject.schedule,
                  subject.room
                ].join(' ').toLowerCase().includes(normalizedQuery)
              })
              : block.subjects

            if (showEnrolledOnly) {
              subjects = subjects.filter((subject) => (subject.enrolledStudents ?? 0) > 0)
            }

            if (subjectSort === 'code') {
              subjects = [...subjects].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
            } else if (subjectSort === 'students') {
              subjects = [...subjects].sort((a, b) => (b.enrolledStudents ?? 0) - (a.enrolledStudents ?? 0))
            }

            return { ...block, subjects }
          })
          .filter((block) => block.subjects.length > 0)

        return {
          ...course,
          blocks
        }
      })
      .filter((course) => course.blocks.length > 0)
  }, [courses, courseFilter, semesterFilter, schoolYearFilter, normalizedQuery, showEnrolledOnly, subjectSort])

  const totalStats = useMemo(() => {
    const blocks = courses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + getBlockRosterCount(block), 0)
    }, 0)

    return {
      courses: courses.length,
      blocks,
      subjects,
      students
    }
  }, [courses])

  const visibleStats = useMemo(() => {
    const blocks = filteredCourses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + getBlockRosterCount(block), 0)
    }, 0)

    return {
      courses: filteredCourses.length,
      blocks,
      subjects,
      students
    }
  }, [filteredCourses])

  const hasActiveFilters = Boolean(normalizedQuery)
    || courseFilter !== 'all'
    || semesterFilter !== 'all'
    || schoolYearFilter !== 'all'
    || showEnrolledOnly

  const clearFilters = () => {
    setSearchQuery('')
    setCourseFilter('all')
    setSemesterFilter('all')
    setSchoolYearFilter('all')
    setShowEnrolledOnly(false)
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">My Courses</h2>
      <p className="professor-section-desc">View and open your assigned class subjects with clear block and student details.</p>

      {showUsageTips && (
        <div className="placeholder-card professor-first-time-card">
          <div className="professor-first-time-head">
            <div className="professor-first-time-title">
              <Info size={16} />
              <span>First time on this page?</span>
            </div>
            <button
              type="button"
              className="professor-first-time-dismiss"
              onClick={() => setShowUsageTips(false)}
            >
              Hide tips
            </button>
          </div>
          <ul className="professor-first-time-list">
            <li>Use search and filters to quickly find specific classes.</li>
            <li>Switch between Grid and List to match your preferred layout.</li>
            <li>Open any subject card to see full class details and enrolled students.</li>
          </ul>
        </div>
      )}

      <div className="professor-course-stats">
        <div className="placeholder-card professor-course-stat">
          <span>Courses</span>
          <strong>{visibleStats.courses}</strong>
          <small>of {totalStats.courses}</small>
        </div>
        <div className="placeholder-card professor-course-stat">
          <span>Blocks</span>
          <strong>{visibleStats.blocks}</strong>
          <small>of {totalStats.blocks}</small>
        </div>
        <div className="placeholder-card professor-course-stat">
          <span>Subjects</span>
          <strong>{visibleStats.subjects}</strong>
          <small>of {totalStats.subjects}</small>
        </div>
        <div className="placeholder-card professor-course-stat">
          <span>Students</span>
          <strong>{visibleStats.students}</strong>
          <small>of {totalStats.students}</small>
        </div>
      </div>

      <div className="professor-course-controls">
        <label className="professor-course-search">
          <Search size={16} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search subject code, title, schedule, room, or block..."
            aria-label="Search assigned subjects"
          />
        </label>
        <div className="professor-course-filter-group">
          <label className="professor-course-select">
            <span>Course</span>
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">All</option>
              {courseOptions.map((course) => (
                <option key={course.value} value={course.value}>{course.label}</option>
              ))}
            </select>
          </label>
          <label className="professor-course-select">
            <span>Semester</span>
            <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
              <option value="all">All</option>
              {semesterOptions.map((semester) => (
                <option key={semester} value={semester}>{semester}</option>
              ))}
            </select>
          </label>
          <label className="professor-course-select">
            <span>School Year</span>
            <select value={schoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
              <option value="all">All</option>
              {schoolYearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="professor-course-toggle">
            <input
              type="checkbox"
              checked={showEnrolledOnly}
              onChange={(event) => setShowEnrolledOnly(event.target.checked)}
            />
            <span>Only with enrolled students</span>
          </label>
          {hasActiveFilters && (
            <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="professor-active-filters" aria-label="Active filters">
          {normalizedQuery && (
            <button
              type="button"
              className="professor-filter-chip"
              onClick={() => setSearchQuery('')}
              aria-label="Remove search filter"
            >
              Search: "{searchQuery.trim()}" x
            </button>
          )}
          {courseFilter !== 'all' && (
            <button
              type="button"
              className="professor-filter-chip"
              onClick={() => setCourseFilter('all')}
              aria-label="Remove course filter"
            >
              Course: {toCourseDisplayLabel(courseFilter)} x
            </button>
          )}
          {semesterFilter !== 'all' && (
            <button
              type="button"
              className="professor-filter-chip"
              onClick={() => setSemesterFilter('all')}
              aria-label="Remove semester filter"
            >
              Semester: {semesterFilter} x
            </button>
          )}
          {schoolYearFilter !== 'all' && (
            <button
              type="button"
              className="professor-filter-chip"
              onClick={() => setSchoolYearFilter('all')}
              aria-label="Remove school year filter"
            >
              School Year: {schoolYearFilter} x
            </button>
          )}
          {showEnrolledOnly && (
            <button
              type="button"
              className="professor-filter-chip"
              onClick={() => setShowEnrolledOnly(false)}
              aria-label="Disable enrolled students filter"
            >
              Enrolled only x
            </button>
          )}
        </div>
      )}

      <div className="professor-course-toolbar">
        <div className="professor-course-toolbar-start">
          <div className="professor-layout-toggle" role="group" aria-label="Course layout mode">
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'grid' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('list')}
            >
              List
            </button>
          </div>
          <label className="professor-course-select professor-course-sort">
            <span>Sort Subjects</span>
            <select
              value={subjectSort}
              onChange={(event) => setSubjectSort(event.target.value as 'default' | 'code' | 'students')}
            >
              <option value="default">Default</option>
              <option value="code">Subject Code (A-Z)</option>
              <option value="students">Most Students</option>
            </select>
          </label>
          <span className="professor-course-results">
            Showing {visibleStats.subjects} subject(s) in {visibleStats.blocks} block(s)
          </span>
        </div>
        <button className="professor-btn" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Assignments'}
        </button>
      </div>

      {error && (
        <p className="professor-data-error">{error}</p>
      )}

      {!loading && courses.length === 0 ? (
        <div className="placeholder-card">
          <h3>No assigned blocks yet</h3>
          <p>The registrar has not assigned subjects/blocks to this professor yet.</p>
        </div>
      ) : !loading && filteredCourses.length === 0 ? (
        <div className="placeholder-card">
          <h3>No matching subjects found</h3>
          <p>Try a different keyword, adjust your filters, or disable enrolled-only mode.</p>
          {hasActiveFilters && (
            <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
              Reset Search and Filters
            </button>
          )}
        </div>
      ) : (
        <div className={`professor-course-grid ${layoutMode === 'list' ? 'professor-course-layout-list' : 'professor-course-layout-grid'}`}>
          {filteredCourses.map((course) => {
            const courseSubjectCount = course.blocks.reduce((sum, block) => sum + block.subjects.length, 0)

            return (
            <div key={course.courseCode} className="placeholder-card professor-course-card">
              <div className="professor-course-header">
                <h3>{toCourseDisplayLabel(course.courseCode)}</h3>
                <span className="professor-course-summary">
                  {course.blocks.length} block(s) - {courseSubjectCount} subject(s)
                </span>
              </div>

              <div className="professor-block-list">
                {course.blocks.map((block) => {
                  const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
                  return (
                  <div
                    key={`${course.courseCode}-${block.sectionCode}-${block.semester}-${block.schoolYear}`}
                    className="professor-block-item"
                  >
                    <div className="professor-block-head">
                      <div className="professor-block-heading">
                        <strong>{blockCode}</strong>
                        <span className="professor-block-meta">
                          {block.semester} | {block.schoolYear}
                          {block.yearLevel ? ` | Year ${block.yearLevel}` : ''}
                        </span>
                      </div>
                      <div className="professor-block-metrics">
                        <span>{block.subjects.length} subject(s)</span>
                      </div>
                    </div>
                    <div className="professor-subject-list">
                      {block.subjects.map((subject) => {
                        const scheduleText = subject.schedule?.trim() ? subject.schedule : 'TBA'
                        const roomText = subject.room?.trim() ? subject.room : 'TBA'
                        const hasSchedule = Boolean(subject.schedule?.trim())
                        const hasRoom = Boolean(subject.room?.trim())
                        return (
                        <button
                          key={`${block.sectionCode}-${subject.subjectId}`}
                          type="button"
                          className="professor-subject-item professor-subject-btn"
                          onClick={() => onOpenSubjectDetail({
                            courseCode: course.courseCode,
                            blockCode,
                            sectionId: block.sectionId,
                            sectionCode: block.sectionCode,
                            semester: block.semester,
                            schoolYear: block.schoolYear,
                            subject
                          })}
                        >
                          <div className="professor-subject-main">
                            <BookOpen size={16} className="professor-subject-icon" />
                            <div className="professor-subject-text">
                              <div className="professor-subject-title">{subject.code} - {subject.title}</div>
                              <div className="professor-subject-meta professor-subject-badges">
                                <span className={`professor-subject-badge ${!hasSchedule ? 'is-missing' : ''}`}>Schedule: {scheduleText}</span>
                                <span className={`professor-subject-badge ${!hasRoom ? 'is-missing' : ''}`}>Room: {roomText}</span>
                                <span className="professor-subject-badge">Students: {subject.enrolledStudents ?? 0}</span>
                              </div>
                            </div>
                          </div>
                          <div className="professor-subject-linkhint">
                            Open class details
                            <ChevronRight size={13} />
                          </div>
                        </button>
                        )
                      })}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

interface ProfessorSubjectDetailProps {
  detail: ProfessorSubjectDetailState | null
  onBack: () => void
}

function ProfessorSubjectDetail({ detail, onBack }: ProfessorSubjectDetailProps) {
  const [students, setStudents] = useState<ProfessorAssignedStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchSubjectStudents = async () => {
      if (!detail?.sectionId) {
        setStudents([])
        setStudentsError('No section is linked to this subject assignment yet.')
        return
      }

      try {
        setStudentsLoading(true)
        setStudentsError('')

        const token = await getStoredToken()
        if (!token) {
          setStudents([])
          setStudentsError('You are not logged in.')
          return
        }

        const response = await fetchWithAutoReconnect(`${API_URL}/api/blocks/sections/${detail.sectionId}/students`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`Failed to load students: ${response.status}`)
        }

        const payload = await response.json().catch(() => ({}))
        const list = Array.isArray(payload?.students) ? payload.students : []
        if (!cancelled) {
          setStudents(list)
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        console.error('Failed to fetch subject students:', error)
        if (!cancelled) {
          if (!isNetworkRequestError(error)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(error)
              ? buildReconnectMessage('the student list')
              : (error instanceof Error ? error.message : 'Failed to load students.')
          )
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchSubjectStudents()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [detail?.sectionId])

  const formatStudentName = (student: ProfessorAssignedStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getCourseCode = (value: string | number) => {
    const text = String(value ?? '').trim()
    if (!text) return ''
    if (/^\d+$/.test(text)) return text

    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    if (normalized.includes('BEED')) return '101'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'
    return ''
  }

  const formatStudentNumber = (student: ProfessorAssignedStudent) => {
    const raw = String(student.studentNumber || '').trim()
    const fallbackCourseCode = getCourseCode(student.course ?? detail?.courseCode ?? '')

    if (!raw) return fallbackCourseCode ? `0000-${fallbackCourseCode}-00000` : 'N/A'

    const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)

    let year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
    let seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'

    const compactDigits = raw.replace(/\D+/g, '')
    if (parts.length === 1 && /^\d{8,}$/.test(compactDigits)) {
      year = compactDigits.slice(0, 4)
      seqPart = compactDigits.slice(-5)
    }

    const seq = seqPart.slice(-5).padStart(5, '0')
    const codeFromRaw = getCourseCode(parts.find((part) => /[A-Za-z]/.test(part)) || parts[1] || '')
    const courseCode = fallbackCourseCode || codeFromRaw || '000'

    return `${year}-${courseCode}-${seq}`
  }

  if (!detail) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Subject Details</h2>
        <p className="professor-section-desc">No subject selected.</p>
        <button className="professor-btn" onClick={onBack}>Back to My Courses</button>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Subject Details</h2>
      <p className="professor-section-desc">Assigned subject and block information.</p>

      <div className="professor-course-toolbar">
        <button className="professor-btn" onClick={onBack}>Back to My Courses</button>
      </div>

      <div className="placeholder-card professor-subject-detail-card">
        <div className="professor-detail-grid">
          <div><strong>Course:</strong> {detail.courseCode}</div>
          <div><strong>Block:</strong> {detail.blockCode}</div>
          <div><strong>Section:</strong> {detail.sectionCode}</div>
          <div><strong>Term:</strong> {detail.semester} {detail.schoolYear}</div>
          <div><strong>Subject Code:</strong> {detail.subject.code}</div>
          <div><strong>Subject Title:</strong> {detail.subject.title}</div>
          <div><strong>Schedule:</strong> {detail.subject.schedule || 'TBA'}</div>
          <div><strong>Room:</strong> {detail.subject.room || 'TBA'}</div>
          <div><strong>Enrolled Students:</strong> {detail.subject.enrolledStudents}</div>
        </div>
      </div>

      <div className="placeholder-card professor-subject-students-card">
        <h3>Students</h3>
        {studentsLoading ? (
          <p>Loading students...</p>
        ) : studentsError ? (
          <p className="professor-data-error">{studentsError}</p>
        ) : students.length === 0 ? (
          <p>No students found for this assigned subject/block.</p>
        ) : (
          <div className="professor-student-grid">
            {students.map((student) => (
              <div key={student._id} className="professor-student-item">
                <div className="professor-student-name">{formatStudentName(student)}</div>
                <div className="professor-student-meta">Student No: {formatStudentNumber(student)}</div>
                <div className="professor-student-meta">Course: {student.course || 'N/A'}</div>
                <div className="professor-student-meta">Year Level: {student.yearLevel ?? 'N/A'}</div>
                <div className="professor-student-meta">Status: {student.studentStatus || 'N/A'}</div>
                <div className="professor-student-meta">COR: {student.corStatus || 'Pending'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

void CourseManagementLegacy

function CourseManagement({
  professorName,
  courses,
  loading,
  error,
  onRefresh,
  onOpenSubjectDetail,
  onOpenRosterClass,
  onOpenGradesView
}: CourseManagementProps) {
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [schoolYearFilter, setSchoolYearFilter] = useState('all')
  const [subjectSort, setSubjectSort] = useState<'default' | 'code' | 'students'>('default')
  const [showEnrolledOnly, setShowEnrolledOnly] = useState(false)
  const [showUsageTips, setShowUsageTips] = useState(false)
  const [expandedBlockKeys, setExpandedBlockKeys] = useState<string[]>([])
  const [openListActionMenuId, setOpenListActionMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedLayout = window.localStorage.getItem('professor-course-layout')
    if (storedLayout === 'grid' || storedLayout === 'list') {
      setLayoutMode(storedLayout)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('professor-course-layout', layoutMode)
  }, [layoutMode])

  useEffect(() => {
    if (!showUsageTips || typeof window === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUsageTips(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showUsageTips])

  useEffect(() => {
    if (!openListActionMenuId) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.professor-subject-action-menu')) return
      setOpenListActionMenuId(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenListActionMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openListActionMenuId])

  useEffect(() => {
    if (layoutMode !== 'list') {
      setOpenListActionMenuId(null)
    }
  }, [layoutMode])

  const toCourseDisplayLabel = (value: string | number) => {
    const raw = String(value ?? '').trim()
    if (!raw) return 'N/A'

    const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelByCode[normalized]) return labelByCode[normalized]
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return 'BSED-ENGLISH'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return 'BSED-MATH'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return 'BSBA-HRM'
    return raw
  }

  const getSectionSuffix = (sectionCode: string) => {
    const text = String(sectionCode || '').trim()
    if (!text) return 'TBA'
    const parts = text.split('-').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (/^\d+$/.test(prev) && /^[A-Za-z]+$/.test(last)) {
        return `${prev}${last.toUpperCase()}`
      }

      return last.toUpperCase()
    }

    return text.toUpperCase()
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayLabel(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  const getBlockKey = (courseCode: string, block: ProfessorAssignedBlock) => {
    return [courseCode, block.sectionId || block.sectionCode, block.semester, block.schoolYear].join('|')
  }

  const getRosterClassKey = (courseCode: string, block: ProfessorAssignedBlock, subject: ProfessorAssignedSubject) => {
    if (!block.sectionId) return ''
    return `${courseCode}|${block.sectionId}|${subject.subjectId}`
  }

  const getBlockRosterCount = (block: ProfessorAssignedBlock) => {
    const counts = block.subjects
      .map((subject) => Number(subject.enrolledStudents ?? 0))
      .filter((count) => Number.isFinite(count) && count >= 0)

    if (counts.length === 0) return 0

    const frequency = new Map<number, number>()
    counts.forEach((count) => {
      frequency.set(count, (frequency.get(count) || 0) + 1)
    })

    let bestCount = counts[0]
    let bestFrequency = frequency.get(bestCount) || 0

    frequency.forEach((countFrequency, countValue) => {
      if (countFrequency > bestFrequency || (countFrequency === bestFrequency && countValue > bestCount)) {
        bestCount = countValue
        bestFrequency = countFrequency
      }
    })

    return bestCount
  }

  const formatStudentCountLabel = (count: number) => `${count} student${count === 1 ? '' : 's'}`

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const professorFirstName = useMemo(() => {
    const trimmed = String(professorName || '').trim()
    if (!trimmed) return 'Professor'
    return trimmed.split(/\s+/)[0]
  }, [professorName])

  const semesterOptions = useMemo(() => {
    const semesters = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.semester) {
          semesters.add(block.semester)
        }
      })
    })
    return Array.from(semesters).sort((a, b) => a.localeCompare(b))
  }, [courses])

  const schoolYearOptions = useMemo(() => {
    const years = new Set<string>()
    courses.forEach((course) => {
      course.blocks.forEach((block) => {
        if (block.schoolYear) {
          years.add(block.schoolYear)
        }
      })
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [courses])

  const courseOptions = useMemo(() => {
    const uniqueCodes = Array.from(
      new Set(courses.map((course) => String(course.courseCode || '').trim()).filter(Boolean))
    )
    return uniqueCodes
      .map((courseCode) => ({
        value: courseCode,
        label: toCourseDisplayLabel(courseCode)
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [courses])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredCourses = useMemo(() => {
    return courses
      .filter((course) => courseFilter === 'all' || course.courseCode === courseFilter)
      .map((course) => {
        const displayCourseCode = toCourseDisplayLabel(course.courseCode)
        const courseMatch = normalizedQuery
          ? `${course.courseCode} ${displayCourseCode}`.toLowerCase().includes(normalizedQuery)
          : false

        const blocks = course.blocks
          .filter((block) => semesterFilter === 'all' || block.semester === semesterFilter)
          .filter((block) => schoolYearFilter === 'all' || block.schoolYear === schoolYearFilter)
          .map((block) => {
            const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
            const blockMatch = normalizedQuery
              ? [
                  block.sectionCode,
                  blockCode,
                  block.semester,
                  block.schoolYear,
                  block.yearLevel ? `Year ${block.yearLevel}` : ''
                ].join(' ').toLowerCase().includes(normalizedQuery)
              : false

            let subjects = normalizedQuery && !courseMatch && !blockMatch
              ? block.subjects.filter((subject) => {
                return [
                  subject.code,
                  subject.title,
                  subject.schedule,
                  subject.room
                ].join(' ').toLowerCase().includes(normalizedQuery)
              })
              : block.subjects

            if (showEnrolledOnly) {
              subjects = subjects.filter((subject) => (subject.enrolledStudents ?? 0) > 0)
            }

            if (subjectSort === 'code') {
              subjects = [...subjects].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
            } else if (subjectSort === 'students') {
              subjects = [...subjects].sort((a, b) => (b.enrolledStudents ?? 0) - (a.enrolledStudents ?? 0))
            }

            return { ...block, subjects }
          })
          .filter((block) => block.subjects.length > 0)

        return {
          ...course,
          blocks
        }
      })
      .filter((course) => course.blocks.length > 0)
  }, [courses, courseFilter, semesterFilter, schoolYearFilter, normalizedQuery, showEnrolledOnly, subjectSort])

  const totalStats = useMemo(() => {
    const blocks = courses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = courses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => {
        return blockSum + block.subjects.reduce((subjectSum, subject) => subjectSum + (subject.enrolledStudents ?? 0), 0)
      }, 0)
    }, 0)

    return {
      courses: courses.length,
      blocks,
      subjects,
      students
    }
  }, [courses])

  const visibleStats = useMemo(() => {
    const blocks = filteredCourses.reduce((sum, course) => sum + course.blocks.length, 0)
    const subjects = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0)
    }, 0)
    const students = filteredCourses.reduce((sum, course) => {
      return sum + course.blocks.reduce((blockSum, block) => {
        return blockSum + block.subjects.reduce((subjectSum, subject) => subjectSum + (subject.enrolledStudents ?? 0), 0)
      }, 0)
    }, 0)

    return {
      courses: filteredCourses.length,
      blocks,
      subjects,
      students
    }
  }, [filteredCourses])

  const hasActiveFilters = Boolean(normalizedQuery)
    || courseFilter !== 'all'
    || semesterFilter !== 'all'
    || schoolYearFilter !== 'all'
    || subjectSort !== 'default'
    || showEnrolledOnly

  useEffect(() => {
    const allKeys = filteredCourses.flatMap((course) => course.blocks.map((block) => getBlockKey(course.courseCode, block)))
    const defaultKeys = filteredCourses.flatMap((course) => course.blocks.slice(0, 1).map((block) => getBlockKey(course.courseCode, block)))

    setExpandedBlockKeys((current) => {
      const validKeys = new Set(allKeys)
      const kept = current.filter((key) => validKeys.has(key))

      if (allKeys.length === 0) {
        return []
      }

      if (hasActiveFilters) {
        return allKeys
      }

      if (kept.length > 0) {
        return kept
      }

      return defaultKeys
    })
  }, [filteredCourses, hasActiveFilters])

  const clearFilters = () => {
    setSearchQuery('')
    setCourseFilter('all')
    setSemesterFilter('all')
    setSchoolYearFilter('all')
    setSubjectSort('default')
    setShowEnrolledOnly(false)
  }

  const toggleBlock = (blockKey: string) => {
    setExpandedBlockKeys((current) => {
      if (current.includes(blockKey)) {
        return current.filter((key) => key !== blockKey)
      }
      return [...current, blockKey]
    })
  }

  const subjectRows = useMemo(() => {
    return filteredCourses.flatMap((course) => {
      const courseLabel = toCourseDisplayLabel(course.courseCode)

      return course.blocks.flatMap((block) => {
        const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
        const blockMeta = [
          block.semester,
          block.schoolYear,
          block.yearLevel ? `Year ${block.yearLevel}` : ''
        ].filter(Boolean).join(' • ')

        return block.subjects.map((subject) => {
          const scheduleText = subject.schedule?.trim() ? subject.schedule : 'TBA'
          const roomText = subject.room?.trim() ? subject.room : 'TBA'
          const classKey = getRosterClassKey(course.courseCode, block, subject)

          return {
            key: [course.courseCode, block.sectionId || block.sectionCode, subject.subjectId].join('|'),
            courseCode: course.courseCode,
            courseLabel,
            block,
            blockCode,
            blockMeta,
            subject,
            scheduleText,
            roomText,
            classKey,
            canOpenRoster: Boolean(classKey)
          }
        })
      })
    })
  }, [filteredCourses])

  useEffect(() => {
    if (!openListActionMenuId) return
    if (!subjectRows.some((row) => row.key === openListActionMenuId)) {
      setOpenListActionMenuId(null)
    }
  }, [subjectRows, openListActionMenuId])

  const getSubjectActionItems = (
    params: {
      courseCode: string
      blockCode: string
      block: ProfessorAssignedBlock
      subject: ProfessorAssignedSubject
      classKey: string
      canOpenRoster: boolean
    }
  ) => {
    return [
      {
        key: 'open',
        label: 'Open Class',
        icon: Eye,
        isPrimary: true,
        onSelect: () => onOpenSubjectDetail({
          courseCode: params.courseCode,
          blockCode: params.blockCode,
          sectionId: params.block.sectionId,
          sectionCode: params.block.sectionCode,
          semester: params.block.semester,
          schoolYear: params.block.schoolYear,
          subject: params.subject
        })
      },
      {
        key: 'students',
        label: 'Students',
        icon: GraduationCap,
        disabled: !params.canOpenRoster,
        onSelect: () => {
          if (params.canOpenRoster) {
            onOpenRosterClass(params.classKey, 'students')
          }
        }
      },
      {
        key: 'attendance',
        label: 'Attendance',
        icon: CalendarDays,
        disabled: !params.canOpenRoster,
        onSelect: () => {
          if (params.canOpenRoster) {
            onOpenRosterClass(params.classKey, 'attendance')
          }
        }
      },
      {
        key: 'grades',
        label: 'Grades',
        icon: Award,
        onSelect: () => onOpenGradesView(params.classKey)
      }
    ]
  }

  const renderSubjectActionMenu = (
    menuId: string,
    params: {
      courseCode: string
      blockCode: string
      block: ProfessorAssignedBlock
      subject: ProfessorAssignedSubject
      classKey: string
      canOpenRoster: boolean
    },
    options?: {
      menuClassName?: string
      align?: 'start' | 'end'
    }
  ) => {
    const isOpen = openListActionMenuId === menuId
    const actionItems = getSubjectActionItems(params)
    const menuClassName = ['professor-subject-action-menu', options?.menuClassName].filter(Boolean).join(' ')
    const dropdownClassName = [
      'professor-subject-action-dropdown',
      options?.align === 'start' ? 'align-start' : ''
    ].filter(Boolean).join(' ')

    return (
      <div className={menuClassName}>
        <button
          type="button"
          className={`professor-subject-action-menu-toggle ${isOpen ? 'open' : ''}`}
          onClick={() => setOpenListActionMenuId((current) => current === menuId ? null : menuId)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <span>Actions</span>
          <MoreHorizontal size={16} />
        </button>

        {isOpen && (
          <div className={dropdownClassName} role="menu" aria-label={`Actions for ${params.subject.title || params.subject.code || 'subject'}`}>
            {actionItems.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`professor-subject-action-dropdown-item ${item.isPrimary ? 'is-primary' : ''}`}
                  onClick={() => {
                    setOpenListActionMenuId(null)
                    item.onSelect()
                  }}
                  disabled={item.disabled}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="professor-section professor-course-management">
      <div className="placeholder-card professor-course-hero">
        <div className="professor-course-hero-copy">
          <span className="professor-course-hero-eyebrow">{greeting}, {professorFirstName}</span>
          <h2 className="professor-section-title">My Courses</h2>
          <p className="professor-section-desc">
            Review your teaching load by course, expand a block only when you need it, and jump straight into your class tools.
          </p>
        </div>
        <div className="professor-course-hero-actions">
          <button type="button" className="professor-course-help-trigger" onClick={() => setShowUsageTips(true)}>
            <Info size={16} />
            <span>Usage tips</span>
          </button>
          <button className="professor-btn" onClick={() => void onRefresh()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Assignments'}
          </button>
        </div>
      </div>

      <div className="placeholder-card professor-course-stats professor-course-statbar">
        {[
          { label: 'Courses', value: visibleStats.courses, total: totalStats.courses },
          { label: 'Blocks', value: visibleStats.blocks, total: totalStats.blocks },
          { label: 'Subjects', value: visibleStats.subjects, total: totalStats.subjects },
          { label: 'Students', value: visibleStats.students, total: totalStats.students }
        ].map((stat) => (
          <div key={stat.label} className="professor-course-stat professor-course-statbar-item">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.value === stat.total ? `${stat.total} total` : `${stat.total} total assigned`}</small>
          </div>
        ))}
      </div>

      <div className="placeholder-card professor-course-filter-shell">
        <div className="professor-course-controls professor-course-filter-row">
          <label className="professor-course-search">
            <Search size={16} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search subject code, title, schedule, room, or block..."
              aria-label="Search assigned subjects"
            />
          </label>
          <div className="professor-course-filter-group">
            <label className="professor-course-select">
              <span>Course</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course.value} value={course.value}>{course.label}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select">
              <span>Semester</span>
              <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
                <option value="all">All semesters</option>
                {semesterOptions.map((semester) => (
                  <option key={semester} value={semester}>{semester}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select">
              <span>School year</span>
              <select value={schoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
                <option value="all">All school years</option>
                {schoolYearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="professor-course-select professor-course-sort">
              <span>Sort</span>
              <select
                value={subjectSort}
                onChange={(event) => setSubjectSort(event.target.value as 'default' | 'code' | 'students')}
              >
                <option value="default">Default</option>
                <option value="code">Subject code</option>
                <option value="students">Student count</option>
              </select>
            </label>
            <label className="professor-course-toggle">
              <input
                type="checkbox"
                checked={showEnrolledOnly}
                onChange={(event) => setShowEnrolledOnly(event.target.checked)}
              />
              <span>Only show classes with enrolled students</span>
            </label>
            {hasActiveFilters && (
              <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="professor-active-filters" aria-label="Active filters">
          {normalizedQuery && (
            <button type="button" className="professor-filter-chip" onClick={() => setSearchQuery('')}>
              Search: "{searchQuery.trim()}" x
            </button>
          )}
          {courseFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setCourseFilter('all')}>
              Course: {toCourseDisplayLabel(courseFilter)} x
            </button>
          )}
          {semesterFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSemesterFilter('all')}>
              Semester: {semesterFilter} x
            </button>
          )}
          {schoolYearFilter !== 'all' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSchoolYearFilter('all')}>
              School Year: {schoolYearFilter} x
            </button>
          )}
          {subjectSort !== 'default' && (
            <button type="button" className="professor-filter-chip" onClick={() => setSubjectSort('default')}>
              Sort: {subjectSort === 'code' ? 'Subject code' : 'Student count'} x
            </button>
          )}
          {showEnrolledOnly && (
            <button type="button" className="professor-filter-chip" onClick={() => setShowEnrolledOnly(false)}>
              Enrolled only x
            </button>
          )}
        </div>
      )}

      <div className="professor-course-toolbar">
        <div className="professor-course-results">
          <strong>{visibleStats.subjects} subject(s)</strong>
          <span>Across {visibleStats.blocks} block(s) in {visibleStats.courses} course(s)</span>
        </div>
        <div className="professor-course-toolbar-start">
          <div className="professor-layout-toggle" role="group" aria-label="Subject card layout mode">
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'grid' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('grid')}
            >
              <Grid3X3 size={14} />
              Grid
            </button>
            <button
              type="button"
              className={`professor-layout-btn ${layoutMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setLayoutMode('list')}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="professor-data-error">{error}</p>
      )}

      {loading && courses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>Loading your teaching load</h3>
          <p>Please wait while your assigned courses and blocks are being prepared.</p>
        </div>
      ) : !loading && courses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>No assigned blocks yet</h3>
          <p>The registrar has not assigned subjects or block sections to this professor yet.</p>
        </div>
      ) : !loading && filteredCourses.length === 0 ? (
        <div className="placeholder-card professor-empty-state">
          <h3>No matching subjects found</h3>
          <p>Try another keyword, change the sort, or clear the current filters.</p>
          {hasActiveFilters && (
            <button type="button" className="professor-btn professor-btn-secondary" onClick={clearFilters}>
              Reset filters
            </button>
          )}
        </div>
      ) : layoutMode === 'list' ? (
        <section className="professor-course-list" aria-label="Assigned subjects list">
          <div className="professor-course-list-header" aria-hidden="true">
            <span className="professor-course-list-heading professor-course-list-heading-code">Subject Code</span>
            <span className="professor-course-list-heading professor-course-list-heading-title">Subject Title</span>
            <span className="professor-course-list-heading professor-course-list-heading-course">Course</span>
            <span className="professor-course-list-heading professor-course-list-heading-block">Block</span>
            <span className="professor-course-list-heading professor-course-list-heading-schedule">Schedule</span>
            <span className="professor-course-list-heading professor-course-list-heading-room">Room</span>
            <span className="professor-course-list-heading professor-course-list-heading-actions">Actions</span>
          </div>
          <div className="professor-course-list-body">
            {subjectRows.map((row) => (
              <article key={row.key} className="professor-course-list-row">
                <div className="professor-course-list-cell professor-course-list-cell-code" data-label="Subject Code">
                  <span className="professor-course-list-code">{row.subject.code || 'N/A'}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-title" data-label="Subject Title">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-title">{row.subject.title || 'Untitled subject'}</strong>
                    <span className="professor-course-list-inline-meta">
                      {row.courseLabel} • {row.blockCode}
                    </span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-course" data-label="Course">
                  <span className="professor-course-list-text">{row.courseLabel}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-block" data-label="Block">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-block">{row.blockCode}</strong>
                    <span className="professor-course-list-note">{row.blockMeta}</span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-schedule" data-label="Schedule">
                  <div className="professor-course-list-primary">
                    <strong className="professor-course-list-text">{row.scheduleText}</strong>
                    <span className="professor-course-list-mobile-note">Room {row.roomText}</span>
                  </div>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-room" data-label="Room">
                  <span className="professor-course-list-text">Room {row.roomText}</span>
                </div>
                <div className="professor-course-list-cell professor-course-list-cell-actions" data-label="Actions">
                  {renderSubjectActionMenu(row.key, {
                    courseCode: row.courseCode,
                    blockCode: row.blockCode,
                    block: row.block,
                    subject: row.subject,
                    classKey: row.classKey,
                    canOpenRoster: row.canOpenRoster
                  }, {
                    menuClassName: 'professor-subject-action-menu-list',
                    align: 'end'
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="professor-course-grid professor-course-layout-grid">
          {filteredCourses.map((course) => {
            const courseSubjectCount = course.blocks.reduce((sum, block) => sum + block.subjects.length, 0)

            return (
              <article key={course.courseCode} className="placeholder-card professor-course-card">
                <div className="professor-course-header">
                  <div className="professor-course-header-main">
                    <span className="professor-course-label">Course</span>
                    <h3>{toCourseDisplayLabel(course.courseCode)}</h3>
                  </div>
                  <div className="professor-course-summary">
                    <span>{course.blocks.length} block(s)</span>
                    <span>{courseSubjectCount} subject(s)</span>
                  </div>
                </div>

                <div className="professor-block-list">
                  {course.blocks.map((block) => {
                    const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
                    const blockKey = getBlockKey(course.courseCode, block)
                    const isExpanded = expandedBlockKeys.includes(blockKey)
                    const blockStudentCount = getBlockRosterCount(block)
                    const blockStudentLabel = formatStudentCountLabel(blockStudentCount)

                    return (
                      <section
                        key={`${course.courseCode}-${block.sectionCode}-${block.semester}-${block.schoolYear}`}
                        className={`professor-block-item ${isExpanded ? 'is-expanded' : ''}`}
                      >
                        <button
                          type="button"
                          className="professor-block-toggle"
                          onClick={() => toggleBlock(blockKey)}
                          aria-expanded={isExpanded}
                        >
                          <div className="professor-block-toggle-main">
                            <span className="professor-block-label">Block</span>
                            <strong>{blockCode}</strong>
                            <span className="professor-block-meta">
                              {block.semester} • {block.schoolYear}
                              {block.yearLevel ? ` • Year ${block.yearLevel}` : ''}
                            </span>
                          </div>
                          <div className="professor-block-toggle-side">
                            <div className="professor-block-metrics">
                              <span>{blockStudentLabel}</span>
                              <span>{block.subjects.length} subjects</span>
                            </div>
                            <ChevronRight size={16} className={`professor-block-chevron ${isExpanded ? 'is-expanded' : ''}`} />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="professor-subject-list">
                            {block.subjects.map((subject) => {
                              const scheduleText = subject.schedule?.trim() ? subject.schedule : 'TBA'
                              const roomText = subject.room?.trim() ? subject.room : 'TBA'
                              const classKey = getRosterClassKey(course.courseCode, block, subject)
                              const canOpenRoster = Boolean(classKey)
                              const subjectMenuId = [course.courseCode, block.sectionId || block.sectionCode, subject.subjectId].join('|')

                              return (
                                <article key={`${block.sectionCode}-${subject.subjectId}`} className="professor-subject-item">
                                  <div className="professor-subject-card-head">
                                    <div className="professor-subject-code-row">
                                      <span className="professor-subject-code">
                                        <BookOpen size={15} />
                                        {subject.code || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="professor-subject-title">{subject.title}</div>
                                  </div>

                                  <div className="professor-subject-facts">
                                    <span className="professor-subject-fact">
                                      <Clock size={14} />
                                      {scheduleText}
                                    </span>
                                    <span className="professor-subject-fact">
                                      <MapPin size={14} />
                                      Room {roomText}
                                    </span>
                                  </div>

                                  <div className="professor-subject-actions">
                                    {renderSubjectActionMenu(subjectMenuId, {
                                      courseCode: course.courseCode,
                                      blockCode,
                                      block,
                                      subject,
                                      classKey,
                                      canOpenRoster
                                    }, {
                                      menuClassName: 'professor-subject-action-menu-grid',
                                      align: 'end'
                                    })}
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showUsageTips && (
        <div className="professor-help-modal-backdrop" onClick={() => setShowUsageTips(false)}>
          <div className="professor-help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="professor-help-modal-header">
              <div>
                <span className="professor-course-hero-eyebrow">Quick help</span>
                <h3>Using My Courses</h3>
              </div>
              <button type="button" className="professor-btn-xs professor-btn-secondary" onClick={() => setShowUsageTips(false)}>
                Close
              </button>
            </div>
            <div className="professor-help-modal-content">
              <p>
                Expand a block only when you need its subjects, then use the action buttons on each card to jump into the right class workflow.
              </p>
              <ul>
                <li>Use the filter row to narrow by course, semester, school year, or student enrollment.</li>
                <li>Switch between grid and list if you want either compact scanning or a roomier subject view.</li>
                <li>Use Open Class for a subject overview, Students for the roster, Attendance for attendance-focused roster access, and Grades for grade tools.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StudentManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  initialClassKey?: string
  entryMode?: 'students' | 'attendance'
}

function StudentManagement({ courses, loading, error, onRefresh, initialClassKey = '', entryMode = 'students' }: StudentManagementProps) {
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [selectedSectionKey, setSelectedSectionKey] = useState('all')
  const [students, setStudents] = useState<ProfessorRosterStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all')
  const [sortBy, setSortBy] = useState<RosterSortBy>('name-asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState<ProfessorRosterStudent | null>(null)

  const formatCourseLabel = (value: string | number) => {
    const text = String(value || '').trim()
    if (!text) return ''
    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelsByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelsByCode[normalized]) return labelsByCode[normalized]
    if (normalized.includes('BEED') || normalized.includes('ELEMENTARYEDUCATION')) return 'BEED'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) {
      return 'BSED-ENGLISH'
    }
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) {
      return 'BSED-MATH'
    }
    if (
      normalized.includes('BSBA-HRM')
      || normalized === 'HRM'
      || (normalized.includes('BSBA') && normalized.includes('HRM'))
    ) {
      return 'BSBA-HRM'
    }
    return text
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    return `${formatCourseLabel(courseCode)} ${sectionCode}`.trim()
  }

  const classOptions = useMemo<ProfessorRosterClassOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .flatMap((block) => {
          return block.subjects.map((subject) => {
            const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
            return {
              key: `${course.courseCode}|${block.sectionId}|${subject.subjectId}`,
              courseCode: course.courseCode,
              blockCode,
              sectionId: block.sectionId as string,
              sectionCode: block.sectionCode,
              semester: block.semester,
              schoolYear: block.schoolYear,
              yearLevel: block.yearLevel,
              subjectId: subject.subjectId,
              subjectCode: subject.code,
              subjectTitle: subject.title,
              schedule: subject.schedule || 'TBA',
              room: subject.room || 'TBA'
            }
          })
        })
    })
  }, [courses])

  const sectionOptions = useMemo<ProfessorRosterSectionOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .map((block) => ({
          key: `${course.courseCode}|${block.sectionId}`,
          courseCode: course.courseCode,
          blockCode: formatBlockCode(course.courseCode, block.sectionCode),
          sectionId: block.sectionId as string,
          sectionCode: block.sectionCode,
          semester: block.semester,
          schoolYear: block.schoolYear,
          yearLevel: block.yearLevel,
          subjectCount: block.subjects.length
        }))
    })
  }, [courses])

  const selectedClass = useMemo(
    () => classOptions.find((item) => item.key === selectedClassKey) || null,
    [classOptions, selectedClassKey]
  )

  const selectedSection = useMemo(
    () => sectionOptions.find((item) => item.key === selectedSectionKey) || null,
    [sectionOptions, selectedSectionKey]
  )

  useEffect(() => {
    if (!initialClassKey) return
    const matchedClass = classOptions.find((item) => item.key === initialClassKey)
    if (matchedClass) {
      setSelectedClassKey(initialClassKey)
      setSelectedSectionKey(`${matchedClass.courseCode}|${matchedClass.sectionId}`)
      setSearchQuery('')
      setStatusFilter('all')
      setSortBy('name-asc')
      setCurrentPage(1)
    }
  }, [classOptions, initialClassKey])

  useEffect(() => {
    const active = classOptions.some((item) => item.key === selectedClassKey)
    if (!active && selectedClassKey) {
      setSelectedClassKey('')
    }
  }, [classOptions, selectedClassKey])

  useEffect(() => {
    if (selectedSectionKey === 'all') return
    const active = sectionOptions.some((item) => item.key === selectedSectionKey)
    if (!active) {
      setSelectedSectionKey('all')
    }
  }, [sectionOptions, selectedSectionKey])

  const getName = (student: ProfessorRosterStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getStudentCourseDisplay = (student?: ProfessorRosterStudent | null) => {
    const rawCourse = String(student?.course || selectedSection?.courseCode || selectedClass?.courseCode || '').trim()
    return formatCourseLabel(rawCourse) || rawCourse || 'N/A'
  }

  const normalizeCourseCode = (courseCode: string) => {
    const normalized = String(courseCode || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return ''
    if (/^\d{3,5}$/.test(normalized)) return normalized
    if (normalized.includes('BEED')) return '101'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) return '102'
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM' || (normalized.includes('BSBA') && normalized.includes('HRM'))) return '201'
    return normalized.slice(0, 3) || 'COURSE'
  }

  const formatStudentNumber = (rawValue: string | number, fallbackCourseCode: string) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return ''
    const cleaned = raw.replace(/\s+/g, '')
    if (!/[A-Za-z]/.test(cleaned) && /^\d{4,}/.test(cleaned)) {
      const compact = cleaned.replace(/\D+/g, '')
      if (compact.length >= 9) {
        const year = compact.slice(0, 4)
        const seq = compact.slice(-5).padStart(5, '0')
        return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
      }
    }

    const parts = cleaned.split('-').filter(Boolean)
    if (parts.length >= 3) {
      const year = parts[0] || '0000'
      const seq = parts[parts.length - 1] || '00000'
      const sourceCode = parts.find((part) => /[A-Za-z]/.test(part)) || fallbackCourseCode
      return `${year}-${normalizeCourseCode(sourceCode)}-${String(seq).slice(-5).padStart(5, '0')}`
    }

    const firstDigits = cleaned.replace(/\D+/g, '')
    const year = firstDigits.slice(0, 4) || '0000'
    const seq = firstDigits.slice(-5).padStart(5, '0')
    return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
  }

  const rosterTargets = useMemo(() => {
    if (selectedSection) {
      return [selectedSection]
    }
    return sectionOptions
  }, [sectionOptions, selectedSection])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchStudents = async () => {
      if (rosterTargets.length === 0) {
        setStudents([])
        setStudentsError('')
        return
      }

      try {
        setStudentsLoading(true)
        setStudentsError('')

        const token = await getStoredToken()
        if (!token) {
          setStudents([])
          setStudentsError('You are not logged in.')
          return
        }

        const responses = await Promise.all(rosterTargets.map(async (target) => {
          const matchedSubjectContext = selectedClass?.sectionId === target.sectionId ? selectedClass : null
          const endpoint = matchedSubjectContext
            ? `${API_URL}/api/professor/sections/${target.sectionId}/subjects/${matchedSubjectContext.subjectId}/students?${new URLSearchParams({
                semester: matchedSubjectContext.semester,
                schoolYear: matchedSubjectContext.schoolYear
              }).toString()}`
            : `${API_URL}/api/blocks/sections/${target.sectionId}/students`

          const response = await fetchWithAutoReconnect(endpoint, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch students: ${response.status}`)
          }

          const payload = await response.json().catch(() => ({}))
          const rosterRows = matchedSubjectContext
            ? (Array.isArray(payload?.data?.students) ? payload.data.students : [])
            : (Array.isArray(payload?.students) ? payload.students : [])
          return { target, rosterRows }
        }))

        const normalized = responses.flatMap(({ target, rosterRows }) => {
          return rosterRows.map((raw: any, index: number) => {
            const yearLevel = typeof raw?.yearLevel === 'number' ? raw.yearLevel : Number(raw?.yearLevel)
            const rawId = String(raw?._id || raw?.id || raw?.studentNumber || raw?.studentId || index)
            const matchedSubjectContext = selectedClass?.sectionId === target.sectionId ? selectedClass : null
            return {
              _id: String(raw?._id || raw?.id || ''),
              rosterEntryKey: `${target.sectionId}-${rawId}-${index}`,
              enrollmentId: raw?.enrollmentId ? String(raw.enrollmentId) : undefined,
              subjectEntryId: raw?.subjectEntryId ? String(raw.subjectEntryId) : undefined,
              studentNumber: formatStudentNumber(
                raw?.studentNumber || raw?.studentId || '',
                target.courseCode
              ),
              firstName: String(raw?.firstName || ''),
              middleName: raw?.middleName ? String(raw.middleName) : '',
              lastName: String(raw?.lastName || ''),
              suffix: raw?.suffix ? String(raw.suffix) : '',
              yearLevel: Number.isFinite(yearLevel) ? yearLevel : undefined,
              studentStatus: raw?.studentStatus || raw?.status || 'Active',
              course: target.courseCode || raw?.course || '',
              email: raw?.email || 'Not provided',
              contactNumber: raw?.contactNumber || 'Not provided',
              assignedAt: raw?.assignedAt,
              attendancePercentage: raw?.attendancePercentage,
              latestGrade: raw?.latestGrade,
              currentGrade: raw?.currentGrade ?? raw?.grade ?? '',
              remarks: raw?.remarks || '',
              attendanceRecord: Array.isArray(raw?.attendanceRecord) ? raw.attendanceRecord : undefined,
              quizScores: Array.isArray(raw?.quizScores) ? raw.quizScores : undefined,
              assignmentScores: Array.isArray(raw?.assignmentScores) ? raw.assignmentScores : undefined,
              classBlockCode: target.blockCode,
              classSectionCode: target.sectionCode,
              classSubjectCode: matchedSubjectContext?.subjectCode || '',
              classSubjectTitle: matchedSubjectContext?.subjectTitle || '',
              classSemester: target.semester,
              classSchoolYear: target.schoolYear,
              subjectStatus: raw?.subjectStatus ? String(raw.subjectStatus) : undefined,
              gradeUpdatedAt: raw?.gradeUpdatedAt ? String(raw.gradeUpdatedAt) : undefined
            } as ProfessorRosterStudent
          })
        })
        if (!cancelled) {
          setStudents(normalized)
          setCurrentPage(1)
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        if (!cancelled) {
          if (!isNetworkRequestError(error)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(error)
              ? buildReconnectMessage('the student roster')
              : (error instanceof Error ? error.message : 'Failed to load students for selected class.')
          )
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchStudents()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [rosterTargets, selectedClass])

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let result = [...students]

    if (query) {
      result = result.filter((student) => {
        const studentName = getName(student).toLowerCase()
        return (
          studentName.includes(query) ||
          String(student.studentNumber).toLowerCase().includes(query) ||
          String(student.course || '').toLowerCase().includes(query) ||
          getStudentCourseDisplay(student).toLowerCase().includes(query) ||
          String(student.classBlockCode || '').toLowerCase().includes(query) ||
          String(student.classSubjectCode || '').toLowerCase().includes(query) ||
          String(student.classSubjectTitle || '').toLowerCase().includes(query)
        )
      })
    }

    if (statusFilter !== 'all') {
      result = result.filter((student) => {
        const status = String(student.studentStatus || student.status || '').toLowerCase()
        if (statusFilter === 'active') {
          return status.includes('active')
        }
        return status.includes('drop') || status.includes('dropped')
      })
    }

    switch (sortBy) {
      case 'name-desc':
        result.sort((a, b) => getName(b).localeCompare(getName(a), undefined, { sensitivity: 'base' }))
        break
      case 'id-asc':
        result.sort((a, b) => String(a.studentNumber).localeCompare(String(b.studentNumber), undefined, { numeric: true }))
        break
      case 'id-desc':
        result.sort((a, b) => String(b.studentNumber).localeCompare(String(a.studentNumber), undefined, { numeric: true }))
        break
      case 'name-asc':
      default:
        result.sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }))
        break
    }
    return result
  }, [students, searchQuery, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / 10))
  const currentPageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10)
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const totalStudents = students.length
  const hasGrades = students.some((student) => student.currentGrade || student.latestGrade)
  const rosterScopeLabel = selectedSection ? selectedSection.blockCode : 'All assigned classes'
  const rosterProgramCount = new Set(rosterTargets.map((target) => String(target.courseCode || '').trim()).filter(Boolean)).size
  const rosterClassCount = rosterTargets.length

  const gradeTotals = students
    .map((student) => Number(student.currentGrade ?? student.latestGrade))
    .filter((value) => Number.isFinite(value))

  const classAverageGrade = gradeTotals.length > 0
    ? (gradeTotals.reduce((sum, value) => sum + value, 0) / gradeTotals.length).toFixed(2)
    : 'N/A'

  const exportRoster = () => {
    if (students.length === 0) {
      return
    }
    const rows = students.map((student) => [
      formatStudentNumber(student.studentNumber, String(student.course || selectedSection?.courseCode || selectedClass?.courseCode || '')),
      getName(student),
      getStudentCourseDisplay(student),
      String(student.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'),
      String(student.yearLevel ?? ''),
      student.email || '',
      String(student.currentGrade ?? student.latestGrade ?? ''),
      student.studentStatus || 'Active'
    ])
    const header = ['Student ID', 'Full Name', 'Program/Course', 'Block / Section', 'Year Level', 'Email', 'Current Grade', 'Status']
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = selectedClass
      ? `${selectedClass.subjectCode}-${selectedClass.sectionCode}-roster.csv`
      : selectedSection
        ? `${selectedSection.blockCode}-roster.csv`
        : 'assigned-students-roster.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const sendAnnouncement = () => {
    if (!selectedClass) return
    alert(`Announcement form for ${selectedClass.subjectCode} ${selectedClass.sectionCode} will be available in the class communication module.`)
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <p>Loading your assigned classes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <p className="professor-data-error">{error}</p>
        <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Retry</button>
      </div>
    )
  }

  if (classOptions.length === 0) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Student Roster</h2>
        <p className="professor-section-desc">View enrolled students for your assigned courses.</p>
        <div className="placeholder-card">
          <h3>No assigned class found</h3>
          <p>No classes are currently assigned to your account.</p>
          <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Refresh Assignments</button>
        </div>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Student Roster</h2>
      <p className="professor-section-desc">View enrolled students for your assigned courses.</p>

      <div className="professor-roster-controls">
        <div className="professor-roster-class-select">
          <label htmlFor="professor-class-select">Block / Section Filter</label>
          <select
            id="professor-class-select"
            value={selectedSectionKey}
            onChange={(event) => {
              const nextValue = event.target.value
              setSelectedSectionKey(nextValue)
              if (nextValue === 'all') {
                setSelectedClassKey('')
              } else if (selectedClass && `${selectedClass.courseCode}|${selectedClass.sectionId}` !== nextValue) {
                setSelectedClassKey('')
              }
              setSearchQuery('')
              setStatusFilter('all')
              setSortBy('name-asc')
              setCurrentPage(1)
            }}
          >
            <option value="all">All assigned classes</option>
            {sectionOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.blockCode} - {option.subjectCount} subject(s)
              </option>
            ))}
          </select>
        </div>

        <div className="professor-tool-actions">
          <button
            type="button"
            className="professor-btn"
            onClick={exportRoster}
            disabled={students.length === 0}
          >
            <Download size={14} />
            Export Roster
          </button>
          {selectedClass && (
            <button
              type="button"
              className="professor-btn professor-btn-secondary"
              onClick={sendAnnouncement}
            >
              <Send size={14} />
              Send Announcement to Class
            </button>
          )}
        </div>
      </div>

      {entryMode === 'attendance' && selectedClass && (
        <div className="professor-inline-note">
          Attendance quick access is open for <strong>{selectedClass.subjectCode}</strong>. Review each student profile for any attendance data currently available.
        </div>
      )}

      <>
        <div className="professor-class-overview">
          <div className="professor-overview-row"><span>Scope</span><strong>{rosterScopeLabel}</strong></div>
          <div className="professor-overview-row"><span>Subject</span><strong>{selectedClass ? `${selectedClass.subjectCode} - ${selectedClass.subjectTitle}` : 'All subjects in view'}</strong></div>
          <div className="professor-overview-row"><span>Schedule</span><strong>{selectedClass ? selectedClass.schedule : 'Mixed schedules'}</strong></div>
          <div className="professor-overview-row"><span>Semester / School Year</span><strong>{selectedSection ? `${selectedSection.semester} / ${selectedSection.schoolYear}` : 'Across assigned classes'}</strong></div>
          <div className="professor-overview-row"><span>Visible Classes</span><strong>{rosterClassCount}</strong></div>
          <div className="professor-overview-row"><span>Total Students</span><strong>{totalStudents}</strong></div>
        </div>

        <div className="professor-summary-grid">
          <div className="professor-summary-card">
            <span>Total Students</span>
            <strong>{totalStudents}</strong>
          </div>
          <div className="professor-summary-card">
            <span>Programs / Courses</span>
            <strong>{rosterProgramCount}</strong>
          </div>
          <div className="professor-summary-card">
            <span>Class Average Grade</span>
            <strong>{classAverageGrade}</strong>
            {!hasGrades && <small>not available</small>}
          </div>
        </div>

        <div className="professor-roster-toolbar">
          <div className="professor-roster-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search name, student ID, course, section, or subject"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | 'active' | 'dropped')
                setCurrentPage(1)
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="dropped">Dropped</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as RosterSortBy)
                setCurrentPage(1)
              }}
            >
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="id-asc">Student ID</option>
              <option value="id-desc">Student ID (desc)</option>
            </select>
          </label>
        </div>

        <div className="professor-table-wrap">
          <table className="professor-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Program / Course</th>
                <th>Block / Section</th>
                <th>Year Level</th>
                <th>Email</th>
                <th>Current Grade</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading ? (
                <tr>
                  <td colSpan={9}>Loading students...</td>
                </tr>
              ) : studentsError ? (
                <tr>
                  <td colSpan={9} className="professor-data-error">{studentsError}</td>
                </tr>
              ) : currentPageStudents.length === 0 ? (
                <tr>
                  <td colSpan={9}>No students matched the current filters.</td>
                </tr>
              ) : (
                currentPageStudents.map((student) => (
                  <tr key={student.rosterEntryKey}>
                    <td>{student.studentNumber}</td>
                    <td>{getName(student)}</td>
                    <td>{getStudentCourseDisplay(student)}</td>
                    <td>{student.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'}</td>
                    <td>{student.yearLevel ?? 'N/A'}</td>
                    <td>{student.email || 'Not provided'}</td>
                    <td>{student.currentGrade ?? student.latestGrade ?? 'N/A'}</td>
                    <td>{student.studentStatus || student.status || 'Active'}</td>
                    <td className="professor-table-actions">
                      <button type="button" className="professor-btn-xs" onClick={() => setSelectedStudent(student)}>
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {currentPageStudents.length > 0 && (
          <div className="professor-pagination">
            <button type="button" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={!canGoPrev}>
              Prev
            </button>
            <span>{`Page ${currentPage} of ${totalPages}`}</span>
            <button type="button" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={!canGoNext}>
              Next
            </button>
          </div>
        )}
      </>

      {selectedStudent && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedStudent(null)}>
          <div className="professor-student-modal" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>Student Profile</h3>
              <button type="button" className="professor-btn-xs" onClick={() => setSelectedStudent(null)}>
                Close
              </button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Full Name:</strong> {getName(selectedStudent)}</div>
                <div><strong>Student ID:</strong> {selectedStudent.studentNumber}</div>
                <div><strong>Program / Course:</strong> {getStudentCourseDisplay(selectedStudent)}</div>
                <div><strong>Year Level:</strong> {selectedStudent.yearLevel ?? 'N/A'}</div>
                <div><strong>Block / Section:</strong> {selectedStudent.classBlockCode || selectedSection?.blockCode || selectedClass?.blockCode || 'N/A'}</div>
                <div><strong>Subject:</strong> {selectedStudent.classSubjectCode ? `${selectedStudent.classSubjectCode} - ${selectedStudent.classSubjectTitle || 'Untitled subject'}` : 'Multiple subjects in view'}</div>
                <div><strong>Email:</strong> {selectedStudent.email || 'Not provided'}</div>
                <div><strong>Contact Number:</strong> {selectedStudent.contactNumber || 'Not provided'}</div>
                <div><strong>Enrollment Status:</strong> {selectedStudent.studentStatus || selectedStudent.status || 'Active'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


interface ScheduleManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
}

interface GradesManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  initialClassKey?: string
}

function GradesManagement({ courses, loading, error, onRefresh, initialClassKey = '' }: GradesManagementProps) {
  type GradeSortBy = 'name-asc' | 'name-desc' | 'grade-asc' | 'grade-desc'

  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [students, setStudents] = useState<ProfessorRosterStudent[]>([])
  const [selectedStudent, setSelectedStudent] = useState<ProfessorRosterStudent | null>(null)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<GradeSortBy>('name-asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [savingStudentIds, setSavingStudentIds] = useState<string[]>([])
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({})
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [pendingFocusStudentId, setPendingFocusStudentId] = useState('')
  const gradeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const formatCourseLabel = (value: string | number) => {
    const text = String(value || '').trim()
    if (!text) return ''
    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelsByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelsByCode[normalized]) return labelsByCode[normalized]
    if (normalized.includes('BEED') || normalized.includes('ELEMENTARYEDUCATION')) return 'BEED'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) {
      return 'BSED-ENGLISH'
    }
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) {
      return 'BSED-MATH'
    }
    if (
      normalized.includes('BSBA-HRM')
      || normalized === 'HRM'
      || (normalized.includes('BSBA') && normalized.includes('HRM'))
    ) {
      return 'BSBA-HRM'
    }
    return text
  }

  const normalizeCourseCode = (courseCode: string) => {
    const normalized = String(courseCode || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return ''
    if (/^\d{3,5}$/.test(normalized)) return normalized
    if (normalized.includes('BEED')) return '101'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) return '102'
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM' || (normalized.includes('BSBA') && normalized.includes('HRM'))) return '201'
    return normalized.slice(0, 3) || 'COURSE'
  }

  const formatStudentNumber = (rawValue: string | number, fallbackCourseCode: string) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return ''

    const cleaned = raw.replace(/\s+/g, '')
    if (!/[A-Za-z]/.test(cleaned) && /^\d{4,}/.test(cleaned)) {
      const compact = cleaned.replace(/\D+/g, '')
      if (compact.length >= 9) {
        const year = compact.slice(0, 4)
        const seq = compact.slice(-5).padStart(5, '0')
        return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
      }
    }

    const parts = cleaned.split('-').filter(Boolean)
    if (parts.length >= 3) {
      const year = parts[0] || '0000'
      const seq = parts[parts.length - 1] || '00000'
      const sourceCode = parts.find((part) => /[A-Za-z]/.test(part)) || fallbackCourseCode
      return `${year}-${normalizeCourseCode(sourceCode)}-${String(seq).slice(-5).padStart(5, '0')}`
    }

    const compact = cleaned.replace(/\D+/g, '')
    const year = compact.slice(0, 4) || '0000'
    const seq = compact.slice(-5).padStart(5, '0')
    return `${year}-${normalizeCourseCode(fallbackCourseCode)}-${seq}`
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    return `${formatCourseLabel(courseCode)} ${sectionCode}`.trim()
  }

  const classOptions = useMemo<ProfessorRosterClassOption[]>(() => {
    return courses.flatMap((course) => {
      return course.blocks
        .filter((block) => Boolean(block.sectionId))
        .flatMap((block) => {
          return block.subjects.map((subject) => ({
            key: `${course.courseCode}|${block.sectionId}|${subject.subjectId}`,
            courseCode: course.courseCode,
            blockCode: formatBlockCode(course.courseCode, block.sectionCode),
            sectionId: block.sectionId as string,
            sectionCode: block.sectionCode,
            semester: block.semester,
            schoolYear: block.schoolYear,
            yearLevel: block.yearLevel,
            subjectId: subject.subjectId,
            subjectCode: subject.code,
            subjectTitle: subject.title,
            schedule: subject.schedule || 'TBA',
            room: subject.room || 'TBA'
          }))
        })
    })
  }, [courses])

  const selectedClass = useMemo(
    () => classOptions.find((item) => item.key === selectedClassKey) || null,
    [classOptions, selectedClassKey]
  )

  useEffect(() => {
    if (!initialClassKey) return
    const matchedClass = classOptions.find((item) => item.key === initialClassKey)
    if (matchedClass) {
      setSelectedClassKey(initialClassKey)
      setSearchQuery('')
      setSortBy('name-asc')
      setCurrentPage(1)
    }
  }, [classOptions, initialClassKey])

  useEffect(() => {
    if (selectedClassKey && classOptions.some((item) => item.key === selectedClassKey)) {
      return
    }

    if (classOptions.length > 0) {
      setSelectedClassKey(classOptions[0].key)
      setCurrentPage(1)
    } else if (selectedClassKey) {
      setSelectedClassKey('')
    }
  }, [classOptions, selectedClassKey])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchStudents = async () => {
      if (!selectedClass) {
        setStudents([])
        setStudentsError('')
        return
      }

      try {
        setStudentsLoading(true)
        setStudentsError('')

        const token = await getStoredToken()
        if (!token) {
          setStudents([])
          setStudentsError('You are not logged in.')
          return
        }

        const query = new URLSearchParams({
          semester: selectedClass.semester,
          schoolYear: selectedClass.schoolYear
        })

        const response = await fetchWithAutoReconnect(
          `${API_URL}/api/professor/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/students?${query.toString()}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || `Failed to fetch class grades: ${response.status}`)
        }

        const rows = Array.isArray(payload?.data?.students) ? payload.data.students : []
        const normalized = rows.map((raw: any, index: number) => {
          const yearLevel = typeof raw?.yearLevel === 'number' ? raw.yearLevel : Number(raw?.yearLevel)
          const rawId = String(raw?._id || raw?.id || raw?.studentNumber || index)
          return {
            _id: String(raw?._id || raw?.id || ''),
            rosterEntryKey: `${selectedClass.sectionId}-${selectedClass.subjectId}-${rawId}-${index}`,
            enrollmentId: raw?.enrollmentId ? String(raw.enrollmentId) : undefined,
            subjectEntryId: raw?.subjectEntryId ? String(raw.subjectEntryId) : undefined,
            studentNumber: formatStudentNumber(raw?.studentNumber || '', selectedClass.courseCode),
            firstName: String(raw?.firstName || ''),
            middleName: raw?.middleName ? String(raw.middleName) : '',
            lastName: String(raw?.lastName || ''),
            suffix: raw?.suffix ? String(raw.suffix) : '',
            yearLevel: Number.isFinite(yearLevel) ? yearLevel : undefined,
            studentStatus: raw?.studentStatus || raw?.status || 'Active',
            course: raw?.course || selectedClass.courseCode,
            email: raw?.email || 'Not provided',
            contactNumber: raw?.contactNumber || 'Not provided',
            corStatus: raw?.corStatus || 'Pending',
            currentGrade: raw?.currentGrade ?? '',
            remarks: raw?.remarks || '',
            classBlockCode: selectedClass.blockCode,
            classSectionCode: selectedClass.sectionCode,
            classSubjectCode: raw?.classSubjectCode || selectedClass.subjectCode,
            classSubjectTitle: raw?.classSubjectTitle || selectedClass.subjectTitle,
            classSemester: selectedClass.semester,
            classSchoolYear: selectedClass.schoolYear,
            subjectStatus: raw?.subjectStatus ? String(raw.subjectStatus) : 'Enrolled',
            gradeUpdatedAt: raw?.gradeUpdatedAt ? String(raw.gradeUpdatedAt) : undefined
          } as ProfessorRosterStudent
        })

        if (!cancelled) {
          setStudents(normalized)
          setCurrentPage(1)
        }
      } catch (loadError) {
        if (isAbortRequestError(loadError)) {
          return
        }

        if (!cancelled) {
          if (!isNetworkRequestError(loadError)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(loadError)
              ? buildReconnectMessage('class grades')
              : (loadError instanceof Error ? loadError.message : 'Failed to load class grades.')
          )
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchStudents()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedClass])

  useEffect(() => {
    setGradeDrafts(
      Object.fromEntries(
        students.map((student) => [
          student._id,
          student.currentGrade === undefined || student.currentGrade === null || student.currentGrade === ''
            ? ''
            : String(student.currentGrade)
        ])
      )
    )
    setRemarkDrafts(
      Object.fromEntries(
        students.map((student) => [student._id, String(student.remarks || '')])
      )
    )
  }, [students])

  const getName = (student: ProfessorRosterStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getStudentCourseDisplay = (student?: ProfessorRosterStudent | null) => {
    const rawCourse = String(student?.course || selectedClass?.courseCode || '').trim()
    return formatCourseLabel(rawCourse) || rawCourse || 'N/A'
  }

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let result = [...students]

    if (query) {
      result = result.filter((student) => {
        const studentName = getName(student).toLowerCase()
        return (
          studentName.includes(query) ||
          String(student.studentNumber).toLowerCase().includes(query) ||
          String(student.course || '').toLowerCase().includes(query) ||
          getStudentCourseDisplay(student).toLowerCase().includes(query) ||
          String(student.subjectStatus || '').toLowerCase().includes(query)
        )
      })
    }

    switch (sortBy) {
      case 'name-desc':
        result.sort((a, b) => getName(b).localeCompare(getName(a), undefined, { sensitivity: 'base' }))
        break
      case 'grade-asc':
        result.sort((a, b) => {
          const left = Number(a.currentGrade)
          const right = Number(b.currentGrade)
          const leftValue = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY
          const rightValue = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY
          if (leftValue !== rightValue) return leftValue - rightValue
          return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' })
        })
        break
      case 'grade-desc':
        result.sort((a, b) => {
          const left = Number(a.currentGrade)
          const right = Number(b.currentGrade)
          const leftValue = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY
          const rightValue = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY
          if (leftValue !== rightValue) return rightValue - leftValue
          return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' })
        })
        break
      case 'name-asc':
      default:
        result.sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }))
        break
    }

    return result
  }, [searchQuery, sortBy, students])

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / 10))
  const currentPageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10)
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!pendingFocusStudentId) return

    const targetInput = gradeInputRefs.current[pendingFocusStudentId]
    if (!targetInput) return

    targetInput.focus()
    targetInput.select()
    setPendingFocusStudentId('')
  }, [currentPageStudents, pendingFocusStudentId])

  const gradeValues = students
    .map((student) => Number(student.currentGrade))
    .filter((value) => Number.isFinite(value))

  const gradedCount = gradeValues.length
  const pendingCount = Math.max(students.length - gradedCount, 0)
  const averageGrade = gradeValues.length > 0
    ? (gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length).toFixed(2)
    : 'N/A'

  const formatGradeUpdatedAt = (value?: string) => {
    if (!value) return 'Not graded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Not graded' : date.toLocaleString()
  }

  const hasDraftChanges = (student: ProfessorRosterStudent) => {
    const gradeDraft = String(gradeDrafts[student._id] ?? '')
    const currentGrade = student.currentGrade === undefined || student.currentGrade === null ? '' : String(student.currentGrade)
    const remarkDraft = String(remarkDrafts[student._id] ?? '')
    const currentRemark = String(student.remarks || '')
    return gradeDraft !== currentGrade || remarkDraft !== currentRemark
  }

  const saveGrade = async (student: ProfessorRosterStudent) => {
    if (!selectedClass) return

    const rawGrade = String(gradeDrafts[student._id] ?? '').trim()
    const nextGrade = rawGrade === '' ? null : Number(rawGrade)
    if (nextGrade !== null && (!Number.isFinite(nextGrade) || nextGrade < 1 || nextGrade > 5)) {
      setMessageTone('error')
      setMessage(`Invalid grade for ${getName(student)}. Use 1.0 to 5.0, or leave it blank.`)
      return
    }

    try {
      setSavingStudentIds((current) => current.includes(student._id) ? current : [...current, student._id])
      const token = await getStoredToken()
      if (!token) {
        throw new Error('You are not logged in.')
      }

      const response = await fetchWithAutoReconnect(
        `${API_URL}/api/professor/sections/${selectedClass.sectionId}/subjects/${selectedClass.subjectId}/students/${student._id}/grade`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grade: nextGrade,
            remarks: String(remarkDrafts[student._id] ?? ''),
            semester: selectedClass.semester,
            schoolYear: selectedClass.schoolYear
          })
        }
      )

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save grade.')
      }

      const updated = payload?.data || {}
      setStudents((current) => current.map((entry) => {
        if (entry._id !== student._id) return entry
        return {
          ...entry,
          enrollmentId: updated?.enrollmentId ? String(updated.enrollmentId) : entry.enrollmentId,
          subjectEntryId: updated?.subjectEntryId ? String(updated.subjectEntryId) : entry.subjectEntryId,
          currentGrade: updated?.currentGrade ?? '',
          remarks: updated?.remarks || '',
          subjectStatus: updated?.subjectStatus || entry.subjectStatus,
          gradeUpdatedAt: updated?.gradeUpdatedAt ? String(updated.gradeUpdatedAt) : entry.gradeUpdatedAt
        }
      }))
      setGradeDrafts((current) => ({
        ...current,
        [student._id]: updated?.currentGrade === undefined || updated?.currentGrade === null ? '' : String(updated.currentGrade)
      }))
      setRemarkDrafts((current) => ({
        ...current,
        [student._id]: String(updated?.remarks || '')
      }))
      setMessageTone('info')
      setMessage(`Published grade for ${getName(student)}.`)
    } catch (saveError) {
      setMessageTone('error')
      setMessage(
        isNetworkRequestError(saveError)
          ? buildReconnectMessage('the grade update')
          : (saveError instanceof Error ? saveError.message : 'Failed to save grade.')
      )
    } finally {
      setSavingStudentIds((current) => current.filter((value) => value !== student._id))
    }
  }

  const goToNextGrade = (student: ProfessorRosterStudent) => {
    const currentIndex = filteredStudents.findIndex((entry) => entry._id === student._id)
    if (currentIndex < 0) return

    const nextStudent = filteredStudents[currentIndex + 1]
    if (!nextStudent) return

    const nextPage = Math.floor((currentIndex + 1) / 10) + 1
    setCurrentPage(nextPage)
    setPendingFocusStudentId(nextStudent._id)
  }

  const exportGrades = () => {
    if (!selectedClass || students.length === 0) return

    const rows = students.map((student) => [
      student.studentNumber,
      getName(student),
      getStudentCourseDisplay(student),
      String(student.yearLevel ?? ''),
      student.studentStatus || 'Active',
      String(student.currentGrade ?? ''),
      student.remarks || '',
      String(student.subjectStatus || ''),
      formatGradeUpdatedAt(student.gradeUpdatedAt)
    ])

    const header = ['Student ID', 'Full Name', 'Program/Course', 'Year Level', 'Status', 'Grade', 'Remarks', 'Subject Status', 'Last Updated']
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedClass.subjectCode}-${selectedClass.sectionCode}-grades.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <p>Loading your assigned classes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <p className="professor-data-error">{error}</p>
        <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Retry</button>
      </div>
    )
  }

  if (classOptions.length === 0) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Grades</h2>
        <p className="professor-section-desc">Manage subject grades based on enrolled student subjects.</p>
        <div className="placeholder-card">
          <h3>No assigned class found</h3>
          <p>No classes are currently assigned to your account.</p>
          <button className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>Refresh Assignments</button>
        </div>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">Grades</h2>
      <p className="professor-section-desc">Manage subject grades directly from each student&apos;s enrolled subject entry.</p>

      <div className="professor-roster-controls">
        <div className="professor-roster-class-select">
          <label htmlFor="professor-grade-class-select">Class / Subject</label>
          <select
            id="professor-grade-class-select"
            value={selectedClassKey}
            onChange={(event) => {
              setSelectedClassKey(event.target.value)
              setSearchQuery('')
              setSortBy('name-asc')
              setCurrentPage(1)
              setMessage('')
            }}
          >
            {classOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.blockCode} • {option.subjectCode} - {option.subjectTitle}
              </option>
            ))}
          </select>
        </div>

        <div className="professor-tool-actions">
          <button
            type="button"
            className="professor-btn"
            onClick={exportGrades}
            disabled={students.length === 0}
          >
            <Download size={14} />
            Export Grades
          </button>
          <button type="button" className="professor-btn professor-btn-secondary" onClick={() => void onRefresh()}>
            Refresh Assignments
          </button>
        </div>
      </div>

      {message ? (
        <div className={messageTone === 'error' ? 'professor-data-error' : 'professor-inline-note'}>
          {message}
        </div>
      ) : null}

      {selectedClass && (
        <>
          <div className="professor-class-overview">
            <div className="professor-overview-row"><span>Block</span><strong>{selectedClass.blockCode}</strong></div>
            <div className="professor-overview-row"><span>Subject</span><strong>{selectedClass.subjectCode} - {selectedClass.subjectTitle}</strong></div>
            <div className="professor-overview-row"><span>Schedule</span><strong>{selectedClass.schedule || 'TBA'}</strong></div>
            <div className="professor-overview-row"><span>Room</span><strong>{selectedClass.room || 'TBA'}</strong></div>
            <div className="professor-overview-row"><span>Semester / School Year</span><strong>{selectedClass.semester} / {selectedClass.schoolYear}</strong></div>
            <div className="professor-overview-row"><span>Year Level</span><strong>{selectedClass.yearLevel ?? 'N/A'}</strong></div>
          </div>

          <div className="professor-summary-grid">
            <div className="professor-summary-card">
              <span>Enrolled Students</span>
              <strong>{students.length}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Graded</span>
              <strong>{gradedCount}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Pending Grade</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="professor-summary-card">
              <span>Average Grade</span>
              <strong>{averageGrade}</strong>
            </div>
          </div>
        </>
      )}

      <div className="professor-roster-toolbar">
        <div className="professor-roster-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search name, student ID, course, or status"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
        <label>
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as GradeSortBy)
              setCurrentPage(1)
            }}
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="grade-asc">Lowest grade</option>
            <option value="grade-desc">Highest grade</option>
          </select>
        </label>
      </div>

      <div className="professor-table-wrap">
        <table className="professor-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Full Name</th>
              <th>Program / Course</th>
              <th>Year Level</th>
              <th>Status</th>
              <th>Grade</th>
              <th>Remarks</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studentsLoading ? (
              <tr>
                <td colSpan={9}>Loading grades...</td>
              </tr>
            ) : studentsError ? (
              <tr>
                <td colSpan={9} className="professor-data-error">{studentsError}</td>
              </tr>
            ) : currentPageStudents.length === 0 ? (
              <tr>
                <td colSpan={9}>No students matched the current filters.</td>
              </tr>
            ) : (
              currentPageStudents.map((student) => {
                const isSaving = savingStudentIds.includes(student._id)
                return (
                  <tr key={student.rosterEntryKey}>
                    <td>{student.studentNumber}</td>
                    <td>{getName(student)}</td>
                    <td>{getStudentCourseDisplay(student)}</td>
                    <td>{student.yearLevel ?? 'N/A'}</td>
                    <td>{student.subjectStatus || student.studentStatus || 'Enrolled'}</td>
                    <td>
                      <div className="professor-grade-cell">
                        <input
                          ref={(element) => {
                            gradeInputRefs.current[student._id] = element
                          }}
                          type="number"
                          min="1"
                          max="5"
                          step="0.25"
                          value={gradeDrafts[student._id] ?? ''}
                          onChange={(event) => {
                            setGradeDrafts((current) => ({
                              ...current,
                              [student._id]: event.target.value
                            }))
                          }}
                          placeholder="1.00"
                        />
                        <div className="professor-grade-cell-actions">
                          <button
                            type="button"
                            className="professor-btn-xs"
                            onClick={() => void saveGrade(student)}
                            disabled={isSaving || !hasDraftChanges(student)}
                          >
                            {isSaving ? 'Saving...' : 'Publish Grade'}
                          </button>
                          <button
                            type="button"
                            className="professor-btn-xs professor-btn-secondary"
                            onClick={() => goToNextGrade(student)}
                            disabled={isSaving || filteredStudents[filteredStudents.length - 1]?._id === student._id}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={remarkDrafts[student._id] ?? ''}
                        onChange={(event) => {
                          setRemarkDrafts((current) => ({
                            ...current,
                            [student._id]: event.target.value
                          }))
                        }}
                        placeholder="Optional remarks"
                      />
                    </td>
                    <td>{formatGradeUpdatedAt(student.gradeUpdatedAt)}</td>
                    <td className="professor-table-actions">
                      <button
                        type="button"
                        className="professor-btn-xs professor-btn-secondary"
                        onClick={() => setSelectedStudent(student)}
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {currentPageStudents.length > 0 && (
        <div className="professor-pagination">
          <button type="button" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={!canGoPrev}>
            Prev
          </button>
          <span>{`Page ${currentPage} of ${totalPages}`}</span>
          <button type="button" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={!canGoNext}>
            Next
          </button>
        </div>
      )}

      {selectedStudent && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedStudent(null)}>
          <div className="professor-student-modal" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>Student Profile</h3>
              <button type="button" className="professor-btn-xs" onClick={() => setSelectedStudent(null)}>
                Close
              </button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Full Name:</strong> {getName(selectedStudent)}</div>
                <div><strong>Student ID:</strong> {selectedStudent.studentNumber}</div>
                <div><strong>Program / Course:</strong> {getStudentCourseDisplay(selectedStudent)}</div>
                <div><strong>Year Level:</strong> {selectedStudent.yearLevel ?? 'N/A'}</div>
                <div><strong>Block / Section:</strong> {selectedStudent.classBlockCode || selectedClass?.blockCode || 'N/A'}</div>
                <div><strong>Subject:</strong> {selectedStudent.classSubjectCode ? `${selectedStudent.classSubjectCode} - ${selectedStudent.classSubjectTitle || 'Untitled subject'}` : (selectedClass ? `${selectedClass.subjectCode} - ${selectedClass.subjectTitle}` : 'N/A')}</div>
                <div><strong>Email:</strong> {selectedStudent.email || 'Not provided'}</div>
                <div><strong>Contact Number:</strong> {selectedStudent.contactNumber || 'Not provided'}</div>
                <div><strong>Enrollment Status:</strong> {selectedStudent.studentStatus || selectedStudent.status || 'Active'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleManagement({ courses, loading, error, onRefresh }: ScheduleManagementProps) {
  type ScheduleMode = 'list' | 'timetable'
  type SchoolDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  type ScopeFilter = 'classes' | 'events' | 'both'
  type ItemDay = SchoolDay | 'Unscheduled'

  interface ScheduleItem {
    id: string
    courseCode: string
    courseDisplayCode: string
    sectionCode: string
    blockCode: string
    subjectCode: string
    subjectTitle: string
    scheduleText: string
    days: SchoolDay[]
    startMinutes: number | null
    endMinutes: number | null
    startTime: string
    endTime: string
    room: string
    building: string
    classType: 'Lecture' | 'Laboratory' | 'Other'
    semester: string
    schoolYear: string
    yearLevel: number | null
    enrolledStudents: number
  }

  interface TimetableOccurrence extends ScheduleItem {
    day: SchoolDay
    lane: number
    laneCount: number
  }

  interface SchoolEvent {
    id: string
    title: string
    date: string
    time: string
    category: 'Academic' | 'Exam' | 'Holiday' | 'Meeting' | 'Deadline' | 'General'
    statusTag: string
    statusTagClass: 'academic' | 'exam' | 'holiday' | 'meeting' | 'deadline' | 'general'
    description: string
    location?: string
  }

  interface CalendarEventPreview {
    id: string
    title: string
    label: string
    widthPercent: number
    offsetPercent: number
    tagClass: SchoolEvent['statusTagClass']
  }

  const SCHOOL_DAYS: SchoolDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const DAY_SHORT: Record<SchoolDay, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun'
  }
  const SCHOOL_DAYS_BY_JS: SchoolDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const TIMETABLE_START = 7 * 60
  const TIMETABLE_END = 21 * 60
  const SLOT_MINUTES = 30
  const SLOT_HEIGHT = 38

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const parseDateKey = (value: string) => {
    const [y, m, d] = String(value).split('-').map((part) => Number(part))
    if (!y || !m || !d) return null
    const parsed = new Date(y, m - 1, d)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const getSchoolDayFromJs = (value: Date) => SCHOOL_DAYS_BY_JS[value.getDay()]

  const formatClock = (minutes: number) => {
    const normalized = ((minutes % 1440) + 1440) % 1440
    const h24 = Math.floor(normalized / 60)
    const minute = String(normalized % 60).padStart(2, '0')
    const amPm = h24 >= 12 ? 'PM' : 'AM'
    const hour = ((h24 + 11) % 12) + 1
    return `${hour}:${minute} ${amPm}`
  }

  const getTimelinePreview = (event: SchoolEvent): CalendarEventPreview => {
    const range = parseTimeRange(event.time)
    const timelineStart = TIMETABLE_START
    const timelineSpan = TIMETABLE_END - TIMETABLE_START

    if (range.startMinutes !== null && range.endMinutes !== null) {
      const start = Math.max(range.startMinutes, timelineStart)
      const end = Math.min(range.endMinutes, TIMETABLE_END)
      const safeEnd = Math.max(end, start + 30)
      const offsetPercent = Math.max(0, Math.min(84, ((start - timelineStart) / timelineSpan) * 100))
      const widthPercent = Math.max(14, Math.min(100 - offsetPercent, ((safeEnd - start) / timelineSpan) * 100))

      return {
        id: event.id,
        title: event.title,
        label: `${range.startTime} - ${range.endTime}`,
        widthPercent,
        offsetPercent,
        tagClass: event.statusTagClass
      }
    }

    const firstMatch = String(event.time || '').toUpperCase().match(/(\d{1,2}(?::\d{2})?\s*(AM|PM)?)/)
    const firstTime = firstMatch ? parseTime(firstMatch[1]) : null

    if (firstTime) {
      const offsetPercent = Math.max(0, Math.min(84, ((firstTime.minutes - timelineStart) / timelineSpan) * 100))
      return {
        id: event.id,
        title: event.title,
        label: firstTime.label,
        widthPercent: 18,
        offsetPercent,
        tagClass: event.statusTagClass
      }
    }

    return {
      id: event.id,
      title: event.title,
      label: event.time || 'See details',
      widthPercent: 42,
      offsetPercent: 0,
      tagClass: event.statusTagClass
    }
  }

  const parseTime = (value: string, fallback?: string) => {
    const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2] || '0')
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null
    }

    const period = (match[3] || fallback || (hour <= 6 ? 'PM' : 'AM')).toUpperCase()
    const h24 = period === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12)
    return {
      minutes: h24 * 60 + minute,
      label: `${hour}:${String(minute).padStart(2, '0')} ${period}`
    }
  }

  const parseTimeRange = (value: string) => {
    const matches = [...String(value || '').toUpperCase().matchAll(/(\d{1,2}(?::\d{2})?\s*(AM|PM)?)/g)]
    if (matches.length < 2) {
      return { startMinutes: null, endMinutes: null, startTime: 'TBA', endTime: 'TBA' }
    }

    const first = parseTime(matches[0][1])
    const second = parseTime(matches[1][1], first?.label.includes('AM') ? 'AM' : 'PM')
    if (!first || !second) {
      return { startMinutes: null, endMinutes: null, startTime: 'TBA', endTime: 'TBA' }
    }

    let start = first.minutes
    let end = second.minutes
    if (end <= start) end += 720

    return {
      startMinutes: start,
      endMinutes: end,
      startTime: first.label,
      endTime: second.label
    }
  }

  const parseDays = (value: string) => {
    const heading = String(value || '').toUpperCase().split(/\d{1,2}:\d{2}/)[0]
    const normalized = heading
      .replace(/TTH/g, 'TUE THU')
      .replace(/MWF/g, 'MON WED FRI')
      .replace(/,/g, ' ')
      .replace(/;/g, ' ')
      .replace(/\//g, ' ')
      .replace(/\b-\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const list: SchoolDay[] = []
    const token = new Set(normalized.split(' ').filter(Boolean))

    const hasMonday = /\bMONDAY\b/.test(normalized) || token.has('MON') || token.has('M')
    const hasTuesday = /\bTUESDAY\b/.test(normalized) || token.has('TUE') || token.has('TU') || token.has('T')
    const hasWednesday = /\bWEDNESDAY\b/.test(normalized) || token.has('WED') || token.has('W')
    const hasThursday = /\bTHURSDAY\b/.test(normalized) || token.has('THU') || token.has('TH') || token.has('R')
    const hasFriday = /\bFRIDAY\b/.test(normalized) || token.has('FRI') || token.has('F')
    const hasSaturday = /\bSATURDAY\b/.test(normalized) || token.has('SAT') || token.has('SA')
    const hasSunday = /\bSUNDAY\b/.test(normalized) || token.has('SUN') || token.has('SU')

    if (hasMonday) list.push('Monday')
    if (hasTuesday) list.push('Tuesday')
    if (hasWednesday) list.push('Wednesday')
    if (hasThursday) list.push('Thursday')
    if (hasFriday) list.push('Friday')
    if (hasSaturday) list.push('Saturday')
    if (hasSunday) list.push('Sunday')

    return list.filter((day, index, arr) => arr.indexOf(day) === index)
  }

  const normalizeCourseCode = (courseCode: string) => {
    const normalized = String(courseCode || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return ''
    if (/^\d{3,5}$/.test(normalized)) return normalized
    if (normalized.includes('BEED')) return '101'
    if (
      normalized.includes('BSED-ENGLISH')
      || normalized === 'ENGLISH'
      || (normalized.includes('SECONDARYEDUCATION') && normalized.includes('ENGLISH'))
    ) return '102'
    if (
      normalized.includes('BSED-MATH')
      || normalized === 'MATH'
      || normalized === 'MATHEMATICS'
      || (normalized.includes('SECONDARYEDUCATION') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS')))
    ) return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM' || (normalized.includes('BSBA') && normalized.includes('HRM'))) return '201'
    return normalized.slice(0, 3) || 'COURSE'
  }

  const toCourseDisplayLabel = (course: ProfessorAssignedCourse | string | number) => {
    // If it's a course object with a name, use that
    if (typeof course === 'object' && course !== null) {
      if (course.courseName) return course.courseName
      // Fall back to courseCode mapping
      return toCourseDisplayLabel(course.courseCode)
    }
    
    const raw = String(course ?? '').trim()
    if (!raw) return 'N/A'

    const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    const labelByCode: Record<string, string> = {
      '101': 'BEED',
      '102': 'BSED-ENGLISH',
      '103': 'BSED-MATH',
      '201': 'BSBA-HRM'
    }

    if (labelByCode[normalized]) return labelByCode[normalized]
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return 'BSED-ENGLISH'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return 'BSED-MATH'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return 'BSBA-HRM'
    return raw
  }

  const getSectionSuffix = (sectionCode: string) => {
    const text = String(sectionCode || '').trim()
    if (!text) return 'TBA'
    const parts = text.split('-').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      // Convert patterns like "101-1-A" or "1-A" into "1A"
      if (/^\d+$/.test(prev) && /^[A-Za-z]+$/.test(last)) {
        return `${prev}${last.toUpperCase()}`
      }

      return last.toUpperCase()
    }

    return text.toUpperCase()
  }

  const formatSectionCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayLabel(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  const getRoomParts = (value: string) => {
    const parts = String(value || 'TBA').split(',').map((part) => part.trim()).filter(Boolean)
    return {
      room: parts[0] || 'TBA',
      building: parts.length > 1 ? parts.slice(1).join(', ') : 'Main Building'
    }
  }

  const classItems = useMemo<ScheduleItem[]>(() =>
    courses.flatMap((course) =>
      course.blocks
        .flatMap((block) =>
          block.subjects.map((subject) => {
            const days = parseDays(subject.schedule || '')
            const parsedTime = parseTimeRange(subject.schedule || '')
            const courseCode = normalizeCourseCode(course.courseCode)
            const room = getRoomParts(subject.room || 'TBA')
            const sectionCode = String(block.sectionCode || 'UNASSIGNED')
            const sectionId = block.sectionId || `unassigned-${sectionCode}`

            return {
              id: `${course.courseCode}-${sectionId}-${subject.subjectId}`,
              courseCode: String(course.courseCode || ''),
              courseDisplayCode: courseCode,
              sectionCode,
              blockCode: formatSectionCode(course.courseCode, sectionCode),
              subjectCode: String(subject.code || 'N/A'),
              subjectTitle: String(subject.title || 'N/A'),
              scheduleText: String(subject.schedule || ''),
              days,
              startMinutes: parsedTime.startMinutes,
              endMinutes: parsedTime.endMinutes,
              startTime: parsedTime.startTime,
              endTime: parsedTime.endTime,
              room: room.room,
              building: room.building,
              classType: /lab|laboratory/i.test(`${subject.code} ${subject.title}`) ? 'Laboratory' : 'Lecture',
              semester: String(block.semester || 'N/A'),
              schoolYear: String(block.schoolYear || 'N/A'),
              yearLevel: block.yearLevel ?? null,
              enrolledStudents: Number.isFinite(subject.enrolledStudents) ? subject.enrolledStudents : 0
            }
          })
        )
    )
  , [courses])

  const philippineHolidayEvents = useMemo<SchoolEvent[]>(() => [
    {
      id: 'ph-holiday-2026-01-01',
      title: "New Year's Day",
      date: '2026-01-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday. No regular classes or office transactions.'
    },
    {
      id: 'ph-holiday-2026-02-17',
      title: 'Chinese New Year',
      date: '2026-02-17',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-02-25',
      title: 'EDSA People Power Revolution Anniversary',
      date: '2026-02-25',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Working Day',
      statusTagClass: 'holiday',
      description: 'Philippine special working day. Regular classes and office operations continue unless the school announces otherwise.'
    },
    {
      id: 'ph-holiday-2026-04-02',
      title: 'Maundy Thursday',
      date: '2026-04-02',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-04-03',
      title: 'Good Friday',
      date: '2026-04-03',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-04-09',
      title: 'Araw ng Kagitingan',
      date: '2026-04-09',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring valor.'
    },
    {
      id: 'ph-holiday-2026-04-04',
      title: 'Black Saturday',
      date: '2026-04-04',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday during Holy Week.'
    },
    {
      id: 'ph-holiday-2026-05-01',
      title: 'Labor Day',
      date: '2026-05-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday celebrating workers.'
    },
    {
      id: 'ph-holiday-2026-06-12',
      title: 'Independence Day',
      date: '2026-06-12',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday celebrating independence.'
    },
    {
      id: 'ph-holiday-2026-08-21',
      title: 'Ninoy Aquino Day',
      date: '2026-08-21',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-08-31',
      title: "National Heroes' Day",
      date: '2026-08-31',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring national heroes.'
    },
    {
      id: 'ph-holiday-2026-11-01',
      title: "All Saints' Day",
      date: '2026-11-01',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-11-02',
      title: "All Souls' Day",
      date: '2026-11-02',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine additional special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-11-30',
      title: 'Bonifacio Day',
      date: '2026-11-30',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring Andres Bonifacio.'
    },
    {
      id: 'ph-holiday-2026-12-08',
      title: 'Feast of the Immaculate Conception of Mary',
      date: '2026-12-08',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-12-24',
      title: 'Christmas Eve',
      date: '2026-12-24',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    },
    {
      id: 'ph-holiday-2026-12-25',
      title: 'Christmas Day',
      date: '2026-12-25',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday.'
    },
    {
      id: 'ph-holiday-2026-12-30',
      title: 'Rizal Day',
      date: '2026-12-30',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Regular Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine regular holiday honoring Jose Rizal.'
    },
    {
      id: 'ph-holiday-2026-12-31',
      title: 'Last Day of the Year',
      date: '2026-12-31',
      time: 'All day',
      category: 'Holiday',
      statusTag: 'Special Holiday',
      statusTagClass: 'holiday',
      description: 'Philippine special non-working holiday.'
    }
  ], [])
  const getEventCategory = (announcement: any): SchoolEvent['category'] => {
    const type = String(announcement?.type || 'info').toLowerCase()
    const title = String(announcement?.title || '').toLowerCase()
    if (/holiday/.test(title)) return 'Holiday'
    if (/midterm|final|exam/.test(title)) return 'Exam'
    if (/grading|grade/.test(title)) return 'Deadline'
    if (type === 'urgent') return 'Deadline'
    if (type === 'warning') return 'Academic'
    return 'Meeting'
  }

  const getEventTag = (announcement: any) => {
    if (announcement?.isPinned) return 'Pinned'
    const type = String(announcement?.type || 'info').toLowerCase()
    if (type === 'maintenance') return 'Maintenance'
    if (type === 'warning') return 'Academic Alert'
    return 'Announcement'
  }

  const getEventTagClass = (statusTag: string, category: SchoolEvent['category']) => {
    const normalized = String(statusTag || '').toLowerCase()
    if (normalized.includes('exam')) return 'exam'
    if (normalized.includes('holiday')) return 'holiday'
    if (normalized.includes('meeting')) return 'meeting'
    if (normalized.includes('pinned') || normalized.includes('maintenance') || normalized.includes('academic')) return 'academic'
    if (normalized.includes('grade') || normalized.includes('due') || category === 'Deadline') return 'deadline'
    if (normalized.includes('announcement')) return 'general'
    return category.toLowerCase() as SchoolEvent['statusTagClass']
  }

  const mergeEventSources = (items: SchoolEvent[]) => {
    const seen = new Set<string>()
    return items.filter((event) => {
      const key = `${event.date}|${event.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const [events, setEvents] = useState<SchoolEvent[]>([])
  const [eventLoading, setEventLoading] = useState(false)
  const [scope, setScope] = useState<ScopeFilter>('both')
  const [mode, setMode] = useState<ScheduleMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState<'all' | SchoolDay>('all')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [calendarDate, setCalendarDate] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null)
  const [timetableContainerWidth, setTimetableContainerWidth] = useState<number>(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1280
  ))
  const [timetableDayOffset, setTimetableDayOffset] = useState(0)
  const timetableWrapRef = useRef<HTMLDivElement | null>(null)

  const semesterOptions = useMemo(() => {
    const list = new Set<string>()
    classItems.forEach((item) => list.add(item.semester))
    return ['all', ...Array.from(list).sort()]
  }, [classItems])

  const yearOptions = useMemo(() => {
    const list = new Set<string>()
    classItems.forEach((item) => list.add(item.schoolYear))
    return ['all', ...Array.from(list).sort().reverse()]
  }, [classItems])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const loadEvents = async () => {
      try {
        setEventLoading(true)
        const response = await fetchWithAutoReconnect(`${API_URL}/api/announcements?targetAudience=professor`, {
          signal: controller.signal
        })

        if (!response.ok) {
          setEvents(mergeEventSources([...philippineHolidayEvents]))
          return
        }

        const payload = await response.json().catch(() => [])
        const records = Array.isArray(payload) ? payload : []

        const mapped = records
          .filter(isVisibleProfessorAnnouncement)
          .map((announcement: any): SchoolEvent | null => {
            const sourceDate = announcement.scheduledFor || announcement.expiresAt || announcement.createdAt
            const date = new Date(sourceDate)
            if (Number.isNaN(date.getTime())) {
              return null
            }
            const statusTag = getEventTag(announcement)
            const category = getEventCategory(announcement)

            return {
              id: announcement._id || `${announcement.title}-${sourceDate}`,
              title: announcement.title || 'School Event',
              date: toDateKey(date),
              time: announcement.scheduledFor ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'See details',
              category,
              statusTag,
              statusTagClass: getEventTagClass(statusTag, category),
              description: announcement.message || 'No details yet.',
              location: announcement.type === 'maintenance' ? 'System Notification' : ''
            }
          })
          .filter((entry: SchoolEvent | null): entry is SchoolEvent => Boolean(entry))

        if (!cancelled) {
          setEvents(mergeEventSources([...philippineHolidayEvents, ...mapped]))
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        if (!cancelled) {
          setEvents((current) => (
            current.length > 0
              ? current
              : mergeEventSources([...philippineHolidayEvents])
          ))
        }
      } finally {
        if (!cancelled) {
          setEventLoading(false)
        }
      }
    }

    void loadEvents()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [philippineHolidayEvents])

  const filteredClasses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return classItems.filter((entry) => {
      if (scope === 'events') return false
      if (semesterFilter !== 'all' && entry.semester !== semesterFilter) return false
      if (yearFilter !== 'all' && entry.schoolYear !== yearFilter) return false
      if (dayFilter !== 'all' && !entry.days.includes(dayFilter)) return false
      if (!query) return true
      return `${entry.subjectCode} ${entry.subjectTitle} ${entry.blockCode} ${entry.scheduleText}`.toLowerCase().includes(query)
    })
  }, [classItems, dayFilter, semesterFilter, scope, yearFilter, searchQuery])

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return events
      .filter((event) => {
        if (scope === 'classes') return false
        const eventDay = getSchoolDayFromJs(new Date(`${event.date}T00:00:00`))
        if (dayFilter !== 'all' && eventDay !== dayFilter) return false
        if (!query) return true
        return `${event.title} ${event.description} ${event.statusTag} ${event.category}`.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        const left = parseDateKey(a.date)?.getTime() ?? 0
        const right = parseDateKey(b.date)?.getTime() ?? 0
        if (left === right) {
          if (a.time === 'See details' && b.time !== 'See details') return 1
          if (b.time === 'See details' && a.time !== 'See details') return -1
          return a.time.localeCompare(b.time)
        }
        return left - right
      })
  }, [events, scope, dayFilter, searchQuery])

  const upcomingFilteredEvents = useMemo(() => {
    const today = toDateKey(new Date())
    return filteredEvents.filter((event) => event.date >= today)
  }, [filteredEvents])

  const upcomingCalendarMonthEvents = useMemo(() => {
    const activeYear = calendarMonth.getFullYear()
    const activeMonth = calendarMonth.getMonth()

    return upcomingFilteredEvents.filter((event) => {
      const eventDate = parseDateKey(event.date)
      return Boolean(
        eventDate &&
        eventDate.getFullYear() === activeYear &&
        eventDate.getMonth() === activeMonth
      )
    })
  }, [calendarMonth, upcomingFilteredEvents])

  const groupedClassDays = useMemo(() => {
    const grouped: Record<ItemDay, ScheduleItem[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
      Unscheduled: []
    }

    filteredClasses.forEach((entry) => {
      if (entry.days.length === 0) {
        grouped.Unscheduled.push(entry)
      } else {
        entry.days.forEach((day) => {
          grouped[day].push(entry)
        })
      }
    })

    ;(Object.keys(grouped) as ItemDay[]).forEach((day) => {
      grouped[day].sort((a, b) => {
        const aStart = a.startMinutes ?? Number.MAX_SAFE_INTEGER
        const bStart = b.startMinutes ?? Number.MAX_SAFE_INTEGER
        return aStart - bStart
      })
    })

    return grouped
  }, [filteredClasses])

  const nextClass = useMemo(() => {
    const now = new Date()
    const nowDay = now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    const candidates = filteredClasses
      .flatMap((entry) => {
        if (!entry.days.length || entry.startMinutes === null) return []
        return entry.days.map((day) => {
          const dayIndex = SCHOOL_DAYS_BY_JS.indexOf(day)
          const delta = (dayIndex - nowDay + 7) % 7
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
          date.setDate(date.getDate() + delta)
          date.setMinutes(entry.startMinutes as number)
          if (delta === 0 && (entry.startMinutes as number) <= nowMinutes) {
            date.setDate(date.getDate() + 7)
          }
          return { item: entry, time: date.getTime() }
        })
      })
      .sort((a, b) => a.time - b.time)

    return candidates[0]?.item ?? null
  }, [filteredClasses])

  const nowForSchedule = new Date()
  const todayName = getSchoolDayFromJs(nowForSchedule)
  const classesTodayCount = filteredClasses.filter((entry) => entry.days.includes(todayName)).length
  const currentTimeMinute = nowForSchedule.getHours() * 60 + nowForSchedule.getMinutes()
  const currentTimeTop = currentTimeMinute >= TIMETABLE_START && currentTimeMinute <= TIMETABLE_END
    ? ((currentTimeMinute - TIMETABLE_START) / SLOT_MINUTES) * SLOT_HEIGHT
    : null

  const timeSlots = useMemo(() => {
    const list: string[] = []
    for (let minute = TIMETABLE_START; minute <= TIMETABLE_END; minute += SLOT_MINUTES) {
      list.push(formatClock(minute))
    }
    return list
  }, [])

  const timetableIntervals = useMemo(() => timeSlots.slice(0, -1), [timeSlots])
  const timetableBodyHeight = timetableIntervals.length * SLOT_HEIGHT

  const timetableOccurrences = useMemo<Record<SchoolDay, TimetableOccurrence[]>>(() => {
    const buckets: Record<SchoolDay, TimetableOccurrence[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    }

    filteredClasses
      .filter((entry) => entry.startMinutes !== null && entry.endMinutes !== null && entry.days.length > 0)
      .forEach((entry) => {
        entry.days.forEach((day) => {
          buckets[day].push({ ...entry, day, lane: 0, laneCount: 1 })
        })
      })

    Object.keys(buckets).forEach((key) => {
      const day = key as SchoolDay
      const items = buckets[day]
      items.sort((a, b) => {
        return (a.startMinutes ?? 0) - (b.startMinutes ?? 0)
      })

      const lanes: number[] = []
      buckets[day] = items.map((item) => {
        const start = item.startMinutes ?? TIMETABLE_START
        const end = item.endMinutes ?? start + 60
        let lane = 0

        while (lane < lanes.length && start < lanes[lane]) {
          lane += 1
        }

        if (lane === lanes.length) lanes.push(end)
        else lanes[lane] = end

        return {
          ...item,
          lane,
          laneCount: Math.max(lanes.length, 1)
        }
      })
    })

    return buckets
  }, [filteredClasses])

  const hasTimetableClasses = Object.values(timetableOccurrences).some((items) => items.length > 0)
  const timetableDays = useMemo<SchoolDay[]>(() => (
    dayFilter === 'all' ? SCHOOL_DAYS : [dayFilter]
  ), [dayFilter])
  const timetableTimeColumnWidth = timetableContainerWidth < 540 ? 68 : 78
  const timetableDayColumnMinWidth = timetableContainerWidth < 720 ? 148 : 160
  const visibleTimetableDayCount = useMemo(() => {
    const maxColumns =
      timetableContainerWidth < 560 ? 1 :
      timetableContainerWidth < 900 ? 2 :
      timetableContainerWidth < 1180 ? 4 :
      timetableDays.length

    return Math.max(1, Math.min(timetableDays.length, maxColumns))
  }, [timetableContainerWidth, timetableDays.length])
  const maxTimetableDayOffset = Math.max(timetableDays.length - visibleTimetableDayCount, 0)
  const visibleTimetableDays = useMemo(() => (
    timetableDays.slice(timetableDayOffset, timetableDayOffset + visibleTimetableDayCount)
  ), [timetableDayOffset, timetableDays, visibleTimetableDayCount])
  const timetableGridStyle = useMemo(() => {
    if (visibleTimetableDays.length <= 1) {
      return {
        gridTemplateColumns: `${timetableTimeColumnWidth}px minmax(0, 1fr)`,
        minWidth: '100%'
      }
    }

    const minWidth = timetableTimeColumnWidth + (visibleTimetableDays.length * timetableDayColumnMinWidth)
    return {
      gridTemplateColumns: `${timetableTimeColumnWidth}px repeat(${visibleTimetableDays.length}, minmax(${timetableDayColumnMinWidth}px, 1fr))`,
      minWidth: `${minWidth}px`
    }
  }, [timetableDayColumnMinWidth, timetableTimeColumnWidth, visibleTimetableDays.length])

  useEffect(() => {
    setTimetableDayOffset((previous) => Math.min(previous, maxTimetableDayOffset))
  }, [maxTimetableDayOffset])

  useEffect(() => {
    if (dayFilter !== 'all' || visibleTimetableDayCount !== 1 || maxTimetableDayOffset <= 0 || timetableDayOffset !== 0) {
      return
    }

    setTimetableDayOffset(Math.min(SCHOOL_DAYS.indexOf(todayName), maxTimetableDayOffset))
  }, [dayFilter, maxTimetableDayOffset, timetableDayOffset, todayName, visibleTimetableDayCount])

  const shiftTimetableDays = (direction: -1 | 1) => {
    setTimetableDayOffset((previous) => {
      if (direction < 0) {
        return Math.max(previous - 1, 0)
      }
      return Math.min(previous + 1, maxTimetableDayOffset)
    })
  }

  const jumpToTimetableDay = (index: number) => {
    setTimetableDayOffset(Math.min(Math.max(index, 0), maxTimetableDayOffset))
  }

  useEffect(() => {
    if (mode !== 'timetable' || !hasTimetableClasses || !timetableWrapRef.current) {
      return
    }

    const node = timetableWrapRef.current
    const updateWidth = () => {
      setTimetableContainerWidth(node.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280))
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width || node.clientWidth
      setTimetableContainerWidth(nextWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasTimetableClasses, mode])

  const monthGrid = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDate = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const offset = (firstDate.getDay() + 6) % 7

    const eventMap = filteredEvents.reduce<Record<string, CalendarEventPreview[]>>((acc, event) => {
      if (!acc[event.date]) acc[event.date] = []
      acc[event.date].push(getTimelinePreview(event))
      return acc
    }, {})

    const cells: Array<{
      key: string
      day: number
      date: string
      isToday: boolean
      hasEvent: boolean
      previews: CalendarEventPreview[]
      extraCount: number
    } | null> = []

    for (let i = 0; i < offset; i += 1) cells.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day)
      const key = toDateKey(date)
      const previews = eventMap[key] || []
      cells.push({
        key: `calendar-${key}`,
        day,
        date: key,
        isToday: key === toDateKey(new Date()),
        hasEvent: previews.length > 0,
        previews: previews.slice(0, 2),
        extraCount: Math.max(previews.length - 2, 0)
      })
    }

    return cells
  }, [calendarMonth, filteredEvents])

  const eventsForActiveDate = useMemo(() => {
    return calendarDate
      ? filteredEvents.filter((event) => event.date === calendarDate)
      : upcomingCalendarMonthEvents
  }, [calendarDate, filteredEvents, upcomingCalendarMonthEvents])

  const eventListTitle = calendarDate
    ? `Events on ${calendarDate}`
    : `Upcoming events in ${calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`

  const emptyEventListText = calendarDate
    ? 'No school events scheduled for this date.'
    : `No upcoming school events in ${calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}.`

  const upcomingEvent = upcomingFilteredEvents[0] ?? null
  const eventModeEnabled = scope === 'events' || scope === 'both'
  const classModeEnabled = scope === 'classes' || scope === 'both'
  const noAssignedSchedules = classModeEnabled && classItems.length === 0
  const noClassMatches = filteredClasses.length === 0
  const noFilterMatches =
    (scope === 'classes' && filteredClasses.length === 0) ||
    (scope === 'events' && filteredEvents.length === 0) ||
    (scope === 'both' && filteredClasses.length === 0 && filteredEvents.length === 0)

  const selectedEventDay = useMemo(() => {
    const sourceDate = selectedEvent?.date || calendarDate
    if (!sourceDate) return null
    const date = parseDateKey(sourceDate)
    if (!date) return null
    return getSchoolDayFromJs(date)
  }, [calendarDate, selectedEvent?.date])

  const handlePrevMonth = () => {
    setCalendarDate(null)
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCalendarDate(null)
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
  }

  const formatDaysLabel = (days: SchoolDay[]) => {
    if (!days.length) return 'Unscheduled'
    return days.join(', ')
  }

  const formatDuration = (entry: ScheduleItem) => {
    if (entry.startTime === 'TBA' || entry.endTime === 'TBA') return 'Time not set'
    return `${entry.startTime} - ${entry.endTime}`
  }

  if (loading) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Schedule</h2>
        <p className="professor-section-desc">Loading assigned teaching schedules...</p>
      </div>
    )
  }

  return (
    <div className="professor-section professor-schedule-page">
      <div className="professor-schedule-head">
        <div>
          <h2 className="professor-section-title">Schedule</h2>
          <p className="professor-section-desc">View your teaching schedule and upcoming academic events.</p>
        </div>
        <button className="professor-btn" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <p className="professor-data-error">{error}</p>
      )}

      <div className="professor-summary-grid">
        <div className="professor-summary-card">
          <span>Total Assigned Classes</span>
          <strong>{classItems.length}</strong>
          <small>Across your assigned blocks</small>
        </div>
        <div className="professor-summary-card">
          <span>Classes Today</span>
          <strong>{classesTodayCount}</strong>
          <small>{todayName} schedule</small>
        </div>
        <div className="professor-summary-card">
          <span>Next Class</span>
          <strong>{nextClass ? nextClass.subjectCode : 'N/A'}</strong>
          <small>{nextClass ? `${nextClass.blockCode} • ${formatDuration(nextClass)}` : 'No upcoming class'}</small>
        </div>
        <div className="professor-summary-card">
          <span>Upcoming School Event</span>
          <strong>{upcomingEvent ? upcomingEvent.title : 'N/A'}</strong>
          <small>{upcomingEvent ? `${upcomingEvent.date} • ${upcomingEvent.time}` : 'No upcoming school event'}</small>
        </div>
      </div>

      <div className="professor-schedule-toolbar">
        <div className="professor-course-toolbar-start">
          <div className="professor-roster-search">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              placeholder="Search subject code, title, section"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <label>
            <span>Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}>
              <option value="both">Classes and events</option>
              <option value="classes">Classes only</option>
              <option value="events">School events only</option>
            </select>
          </label>

          <label>
            <span>Semester</span>
            <select
              value={semesterFilter}
              onChange={(event) => setSemesterFilter(event.target.value)}
            >
              {semesterOptions.map((semester) => (
                <option key={semester} value={semester}>
                  {semester === 'all' ? 'All semesters' : semester}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>School Year</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year === 'all' ? 'All years' : year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={dayFilter}
              onChange={(event) => {
                const value = event.target.value
                setDayFilter(value === 'all' ? 'all' : (value as SchoolDay))
              }}
            >
              <option value="all">All days</option>
              {SCHOOL_DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="professor-schedule-view-toggle">
          <button
            type="button"
            className={`professor-layout-btn ${mode === 'list' ? 'is-active' : ''}`}
            onClick={() => setMode('list')}
          >
            <List size={14} />
            <span>List View</span>
          </button>
          <button
            type="button"
            className={`professor-layout-btn ${mode === 'timetable' ? 'is-active' : ''}`}
            onClick={() => setMode('timetable')}
          >
            <Grid3X3 size={14} />
            <span>Timetable View</span>
          </button>
        </div>
      </div>

      <div className="professor-schedule-layout">
        <div className="professor-schedule-main">
          {(() => {
            if (!classModeEnabled) {
              return (
                <div className="professor-empty-state">
                  <h3>Class schedules hidden</h3>
                  <p>Switch scope to both / classes to view class schedules.</p>
                </div>
              )
            }

            if (noAssignedSchedules) {
              return (
                <div className="professor-empty-state">
                  <h3>No assigned schedules found.</h3>
                  <p>Make sure your assigned subjects are updated by the registrar.</p>
                </div>
              )
            }

            if (mode === 'list') {
              return (
                <>
                  {nextClass ? (
                    <div className="professor-schedule-next">
                      <strong>Next upcoming class</strong>
                      <div>{nextClass.subjectCode}</div>
                      <span>{String(nextClass.blockCode)} • {formatDuration(nextClass)}</span>
                    </div>
                  ) : (
                    <div className="professor-schedule-empty">No upcoming class found.</div>
                  )}

                  <div className="professor-schedule-card-list">
                    {SCHOOL_DAYS.map((day) => {
                      const items = groupedClassDays[day]
                      if (items.length === 0) return null

                      return items.map((entry) => (
                        <button
                          key={`${entry.id}-${day}`}
                          type="button"
                          className="professor-schedule-item professor-schedule-card"
                          onClick={() => setSelectedClass(entry)}
                        >
                          <div className="professor-schedule-card-head">
                            <span className="professor-schedule-card-day">{day}</span>
                            <span className="professor-schedule-card-badge">{entry.classType}</span>
                          </div>
                          <div className="professor-schedule-item-title">
                            <strong>{entry.subjectCode}</strong>
                            <span>{entry.subjectTitle}</span>
                          </div>
                          <div className="professor-schedule-item-meta">
                            <span><CalendarDays size={13} /> Section: {entry.blockCode}</span>
                            <span><Clock size={13} /> {formatDuration(entry)}</span>
                            <span><MapPin size={13} /> {entry.room}, {entry.building}</span>
                            <span>{entry.enrolledStudents} students</span>
                          </div>
                          <div className="professor-schedule-item-meta">
                            <span>Semester: {entry.semester}</span>
                            <span>School Year: {entry.schoolYear}</span>
                          </div>
                        </button>
                      ))
                    })}

                    {groupedClassDays.Unscheduled.map((entry) => (
                      <button
                        key={`${entry.id}-unscheduled`}
                        type="button"
                        className="professor-schedule-item professor-schedule-card"
                        onClick={() => setSelectedClass(entry)}
                      >
                        <div className="professor-schedule-card-head">
                          <span className="professor-schedule-card-day">Unscheduled</span>
                          <span className="professor-schedule-card-badge">{entry.classType}</span>
                        </div>
                        <div className="professor-schedule-item-title">
                          <strong>{entry.subjectCode}</strong>
                          <span>{entry.subjectTitle}</span>
                        </div>
                        <div className="professor-schedule-item-meta">
                          <span><CalendarDays size={13} /> Section: {entry.blockCode}</span>
                          <span><Clock size={13} /> {entry.scheduleText}</span>
                        </div>
                      </button>
                    ))}

                    {noClassMatches ? (
                      <div className="professor-empty-state">
                        <h3>No classes match your selected filters.</h3>
                        <p>Try adjusting the filters or choose a different search query.</p>
                      </div>
                    ) : null}
                  </div>
                </>
              )
            }

            if (hasTimetableClasses) {
              return (
                <div className="professor-schedule-timetable-wrap" ref={timetableWrapRef}>
                  {timetableDays.length > visibleTimetableDayCount && (
                    <div className="professor-timetable-window-controls">
                      <button
                        type="button"
                        className="professor-timetable-window-btn"
                        onClick={() => shiftTimetableDays(-1)}
                        disabled={timetableDayOffset === 0}
                        aria-label="Show earlier timetable days"
                      >
                        ◀
                      </button>
                      <div className="professor-timetable-day-pills" aria-label="Visible timetable days">
                        {timetableDays.map((day, index) => (
                          <button
                            key={`timetable-day-pill-${day}`}
                            type="button"
                            className={`professor-timetable-day-pill ${visibleTimetableDays.includes(day) ? 'is-active' : ''}`}
                            onClick={() => jumpToTimetableDay(index)}
                            aria-pressed={visibleTimetableDays.includes(day)}
                            title={day}
                          >
                            {DAY_SHORT[day]}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="professor-timetable-window-btn"
                        onClick={() => shiftTimetableDays(1)}
                        disabled={timetableDayOffset >= maxTimetableDayOffset}
                        aria-label="Show later timetable days"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                  <div className="professor-timetable-scroll">
                    <div
                      className={`professor-timetable-grid ${visibleTimetableDays.length === 1 ? 'is-single-day' : ''}`}
                      style={timetableGridStyle}
                    >
                      <div className="professor-timetable-time-col">
                        <div className="professor-timetable-day-header">Time</div>
                        <div className="professor-timetable-time-body" style={{ height: `${timetableBodyHeight}px` }}>
                          {timetableIntervals.map((slot) => (
                            <div key={`time-${slot}`} className="professor-timetable-time-row">{slot}</div>
                          ))}
                          <div className="professor-timetable-time-end">{timeSlots[timeSlots.length - 1]}</div>
                        </div>
                      </div>

                      {visibleTimetableDays.map((day) => {
                        const occurrences = timetableOccurrences[day]
                        return (
                          <div key={`timetable-${day}`} className={`professor-timetable-day-col ${day === todayName ? 'is-today' : ''}`}>
                            <div className="professor-timetable-day-header">{day}</div>
                            <div className="professor-timetable-day-body" style={{ height: `${timetableBodyHeight}px` }}>
                              {timetableIntervals.map((_, idx) => (
                                <div key={`${day}-line-${idx}`} className={`professor-timetable-line ${idx % 2 === 0 ? 'is-strong' : ''}`} />
                              ))}

                              {day === todayName && currentTimeTop !== null && (
                                <div className="professor-timetable-now-line" style={{ top: `${currentTimeTop}px` }} />
                              )}

                              {occurrences.map((occurrence) => {
                                const start = occurrence.startMinutes ?? TIMETABLE_START
                                const end = occurrence.endMinutes ?? (start + 60)
                                const top = ((start - TIMETABLE_START) / SLOT_MINUTES) * SLOT_HEIGHT
                                const height = Math.max(((end - start) / SLOT_MINUTES) * SLOT_HEIGHT, 32)
                                const width = 100 / occurrence.laneCount
                                const left = occurrence.lane * width

                                return (
                                  <button
                                    key={`${occurrence.id}-${occurrence.day}`}
                                    type="button"
                                    className="professor-timetable-item"
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      left: `${left}%`,
                                      width: `calc(${width}% - 6px)`
                                    }}
                                    onClick={() => setSelectedClass(occurrence)}
                                  >
                                    <strong>{occurrence.subjectCode}</strong>
                                    <span>{occurrence.blockCode}</span>
                                    <small>{occurrence.startTime} - {occurrence.endTime}</small>
                                    <small>{occurrence.room}</small>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            }

            if (noFilterMatches) {
              return (
                <div className="professor-empty-state">
                  <h3>No schedule or event matches your selected filters.</h3>
                  <p>Try adjusting the filters or a different search query.</p>
                </div>
              )
            }

            return (
              <div className="professor-empty-state">
                <h3>No timetable entries</h3>
                <p>Assign meeting times are not available in your current schedule list.</p>
              </div>
            )
          })()}
        </div>

        <section className="professor-schedule-event-panel professor-schedule-event-panel-horizontal">
          <div className="professor-schedule-event-head">
            <h3>School Calendar of Events</h3>
            <p>Academic notices affecting teaching schedules.</p>
          </div>

          {eventModeEnabled ? (
            <div className="professor-schedule-event-body">
              <div className="professor-mini-calendar">
                <div className="professor-mini-calendar-head">
                  <button type="button" onClick={handlePrevMonth} aria-label="Previous month">◀</button>
                  <strong>
                    {calendarMonth.toLocaleString(undefined, { month: 'long' })} {calendarMonth.getFullYear()}
                  </strong>
                  <button type="button" onClick={handleNextMonth} aria-label="Next month">▶</button>
                </div>

                <div className="professor-mini-calendar-row">
                  {SCHOOL_DAYS.map((day) => (
                    <span key={`cal-head-${day}`}>{DAY_SHORT[day]}</span>
                  ))}
                </div>

                <div className="professor-mini-calendar-grid">
                  {monthGrid.map((cell, index) => {
                    if (!cell) {
                      return <span key={`empty-${index}`} className="professor-mini-calendar-empty" />
                    }

                    const isActive = calendarDate === cell.date
                    const classes = [
                      'professor-mini-calendar-day',
                      cell.isToday ? 'is-today' : '',
                      cell.hasEvent ? 'has-event' : '',
                      isActive ? 'is-active' : ''
                    ].filter(Boolean).join(' ')

                    return (
                      <button
                        type="button"
                        key={cell.key}
                        className={classes}
                        onClick={() => setCalendarDate((prev) => (prev === cell.date ? null : cell.date))}
                      >
                        <span className="professor-mini-calendar-date">{cell.day}</span>
                        {cell.previews.length > 0 && (
                          <span className="professor-mini-calendar-timeline">
                            {cell.previews.map((preview) => (
                              <span
                                key={preview.id}
                                className={`professor-mini-calendar-event-line tag-${preview.tagClass}`}
                                title={`${preview.title} • ${preview.label}`}
                              >
                                <span className="professor-mini-calendar-event-label">
                                  {preview.title}
                                </span>
                                <span
                                  className="professor-mini-calendar-event-fill"
                                  style={{
                                    left: `${preview.offsetPercent}%`,
                                    width: `${preview.widthPercent}%`
                                  }}
                                />
                              </span>
                            ))}
                            {cell.extraCount > 0 && (
                              <span className="professor-mini-calendar-more">+{cell.extraCount}</span>
                            )}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="professor-schedule-event-list">
                <h4>{eventListTitle}</h4>

                {eventLoading ? (
                  <p>Loading school events...</p>
                ) : eventsForActiveDate.length === 0 ? (
                  <p>{emptyEventListText}</p>
                ) : (
                  eventsForActiveDate
                    .slice(0, 8)
                    .map((event) => {
                      const eventTag = event.statusTagClass || 'general'
                      return (
                        <button
                          type="button"
                          key={event.id}
                          className="professor-schedule-event-item"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="professor-schedule-event-header">
                            <strong>{event.title}</strong>
                            <span className={`professor-schedule-event-tag tag-${eventTag}`}>{event.statusTag}</span>
                          </div>
                          <div className="professor-schedule-event-meta">
                            {event.date} • {event.time} • {event.category}
                          </div>
                        </button>
                      )
                    })
                )}
              </div>
            </div>
          ) : (
            <div className="professor-empty-state">
              <h3>School events hidden</h3>
              <p>Switch scope to both / events to view calendar events.</p>
            </div>
          )}
        </section>
      </div>

      {selectedClass && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedClass(null)}>
          <div className="professor-student-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>Class Details</h3>
              <button className="professor-btn professor-btn-secondary" type="button" onClick={() => setSelectedClass(null)}>Close</button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Subject Code:</strong> {selectedClass.subjectCode}</div>
                <div><strong>Subject Title:</strong> {selectedClass.subjectTitle}</div>
                <div><strong>Section / Block:</strong> {selectedClass.blockCode}</div>
                <div><strong>Schedule:</strong> {formatDaysLabel(selectedClass.days)} • {formatDuration(selectedClass)}</div>
                <div><strong>Room:</strong> {selectedClass.room}</div>
                <div><strong>Building / Location:</strong> {selectedClass.building}</div>
                <div><strong>Class Type:</strong> {selectedClass.classType}</div>
                <div><strong>Semester:</strong> {selectedClass.semester}</div>
                <div><strong>School Year:</strong> {selectedClass.schoolYear}</div>
                <div><strong>Enrolled Students:</strong> {selectedClass.enrolledStudents}</div>
              </div>

              <div className="professor-schedule-modal-actions">
                <button className="professor-btn" type="button">View Student Roster</button>
                <button className="professor-btn professor-btn-secondary" type="button">View Attendance</button>
                <button className="professor-btn professor-btn-secondary" type="button">View Grades</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="professor-student-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="professor-student-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="professor-student-modal-header">
              <h3>School Event</h3>
              <button className="professor-btn professor-btn-secondary" type="button" onClick={() => setSelectedEvent(null)}>Close</button>
            </div>
            <div className="professor-student-modal-content">
              <div className="professor-student-modal-grid">
                <div><strong>Title:</strong> {selectedEvent.title}</div>
                <div><strong>Date:</strong> {selectedEvent.date}</div>
                <div><strong>Time:</strong> {selectedEvent.time}</div>
                <div><strong>Type:</strong> {selectedEvent.category}</div>
                <div><strong>Status:</strong> {selectedEvent.statusTag}</div>
                <div><strong>Day:</strong> {selectedEventDay || 'N/A'}</div>
              </div>
              <p><strong>Description:</strong> {selectedEvent.description}</p>

              <div className="professor-student-academic">
                <h4>Affected classes</h4>
                <ul>
                  {(filteredClasses.filter((entry) => {
                    if (!selectedEventDay) return false
                    if (entry.days.length === 0) return false
                    return entry.days.includes(selectedEventDay)
                  })).length === 0 ? (
                    <li>No directly affected classes identified.</li>
                  ) : (
                    filteredClasses
                      .filter((entry) => {
                        if (!selectedEventDay) return false
                        if (entry.days.length === 0) return false
                        return entry.days.includes(selectedEventDay)
                      })
                      .map((entry) => (
                        <li key={`${entry.id}-${selectedEventDay}`}>{entry.subjectCode} • {entry.blockCode}</li>
                      ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

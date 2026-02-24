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

type ProfessorView = 'dashboard' | 'courses' | 'students' | 'grades' | 'schedule' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details' | 'subject-detail'

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
  const [assignedCourses, setAssignedCourses] = useState<ProfessorAssignedCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [coursesError, setCoursesError] = useState('')
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<ProfessorSubjectDetailState | null>(null)
  
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

  useEffect(() => {
    if (view === 'courses') {
      void fetchAssignedCourses()
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

      const response = await fetch(`${API_URL}/api/professor/assigned-blocks`, {
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
      setAssignedCourses(courses)
    } catch (error) {
      console.error('Failed to fetch professor assigned blocks:', error)
      setAssignedCourses([])
      setCoursesError(error instanceof Error ? error.message : 'Failed to load assigned blocks.')
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
            courses={assignedCourses}
            loading={coursesLoading}
            error={coursesError}
            onRefresh={fetchAssignedCourses}
            onOpenSubjectDetail={(detail) => {
              setSelectedSubjectDetail(detail)
              setView('subject-detail')
            }}
          />
        )
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
      case 'subject-detail':
        return (
          <ProfessorSubjectDetail
            detail={selectedSubjectDetail}
            onBack={() => setView('courses')}
          />
        )
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
              className={`professor-sidebar-link ${(view === id || (view === 'subject-detail' && id === 'courses')) ? 'professor-sidebar-link-active' : ''}`}
              onClick={() => setView(id)}
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

interface CourseManagementProps {
  courses: ProfessorAssignedCourse[]
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onOpenSubjectDetail: (detail: ProfessorSubjectDetailState) => void
}

function CourseManagement({ courses, loading, error, onRefresh, onOpenSubjectDetail }: CourseManagementProps) {
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid')

  const toCourseDisplayCode = (value: string) => {
    const raw = String(value || '').trim()
    if (!raw) return '000'
    if (/^\d+$/.test(raw)) return raw

    const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    if (normalized.includes('BEED')) return '101'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'
    return raw
  }

  const getSectionSuffix = (sectionCode: string) => {
    const text = String(sectionCode || '').trim()
    if (!text) return 'TBA'
    const parts = text.split('-').map((part) => part.trim()).filter(Boolean)
    return parts.length > 1 ? parts[parts.length - 1] : text
  }

  const formatBlockCode = (courseCode: string, sectionCode: string) => {
    const displayCourseCode = toCourseDisplayCode(courseCode)
    const sectionSuffix = getSectionSuffix(sectionCode)
    return String(`${displayCourseCode}-${sectionSuffix}`)
  }

  return (
    <div className="professor-section">
      <h2 className="professor-section-title">My Courses</h2>
      <p className="professor-section-desc">View course blocks and subjects assigned by the registrar.</p>

      <div className="professor-course-toolbar">
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
        <button className="professor-btn" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Assigned Blocks'}
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
      ) : (
        <div className={`professor-course-grid ${layoutMode === 'list' ? 'professor-course-layout-list' : 'professor-course-layout-grid'}`}>
          {courses.map((course) => (
            <div key={course.courseCode} className="placeholder-card professor-course-card">
              <div className="professor-course-header">
                <h3>{course.courseCode}</h3>
                <span className="professor-course-summary">{course.blocks.length} block(s)</span>
              </div>

              <div className="professor-block-list">
                {course.blocks.map((block) => (
                  <div
                    key={`${course.courseCode}-${block.sectionCode}-${block.semester}-${block.schoolYear}`}
                    className="professor-block-item"
                  >
                    <div className="professor-block-head">
                      <strong>{formatBlockCode(course.courseCode, block.sectionCode)}</strong>
                      <span>{block.semester} | {block.schoolYear}</span>
                    </div>
                    <div className="professor-subject-list">
                      {block.subjects.map((subject) => {
                        const blockCode = formatBlockCode(course.courseCode, block.sectionCode)
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
                              <div className="professor-subject-meta">
                                {subject.schedule || 'TBA'} | Room: {subject.room || 'TBA'} | Students: {subject.enrolledStudents}
                              </div>
                            </div>
                          </div>
                          <div className="professor-subject-linkhint">View details</div>
                        </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

        const response = await fetch(`${API_URL}/api/blocks/sections/${detail.sectionId}/students`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
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
        console.error('Failed to fetch subject students:', error)
        if (!cancelled) {
          setStudents([])
          setStudentsError(error instanceof Error ? error.message : 'Failed to load students.')
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchSubjectStudents()
    return () => { cancelled = true }
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

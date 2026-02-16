import { useState, useEffect } from 'react'
import { LayoutDashboard, User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Plus, Video, Users, Blocks, Pencil, Trash2, Check, X } from 'lucide-react'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import SettingsPage from './Settings'
import { getProfile, getStoredToken } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import { API_URL } from '../lib/authApi'
import Announcements from './Announcements'
import AnnouncementDetail from './AnnouncementDetail'
import PersonalDetails from './PersonalDetails'
import StudentManagement from '../components/StudentManagement'
import './RegistrarDashboard.css'

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

type RegistrarView = 'dashboard' | 'students' | 'courses' | 'block-management' | 'assign-subject' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Student Management', icon: GraduationCap },
  { id: 'block-management', label: 'Block Management', icon: Blocks },
  { id: 'assign-subject', label: 'Assign Subject', icon: Users },
  { id: 'courses', label: 'Assign Instructor', icon: BookOpen },
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
      case 'courses':
        return <CourseManagement setView={setView} />
      case 'block-management':
        return <BlockManagement />
      case 'assign-subject':
        return <AssignSubjectPage />
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
              className={`registrar-sidebar-link ${view === id ? 'registrar-sidebar-link-active' : ''}`}
              onClick={() => setView(id)}
              aria-current={view === id ? 'page' : undefined}
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
        </div>

        <div className="registrar-news-section">
          <div className="news-header">
            <Bell size={20} className="news-icon" />
            <h3>Latest Announcements</h3>
            <button 
              className="section-action-btn"
              onClick={() => setView('announcements')}
            >
              <Plus size={16} />
              View All
            </button>
          </div>
          
          {activeAnnouncements.length > 0 ? (
            <div className="dashboard-announcements-container">
              {activeAnnouncements.map((announcement) => (
                <div 
                  key={announcement._id} 
                  className="dashboard-announcement-card clickable"
                  onClick={() => onAnnouncementClick(announcement)}
                >
                  {/* Media Section */}
                  {announcement.media && announcement.media.length > 0 && (
                    <div className="dashboard-media-section">
                      {announcement.media[0].type === 'image' ? (
                        <img 
                          src={announcement.media[0].url} 
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
                    <p className="dashboard-card-message">{announcement.message}</p>

                    <div className="dashboard-card-footer">
                      <div className="dashboard-meta-item">
                        <Users size={12} />
                        <span>{announcement.targetAudience}</span>
                      </div>
                      {announcement.expiresAt && (
                        <div className="dashboard-meta-item" style={{ marginLeft: 'auto', color: '#ef4444' }}>
                          <Clock size={12} />
                          <span>Exp: {formatDate(announcement.expiresAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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


function CourseManagement({ setView }: { setView: (view: RegistrarView) => void }) {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [sections, setSections] = useState<BlockSection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [professors, setProfessors] = useState<ProfessorAccount[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectInstructorName, setSubjectInstructorName] = useState('')
  const [subjectDaySelections, setSubjectDaySelections] = useState<string[]>([])
  const [subjectTimeStart, setSubjectTimeStart] = useState('')
  const [subjectTimeEnd, setSubjectTimeEnd] = useState('')
  const [subjectRoom, setSubjectRoom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }
  const dayOptions = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU']

  const formatBlockGroupLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return 'N/A'
    const parts = text.split('-')
    if (parts.length < 2) return text
    const course = courseAbbreviationByCode[parts[0]] || parts[0]
    const suffix = parts.slice(1).join('-')
    return `${course}-${suffix}`
  }

  const parseSectionSlot = (sectionCode: string) => {
    const text = String(sectionCode || '').toUpperCase()
    const match = text.match(/(\d+)-?([A-Z])$/)
    if (!match) return { yearLevel: 99, blockLetter: 'Z' }
    return {
      yearLevel: Number(match[1]) || 99,
      blockLetter: match[2]
    }
  }

  const formatSectionShortLabel = (sectionCode: string) => {
    const slot = parseSectionSlot(sectionCode)
    if (slot.yearLevel === 99) return sectionCode
    return `${slot.yearLevel}-${slot.blockLetter}`
  }

  const sortedSections = [...sections].sort((a, b) => {
    const slotA = parseSectionSlot(a.sectionCode)
    const slotB = parseSectionSlot(b.sectionCode)
    if (slotA.yearLevel !== slotB.yearLevel) return slotA.yearLevel - slotB.yearLevel
    return slotA.blockLetter.localeCompare(slotB.blockLetter)
  })

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
  const selectedSection = sections.find((section) => section._id === selectedSectionId) || null
  const selectedSubject = subjects.find((subject) => subject._id === selectedSubjectId) || null

  const adviserCounts = sectionStudents.reduce<Record<string, number>>((acc, student) => {
    const key = String(student.assignedProfessor || '').trim() || 'Unassigned'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const adviserRows = Object.entries(adviserCounts).sort((a, b) => b[1] - a[1])

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`
      }
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
  }

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data as BlockGroup[] : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchProfessors = async () => {
    try {
      const data = await authorizedFetch('/api/registrar/professors')
      const nextProfessors = Array.isArray(data?.data) ? data.data as ProfessorAccount[] : []
      setProfessors(nextProfessors)
    } catch (err) {
      setProfessors([])
      setError(err instanceof Error ? err.message : 'Failed to fetch professor list')
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      const nextSections = Array.isArray(data) ? data as BlockSection[] : []
      setSections(nextSections)
      if (!nextSections.some((section) => section._id === selectedSectionId)) {
        setSelectedSectionId('')
        setSectionStudents([])
      }
      setError('')
    } catch (err) {
      setSections([])
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  const extractGroupMeta = (groupName: string) => {
    const normalized = String(groupName || '').trim().toUpperCase()
    const match = normalized.match(/^(\d+)-(\d)-?[A-Z]$/)
    if (!match) return { course: undefined as number | undefined, yearLevel: undefined as number | undefined }
    return {
      course: Number(match[1]) || undefined,
      yearLevel: Number(match[2]) || undefined
    }
  }

  const fetchSubjects = async (group: BlockGroup | null) => {
    try {
      const params = new URLSearchParams()
      if (group) {
        const meta = extractGroupMeta(group.name)
        if (meta.course) params.set('course', String(meta.course))
        if (meta.yearLevel) params.set('yearLevel', String(meta.yearLevel))
        if (group.semester) params.set('semester', group.semester)
      }
      const query = params.toString()
      const data = await authorizedFetch(`/api/registrar/subjects${query ? `?${query}` : ''}`)
      const nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
      setSubjects(nextSubjects)
      setSelectedSubjectId((prev) => (nextSubjects.some((subject) => subject._id === prev) ? prev : ''))
    } catch (err) {
      setSubjects([])
      setSelectedSubjectId('')
      setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
    }
  }

  const fetchSectionStudents = async (sectionId: string) => {
    setLoading(true)
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students`)
      const students = Array.isArray(data?.students) ? data.students as SectionStudent[] : []
      setSectionStudents(students)
      setError('')
    } catch (err) {
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch section students')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignSubjectInstructor = async () => {
    if (!selectedSectionId) {
      setError('Please select a section first')
      return
    }
    if (!selectedSubjectId) {
      setError('Please select a subject')
      return
    }
    const normalizedInstructor = subjectInstructorName.trim()
    const normalizedDays = dayOptions.filter((day) => subjectDaySelections.includes(day)).join('')
    const normalizedSchedule = `${normalizedDays} ${subjectTimeStart}-${subjectTimeEnd}`.trim()
    const normalizedRoom = subjectRoom.trim()
    if (!normalizedInstructor) {
      setError('Please enter professor name for the subject')
      return
    }
    if (!normalizedDays) {
      setError('Please enter schedule days (e.g., WTHF)')
      return
    }
    if (!subjectTimeStart || !subjectTimeEnd) {
      setError('Please select start and end time')
      return
    }
    if (!normalizedRoom) {
      setError('Please enter room')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const payload: Record<string, string> = {
        subjectId: selectedSubjectId,
        instructor: normalizedInstructor,
        schedule: normalizedSchedule,
        room: normalizedRoom
      }
      if (selectedGroup?.semester) payload.semester = selectedGroup.semester
      const response = await authorizedFetch(`/api/registrar/sections/${selectedSectionId}/subject-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const subjectCode = response?.data?.subjectCode || selectedSubject?.code || 'Subject'
      setSuccess(`${subjectCode} assigned to ${normalizedInstructor} at ${normalizedSchedule} in room ${normalizedRoom}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign subject instructor')
    } finally {
      setLoading(false)
    }
  }

  const toggleSubjectDaySelection = (dayCode: string) => {
    setSubjectDaySelections((prev) =>
      prev.includes(dayCode)
        ? prev.filter((day) => day !== dayCode)
        : [...prev, dayCode]
    )
  }

  useEffect(() => {
    void fetchBlockGroups()
    void fetchProfessors()
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      setSectionStudents([])
      setSubjects([])
      setSelectedSubjectId('')
      return
    }
    void fetchSections(selectedGroupId)
    const activeGroup = blockGroups.find((group) => group._id === selectedGroupId) || null
    void fetchSubjects(activeGroup)
  }, [selectedGroupId])

  useEffect(() => {
    if (!selectedSectionId) {
      setSectionStudents([])
      return
    }
    void fetchSectionStudents(selectedSectionId)
  }, [selectedSectionId])

  return (
    <div className="registrar-section">
      <h2 className="registrar-section-title">Assign Instructor</h2>
      <p className="registrar-section-desc">Assign and manage instructor handling per block and section.</p>

      {error && <p style={{ color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p style={{ color: '#16a34a', marginBottom: '0.75rem' }}>{success}</p>}

      <div className="assignment-section">
        <h3>Assign Subject Professor and Time</h3>
        <div className="assignment-form">
          <label>
            Block Group:
            <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
              <option value="">-- Select Block Group --</option>
              {blockGroups.map((group) => (
                <option key={group._id} value={group._id}>
                  {formatBlockGroupLabel(group.name)} ({group.semester} {group.year})
                </option>
              ))}
            </select>
          </label>
          <label>
            Section:
            <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} disabled={!selectedGroupId}>
              <option value="">-- Select Section --</option>
              {sortedSections.map((section) => (
                <option key={section._id} value={section._id}>
                  Block-{formatSectionShortLabel(section.sectionCode).replace('-', '')} ({section.currentPopulation}/{section.capacity})
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject:
            <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGroupId}>
              <option value="">-- Select Subject --</option>
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.code} - {subject.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Professor:
            <select
              value={subjectInstructorName}
              onChange={(e) => setSubjectInstructorName(e.target.value)}
              disabled={!selectedSectionId || !selectedSubjectId || professors.length === 0}
            >
              <option value="">-- Select Professor --</option>
              {professors.map((professor) => (
                <option key={professor._id} value={professor.label}>
                  {professor.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Days:
            <div className="day-checkbox-group">
              {dayOptions.map((dayCode) => (
                <label key={dayCode} className="day-checkbox-item">
                  <input
                    type="checkbox"
                    checked={subjectDaySelections.includes(dayCode)}
                    onChange={() => toggleSubjectDaySelection(dayCode)}
                    disabled={!selectedSectionId || !selectedSubjectId}
                  />
                  <span>{dayCode}</span>
                </label>
              ))}
            </div>
          </label>
          <label>
            Time:
            <div className="time-box-group">
              <input
                type="time"
                className="time-box-input"
                value={subjectTimeStart}
                onChange={(e) => setSubjectTimeStart(e.target.value)}
                disabled={!selectedSectionId || !selectedSubjectId}
              />
              <span className="time-box-separator">to</span>
              <input
                type="time"
                className="time-box-input"
                value={subjectTimeEnd}
                onChange={(e) => setSubjectTimeEnd(e.target.value)}
                disabled={!selectedSectionId || !selectedSubjectId}
              />
            </div>
          </label>
          <label>
            Room:
            <input
              type="text"
              value={subjectRoom}
              onChange={(e) => setSubjectRoom(e.target.value)}
              placeholder="e.g., Room 204"
              disabled={!selectedSectionId || !selectedSubjectId}
            />
          </label>
          <button
            className="registrar-btn"
            onClick={handleAssignSubjectInstructor}
            disabled={loading || !selectedSectionId || !selectedSubjectId || !subjectInstructorName.trim() || subjectDaySelections.length === 0 || !subjectTimeStart || !subjectTimeEnd || !subjectRoom.trim()}
          >
            {loading ? 'Saving...' : 'Assign Subject Instructor'}
          </button>
        </div>
      </div>

      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Open Student List</h3>
          <p>
            {selectedSection
              ? `Showing ${sectionStudents.length} student(s) in Block-${formatSectionShortLabel(selectedSection.sectionCode).replace('-', '')}.`
              : 'Select a section to view students and assignment status.'}
          </p>
          <button className="registrar-btn" onClick={() => setView('students')}>Open Student List</button>
        </div>
        <div className="placeholder-card">
          <h3>Instructor Load</h3>
          <p>Review instructor assignment and section distribution.</p>
          {adviserRows.length > 0 ? (
            <div className="subject-table" style={{ marginTop: '0.35rem' }}>
              <div className="subject-table-header" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <span>Instructor</span>
                <span>Students</span>
              </div>
              <div className="subject-table-body" style={{ maxHeight: '160px' }}>
                {adviserRows.map(([instructor, count]) => (
                  <div key={instructor} className="subject-table-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
                    <span>{instructor}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ marginTop: '0.4rem', color: 'var(--color-text-muted)' }}>
              No instructor load data yet for this section.
            </p>
          )}
          <button className="registrar-btn" onClick={() => setView('students')}>Review Assignments</button>
        </div>
        <div className="placeholder-card">
          <h3>Assignment Reports</h3>
          <p>Generate reports for adviser and subject instructor assignments.</p>
          <p style={{ marginTop: '0.35rem', fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
            {selectedGroup
              ? `Current Group: ${formatBlockGroupLabel(selectedGroup.name)} (${selectedGroup.semester} ${selectedGroup.year})`
              : 'Select a block group to prepare assignment reports.'}
          </p>
          <button className="registrar-btn" onClick={() => setView('reports')}>View Reports</button>
        </div>
      </div>
    </div>
  )
}

type Semester = '1st' | '2nd' | 'Summer'

type BlockGroup = {
  _id: string
  name: string
  semester: Semester
  year: number
  policies?: {
    maxOvercap?: number
  }
}

type BlockSection = {
  _id: string
  sectionCode: string
  capacity: number
  currentPopulation: number
  status: 'OPEN' | 'CLOSED'
}

type BlockStudent = {
  _id: string
  studentNumber: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  yearLevel?: number
  studentStatus?: string
  course?: number | string
}

type SectionStudent = BlockStudent & {
  assignedAt?: string | null
  assignedProfessor?: string
}

type ProfessorAccount = {
  _id: string
  username: string
  displayName: string
  uid: string
  status: string
  label: string
}

type SubjectItem = {
  _id: string
  code: string
  title: string
  units: number
  course?: number
  yearLevel?: number
  semester?: Semester
}

type SubjectDraft = {
  code: string
  title: string
  units: string
}

type OvercapacityData = {
  status: 'OVER_CAPACITY'
  section: {
    id: string
    code: string
    capacity: number
    currentPopulation: number
  }
  projectedPopulation: number
  allowedActions: string[]
  suggestedSections: Array<{
    id: string
    code: string
    availableSlots: number
  }>
}

type OvercapacityDecision = {
  action: string
  reason?: string
  targetSectionId?: string
  newCapacity?: number
}

type OvercapacityControllerModalProps = {
  isOpen: boolean
  data: OvercapacityData | null
  onClose: () => void
  onDecision: (decision: OvercapacityDecision) => void
}

function OvercapacityControllerModal({ isOpen, data, onClose, onDecision }: OvercapacityControllerModalProps) {
  const [selectedAction, setSelectedAction] = useState('')
  const [reason, setReason] = useState('')
  const [targetSection, setTargetSection] = useState('')
  const [newCapacity, setNewCapacity] = useState('')

  if (!isOpen || !data) return null

  const handleSubmit = () => {
    const decision: OvercapacityDecision = { action: selectedAction, reason }

    if (selectedAction === 'TRANSFER') {
      decision.targetSectionId = targetSection
    } else if (selectedAction === 'INCREASE_CAPACITY') {
      decision.newCapacity = parseInt(newCapacity, 10)
    }

    onDecision(decision)
    setSelectedAction('')
    setReason('')
    setTargetSection('')
    setNewCapacity('')
  }

  const section = data.section
  const overCapCount = Math.max(0, data.projectedPopulation - section.capacity)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Section Overcapacity Controller</h3>
          <button onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="info-section">
            <h4>Section Information</h4>
            <p><strong>Section:</strong> {section.code}</p>
            <p><strong>Current Population:</strong> {section.currentPopulation}</p>
            <p><strong>Capacity:</strong> {section.capacity}</p>
            <p><strong>Projected Population:</strong> {data.projectedPopulation}</p>
          </div>

          <div className="capacity-status">
            <h4>Capacity Status</h4>
            <div className="status-bar">
              <div className="filled" style={{ width: `${(section.currentPopulation / section.capacity) * 100}%` }}></div>
              <div className="projected" style={{ width: `${((data.projectedPopulation - section.currentPopulation) / section.capacity) * 100}%` }}></div>
            </div>
            <p>Overcapacity: {overCapCount}</p>
          </div>

          <div className="suggested-sections">
            <h4>Suggested Sections</h4>
            <ul>
              {data.suggestedSections.map(s => (
                <li key={s.id}>{s.code} - {s.availableSlots} slots available</li>
              ))}
            </ul>
          </div>

          <div className="actions-section">
            <h4>Choose Action</h4>
            <div className="action-buttons">
              {data.allowedActions.map(action => (
                <button key={action} onClick={() => setSelectedAction(action)} className={selectedAction === action ? 'selected' : ''}>
                  {action.replace('_', ' ')}
                </button>
              ))}
            </div>

            {(selectedAction === 'OVERRIDE' || selectedAction === 'INCREASE_CAPACITY' || selectedAction === 'CLOSE_SECTION') && (
              <div className="reason-form">
                <label>Reason:</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
              </div>
            )}

            {selectedAction === 'TRANSFER' && (
              <div className="transfer-form">
                <label>Select Target Block:</label>
                <select value={targetSection} onChange={(e) => setTargetSection(e.target.value)}>
                  <option value="">-- Select Block --</option>
                  {data.suggestedSections.map(s => (
                    <option key={s.id} value={s.id}>{s.code}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedAction === 'INCREASE_CAPACITY' && (
              <div className="capacity-form">
                <label>New Capacity:</label>
                <input type="number" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} min={section.capacity} />
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={
                !selectedAction ||
                (selectedAction === 'OVERRIDE' && !reason) ||
                (selectedAction === 'TRANSFER' && !targetSection) ||
                (selectedAction === 'INCREASE_CAPACITY' && (!reason || !newCapacity))
              }
            >
              Execute Action
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockManagement() {
  const blockCourseOptions: Array<{ value: number; label: string }> = [
    { value: 101, label: 'BEED' },
    { value: 102, label: 'BSEd-English' },
    { value: 103, label: 'BSEd-Math' },
    { value: 201, label: 'BSBA-HRM' }
  ]
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<BlockGroup | null>(null)
  const [sections, setSections] = useState<BlockSection[]>([])
  const [students, setStudents] = useState<BlockStudent[]>([])
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [activeDetailSectionId, setActiveDetailSectionId] = useState('')
  const [sectionStudentsLoading, setSectionStudentsLoading] = useState(false)
  const [overcapacityData, setOvercapacityData] = useState<OvercapacityData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newGroupCourse, setNewGroupCourse] = useState<number>(103)
  const [newGroupBlockNumber, setNewGroupBlockNumber] = useState('1-A')
  const [newGroupSemester, setNewGroupSemester] = useState<Semester>('1st')
  const [newGroupYear, setNewGroupYear] = useState<number>(new Date().getFullYear())
  const openBlocks = sections.filter((s) => (s.status || 'OPEN').toUpperCase() === 'OPEN')
  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }

  const formatBlockLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return value
    const parts = text.split('-')
    if (parts.length === 0) return text
    const first = parts[0]
    const mapped = courseAbbreviationByCode[first] || first
    return [mapped, ...parts.slice(1)].join('-')
  }

  const parseBlockSlot = (value: string) => {
    const text = String(value || '').trim().toUpperCase()
    if (!text) return null

    const directMatch = text.match(/(?:^|-)(\d+)([A-Z])$/)
    if (directMatch) {
      return {
        yearLevel: Number(directMatch[1]) || 99,
        letter: directMatch[2]
      }
    }

    const dashedMatch = text.match(/(?:^|-)(\d+)-([A-Z])$/)
    if (dashedMatch) {
      return {
        yearLevel: Number(dashedMatch[1]) || 99,
        letter: dashedMatch[2]
      }
    }

    return null
  }

  const formatBlockColumnLabel = (value: string) => {
    const slot = parseBlockSlot(value)
    if (!slot) return formatBlockLabel(value)
    return `${slot.yearLevel}-${slot.letter}`
  }

  const getCourseAbbreviation = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return 'N/A'
    const first = text.split('-')[0]
    const mapped = courseAbbreviationByCode[first]
    if (mapped) return mapped

    const normalized = first.toUpperCase().replace(/\s+/g, '')
    if (normalized.includes('BEED')) return 'BEED'
    if (normalized.includes('BSED') && normalized.includes('ENGLISH')) return 'BSEd-English'
    if (normalized.includes('BSED') && (normalized.includes('MATH') || normalized.includes('MATHEMATICS'))) return 'BSEd-Math'
    if (normalized.includes('BSBA') && normalized.includes('HRM')) return 'BSBA-HRM'
    return first
  }

  const compareYearBlockLabel = (a: string, b: string) => {
    const matchA = String(a || '').match(/^(\d+)-([A-Z])$/)
    const matchB = String(b || '').match(/^(\d+)-([A-Z])$/)
    if (matchA && matchB) {
      const yearA = Number(matchA[1]) || 99
      const yearB = Number(matchB[1]) || 99
      if (yearA !== yearB) return yearA - yearB
      return matchA[2].localeCompare(matchB[2])
    }
    if (matchA) return -1
    if (matchB) return 1
    return String(a || '').localeCompare(String(b || ''))
  }

  const compareBlockOrder = (a: string, b: string) => {
    const slotA = parseBlockSlot(a)
    const slotB = parseBlockSlot(b)

    if (slotA && slotB) {
      if (slotA.yearLevel !== slotB.yearLevel) {
        return slotA.yearLevel - slotB.yearLevel
      }
      return slotA.letter.localeCompare(slotB.letter)
    }

    if (slotA) return -1
    if (slotB) return 1
    return String(a || '').localeCompare(String(b || ''))
  }

  const sortedBlockGroups = [...blockGroups].sort((a, b) => compareBlockOrder(a.name, b.name))
  const sortedOpenBlocks = [...openBlocks].sort((a, b) => compareBlockOrder(a.sectionCode, b.sectionCode))
  const sortedSections = [...sections].sort((a, b) => compareBlockOrder(a.sectionCode, b.sectionCode))
  const courseRowOrder = ['BEED', 'BSEd-English', 'BSEd-Math', 'BSBA-HRM']
  const yearBlockColumns = Array.from(
    new Set(sortedBlockGroups.map((group) => formatBlockColumnLabel(group.name)))
  ).sort(compareYearBlockLabel)
  const courseRows = Array.from(
    new Set(sortedBlockGroups.map((group) => getCourseAbbreviation(group.name)))
  ).sort((a, b) => {
    const indexA = courseRowOrder.indexOf(a)
    const indexB = courseRowOrder.indexOf(b)
    if (indexA >= 0 && indexB >= 0) return indexA - indexB
    if (indexA >= 0) return -1
    if (indexB >= 0) return 1
    return a.localeCompare(b)
  })
  const blockMatrixMap = new Map<string, BlockGroup[]>()
  sortedBlockGroups.forEach((group) => {
    const rowKey = getCourseAbbreviation(group.name)
    const columnKey = formatBlockColumnLabel(group.name)
    const key = `${rowKey}|${columnKey}`
    const existing = blockMatrixMap.get(key) || []
    existing.push(group)
    blockMatrixMap.set(key, existing)
  })
  const matrixGridColumns = `minmax(140px, 180px) repeat(${Math.max(1, yearBlockColumns.length)}, minmax(120px, 1fr))`

  useEffect(() => {
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroup) {
      setSections([])
      setStudents([])
      setSectionStudents([])
      setSelectedSection('')
      setSelectedStudents([])
      setActiveDetailSectionId('')
      return
    }
    void fetchSections(selectedGroup._id)
    void fetchAssignableStudents(selectedGroup.semester, selectedGroup.year, '', selectedGroup._id)
  }, [selectedGroup])

  useEffect(() => {
    if (!selectedGroup) return
    if (!openBlocks.some((b) => b._id === selectedSection)) setSelectedSection('')
  }, [selectedGroup, sections, selectedSection])

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`
      }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
  }

  const fetchBlockGroups = async () => {
    try {
      const data = await authorizedFetch('/api/blocks/groups')
      setBlockGroups(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
    }
  }

  const fetchSections = async (groupId: string) => {
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${groupId}/sections`)
      setSections(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sections')
    }
  }

  const fetchAssignableStudents = async (semester: Semester, year: number, q = '', groupId = '') => {
    try {
      const encodedQ = encodeURIComponent(q)
      const encodedGroupId = encodeURIComponent(groupId)
      const data = await authorizedFetch(`/api/blocks/assignable-students?semester=${semester}&year=${year}&q=${encodedQ}&groupId=${encodedGroupId}`)
      const nextStudents = Array.isArray(data) ? data : []
      setStudents(nextStudents)
      setSelectedStudents((prev) => prev.filter((id) => nextStudents.some((s) => s._id === id)))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch assignable students')
    }
  }

  const fetchSectionStudents = async (sectionId: string) => {
    setSectionStudentsLoading(true)
    try {
      const data = await authorizedFetch(`/api/blocks/sections/${sectionId}/students`)
      setSectionStudents(Array.isArray(data?.students) ? data.students as SectionStudent[] : [])
      if (data?.section?._id) {
        setSections((prev) =>
          prev.map((section) =>
            section._id === data.section._id
              ? { ...section, currentPopulation: Number(data.section.currentPopulation) || 0 }
              : section
          )
        )
      }
      setError('')
    } catch (err) {
      setSectionStudents([])
      setError(err instanceof Error ? err.message : 'Failed to fetch section students')
    } finally {
      setSectionStudentsLoading(false)
    }
  }

  const formatStudentName = (student: BlockStudent) =>
    `${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.suffix || ''}`.replace(/\s+/g, ' ').trim()

  const courseCodeFromValue = (course?: number | string) => {
    if (course === null || course === undefined) return '000'

    const text = String(course).trim()
    if (!text) return '000'

    const numeric = Number(text)
    if (Number.isFinite(numeric)) return String(Math.trunc(numeric))

    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    if (normalized.includes('BEED')) return '101'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'

    return '000'
  }

  const formatStudentNumber = (student: BlockStudent) => {
    const raw = String(student.studentNumber || '').trim()
    const fallbackCourseCode = courseCodeFromValue(student.course)

    if (!raw) return `0000-${fallbackCourseCode}-00000`

    const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)
    const year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
    const seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'
    const seq = seqPart.slice(-5).padStart(5, '0')
    const courseCode = fallbackCourseCode !== '000'
      ? fallbackCourseCode
      : courseCodeFromValue(parts.find((part) => /[A-Za-z]/.test(part)))

    return `${year}-${courseCode}-${seq}`
  }

  const formatCourseLabel = (course?: number | string) => {
    const code = courseCodeFromValue(course)
    return courseAbbreviationByCode[code] || String(course || 'N/A')
  }

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    )
  }

  const handleSectionCardClick = (sectionId: string) => {
    if (activeDetailSectionId === sectionId) {
      setActiveDetailSectionId('')
      setSectionStudents([])
      return
    }
    setActiveDetailSectionId(sectionId)
    void fetchSectionStudents(sectionId)
  }

  const handleAssignStudent = async () => {
    if (!selectedGroup || selectedStudents.length === 0 || !selectedSection) {
      setError('Please select a block and at least one student')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const overcapacityStudents: string[] = []
      let singleOvercapacityData: OvercapacityData | null = null
      let assignedCount = 0

      for (const studentId of selectedStudents) {
        const data = await authorizedFetch('/api/blocks/assign-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            sectionId: selectedSection,
            semester: selectedGroup.semester,
            year: selectedGroup.year
          })
        })

        if (data?.status === 'OVER_CAPACITY') {
          if (selectedStudents.length === 1) {
            singleOvercapacityData = data as OvercapacityData
            break
          }
          const student = students.find((s) => s._id === studentId)
          overcapacityStudents.push(student ? formatStudentName(student) : studentId)
          continue
        }
        assignedCount += 1
      }

      if (singleOvercapacityData) {
        setOvercapacityData(singleOvercapacityData)
        setIsModalOpen(true)
        return
      }

      const notices: string[] = []
      if (assignedCount > 0) notices.push(`${assignedCount} student(s) assigned successfully`)
      if (overcapacityStudents.length > 0) {
        notices.push(`Overcapacity for: ${overcapacityStudents.join(', ')}`)
      }

      if (notices.length > 0) {
        if (assignedCount > 0) setSuccess(notices.join('. '))
        else setError(notices.join('. '))
      }

      setSelectedStudents([])
      await fetchSections(selectedGroup._id)
      await fetchAssignableStudents(selectedGroup.semester, selectedGroup.year, studentSearch, selectedGroup._id)
      if (activeDetailSectionId) {
        await fetchSectionStudents(activeDetailSectionId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign student')
    } finally {
      setLoading(false)
    }
  }

  const handleOvercapacityDecision = async (decision: OvercapacityDecision) => {
    if (!selectedGroup || selectedStudents.length !== 1 || !selectedSection) return
    try {
      const data = await authorizedFetch('/api/blocks/overcapacity/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...decision,
          studentId: selectedStudents[0],
          sectionId: selectedSection,
          semester: selectedGroup.semester,
          year: selectedGroup.year
        })
      })

      setSuccess((data?.message as string) || 'Action completed successfully')
      setIsModalOpen(false)
      setOvercapacityData(null)
      setSelectedStudents([])
      await fetchSections(selectedGroup._id)
      await fetchAssignableStudents(selectedGroup.semester, selectedGroup.year, studentSearch, selectedGroup._id)
      if (activeDetailSectionId) {
        await fetchSectionStudents(activeDetailSectionId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process decision')
    }
  }

  const handleCreateGroup = async () => {
    const selectedCourse = blockCourseOptions.find((course) => course.value === Number(newGroupCourse))
    const normalizedBlockNumber = String(newGroupBlockNumber || '').trim().toUpperCase()
    const blockMatch = normalizedBlockNumber.match(/^([1-5])-([A-D])$/)

    if (!selectedCourse) {
      setError('Course is required')
      return
    }
    if (!blockMatch) {
      setError('Block number must be in format 1-A to 5-D')
      return
    }
    const generatedGroupName = `${selectedCourse.value}-${normalizedBlockNumber}`
    const [blockYearLevel, blockLetter] = [Number(blockMatch[1]), blockMatch[2]]
    const hasExistingInTerm = blockGroups.some((group) => {
      if (group.semester !== newGroupSemester || Number(group.year) !== Number(newGroupYear)) return false
      const normalizedExisting = String(group.name || '').trim().toUpperCase()
      const existingCourse = Number(normalizedExisting.split('-')[0]) || null
      const existingMatch = normalizedExisting.match(/(?:^|-)(\d+)-?([A-D])$/)
      if (!existingMatch) return false
      return (
        existingCourse === Number(selectedCourse.value) &&
        Number(existingMatch[1]) === blockYearLevel &&
        existingMatch[2] === blockLetter
      )
    })
    if (hasExistingInTerm) {
      setError('Block group already exists for this semester/year')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const created = await authorizedFetch('/api/blocks/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedGroupName,
          semester: newGroupSemester,
          year: Number(newGroupYear)
        })
      })
      await authorizedFetch(`/api/blocks/groups/${(created as BlockGroup)._id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionCode: generatedGroupName,
          capacity: 30,
          schedule: ''
        })
      })
      await fetchBlockGroups()
      setSelectedGroup(created as BlockGroup)
      await fetchSections((created as BlockGroup)._id)
      setNewGroupBlockNumber('1-A')
      setSuccess('Block created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create block')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return
    const confirmed = window.confirm(`Delete block "${selectedGroup.name}"? This cannot be undone.`)
    if (!confirmed) return

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const data = await authorizedFetch(`/api/blocks/groups/${selectedGroup._id}`, {
        method: 'DELETE'
      })
      setSuccess((data?.message as string) || 'Block deleted successfully')
      setSelectedGroup(null)
      setSections([])
      setStudents([])
      setSectionStudents([])
      setSelectedSection('')
      setSelectedStudents([])
      setActiveDetailSectionId('')
      await fetchBlockGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block')
    } finally {
      setLoading(false)
    }
  }

  return (
    <><div className="registrar-section">
      <h2 className="registrar-section-title">Block Management</h2>
      <p className="registrar-section-desc">Assign students and manage capacity by block.</p>

      {error && <p style={{ color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p style={{ color: '#16a34a', marginBottom: '0.75rem' }}>{success}</p>}

      <div className="block-management-content">
        <div className="assignment-section">
          <h3>Create Block</h3>
          <div className="assignment-form">
            <label>
              Course:
              <select value={newGroupCourse} onChange={(e) => setNewGroupCourse(parseInt(e.target.value, 10))}>
                {blockCourseOptions.map((course) => (
                  <option key={course.value} value={course.value}>
                    {course.value} - {course.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Block Number:
              <select value={newGroupBlockNumber} onChange={(e) => setNewGroupBlockNumber(e.target.value)}>
                <option value="1-A">1-A</option>
                <option value="1-B">1-B</option>
                <option value="1-C">1-C</option>
                <option value="1-D">1-D</option>
                <option value="2-A">2-A</option>
                <option value="2-B">2-B</option>
                <option value="2-C">2-C</option>
                <option value="2-D">2-D</option>
                <option value="3-A">3-A</option>
                <option value="3-B">3-B</option>
                <option value="3-C">3-C</option>
                <option value="3-D">3-D</option>
                <option value="4-A">4-A</option>
                <option value="4-B">4-B</option>
                <option value="4-C">4-C</option>
                <option value="4-D">4-D</option>
                <option value="5-A">5-A</option>
                <option value="5-B">5-B</option>
                <option value="5-C">5-C</option>
                <option value="5-D">5-D</option>
              </select>
            </label>
            <label>
              Semester:
              <select value={newGroupSemester} onChange={(e) => setNewGroupSemester(e.target.value as Semester)}>
                <option value="1st">1st</option>
                <option value="2nd">2nd</option>
                <option value="Summer">Summer</option>
              </select>
            </label>
            <label>
              Year:
              <input
                type="number"
                min={2000}
                max={2100}
                value={newGroupYear}
                onChange={(e) => setNewGroupYear(parseInt(e.target.value || `${new Date().getFullYear()}`, 10))} />
            </label>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              Block name preview:{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {`${blockCourseOptions.find((course) => course.value === Number(newGroupCourse))?.value || '000'}-${newGroupBlockNumber}`}
              </strong>
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Uses student course code format (e.g., 103-1-A).
            </p>
            <button className="registrar-btn" onClick={handleCreateGroup} disabled={loading}>
              {loading ? 'Saving...' : 'Create Block'}
            </button>
          </div>
        </div>
      </div>

      <div className="block-selection">
        <div className="block-selection-head">
          <p className="block-selection-title">Select Block:</p>
          <p className="block-selection-subtitle">{blockGroups.length} available</p>
        </div>
        <div className="block-matrix" role="table" aria-label="Block groups by course and year-block">
          {blockGroups.length > 0 ? (
            <>
              <div className="block-matrix-row block-matrix-header" role="row" style={{ gridTemplateColumns: matrixGridColumns }}>
                <div className="block-matrix-course-cell" role="columnheader">Course</div>
                {yearBlockColumns.map((column) => (
                  <div key={column} className="block-matrix-cell block-matrix-column-head" role="columnheader">
                    {column}
                  </div>
                ))}
              </div>
              {courseRows.map((course) => (
                <div key={course} className="block-matrix-row" role="row" style={{ gridTemplateColumns: matrixGridColumns }}>
                  <div className="block-matrix-course-cell" role="rowheader">{course}</div>
                  {yearBlockColumns.map((column) => {
                    const cellGroups = blockMatrixMap.get(`${course}|${column}`) || []
                    return (
                      <div key={`${course}-${column}`} className="block-matrix-cell" role="cell">
                        {cellGroups.length > 0 ? (
                          <div className="block-segmented compact">
                            {cellGroups.map((group) => (
                              <button
                                key={group._id}
                                type="button"
                                role="tab"
                                aria-selected={selectedGroup?._id === group._id}
                                className={`block-segment-btn block-segment-btn-matrix ${selectedGroup?._id === group._id ? 'active' : ''}`}
                                onClick={() => setSelectedGroup(group)}
                                title={`${group.semester} ${group.year}`}
                              >
                                <span className="block-segment-meta">
                                  {`Block-${formatBlockColumnLabel(group.name).replace('-', '')}`}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="block-matrix-empty">-</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            <p className="block-segment-empty">No blocks yet. Create one above.</p>
          )}
        </div>
        <div className="block-selection-actions">
          <button
            className="registrar-btn"
            onClick={() => {
              void fetchBlockGroups()
              if (selectedGroup) void fetchSections(selectedGroup._id)
            } }
            disabled={loading}
          >
            Refresh
          </button>
          {selectedGroup && (
            <button
              className="section-delete-btn"
              onClick={() => void handleDeleteGroup()}
              disabled={loading}
            >
              Delete Block
            </button>
          )}
        </div>
      </div>

      {selectedGroup && (
        <div className="assignment-section">
          <h3>Assign Student to Block</h3>
          <div className="assignment-form">
            <label>
              Search Student:
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Name or student number" />
            </label>
            <button
              className="registrar-btn"
              onClick={() => {
                if (!selectedGroup) return
                void fetchAssignableStudents(selectedGroup.semester, selectedGroup.year, studentSearch, selectedGroup._id)
              } }
              disabled={loading}
            >
              Search
            </button>
            <div className="assignment-segmented-group">
              <p className="assignment-segmented-label">Select Block:</p>
              <div className="block-segmented compact" role="tablist" aria-label="Open blocks">
                {sortedOpenBlocks.map((section) => (
                  <button
                    key={section._id}
                    type="button"
                    role="tab"
                    aria-selected={selectedSection === section._id}
                    className={`block-segment-btn ${selectedSection === section._id ? 'active' : ''}`}
                    onClick={() => setSelectedSection(section._id)}
                  >
                    <span className="block-segment-name">{formatBlockColumnLabel(section.sectionCode)}</span>
                    <span className="block-segment-meta">{section.currentPopulation}/{section.capacity}</span>
                  </button>
                ))}
                {openBlocks.length === 0 && (
                  <p className="block-segment-empty">No open blocks available.</p>
                )}
              </div>
            </div>

            <button
              className="registrar-btn"
              onClick={handleAssignStudent}
              disabled={loading || selectedStudents.length === 0 || !selectedSection}
            >
              {loading ? 'Assigning...' : `Assign Student${selectedStudents.length > 1 ? 's' : ''}`}
            </button>
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Selected students: {selectedStudents.length}
          </p>
          <div className="sections-list" style={{ marginTop: '0.75rem' }}>
            <h3>Student List</h3>
            <div className="student-list" role="listbox" aria-label="Assignable students">
              <div className="student-list-header">
                <span>Name</span>
                <span>Student No.</span>
                <span>Course</span>
                <span>Year Level</span>
                <span>Status</span>
                <span className="student-action-header">Action</span>
              </div>
              <div className="student-list-body">
                {students.map((student) => (
                  <div
                    key={student._id}
                    className={`student-list-row ${selectedStudents.includes(student._id) ? 'selected' : ''}`}
                    role="option"
                    aria-selected={selectedStudents.includes(student._id)}
                  >
                    <span className="student-list-name">{formatStudentName(student)}</span>
                    <span className="student-list-meta">{formatStudentNumber(student)}</span>
                    <span className="student-list-meta">{formatCourseLabel(student.course)}</span>
                    <span className="student-list-meta">YL {student.yearLevel || 'N/A'}</span>
                    <span className="student-list-meta">{student.studentStatus || 'N/A'}</span>
                    <span className="student-action-cell">
                      <button
                        type="button"
                        className={`student-add-btn ${selectedStudents.includes(student._id) ? 'selected' : ''}`}
                        onClick={() => toggleStudentSelection(student._id)}
                        aria-label={selectedStudents.includes(student._id) ? `Remove ${formatStudentName(student)}` : `Add ${formatStudentName(student)}`}
                      >
                        {selectedStudents.includes(student._id) ? '-' : '+'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {students.length === 0 && (
              <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-muted)' }}>
                No assignable students found for this block.
              </p>
            )}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Assignable students available: {students.length}
          </p>
        </div>
      )}

      {selectedGroup && (
        <div className="sections-list">
          <h3>Block Details: {selectedGroup.name}</h3>
          <div className="sections-grid">
            {sortedSections.map(section => (
              <button
                key={section._id}
                type="button"
                className={`section-card section-card-button ${activeDetailSectionId === section._id ? 'active' : ''}`}
                onClick={() => handleSectionCardClick(section._id)}
              >
                <h4>{formatBlockColumnLabel(section.sectionCode)}</h4>
                <p>Capacity: {section.capacity}</p>
                <p>Current: {section.currentPopulation}</p>
                <p>Status: {section.status}</p>
                <p className="section-card-hint">
                  {activeDetailSectionId === section._id ? 'Showing student details' : 'Click to view students'}
                </p>
              </button>
            ))}
          </div>
          {activeDetailSectionId && (
            <div className="section-students-panel">
              <h4>
                Students in {sections.find((s) => s._id === activeDetailSectionId)?.sectionCode || 'Section'}
              </h4>
              <p className="section-students-summary">
                Total Students: {sectionStudents.length}
              </p>
              {sectionStudentsLoading ? (
                <p className="section-students-empty">Loading students...</p>
              ) : sectionStudents.length === 0 ? (
                <p className="section-students-empty">No assigned students in this block yet.</p>
              ) : (
                <div className="section-students-list">
                  <div className="section-students-header">
                    <span>Name</span>
                    <span>Student No.</span>
                    <span>Year Level</span>
                    <span>Status</span>
                  </div>
                  <div className="section-students-body">
                    {sectionStudents.map((student) => (
                      <div key={student._id} className="section-students-row">
                        <span>{formatStudentName(student)}</span>
                        <span>{formatStudentNumber(student)}</span>
                        <span>YL {student.yearLevel || 'N/A'}</span>
                        <span>{student.studentStatus || 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div><OvercapacityControllerModal
        isOpen={isModalOpen}
        data={overcapacityData}
        onClose={() => setIsModalOpen(false)}
        onDecision={handleOvercapacityDecision} /></>
  )
}

function AssignSubjectPage() {
  const [blockGroups, setBlockGroups] = useState<BlockGroup[]>([])
  const [sections, setSections] = useState<BlockSection[]>([])
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([])
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [semester, setSemester] = useState<Semester>('1st')
  const [schoolYear, setSchoolYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`)
  const [subjectDrafts, setSubjectDrafts] = useState<SubjectDraft[]>([{ code: '', title: '', units: '3' }])
  const [loading, setLoading] = useState(false)
  const [creatingSubject, setCreatingSubject] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingSubjectId, setEditingSubjectId] = useState('')
  const [editingSubjectCode, setEditingSubjectCode] = useState('')
  const [editingSubjectTitle, setEditingSubjectTitle] = useState('')
  const [editingSubjectUnits, setEditingSubjectUnits] = useState('3')
  const courseAbbreviationByCode: Record<string, string> = {
    '101': 'BEED',
    '102': 'BSEd-English',
    '103': 'BSEd-Math',
    '201': 'BSBA-HRM'
  }

  const selectedGroup = blockGroups.find((group) => group._id === selectedGroupId) || null

  const formatBlockLabel = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return value
    const parts = text.split('-')
    const first = parts[0]
    const mapped = courseAbbreviationByCode[first] || first
    return [mapped, ...parts.slice(1)].join('-')
  }

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`
      }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data?.error as string) || (data?.message as string) || `Request failed (${response.status})`)
    }
    return data
  }

  const extractCourseFromGroupName = (groupName: string) => {
    const text = String(groupName || '').toUpperCase()
    if (text.includes('101') || text.includes('BEED')) return 101
    if (text.includes('102') || text.includes('ENGLISH')) return 102
    if (text.includes('103') || text.includes('MATH') || text.includes('MATHEMATICS')) return 103
    if (text.includes('201') || text.includes('BSBA') || text.includes('HRM')) return 201
    return undefined
  }

  const extractYearLevelFromGroupName = (groupName: string) => {
    const match = String(groupName || '').match(/(\d+)(?!.*\d)/)
    if (!match) return undefined
    const level = Number(match[1])
    return Number.isFinite(level) ? level : undefined
  }

  useEffect(() => {
    const fetchBlockGroups = async () => {
      try {
        const data = await authorizedFetch('/api/blocks/groups')
        setBlockGroups(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch block groups')
      }
    }
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setSections([])
      setSelectedSectionId('')
      setSectionStudents([])
      setSelectedSubjectIds([])
      setSubjects([])
      return
    }

    const fetchSections = async () => {
      try {
        const data = await authorizedFetch(`/api/blocks/groups/${selectedGroupId}/sections`)
        const nextSections = Array.isArray(data) ? data as BlockSection[] : []
        setSections(nextSections)
        if (selectedGroup) {
          setSemester(selectedGroup.semester)
          setSchoolYear(`${selectedGroup.year}-${selectedGroup.year + 1}`)
        }
        if (!nextSections.some((section) => section._id === selectedSectionId)) {
          setSelectedSectionId('')
          setSectionStudents([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sections')
      }
    }

    void fetchSections()
  }, [selectedGroupId, selectedSectionId, selectedGroup])

  useEffect(() => {
    if (!selectedSectionId) {
      setSectionStudents([])
      return
    }

    const fetchSectionStudents = async () => {
      try {
        const data = await authorizedFetch(`/api/blocks/sections/${selectedSectionId}/students`)
        setSectionStudents(Array.isArray(data?.students) ? data.students as SectionStudent[] : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch section students')
      }
    }

    void fetchSectionStudents()
  }, [selectedSectionId])

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const query = new URLSearchParams()
        if (selectedGroup) {
          const groupCourse = extractCourseFromGroupName(selectedGroup.name)
          const groupYearLevel = extractYearLevelFromGroupName(selectedGroup.name)
          if (groupCourse) query.set('course', String(groupCourse))
          if (groupYearLevel) query.set('yearLevel', String(groupYearLevel))
        }
        if (semester) query.set('semester', semester)
        const queryString = query.toString()
        const data = await authorizedFetch(`/api/registrar/subjects${queryString ? `?${queryString}` : ''}`)
        const nextSubjects = Array.isArray(data?.data) ? data.data as SubjectItem[] : []
        setSubjects(nextSubjects)
        setSelectedSubjectIds((prev) => prev.filter((id) => nextSubjects.some((subject) => subject._id === id)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch subjects')
      }
    }

    void fetchSubjects()
  }, [selectedGroup, semester])

  const handleCreateSubject = async () => {
    setError('')
    setSuccess('')

    if (!selectedGroupId || !selectedGroup) {
      setError('You cannot create a subject without selecting a block group.')
      return
    }

    const cleanedDrafts = subjectDrafts
      .map((draft) => ({
        code: String(draft.code || '').trim().toUpperCase(),
        title: String(draft.title || '').trim(),
        units: Number(draft.units)
      }))
      .filter((draft) => draft.code || draft.title || Number.isFinite(draft.units))

    if (cleanedDrafts.length === 0) {
      setError('Please add at least one subject')
      return
    }

    if (cleanedDrafts.some((draft) => !draft.code || !draft.title || !Number.isFinite(draft.units))) {
      setError('Each subject row must have code, title, and valid units')
      return
    }

    setCreatingSubject(true)
    try {
      const course = selectedGroup ? extractCourseFromGroupName(selectedGroup.name) : undefined
      const yearLevel = selectedGroup ? extractYearLevelFromGroupName(selectedGroup.name) : undefined
      const createdSubjects: SubjectItem[] = []
      const failedCodes: string[] = []

      for (const draft of cleanedDrafts) {
        try {
          const data = await authorizedFetch('/api/registrar/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: draft.code,
              title: draft.title,
              units: draft.units,
              course,
              yearLevel,
              semester
            })
          })
          const createdSubject = data?.data as SubjectItem | undefined
          if (createdSubject?._id) {
            createdSubjects.push(createdSubject)
          }
        } catch {
          failedCodes.push(draft.code)
        }
      }

      if (createdSubjects.length > 0) {
        setSubjects((prev) => {
          const next = [...prev, ...createdSubjects]
          const seen = new Set<string>()
          return next
            .filter((subject) => {
              if (seen.has(subject._id)) return false
              seen.add(subject._id)
              return true
            })
            .sort((a, b) => a.code.localeCompare(b.code))
        })
        setSelectedSubjectIds((prev) => {
          const next = new Set(prev)
          createdSubjects.forEach((subject) => next.add(subject._id))
          return Array.from(next)
        })
      }

      setSubjectDrafts([{ code: '', title: '', units: '3' }])

      if (createdSubjects.length > 0) {
        setSuccess(
          `Created ${createdSubjects.length} subject(s).${failedCodes.length > 0 ? ` Failed: ${failedCodes.join(', ')}` : ''}`
        )
      } else {
        setError(`No subjects were created.${failedCodes.length > 0 ? ` Failed: ${failedCodes.join(', ')}` : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject')
    } finally {
      setCreatingSubject(false)
    }
  }

  const updateSubjectDraft = (index: number, field: keyof SubjectDraft, value: string) => {
    setSubjectDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft))
    )
  }

  const addSubjectDraftRow = () => {
    setSubjectDrafts((prev) => [...prev, { code: '', title: '', units: '3' }])
  }

  const removeSubjectDraftRow = (index: number) => {
    setSubjectDrafts((prev) => {
      if (prev.length === 1) return [{ code: '', title: '', units: '3' }]
      return prev.filter((_, i) => i !== index)
    })
  }

  const toggleSubjectSelection = (subjectId: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    )
  }

  const beginEditSubject = (subject: SubjectItem) => {
    setEditingSubjectId(subject._id)
    setEditingSubjectCode(subject.code)
    setEditingSubjectTitle(subject.title)
    setEditingSubjectUnits(String(subject.units))
    setError('')
    setSuccess('')
  }

  const cancelEditSubject = () => {
    setEditingSubjectId('')
    setEditingSubjectCode('')
    setEditingSubjectTitle('')
    setEditingSubjectUnits('3')
  }

  const saveEditSubject = async () => {
    if (!editingSubjectId) return
    const code = editingSubjectCode.trim().toUpperCase()
    const title = editingSubjectTitle.trim()
    const units = Number(editingSubjectUnits)

    if (!code || !title || !Number.isFinite(units)) {
      setError('Code, title, and units are required for subject update')
      return
    }

    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${editingSubjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, title, units })
      })
      const updated = data?.data as SubjectItem | undefined
      if (updated?._id) {
        setSubjects((prev) => prev.map((subject) => (subject._id === updated._id ? updated : subject)))
      }
      setSuccess((data?.message as string) || 'Subject updated successfully')
      cancelEditSubject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subject')
    }
  }

  const handleDeleteSubject = async (subject: SubjectItem) => {
    const confirmed = window.confirm(`Delete subject "${subject.code} - ${subject.title}"?`)
    if (!confirmed) return

    try {
      const data = await authorizedFetch(`/api/registrar/subjects/${subject._id}`, {
        method: 'DELETE'
      })
      setSubjects((prev) => prev.filter((item) => item._id !== subject._id))
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subject._id))
      if (editingSubjectId === subject._id) {
        cancelEditSubject()
      }
      setSuccess((data?.message as string) || 'Subject deleted successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject')
    }
  }

  const handleAssignSubjects = async () => {
    setError('')
    setSuccess('')

    if (!selectedGroupId) {
      setError('Please select a block group')
      return
    }
    if (!selectedSectionId) {
      setError('Please select a section')
      return
    }
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      setError('School year must follow YYYY-YYYY format')
      return
    }

    if (selectedSubjectIds.length === 0) {
      setError('Please select at least one subject')
      return
    }
    if (sectionStudents.length === 0) {
      setError('No students found in selected section')
      return
    }

    setLoading(true)
    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found')

      let assignedCount = 0
      const failedStudents: string[] = []

      for (const student of sectionStudents) {
        try {
          await fetch(`${API_URL}/registrar/students/${student._id}/enroll`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              schoolYear,
              semester,
              subjectIds: selectedSubjectIds
            })
          }).then(async (response) => {
            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error((data?.message as string) || `Request failed (${response.status})`)
            }
            return response.json()
          })
          assignedCount += 1
        } catch {
          const name = `${student.firstName} ${student.lastName}`.trim()
          failedStudents.push(name || student._id)
        }
      }

      if (assignedCount > 0) {
        setSuccess(`Subjects assigned to ${assignedCount} student(s).${failedStudents.length > 0 ? ` Failed: ${failedStudents.join(', ')}` : ''}`)
      } else {
        setError(`No students were assigned. Failed: ${failedStudents.join(', ')}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign subjects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="registrar-section">
      <h2 className="registrar-section-title">Assign Subject</h2>
      <p className="registrar-section-desc">Assign subjects to students by block and semester.</p>

      {error && <p style={{ color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p style={{ color: '#16a34a', marginBottom: '0.75rem' }}>{success}</p>}

      <div className="assignment-section">
        <h3>Assign Subjects By Block</h3>
        <div className="assignment-form">
          <label>
            Block Group:
            <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
              <option value="">-- Select Block Group --</option>
              {blockGroups.map((group) => (
                <option key={group._id} value={group._id}>
                  {formatBlockLabel(group.name)} ({group.semester} {group.year})
                </option>
              ))}
            </select>
          </label>
          <label>
            Section:
            <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)}>
              <option value="">-- Select Section --</option>
              {sections.map((section) => (
                <option key={section._id} value={section._id}>
                  {section.sectionCode} ({section.currentPopulation}/{section.capacity})
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester:
            <select value={semester} onChange={(e) => setSemester(e.target.value as Semester)}>
              <option value="1st">1st</option>
              <option value="2nd">2nd</option>
              <option value="Summer">Summer</option>
            </select>
          </label>
          <label>
            School Year:
            <input
              type="text"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="YYYY-YYYY"
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Available Subjects:
            <div className="subject-table">
              <div className="subject-table-header">
                <span>Select</span>
                <span>Code</span>
                <span>Title</span>
                <span>Units</span>
                <span>Actions</span>
              </div>
              <div className="subject-table-body">
                {subjects.map((subject) => (
                  <div key={subject._id} className="subject-table-row">
                    <span className="subject-cell-select">
                      <input
                        type="checkbox"
                        checked={selectedSubjectIds.includes(subject._id)}
                        onChange={() => toggleSubjectSelection(subject._id)}
                      />
                    </span>
                    {editingSubjectId === subject._id ? (
                      <>
                        <span>
                          <input
                            type="text"
                            value={editingSubjectCode}
                            onChange={(e) => setEditingSubjectCode(e.target.value.toUpperCase())}
                            className="subject-inline-input"
                          />
                        </span>
                        <span>
                          <input
                            type="text"
                            value={editingSubjectTitle}
                            onChange={(e) => setEditingSubjectTitle(e.target.value)}
                            className="subject-inline-input"
                          />
                        </span>
                        <span>
                          <input
                            type="number"
                            min={0.5}
                            max={6}
                            step={0.5}
                            value={editingSubjectUnits}
                            onChange={(e) => setEditingSubjectUnits(e.target.value)}
                            className="subject-inline-input"
                          />
                        </span>
                        <span className="subject-cell-actions">
                          <button type="button" className="subject-action-btn save" onClick={saveEditSubject} title="Save">
                            <Check size={14} />
                            <span>Save</span>
                          </button>
                          <button type="button" className="subject-action-btn cancel" onClick={cancelEditSubject} title="Cancel">
                            <X size={14} />
                            <span>Cancel</span>
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span>{subject.code}</span>
                        <span>{subject.title}</span>
                        <span>{subject.units}</span>
                        <span className="subject-cell-actions">
                          <button type="button" className="subject-action-btn edit" onClick={() => beginEditSubject(subject)} title="Edit Subject">
                            <Pencil size={14} />
                            <span>Edit</span>
                          </button>
                          <button type="button" className="subject-action-btn delete" onClick={() => handleDeleteSubject(subject)} title="Delete Subject">
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {subjects.length === 0 && (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-muted)' }}>
                No subjects found for this block/semester yet. Create one below.
              </p>
            )}
          </label>
          <button className="registrar-btn" onClick={handleAssignSubjects} disabled={loading || !selectedSectionId}>
            {loading ? 'Assigning...' : 'Assign Subjects To Section'}
          </button>
        </div>

        <div className="sections-list" style={{ marginTop: '1rem' }}>
          <h3>Create Subject</h3>
          <div className="subject-create-list">
            {subjectDrafts.map((draft, index) => (
              <div key={`subject-draft-${index}`} className="subject-create-row">
                <label>
                  Subject Code:
                  <input
                    type="text"
                    value={draft.code}
                    onChange={(e) => updateSubjectDraft(index, 'code', e.target.value.toUpperCase())}
                    placeholder="ENG101"
                    disabled={!selectedGroupId}
                  />
                </label>
                <label>
                  Subject Title:
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateSubjectDraft(index, 'title', e.target.value)}
                    placeholder="English Communication"
                    disabled={!selectedGroupId}
                  />
                </label>
                <label>
                  Units:
                  <input
                    type="number"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={draft.units}
                    onChange={(e) => updateSubjectDraft(index, 'units', e.target.value)}
                    disabled={!selectedGroupId}
                  />
                </label>
                <button
                  className="section-delete-btn"
                  onClick={() => removeSubjectDraftRow(index)}
                  disabled={!selectedGroupId}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="subject-create-actions">
              <button className="registrar-btn" onClick={addSubjectDraftRow} disabled={!selectedGroupId} type="button">
                Add Another Subject
              </button>
              <button className="registrar-btn" onClick={handleCreateSubject} disabled={creatingSubject || !selectedGroupId} type="button">
                {creatingSubject ? 'Creating...' : `Create ${subjectDrafts.length} Subject${subjectDrafts.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
          {!selectedGroupId && (
            <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-muted)' }}>
              Select a block group first before creating a subject.
            </p>
          )}
        </div>

        <div className="sections-list" style={{ marginTop: '1rem' }}>
          <h3>Students In Selected Section</h3>
          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text-muted)' }}>
            Total Students: {sectionStudents.length}
          </p>
          <div className="student-list">
            <div className="student-list-header" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr' }}>
              <span>Name</span>
              <span>Student No.</span>
              <span>Year Level</span>
              <span>Status</span>
            </div>
            <div className="student-list-body">
              {sectionStudents.map((student) => (
                <div key={student._id} className="student-list-row" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr' }}>
                  <span className="student-list-name">
                    {`${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.suffix || ''}`.replace(/\s+/g, ' ').trim()}
                  </span>
                  <span className="student-list-meta">{student.studentNumber}</span>
                  <span className="student-list-meta">YL {student.yearLevel || 'N/A'}</span>
                  <span className="student-list-meta">{student.studentStatus || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>
          {selectedSectionId && sectionStudents.length === 0 && (
            <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)' }}>
              No students assigned to this section.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ReportsDashboard() {
  return (
    <div className="registrar-section">
      <h2 className="registrar-section-title">Reports Dashboard</h2>
      <p className="registrar-section-desc">Generate and view reports on enrollment, academics, and more.</p>
      
      <div className="placeholder-content">
        <div className="placeholder-card">
          <h3>Enrollment Reports</h3>
          <p>View enrollment statistics by program and semester</p>
          <button className="registrar-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Academic Reports</h3>
          <p>Generate grade distributions and academic standing reports</p>
          <button className="registrar-btn" disabled>Coming Soon</button>
        </div>
        <div className="placeholder-card">
          <h3>Financial Reports</h3>
          <p>Tuition and fee collection reports</p>
          <button className="registrar-btn" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  )
}

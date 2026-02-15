import React, { useState, useEffect } from 'react'
import { LayoutDashboard, User, Settings as SettingsIcon, BookOpen, FileText, GraduationCap, Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Plus, Video, Users, Blocks } from 'lucide-react'
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

type RegistrarView = 'dashboard' | 'students' | 'courses' | 'block-management' | 'reports' | 'profile' | 'settings' | 'announcements' | 'announcement-detail' | 'personal-details'

type RegistrarDashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

const REGISTRAR_NAV_ITEMS: { id: RegistrarView; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Student Management', icon: GraduationCap },
  { id: 'courses', label: 'Course Management', icon: BookOpen },
  { id: 'block-management', label: 'Block Management', icon: Blocks },
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
            <h3>Course Management</h3>
            <p>Create courses and manage class schedules</p>
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
  return (
    <div className="registrar-section">
      <h2 className="registrar-section-title">Student Management</h2>
      <p className="registrar-section-desc">Manage student admissions, enrollment, and academic records</p>

      <div className="placeholder-content">
        <div className="placeholder-card" style={{ cursor: 'pointer' }} onClick={() => setView('students')}>
          <h3>Student Admissions</h3>
          <p>Process new student applications and enrollments</p>
          <button className="registrar-btn" onClick={(e) => { e.stopPropagation(); setView('students'); }}>Go to Admissions</button>
        </div>
        <div className="placeholder-card" style={{ cursor: 'pointer' }} onClick={() => setView('students')}>
          <h3>Student Records</h3>
          <p>View and update existing student information</p>
          <button className="registrar-btn" onClick={(e) => { e.stopPropagation(); setView('students'); }}>Manage Records</button>
        </div>
        <div className="placeholder-card" style={{ cursor: 'pointer' }} onClick={() => setView('reports')}>
          <h3>Enrollment Status</h3>
          <p>Check enrollment status and academic standing</p>
          <button className="registrar-btn" onClick={(e) => { e.stopPropagation(); setView('reports'); }}>View Status</button>
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
  course?: number
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
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [overcapacityData, setOvercapacityData] = useState<OvercapacityData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newGroupCourse, setNewGroupCourse] = useState<number>(103)
  const [newGroupLevel, setNewGroupLevel] = useState<number>(1)
  const [newGroupBlockLetter, setNewGroupBlockLetter] = useState('A')
  const [newGroupSemester, setNewGroupSemester] = useState<Semester>('1st')
  const [newGroupYear, setNewGroupYear] = useState<number>(new Date().getFullYear())
  const openBlocks = sections.filter((s) => (s.status || 'OPEN').toUpperCase() === 'OPEN')

  useEffect(() => {
    void fetchBlockGroups()
  }, [])

  useEffect(() => {
    if (!selectedGroup) {
      setSections([])
      setStudents([])
      setSelectedSection('')
      setSelectedStudents([])
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

  const formatStudentName = (student: BlockStudent) =>
    `${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.suffix || ''}`.replace(/\s+/g, ' ').trim()

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    )
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process decision')
    }
  }

  const handleCreateGroup = async () => {
    const selectedCourse = blockCourseOptions.find((course) => course.value === Number(newGroupCourse))
    const normalizedLevel = Number(newGroupLevel)
    const normalizedLetter = String(newGroupBlockLetter || '').trim().toUpperCase().slice(0, 1)

    if (!selectedCourse) {
      setError('Course is required')
      return
    }
    if (!Number.isFinite(normalizedLevel) || normalizedLevel < 1 || normalizedLevel > 5) {
      setError('Year level must be between 1 and 5')
      return
    }
    if (!/^[A-Z]$/.test(normalizedLetter)) {
      setError('Block letter must be a single letter (A-Z)')
      return
    }

    const generatedGroupName = `${selectedCourse.value}-${normalizedLevel}${normalizedLetter}`

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
      setNewGroupLevel(1)
      setNewGroupBlockLetter('A')
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
      setSelectedSection('')
      setSelectedStudents([])
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
              Year Level:
              <select value={newGroupLevel} onChange={(e) => setNewGroupLevel(parseInt(e.target.value, 10))}>
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
                <option value={5}>5th Year</option>
              </select>
            </label>
            <label>
              Block Letter:
              <input
                type="text"
                value={newGroupBlockLetter}
                maxLength={1}
                onChange={(e) => setNewGroupBlockLetter(e.target.value.toUpperCase())}
                placeholder="A" />
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
                {`${blockCourseOptions.find((course) => course.value === Number(newGroupCourse))?.value || '000'}-${newGroupLevel}${String(newGroupBlockLetter || '').trim().toUpperCase().slice(0, 1) || 'A'}`}
              </strong>
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Uses student course code format (e.g., 103-1A).
            </p>
            <button className="registrar-btn" onClick={handleCreateGroup} disabled={loading}>
              {loading ? 'Saving...' : 'Create Block'}
            </button>
          </div>
        </div>
      </div>

      <div className="block-selection">
        <label>
          Select Block:
          <select
            value={selectedGroup?._id || ''}
            onChange={(e) => setSelectedGroup(blockGroups.find(g => g._id === e.target.value) || null)}
          >
            <option value="">-- Select Block --</option>
            {blockGroups.map(group => (
              <option key={group._id} value={group._id}>
                {group.name} ({group.semester} {group.year})
              </option>
            ))}
          </select>
        </label>
        <button
          className="registrar-btn"
          onClick={() => {
            void fetchBlockGroups()
            if (selectedGroup) void fetchSections(selectedGroup._id)
          } }
          disabled={loading}
          style={{ marginLeft: '0.75rem' }}
        >
          Refresh
        </button>
        {selectedGroup && (
          <button
            className="section-delete-btn"
            onClick={() => void handleDeleteGroup()}
            disabled={loading}
            style={{ marginLeft: '0.5rem' }}
          >
            Delete Block
          </button>
        )}
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
            <label>
              Select Block:
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
                <option value="">-- Select Block --</option>
                {openBlocks.map(section => (
                  <option key={section._id} value={section._id}>
                    {section.sectionCode} ({section.currentPopulation}/{section.capacity})
                  </option>
                ))}
              </select>
            </label>

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
                    <span className="student-list-meta">{student.studentNumber}</span>
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
            {sections.map(section => (
              <div key={section._id} className="section-card">
                <h4>{section.sectionCode}</h4>
                <p>Capacity: {section.capacity}</p>
                <p>Current: {section.currentPopulation}</p>
                <p>Status: {section.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div><OvercapacityControllerModal
        isOpen={isModalOpen}
        data={overcapacityData}
        onClose={() => setIsModalOpen(false)}
        onDecision={handleOvercapacityDecision} /></>
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

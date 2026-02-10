import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import Settings from './Settings'
import AddAccount from './AddAccount'
import AccountLogs from './AccountLogs'
import Announcements from './Announcements'
import AuditLogs from './AuditLogs'
import DocumentManagement from './DocumentManagement'
import AnnouncementDetail from './AnnouncementDetail'
import { Bell, Pin, Clock, AlertTriangle, Info, AlertCircle, Wrench, Users, Video } from 'lucide-react'
import { getStoredToken, API_URL } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import './Dashboard.css'

type DashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

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
  }
}

type View = 'dashboard' | 'profile' | 'add-account' | 'account-logs'| 'settings' | 'announcements' | 'audit-logs' | 'documents' | 'announcement-detail'

export default function Dashboard({ username, onLogout, onProfileUpdated }: DashboardProps) {
  const [view, setView] = useState<View>('dashboard')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (view === 'dashboard') {
      fetchAnnouncements()
    }
  }, [view])

  // Debug logging
  useEffect(() => {
    console.log('Dashboard: Current view:', view)
    console.log('Dashboard: Loading state:', loading)
    console.log('Dashboard: Announcements count:', announcements.length)
  }, [view, loading, announcements])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      console.log('Dashboard: Fetching announcements...')
      const token = getStoredToken()
      console.log('Dashboard: Token exists:', !!token)
      
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('Dashboard: Response status:', response.status)
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed for dashboard announcements')
          setLoading(false)
          return
        }
        throw new Error(`Failed to fetch announcements: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Dashboard: Announcements data:', data)
      setAnnouncements(data.announcements || [])
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch announcements:', error)
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={12} />
      case 'warning': return <AlertCircle size={12} />
      case 'maintenance': return <Wrench size={12} />
      default: return <Info size={12} />
    }
  }

  const resolveMediaUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('data:')) return url
    // Fix older records that stored absolute localhost URLs
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) {
      try {
        const u = new URL(url)
        return `${API_URL}${u.pathname}${u.search || ''}`
      } catch {
        // fall through to generic handling
      }
    }
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    // Treat as path on API server (handles "/uploads/..." or "uploads/...")
    const normalized = url.startsWith('/') ? url : `/${url}`
    return `${API_URL}${normalized}`
  }

  const handleAnnouncementClick = () => {
    setView('announcement-detail')
  }

  return (
    <div className="dashboard">
      <Sidebar activeLink={view} onNavigate={setView} />
      <div className="dashboard-body">
        <Navbar username={username} onLogout={onLogout} />
        <main className="dashboard-main">
          {view === 'profile' ? (
            <Profile onProfileUpdated={onProfileUpdated} />
          ) : view === 'settings' ? (
            <Settings onProfileUpdated={onProfileUpdated} onLogout={onLogout} />
          ) : view === 'add-account' ? (
            <AddAccount />
          ) : view === 'account-logs' ? (
            <AccountLogs />
          ) : view === 'announcements' ? (
            <Announcements />
          ) : view === 'audit-logs' ? (
            <AuditLogs />
          ) : view === 'documents' ? (
            <DocumentManagement />
          ) : view === 'announcement-detail' ? (
            <AnnouncementDetail 
              announcementId={''} 
              onBack={() => setView('dashboard')}
            />
          ) : (
            <div className="dashboard-content">
              <div className="dashboard-header-content">
                <div>
                  <h1 className="dashboard-title">Admin overview</h1>
                  <p className="dashboard-subtitle">
                    Quick snapshot of accounts, documents, and recent activity.
                  </p>
                </div>
              </div>

              <div className="dashboard-announcements-container">
                {loading ? (
                  <div className="dashboard-loading">
                    <div className="dashboard-spinner"></div>
                    <p>Loading announcements...</p>
                  </div>
                ) : announcements.filter(a => a.isActive).length === 0 ? (
                  <div className="dashboard-empty">
                    <Bell size={48} />
                    <h3>No announcements</h3>
                    <p>Check back later for updates.</p>
                  </div>
                ) : (
                  announcements.filter(a => a.isActive).map((announcement) => (
                    <div 
                      key={announcement._id} 
                      className="dashboard-announcement-card clickable"
                      onClick={() => handleAnnouncementClick()}
                    >
                      {/* Media Section */}
                      {announcement.media && announcement.media.length > 0 && (
                        <div className="dashboard-media-section">
                          {announcement.media[0].type === 'image' ? (
                            <img 
                              src={resolveMediaUrl(announcement.media[0].url)} 
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
                              <span className="dashboard-type-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                                <Pin size={10} /> Pinned
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
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

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
import PersonalDetails from './PersonalDetails'
import SystemHealth from './SystemHealth'
import Security from './Security'
import CorGeneration from './CorGeneration'
import StatisticsCard from '../components/StatisticsCard'
import MiniEventCalendar from '../components/MiniEventCalendar'
import { User, Users, FileText, Wrench } from 'lucide-react'
import { getStoredToken, API_URL } from '../lib/authApi'
import type { ProfileResponse } from '../lib/authApi'
import './Dashboard.css'

type DashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

type View = 'dashboard' | 'profile' | 'add-account' | 'account-logs'| 'settings' | 'announcements' | 'audit-logs' | 'documents' | 'announcement-detail' | 'personal-details' | 'system-health' | 'security' | 'cor-docs'

export default function Dashboard({ username, onLogout, onProfileUpdated }: DashboardProps) {
  const [view, setView] = useState<View>('dashboard')
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string>('')
  const [metrics, setMetrics] = useState<any>(null)
  const [registrationLogs, setRegistrationLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Debug view changes
  useEffect(() => {
    // View change tracking can be added here if needed
  }, [view]);

  useEffect(() => {
    if (view === 'dashboard') {
      fetchMetrics()
      fetchRegistrationLogs()
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

  const fetchMetrics = async (forceScan = false) => {
    try {
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/system-health${forceScan ? '?forceScan=true' : ''}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    }
  }

  
  const fetchRegistrationLogs = async () => {
    try {
      setLogsLoading(true)
      const token = await getStoredToken()
      
      const response = await fetch(`${API_URL}/api/admin/registration-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        // Get only the latest 3 logs for dashboard display
        setRegistrationLogs(data.logs?.slice(0, 3) || [])
      }
    } catch (error) {
      console.error('Failed to fetch registration logs:', error)
    } finally {
      setLogsLoading(false)
    }
  }

  const getAccountTypeIcon = (accountType: string) => {
    switch (accountType) {
      case 'admin':
        return <Wrench size={16} style={{ color: 'var(--text-primary)' }} />
      case 'registrar':
        return <FileText size={16} style={{ color: 'var(--text-primary)' }} />
      case 'professor':
        return <User size={16} style={{ color: 'var(--text-primary)' }} />
      default:
        return <User size={16} style={{ color: 'var(--text-primary)' }} />
    }
  }

  const getAccountTypeColor = (accountType: string, opacity: number = 1) => {
    switch (accountType) {
      case 'admin':
        return `rgba(59, 130, 246, ${opacity})` // Blue
      case 'registrar':
        return `rgba(16, 185, 129, ${opacity})` // Green
      case 'professor':
        return `rgba(245, 158, 11, ${opacity})` // Orange
      default:
        return `rgba(107, 114, 128, ${opacity})` // Gray
    }
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    } else {
      return 'Just now'
    }
  }

  const handleProfileUpdated = (profile: ProfileResponse) => {
    if (onProfileUpdated) {
      onProfileUpdated(profile)
    }
  }

  const handleNavigate = (nextView: View) => {
    setView(nextView)
    setIsSidebarOpen(false)
  }

  return (
    <div className="dashboard">
      <Sidebar
        activeLink={view}
        onNavigate={handleNavigate}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <button
        type="button"
        className={`dashboard-sidebar-backdrop ${isSidebarOpen ? 'visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Close navigation menu"
      />
      <div className="dashboard-body">
        <Navbar
          username={username}
          onLogout={onLogout}
          onMenuToggle={() => setIsSidebarOpen((prev) => !prev)}
        />
        <main className="dashboard-main">
          {view === 'profile' ? (
            <Profile onProfileUpdated={handleProfileUpdated} onNavigate={(viewName) => {
              if (viewName === 'personal-details') {
                setView('personal-details')
              }
            }} />
          ) : view === 'settings' ? (
            <Settings onProfileUpdated={onProfileUpdated} onLogout={onLogout} />
          ) : view === 'add-account' ? (
            <AddAccount />
          ) : view === 'account-logs' ? (
            <AccountLogs />
          ) : view === 'announcements' ? (
            <Announcements onNavigate={(viewName: string, announcementId?: string) => {
              if (viewName === 'announcement-detail' && announcementId) {
                setSelectedAnnouncementId(announcementId)
                setView('announcement-detail')
              }
            }} />
          ) : view === 'audit-logs' ? (
            <AuditLogs />
          ) : view === 'documents' ? (
            <DocumentManagement />
          ) : view === 'cor-docs' ? (
            <CorGeneration />
          ) : view === 'announcement-detail' ? (
            <AnnouncementDetail 
              announcementId={selectedAnnouncementId} 
              onBack={() => setView('announcements')}
            />
          ) : view === 'personal-details' ? (
            <PersonalDetails onBack={() => setView('profile')} />
          ) : view === 'system-health' ? (
            <SystemHealth onNavigate={(viewName) => {
              if (viewName === 'security') {
                setView('security');
              }
            }} />
          ) : view === 'security' ? (
            <Security onBack={() => setView('system-health')} />
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

              {/* School Info Bar */}
              <div className="school-info-bar" style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                marginBottom: '2rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '700', 
                    color: 'var(--text-primary)', 
                    margin: '0 0 0.125rem 0' 
                  }}>
                    West Coast College
                  </h3>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)', 
                    margin: '0' 
                  }}>
                    Administration Portal
                  </p>
                </div>
                <div className="school-info-year" style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '700', 
                    color: 'var(--text-primary)' 
                  }}>
                    2026-2027
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--text-secondary)' 
                  }}>
                    Academic Year
                  </div>
                </div>
              </div>

              {/* Account Type Statistics */}
              <div className="dashboard-stats-section" style={{ marginBottom: '2rem' }}>
                <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Registered Users</h2>
                <StatisticsCard
                  statistics={[
                    { 
                      label: 'Administrators', 
                      value: metrics?.statistics?.accountTypes?.admins || 0, 
                      icon: <Wrench size={20} />
                    },
                    { 
                      label: 'Registrars', 
                      value: metrics?.statistics?.accountTypes?.registrars || 0, 
                      icon: <FileText size={20} />
                    },
                    { 
                      label: 'Professors', 
                      value: metrics?.statistics?.accountTypes?.professors || 0, 
                      icon: <User size={20} />
                    },
                    { 
                      label: 'Students', 
                      value: metrics?.statistics?.accountTypes?.students || 0, 
                      icon: <Users size={20} />
                    }
                  ]}
                />
              </div>

              {/* Recent Registration Logs & Calendar */}
              <div className="dashboard-secondary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', marginBottom: '2rem' }}>
                <div className="dashboard-stats-section">
                  <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Recent Registration Logs</h2>
                  <div className="registration-logs-card" style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>
                    {logsLoading ? (
                      <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          border: '2px solid var(--border-color)',
                          borderTop: '2px solid var(--text-primary)',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          margin: '0 auto 1rem'
                        }}></div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading registration logs...</div>
                      </div>
                    ) : registrationLogs.length > 0 ? (
                      <div className="registration-logs-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {registrationLogs.map((log, index) => (
                          <div key={index} className="registration-log-item" style={{
                            padding: '1rem',
                            background: 'var(--bg-primary)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                          }}>
                            <div className="registration-log-main" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: getAccountTypeColor(log.accountType, 0.1),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {getAccountTypeIcon(log.accountType)}
                              </div>
                              <div>
                                <div style={{ 
                                  fontSize: '0.875rem', 
                                  fontWeight: '600', 
                                  color: 'var(--text-primary)',
                                  marginBottom: '0.25rem'
                                }}>
                                  {log.displayName}
                                </div>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  color: 'var(--text-secondary)',
                                  marginBottom: '0.125rem'
                                }}>
                                  {log.email}
                                </div>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  color: 'var(--text-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  <span>{log.accountType}</span>
                                  <span>•</span>
                                  <span>{formatRelativeTime(log.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="registration-log-status" style={{
                              padding: '0.25rem 0.75rem',
                              background: getAccountTypeColor(log.accountType, 0.1),
                              color: getAccountTypeColor(log.accountType),
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              textTransform: 'capitalize'
                            }}>
                              {log.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-secondary)', 
                          marginBottom: '0.5rem' 
                        }}>
                          No recent registration logs found
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          New account registrations will appear here
                        </div>
                      </div>
                    )}
                    
                    {registrationLogs.length > 0 && (
                      <div className="registration-logs-footer" style={{ 
                        marginTop: '1rem', 
                        paddingTop: '1rem', 
                        borderTop: '1px solid var(--border-color)',
                        textAlign: 'center'
                      }}>
                        <button
                          className="registration-logs-btn"
                          onClick={() => setView('account-logs')}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'var(--border-color)'
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'var(--bg-primary)'
                          }}
                        >
                          View All Registration Logs
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard-stats-section">
                  <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Calendar</h2>
                  <MiniEventCalendar />
                </div>
              </div>

              <div className="dashboard-empty" style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                marginTop: '2rem'
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Admin Dashboard
                </h3>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                  System overview and management tools
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

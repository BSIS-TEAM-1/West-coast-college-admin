import React, { useState, useEffect, useMemo } from 'react'
import { Search, Download, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { getStoredToken } from '../lib/authApi'
import { API_URL } from '../lib/authApi'
import './auditlogs-test.css'

interface AuditLog {
  _id: string
  action: string
  resourceType: string
  resourceId: string
  resourceName: string
  description: string
  performedBy: {
    username: string
    displayName: string
  }
  performedByRole: string
  ipAddress: string
  userAgent: string
  newValue?: {
    deviceId?: string | null
    ipAddress?: string | null
    [key: string]: unknown
  }
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  createdAt: string
}

interface AuditStats {
  totalLogs: number
  activeUsers: number
  newAccounts: number
  recentLogs: number
  criticalLogs: number
  actionStats: Array<{ _id: string; count: number }>
  resourceStats: Array<{ _id: string; count: number }>
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [totalLogsCount, setTotalLogsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [performedByInput, setPerformedByInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    severity: '',
    sortOrder: 'newest',
    performedBy: '',
    startDate: '',
    endDate: ''
  })

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [currentPage, filters])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const token = await getStoredToken()
      if (!token) {
        console.error('No authentication token found for audit logs')
        setLogs([])
        setTotalPages(1)
        setTotalLogsCount(0)
        return
      }
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      })

      const response = await fetch(`${API_URL}/api/admin/audit-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed for audit logs')
          return
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setLogs(data.logs || [])
      setTotalPages(data.totalPages || 1)
      setTotalLogsCount(typeof data.total === 'number' ? data.total : (data.logs || []).length)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/audit-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed for audit stats')
          return
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch audit stats:', error)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setFilters({
      action: '',
      resourceType: '',
      severity: '',
      sortOrder: 'newest',
      performedBy: '',
      startDate: '',
      endDate: ''
    })
    setSearchInput('')
    setSearchTerm('')
    setPerformedByInput('')
    setCurrentPage(1)
  }

  const exportLogs = () => {
    const csvContent = [
      ['Date', 'Action', 'Resource', 'Description', 'User', 'Status', 'Severity'].join(','),
      ...displayedLogs.map(log => [
        new Date(log.createdAt).toLocaleString(),
        log.action,
        log.resourceName,
        `"${log.description}"`,
        log.performedBy.displayName || log.performedBy.username,
        log.status,
        log.severity
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle size={16} className="success" />
      case 'FAILED': return <XCircle size={16} className="failed" />
      case 'PARTIAL': return <AlertTriangle size={16} className="partial" />
      default: return <Clock size={16} />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '#dc2626'
      case 'HIGH': return '#ea580c'
      case 'MEDIUM': return '#d97706'
      default: return '#65a30d'
    }
  }

  const getSeverityDescription = (severity: string) => {
    switch (String(severity || '').toUpperCase()) {
      case 'CRITICAL': return 'Immediate action required'
      case 'HIGH': return 'High risk event'
      case 'MEDIUM': return 'Needs review'
      case 'LOW': return 'Informational'
      default: return 'Unclassified'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatIpForDisplay = (rawIp: string) => {
    const ip = String(rawIp || '').trim()
    if (!ip) return 'Unknown IP'
    if (ip === '::1' || ip === '127.0.0.1') return 'Localhost'
    if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '')
    return ip
  }

  const getUserDisplayForLog = (log: AuditLog) => {
    const isLoginEvent = String(log.action || '').toUpperCase() === 'LOGIN'
    if (isLoginEvent) {
      const deviceId = String(log.newValue?.deviceId || '').trim()
      const shortDeviceId = deviceId ? deviceId.slice(0, 8) : ''
      return {
        name: shortDeviceId
          ? `${formatIpForDisplay(log.ipAddress)} • ${shortDeviceId}`
          : formatIpForDisplay(log.ipAddress),
        role: shortDeviceId ? 'ip/device' : 'ip'
      }
    }
    return {
      name: log.performedBy?.displayName || log.performedBy?.username || 'System',
      role: log.performedByRole || 'system'
    }
  }

  const displayedLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return logs

    return logs.filter((log) => {
      const user = getUserDisplayForLog(log)
      return [
        log.action,
        log.resourceType,
        log.resourceName,
        log.resourceId,
        log.description,
        log.status,
        log.severity,
        log.ipAddress,
        user.name,
        user.role,
        log.performedBy?.displayName,
        log.performedBy?.username
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [logs, searchTerm])

  if (loading && currentPage === 1) return <div className="loading">Loading audit logs...</div>

  return (
    <div className="audit-logs-container">
      <div className="header">
        <div>
          <span className="audit-eyebrow">Security & Compliance</span>
          <h1>System Audit Logs</h1>
        </div>
      </div>

      {!loading && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Logs</h3>
            <p>{(stats?.totalLogs ?? totalLogsCount).toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>Last 30 Days</h3>
            <p>{(stats?.recentLogs ?? 0).toLocaleString()}</p>
          </div>
          <div className="stat-card critical">
            <h3>Critical</h3>
            <p>{(stats?.criticalLogs ?? 0).toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>New Accounts (Last 30 Days)</h3>
            <p>{stats?.newAccounts ?? 0}</p>
          </div>
        </div>
      )}

      <section className="filters-section" aria-label="Audit log filters">
        <div className="filters-toolbar">
          <label className="filter-control filter-search">
            <span>Search</span>
            <div className="filter-input-icon">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Action, resource, user, IP..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchTerm(searchInput.trim())
                    setCurrentPage(1)
                  }
                }}
                onBlur={() => {
                  if (searchInput.trim() !== searchTerm) {
                    setSearchTerm(searchInput.trim())
                    setCurrentPage(1)
                  }
                }}
              />
            </div>
          </label>

          <label className="filter-control">
            <span>Action</span>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="CREATE_ACCOUNT">Create Account</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="DELETE_ACCOUNT">Delete Account</option>
              <option value="UPDATE_PROFILE">Update Profile</option>
              <option value="DELETE_AVATAR">Delete Avatar</option>
              <option value="UPLOAD_AVATAR">Upload Avatar</option>
              <option value="UPDATE_PASSWORD">Update Password</option>
              <option value="RESET_PASSWORD">Reset Password</option>
            </select>
          </label>

          <label className="filter-control">
            <span>Resource</span>
            <select
              value={filters.resourceType}
              onChange={(e) => handleFilterChange('resourceType', e.target.value)}
            >
              <option value="">All Resources</option>
              <option value="USER">User</option>
              <option value="ANNOUNCEMENT">Announcement</option>
              <option value="DOCUMENT">Document</option>
              <option value="SYSTEM">System</option>
            </select>
          </label>

          <label className="filter-control filter-compact">
            <span>Severity</span>
            <select
              value={filters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
            >
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>

          <label className="filter-control filter-compact">
            <span>Sort</span>
            <select
              value={filters.sortOrder}
              onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>

          <label className="filter-control">
            <span>User</span>
            <input
              type="text"
              placeholder="Performed by"
              value={performedByInput}
              onChange={(e) => setPerformedByInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilterChange('performedBy', performedByInput.trim())
                }
              }}
              onBlur={() => {
                if (performedByInput.trim() !== filters.performedBy) {
                  handleFilterChange('performedBy', performedByInput.trim())
                }
              }}
            />
          </label>

          <div className="filter-date-range" aria-label="Date Range">
            <label className="filter-control filter-date">
              <span>From</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </label>
            <label className="filter-control filter-date">
              <span>To</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </label>
          </div>

          <div className="filter-actions">
            <button className="btn-clear" onClick={clearFilters} type="button">
              Clear Filters
            </button>
            <button className="btn-export" onClick={exportLogs} type="button">
              <Download size={16} /> Export
            </button>
          </div>
        </div>
      </section>

      <div className="logs-table">
        <div className="table-header">
          <div>Date/Time</div>
          <div>Action</div>
          <div>Resource</div>
          <div>Description</div>
          <div>User</div>
          <div>Status</div>
          <div>Severity</div>
        </div>

        {displayedLogs.map((log) => (
          <div key={log._id} className="table-row">
            <div className="date-cell">{formatDate(log.createdAt)}</div>
            <div className="action-cell">{log.action}</div>
            <div className="resource-cell">
              <span className="resource-type">{log.resourceType}</span>
              <span className="resource-name">{log.resourceName}</span>
            </div>
            <div className="description-cell" title={log.description}>
              {log.description}
            </div>
            <div className="user-cell">
              {getUserDisplayForLog(log).name}
              <span className="user-role">({getUserDisplayForLog(log).role})</span>
            </div>
            <div className="status-cell">
              {getStatusIcon(log.status)}
              <span>{log.status}</span>
            </div>
            <div className="severity-cell">
              <span 
                className="severity-badge" 
                style={{ backgroundColor: getSeverityColor(log.severity) }}
                title={getSeverityDescription(log.severity)}
              >
                {log.severity}
              </span>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            Next
          </button>
        </div>
      )}

      {displayedLogs.length === 0 && !loading && (
        <div className="no-results">
          <Search size={48} />
          <h3>No audit logs found</h3>
          <p>Try adjusting your filters or check back later for new activity.</p>
        </div>
      )}
    </div>
  )
}

export default AuditLogs
